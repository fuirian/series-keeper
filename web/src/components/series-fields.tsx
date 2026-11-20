import type { SeriesField } from "@/app/actions/series";
import { FieldError, inputClass } from "@/components/form";

const STYLE_OPTIONS = [
  { value: "anime", label: "애니체", hint: "애니메이션·만화풍" },
  { value: "live_action", label: "실사", hint: "실제 사람 같은 영상" },
  { value: "other", label: "기타", hint: "3D, 픽셀아트 등" },
];

type Props = {
  values?: { title?: string; style?: string; styleNote?: string };
  errors?: Partial<Record<SeriesField, string>>;
};

/** 시리즈 제목·화풍·스타일 메모 입력칸. 새 시리즈와 설정 탭에서 같이 쓴다. */
export function SeriesFields({ values, errors = {} }: Props) {
  return (
    <>
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">
          시리즈 제목
        </label>
        <input
          id="title"
          name="title"
          maxLength={100}
          placeholder="예: 달빛 하숙집"
          defaultValue={values?.title}
          aria-invalid={!!errors.title}
          aria-describedby="title-error"
          className={inputClass}
        />
        <FieldError id="title-error" message={errors.title} />
      </div>

      <fieldset aria-describedby="style-error">
        <legend className="mb-2 text-sm font-medium">화풍</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {STYLE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer flex-col rounded-md border border-black/15 px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-black/5 dark:border-white/20 dark:has-[:checked]:bg-white/10"
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="style"
                  value={opt.value}
                  defaultChecked={(values?.style ?? "anime") === opt.value}
                />
                {opt.label}
              </span>
              <span className="mt-0.5 pl-5 text-xs text-black/50 dark:text-white/50">{opt.hint}</span>
            </label>
          ))}
        </div>
        <FieldError id="style-error" message={errors.style} />
      </fieldset>

      <div>
        <label htmlFor="styleNote" className="mb-1 block text-sm font-medium">
          스타일 메모 <span className="font-normal text-black/50 dark:text-white/50">(선택)</span>
        </label>
        <textarea
          id="styleNote"
          name="styleNote"
          rows={3}
          maxLength={500}
          placeholder="예: 따뜻한 파스텔 톤, 2010년대 일본 TV 애니 느낌"
          defaultValue={values?.styleNote}
          aria-invalid={!!errors.styleNote}
          aria-describedby="styleNote-error"
          className={inputClass}
        />
        <FieldError id="styleNote-error" message={errors.styleNote} />
      </div>
    </>
  );
}
