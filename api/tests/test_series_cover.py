"""시리즈 대표 이미지 API (DB·Storage는 가짜)."""

import uuid

import asyncpg
import pytest
from conftest import auth_header, make_token

import skapi.routers.series_cover as cover_router
from skapi.db import user_connection

SERIES_ID = uuid.uuid4()
USER_ID = str(uuid.uuid4())


def good_path(user=USER_ID, series=SERIES_ID, ext="jpg"):
    return f"{user}/{series}/cover/cover-{uuid.uuid4()}.{ext}"


class FakeConn:
    def __init__(self, row=None, error=None):
        self.row = row
        self.error = error
        self.executed: list[tuple] = []

    async def fetchrow(self, sql, *args):
        if self.error:
            raise self.error
        return self.row

    async def execute(self, sql, *args):
        self.executed.append((sql, *args))


@pytest.fixture
def storage(app, monkeypatch):
    calls = {"removed": [], "signed": []}

    async def fake_remove(settings, token, bucket, paths):
        calls["removed"].extend(paths)
        return True

    async def fake_sign(settings, token, bucket, paths):
        calls["signed"].extend(paths)
        return {p: f"https://signed/{p}" for p in paths}

    monkeypatch.setattr(cover_router, "remove_paths", fake_remove)
    monkeypatch.setattr(cover_router, "sign_urls", fake_sign)

    def use(conn):
        async def fake():
            yield conn

        app.dependency_overrides[user_connection] = fake

    calls["use"] = use
    return calls


def put(client, path, token=None):
    return client.put(
        f"/v1/series/{SERIES_ID}/cover",
        json={"path": path},
        headers=auth_header(token or make_token(USER_ID)),
    )


def test_set_cover_replaces_old_file(client, storage):
    conn = FakeConn(row={"cover_path": "old/cover.jpg"})
    storage["use"](conn)
    path = good_path()

    res = put(client, path)

    assert res.status_code == 200
    assert res.json() == {"cover_path": path, "cover_url": f"https://signed/{path}"}
    (sql, sid, saved) = conn.executed[0]
    assert "update public.series set cover_path" in sql and (sid, saved) == (SERIES_ID, path)
    assert storage["removed"] == ["old/cover.jpg"]


@pytest.mark.parametrize(
    "path",
    [
        good_path(user=str(uuid.uuid4())),  # 남의 폴더
        good_path(series=uuid.uuid4()),  # 다른 시리즈
        f"{USER_ID}/{SERIES_ID}/cover/../x/cover-{uuid.uuid4()}.jpg",
        f"{USER_ID}/{SERIES_ID}/cover/evil.jpg",
        f"{USER_ID}/{SERIES_ID}/cover/cover-{uuid.uuid4()}.svg",
        f"{USER_ID}/{SERIES_ID}/character/cover-{uuid.uuid4()}.jpg",
    ],
)
def test_rejects_bad_paths(client, storage, path):
    conn = FakeConn(row={"cover_path": None})
    storage["use"](conn)
    assert put(client, path).status_code == 422
    assert conn.executed == []


def test_other_users_series_is_404_and_cleans_upload(client, storage):
    storage["use"](FakeConn(row=None))  # RLS가 숨기면 행이 없다
    path = good_path()
    res = put(client, path)
    assert res.status_code == 404
    assert storage["removed"] == [path]


def test_missing_migration_is_409(client, storage):
    storage["use"](FakeConn(error=asyncpg.UndefinedColumnError("cover_path")))
    res = put(client, good_path())
    assert res.status_code == 409
    assert "20261122000900" in res.json()["detail"]


def test_delete_cover(client, storage):
    conn = FakeConn(row={"cover_path": "a/b/cover/c.jpg"})
    storage["use"](conn)
    res = client.delete(f"/v1/series/{SERIES_ID}/cover", headers=auth_header(make_token(USER_ID)))
    assert res.status_code == 204
    assert "cover_path = null" in conn.executed[0][0]
    assert storage["removed"] == ["a/b/cover/c.jpg"]


def test_needs_login(client, storage):
    storage["use"](FakeConn(row={"cover_path": None}))
    res = client.put(f"/v1/series/{SERIES_ID}/cover", json={"path": good_path()})
    assert res.status_code == 401
