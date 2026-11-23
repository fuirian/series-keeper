"""Supabase Storage: 비공개 파일의 서명 URL을 **요청한 사용자 권한으로** 만든다.

관리자 키를 쓰지 않는다. 사용자 토큰을 그대로 넘기므로 Storage 정책(본인 폴더만)이 그대로 걸린다.
"""

import logging

import httpx

from .config import Settings

log = logging.getLogger(__name__)

SIGNED_URL_SECONDS = 3600


async def sign_urls(settings: Settings, token: str, bucket: str, paths: list[str]) -> dict[str, str]:
    """경로 → 서명 URL. 실패한 경로는 빠진다 (화면에서 '이미지 없음'으로 보임)."""
    paths = list(dict.fromkeys(p for p in paths if p))  # 중복·빈 값 제거
    if not paths:
        return {}
    base = f"{settings.supabase_url.rstrip('/')}/storage/v1"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.post(
                f"{base}/object/sign/{bucket}",
                headers={"Authorization": f"Bearer {token}", "apikey": settings.supabase_publishable_key},
                json={"expiresIn": SIGNED_URL_SECONDS, "paths": paths},
            )
            res.raise_for_status()
    except httpx.HTTPError as e:
        log.warning("storage sign failed: %s", e)
        return {}
    out: dict[str, str] = {}
    for item in res.json():
        signed = item.get("signedURL")
        if signed and not item.get("error"):
            out[item["path"]] = f"{base}{signed}"
    return out


async def remove_paths(settings: Settings, token: str, bucket: str, paths: list[str]) -> bool:
    """파일 지우기 (사용자 권한). 실패해도 요청은 계속한다 — 남은 파일은 저장 공간만 차지한다."""
    paths = [p for p in paths if p]
    if not paths:
        return True
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.request(
                "DELETE",
                f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}",
                headers={"Authorization": f"Bearer {token}", "apikey": settings.supabase_publishable_key},
                json={"prefixes": paths},
            )
            res.raise_for_status()
        return True
    except httpx.HTTPError as e:
        log.warning("storage remove failed: %s", e)
        return False
