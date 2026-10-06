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
    if (!supabaseUrl || !publishableKey || !secretKey) return json({ error: 'Supabase function environment is not configured.' }, 500);

    const accessToken = bearerToken(req);
    if (!accessToken) return json({ error: 'Missing Supabase access token. Please log out and sign in again as Administrator.' }, 401);
    const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    if (userError || !userData?.user?.id) return json({ error: userError?.message || 'The Supabase login session is invalid or expired.' }, 401);

    const adminClient = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const callerId = userData.user.id;
    const { data: callerProfile } = await adminClient.from('profiles').select('id,role').eq('id', callerId).maybeSingle();
    if (!callerProfile) return json({ error: 'Your Supabase Auth account does not have a matching profile.' }, 403);
    if (!['admin', 'administrator'].includes(String(callerProfile.role || '').trim().toLowerCase())) return json({ error: 'Administrator access is required. Set your profile role to admin.' }, 403);

    const body = await req.json().catch(() => null);
    const rawUserId = String(body?.userId ?? body?.id ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!rawUserId && !email) return json({ error: 'Student ID or email is required.' }, 400);

    let targetUserId = rawUserId;
    if (!targetUserId && email) {
      const { data: profileByEmail } = await adminClient.from('profiles').select('id').ilike('email_id', email).limit(1).maybeSingle();
      if (!profileByEmail) return json({ error: 'Student account not found in Supabase profiles.' }, 404);
      targetUserId = profileByEmail.id;
    }
    if (!targetUserId) return json({ error: 'Student account not found in Supabase profiles.' }, 404);
    if (targetUserId === callerId) return json({ error: 'For security, the signed-in administrator cannot delete their own account from this screen.' }, 400);

    const { data: targetProfile } = await adminClient.from('profiles').select('id,role').eq('id', targetUserId).maybeSingle();
    if (!targetProfile) return json({ error: 'Target account profile was not found.' }, 404);
    if (String(targetProfile.role || '').toLowerCase() === 'admin') return json({ error: 'Administrator accounts cannot be deleted from the Students screen.' }, 403);

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (authDeleteError && !/not found|user not found/i.test(authDeleteError.message || '')) return json({ error: authDeleteError.message }, 400);

    const { error: profileDeleteError } = await adminClient.from('profiles').delete().eq('id', targetUserId);
    if (profileDeleteError) return json({ error: profileDeleteError.message }, 400);

    return json({ success: true, deletedUserId: targetUserId });
  } catch (error) {
    console.error('admin-delete-user error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500);
  }
});
