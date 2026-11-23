"use client";

import { useSyncExternalStore } from "react";
import { readThemePref, saveThemePref, THEME_CHANGE_EVENT, type ThemePref } from "@/lib/theme";

const ORDER: ThemePref[] = ["system", "light", "dark"];

const LABELS: Record<ThemePref, string> = {
  system: "시스템 설정",
  light: "라이트 모드",
  dark: "다크 모드",
};

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ICONS: Record<ThemePref, React.ReactNode> = {
  system: (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
  light: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg {...iconProps}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
};

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 누를 때마다 시스템 설정 → 라이트 → 다크 순서로 바뀐다. 선택은 이 브라우저에 기억된다. */
export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, readThemePref, () => "system" as ThemePref);
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => saveThemePref(next)}
      aria-label={`화면 테마: ${LABELS[pref]} (눌러서 ${LABELS[next]}로 바꾸기)`}
      title={`화면 테마: ${LABELS[pref]}`}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-black/60 hover:bg-primary-soft hover:text-primary-strong dark:text-white/60"
    >
      {ICONS[pref]}
    </button>
  );
}
