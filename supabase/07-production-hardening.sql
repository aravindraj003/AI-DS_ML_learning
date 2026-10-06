-- AI&DS-ML LEARNING — final production hardening
-- Run once after the base schema and curriculum seed.

begin;

alter table public.lms_assessments add column if not exists duration_minutes integer;

-- The admin helper may only answer for the currently authenticated user.
-- This prevents an authenticated client from probing arbitrary user IDs.
create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
     and p_user_id = (select auth.uid())
     and exists (
       select 1
       from public.profiles
       where id = p_user_id
         and lower(trim(role::text)) = 'admin'
     );
$$;

revoke all on function private.is_admin(uuid) from public;
revoke all on function private.is_admin(uuid) from anon;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;

-- Assessment review status changes are controlled by the admin-review-attempt Edge Function.
drop policy if exists lms_attempts_admin_update on public.lms_attempts;
revoke update on public.lms_attempts from authenticated;
grant select, delete on public.lms_attempts to authenticated;

-- Profile role/email/password changes are controlled by the admin-update-user
-- Edge Function. Do not expose direct profile UPDATE through the client.
drop policy if exists lms_profiles_admin_update on public.profiles;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- Enforce a real upload-size limit at the Storage bucket as well as the UI limit.
update storage.buckets
set public = false,
    file_size_limit = 3145728
where id = 'lms-syllabus';

-- Ensure Realtime publication contains the live LMS tables.
do $$
declare
  t text;
  tables text[] := array[
    'profiles','lms_units','lms_topics','lms_assessments','lms_questions',
    'lms_topic_progress','lms_attempts','lms_syllabus','lms_quizzes',
    'lms_quiz_questions','lms_quiz_attempts'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Keep direct table grants explicit for the PostgREST roles used by supabase-js.
grant select, insert, update, delete on public.lms_units to authenticated;
grant select, insert, update, delete on public.lms_topics to authenticated;
grant select, insert, update, delete on public.lms_assessments to authenticated;
grant select, insert, update, delete on public.lms_questions to authenticated;
grant select, insert, update, delete on public.lms_topic_progress to authenticated;
revoke update on public.lms_attempts from authenticated;
grant select, delete on public.lms_attempts to authenticated;
grant select, insert, update, delete on public.lms_syllabus to authenticated;
grant select, insert, update, delete on public.lms_quizzes to authenticated;
grant select, insert, update, delete on public.lms_quiz_questions to authenticated;
grant select, delete on public.lms_quiz_attempts to authenticated;

grant execute on function public.get_published_assessment_questions(uuid) to authenticated;

commit;

begin;

-- Atomic Admin Assessment/Quiz saves.
-- These functions replace multi-step browser-side writes so an edit cannot leave
-- an assessment/quiz without its questions if a later insert fails.
create or replace function public.admin_save_assessment(
  p_id uuid,
  p_unit_id uuid,
  p_title text,
  p_description text,
  p_deadline timestamptz,
  p_duration_minutes integer,
  p_allow_retake boolean,
  p_published boolean,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_index integer;
  v_question text;
  v_options jsonb;
  v_correct integer;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Assessment title is required.' using errcode = '22023';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'Add at least one assessment question.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.lms_assessments (unit_id, title, description, deadline, duration_minutes, allow_retake, published, created_by)
    values (p_unit_id, trim(p_title), coalesce(p_description, ''), p_deadline, p_duration_minutes, coalesce(p_allow_retake, false), coalesce(p_published, true), auth.uid())
    returning id into v_id;
  else
    update public.lms_assessments
    set unit_id = p_unit_id,
        title = trim(p_title),
        description = coalesce(p_description, ''),
        deadline = p_deadline,
        duration_minutes = p_duration_minutes,
        allow_retake = coalesce(p_allow_retake, false),
        published = coalesce(p_published, true)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Assessment not found.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.lms_questions where assessment_id = v_id;

  for v_item, v_index in
    select value, ordinality::integer
    from jsonb_array_elements(p_questions) with ordinality
  loop
    v_question := trim(coalesce(v_item->>'question_text', v_item->>'question', ''));
    v_options := v_item->'options';
    v_correct := coalesce((v_item->>'correct_index')::integer, (v_item->>'correct')::integer, 0);

    if v_question = '' then
      raise exception 'Question % is empty.', v_index using errcode = '22023';
    end if;
    if jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) < 2 then
      raise exception 'Question % must contain at least two options.', v_index using errcode = '22023';
    end if;
    if v_correct < 0 or v_correct >= jsonb_array_length(v_options) then
      raise exception 'Question % has an invalid correct option.', v_index using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(v_options) opt(value)
      where trim(opt.value) = ''
    ) then
      raise exception 'Question % contains an empty option.', v_index using errcode = '22023';
    end if;

    insert into public.lms_questions (assessment_id, question_text, options, correct_index, sort_order)
    values (v_id, v_question, v_options, v_correct, v_index);
  end loop;

  return v_id;
