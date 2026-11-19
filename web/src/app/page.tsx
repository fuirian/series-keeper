import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/supabase/server";

const ghostButton =
  "rounded-md px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10";

/** 세션(쿠키)을 읽으므로 Suspense 안에서 요청 때 렌더링된다. */
async function UserMenu() {
  const user = await getCurrentUser();

  if (user) {
    const email = user.email ?? "로그인됨";
    return (
      <>
        <span className="mr-2 truncate text-sm text-black/60 dark:text-white/60">{email}</span>
        <form action={logout}>
          <button type="submit" className={ghostButton}>
            로그아웃
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <Link href="/login" className={ghostButton}>
        로그인
      </Link>
      <Link
        href="/signup"
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
      >
        회원가입
      </Link>
    </>
  );
}

export default function Home() {
  return (
    <>
      <header className="flex h-[4.25rem] items-center justify-end gap-2 px-4 sm:px-6">
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </header>
      <main className="flex flex-1 items-center justify-center px-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          SeriesKeeper
        </h1>
      </main>
    </>
  );
}
