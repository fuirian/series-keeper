"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isReferenceKind, REFERENCE_BUCKET, REFERENCE_KINDS } from "@/lib/reference-constants";
import { isUuid } from "@/lib/series";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type ImageActionResult = { ok: true } | { ok: false; message: string };

type Target = {
  kind: string; // "character" | "location"
  seriesId: string;
  entityId: string; // 캐릭터 id 또는 장소 id
  angle: string;
};

function validate({ kind, seriesId, entityId, angle }: Target) {
  if (!isReferenceKind(kind)) return null;
  if (!isUuid(seriesId) || !isUuid(entityId)) return null;
  const config = REFERENCE_KINDS[kind];
  if (!config.angles.includes(angle)) return null;
  return config;
}

function dbErrorMessage(code: string | undefined, fallback: string) {
  if (code === "PGRST205" || code === "42P01") return "DB 테이블이 없습니다. supabase/migrations의 SQL을 실행해 주세요.";
  if (code === "42501") return "권한이 없습니다.";
  return fallback;
}

/**
 * 브라우저가 저장소에 올린 파일을 DB에 기록한다.
 * 파일 자체는 브라우저 → Supabase Storage로 바로 올라간다 (Next 서버를 거치지 않음).
 */
export async function saveReferenceImage(input: Target & { path: string }): Promise<ImageActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const config = validate(input);
  if (!config) return { ok: false, message: "잘못된 요청입니다." };
  const { seriesId, entityId, angle, path } = input;

  // 다른 사람 폴더나 다른 캐릭터·장소 경로를 기록하지 못하게 경로 모양을 확인
  const prefix = `${user.id}/${seriesId}/${entityId}/`;
  if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) {
    return { ok: false, message: "잘못된 파일 경로입니다." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from(config.table)
    .select("storage_path")
    .eq(config.fk, entityId)
    .eq("angle", angle)
    .maybeSingle();

  // 남의 캐릭터·장소면 RLS(insert 정책)가 막는다
  const { error } = await supabase
    .from(config.table)
    .upsert({ [config.fk]: entityId, angle, storage_path: path }, { onConflict: `${config.fk},angle` });

  if (error) {
    console.error("saveReferenceImage", error);
    // 기록에 실패하면 방금 올린 파일이 고아가 되므로 지운다
    await supabase.storage.from(REFERENCE_BUCKET).remove([path]);
    return { ok: false, message: dbErrorMessage(error.code, "이미지를 저장하지 못했습니다.") };
  }

  // 같은 각도의 예전 파일은 지운다
  const oldPath = (existing as { storage_path?: string } | null)?.storage_path;
  if (oldPath && oldPath !== path) {
    await supabase.storage.from(REFERENCE_BUCKET).remove([oldPath]);
  }

  revalidatePath(`/series/${seriesId}`);
  return { ok: true };
}

export async function deleteReferenceImage(input: Target): Promise<ImageActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const config = validate(input);
  if (!config) return { ok: false, message: "잘못된 요청입니다." };
  const { seriesId, entityId, angle } = input;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(config.table)
    .delete()
    .eq(config.fk, entityId)
    .eq("angle", angle)
    .select("storage_path");

  if (error) {
    console.error("deleteReferenceImage", error);
    return { ok: false, message: "이미지를 삭제하지 못했습니다." };
  }

  const paths = ((data ?? []) as { storage_path: string }[]).map((d) => d.storage_path);
  if (paths.length > 0) await supabase.storage.from(REFERENCE_BUCKET).remove(paths);

  revalidatePath(`/series/${seriesId}`);
  return { ok: true };
}
