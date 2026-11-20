import "server-only";

import { createClient } from "@/lib/supabase/server";

export const SERIES_STYLES = ["live_action", "anime", "other"] as const;
export type SeriesStyle = (typeof SERIES_STYLES)[number];

export const STYLE_LABELS: Record<SeriesStyle, string> = {
  live_action: "실사",
  anime: "애니체",
  other: "기타",
};

export type Series = {
  id: string;
  title: string;
  style: SeriesStyle;
  style_note: string | null;
  created_at: string;
};

export type SeriesListResult =
  | { ok: true; series: Series[] }
  | { ok: false; reason: "missing_table" | "no_permission" | "error" };

/** 로그인한 사용자의 시리즈 (최근 만든 순). RLS가 본인 것만 돌려준다. */
export async function listMySeries(): Promise<SeriesListResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("series")
    .select("id, title, style, style_note, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    // 마이그레이션을 아직 적용하지 않은 경우
    if (error.code === "PGRST205" || error.code === "42P01") return { ok: false, reason: "missing_table" };
    // 테이블 권한(grant)이 없는 경우
    if (error.code === "42501") return { ok: false, reason: "no_permission" };
    console.error("listMySeries", error);
    return { ok: false, reason: "error" };
  }
  return { ok: true, series: (data ?? []) as Series[] };
}
