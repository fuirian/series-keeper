/** 서버·브라우저 양쪽에서 쓰는 레퍼런스 이미지(캐릭터·장소) 설정. */

export const REFERENCE_BUCKET = "references";

/** supabase/migrations의 버킷 설정과 맞춘다 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const CHARACTER_ANGLES = ["front", "side", "back", "full"] as const;
export const LOCATION_ANGLES = ["wide", "angle1", "angle2", "detail"] as const;

export type CharacterAngle = (typeof CHARACTER_ANGLES)[number];
export type LocationAngle = (typeof LOCATION_ANGLES)[number];

export type ReferenceKind = "character" | "location";

/**
 * 종류별 설정. DB 테이블 이름·외래키 컬럼은 supabase/migrations와 맞춘다.
 * 저장소 경로는 둘 다 {사용자 id}/{시리즈 id}/{캐릭터·장소 id}/{각도}-{랜덤}.{확장자}
 */
export const REFERENCE_KINDS = {
  character: {
    angles: CHARACTER_ANGLES as readonly string[],
    labels: { front: "정면", side: "측면", back: "후면", full: "전신" } as Record<string, string>,
    required: "front",
    table: "reference_image",
    fk: "character_id",
  },
  location: {
    angles: LOCATION_ANGLES as readonly string[],
    labels: { wide: "전경", angle1: "다른 각도 1", angle2: "다른 각도 2", detail: "디테일" } as Record<string, string>,
    required: "wide",
    table: "location_image",
    fk: "location_id",
  },
} satisfies Record<
  ReferenceKind,
  { angles: readonly string[]; labels: Record<string, string>; required: string; table: string; fk: string }
>;

export function isReferenceKind(value: string): value is ReferenceKind {
  return value === "character" || value === "location";
}
