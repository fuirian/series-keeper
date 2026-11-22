"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEpisode, requestAnalysis } from "@/app/actions/episodes";

/** 회차 행의 미리보기·삭제 버튼. */
export function EpisodeRowActions({
  seriesId,
  episodeId,
  label,
  videoUrl,
  requestLabel,
  reportHref,
  issueCount,
}: {
  seriesId: string;
  episodeId: string;
  label: string;
  videoUrl: string | null;
  requestLabel: string | null; // "검사하기" | "다시 검사" | null(검사 대기·중)
  reportHref: string | null; // 분석이 끝난 회차만
  issueCount?: number | null; // 리포트 버튼에 보여 줄 이슈 수
}) {
  const router = useRouter();
  const [showVideo, setShowVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`${label}를 삭제할까요? 영상 파일도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteEpisode({ seriesId, episodeId });
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  function handleReanalyze() {
    setError(null);
    startTransition(async () => {
      const result = await requestAnalysis({ seriesId, episodeId });
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {/* 검사가 끝난 회차의 가장 중요한 다음 행동: 리포트 보기 */}
      {reportHref && (
        <Link
          href={reportHref}
          className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90 ${
            issueCount && issueCount > 0
              ? "bg-red-600 text-white dark:bg-red-500"
              : "bg-foreground text-background"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <path d="M14 3v6h6M8 13h8M8 17h5" />
          </svg>
          검수 리포트 보기
          {issueCount != null && (
            <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-medium">
              {issueCount > 0 ? `이슈 ${issueCount}` : "이슈 없음"}
            </span>
          )}
          <span aria-hidden>→</span>
        </Link>
      )}
      <div className="flex justify-end gap-1">
        {requestLabel && (
          <button
            type="button"
            onClick={handleReanalyze}
            disabled={isPending}
            className={
              requestLabel === "검사하기"
                ? "rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
                : "rounded-md px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
            }
          >
            {isPending ? "요청 중…" : requestLabel}
          </button>
        )}
        {videoUrl && (
          <button
            type="button"
            onClick={() => setShowVideo((v) => !v)}
            className="rounded-md px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
          >
            {showVideo ? "닫기" : "미리보기"}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          {isPending ? "삭제 중…" : "삭제"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {showVideo && videoUrl && (
        <video src={videoUrl} controls preload="metadata" className="w-full max-w-md rounded-md bg-black">
          <track kind="captions" />
        </video>
      )}
    </div>
  );
}
