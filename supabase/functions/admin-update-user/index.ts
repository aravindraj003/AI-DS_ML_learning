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
    if (!accessToken) return json({ error: 'Missing Supabase access token. Please sign in again as Administrator.' }, 401);
    const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    if (userError || !userData?.user?.id) return json({ error: userError?.message || 'Invalid or expired Supabase session.' }, 401);

    const adminClient = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const callerId = userData.user.id;
    const { data: callerProfile, error: callerProfileError } = await adminClient.from('profiles').select('id,role').eq('id', callerId).maybeSingle();
    if (callerProfileError || !callerProfile) return json({ error: 'Your Supabase Auth account does not have a matching profile.' }, 403);
    if (!['admin', 'administrator'].includes(String(callerProfile.role || '').trim().toLowerCase())) return json({ error: 'Administrator access is required. Set your profile role to admin.' }, 403);

    const body = await req.json().catch(() => null);
    const userId = String(body?.userId || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const name = String(body?.name || '').trim();
    const registerId = String(body?.id || '').trim();
    const department = String(body?.dept || '').trim();
    const college = String(body?.college || '').trim();
    const requestedRole = String(body?.role || 'student').trim().toLowerCase();
    const role = requestedRole === 'admin' || requestedRole === 'administrator' ? 'admin' : 'student';

    if (!userId || !email || !name || !registerId) return json({ error: 'userId, email, name and ID are required.' }, 400);
    if (userId === callerId) return json({ error: 'The signed-in administrator cannot be modified from this screen.' }, 400);
    if (password && password.length < 6) return json({ error: 'Password must contain at least 6 characters.' }, 400);
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid Email ID.' }, 400);

    const { data: duplicateEmail } = await adminClient.from('profiles').select('id').ilike('email_id', email).neq('id', userId).maybeSingle();
    if (duplicateEmail) return json({ error: 'Another profile already uses this Email ID.' }, 409);
    const { data: duplicateId } = await adminClient.from('profiles').select('id').ilike('register_id', registerId).neq('id', userId).maybeSingle();
    if (duplicateId) return json({ error: 'Another profile already uses this ID.' }, 409);

    const authUpdate: Record<string, unknown> = {
      email,
      email_confirm: true,
      user_metadata: { full_name: name, register_id: registerId, department, college, role },
    };
    if (password) authUpdate.password = password;

    const { data: authResult, error: authError } = await adminClient.auth.admin.updateUserById(userId, authUpdate);
    if (authError) return json({ error: authError.message }, 400);

    const { data: profile, error: profileError } = await adminClient.from('profiles').update({
      full_name: name,
      email_id: email,
      register_id: registerId,
      department,
      college,
      role,
    }).eq('id', userId).select('id,full_name,email_id,register_id,department,college,role').single();

    if (profileError) return json({ error: `Auth account updated but profile update failed: ${profileError.message}` }, 500);
    return json({ success: true, user: authResult.user, profile });
  } catch (error) {
    console.error('admin-update-user error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500);
  }
});
