from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import CurrentUserDep, get_current_user
from ..db import UserConn

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


@router.get("/me")
async def get_me(user: CurrentUserDep, conn: UserConn) -> Me:
    """내 정보와 사용량 (마이페이지용)."""
    row = await conn.fetchrow(USAGE_SQL)
    return Me(id=user.id, email=user.email, usage=Usage(**dict(row)))
