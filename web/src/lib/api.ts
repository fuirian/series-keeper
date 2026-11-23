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
  | {
      ok: false;
      reason: "unreachable" | "unauthorized" | "error";
      status?: number;
      /** 백엔드가 알려 준 이유 (FastAPI detail). 사용자에게 보여 줄 수 있는 문장 */
      detail?: string;
    };

/** 서버 액션에서 쓴다 (렌더링 중이 아니므로 connection() 불필요). */
export async function apiRequest<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, reason: "unauthorized" };

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("api unreachable", method, path, err);
    return { ok: false, reason: "unreachable" };
  }

  if (res.status === 401) return { ok: false, reason: "unauthorized", status: 401 };
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const json = (await res.json()) as { detail?: unknown };
      if (typeof json.detail === "string") detail = json.detail;
    } catch {
      // 본문이 JSON이 아니면 무시
    }
    console.error("api", method, path, res.status, detail);
    return { ok: false, reason: "error", status: res.status, detail };
  }
  if (res.status === 204) return { ok: true, data: undefined as T };
  return { ok: true, data: (await res.json()) as T };
}

/** 서버 컴포넌트에서 읽기. 요청마다 렌더링한다 (사용자별 데이터). */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  await connection();
  return apiRequest<T>("GET", path);
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
