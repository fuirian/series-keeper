/** 서버·브라우저 양쪽에서 쓰는 회차 관련 상수. */

export const EPISODE_BUCKET = "episodes";

/** Supabase 무료 플랜의 파일당 상한(50MB). supabase/migrations의 버킷 설정과 맞춘다 */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export const EPISODE_STATUSES = ["uploaded", "pending", "processing", "done", "failed"] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

export const STATUS_LABELS: Record<EpisodeStatus, string> = {
  uploaded: "검사 전",
  pending: "검사 대기",
  processing: "검사 중",
  done: "완료",
  failed: "실패",
};

export function formatDuration(ms: number | null): string {
  if (ms == null) return "–";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return "–";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
