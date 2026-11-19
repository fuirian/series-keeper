import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "./env";

/**
 * 요청마다 Supabase 세션을 확인하고, 토큰이 갱신되면 새 쿠키를 응답에 실어 보낸다.
 * 페이지가 렌더링되기 전에 세션을 최신으로 맞춰 두는 역할.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // createServerClient와 getClaims 사이에 다른 코드를 넣지 말 것 (세션 갱신이 꼬일 수 있음)
  await supabase.auth.getClaims();

  return response;
}
