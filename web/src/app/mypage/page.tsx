import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ApiErrorNotice, PageTitle, Section } from "@/components/page-parts";
import { apiGet, type Me } from "@/lib/api";
import { getCurrentUser } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "마이페이지 · SeriesKeeper",
};

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" });
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "-");

/** 세션을 읽고 백엔드를 부르므로 Suspense 안에서 요청 때 렌더링된다. */
async function MyPageContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await apiGet<Me>("/v1/me");
  if (!result.ok && result.reason === "unauthorized") redirect("/login");
  const me = result.ok ? result.data : null;

  return (
    <div className="flex flex-col gap-10">
      <ApiErrorNotice result={result} />

      <Section title="계정">
        <dl className="grid max-w-lg grid-cols-[7rem_1fr] gap-y-2 text-sm">
          <dt className="text-black/50 dark:text-white/50">이메일</dt>
          <dd className="truncate">{me?.email ?? user.email ?? "-"}</dd>
          <dt className="text-black/50 dark:text-white/50">가입일</dt>
          <dd>{formatDate(me?.created_at ?? null)}</dd>
          <dt className="text-black/50 dark:text-white/50">이메일 인증</dt>
          <dd>
            {me?.email_confirmed_at ? (
              <span className="text-teal-800 dark:text-teal-300">완료 ({formatDate(me.email_confirmed_at)})</span>
            ) : me ? (
              "미완료"
            ) : (
              "-"
            )}
          </dd>
        </dl>
      </Section>

      <Section title="비밀번호 변경">
        <PasswordForm />
      </Section>
    </div>
  );
}

export default function MyPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl">
        <PageTitle title="마이페이지" />
        <Suspense fallback={<p className="text-sm text-black/50 dark:text-white/50">불러오는 중…</p>}>
          <MyPageContent />
        </Suspense>
      </div>
    </AppShell>
  );
}
