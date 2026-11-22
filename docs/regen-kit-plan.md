# 설계서 — 재생성 키트 (문제 컷 다시 만들기 1단계)

검사에서 찾은 **문제 컷**을 사용자가 **자기 생성 도구에서** 다시 만들 수 있도록,
바이블(캐릭터·장소·화풍) 기준의 **프롬프트 + 레퍼런스 이미지 묶음**을 만들어 준다.
우리 서비스는 영상을 생성하지 않는다 → **생성 비용 0원**, 어떤 도구(Kling·Veo·Runway·Hailuo·즉몽 등)를 쓰든 쓸 수 있다.

> 단계 계획: **1. 재생성 키트(이 문서)** → 2. 내 API 키 연결(선택) → 3. 서비스 안 생성(유료 크레딧).
> 2·3단계는 1단계 사용 기록과 테스터 인터뷰("어떤 도구로 만드나, API 키를 써 봤나")를 보고 정한다.
> README 확장 2 "프롬프트 내보내기"의 첫 구현이기도 하다.

## 1. 사용 흐름

```
리포트 → 이슈 선택 → [다시 만들기 키트] → 도구 고르기 → 프롬프트 복사 · 레퍼런스 받기
      → (내 도구에서 컷 재생성 → 편집) → 회차 다시 올리기 → 다시 검사
```

1. 리포트의 이슈 비교 화면(지금 있는 `ComparePanel`)에 **"다시 만들기 키트"** 버튼.
2. 키트 패널:
   - **문제 요약**: 컷 시간(00:12~00:15), 문제 프레임, 원래 누구여야 하는지, 유사도
   - **도구 선택** 탭: 범용 / Kling / Veo / Runway … (처음엔 범용 + 2개)
   - **프롬프트**: 복사 버튼. 사용자가 고쳐 쓸 수 있는 글상자
   - **피해야 할 것(네거티브)**: 도구가 지원하면 따로, 아니면 프롬프트 끝에 붙임
   - **레퍼런스 이미지**: 넣어야 할 사진을 순서대로(정면 → 전신 → 측면, 장소 와이드). 각각 받기 + 한 번에 받기
   - **팁 한 줄**: "이 도구는 참조 이미지를 3장까지 받습니다" 같은 도구별 안내
3. 복사·다운로드를 누르면 기록한다 (어떤 도구가 많이 쓰이는지 = 2·3단계 판단 근거).

## 2. 프롬프트를 무엇으로 만드나

### 지금 알 수 있는 것과 없는 것

| 정보 | 지금 | 비고 |
| --- | --- | --- |
| 어느 캐릭터여야 하는지 | 있음 (`issue.character_id`, 헷갈림이면 `runner_up_id`도) | |
| 캐릭터 외모 설명 | 자유 글 `character.description` (선택) | 비어 있는 경우가 많음 |
| 레퍼런스 사진 | 있음 (정면·측면·뒷모습·전신) | |
| 화풍 | `series.style` + `style_note` | |
| 컷 시간·문제 프레임 | 있음 | |
| **무엇이 달라졌는지** (머리색 등) | **없음** | 지금 검사는 "얼굴이 덜 닮음"만 안다. 확장 1(의상·배경 검사)·머리 색 비교가 생기면 추가 |
| 컷에서 무슨 장면인지 | 없음 | 사용자가 한 줄 입력 (1차), 나중에 이미지 설명 모델로 자동 |
| 어느 장소인지 | 없음 | 키트에서 사용자가 고름 (1차) |

→ 1차 키트는 **"바이블대로 다시 그려라"** 가 중심이다. "머리를 검은색으로 고쳐라" 같은 **차이 지적은 검사가 속성을 알게 된 뒤**에 넣는다.

### 바이블에 "생성용 프롬프트" 칸 추가

자유 설명만으로는 도구에 넣기 좋은 문장이 안 나온다. 크리에이터는 보통 캐릭터를 처음 만들 때 쓴 **고정 프롬프트**가 이미 있다. 그걸 저장할 칸을 둔다.

| 테이블 | 새 칸 | 예 |
| --- | --- | --- |
| `character` | `prompt` (≤1000자, 선택) | `young Korean woman, early 20s, shoulder-length straight black hair, round glasses, navy cardigan` |
| `location` | `prompt` (≤1000자, 선택) | `small rooftop room in Seoul, wooden desk by the window, warm evening light` |
| `series` | `style_prompt` (≤500자, 선택) | `2D anime style, soft cel shading, pastel palette` |

비어 있으면 `description`·`style_note`를 대신 쓰고, 키트에 **"캐릭터 탭에서 생성용 프롬프트를 채우면 결과가 좋아집니다"** 안내를 띄운다.

### 조립 방식: 템플릿 (AI 호출 없음)

```
[장면]       {사용자가 적은 컷 설명 | "same shot as the original, keep camera angle and action"}
[인물]       {캐릭터 이름}: {character.prompt | description}
[장소]       {location.prompt | description}            ← 골랐을 때만
[화풍]       {series.style_prompt | style 기본 문구}
[일관성]     match the reference images exactly: same face, hairstyle, hair color, outfit
[네거티브]   different face, different hairstyle, different hair color, extra people, …
```

