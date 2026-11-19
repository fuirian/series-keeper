from pathlib import Path

import cv2
import numpy as np
import pytest

# (BGR 색, 초) — 색이 바뀌는 지점이 컷 경계
SEGMENTS = [((40, 40, 200), 1.0), ((200, 60, 40), 1.5), ((60, 200, 60), 1.0)]
FPS = 24


@pytest.fixture(scope="session")
def synthetic_video(tmp_path_factory) -> Path:
    """색이 다른 단색 구간 3개로 된 테스트 영상 (컷 3개)."""
    path = tmp_path_factory.mktemp("video") / "three_shots.mp4"
    w, h = 160, 120
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (w, h))
    assert writer.isOpened()
    for color, seconds in SEGMENTS:
        frame = np.full((h, w, 3), color, dtype=np.uint8)
        for _ in range(int(seconds * FPS)):
            writer.write(frame)
    writer.release()
    return path
