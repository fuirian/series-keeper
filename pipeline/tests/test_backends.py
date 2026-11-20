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


# ───────── 색 특징 (실험 1 후속) ─────────

from skpipe.backends import ColorEmbedder, FusedEmbedder  # noqa: E402
from skpipe.bench import BenchResult, is_reliable, reliability_issues  # noqa: E402
from skpipe.experiments import best_backend  # noqa: E402


def portrait(hair_bgr, skin_bgr=(150, 180, 220), sweater_bgr=(140, 170, 200)):
    """머리카락(위)·얼굴(가운데)·옷(아래)으로 된 단순한 초상. 얼굴 박스는 가운데."""
    img = np.full((200, 200, 3), (230, 230, 230), np.uint8)
    cv2.rectangle(img, (40, 10), (160, 90), hair_bgr, -1)  # 머리카락
    cv2.rectangle(img, (65, 60), (135, 140), skin_bgr, -1)  # 얼굴
    cv2.rectangle(img, (30, 140), (170, 200), sweater_bgr, -1)  # 니트
    return img, (65, 60, 70, 80)


def test_color_embedder_separates_black_and_brown_hair():
    emb = ColorEmbedder()
    black1, box = portrait((20, 20, 20))
    black2, _ = portrait((30, 25, 25))  # 거의 같은 검정
    brown, _ = portrait((40, 70, 120))  # 갈색 (BGR)
    e1, e2, e3 = (emb.embed(img, box) for img in (black1, black2, brown))
    same, diff = float(e1 @ e2), float(e1 @ e3)
    assert same > 0.95
    assert diff < same - 0.2  # 머리색만 달라도 확실히 떨어진다


def test_fused_similarity_is_weighted_sum():
    a_vecs = {"x": vec(1, 0, 0), "y": vec(0.6, 0.8, 0)}
    b_vecs = {"x": vec(0, 1, 0), "y": vec(0, 0.6, 0.8)}

    class Lookup:
        def __init__(self, table):
            self.table = table

        def embed(self, image, bbox):
            return self.table[image]

    fused = FusedEmbedder([(Lookup(a_vecs), 3.0), (Lookup(b_vecs), 2.0)])  # 합이 1이 아니어도 정규화
    fx, fy = fused.embed("x", None), fused.embed("y", None)
    expected = 0.6 * float(a_vecs["x"] @ a_vecs["y"]) + 0.4 * float(b_vecs["x"] @ b_vecs["y"])
    assert math.isclose(float(fx @ fy), expected, rel_tol=1e-5)
    assert math.isclose(float(np.linalg.norm(fx)), 1.0, rel_tol=1e-5)


def test_fused_rejects_zero_weights():
    with pytest.raises(ValueError):
        FusedEmbedder([(MeanColorEmbedder(), 0.0)])


def bench_result(backend, auc, det=1.0, pos=30, neg=36):
    return BenchResult(backend, 12, int(12 * det), det, pos, neg, 0.8, 0.5, auc, 0.6, 0.8, 0.9, 50.0)


def test_reliability_rules_from_experiment_1():
    low_det = bench_result("anime-dino", 0.778, det=0.33, pos=3, neg=3)  # 실험 1의 anime-dino
    assert not is_reliable(low_det)
    reasons = " ".join(reliability_issues(low_det))
    assert "검출 33%" in reasons and "비교 쌍 부족" in reasons
    assert is_reliable(bench_result("yunet-dino", 0.57))


def test_best_backend_skips_unreliable_high_auc():
    results = [bench_result("opencv", 0.50), bench_result("yunet-dino", 0.57), bench_result("anime-dino", 0.78, det=0.33, pos=3, neg=3)]
    assert best_backend(results) == "yunet-dino (AUC 0.570)"
    assert best_backend([bench_result("anime-dino", 0.78, det=0.33, pos=3, neg=3)]) == "판정 불가 (데이터 부족)"
