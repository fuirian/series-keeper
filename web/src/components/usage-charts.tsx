import type { UsageStats } from "@/lib/api";
import { formatBytes } from "@/lib/episode-constants";

/**
 * 사용량 그래프. 라이브러리 없이 div 막대로 그린다 (서버 컴포넌트, 자바스크립트 불필요).
 * 색: 저장 공간·검사 = 테마 핑크, 이슈 = 상태 색(미처리 빨강 / 해결 민트 / 오탐 회색)
 */

/** Supabase 무료 플랜 저장 공간. 서비스 전체가 함께 쓰는 한도라 '참고 기준'으로 보여 준다 */
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-black/10 bg-surface p-4 dark:border-white/15">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {note && <p className="text-xs text-black/50 dark:text-white/50">{note}</p>}
      </div>
      {children}
    </div>
  );
}

export function StorageGauge({ bytes }: { bytes: number }) {
  const ratio = Math.min(bytes / STORAGE_LIMIT_BYTES, 1);
  const percent = ratio * 100;
  return (
    <Card title="영상 저장 공간" note="회차 영상 기준 · 레퍼런스 사진 제외">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{formatBytes(bytes)}</span>
        <span className="text-sm text-black/50 dark:text-white/50">/ 1GB</span>
      </div>
      <div
        role="meter"
        aria-label="영상 저장 공간 사용량"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="h-3 w-full overflow-hidden rounded-full bg-primary-soft"
      >
        {/* 아주 조금 썼어도 막대가 보이게 최소 폭을 둔다 */}
        <div className="h-full rounded-full bg-primary" style={{ width: `${bytes > 0 ? Math.max(percent, 1) : 0}%` }} />
      </div>
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">
        {percent < 0.1 && bytes > 0 ? "0.1% 미만" : `${percent.toFixed(1)}%`} 사용 · 1GB는 테스트 기간 무료 저장 공간 기준이에요
      </p>
    </Card>
  );
}

const dayLabel = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "UTC" });

export function DailyChecksChart({ days }: { days: UsageStats["daily_checks"] }) {
  const total = days.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...days.map((d) => d.count));
  // 날짜 문자열(YYYY-MM-DD)을 UTC 자정으로 읽어 그대로 월·일만 보여 준다
  const label = (iso: string) => dayLabel.format(new Date(`${iso}T00:00:00Z`));

  return (
    <Card title="일별 검사 횟수" note={`최근 30일 · 총 ${total}회`}>
      <div className="flex h-36 items-end gap-[3px]" role="img" aria-label={`최근 30일 동안 검사 ${total}회`}>
        {days.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 items-end" title={`${label(d.date)} · ${d.count}회`}>
            <div
              className={`w-full rounded-t-sm ${d.count > 0 ? "bg-primary group-hover:bg-primary-strong" : "bg-black/5 dark:bg-white/10"}`}
              style={{ height: d.count > 0 ? `${(d.count / max) * 100}%` : "2px" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-black/50 tabular-nums dark:text-white/50">
        <span>{days.length > 0 && label(days[0].date)}</span>
        <span>{days.length > 0 && label(days[Math.floor(days.length / 2)].date)}</span>
        <span>오늘</span>
      </div>
      {total === 0 && (
        <p className="mt-3 text-sm text-black/50 dark:text-white/50">최근 30일 동안 검사한 회차가 없어요.</p>
      )}
    </Card>
  );
}

const ISSUE_PARTS = [
  { key: "open", label: "미처리", bar: "bg-red-500", dot: "bg-red-500" },
  { key: "resolved", label: "해결됨", bar: "bg-teal-500", dot: "bg-teal-500" },
  { key: "false_positive", label: "오탐", bar: "bg-black/25 dark:bg-white/30", dot: "bg-black/25 dark:bg-white/30" },
] as const;

export function IssueStatusChart({ issues }: { issues: UsageStats["issues"] }) {
  const total = issues.open + issues.resolved + issues.false_positive;
  const done = issues.resolved + issues.false_positive;

  return (
    <Card title="이슈 처리 현황" note={total > 0 ? `총 ${total}개 중 ${done}개 확인` : undefined}>
      {total === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">아직 발견된 이슈가 없어요.</p>
      ) : (
        <>
          <div
            className="flex h-4 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10"
            role="img"
            aria-label={ISSUE_PARTS.map((p) => `${p.label} ${issues[p.key]}개`).join(", ")}
          >
            {ISSUE_PARTS.map((p) =>
              issues[p.key] > 0 ? (
                <div key={p.key} className={p.bar} style={{ width: `${(issues[p.key] / total) * 100}%` }} />
              ) : null,
            )}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {ISSUE_PARTS.map((p) => (
              <li key={p.key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} aria-hidden />
                {p.label}
                <span className="font-semibold tabular-nums">{issues[p.key]}</span>
                <span className="text-black/50 tabular-nums dark:text-white/50">
                  ({Math.round((issues[p.key] / total) * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
