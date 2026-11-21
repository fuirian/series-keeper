"use client";

import { useActionState, useRef } from "react";
import { changePassword, type PasswordState } from "@/app/actions/auth";
import { FieldError, FormMessage, inputClass, submitClass } from "@/components/form";

export function PasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: PasswordState, formData: FormData) => {
    const next = await changePassword(prev, formData);
    if (next?.success) formRef.current?.reset();
    return next;
  }, undefined);
  const errors = state?.errors ?? {};

  return (
    <form ref={formRef} action={action} className="flex max-w-sm flex-col gap-4" noValidate>
      {(
        [
          ["current", "지금 비밀번호", "current-password"],
          ["password", "새 비밀번호", "new-password"],
          ["passwordConfirm", "새 비밀번호 확인", "new-password"],
        ] as const
      ).map(([name, label, autoComplete]) => (
        <div key={name}>
          <label htmlFor={`pw-${name}`} className="mb-1 block text-sm font-medium">
            {label}
          </label>
          <input
            id={`pw-${name}`}
            name={name}
            type="password"
            autoComplete={autoComplete}
            aria-invalid={!!errors[name]}
            aria-describedby={`pw-${name}-error`}
            className={inputClass}
          />
          <FieldError id={`pw-${name}-error`} message={errors[name]} />
        </div>
      ))}
      <p className="-mt-2 text-xs text-black/50 dark:text-white/50">8자 이상, 영문과 숫자를 모두 넣어 주세요.</p>

      <FormMessage message={state?.message} />

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "바꾸는 중…" : "비밀번호 바꾸기"}
      </button>
    </form>
  );
}
