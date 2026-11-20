"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SERIES_STYLES, type SeriesStyle } from "@/lib/series";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type CreateSeriesField = "title" | "style" | "styleNote";

export type CreateSeriesState = {
  errors?: Partial<Record<CreateSeriesField, string>>;
  message?: string;
  values?: { title: string; style: string; styleNote: string };
} | undefined;

export async function createSeries(_prev: CreateSeriesState, formData: FormData): Promise<CreateSeriesState> {
  const title = String(formData.get("title") ?? "").trim();
  const style = String(formData.get("style") ?? "");
  const styleNote = String(formData.get("styleNote") ?? "").trim();
  const values = { title, style, styleNote };

  // 서버 액션은 화면과 별개로 직접 호출될 수 있으므로 여기서 다시 로그인 확인
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const errors: Partial<Record<CreateSeriesField, string>> = {};
  if (!title) errors.title = "시리즈 제목을 입력해 주세요.";
  else if (title.length > 100) errors.title = "제목은 100자 이하로 써 주세요.";
  if (!SERIES_STYLES.includes(style as SeriesStyle)) errors.style = "화풍을 골라 주세요.";
  if (styleNote.length > 500) errors.styleNote = "스타일 메모는 500자 이하로 써 주세요.";
  if (Object.keys(errors).length > 0) return { errors, values };

  const supabase = await createClient();
  // owner_id는 DB 기본값(auth.uid())으로 채워지고, RLS가 본인인지 다시 확인한다
  const { error } = await supabase
    .from("series")
    .insert({ title, style, style_note: styleNote || null });

  if (error) {
    console.error("createSeries", error);
    const missing = error.code === "PGRST205" || error.code === "42P01";
    const noPermission = error.code === "42501";
    return {
      message: missing
        ? "DB에 series 테이블이 없습니다. supabase/migrations의 SQL을 먼저 실행해 주세요."
        : noPermission
          ? "series 테이블 권한이 없습니다. supabase/migrations/20261120000100_grant_series.sql을 실행해 주세요."
          : "시리즈를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
      values,
    };
  }

  revalidatePath("/");
  redirect("/");
}
