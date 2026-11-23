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


class StatsConn:
    """/v1/me/stats가 보내는 세 쿼리에 각각 다른 결과를 돌려준다."""

    def __init__(self, storage, daily, issues):
        self.storage, self.daily, self.issues = storage, daily, issues
        self.args: list[tuple] = []

    async def fetchrow(self, sql, *args):
        return {"storage_bytes": self.storage}

    async def fetch(self, sql, *args):
        self.args.append(args)
        return self.daily if "analysis_finished_at" in sql else self.issues


def test_me_stats_fills_days_and_counts_issues(app, client):
    from datetime import timedelta

    from skapi.routers.me import STATS_DAYS, STATS_TZ

    today = datetime.now(STATS_TZ).date()
    conn = StatsConn(
        storage=4_200_000,
        daily=[{"day": today, "n": 2}, {"day": today - timedelta(days=3), "n": 1}],
        issues=[{"review": "open", "n": 5}, {"review": "resolved", "n": 2}],
    )
    _use(app, conn)

    res = client.get("/v1/me/stats", headers=auth_header(make_token()))

    assert res.status_code == 200
    body = res.json()
    assert body["storage_bytes"] == 4_200_000
    days = body["daily_checks"]
    # 검사가 없던 날도 0으로 채워 오늘까지 30일
    assert len(days) == STATS_DAYS
    assert days[-1] == {"date": today.isoformat(), "count": 2}
    assert days[-4]["count"] == 1
    assert sum(d["count"] for d in days) == 3
    assert body["issues"] == {"open": 5, "resolved": 2, "false_positive": 0}
    # 기간 시작은 한국 시간 29일 전 자정
    (since,) = conn.args[0]
    assert since.date() == today - timedelta(days=STATS_DAYS - 1)


def test_me_stats_requires_login(client):
    assert client.get("/v1/me/stats").status_code == 401
