-- 장소·장소 레퍼런스 이미지 테이블
-- 이미지 파일은 캐릭터와 같은 비공개 버킷 'references'에 저장한다 (정책은 20261120000200에서 이미 만듦)
-- 적용: Supabase SQL Editor에 붙여 넣고 Run (한 번만)

/* ───────── 장소 ───────── */

create table public.location (
  id           uuid primary key default gen_random_uuid(),
  series_id    uuid not null references public.series (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 50),
  description  text check (description is null or char_length(description) <= 1000),
  -- 문·창문·가구 위치처럼 회차마다 바뀌면 안 되는 배치 정보 (장소 배치 검사의 기준)
  layout_note  text check (layout_note is null or char_length(layout_note) <= 1000),
  created_at   timestamptz not null default now()
);

create index location_series_idx on public.location (series_id, created_at);

alter table public.location enable row level security;

create policy "location_select_own" on public.location
  for select to authenticated
  using ((select auth.uid()) = owner_id);

-- 자기 시리즈에만 장소를 추가할 수 있다
create policy "location_insert_own" on public.location
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid()))
  );

create policy "location_update_own" on public.location
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "location_delete_own" on public.location
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on table public.location to authenticated;

/* ───────── 장소 레퍼런스 이미지 ───────── */
-- 장소마다 시점별로 한 장씩: 전경(필수), 다른 각도 1·2, 디테일

create table public.location_image (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.location (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  angle         text not null check (angle in ('wide', 'angle1', 'angle2', 'detail')),
  storage_path  text not null,
  created_at    timestamptz not null default now(),
  unique (location_id, angle)
);

alter table public.location_image enable row level security;

create policy "location_image_select_own" on public.location_image
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "location_image_insert_own" on public.location_image
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.location l where l.id = location_id and l.owner_id = (select auth.uid()))
  );

create policy "location_image_update_own" on public.location_image
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "location_image_delete_own" on public.location_image
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on table public.location_image to authenticated;
