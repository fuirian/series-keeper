"""명령줄 진입점.

    skpipe models                                  # 모델 파일 내려받기
    skpipe analyze VIDEO --refs REFS_DIR -o out.json [--keyframes DIR]
    skpipe evaluate out.json --labels labels.csv   # 여러 쌍이면 --pair out.json labels.csv 반복
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .faces import DEFAULT_MODEL_DIR, ensure_models


def _analyzer(model_dir: Path):
    from .faces import OpenCVFaceAnalyzer

    return OpenCVFaceAnalyzer(model_dir)


def cmd_models(args) -> int:
    for key, path in ensure_models(Path(args.model_dir)).items():
        print(f"{key}: {path}")
    return 0


def cmd_analyze(args) -> int:
    from .analyze import analyze_episode, save_result
    from .bible import load_bible
    from .match import Thresholds

    analyzer = _analyzer(Path(args.model_dir))
    bible = load_bible(args.refs, analyzer)
    if not bible.characters:
        print(f"레퍼런스에서 얼굴을 하나도 찾지 못함: {args.refs}", file=sys.stderr)
        return 1
    for path in bible.skipped:
        print(f"경고: 얼굴을 못 찾은 레퍼런스 {path}", file=sys.stderr)

    th = Thresholds(args.unknown_below, args.issue_below, args.ambiguous_margin)
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
    a.add_argument("--unknown-below", type=float, default=0.25)
    a.add_argument("--issue-below", type=float, default=0.45)
    a.add_argument("--ambiguous-margin", type=float, default=0.05)
    a.set_defaults(func=cmd_analyze)

    e = sub.add_parser("evaluate", help="라벨로 임계값 평가")
    e.add_argument("result", nargs="?", help="analyze 결과 JSON")
    e.add_argument("--labels", help="labels.csv")
    e.add_argument("--pair", nargs=2, action="append", metavar=("RESULT", "LABELS"), help="여러 회차를 함께 평가")
    e.add_argument("--min", type=float, default=0.20)
    e.add_argument("--max", type=float, default=0.70)
    e.add_argument("--step", type=float, default=0.025)
    e.set_defaults(func=cmd_evaluate)
    return p


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔 한글 출력
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
