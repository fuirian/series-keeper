"""재생성 키트 API (docs/regen-kit-plan.md 1a)."""

import json
from typing import Annotated, Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..auth import CurrentUserDep, get_current_user
from ..config import Settings, get_settings
from ..db import UserConn
from ..regen_kit import TOOLS, BibleCharacter, BibleLocation, IssueContext, build_kit, get_tool
from ..storage import sign_urls

router = APIRouter(tags=["regen-kit"], dependencies=[Depends(get_current_user)])

REFERENCE_BUCKET = "references"
NEEDS_MIGRATION = "DB에 재생성 키트 칸이 없습니다. supabase/migrations/20261122000800_regen_kit.sql을 적용해 주세요."

ISSUE_SQL = """
select i.id, i.type, i.time_ms, i.frame_path, i.character_id, i.runner_up_id,
       s.start_ms, s.end_ms, e.number as episode_number, e.series_id,
       ser.style, ser.style_note, ser.style_prompt
from public.issue i
join public.shot s on s.id = i.shot_id
join public.episode e on e.id = i.episode_id
join public.series ser on ser.id = e.series_id
where i.id = $1
"""

CHARACTERS_SQL = """
select c.id, c.name, c.description, c.prompt,
       coalesce(json_object_agg(r.angle, r.storage_path) filter (where r.angle is not null), '{}') as refs
from public.character c
left join public.reference_image r on r.character_id = c.id
where c.series_id = $1
group by c.id
order by c.created_at
"""

LOCATIONS_SQL = """
select l.id, l.name, l.description, l.prompt,
       coalesce(json_object_agg(i.angle, i.storage_path) filter (where i.angle is not null), '{}') as refs
from public.location l
left join public.location_image i on i.location_id = l.id
where l.series_id = $1
group by l.id
order by l.created_at
"""


class Choice(BaseModel):
    id: str
    name: str


class ToolInfo(BaseModel):
    id: str
    label: str
    max_refs: int


class KitShot(BaseModel):
    episode_number: int
    start_ms: int
    end_ms: int
    time_ms: int
    frame_url: str | None


class KitReferenceOut(BaseModel):
    order: int
    label: str
    kind: str
    url: str | None


class RegenKit(BaseModel):
    issue_id: str
    tool: ToolInfo
    tools: list[ToolInfo]
    character_id: str
    characters: list[Choice]
    location_id: str | None
    locations: list[Choice]
    shot: KitShot
    prompt: str
    negative_prompt: str | None
    references: list[KitReferenceOut]
    tips: list[str]
    missing: list[str]


def _tool_info(tool_id: str) -> ToolInfo:
    t = TOOLS[tool_id]
    return ToolInfo(id=t.id, label=t.label, max_refs=t.max_refs)


def _character(row: asyncpg.Record) -> BibleCharacter:
    return BibleCharacter(
        id=str(row["id"]),
        name=row["name"],
        description=row["description"],
        prompt=row["prompt"],
        refs=json.loads(row["refs"]),
    )


def _location(row: asyncpg.Record) -> BibleLocation:
    return BibleLocation(
        id=str(row["id"]),
        name=row["name"],
        description=row["description"],
        prompt=row["prompt"],
        refs=json.loads(row["refs"]),
    )


