import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { STATUS_LABELS } from "@/lib/episode-constants";
import { getEpisodeReport, type CharacterRefs, type ReportIssue } from "@/lib/report";
import { formatTimecode, ISSUE_TYPE_LABELS, REVIEW_LABELS } from "@/lib/report-constants";
import { getSeries } from "@/lib/series";
import { getCurrentUser } from "@/lib/supabase/server";
import { ReviewButtons } from "./review-buttons";

export const metadata: Metadata = {
  title: "검수 리포트 · SeriesKeeper",
};

type Query = { c?: string; show?: string; issue?: string };

/** 필터·선택 상태를 유지한 채 주소를 만든다. */
function reportHref(base: string, q: Query) {
  const params = new URLSearchParams();
  if (q.c) params.set("c", q.c);
  if (q.show) params.set("show", q.show);
  if (q.issue) params.set("issue", q.issue);
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

const REVIEW_STYLES = {
  open: "border-black/15 text-black/60 dark:border-white/20 dark:text-white/60",
  resolved: "border-green-700/40 text-green-800 dark:border-green-400/40 dark:text-green-300",
  false_positive: "border-black/15 text-black/40 line-through dark:border-white/20 dark:text-white/40",
} as const;

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex-1 rounded-lg border border-black/10 p-3 dark:border-white/15">
      <div className="text-xs text-black/50 dark:text-white/50">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${tone === "bad" ? "text-red-700 dark:text-red-300" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function ImageBox({ url, alt, caption, highlight }: { url: string | null; alt: string; caption: string; highlight?: boolean }) {
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-1">
      <figcaption className="text-xs text-black/50 dark:text-white/50">{caption}</figcaption>
      <div
        className={`flex aspect-video items-center justify-center overflow-hidden rounded-md bg-black/5 dark:bg-white/5 ${
          highlight ? "ring-2 ring-red-500" : ""
        }`}
      >
        {url ? (
          // 서명 URL(매번 바뀜)이라 next/image 최적화 대신 그대로 보여 준다
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-black/40 dark:text-white/40">이미지 없음</span>
        )}
      </div>
    </figure>
  );
}

/** 와이어프레임 ⑤: 레퍼런스 ↔ 문제 프레임 ↔ 그 컷 영상 */
function ComparePanel({
  issue,
  refs,
  videoUrl,
  threshold,
  seriesId,
  episodeId,
  prevHref,
  nextHref,
  closeHref,
  position,
}: {
  issue: ReportIssue;
  refs: CharacterRefs;
  videoUrl: string | null;
  threshold: number | null;
  seriesId: string;
  episodeId: string;
  prevHref: string | null;
  nextHref: string | null;
  closeHref: string;
  position: string;
}) {
  const charRefs = issue.character ? (refs[issue.character.id] ?? []) : [];
  const runnerRefs = issue.runner_up ? (refs[issue.runner_up.id] ?? []) : [];
  const shot = issue.shot;
  const videoSrc =
    videoUrl && shot ? `${videoUrl}#t=${(shot.start_ms / 1000).toFixed(1)},${(shot.end_ms / 1000).toFixed(1)}` : null;

  return (
    <section
      id="compare"
      className="mb-8 flex flex-col gap-4 rounded-lg border-2 border-foreground/80 p-4"
      aria-label="이슈 비교"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-black/50 dark:text-white/50">이슈 {position}</p>
          <h2 className="text-lg font-semibold">
            {shot ? `${formatTimecode(shot.start_ms)}–${formatTimecode(shot.end_ms)}` : formatTimecode(issue.time_ms)}{" "}
            · {issue.character?.name ?? "삭제된 캐릭터"} · {ISSUE_TYPE_LABELS[issue.type] ?? issue.type}
          </h2>
        </div>
        <Link href={closeHref} scroll={false} className="rounded-md px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10">
          ✕ 닫기
        </Link>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <ImageBox
          url={charRefs[0]?.url ?? null}
          alt={`${issue.character?.name ?? ""} 레퍼런스`}
          caption={`레퍼런스 — ${issue.character?.name ?? "?"}`}
        />
        <ImageBox
          url={issue.frame_url}
          alt="문제 프레임"
          caption={`${formatTimecode(issue.time_ms)} — 검출된 얼굴 (빨간 박스)`}
          highlight
        />
        {issue.type === "ambiguous" && issue.runner_up ? (
          <ImageBox
            url={runnerRefs[0]?.url ?? null}
            alt={`${issue.runner_up.name} 레퍼런스`}
            caption={`헷갈린 인물 — ${issue.runner_up.name}`}
          />
        ) : (
          <figure className="flex min-w-0 flex-1 flex-col gap-1">
            <figcaption className="text-xs text-black/50 dark:text-white/50">그 컷 영상</figcaption>
            {videoSrc ? (
              <video src={videoSrc} controls preload="metadata" className="aspect-video w-full rounded-md bg-black">
                <track kind="captions" />
              </video>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-md bg-black/5 text-xs text-black/40 dark:bg-white/5">
                영상 없음
              </div>
            )}
          </figure>
        )}
      </div>

      {charRefs.length > 1 && (
        <div className="flex gap-2">
          {charRefs.slice(1).map((r) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={r.angle} src={r.url} alt={`${r.angle} 레퍼런스`} className="h-16 w-16 rounded object-cover" />
          ))}
          <span className="self-end text-xs text-black/40 dark:text-white/40">다른 각도 레퍼런스</span>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          유사도 <strong className="text-red-700 dark:text-red-300">{issue.similarity.toFixed(2)}</strong>
          {threshold != null && <span className="text-black/50 dark:text-white/50"> (기준 {threshold.toFixed(2)})</span>}
          {issue.type === "ambiguous" && issue.runner_up && issue.runner_up_similarity != null && (
            <span className="text-black/50 dark:text-white/50">
              {" "}
              · {issue.runner_up.name} {issue.runner_up_similarity.toFixed(2)}
            </span>
          )}
        </p>
        <ReviewButtons
          seriesId={seriesId}
          episodeId={episodeId}
          issueId={issue.id}
          review={issue.review}
          nextHref={nextHref}
        />
      </div>

      <div className="flex justify-between text-sm">
        {prevHref ? (
          <Link href={prevHref} scroll={false} className="hover:underline">
            ◀ 이전 이슈
          </Link>
        ) : (
          <span />
        )}
        {nextHref && (
          <Link href={nextHref} scroll={false} className="hover:underline">
            다음 이슈 ▶
          </Link>
        )}
      </div>
    </section>
  );
}

async function Report({
  params,
  searchParams,
}: {
  params: PageProps<"/series/[id]/episodes/[episodeId]">["params"];
  searchParams: PageProps<"/series/[id]/episodes/[episodeId]">["searchParams"];
}) {
  const [{ id: seriesId, episodeId }, rawQuery] = await Promise.all([params, searchParams]);
  const query: Query = {
    c: typeof rawQuery.c === "string" ? rawQuery.c : undefined,
    show: rawQuery.show === "all" ? "all" : undefined, // 기본은 미처리만
    issue: typeof rawQuery.issue === "string" ? rawQuery.issue : undefined,
  };

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const series = await getSeries(seriesId);
  if (!series) notFound();

  const report = await getEpisodeReport(seriesId, episodeId);
  if (!report.ok && report.reason === "not_found") notFound();

  const base = `/series/${seriesId}/episodes/${episodeId}`;
  const back = (
    <Link href={`/series/${seriesId}?tab=episodes`} className="text-sm text-black/50 hover:text-foreground dark:text-white/50">
      ← {series.title} 회차 목록
    </Link>
  );

  if (!report.ok) {
    return (
      <>
        {back}
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {report.reason === "needs_migration"
            ? "리포트에 필요한 DB 구조가 없습니다. supabase/migrations의 20261120000500, 20261120000600 SQL을 실행해 주세요."
            : "리포트를 불러오지 못했습니다. 잠시 후 새로고침해 주세요."}
        </p>
      </>
    );
  }

  const { episode, issues, refs } = report;
  const heading = `${episode.number}화${episode.title ? ` · ${episode.title}` : ""} 검수 리포트`;

  if (episode.status !== "done") {
    return (
      <>
        {back}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="mt-4 text-sm text-black/60 dark:text-white/60">
          {episode.status === "failed"
            ? `검사에 실패했습니다: ${episode.analysis_error ?? "이유 없음"}`
            : episode.status === "uploaded"
              ? "아직 검사하지 않은 회차입니다. 회차 목록에서 '검사하기'를 눌러 주세요."
              : `아직 리포트가 없습니다 (${STATUS_LABELS[episode.status]}). 검사가 끝나면 여기에 표시됩니다.`}
        </p>
      </>
    );
  }

  const summary = episode.analysis_summary ?? {};
  const threshold = summary.thresholds?.issue_below ?? null;
  const handled = issues.filter((i) => i.review !== "open").length;
  const falsePositives = issues.filter((i) => i.review === "false_positive").length;

  // 필터
  const characters = [...new Map(issues.filter((i) => i.character).map((i) => [i.character!.id, i.character!])).values()];
  const visible = issues.filter(
    (i) => (!query.c || i.character?.id === query.c) && (query.show === "all" || i.review === "open"),
  );

  // 선택한 이슈 (필터에 걸려 안 보이는 이슈여도 주소로 열 수 있게 전체에서 찾는다)
  const selected = query.issue ? issues.find((i) => i.id === query.issue) : undefined;
  const pos = selected ? visible.findIndex((i) => i.id === selected.id) : -1;
  const hrefFor = (issueId?: string) => reportHref(base, { ...query, issue: issueId });
  const prevHref = pos > 0 ? hrefFor(visible[pos - 1].id) : null;
  const nextHref = pos >= 0 && pos < visible.length - 1 ? hrefFor(visible[pos + 1].id) : null;

  return (
    <>
      {back}
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
        {summary.elapsed_s != null && `분석 ${summary.elapsed_s}초`}
        {threshold != null && ` · 유사도 기준 ${threshold.toFixed(2)}`}
      </p>

      <div className="my-6 flex flex-col gap-3 sm:flex-row">
        <StatCard label="전체 컷" value={String(summary.shots ?? "–")} />
        <StatCard label="이슈" value={String(issues.length)} tone={issues.length > 0 ? "bad" : undefined} />
        <StatCard label="처리" value={`${handled} / ${issues.length}`} />
        <StatCard label="오탐" value={String(falsePositives)} />
      </div>

      {selected && (
        <ComparePanel
          issue={selected}
          refs={refs}
          videoUrl={episode.video_url}
          threshold={threshold}
          seriesId={seriesId}
          episodeId={episodeId}
          prevHref={prevHref}
          nextHref={nextHref}
          closeHref={hrefFor(undefined)}
          position={pos >= 0 ? `${pos + 1} / ${visible.length}` : "(필터 밖)"}
        />
      )}

      {issues.length === 0 ? (
        <p className="rounded-lg border border-black/10 px-4 py-10 text-center text-sm dark:border-white/15">
          이 회차에서는 일관성이 깨진 컷을 찾지 못했습니다. 🎉
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-black/50 dark:text-white/50">캐릭터</span>
            <Link
              href={reportHref(base, { show: query.show })}
              className={`rounded-full border px-3 py-0.5 ${!query.c ? "border-foreground font-medium" : "border-black/15 dark:border-white/20"}`}
            >
              전체
            </Link>
            {characters.map((c) => (
              <Link
                key={c.id}
                href={reportHref(base, { c: c.id, show: query.show })}
                className={`rounded-full border px-3 py-0.5 ${query.c === c.id ? "border-foreground font-medium" : "border-black/15 dark:border-white/20"}`}
              >
                {c.name}
              </Link>
            ))}
            <span className="ml-2 text-black/50 dark:text-white/50">|</span>
            <Link
              href={reportHref(base, { c: query.c, show: query.show === "all" ? undefined : "all" })}
              className="rounded-full border border-black/15 px-3 py-0.5 dark:border-white/20"
            >
              {query.show === "all" ? "☐ 미처리만" : "☑ 미처리만"}
            </Link>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-black/50 dark:text-white/50">
              조건에 맞는 이슈가 없습니다. 모든 이슈를 보려면 &lsquo;미처리만&rsquo;을 끄세요.
            </p>
          ) : (
            <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/15 dark:border-white/15">
              {visible.map((i) => (
                <li key={i.id}>
                  <Link
                    href={hrefFor(i.id)}
                    scroll={false}
                    className={`flex items-center gap-3 p-3 hover:bg-black/5 dark:hover:bg-white/5 ${
                      selected?.id === i.id ? "bg-black/5 dark:bg-white/10" : ""
                    }`}
                  >
                    <div className="h-12 w-20 shrink-0 overflow-hidden rounded bg-black/5 dark:bg-white/5">
                      {i.frame_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.frame_url} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium tabular-nums">
                          {i.shot ? `${formatTimecode(i.shot.start_ms)}–${formatTimecode(i.shot.end_ms)}` : formatTimecode(i.time_ms)}
                        </span>
                        <span>{i.character?.name ?? "삭제된 캐릭터"}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${REVIEW_STYLES[i.review]}`}>
                          {REVIEW_LABELS[i.review]}
                        </span>
                      </div>
                      <p className="truncate text-xs text-black/50 dark:text-white/50">
                        {ISSUE_TYPE_LABELS[i.type] ?? i.type}
                        {i.type === "ambiguous" && i.runner_up && ` (${i.runner_up.name}와 헷갈림)`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-red-600/40 px-2 py-0.5 text-xs tabular-nums text-red-700 dark:border-red-400/40 dark:text-red-300">
                      {i.similarity.toFixed(2)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

export default function ReportPage({ params, searchParams }: PageProps<"/series/[id]/episodes/[episodeId]">) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <Suspense fallback={<p className="text-sm text-black/50 dark:text-white/50">리포트를 불러오는 중…</p>}>
            <Report params={params} searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
