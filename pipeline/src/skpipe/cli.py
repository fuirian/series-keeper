"""명령줄 진입점.

    skpipe models                                  # 모델 파일 내려받기
    skpipe analyze VIDEO --refs REFS_DIR -o out.json [--keyframes DIR]
    skpipe evaluate out.json --labels labels.csv   # 여러 쌍이면 --pair out.json labels.csv 반복
    skpipe bench faces/ [--backends opencv,anime-dino]  # 백엔드 비교 실험
    skpipe worker [--once]                         # 분석 워커 (pipeline/.env의 Supabase 설정 사용)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .faces import DEFAULT_MODEL_DIR, ensure_models


def _analyzer(model_dir: Path, backend: str = "opencv"):
    from .backends import create_analyzer

    return create_analyzer(backend, model_dir)


def cmd_models(args) -> int:
    for key, path in ensure_models(Path(args.model_dir)).items():
        print(f"{key}: {path}")
    return 0


def cmd_analyze(args) -> int:
    from .analyze import analyze_episode, save_result
    from .bible import load_bible
    from .match import Thresholds

    from .backends import get_backend

    analyzer = _analyzer(Path(args.model_dir), args.backend)
    bible = load_bible(args.refs, analyzer)
    if not bible.characters:
        print(f"레퍼런스에서 얼굴을 하나도 찾지 못함: {args.refs}", file=sys.stderr)
        return 1
    for path in bible.skipped:
        print(f"경고: 얼굴을 못 찾은 레퍼런스 {path}", file=sys.stderr)

    # 기준값을 지정하지 않으면 백엔드 기본값 (백엔드마다 유사도 분포가 다르다)
    d = get_backend(args.backend).thresholds
    th = Thresholds(
        args.unknown_below if args.unknown_below is not None else d.unknown_below,
        args.issue_below if args.issue_below is not None else d.issue_below,
        args.ambiguous_margin if args.ambiguous_margin is not None else d.ambiguous_margin,
    )
    print(f"백엔드 {args.backend} · 기준값 {th}")
    result = analyze_episode(
        args.video, bible, analyzer, th,
        shot_threshold=args.shot_threshold,
        frames_per_shot=args.frames_per_shot,
        keyframe_dir=args.keyframes,
    )
    save_result(result, args.output)

    s, t = result["summary"], result["timings"]
    print(f"영상 {s['duration_s']}초 · 컷 {s['shots']}개 (얼굴 있는 컷 {s['shots_with_faces']}) · 얼굴 {s['faces']}개")
    print(f"처리 시간: 컷 분할 {t['shot_detection_s']}s, 프레임 {t['keyframes_s']}s, 얼굴 {t['faces_s']}s")
    print(f"이슈 {s['issues']}개")
    for i in result["issues"][:20]:
        extra = f" (2순위 {i['runner_up']} {i['runner_up_similarity']:.2f})" if i["type"] == "ambiguous" else ""
        print(f"  {i['start']}–{i['end']}  {i['character']}  {i['type']}  {i['similarity']:.3f}{extra}")
    print(f"결과: {args.output}")
    return 0


def cmd_evaluate(args) -> int:
    from .evaluate import evaluate, format_report, load_labels

    pairs = list(args.pair or [])
    if args.result:
        if not args.labels:
            print("--labels가 필요함", file=sys.stderr)
            return 2
        pairs.append([args.result, args.labels])
    if not pairs:
        print("평가할 결과가 없음", file=sys.stderr)
        return 2

    results = [json.loads(Path(r).read_text(encoding="utf-8")) for r, _ in pairs]
    labels = [load_labels(l) for _, l in pairs]
    steps = int(round((args.max - args.min) / args.step)) + 1
    thresholds = [args.min + i * args.step for i in range(steps)]
    print(format_report(evaluate(results, labels, thresholds)))
    return 0


def cmd_bench(args) -> int:
    import json

    from .backends import BACKENDS
    from .bench import evaluate_samples, format_table, load_samples, to_dict

    data_dir = Path(args.data)
    if not data_dir.is_dir():
        print(f"폴더가 없음: {data_dir}", file=sys.stderr)
        return 2
    names = [n.strip() for n in args.backends.split(",")] if args.backends else list(BACKENDS)
    results = []
    for name in names:
        print(f"[{name}] 분석 중…", flush=True)
        samples, elapsed = load_samples(data_dir, _analyzer(Path(args.model_dir), name))
        results.append(evaluate_samples(name, samples, elapsed))
    print()
    print(format_table(results))
    if args.json:
        Path(args.json).write_text(json.dumps([to_dict(r) for r in results], ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"결과: {args.json}")

    if not args.no_record:
        from dataclasses import asdict

        from .backends import get_backend
        from .experiments import DEFAULT_OUT_DIR, record_bench

        exp_dir = record_bench(
            results,
            data_dir,
            name=args.name or data_dir.name,
            note=args.note or "",
            thresholds={n: asdict(get_backend(n).thresholds) for n in names},
            out_dir=Path(args.out_dir) if args.out_dir else DEFAULT_OUT_DIR,
        )
        print(f"실험 기록: {exp_dir}  (docs/experiments.md 목록에도 추가)")
    return 0


def cmd_worker(args) -> int:
    import logging

    from .backends import AnalyzerPool
    from .worker import SupabaseStore, config_from_env, load_env_file, run_forever

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    load_env_file(Path(args.env))
    config = config_from_env()
    store = SupabaseStore(config.url, config.secret_key)
    pool = AnalyzerPool(Path(args.model_dir), override=args.backend)
    run_forever(store, pool, config.poll_seconds, once=args.once)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="skpipe", description="SeriesKeeper 분석 파이프라인")
    p.add_argument("--model-dir", default=str(DEFAULT_MODEL_DIR))
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("models", help="모델 파일 내려받기").set_defaults(func=cmd_models)

    a = sub.add_parser("analyze", help="회차 영상 분석")
    a.add_argument("video")
    a.add_argument("--refs", required=True, help="캐릭터별 레퍼런스 폴더")
    a.add_argument("-o", "--output", required=True, help="결과 JSON 경로")
    a.add_argument("--keyframes", help="대표 프레임 저장 폴더 (선택)")
    a.add_argument("--shot-threshold", type=float, default=27.0)
    a.add_argument("--frames-per-shot", type=int, default=3)
    a.add_argument("--backend", default="opencv", help="얼굴 분석 백엔드: opencv | yunet-dino | anime-dino")
    a.add_argument("--unknown-below", type=float, default=None, help="기본: 백엔드별 값")
    a.add_argument("--issue-below", type=float, default=None, help="기본: 백엔드별 값")
    a.add_argument("--ambiguous-margin", type=float, default=None, help="기본: 백엔드별 값")
    a.set_defaults(func=cmd_analyze)

    e = sub.add_parser("evaluate", help="라벨로 임계값 평가")
    e.add_argument("result", nargs="?", help="analyze 결과 JSON")
    e.add_argument("--labels", help="labels.csv")
    e.add_argument("--pair", nargs=2, action="append", metavar=("RESULT", "LABELS"), help="여러 회차를 함께 평가")
    e.add_argument("--min", type=float, default=0.20)
    e.add_argument("--max", type=float, default=0.70)
    e.add_argument("--step", type=float, default=0.025)
    e.set_defaults(func=cmd_evaluate)

    b = sub.add_parser("bench", help="얼굴 사진 묶음으로 백엔드 비교 (검출률·AUC·최적 기준값)")
    b.add_argument("data", help="캐릭터별 하위 폴더에 얼굴 사진이 든 폴더")
    b.add_argument("--backends", help="쉼표로 구분 (기본: 전부)")
    b.add_argument("--json", help="결과 JSON을 따로 저장할 경로 (실험 기록과 별개)")
    b.add_argument("--name", help="실험 이름 (기본: 데이터 폴더 이름)")
    b.add_argument("--note", help="무엇을 왜 바꿨는지 한 줄 메모")
    b.add_argument("--no-record", action="store_true", help="experiments/에 기록하지 않음")
    b.add_argument("--out-dir", help="기록 폴더 (기본: 저장소의 experiments/)")
    b.set_defaults(func=cmd_bench)

    w = sub.add_parser("worker", help="분석 워커 실행 (Supabase의 분석 대기 회차를 처리)")
    w.add_argument("--once", action="store_true", help="대기 회차를 모두 처리하면 종료 (기본: 계속 대기)")
    w.add_argument("--backend", help="화풍과 상관없이 이 백엔드만 사용 (기본: 시리즈 화풍에 따라 자동)")
    w.add_argument("--env", default=str(Path(__file__).resolve().parents[2] / ".env"), help=".env 파일 경로")
    w.set_defaults(func=cmd_worker)
    return p


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔 한글 출력
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
