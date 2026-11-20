-- series 테이블 권한
-- 최근 Supabase 프로젝트는 새 테이블에 API 역할 권한을 자동으로 주지 않을 수 있어서 명시적으로 준다.
-- 로그인한 사용자(authenticated)만 허용하고, 실제로 어떤 행에 접근할지는 RLS 정책이 정한다.
-- 로그인하지 않은 사용자(anon)에게는 주지 않는다.
-- 여러 번 실행해도 안전하다.

grant select, insert, update, delete on table public.series to authenticated;
