# supabase — DB 스키마

`migrations/`의 SQL 파일이 DB 구조의 기준이다. 파일 이름 앞의 숫자(날짜시각) 순서대로 적용한다.

## 적용 방법 (지금은 수동)

1. Supabase 대시보드 → **SQL Editor** → **New query**
2. 아직 적용하지 않은 마이그레이션 파일 내용을 붙여 넣고 **Run**
3. **Table Editor**에서 테이블이 생겼는지 확인

나중에 Supabase CLI를 쓰게 되면 `supabase db push`로 같은 파일을 적용할 수 있다.

## 적용 기록

| 파일 | 내용 |
| --- | --- |
| `20261120000000_create_series.sql` | `series` 테이블 + 본인 것만 접근하는 RLS 정책 |
| `20261120000100_grant_series.sql` | 로그인 사용자(`authenticated`)에게 `series` 권한 부여 |
| `20261120000200_create_characters.sql` | `character`·`reference_image` 테이블, 비공개 이미지 버킷 `references`와 본인 폴더만 접근하는 정책 |
| `20261120000300_create_locations.sql` | `location`·`location_image` 테이블 (이미지는 `references` 버킷 공유) |
| `20261120000400_create_episodes.sql` | `episode` 테이블(분석 상태 포함), 비공개 영상 버킷 `episodes` (파일당 50MB) |
| `20261120000500_create_analysis.sql` | 분석 결과 `shot`·`issue` 테이블, 회차 분석 정보 컬럼, 워커용 `claim_next_episode()` 함수 |
| `20261120000600_issue_review.sql` | 이슈 `resolved`(예/아니오) → `review`(미처리·해결됨·오탐) |
| `20261120000700_episode_uploaded_status.sql` | 회차 `uploaded`(검사 전) 상태 — 업로드 후 '검사하기'를 눌러야 검사 대기 |
| `20261122000800_regen_kit.sql` | 재생성 키트: 캐릭터·장소 `prompt`, 시리즈 `style_prompt` 칸, 키트 사용 기록 `regen_kit_event` |

## 원칙

- 모든 테이블에 **RLS를 켠다.** 웹은 Publishable key로 접속하므로, RLS가 없으면 누구나 모든 행을 읽을 수 있다.
- 테이블 권한은 `authenticated`에만 명시적으로 준다 (`anon`은 주지 않음). 어떤 행에 접근할지는 RLS가 정한다.
- 같은 파일을 두 번 실행하면 `already exists` 오류가 난다. 이미 적용된 파일은 다시 실행하지 않는다.
- `owner_id`는 `auth.uid()` 기본값으로 채우고, 정책으로 본인 확인을 한다. 클라이언트가 보낸 owner_id를 믿지 않는다.
