"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import {
  createCharacter,
  deleteCharacter,
  updateCharacter,
  type CharacterFormState,
} from "@/app/actions/characters";
import { FieldError, FormMessage, inputClass, submitClass } from "@/components/form";
import { ReferencePicker, releasePicked, uploadPicked, type PickedImages } from "./reference-picker";

type Values = { name?: string; description?: string };
type Errors = { name?: string; description?: string };

function CharacterFields({ idPrefix, values, errors = {} }: { idPrefix: string; values?: Values; errors?: Errors }) {
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
          placeholder="예: 하린"
          defaultValue={values?.name}
          aria-invalid={!!errors.name}
          aria-describedby={`${idPrefix}-name-error`}
          className={inputClass}
        />
        <FieldError id={`${idPrefix}-name-error`} message={errors.name} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-description`} className="mb-1 block text-sm font-medium">
          외형 설명 <span className="font-normal text-black/50 dark:text-white/50">(선택)</span>
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={3}
          maxLength={1000}
          placeholder="예: 20대 초반 여성, 어깨까지 오는 검은 단발, 왼쪽 눈 밑 점, 주로 베이지 니트"
          defaultValue={values?.description}
          aria-invalid={!!errors.description}
          aria-describedby={`${idPrefix}-description-error`}
          className={inputClass}
        />
        <FieldError id={`${idPrefix}-description-error`} message={errors.description} />
      </div>
    </>
  );
}

/** 캐릭터 추가 (이름·설명 + 사진). 성공하면 사진까지 올린 뒤 폼이 비워지고 접힌다. */
export function AddCharacterForm({
  seriesId,
  userId,
  startOpen,
}: {
  seriesId: string;
  userId: string;
  startOpen: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [images, setImagesState] = useState<PickedImages>({});
  const imagesRef = useRef<PickedImages>({}); // 액션 안에서 항상 최신 사진 목록을 읽기 위해
  const setImages = (next: PickedImages) => {
    imagesRef.current = next;
    setImagesState(next);
  };
  const [notice, setNotice] = useState<string | null>(null);
  const [state, action, pending] = useActionState(
    async (prev: CharacterFormState, formData: FormData) => {
      setNotice(null);
      const result = await createCharacter(prev, formData);
      if (!result?.saved || !result.createdId) return result;

      // 캐릭터가 만들어졌으면 고른 사진을 이어서 올린다
      const picked = imagesRef.current;
      const problem = await uploadPicked({
        kind: "character",
        userId,
        seriesId,
        entityId: result.createdId,
        images: picked,
      });
      releasePicked(picked);
      setImages({});
      setNotice(problem);
      setOpen(false); // 추가되면 폼을 접는다
      router.refresh();
      return result;
    },
    undefined,
  );

  function close() {
    releasePicked(imagesRef.current);
    setImages({});
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-2">
        {notice && <p className="text-sm text-red-600 dark:text-red-400">{notice}</p>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          + 캐릭터 추가
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15"
      noValidate
    >
      <h3 className="font-semibold">새 캐릭터</h3>
      <input type="hidden" name="seriesId" value={seriesId} />
      <CharacterFields idPrefix="new" values={state?.values} errors={state?.errors} />
      <ReferencePicker kind="character" value={images} onChange={setImages} disabled={pending} />
      <FormMessage message={state?.message} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={close}
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

/** 캐릭터 이름·설명 보기 ↔ 수정 전환. */
export function CharacterInfo({
  seriesId,
  character,
}: {
  seriesId: string;
  character: { id: string; name: string; description: string | null };
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: CharacterFormState, formData: FormData) => {
      const result = await updateCharacter(prev, formData);
      if (result?.saved) setEditing(false); // 저장되면 보기 모드로
      return result;
    },
    undefined,
  );

  if (!editing) {
    return (
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-lg font-semibold">{character.name}</h3>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
            >
              수정
            </button>
            <form
              action={deleteCharacter}
              onSubmit={(e) => {
                if (!window.confirm(`"${character.name}" 캐릭터와 레퍼런스 이미지를 모두 삭제할까요?`))
                  e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={character.id} />
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
          {character.description || "외형 설명이 없습니다."}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex min-w-0 flex-1 flex-col gap-3" noValidate>
      <input type="hidden" name="id" value={character.id} />
      <input type="hidden" name="seriesId" value={seriesId} />
      <CharacterFields
        idPrefix={`edit-${character.id}`}
        values={state?.values ?? { name: character.name, description: character.description ?? "" }}
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
