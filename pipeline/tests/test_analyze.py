"""실제 얼굴 모델 없이 파이프라인 전체 흐름을 확인한다.

가짜 분석기: 프레임 색을 '얼굴 임베딩'으로 취급한다.
  빨강 컷 = 하린과 똑같음 / 파랑 컷 = 하린과 애매하게 닮음 / 초록 컷 = 도윤
"""

import numpy as np

from skpipe.analyze import analyze_episode, ms_to_tc
from skpipe.bible import Bible, Character
from skpipe.faces import Face, l2_normalize
from skpipe.match import Thresholds


class ColorAnalyzer:
    name = "fake-color"

    def analyze(self, image):
        b, g, r = (float(x) for x in image[60, 80])
        if r > 150:
            emb = [1, 0, 0]
        elif b > 150:
            emb = [0.4, 0, 0.9]  # 하린과 코사인 ≈ 0.41
        else:
            emb = [0, 1, 0]
        return [Face((10, 10, 50, 50), 0.99, l2_normalize(np.array(emb)))]


BIBLE = Bible([Character("하린", [l2_normalize(np.array([1, 0, 0]))]), Character("도윤", [l2_normalize(np.array([0, 1, 0]))])])


def test_analyze_flags_inconsistent_shot(synthetic_video):
    result = analyze_episode(synthetic_video, BIBLE, ColorAnalyzer(), Thresholds(0.25, 0.45, 0.05), frames_per_shot=2)

    assert result["summary"]["shots"] == 3
    assert result["summary"]["faces"] == 6
    assert len(result["issues"]) == 1
    issue = result["issues"][0]
    assert issue["shot"] == 1
    assert issue["character"] == "하린"
    assert issue["type"] == "low_similarity"
    assert 0.40 < issue["similarity"] < 0.45
    # 결과에 모든 캐릭터 점수가 남아 재평가 가능
    assert set(result["shots"][0]["faces"][0]["scores"]) == {"하린", "도윤"}


def test_ms_to_tc():
    assert ms_to_tc(192_340) == "03:12.3"
