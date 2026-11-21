"""DB 접속: Postgres에 직접 붙되, 요청한 사용자 권한으로만 쿼리한다 (RLS 그대로 적용).

요청마다 트랜잭션을 열고
    set local role authenticated
    set_config('request.jwt.claims', <검증한 토큰 내용>, true)
를 한 뒤 쿼리한다. 그러면 DB의 `auth.uid()`가 이 사용자 id가 되어,
지금 웹에서 쓰는 RLS 정책(본인 것만)이 백엔드에도 똑같이 걸린다.
→ 백엔드 코드에서 where owner_id = ... 를 빠뜨려도 남의 데이터는 DB가 막는다.

`local` / 세 번째 인자 true = 이 트랜잭션 안에서만. 끝나면 원래대로 돌아가므로
풀(pool)에서 연결을 다음 사람이 써도 앞 사람 권한이 남지 않는다.
"""

import json
from collections.abc import AsyncIterator
from typing import Annotated

import asyncpg
from fastapi import Depends, Request

from .auth import CurrentUserDep


async def create_pool(database_url: str) -> asyncpg.Pool:
    # statement_cache_size=0: Supabase 풀러(transaction 모드)는 연결을 요청마다 바꿔 끼워서
    # 미리 준비해 둔 쿼리(prepared statement)를 쓸 수 없다.
    return await asyncpg.create_pool(database_url, min_size=1, max_size=10, statement_cache_size=0)


def get_pool(request: Request) -> asyncpg.Pool:
    """앱 시작 때 만든 풀 (main.py의 lifespan)."""
    return request.app.state.pool


async def user_connection(
    user: CurrentUserDep,
    pool: Annotated[asyncpg.Pool, Depends(get_pool)],
) -> AsyncIterator[asyncpg.Connection]:
    """로그인한 사용자 권한(RLS 적용)으로 쿼리하는 연결. 요청이 끝나면 커밋하고 돌려준다."""
    async with pool.acquire() as conn, conn.transaction():
        await conn.execute("set local role authenticated")
        await conn.execute("select set_config('request.jwt.claims', $1, true)", json.dumps(user.claims))
        yield conn


UserConn = Annotated[asyncpg.Connection, Depends(user_connection)]
