"use client";

import { useSyncExternalStore } from "react";
import { saveThemePref } from "@/lib/theme";

type Mode = "light" | "dark";

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

const SUN = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const MOON = (
  <svg {...iconProps}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

/** 지금 화면에 적용된 모드(<html data-theme>)를 읽고, 바뀌면 다시 그린다. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function currentMode(): Mode {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/**
 * 누를 때마다 라이트 ↔ 다크가 바로 바뀐다. 선택은 이 브라우저에 기억된다.
 * 한 번도 누르지 않았으면 OS 설정(시스템 모드)을 따른다.
 */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, currentMode, () => "light" as Mode);
  const next: Mode = mode === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => saveThemePref(next)}
      aria-label={next === "dark" ? "다크 모드로 바꾸기" : "라이트 모드로 바꾸기"}
      title={next === "dark" ? "다크 모드로 바꾸기" : "라이트 모드로 바꾸기"}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-black/60 hover:bg-primary-soft hover:text-primary-strong dark:text-white/60"
    >
      {/* 지금이 라이트면 달(→다크로), 다크면 해(→라이트로) */}
      {mode === "dark" ? SUN : MOON}
    </button>
  );
}
