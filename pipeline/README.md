# skpipe — 분석 파이프라인과 분석 워커

회차 영상을 컷으로 나누고, 컷마다 등장인물 얼굴을 시리즈 바이블 레퍼런스와 비교해 **일관성이 깨진 컷**을 찾는다.
같은 코드를 분석 워커(`skpipe worker`)가 불러 써서, 웹에서 올린 회차를 실제로 분석한다.

```
영상 ─▶ 컷 분할 (PySceneDetect) ─▶ 컷당 대표 프레임 3장 ─▶ 얼굴 검출·임베딩 ─▶ 바이블과 코사인 유사도 ─▶ 이슈
```

## 분석 워커

웹과 따로 도는 프로세스. Supabase의 **분석 대기** 회차를 하나씩 가져와 분석하고 결과를 저장한다.

```
웹: 회차 업로드 (status = pending)
          │
          ▼
워커: claim_next_episode()  ── pending 하나를 processing으로 바꾸며 가져옴 (FOR UPDATE SKIP LOCKED)
      영상·캐릭터 레퍼런스 내려받기 → analyze_episode() → shot·issue 저장, 이슈 프레임 이미지 업로드
      status = done (또는 failed + 이유)
          │
          ▼
웹: 회차 탭에 컷 수·이슈 수 / 실패 이유 표시, "다시 분석" 버튼
```

- **큐는 Postgres로 충분하다.** 계획서에는 Redis + Celery로 적었지만, `episode.status`가 이미 큐 역할을 한다. 여러 워커가 동시에 떠도 `SKIP LOCKED` 덕분에 같은 회차를 집지 않는다. 30분 넘게 "분석 중"인 회차(워커가 죽은 경우)는 다시 가져간다.
- **Secret key(service_role)로 접속한다.** RLS를 건너뛰므로 `owner_id`를 직접 채운다. 이 키는 `pipeline/.env`에만 두고, 웹이나 git에 절대 넣지 않는다.
- **실패 이유는 사용자에게 보이는 문장으로 남긴다** (레퍼런스 사진 없음, 얼굴을 못 찾음, 영상을 못 엶). 예상하지 못한 오류는 내부 내용을 숨기고 일반 문구만 남긴다.

### 실행

1. Supabase SQL Editor에서 `supabase/migrations/20261120000500_create_analysis.sql` 실행 (한 번만)
2. Secret key 준비: 대시보드 → **Project Settings → API Keys → Secret keys**
3. 설정 파일
   ```powershell
   Copy-Item pipeline\.env.example pipeline\.env   # SUPABASE_URL, SUPABASE_SECRET_KEY 채우기
   ```
4. 설치와 실행
   ```powershell
   cd pipeline
   .venv\Scripts\python -m pip install -e ".[dev,worker]"
   .venv\Scripts\skpipe models    # 얼굴 모델 (처음 한 번)
   .venv\Scripts\skpipe worker    # 계속 대기하며 처리. 멈출 때 Ctrl+C
   ```
   대기 중인 회차만 처리하고 끝내려면 `skpipe worker --once`.

지금은 로컬 PC에서 돌린다. 배포는 이 프로세스를 서버(예: Fly.io, Railway, 작은 VM)에서 계속 돌리면 된다.

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
