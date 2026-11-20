"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ANGLES, REFERENCE_BUCKET, type Angle } from "@/lib/character-constants";
import { isUuid } from "@/lib/series";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type CharacterField = "name" | "description";

export type CharacterFormState = {
  errors?: Partial<Record<CharacterField, string>>;
  message?: string;
  saved?: boolean;
  values?: { name: string; description: string };
} | undefined;

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

function readCharacterForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const values = { name, description };
  const errors: Partial<Record<CharacterField, string>> = {};
  if (!name) errors.name = "캐릭터 이름을 입력해 주세요.";
  else if (name.length > 50) errors.name = "이름은 50자 이하로 써 주세요.";
  if (description.length > 1000) errors.description = "외형 설명은 1000자 이하로 써 주세요.";
  return { values, errors, hasErrors: Object.keys(errors).length > 0 };
}

function dbErrorMessage(code: string | undefined, fallback: string) {
  if (code === "PGRST205" || code === "42P01")
    return "DB에 캐릭터 테이블이 없습니다. supabase/migrations/20261120000200_create_characters.sql을 실행해 주세요.";
  if (code === "42501") return "권한이 없습니다. 본인 시리즈가 맞는지 확인해 주세요.";
  return fallback;
}

const seriesPath = (seriesId: string) => `/series/${seriesId}`;

/* ───────── 캐릭터 추가·수정·삭제 ───────── */

export async function createCharacter(_prev: CharacterFormState, formData: FormData): Promise<CharacterFormState> {
  await requireUser();
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!isUuid(seriesId)) return { message: "잘못된 요청입니다." };

  const { values, errors, hasErrors } = readCharacterForm(formData);
  if (hasErrors) return { errors, values };

  const supabase = await createClient();
  // 남의 시리즈에 넣으려 하면 RLS(insert 정책)가 막는다
  const { error } = await supabase
    .from("character")
    .insert({ series_id: seriesId, name: values.name, description: values.description || null });

  if (error) {
    console.error("createCharacter", error);
    return { message: dbErrorMessage(error.code, "캐릭터를 추가하지 못했습니다."), values };
  }

  revalidatePath(seriesPath(seriesId));
  return { saved: true };
}

export async function updateCharacter(_prev: CharacterFormState, formData: FormData): Promise<CharacterFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!isUuid(id) || !isUuid(seriesId)) return { message: "잘못된 요청입니다." };

  const { values, errors, hasErrors } = readCharacterForm(formData);
  if (hasErrors) return { errors, values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("character")
    .update({ name: values.name, description: values.description || null })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("updateCharacter", error);
    return { message: dbErrorMessage(error.code, "저장하지 못했습니다."), values };
  }
  if (!data || data.length === 0) return { message: "캐릭터를 찾을 수 없습니다.", values };

  revalidatePath(seriesPath(seriesId));
  return { saved: true, values };
}

export async function deleteCharacter(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!isUuid(id) || !isUuid(seriesId)) return;

  const supabase = await createClient();
  // 행이 지워지면 경로를 잃으므로, 저장소 파일 경로를 먼저 읽어 둔다
  const { data: images } = await supabase.from("reference_image").select("storage_path").eq("character_id", id);

  const { error } = await supabase.from("character").delete().eq("id", id);
  if (error) {
    console.error("deleteCharacter", error);
    return;
  }

  const paths = (images ?? []).map((i) => i.storage_path);
  if (paths.length > 0) {
    const { error: rmError } = await supabase.storage.from(REFERENCE_BUCKET).remove(paths);
    if (rmError) console.error("deleteCharacter storage", rmError);
  }

  revalidatePath(seriesPath(seriesId));
}

/* ───────── 레퍼런스 이미지 ───────── */

export type ImageActionResult = { ok: true } | { ok: false; message: string };

/**
 * 브라우저가 저장소에 올린 파일을 DB에 기록한다.
 * 파일 자체는 브라우저 → Supabase Storage로 바로 올라간다 (Next 서버를 거치지 않음).
 */
export async function saveReferenceImage(input: {
  seriesId: string;
  characterId: string;
  angle: string;
  path: string;
}): Promise<ImageActionResult> {
  const user = await requireUser();
  const { seriesId, characterId, angle, path } = input;

  if (!isUuid(seriesId) || !isUuid(characterId) || !ANGLES.includes(angle as Angle)) {
    return { ok: false, message: "잘못된 요청입니다." };
  }
  // 다른 사람 폴더나 다른 캐릭터 경로를 기록하지 못하게 경로 모양을 확인
  const prefix = `${user.id}/${seriesId}/${characterId}/`;
  if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) {
    return { ok: false, message: "잘못된 파일 경로입니다." };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("reference_image")
    .select("storage_path")
    .eq("character_id", characterId)
    .eq("angle", angle)
    .maybeSingle();

  const { error } = await supabase
    .from("reference_image")
    .upsert({ character_id: characterId, angle, storage_path: path }, { onConflict: "character_id,angle" });

  if (error) {
    console.error("saveReferenceImage", error);
    // 기록에 실패하면 방금 올린 파일이 고아가 되므로 지운다
    await supabase.storage.from(REFERENCE_BUCKET).remove([path]);
    return { ok: false, message: dbErrorMessage(error.code, "이미지를 저장하지 못했습니다.") };
  }

  // 같은 각도의 예전 파일은 지운다
  if (existing?.storage_path && existing.storage_path !== path) {
    await supabase.storage.from(REFERENCE_BUCKET).remove([existing.storage_path]);
  }

  revalidatePath(seriesPath(seriesId));
  return { ok: true };
}

export async function deleteReferenceImage(input: {
  seriesId: string;
  characterId: string;
  angle: string;
}): Promise<ImageActionResult> {
  await requireUser();
  const { seriesId, characterId, angle } = input;
  if (!isUuid(seriesId) || !isUuid(characterId) || !ANGLES.includes(angle as Angle)) {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reference_image")
    .delete()
    .eq("character_id", characterId)
    .eq("angle", angle)
    .select("storage_path");

  if (error) {
    console.error("deleteReferenceImage", error);
    return { ok: false, message: "이미지를 삭제하지 못했습니다." };
  }

  const paths = (data ?? []).map((d) => d.storage_path);
  if (paths.length > 0) await supabase.storage.from(REFERENCE_BUCKET).remove(paths);

  revalidatePath(seriesPath(seriesId));
  return { ok: true };
}
