from datetime import datetime
from typing import Annotated
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import CurrentUserDep, get_current_user
from ..db import UserConn, get_pool

router = APIRouter(tags=["me"], dependencies=[Depends(get_current_user)])


class Usage(BaseModel):
    series: int
    characters: int
    episodes: int
    checked_episodes: int
    open_issues: int


class Me(BaseModel):
    id: str
    email: str | None
    created_at: datetime | None
    email_confirmed_at: datetime | None
    usage: Usage


# RLS가 본인 행만 보여 주므로 where owner_id 없이 세어도 내 것만 나온다
USAGE_SQL = """
select
  (select count(*) from public.series)                          as series,
  (select count(*) from public.character)                       as characters,
  (select count(*) from public.episode)                         as episodes,
  (select count(*) from public.episode where status = 'done')   as checked_episodes,
  (select count(*) from public.issue where review = 'open')     as open_issues
"""

# 가입일·인증일은 auth.users에 있는데, 로그인 사용자 권한(authenticated)으로는 못 읽는다.
# 그래서 이 한 줄만 서버 권한으로 읽되, 검증한 토큰의 id로 **본인 행 하나만** 조회한다.
ACCOUNT_SQL = "select created_at, email_confirmed_at from auth.users where id = $1"


@router.get("/me")
async def get_me(
    user: CurrentUserDep,
    conn: UserConn,
    pool: Annotated[asyncpg.Pool, Depends(get_pool)],
) -> Me:
    """내 정보와 사용량 (마이페이지용)."""
    usage = await conn.fetchrow(USAGE_SQL)
    async with pool.acquire() as admin:
        account = await admin.fetchrow(ACCOUNT_SQL, UUID(user.id))
    return Me(
        id=user.id,
        email=user.email,
        created_at=account["created_at"] if account else None,
        email_confirmed_at=account["email_confirmed_at"] if account else None,
        usage=Usage(**dict(usage)),
    )
