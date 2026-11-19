import numpy as np

from skpipe.bible import Bible, Character
from skpipe.faces import l2_normalize
from skpipe.match import Thresholds, judge, match_face


def vec(*xs):
    return l2_normalize(np.array(xs, dtype=np.float32))


BIBLE = Bible(
    [
        Character("하린", [vec(1, 0, 0), vec(0.9, 0.1, 0)]),
        Character("도윤", [vec(0, 1, 0)]),
    ]
)
TH = Thresholds(unknown_below=0.25, issue_below=0.45, ambiguous_margin=0.05)


def test_clear_match_has_no_issue():
    m = match_face(vec(1, 0.05, 0), BIBLE, TH)
    assert m.character == "하린"
    assert m.similarity > 0.9
    assert m.issue is None


def test_uses_best_reference_per_character():
    # 두 번째 레퍼런스와 거의 같음 → 최댓값 사용
    m = match_face(vec(0.9, 0.1, 0), BIBLE, TH)
    assert m.similarity > 0.99


def test_low_similarity_is_issue():
    m = judge([("하린", 0.38), ("도윤", 0.1)], TH)
    assert m.character == "하린"
    assert m.issue == "low_similarity"


def test_unknown_person_is_not_issue():
    m = match_face(vec(0, 0, 1), BIBLE, TH)
    assert m.character is None
    assert m.issue is None


def test_ambiguous_between_two_characters():
    m = judge([("하린", 0.62), ("도윤", 0.60)], TH)
    assert m.issue == "ambiguous"
    assert m.runner_up == "도윤"


def test_not_ambiguous_when_runner_up_below_threshold():
    m = judge([("하린", 0.47), ("도윤", 0.44)], TH)
    assert m.issue is None


def test_empty_bible():
    assert judge([], TH).character is None
