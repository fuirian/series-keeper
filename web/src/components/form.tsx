import Link from "next/link";
import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20 aria-[invalid=true]:border-red-500";

export const submitClass =
  "mt-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50";

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
      {message}
    </p>
  );
}

/** 로그인·회원가입 같은 인증 화면 공통 틀: 왼쪽 위 로고 + 가운데 카드 */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <header className="px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          SeriesKeeper
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
        </div>
      </main>
    </>
  );
}
