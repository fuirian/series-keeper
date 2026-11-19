import Link from "next/link";

export default function Home() {
  return (
    <>
      <header className="flex justify-end gap-2 px-4 py-4 sm:px-6">
        <Link
          href="/login"
          className="rounded-md px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
        >
          로그인
        </Link>
        <Link
          href="/signup"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          회원가입
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          SeriesKeeper
        </h1>
      </main>
    </>
  );
}
