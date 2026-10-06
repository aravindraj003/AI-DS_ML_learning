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
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    const name = String(body?.name ?? '').trim();
    const id = String(body?.id ?? '').trim();
    const dept = String(body?.dept ?? 'Artificial Intelligence & Data Science').trim();
    const college = String(body?.college ?? 'Mahendra Engineering College').trim();
    const requestedRole = String(body?.role ?? 'student').trim().toLowerCase();
    const role = requestedRole === 'admin' || requestedRole === 'administrator' ? 'admin' : 'student';

    if (!email || !password || !name || !id) return json({ error: 'Email ID, password, name and ID are required.' }, 400);
    if (password.length < 6) return json({ error: 'Password must contain at least 6 characters.' }, 400);
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid Email ID.' }, 400);

    const { data: emailMatch, error: emailLookupError } = await adminClient.from('profiles').select('id').ilike('email_id', email).limit(1);
    if (emailLookupError) return json({ error: 'Could not check Email ID uniqueness.' }, 500);
    if (emailMatch?.length) return json({ error: 'An account with this Email ID already exists.' }, 409);

    const { data: idMatch, error: idLookupError } = await adminClient.from('profiles').select('id').ilike('register_id', id).limit(1);
    if (idLookupError) return json({ error: 'Could not check ID uniqueness.' }, 500);
    if (idMatch?.length) return json({ error: 'This ID is already in use.' }, 409);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, register_id: id, department: dept, college, role },
    });
    if (createError || !created?.user) return json({ error: createError?.message || 'Supabase Auth could not create the user.' }, 400);

    const authUser = created.user;
    const { data: profile, error: profileError } = await adminClient.from('profiles').insert({
      id: authUser.id,
      full_name: name,
      email_id: email,
      register_id: id,
      department: dept,
      college,
      role,
    }).select('id,full_name,email_id,register_id,department,college,role').single();

    if (profileError || !profile) {
      await adminClient.auth.admin.deleteUser(authUser.id);
      return json({ error: profileError?.message || 'Auth user was created, but the profile row could not be created.' }, 500);
    }

    return json({ success: true, user: { id: authUser.id, email: authUser.email }, profile }, 201);
  } catch (error) {
    console.error('admin-create-user error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500);
  }
});
