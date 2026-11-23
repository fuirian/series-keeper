import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/supabase/server";

const ghostButton =
  "rounded-md px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10";

/** 세션(쿠키)을 읽으므로 Suspense 안에서 요청 때 렌더링된다. */
async function UserMenu() {
  const user = await getCurrentUser();

  if (user) {
    return (
      <>
        <span className="mr-2 hidden truncate text-sm text-black/60 sm:inline dark:text-white/60">
          {user.email ?? "로그인됨"}
        </span>        <form action={logout}>
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
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
      >
        회원가입
      </Link>
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="flex h-[4.25rem] items-center justify-between gap-2 border-b border-black/5 px-4 sm:px-6 dark:border-white/10">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Series<span className="text-primary-strong">Keeper</span>
      </Link>
      <div className="flex min-w-0 items-center gap-2">
        <ThemeToggle />
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}
