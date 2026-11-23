"use server";

import { revalidatePath } from "next/cache";
import { apiRequest } from "@/lib/api";
import { isUuid } from "@/lib/series";

type Result = { ok: true } | { ok: false; message: string };

function failure(res: { reason: string; detail?: string }, fallback: string): Result {
  if (res.reason === "unreachable") return { ok: false, message: "백엔드에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  if (res.reason === "unauthorized") return { ok: false, message: "로그인이 만료되었습니다. 다시 로그인해 주세요." };
  return { ok: false, message: res.detail ?? fallback };
}

/** 브라우저가 저장소에 올린 대표 이미지를 기록한다 (경로 확인·예전 파일 삭제는 백엔드). */
export async function setSeriesCover(input: { seriesId: string; path: string }): Promise<Result> {
  if (!isUuid(input.seriesId)) return { ok: false, message: "잘못된 요청입니다." };
  const res = await apiRequest("PUT", `/v1/series/${input.seriesId}/cover`, { path: input.path });
  if (!res.ok) return failure(res, "대표 이미지를 저장하지 못했습니다.");
  revalidatePath("/");
  revalidatePath(`/series/${input.seriesId}`);
  return { ok: true };
}

export async function deleteSeriesCover(input: { seriesId: string }): Promise<Result> {
  if (!isUuid(input.seriesId)) return { ok: false, message: "잘못된 요청입니다." };
  const res = await apiRequest("DELETE", `/v1/series/${input.seriesId}/cover`);
  if (!res.ok) return failure(res, "대표 이미지를 지우지 못했습니다.");
  revalidatePath("/");
  revalidatePath(`/series/${input.seriesId}`);
  return { ok: true };
}
