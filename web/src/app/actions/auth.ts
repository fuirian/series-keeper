"use server";

export type SignupField = "email" | "password" | "passwordConfirm" | "terms";

export type SignupState = {
  errors?: Partial<Record<SignupField, string>>;
  message?: string;
  values?: { email: string };
} | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string, password: string, passwordConfirm: string, terms: boolean) {
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

export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const terms = formData.get("terms") === "on";

  const errors = validate(email, password, passwordConfirm, terms);
  if (Object.keys(errors).length > 0) {
    return { errors, values: { email } };
  }

  // TODO: Supabase Auth 연결 (supabase.auth.signUp) 후 확인 메일 안내 화면으로 이동
  return {
    message: "입력값 확인 완료. 실제 가입 처리는 Supabase 연결 후 동작합니다.",
    values: { email },
  };
}

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
  if (Object.keys(errors).length > 0) {
    return { errors, values: { email } };
  }

  // TODO: Supabase Auth 연결 (supabase.auth.signInWithPassword) 후 시리즈 목록으로 이동.
  //       실패 시에는 어느 칸이 틀렸는지 알려 주지 않고 "이메일 또는 비밀번호가 올바르지 않습니다"로 통일.
  return {
    message: "입력값 확인 완료. 실제 로그인은 Supabase 연결 후 동작합니다.",
    values: { email },
  };
}
