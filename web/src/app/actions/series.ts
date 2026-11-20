"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prepareSeriesFileCleanup } from "@/lib/references";
import { isUuid, SERIES_STYLES, type SeriesStyle } from "@/lib/series";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type SeriesField = "title" | "style" | "styleNote";

export type SeriesFormState = {
  errors?: Partial<Record<SeriesField, string>>;
  message?: string;
  saved?: boolean;
  values?: { title: string; style: string; styleNote: string };
} | undefined;

function readSeriesForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const style = String(formData.get("style") ?? "");
  const styleNote = String(formData.get("styleNote") ?? "").trim();
  const values = { title, style, styleNote };

  const errors: Partial<Record<SeriesField, string>> = {};
  if (!title) errors.title = "시리즈 제목을 입력해 주세요.";
  else if (title.length > 100) errors.title = "제목은 100자 이하로 써 주세요.";
  if (!SERIES_STYLES.includes(style as SeriesStyle)) errors.style = "화풍을 골라 주세요.";
  if (styleNote.length > 500) errors.styleNote = "스타일 메모는 500자 이하로 써 주세요.";

  return { values, errors, hasErrors: Object.keys(errors).length > 0 };
}

function dbErrorMessage(code: string | undefined, fallback: string) {
  if (code === "PGRST205" || code === "42P01")
    return "DB에 series 테이블이 없습니다. supabase/migrations의 SQL을 먼저 실행해 주세요.";
  if (code === "42501")
    return "series 테이블 권한이 없습니다. supabase/migrations/20261120000100_grant_series.sql을 실행해 주세요.";
  return fallback;
}

/** 서버 액션은 화면과 별개로 직접 호출될 수 있으므로 매번 로그인을 다시 확인한다. */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/* ───────── 만들기 ───────── */

export async function createSeries(_prev: SeriesFormState, formData: FormData): Promise<SeriesFormState> {
  await requireUser();
  const { values, errors, hasErrors } = readSeriesForm(formData);
  if (hasErrors) return { errors, values };

  const supabase = await createClient();
  // owner_id는 DB 기본값(auth.uid())으로 채워지고, RLS가 본인인지 다시 확인한다
  const { data, error } = await supabase
    .from("series")
    .insert({ title: values.title, style: values.style, style_note: values.styleNote || null })
    .select("id")
    .single();

  if (error) {
    console.error("createSeries", error);
    return { message: dbErrorMessage(error.code, "시리즈를 만들지 못했습니다. 잠시 후 다시 시도해 주세요."), values };
  }

  revalidatePath("/");
  redirect(`/series/${data.id}`);
}

/* ───────── 수정 ───────── */

export async function updateSeries(_prev: SeriesFormState, formData: FormData): Promise<SeriesFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { message: "잘못된 요청입니다." };

  const { values, errors, hasErrors } = readSeriesForm(formData);
  if (hasErrors) return { errors, values };

  const supabase = await createClient();
  // RLS 때문에 남의 시리즈는 조건에 걸리지 않아 0행이 바뀐다 → select로 확인
  const { data, error } = await supabase
    .from("series")
    .update({ title: values.title, style: values.style, style_note: values.styleNote || null })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("updateSeries", error);
    return { message: dbErrorMessage(error.code, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."), values };
  }
  if (!data || data.length === 0) return { message: "시리즈를 찾을 수 없습니다.", values };

  revalidatePath("/");
  revalidatePath(`/series/${id}`);
  return { saved: true, message: "저장했습니다.", values };
}

/* ───────── 삭제 ───────── */

export async function deleteSeries(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) redirect("/");

  const supabase = await createClient();
  // 행이 지워지면(cascade) 파일 경로를 잃으므로 먼저 읽어 둔다
  const cleanupImages = await prepareSeriesFileCleanup(supabase, id);
  const { error } = await supabase.from("series").delete().eq("id", id);
  if (error) console.error("deleteSeries", error);
  else await cleanupImages();

  revalidatePath("/");
  redirect("/");
}
