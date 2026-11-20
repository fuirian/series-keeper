"""실험 기록 테스트: 결과 파일, 조건, 기록장 표 추가."""

import json
from datetime import datetime

import cv2
import numpy as np

from skpipe.bench import BenchResult
from skpipe.experiments import LOG_MARKER, best_backend, describe_dataset, record_bench, slugify


def make_dataset(root):
    for label, n in [("하린", 2), ("도윤", 1), ("_other", 1)]:
        d = root / label
        d.mkdir(parents=True)
        for i in range(n):
            ok, buf = cv2.imencode(".png", np.full((10, 10, 3), i * 40, np.uint8))
            (d / f"{i}.png").write_bytes(buf.tobytes())
    return root


def result(backend, auc, det=1.0):
    return BenchResult(backend, 12, int(12 * det), det, 30, 36, 0.9, 0.2, auc, 0.6, 0.9, 1.0, 30.0)


def test_slugify_keeps_korean():
    assert slugify("애니 기본 비교!") == "애니-기본-비교"
    assert slugify("   ") == "bench"


def test_describe_dataset_counts_and_fingerprint(tmp_path):
    data = make_dataset(tmp_path / "faces")
    ds = describe_dataset(data)
    assert ds["characters"] == 2  # _other 제외
    assert ds["images"] == 4
    assert ds["per_character"] == {"_other": 1, "도윤": 1, "하린": 2}
    assert ds["path"].startswith("(저장소 밖)")  # PC 절대 경로를 남기지 않는다
    assert str(tmp_path) not in ds["path"]

    before = ds["fingerprint"]
    (data / "도윤" / "extra.png").write_bytes((data / "도윤" / "0.png").read_bytes())
    assert describe_dataset(data)["fingerprint"] != before  # 사진이 바뀌면 지문도 바뀐다


def test_best_backend_ignores_nan():
    assert best_backend([result("a", 0.8), result("b", float("nan")), result("c", 0.9)]) == "c (AUC 0.900)"
    assert best_backend([result("a", float("nan"))]) == "판정 불가 (데이터 부족)"
    assert best_backend([]) == "–"


def test_record_bench_writes_files_and_log_row(tmp_path):
    data = make_dataset(tmp_path / "faces")
    log = tmp_path / "experiments.md"
    log.write_text(f"## 실험 목록\n\n| 실험 |\n| --- |\n{LOG_MARKER}\n\n## 해석\n", encoding="utf-8")

    exp_dir = record_bench(
        [result("opencv", 0.7), result("anime-dino", 0.95)],
        data,
        name="애니 비교",
        note="첫 실험",
        thresholds={"opencv": {"issue_below": 0.45}},
        out_dir=tmp_path / "experiments",
        log_path=log,
        now=datetime(2026, 11, 20, 15, 30, 0),
    )

    assert exp_dir.name == "20261120-153000-애니-비교"
    rec = json.loads((exp_dir / "result.json").read_text(encoding="utf-8"))
    assert rec["name"] == "애니 비교" and rec["note"] == "첫 실험"
    assert rec["dataset"]["images"] == 4
    assert rec["backend_thresholds"]["opencv"]["issue_below"] == 0.45
    assert [r["backend"] for r in rec["results"]] == ["opencv", "anime-dino"]
    assert "packages" in rec["environment"] and "commit" in rec["git"]

    md = (exp_dir / "result.md").read_text(encoding="utf-8")
    assert "| anime-dino |" in md and "anime-dino (AUC 0.950)" in md and "> 첫 실험" in md

    text = log.read_text(encoding="utf-8")
    row_pos, marker_pos = text.index("20261120-153000-애니-비교"), text.index(LOG_MARKER)
    assert row_pos < marker_pos  # 표시 줄 바로 위에 추가 (다음 실험도 그 아래로 이어짐)
    assert text.count(LOG_MARKER) == 1


def test_record_bench_leaves_log_without_marker_untouched(tmp_path):
    data = make_dataset(tmp_path / "faces")
    log = tmp_path / "experiments.md"
    log.write_text("표시 줄 없음\n", encoding="utf-8")
    record_bench([result("opencv", 0.7)], data, name="x", out_dir=tmp_path / "exp", log_path=log)
    assert log.read_text(encoding="utf-8") == "표시 줄 없음\n"
