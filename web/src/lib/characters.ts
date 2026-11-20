import "server-only";

import { type Angle, REFERENCE_BUCKET } from "@/lib/character-constants";
import { createClient } from "@/lib/supabase/server";

export type CharacterImage = { path: string; url: string | null };

export type Character = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  images: Partial<Record<Angle, CharacterImage>>;
};

export type CharacterListResult =
  | { ok: true; characters: Character[] }
  | { ok: false; reason: "missing_table" | "no_permission" | "error" };

type Row = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  reference_image: { angle: Angle; storage_path: string }[] | null;
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
  const paths = rows.flatMap((r) => (r.reference_image ?? []).map((img) => img.storage_path));

  // 비공개 버킷이라 화면에 보여 줄 때는 짧게 유효한 서명 URL을 만든다
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(REFERENCE_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    if (signError) console.error("createSignedUrls", signError);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
  }

  return {
    ok: true,
    characters: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      created_at: r.created_at,
      images: Object.fromEntries(
        (r.reference_image ?? []).map((img) => [
          img.angle,
          { path: img.storage_path, url: urlByPath.get(img.storage_path) ?? null },
        ]),
      ),
    })),
  };
}
