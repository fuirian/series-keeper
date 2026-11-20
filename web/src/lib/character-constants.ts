/** 서버·브라우저 양쪽에서 쓰는 캐릭터 관련 상수. */

export const ANGLES = ["front", "side", "back", "full"] as const;
export type Angle = (typeof ANGLES)[number];

export const ANGLE_LABELS: Record<Angle, string> = {
  front: "정면",
  side: "측면",
  back: "후면",
  full: "전신",
};

export const REFERENCE_BUCKET = "references";

/** supabase/migrations의 버킷 설정과 맞춘다 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
