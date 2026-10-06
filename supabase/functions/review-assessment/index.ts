import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Authentication required.' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY');
    if (!serviceKey) return json({ error: 'Server configuration is missing.' }, 500);
    const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: 'Invalid authentication token.' }, 401);
    const userId = userData.user.id;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const attemptId = String(body?.attemptId || '').trim();
    if (!attemptId) return json({ error: 'Attempt ID is required.' }, 400);

    const { data: attempt, error: attemptError } = await admin.from('lms_attempts')
      .select('id,user_id,assessment_id,answers,score,correct_count,total_count,status,submitted_at,started_at,time_spent_seconds')
      .eq('id', attemptId).eq('user_id', userId).single();
    if (attemptError || !attempt) return json({ error: 'Assessment attempt not found.' }, 404);
    if (!attempt.submitted_at) return json({ error: 'Assessment has not been submitted yet.' }, 409);

    const { data: assessment } = await admin.from('lms_assessments').select('id,title,description').eq('id', attempt.assessment_id).single();
    const { data: questions, error: qError } = await admin.from('lms_questions')
      .select('id,question_text,options,correct_index,sort_order')
      .eq('assessment_id', attempt.assessment_id).order('sort_order');
    if (qError) return json({ error: qError.message }, 500);

    const answers = attempt.answers && typeof attempt.answers === 'object' ? attempt.answers : {};
    const review = (questions || []).map((q: any, index: number) => {
      const raw = answers[String(index)];
      const selected = raw === undefined || raw === null || raw === '' ? null : Number(raw);
      const valid = selected !== null && Number.isInteger(selected) && selected >= 0 && selected < (Array.isArray(q.options) ? q.options.length : 0);
      return {
        question_id: q.id,
        question_text: q.question_text,
        options: Array.isArray(q.options) ? q.options : [],
        selected_index: valid ? selected : null,
        correct_index: Number(q.correct_index),
        is_correct: valid && selected === Number(q.correct_index),
      };
    });
    const correctCount = review.filter((q: any) => q.is_correct).length;
    return json({
      assessment_id: attempt.assessment_id,
      title: assessment?.title || 'Assessment',
      score: Number(attempt.score ?? Math.round((correctCount / Math.max(review.length, 1)) * 100)),
      correct_count: Number(attempt.correct_count ?? correctCount),
      total_count: Number(attempt.total_count ?? review.length),
      wrong_count: Math.max(0, Number(attempt.total_count ?? review.length) - Number(attempt.correct_count ?? correctCount)),
      submitted_at: attempt.submitted_at,
      time_spent_seconds: attempt.time_spent_seconds,
      questions: review,
    });
  } catch (error) {
    return json({ error: error?.message || 'Could not load assessment review.' }, 500);
  }
});
