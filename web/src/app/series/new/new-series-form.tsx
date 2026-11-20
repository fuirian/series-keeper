"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createSeries } from "@/app/actions/series";
import { FormMessage, submitClass } from "@/components/form";
import { SeriesFields } from "@/components/series-fields";

export function NewSeriesForm() {
  const [state, action, pending] = useActionState(createSeries, undefined);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <SeriesFields values={state?.values} errors={state?.errors} />

      <FormMessage message={state?.message} />

      <div className="flex gap-2">
        <Link
          href="/"
          className="mt-2 flex-1 rounded-md border border-black/15 px-4 py-2 text-center text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          취소
        </Link>
        <button type="submit" disabled={pending} className={`${submitClass} flex-1`}>
          {pending ? "만드는 중…" : "시리즈 만들기"}
        </button>
      </div>
    </form>
  );
}
