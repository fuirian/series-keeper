"""얼굴 분석 백엔드: 검출기(얼굴 위치) + 임베더(얼굴 → 벡터) 조합.

| 이름        | 검출기                     | 임베더              | 기대하는 화풍          |
| ----------- | -------------------------- | ------------------- | ---------------------- |
| opencv      | YuNet                      | SFace (ArcFace 계열) | 실사                   |
| yunet-dino  | YuNet                      | DINOv2-small        | 3D·반실사              |
| anime-dino  | lbpcascade_animeface       | DINOv2-small        | 애니·만화체            |

SFace는 실사 얼굴로 학습한 '얼굴 인식' 모델이라 애니 캐릭터 구분에 약할 수 있다.
DINOv2는 얼굴 전용이 아닌 범용 시각 특징 모델(자기지도 학습)이라 그림체 캐릭터도 구분할 것으로 기대.
어느 쪽이 나은지는 `skpipe bench`로 같은 데이터에서 비교해 정한다.

임계값은 백엔드마다 유사도 분포가 달라서 따로 둔다. 아래 값은 임시이며 bench 결과로 바꾼다.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol

import cv2
import numpy as np

from .faces import DEFAULT_MODEL_DIR, Face, FaceAnalyzer, OpenCVFaceAnalyzer, ensure_models, l2_normalize
from .match import Thresholds

BBox = tuple[int, int, int, int]  # x, y, w, h


class Detector(Protocol):
    def detect(self, image: np.ndarray) -> list[tuple[BBox, float]]: ...


class Embedder(Protocol):
    def embed(self, image: np.ndarray, bbox: BBox) -> np.ndarray: ...


# ───────── 검출기 ─────────


class YuNetDetector:
    def __init__(self, model_dir: Path = DEFAULT_MODEL_DIR, det_threshold: float = 0.8):
        path = ensure_models(model_dir)["yunet"]
        self.detector = cv2.FaceDetectorYN.create(str(path), "", (320, 320), det_threshold, 0.3, 5000)

    def detect(self, image: np.ndarray) -> list[tuple[BBox, float]]:
        h, w = image.shape[:2]
        self.detector.setInputSize((w, h))
        _, dets = self.detector.detect(image)
        if dets is None:
            return []
        return [(tuple(int(round(v)) for v in d[:4]), float(d[-1])) for d in dets]  # type: ignore[misc]


class AnimeCascadeDetector:
    """lbpcascade_animeface. 애니체 정면·반측면 얼굴용 LBP 캐스케이드 (CPU에서 매우 빠름)."""

    def __init__(self, model_dir: Path = DEFAULT_MODEL_DIR, min_neighbors: int = 5):
        path = ensure_models(model_dir)["animeface"]
        self.cascade = cv2.CascadeClassifier(str(path))
        if self.cascade.empty():
            raise RuntimeError(f"애니 얼굴 검출기를 불러오지 못했습니다: {path}")
        self.min_neighbors = min_neighbors

    def detect(self, image: np.ndarray) -> list[tuple[BBox, float]]:
        gray = cv2.equalizeHist(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
        rects, _, weights = self.cascade.detectMultiScale3(
            gray, scaleFactor=1.1, minNeighbors=self.min_neighbors, minSize=(24, 24), outputRejectLevels=True
        )
        if len(rects) == 0:
            return []
        # 캐스케이드 점수는 0~1이 아니라 상대값이다
        return [(tuple(int(v) for v in r), float(wt)) for r, wt in zip(rects, np.ravel(weights))]  # type: ignore[misc]


# ───────── 임베더 ─────────


def crop_with_margin(image: np.ndarray, bbox: BBox, margin: float = 0.25) -> np.ndarray:
    """얼굴 박스를 정사각형으로 넓혀 자른다 (머리카락·윤곽까지 포함해야 캐릭터 구분이 잘 된다)."""
    x, y, w, h = bbox
    cx, cy = x + w / 2, y + h / 2
    side = max(w, h) * (1 + 2 * margin)
    x0, y0 = int(round(cx - side / 2)), int(round(cy - side / 2))
    x1, y1 = int(round(cx + side / 2)), int(round(cy + side / 2))
    H, W = image.shape[:2]
    pad = [max(0, -y0), max(0, y1 - H), max(0, -x0), max(0, x1 - W)]
    if any(pad):
        image = cv2.copyMakeBorder(image, *pad, cv2.BORDER_REPLICATE)
        x0, x1, y0, y1 = x0 + pad[2], x1 + pad[2], y0 + pad[0], y1 + pad[0]
    return image[y0:y1, x0:x1]


class DinoEmbedder:
    """DINOv2 (facebook/dinov2-small, Apache-2.0). CLS 토큰을 L2 정규화해 쓴다.

    torch·transformers가 필요하다: pip install -e ".[anime]"
    """

    MODEL_ID = "facebook/dinov2-small"

    def __init__(self, model_dir: Path = DEFAULT_MODEL_DIR, model_id: str = MODEL_ID):
        try:
            import torch
            from transformers import AutoImageProcessor, AutoModel
        except ImportError as e:  # pragma: no cover - 설치 안내
            raise RuntimeError('DINOv2에는 torch·transformers가 필요합니다: pip install -e ".[anime]"') from e

        cache = model_dir / "hf"
        self.torch = torch
        self.processor = AutoImageProcessor.from_pretrained(model_id, cache_dir=cache)
        self.model = AutoModel.from_pretrained(model_id, cache_dir=cache).eval()
        torch.set_num_threads(max(1, torch.get_num_threads()))

    def embed(self, image: np.ndarray, bbox: BBox) -> np.ndarray:
        crop = cv2.cvtColor(crop_with_margin(image, bbox), cv2.COLOR_BGR2RGB)
        inputs = self.processor(images=crop, return_tensors="pt")
        with self.torch.inference_mode():
            out = self.model(**inputs)
        return l2_normalize(out.pooler_output[0].cpu().numpy())


# ───────── 조합 ─────────


class ComposedAnalyzer:
    """검출기 + 임베더 → FaceAnalyzer."""

    def __init__(self, name: str, detector: Detector, embedder: Embedder, min_face_px: int = 32):
        self.name = name
        self.detector = detector
        self.embedder = embedder
        self.min_face_px = min_face_px

    def analyze(self, image: np.ndarray) -> list[Face]:
        faces = []
        for bbox, score in self.detector.detect(image):
            if min(bbox[2], bbox[3]) < self.min_face_px:
                continue
            faces.append(Face(bbox, score, self.embedder.embed(image, bbox)))
        return faces


@dataclass(frozen=True)
class Backend:
    name: str
    description: str
    thresholds: Thresholds  # 임시값. skpipe bench 결과로 조정
    factory: Callable[[Path], FaceAnalyzer]


def _dino_cached() -> Callable[[Path], DinoEmbedder]:
    """여러 백엔드가 DINOv2를 공유하도록 한 번만 불러온다."""
    cache: dict[Path, DinoEmbedder] = {}

    def get(model_dir: Path) -> DinoEmbedder:
        if model_dir not in cache:
            cache[model_dir] = DinoEmbedder(model_dir)
        return cache[model_dir]

    return get


_dino = _dino_cached()

BACKENDS: dict[str, Backend] = {
    "opencv": Backend(
        "opencv",
        "YuNet + SFace (실사 얼굴 인식)",
        Thresholds(unknown_below=0.25, issue_below=0.45, ambiguous_margin=0.05),
        lambda d: OpenCVFaceAnalyzer(d),
    ),
    "yunet-dino": Backend(
        "yunet-dino",
        "YuNet + DINOv2 (3D·반실사)",
        Thresholds(unknown_below=0.35, issue_below=0.60, ambiguous_margin=0.03),
        lambda d: ComposedAnalyzer("yunet-dino", YuNetDetector(d), _dino(d)),
    ),
    "anime-dino": Backend(
        "anime-dino",
        "애니 얼굴 캐스케이드 + DINOv2 (애니·만화체)",
        Thresholds(unknown_below=0.35, issue_below=0.60, ambiguous_margin=0.03),
        lambda d: ComposedAnalyzer("anime-dino", AnimeCascadeDetector(d), _dino(d)),
    ),
}

# 시리즈 화풍(web의 series.style) → 기본 백엔드
BACKEND_FOR_STYLE = {
    "live_action": "opencv",
    "anime": "anime-dino",
    "other": "yunet-dino",
}


def get_backend(name: str) -> Backend:
    try:
        return BACKENDS[name]
    except KeyError:
        raise ValueError(f"알 수 없는 백엔드: {name} (가능: {', '.join(BACKENDS)})") from None


def create_analyzer(name: str, model_dir: Path = DEFAULT_MODEL_DIR) -> FaceAnalyzer:
    return get_backend(name).factory(model_dir)


class AnalyzerPool:
    """백엔드를 필요할 때 한 번만 불러 재사용한다 (워커용)."""

    def __init__(self, model_dir: Path = DEFAULT_MODEL_DIR, override: str | None = None):
        self.model_dir = model_dir
        self.override = override  # 지정하면 화풍과 상관없이 이 백엔드
        self._cache: dict[str, FaceAnalyzer] = {}

    def for_style(self, style: str | None) -> tuple[FaceAnalyzer, Thresholds, str]:
        name = self.override or BACKEND_FOR_STYLE.get(style or "", "opencv")
        if name not in self._cache:
            self._cache[name] = create_analyzer(name, self.model_dir)
        return self._cache[name], get_backend(name).thresholds, name
