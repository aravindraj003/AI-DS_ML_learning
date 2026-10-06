-- Assessment timers and course activity tracking.
-- Apply after 07-production-hardening.sql.

alter table public.lms_assessments
  add column if not exists duration_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lms_assessments_duration_minutes_check'
  ) then
    alter table public.lms_assessments
      add constraint lms_assessments_duration_minutes_check
      check (duration_minutes is null or duration_minutes between 1 and 1440);
  end if;
end $$;

create table if not exists public.lms_learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  unit_id uuid references public.lms_units(id) on delete set null,
  topic_id uuid references public.lms_topics(id) on delete set null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.lms_assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.lms_assessments(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'expired')),
  answers jsonb not null default '{}'::jsonb
);

create unique index if not exists lms_assessment_sessions_active_unique
  on public.lms_assessment_sessions(user_id, assessment_id)
  where status = 'in_progress';

create index if not exists lms_learning_sessions_user_idx
  on public.lms_learning_sessions(user_id, started_at desc);

create index if not exists lms_assessment_sessions_user_idx
  on public.lms_assessment_sessions(user_id, started_at desc);

alter table public.lms_learning_sessions enable row level security;
alter table public.lms_assessment_sessions enable row level security;

drop policy if exists lms_learning_sessions_self_select on public.lms_learning_sessions;
drop policy if exists lms_learning_sessions_self_insert on public.lms_learning_sessions;
drop policy if exists lms_learning_sessions_self_update on public.lms_learning_sessions;
drop policy if exists lms_learning_sessions_admin_select on public.lms_learning_sessions;
create policy lms_learning_sessions_self_or_admin_select on public.lms_learning_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin(auth.uid())));
create policy lms_learning_sessions_self_insert on public.lms_learning_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy lms_learning_sessions_self_update on public.lms_learning_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists lms_assessment_sessions_self_select on public.lms_assessment_sessions;
drop policy if exists lms_assessment_sessions_self_insert on public.lms_assessment_sessions;
drop policy if exists lms_assessment_sessions_self_update on public.lms_assessment_sessions;
create policy lms_assessment_sessions_self_or_admin_select on public.lms_assessment_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin(auth.uid())));
create policy lms_assessment_sessions_self_insert on public.lms_assessment_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy lms_assessment_sessions_self_update on public.lms_assessment_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select on public.lms_learning_sessions to authenticated;
revoke insert, update, delete on public.lms_learning_sessions from authenticated, anon;
grant select on public.lms_assessment_sessions to authenticated;

alter table public.lms_attempts
  add column if not exists assessment_session_id uuid references public.lms_assessment_sessions(id) on delete set null;
alter table public.lms_attempts
  add column if not exists started_at timestamptz;
alter table public.lms_attempts
  add column if not exists time_spent_seconds integer not null default 0;
alter table public.lms_attempts
  add column if not exists submission_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lms_attempts_time_spent_seconds_check'
  ) then
    alter table public.lms_attempts add constraint lms_attempts_time_spent_seconds_check
      check (time_spent_seconds >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'lms_attempts_submission_reason_check'
  ) then
    alter table public.lms_attempts add constraint lms_attempts_submission_reason_check
      check (submission_reason is null or submission_reason in ('manual', 'auto_timeout', 'admin'));
  end if;
end $$;

grant select, update, delete on public.lms_attempts to authenticated;

-- Security hardening: assessment sessions and final attempts are server-managed.
revoke insert, update, delete on public.lms_assessment_sessions from authenticated, anon;
revoke insert on public.lms_attempts from authenticated, anon;

-- Helpful admin analytics indexes.
create index if not exists lms_learning_sessions_topic_idx on public.lms_learning_sessions(user_id, unit_id, topic_id, started_at desc);
create index if not exists lms_learning_sessions_last_seen_idx on public.lms_learning_sessions(last_seen_at desc);

-- Admin-only aggregate views. These views are intended to be queried by the admin UI.
create or replace view public.lms_admin_student_learning_summary as
select
  ls.user_id,
  coalesce(sum(ls.duration_seconds),0)::bigint as total_seconds,
  count(*)::bigint as session_count,
  max(ls.last_seen_at) as last_active_at
from public.lms_learning_sessions ls
join public.profiles p on p.id = ls.user_id
where p.role <> 'admin'
group by ls.user_id;

create or replace view public.lms_admin_student_topic_time as
select
  ls.user_id,
  ls.unit_id,
  ls.topic_id,
  coalesce(sum(ls.duration_seconds),0)::bigint as total_seconds,
  count(*)::bigint as session_count,
  max(ls.last_seen_at) as last_active_at
from public.lms_learning_sessions ls
join public.profiles p on p.id = ls.user_id
where p.role <> 'admin'
group by ls.user_id, ls.unit_id, ls.topic_id;

revoke all on public.lms_admin_student_learning_summary from anon, authenticated;
revoke all on public.lms_admin_student_topic_time from anon, authenticated;

-- Login/audit timestamps are kept separately from topic learning time.
create table if not exists public.lms_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  login_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  logout_at timestamptz
);
create index if not exists lms_login_events_user_idx on public.lms_login_events(user_id, login_at desc);
alter table public.lms_login_events enable row level security;
drop policy if exists lms_login_events_self_select on public.lms_login_events;
drop policy if exists lms_login_events_admin_select on public.lms_login_events;
create policy lms_login_events_self_or_admin_select on public.lms_login_events
  for select to authenticated using ((select auth.uid()) = user_id or (select private.is_admin(auth.uid())));
revoke insert, update, delete on public.lms_login_events from authenticated, anon;
grant select on public.lms_login_events to authenticated;
