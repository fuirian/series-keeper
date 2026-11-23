"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteSeriesCover, setSeriesCover } from "@/app/actions/series-cover";
import { IMAGE_TYPES, REFERENCE_BUCKET } from "@/lib/reference-constants";
import { getBrowserClient } from "@/lib/supabase/client";
import { checkImageFile } from "@/lib/upload-reference";

const smallButton =
  "rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";

/** 설정 탭: 시리즈 대표 이미지 올리기·바꾸기·지우기. 홈의 시리즈 카드에 쓰인다. */
export function CoverField({
  userId,
  seriesId,
  coverUrl,
}: {
  userId: string;
  seriesId: string;
  coverUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();
  const [isPending, startTransition] = useTransition();

  function onPick(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = ""; // 같은 파일을 다시 골라도 동작하게
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) return setMessage(problem);
    setMessage(undefined);

    startTransition(async () => {
      // 브라우저 → 저장소로 바로 올리고, 백엔드에 기록 (경로 확인·예전 파일 삭제)
      const path = `${userId}/${seriesId}/cover/cover-${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
      const { error } = await getBrowserClient()
        .storage.from(REFERENCE_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (error) {
        console.error(error);
        return setMessage("업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
      const res = await setSeriesCover({ seriesId, path });
      if (!res.ok) return setMessage(res.message);
      router.refresh();
    });
  }

  function onDelete() {
    if (!window.confirm("대표 이미지를 지울까요?")) return;
    setMessage(undefined);
    startTransition(async () => {
      const res = await deleteSeriesCover({ seriesId });
      if (!res.ok) return setMessage(res.message);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">대표 이미지</h3>
        <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">
          홈의 시리즈 카드에 보입니다. 가로로 긴(16:9) 이미지가 잘 맞습니다. PNG·JPG·WEBP, 5MB 이하.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex aspect-video w-full max-w-xs items-center justify-center overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="대표 이미지" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-black/40 dark:text-white/40">대표 이미지 없음</span>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={isPending} className={smallButton}>
            {isPending ? "처리 중…" : coverUrl ? "바꾸기" : "올리기"}
          </button>
          {coverUrl && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              지우기
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>
      {message && <p className="text-sm text-red-700 dark:text-red-300">{message}</p>}
    </section>
  );
}
