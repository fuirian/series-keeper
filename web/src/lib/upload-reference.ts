"use client";

import { saveReferenceImage } from "@/app/actions/references";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, REFERENCE_BUCKET, type ReferenceKind } from "@/lib/reference-constants";
import { getBrowserClient } from "@/lib/supabase/client";

/** 파일 형식·크기 검사. 문제가 있으면 안내 문구, 없으면 null. */
export function checkImageFile(file: File): string | null {
  if (!IMAGE_TYPES[file.type]) return "PNG, JPG, WEBP만 올릴 수 있습니다.";
  if (file.size > MAX_IMAGE_BYTES) return "5MB 이하 이미지만 올릴 수 있습니다.";
  return null;
}

/**
 * 레퍼런스 이미지 한 장을 브라우저에서 저장소로 바로 올리고, 서버에 기록한다.
 * 캐릭터·장소 카드의 이미지 칸과, 추가 폼에서 같이 쓴다.
 */
export async function uploadReferenceFile(input: {
  kind: ReferenceKind;
  userId: string;
  seriesId: string;
  entityId: string;
  angle: string;
  file: File;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { kind, userId, seriesId, entityId, angle, file } = input;
  const problem = checkImageFile(file);
  if (problem) return { ok: false, message: problem };

  // 매번 새 파일 이름 → 브라우저 캐시에 예전 이미지가 남지 않는다. 예전 파일은 서버가 지운다.
  const path = `${userId}/${seriesId}/${entityId}/${angle}-${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
  const { error } = await getBrowserClient()
    .storage.from(REFERENCE_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (error) {
    console.error(error);
    return { ok: false, message: "업로드에 실패했습니다. 저장소 설정(SQL)을 확인해 주세요." };
  }

  return saveReferenceImage({ kind, seriesId, entityId, angle, path });
}
