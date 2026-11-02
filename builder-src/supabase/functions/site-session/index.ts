// site-session (Supabase Edge Function on the AI Paragon Sites project, euzdaxouzvmvvukbuvwi).
// Swaps a team member's AI Paragon sign-in (the dashboard's Supabase project, the same accounts the
// builder already signs in with) for a session on this project, marked app_metadata.team, which is
// what the pages and leads tables let in. Nobody signs up here: the team's accounts are the way in.
// Deployed with verify_jwt off, since the caller has no session here yet; it checks the token itself.
// The source lives in builder-src/supabase/ for the record; deploy it through Supabase.

const TEAM_URL = 'https://lesyptuwllcgajdxzjje.supabase.co';
// The team project's public anon key (the dashboard and the builder ship the same one)
const TEAM_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxlc3lwdHV3bGxjZ2FqZHh6amplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDAzMDEsImV4cCI6MjA5ODQxNjMwMX0.81-nHOWy8w48weqcL8Yrvv5RGHFlfeSDAo3BZf90DSs';
const TEAM_DOMAIN = '@aiparagonconsulting.com';

const SELF = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Max-Age': '86400',
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

const admin = (path: string, init: RequestInit = {}) =>
  fetch(SELF + '/auth/v1' + path, {
    ...init,
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

// A session on this project for an email, made without sending anything: an admin magic link is
// generated and redeemed on the spot. `team` marks the account for the tables' policies.
async function sessionFor(email: string, name: string, team: boolean) {
  const made = await admin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, email_confirm: true, app_metadata: { team }, user_metadata: name ? { name } : {} }),
  });
  if (!made.ok && made.status !== 422) throw new Error('create ' + made.status);
  const link = await admin('/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) });
  if (!link.ok) throw new Error('link ' + link.status);
  const l = await link.json();
  const hashed = l.hashed_token || (l.properties && l.properties.hashed_token);
  const kind = l.verification_type || (l.properties && l.properties.verification_type) || 'magiclink';
  const id = l.id || (l.user && l.user.id);
  const meta = l.app_metadata || (l.user && l.user.app_metadata) || {};
  if (!hashed || !id) throw new Error('link shape');
  if ((meta.team === true) !== team) {
    const fix = await admin('/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ app_metadata: { team } }) });
    if (!fix.ok) throw new Error('mark ' + fix.status);
  }
  const v = await fetch(SELF + '/auth/v1/verify', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: kind, token_hash: hashed }),
  });
  if (v.status === 429) throw Object.assign(new Error('busy'), { busy: true });
  if (!v.ok) throw new Error('verify ' + v.status);
  const s = await v.json();
  if (!s.access_token || !s.refresh_token) throw new Error('session shape');
  return s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  if (!SELF || !SERVICE || !ANON) return reply({ error: 'This function is missing its settings.' }, 500);

  let body: { auth?: unknown } = {};
  try {
    body = await req.json();
  } catch (_e) {
    return reply({ error: 'Send JSON.' }, 400);
  }
  const token = typeof body.auth === 'string' ? body.auth.trim() : '';
  if (!token || token.length > 4096 || token.split('.').length !== 3) return reply({ error: 'Sign in first.', code: 'signin' }, 401);

  // Who is asking: the team project answers for its own sign-in
  let user: { email?: string; user_metadata?: { name?: string; full_name?: string } } | null = null;
  try {
    const r = await fetch(TEAM_URL + '/auth/v1/user', { headers: { apikey: TEAM_KEY, Authorization: 'Bearer ' + token } });
    if (r.status === 401 || r.status === 403) return reply({ error: 'Your sign-in has run out. Sign in again.', code: 'signin' }, 401);
    if (!r.ok) return reply({ error: 'Could not check your sign-in just now. Try again.', code: 'retry' }, 502);
    user = await r.json();
  } catch (_e) {
    return reply({ error: 'Could not check your sign-in just now. Try again.', code: 'retry' }, 502);
  }
  const email = String((user && user.email) || '').toLowerCase();
  if (!email.endsWith(TEAM_DOMAIN)) return reply({ error: 'Team pages are for AI Paragon accounts.', code: 'team' }, 403);
  const meta = (user && user.user_metadata) || {};
  const name = String(meta.name || meta.full_name || '').slice(0, 80);

  try {
    const s = await sessionFor(email, name, true);
    return reply({ access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at, email });
  } catch (e) {
    const busy = !!(e && (e as { busy?: boolean }).busy);
    console.error('site-session: ' + (e instanceof Error ? e.message : 'failed'));
    return reply(busy ? { error: 'Too many sign-ins at once. Try again in a minute.', code: 'retry' } : { error: 'Could not open the team pages just now. Try again.', code: 'retry' }, busy ? 429 : 502);
  }
});
