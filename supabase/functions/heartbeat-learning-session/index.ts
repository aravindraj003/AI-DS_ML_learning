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
    const body = await req.json().catch(() => null);
    const id = String(body?.id || '').trim();
    const ended = body?.ended === true;
    if (!id) return json({ error: 'Session ID is required.' }, 400);
    const { data: session, error: se } = await admin.from('lms_learning_sessions').select('id,user_id,started_at,duration_seconds,ended_at').eq('id', id).eq('user_id', ud.user.id).single();
    if (se || !session) return json({ error: 'Learning session not found.' }, 404);
    if (session.ended_at) return json({ success:true, session });
    const now = new Date();
    const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 1000));
    const duration = Math.max(Number(session.duration_seconds || 0), elapsed);
    const patch: Record<string, unknown> = { last_seen_at: now.toISOString(), duration_seconds: duration };
    if (ended) patch.ended_at = now.toISOString();
    const { data: updated, error: ue2 } = await admin.from('lms_learning_sessions').update(patch).eq('id', id).eq('user_id', ud.user.id).select('id,started_at,last_seen_at,ended_at,duration_seconds,unit_id,topic_id').single();
    if (ue2) return json({ error: ue2.message }, 500);
    return json(updated);
  } catch (e) { console.error(e); return json({ error: e instanceof Error ? e.message : 'Unexpected server error.' }, 500); }
});
