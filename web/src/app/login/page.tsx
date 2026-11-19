import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/components/form";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인 · SeriesKeeper",
};

const NOTICES: Record<string, string> = {
  confirm: "인증 링크가 만료되었거나 올바르지 않습니다. 다시 로그인하거나 가입해 주세요.",
};

/** 주소의 ?error=... 를 읽으므로 Suspense 안에서 요청 때 렌더링된다. */
async function LoginFormWithNotice({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { error } = await searchParams;
  const notice = typeof error === "string" ? NOTICES[error] : undefined;
  return <LoginForm notice={notice} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthLayout title="로그인">
      <Suspense fallback={<LoginForm />}>
        <LoginFormWithNotice searchParams={searchParams} />
      </Suspense>
    </AuthLayout>
  );
}
