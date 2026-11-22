"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { getRegenKit, recordRegenKitEvent } from "@/app/actions/regen-kit";
import { inputClass } from "@/components/form";
import { MISSING_HINTS, type RegenKit } from "@/lib/regen-kit";

const smallButton =
  "rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";

/** Storage 서명 URL에 download를 붙이면 브라우저가 새 탭 대신 파일로 받는다 */
function downloadUrl(url: string, filename: string) {
  const u = new URL(url);
  u.searchParams.set("download", filename);
  return u.toString();
}

function CopyBox({ label, text, onCopied }: { label: string; text: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 사용자가 직접 선택해 복사할 수 있다
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-black/60 dark:text-white/60">{label}</span>
        <button type="button" onClick={copy} className={smallButton}>
          {copied ? "복사됨 ✓" : "복사"}
        </button>
      </div>
      <textarea
        readOnly
        value={text}
        rows={Math.min(10, text.split("\n").length + 1)}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-y rounded-md border border-black/15 bg-black/[0.02] p-3 font-mono text-xs leading-relaxed dark:border-white/20 dark:bg-white/5"
      />
    </div>
  );
}

/** 이슈 비교 화면 안: 문제 컷을 내 생성 도구에서 다시 만들 프롬프트 + 레퍼런스 */
export function RegenKitPanel({ seriesId, issueId }: { seriesId: string; issueId: string }) {
  const [kit, setKit] = useState<RegenKit | null>(null);
  const [error, setError] = useState<string>();
  const [scene, setScene] = useState("");
  const [isPending, startTransition] = useTransition();

  function load(next: { characterId?: string | null; locationId?: string | null; scene?: string }, first = false) {
    setError(undefined);
    startTransition(async () => {
      const res = await getRegenKit({
        issueId,
        tool: kit?.tool.id ?? "generic",
        characterId: next.characterId !== undefined ? next.characterId : (kit?.character_id ?? null),
        locationId: next.locationId !== undefined ? next.locationId : (kit?.location_id ?? null),
        scene: next.scene !== undefined ? next.scene : scene,
      });
      if (!res.ok) return setError(res.message);
      setKit(res.kit);
      if (first) void recordRegenKitEvent(issueId, res.kit.tool.id, "open");
    });
  }

  if (!kit) {
    return (
      <div className="flex flex-col gap-2 rounded-md bg-black/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between dark:bg-white/5">
        <p className="text-sm text-black/70 dark:text-white/70">
          이 컷을 내 생성 도구(Kling·Veo·Runway 등)에서 다시 만들 <strong>프롬프트와 레퍼런스</strong>를 정리해 드려요.
        </p>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => load({}, true)}
            disabled={isPending}
            className="shrink-0 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "정리하는 중…" : "다시 만들기 키트"}
          </button>
          {error && <p className="text-xs text-red-700 dark:text-red-300">{error}</p>}
        </div>
      </div>
    );
  }

  const hints = kit.missing.map((m) => MISSING_HINTS[m]).filter(Boolean);
  const downloadable = kit.references.filter((r) => r.url);

  function downloadAll() {
    downloadable.forEach((r, i) => {
      // 브라우저가 여러 파일을 한 번에 막지 않도록 조금씩 간격을 둔다
      window.setTimeout(() => {
        const a = document.createElement("a");
        a.href = downloadUrl(r.url!, `${r.order}-${r.label}.jpg`);
        a.click();
      }, i * 400);
    });
    void recordRegenKitEvent(issueId, kit!.tool.id, "download_refs");
  }

  return (
    <section aria-label="다시 만들기 키트" className="flex flex-col gap-4 rounded-md border border-black/10 p-4 dark:border-white/15">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">다시 만들기 키트</h3>
        <span className="text-xs text-black/50 dark:text-white/50">도구: {kit.tool.label}</span>
      </div>

      {/* 원래 누구·어디·무슨 장면인지 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          원래 나와야 할 인물
          <select
            value={kit.character_id}
            disabled={isPending}
            onChange={(e) => load({ characterId: e.target.value })}
            className={inputClass}
          >
            {kit.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          장소 (선택)
          <select
            value={kit.location_id ?? ""}
            disabled={isPending}
            onChange={(e) => load({ locationId: e.target.value || null })}
            className={inputClass}
          >
            <option value="">고르지 않음</option>
            {kit.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <form
          className="flex flex-col gap-1 text-xs font-medium"
          onSubmit={(e) => {
            e.preventDefault();
            load({ scene });
          }}
        >
          <label htmlFor={`scene-${issueId}`}>컷 설명 (선택)</label>
          <div className="flex gap-1">
            <input
              id={`scene-${issueId}`}
              value={scene}
              maxLength={300}
              onChange={(e) => setScene(e.target.value)}
              placeholder="예: 창가에서 뒤돌아 웃는다"
              className={inputClass}
            />
            <button type="submit" disabled={isPending} className={smallButton}>
              반영
            </button>
          </div>
        </form>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

      <div className={`flex flex-col gap-3 ${isPending ? "opacity-60" : ""}`}>
        <CopyBox
          label="프롬프트"
          text={kit.prompt}
          onCopied={() => void recordRegenKitEvent(issueId, kit.tool.id, "copy_prompt")}
        />
        {kit.negative_prompt && <CopyBox label="피해야 할 것 (네거티브 프롬프트)" text={kit.negative_prompt} />}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-black/60 dark:text-white/60">
              레퍼런스 이미지 (이 순서대로 넣으세요)
            </span>
            {downloadable.length > 0 && (
              <button type="button" onClick={downloadAll} className={smallButton}>
                모두 받기
              </button>
            )}
          </div>
          {kit.references.length === 0 ? (
            <p className="text-sm text-black/50 dark:text-white/50">넣을 레퍼런스가 없습니다.</p>
          ) : (
            <ol className="flex flex-wrap gap-3">
              {kit.references.map((r) => (
                <li key={r.order} className="flex w-24 flex-col gap-1">
                  <div className="relative aspect-square overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
                    {r.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.url} alt={r.label} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-black/40">없음</span>
                    )}
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-xs font-semibold text-white">
                      {r.order}
                    </span>
                  </div>
                  <span className="truncate text-xs">{r.label}</span>
                  {r.url && (
                    <a
                      href={downloadUrl(r.url, `${r.order}-${r.label}.jpg`)}
                      onClick={() => void recordRegenKitEvent(issueId, kit.tool.id, "download_refs")}
                      className="text-xs text-black/60 underline underline-offset-2 hover:text-foreground dark:text-white/60"
                    >
                      받기
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {hints.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {hints.map((h) => (
            <li key={h.text}>
              {h.text}{" "}
              <Link href={`/series/${seriesId}?tab=${h.tab}`} className="font-medium underline underline-offset-2">
                채우러 가기
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ul className="flex flex-col gap-0.5 text-xs text-black/50 dark:text-white/50">
        {kit.tips.map((t) => (
          <li key={t}>· {t}</li>
        ))}
        <li>· 다시 만든 컷으로 회차를 다시 올리고 검사해 보세요.</li>
      </ul>
    </section>
  );
}
