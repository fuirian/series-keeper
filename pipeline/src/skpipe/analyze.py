"""회차 한 편 분석: 컷 분할 → 대표 프레임 → 얼굴 → 바이블 매칭 → 이슈.

결과 JSON에는 판정만이 아니라 얼굴마다 *모든 캐릭터와의 유사도*를 남긴다.
그래야 임계값을 바꿔 가며 다시 평가할 때 영상을 재분석하지 않아도 된다.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict
from pathlib import Path

from .bible import Bible
from .faces import FaceAnalyzer
from .match import Thresholds, character_scores, judge
from .shots import detect_shots, extract_keyframes


def ms_to_tc(ms: int) -> str:
    s, ms = divmod(int(ms), 1000)
    m, s = divmod(s, 60)
    return f"{m:02d}:{s:02d}.{ms // 100}"


def analyze_episode(
    video_path: str | Path,
    bible: Bible,
    analyzer: FaceAnalyzer,
    thresholds: Thresholds = Thresholds(),
    shot_threshold: float = 27.0,
    frames_per_shot: int = 3,
    keyframe_dir: str | Path | None = None,
) -> dict:
    timings: dict[str, float] = {}

    t0 = time.perf_counter()
    shots = detect_shots(video_path, threshold=shot_threshold)
    timings["shot_detection_s"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    frames = extract_keyframes(video_path, shots, keyframe_dir, per_shot=frames_per_shot)
    timings["keyframes_s"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    shot_results, issues = [], []
    for shot in shots:
        faces_out = []
        for time_ms, image in frames.get(shot.index, []):
            for face in analyzer.analyze(image):
                scores = character_scores(face.embedding, bible)
                faces_out.append(
                    {
                        "time_ms": time_ms,
                        "bbox": list(face.bbox),
                        "det_score": round(face.det_score, 4),
                        "scores": {name: round(sim, 4) for name, sim in scores},
                        "match": asdict(judge(scores, thresholds)),
                    }
                )

        # 컷 단위로 캐릭터별 '가장 잘 나온 프레임' 유사도를 쓴다 (눈 감음·옆모습 프레임 하나로 오탐 나지 않게)
        best_per_char: dict[str, dict] = {}
        for f in faces_out:
            name = f["match"]["character"]
            if name is None:
                continue
            if name not in best_per_char or f["match"]["similarity"] > best_per_char[name]["match"]["similarity"]:
                best_per_char[name] = f
        for name, f in best_per_char.items():
            if f["match"]["issue"]:
                issues.append(
                    {
                        "shot": shot.index,
                        "start": ms_to_tc(shot.start_ms),
                        "end": ms_to_tc(shot.end_ms),
                        "character": name,
                        "type": f["match"]["issue"],
                        "similarity": f["match"]["similarity"],
                        "runner_up": f["match"]["runner_up"],
                        "runner_up_similarity": f["match"]["runner_up_similarity"],
                        "time_ms": f["time_ms"],
                        "bbox": f["bbox"],
                    }
                )

        shot_results.append({"index": shot.index, "start_ms": shot.start_ms, "end_ms": shot.end_ms, "faces": faces_out})
    timings["faces_s"] = time.perf_counter() - t0

    issues.sort(key=lambda i: i["similarity"])
    duration_ms = shots[-1].end_ms if shots else 0
    return {
        "video": str(video_path),
        "analyzer": analyzer.name,
        "thresholds": asdict(thresholds),
        "bible": {
            "characters": {c.name: c.sources for c in bible.characters},
            "skipped_refs": bible.skipped,
        },
        "summary": {
            "duration_s": round(duration_ms / 1000, 1),
            "shots": len(shots),
            "shots_with_faces": sum(1 for s in shot_results if s["faces"]),
            "faces": sum(len(s["faces"]) for s in shot_results),
            "issues": len(issues),
        },
        "timings": {k: round(v, 2) for k, v in timings.items()},
        "issues": issues,
        "shots": shot_results,
    }


def save_result(result: dict, path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
