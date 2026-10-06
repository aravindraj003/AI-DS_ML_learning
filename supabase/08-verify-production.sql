-- AI&DS-ML LEARNING — final read-only production verification

select 'profiles' object_name, count(*) row_count from public.profiles
union all select 'units', count(*) from public.lms_units
union all select 'topics', count(*) from public.lms_topics
union all select 'assessments', count(*) from public.lms_assessments
union all select 'questions', count(*) from public.lms_questions
union all select 'progress', count(*) from public.lms_topic_progress
union all select 'attempts', count(*) from public.lms_attempts
union all select 'syllabus', count(*) from public.lms_syllabus
union all select 'quizzes', count(*) from public.lms_quizzes
union all select 'quiz_questions', count(*) from public.lms_quiz_questions
order by object_name;

select
  au.id auth_user_id,
  au.email,
  p.id profile_id,
  lower(trim(coalesce(p.role::text, ''))) profile_role,
  case when p.id is null then 'MISSING PROFILE'
       when p.id <> au.id then 'ID MISMATCH'
       else 'OK' end profile_status
from auth.users au
left join public.profiles p on p.id = au.id
order by au.email;

select id, email_id, register_id, full_name, role
from public.profiles
where lower(trim(role::text)) = 'admin'
order by full_name;

select u.name, u.sort_order, count(t.id) topic_count
from public.lms_units u
left join public.lms_topics t on t.unit_id = u.id
group by u.id, u.name, u.sort_order
order by u.sort_order, u.name;

select a.title, a.published, a.deadline, a.allow_retake, count(q.id) question_count
from public.lms_assessments a
left join public.lms_questions q on q.assessment_id = a.id
group by a.id, a.title, a.published, a.deadline, a.allow_retake, a.created_at
order by a.created_at;

select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;

select policyname, tablename, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles','lms_units','lms_topics','lms_assessments','lms_questions',
    'lms_topic_progress','lms_attempts','lms_syllabus','lms_quizzes','lms_quiz_questions'
  )
order by tablename, policyname;

-- Function permissions used by the production UI.
select routine_schema, routine_name, privilege_type
from information_schema.routine_privileges
where routine_schema in ('public','private')
  and routine_name in ('is_admin','admin_save_assessment','admin_save_quiz','get_published_assessment_questions')
order by routine_schema, routine_name, privilege_type;

-- Assessment attempts must not be directly UPDATE-able by browser roles.
select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
  and table_name in ('lms_attempts','lms_assessments','lms_questions','lms_quizzes','lms_quiz_questions')
order by table_name, privilege_type;

-- Private syllabus storage configuration.
select id, name, public, file_size_limit
from storage.buckets
where id = 'lms-syllabus';
