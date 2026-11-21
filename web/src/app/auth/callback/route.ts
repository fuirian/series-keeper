import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * 가입 확인 메일의 링크가 돌아오는 곳.
 *
 * 들어오는 경우는 세 가지다.
 * 1. ?code=…  (기본 메일 양식) — Supabase가 이메일 인증을 이미 끝낸 뒤 붙여 주는 코드.
 *    세션으로 바꾸려면 가입한 브라우저에 남은 쿠키(PKCE code verifier)가 필요하다.
 *    메일 앱·휴대폰처럼 다른 브라우저에서 열면 세션만 못 만들 뿐 인증은 이미 된 상태다.
 * 2. ?token_hash=…&type=… (메일 양식을 바꾼 경우) — 어느 브라우저에서 열어도 인증+로그인된다.
 * 3. ?error_code=… — 링크가 만료됐거나 이미 쓰인 경우.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const errorCode = searchParams.get("error_code");
  const next = searchParams.get("next");
  // 외부 주소로 튕겨 나가지 않게, 같은 사이트 안의 경로만 허용
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const toLogin = (notice: string) => NextResponse.redirect(`${origin}/login?notice=${notice}`);
  // 인증되고 로그인까지 된 경우: 원래 가려던 곳으로, 안내를 붙여서
  const toNext = () => {
    const url = new URL(safeNext, origin);
    url.searchParams.set("verified", "1");
    return NextResponse.redirect(url);
  };

  if (!isSupabaseConfigured) return toLogin("confirm");
  if (errorCode) return toLogin(errorCode === "otp_expired" ? "expired" : "confirm");

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return toNext();
    console.error("auth callback verifyOtp", error.code);
    return toLogin(error.code === "otp_expired" ? "expired" : "confirm");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return toNext();
    // code가 왔다는 건 Supabase가 이메일 인증을 이미 끝냈다는 뜻이다.
    // 다른 브라우저에서 열어 세션만 못 만든 것이므로, 로그인만 하면 된다고 안내한다.
    console.error("auth callback exchangeCodeForSession", error.code);
    return toLogin("verified");
  }

  return toLogin("confirm");
}
