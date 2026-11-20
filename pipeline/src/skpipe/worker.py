"""분석 워커: Supabase에서 '분석 대기' 회차를 가져와 분석하고 결과를 저장한다.

흐름 (회차 하나):
  1. claim_next_episode()로 회차 하나를 '분석 중'으로 바꾸며 가져온다 (여러 워커가 겹치지 않음)
  2. 영상과 그 시리즈의 캐릭터 레퍼런스 사진을 임시 폴더에 내려받는다
  3. analyze_episode()로 컷 분할 → 얼굴 비교
  4. 컷·이슈를 DB에 저장하고, 이슈 프레임 이미지를 저장소에 올린다
  5. 회차 상태를 '완료'(또는 '실패' + 이유)로 바꾼다

Secret key(service_role)로 접속하므로 RLS를 거치지 않는다. 그래서 owner_id 등을 직접 채운다.
이 키는 절대 웹(브라우저)에 넣지 않는다.
"""

from __future__ import annotations

import logging
import os
import signal
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

import cv2

from .analyze import analyze_episode
from .bible import load_bible
from .faces import FaceAnalyzer
from .match import Thresholds
from .shots import read_frame_at

log = logging.getLogger("skpipe.worker")

EPISODE_BUCKET = "episodes"
REFERENCE_BUCKET = "references"
MAX_FRAME_WIDTH = 960


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AnalysisError(Exception):
    """사용자에게 그대로 보여 줄 실패 이유."""


# ───────── 저장소 인터페이스 (테스트에서는 가짜로 바꿔 끼운다) ─────────


class Store(Protocol):
    def claim(self) -> dict | None: ...
    def series_style(self, series_id: str) -> str | None: ...
    def characters(self, series_id: str) -> list[dict]: ...
    def download(self, bucket: str, path: str) -> bytes: ...
    def upload_image(self, path: str, data: bytes) -> None: ...
    def clear_results(self, episode_id: str) -> None: ...
    def insert_shots(self, rows: list[dict]) -> dict[int, str]: ...
    def insert_issues(self, rows: list[dict]) -> None: ...
    def finish(self, episode_id: str, summary: dict) -> None: ...
    def fail(self, episode_id: str, message: str) -> None: ...


class SupabaseStore:
    def __init__(self, url: str, secret_key: str):
        from supabase import create_client  # 워커 의존성이 없을 때도 skpipe 나머지는 쓸 수 있게

        self.client = create_client(url, secret_key)

    def claim(self) -> dict | None:
        rows = self.client.rpc("claim_next_episode").execute().data or []
        return rows[0] if rows else None

    def series_style(self, series_id: str) -> str | None:
        rows = self.client.table("series").select("style").eq("id", series_id).limit(1).execute().data or []
        return rows[0]["style"] if rows else None

    def characters(self, series_id: str) -> list[dict]:
        res = (
            self.client.table("character")
            .select("id, name, reference_image(angle, storage_path)")
            .eq("series_id", series_id)
            .execute()
        )
        return res.data or []

    def download(self, bucket: str, path: str) -> bytes:
        return self.client.storage.from_(bucket).download(path)

    def upload_image(self, path: str, data: bytes) -> None:
        self.client.storage.from_(REFERENCE_BUCKET).upload(
            path, data, {"content-type": "image/jpeg", "upsert": "true"}
        )

    def clear_results(self, episode_id: str) -> None:
        # 다시 분석하는 경우: 이전 이슈 프레임 파일과 컷·이슈 행을 지운다 (이슈는 컷 cascade)
        old = self.client.table("issue").select("frame_path").eq("episode_id", episode_id).execute().data or []
        paths = [r["frame_path"] for r in old if r.get("frame_path")]
        if paths:
            self.client.storage.from_(REFERENCE_BUCKET).remove(paths)
        self.client.table("shot").delete().eq("episode_id", episode_id).execute()

    def insert_shots(self, rows: list[dict]) -> dict[int, str]:
        if not rows:
            return {}
        data = self.client.table("shot").insert(rows).execute().data or []
        return {r["index"]: r["id"] for r in data}

    def insert_issues(self, rows: list[dict]) -> None:
        if rows:
            self.client.table("issue").insert(rows).execute()

    def finish(self, episode_id: str, summary: dict) -> None:
        self.client.table("episode").update(
            {
                "status": "done",
                "analysis_finished_at": _now(),
                "analysis_error": None,
                "analysis_summary": summary,
            }
        ).eq("id", episode_id).execute()

    def fail(self, episode_id: str, message: str) -> None:
        self.client.table("episode").update(
            {"status": "failed", "analysis_finished_at": _now(), "analysis_error": message[:500]}
        ).eq("id", episode_id).execute()


