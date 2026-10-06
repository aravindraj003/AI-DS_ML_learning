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
  if (req.method !== 'POST') return json({ error: 'Only POST requests are allowed.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const pub = readDefaultKey('SUPABASE_PUBLISHABLE_KEYS', ['SUPABASE_PUBLISHABLE_KEY','SB_PUBLISHABLE_KEY','SUPABASE_ANON_KEY']);
    const secret = readDefaultKey('SUPABASE_SECRET_KEYS', ['SUPABASE_SECRET_KEY','SB_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_KEY']);
    const token = bearerToken(req);
    if (!url || !pub || !secret) return json({ error: 'Supabase server configuration is incomplete.' }, 500);
    if (!token) return json({ error: 'Missing Supabase access token.' }, 401);
    const auth = createClient(url, pub, { auth: { persistSession:false, autoRefreshToken:false } });
    const { data: ud, error: ue } = await auth.auth.getUser(token);
    if (ue || !ud?.user?.id) return json({ error: ue?.message || 'Invalid or expired session.' }, 401);
    const admin = createClient(url, secret, { auth: { persistSession:false, autoRefreshToken:false } });
    const now = new Date().toISOString();
    const { data, error } = await admin.from('lms_login_events').insert({ user_id: ud.user.id, login_at: now, last_seen_at: now }).select('id,login_at,last_seen_at').single();
    if (error) return json({ error: error.message }, 500);
    return json(data, 201);
  } catch (e) { console.error(e); return json({ error: e instanceof Error ? e.message : 'Unexpected server error.' }, 500); }
});
