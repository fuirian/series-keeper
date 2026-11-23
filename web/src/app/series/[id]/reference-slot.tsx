"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteReferenceImage } from "@/app/actions/references";
import { REFERENCE_KINDS, type ReferenceKind } from "@/lib/reference-constants";
import { checkImageFile, uploadReferenceFile } from "@/lib/upload-reference";

type Props = {
  kind: ReferenceKind;
  userId: string;
  seriesId: string;
  entityId: string; // 캐릭터 id 또는 장소 id
  angle: string;
  imageUrl: string | null;
  hasImage: boolean;
};

/** 각도별 레퍼런스 이미지 칸. 누르면 파일을 골라 브라우저에서 저장소로 바로 올린다. */
export function ReferenceSlot({ kind, userId, seriesId, entityId, angle, imageUrl, hasImage }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = uploading || isPending;

  const config = REFERENCE_KINDS[kind];
  const label = config.labels[angle] ?? angle;
  const required = config.required === angle;
  const target = { kind, seriesId, entityId, angle };

  async function handleFile(file: File) {
    setError(null);
    const problem = checkImageFile(file);
    if (problem) return setError(problem);

    setUploading(true);
    try {
      const result = await uploadReferenceFile({ kind, userId, seriesId, entityId, angle, file });
      if (!result.ok) return setError(result.message);
      startTransition(() => router.refresh());
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove() {
    if (!window.confirm(`${label} 이미지를 삭제할까요?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteReferenceImage(target);
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  }

  return (
    <div className="flex w-24 flex-col gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={`${label} 이미지 ${hasImage ? "바꾸기" : "올리기"}`}
        className="relative flex aspect-square w-24 items-center justify-center overflow-hidden rounded-md border border-dashed border-black/20 bg-black/5 text-center text-xs text-black/50 hover:border-primary-strong disabled:opacity-60 dark:border-white/25 dark:bg-white/5 dark:text-white/50"
      >
        {imageUrl ? (
          // 서명 URL(매번 바뀜)이라 next/image 최적화 대신 그대로 보여 준다
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`${label} 레퍼런스`} className="h-full w-full object-cover" />
        ) : (
          <span className="px-1">
            {busy ? "올리는 중…" : label}
            {!busy && required && <span className="block text-[10px]">(필수)</span>}
          </span>
        )}
        {imageUrl && busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">처리 중…</span>
        )}
      </button>
      <div className="flex items-center justify-between gap-1 text-[11px] text-black/50 dark:text-white/50">
        <span className="truncate">{label}</span>
        {hasImage && (
          <button type="button" onClick={handleRemove} disabled={busy} className="shrink-0 hover:text-red-600">
            삭제
          </button>
        )}
      </div>
      {error && <p className="text-[11px] leading-tight text-red-600 dark:text-red-400">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
