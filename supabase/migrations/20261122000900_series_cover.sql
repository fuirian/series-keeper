-- 시리즈 대표 이미지
-- 파일은 references 버킷 {user_id}/{series_id}/cover/... 에 둔다 (기존 Storage 정책: 첫 폴더가 본인 id)
-- 기록·교체·삭제는 백엔드 API(PUT/DELETE /v1/series/{id}/cover)가 맡는다
-- 적용: Supabase SQL Editor에 붙여 넣고 Run (한 번만)

alter table public.series
  add column cover_path text check (cover_path is null or char_length(cover_path) <= 300);
