import "server-only";

import { EPISODE_BUCKET, type EpisodeStatus } from "@/lib/episode-constants";
import { createClient } from "@/lib/supabase/server";

export type Episode = {
  id: string;
  number: number;
  title: string | null;
  video_path: string;
  size_bytes: number | null;
  duration_ms: number | null;
  status: EpisodeStatus;
  created_at: string;
  analysis_error: string | null;
  analysis_summary: { shots?: number; issues?: number; elapsed_s?: number } | null;
  video_url: string | null; // 1시간짜리 서명 URL (미리보기 재생용)
};

export type EpisodeListResult =
  | { ok: true; episodes: Episode[] }
  | { ok: false; reason: "missing_table" | "needs_analysis_migration" | "no_permission" | "error" };

/** 시리즈의 회차 (최신 회차가 위로). */
export async function listEpisodes(seriesId: string): Promise<EpisodeListResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("episode")
    .select(
      "id, number, title, video_path, size_bytes, duration_ms, status, created_at, analysis_error, analysis_summary",
    )
    .eq("series_id", seriesId)
    .order("number", { ascending: false });

  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return { ok: false, reason: "missing_table" };
    // 분석 컬럼(20261120000500)이 아직 없는 경우
    if (error.code === "42703") return { ok: false, reason: "needs_analysis_migration" };
    if (error.code === "42501") return { ok: false, reason: "no_permission" };
    console.error("listEpisodes", error);
    return { ok: false, reason: "error" };
  }

  const rows = (data ?? []) as Omit<Episode, "video_url">[];
  const urlByPath = new Map<string, string>();
  if (rows.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(EPISODE_BUCKET)
      .createSignedUrls(
        rows.map((r) => r.video_path),
        60 * 60,
      );
    if (signError) console.error("episode signed urls", signError);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }

  return {
    ok: true,
    episodes: rows.map((r) => ({ ...r, video_url: urlByPath.get(r.video_path) ?? null })),
  };
}
