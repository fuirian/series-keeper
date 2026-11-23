"""시리즈 대표 이미지.

파일은 브라우저가 Storage(references/{user}/{series}/cover/...)에 바로 올리고,
여기서는 "다 올렸다"를 받아 경로를 확인한 뒤 DB에 기록한다 (예전 파일은 지움).
"""

import re
from typing import Annotated
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..auth import CurrentUserDep, get_current_user
from ..config import Settings, get_settings
from ..db import UserConn
from ..storage import remove_paths, sign_urls

router = APIRouter(tags=["series"], dependencies=[Depends(get_current_user)])

BUCKET = "references"
NEEDS_MIGRATION = "DB에 대표 이미지 칸이 없습니다. supabase/migrations/20261122000900_series_cover.sql을 적용해 주세요."
# cover-<uuid>.<확장자> 만 허용 (다른 폴더·다른 파일을 가리키지 못하게)
FILENAME_RE = re.compile(r"^cover-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$")


class CoverIn(BaseModel):
    path: str = Field(min_length=1, max_length=300)


class CoverOut(BaseModel):
    cover_path: str
    cover_url: str | None


def cover_prefix(user_id: str, series_id: UUID) -> str:
    return f"{user_id}/{series_id}/cover/"


def is_valid_cover_path(path: str, user_id: str, series_id: UUID) -> bool:
    prefix = cover_prefix(user_id, series_id)
    return path.startswith(prefix) and bool(FILENAME_RE.match(path[len(prefix) :]))


@router.put("/series/{series_id}/cover")
async def set_cover(
    series_id: UUID,
    body: CoverIn,
    user: CurrentUserDep,
    conn: UserConn,
    settings: Annotated[Settings, Depends(get_settings)],
) -> CoverOut:
    """올린 이미지를 대표 이미지로. 남의 시리즈는 RLS 때문에 404."""
    if not is_valid_cover_path(body.path, user.id, series_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "잘못된 파일 경로입니다.")

    try:
        row = await conn.fetchrow("select cover_path from public.series where id = $1", series_id)
    except asyncpg.UndefinedColumnError as e:
        await remove_paths(settings, user.token, BUCKET, [body.path])
        raise HTTPException(status.HTTP_409_CONFLICT, NEEDS_MIGRATION) from e
    if row is None:
        await remove_paths(settings, user.token, BUCKET, [body.path])  # 방금 올린 파일이 고아가 되지 않게
        raise HTTPException(status.HTTP_404_NOT_FOUND, "시리즈를 찾을 수 없습니다.")

    await conn.execute("update public.series set cover_path = $2 where id = $1", series_id, body.path)

    old = row["cover_path"]
    if old and old != body.path:
        await remove_paths(settings, user.token, BUCKET, [old])

    urls = await sign_urls(settings, user.token, BUCKET, [body.path])
    return CoverOut(cover_path=body.path, cover_url=urls.get(body.path))


@router.delete("/series/{series_id}/cover", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cover(
    series_id: UUID,
    user: CurrentUserDep,
    conn: UserConn,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    try:
        row = await conn.fetchrow("select cover_path from public.series where id = $1", series_id)
    except asyncpg.UndefinedColumnError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, NEEDS_MIGRATION) from e
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "시리즈를 찾을 수 없습니다.")
    if row["cover_path"] is None:
        return
    await conn.execute("update public.series set cover_path = null where id = $1", series_id)
    await remove_paths(settings, user.token, BUCKET, [row["cover_path"]])
