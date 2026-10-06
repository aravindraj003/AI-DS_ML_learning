-- AI&DS-ML LEARNING — Production Supabase schema
-- Run this file in Supabase SQL Editor before deploying the frontend.
-- It creates only LMS-owned tables/policies and does not seed user accounts.

create extension if not exists pgcrypto;

create schema if not exists private;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lms_role' and typnamespace = 'public'::regnamespace) then
    create type public.lms_role as enum ('student', 'admin');
  end if;
end
$$;

-- Existing public.profiles table is used for identity/role. The production app expects:
-- id uuid primary key matching auth.users.id
-- full_name text, email_id text, register_id text, department text, college text, role text/enum-compatible

-- Create the profiles table on a fresh project. If your project already has this table, this is a no-op.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email_id text not null,
  register_id text not null,
  department text not null default '',
  college text not null default '',
  role public.lms_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_email_idx on public.profiles(lower(email_id));
create index if not exists profiles_register_id_idx on public.profiles(lower(register_id));

create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = p_user_id
      and lower(coalesce(role::text, '')) = 'admin'
  );
$$;

revoke all on function private.is_admin(uuid) from public;
revoke all on function private.is_admin(uuid) from anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;

create table if not exists public.lms_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_topics (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.lms_units(id) on delete cascade,
  name text not null,
  link text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, name)
);

create table if not exists public.lms_assessments (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.lms_units(id) on delete cascade,
  title text not null unique,
  description text,
  deadline timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  allow_retake boolean not null default true,
  published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.lms_assessments(id) on delete cascade,
  question_text text not null,
  options jsonb not null,
  correct_index integer not null check (correct_index >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, sort_order)
);

create table if not exists public.lms_topic_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic_id uuid not null references public.lms_topics(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, topic_id)
);

