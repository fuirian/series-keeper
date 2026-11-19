"""SeriesKeeper 영상 분석 파이프라인.

흐름: 영상 → 컷 분할(shots) → 컷별 대표 프레임 → 얼굴 검출·임베딩(faces)
      → 시리즈 바이블과 비교(match) → 이슈 목록(analyze)
"""

__version__ = "0.1.0"
