import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * 가입 확인 메일의 링크가 돌아오는 곳.
 * Supabase가 붙여 준 code를 세션으로 바꾸고 메인으로 보낸다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  // 외부 주소로 튕겨 나가지 않게, 같은 사이트 안의 경로만 허용
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code && isSupabaseConfigured) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }

  return NextResponse.redirect(`${origin}/login?error=confirm`);
}