create table if not exists public.lms_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.lms_assessments(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  correct_count integer not null default 0,
  total_count integer not null default 0,
  status text not null default 'completed' check (status in ('completed','verified','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.lms_syllabus (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_name text not null,
  file_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.lms_quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  description text,
  published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.lms_quizzes(id) on delete cascade,
  question_text text not null,
  options jsonb not null,
  correct_index integer not null check (correct_index >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (quiz_id, sort_order)
);

create table if not exists public.lms_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quiz_id uuid not null references public.lms_quizzes(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  correct_count integer not null default 0,
  total_count integer not null default 0,
  submitted_at timestamptz not null default now()
);

create index if not exists lms_topics_unit_order_idx on public.lms_topics(unit_id, sort_order);
create index if not exists lms_questions_assessment_order_idx on public.lms_questions(assessment_id, sort_order);
create index if not exists lms_progress_user_idx on public.lms_topic_progress(user_id);
create index if not exists lms_attempts_user_idx on public.lms_attempts(user_id, submitted_at desc);
create index if not exists lms_attempts_assessment_idx on public.lms_attempts(assessment_id, submitted_at desc);
create index if not exists lms_syllabus_created_idx on public.lms_syllabus(created_at desc);
create index if not exists lms_quiz_questions_order_idx on public.lms_quiz_questions(quiz_id, sort_order);

-- Updated-at helper.
create or replace function public.lms_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lms_units_updated_at on public.lms_units;
create trigger lms_units_updated_at before update on public.lms_units for each row execute function public.lms_set_updated_at();
drop trigger if exists lms_topics_updated_at on public.lms_topics;
create trigger lms_topics_updated_at before update on public.lms_topics for each row execute function public.lms_set_updated_at();
drop trigger if exists lms_assessments_updated_at on public.lms_assessments;
create trigger lms_assessments_updated_at before update on public.lms_assessments for each row execute function public.lms_set_updated_at();
drop trigger if exists lms_questions_updated_at on public.lms_questions;
create trigger lms_questions_updated_at before update on public.lms_questions for each row execute function public.lms_set_updated_at();
drop trigger if exists lms_quizzes_updated_at on public.lms_quizzes;
create trigger lms_quizzes_updated_at before update on public.lms_quizzes for each row execute function public.lms_set_updated_at();

-- Remove previous app policies so the live rules are deterministic.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname='public' and tablename in
    ('profiles','lms_units','lms_topics','lms_assessments','lms_questions','lms_topic_progress','lms_attempts','lms_syllabus','lms_quizzes','lms_quiz_questions','lms_quiz_attempts')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.lms_units enable row level security;
alter table public.lms_topics enable row level security;
alter table public.lms_assessments enable row level security;
alter table public.lms_questions enable row level security;
alter table public.lms_topic_progress enable row level security;
alter table public.lms_attempts enable row level security;
alter table public.lms_syllabus enable row level security;
alter table public.lms_quizzes enable row level security;
alter table public.lms_quiz_questions enable row level security;
alter table public.lms_quiz_attempts enable row level security;

-- Profiles: a user sees their own profile; admins see all profiles. Writes happen through Edge Functions.
create policy lms_profiles_self_or_admin_select on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select private.is_admin(auth.uid())));

-- Publicly available course structure to authenticated users; only admins can mutate it.
create policy lms_units_select on public.lms_units for select to authenticated using (true);
create policy lms_units_admin_insert on public.lms_units for insert to authenticated with check ((select private.is_admin(auth.uid())));
create policy lms_units_admin_update on public.lms_units for update to authenticated using ((select private.is_admin(auth.uid()))) with check ((select private.is_admin(auth.uid())));
create policy lms_units_admin_delete on public.lms_units for delete to authenticated using ((select private.is_admin(auth.uid())));

create policy lms_topics_select on public.lms_topics for select to authenticated using (true);
create policy lms_topics_admin_insert on public.lms_topics for insert to authenticated with check ((select private.is_admin(auth.uid())));
create policy lms_topics_admin_update on public.lms_topics for update to authenticated using ((select private.is_admin(auth.uid()))) with check ((select private.is_admin(auth.uid())));
create policy lms_topics_admin_delete on public.lms_topics for delete to authenticated using ((select private.is_admin(auth.uid())));

create policy lms_assessments_select on public.lms_assessments for select to authenticated using (published = true or (select private.is_admin(auth.uid())));
create policy lms_assessments_admin_insert on public.lms_assessments for insert to authenticated with check ((select private.is_admin(auth.uid())));
create policy lms_assessments_admin_update on public.lms_assessments for update to authenticated using ((select private.is_admin(auth.uid()))) with check ((select private.is_admin(auth.uid())));
create policy lms_assessments_admin_delete on public.lms_assessments for delete to authenticated using ((select private.is_admin(auth.uid())));

-- Correct answers are admin-only. Students obtain question text/options through get_published_assessment_questions().
create policy lms_questions_admin_select on public.lms_questions for select to authenticated using ((select private.is_admin(auth.uid())));
create policy lms_questions_admin_insert on public.lms_questions for insert to authenticated with check ((select private.is_admin(auth.uid())));
create policy lms_questions_admin_update on public.lms_questions for update to authenticated using ((select private.is_admin(auth.uid()))) with check ((select private.is_admin(auth.uid())));
create policy lms_questions_admin_delete on public.lms_questions for delete to authenticated using ((select private.is_admin(auth.uid())));

create or replace function public.get_published_assessment_questions(p_assessment_id uuid)
returns table(id uuid, assessment_id uuid, question_text text, options jsonb, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.assessment_id, q.question_text, q.options, q.sort_order
  from public.lms_questions q
  join public.lms_assessments a on a.id = q.assessment_id
  where q.assessment_id = p_assessment_id
    and a.published = true
    and (select auth.uid()) is not null
  order by q.sort_order;
$$;
revoke all on function public.get_published_assessment_questions(uuid) from public;
grant execute on function public.get_published_assessment_questions(uuid) to authenticated;

create policy lms_progress_self_select on public.lms_topic_progress for select to authenticated using ((select auth.uid()) = user_id or (select private.is_admin(auth.uid())));
create policy lms_progress_self_insert on public.lms_topic_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy lms_progress_self_update on public.lms_topic_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy lms_progress_admin_delete on public.lms_topic_progress for delete to authenticated using ((select private.is_admin(auth.uid())) or (select auth.uid()) = user_id);

-- Attempts: students can read their own; scoring/insertion is server-side through the submit-assessment function.
create policy lms_attempts_self_select on public.lms_attempts for select to authenticated using ((select auth.uid()) = user_id or (select private.is_admin(auth.uid())));
create policy lms_attempts_admin_update on public.lms_attempts for update to authenticated using ((select private.is_admin(auth.uid()))) with check ((select private.is_admin(auth.uid())));
create policy lms_attempts_admin_delete on public.lms_attempts for delete to authenticated using ((select private.is_admin(auth.uid())));

create policy lms_syllabus_select on public.lms_syllabus for select to authenticated using (true);
create policy lms_syllabus_admin_insert on public.lms_syllabus for insert to authenticated with check ((select private.is_admin(auth.uid())));
create policy lms_syllabus_admin_update on public.lms_syllabus for update to authenticated using ((select private.is_admin(auth.uid()))) with check ((select private.is_admin(auth.uid())));
create policy lms_syllabus_admin_delete on public.lms_syllabus for delete to authenticated using ((select private.is_admin(auth.uid())));

create policy lms_quizzes_select on public.lms_quizzes for select to authenticated using (published = true or (select private.is_admin(auth.uid())));
create policy lms_quizzes_admin_insert on public.lms_quizzes for insert to authenticated with check ((select private.is_admin(auth.uid())));
create policy lms_quizzes_admin_update on public.lms_quizzes for update to authenticated using ((select private.is_admin(auth.uid()))) with check ((select private.is_admin(auth.uid())));
create policy lms_quizzes_admin_delete on public.lms_quizzes for delete to authenticated using ((select private.is_admin(auth.uid())));

create policy lms_quiz_questions_admin_select on public.lms_quiz_questions for select to authenticated using ((select private.is_admin(auth.uid())));
create policy lms_quiz_questions_admin_insert on public.lms_quiz_questions for insert to authenticated with check ((select private.is_admin(auth.uid())));
create policy lms_quiz_questions_admin_update on public.lms_quiz_questions for update to authenticated using ((select private.is_admin(auth.uid()))) with check ((select private.is_admin(auth.uid())));
create policy lms_quiz_questions_admin_delete on public.lms_quiz_questions for delete to authenticated using ((select private.is_admin(auth.uid())));

create policy lms_quiz_attempts_self_select on public.lms_quiz_attempts for select to authenticated using ((select auth.uid()) = user_id or (select private.is_admin(auth.uid())));
create policy lms_quiz_attempts_admin_delete on public.lms_quiz_attempts for delete to authenticated using ((select private.is_admin(auth.uid())));

-- Grants required by the PostgREST roles.
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.lms_units to authenticated;
grant select, insert, update, delete on public.lms_topics to authenticated;
grant select, insert, update, delete on public.lms_assessments to authenticated;
grant select, insert, update, delete on public.lms_questions to authenticated;
grant select, insert, update, delete on public.lms_topic_progress to authenticated;
grant select, update, delete on public.lms_attempts to authenticated;
grant select, insert, update, delete on public.lms_syllabus to authenticated;
grant select, insert, update, delete on public.lms_quizzes to authenticated;
grant select, insert, update, delete on public.lms_quiz_questions to authenticated;
grant select, delete on public.lms_quiz_attempts to authenticated;

grant usage on schema private to authenticated;

-- Private syllabus Storage bucket.
insert into storage.buckets (id, name, public)
values ('lms-syllabus', 'lms-syllabus', false)
on conflict (id) do update set public = excluded.public;

do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'lms_syllabus_%'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy lms_syllabus_select on storage.objects
  for select to authenticated
  using (bucket_id = 'lms-syllabus');

create policy lms_syllabus_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lms-syllabus' and (select private.is_admin(auth.uid())));

create policy lms_syllabus_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'lms-syllabus' and (select private.is_admin(auth.uid())))
  with check (bucket_id = 'lms-syllabus' and (select private.is_admin(auth.uid())));

create policy lms_syllabus_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'lms-syllabus' and (select private.is_admin(auth.uid())));

-- Enforce profile email/register uniqueness if those columns exist with text values.
create unique index if not exists profiles_email_id_unique_lower on public.profiles (lower(email_id));
create unique index if not exists profiles_register_id_unique_lower on public.profiles (lower(register_id)) where register_id is not null;
