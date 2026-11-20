"""백엔드 조합·비교 실험 계산 테스트 (실제 모델 없이)."""

import math

import cv2
import numpy as np
import pytest

from skpipe import backends
from skpipe.backends import BACKEND_FOR_STYLE, BACKENDS, AnalyzerPool, ComposedAnalyzer, crop_with_margin
from skpipe.bench import Sample, best_threshold, evaluate_samples, identification_accuracy, load_samples, roc_auc
from skpipe.faces import l2_normalize


# ───────── 조합 ─────────


class FixedDetector:
    def __init__(self, boxes):
        self.boxes = boxes

    def detect(self, image):
        return self.boxes


class MeanColorEmbedder:
    """잘라낸 영역의 평균 색을 벡터로."""

    def embed(self, image, bbox):
        x, y, w, h = bbox
        return l2_normalize(image[y : y + h, x : x + w].reshape(-1, 3).mean(axis=0) + 1e-3)


def test_composed_analyzer_skips_small_faces():
    img = np.full((100, 100, 3), (10, 20, 200), np.uint8)
    analyzer = ComposedAnalyzer("t", FixedDetector([((10, 10, 40, 40), 0.9), ((60, 60, 10, 10), 0.9)]), MeanColorEmbedder(), min_face_px=32)
    faces = analyzer.analyze(img)
    assert len(faces) == 1
    assert faces[0].bbox == (10, 10, 40, 40)
    assert math.isclose(float(np.linalg.norm(faces[0].embedding)), 1.0, rel_tol=1e-5)


def test_crop_with_margin_is_square_and_pads_at_edges():
    img = np.zeros((100, 200, 3), np.uint8)
    crop = crop_with_margin(img, (0, 0, 40, 20), margin=0.25)  # 왼쪽 위 모서리
    assert crop.shape[0] == crop.shape[1] == 60  # max(40,20) * 1.5


def test_style_mapping_and_thresholds():
    assert BACKEND_FOR_STYLE["anime"] == "anime-dino"
    assert BACKEND_FOR_STYLE["live_action"] == "opencv"
    assert set(BACKEND_FOR_STYLE.values()) <= set(BACKENDS)
    for b in BACKENDS.values():
        t = b.thresholds
        assert 0 < t.unknown_below < t.issue_below < 1


def test_pool_loads_each_backend_once(monkeypatch):
    calls = []

    def fake_create(name, model_dir):
        calls.append(name)
        return f"analyzer:{name}"

    monkeypatch.setattr(backends, "create_analyzer", fake_create)
    pool = AnalyzerPool()
    a1, th1, n1 = pool.for_style("anime")
    a2, _, _ = pool.for_style("anime")
    a3, _, n3 = pool.for_style(None)  # 화풍 모름 → opencv
    assert (n1, n3) == ("anime-dino", "opencv")
    assert a1 is a2 and calls == ["anime-dino", "opencv"]
    assert th1 == BACKENDS["anime-dino"].thresholds

    forced = AnalyzerPool(override="opencv")
    monkeypatch.setattr(backends, "create_analyzer", fake_create)
    assert forced.for_style("anime")[2] == "opencv"


# ───────── 비교 실험 계산 ─────────


def test_roc_auc_perfect_random_and_ties():
    assert roc_auc([0.9, 0.8], [0.1, 0.2]) == 1.0
    assert roc_auc([0.1, 0.2], [0.9, 0.8]) == 0.0
    assert roc_auc([0.5, 0.5], [0.5, 0.5]) == 0.5
    assert math.isnan(roc_auc([], [0.1]))


def test_best_threshold_separates():
    t, acc = best_threshold([0.8, 0.9, 0.7], [0.1, 0.3, 0.2])
    assert 0.3 < t <= 0.7 and acc == 1.0


def vec(*xs):
    return l2_normalize(np.array(xs, dtype=np.float32))


def test_identification_and_evaluate_samples():
    samples = [
        Sample("A", "a1", vec(1, 0.1, 0)),
        Sample("A", "a2", vec(1, 0, 0.1)),
        Sample("B", "b1", vec(0, 1, 0.1)),
        Sample("B", "b2", vec(0.1, 1, 0)),
        Sample("B", "b3", None),  # 얼굴 못 찾음
        Sample("_other", "x", vec(0, 0, 1)),  # 엑스트라: 다른 인물 쌍에만 들어감
    ]
    assert identification_accuracy(samples) == 1.0
    r = evaluate_samples("t", samples, elapsed_s=0.6)
    assert r.images == 6 and r.detected == 5
    assert r.pos_pairs == 2  # A-A, B-B
    assert r.neg_pairs == 8  # 5C2=10 중 같은 인물 2쌍 제외
    assert r.auc == 1.0 and r.balanced_acc == 1.0
    assert math.isclose(r.ms_per_image, 100.0)


def test_load_samples_reads_folders(tmp_path):
    for label, color in [("하린", (40, 40, 200)), ("도윤", (60, 200, 60))]:
        d = tmp_path / label
        d.mkdir()
        ok, buf = cv2.imencode(".png", np.full((120, 160, 3), color, np.uint8))
        (d / "1.png").write_bytes(buf.tobytes())
    (tmp_path / "하린" / "note.txt").write_text("이미지 아님", encoding="utf-8")

    analyzer = ComposedAnalyzer("t", FixedDetector([((20, 20, 60, 60), 1.0)]), MeanColorEmbedder())
    samples, elapsed = load_samples(tmp_path, analyzer)
    assert sorted(s.label for s in samples) == ["도윤", "하린"]
    assert all(s.embedding is not None for s in samples)
    assert elapsed >= 0


@pytest.mark.parametrize("name", list(BACKENDS))
def test_backends_have_descriptions(name):
    assert BACKENDS[name].description
