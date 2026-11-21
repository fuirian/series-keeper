from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """서버가 살아 있는지 (로그인·DB 없이)."""
    return {"status": "ok"}
