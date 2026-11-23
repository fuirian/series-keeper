import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { getSeries, STYLE_LABELS, type Series } from "@/lib/series";
import { getCurrentUser } from "@/lib/supabase/server";
import { CharactersTab } from "./characters-tab";
import { CoverField } from "./cover-field";
import { EpisodesTab } from "./episodes-tab";
import { LocationsTab } from "./locations-tab";
import { DeleteSeriesButton, SeriesSettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "시리즈 · SeriesKeeper",
};

// 작업 순서대로: 캐릭터·장소를 먼저 등록하고, 회차(검사)는 마지막에 한다.
const TABS = [
  { key: "characters", label: "캐릭터" },
  { key: "locations", label: "장소" },
  { key: "episodes", label: "회차" },
  { key: "settings", label: "설정" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const DEFAULT_TAB: TabKey = TABS[0].key;

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

function Tabs({ seriesId, active }: { seriesId: string; active: TabKey }) {
  return (
    <nav className="mb-6 flex gap-6 overflow-x-auto border-b border-black/10 dark:border-white/15">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.key === DEFAULT_TAB ? `/series/${seriesId}` : `/series/${seriesId}?tab=${tab.key}`}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 py-2 text-sm ${
              isActive
                ? "border-foreground font-semibold"
                : "border-transparent text-black/50 hover:text-foreground dark:text-white/50"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function TabContent({ series, tab, userId }: { series: Series; tab: TabKey; userId: string }) {
  switch (tab) {
    case "episodes":
      return <EpisodesTab seriesId={series.id} userId={userId} />;
    case "characters":
      return <CharactersTab seriesId={series.id} userId={userId} />;
    case "locations":
      return <LocationsTab seriesId={series.id} userId={userId} />;
    case "settings":
      return (
        <div className="flex max-w-lg flex-col gap-10">
          <CoverField userId={userId} seriesId={series.id} coverUrl={series.cover_url ?? null} />
          <SeriesSettingsForm
            initial={{
              id: series.id,
              title: series.title,
              style: series.style,
              styleNote: series.style_note ?? "",
              stylePrompt: series.style_prompt ?? "",
            }}
          />
          <section className="rounded-lg border border-red-600/30 p-4 dark:border-red-400/30">
            <h3 className="font-semibold text-red-700 dark:text-red-300">시리즈 삭제</h3>
            <p className="mb-4 mt-1 text-sm text-black/60 dark:text-white/60">
              시리즈와 그 안의 모든 정보가 삭제되며 되돌릴 수 없습니다.
            </p>
            <DeleteSeriesButton id={series.id} title={series.title} />
          </section>
        </div>
      );
  }
}

/** params·searchParams·세션을 모두 읽으므로 Suspense 안에서 요청 때 렌더링된다. */
async function SeriesDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/series/[id]">["params"];
  searchParams: PageProps<"/series/[id]">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const series = await getSeries(id);
  if (!series) notFound(); // 없거나 다른 사람 시리즈

  const tab: TabKey = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : DEFAULT_TAB;

  return (
    <>
      <div className="mb-6">
        <Link href="/" className="text-sm text-black/50 hover:text-foreground dark:text-white/50">
          ← 내 시리즈
        </Link>
        <div className="mt-2 flex items-start gap-4">
          {series.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={series.cover_url}
              alt=""
              className="hidden aspect-video w-32 shrink-0 rounded-md object-cover sm:block"
            />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{series.title}</h1>
              <span className="rounded-full border border-black/15 px-2 py-0.5 text-xs dark:border-white/20">
                {STYLE_LABELS[series.style] ?? series.style}
              </span>
            </div>
            {series.style_note && (
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">{series.style_note}</p>
            )}
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              {dateFormat.format(new Date(series.created_at))} 생성
            </p>
          </div>
        </div>
      </div>

      <Tabs seriesId={series.id} active={tab} />
      <TabContent series={series} tab={tab} userId={user.id} />
    </>
  );
}

export default function SeriesPage({ params, searchParams }: PageProps<"/series/[id]">) {
  return (
    <>
      <AppShell mainClassName="flex flex-1 flex-col px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <Suspense fallback={<p className="text-sm text-black/50 dark:text-white/50">불러오는 중…</p>}>
            <SeriesDetail params={params} searchParams={searchParams} />
          </Suspense>
        </div>
      </AppShell>
    </>
  );
}