end;
$$;

create or replace function public.admin_save_quiz(
  p_id uuid,
  p_title text,
  p_description text,
  p_published boolean,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_index integer;
  v_question text;
  v_options jsonb;
  v_correct integer;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Quiz title is required.' using errcode = '22023';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'Add at least one quiz question.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.lms_quizzes (title, description, published, created_by)
    values (trim(p_title), coalesce(p_description, ''), coalesce(p_published, true), auth.uid())
    returning id into v_id;
  else
    update public.lms_quizzes
    set title = trim(p_title),
        description = coalesce(p_description, ''),
        published = coalesce(p_published, true)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Quiz not found.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.lms_quiz_questions where quiz_id = v_id;

  for v_item, v_index in
    select value, ordinality::integer
    from jsonb_array_elements(p_questions) with ordinality
  loop
    v_question := trim(coalesce(v_item->>'question_text', v_item->>'question', ''));
    v_options := v_item->'options';
    v_correct := coalesce((v_item->>'correct_index')::integer, (v_item->>'correct')::integer, 0);

    if v_question = '' then
      raise exception 'Question % is empty.', v_index using errcode = '22023';
    end if;
    if jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) < 2 then
      raise exception 'Question % must contain at least two options.', v_index using errcode = '22023';
    end if;
    if v_correct < 0 or v_correct >= jsonb_array_length(v_options) then
      raise exception 'Question % has an invalid correct option.', v_index using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(v_options) opt(value)
      where trim(opt.value) = ''
    ) then
      raise exception 'Question % contains an empty option.', v_index using errcode = '22023';
    end if;

    insert into public.lms_quiz_questions (quiz_id, question_text, options, correct_index, sort_order)
    values (v_id, v_question, v_options, v_correct, v_index);
  end loop;

  return v_id;
end;
$$;

revoke all on function public.admin_save_assessment(uuid, uuid, text, text, timestamptz, integer, boolean, boolean, jsonb) from public, anon;
grant execute on function public.admin_save_assessment(uuid, uuid, text, text, timestamptz, integer, boolean, boolean, jsonb) to authenticated;
revoke all on function public.admin_save_quiz(uuid, text, text, boolean, jsonb) from public, anon;
grant execute on function public.admin_save_quiz(uuid, text, text, boolean, jsonb) to authenticated;

-- Browser clients no longer need direct write access to assessment/quiz rows.
drop policy if exists lms_assessments_admin_insert on public.lms_assessments;
drop policy if exists lms_assessments_admin_update on public.lms_assessments;
drop policy if exists lms_questions_admin_insert on public.lms_questions;
drop policy if exists lms_questions_admin_update on public.lms_questions;
drop policy if exists lms_questions_admin_delete on public.lms_questions;
drop policy if exists lms_quizzes_admin_insert on public.lms_quizzes;
drop policy if exists lms_quizzes_admin_update on public.lms_quizzes;
drop policy if exists lms_quiz_questions_admin_insert on public.lms_quiz_questions;
drop policy if exists lms_quiz_questions_admin_update on public.lms_quiz_questions;
drop policy if exists lms_quiz_questions_admin_delete on public.lms_quiz_questions;

revoke insert, update on public.lms_assessments from authenticated;
grant select, delete on public.lms_assessments to authenticated;
revoke insert, update, delete on public.lms_questions from authenticated;
grant select on public.lms_questions to authenticated;
revoke insert, update on public.lms_quizzes from authenticated;
grant select, delete on public.lms_quizzes to authenticated;
revoke insert, update, delete on public.lms_quiz_questions from authenticated;
grant select on public.lms_quiz_questions to authenticated;

commit;
