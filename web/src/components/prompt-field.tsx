import { FieldError, inputClass } from "@/components/form";

/** 바이블의 "생성용 프롬프트" 입력 칸 (캐릭터·장소·시리즈 화풍 공통). 재생성 키트가 이 값을 쓴다. */
export function PromptField({
  id,
  name = "prompt",
  label = "생성용 프롬프트",
  defaultValue,
  error,
  maxLength = 1000,
  placeholder,
}: {
  id: string;
  name?: string;
  label?: string;
  defaultValue?: string;
  error?: string;
  maxLength?: number;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label} <span className="font-normal text-black/50 dark:text-white/50">(선택)</span>
      </label>
      <textarea
        id={id}
        name={name}
        rows={3}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={!!error}
        aria-describedby={`${id}-hint ${id}-error`}
        className={`${inputClass} font-mono text-xs leading-relaxed`}
      />
      {error ? (
        <FieldError id={`${id}-error`} message={error} />
      ) : (
        <p id={`${id}-hint`} className="mt-1 text-xs text-black/50 dark:text-white/50">
          생성 도구에 넣던 고정 프롬프트를 적어 두면, 문제 컷을 다시 만들 때 &lsquo;다시 만들기 키트&rsquo;에 그대로
          들어갑니다. 영어로 쓰면 대부분의 도구에서 결과가 좋습니다.
        </p>
      )}
    </div>
  );
}

/** 보기 모드에서 생성용 프롬프트 표시. 비어 있으면 채우라는 안내. */
export function PromptView({ prompt, label = "생성용 프롬프트" }: { prompt: string | null; label?: string }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-black/50 dark:text-white/50">{label}</p>
      {prompt ? (
        <p className="mt-0.5 whitespace-pre-line break-words rounded bg-black/[0.03] px-2 py-1 font-mono text-xs dark:bg-white/5">
          {prompt}
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-black/40 dark:text-white/40">
          비어 있음 — 수정에서 채우면 다시 만들기 키트가 더 정확해집니다.
        </p>
      )}
    </div>
  );
}
