/** GET /v1/issues/{id}/regen-kit 응답 (api/src/skapi/routers/regen_kit.py의 RegenKit과 같은 모양) */
export type RegenKit = {
  issue_id: string;
  tool: { id: string; label: string; max_refs: number };
  tools: { id: string; label: string; max_refs: number }[];
  character_id: string;
  characters: { id: string; name: string }[];
  location_id: string | null;
  locations: { id: string; name: string }[];
  shot: { episode_number: number; start_ms: number; end_ms: number; time_ms: number; frame_url: string | null };
  prompt: string;
  negative_prompt: string | null;
  references: { order: number; label: string; kind: "character" | "location"; url: string | null }[];
  tips: string[];
  missing: string[];
};

export type RegenKitAction = "open" | "copy_prompt" | "download_refs";

/** 비어서 대신 채운 칸 → 사용자 안내 (어느 탭에서 채우면 되는지) */
export const MISSING_HINTS: Record<string, { text: string; tab: string }> = {
  character_prompt: { text: "캐릭터의 '생성용 프롬프트'를 채우면 결과가 좋아집니다.", tab: "characters" },
  character_description: { text: "캐릭터 설명이 비어 있어 이름만 들어갔습니다.", tab: "characters" },
  character_front_ref: { text: "캐릭터 정면 사진이 없어 레퍼런스를 넣지 못했습니다.", tab: "characters" },
  location_prompt: { text: "장소의 '생성용 프롬프트'를 채우면 배경이 더 정확해집니다.", tab: "locations" },
  style_prompt: { text: "시리즈 '화풍 프롬프트'를 채우면 화풍이 더 정확해집니다.", tab: "settings" },
};