- **도구 프로필**(`tool`)이 순서·길이·네거티브 처리·참조 이미지 개수·이미지 지칭 방식(예: "image 1")을 정한다. 도구별 규칙은 코드 한곳(`regen_kit/tools.py`)에 모아 쉽게 바꾸게 한다. 도구 사양은 자주 바뀌므로 문서·코드에 **확인한 날짜**를 남긴다.
- 헷갈림(`ambiguous`) 이슈는 **두 캐릭터를 구분하는 특징**을 강조하고, "원래 누구였는지"를 사용자가 고르게 한다 (기본값: 더 닮은 쪽).
- **언어**: 생성 도구는 영어 프롬프트가 잘 먹힌다. 템플릿 뼈대는 영어, 사용자가 쓴 칸은 그대로 넣는다. 한국어로 쓴 설명을 영어로 바꾸는 건 **1차에선 안 함** (정해야 할 것 참고).

## 3. 레퍼런스 고르기

| 순서 | 이미지 | 이유 |
| --- | --- | --- |
| 1 | 캐릭터 **정면** | 얼굴 고정의 기준 |
| 2 | 캐릭터 **전신** (있으면) | 의상·체형 |
| 3 | 캐릭터 **측면** (있으면) | 다른 각도 |
| 4 | 장소 **와이드** (장소를 골랐으면) | 배경 |
| (참고) | 문제 컷 **바로 앞 컷의 프레임** | 이미지→영상 도구의 시작 프레임·구도 참고 |

도구가 받는 개수만큼 앞에서부터 자른다. 뒷모습 사진은 넣지 않는다.

## 4. 백엔드 (FastAPI)

새 기능이므로 서버 액션이 아니라 **백엔드에** 만든다 (구조 원칙).

| 메서드·경로 | 하는 일 |
| --- | --- |
| `GET /v1/issues/{id}/regen-kit?tool=generic&location_id=&character_id=&scene=` | 키트 하나: `prompt`, `negative_prompt`, `references[]`(라벨·서명 URL·순서), `shot`(시간·프레임), `tips[]`, `missing[]`(비어서 대신 쓴 칸) |
| `POST /v1/issues/{id}/regen-kit/events` | `{tool, action: "copy_prompt" \| "download_refs"}` 기록 |
| `GET /v1/regen-kit/tools` | 도구 목록·참조 개수·안내 |

- 조회는 지금처럼 **사용자 권한(RLS)** 으로. 남의 이슈로 키트를 만들 수 없다.
- 레퍼런스 URL: 백엔드가 사용자 토큰으로 Storage 서명 URL(1시간)을 만든다. 관리자 키 불필요.
- 프롬프트 조립은 **순수 함수**(`build_prompt(bible, shot, tool) -> Kit`)로 분리해 DB 없이 테스트한다.

## 5. DB 변경 (마이그레이션 1개)

```sql
alter table public.character add column prompt text check (prompt is null or char_length(prompt) <= 1000);
alter table public.location  add column prompt text check (prompt is null or char_length(prompt) <= 1000);
alter table public.series    add column style_prompt text check (style_prompt is null or char_length(style_prompt) <= 500);

create table public.regen_kit_event (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  issue_id   uuid references public.issue (id) on delete set null,
  tool       text not null,
  action     text not null check (action in ('open', 'copy_prompt', 'download_refs')),
  created_at timestamptz not null default now()
);
-- RLS: 본인 것만 insert/select
```

컷 설명(`scene`)은 1차에선 저장하지 않고 요청에만 싣는다 (쓰임새를 보고 저장 여부 결정).

## 6. 화면 (웹)

- **리포트 → 이슈 비교 화면**: "다시 만들기 키트" 버튼 → 오른쪽 패널(좁은 화면은 아래로).
- **캐릭터·장소 편집 폼**: "생성용 프롬프트" 칸 추가 (예시 문구, "영어로 쓰면 대부분의 도구에서 결과가 좋습니다").
- **설정 탭**: 시리즈 "화풍 프롬프트" 칸.
- 복사·다운로드 후 안내: "새로 만든 컷으로 회차를 다시 올리고 검사해 보세요."

## 7. 일정·완료 기준

| 단계 | 내용 | 완료 기준 |
| --- | --- | --- |
| 1a | 마이그레이션, `build_prompt` + 테스트, `GET regen-kit`(범용 도구), 이슈 화면 패널, 복사·받기, 이벤트 기록 | 이슈 하나에서 프롬프트 복사 + 레퍼런스 받기가 되고 기록이 남는다 |
| 1b | 바이블 폼에 생성용 프롬프트 칸, 도구 프로필 2개(테스터가 가장 많이 쓰는 도구), 장소 고르기, 컷 설명 입력 | 테스터가 실제 도구에 붙여 넣어 컷을 다시 만들어 본다 |
| 1c | 회차 단위 "문제 컷 키트 모두 내보내기"(한 문서/zip) | 이슈가 여러 개인 회차를 한 번에 처리 |

## 8. 효과를 어떻게 볼까

- 키트를 연 이슈 중 복사·다운로드까지 간 비율, 도구별 비율 (`regen_kit_event`)
- 다시 올린 회차에서 같은 캐릭터 이슈가 줄었는지 (재검사 비교)
- 테스터 인터뷰 한 줄: "어떤 도구로 만드나요? API 키를 써 봤나요? 이 키트로 다시 만들어 봤나요?"

## 9. 정해야 할 것

- [ ] **한국어 설명 → 영어 프롬프트 변환**: 1차는 안 함(템플릿만). 테스터가 한국어로만 쓰면, 저렴한 LLM 호출로 번역·다듬기 추가 (회당 1원 미만 수준, 상용화 전 비용 확인)
- [ ] **먼저 지원할 도구 2개**: 테스터에게 물어보고 결정
- [ ] **"무엇이 달라졌는지" 지적**: 머리 색·의상 비교(확장 1)가 생기면 프롬프트에 "고칠 점"으로 추가
- [ ] 컷 설명을 저장할지 (같은 컷을 여러 번 다시 만들 때 편함)
