"""실험 기록: bench 결과를 실험 조건과 함께 저장한다.

실행할 때마다
  experiments/{YYYYMMDD-HHMMSS}-{이름}/result.json  — 기계가 읽는 전체 기록
  experiments/{YYYYMMDD-HHMMSS}-{이름}/result.md    — 사람이 읽는 요약
을 만들고, docs/experiments.md의 실험 목록 표에 한 줄을 추가한다.

같은 숫자라도 '어떤 데이터·코드·설정에서 나왔는지'가 없으면 비교할 수 없으므로
데이터셋 지문, git 커밋, 라이브러리 버전, 백엔드 기준값을 함께 남긴다.
이미지 자체나 PC의 절대 경로는 남기지 않는다 (저장소에 올라가므로).
"""

from __future__ import annotations

import hashlib
import json
import platform
import re
import subprocess
from dataclasses import asdict
from datetime import datetime
from importlib import metadata
from pathlib import Path

from .bench import OTHER_DIR, BenchResult, is_reliable, reliability_issues
from .bible import IMAGE_EXTS

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUT_DIR = REPO_ROOT / "experiments"
DEFAULT_LOG = REPO_ROOT / "docs" / "experiments.md"
LOG_MARKER = "<!-- bench:rows -->"  # 이 줄 아래에 실험 목록 행을 추가한다


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w가-힣-]+", "-", text.strip().lower()).strip("-")
    return slug[:40] or "bench"


def git_info(repo: Path = REPO_ROOT) -> dict:
    def run(*args: str) -> str:
        return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, timeout=10).stdout.strip()

    try:
        return {
            "commit": run("rev-parse", "--short", "HEAD") or None,
            "branch": run("rev-parse", "--abbrev-ref", "HEAD") or None,
            # 커밋하지 않은 변경이 있으면 결과를 그대로 재현할 수 없다
            "dirty": bool(run("status", "--porcelain", "--", "pipeline/src")),
        }
    except Exception:
        return {"commit": None, "branch": None, "dirty": None}


def describe_dataset(data_dir: Path) -> dict:
    """캐릭터별 이미지 수와 지문(파일 이름·크기 해시). 지문이 같으면 같은 데이터로 본다."""
    per_label: dict[str, int] = {}
    h = hashlib.sha256()
    for char_dir in sorted(p for p in data_dir.iterdir() if p.is_dir()):
        files = sorted(f for f in char_dir.iterdir() if f.suffix.lower() in IMAGE_EXTS)
        per_label[char_dir.name] = len(files)
        for f in files:
            h.update(f"{char_dir.name}/{f.name}:{f.stat().st_size}\n".encode())
    try:
        shown = str(data_dir.resolve().relative_to(REPO_ROOT)).replace("\\", "/")
    except ValueError:
        shown = f"(저장소 밖) {data_dir.name}"  # PC 절대 경로는 남기지 않는다
    return {
        "path": shown,
        "characters": sum(1 for k in per_label if k != OTHER_DIR),
        "images": sum(per_label.values()),
        "per_character": per_label,
        "fingerprint": h.hexdigest()[:12],
    }


def environment() -> dict:
    def ver(pkg: str) -> str | None:
        try:
            return metadata.version(pkg)
        except metadata.PackageNotFoundError:
            return None

    return {
        "python": platform.python_version(),
        "os": f"{platform.system()} {platform.release()}",
        "cpu": platform.processor() or platform.machine(),
        "packages": {p: ver(p) for p in ["skpipe", "opencv-python", "numpy", "torch", "transformers", "scenedetect"]},
    }


def _fmt(x: float, pct: bool = False) -> str:
    if x != x:  # nan
        return "–"
    return f"{x:.0%}" if pct else f"{x:.3f}"


