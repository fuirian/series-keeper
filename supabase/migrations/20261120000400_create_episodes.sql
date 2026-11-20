-- 회차 테이블과 회차 영상 저장소(Storage)
-- 적용: Supabase SQL Editor에 붙여 넣고 Run (한 번만)

/* ───────── 회차 ───────── */

create table public.episode (
  id           uuid primary key default gen_random_uuid(),
  series_id    uuid not null references public.series (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number       integer not null check (number between 1 and 9999),
  title        text check (title is null or char_length(title) <= 100),
  video_path   text not null,
  size_bytes   bigint check (size_bytes is null or size_bytes >= 0),
  duration_ms  integer check (duration_ms is null or duration_ms >= 0),
  -- pending: 분석 대기 / processing: 분석 중 / done: 완료 / failed: 실패
  status       text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  created_at   timestamptz not null default now(),
  unique (series_id, number)
);

create index episode_series_idx on public.episode (series_id, number);

alter table public.episode enable row level security;

create policy "episode_select_own" on public.episode
  for select to authenticated
  using ((select auth.uid()) = owner_id);

-- 자기 시리즈에만 회차를 추가할 수 있다
create policy "episode_insert_own" on public.episode
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid()))
  );

create policy "episode_update_own" on public.episode
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "episode_delete_own" on public.episode
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- 사용자는 status를 직접 바꾸지 않는다 (분석 워커가 service role로 바꾼다).
-- 그래서 update 권한은 제목·번호 컬럼에만 준다.
grant select, insert, delete on table public.episode to authenticated;
grant update (number, title) on table public.episode to authenticated;

/* ───────── 회차 영상 저장소 ───────── */
-- 비공개 버킷. 파일 경로는 {사용자 id}/{시리즈 id}/{랜덤}.{확장자}
-- 무료 플랜은 파일당 50MB가 상한이라 버킷 제한도 50MB로 맞춘다 (Pro 플랜이면 올려도 됨)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('episodes', 'episodes', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy "episodes_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'episodes' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "episodes_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'episodes' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "episodes_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'episodes' and (storage.foldername(name))[1] = (select auth.uid())::text);
