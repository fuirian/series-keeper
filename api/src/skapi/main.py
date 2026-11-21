"""앱 조립: 설정 → DB 풀 → CORS → /v1 라우터.

실행: uvicorn skapi.main:create_app --factory --reload  (api/ 폴더에서)
  --factory: import할 때가 아니라 서버가 켜질 때 create_app()을 불러 앱을 만든다
  (그래서 테스트는 설정·DB 없이 create_app을 import할 수 있다)
문서: http://localhost:8000/docs  (OpenAPI, 자동 생성)
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .db import create_pool
from .routers import health, me, series


def create_app(settings: Settings | None = None, *, connect_db: bool = True) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # 서버가 켜질 때 DB 연결 풀을 만들고, 꺼질 때 닫는다
        app.state.pool = await create_pool(settings.database_url) if connect_db else None
        try:
            yield
        finally:
            if app.state.pool is not None:
                await app.state.pool.close()

    app = FastAPI(title="SeriesKeeper API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type"],
    )

    for module in (health, me, series):
        app.include_router(module.router, prefix="/v1")

    return app
