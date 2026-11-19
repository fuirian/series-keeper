"""검출된 얼굴을 바이블 캐릭터와 매칭하고 이슈를 판정한다.

판정 규칙 (임계값은 2주차 측정으로 정할 값이라 전부 설정으로 뺐다):
  - best < unknown_below        → 바이블에 없는 인물(엑스트라 등). 이슈 아님
  - best < issue_below          → "low_similarity": 누군가와 닮았지만 기준 미달
  - best - second < ambiguous_margin → "ambiguous": 두 캐릭터 중 누군지 불확실
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .bible import Bible


@dataclass(frozen=True)
class Thresholds:
    unknown_below: float = 0.25
    issue_below: float = 0.45
    ambiguous_margin: float = 0.05


@dataclass
class Match:
    character: str | None  # None = 바이블에 없는 인물
    similarity: float  # 가장 닮은 캐릭터와의 유사도
    runner_up: str | None
    runner_up_similarity: float
    issue: str | None  # None | "low_similarity" | "ambiguous"


def character_scores(embedding: np.ndarray, bible: Bible) -> list[tuple[str, float]]:
    """캐릭터별 유사도 (해당 캐릭터 레퍼런스 중 최댓값), 높은 순."""
    scores = []
    for char in bible.characters:
        refs = np.stack(char.embeddings)
        scores.append((char.name, float(np.max(refs @ embedding))))
    return sorted(scores, key=lambda s: s[1], reverse=True)


def judge(scores: list[tuple[str, float]], th: Thresholds) -> Match:
    if not scores:
        return Match(None, 0.0, None, 0.0, None)
    best_name, best = scores[0]
    second_name, second = scores[1] if len(scores) > 1 else (None, -1.0)

    if best < th.unknown_below:
        return Match(None, best, best_name, best, None)
    issue = None
    if best < th.issue_below:
        issue = "low_similarity"
    elif second_name is not None and second >= th.issue_below and best - second < th.ambiguous_margin:
        issue = "ambiguous"
    return Match(best_name, best, second_name, max(second, 0.0), issue)


def match_face(embedding: np.ndarray, bible: Bible, th: Thresholds = Thresholds()) -> Match:
    return judge(character_scores(embedding, bible), th)
