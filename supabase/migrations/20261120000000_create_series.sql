-- 시리즈 테이블
-- 적용: Supabase 대시보드 → SQL Editor에 이 파일 내용을 붙여 넣고 Run (한 번만)

create table public.series (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 100),
  style       text not null default 'other' check (style in ('live_action', 'anime', 'other')),
  style_note  text check (style_note is null or char_length(style_note) <= 500),
  created_at  timestamptz not null default now()
);

create index series_owner_created_idx on public.series (owner_id, created_at desc);

-- 행 단위 보안: 자기 시리즈만 보고·만들고·고치고·지울 수 있다
alter table public.series enable row level security;

create policy "series_select_own" on public.series
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "series_insert_own" on public.series
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "series_update_own" on public.series
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "series_delete_own" on public.series
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
