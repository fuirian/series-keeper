-- 분석 결과 테이블(컷·이슈)과 분석 워커가 작업을 가져가는 함수
-- 적용: Supabase SQL Editor에 붙여 넣고 Run (한 번만)
--
-- 분석 워커는 Secret key(service_role)로 접속하므로 RLS를 거치지 않는다.
-- 사용자(authenticated)는 자기 결과를 읽기만 한다.

/* ───────── 회차에 분석 정보 컬럼 추가 ───────── */

alter table public.episode
  add column analysis_started_at  timestamptz,
  add column analysis_finished_at timestamptz,
  add column analysis_error       text,      -- 실패 이유 (사용자에게 보여 줄 문장)
  add column analysis_summary     jsonb;     -- 컷 수·이슈 수·처리 시간 등

/* ───────── 컷 ───────── */

create table public.shot (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references public.episode (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  index       integer not null,
  start_ms    integer not null,
  end_ms      integer not null,
  face_count  integer not null default 0,
  unique (episode_id, index)
);

alter table public.shot enable row level security;

create policy "shot_select_own" on public.shot
  for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select on table public.shot to authenticated;

/* ───────── 이슈 (일관성이 깨진 컷) ───────── */

create table public.issue (
  id                   uuid primary key default gen_random_uuid(),
  episode_id           uuid not null references public.episode (id) on delete cascade,
  shot_id              uuid not null references public.shot (id) on delete cascade,
  owner_id             uuid not null references auth.users (id) on delete cascade,
  character_id         uuid references public.character (id) on delete set null,
  runner_up_id         uuid references public.character (id) on delete set null,
  type                 text not null check (type in ('low_similarity', 'ambiguous')),
  similarity           real not null,
  runner_up_similarity real,
  time_ms              integer not null,
  bbox                 integer[] not null,         -- [x, y, w, h]
  frame_path           text,                       -- 문제 프레임 이미지 (references 버킷)
  resolved             boolean not null default false,
  created_at           timestamptz not null default now()
);

create index issue_episode_idx on public.issue (episode_id, similarity);

alter table public.issue enable row level security;

create policy "issue_select_own" on public.issue
  for select to authenticated
  using ((select auth.uid()) = owner_id);

-- 사용자는 "해결됨" 표시만 바꿀 수 있다
create policy "issue_update_own" on public.issue
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select on table public.issue to authenticated;
grant update (resolved) on table public.issue to authenticated;

/* ───────── 작업 가져가기 ───────── */
-- 분석 대기 회차 하나를 '분석 중'으로 바꾸고 돌려준다.
-- 여러 워커가 동시에 불러도 같은 회차를 집지 않도록 FOR UPDATE SKIP LOCKED.
-- 30분 넘게 '분석 중'인 회차(워커가 죽은 경우)도 다시 가져간다.

create or replace function public.claim_next_episode()
returns setof public.episode
language sql
security definer
set search_path = ''
as $$
  update public.episode e
     set status = 'processing',
         analysis_started_at = now(),
         analysis_finished_at = null,
         analysis_error = null
   where e.id = (
     select id from public.episode
      where status = 'pending'
         or (status = 'processing' and analysis_started_at < now() - interval '30 minutes')
      order by created_at
      limit 1
      for update skip locked
   )
  returning e.*;
$$;

-- 워커(service_role)만 부를 수 있게 한다
revoke execute on function public.claim_next_episode() from public, anon, authenticated;
grant execute on function public.claim_next_episode() to service_role;

/* ───────── 다시 분석 요청 ───────── */
-- 사용자는 status를 직접 못 바꾸므로(컬럼 권한), 이 함수로만 '완료·실패' 회차를 '분석 대기'로 되돌린다.
-- 본인 회차인지 함수 안에서 확인한다. 바뀐 회차가 없으면 false.

create or replace function public.request_episode_analysis(p_episode_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.episode
     set status = 'pending',
         analysis_error = null
   where id = p_episode_id
     and owner_id = (select auth.uid())
     and status in ('done', 'failed');
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

revoke execute on function public.request_episode_analysis(uuid) from public, anon;
grant execute on function public.request_episode_analysis(uuid) to authenticated;

/* ───────── 워커 권한 ───────── */
-- 이 프로젝트는 새 테이블에 권한이 자동으로 붙지 않으므로 워커에도 명시적으로 준다.
-- (service_role은 RLS를 거치지 않지만, 테이블 권한은 따로 필요하다)

grant select on table public.series, public.character, public.reference_image to service_role;
grant select, update on table public.episode to service_role;
grant select, insert, update, delete on table public.shot, public.issue to service_role;
