import { Suspense, type ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SidebarNav } from "@/components/sidebar-nav";
import { getCurrentUser } from "@/lib/supabase/server";

/** 로그인했을 때만 왼쪽 메뉴를 보여 준다 (세션을 읽으므로 Suspense 안). */
async function Sidebar() {
  const user = await getCurrentUser();
  return user ? <SidebarNav /> : null;
}

/** 로그인 후 화면 공통 틀: 위 헤더 + 왼쪽 메뉴 + 본문. */
export function AppShell({
  children,
  mainClassName = "flex flex-1 flex-col px-4 py-8 sm:px-6",
}: {
  children: ReactNode;
  mainClassName?: string;
}) {
  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col md:flex-row">
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
        <main className={`min-w-0 ${mainClassName}`}>{children}</main>
      </div>
    </>
  );
}
