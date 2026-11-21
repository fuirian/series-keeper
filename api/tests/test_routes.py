"""API 응답 모양 (DB는 가짜)."""

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

from conftest import auth_header, make_token

from skapi.db import get_pool, user_connection


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


class FakePool:
    def __init__(self, row):
        self.conn = FakeConn(row=row)

    @asynccontextmanager
    async def _acquire(self):
        yield self.conn

    def acquire(self):
        return self._acquire()


def test_me_returns_user_account_and_usage(app, client):
    uid = str(uuid4())
    usage = {"series": 2, "characters": 3, "episodes": 4, "checked_episodes": 1, "open_issues": 5}
    joined = datetime(2026, 11, 20, 1, 0, tzinfo=UTC)
    _use(app, FakeConn(row=usage))
    pool = FakePool(row={"created_at": joined, "email_confirmed_at": joined})
    app.dependency_overrides[get_pool] = lambda: pool

    res = client.get("/v1/me", headers=auth_header(make_token(uid, email="me@example.com")))

    assert res.status_code == 200
    body = res.json()
    assert body["id"] == uid
    assert body["email"] == "me@example.com"
    assert body["usage"] == usage
    assert body["created_at"].startswith("2026-11-20")
    # 서버 권한 조회는 auth.users에서 본인 행 하나만
    assert "where id = $1" in pool.conn.queries[0]


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
