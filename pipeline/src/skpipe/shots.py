"""컷 분할과 대표 프레임 추출."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from scenedetect import ContentDetector, detect


@dataclass(frozen=True)
class Shot:
    index: int
    start_ms: int
    end_ms: int

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms

    def sample_times_ms(self, count: int) -> list[int]:
        """컷 안에서 고르게 퍼진 샘플 시점. 경계(전환 효과)는 피한다."""
        if count <= 1:
            return [self.start_ms + self.duration_ms // 2]
        step = self.duration_ms / (count + 1)
        return [int(self.start_ms + step * (i + 1)) for i in range(count)]


def _seconds(tc) -> float:
    return float(tc.seconds if hasattr(tc, "seconds") else tc.get_seconds())


def detect_shots(video_path: str | Path, threshold: float = 27.0, min_shot_ms: int = 300) -> list[Shot]:
    """장면 전환을 감지해 컷 목록을 돌려준다.

    threshold: ContentDetector 민감도 (낮을수록 컷이 많이 잘림). 기본 27은 PySceneDetect 기본값.
    min_shot_ms: 이보다 짧은 컷은 앞 컷에 합친다 (플래시·깜빡임 오검출 방지).
    """
    scenes = detect(str(video_path), ContentDetector(threshold=threshold), start_in_scene=True)
    raw = [(int(_seconds(s) * 1000), int(_seconds(e) * 1000)) for s, e in scenes]

    merged: list[list[int]] = []
    for start, end in raw:
        if merged and end - start < min_shot_ms:
            merged[-1][1] = end
        else:
            merged.append([start, end])
    return [Shot(i, s, e) for i, (s, e) in enumerate(merged)]


def read_frame_at(cap: cv2.VideoCapture, time_ms: int) -> np.ndarray | None:
    cap.set(cv2.CAP_PROP_POS_MSEC, time_ms)
    ok, frame = cap.read()
    return frame if ok else None


def extract_keyframes(
    video_path: str | Path,
    shots: list[Shot],
    out_dir: str | Path | None = None,
    per_shot: int = 3,
) -> dict[int, list[tuple[int, np.ndarray]]]:
    """컷마다 per_shot장의 프레임을 뽑는다. out_dir가 있으면 jpg로도 저장.

    반환: {shot.index: [(time_ms, BGR 이미지), ...]}
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise FileNotFoundError(f"영상을 열 수 없음: {video_path}")
    if out_dir is not None:
        Path(out_dir).mkdir(parents=True, exist_ok=True)

    frames: dict[int, list[tuple[int, np.ndarray]]] = {}
    try:
        for shot in shots:
            frames[shot.index] = []
            for t in shot.sample_times_ms(per_shot):
                frame = read_frame_at(cap, t)
                if frame is None:
                    continue
                frames[shot.index].append((t, frame))
                if out_dir is not None:
                    cv2.imwrite(str(Path(out_dir) / f"shot{shot.index:04d}_{t:08d}.jpg"), frame)
    finally:
        cap.release()
    return frames
