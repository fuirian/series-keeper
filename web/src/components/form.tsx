import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export const inputClass =
  "w-full rounded-md border border-black/15 bg-surface px-3 py-2 text-sm outline-none focus:border-primary-strong focus:ring-2 focus:ring-primary/40 dark:border-white/20 aria-[invalid=true]:border-red-500";

export const submitClass =
  "mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50";

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
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Series<span className="text-primary-strong">Keeper</span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
        </div>
      </main>
      <footer className="flex justify-center gap-4 px-4 pb-6 text-xs text-black/50 dark:text-white/50">
        <Link href="/terms" className="hover:underline">
          이용약관
        </Link>
        <Link href="/privacy" className="font-medium hover:underline">
          개인정보 처리방침
        </Link>
      </footer>
    </>
  );
}
