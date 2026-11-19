import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "./env";

export type CurrentUser = { id: string; email: string | null };

/**
 * 지금 로그인한 사용자. 없으면 null.
 * 서버 컴포넌트에서 쓸 때는 <Suspense> 안에 둘 것.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Supabase가 토큰 만료 확인에 현재 시각(Date.now)을 쓰므로, 미리 렌더링하지 않고 요청 때만 실행한다
  await connection();
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
}

/** 서버 컴포넌트·서버 액션·라우트 핸들러용 Supabase 클라이언트. 요청마다 새로 만든다. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy가 맡으므로 무시해도 된다.
        }
      },
    },
  });
}
