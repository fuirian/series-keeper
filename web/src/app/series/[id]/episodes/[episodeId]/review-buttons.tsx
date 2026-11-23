"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setIssueReview } from "@/app/actions/report";
import { REVIEW_LABELS, type IssueReview } from "@/lib/report-constants";

/** 비교 패널의 검토 버튼: 해결됨(재생성 예정) / 오탐 / 미처리로 되돌리기. */
export function ReviewButtons({
  seriesId,
  episodeId,
  issueId,
  review,
  nextHref,
}: {
  seriesId: string;
  episodeId: string;
  issueId: string;
  review: IssueReview;
  nextHref: string | null; // 표시 후 다음 이슈로 넘어갈 주소
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function mark(next: IssueReview) {
    setError(null);
    startTransition(async () => {
      const result = await setIssueReview({ seriesId, episodeId, issueId, review: next });
      if (!result.ok) return setError(result.message);
      // 처리했으면 다음 이슈로, 되돌렸으면 그 자리에서 새로고침
      if (next !== "open" && nextHref) router.push(nextHref, { scroll: false });
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {review === "open" ? (
          <>
            <button
              type="button"
              onClick={() => mark("false_positive")}
              disabled={isPending}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
            >
              오탐으로 표시
            </button>
            <button
              type="button"
              onClick={() => mark("resolved")}
              disabled={isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
            >
              해결됨 (재생성 예정)
            </button>
          </>
        ) : (
          <>
            <span className="self-center text-sm text-black/60 dark:text-white/60">{REVIEW_LABELS[review]}으로 표시함</span>
            <button
              type="button"
              onClick={() => mark("open")}
              disabled={isPending}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
            >
              미처리로 되돌리기
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
