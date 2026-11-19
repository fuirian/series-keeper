"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_CONFIGURED = "Supabase 설정이 필요합니다. web/.env.local에 키를 넣어 주세요.";

/* ───────── 회원가입 ───────── */

export type SignupField = "email" | "password" | "passwordConfirm" | "terms";

export type SignupState = {
  errors?: Partial<Record<SignupField, string>>;
  message?: string;
  success?: boolean;
  values?: { email: string };
} | undefined;

function validateSignup(email: string, password: string, passwordConfirm: string, terms: boolean) {
  const errors: Partial<Record<SignupField, string>> = {};

  if (!email) errors.email = "이메일을 입력해 주세요.";
  else if (!EMAIL_RE.test(email)) errors.email = "이메일 형식이 올바르지 않습니다.";

  if (password.length < 8) errors.password = "비밀번호는 8자 이상이어야 합니다.";
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    errors.password = "비밀번호에 영문과 숫자를 모두 넣어 주세요.";

  if (passwordConfirm !== password) errors.passwordConfirm = "비밀번호가 일치하지 않습니다.";

  if (!terms) errors.terms = "약관에 동의해야 가입할 수 있습니다.";

  return errors;
}

/** 확인 메일 링크가 돌아올 주소. 배포 환경에서는 NEXT_PUBLIC_SITE_URL을 쓴다. */
async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const terms = formData.get("terms") === "on";

  const errors = validateSignup(email, password, passwordConfirm, terms);
  if (Object.keys(errors).length > 0) return { errors, values: { email } };
  if (!isSupabaseConfigured) return { message: NOT_CONFIGURED, values: { email } };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { errors: { password: "더 강한 비밀번호를 써 주세요." }, values: { email } };
    }
    if (error.code === "over_email_send_rate_limit") {
      return { message: "메일 발송 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.", values: { email } };
    }
    return { message: "가입에 실패했습니다. 잠시 후 다시 시도해 주세요.", values: { email } };
  }

  // 이메일 인증을 끈 프로젝트면 바로 세션이 생긴다
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  // 이미 가입된 이메일이어도 Supabase는 같은 응답을 준다 (가입 여부 노출 방지)
  return {
    success: true,
    message: `${email}로 확인 메일을 보냈습니다. 메일의 링크를 누르면 가입이 완료됩니다.`,
  };
}

/* ───────── 로그인 ───────── */

export type LoginField = "email" | "password";

export type LoginState = {
  errors?: Partial<Record<LoginField, string>>;
  message?: string;
  values?: { email: string };
} | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const errors: Partial<Record<LoginField, string>> = {};
  if (!email) errors.email = "이메일을 입력해 주세요.";
  else if (!EMAIL_RE.test(email)) errors.email = "이메일 형식이 올바르지 않습니다.";
  if (!password) errors.password = "비밀번호를 입력해 주세요.";
  if (Object.keys(errors).length > 0) return { errors, values: { email } };
  if (!isSupabaseConfigured) return { message: NOT_CONFIGURED, values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { message: "이메일 인증을 먼저 완료해 주세요. 가입할 때 받은 메일을 확인해 주세요.", values: { email } };
    }
    // 어느 칸이 틀렸는지 알려 주지 않는다 (가입된 이메일인지 추측 방지)
    return { message: "이메일 또는 비밀번호가 올바르지 않습니다.", values: { email } };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/* ───────── 로그아웃 ───────── */

export async function logout() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}
