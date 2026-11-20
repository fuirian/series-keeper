"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEpisode } from "@/app/actions/episodes";

/** 회차 행의 미리보기·삭제 버튼. */
export function EpisodeRowActions({
  seriesId,
  episodeId,
  label,
  videoUrl,
}: {
  seriesId: string;
  episodeId: string;
  label: string;
  videoUrl: string | null;
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

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-1">
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
          disabled
          title="분석 기능을 붙이면 열립니다"
          className="rounded-md px-2 py-1 text-xs text-black/30 dark:text-white/30"
        >
          리포트
        </button>
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
