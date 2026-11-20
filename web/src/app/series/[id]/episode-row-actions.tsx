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
  canReanalyze,
  reportHref,
}: {
  seriesId: string;
  episodeId: string;
  label: string;
  videoUrl: string | null;
  canReanalyze: boolean;
  reportHref: string | null; // 분석이 끝난 회차만
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
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-1">
        {canReanalyze && (
          <button
            type="button"
            onClick={handleReanalyze}
            disabled={isPending}
            className="rounded-md px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          >
            다시 분석
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
        {reportHref ? (
          <Link
            href={reportHref}
            className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background hover:opacity-90"
          >
            리포트
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title="분석이 끝나면 열립니다"
            className="rounded-md px-2 py-1 text-xs text-black/30 dark:text-white/30"
          >
            리포트
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
