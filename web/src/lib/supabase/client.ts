"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "./env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** 브라우저용 Supabase 클라이언트 (파일 업로드 등). 로그인 세션은 쿠키에서 읽는다. */
export function getBrowserClient() {
  client ??= createBrowserClient(supabaseUrl, supabaseKey);
  return client;
}
