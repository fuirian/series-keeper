"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prepareImageCleanup } from "@/lib/references";
import { isUuid } from "@/lib/series";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type CharacterField = "name" | "description" | "prompt";

export type CharacterFormState = {
  errors?: Partial<Record<CharacterField, string>>;
  message?: string;
  saved?: boolean;
  createdId?: string; // 추가 성공 시 새 캐릭터 id (이어서 사진을 올릴 때 사용)
  values?: { name: string; description: string; prompt: string };
} | undefined;

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

function readCharacterForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const prompt = String(formData.get("prompt") ?? "").trim();
  const values = { name, description, prompt };
  const errors: Partial<Record<CharacterField, string>> = {};
  if (!name) errors.name = "캐릭터 이름을 입력해 주세요.";
  else if (name.length > 50) errors.name = "이름은 50자 이하로 써 주세요.";
  if (description.length > 1000) errors.description = "외형 설명은 1000자 이하로 써 주세요.";
  if (prompt.length > 1000) errors.prompt = "생성용 프롬프트는 1000자 이하로 써 주세요.";
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
  const { data, error } = await supabase
    .from("character")
    .insert({
      series_id: seriesId,
      name: values.name,
      description: values.description || null,
      prompt: values.prompt || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createCharacter", error);
    return { message: dbErrorMessage(error.code, "캐릭터를 추가하지 못했습니다."), values };
  }

  revalidatePath(seriesPath(seriesId));
  return { saved: true, createdId: data.id };
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
    .update({ name: values.name, description: values.description || null, prompt: values.prompt || null })
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
  const cleanupImages = await prepareImageCleanup(supabase, "character", id);

  const { error } = await supabase.from("character").delete().eq("id", id);
  if (error) {
    console.error("deleteCharacter", error);
    return;
  }
  await cleanupImages();

  revalidatePath(seriesPath(seriesId));
}
