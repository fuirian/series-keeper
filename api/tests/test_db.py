"""user_connection이 쿼리 전에 '사용자 권한'을 거는지 확인 (가짜 풀로, DB 없이)."""

import json
from contextlib import asynccontextmanager

import pytest

from skapi.auth import CurrentUser
from skapi.db import user_connection


class FakeConn:
    def __init__(self):
        self.executed: list[tuple] = []
        self.in_transaction = False

    @asynccontextmanager
    async def _tx(self):
        self.in_transaction = True
        try:
            yield
        finally:
            self.in_transaction = False

    def transaction(self):
        return self._tx()

    async def execute(self, sql, *args):
        assert self.in_transaction, "권한 설정은 트랜잭션 안에서만 (local) 해야 한다"
        self.executed.append((sql, *args))


class FakePool:
    def __init__(self):
        self.conn = FakeConn()

    @asynccontextmanager
    async def _acquire(self):
        yield self.conn

    def acquire(self):
        return self._acquire()


@pytest.mark.anyio
async def test_sets_role_and_claims_inside_transaction():
    user = CurrentUser(id="user-a", email="a@example.com", claims={"sub": "user-a", "role": "authenticated"})
    pool = FakePool()

    gen = user_connection(user, pool)
    conn = await gen.__anext__()
    assert conn is pool.conn
    assert conn.in_transaction

    (role_sql,), (claims_sql, claims_json) = conn.executed
    assert role_sql == "set local role authenticated"
    assert "request.jwt.claims" in claims_sql and claims_sql.rstrip(")").endswith("true")
    assert json.loads(claims_json)["sub"] == "user-a"

    with pytest.raises(StopAsyncIteration):
        await gen.__anext__()
    assert not conn.in_transaction  # 요청이 끝나면 트랜잭션도 끝 → 권한 설정이 사라진다


@pytest.fixture
def anyio_backend():
    return "asyncio"