class Pool(Protocol):
    """화풍 → (분석기, 기준값, 백엔드 이름). 실제 구현은 backends.AnalyzerPool."""

    def for_style(self, style: str | None) -> tuple[FaceAnalyzer, Thresholds, str]: ...


# ───────── 순수 변환 함수 (DB 행 만들기) ─────────


def build_shot_rows(result: dict, episode: dict) -> list[dict]:
    return [
        {
            "episode_id": episode["id"],
            "owner_id": episode["owner_id"],
            "index": s["index"],
            "start_ms": s["start_ms"],
            "end_ms": s["end_ms"],
            "face_count": len(s["faces"]),
        }
        for s in result["shots"]
    ]


def frame_path(episode: dict, issue: dict) -> str:
    """이슈 프레임 저장 경로. 첫 폴더가 사용자 id여야 사용자가 서명 URL로 볼 수 있다."""
    return f"{episode['owner_id']}/{episode['series_id']}/{episode['id']}/issue-{issue['shot']:04d}-{issue['time_ms']}.jpg"


def build_issue_rows(result: dict, episode: dict, shot_ids: dict[int, str], frame_paths: dict[int, str]) -> list[dict]:
    """bible의 캐릭터 이름 = 캐릭터 id 폴더 이름이므로, 이슈의 character가 곧 character_id."""
    rows = []
    for i, issue in enumerate(result["issues"]):
        shot_id = shot_ids.get(issue["shot"])
        if shot_id is None:
            continue
        rows.append(
            {
                "episode_id": episode["id"],
                "shot_id": shot_id,
                "owner_id": episode["owner_id"],
                "character_id": issue["character"],
                "runner_up_id": issue.get("runner_up") if issue["type"] == "ambiguous" else None,
                "type": issue["type"],
                "similarity": issue["similarity"],
                "runner_up_similarity": issue.get("runner_up_similarity"),
                "time_ms": issue["time_ms"],
                "bbox": issue["bbox"],
                "frame_path": frame_paths.get(i),
            }
        )
    return rows


def build_summary(result: dict, character_count: int, elapsed_s: float, backend: str | None = None) -> dict:
    return {
        **result["summary"],
        "backend": backend,
        "characters": character_count,
        "skipped_refs": len(result["bible"]["skipped_refs"]),
        "timings": result["timings"],
        "elapsed_s": round(elapsed_s, 1),
        "analyzer": result["analyzer"],
        "thresholds": result["thresholds"],
    }


