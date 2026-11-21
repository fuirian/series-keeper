"""로그인 확인: 웹이 보낸 Supabase 토큰(JWT)을 직접 검증한다.

- 웹은 `Authorization: Bearer <access_token>` 헤더로 토큰을 보낸다.
- Supabase 공개 키(JWKS, ES256)로 서명을 확인한다. 키는 받아 둔 걸 재사용하므로
  요청마다 인증 서버에 다녀오지 않는다.
- 통과하면 토큰 내용(claims)을 돌려준다. DB에서 RLS를 적용할 때 이 내용을 그대로 넘긴다.
"""

from dataclasses import dataclass
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Settings, get_settings

# auto_error=False: 헤더가 없을 때 FastAPI 기본 403 대신 우리가 401을 돌려주려고
_bearer = HTTPBearer(auto_error=False)

_jwks_clients: dict[str, jwt.PyJWKClient] = {}


def get_jwks_client(settings: Annotated[Settings, Depends(get_settings)]) -> jwt.PyJWKClient:
    """JWKS 주소별로 클라이언트를 하나만 만든다 (공개 키를 캐시해 둠)."""
    client = _jwks_clients.get(settings.jwks_url)
    if client is None:
        client = jwt.PyJWKClient(settings.jwks_url, cache_keys=True, lifespan=600)
        _jwks_clients[settings.jwks_url] = client
    return client


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None
    claims: dict[str, Any]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_token(token: str, jwks: jwt.PyJWKClient, settings: Settings) -> dict[str, Any]:
    """서명·만료·발급자·대상을 확인하고 토큰 내용을 돌려준다. 실패하면 401."""
    try:
        key = jwks.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=["ES256"],
            audience="authenticated",  # 로그인한 사용자 토큰만 (anon 토큰은 거절)
            issuer=settings.jwt_issuer,  # 우리 Supabase 프로젝트가 발급한 것만
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as e:
        raise _unauthorized("로그인이 만료되었습니다.") from e
    except (jwt.PyJWTError, jwt.PyJWKClientError) as e:
        raise _unauthorized("로그인 정보가 올바르지 않습니다.") from e


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    jwks: Annotated[jwt.PyJWKClient, Depends(get_jwks_client)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    """로그인이 필요한 API에 `user: CurrentUserDep`로 붙인다."""
    if credentials is None:
        raise _unauthorized("로그인이 필요합니다.")
    claims = verify_token(credentials.credentials, jwks, settings)
    return CurrentUser(id=claims["sub"], email=claims.get("email"), claims=claims)


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
