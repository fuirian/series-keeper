"""백엔드 비교 실험: 같은 얼굴 사진 묶음으로 백엔드마다 성능을 잰다.

데이터 폴더 구조 (캐릭터별로 여러 장, 회차·각도·표정이 섞일수록 좋다):
    faces/
      하린/   ep01_0312.png, ep02_0105.png, ...
      도윤/   ...
      _other/ (선택) 바이블에 없는 엑스트라

이미지마다 가장 큰 얼굴 하나를 쓴다. 측정 항목:
  - 검출률: 얼굴을 찾은 이미지 비율 (애니체에서 실사 검출기가 얼마나 놓치는지)
  - AUC: 같은 인물 쌍 vs 다른 인물 쌍 유사도를 얼마나 잘 가르는지 (1.0 완벽, 0.5 무작위)
  - 최적 기준값: 같은/다른 인물을 가장 잘 가르는 유사도와 그때 정확도 (균형 정확도)
  - 식별 정확도: 한 장을 빼고 나머지 평균(캐릭터 중심)과 비교했을 때 맞는 캐릭터를 고르는 비율
  - 처리 속도: 이미지 한 장당 ms
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from itertools import combinations
from pathlib import Path

import numpy as np

from .bible import IMAGE_EXTS, imread_unicode
from .faces import FaceAnalyzer, l2_normalize

OTHER_DIR = "_other"


@dataclass
class Sample:
    label: str  # 캐릭터 폴더 이름 ("_other"는 엑스트라)
    path: str
    embedding: np.ndarray | None  # 얼굴을 못 찾으면 None


def load_samples(data_dir: Path, analyzer: FaceAnalyzer) -> tuple[list[Sample], float]:
    samples, elapsed = [], 0.0
    for char_dir in sorted(p for p in data_dir.iterdir() if p.is_dir()):
        for img_path in sorted(char_dir.iterdir()):
            if img_path.suffix.lower() not in IMAGE_EXTS:
                continue
            img = imread_unicode(img_path)
            t0 = time.perf_counter()
            faces = analyzer.analyze(img) if img is not None else []
            elapsed += time.perf_counter() - t0
            emb = max(faces, key=lambda f: f.bbox[2] * f.bbox[3]).embedding if faces else None
            samples.append(Sample(char_dir.name, str(img_path), emb))
    return samples, elapsed


def roc_auc(pos: list[float], neg: list[float]) -> float:
    """Mann–Whitney U로 AUC (동점은 0.5). sklearn 없이."""
    if not pos or not neg:
        return float("nan")
    scores = np.array(pos + neg)
    order = scores.argsort(kind="mergesort")
    ranks = np.empty(len(scores))
    i = 0
    while i < len(scores):  # 동점은 평균 순위
        j = i
        while j + 1 < len(scores) and scores[order[j + 1]] == scores[order[i]]:
            j += 1
        ranks[order[i : j + 1]] = (i + j) / 2 + 1
        i = j + 1
    rank_sum_pos = ranks[: len(pos)].sum()
    return float((rank_sum_pos - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def best_threshold(pos: list[float], neg: list[float]) -> tuple[float, float]:
    """균형 정확도((TPR+TNR)/2)가 최대인 기준값. 같은 인물 = 유사도 ≥ 기준."""
    if not pos or not neg:
        return float("nan"), float("nan")
    p, n = np.array(pos), np.array(neg)
    best_t, best_acc = float("nan"), -1.0
    for t in np.unique(np.concatenate([p, n])):
        acc = ((p >= t).mean() + (n < t).mean()) / 2
        if acc > best_acc:
            best_t, best_acc = float(t), float(acc)
    return best_t, best_acc


def identification_accuracy(samples: list[Sample]) -> float:
    """leave-one-out: 한 장을 빼고 캐릭터별 평균 벡터와 비교해 가장 가까운 캐릭터를 맞히는 비율."""
    usable = [s for s in samples if s.embedding is not None and s.label != OTHER_DIR]
    labels = sorted({s.label for s in usable})
    if len(labels) < 2:
        return float("nan")
    correct = total = 0
    for i, s in enumerate(usable):
        centroids = {}
        for lab in labels:
            vecs = [o.embedding for j, o in enumerate(usable) if j != i and o.label == lab]
            if vecs:
                centroids[lab] = l2_normalize(np.mean(vecs, axis=0))
        if s.label not in centroids:
            continue  # 그 캐릭터 사진이 한 장뿐
        pred = max(centroids, key=lambda lab: float(centroids[lab] @ s.embedding))
        correct += pred == s.label
        total += 1
    return correct / total if total else float("nan")


@dataclass
class BenchResult:
    backend: str
    images: int
    detected: int
    detection_rate: float
    pos_pairs: int
    neg_pairs: int
    pos_mean: float
    neg_mean: float
    auc: float
    threshold: float
    balanced_acc: float
    id_acc: float
    ms_per_image: float


def evaluate_samples(backend: str, samples: list[Sample], elapsed_s: float) -> BenchResult:
    usable = [s for s in samples if s.embedding is not None]
    pos, neg = [], []
    for a, b in combinations(usable, 2):
        sim = float(a.embedding @ b.embedding)
        if a.label == b.label and a.label != OTHER_DIR:
            pos.append(sim)
        else:
            neg.append(sim)
    t, acc = best_threshold(pos, neg)
    return BenchResult(
        backend=backend,
        images=len(samples),
        detected=len(usable),
        detection_rate=len(usable) / len(samples) if samples else float("nan"),
        pos_pairs=len(pos),
        neg_pairs=len(neg),
        pos_mean=float(np.mean(pos)) if pos else float("nan"),
        neg_mean=float(np.mean(neg)) if neg else float("nan"),
        auc=roc_auc(pos, neg),
        threshold=t,
        balanced_acc=acc,
        id_acc=identification_accuracy(samples),
        ms_per_image=1000 * elapsed_s / len(samples) if samples else float("nan"),
    )


def format_table(results: list[BenchResult]) -> str:
    def f(x: float, pct: bool = False) -> str:
        if x != x:  # nan
            return "–"
        return f"{x:.0%}" if pct else f"{x:.3f}"

    header = "백엔드        검출률   AUC    최적기준  균형정확도  식별정확도  같은인물평균  다른인물평균  ms/장"
    lines = [header, "-" * len(header)]
    for r in results:
        lines.append(
            f"{r.backend:<12}  {f(r.detection_rate, True):>5}   {f(r.auc)}  {f(r.threshold):>7}  "
            f"{f(r.balanced_acc, True):>9}  {f(r.id_acc, True):>9}  {f(r.pos_mean):>11}  {f(r.neg_mean):>11}  "
            f"{r.ms_per_image:6.0f}"
        )
    lines.append("")
    lines.append("검출률 = 얼굴을 찾은 이미지 비율 / AUC = 같은·다른 인물 구분력(1.0 완벽, 0.5 무작위)")
    lines.append("최적기준 = 이 유사도 이상이면 같은 인물로 볼 때 균형 정확도가 가장 높은 값 (issue_below 후보)")
    return "\n".join(lines)


def to_dict(r: BenchResult) -> dict:
    return asdict(r)
