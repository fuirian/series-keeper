import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ApiErrorNotice, PageTitle, Section } from "@/components/page-parts";
import { apiGet, type Me } from "@/lib/api";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "사용량 · SeriesKeeper",
};

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${highlight ? "text-red-700 dark:text-red-300" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

/** 세션을 읽고 백엔드를 부르므로 Suspense 안에서 요청 때 렌더링된다. */
async function UsageContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await apiGet<Me>("/v1/me");
  if (!result.ok && result.reason === "unauthorized") redirect("/login");
  if (!result.ok) return <ApiErrorNotice result={result} />;
  const { usage } = result.data;

  return (
    <div className="flex flex-col gap-10">
      <Section title="만든 것">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="시리즈" value={usage.series} />
          <Stat label="캐릭터" value={usage.characters} />
          <Stat label="회차" value={usage.episodes} />
        </div>
      </Section>

      <Section title="검사">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="검사 완료 회차" value={usage.checked_episodes} />
          <Stat label="미처리 이슈" value={usage.open_issues} highlight={usage.open_issues > 0} />
        </div>
      </Section>
    </div>
  );
}

export default function UsagePage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl">
        <PageTitle title="사용량" description="지금까지 만든 시리즈와 검사 현황입니다." />
        <Suspense fallback={<p className="text-sm text-black/50 dark:text-white/50">불러오는 중…</p>}>
          <UsageContent />
        </Suspense>
      </div>
    </AppShell>
  );
}
