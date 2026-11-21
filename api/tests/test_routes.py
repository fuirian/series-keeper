"""API 응답 모양 (DB는 가짜)."""

from datetime import UTC, datetime
from uuid import uuid4

from conftest import auth_header, make_token

from skapi.db import user_connection


class FakeConn:
    def __init__(self, rows=None, row=None):
        self.rows = rows or []
        self.row = row
        self.queries: list[str] = []

    async def fetch(self, sql, *args):
        self.queries.append(sql)
        return self.rows

    async def fetchrow(self, sql, *args):
        self.queries.append(sql)
        return self.row


def _use(app, conn):
    async def fake():
        yield conn

    app.dependency_overrides[user_connection] = fake


def test_list_series(app, client):
    sid = uuid4()
    created = datetime(2026, 11, 21, 3, 0, tzinfo=UTC)
    row = {"id": sid, "title": "하숙집", "style": "anime", "style_note": None, "created_at": created}
    _use(app, FakeConn(rows=[row]))

    res = client.get("/v1/series", headers=auth_header(make_token()))

    assert res.status_code == 200
    (item,) = res.json()["items"]
    assert item["id"] == str(sid)
    assert item["title"] == "하숙집"
    assert item["style"] == "anime"


def test_me_returns_user_and_usage(app, client):
    usage = {"series": 2, "characters": 3, "episodes": 4, "checked_episodes": 1, "open_issues": 5}
    _use(app, FakeConn(row=usage))

    res = client.get("/v1/me", headers=auth_header(make_token("user-123", email="me@example.com")))

    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "user-123"
    assert body["email"] == "me@example.com"
    assert body["usage"] == usage


def test_cors_allows_web_origin(client):
    res = client.options(
        "/v1/series",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_blocks_other_origin(client):
    res = client.options(
        "/v1/series",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in res.headers
