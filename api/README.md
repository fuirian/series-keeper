# api — 백엔드 (FastAPI)

웹(Next.js)과 DB(Supabase Postgres) 사이에서 데이터 읽기·쓰기를 맡는다. 구조와 단계는 [`docs/backend-plan.md`](../docs/backend-plan.md).

```
웹 ──(Supabase 로그인 토큰)──▶ api /v1 ──(사용자 권한, RLS)──▶ Postgres
```

## 처음 실행

```powershell
cd api
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
copy .env.example .env   # 값 채우기 (아래)
.\.venv\Scripts\uvicorn.exe skapi.main:create_app --factory --reload
```

- <http://localhost:8000/v1/health> → `{"status":"ok"}`
- <http://localhost:8000/docs> → API 문서 (직접 눌러 볼 수 있음)

### `.env` 값

| 이름 | 어디서 |
| --- | --- |
| `SUPABASE_URL` | 웹과 같은 Project URL |
| `DATABASE_URL` | Supabase 대시보드 → 상단 **Connect** → **Transaction pooler** 주소. `[YOUR-PASSWORD]`를 DB 비밀번호로 |
| `CORS_ORIGINS` | 이 API를 부를 웹 주소 (기본 `http://localhost:3000`) |

`DATABASE_URL`에는 DB 비밀번호가 들어간다. **관리자 키처럼** 다루고 웹 `.env`나 코드에 넣지 않는다.

## 폴더

```
src/skapi/
  main.py      앱 조립: DB 풀, CORS, /v1 라우터
  config.py    설정 (환경 변수 → Settings)
  auth.py      로그인 토큰(JWT) 검증 → CurrentUser
  db.py        사용자 권한으로 DB 연결 (RLS 적용)
  routers/     API (health, me, series)
tests/         pytest (DB·네트워크 없이 돌아감)
```

## 처음 보는 개념 정리

- **라우터 (`APIRouter`)**: 주소별 함수 묶음. `@router.get("/series")`가 붙은 함수가 `GET /v1/series`를 처리한다.
- **의존성 (`Depends`)**: 함수 인자에 "이건 이렇게 구해 와"라고 적어 두면 FastAPI가 요청마다 채워 준다.
  예: `conn: UserConn` → 토큰 검증 → 사용자 권한으로 DB 연결까지 해서 넘겨 준다. 테스트에서는 `app.dependency_overrides`로 가짜로 바꾼다.
- **Pydantic 모델 (`BaseModel`)**: 응답 모양을 클래스로 적어 두면 타입 검사·JSON 변환·API 문서가 자동으로 된다.
- **async / await**: DB 응답을 기다리는 동안 다른 요청을 처리한다. DB·네트워크를 부르는 곳에만 `await`.

## 권한 (가장 중요)

1. `auth.py`가 토큰 서명을 Supabase 공개 키(ES256)로 확인한다. 위조·만료·로그인 안 한 토큰(anon)·다른 프로젝트 토큰은 401.
2. `db.py`가 쿼리 전에 `set local role authenticated` + 토큰 내용을 DB에 넘긴다.
   → DB의 `auth.uid()`가 요청한 사용자가 되어 **기존 RLS 정책이 그대로** 걸린다. 백엔드 코드에 실수가 있어도 남의 데이터는 DB가 막는다.

## 테스트

```powershell
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m pytest
```

`test_rls_integration.py`(다른 사람 토큰으로는 내 시리즈가 안 보이는지)는 **지워져도 되는 로컬 DB**에서만 돈다.
로컬 Supabase(`supabase start`, Docker)를 켠 뒤 `SKAPI_TEST_DATABASE_URL`을 주고 실행한다. 값이 없으면 건너뛴다.
