"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ISSUE_REVIEWS, type IssueReview } from "@/lib/report-constants";
import { isUuid } from "@/lib/series";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type ReviewResult = { ok: true } | { ok: false; message: string };

/** 이슈 검토 상태(미처리·해결됨·오탐)를 바꾼다. 본인 이슈인지는 RLS가 확인한다. */
export async function setIssueReview(input: {
  seriesId: string;
  episodeId: string;
  issueId: string;
  review: string;
}): Promise<ReviewResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { seriesId, episodeId, issueId, review } = input;
  if (!isUuid(seriesId) || !isUuid(episodeId) || !isUuid(issueId) || !ISSUE_REVIEWS.includes(review as IssueReview)) {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("issue").update({ review }).eq("id", issueId).select("id");

  if (error) {
    console.error("setIssueReview", error);
    if (error.code === "42703")
      return { ok: false, message: "검토 상태 SQL이 아직 적용되지 않았습니다. 20261120000600_issue_review.sql을 실행해 주세요." };
    return { ok: false, message: "저장하지 못했습니다." };
  }
  if (!data || data.length === 0) return { ok: false, message: "이슈를 찾을 수 없습니다." };

  revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
  return { ok: true };
}
