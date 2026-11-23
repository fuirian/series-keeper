import "server-only";

import { signPaths, toImageMap, type ReferenceImage } from "@/lib/references";
import { createClient } from "@/lib/supabase/server";

export type Location = {
  id: string;
  name: string;
  description: string | null;
  layout_note: string | null;
  prompt: string | null; // 생성용 프롬프트 (재생성 키트에 씀)
  created_at: string;
  images: Record<string, ReferenceImage>; // 각도(wide·angle1·angle2·detail) → 이미지
};

export type LocationListResult =
  | { ok: true; locations: Location[] }
  | { ok: false; reason: "missing_table" | "no_permission" | "error" };

type Row = Omit<Location, "images"> & {
  location_image: { angle: string; storage_path: string }[] | null;
};

/** 시리즈의 장소와 레퍼런스 이미지(1시간짜리 서명 URL 포함). */
export async function listLocations(seriesId: string): Promise<LocationListResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("location")
    .select("id, name, description, layout_note, prompt, created_at, location_image(angle, storage_path)")
    .eq("series_id", seriesId)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01" || error.code === "PGRST200")
      return { ok: false, reason: "missing_table" };
    if (error.code === "42501") return { ok: false, reason: "no_permission" };
    console.error("listLocations", error);
    return { ok: false, reason: "error" };
  }

  const rows = (data ?? []) as Row[];
  const urlByPath = await signPaths(
    supabase,
    rows.flatMap((r) => (r.location_image ?? []).map((img) => img.storage_path)),
  );

  return {
    ok: true,
    locations: rows.map(({ location_image, ...rest }) => ({
      ...rest,
      images: toImageMap(location_image, urlByPath),
    })),
  };
}
