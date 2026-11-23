"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { FieldError, FormMessage, inputClass, submitClass } from "@/components/form";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  const errors = state?.errors ?? {};
  // 제출 결과 메시지가 있으면 그걸, 없으면 주소로 넘어온 안내를 보여 준다
  const message = state?.message ?? (state ? undefined : notice);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state?.values?.email}
          aria-invalid={!!errors.email}
          aria-describedby="email-error"
          className={inputClass}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby="password-error"
          className={inputClass}
        />
        <FieldError id="password-error" message={errors.password} />
      </div>

      <FormMessage message={message} />

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "확인 중…" : "로그인"}
      </button>

      <p className="text-center text-sm text-black/60 dark:text-white/60">
        계정이 없나요?{" "}
        <Link href="/signup" className="font-medium text-primary-strong underline underline-offset-4">
          회원가입
        </Link>
      </p>
    </form>
  );
}
