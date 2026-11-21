import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";

/** 이용약관·개인정보 처리방침 공통 틀. 로그인 없이 볼 수 있다. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <header className="px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          SeriesKeeper
        </Link>
      </header>
      <main className="flex-1 px-4 pb-16">
        <article className="mx-auto w-full max-w-2xl text-sm leading-relaxed">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-8 text-black/60 dark:text-white/60">시행일: {LEGAL.effectiveDate}</p>
          <div className="flex flex-col gap-8">{children}</div>
          <nav className="mt-12 flex gap-4 border-t border-black/10 pt-6 text-black/60 dark:border-white/15 dark:text-white/60">
            <Link href="/terms" className="underline underline-offset-4">
              이용약관
            </Link>
            <Link href="/privacy" className="underline underline-offset-4">
              개인정보 처리방침
            </Link>
          </nav>
        </article>
      </main>
    </>
  );
}

export function Clause({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <div className="flex flex-col gap-2 text-black/80 dark:text-white/80">{children}</div>
    </section>
  );
}

export function Items({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>;
}

export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>;
}

export function LegalTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border border-black/15 bg-black/[0.03] px-3 py-2 font-medium dark:border-white/20 dark:bg-white/[0.05]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="whitespace-pre-line border border-black/15 px-3 py-2 align-top dark:border-white/20">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
