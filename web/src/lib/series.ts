import "server-only";

import { signPaths } from "@/lib/references";
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
  style_prompt?: string | null; // 화풍 프롬프트 (상세에서만 읽음, 재생성 키트에 씀)
  cover_path?: string | null; // 대표 이미지 (references 버킷)
  cover_url?: string | null; // 대표 이미지 서명 URL (1시간)
  created_at: string;
};

export type SeriesListResult =
  | { ok: true; series: Series[] }
  | { ok: false; reason: "missing_table" | "no_permission" | "error" };

// 대표 이미지 마이그레이션(0900) 전이면 cover_path 칸이 없다 → 그 칸만 빼고 다시 읽는다
const UNDEFINED_COLUMN = "42703";

async function withCoverUrls(supabase: Awaited<ReturnType<typeof createClient>>, rows: Series[]) {
  const urlByPath = await signPaths(
    supabase,
    rows.map((r) => r.cover_path).filter((p): p is string => !!p),
  );
  return rows.map((r) => ({ ...r, cover_url: r.cover_path ? (urlByPath.get(r.cover_path) ?? null) : null }));
}

/** 로그인한 사용자의 시리즈 (최근 만든 순). RLS가 본인 것만 돌려준다. */
export async function listMySeries(): Promise<SeriesListResult> {
  const supabase = await createClient();
  const query = (columns: string) =>
    supabase.from("series").select(columns).order("created_at", { ascending: false });

  let { data, error } = await query("id, title, style, style_note, cover_path, created_at");
  if (error?.code === UNDEFINED_COLUMN) ({ data, error } = await query("id, title, style, style_note, created_at"));

  if (error) {
    // 마이그레이션을 아직 적용하지 않은 경우
    if (error.code === "PGRST205" || error.code === "42P01") return { ok: false, reason: "missing_table" };
    // 테이블 권한(grant)이 없는 경우
    if (error.code === "42501") return { ok: false, reason: "no_permission" };
    console.error("listMySeries", error);
    return { ok: false, reason: "error" };
  }
  return { ok: true, series: await withCoverUrls(supabase, (data ?? []) as unknown as Series[]) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * 시리즈 하나. 없거나 다른 사람 것이면 null (RLS 때문에 남의 시리즈는 '없는 것'으로 보인다).
 */
export async function getSeries(id: string): Promise<Series | null> {
  if (!isUuid(id)) return null; // 형식이 틀린 id로 DB 오류가 나지 않게
  const supabase = await createClient();
  const query = (columns: string) => supabase.from("series").select(columns).eq("id", id).maybeSingle();

  let { data, error } = await query("id, title, style, style_note, style_prompt, cover_path, created_at");
  if (error?.code === UNDEFINED_COLUMN)
    ({ data, error } = await query("id, title, style, style_note, style_prompt, created_at"));

  if (error) {
    console.error("getSeries", error);
    return null;
  }
  if (!data) return null;
  const [series] = await withCoverUrls(supabase, [data as unknown as Series]);
  return series;
}
