import "server-only";

import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 백엔드(FastAPI, api/) 호출. 서버 컴포넌트·서버 액션에서만 쓴다.
 * 로그인 토큰을 Authorization 헤더로 넘기면, 백엔드가 토큰을 검증하고 그 사용자 권한으로 DB를 읽는다.
 */
const API_URL = (process.env.API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unreachable" | "unauthorized" | "error"; status?: number };

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  await connection(); // 요청마다 (사용자별 데이터)
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, reason: "unauthorized" };

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error("apiGet unreachable", path, err);
    return { ok: false, reason: "unreachable" };
  }

  if (res.status === 401) return { ok: false, reason: "unauthorized", status: 401 };
  if (!res.ok) {
    console.error("apiGet", path, res.status);
    return { ok: false, reason: "error", status: res.status };
  }
  return { ok: true, data: (await res.json()) as T };
}

/** GET /v1/me 응답 (api/src/skapi/routers/me.py의 Me와 같은 모양) */
export type Me = {
  id: string;
  email: string | null;
  created_at: string | null;
  email_confirmed_at: string | null;
  usage: {
    series: number;
    characters: number;
    episodes: number;
    checked_episodes: number;
    open_issues: number;
  };
};
