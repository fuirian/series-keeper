# skpipe — 분석 파이프라인 (2주차 PoC)

회차 영상을 컷으로 나누고, 컷마다 등장인물 얼굴을 시리즈 바이블 레퍼런스와 비교해 **일관성이 깨진 컷**을 찾는다.
3주차에는 이 코드를 그대로 분석 워커(Celery/RQ)가 불러 쓴다.

```
영상 ─▶ 컷 분할 (PySceneDetect) ─▶ 컷당 대표 프레임 3장 ─▶ 얼굴 검출·임베딩 ─▶ 바이블과 코사인 유사도 ─▶ 이슈
```

## 얼굴 모델 선택

계획서에는 InsightFace(ArcFace)로 적었지만, PoC는 **OpenCV 내장 모델**로 시작한다.

| | OpenCV YuNet + SFace (현재) | InsightFace buffalo_l |
| --- | --- | --- |
| 설치 | `pip install opencv-python`만 | Windows에서 C++ 빌드 도구 필요 |
| 실행 | CPU에서 충분히 빠름 | GPU 권장 |
| 모델 라이선스 | Apache-2.0 (상업적 사용 가능) | 사전학습 모델은 비상업 연구용 |
| 임베딩 | 128차원, ArcFace 계열 | 512차원, ArcFace |

`faces.FaceAnalyzer` 프로토콜만 맞추면 백엔드를 바꿀 수 있다. 애니체에서 정확도가 낮으면 애니 얼굴 검출기나 CLIP/DINOv2로 교체한다 (계획서 리스크 대응).

첫 확인 (OpenCV 샘플 이미지): 같은 인물(좌우반전·축소·밝기 변경) **0.862**, 다른 인물 **0.127**.

## 설치

```powershell
cd pipeline
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
.venv\Scripts\skpipe models   # 모델 파일(약 39MB)을 pipeline/models/에 내려받음
```

## 사용법

레퍼런스는 캐릭터 이름 폴더에 넣는다 (자세한 기준은 [samples/README.md](../samples/README.md)).

```
samples/달빛하숙집/refs/하린/front.png
samples/달빛하숙집/refs/도윤/front.png
```

**분석**

```powershell
.venv\Scripts\skpipe analyze ..\samples\달빛하숙집\ep01.mp4 --refs ..\samples\달빛하숙집\refs -o out\ep01.json --keyframes out\ep01_frames
```

```
영상 512.3초 · 컷 96개 (얼굴 있는 컷 71) · 얼굴 188개
처리 시간: 컷 분할 14.2s, 프레임 6.1s, 얼굴 9.8s
이슈 3개
  03:12.0–03:16.4  하린  low_similarity  0.381
  ...
```
(위 숫자는 출력 형식 예시)

**임계값 평가** — 회차별 `ep01.labels.csv`를 만들고 (형식은 [evaluate.py](src/skpipe/evaluate.py) 맨 위 주석)

```powershell
.venv\Scripts\skpipe evaluate out\ep01.json --labels ..\samples\달빛하숙집\ep01.labels.csv
# 여러 회차 묶어서
.venv\Scripts\skpipe evaluate --pair out\ep01.json ..\samples\달빛하숙집\ep01.labels.csv --pair out\ep02.json ..\samples\달빛하숙집\ep02.labels.csv
```

임계값 0.20~0.70 구간에서 정밀도·재현율·F1 표와, ok/ng 컷의 유사도 분포를 보여 준다. 결과 JSON에 얼굴마다 모든 캐릭터와의 유사도가 남아 있어서 **영상을 다시 분석하지 않고** 임계값만 바꿔 평가할 수 있다.

## 판정 규칙

| 조건 | 결과 | 기본값 |
| --- | --- | --- |
| 최고 유사도 < `unknown_below` | 바이블에 없는 인물 (엑스트라) — 이슈 아님 | 0.25 |
| 최고 유사도 < `issue_below` | `low_similarity` | 0.45 |
| 1·2위 캐릭터 차이 < `ambiguous_margin` | `ambiguous` (닮은 인물 중 누군지 불확실) | 0.05 |

- 컷 하나에 프레임 3장을 보고, 캐릭터마다 **가장 잘 나온 프레임**의 점수로 판정한다 (눈 감음·옆모습 한 장 때문에 오탐이 나지 않게).
- 기본값은 임시값이다. 2주차 목표가 샘플 영상 라벨로 이 값을 정하는 것.

## 테스트

```powershell
.venv\Scripts\python -m pytest
```

얼굴 모델 없이 돌아간다. 단색 구간으로 만든 합성 영상으로 컷 분할을 확인하고, 색을 임베딩으로 쓰는 가짜 분석기로 전체 흐름을 확인한다.

## 알려진 한계

- Windows에서 OpenCV가 한글 경로의 **영상**을 못 열 수 있다 (이미지는 처리함). 문제가 되면 영상 파일 경로를 영문으로.
- 얼굴이 40px보다 작으면 건너뛴다 (`min_face_px`). 원경 컷은 판정 불가로 남는다.
- 같은 컷에 같은 캐릭터로 매칭된 얼굴이 둘이면 (예: 쌍둥이) 하나만 보고한다.
