"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteReferenceImage, saveReferenceImage } from "@/app/actions/characters";
import {
  ANGLE_LABELS,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  REFERENCE_BUCKET,
  type Angle,
} from "@/lib/character-constants";
import { getBrowserClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  seriesId: string;
  characterId: string;
  angle: Angle;
  imageUrl: string | null;
  hasImage: boolean;
  required?: boolean;
};

/** 각도별 레퍼런스 이미지 칸. 누르면 파일을 골라 브라우저에서 저장소로 바로 올린다. */
export function ReferenceSlot({ userId, seriesId, characterId, angle, imageUrl, hasImage, required }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = uploading || isPending;
  const label = ANGLE_LABELS[angle];

  async function handleFile(file: File) {
    setError(null);
    const ext = IMAGE_TYPES[file.type];
    if (!ext) return setError("PNG, JPG, WEBP만 올릴 수 있습니다.");
    if (file.size > MAX_IMAGE_BYTES) return setError("5MB 이하 이미지만 올릴 수 있습니다.");

    setUploading(true);
    try {
      // 매번 새 파일 이름 → 브라우저 캐시에 예전 이미지가 남지 않는다. 예전 파일은 서버가 지운다.
      const path = `${userId}/${seriesId}/${characterId}/${angle}-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await getBrowserClient()
        .storage.from(REFERENCE_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        console.error(uploadError);
        return setError("업로드에 실패했습니다. 저장소 설정(SQL)을 확인해 주세요.");
      }

      const result = await saveReferenceImage({ seriesId, characterId, angle, path });
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
      const result = await deleteReferenceImage({ seriesId, characterId, angle });
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
        className="relative flex aspect-square w-24 items-center justify-center overflow-hidden rounded-md border border-dashed border-black/20 bg-black/5 text-center text-xs text-black/50 hover:border-foreground disabled:opacity-60 dark:border-white/25 dark:bg-white/5 dark:text-white/50"
      >
        {imageUrl ? (
          // 서명 URL(매번 바뀜)이라 next/image 최적화 대신 그대로 보여 준다
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`${label} 레퍼런스`} className="h-full w-full object-cover" />
        ) : (
          <span>
            {busy ? "올리는 중…" : label}
            {!busy && required && <span className="block text-[10px]">(필수)</span>}
          </span>
        )}
        {imageUrl && busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">처리 중…</span>
        )}
      </button>
      <div className="flex items-center justify-between text-[11px] text-black/50 dark:text-white/50">
        <span>{label}</span>
        {hasImage && (
          <button type="button" onClick={handleRemove} disabled={busy} className="hover:text-red-600">
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
