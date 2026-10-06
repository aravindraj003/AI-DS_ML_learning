import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function readDefaultKey(groupEnv: string, legacyNames: string[]) {
  const raw = Deno.env.get(groupEnv);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.default === 'string') return parsed.default;
      if (typeof parsed === 'string') return parsed;
    } catch (_) {}
  }
  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return '';
}

function bearerToken(req: Request) {
  const header = req.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Only POST requests are allowed.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const publishableKey = readDefaultKey('SUPABASE_PUBLISHABLE_KEYS', ['SUPABASE_PUBLISHABLE_KEY', 'SB_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']);
    const secretKey = readDefaultKey('SUPABASE_SECRET_KEYS', ['SUPABASE_SECRET_KEY', 'SB_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY']);
    const token = bearerToken(req);
    if (!supabaseUrl || !publishableKey || !secretKey) return json({ error: 'Supabase server configuration is incomplete.' }, 500);
    if (!token) return json({ error: 'Missing Supabase access token.' }, 401);

    const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user?.id) return json({ error: userError?.message || 'Invalid or expired session.' }, 401);
    const adminClient = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const userId = userData.user.id;
    const body = await req.json().catch(() => null);
    const assessmentId = String(body?.assessmentId || '').trim();
    if (!assessmentId) return json({ error: 'Assessment ID is required.' }, 400);

    const { data: assessment, error } = await adminClient
      .from('lms_assessments')
      .select('id,deadline,duration_minutes,allow_retake,published')
      .eq('id', assessmentId)
      .single();
    if (error || !assessment) return json({ error: 'Assessment not found.' }, 404);
    if (!assessment.published) return json({ error: 'This assessment is not currently published.' }, 403);
    if (assessment.deadline && new Date(assessment.deadline).getTime() <= Date.now()) return json({ error: 'This assessment deadline has passed.' }, 403);

    const { data: previous } = await adminClient.from('lms_attempts').select('id,status').eq('assessment_id', assessmentId).eq('user_id', userId).order('submitted_at', { ascending: false }).limit(1);
    if (previous?.[0] && !assessment.allow_retake && previous[0].status !== 'rejected') return json({ error: 'Retake is disabled for this assessment.' }, 409);

    if (!assessment.duration_minutes) return json({ timed: false, sessionId: null });
    const now = new Date();
    const durationExpiry = new Date(now.getTime() + Number(assessment.duration_minutes) * 60_000);
    const deadlineExpiry = assessment.deadline ? new Date(assessment.deadline) : null;
    const expiresAt = deadlineExpiry && deadlineExpiry.getTime() < durationExpiry.getTime() ? deadlineExpiry : durationExpiry;
    const { data: existing } = await adminClient.from('lms_assessment_sessions').select('id,started_at,expires_at,status,answers').eq('user_id', userId).eq('assessment_id', assessmentId).eq('status', 'in_progress').maybeSingle();
    if (existing) {
      if (new Date(existing.expires_at).getTime() > now.getTime()) {
        return json({ timed: true, sessionId: existing.id, startedAt: existing.started_at, expiresAt: existing.expires_at, answers: existing.answers || {} });
      }
      // Remove the stale session. The production constraint allows only one
      // row per user/assessment/status, so marking it expired can collide with
      // an older expired session.
      await adminClient.from('lms_assessment_sessions').delete().eq('id', existing.id);
    }
    let session = null;
    let sessionError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await adminClient.from('lms_assessment_sessions')
        .insert({ user_id: userId, assessment_id: assessmentId, started_at: now.toISOString(), expires_at: expiresAt.toISOString() })
        .select('id,started_at,expires_at,answers')
        .single();
      session = result.data;
      sessionError = result.error;
      if (!sessionError) break;
      if (sessionError.code !== '23505') break;

      // Another request created the active session first. Reuse it instead of
      // surfacing the unique-constraint error to the student.
      const { data: active } = await adminClient.from('lms_assessment_sessions')
        .select('id,started_at,expires_at,status,answers')
        .eq('user_id', userId)
        .eq('assessment_id', assessmentId)
        .eq('status', 'in_progress')
        .maybeSingle();
      if (active && new Date(active.expires_at).getTime() > Date.now()) {
        return json({ timed: true, sessionId: active.id, startedAt: active.started_at, expiresAt: active.expires_at, answers: active.answers || {} });
      }
      if (active) {
        await adminClient.from('lms_assessment_sessions')
          .delete()
          .eq('id', active.id);
      }
    }
    if (sessionError || !session) return json({ error: sessionError?.message || 'Unable to start assessment session.' }, 500);
    return json({ timed: true, sessionId: session.id, startedAt: session.started_at, expiresAt: session.expires_at, answers: session.answers || {} }, 201);
  } catch (error) {
    console.error('start-assessment error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
});
