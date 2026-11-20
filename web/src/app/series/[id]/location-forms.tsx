"use client";

import { useActionState, useState } from "react";
import {
  createLocation,
  deleteLocation,
  updateLocation,
  type LocationFormState,
} from "@/app/actions/locations";
import { FieldError, FormMessage, inputClass, submitClass } from "@/components/form";

type Values = { name?: string; description?: string; layoutNote?: string };
type Errors = { name?: string; description?: string; layoutNote?: string };

function LocationFields({ idPrefix, values, errors = {} }: { idPrefix: string; values?: Values; errors?: Errors }) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-name`} className="mb-1 block text-sm font-medium">
          이름
        </label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          maxLength={50}
          placeholder="예: 하숙집 거실"
          defaultValue={values?.name}
          aria-invalid={!!errors.name}
          aria-describedby={`${idPrefix}-name-error`}
          className={inputClass}
        />
        <FieldError id={`${idPrefix}-name-error`} message={errors.name} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-description`} className="mb-1 block text-sm font-medium">
          설명 <span className="font-normal text-black/50 dark:text-white/50">(선택)</span>
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={2}
          maxLength={1000}
          placeholder="예: 오래된 2층 하숙집의 거실. 따뜻한 나무 바닥, 오후 햇살"
          defaultValue={values?.description}
          aria-invalid={!!errors.description}
          aria-describedby={`${idPrefix}-description-error`}
          className={inputClass}
        />
        <FieldError id={`${idPrefix}-description-error`} message={errors.description} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-layoutNote`} className="mb-1 block text-sm font-medium">
          배치 메모 <span className="font-normal text-black/50 dark:text-white/50">(선택)</span>
        </label>
        <textarea
          id={`${idPrefix}-layoutNote`}
          name="layoutNote"
          rows={3}
          maxLength={1000}
          placeholder="예: 현관문은 화면 왼쪽 벽, 소파는 창가(오른쪽), TV는 소파 맞은편"
          defaultValue={values?.layoutNote}
          aria-invalid={!!errors.layoutNote}
          aria-describedby={`${idPrefix}-layoutNote-error ${idPrefix}-layoutNote-hint`}
          className={inputClass}
        />
        {errors.layoutNote ? (
          <FieldError id={`${idPrefix}-layoutNote-error`} message={errors.layoutNote} />
        ) : (
          <p id={`${idPrefix}-layoutNote-hint`} className="mt-1 text-xs text-black/50 dark:text-white/50">
            문·창문·가구처럼 회차마다 바뀌면 안 되는 위치를 적어 두세요.
          </p>
        )}
      </div>
    </>
  );
}

/** 장소 추가. 성공하면 폼이 비워지고 접힌다. */
export function AddLocationForm({ seriesId, startOpen }: { seriesId: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState(
    async (prev: LocationFormState, formData: FormData) => {
      const result = await createLocation(prev, formData);
      if (result?.saved) setOpen(false); // 추가되면 폼을 접는다
      return result;
    },
    undefined,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
      >
        + 장소 추가
      </button>
    );
  }

  return (
    <form
      action={action}
      className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15"
      noValidate
    >
      <h3 className="font-semibold">새 장소</h3>
      <input type="hidden" name="seriesId" value={seriesId} />
      <LocationFields idPrefix="new-location" values={state?.values} errors={state?.errors} />
      <FormMessage message={state?.message} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-2 rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          취소
        </button>
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? "추가 중…" : "추가"}
        </button>
      </div>
    </form>
  );
}

/** 장소 이름·설명·배치 메모 보기 ↔ 수정 전환. */
export function LocationInfo({
  seriesId,
  location,
}: {
  seriesId: string;
  location: { id: string; name: string; description: string | null; layout_note: string | null };
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: LocationFormState, formData: FormData) => {
      const result = await updateLocation(prev, formData);
      if (result?.saved) setEditing(false); // 저장되면 보기 모드로
      return result;
    },
    undefined,
  );

  if (!editing) {
    return (
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-lg font-semibold">{location.name}</h3>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
            >
              수정
            </button>
            <form
              action={deleteLocation}
              onSubmit={(e) => {
                if (!window.confirm(`"${location.name}" 장소와 레퍼런스 이미지를 모두 삭제할까요?`))
                  e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={location.id} />
              <input type="hidden" name="seriesId" value={seriesId} />
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                삭제
              </button>
            </form>
          </div>
        </div>
        <p className="mt-1 whitespace-pre-line text-sm text-black/60 dark:text-white/60">
          {location.description || "설명이 없습니다."}
        </p>
        {location.layout_note && (
          <div className="mt-3 rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
            <span className="mb-0.5 block text-xs font-medium text-black/50 dark:text-white/50">배치 메모</span>
            <span className="whitespace-pre-line">{location.layout_note}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="flex min-w-0 flex-1 flex-col gap-3" noValidate>
      <input type="hidden" name="id" value={location.id} />
      <input type="hidden" name="seriesId" value={seriesId} />
      <LocationFields
        idPrefix={`edit-${location.id}`}
        values={
          state?.values ?? {
            name: location.name,
            description: location.description ?? "",
            layoutNote: location.layout_note ?? "",
          }
        }
        errors={state?.errors}
      />
      <FormMessage message={state?.message} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
