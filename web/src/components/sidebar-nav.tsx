"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: React.ReactNode; match: (path: string) => boolean };

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

const ITEMS: NavItem[] = [
  {
    href: "/",
    label: "내 시리즈",
    // 시리즈 상세·새 시리즈·리포트도 '내 시리즈' 아래로 본다
    match: (p) => p === "/" || p.startsWith("/series"),
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 4v5M16 4v5" />
      </svg>
    ),
  },
  {
    href: "/usage",
    label: "사용량",
    match: (p) => p.startsWith("/usage"),
    icon: (
      <svg {...iconProps}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    href: "/mypage",
    label: "마이페이지",
    match: (p) => p.startsWith("/mypage"),
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </svg>
    ),
  },
];

/** 왼쪽 메뉴. 넓은 화면에선 세로 막대, 좁은 화면에선 헤더 아래 가로 줄. */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="메인 메뉴"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-black/5 px-2 py-2 md:w-52 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:px-3 md:py-6 dark:border-white/10"
    >
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
              active
                ? "bg-primary-soft font-semibold text-primary-strong"
                : "text-black/60 hover:bg-black/5 hover:text-foreground dark:text-white/60 dark:hover:bg-white/10"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