def markdown_table(results: list[BenchResult]) -> str:
    lines = [
        "| 백엔드 | 검출률 | AUC | 최적 기준 | 균형 정확도 | 식별 정확도 | 같은 인물 평균 | 다른 인물 평균 | ms/장 | 신뢰도 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in results:
        lines.append(
            f"| {r.backend} | {_fmt(r.detection_rate, True)} | {_fmt(r.auc)} | {_fmt(r.threshold)} | "
            f"{_fmt(r.balanced_acc, True)} | {_fmt(r.id_acc, True)} | {_fmt(r.pos_mean)} | {_fmt(r.neg_mean)} | "
            f"{r.ms_per_image:.0f} | {'✓' if is_reliable(r) else '⚠ ' + ('; '.join(reliability_issues(r)) or 'AUC 계산 불가')} |"
        )
    return "\n".join(lines)


def best_backend(results: list[BenchResult]) -> str:
    """신뢰할 수 있는 결과 중 AUC가 가장 높은 백엔드 (동점이면 검출률).

    검출률·비교 쌍 수가 모자란 결과는 AUC가 높아도 뽑지 않는다 (실험 1의 교훈).
    """
    valid = [r for r in results if is_reliable(r)]
    if not valid:
        return "판정 불가 (데이터 부족)" if results else "–"
    best = max(valid, key=lambda r: (r.auc, r.detection_rate))
    return f"{best.backend} (AUC {best.auc:.3f})"


def record_bench(
    results: list[BenchResult],
    data_dir: Path,
    name: str,
    note: str = "",
    thresholds: dict | None = None,
    out_dir: Path = DEFAULT_OUT_DIR,
    log_path: Path | None = DEFAULT_LOG,
    now: datetime | None = None,
) -> Path:
    now = now or datetime.now()
    exp_id = f"{now:%Y%m%d-%H%M%S}-{slugify(name)}"
    exp_dir = out_dir / exp_id
    exp_dir.mkdir(parents=True, exist_ok=False)

    dataset = describe_dataset(data_dir)
    git = git_info()
    record = {
        "id": exp_id,
        "kind": "bench",
        "name": name,
        "note": note,
        "created_at": now.isoformat(timespec="seconds"),
        "git": git,
        "dataset": dataset,
        "environment": environment(),
        "backend_thresholds": thresholds or {},
        "results": [asdict(r) for r in results],
    }
    (exp_dir / "result.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    commit = f"{git['commit']}{' (커밋 안 된 변경 있음)' if git['dirty'] else ''}" if git["commit"] else "알 수 없음"
    per_char = ", ".join(f"{k} {v}장" for k, v in dataset["per_character"].items())
    md = [
        f"# {exp_id}",
        "",
        f"- **이름:** {name}",
        f"- **날짜:** {record['created_at']}",
        f"- **코드:** {commit}",
        f"- **데이터:** `{dataset['path']}` · 캐릭터 {dataset['characters']}명 · 이미지 {dataset['images']}장 "
        f"({per_char}) · 지문 `{dataset['fingerprint']}`",
        f"- **환경:** Python {record['environment']['python']} · {record['environment']['os']}",
        "",
        markdown_table(results),
        "",
        f"가장 잘 가른 백엔드: **{best_backend(results)}**",
    ]
    if note:
        md += ["", f"> {note}"]
    (exp_dir / "result.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    if log_path is not None:
        append_log_row(log_path, exp_id, record, results)
    return exp_dir


def append_log_row(log_path: Path, exp_id: str, record: dict, results: list[BenchResult]) -> None:
    """docs/experiments.md의 실험 목록 표에 한 줄 추가. 표시 줄이 없으면 건드리지 않는다."""
    if not log_path.exists():
        return
    text = log_path.read_text(encoding="utf-8")
    if LOG_MARKER not in text:
        return
    ds = record["dataset"]
    rel = f"../experiments/{exp_id}/result.md"
    row = (
        f"| [{exp_id}]({rel}) | {record['name']} | 캐릭터 {ds['characters']}명·{ds['images']}장 "
        f"(`{ds['fingerprint']}`) | {best_backend(results)} | {record['git']['commit'] or '–'} |"
    )
    text = text.replace(LOG_MARKER, f"{row}\n{LOG_MARKER}", 1)
    log_path.write_text(text, encoding="utf-8")
