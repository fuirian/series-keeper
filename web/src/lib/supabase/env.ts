/** Supabase 연결 정보. web/.env.local에 넣는다 (.env.example 참고). */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** 키가 없을 때도 화면은 뜨도록, 각 기능은 이 값을 먼저 확인한다. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
