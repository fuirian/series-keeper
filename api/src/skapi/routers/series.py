from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import get_current_user
from ..db import UserConn

# 이 라우터의 모든 API는 로그인 필수 (DB 연결과 별개로 한 번 더 못 박아 둠).
# 같은 요청 안에서 get_current_user 결과는 재사용되므로 토큰 검증은 한 번만 한다.
router = APIRouter(tags=["series"], dependencies=[Depends(get_current_user)])


class Series(BaseModel):
    id: UUID
    title: str
    style: Literal["live_action", "anime", "other"]
    style_note: str | None
    created_at: datetime


class SeriesList(BaseModel):
    items: list[Series]


@router.get("/series")
async def list_series(conn: UserConn) -> SeriesList:
    """내 시리즈 목록 (최근 만든 순). 남의 시리즈는 RLS가 걸러 낸다."""
    rows = await conn.fetch(
        "select id, title, style, style_note, created_at from public.series order by created_at desc"
    )
    return SeriesList(items=[Series(**dict(r)) for r in rows])
