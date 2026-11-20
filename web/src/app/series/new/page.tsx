import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/supabase/server";
import { NewSeriesForm } from "./new-series-form";

export const metadata: Metadata = {
  title: "새 시리즈 · SeriesKeeper",
};

/** 로그인하지 않았으면 로그인 화면으로 보낸다. */
async function RequireLogin({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return children;
}

export default function NewSeriesPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">새 시리즈</h1>
          <p className="mb-6 text-sm text-black/60 dark:text-white/60">
            캐릭터·장소 레퍼런스와 회차는 시리즈를 만든 뒤 등록합니다.
          </p>
          <Suspense fallback={null}>
            <RequireLogin>
              <NewSeriesForm />
            </RequireLogin>
          </Suspense>
        </div>
      </main>
    </>
  );
}
