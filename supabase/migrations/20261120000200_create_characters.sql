-- 캐릭터·레퍼런스 이미지 테이블과 이미지 저장소(Storage)
-- 적용: Supabase SQL Editor에 붙여 넣고 Run (한 번만)

/* ───────── 캐릭터 ───────── */

create table public.character (
  id           uuid primary key default gen_random_uuid(),
  series_id    uuid not null references public.series (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 50),
  description  text check (description is null or char_length(description) <= 1000),
  created_at   timestamptz not null default now()
);

create index character_series_idx on public.character (series_id, created_at);

alter table public.character enable row level security;

create policy "character_select_own" on public.character
  for select to authenticated
  using ((select auth.uid()) = owner_id);

-- 자기 시리즈에만 캐릭터를 추가할 수 있다
create policy "character_insert_own" on public.character
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.series s where s.id = series_id and s.owner_id = (select auth.uid()))
  );

create policy "character_update_own" on public.character
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "character_delete_own" on public.character
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on table public.character to authenticated;

/* ───────── 레퍼런스 이미지 ───────── */
-- 캐릭터마다 각도별로 한 장씩 (정면은 일관성 검사에 필수)
-- 얼굴 임베딩(vector) 컬럼은 분석 워커를 붙일 때 추가한다

create table public.reference_image (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.character (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  angle         text not null check (angle in ('front', 'side', 'back', 'full')),
  storage_path  text not null,
  created_at    timestamptz not null default now(),
  unique (character_id, angle)
);

alter table public.reference_image enable row level security;

create policy "reference_image_select_own" on public.reference_image
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "reference_image_insert_own" on public.reference_image
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.character c where c.id = character_id and c.owner_id = (select auth.uid()))
  );

create policy "reference_image_update_own" on public.reference_image
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "reference_image_delete_own" on public.reference_image
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on table public.reference_image to authenticated;

/* ───────── 이미지 저장소 ───────── */
-- 비공개 버킷. 파일 경로는 {사용자 id}/{시리즈 id}/{캐릭터 id}/{각도}.{확장자}
-- 첫 폴더가 본인 id인 파일만 읽고 쓸 수 있다. 화면에는 짧게 유효한 서명 URL로 보여 준다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('references', 'references', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "references_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'references' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "references_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'references' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "references_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'references' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'references' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "references_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'references' and (storage.foldername(name))[1] = (select auth.uid())::text);
