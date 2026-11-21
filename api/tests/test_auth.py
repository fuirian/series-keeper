"""토큰 검증: 올바른 토큰만 통과하고, 나머지는 모두 401."""

from conftest import OTHER_KEY, auth_header, make_token

from skapi.db import user_connection


class _EmptyConn:
    async def fetch(self, *args):
        return []


def _no_db(app):
    async def fake():
        yield _EmptyConn()

    app.dependency_overrides[user_connection] = fake


def test_health_needs_no_login(client):
    res = client.get("/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_missing_token_is_401(app, client):
    _no_db(app)
    res = client.get("/v1/series")
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == "Bearer"


def test_valid_token_passes(app, client):
    _no_db(app)
    res = client.get("/v1/series", headers=auth_header(make_token()))
    assert res.status_code == 200
    assert res.json() == {"items": []}


def test_forged_signature_is_401(app, client):
    _no_db(app)
    res = client.get("/v1/series", headers=auth_header(make_token(key=OTHER_KEY)))
    assert res.status_code == 401


def test_expired_token_is_401(app, client):
    _no_db(app)
    res = client.get("/v1/series", headers=auth_header(make_token(expires_in=-10)))
    assert res.status_code == 401
    assert "만료" in res.json()["detail"]


def test_anon_token_is_401(app, client):
    # 로그인 안 한 사용자의 anon 토큰은 aud가 "anon"
    _no_db(app)
    res = client.get("/v1/series", headers=auth_header(make_token(aud="anon")))
    assert res.status_code == 401


def test_other_project_token_is_401(app, client):
    _no_db(app)
    res = client.get("/v1/series", headers=auth_header(make_token(iss="https://other.supabase.co/auth/v1")))
    assert res.status_code == 401


def test_garbage_token_is_401(app, client):
    _no_db(app)
    res = client.get("/v1/series", headers=auth_header("not-a-jwt"))
    assert res.status_code == 401
