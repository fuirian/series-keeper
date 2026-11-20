"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { checkEpisodeNumber, createEpisode } from "@/app/actions/episodes";
import { FieldError, FormMessage, inputClass, submitClass } from "@/components/form";
import { EPISODE_BUCKET, formatBytes, formatDuration, MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/lib/episode-constants";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";
import { getBrowserClient } from "@/lib/supabase/client";

/** 파일에서 영상 길이(ms)를 읽는다. 못 읽으면 null. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (ms: number | null) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    const timer = window.setTimeout(() => done(null), 5000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done(Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null);
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    video.src = url;
  });
}

/**
 * Supabase Storage REST API로 직접 올린다 (진행률을 보려고 XHR 사용).
 * supabase-js의 upload()는 진행률을 알려 주지 않는다.
 */
function uploadWithProgress(
  path: string,
  file: File,
  accessToken: string,
  onProgress: (ratio: number) => void,
  xhrRef: { current: XMLHttpRequest | null },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/${EPISODE_BUCKET}/${encodedPath}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", supabaseKey);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload failed ${xhr.status}: ${xhr.responseText}`));
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      reject(new Error("network error"));
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      reject(new DOMException("aborted", "AbortError"));
    };
    xhr.send(file);
  });
}

type Errors = { number?: string; title?: string; file?: string };

export function EpisodeUpload({ userId, seriesId, nextNumber }: { userId: string; seriesId: string; nextNumber: number }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | undefined>();
  const [progress, setProgress] = useState<number | null>(null); // null = 업로드 중 아님
  const [isPending, startTransition] = useTransition();
  const uploading = progress !== null;

  async function onPickFile(picked: File | undefined) {
    setErrors((e) => ({ ...e, file: undefined }));
    setMessage(undefined);
    setFile(null);
    setDurationMs(null);
    if (!picked) return;
    if (!VIDEO_TYPES[picked.type]) {
      setErrors((e) => ({ ...e, file: "MP4, MOV, WEBM 영상만 올릴 수 있습니다." }));
      return;
    }
    if (picked.size > MAX_VIDEO_BYTES) {
      setErrors((e) => ({
        ...e,
        file: `파일이 ${formatBytes(picked.size)}입니다. 50MB 이하로 압축해 주세요 (예: 720p로 내보내기).`,
      }));
      return;
    }
    setFile(picked);
    setDurationMs(await readDuration(picked));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(undefined);
    const form = new FormData(e.currentTarget);
    const number = Number(form.get("number"));
    const title = String(form.get("title") ?? "").trim();

    const nextErrors: Errors = {};
    if (!Number.isInteger(number) || number < 1 || number > 9999) nextErrors.number = "1~9999 사이 숫자를 입력해 주세요.";
    if (title.length > 100) nextErrors.title = "제목은 100자 이하로 써 주세요.";
    if (!file) nextErrors.file = "영상 파일을 골라 주세요.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !file) return;

    // 큰 파일을 올린 뒤에 번호 중복으로 실패하지 않게 먼저 확인
    const check = await checkEpisodeNumber({ seriesId, number });
    if (!check.ok) return setErrors({ number: check.message });

    const { data } = await getBrowserClient().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return setMessage("로그인이 만료되었습니다. 다시 로그인해 주세요.");

    const path = `${userId}/${seriesId}/${crypto.randomUUID()}.${VIDEO_TYPES[file.type]}`;
    setProgress(0);
    try {
      await uploadWithProgress(path, file, token, setProgress, xhrRef);
    } catch (err) {
      setProgress(null);
      if (err instanceof DOMException && err.name === "AbortError") return setMessage("업로드를 취소했습니다.");
      console.error(err);
      return setMessage("업로드에 실패했습니다. 파일 크기(50MB)와 저장소 설정(SQL)을 확인해 주세요.");
    }

    const result = await createEpisode({ seriesId, number, title, path, sizeBytes: file.size, durationMs });
    setProgress(null);
    if (!result.ok) return setMessage(result.message);

    formRef.current?.reset();
    setFile(null);
    setDurationMs(null);
    setMessage(`${number}화를 등록했습니다.`);
    startTransition(() => router.refresh());
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15"
      noValidate
    >
      <h3 className="font-semibold">회차 영상 올리기</h3>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="sm:w-28">
          <label htmlFor="episode-number" className="mb-1 block text-sm font-medium">
            회차
          </label>
          <div className="flex items-center gap-1">
            <input
              id="episode-number"
              name="number"
              type="number"
              min={1}
              max={9999}
              defaultValue={nextNumber}
              disabled={uploading}
              aria-invalid={!!errors.number}
              aria-describedby="episode-number-error"
              className={inputClass}
            />
            <span className="text-sm">화</span>
          </div>
        </div>
        <div className="flex-1">
          <label htmlFor="episode-title" className="mb-1 block text-sm font-medium">
            제목 <span className="font-normal text-black/50 dark:text-white/50">(선택)</span>
          </label>
          <input
            id="episode-title"
            name="title"
            maxLength={100}
            placeholder="예: 새로운 하숙생"
            disabled={uploading}
            aria-invalid={!!errors.title}
            aria-describedby="episode-title-error"
            className={inputClass}
          />
        </div>
      </div>
      <FieldError id="episode-number-error" message={errors.number} />
      <FieldError id="episode-title-error" message={errors.title} />

      <div>
        <label htmlFor="episode-file" className="mb-1 block text-sm font-medium">
          영상 파일
        </label>
        <input
          id="episode-file"
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          disabled={uploading}
          onChange={(e) => void onPickFile(e.target.files?.[0])}
          aria-invalid={!!errors.file}
          aria-describedby="episode-file-error episode-file-hint"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-black/5 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-black/10 dark:file:bg-white/10"
        />
        {errors.file ? (
          <FieldError id="episode-file-error" message={errors.file} />
        ) : (
          <p id="episode-file-hint" className="mt-1 text-xs text-black/50 dark:text-white/50">
            MP4·MOV·WEBM, 50MB 이하 (Supabase 무료 플랜 상한). 크면 720p로 내보내 주세요.
            {file && ` · 선택: ${formatBytes(file.size)}${durationMs != null ? `, ${formatDuration(durationMs)}` : ""}`}
          </p>
        )}
      </div>

      {progress !== null && (
        <div className="flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="업로드 진행률"
          >
            <div className="h-full bg-foreground transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="w-10 text-right text-sm tabular-nums">{Math.round(progress * 100)}%</span>
          <button
            type="button"
            onClick={() => xhrRef.current?.abort()}
            className="rounded-md px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
          >
            취소
          </button>
        </div>
      )}

      <FormMessage message={message} />

      <div>
        <button type="submit" disabled={uploading || isPending} className={submitClass}>
          {uploading ? "올리는 중…" : "업로드"}
        </button>
      </div>
    </form>
  );
}
