import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { getSeries, STYLE_LABELS, type Series } from "@/lib/series";
import { getCurrentUser } from "@/lib/supabase/server";
import { CharactersTab } from "./characters-tab";
import { DeleteSeriesButton, SeriesSettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "시리즈 · SeriesKeeper",
};

const TABS = [
  { key: "episodes", label: "회차" },
  { key: "characters", label: "캐릭터" },
  { key: "locations", label: "장소" },
  { key: "settings", label: "설정" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

function Tabs({ seriesId, active }: { seriesId: string; active: TabKey }) {
  return (
    <nav className="mb-6 flex gap-6 overflow-x-auto border-b border-black/10 dark:border-white/15">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.key === "episodes" ? `/series/${seriesId}` : `/series/${seriesId}?tab=${tab.key}`}
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

function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-black/15 px-4 py-16 text-center dark:border-white/20">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-black/60 dark:text-white/60">{description}</p>
      <span className="mt-4 rounded-full bg-black/5 px-3 py-1 text-xs text-black/50 dark:bg-white/10 dark:text-white/50">
        준비 중
      </span>
    </div>
  );
}

function TabContent({ series, tab, userId }: { series: Series; tab: TabKey; userId: string }) {
  switch (tab) {
    case "episodes":
      return (
        <ComingSoon
          title="아직 회차가 없습니다"
          description="회차 영상을 올리면 컷을 나누고, 캐릭터가 바이블과 다르게 나온 컷을 찾아 리포트로 보여 줍니다."
        />
      );
    case "characters":
      return <CharactersTab seriesId={series.id} userId={userId} />;
    case "locations":
      return (
        <ComingSoon
          title="등록된 장소가 없습니다"
          description="자주 나오는 장소의 레퍼런스 이미지와 배치 메모를 등록합니다."
        />
      );
    case "settings":
      return (
        <div className="flex max-w-lg flex-col gap-10">
          <SeriesSettingsForm
            initial={{
              id: series.id,
              title: series.title,
              style: series.style,
              styleNote: series.style_note ?? "",
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

  const tab: TabKey = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "episodes";

  return (
    <>
      <div className="mb-6">
        <Link href="/" className="text-sm text-black/50 hover:text-foreground dark:text-white/50">
          ← 내 시리즈
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
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

      <Tabs seriesId={series.id} active={tab} />
      <TabContent series={series} tab={tab} userId={user.id} />
    </>
  );
}

export default function SeriesPage({ params, searchParams }: PageProps<"/series/[id]">) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <Suspense fallback={<p className="text-sm text-black/50 dark:text-white/50">불러오는 중…</p>}>
            <SeriesDetail params={params} searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
