"""설정: 환경 변수(또는 api/.env)에서 읽는다.

pydantic-settings가 이름이 같은 환경 변수를 찾아 타입까지 맞춰 준다.
예: SUPABASE_URL → supabase_url
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    database_url: str
    # 쉼표로 구분한 문자열 그대로 받아서 cors_origin_list로 나눈다
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def jwt_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def jwks_url(self) -> str:
        return f"{self.jwt_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    """앱 전체에서 한 번만 읽는다. 테스트에서는 의존성 교체(dependency_overrides)로 바꾼다."""
    return Settings()  # type: ignore[call-arg]  # 값은 환경 변수에서 채워짐
