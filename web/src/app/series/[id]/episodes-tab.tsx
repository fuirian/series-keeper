import { formatBytes, formatDuration, STATUS_LABELS, type EpisodeStatus } from "@/lib/episode-constants";
import { listEpisodes } from "@/lib/episodes";
import { EpisodeRowActions } from "./episode-row-actions";
import { EpisodeUpload } from "./episode-upload";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

const STATUS_STYLES: Record<EpisodeStatus, string> = {
  uploaded: "border-black/15 text-black/60 dark:border-white/20 dark:text-white/60",
  pending: "border-black/15 text-black/60 dark:border-white/20 dark:text-white/60",
  processing: "border-blue-600/40 text-blue-700 dark:border-blue-400/40 dark:text-blue-300",
  done: "border-green-700/40 text-green-800 dark:border-green-400/40 dark:text-green-300",
  failed: "border-red-600/40 text-red-700 dark:border-red-400/40 dark:text-red-300",
};

/** 회차 탭: 영상 업로드 + 회차 목록(분석 상태). */
export async function EpisodesTab({ seriesId, userId }: { seriesId: string; userId: string }) {
  const result = await listEpisodes(seriesId);

  if (!result.ok) {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
        {result.reason === "missing_table"
          ? "DB에 회차 테이블이 없습니다. supabase/migrations/20261120000400_create_episodes.sql을 Supabase SQL Editor에서 실행해 주세요."
          : result.reason === "needs_analysis_migration"
            ? "분석 결과 컬럼이 없습니다. supabase/migrations/20261120000500_create_analysis.sql을 Supabase SQL Editor에서 실행해 주세요."
            : result.reason === "no_permission"
              ? "회차 테이블 권한이 없습니다. 마이그레이션 SQL이 끝까지 실행됐는지 확인해 주세요."
              : "회차를 불러오지 못했습니다. 잠시 후 새로고침해 주세요."}
      </p>
    );
  }

  const { episodes } = result;
  const nextNumber = episodes.length > 0 ? Math.max(...episodes.map((e) => e.number)) + 1 : 1;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-black/60 dark:text-white/60">
        회차 영상을 올리고 <strong>검사하기</strong>를 누르면, 분석 워커가 컷을 나누고 캐릭터가 레퍼런스와 다르게 나온
        컷을 찾습니다. 검사 전에 캐릭터 탭에서 정면 사진을 등록해 주세요.
      </p>

      <EpisodeUpload userId={userId} seriesId={seriesId} nextNumber={nextNumber} />

      {episodes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/15 px-4 py-8 text-center text-sm text-black/50 dark:border-white/20 dark:text-white/50">
          아직 올린 회차가 없습니다. 위에서 영상을 올리면 여기에 회차가 생기고, 회차 옆에 <strong>검사하기</strong> 버튼이
          나옵니다.
        </p>
      ) : (
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/15 dark:border-white/15">
          {episodes.map((ep) => {
            const label = `${ep.number}화`;
            return (
              <li key={ep.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold tabular-nums">{label}</span>
                    {ep.title && <span className="truncate">{ep.title}</span>}
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[ep.status]}`}>
                      {STATUS_LABELS[ep.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                    {formatDuration(ep.duration_ms)} · {formatBytes(ep.size_bytes)} ·{" "}
                    {dateFormat.format(new Date(ep.created_at))} 업로드
                  </p>
                  {ep.status === "done" && ep.analysis_summary && (
                    <p className="mt-1 text-sm">
                      컷 {ep.analysis_summary.shots ?? 0}개 ·{" "}
                      {(ep.analysis_summary.issues ?? 0) > 0 ? (
                        <span className="font-medium text-red-700 dark:text-red-300">
                          이슈 {ep.analysis_summary.issues}개
                        </span>
                      ) : (
                        <span className="text-green-800 dark:text-green-300">이슈 없음</span>
                      )}
                    </p>
                  )}
                  {ep.status === "pending" && (
                    <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                      분석 워커가 차례로 처리합니다. 오래 그대로라면 워커(skpipe worker)가 켜져 있는지 확인해 주세요.
                    </p>
                  )}
                  {ep.status === "failed" && ep.analysis_error && (
                    <p className="mt-1 text-sm text-red-700 dark:text-red-300">{ep.analysis_error}</p>
                  )}
                </div>
                <EpisodeRowActions
                  seriesId={seriesId}
                  episodeId={ep.id}
                  label={label}
                  videoUrl={ep.video_url}
                  requestLabel={
                    ep.status === "uploaded" ? "검사하기" : ep.status === "done" || ep.status === "failed" ? "다시 검사" : null
                  }
                  reportHref={ep.status === "done" ? `/series/${seriesId}/episodes/${ep.id}` : null}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
