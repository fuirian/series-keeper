import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { apiGet, type Me } from "@/lib/api";
import { getCurrentUser } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "마이페이지 · SeriesKeeper",
};

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" });
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "-");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

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
async function MyPageContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await apiGet<Me>("/v1/me");
  if (!result.ok && result.reason === "unauthorized") redirect("/login");
  const me = result.ok ? result.data : null;

  return (
    <div className="flex flex-col gap-10">
      {!result.ok && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {result.reason === "unreachable"
            ? "백엔드(API) 서버에 연결하지 못했습니다. api 폴더에서 서버를 켜 주세요 (api/README.md)."
            : "내 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요."}
        </p>
      )}

      <Section title="계정">
        <dl className="grid max-w-lg grid-cols-[7rem_1fr] gap-y-2 text-sm">
          <dt className="text-black/50 dark:text-white/50">이메일</dt>
          <dd className="truncate">{me?.email ?? user.email ?? "-"}</dd>
          <dt className="text-black/50 dark:text-white/50">가입일</dt>
          <dd>{formatDate(me?.created_at ?? null)}</dd>
          <dt className="text-black/50 dark:text-white/50">이메일 인증</dt>
          <dd>
            {me?.email_confirmed_at ? (
              <span className="text-green-800 dark:text-green-300">완료 ({formatDate(me.email_confirmed_at)})</span>
            ) : me ? (
              "미완료"
            ) : (
              "-"
            )}
          </dd>
        </dl>
      </Section>

      {me && (
        <Section title="사용량">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="시리즈" value={me.usage.series} />
            <Stat label="캐릭터" value={me.usage.characters} />
            <Stat label="회차" value={me.usage.episodes} />
            <Stat label="검사 완료 회차" value={me.usage.checked_episodes} />
            <Stat label="미처리 이슈" value={me.usage.open_issues} highlight={me.usage.open_issues > 0} />
          </div>
        </Section>
      )}

      <Section title="비밀번호 변경">
        <PasswordForm />
      </Section>
    </div>
  );
}

export default function MyPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-8">
            <Link href="/" className="text-sm text-black/50 hover:text-foreground dark:text-white/50">
              ← 내 시리즈
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">마이페이지</h1>
          </div>
          <Suspense fallback={<p className="text-sm text-black/50 dark:text-white/50">불러오는 중…</p>}>
            <MyPageContent />
          </Suspense>
        </div>
      </main>
    </>
  );
}
