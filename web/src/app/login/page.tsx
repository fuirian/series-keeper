import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/components/form";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인 · SeriesKeeper",
};

const NOTICES: Record<string, string> = {
  verified: "이메일 인증이 완료되었습니다. 가입한 이메일과 비밀번호로 로그인해 주세요.",
  expired: "인증 링크가 만료되었거나 이미 사용되었습니다. 이미 인증했다면 로그인하고, 아니면 다시 가입해 주세요.",
  confirm: "인증 링크가 올바르지 않습니다. 이미 인증했다면 로그인하고, 아니면 다시 가입해 주세요.",
};

/** 주소의 ?notice=... 를 읽으므로 Suspense 안에서 요청 때 렌더링된다. */
async function LoginFormWithNotice({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const query = await searchParams;
  const key = query.notice ?? query.error; // error=는 예전 링크 호환
  const notice = typeof key === "string" ? NOTICES[key] : undefined;
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
