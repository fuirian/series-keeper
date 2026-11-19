"""라벨과 분석 결과를 비교해 임계값별 정밀도·재현율을 계산한다.

labels.csv 형식 (헤더 필수):
    time,character,label
    03:12,하린,ng
    05:40,하린,ok
    1:02:03.5,도윤,ok
- time: 그 인물이 나오는 시점 (해당 시점을 포함한 컷과 맞춘다)
- label: ok = 레퍼런스와 같은 얼굴로 보임 / ng = 일관성 깨짐 (찾아내야 할 컷)

양성(찾아야 할 것) = ng. 컷에서 그 캐릭터 유사도가 임계값 미만이면 ng로 예측.
그 컷에서 얼굴을 하나도 못 찾으면 판정 불가로 따로 센다 (애니체에서 중요한 지표).
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path


def parse_tc(tc: str) -> int:
    """'03:12', '1:02:03.5', '192.5' → 밀리초"""
    parts = tc.strip().split(":")
    if not 1 <= len(parts) <= 3:
        raise ValueError(f"타임코드 형식 오류: {tc!r}")
    seconds = 0.0
    for p in parts:
        seconds = seconds * 60 + float(p)
    return int(round(seconds * 1000))


@dataclass
class Label:
    time_ms: int
    character: str
    is_ng: bool


def load_labels(path: str | Path) -> list[Label]:
    labels = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for i, row in enumerate(csv.DictReader(f), start=2):
            lab = row["label"].strip().lower()
            if lab not in {"ok", "ng"}:
                raise ValueError(f"{path}:{i} label은 ok/ng 중 하나여야 함: {row['label']!r}")
            labels.append(Label(parse_tc(row["time"]), row["character"].strip(), lab == "ng"))
    return labels


def shot_score(result: dict, time_ms: int, character: str) -> float | None:
    """time_ms를 포함한 컷에서 character와의 최고 유사도. 얼굴이 없으면 None."""
    for shot in result["shots"]:
        if shot["start_ms"] <= time_ms < shot["end_ms"]:
            sims = [f["scores"].get(character) for f in shot["faces"]]
            sims = [s for s in sims if s is not None]
            return max(sims) if sims else None
    return None


@dataclass
class Row:
    threshold: float
    tp: int
    fp: int
    fn: int
    tn: int

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if self.tp + self.fp else 0.0

    @property
    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if self.tp + self.fn else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if p + r else 0.0


def sweep(scored: list[tuple[float, bool]], thresholds: list[float]) -> list[Row]:
    rows = []
    for t in thresholds:
        tp = sum(1 for s, ng in scored if s < t and ng)
        fp = sum(1 for s, ng in scored if s < t and not ng)
        fn = sum(1 for s, ng in scored if s >= t and ng)
        tn = sum(1 for s, ng in scored if s >= t and not ng)
        rows.append(Row(round(t, 3), tp, fp, fn, tn))
    return rows


def evaluate(results: list[dict], labels_per_result: list[list[Label]], thresholds: list[float]) -> dict:
    scored: list[tuple[float, bool]] = []
    no_face: list[Label] = []
    for result, labels in zip(results, labels_per_result):
        for lab in labels:
            s = shot_score(result, lab.time_ms, lab.character)
            if s is None:
                no_face.append(lab)
            else:
                scored.append((s, lab.is_ng))
    rows = sweep(scored, thresholds)
    best = max(rows, key=lambda r: (r.f1, r.recall)) if rows else None
    total = len(scored) + len(no_face)
    return {
        "labels": total,
        "scored": len(scored),
        "no_face": len(no_face),
        "no_face_rate": len(no_face) / total if total else 0.0,
        "ok_scores": sorted(s for s, ng in scored if not ng),
        "ng_scores": sorted(s for s, ng in scored if ng),
        "rows": rows,
        "best": best,
    }


def format_report(ev: dict) -> str:
    lines = [
        f"라벨 {ev['labels']}개 중 얼굴 검출 성공 {ev['scored']}개, 실패 {ev['no_face']}개 "
        f"(실패율 {ev['no_face_rate']:.0%})",
        "",
        "임계값  정밀도  재현율   F1    TP  FP  FN  TN",
    ]
    for r in ev["rows"]:
        mark = "  ◀ best F1" if ev["best"] is r else ""
        lines.append(
            f"{r.threshold:6.3f}  {r.precision:6.2f}  {r.recall:6.2f}  {r.f1:5.2f}  "
            f"{r.tp:3d} {r.fp:3d} {r.fn:3d} {r.tn:3d}{mark}"
        )

    def dist(xs: list[float]) -> str:
        if not xs:
            return "없음"
        return f"n={len(xs)}, min {xs[0]:.3f} / 중앙 {xs[len(xs) // 2]:.3f} / max {xs[-1]:.3f}"

    lines += ["", f"ok 컷 유사도: {dist(ev['ok_scores'])}", f"ng 컷 유사도: {dist(ev['ng_scores'])}"]
    return "\n".join(lines)
