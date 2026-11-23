from datetime import date, datetime, time, timedelta, timezone
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


STATS_DAYS = 30
# 한국은 일광절약시간이 없어 고정 +9시간으로 충분하다 (Windows에서 tzdata 없이도 동작)
STATS_TZ = timezone(timedelta(hours=9), "Asia/Seoul")


class DailyCount(BaseModel):
    date: date
    count: int


class IssueCounts(BaseModel):
    open: int = 0
    resolved: int = 0
    false_positive: int = 0


class UsageStats(BaseModel):
    storage_bytes: int
    daily_checks: list[DailyCount]
    issues: IssueCounts


STORAGE_SQL = "select coalesce(sum(size_bytes), 0)::bigint as storage_bytes from public.episode"

# 검사가 끝난 회차를 한국 날짜별로 센다. 다시 검사하면 마지막 검사 날짜로 옮겨 간다.
DAILY_CHECKS_SQL = """
select (analysis_finished_at at time zone 'Asia/Seoul')::date as day, count(*) as n
from public.episode
where status = 'done' and analysis_finished_at >= $1
group by 1
"""

ISSUE_COUNTS_SQL = "select review, count(*) as n from public.issue group by review"


def fill_days(rows: list[dict], today: date, days: int = STATS_DAYS) -> list[DailyCount]:
    """검사가 없던 날도 0으로 채워 오늘까지 days일을 빠짐없이 돌려준다."""
    by_day = {r["day"]: r["n"] for r in rows}
    start = today - timedelta(days=days - 1)
    return [DailyCount(date=d, count=by_day.get(d, 0)) for d in (start + timedelta(days=i) for i in range(days))]


@router.get("/me/stats")
async def get_my_stats(conn: UserConn) -> UsageStats:
    """사용량 그래프용: 영상 저장 용량, 최근 30일 일별 검사 수, 이슈 처리 현황."""
    today = datetime.now(STATS_TZ).date()
    since = datetime.combine(today - timedelta(days=STATS_DAYS - 1), time.min, tzinfo=STATS_TZ)
    storage = await conn.fetchrow(STORAGE_SQL)
    daily = await conn.fetch(DAILY_CHECKS_SQL, since)
    issues = await conn.fetch(ISSUE_COUNTS_SQL)
    return UsageStats(
        storage_bytes=storage["storage_bytes"] if storage else 0,
        daily_checks=fill_days([dict(r) for r in daily], today),
        issues=IssueCounts(**{r["review"]: r["n"] for r in issues if r["review"] in IssueCounts.model_fields}),
    )


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
