"""테스트 공통: 실제 Supabase 없이 토큰을 직접 만들어 검증까지 돌려 본다.

- 테스트용 EC(P-256) 키를 만들어 ES256 토큰에 서명한다 (Supabase와 같은 방식).
- JWKS 클라이언트는 그 공개 키를 돌려주는 가짜로 바꾼다 (네트워크 없음).
- DB 연결(user_connection)은 테스트마다 가짜로 바꾼다.
"""

import time
import uuid
from dataclasses import dataclass
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from skapi.auth import get_jwks_client
from skapi.config import Settings, get_settings
from skapi.main import create_app

SUPABASE_URL = "https://test-project.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"

SETTINGS = Settings(supabase_url=SUPABASE_URL, database_url="postgresql://unused", cors_origins="http://localhost:3000")

PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())  # 다른 프로젝트·위조 토큰용


@dataclass
class _SigningKey:
    key: Any


class FakeJWKS:
    """PyJWKClient 대신: 항상 테스트 공개 키를 돌려준다."""

    def get_signing_key_from_jwt(self, token: str) -> _SigningKey:
        return _SigningKey(PRIVATE_KEY.public_key())


def make_token(
    sub: str | None = None,
    *,
    key: Any = PRIVATE_KEY,
    aud: str = "authenticated",
    iss: str = ISSUER,
    expires_in: int = 3600,
    email: str = "user@example.com",
) -> str:
    now = int(time.time())
    claims = {
        "sub": sub or str(uuid.uuid4()),
        "aud": aud,
        "iss": iss,
        "role": aud,
        "email": email,
        "iat": now,
        "exp": now + expires_in,
    }
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": "test"})


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def app():
    app = create_app(SETTINGS, connect_db=False)
    app.dependency_overrides[get_settings] = lambda: SETTINGS
    app.dependency_overrides[get_jwks_client] = lambda: FakeJWKS()
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c
