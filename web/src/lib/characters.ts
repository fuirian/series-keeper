import "server-only";

import { signPaths, toImageMap, type ReferenceImage } from "@/lib/references";
import { createClient } from "@/lib/supabase/server";

export type Character = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  images: Record<string, ReferenceImage>; // 각도(front·side·back·full) → 이미지
};

export type CharacterListResult =
  | { ok: true; characters: Character[] }
  | { ok: false; reason: "missing_table" | "no_permission" | "error" };

type Row = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  reference_image: { angle: string; storage_path: string }[] | null;
};

/** 시리즈의 캐릭터와 레퍼런스 이미지(1시간짜리 서명 URL 포함). */
export async function listCharacters(seriesId: string): Promise<CharacterListResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("character")
    .select("id, name, description, created_at, reference_image(angle, storage_path)")
    .eq("series_id", seriesId)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01" || error.code === "PGRST200")
      return { ok: false, reason: "missing_table" };
    if (error.code === "42501") return { ok: false, reason: "no_permission" };
    console.error("listCharacters", error);
    return { ok: false, reason: "error" };
  }

  const rows = (data ?? []) as Row[];
  const urlByPath = await signPaths(
    supabase,
    rows.flatMap((r) => (r.reference_image ?? []).map((img) => img.storage_path)),
  );

  return {
    ok: true,
    characters: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      created_at: r.created_at,
      images: toImageMap(r.reference_image, urlByPath),
    })),
  };
}
