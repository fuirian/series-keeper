-- 이슈 검토 상태: 해결 여부(예/아니오) → 미처리·해결됨·오탐
-- 오탐(false_positive) 표시는 검출 정밀도를 재는 데이터가 된다.
-- 적용: Supabase SQL Editor에 붙여 넣고 Run (한 번만)

alter table public.issue
  add column review text not null default 'open'
    check (review in ('open', 'resolved', 'false_positive'));

-- 이미 '해결됨'으로 표시한 이슈가 있으면 옮긴다
update public.issue set review = 'resolved' where resolved;

-- 예전 칸과 그 칸의 수정 권한은 지운다
revoke update (resolved) on table public.issue from authenticated;
alter table public.issue drop column resolved;

-- 사용자는 검토 상태만 바꿀 수 있다 (행 범위는 기존 issue_update_own 정책이 본인 것으로 제한)
grant update (review) on table public.issue to authenticated;
