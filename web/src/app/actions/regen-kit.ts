"use server";

import { apiRequest } from "@/lib/api";
import type { RegenKit, RegenKitAction } from "@/lib/regen-kit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 재생성 키트 받기 (백엔드가 권한 확인·조립). DB 코드는 여기 두지 않는다. */
export async function getRegenKit(input: {
  issueId: string;
  tool?: string;
  characterId?: string | null;
  locationId?: string | null;
  scene?: string;
}): Promise<{ ok: true; kit: RegenKit } | { ok: false; message: string }> {
  if (!UUID_RE.test(input.issueId)) return { ok: false, message: "이슈를 찾을 수 없습니다." };

  const q = new URLSearchParams({ tool: input.tool ?? "generic" });
  if (input.characterId) q.set("character_id", input.characterId);
  if (input.locationId) q.set("location_id", input.locationId);
  const scene = input.scene?.trim().slice(0, 300);
  if (scene) q.set("scene", scene);

  const res = await apiRequest<RegenKit>("GET", `/v1/issues/${input.issueId}/regen-kit?${q}`);
  if (res.ok) return { ok: true, kit: res.data };
  if (res.reason === "unreachable") return { ok: false, message: "백엔드에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  if (res.reason === "unauthorized") return { ok: false, message: "로그인이 만료되었습니다. 다시 로그인해 주세요." };
  return { ok: false, message: res.detail ?? "키트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요." };
}

/** 키트 사용 기록. 실패해도 사용자 작업은 막지 않는다. */
export async function recordRegenKitEvent(issueId: string, tool: string, action: RegenKitAction): Promise<void> {
  if (!UUID_RE.test(issueId)) return;
  await apiRequest("POST", `/v1/issues/${issueId}/regen-kit/events`, { tool, action });
}
