"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EPISODE_BUCKET, MAX_VIDEO_BYTES } from "@/lib/episode-constants";
import { isUuid } from "@/lib/series";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type EpisodeActionResult = { ok: true } | { ok: false; message: string };

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

function validNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 9999;
}

function dbErrorMessage(code: string | undefined, fallback: string) {
  if (code === "PGRST205" || code === "42P01")
    return "DB에 회차 테이블이 없습니다. supabase/migrations/20261120000400_create_episodes.sql을 실행해 주세요.";
  if (code === "23505") return "이미 같은 번호의 회차가 있습니다.";
  if (code === "42501") return "권한이 없습니다.";
  return fallback;
}

/** 업로드 전에 회차 번호가 비어 있는지 확인 (큰 영상을 올린 뒤에 실패하지 않게). */
export async function checkEpisodeNumber(input: { seriesId: string; number: number }): Promise<EpisodeActionResult> {
  await requireUser();
  if (!isUuid(input.seriesId) || !validNumber(input.number)) return { ok: false, message: "회차 번호를 확인해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("episode")
    .select("id")
    .eq("series_id", input.seriesId)
    .eq("number", input.number)
    .maybeSingle();

  if (error) return { ok: false, message: dbErrorMessage(error.code, "회차 번호를 확인하지 못했습니다.") };
  if (data) return { ok: false, message: `${input.number}화가 이미 있습니다. 다른 번호를 입력해 주세요.` };
  return { ok: true };
}

/**
 * 브라우저가 저장소에 올린 영상을 회차로 등록한다 (상태: 검사 전. '검사하기'를 눌러야 검사 대기).
 * 영상 파일은 브라우저 → Supabase Storage로 바로 올라간다 (Next 서버를 거치지 않음).
 */
export async function createEpisode(input: {
  seriesId: string;
  number: number;
  title: string;
  path: string;
  sizeBytes: number;
  durationMs: number | null;
  startCheck?: boolean; // true면 등록 직후 바로 검사 요청 ('업로드하고 바로 검사')
}): Promise<{ ok: true; checkRequested: boolean } | { ok: false; message: string }> {
  const user = await requireUser();
  const title = input.title.trim();
  const { seriesId, number, path } = input;

  if (!isUuid(seriesId) || !validNumber(number)) return { ok: false, message: "잘못된 요청입니다." };
  if (title.length > 100) return { ok: false, message: "제목은 100자 이하로 써 주세요." };

  // 다른 사람 폴더나 다른 시리즈 경로를 기록하지 못하게 경로 모양을 확인
  const prefix = `${user.id}/${seriesId}/`;
  if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) {
    return { ok: false, message: "잘못된 파일 경로입니다." };
  }

  const sizeBytes = Number.isFinite(input.sizeBytes) ? Math.min(Math.max(0, input.sizeBytes), MAX_VIDEO_BYTES) : null;
  const durationMs =
    input.durationMs != null && Number.isFinite(input.durationMs) && input.durationMs >= 0
      ? Math.round(input.durationMs)
      : null;

  const supabase = await createClient();
  // 남의 시리즈면 RLS(insert 정책)가 막는다. status는 기본값 'pending'
  const { data: created, error } = await supabase
    .from("episode")
    .insert({
      series_id: seriesId,
      number,
      title: title || null,
      video_path: path,
      size_bytes: sizeBytes,
      duration_ms: durationMs,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createEpisode", error);
    // 기록에 실패하면 방금 올린 영상이 고아가 되므로 지운다
    await supabase.storage.from(EPISODE_BUCKET).remove([path]);
    return { ok: false, message: dbErrorMessage(error.code, "회차를 등록하지 못했습니다.") };
  }

  // '업로드하고 바로 검사': 본인 회차 확인은 DB 함수가 한다
  let checkRequested = false;
  if (input.startCheck) {
    const { data: changed, error: rpcError } = await supabase.rpc("request_episode_analysis", {
      p_episode_id: created.id,
    });
    if (rpcError) console.error("createEpisode startCheck", rpcError);
    checkRequested = Boolean(changed);
  }

  revalidatePath(`/series/${seriesId}`);
  return { ok: true, checkRequested };
}

export async function deleteEpisode(input: { seriesId: string; episodeId: string }): Promise<EpisodeActionResult> {
  await requireUser();
  const { seriesId, episodeId } = input;
  if (!isUuid(seriesId) || !isUuid(episodeId)) return { ok: false, message: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("episode").delete().eq("id", episodeId).select("video_path");

  if (error) {
    console.error("deleteEpisode", error);
    return { ok: false, message: "회차를 삭제하지 못했습니다." };
  }

  const paths = (data ?? []).map((d) => d.video_path as string);
  if (paths.length > 0) {
    const { error: rmError } = await supabase.storage.from(EPISODE_BUCKET).remove(paths);
    if (rmError) console.error("deleteEpisode storage", rmError);
  }

  revalidatePath(`/series/${seriesId}`);
  return { ok: true };
}

/** '검사 전'·완료·실패 회차를 '검사 대기'로 돌린다 = 검사하기 / 다시 검사 (본인 회차인지는 DB 함수가 확인). */
export async function requestAnalysis(input: { seriesId: string; episodeId: string }): Promise<EpisodeActionResult> {
  await requireUser();
  const { seriesId, episodeId } = input;
  if (!isUuid(seriesId) || !isUuid(episodeId)) return { ok: false, message: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_episode_analysis", { p_episode_id: episodeId });
  if (error) {
    console.error("requestAnalysis", error);
    if (error.code === "PGRST202")
      return { ok: false, message: "분석 SQL이 아직 적용되지 않았습니다. 20261120000500_create_analysis.sql을 실행해 주세요." };
    return { ok: false, message: "검사를 요청하지 못했습니다." };
  }
  if (!data) return { ok: false, message: "이미 검사 대기 중이거나 검사 중인 회차입니다." };

  revalidatePath(`/series/${seriesId}`);
  return { ok: true };
}
