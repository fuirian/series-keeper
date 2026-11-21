"""실제 Postgres에서 RLS 확인: 다른 사람 토큰으로는 내 시리즈가 안 보인다.

로컬 Supabase(`supabase start`, Docker)처럼 **지워져도 되는 DB**에서만 돌린다.
  SKAPI_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
값이 없으면 건너뛴다 (CI 기본). 테스트 데이터는 트랜잭션을 되돌려 남기지 않는다.
"""

import json
import os
import uuid

import pytest

DSN = os.environ.get("SKAPI_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="SKAPI_TEST_DATABASE_URL 없음 (로컬 Supabase에서만)")


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def _as_user(conn, uid: str) -> None:
    await conn.execute("set local role authenticated")
    await conn.execute(
        "select set_config('request.jwt.claims', $1, true)",
        json.dumps({"sub": uid, "role": "authenticated"}),
    )


@pytest.mark.anyio
async def test_other_users_series_are_invisible():
    import asyncpg

    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    conn = await asyncpg.connect(DSN, statement_cache_size=0)
    tx = conn.transaction()
    await tx.start()
    try:
        # 관리자(postgres)로 사용자 두 명과 A의 시리즈를 만든다
        for uid in (a, b):
            await conn.execute("insert into auth.users (id, email) values ($1, $2)", uuid.UUID(uid), f"{uid}@test")
        await conn.execute("insert into public.series (owner_id, title) values ($1, 'A의 시리즈')", uuid.UUID(a))

        await _as_user(conn, b)
        assert await conn.fetchval("select count(*) from public.series") == 0
        # 남의 시리즈는 고칠 수도 없다 (0행 변경)
        assert await conn.execute("update public.series set title = '해킹'") == "UPDATE 0"

        await _as_user(conn, a)
        assert await conn.fetchval("select count(*) from public.series") == 1
    finally:
        await tx.rollback()
        await conn.close()
