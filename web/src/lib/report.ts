import "server-only";

import { EPISODE_BUCKET, type EpisodeStatus } from "@/lib/episode-constants";
import { REFERENCE_BUCKET } from "@/lib/reference-constants";
import type { IssueReview } from "@/lib/report-constants";
import { isUuid } from "@/lib/series";
import { createClient } from "@/lib/supabase/server";

const ANGLE_ORDER = ["front", "side", "back", "full"];

export type ReportIssue = {
  id: string;
  type: string;
  similarity: number;
  runner_up_similarity: number | null;
  time_ms: number;
  bbox: number[];
  review: IssueReview;
  frame_url: string | null;
  shot: { index: number; start_ms: number; end_ms: number } | null;
  character: { id: string; name: string } | null;
  runner_up: { id: string; name: string } | null;
};

export type ReportEpisode = {
  id: string;
  number: number;
  title: string | null;
  status: EpisodeStatus;
  duration_ms: number | null;
  analysis_error: string | null;
  analysis_finished_at: string | null;
  analysis_summary: {
    shots?: number;
    shots_with_faces?: number;
    issues?: number;
    elapsed_s?: number;
    thresholds?: { issue_below?: number };
  } | null;
  video_url: string | null;
};

/** 캐릭터 id → 레퍼런스 사진 (정면 우선) */
export type CharacterRefs = Record<string, { angle: string; url: string }[]>;

export type EpisodeReport =
  | { ok: true; episode: ReportEpisode; issues: ReportIssue[]; refs: CharacterRefs }
  | { ok: false; reason: "not_found" | "needs_migration" | "error" };

type IssueRow = Omit<ReportIssue, "frame_url"> & { frame_path: string | null };

async function signMany(bucket: string, paths: string[]) {
  const supabase = await createClient();
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
  if (error) console.error("report signed urls", bucket, error);
  for (const s of data ?? []) if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
  return map;
}

/** 회차 하나의 검수 리포트 (이슈는 유사도 낮은 순). 남의 회차·없는 회차는 not_found (RLS). */
export async function getEpisodeReport(seriesId: string, episodeId: string): Promise<EpisodeReport> {
  if (!isUuid(seriesId) || !isUuid(episodeId)) return { ok: false, reason: "not_found" };
  const supabase = await createClient();

  const { data: ep, error: epError } = await supabase
    .from("episode")
    .select(
      "id, number, title, status, duration_ms, video_path, analysis_error, analysis_finished_at, analysis_summary",
    )
    .eq("id", episodeId)
    .eq("series_id", seriesId)
    .maybeSingle();

  if (epError) {
    if (epError.code === "42703") return { ok: false, reason: "needs_migration" };
    console.error("getEpisodeReport episode", epError);
    return { ok: false, reason: "error" };
  }
  if (!ep) return { ok: false, reason: "not_found" };

  const { data: issueData, error: issueError } = await supabase
    .from("issue")
    .select(
      "id, type, similarity, runner_up_similarity, time_ms, bbox, review, frame_path," +
        " shot:shot_id(index, start_ms, end_ms)," +
        " character:character_id(id, name)," +
        " runner_up:runner_up_id(id, name)",
    )
    .eq("episode_id", episodeId)
    .order("similarity", { ascending: true });

  if (issueError) {
    // review 컬럼(20261120000600)이나 issue 테이블(…0500)이 아직 없는 경우
    if (["42703", "PGRST205", "42P01", "PGRST200"].includes(issueError.code))
      return { ok: false, reason: "needs_migration" };
    console.error("getEpisodeReport issues", issueError);
    return { ok: false, reason: "error" };
  }
  const rows = (issueData ?? []) as unknown as IssueRow[];

  // 이슈에 나온 캐릭터들의 레퍼런스 사진
  const characterIds = [...new Set(rows.flatMap((r) => [r.character?.id, r.runner_up?.id]).filter(Boolean))] as string[];
  const { data: refRows } =
    characterIds.length > 0
      ? await supabase
          .from("reference_image")
          .select("character_id, angle, storage_path")
          .in("character_id", characterIds)
      : { data: [] as { character_id: string; angle: string; storage_path: string }[] };

  const refList = (refRows ?? []) as { character_id: string; angle: string; storage_path: string }[];
  const [imageUrls, videoUrls] = await Promise.all([
    signMany(REFERENCE_BUCKET, [
      ...rows.map((r) => r.frame_path).filter((p): p is string => Boolean(p)),
      ...refList.map((r) => r.storage_path),
    ]),
    signMany(EPISODE_BUCKET, [ep.video_path as string]),
  ]);

  const refs: CharacterRefs = {};
  for (const r of refList) {
    const url = imageUrls.get(r.storage_path);
    if (!url) continue;
    (refs[r.character_id] ??= []).push({ angle: r.angle, url });
  }
  for (const list of Object.values(refs)) {
    list.sort((a, b) => ANGLE_ORDER.indexOf(a.angle) - ANGLE_ORDER.indexOf(b.angle));
  }

  return {
    ok: true,
    episode: {
      id: ep.id,
      number: ep.number,
      title: ep.title,
      status: ep.status,
      duration_ms: ep.duration_ms,
      analysis_error: ep.analysis_error,
      analysis_finished_at: ep.analysis_finished_at,
      analysis_summary: ep.analysis_summary,
      video_url: videoUrls.get(ep.video_path as string) ?? null,
    },
    issues: rows.map(({ frame_path, ...rest }) => ({
      ...rest,
      frame_url: frame_path ? (imageUrls.get(frame_path) ?? null) : null,
    })),
    refs,
  };
}
