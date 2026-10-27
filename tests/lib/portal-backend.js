// A stand-in for the care portal's whole Supabase project, for suites where several people use one team: sign-up,
// sign-in, renewal and sign-out for any number of made-up logins, teams and memberships, the portal's database
// functions (written to behave like the real ones: a new login gets a team of its own as its director, an invite
// moves it into the inviting team), every np_demo_* table kept in memory and scoped to the caller's teams as row
// security does, the settings rows (np_demo_program) per team, the storage bucket, and the np-relay, np-password
// and np-gcal functions. Nothing real is touched. Pass backend.rest to the harness as opts.rest and call
// backend.route(ctx) after newPage.
const crypto = require('crypto');

function parseFilters(qs) {
  const out = [];
  for (const [k, v0] of new URLSearchParams(qs)) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
    let v = v0, neg = false;
    if (v.startsWith('not.')) { neg = true; v = v.slice(4); }
    const dot = v.indexOf('.'); const op = v.slice(0, dot), arg = v.slice(dot + 1);
    out.push({ k, op, arg, neg });
  }
  return out;
}
function test(row, f) {
  const val = row[f.k];
  let ok;
  if (f.op === 'eq') ok = val != null && String(val) === f.arg;
  else if (f.op === 'neq') ok = val == null || String(val) !== f.arg;
  else if (f.op === 'is') ok = f.arg === 'null' ? val == null : String(val) === f.arg;
  else if (f.op === 'like' || f.op === 'ilike') {
    const re = new RegExp('^' + f.arg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', f.op === 'ilike' ? 'i' : '');
    ok = val != null && re.test(String(val));
  } else if (f.op === 'in') ok = f.arg.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(val));
  else if (f.op === 'gt') ok = val > f.arg; else if (f.op === 'lt') ok = val < f.arg;
  else if (f.op === 'gte') ok = val >= f.arg; else if (f.op === 'lte') ok = val <= f.arg;
  else ok = true;
  return f.neg ? !ok : ok;
}
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function makeBackend(opts) {
  opts = opts || {};
  const users = [];                                 // {id, email, password, meta}
  const orgs = {};                                  // id -> {id, name, created_by}
  const members = [];                               // {user_id, org_id, role, created_at}
  const T = {};                                     // table -> rows, every team's
  const program = [];                               // np_demo_program rows: {org_id, key, value, updated_by, updated_at}
  const presence = [];                              // {org_id, email, last_seen}
  const files = {};                                 // storage path -> {buf, type}
  const relay = [];                                 // {email, action, payload}
  const mails = [];                                 // np-password requests
  const tokens = {};                                // access or refresh token -> user id
  const log = [];
  let n = 5000, clock = 0;
  const now = () => new Date(Date.now() + (clock++)).toISOString();
  const rows = (t) => (T[t] = T[t] || []);
  const json = (status, body) => ({ status, body });

  function session(u) {
    const at = 'h.' + b64u({ sub: u.id, email: u.email, exp: Math.floor(Date.now() / 1000) + 3600, n: n++ }) + '.s';
    const rt = 'rt-' + crypto.randomBytes(8).toString('hex');
    tokens[at] = u.id; tokens[rt] = u.id;
    return { access_token: at, refresh_token: rt, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email: u.email, identities: [{ provider: 'email' }], user_metadata: u.meta || {} } };
  }
  const who = (headers) => {
    const a = (headers && (headers.authorization || headers.Authorization)) || '';
    const id = tokens[a.replace(/^Bearer\s+/i, '')];
    return users.find((u) => u.id === id) || null;
  };
  const myOrgs = (u) => (u ? members.filter((m) => m.user_id === u.id).map((m) => m.org_id) : []);
  const myOrg = (u) => { const m = u && members.filter((x) => x.user_id === u.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]; return m ? m.org_id : null; };
  const roleIn = (u, org) => { const m = u && members.find((x) => x.user_id === u.id && x.org_id === org); return m ? m.role : null; };
  const orgHasRecords = (org) => Object.keys(T).some((t) => !/^np_demo_(program|accounts|audit_log|doc_activity|invites|notifications|ask_log|agreements)$/.test(t) && rows(t).some((r) => r.org_id === org));

  // a made-up login made outside the page (a test's starting point), with a team of its own unless it joins one
  function addUser(email, password, org, role) {
    const u = { id: 'u-' + crypto.randomBytes(6).toString('hex'), email: email.toLowerCase(), password, meta: {} };
    users.push(u);
    if (org) { orgs[org] = orgs[org] || { id: org, name: null }; members.push({ user_id: u.id, org_id: org, role: role || 'director', created_at: now() }); }
    return u;
  }
  function newOrgFor(u) {
    const id = 'org_' + crypto.randomBytes(8).toString('hex');
    orgs[id] = { id, name: null, created_by: u.id };
    members.push({ user_id: u.id, org_id: id, role: 'director', created_at: now() });
    return id;
  }

  const rpc = {
    np_my_org: (u) => json(200, myOrg(u)),
    np_my_orgs: (u) => json(200, myOrgs(u)),
    np_my_role: (u) => json(200, roleIn(u, myOrg(u))),
    np_create_my_org: (u) => (!u ? json(401, { message: 'not signed in' }) : json(200, members.some((m) => m.user_id === u.id) ? null : newOrgFor(u))),
    np_my_org_is_spare: (u) => json(200, myOrgs(u).every((o) => !members.some((m) => m.org_id === o && m.user_id !== u.id) && !orgHasRecords(o))),
    np_invite_peek: (u, b) => {
      const i = rows('np_demo_invites').find((x) => x.token === b.p_token);
      return json(200, i ? [{ email: i.email, org_name: (orgs[i.org_id] && orgs[i.org_id].name) || i.org || '', role_title: i.role_title || '', staff_id: i.sid || '', staff_name: i.name || '', used: !!i.used_at }] : []);
    },
    np_invite_access: (u, b) => { const i = rows('np_demo_invites').find((x) => x.token === b.p_token); return json(200, i ? (i.access || 'staff') : null); },
    np_join_org: (u, b) => {
      if (!u) return json(401, { message: 'not signed in' });
      const i = rows('np_demo_invites').find((x) => x.token === b.p_token && !x.used_at);
      if (!i || !i.org_id || String(i.email || '').toLowerCase() !== u.email) return json(200, null);
      for (const o of myOrgs(u)) if (o !== i.org_id && (members.some((m) => m.org_id === o && m.user_id !== u.id) || orgHasRecords(o))) return json(200, null);
      const role = i.access === 'director' ? 'director' : 'staff';
      const had = members.find((m) => m.user_id === u.id && m.org_id === i.org_id);
      if (had) { had.created_at = now(); if (role === 'director') had.role = role; } else members.push({ user_id: u.id, org_id: i.org_id, role, created_at: now() });
      for (let k = members.length - 1; k >= 0; k--) { const m = members[k]; if (m.user_id === u.id && m.org_id !== i.org_id) members.splice(k, 1); }
      i.used_at = now();
      return json(200, i.org_id);
    },
    np_presence: (u) => json(200, presence.filter((p) => p.org_id === myOrg(u)).map((p) => ({ email: p.email, age_s: Math.max(0, Math.floor((Date.now() - p.last_seen) / 1000)) }))),
    np_remove_member: (u, b) => {
      if (roleIn(u, b.p_org) !== 'director') return json(403, { message: 'only a director of this agency can do this' });
      const em = String(b.p_email || '').toLowerCase();
      const t = users.find((x) => x.email === em);
      if (!t) return json(200, { removed: false, reason: 'not-a-member' });
      if (t.id === u.id) return json(200, { removed: false, reason: 'self' });
      const k = members.findIndex((m) => m.user_id === t.id && m.org_id === b.p_org);
      if (k < 0) return json(200, { removed: false, reason: 'not-a-member' });
      members.splice(k, 1);
      return json(200, { removed: true });
    },
  };

  async function rest({ method, path: p, body, headers }) {
    const u = who(headers);
    let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
    // ---- auth
    if (p.startsWith('/auth/v1/signup')) {
      const em = String(b.email || '').toLowerCase();
      if (users.some((x) => x.email === em)) return json(200, { id: 'x', email: em, identities: [] });   // Supabase hides that the address is taken
      const nu = { id: 'u-' + crypto.randomBytes(6).toString('hex'), email: em, password: b.password, meta: b.data || {} };
      users.push(nu); newOrgFor(nu);                                   // np_org_bootstrap_trg: every new login starts a team of its own
      log.push({ t: 'auth', op: 'signup', email: em });
      return json(200, session(nu));                                   // np_demo_autoconfirm_trg confirms the address at once
    }
    if (p.startsWith('/auth/v1/token?grant_type=password')) {
      const x = users.find((y) => y.email === String(b.email || '').toLowerCase() && y.password === b.password);
      return x ? json(200, session(x)) : json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    if (p.startsWith('/auth/v1/token?grant_type=refresh_token')) {
      const id = tokens[b.refresh_token]; const x = users.find((y) => y.id === id);
      if (!x) return json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' });
      delete tokens[b.refresh_token];
      return json(200, session(x));
    }
    if (p.startsWith('/auth/v1/user')) {
      if (!u) return json(401, { msg: 'invalid JWT' });
      if (method === 'PUT') { if (b.password) { if (b.password === u.password) return json(422, { error_code: 'same_password' }); u.password = b.password; } return json(200, { id: u.id, email: u.email }); }
      return json(200, { id: u.id, email: u.email, user_metadata: u.meta });
    }
    if (p.startsWith('/auth/v1/logout')) { const a = ((headers && headers.authorization) || '').replace(/^Bearer\s+/i, ''); delete tokens[a]; return json(204, {}); }
    if (p.startsWith('/auth/v1/verify')) return json(400, { msg: 'Token has expired or is invalid' });
    // ---- functions
    if (p.startsWith('/functions/v1/np-relay')) {
      if (!u) return json(401, { error: 'sign in' });
      relay.push({ email: u.email, org: myOrg(u), action: b.action, payload: b.payload });
      if (b.action === 'ask') { const out = opts.ask ? await opts.ask(b.payload, u) : { reply: 'Okay.' }; return json(out && out.status || 200, out && out.body || out); }
      return json(200, { ok: true });
    }
    if (p.startsWith('/functions/v1/np-password')) { mails.push(b); return json(200, { ok: true }); }
    if (p.startsWith('/functions/v1/np-gcal')) return json(200, { ready: true, connected: false });
    // ---- database functions
    let m = p.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
    if (m) {
      if (!rpc[m[1]]) return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      return rpc[m[1]](u, b);
    }
    // ---- tables (row security: signed in, and only the caller's teams' rows)
    m = p.match(/^\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/);
    if (!m) return undefined;
    const t = m[1], qs = m[2] || '', fl = parseFilters(qs), mine = myOrgs(u);
    if (!u) return method === 'GET' ? json(200, []) : json(401, { code: '42501', message: 'permission denied' });
    const ret = /return=representation/.test((headers && (headers.prefer || headers.Prefer)) || '');
    const upsert = /merge-duplicates/.test((headers && (headers.prefer || headers.Prefer)) || '');
    if (t === 'np_demo_program') {
      if (method === 'GET') return json(200, program.filter((r) => mine.includes(r.org_id) && fl.every((f) => test(r, f))));
      if (method === 'POST') {
        [].concat(b).forEach((row) => {
          const org = row.org_id || myOrg(u);
          if (!mine.includes(org)) return;
          const i = program.findIndex((r) => r.org_id === org && r.key === row.key);
          const r = Object.assign({}, row, { org_id: org, updated_at: now() });
          if (i >= 0) program[i] = Object.assign({}, program[i], r); else program.push(r);
          log.push({ t, op: 'upsert', key: row.key, by: u.email });
        });
        return json(201, []);
      }
      if (method === 'DELETE') { for (let k = program.length - 1; k >= 0; k--) if (mine.includes(program[k].org_id) && fl.every((f) => test(program[k], f))) program.splice(k, 1); return json(200, []); }
    }
    if (t === 'np_demo_presence' && method === 'POST') {
      [].concat(b).forEach((row) => {
        const org = row.org_id || myOrg(u), em = String(row.email || u.email).toLowerCase();
        if (em !== u.email || !mine.includes(org)) return;
        const x = presence.find((q) => q.org_id === org && q.email === em);
        if (x) x.last_seen = Date.now(); else presence.push({ org_id: org, email: em, last_seen: Date.now() });
      });
      return json(201, []);
    }
    const vis = (r) => r.org_id == null || mine.includes(r.org_id);
    if (method === 'GET') {
      let r = rows(t).filter((x) => vis(x) && fl.every((f) => test(x, f)));
      const ord = new URLSearchParams(qs).get('order');
      if (ord) { const [c, dir] = ord.split(',')[0].split('.'); r = r.slice().sort((a, b2) => (String(a[c]) < String(b2[c]) ? -1 : String(a[c]) > String(b2[c]) ? 1 : 0) * (dir === 'desc' ? -1 : 1)); }
      const lim = +new URLSearchParams(qs).get('limit'); if (lim) r = r.slice(0, lim);
      return json(200, r);
    }
    if (method === 'POST') {
      const made = [];
      for (const row of [].concat(b)) {
        const r = Object.assign({}, row);
        if (r.org_id == null) r.org_id = myOrg(u);
        if (!mine.includes(r.org_id)) return json(403, { code: '42501', message: 'new row violates row-level security policy for table "' + t + '"' });
        if (t === 'np_demo_staff' && roleIn(u, r.org_id) !== 'director') return json(403, { code: '42501', message: 'new row violates row-level security policy for table "np_demo_staff"' });
        if (t === 'np_demo_invites' && roleIn(u, r.org_id) !== 'director') return json(403, { code: '42501', message: 'only a director can invite' });
        if (r.id == null) r.id = n++;
        if (!r.created_at) r.created_at = now();
        const i = upsert ? rows(t).findIndex((x) => String(x.id) === String(r.id) && x.org_id === r.org_id) : -1;
        if (i >= 0) rows(t)[i] = Object.assign({}, rows(t)[i], r); else rows(t).push(r);
        log.push({ t, op: upsert ? 'upsert' : 'insert', row: r, by: u.email });
        made.push(r);
      }
      return json(201, ret ? made : []);
    }
    if (method === 'PATCH') {
      const hit = rows(t).filter((x) => vis(x) && fl.every((f) => test(x, f)));
      if (t === 'np_demo_staff' && hit.some((x) => roleIn(u, x.org_id) !== 'director') && ['name', 'init', 'role', 'home', 'trainings', 'hrs', 'hired', 'email'].some((k) => k in b)) return json(400, { code: '42501', message: 'only a director can change a staff record' });
      hit.forEach((x) => Object.assign(x, b));
      log.push({ t, op: 'patch', q: qs, set: b, n: hit.length, by: u.email });
      return json(200, ret ? hit : []);
    }
    if (method === 'DELETE') {
      const before = rows(t).length;
      T[t] = rows(t).filter((x) => !(vis(x) && fl.every((f) => test(x, f))));
      log.push({ t, op: 'delete', q: qs, n: before - T[t].length, by: u.email });
      return json(200, []);
    }
    return undefined;
  }

  // the storage bucket, with the file bytes (registered after the harness's own route, so it is asked first)
  const route = async (ctx) => {
    await ctx.route(/\/storage\/v1\/object\//, async (r) => {
      const req = r.request(), url = new URL(req.url()), meth = req.method();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (meth === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      let m = url.pathname.match(/\/storage\/v1\/object\/sign\/np-demo-docs\/(.+)$/);
      if (m && meth === 'POST') { const k = decodeURIComponent(m[1]); return files[k] ? r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/sign/np-demo-docs/${m[1]}?token=qa` }) }) : r.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: '{"error":"Object not found"}' }); }
      if (m && meth === 'GET') { const k = decodeURIComponent(m[1]); return files[k] ? r.fulfill({ status: 200, headers: cors, contentType: files[k].type || 'application/octet-stream', body: files[k].buf }) : r.fulfill({ status: 404, headers: cors, body: 'not found' }); }
      m = url.pathname.match(/\/storage\/v1\/object\/np-demo-docs\/(.+)$/);
      if (m && (meth === 'POST' || meth === 'PUT')) { files[decodeURIComponent(m[1])] = { buf: req.postDataBuffer() || Buffer.alloc(0), type: req.headers()['content-type'] }; log.push({ t: 'storage', op: 'put', k: decodeURIComponent(m[1]) }); return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ Key: m[1] }) }); }
      if (m && meth === 'DELETE') { delete files[decodeURIComponent(m[1])]; log.push({ t: 'storage', op: 'del', k: decodeURIComponent(m[1]) }); return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' }); }
      if (m && meth === 'GET') { const k = decodeURIComponent(m[1]); return files[k] ? r.fulfill({ status: 200, headers: cors, body: files[k].buf }) : r.fulfill({ status: 404, headers: cors, body: 'not found' }); }
      if (meth === 'DELETE' || meth === 'POST') {                        // bulk delete: {prefixes:[...]}
        let bb = {}; try { bb = JSON.parse(req.postData() || '{}'); } catch (e) {}
        (bb.prefixes || []).forEach((k) => { delete files[k]; log.push({ t: 'storage', op: 'del', k }); });
        return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '[]' });
      }
      return r.fulfill({ status: 404, headers: cors, body: 'not found' });
    });
  };
  return { users, orgs, members, T, rows, program, presence, files, relay, mails, log, rest, route, addUser, myOrg: (email) => myOrg(users.find((x) => x.email === email)), prog: (org, key) => (program.find((r) => r.org_id === org && r.key === key) || {}).value };
}
module.exports = { makeBackend };
