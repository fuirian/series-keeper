"""분석 워커 흐름 테스트. 실제 Supabase 대신 메모리 안의 가짜 저장소를 쓴다.

가짜 분석기(ColorAnalyzer)는 이미지 색을 얼굴 임베딩으로 취급한다:
  빨강 = 하린 / 초록 = 도윤 / 파랑 = 하린과 애매하게 닮음(이슈가 돼야 함)
합성 영상은 빨강 → 파랑 → 초록 컷 3개.
"""

import cv2
import numpy as np
import pytest
from test_analyze import ColorAnalyzer

from skpipe.match import Thresholds
from skpipe.worker import (
    AnalysisError,
    build_issue_rows,
    frame_path,
    load_env_file,
    process_episode,
    run_one,
)

HARIN = "11111111-1111-1111-1111-111111111111"
DOYUN = "22222222-2222-2222-2222-222222222222"
TH = Thresholds(0.25, 0.45, 0.05)


def solid_png(bgr) -> bytes:
    ok, buf = cv2.imencode(".png", np.full((120, 160, 3), bgr, dtype=np.uint8))
    assert ok
    return buf.tobytes()


class FakeStore:
    def __init__(self, video_bytes: bytes, characters: list[dict], files: dict[str, bytes]):
        self.episodes = [
            {
                "id": "ep-1",
                "number": 1,
                "owner_id": "user-1",
                "series_id": "series-1",
                "video_path": "user-1/series-1/video.mp4",
            }
        ]
        self.files = {"episodes/user-1/series-1/video.mp4": video_bytes, **files}
        self._characters = characters
        self.uploaded: dict[str, bytes] = {}
        self.shots: list[dict] = []
        self.issues: list[dict] = []
        self.cleared: list[str] = []
        self.finished: dict | None = None
        self.failed: str | None = None

    def claim(self):
        return self.episodes.pop(0) if self.episodes else None

    def characters(self, series_id):
        return self._characters

    def download(self, bucket, path):
        return self.files[f"{bucket}/{path}"]

    def upload_image(self, path, data):
        self.uploaded[path] = data

    def clear_results(self, episode_id):
        self.cleared.append(episode_id)

    def insert_shots(self, rows):
        self.shots = rows
        return {r["index"]: f"shot-{r['index']}" for r in rows}

    def insert_issues(self, rows):
        self.issues = rows

    def finish(self, episode_id, summary):
        self.finished = summary

    def fail(self, episode_id, message):
        self.failed = message


@pytest.fixture
def store(synthetic_video):
    characters = [
        {"id": HARIN, "name": "하린", "reference_image": [{"angle": "front", "storage_path": "u/s/h/front-a.png"}]},
        {"id": DOYUN, "name": "도윤", "reference_image": [{"angle": "front", "storage_path": "u/s/d/front-b.png"}]},
        {"id": "33333333-3333-3333-3333-333333333333", "name": "사진 없음", "reference_image": []},
    ]
    files = {
        "references/u/s/h/front-a.png": solid_png((40, 40, 200)),  # 빨강
        "references/u/s/d/front-b.png": solid_png((60, 200, 60)),  # 초록
    }
    return FakeStore(synthetic_video.read_bytes(), characters, files)


def test_process_episode_saves_shots_issues_and_summary(store, tmp_path):
    summary = process_episode(store, ColorAnalyzer(), store.episodes[0], tmp_path, TH)

    assert summary["shots"] == 3
    assert summary["issues"] == 1
    assert summary["characters"] == 2  # 사진 없는 캐릭터는 제외

    assert store.cleared == ["ep-1"]  # 다시 분석 대비 이전 결과 정리
    assert [s["index"] for s in store.shots] == [0, 1, 2]
    assert all(s["owner_id"] == "user-1" for s in store.shots)

    (issue,) = store.issues
    assert issue["shot_id"] == "shot-1"  # 파랑 컷
    assert issue["character_id"] == HARIN  # 폴더 이름 = 캐릭터 id
    assert issue["type"] == "low_similarity"
    assert issue["owner_id"] == "user-1"
    assert issue["frame_path"].startswith("user-1/series-1/ep-1/issue-0001-")
    assert issue["frame_path"] in store.uploaded  # 프레임 이미지도 올라감
    assert store.finished == summary


def test_run_one_marks_failed_without_references(synthetic_video):
    store = FakeStore(synthetic_video.read_bytes(), [{"id": HARIN, "name": "하린", "reference_image": []}], {})
    assert run_one(store, ColorAnalyzer(), TH) is True
    assert store.failed is not None and "레퍼런스 사진이 없습니다" in store.failed
    assert store.finished is None
    assert run_one(store, ColorAnalyzer(), TH) is False  # 더 처리할 회차 없음


def test_run_one_hides_unexpected_errors(store):
    def boom(*_):
        raise RuntimeError("db exploded: secret details")

    store.insert_shots = boom
    run_one(store, ColorAnalyzer(), TH)
    assert store.failed == "분석 중 오류가 발생했습니다. 잠시 후 다시 분석해 주세요."  # 내부 오류 내용은 노출하지 않음


def test_unreadable_video_is_user_error(store, tmp_path):
    store.files["episodes/user-1/series-1/video.mp4"] = b"not a video"
    with pytest.raises(AnalysisError, match="영상을 열 수 없습니다"):
        process_episode(store, ColorAnalyzer(), store.episodes[0], tmp_path, TH)


def test_build_issue_rows_keeps_runner_up_only_for_ambiguous():
    episode = {"id": "ep", "owner_id": "u", "series_id": "s"}
    result = {
        "issues": [
            {"shot": 0, "character": HARIN, "type": "ambiguous", "similarity": 0.6, "runner_up": DOYUN,
             "runner_up_similarity": 0.58, "time_ms": 500, "bbox": [1, 2, 3, 4]},
            {"shot": 1, "character": HARIN, "type": "low_similarity", "similarity": 0.3, "runner_up": DOYUN,
             "runner_up_similarity": 0.1, "time_ms": 1500, "bbox": [1, 2, 3, 4]},
            {"shot": 9, "character": HARIN, "type": "low_similarity", "similarity": 0.3, "runner_up": None,
             "runner_up_similarity": 0.0, "time_ms": 9000, "bbox": [1, 2, 3, 4]},  # 없는 컷 → 건너뜀
        ]
    }
    rows = build_issue_rows(result, episode, {0: "s0", 1: "s1"}, {0: "f0.jpg"})
    assert len(rows) == 2
    assert rows[0]["runner_up_id"] == DOYUN and rows[0]["frame_path"] == "f0.jpg"
    assert rows[1]["runner_up_id"] is None and rows[1]["frame_path"] is None


def test_frame_path_starts_with_owner():
    path = frame_path({"id": "e", "owner_id": "u", "series_id": "s"}, {"shot": 7, "time_ms": 1234})
    assert path == "u/s/e/issue-0007-1234.jpg"


def test_load_env_file_does_not_override(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("# 주석\nSK_TEST_A=from-file\nSK_TEST_B='quoted'\n", encoding="utf-8")
    monkeypatch.setenv("SK_TEST_A", "already-set")
    monkeypatch.delenv("SK_TEST_B", raising=False)
    load_env_file(env)
    import os

    assert os.environ["SK_TEST_A"] == "already-set"
    assert os.environ["SK_TEST_B"] == "quoted"
