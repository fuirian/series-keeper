"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * active일 때 intervalMs마다 서버 컴포넌트를 다시 불러온다 (router.refresh).
 * 검사 대기·검사 중인 회차가 있을 때 상태가 바뀌면 새로고침 없이 화면에 반영하려는 용도.
 * 브라우저 탭이 안 보이는 동안은 멈추고, 다시 보이면 바로 한 번 갱신한다.
 */
export function AutoRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const start = () => {
      if (timer === undefined) timer = window.setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        router.refresh();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, intervalMs, router]);

  return null;
}
