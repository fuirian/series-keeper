import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { listMySeries, STYLE_LABELS, type Series } from "@/lib/series";
import { getCurrentUser } from "@/lib/supabase/server";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

function SeriesCard({ series }: { series: Series }) {
  return (
    <li>
      <Link
        href={`/series/${series.id}`}
        className="flex h-full flex-col rounded-lg border border-black/10 p-4 transition-colors hover:border-primary-strong dark:border-white/15"
      >
        <div className="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-md bg-black/5 text-xs text-black/40 dark:bg-white/5 dark:text-white/40">
          {series.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={series.cover_url} alt="" className="h-full w-full object-cover" />
          ) : (
            "대표 이미지 없음"
          )}
        </div>
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold">{series.title}</h3>
          <span className="shrink-0 rounded-full border border-black/15 px-2 py-0.5 text-xs dark:border-white/20">
            {STYLE_LABELS[series.style] ?? series.style}
          </span>
        </div>
        {series.style_note && (
          <p className="mt-1 line-clamp-2 text-sm text-black/60 dark:text-white/60">{series.style_note}</p>
        )}
        <p className="mt-auto pt-3 text-xs text-black/50 dark:text-white/50">
          {dateFormat.format(new Date(series.created_at))} 생성
        </p>
      </Link>
    </li>
  );
}

function NewSeriesCard() {
  return (
    <li>
      <Link
        href="/series/new"
        className="flex h-full min-h-48 items-center justify-center rounded-lg border-2 border-dashed border-black/15 text-sm font-medium text-black/60 hover:border-primary-strong hover:text-foreground dark:border-white/20 dark:text-white/60"
      >
        + 새 시리즈 만들기
      </Link>
    </li>
  );
}

async function MySeries() {
  const result = await listMySeries();

  if (!result.ok) {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
        {result.reason === "missing_table"
          ? "DB에 series 테이블이 없습니다. supabase/migrations의 SQL을 Supabase SQL Editor에서 실행해 주세요."
          : result.reason === "no_permission"
            ? "series 테이블 권한이 없습니다. supabase/migrations/20261120000100_grant_series.sql을 실행해 주세요."
            : "시리즈 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요."}
      </p>
    );
  }

  return (
    <>
      {result.series.length === 0 && (
        <p className="mb-4 text-sm text-black/60 dark:text-white/60">
          아직 시리즈가 없습니다. 첫 시리즈를 만들어 캐릭터와 회차를 관리해 보세요.
        </p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.series.map((s) => (
          <SeriesCard key={s.id} series={s} />
        ))}
        <NewSeriesCard />
      </ul>
    </>
  );
}

function Landing() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
        Series<span className="text-primary-strong">Keeper</span>
      </h1>
      <p className="max-w-lg text-black/60 dark:text-white/60">
        AI로 만든 연재물의 캐릭터·장소를 시리즈 단위로 관리하고,
        <br />
        회차마다 달라진 컷을 찾아 줍니다.
      </p>
    </div>
  );
}

/** 로그인 여부에 따라 목록 또는 소개를 보여 준다. */
async function HomeContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const [user, query] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) return <Landing />;

  return (
    <section className="mx-auto w-full max-w-5xl">
      {query.verified === "1" && (
        <p
          role="status"
          className="mb-6 rounded-md bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
        >
          이메일 인증이 완료되었습니다. 가입을 환영합니다!
        </p>
      )}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">내 시리즈</h2>
        <Link
          href="/series/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
        >
          + 새 시리즈
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-black/50 dark:text-white/50">불러오는 중…</p>}>
        <MySeries />
      </Suspense>
    </section>
  );
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <AppShell mainClassName="flex flex-1 flex-col px-4 py-8 sm:px-6">
        <Suspense fallback={null}>
          <HomeContent searchParams={searchParams} />
        </Suspense>
      </AppShell>
    </>
  );
}
