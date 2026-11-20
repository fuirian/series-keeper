/** 서버·브라우저 양쪽에서 쓰는 리포트 관련 상수. */

export const ISSUE_REVIEWS = ["open", "resolved", "false_positive"] as const;
export type IssueReview = (typeof ISSUE_REVIEWS)[number];

export const REVIEW_LABELS: Record<IssueReview, string> = {
  open: "미처리",
  resolved: "해결됨",
  false_positive: "오탐",
};

export const ISSUE_TYPE_LABELS: Record<string, string> = {
  low_similarity: "얼굴 유사도 낮음",
  ambiguous: "인물 매칭 불확실",
};

/** 밀리초 → 03:12.4 */
export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 100)); // 0.1초 단위
  const tenths = total % 10;
  const s = Math.floor(total / 10) % 60;
  const m = Math.floor(total / 600);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths}`;
}
