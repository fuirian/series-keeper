"use client";

import { useActionState } from "react";
import { deleteSeries, updateSeries } from "@/app/actions/series";
import { FormMessage, submitClass } from "@/components/form";
import { SeriesFields } from "@/components/series-fields";

type Initial = { id: string; title: string; style: string; styleNote: string };

export function SeriesSettingsForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState(updateSeries, undefined);
  const values = state?.values ?? initial;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="id" value={initial.id} />
      <SeriesFields values={values} errors={state?.errors} />
      <FormMessage message={state?.message} />
      <div>
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? "저장 중…" : "변경사항 저장"}
        </button>
      </div>
    </form>
  );
}

export function DeleteSeriesButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteSeries}
      onSubmit={(e) => {
        if (!window.confirm(`"${title}" 시리즈를 삭제할까요? 되돌릴 수 없습니다.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-md border border-red-600/40 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-400/40 dark:text-red-300 dark:hover:bg-red-950/40"
      >
        시리즈 삭제
      </button>
    </form>
  );
}
