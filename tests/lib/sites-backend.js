// A stand-in for the AI Paragon Sites Supabase project (builder-src/supabase/) for the builder's
// suites: the site-session function (a team sign-in swapped for a session here), token renewal, and
// the REST calls the builder makes on `pages` and `leads`, with the database's own rules copied from
// migrations/sites_v1.sql: the server's version, times and authors (a save based on an old version
// finds no row), one live page per address, one page per domain with or without www, live pages
// have an address and only they do, and the leads go with their page. Check it against the real
// migration when that changes.
const SITES = 'https://euzdaxouzvmvvukbuvwi.supabase.co';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, accept, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' };

function makeSites(opts) {
  const o = opts || {};
  const db = {
    pages: new Map(),
    leads: [],
    tokens: new Map(), // access token -> email
    refresh: new Map(), // refresh token -> email
    swaps: [], // what site-session was asked
    calls: [], // every REST call: { method, path, body }
    teamTokens: o.teamTokens || { 'tok-A1': 'tester@aiparagonconsulting.com', 'tok-A2': 'tester@aiparagonconsulting.com' },
    down: false, // the network to the project fails
    swapAnswer: null, // { status, body } instead of a session
    n: 0,
    clock: Date.parse('2026-11-02T10:00:00Z'),
  };
  const now = () => new Date((db.clock += 1000)).toISOString();
  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  const bare = (d) => String(d || '').replace(/^www\./, '');

  // Someone else's change, or a row put there by a test: the same rules as the builder's writes
  db.put = (row, by) => {
    const t = now();
    const r = { id: row.id, draft: row.draft, live: row.live || null, live_slug: row.live_slug || null, live_text: row.live_text || null, domain: row.domain || null, domain_state: row.domain_state || null, version: row.version || 1, created_at: t, updated_at: t, published_at: row.live ? t : null, created_by: by || 'teammate@aiparagonconsulting.com', updated_by: by || 'teammate@aiparagonconsulting.com' };
    db.pages.set(r.id, r);
    return r;
  };
  db.edit = (id, changes, by) => {
    const r = db.pages.get(id);
    const next = touch(r, { ...r, ...changes }, by || 'teammate@aiparagonconsulting.com');
    db.pages.set(id, next);
    return next;
  };
  db.issue = (email) => {
    db.n++;
    const access = 'site-' + db.n;
    const refresh = 'site-r' + db.n;
    db.tokens.set(access, email);
    db.refresh.set(refresh, email);
    return { access_token: access, refresh_token: refresh, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, email };
  };
  db.revokeAll = () => db.tokens.clear();

  function touch(old, row, who) {
    const t = now();
    const out = { ...row, created_at: old.created_at, created_by: old.created_by };
    if (!same(row.draft, old.draft) || !same(row.live, old.live) || row.live_slug !== old.live_slug) {
      out.version = old.version + 1;
      out.updated_at = t;
      out.updated_by = who;
    } else {
      out.version = old.version;
      out.updated_at = old.updated_at;
      out.updated_by = old.updated_by;
    }
    if (!row.live) out.published_at = null;
    else if (!same(row.live, old.live) || row.live_slug !== old.live_slug) out.published_at = t;
    else out.published_at = old.published_at;
    return out;
  }
  // The table's checks: null for fine, else the error PostgREST would send
  function refuse(row) {
    if ((row.live == null) !== (row.live_slug == null)) return { status: 400, body: { code: '23514', message: 'new row for relation "pages" violates check constraint' } };
    if (row.live_slug && (row.live_slug === 'api' || row.live_slug === 'site' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.live_slug))) return { status: 400, body: { code: '23514', message: 'violates check constraint' } };
    for (const other of db.pages.values()) {
      if (other.id === row.id) continue;
      if (row.live_slug && other.live_slug === row.live_slug) return { status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint "pages_live_slug_key"' } };
      if (row.domain && other.domain && bare(other.domain) === bare(row.domain)) return { status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint "pages_domain_bare"' } };
    }
    return null;
  }
  const filters = (u) => {
    const f = {};
    u.searchParams.forEach((v, k) => {
      if (/^eq\./.test(v)) f[k] = decodeURIComponent(v.slice(3));
    });
    return f;
  };
  const match = (row, f) => Object.keys(f).every((k) => String(row[k]) === f[k]);

  async function handle(route) {
    const req = route.request();
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (db.down) return route.abort();
    const u = new URL(req.url());
    let body = null;
    try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    const json = (status, j) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: j === undefined ? '' : JSON.stringify(j) });

    if (u.pathname === '/functions/v1/site-session') {
      db.swaps.push(body);
      if (db.swapAnswer) return json(db.swapAnswer.status, db.swapAnswer.body);
      const email = body && db.teamTokens[body.auth];
      if (!email) return json(401, { error: 'Your sign-in has run out. Sign in again.', code: 'signin' });
      if (!/@aiparagonconsulting\.com$/.test(email)) return json(403, { error: 'Team pages are for AI Paragon accounts.', code: 'team' });
      return json(200, db.issue(email));
    }
    if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'refresh_token') {
      const email = body && db.refresh.get(body.refresh_token);
      if (!email) return json(400, { error: 'invalid_grant' });
      db.refresh.delete(body.refresh_token);
      const s = db.issue(email);
      return json(200, { ...s, user: { email } });
    }
    if (!u.pathname.startsWith('/rest/v1/')) return json(404, {});
    const auth = String(req.headers().authorization || '').replace(/^Bearer /, '');
    const who = db.tokens.get(auth);
    const table = u.pathname.slice('/rest/v1/'.length);
    db.calls.push({ method, path: table + u.search, body, token: auth });
    if (!who) return json(401, { code: 'PGRST301', message: 'JWT expired' });
    const f = filters(u);
    const ret = /return=representation/.test(req.headers().prefer || '');

    if (table === 'pages') {
      if (method === 'GET') {
        const rows = [...db.pages.values()].filter((r) => match(r, f)).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
        return json(200, rows);
      }
      if (method === 'POST') {
        if (!body || !body.id || !body.draft) return json(400, { code: '23502', message: 'null value' });
        if (db.pages.has(body.id)) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "pages_pkey"' });
        const t = now();
        const row = { id: body.id, draft: body.draft, live: body.live || null, live_slug: body.live_slug || null, live_text: body.live_text || null, domain: body.domain || null, domain_state: null, version: 1, created_at: t, updated_at: t, published_at: body.live ? t : null, created_by: who, updated_by: who };
        const no = refuse(row);
        if (no) return json(no.status, no.body);
        db.pages.set(row.id, row);
        return json(201, ret ? [row] : undefined);
      }
      if (method === 'PATCH') {
        const hits = [...db.pages.values()].filter((r) => match(r, f));
        const out = [];
        for (const r of hits) {
          const next = touch(r, { ...r, ...body }, who);
          const no = refuse(next);
          if (no) return json(no.status, no.body);
          db.pages.set(r.id, next);
          out.push(next);
        }
        return json(200, ret ? out : undefined);
      }
      if (method === 'DELETE') {
        [...db.pages.values()].filter((r) => match(r, f)).forEach((r) => {
          db.pages.delete(r.id);
          db.leads = db.leads.filter((l) => l.page_id !== r.id);
        });
        return json(204);
      }
    }
    if (table === 'leads') {
      if (method === 'GET') return json(200, db.leads.filter((l) => match(l, f)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
      if (method === 'DELETE') {
        db.leads = db.leads.filter((l) => !match(l, f));
        return json(204);
      }
    }
    return json(404, {});
  }

  return { db, handle, SITES };
}

module.exports = { makeSites, SITES };
