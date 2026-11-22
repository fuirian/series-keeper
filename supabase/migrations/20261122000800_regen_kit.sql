-- 재생성 키트 (docs/regen-kit-plan.md)
-- 1. 바이블에 "생성용 프롬프트" 칸: 사용자가 생성 도구에 넣던 고정 프롬프트를 저장해 키트에 쓴다
-- 2. 키트 사용 기록: 어떤 도구로 복사·다운로드했는지 (2·3단계 판단 근거)
-- 적용: Supabase SQL Editor에 붙여 넣고 Run (한 번만)

alter table public.character
  add column prompt text check (prompt is null or char_length(prompt) <= 1000);

alter table public.location
  add column prompt text check (prompt is null or char_length(prompt) <= 1000);

alter table public.series
  add column style_prompt text check (style_prompt is null or char_length(style_prompt) <= 500);

create table public.regen_kit_event (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  issue_id    uuid references public.issue (id) on delete set null,
  tool        text not null check (char_length(tool) between 1 and 40),
  action      text not null check (action in ('open', 'copy_prompt', 'download_refs')),
  created_at  timestamptz not null default now()
);

create index regen_kit_event_owner_created_idx on public.regen_kit_event (owner_id, created_at desc);

alter table public.regen_kit_event enable row level security;

-- 본인 기록만 남기고 본다. 고치거나 지우지 않는다 (기록이므로)
create policy "regen_kit_event_select_own" on public.regen_kit_event
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "regen_kit_event_insert_own" on public.regen_kit_event
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

grant select, insert on table public.regen_kit_event to authenticated;