@router.get("/issues/{issue_id}/regen-kit")
async def get_regen_kit(
    issue_id: UUID,
    user: CurrentUserDep,
    conn: UserConn,
    settings: Annotated[Settings, Depends(get_settings)],
    tool: str = "generic",
    character_id: UUID | None = None,
    location_id: UUID | None = None,
    scene: Annotated[str | None, Query(max_length=300)] = None,
) -> RegenKit:
    """문제 컷 하나를 다시 만들 프롬프트 + 레퍼런스. 남의 이슈는 RLS 때문에 404."""
    profile = get_tool(tool)
    if profile is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"모르는 도구입니다: {tool}")

    try:
        issue = await conn.fetchrow(ISSUE_SQL, issue_id)
    except (asyncpg.UndefinedColumnError, asyncpg.UndefinedTableError) as e:
        raise HTTPException(status.HTTP_409_CONFLICT, NEEDS_MIGRATION) from e
    if issue is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "이슈를 찾을 수 없습니다.")

    characters = {str(r["id"]): _character(r) for r in await conn.fetch(CHARACTERS_SQL, issue["series_id"])}
    locations = {str(r["id"]): _location(r) for r in await conn.fetch(LOCATIONS_SQL, issue["series_id"])}
    if not characters:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "이 시리즈에 캐릭터가 없습니다. 캐릭터 탭에서 먼저 등록해 주세요."
        )

    # 원래 누구여야 했는지: 사용자가 고른 값 → 검사가 고른 값 → 첫 캐릭터
    matched = str(issue["character_id"]) if issue["character_id"] else None
    runner_up = str(issue["runner_up_id"]) if issue["runner_up_id"] else None
    chosen = str(character_id) if character_id else matched
    if chosen not in characters:
        if character_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "이 시리즈의 캐릭터가 아닙니다.")
        chosen = next(iter(characters))

    # 헷갈림 이슈: 고른 인물이 아닌 쪽과 섞이지 않게
    confused_with = None
    if issue["type"] == "ambiguous":
        other = runner_up if chosen != runner_up else matched
        confused_with = characters.get(other) if other else None

    location = None
    if location_id:
        location = locations.get(str(location_id))
        if location is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "이 시리즈의 장소가 아닙니다.")

    ctx = IssueContext(
        issue_type=issue["type"],
        start_ms=issue["start_ms"],
        end_ms=issue["end_ms"],
        series_style=issue["style"],
        style_note=issue["style_note"],
        style_prompt=issue["style_prompt"],
    )
    kit = build_kit(ctx, characters[chosen], profile, confused_with=confused_with, location=location, scene=scene)

    urls = await sign_urls(
        settings,
        user.token,
        REFERENCE_BUCKET,
        [r.path for r in kit.references] + ([issue["frame_path"]] if issue["frame_path"] else []),
    )

    return RegenKit(
        issue_id=str(issue["id"]),
        tool=_tool_info(profile.id),
        tools=[_tool_info(t) for t in TOOLS],
        character_id=chosen,
        characters=[Choice(id=c.id, name=c.name) for c in characters.values()],
        location_id=location.id if location else None,
        locations=[Choice(id=loc.id, name=loc.name) for loc in locations.values()],
        shot=KitShot(
            episode_number=issue["episode_number"],
            start_ms=issue["start_ms"],
            end_ms=issue["end_ms"],
            time_ms=issue["time_ms"],
            frame_url=urls.get(issue["frame_path"]) if issue["frame_path"] else None,
        ),
        prompt=kit.prompt,
        negative_prompt=kit.negative_prompt,
        references=[
            KitReferenceOut(order=r.order, label=r.label, kind=r.kind, url=urls.get(r.path)) for r in kit.references
        ],
        tips=kit.tips,
        missing=kit.missing,
    )


class KitEvent(BaseModel):
    tool: str = Field(min_length=1, max_length=40)
    action: Literal["open", "copy_prompt", "download_refs"]


@router.post("/issues/{issue_id}/regen-kit/events", status_code=status.HTTP_204_NO_CONTENT)
async def record_regen_kit_event(issue_id: UUID, event: KitEvent, conn: UserConn) -> None:
    """키트 사용 기록 (어떤 도구로 복사·다운로드했는지). 본인 이슈에만."""
    if event.tool not in TOOLS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"모르는 도구입니다: {event.tool}")
    if await conn.fetchval("select 1 from public.issue where id = $1", issue_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "이슈를 찾을 수 없습니다.")
    try:
        await conn.execute(
            "insert into public.regen_kit_event (issue_id, tool, action) values ($1, $2, $3)",
            issue_id,
            event.tool,
            event.action,
        )
    except asyncpg.UndefinedTableError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, NEEDS_MIGRATION) from e
