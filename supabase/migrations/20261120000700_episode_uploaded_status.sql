-- 회차 '검사 전'(uploaded) 상태 추가
-- 업로드만으로 검사가 시작되면, 캐릭터 레퍼런스를 등록하기 전에 검사가 돌아 실패한다.
-- 이제 업로드하면 '검사 전'이고, 사용자가 '검사하기'를 눌러야 '검사 대기'(pending)가 된다.
-- 적용: Supabase SQL Editor에 붙여 넣고 Run (한 번만)

-- 상태 값에 uploaded 추가 (기존 회차의 상태는 그대로)
alter table public.episode drop constraint episode_status_check;
alter table public.episode
  add constraint episode_status_check
  check (status in ('uploaded', 'pending', 'processing', 'done', 'failed'));

-- 새로 올리는 회차는 '검사 전'
alter table public.episode alter column status set default 'uploaded';

-- 검사 요청: '검사 전'·'완료'·'실패' 회차를 '검사 대기'로 (본인 회차만)
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
     and status in ('uploaded', 'done', 'failed');
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;
