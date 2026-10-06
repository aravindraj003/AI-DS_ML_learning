import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: corsHeaders }); }
function readDefaultKey(groupEnv: string, legacyNames: string[]) {
  const raw = Deno.env.get(groupEnv);
  if (raw) { try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.default === "string") return parsed.default; if (typeof parsed === "string") return parsed; } catch (_) {} }
  for (const name of legacyNames) { const value = Deno.env.get(name); if (value) return value; }
  return "";
}
function bearerToken(req: Request) { const h = req.headers.get("Authorization") || ""; const m = h.match(/^Bearer\s+(.+)$/i); return m?.[1]?.trim() || ""; }
function isPost(req: Request) { return req.method === "POST"; }


Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isPost(req)) return json({ error: 'Only POST requests are allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const publishableKey = readDefaultKey('SUPABASE_PUBLISHABLE_KEYS', ['SUPABASE_PUBLISHABLE_KEY', 'SB_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']);
    const secretKey = readDefaultKey('SUPABASE_SECRET_KEYS', ['SUPABASE_SECRET_KEY', 'SB_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY']);
    if (!supabaseUrl || !publishableKey || !secretKey) return json({ error: 'Supabase server configuration is incomplete.' }, 500);

    const accessToken = bearerToken(req);
    if (!accessToken) return json({ error: 'Missing Supabase access token. Please sign in again.' }, 401);
    const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    if (userError || !userData?.user?.id) return json({ error: userError?.message || 'Invalid or expired Supabase session.' }, 401);

    const adminClient = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const userId = userData.user.id;
    const { data: profile } = await adminClient.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!profile) return json({ error: 'Your Auth account does not have a matching LMS profile.' }, 403);

    const body = await req.json().catch(() => null);
    const assessmentId = String(body?.assessmentId || '').trim();
    const sessionId = String(body?.sessionId || '').trim() || null;
    const requestedAutoTimeout = body?.autoTimeout === true;
    const incomingAnswers = body?.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : null;
    if (!assessmentId) return json({ error: 'Assessment ID is required.' }, 400);

    const { data: assessment, error: assessmentError } = await adminClient.from('lms_assessments').select('id,title,deadline,allow_retake,published,duration_minutes').eq('id', assessmentId).single();
    if (assessmentError || !assessment) return json({ error: 'Assessment not found.' }, 404);
    if (!assessment.published) return json({ error: 'This assessment is not currently published.' }, 403);
    if (assessment.deadline && new Date(assessment.deadline).getTime() <= Date.now() && !assessment.duration_minutes) return json({ error: 'This assessment deadline has passed.' }, 403);

    let assessmentSession = null;
    let sessionExpired = false;
    if (assessment.duration_minutes) {
      if (!sessionId) return json({ error: 'Assessment session is required. Please restart the assessment.' }, 400);
      const { data: session, error: sessionError } = await adminClient.from('lms_assessment_sessions').select('id,user_id,assessment_id,started_at,expires_at,status,answers').eq('id', sessionId).eq('user_id', userId).eq('assessment_id', assessmentId).single();
      if (sessionError || !session) return json({ error: 'Assessment session not found.' }, 404);
      if (session.status !== 'in_progress') return json({ error: 'This assessment session has already been submitted.' }, 409);
      assessmentSession = session;
      sessionExpired = new Date(session.expires_at).getTime() <= Date.now();
      if (!sessionExpired && requestedAutoTimeout) return json({ error: 'The assessment timer has not expired yet.' }, 409);
    }

    const storedAnswers = assessmentSession?.answers && typeof assessmentSession.answers === 'object' ? assessmentSession.answers : {};
    const answers = { ...storedAnswers, ...(incomingAnswers || {}) };
    if (!answers || typeof answers !== 'object') return json({ error: 'Assessment answers are required.' }, 400);

    const { data: previous, error: previousError } = await adminClient.from('lms_attempts').select('id,status,submitted_at,score').eq('assessment_id', assessmentId).eq('user_id', userId).order('submitted_at', { ascending: false }).limit(1);
    if (previousError) return json({ error: previousError.message }, 500);
    if (previous?.[0] && !assessment.allow_retake && previous[0].status !== 'rejected') return json({ error: 'Retake is disabled for this assessment.' }, 409);

    const { data: questions, error: questionError } = await adminClient.from('lms_questions').select('id,correct_index,sort_order,options').eq('assessment_id', assessmentId).order('sort_order');
    if (questionError) return json({ error: questionError.message }, 500);
    if (!questions?.length) return json({ error: 'This assessment has no questions.' }, 422);

    let correct = 0;
    const normalizedAnswers: Record<string, number> = {};
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      const raw = answers[String(i)] ?? answers[i];
      const selected = Number(raw);
      const optionCount = Array.isArray(q.options) ? q.options.length : 0;
      if (!Number.isInteger(selected) || optionCount === 0 || selected < 0 || selected >= optionCount) {
        if (sessionExpired || requestedAutoTimeout) continue;
        return json({ error: `Invalid answer for question ${i + 1}.` }, 400);
      }
      normalizedAnswers[String(i)] = selected;
      if (selected === Number(q.correct_index)) correct += 1;
    }

    const total = questions.length;
    const score = Math.round((correct / total) * 100);
    const submittedAt = new Date();
    const timeSpentSeconds = assessmentSession ? Math.max(0, Math.min(Math.round((submittedAt.getTime() - new Date(assessmentSession.started_at).getTime()) / 1000), Math.round((new Date(assessmentSession.expires_at).getTime() - new Date(assessmentSession.started_at).getTime()) / 1000))) : 0;
    const { data: attempt, error: insertError } = await adminClient.from('lms_attempts').insert({
      user_id: userId,
      assessment_id: assessmentId,
      assessment_session_id: assessmentSession?.id || null,
      started_at: assessmentSession?.started_at || null,
      time_spent_seconds: timeSpentSeconds,
      submission_reason: sessionExpired ? 'auto_timeout' : 'manual',
      answers: normalizedAnswers,
      score,
      correct_count: correct,
      total_count: total,
      status: 'completed',
    }).select('id,assessment_id,score,correct_count,total_count,status,submitted_at').single();

    if (insertError) return json({ error: insertError.message }, 500);
    if (assessmentSession) await adminClient.from('lms_assessment_sessions').update({ status: sessionExpired ? 'expired' : 'submitted', submitted_at: submittedAt.toISOString() }).eq('id', assessmentSession.id);
    return json({ success: true, attempt }, 201);
  } catch (error) {
    console.error('submit-assessment error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
});
