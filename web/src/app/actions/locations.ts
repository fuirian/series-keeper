"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prepareImageCleanup } from "@/lib/references";
import { isUuid } from "@/lib/series";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type LocationField = "name" | "description" | "layoutNote";

export type LocationFormState = {
  errors?: Partial<Record<LocationField, string>>;
  message?: string;
  saved?: boolean;
  values?: { name: string; description: string; layoutNote: string };
} | undefined;

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

function readLocationForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const layoutNote = String(formData.get("layoutNote") ?? "").trim();
  const values = { name, description, layoutNote };

  const errors: Partial<Record<LocationField, string>> = {};
  if (!name) errors.name = "장소 이름을 입력해 주세요.";
  else if (name.length > 50) errors.name = "이름은 50자 이하로 써 주세요.";
  if (description.length > 1000) errors.description = "설명은 1000자 이하로 써 주세요.";
  if (layoutNote.length > 1000) errors.layoutNote = "배치 메모는 1000자 이하로 써 주세요.";
  return { values, errors, hasErrors: Object.keys(errors).length > 0 };
}

function dbErrorMessage(code: string | undefined, fallback: string) {
  if (code === "PGRST205" || code === "42P01")
    return "DB에 장소 테이블이 없습니다. supabase/migrations/20261120000300_create_locations.sql을 실행해 주세요.";
  if (code === "42501") return "권한이 없습니다. 본인 시리즈가 맞는지 확인해 주세요.";
  return fallback;
}

const seriesPath = (seriesId: string) => `/series/${seriesId}`;

export async function createLocation(_prev: LocationFormState, formData: FormData): Promise<LocationFormState> {
  await requireUser();
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!isUuid(seriesId)) return { message: "잘못된 요청입니다." };

  const { values, errors, hasErrors } = readLocationForm(formData);
  if (hasErrors) return { errors, values };

  const supabase = await createClient();
  // 남의 시리즈에 넣으려 하면 RLS(insert 정책)가 막는다
  const { error } = await supabase.from("location").insert({
    series_id: seriesId,
    name: values.name,
    description: values.description || null,
    layout_note: values.layoutNote || null,
  });

  if (error) {
    console.error("createLocation", error);
    return { message: dbErrorMessage(error.code, "장소를 추가하지 못했습니다."), values };
  }

  revalidatePath(seriesPath(seriesId));
  return { saved: true };
}

export async function updateLocation(_prev: LocationFormState, formData: FormData): Promise<LocationFormState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!isUuid(id) || !isUuid(seriesId)) return { message: "잘못된 요청입니다." };

  const { values, errors, hasErrors } = readLocationForm(formData);
  if (hasErrors) return { errors, values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("location")
    .update({
      name: values.name,
      description: values.description || null,
      layout_note: values.layoutNote || null,
    })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("updateLocation", error);
    return { message: dbErrorMessage(error.code, "저장하지 못했습니다."), values };
  }
  if (!data || data.length === 0) return { message: "장소를 찾을 수 없습니다.", values };

  revalidatePath(seriesPath(seriesId));
  return { saved: true, values };
}

export async function deleteLocation(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!isUuid(id) || !isUuid(seriesId)) return;

  const supabase = await createClient();
  const cleanupImages = await prepareImageCleanup(supabase, "location", id);

  const { error } = await supabase.from("location").delete().eq("id", id);
  if (error) {
    console.error("deleteLocation", error);
    return;
  }
  await cleanupImages();

  revalidatePath(seriesPath(seriesId));
}
