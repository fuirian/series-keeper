"""재생성 키트 API (DB·Storage는 가짜)."""

import json
from uuid import uuid4

import asyncpg
import pytest
from conftest import auth_header, make_token

import skapi.routers.regen_kit as regen_kit_router
from skapi.db import user_connection

ISSUE_ID = uuid4()
SERIES_ID = uuid4()
YUNA, MINHO, ROOFTOP = uuid4(), uuid4(), uuid4()


def issue_row(**over):
    row = {
        "id": ISSUE_ID,
        "type": "low_similarity",
        "time_ms": 13000,
        "frame_path": "u/s/e/frame.jpg",
        "character_id": YUNA,
        "runner_up_id": None,
        "start_ms": 12000,
        "end_ms": 15000,
        "episode_number": 1,
        "series_id": SERIES_ID,
        "style": "anime",
        "style_note": None,
        "style_prompt": None,
    }
    row.update(over)
    return row


CHARS = [
    {"id": YUNA, "name": "유나", "description": None, "prompt": "black hair", "refs": json.dumps({"front": "y/f.jpg"})},
    {"id": MINHO, "name": "민호", "description": None, "prompt": None, "refs": json.dumps({"front": "m/f.jpg"})},
]
LOCS = [
    {"id": ROOFTOP, "name": "옥탑방", "description": "창가", "prompt": None, "refs": json.dumps({"wide": "l/w.jpg"})}
]


class FakeConn:
    def __init__(self, issue=None, chars=CHARS, locs=LOCS, issue_error=None):
        self.issue = issue
        self.chars = chars
        self.locs = locs
        self.issue_error = issue_error
        self.executed: list[tuple] = []

    async def fetchrow(self, sql, *args):
        if self.issue_error:
            raise self.issue_error
        return self.issue

    async def fetch(self, sql, *args):
        return self.chars if "from public.character" in sql else self.locs

    async def fetchval(self, sql, *args):
        return 1 if self.issue else None

    async def execute(self, sql, *args):
        self.executed.append((sql, *args))


@pytest.fixture
def use_conn(app, monkeypatch):
    signed: list = []

    async def fake_sign(settings, token, bucket, paths):
        signed.append((token, bucket, paths))
        return {p: f"https://signed/{p}" for p in paths}

    monkeypatch.setattr(regen_kit_router, "sign_urls", fake_sign)

    def _use(conn):
        async def fake():
            yield conn

        app.dependency_overrides[user_connection] = fake
        return signed

    return _use


def url(**params):
    q = "&".join(f"{k}={v}" for k, v in params.items())
    return f"/v1/issues/{ISSUE_ID}/regen-kit" + (f"?{q}" if q else "")


def test_kit_for_issue(client, use_conn):
    token = make_token()
    signed = use_conn(FakeConn(issue=issue_row()))

    res = client.get(url(), headers=auth_header(token))

    assert res.status_code == 200
    body = res.json()
    assert body["character_id"] == str(YUNA)
    assert "Character: 유나, black hair" in body["prompt"]
    assert body["references"] == [
        {"order": 1, "label": "유나 정면", "kind": "character", "url": "https://signed/y/f.jpg"}
    ]
    assert body["shot"]["frame_url"] == "https://signed/u/s/e/frame.jpg"
    assert body["tool"]["id"] == "generic"
    assert [c["name"] for c in body["characters"]] == ["유나", "민호"]
    assert body["locations"] == [{"id": str(ROOFTOP), "name": "옥탑방"}]
    # 서명은 요청한 사용자 토큰으로
    assert signed[0][0] == token and signed[0][1] == "references"


def test_user_can_pick_character_and_location(client, use_conn):
    use_conn(FakeConn(issue=issue_row()))
    res = client.get(url(character_id=MINHO, location_id=ROOFTOP, scene="걷는다"), headers=auth_header(make_token()))

    body = res.json()
    assert body["character_id"] == str(MINHO)
    assert body["location_id"] == str(ROOFTOP)
    assert body["prompt"].startswith("Scene: 걷는다")
    assert [r["label"] for r in body["references"]] == ["민호 정면", "옥탑방 와이드"]
    assert "character_prompt" in body["missing"]


def test_ambiguous_issue_mentions_other_character(client, use_conn):
    use_conn(FakeConn(issue=issue_row(type="ambiguous", runner_up_id=MINHO)))
    body = client.get(url(), headers=auth_header(make_token())).json()
    assert "not 민호" in body["prompt"]

    # 사용자가 '원래 민호였다'고 고르면 반대로
    body = client.get(url(character_id=MINHO), headers=auth_header(make_token())).json()
    assert "clearly be 민호, not 유나" in body["prompt"]


def test_other_users_issue_is_404(client, use_conn):
    use_conn(FakeConn(issue=None))  # RLS가 남의 이슈를 숨기면 행이 없다
    res = client.get(url(), headers=auth_header(make_token()))
    assert res.status_code == 404


def test_character_from_other_series_is_404(client, use_conn):
    use_conn(FakeConn(issue=issue_row()))
    res = client.get(url(character_id=uuid4()), headers=auth_header(make_token()))
    assert res.status_code == 404


def test_unknown_tool_is_422(client, use_conn):
    use_conn(FakeConn(issue=issue_row()))
    res = client.get(url(tool="nope"), headers=auth_header(make_token()))
    assert res.status_code == 422


def test_missing_migration_is_409(client, use_conn):
    use_conn(FakeConn(issue_error=asyncpg.UndefinedColumnError("column ser.style_prompt does not exist")))
    res = client.get(url(), headers=auth_header(make_token()))
    assert res.status_code == 409
    assert "20261122000800" in res.json()["detail"]


def test_record_event(client, use_conn):
    conn = FakeConn(issue=issue_row())
    use_conn(conn)
    res = client.post(
        f"/v1/issues/{ISSUE_ID}/regen-kit/events",
        json={"tool": "generic", "action": "copy_prompt"},
        headers=auth_header(make_token()),
    )
    assert res.status_code == 204
    (sql, issue_id, tool, action) = conn.executed[0]
    assert "insert into public.regen_kit_event" in sql
    assert (issue_id, tool, action) == (ISSUE_ID, "generic", "copy_prompt")


def test_event_rejects_bad_action_and_needs_login(client, use_conn):
    use_conn(FakeConn(issue=issue_row()))
    bad = client.post(
        f"/v1/issues/{ISSUE_ID}/regen-kit/events",
        json={"tool": "generic", "action": "delete"},
        headers=auth_header(make_token()),
    )
    assert bad.status_code == 422
    anon = client.post(f"/v1/issues/{ISSUE_ID}/regen-kit/events", json={"tool": "generic", "action": "open"})
    assert anon.status_code == 401
