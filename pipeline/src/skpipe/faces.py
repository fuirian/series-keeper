"""얼굴 검출 + 임베딩.

기본 백엔드는 OpenCV 내장 모델(opencv_zoo, Apache-2.0):
  - YuNet: 얼굴 검출
  - SFace: ArcFace 계열 얼굴 인식 임베딩 (128차원)
별도 빌드 없이 CPU에서 돌아가서 PoC용으로 고름. InsightFace 등 다른 백엔드는
FaceAnalyzer 프로토콜만 맞추면 갈아 끼울 수 있다.
"""

from __future__ import annotations

import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import cv2
import numpy as np

DEFAULT_MODEL_DIR = Path(__file__).resolve().parents[2] / "models"

_ZOO = "https://github.com/opencv/opencv_zoo/raw/main/models"
MODELS = {
    "yunet": ("face_detection_yunet_2023mar.onnx", f"{_ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx"),
    "sface": ("face_recognition_sface_2021dec.onnx", f"{_ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx"),
    # 애니 얼굴 검출 (nagadomi/lbpcascade_animeface, MIT)
    "animeface": (
        "lbpcascade_animeface.xml",
        "https://raw.githubusercontent.com/nagadomi/lbpcascade_animeface/master/lbpcascade_animeface.xml",
    ),
}


@dataclass
class Face:
    bbox: tuple[int, int, int, int]  # x, y, w, h
    det_score: float
    embedding: np.ndarray  # L2 정규화된 벡터


class FaceAnalyzer(Protocol):
    name: str

    def analyze(self, image: np.ndarray) -> list[Face]: ...


def ensure_models(model_dir: Path = DEFAULT_MODEL_DIR) -> dict[str, Path]:
    """모델 파일이 없으면 opencv_zoo에서 내려받는다."""
    model_dir.mkdir(parents=True, exist_ok=True)
    paths = {}
    for key, (filename, url) in MODELS.items():
        path = model_dir / filename
        if not path.exists() or path.stat().st_size < 10_000:
            print(f"모델 다운로드: {filename}")
            tmp = path.with_suffix(".part")
            urllib.request.urlretrieve(url, tmp)
            if tmp.stat().st_size < 10_000:  # LFS 포인터 파일 등 잘못된 응답
                tmp.unlink()
                raise RuntimeError(f"모델 다운로드 실패 (파일이 너무 작음): {url}")
            tmp.replace(path)
        paths[key] = path
    return paths


def l2_normalize(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v, dtype=np.float32).reshape(-1)
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


class OpenCVFaceAnalyzer:
    name = "opencv-yunet-sface"

    def __init__(self, model_dir: Path = DEFAULT_MODEL_DIR, det_threshold: float = 0.8, min_face_px: int = 40):
        paths = ensure_models(model_dir)
        self.detector = cv2.FaceDetectorYN.create(str(paths["yunet"]), "", (320, 320), det_threshold, 0.3, 5000)
        self.recognizer = cv2.FaceRecognizerSF.create(str(paths["sface"]), "")
        self.min_face_px = min_face_px

    def analyze(self, image: np.ndarray) -> list[Face]:
        h, w = image.shape[:2]
        self.detector.setInputSize((w, h))
        _, dets = self.detector.detect(image)
        if dets is None:
            return []
        faces = []
        for det in dets:
            x, y, fw, fh = (int(round(v)) for v in det[:4])
            if min(fw, fh) < self.min_face_px:
                continue  # 너무 작은 얼굴은 임베딩이 불안정
            aligned = self.recognizer.alignCrop(image, det)
            emb = l2_normalize(self.recognizer.feature(aligned))
            faces.append(Face((x, y, fw, fh), float(det[-1]), emb))
        return faces
