"""시리즈 바이블(캐릭터 레퍼런스) 불러오기.

폴더 구조:
    refs/
      하린/
        front.png
        side.jpg
      도윤/
        front.png
폴더 이름이 캐릭터 이름. 레퍼런스 이미지마다 가장 큰 얼굴 하나를 임베딩한다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .faces import FaceAnalyzer

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


@dataclass
class Character:
    name: str
    embeddings: list[np.ndarray] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)


@dataclass
class Bible:
    characters: list[Character]
    skipped: list[str] = field(default_factory=list)  # 얼굴을 못 찾은 레퍼런스

    def names(self) -> list[str]:
        return [c.name for c in self.characters]


def imread_unicode(path: Path) -> np.ndarray | None:
    """한글 경로도 읽히도록 (cv2.imread는 Windows 비ASCII 경로를 못 읽음)."""
    data = np.fromfile(str(path), dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR) if data.size else None


def load_bible(refs_dir: str | Path, analyzer: FaceAnalyzer) -> Bible:
    refs_dir = Path(refs_dir)
    if not refs_dir.is_dir():
        raise FileNotFoundError(f"레퍼런스 폴더가 없음: {refs_dir}")

    characters, skipped = [], []
    for char_dir in sorted(p for p in refs_dir.iterdir() if p.is_dir()):
        char = Character(char_dir.name)
        for img_path in sorted(char_dir.iterdir()):
            if img_path.suffix.lower() not in IMAGE_EXTS:
                continue
            img = imread_unicode(img_path)
            faces = analyzer.analyze(img) if img is not None else []
            if not faces:
                skipped.append(str(img_path))
                continue
            largest = max(faces, key=lambda f: f.bbox[2] * f.bbox[3])
            char.embeddings.append(largest.embedding)
            char.sources.append(img_path.name)
        if char.embeddings:
            characters.append(char)
    return Bible(characters, skipped)
