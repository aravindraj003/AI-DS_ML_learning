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
    if (!accessToken) return json({ error: 'Missing Supabase access token. Please sign in again as Administrator.' }, 401);

    const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    if (userError || !userData?.user?.id) return json({ error: userError?.message || 'Invalid or expired Supabase session.' }, 401);

    const adminClient = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const callerId = userData.user.id;
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('profiles')
      .select('id,role')
      .eq('id', callerId)
      .maybeSingle();
    if (callerProfileError || !callerProfile) return json({ error: 'Your Supabase Auth account does not have a matching profile.' }, 403);
    if (!['admin', 'administrator'].includes(String(callerProfile.role || '').trim().toLowerCase())) {
      return json({ error: 'Administrator access is required. Set your profile role to admin.' }, 403);
    }

    const body = await req.json().catch(() => null);
    const attemptId = String(body?.attemptId || '').trim();
    const status = String(body?.status || '').trim().toLowerCase();
    if (!attemptId) return json({ error: 'Assessment attempt ID is required.' }, 400);
    if (!['verified', 'rejected'].includes(status)) return json({ error: 'Review status must be verified or rejected.' }, 400);

    const { data: existingAttempt, error: existingError } = await adminClient
      .from('lms_attempts')
      .select('id')
      .eq('id', attemptId)
      .maybeSingle();
    if (existingError) return json({ error: existingError.message }, 500);
    if (!existingAttempt) return json({ error: 'Assessment attempt not found.' }, 404);

    const { data: attempt, error: updateError } = await adminClient
      .from('lms_attempts')
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: callerId })
      .eq('id', attemptId)
      .select('id,user_id,assessment_id,score,correct_count,total_count,status,submitted_at,reviewed_at,reviewed_by')
      .single();
    if (updateError) return json({ error: updateError.message }, 400);

    return json({ success: true, attempt });
  } catch (error) {
    console.error('admin-review-attempt error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
});
