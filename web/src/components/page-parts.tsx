import type { ReactNode } from "react";
import type { ApiResult } from "@/lib/api";

/** 메뉴 화면 공통 제목 */
export function PageTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-black/60 dark:text-white/60">{description}</p>}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** 백엔드 호출이 실패했을 때 안내 */
export function ApiErrorNotice({ result }: { result: ApiResult<unknown> }) {
  if (result.ok) return null;
  return (
    <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
      {result.reason === "unreachable"
        ? "백엔드(API) 서버에 연결하지 못했습니다. api 폴더에서 서버를 켜 주세요 (api/README.md)."
        : "정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요."}
    </p>
  );
}
