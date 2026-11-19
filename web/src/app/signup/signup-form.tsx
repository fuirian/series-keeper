"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { FieldError, FormMessage, inputClass, submitClass } from "@/components/form";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  const errors = state?.errors ?? {};

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
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby="password-error password-hint"
          className={inputClass}
        />
        {errors.password ? (
          <FieldError id="password-error" message={errors.password} />
        ) : (
          <p id="password-hint" className="mt-1 text-xs text-black/50 dark:text-white/50">
            영문과 숫자를 포함해 8자 이상
          </p>
        )}
      </div>

      <div>
        <label htmlFor="passwordConfirm" className="mb-1 block text-sm font-medium">
          비밀번호 확인
        </label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.passwordConfirm}
          aria-describedby="passwordConfirm-error"
          className={inputClass}
        />
        <FieldError id="passwordConfirm-error" message={errors.passwordConfirm} />
      </div>

      <div>
        <label className="flex items-start gap-2 text-sm">
          <input
            name="terms"
            type="checkbox"
            aria-invalid={!!errors.terms}
            aria-describedby="terms-error"
            className="mt-0.5"
          />
          <span>
            이용약관에 동의합니다. 업로드하는 영상은 본인이 권리를 가진 영상이어야 합니다.
          </span>
        </label>
        <FieldError id="terms-error" message={errors.terms} />
      </div>

      <FormMessage message={state?.message} />

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "확인 중…" : "회원가입"}
      </button>

      <p className="text-center text-sm text-black/60 dark:text-white/60">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          로그인
        </Link>
      </p>
    </form>
  );
}