def render_issue_frame(video_path: Path, time_ms: int, bbox: list[int]) -> bytes | None:
    """문제 프레임에 얼굴 박스를 그려 JPEG로. 너무 크면 줄인다."""
    cap = cv2.VideoCapture(str(video_path))
    try:
        frame = read_frame_at(cap, time_ms)
    finally:
        cap.release()
    if frame is None:
        return None
    x, y, w, h = bbox
    thickness = max(2, frame.shape[1] // 300)
    cv2.rectangle(frame, (x, y), (x + w, y + h), (40, 40, 230), thickness)
    if frame.shape[1] > MAX_FRAME_WIDTH:
        scale = MAX_FRAME_WIDTH / frame.shape[1]
        frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return buf.tobytes() if ok else None


# ───────── 회차 하나 처리 ─────────


def prepare_refs(store: Store, series_id: str, refs_dir: Path) -> int:
    """캐릭터 레퍼런스를 refs_dir/<character_id>/<angle>.<ext>로 내려받는다. 사진이 있는 캐릭터 수를 돌려준다."""
    count = 0
    for char in store.characters(series_id):
        images = char.get("reference_image") or []
        if not images:
            continue
        char_dir = refs_dir / char["id"]
        char_dir.mkdir(parents=True, exist_ok=True)
        for img in images:
            ext = Path(img["storage_path"]).suffix or ".jpg"
            (char_dir / f"{img['angle']}{ext}").write_bytes(store.download(REFERENCE_BUCKET, img["storage_path"]))
        count += 1
    return count


def process_episode(
    store: Store,
    analyzer: FaceAnalyzer,
    episode: dict,
    workdir: Path,
    thresholds: Thresholds = Thresholds(),
    backend: str | None = None,
) -> dict:
    """회차 하나를 분석하고 결과를 저장한다. 실패하면 AnalysisError (사용자에게 보여 줄 문장)."""
    started = time.perf_counter()

    refs_dir = workdir / "refs"
    if prepare_refs(store, episode["series_id"], refs_dir) == 0:
        raise AnalysisError("캐릭터 레퍼런스 사진이 없습니다. 캐릭터 탭에서 정면 사진을 올린 뒤 다시 분석해 주세요.")

    bible = load_bible(refs_dir, analyzer)
    if not bible.characters:
        raise AnalysisError("레퍼런스 사진에서 얼굴을 찾지 못했습니다. 얼굴이 잘 보이는 정면 사진으로 바꿔 주세요.")

    ext = Path(episode["video_path"]).suffix or ".mp4"
    video_path = workdir / f"video{ext}"
    video_path.write_bytes(store.download(EPISODE_BUCKET, episode["video_path"]))
    cap = cv2.VideoCapture(str(video_path))
    readable = cap.isOpened()
    cap.release()
    if not readable:
        raise AnalysisError("영상을 열 수 없습니다. MP4(H.264)로 다시 내보내 올려 주세요.")

    result = analyze_episode(video_path, bible, analyzer, thresholds)

    # 다시 분석하는 경우 이전 결과를 지우고 새로 저장
    store.clear_results(episode["id"])
    shot_ids = store.insert_shots(build_shot_rows(result, episode))

    frame_paths: dict[int, str] = {}
    for i, issue in enumerate(result["issues"]):
        image = render_issue_frame(video_path, issue["time_ms"], issue["bbox"])
        if image is None:
            continue
        path = frame_path(episode, issue)
        try:
            store.upload_image(path, image)
            frame_paths[i] = path
        except Exception:  # 프레임 이미지는 없어도 리포트는 볼 수 있다
            log.exception("이슈 프레임 업로드 실패: %s", path)

    store.insert_issues(build_issue_rows(result, episode, shot_ids, frame_paths))

    summary = build_summary(result, len(bible.characters), time.perf_counter() - started, backend)
    store.finish(episode["id"], summary)
    return summary


# ───────── 실행 루프 ─────────


@dataclass
class WorkerConfig:
    url: str
    secret_key: str
    poll_seconds: float = 5.0


def load_env_file(path: Path) -> None:
    """KEY=VALUE 형식의 .env를 읽어 환경 변수에 넣는다 (이미 있는 값은 덮어쓰지 않음)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def config_from_env() -> WorkerConfig:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not url or not key:
        raise SystemExit(
            "SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다. pipeline/.env.example을 pipeline/.env로 복사해 채워 주세요."
        )
    return WorkerConfig(url, key, float(os.environ.get("WORKER_POLL_SECONDS", "5")))


def run_one(store: Store, pool: Pool) -> bool:
    """회차 하나를 처리한다. 처리할 회차가 없으면 False."""
    episode = store.claim()
    if episode is None:
        return False

    label = f"{episode['number']}화 ({episode['id']})"
    with tempfile.TemporaryDirectory(prefix="skworker-") as tmp:
        try:
            # 시리즈 화풍에 맞는 백엔드 (애니체 → 애니 얼굴 검출 + DINOv2)
            analyzer, thresholds, backend = pool.for_style(store.series_style(episode["series_id"]))
            log.info("분석 시작: %s · 백엔드 %s", label, backend)
            summary = process_episode(store, analyzer, episode, Path(tmp), thresholds, backend)
            log.info("분석 완료: %s · 컷 %s · 이슈 %s · %ss", label, summary["shots"], summary["issues"], summary["elapsed_s"])
        except AnalysisError as e:
            log.warning("분석 실패: %s · %s", label, e)
            store.fail(episode["id"], str(e))
        except Exception:
            log.exception("분석 중 오류: %s", label)
            store.fail(episode["id"], "분석 중 오류가 발생했습니다. 잠시 후 다시 분석해 주세요.")
    return True


def run_forever(store: Store, pool: Pool, poll_seconds: float, once: bool = False) -> None:
    stop = False

    def _stop(*_: Any) -> None:
        nonlocal stop
        stop = True
        log.info("종료 신호를 받았습니다. 지금 회차를 끝내고 멈춥니다.")

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    log.info("분석 워커 시작 (대기 회차 확인 간격 %ss)", poll_seconds)
    while not stop:
        try:
            worked = run_one(store, pool)
        except Exception:
            # DB 연결 끊김 등. 잠시 쉬었다가 다시 시도
            log.exception("작업을 가져오지 못했습니다")
            worked = False
        if once and not worked:
            break
        if not worked:
            # 짧게 나눠 자서 Ctrl+C에 빨리 반응한다
            for _ in range(int(poll_seconds * 10)):
                if stop:
                    break
                time.sleep(0.1)
    log.info("분석 워커 종료")
