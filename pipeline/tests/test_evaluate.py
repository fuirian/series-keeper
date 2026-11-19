import pytest

from skpipe.evaluate import Label, evaluate, format_report, load_labels, parse_tc, shot_score, sweep


@pytest.mark.parametrize(
    "tc, ms",
    [("03:12", 192_000), ("1:02:03.5", 3_723_500), ("192.5", 192_500), ("0:00", 0)],
)
def test_parse_tc(tc, ms):
    assert parse_tc(tc) == ms


def test_parse_tc_rejects_garbage():
    with pytest.raises(ValueError):
        parse_tc("1:2:3:4")


def test_load_labels_korean_and_bom(tmp_path):
    p = tmp_path / "labels.csv"
    p.write_text("time,character,label\n03:12,하린,NG\n05:40,도윤,ok\n", encoding="utf-8-sig")
    labels = load_labels(p)
    assert labels == [Label(192_000, "하린", True), Label(340_000, "도윤", False)]


def test_load_labels_rejects_bad_label(tmp_path):
    p = tmp_path / "labels.csv"
    p.write_text("time,character,label\n00:01,하린,maybe\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_labels(p)


RESULT = {
    "shots": [
        {"start_ms": 0, "end_ms": 1000, "faces": [{"scores": {"하린": 0.8, "도윤": 0.1}}, {"scores": {"하린": 0.6}}]},
        {"start_ms": 1000, "end_ms": 2000, "faces": [{"scores": {"하린": 0.3, "도윤": 0.2}}]},
        {"start_ms": 2000, "end_ms": 3000, "faces": []},
    ]
}


def test_shot_score_takes_max_in_shot():
    assert shot_score(RESULT, 500, "하린") == 0.8
    assert shot_score(RESULT, 1500, "하린") == 0.3
    assert shot_score(RESULT, 2500, "하린") is None  # 얼굴 없음
    assert shot_score(RESULT, 9999, "하린") is None  # 컷 밖


def test_sweep_counts():
    scored = [(0.8, False), (0.7, False), (0.3, True), (0.5, True)]
    (row,) = sweep(scored, [0.6])
    assert (row.tp, row.fp, row.fn, row.tn) == (2, 0, 0, 2)
    assert row.precision == row.recall == row.f1 == 1.0


def test_evaluate_end_to_end():
    labels = [Label(500, "하린", False), Label(1500, "하린", True), Label(2500, "하린", False)]
    ev = evaluate([RESULT], [labels], [0.2, 0.5])
    assert ev["labels"] == 3 and ev["scored"] == 2 and ev["no_face"] == 1
    assert ev["best"].threshold == 0.5
    assert "◀ best F1" in format_report(ev)
