"use client";

import { useEffect, useRef, useState } from "react";
import { REFERENCE_KINDS, type ReferenceKind } from "@/lib/reference-constants";
import { checkImageFile, uploadReferenceFile } from "@/lib/upload-reference";

export type PickedImage = { file: File; previewUrl: string };
export type PickedImages = Partial<Record<string, PickedImage>>;

/**
 * 추가 폼에서 고른 사진들을 방금 만든 캐릭터·장소에 올린다.
 * 실패한 사진이 있으면 안내 문구를, 모두 성공하면 null을 돌려준다.
 */
export async function uploadPicked(input: {
  kind: ReferenceKind;
  userId: string;
  seriesId: string;
  entityId: string;
  images: PickedImages;
}): Promise<string | null> {
  const { kind, userId, seriesId, entityId, images } = input;
  const labels = REFERENCE_KINDS[kind].labels;
  const failed: string[] = [];
  // 저장소 부담을 줄이려고 한 장씩 순서대로 올린다
  for (const [angle, picked] of Object.entries(images)) {
    if (!picked) continue;
    const result = await uploadReferenceFile({ kind, userId, seriesId, entityId, angle, file: picked.file });
    if (!result.ok) failed.push(labels[angle] ?? angle);
  }
  return failed.length > 0
    ? `${failed.join(", ")} 사진을 올리지 못했습니다. 카드의 사진 칸에서 다시 올려 주세요.`
    : null;
}

/** 고른 사진들의 미리보기 URL을 정리한다 (메모리 누수 방지). */
export function releasePicked(images: PickedImages) {
  for (const img of Object.values(images)) if (img) URL.revokeObjectURL(img.previewUrl);
}

function PickerSlot({
  label,
  required,
  picked,
  disabled,
  onPick,
  onClear,
}: {
  label: string;
  required: boolean;
  picked?: PickedImage;
  disabled?: boolean;
  onPick: (file: File) => string | null;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex w-20 flex-col gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-label={`${label} 사진 ${picked ? "바꾸기" : "고르기"}`}
        className="flex aspect-square w-20 items-center justify-center overflow-hidden rounded-md border border-dashed border-black/20 bg-black/5 text-center text-xs text-black/50 hover:border-primary-strong disabled:opacity-60 dark:border-white/25 dark:bg-white/5 dark:text-white/50"
      >
        {picked ? (
          // 로컬 미리보기(blob: URL)라 next/image를 쓰지 않는다
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picked.previewUrl} alt={`${label} 미리보기`} className="h-full w-full object-cover" />
        ) : (
          <span className="px-1">
            + {label}
            {required && <span className="block text-[10px]">(필수)</span>}
          </span>
        )}
      </button>
      <div className="flex items-center justify-between gap-1 text-[11px] text-black/50 dark:text-white/50">
        <span className="truncate">{label}</span>
        {picked && (
          <button type="button" disabled={disabled} onClick={onClear} className="shrink-0 hover:text-red-600">
            빼기
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
          if (file) setError(onPick(file));
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * 추가 폼용 사진 선택 칸. 고른 사진은 미리보기만 하고, 폼을 제출할 때 부모가 올린다.
 */
export function ReferencePicker({
  kind,
  value,
  onChange,
  disabled,
}: {
  kind: ReferenceKind;
  value: PickedImages;
  onChange: (next: PickedImages) => void;
  disabled?: boolean;
}) {
  const config = REFERENCE_KINDS[kind];

  // 화면에서 사라질 때 남은 미리보기 URL 정리
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => () => releasePicked(latest.current), []);

  return (
    <div>
      <p className="mb-2 text-sm font-medium">
        사진 <span className="font-normal text-black/50 dark:text-white/50">(나중에 카드에서 추가·교체할 수도 있어요)</span>
      </p>
      <div className="flex flex-wrap gap-3">
        {config.angles.map((angle) => (
          <PickerSlot
            key={angle}
            label={config.labels[angle] ?? angle}
            required={config.required === angle}
            picked={value[angle]}
            disabled={disabled}
            onPick={(file) => {
              const problem = checkImageFile(file);
              if (problem) return problem;
              const prev = value[angle];
              if (prev) URL.revokeObjectURL(prev.previewUrl);
              onChange({ ...value, [angle]: { file, previewUrl: URL.createObjectURL(file) } });
              return null;
            }}
            onClear={() => {
              const prev = value[angle];
              if (prev) URL.revokeObjectURL(prev.previewUrl);
              const next = { ...value };
              delete next[angle];
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}
