import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { EPISODE_BUCKET } from "@/lib/episode-constants";
import { REFERENCE_BUCKET, REFERENCE_KINDS, type ReferenceKind } from "@/lib/reference-constants";

export type ReferenceImage = { path: string; url: string | null };

/** 비공개 버킷 파일을 화면에 보여 줄 짧게 유효한 서명 URL (기본 1시간). */
export async function signPaths(supabase: SupabaseClient, paths: string[], expiresIn = 60 * 60) {
  const urlByPath = new Map<string, string>();
  if (paths.length === 0) return urlByPath;

  const { data, error } = await supabase.storage.from(REFERENCE_BUCKET).createSignedUrls(paths, expiresIn);
  if (error) console.error("createSignedUrls", error);
  for (const s of data ?? []) {
    if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }
  return urlByPath;
}

/** DB에서 읽은 {angle, storage_path} 목록을 각도별 이미지로 바꾼다. */
export function toImageMap(
  rows: { angle: string; storage_path: string }[] | null | undefined,
  urlByPath: Map<string, string>,
): Record<string, ReferenceImage> {
  return Object.fromEntries(
    (rows ?? []).map((r) => [r.angle, { path: r.storage_path, url: urlByPath.get(r.storage_path) ?? null }]),
  );
}

/**
 * 캐릭터·장소를 지우기 전에 부른다: 이미지 파일 경로를 읽어 두었다가 행 삭제 후 파일을 지우는 함수를 돌려준다.
 * (행이 먼저 지워지면 cascade로 이미지 행도 사라져 경로를 잃는다)
 */
export async function prepareImageCleanup(supabase: SupabaseClient, kind: ReferenceKind, entityId: string) {
  const { table, fk } = REFERENCE_KINDS[kind];
  const { data } = await supabase.from(table).select("storage_path").eq(fk, entityId);
  const paths = (data ?? []).map((d: { storage_path: string }) => d.storage_path);

  return async () => {
    if (paths.length === 0) return;
    const { error } = await supabase.storage.from(REFERENCE_BUCKET).remove(paths);
    if (error) console.error("remove images", kind, error);
  };
}

/**
 * 시리즈를 지우기 전에 부른다: 시리즈 안 모든 파일(캐릭터·장소 이미지, 회차 영상)을 지우는 함수를 돌려준다.
 * (DB 행은 cascade로 지워지지만 저장소 파일은 남기 때문)
 */
export async function prepareSeriesFileCleanup(supabase: SupabaseClient, seriesId: string) {
  type Nested = Record<string, { storage_path: string }[] | null>;
  const [characters, locations, episodes, series] = await Promise.all([
    supabase.from("character").select("reference_image(storage_path)").eq("series_id", seriesId),
    supabase.from("location").select("location_image(storage_path)").eq("series_id", seriesId),
    supabase.from("episode").select("video_path").eq("series_id", seriesId),
    supabase.from("series").select("cover_path").eq("id", seriesId).maybeSingle(),
  ]);
  // 테이블·칸이 아직 없으면(마이그레이션 전) 오류가 나지만, 지울 파일도 없으므로 무시한다
  const coverPath = (series.data as { cover_path?: string | null } | null)?.cover_path;
  const imagePaths = [
    ...((characters.data ?? []) as Nested[]).flatMap((c) => c.reference_image ?? []),
    ...((locations.data ?? []) as Nested[]).flatMap((l) => l.location_image ?? []),
  ]
    .map((i) => i.storage_path)
    .concat(coverPath ? [coverPath] : []);
  const videoPaths = ((episodes.data ?? []) as { video_path: string }[]).map((e) => e.video_path);

  return async () => {
    if (imagePaths.length > 0) {
      const { error } = await supabase.storage.from(REFERENCE_BUCKET).remove(imagePaths);
      if (error) console.error("remove series images", error);
    }
    if (videoPaths.length > 0) {
      const { error } = await supabase.storage.from(EPISODE_BUCKET).remove(videoPaths);
      if (error) console.error("remove series videos", error);
    }
  };
}
