// Daily work QA for E-&-G-Home-Inc.html (#2, the care portal), Nov 5 (v12.41.1): Home, Tasks, Calendar (with Google
// Calendar), Clients and the client page, Staff and the staff page, Training & onboarding, the Safety log,
// Accountability and the family pages, used the way a team uses them: a director and a staff member in their own
// browsers against the stand-in for the Supabase project (lib/portal-backend.js), each change checked in the other
// person's browser after a reload, with the notices it should (and should not) produce.
// The stand-in takes any column, type or empty value; the real tables do not. So every write here also goes through
// a check of the real schema (read from the database on Nov 5): unknown columns, dates, integers, not-null columns,
// generated ids and the foreign keys to clients and staff, answered the way PostgREST answers. A save the real
// database would refuse shows in the page's "Not saved" list here too.
// The checks for the Nov 5 pre-pilot QA findings (fixed in v12.42) fail on v12.41.1. The family view is checked in the demo view
// (there are no family sign-ins in this pilot). np-gcal and Google's sign-in and Calendar API are answered by the suite.
// Usage: node tests/portal-qa-daily.test.js [baseline.html]
const H = require('./lib/portal-harness');
const { makeBackend } = require('./lib/portal-backend');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + String(detail).slice(0, 400) + ']'));
}
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const today = day(0);
const DIR = { email: 'dee@birch.test', pw: 'birch-pass-1', org: 'Birch Care', name: 'Dee Morgan', title: 'Executive Director' };
const STF = { email: 'tom@birch.test', pw: 'tom-pass-123', name: 'Tom Hale' };
const UCI1 = '7351001', UCI2 = '7351002';

// ---- the real tables (information_schema, Nov 5): name:type, ! not null, = has a default ----
const SCHEMA_SRC = {
  np_demo_adls: 'id:bigint!=, org_id:text!=, cid:text!, log_date:date!, log_time:text, kind:text, detail:text, amount:text, assist:text, notes:text, recorded_by:text, created_at:timestamptz!=',
  np_demo_appointments: 'id:text!, cid:text, title:text!, type:text, appt_date:date, appt_time:text, dur:integer=, provider:text, loc:text, flag:text, ride:text, cancelled:integer=, cx_by:text, gcal_event_id:text, created_at:timestamptz=, gcal_id:text, org_id:text!=, cal:text, owner:text, acl:jsonb',
  np_demo_audit_log: 'id:bigint!, at:timestamptz=, who:text, act:text, obj:text, category:text, org_id:text!=, role:text',
  np_demo_checklist_logs: 'id:bigint!, cid:text, item:text, done:integer=, signed_by:text, signed_at:timestamptz, created_at:timestamptz=, org_id:text!=',
  np_demo_client_notes: 'id:bigint!, cid:text, note:text!, noted_by:text, created_at:timestamptz=, org_id:text!=',
  np_demo_clients: 'id:text!, uci:text, name:text!, init:text, home:text, age:integer, since:date, guardian:text, tag:text, dx:text, alerts:jsonb=, support:text, goals:jsonb=, org_id:text!=',
  np_demo_credentials: 'id:bigint!, sid:text, cred_name:text!, expires_on:date, label:text, status:text, created_at:timestamptz=, org_id:text!=, doc:jsonb',
  np_demo_documents: 'id:bigint!, cid:text, n:text, cat:text, uploaded_by:text, doc_date:date, size:text, created_at:timestamptz=, storage_path:text, url:text, note:text, org_id:text!=, sub_binder:text',
  np_demo_fire_drills: 'id:bigint!, drill_date:date, drill_time:text, home:text, shift:text, evac:text, conducted_by:text, wet:integer=, created_at:timestamptz=, org_id:text!=, notes:text',
  np_demo_incidents: 'id:text!, cid:text, type:text, inc_date:date, inc_time:text, sev:text, status:text, reported_by:text, summary:text, notified:jsonb=, recips:jsonb=, hours_left:integer, created_at:timestamptz=, proto_ack:jsonb, org_id:text!=',
  np_demo_inspections: 'id:text!, kind:text, template_id:text, title:text, folder:text, score_num:numeric, score_den:integer, responses:jsonb, questions:jsonb, created_by:text, created_at:timestamptz=, per_week:integer, has_obs:boolean, org_id:text!=',
  np_demo_notifications: 'id:bigint!, title:text!, body:text, kind:text=, created_at:timestamptz=, org_id:text!=, for_staff:text',
  np_demo_shifts: 'id:bigint!, staff_id:text!, start_time:text!, end_time:text!, home:text=, shift_date:text!, created_at:timestamptz=, org_id:text!=',
  np_demo_staff: 'id:text!, name:text!, init:text, role:text, home:text, trainings:jsonb=, hrs:integer=, hired:date, color:text, photo:text, org_id:text!=, email:text, icon:text',
  np_demo_tasks: 'id:text!, title:text!, sid:text, cid:text, due:date, stage:text=, pri:text=, subs:jsonb=, updated_at:timestamptz=, category:text, notes:jsonb=, signoff:jsonb, org_id:text!=, done_at:date',
  np_demo_vitals: 'id:bigint!=, org_id:text!=, cid:text!, reading_date:date!, reading_time:text, hr:text, bp:text, temp:text, resp:text, o2:text, weight:text, glucose:text, pain:text, context:text, notes:text, recorded_by:text, created_at:timestamptz!=',
  np_demo_water_temps: 'id:bigint!, reading_date:date, home:text, temp:numeric, recorded_by:text, wet:integer=, created_at:timestamptz=, org_id:text!=, location:text, fridge:numeric, freezer:numeric',
  np_demo_whereabouts: 'id:bigint!=, org_id:text!=, cid:text!, log_date:date!, start_time:text, end_time:text, place:text, with_whom:text, purpose:text, notes:text, recorded_by:text, created_at:timestamptz!=',
};
const ALWAYS = ['np_demo_audit_log', 'np_demo_checklist_logs', 'np_demo_client_notes', 'np_demo_credentials', 'np_demo_documents', 'np_demo_fire_drills', 'np_demo_notifications', 'np_demo_shifts', 'np_demo_water_temps'];   // GENERATED ALWAYS identity ids
const FK = { np_demo_appointments: ['cid', 'np_demo_clients'], np_demo_checklist_logs: ['cid', 'np_demo_clients'], np_demo_client_notes: ['cid', 'np_demo_clients'], np_demo_credentials: ['sid', 'np_demo_staff'] };
const SCHEMA = {};
for (const [t, s] of Object.entries(SCHEMA_SRC)) {
  SCHEMA[t] = {};
  s.split(', ').forEach((c) => { const m = c.match(/^(\w+):(\w+)(!?)(=?)$/); SCHEMA[t][m[1]] = { type: m[2], notnull: !!m[3], def: !!m[4] || (m[1] === 'id' && ALWAYS.includes(t)) }; });
}
const pgErr = (status, code, message, details) => ({ status, body: { code, details: details || null, hint: null, message } });
function coerce(type, v) {
  if (v === null || v === undefined) return { v };
  const bad = (ty) => ({ err: pgErr(400, /date|timestamp/.test(ty) ? '22007' : '22P02', `invalid input syntax for type ${ty}: "${typeof v === 'object' ? JSON.stringify(v) : v}"`) });
  if (type === 'date') return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) ? { v: v.slice(0, 10) } : bad('date');
  if (type === 'timestamptz') return (typeof v === 'string' && v && !isNaN(Date.parse(v))) ? { v } : bad('timestamp with time zone');
  if (type === 'integer' || type === 'bigint') { const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v) ? +v : NaN); return Number.isInteger(n) ? { v: n } : bad(type); }
  if (type === 'numeric') { const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? +v : NaN); return isFinite(n) ? { v: n } : bad('numeric'); }
  if (type === 'boolean') return typeof v === 'boolean' ? { v } : bad('boolean');
  if (type === 'text') return { v: typeof v === 'object' ? JSON.stringify(v) : String(v) };
  return { v };
}
// the stand-in's rest(), with the real database's checks in front of it
function faithful(B, extra) {
  const errs = [];
  const fail = (t, method, e) => { errs.push({ t, method, code: e.body.code, msg: e.body.message }); return e; };
  const rest = async (req) => {
    if (extra) { const x = await extra(req); if (x) return x; }
    const m = req.path.match(/^\/rest\/v1\/(np_demo_[a-z_]+)(?:\?(.*))?$/);
    if (m && SCHEMA[m[1]] && (req.method === 'POST' || req.method === 'PATCH')) {
      const t = m[1], S = SCHEMA[t];
      let b; try { b = JSON.parse(req.body || 'null'); } catch (e) { b = null; }
      const upsert = /merge-duplicates/.test((req.headers && (req.headers.prefer || req.headers.Prefer)) || '');
      for (const row of [].concat(b || [])) {
        for (const k of Object.keys(row)) {
          if (!S[k]) return fail(t, req.method, pgErr(400, 'PGRST204', `Could not find the '${k}' column of '${t}' in the schema cache`));
          if (k === 'id' && ALWAYS.includes(t) && req.method === 'POST') return fail(t, req.method, pgErr(400, '428C9', 'cannot insert a non-DEFAULT value into column "id"', 'Column "id" is an identity column defined as GENERATED ALWAYS.'));
          const r = coerce(S[k].type, row[k]);
          if (r.err) return fail(t, req.method, r.err);
          row[k] = r.v;
          if (row[k] === null && S[k].notnull) return fail(t, req.method, pgErr(400, '23502', `null value in column "${k}" of relation "${t}" violates not-null constraint`));
        }
        if (req.method === 'POST') {
          for (const [k, c] of Object.entries(S)) if (c.notnull && !c.def && k !== 'org_id' && row[k] == null) return fail(t, req.method, pgErr(400, '23502', `null value in column "${k}" of relation "${t}" violates not-null constraint`));
          const fk = FK[t];
          if (fk && row[fk[0]] != null && row.org_id && !B.rows(fk[1]).some((x) => String(x.id) === String(row[fk[0]]) && x.org_id === row.org_id)) return fail(t, req.method, pgErr(409, '23503', `insert or update on table "${t}" violates foreign key constraint "${t}_${fk[0]}_fkey"`));
          if (!upsert && row.id != null && row.org_id && B.rows(t).some((x) => String(x.id) === String(row.id) && x.org_id === row.org_id)) return fail(t, req.method, pgErr(409, '23505', `duplicate key value violates unique constraint "${t}_pkey"`));
        }
      }
      req = Object.assign({}, req, { body: JSON.stringify(b) });
    }
    if (m && req.method === 'DELETE' && (m[1] === 'np_demo_clients' || m[1] === 'np_demo_staff')) {
      const id = ((m[2] || '').match(/(?:^|&)id=eq\.([^&]+)/) || [])[1];
      if (id) for (const [t, [col, ref]] of Object.entries(FK)) if (ref === m[1] && B.rows(t).some((x) => String(x[col]) === decodeURIComponent(id))) return fail(m[1], 'DELETE', pgErr(409, '23503', `update or delete on table "${m[1]}" violates foreign key constraint "${t}_${col}_fkey" on table "${t}"`));
    }
    return B.rest(req);
  };
  return { rest, errs };
}

(async () => {
  const env = await H.start(process.argv[2]);
  const B = makeBackend({ ask: async () => ({ reply: 'Okay.' }) });
  // np-gcal as the suite says, plus Google's Calendar API (below)
  const G = { connected: false, calls: [], api: [], events: [] };
  const gcal = async (req) => {
    if (!req.path.startsWith('/functions/v1/np-gcal')) return null;
    if (req.method !== 'POST') return { status: 204, body: '' };
    const b = JSON.parse(req.body || '{}'); G.calls.push(b.action);
    if (b.action === 'connect') { G.connected = true; return { status: 200, body: { ready: true, connected: true, email: 'dee@gmail.test', access_token: 'g-tok', expires_in: 3600 } }; }
    if (b.action === 'disconnect') { G.connected = false; return { status: 200, body: { ready: true, connected: false } }; }
    return { status: 200, body: G.connected ? { ready: true, connected: true, email: 'dee@gmail.test', access_token: 'g-tok', expires_in: 3600 } : { ready: true, connected: false } };
  };
  const F = faithful(B, gcal);
  const errors = [];
  async function open(viewport) {
    const { ctx, page } = await H.newPage(env, { rest: F.rest, bucket: errors, viewport: viewport || { width: 1440, height: 900 } });
    await B.route(ctx);
    await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript',
      body: 'window.google={accounts:{oauth2:{initCodeClient:function(o){return {requestCode:function(){setTimeout(function(){o.callback({code:"qa-code"})},20)}}},initTokenClient:function(o){return {requestAccessToken:function(){o.callback({access_token:"t",expires_in:3600})}}},revoke:function(t,cb){cb&&cb()}}}};' }));
    await ctx.route('https://www.googleapis.com/calendar/v3/**', async (r) => {
      const q = r.request(); G.api.push({ m: q.method(), url: q.url(), body: q.postData() || '' });
      if (q.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: G.events }) });
      if (q.method() === 'POST') { const ev = JSON.parse(q.postData()); const id = 'gev' + G.api.length; G.events.push(Object.assign({ id, status: 'confirmed' }, ev)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id }) }); }
      if (q.method() === 'PATCH') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      if (q.method() === 'DELETE') { const id = q.url().split('/').pop(); G.events = G.events.filter((e) => e.id !== id); return r.fulfill({ status: 204, body: '' }); }
      return r.fulfill({ status: 404, body: '' });
    });
    page.on('dialog', (d) => d.accept());
    return { ctx, page };
  }
  const booted = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  const inApp = (page) => page.waitForFunction(() => el('app').classList.contains('on') && typeof state !== 'undefined' && state.role, null, { timeout: 20000 });
  const settle = (page, ms) => page.waitForTimeout(ms || 400);
  const until = async (fn, ms) => { const end = Date.now() + (ms || 6000); while (Date.now() < end) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
  const go = async (page, v) => { await page.evaluate((v) => { closeAll(); state.client = null; state.openTrain = ''; state.openList = ''; state.openGuide = null; go(v); }, v); await settle(page, 350); };
  const reload = async (page) => { await page.reload({ waitUntil: 'load' }); await booted(page); await inApp(page); await settle(page, 1300); };
  const btn = (page, scope, text) => page.locator(scope + ' button:has-text("' + text + '")').first();
  const view = (page) => page.evaluate(() => el('view').innerText);
  const toastTxt = (page) => page.evaluate(() => el('toastTxt').textContent);
  const fails = (page) => page.evaluate(() => SB_FAILS.map((f) => f.t + ': ' + f.detail));
  const errsFor = (t, from) => F.errs.slice(from || 0).filter((e) => e.t === t);
  const notes = () => B.rows('np_demo_notifications');
  async function addOption(page, sel, val) {
    await page.selectOption(sel, '__add__');
    const box = page.locator(sel + ' ~ .inline-add input, .inline-add input').first();
    await box.fill(val); await box.press('Enter'); await settle(page, 250);
  }
  async function signPilot(page, who) {
    if (!(await page.locator('#pgAccept').count())) return false;
    if (await page.locator('#pgAgency').isVisible()) await page.fill('#pgAgency', who.org || '');
    await page.fill('#pgName', who.name); await page.fill('#pgTitle', who.title || 'Staff');
    await page.check('#pgAccept'); await page.locator('#modal button:has-text("Continue")').click();
    await page.waitForFunction(() => !window._gateLock && !el('modal').classList.contains('on'), null, { timeout: 10000 }).catch(() => {});
    return true;
  }
  const openClient = async (page, uci, tab) => {
    await go(page, 'clients'); await page.locator('#view tr:has-text("' + uci + '")').first().click(); await settle(page, 400);
    if (tab) { await page.locator('#view .tabs button:has-text("' + tab + '")').first().click(); await settle(page, 300); }
  };
  const taskRow = (page, title) => page.locator('#view section:has(h2:text-is("Open tasks")) tr.click:has-text("' + title + '")').first();
  const addItem = async (page, k) => { await page.click('#view .page-acts .cx-add-b'); await settle(page, 150); await page.click(`#cxMenu .cx-mi[data-k="${k}"]`); await settle(page, 300); };
  const descField = (page, v) => page.evaluate((v) => { const l = [...document.querySelectorAll('#icFields label')].find((x) => /description/i.test(x.textContent)); const i = l ? l.parentElement.querySelector('textarea,input') : el('icSum'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const bell = (page) => page.evaluate(() => { openAlerts(); const t = el('drawer').innerText; closeAll(); return t; });

  // ================= 0. a new team: a director, two clients, a staff member who joins, a second staff record =================
  const D = await open(), page = D.page;
  await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
  await page.click('text=Get your team started');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'regOrg');
  await page.fill('#regOrg', DIR.org); await page.fill('#regName', DIR.name); await page.fill('#regRole', DIR.title);
  await page.fill('#liEmail', DIR.email); await page.fill('#liPw', DIR.pw); await page.click('#liGo');
  await page.waitForFunction(() => el('onbRoot') && el('onbRoot').classList.contains('on'), null, { timeout: 20000 });
  for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => el('onbRoot').classList.contains('on')))) break; await page.locator('#onbRoot .opt >> visible=true').first().click().catch(() => {}); await page.locator('#onbRoot #next').click(); await settle(page, 400); }
  await inApp(page); await settle(page, 1300); await signPilot(page, DIR);
  const org = B.myOrg(DIR.email);
  for (const [uci, home, prog] of [[UCI1, 'Oak House', 'Residential'], [UCI2, 'Elm House', 'Day program']]) {
    await go(page, 'clients'); await btn(page, '#view', 'Add client').click(); await settle(page, 400);
    await page.fill('#clUci', uci); await page.fill('#clAge', '40');
    if (await page.evaluate((v) => [...el('clHome').options].some((o) => o.value === v), home)) await page.selectOption('#clHome', home); else await addOption(page, '#clHome', home);
    if (await page.evaluate((v) => [...el('clDx').options].some((o) => o.value === v), prog)) await page.selectOption('#clDx', prog); else await addOption(page, '#clDx', prog);
    await btn(page, '#view', 'Save client').click(); await settle(page, 600); await page.evaluate(() => closeAll());
  }
  const cid1 = (B.rows('np_demo_clients').find((c) => c.uci === UCI1) || {}).id, cid2 = (B.rows('np_demo_clients').find((c) => c.uci === UCI2) || {}).id;
  check('setup: two clients saved, each with a new home and program', !!cid1 && !!cid2 && JSON.stringify(B.prog(org, 'homes')).includes('Elm House'));
  await go(page, 'team'); await btn(page, '#view', 'Add staff').click(); await settle(page, 400);
  await page.fill('#sfName', STF.name); await page.fill('#sfInit', 'T.H.'); await page.fill('#sfRole', 'DSP'); await page.selectOption('#sfHome', 'Oak House'); await page.fill('#sfHired', today); await page.fill('#sfEmail', STF.email);
  await btn(page, '#modal', 'Add staff member').click(); await settle(page, 800);
  await until(() => B.relay.some((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite'));
  await go(page, 'team'); await btn(page, '#view', 'Add staff').click(); await settle(page, 300);
  await page.fill('#sfName', 'Ana Cruz'); await page.fill('#sfInit', 'A.C.'); await page.fill('#sfRole', 'House lead'); await page.selectOption('#sfHome', 'Elm House');
  await page.locator('#sfInvite').uncheck().catch(() => {});
  await btn(page, '#modal', 'Add staff member').click(); await settle(page, 700);
  const sid = (B.rows('np_demo_staff').find((x) => x.email === STF.email) || {}).id, sid2 = (B.rows('np_demo_staff').find((x) => x.name === 'Ana Cruz') || {}).id;
  const S = await open(), sp = S.page;
  await sp.goto(B.relay.find((r) => r.action === 'email' && r.payload.kind === 'invite').payload.link, { waitUntil: 'load' }); await booted(sp);
  await sp.waitForFunction(() => /Join/.test((el('loginTitle') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await sp.fill('#liPw', STF.pw); if (await sp.locator('#liPw2').count()) await sp.fill('#liPw2', STF.pw);
  await sp.click('#liGo'); await sp.waitForFunction(() => typeof state !== 'undefined' && state.role === 'staff', null, { timeout: 20000 }).catch(() => {}); await settle(sp, 1300);
  await signPilot(sp, { name: STF.name, title: 'DSP' }); await settle(sp, 500);
  check('setup: Tom joined as staff of Birch Care; Ana is a staff record with no sign-in', !!sid && !!sid2 && await sp.evaluate((s) => state.role === 'staff' && meSid() === s, sid));

  // ================= 1. Tasks =================
  {
    let f0 = F.errs.length;
    await go(page, 'tasks');
    const mk = async (title, o) => {
      await btn(page, '#view', 'Assign task').click(); await settle(page, 300);
      await page.fill('#ntTitle', title); await page.selectOption('#ntWho', o.who || sid); await page.fill('#ntDue', o.due == null ? today : o.due);
      if (o.client) await page.selectOption('#ntClient', o.client);
      if (o.pri) await page.selectOption('#ntPri', o.pri);
      if (o.cat) await page.selectOption('#ntCat', o.cat);
      await btn(page, '#modal', 'Assign task').click(); await settle(page, 500);
    };
    await mk('Refill pill organiser', { client: cid1, pri: 'High', cat: 'Documentation' });
    await mk('Call guardian back', { due: day(-1), cat: 'Client' });
    await until(() => B.rows('np_demo_tasks').length === 2);
    const t1 = B.rows('np_demo_tasks').find((t) => t.title === 'Refill pill organiser') || {};
    check('tasks: Assign task saves it for Tom, for the client, due today, High, Documentation, Not started', t1.sid === sid && t1.cid === cid1 && t1.due === today && t1.pri === 'High' && t1.category === 'Documentation' && t1.stage === 'Not started', JSON.stringify(t1));
    check('tasks: Tom gets a "Task assigned" notice for each, and nobody else does', notes().filter((n) => n.kind === 'task').length === 2 && notes().filter((n) => n.kind === 'task').every((n) => n.for_staff === sid), JSON.stringify(notes().filter((n) => n.kind === 'task')));
    // steps and notes
    await taskRow(page, 'Refill pill organiser').click(); await settle(page, 300);
    for (const s of ['Count what is left', 'Order the refill', 'Fill the organiser']) { await page.fill('#tkStep', s); await page.press('#tkStep', 'Enter'); await settle(page, 200); }
    await page.locator('#drawer button[title="Move down"]').first().click(); await settle(page, 200);
    await page.locator('#drawer button[title="Edit"]').nth(2).click(); await settle(page, 200); await page.fill('#stEdit', 'Fill the organiser for the week'); await btn(page, '#modal', 'Save').click(); await settle(page, 250);
    await page.locator('#drawer button[title="Delete"]').nth(0).click(); await settle(page, 250);
    await page.fill('#tkNote', 'Pharmacy closes at 6'); await page.press('#tkNote', 'Enter'); await settle(page, 300);
    await until(() => ((B.rows('np_demo_tasks').find((t) => t.id === t1.id) || {}).subs || []).length === 2);
    const t1b = B.rows('np_demo_tasks').find((t) => t.id === t1.id) || {};
    check('tasks: steps added, moved, renamed and deleted, and a note, are saved in order', JSON.stringify((t1b.subs || []).map((s) => s.t)) === JSON.stringify(['Count what is left', 'Fill the organiser for the week']) && /Pharmacy closes at 6/.test(JSON.stringify(t1b.notes)), JSON.stringify([t1b.subs, t1b.notes]));
    // edit: rename, due, priority, reassign to Ana, then back
    await page.fill('#tkTitle', 'Refill the pill organiser'); await page.fill('#tkDue', day(2)); await page.selectOption('#tkPri', 'Medium'); await page.selectOption('#tkWho', sid2);
    await btn(page, '#drawer', 'Save changes').click(); await settle(page, 400);
    await page.selectOption('#tkWho', sid); await btn(page, '#drawer', 'Save changes').click(); await settle(page, 400);
    await page.evaluate(() => closeAll());
    const t1c = B.rows('np_demo_tasks').find((t) => t.id === t1.id) || {};
    check('tasks: Edit task saves the new name, due date and priority; reassigning tells each new assignee', t1c.title === 'Refill the pill organiser' && t1c.due === day(2) && t1c.pri === 'Medium' && t1c.sid === sid && notes().some((n) => n.kind === 'task' && n.for_staff === sid2), JSON.stringify(t1c));
    // Tom works it
    await reload(sp); await go(sp, 'tasks');
    const tv = await view(sp);
    check('tasks (staff): My tasks lists both of Tom’s tasks, with the client by UCI', /My tasks/.test(tv) && /Refill the pill organiser/.test(tv) && /Call guardian back/.test(tv) && tv.includes(UCI1), tv.slice(0, 300));
    check('tasks (staff): the menu badge counts his open tasks', await sp.evaluate(() => (document.querySelector('.nav-item[onclick="go(\'tasks\')"] .badge') || {}).innerText) === '2');
    await taskRow(sp, 'Refill the pill organiser').click(); await settle(sp, 300);
    const sd = await sp.evaluate(() => ({ steps: [...document.querySelectorAll('#drawer .checkrow .ct')].map((x) => x.innerText), del: /Delete task/.test(el('drawer').innerText), note: /Pharmacy closes at 6/.test(el('drawer').innerText) }));
    check('tasks (staff): the task opens with its steps in order and the director’s note; staff get no Delete task', sd.steps.length === 2 && /Count what is left/.test(sd.steps[0]) && sd.note && !sd.del, JSON.stringify(sd));
    await sp.locator('#drawer .checkrow .cb').first().click(); await settle(sp, 400);
    await until(() => (B.rows('np_demo_tasks').find((t) => t.id === t1.id) || {}).stage === 'In progress');
    check('tasks (staff): ticking a step moves the task to In progress, saved', (B.rows('np_demo_tasks').find((t) => t.id === t1.id) || {}).stage === 'In progress');
    await btn(sp, '#drawer', 'Sign off as').click(); await settle(sp, 400);
    await until(() => (B.rows('np_demo_tasks').find((t) => t.id === t1.id) || {}).stage === 'Done');
    const t1d = B.rows('np_demo_tasks').find((t) => t.id === t1.id) || {};
    check('tasks (staff): Sign off as Tom Hale marks it Done today with his name', t1d.stage === 'Done' && t1d.done_at === today && (t1d.signoff || {}).by === STF.name, JSON.stringify(t1d));
    check('tasks: the director gets "Task signed off"; Tom does not', notes().some((n) => n.kind === 'tasksign' && n.for_staff === '@director') && !notes().some((n) => n.kind === 'tasksign' && n.for_staff === sid));
    await sp.evaluate(() => closeAll());
    // Tom adds his own
    await btn(sp, '#view', 'Add task').click(); await settle(sp, 300);
    const sm = await sp.evaluate(() => ({ title: el('mdTitle').textContent, save: el('mdFoot').innerText }));
    check('a staff member’s Add task window says "Add a task" and "Add task", not "Assign a task" / "Assign task"', !/Assign/.test(sm.title + sm.save), JSON.stringify(sm));
    await sp.fill('#ntTitle', 'Wash the van'); await btn(sp, '#modal', 'Add task').click(); await settle(sp, 500);
    await until(() => B.rows('np_demo_tasks').some((t) => t.title === 'Wash the van'));
    check('tasks (staff): Add task saves it for himself, with no notice to himself', (B.rows('np_demo_tasks').find((t) => t.title === 'Wash the van') || {}).sid === sid && !notes().some((n) => /Wash the van/.test(n.body || '')));
    // the director: completed, re-open, delete, filters
    await reload(page); await go(page, 'tasks');
    const dv = await view(page);
    check('tasks: after a reload the director sees the signed-off task under Completed, "signed off by Tom Hale"', /Completed[\s\S]*Refill the pill organiser[\s\S]*signed off by Tom Hale/.test(dv), dv.slice(-600));
    await page.locator('#view section:has(h2:text-is("Completed")) button:has-text("Today")').click(); await settle(page, 250);
    check('tasks: Completed > Today keeps it', /Refill the pill organiser/.test(await page.evaluate(() => [...document.querySelectorAll('#view section')].find((s) => /Completed/.test(s.innerText)).innerText)));
    await page.locator('#view section:has(h2:text-is("Completed")) tr.click:has-text("Refill the pill organiser")').click(); await settle(page, 300);
    await btn(page, '#drawer', 'Re-open task').click(); await settle(page, 400);
    await until(() => (B.rows('np_demo_tasks').find((t) => t.id === t1.id) || {}).stage === 'Not started');
    check('tasks: Re-open puts it back to Not started with no sign-off, and tells Tom', (B.rows('np_demo_tasks').find((t) => t.id === t1.id) || {}).signoff === null && notes().some((n) => n.title === 'Task re-opened' && n.for_staff === sid));
    // the step tick's time, after a reload
    await taskRow(page, 'Refill the pill organiser').click(); await settle(page, 300);
    const stepTxt = await page.evaluate(() => (document.querySelector('#drawer .checkrow .ct') || {}).innerText || '');
    check('a ticked step says when it was ticked, not "just now" days later (saved as the text "just now")', !/just now/.test(stepTxt), stepTxt);
    await page.evaluate(() => closeAll());
    // filters
    await page.locator('#view .tabs button:has-text("Documentation")').click(); await settle(page, 250);
    const docTab = await page.evaluate(() => [...document.querySelectorAll('#view section:has(h2) tr.click')].filter((r) => r.closest('section').querySelector('h2').textContent === 'Open tasks').map((r) => r.innerText));
    check('tasks: a category tab shows only that category', docTab.length >= 1 && docTab.every((r) => /Documentation/.test(r)), JSON.stringify(docTab));
    await page.locator('#view .tabs button:has-text("All categories")').click(); await settle(page, 250);
    await page.fill('#view input[placeholder="Search tasks…"]', 'guardian'); await settle(page, 500);
    const srch = await page.evaluate(() => [...document.querySelectorAll('#view section tr.click')].filter((r) => r.closest('section').querySelector('h2').textContent === 'Open tasks').map((r) => r.innerText));
    check('tasks: search narrows the list', srch.length === 1 && /Call guardian back/.test(srch[0]), JSON.stringify(srch));
    await page.fill('#view input[placeholder="Search tasks…"]', ''); await settle(page, 500);
    const openRows = async () => page.evaluate(() => [...document.querySelectorAll('#view section tr.click')].filter((r) => r.closest('section').querySelector('h2').textContent === 'Open tasks').map((r) => r.innerText.replace(/\s+/g, ' ')));
    await page.locator('#view select.inp').nth(0).selectOption(sid2); await settle(page, 250);
    check('tasks: Everyone > Ana shows nothing of Tom’s', (await openRows()).length === 0, JSON.stringify(await openRows()));
    await page.locator('#view select.inp').nth(0).selectOption(''); await settle(page, 250);
    await page.locator('#view select.inp').nth(1).selectOption('To do'); await settle(page, 250);
    check('Any stage > To do lists the tasks not started yet (they are saved as "Not started", which no filter choice matches)', (await openRows()).some((r) => /Call guardian back/.test(r)), JSON.stringify(await openRows()));
    await page.locator('#view select.inp').nth(1).selectOption('Overdue'); await settle(page, 250);
    check('Any stage > Overdue lists a task whose due date has passed (Call guardian back, due yesterday)', (await openRows()).some((r) => /Call guardian back/.test(r)), JSON.stringify(await openRows()));
    await page.locator('#view select.inp').nth(1).selectOption(''); await settle(page, 250);
    const bys = await page.evaluate(() => { const r = [...document.querySelectorAll('#view section')].find((s) => /By staff member/.test(s.innerText)); const row = r && [...r.querySelectorAll('tr.click')].find((x) => /T\.H\./.test(x.innerText)); return row ? [...row.cells].map((c) => c.innerText.trim()) : []; });
    check('By staff member counts Tom’s past-due task in Overdue', +bys[4] >= 1, JSON.stringify(bys));
    await go(page, 'home');
    const att = await page.evaluate(() => ({ attn: (document.querySelector('#view [data-hm="attention"]') || {}).innerText || '', tile: ([...document.querySelectorAll('#view .hm-tile')].find((t) => /Open tasks/.test(t.innerText)) || {}).innerText || '' }));
    check('Home > Needs your attention lists the past-due task (the Open tasks tile already says it is overdue)', /Call guardian back/.test(att.attn), JSON.stringify(att).replace(/\\n/g, ' '));
    // a category renamed
    await go(page, 'tasks'); await page.locator('#view .tabs button:has-text("Edit categories")').click(); await settle(page, 300);
    const ci = await page.evaluate(() => [...document.querySelectorAll('#mdBody .docrow, #mdBody > div > div')].findIndex((r) => /^\s*Client\b/.test(r.innerText)));
    await page.evaluate(() => { const rows = [...document.querySelectorAll('#mdBody button')].filter((b) => /Rename/.test(b.textContent)); const i = [...document.querySelectorAll('#mdBody button')].filter((b) => /Rename/.test(b.textContent)).findIndex((b) => /^\s*Client\b/.test(b.closest('div').parentElement.innerText)); (rows[i >= 0 ? i : 0]).click(); });
    await settle(page, 200);
    await page.locator('#mdBody input').first().fill('Client care'); await page.locator('#mdBody button:has-text("Save")').first().click(); await settle(page, 300);
    await page.evaluate(() => closeAll());
    const catNow = await page.evaluate(() => (TASKS.find((t) => t.title === 'Call guardian back') || {}).cat);
    await reload(page);
    const catAfter = await page.evaluate(() => ({ cat: (TASKS.find((t) => t.title === 'Call guardian back') || {}).cat, cats: TASK_CATS.slice() }));
    check('tasks: Edit categories renames a category for the team', catNow === 'Client care' && catAfter.cats.includes('Client care') && !catAfter.cats.includes('Client'), JSON.stringify([ci, catNow, catAfter]));
    check('a renamed category stays on the tasks that had it after a reload ("Renaming updates existing tasks" only changes this page’s copy)', catAfter.cat === 'Client care', JSON.stringify(catAfter));
    // a task with no due date
    f0 = F.errs.length;
    await go(page, 'tasks'); await btn(page, '#view', 'Assign task').click(); await settle(page, 300);
    await page.fill('#ntTitle', 'Find the spare key'); await page.selectOption('#ntWho', sid); await page.fill('#ntDue', '');
    await btn(page, '#modal', 'Assign task').click(); await settle(page, 700);
    const blank = { failed: errsFor('np_demo_tasks', f0).map((e) => e.msg), shown: await page.evaluate(() => TASKS.some((t) => t.title === 'Find the spare key')), saved: B.rows('np_demo_tasks').some((t) => t.title === 'Find the spare key'), told: notes().some((n) => /Find the spare key/.test(n.body || '')) };
    check('a task with the due date left blank either saves (no due date) or is refused; it never shows as assigned, notifies Tom, then fails to save (the database refuses an empty date)', !blank.failed.length && (blank.saved || (!blank.shown && !blank.told)), JSON.stringify(blank));
    await page.evaluate(() => { SB_FAILS = []; closeAll(); });
    // delete
    await go(page, 'tasks'); await taskRow(page, 'Wash the van').click(); await settle(page, 300);
    await btn(page, '#drawer', 'Delete task').click(); await settle(page, 300);
    const asked = await page.evaluate(() => el('modal').classList.contains('on'));
    check('Delete task asks before deleting, like every other delete (it goes at once, with no undo)', asked);
    if (asked) { await page.locator('#mdFoot .btn.danger').click(); await settle(page, 300); }
    await until(() => !B.rows('np_demo_tasks').some((t) => t.title === 'Wash the van'));
    await reload(sp); await go(sp, 'tasks');
    check('tasks: a deleted task is gone from Tom’s list after a reload', !/Wash the van/.test(await view(sp)));
    check('tasks: no other save failed', !errsFor('np_demo_tasks').filter((e) => !/""/.test(e.msg)).length, JSON.stringify(errsFor('np_demo_tasks')));
  }

  // ================= 2. Calendar: every Add item kind, an appointment's life, shifts, Google =================
  let aid = '', eid = '';
  {
    await go(page, 'calendar');
    await addItem(page, 'appt');
    await page.selectOption('#apClient', cid1); await page.fill('#apTitle', 'Eye exam'); await page.fill('#apTime', '14:00'); await page.fill('#apProv', 'Dr. Vu'); await page.fill('#apLoc', 'Vision Center'); await page.fill('#apFlag', 'Bring glasses');
    await page.locator('#apGcal').uncheck(); await page.click('#mdFoot .btn.navy'); await settle(page, 400);
    await addItem(page, 'event'); await page.fill('#apTitle', 'Movie night'); await page.fill('#apTime', '18:00'); await page.locator('#apGcal').uncheck(); await page.click('#mdFoot .btn.navy'); await settle(page, 400);
    await addItem(page, 'meeting'); await page.fill('#apTitle', 'Staff huddle'); await page.fill('#apTime', '09:00'); await page.locator('#apGcal').uncheck(); await page.click('#mdFoot .btn.navy'); await settle(page, 400);
    await addItem(page, 'shift'); await page.selectOption('#shWho', sid); await page.fill('#shStart', '00:00'); await page.fill('#shEnd', '23:59'); await page.selectOption('#shHome', 'Oak House');
    await btn(page, '#mdFoot', 'Add shift').click(); await settle(page, 400);
    await addItem(page, 'rem'); await page.fill('#ntTitle', 'Order supplies'); await page.selectOption('#ntWho', sid); await page.locator('#mdFoot .btn.navy').click(); await settle(page, 400);
    await addItem(page, 'where'); await page.selectOption('#acC', cid2); await page.fill('#acP', 'Library'); await page.fill('#acW', 'Ana Cruz'); await page.fill('#acS', '10:00'); await page.fill('#acE', '11:30'); await page.locator('#mdFoot .btn.navy').click(); await settle(page, 400);
    await until(() => B.rows('np_demo_whereabouts').length === 1);
    const ap = B.rows('np_demo_appointments'); aid = (ap.find((a) => a.title === 'Eye exam') || {}).id; eid = (ap.find((a) => a.title === 'Movie night') || {}).id;
    check('calendar: Add item saves an appointment, a whole-team event and meeting, a shift, a reminder and where someone was',
      ap.length === 3 && (ap.find((a) => a.title === 'Eye exam') || {}).cid === cid1 && (ap.find((a) => a.title === 'Movie night') || {}).cid === null && (ap.find((a) => a.title === 'Staff huddle') || {}).type === 'Meeting'
      && B.rows('np_demo_shifts').some((s) => s.staff_id === sid && s.shift_date === today) && B.rows('np_demo_tasks').some((t) => t.title === 'Order supplies' && t.due === today)
      && (B.rows('np_demo_whereabouts')[0] || {}).place === 'Library', JSON.stringify(ap.map((a) => [a.title, a.cid, a.type])));
    const lg = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#view .cx-lg')].map((b) => [b.textContent.replace(b.querySelector('b').textContent, '').trim(), b.querySelector('b').textContent])));
    check('calendar: the legend counts each kind shown (Accountability off here)', lg.Appointments === '1' && lg.Events === '1' && lg.Meetings === '1' && lg.Shifts === '1' && +lg.Reminders >= 1 && lg.Accountability === 'off', JSON.stringify(lg));
    check('calendar: the new items each tell Tom (appointment, event, meeting, shift, reminder)', ['New appointment', 'New event', 'New meeting', 'You were scheduled', 'Task assigned to Tom Hale'].every((t) => notes().some((n) => n.title === t && n.for_staff === sid)), JSON.stringify(notes().filter((n) => n.for_staff === sid).map((n) => n.title)));
    // the appointment: note, reschedule, edit details, cancel, restore
    await page.locator('#view .cx-pane .cx-row:has-text("Eye exam") .cx-ti').first().click(); await settle(page, 300);
    await page.fill('#apptNote', 'Needs a ride'); await btn(page, '#drawer', 'Save note').click(); await settle(page, 300);
    await page.fill('#rsDate', day(1)); await page.fill('#rsTime', '15:30'); await btn(page, '#drawer', 'Save new time').click(); await settle(page, 400);
    await btn(page, '#drawer', 'Edit details').click(); await settle(page, 250);
    await page.fill('#eaProv', 'Dr. Vu-Lam'); await page.fill('#eaRide', 'Tom drives'); await page.fill('#eaDur', '60'); await btn(page, '#modal', 'Save changes').click(); await settle(page, 400);
    await btn(page, '#drawer', 'Cancel appointment').click(); await settle(page, 400);
    const cx = B.rows('np_demo_appointments').find((a) => a.id === aid) || {};
    check('calendar: Save new time, Edit details and Cancel appointment are each saved', cx.appt_date === day(1) && cx.appt_time === '15:30' && cx.provider === 'Dr. Vu-Lam' && cx.ride === 'Tom drives' && cx.dur === 60 && cx.cancelled === 1, JSON.stringify(cx));
    await btn(page, '#drawer', 'Restore appointment').click(); await settle(page, 400); await page.evaluate(() => closeAll());
    check('calendar: Restore appointment brings it back', (B.rows('np_demo_appointments').find((a) => a.id === aid) || {}).cancelled === 0);
    // a whole-team event: cancel it; the change log entry
    await page.evaluate((id) => openAppt(id), eid); await settle(page, 300);
    const evHead = await page.evaluate(() => el('drawer').querySelector('.dr-sub, .sub, p') ? '' : '');
    const evSub = await page.evaluate(() => { const h = el('drawer').innerText.split('\n'); return h[1] || ''; });
    check('a whole-team event opens with a heading that does not start with a stray "·" (no client UCI)', !/^\s*·/.test(evSub), evSub + evHead);
    await btn(page, '#drawer', 'Cancel appointment').click(); await settle(page, 400); await page.evaluate(() => closeAll());
    await until(() => B.rows('np_demo_audit_log').some((r) => /Canceled appointment/.test(r.act) && /Movie night/.test(r.obj)));
    const aud = (B.rows('np_demo_audit_log').find((r) => /Canceled appointment/.test(r.act) && /Movie night/.test(r.obj)) || {}).obj || '';
    check('the change log entry for cancelling a whole-team event names the team, not "undefined"', !/undefined/.test(aud), aud);
    // staff see it after a reload, with the note and details
    await reload(sp); await go(sp, 'calendar');
    await sp.evaluate((d) => cxPick('calendar', d), day(1)); await settle(sp, 250);
    const tmr = await sp.evaluate(() => document.querySelector('#view .cx-pane').innerText);
    check('calendar (staff): after a reload Tom sees the rescheduled appointment on its new day', /Eye exam/.test(tmr) && /3:30 PM/.test(tmr), tmr.slice(0, 300));
    await sp.evaluate((id) => openAppt(id), aid); await settle(sp, 300);
    const sdr = await sp.evaluate(() => el('drawer').innerText);
    check('calendar (staff): its details, transport and the director’s note are there', /Dr\. Vu-Lam/.test(sdr) && /Tom drives/.test(sdr) && /Needs a ride/.test(sdr) && /60 minutes/.test(sdr), sdr.slice(0, 400));
    await sp.evaluate(() => closeAll());
    await sp.evaluate(() => cxToday('calendar')); await settle(sp, 250);
    const tp = await sp.evaluate(() => document.querySelector('#view .cx-pane').innerText);
    check('calendar (staff): today shows his shift, the huddle, the canceled movie night and his reminder', /Day shift|Overnight|shift/i.test(tp) && /Staff huddle/.test(tp) && /Movie night/.test(tp) && /Canceled/i.test(tp) && /Order supplies/.test(tp), tp.replace(/\s+/g, ' ').slice(0, 400));
    for (const v of ['Week', 'List']) {
      await sp.click(`#view .cx-seg button:has-text("${v}")`); await settle(sp, 250);
      check(`calendar (staff): ${v} view shows the day’s items`, /Staff huddle/.test(await view(sp)));
    }
    await sp.click('#view .cx-seg button:has-text("Calendar")'); await settle(sp, 200);
    // the director changes the shift from the day plan, then removes it
    await reload(page); await go(page, 'calendar');
    await page.locator('#view .cx-pane .cx-pp:has-text("Tom Hale")').first().click(); await settle(page, 300);
    const shf = await page.evaluate(() => el('mdTitle').textContent);
    await page.fill('#shStart', '00:00'); await page.fill('#shEnd', '22:00'); await btn(page, '#mdFoot', 'Save shift').click(); await settle(page, 600);
    await until(() => B.rows('np_demo_shifts').some((s) => s.end_time === '22:00'));
    check('calendar: clicking Tom on the day plan opens Edit shift, and the change replaces the shift (one row)', shf === 'Edit shift' && B.rows('np_demo_shifts').filter((s) => s.staff_id === sid).length === 1 && B.rows('np_demo_shifts')[0].end_time === '22:00', JSON.stringify(B.rows('np_demo_shifts').map((s) => [s.start_time, s.end_time])));
    await reload(sp); await go(sp, 'home');
    check('home (staff): My shift shows Tom on shift today at Oak House', /Oak House/.test(await view(sp)) && await sp.evaluate(() => shiftsNow().some((x) => x.sid === meSid())));
    // Google Calendar: connect, show, save, follow, refresh, disconnect
    G.events.push({ id: 'ext1', status: 'confirmed', summary: 'Haircut', start: { dateTime: today + 'T11:00:00Z' }, end: { dateTime: today + 'T11:30:00Z' }, htmlLink: 'https://calendar.google.com/x' });
    await go(page, 'calendar');
    const acts = () => page.evaluate(() => [...document.querySelectorAll('#view .page-acts button')].map((b) => b.textContent.trim()).join(' | '));
    check('google: Connect Google Calendar is offered once np-gcal says there is no connection', /Connect Google Calendar/.test(await acts()), await acts());
    await page.locator('#view button:has-text("Connect Google Calendar")').click(); await settle(page, 1200);
    check('google: Connect sends Google’s one-time code to np-gcal and shows Refresh Google and Disconnect', G.calls.includes('connect') && /Refresh Google/.test(await acts()) && /Disconnect/.test(await acts()) && /stays connected/.test(await toastTxt(page)), await acts());
    check('google: the person’s Google events show on the day plan, and the legend counts them', /Haircut/.test(await page.evaluate(() => document.querySelector('#view .cx-pane').innerText)) && await page.evaluate(() => /Google Calendar\s*1/.test(document.querySelector('#view .cx-leg').innerText)));
    await addItem(page, 'appt'); await page.selectOption('#apClient', cid1); await page.fill('#apTitle', 'Podiatry ' + UCI1); await page.fill('#apTime', '13:00'); await page.fill('#apLoc', 'Foot clinic');
    await page.click('#mdFoot .btn.navy'); await settle(page, 900);
    const ins = G.api.find((x) => x.m === 'POST') || {};
    const pod = B.rows('np_demo_appointments').find((a) => /^Podiatry/.test(a.title)) || {};
    check('google: Save appointment with "Also send to Google Calendar" adds it to Google without the UCI, and keeps its Google id', /Podiatry/.test(ins.body) && !ins.body.includes(UCI1) && /Client details stay in the portal/.test(ins.body) && !!pod.gcal_id, ins.body);
    await page.evaluate((id) => openAppt(id), pod.id); await settle(page, 300);
    await page.fill('#rsTime', '16:00'); await btn(page, '#drawer', 'Save new time').click(); await settle(page, 800);
    check('google: Save new time moves the Google event too', G.api.some((x) => x.m === 'PATCH' && x.url.endsWith(pod.gcal_id) && /T16:00/.test(x.body)) && /Google Calendar updated too/.test(await toastTxt(page)));
    await btn(page, '#drawer', 'Cancel appointment').click(); await settle(page, 800);
    check('google: Cancel appointment removes the Google event', G.api.some((x) => x.m === 'DELETE' && x.url.endsWith(pod.gcal_id)));
    await page.evaluate(() => closeAll());
    const nGet = G.api.filter((x) => x.m === 'GET').length;
    await page.locator('#view button:has-text("Refresh Google")').click(); await settle(page, 800);
    check('google: Refresh Google reads the calendar again', G.api.filter((x) => x.m === 'GET').length === nGet + 1 && /Google Calendar event/.test(await toastTxt(page)), await toastTxt(page));
    await reload(page); await go(page, 'calendar'); await settle(page, 600);
    check('google: after a reload it is still connected (np-gcal hands a fresh token)', /Disconnect/.test(await acts()), await acts());
    await page.locator('#view button:has-text("Disconnect")').click(); await settle(page, 700);
    check('google: Disconnect asks np-gcal to disconnect everywhere and Connect comes back', G.calls.includes('disconnect') && /Connect Google Calendar/.test(await acts()) && /every device/.test(await toastTxt(page)));
  }

  // ================= 3. Clients and the client page =================
  {
    // Tom, on the client's Overview
    await reload(sp); await openClient(sp, UCI1);
    await sp.locator('#view [data-rowlist^="weekly"] .cb').first().click(); await settle(sp, 400);
    await sp.fill('#wkNew', 'Water the plants'); await sp.press('#wkNew', 'Enter'); await settle(sp, 300);
    await sp.fill('#cnNew', 'Ask @Dee about the cabinet key'); await sp.press('#cnNew', 'Enter'); await settle(sp, 400);
    await btn(sp, '#view', 'Add a note').click(); await settle(sp, 250); await sp.fill('#supAdd', 'Likes a quiet room'); await btn(sp, '#modal', 'Add').click(); await settle(sp, 300);
    await btn(sp, '#view', 'Add goal').click(); await settle(sp, 250); await sp.fill('#glG', 'Cook a simple meal'); await sp.fill('#glNote', 'Made toast'); await btn(sp, '#modal', 'Add goal').click(); await settle(sp, 300);
    await btn(sp, '#view', 'Open goal & notes').click(); await settle(sp, 250); await sp.fill('#glNote', 'Made pasta with prompts'); await btn(sp, '#modal', 'Save changes').click(); await settle(sp, 300);
    await btn(sp, '#view', 'Write note').click(); await settle(sp, 250); await sp.fill('#pnNew', 'Calm afternoon, ate well.'); await sp.selectOption('#pnCat', 'Diet'); await btn(sp, '#modal', 'Save note').click(); await settle(sp, 400);
    await until(() => B.rows('np_demo_client_notes').length === 1 && B.rows('np_demo_checklist_logs').length === 1);
    check('client (staff): a weekly tick, an internal note, the support profile, a goal with two notes and a progress note are saved',
      (B.rows('np_demo_checklist_logs')[0] || {}).signed_by === STF.name && /cabinet key/.test((B.rows('np_demo_client_notes')[0] || {}).note) && (B.rows('np_demo_clients').find((c) => c.id === cid1) || {}).support === 'Likes a quiet room'
      && JSON.stringify(B.prog(org, 'goals') || {}).includes('Made pasta with prompts') && JSON.stringify(B.prog(org, 'prognotes') || {}).includes('Calm afternoon') && JSON.stringify(B.prog(org, 'weekly') || {}).includes('Water the plants'));
    check('client: a progress note tells the director', notes().some((n) => n.title === 'New progress note' && n.for_staff === '@director'));
    check('"@Dee" in an internal note notifies the director, a teammate (only staff records can be mentioned; the note says nothing about it)', notes().some((n) => /mention/i.test(n.title) && n.for_staff !== sid), JSON.stringify(notes().filter((n) => /mention/i.test(n.title))));
    // Care: vitals and an activity
    await openClient(sp, UCI1, 'Care');
    await btn(sp, '#view', 'Record vitals').click(); await settle(sp, 250); await sp.fill('#vt_bp', '118/76'); await sp.fill('#vt_hr', '70'); await btn(sp, '#mdFoot', 'Record').click(); await settle(sp, 400);
    await btn(sp, '#view', 'Log an activity').click(); await settle(sp, 250); await sp.selectOption('#adK', 'Fluids'); await sp.selectOption('#adA', 'Prompting'); await btn(sp, '#mdFoot', 'Log it').click(); await settle(sp, 400);
    await until(() => B.rows('np_demo_vitals').length === 1 && B.rows('np_demo_adls').length === 1);
    check('client (staff): Record vitals and Log an activity are saved for the day', (B.rows('np_demo_vitals')[0] || {}).bp === '118/76' && (B.rows('np_demo_adls')[0] || {}).kind === 'Fluids' && (B.rows('np_demo_adls')[0] || {}).assist === 'Prompting');
    // the director reads it all after a reload, reviews the note, mentions Tom, removes a checklist item
    await reload(page); await openClient(page, UCI1);
    const ov = await view(page);
    check('client: after a reload the director sees the tick, the item, the note, the support profile, the goal and the progress note',
      /Clean room\s*\n?\s*Tom Hale/.test(ov) && /Water the plants/.test(ov) && /cabinet key/.test(ov) && /Likes a quiet room/.test(ov) && /Made pasta with prompts/.test(ov) && /Calm afternoon/.test(ov), ov.slice(0, 200));
    await page.locator('#view .lrow:has-text("Calm afternoon")').click(); await settle(page, 250);
    await btn(page, '#view', 'Mark reviewed').click(); await settle(page, 300);
    check('client: the director marks the progress note reviewed, saved', /"rev":true/.test(JSON.stringify((B.prog(org, 'prognotes') || {}).map || {})) && /Reviewed/.test(await view(page)));
    await page.fill('#cnNew', 'Thanks @Tom, key is in the office'); await page.press('#cnNew', 'Enter'); await settle(page, 400);
    check('client: "@Tom" in the director’s internal note notifies Tom', notes().some((n) => n.title === 'You were mentioned' && n.for_staff === sid));
    await page.evaluate(() => pageEdit()); await settle(page, 300);
    await page.locator('#view [data-rowlist^="weekly"] .checkrow:has-text("Water the plants") button:has-text("✕")').first().click(); await settle(page, 250);
    await page.locator('#mdFoot .btn.danger').click(); await settle(page, 300);
    await page.locator('#view .card:has(h2:text-is("Profile")) button:has-text("Edit")').first().click(); await settle(page, 300);
    await page.fill('#ecGuard', 'Sister on file'); await page.fill('#ecAlerts', 'Allergy: latex, Fall risk'); await btn(page, '#modal', 'Save changes').click(); await settle(page, 400);
    await page.evaluate(() => pageEdit()); await settle(page, 200);
    const cr = B.rows('np_demo_clients').find((c) => c.id === cid1) || {};
    check('client: the director removes a checklist item and edits the profile (guardian, standing alerts), saved', !JSON.stringify((B.prog(org, 'weekly') || {}).map[cid1] || []).includes('Water the plants') && cr.guardian === 'Sister on file' && JSON.stringify(cr.alerts) === '["Allergy: latex","Fall risk"]', JSON.stringify(cr));
    // the client's own tabs
    await page.locator('#view .tabs button:has-text("Appointments")').click(); await settle(page, 300);
    check('client > Appointments: lists the client’s appointment', /Eye exam/.test(await view(page)));
    await btn(page, '#view', 'Add appointment').click(); await settle(page, 300);
    check('client > Appointments > Add appointment starts with this client picked', await page.evaluate((c) => el('apClient').value === c, cid1));
    await page.evaluate(() => closeAll());
    await page.locator('#view .tabs button:has-text("Files")').click(); await settle(page, 300);
    await btn(page, '#view', 'Add contact').click(); await settle(page, 250); await page.fill('#cdN', 'Dr. Chen'); await page.fill('#cdR', 'Primary care'); await btn(page, '#modal', 'Save').click(); await settle(page, 300);
    check('client > Files: the providers and contacts card saves a contact', JSON.stringify(B.prog(org, 'clientdir') || {}).includes('Dr. Chen'));
    await reload(sp); await openClient(sp, UCI1);
    const st = await view(sp);
    check('client (staff): after a reload Tom sees the standing alerts bar, the new guardian and the director’s note', /Standing alerts\s*\n?\s*Allergy: latex · Fall risk/.test(st) && /Sister on file/.test(st) && /key is in the office/.test(st), st.slice(0, 400));
    await openClient(sp, UCI1, 'Care');
    check('client (staff): Care keeps the vitals and the activity after a reload', /118\/76/.test(await view(sp)) && /Fluids/.test(await view(sp)));
    // limit Tom to the other client
    await go(page, 'team'); await page.locator('#view tr.click:has-text("Tom Hale")').click(); await settle(page, 300);
    await btn(page, '#view', 'Client access').click(); await settle(page, 250);
    await page.check('input[name=acMode][value=some]'); await page.uncheck(`.acC[value="${cid1}"]`); await btn(page, '#modal', 'Save access').click(); await settle(page, 400);
    await reload(sp); await go(sp, 'clients');
    const limited = await sp.evaluate((u) => ({ list: visibleClients().map((c) => c.uci), cal: APPTS.filter((a) => a.cid).some((a) => cxAppts('calendar').includes(a) && client(a.cid).uci === u) }), UCI1);
    check('client access: "Only these clients" limits Tom to the other client, and his calendar drops the first client’s appointment', JSON.stringify(limited.list) === JSON.stringify([UCI2]) && !limited.cal, JSON.stringify(limited));
    await btn(page, '#view', 'Client access').click(); await settle(page, 250); await page.check('input[name=acMode][value=all]'); await btn(page, '#modal', 'Save access').click(); await settle(page, 300);
  }

  // ================= 4. Staff page, Training & onboarding =================
  {
    await go(page, 'team'); await page.locator('#view tr.click:has-text("Tom Hale")').click(); await settle(page, 300);
    for (const [n, e] of [['CPR', day(20)], ['First aid', day(-3)], ['Food handler', '']]) {
      await btn(page, '#view', 'Add credential').click(); await settle(page, 200); await page.fill('#crName', n); if (e) await page.fill('#crExp', e); await btn(page, '#modal', 'Save').click(); await settle(page, 300);
    }
    const cv = await page.evaluate(() => [...document.querySelectorAll('#sfCerts tr')].map((r) => r.innerText.replace(/\s+/g, ' ') + '|' + (r.querySelector('.pill') || {}).className));
    check('staff page: credentials save with their state: 20 days out (warn), expired (bad), no date (on file)', /CPR.*20 days.*warn/.test(cv[0]) && /First aid.*Expired.*bad/.test(cv[1]) && /Food handler.*On file.*ok/.test(cv[2]), JSON.stringify(cv));
    await page.evaluate(() => pageEdit(true)); await settle(page, 250);   // the ✕ shows in edit mode (Editing tool > Edit this page)
    await page.locator('#sfCerts tr:has-text("Food handler") button[title="Remove credential"]').click(); await settle(page, 200); await page.locator('#mdFoot .btn.danger').click(); await settle(page, 400);
    await page.evaluate(() => pageEdit(false)); await settle(page, 200);
    await until(() => !B.rows('np_demo_credentials').some((c) => c.cred_name === 'Food handler'));
    check('staff page: ✕ removes that credential only', B.rows('np_demo_credentials').length === 2);
    const spv = await view(page);
    check('staff page: the shift and the onboarding checklist show on Tom’s page', /Shifts this week\s*\n?\s*1/.test(spv) && /Onboarding checklist/.test(spv), spv.slice(0, 200));
    await btn(page, '#view', 'Send reminder').click(); await settle(page, 250); await btn(page, '#modal', 'Send reminder').click(); await settle(page, 300);
    check('staff page: Send reminder sends Tom a notice about the certification', notes().some((n) => /Reminder: Certification renewal/.test(n.title) && n.for_staff === sid));
    // training hub: a course assigned, a guide acknowledged, checklists shared
    await go(page, 'trainhub'); await btn(page, '#view', 'Add training').click(); await settle(page, 250); await page.fill('#trName', 'Fire safety basics'); await page.locator('#mdFoot .btn.navy').click(); await settle(page, 300);
    await go(page, 'team'); await page.locator('#view tr.click:has-text("Tom Hale")').click(); await settle(page, 300);
    await btn(page, '#view', 'Assign a course').click(); await settle(page, 250);
    const promise = await page.evaluate(() => el('mdBody').innerText);
    await page.locator('#mdBody input[data-course]').first().check(); await page.locator('#mdFoot .btn.navy').click(); await settle(page, 400);
    check('training: Assign a course puts the course on Tom’s list and tells him', notes().some((n) => n.title === 'New training assigned' && n.for_staff === sid));
    check('Assign a course does what its window says: "It lands on their task list, due in two weeks" (no task is made and no due date set)', B.rows('np_demo_tasks').some((t) => t.title === 'Fire safety basics') || !/task list/.test(promise), promise.slice(0, 120));
    await go(page, 'trainhub'); await btn(page, '#view', 'Add guide').click(); await settle(page, 250); await page.fill('#gdT', 'Evacuation plan'); await page.fill('#gdR', 'Read the plan by the door'); await page.locator('#mdFoot .btn.navy').click(); await settle(page, 300);
    await btn(page, '#view', 'Create new checklist').click(); await settle(page, 250); await page.fill('#olName', 'Night shift onboarding'); await btn(page, '#modal', 'Create checklist').click(); await settle(page, 300);
    for (const s of ['Tour the house at night', 'Learn the alarm panel']) { await btn(page, '#view', 'Add step').click(); await settle(page, 200); await page.fill('#osT', s); await btn(page, '#modal', 'Save').click(); await settle(page, 250); }
    check('training: a new checklist with two steps is saved for the team', /Learn the alarm panel/.test(JSON.stringify(B.prog(org, 'oblists') || {})));
    // Tom: the course, the guide, a tick on the onboarding he already has
    await reload(sp); await go(sp, 'home');
    const sh = await view(sp);
    await until(() => notes().some((n) => /Certification expired/.test(n.title)), 3000);
    check('staff page: expiring and expired credentials notify Tom and the director (on the next page load)', notes().some((n) => /Certification due in 20 days/.test(n.title) && n.for_staff === sid) && notes().some((n) => /Certification expired/.test(n.title) && n.for_staff === '@director'), JSON.stringify(notes().filter((n) => n.kind === 'cert').map((n) => n.title)));
    check('My shift: Tom sees the course and the guide to acknowledge', /Fire safety basics/.test(sh) && /Evacuation plan/.test(sh), sh.slice(0, 200));
    await sp.locator('#view button:has-text("Acknowledge")').first().click(); await settle(sp, 400);
    await until(() => JSON.stringify(B.prog(org, 'guides') || {}).includes('"ack":["' + sid + '"]'));
    check('My shift: Acknowledge saves Tom’s sign-off on the guide', JSON.stringify(B.prog(org, 'guides') || {}).includes('"ack":["' + sid + '"]'));
    check('a staff member acknowledging a guide tells the director ("Guide acknowledged" is on for directors by default; only a director recording it for them sends it)', notes().some((n) => n.kind === 'guideack'), JSON.stringify(notes().slice(-2).map((n) => n.title)));
    await sp.locator('#view .card:has-text("Training to finish") button:has-text("Mark complete")').first().click(); await settle(sp, 400);
    check('My shift: Mark complete on the course is saved', await until(() => /"done":\[[^\]]*"/.test(JSON.stringify(((B.prog(org, 'training') || {}).courses || []).find((c) => c.n === 'Fire safety basics') || {}))));
    await go(sp, 'profile'); await sp.locator('#view .tabs button:has-text("Onboarding")').click(); await settle(sp, 300);
    await sp.locator('#view .checkrow').first().click(); await settle(sp, 400);
    await until(() => ((((B.prog(org, 'onboard') || {}).assign || {})[sid] || [])[0] || {}).d === 1);
    const before = (((B.prog(org, 'onboard') || {}).assign || {})[sid] || []).map((x) => x.t + (x.d ? '✓' : ''));
    // the director shares the night-shift checklist too
    await reload(page); await go(page, 'trainhub'); await page.locator('#view .lrow:has-text("Night shift onboarding")').click(); await settle(page, 300);
    await btn(page, '#view', 'Share with a new hire').click(); await settle(page, 250); await page.selectOption('#obWho', sid); await btn(page, '#modal', 'Share checklist').click(); await settle(page, 400);
    const after = (((B.prog(org, 'onboard') || {}).assign || {})[sid] || []).map((x) => x.t + (x.d ? '✓' : ''));
    check('training: Share with a new hire gives Tom the night-shift steps', after.includes('Tour the house at night') && after.includes('Learn the alarm panel'), JSON.stringify(after));
    check('sharing a second checklist keeps the one Tom already has, and his ticks (it replaces it: ' + before.length + ' steps, 1 ticked, gone)', before.every((t) => after.includes(t)), JSON.stringify({ before, after }));
    check('notices about one person’s onboarding or training go to that person and the directors, not to every staff member', !notes().some((n) => n.for_staff == null && /Tom Hale/.test(n.body || '')), JSON.stringify(notes().filter((n) => n.for_staff == null).map((n) => n.title + ': ' + n.body)));
    await reload(sp); await go(sp, 'profile'); await sp.locator('#view .tabs button:has-text("Onboarding")').click(); await settle(sp, 300);
    await sp.locator('#view .checkrow:has-text("Learn the alarm panel")').click(); await settle(sp, 400);
    await reload(page); await page.evaluate((s) => openStaffPage(s), sid); await settle(page, 300);
    const ob = await page.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((x) => /Onboarding checklist/.test(x.innerText)); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
    check('training: the director sees Tom’s progress on his staff page after a reload (both checklists, 2 ticked)', /2 of 5/.test(ob) && /Learn the alarm panel · Tom Hale/.test(ob), ob.slice(0, 200));
  }

  // ================= 5. Safety log =================
  {
    // Tom reports an incident from My shift, ticking who has been told
    await reload(sp); await go(sp, 'home');
    await sp.locator('#view button:has-text("Report an incident")').first().click(); await settle(sp, 400);
    const types0 = await sp.evaluate(() => [...el('icType').options].map((o) => o.value).filter((v) => v && v !== '__add__'));
    await addOption(sp, '#icType', 'Fall'); await settle(sp, 200);
    const proto = await sp.evaluate(() => el('icProto').innerText);
    check('a new team’s own "Fall" type does not tell staff to call the sample data’s people (A. Osei · ext. 214, N. Harding · ext. 118)', !/Osei|Harding|ext\. \d/.test(proto), proto.replace(/\s+/g, ' ').slice(0, 200));
    await sp.selectOption('#icClient', cid1); await sp.selectOption('#icSev', 'Moderate'); await descField(sp, 'Slipped near the stairs, no injury.');
    await sp.locator('#modal button:has-text("Guardian")').click(); await sp.locator('#modal button:has-text("Director")').click();
    await btn(sp, '#modal', 'File report').click(); await settle(sp, 900); await sp.evaluate(() => closeAll());
    await until(() => B.rows('np_demo_incidents').length === 1);
    const inc = B.rows('np_demo_incidents')[0] || {};
    check('safety (staff): the new team starts with no incident types; the report is saved as Tom’s with a 24-hour clock', types0.length === 0 && inc.type === 'Fall' && inc.cid === cid1 && inc.reported_by === 'T.H.' && inc.hours_left === 24 && inc.status === 'Follow-up due', JSON.stringify(inc));
    check('"Who has been told" is saved with the report (Guardian and Director were ticked; it saves ["Shift lead"] whatever is ticked)', /Guardian/.test(JSON.stringify(inc.notified)) && /Director/.test(JSON.stringify(inc.notified)), JSON.stringify(inc.notified));
    const ev = (B.relay.find((r) => r.action === 'incident') || {}).payload || {};
    check('safety: the incident notice leaves without the client’s ID or the story', ev.type === 'Fall' && !JSON.stringify(ev).includes(UCI1) && !/Slipped/.test(JSON.stringify(ev)), JSON.stringify(ev));
    check('safety: everyone is told the SIR clock started', notes().some((n) => n.kind === 'sir' && n.for_staff == null));
    // the director files one from two days ago
    await reload(page); await openClient(page, UCI2); await btn(page, '#view', 'Report incident').click(); await settle(page, 400);
    await page.selectOption('#icType', 'Fall'); await page.fill('#icDate', day(-2)); await page.fill('#icTime', '08:00'); await descField(page, 'Found on the floor at 8am.');
    await btn(page, '#modal', 'File report').click(); await settle(page, 900); await page.evaluate(() => closeAll());
    await until(() => B.rows('np_demo_incidents').length === 2);
    const old = B.rows('np_demo_incidents').find((i) => i.inc_date === day(-2)) || {};
    const badge = () => page.evaluate(() => (document.querySelector('.nav-item[onclick="go(\'safety\')"] .badge') || {}).innerText || '0');
    check('safety: the sidebar counts two open incidents', await badge() === '2', await badge());
    await page.evaluate((id) => openIncident(id), inc.id); await settle(page, 300);
    const d1 = await page.evaluate(() => el('drawer').innerText);
    const exp1 = Math.ceil((new Date(inc.inc_date + 'T' + inc.inc_time).getTime() + 24 * 3600e3 - Date.now()) / 3600e3);
    check('safety: the SIR clock on today’s report counts down from 24 hours', new RegExp(exp1 + ' hours? left on the written report').test(d1), (d1.match(/.*written report.*/) || [''])[0] + ' expected ' + exp1);
    await page.evaluate((id) => openIncident(id), old.id); await settle(page, 300);
    const d2 = await page.evaluate(() => el('drawer').innerText);
    const exp2 = Math.floor((Date.now() - new Date(day(-2) + 'T08:00').getTime() - 24 * 3600e3) / 3600e3);
    check('safety: a report filed for two days ago says the written report is overdue by the right number of hours', new RegExp('overdue by ' + exp2 + ' hours').test(d2), (d2.match(/.*overdue.*/) || ['none'])[0] + ' expected ' + exp2);
    for (let k = 0; k < 3; k++) { await page.locator('#drawer button:has-text("Mark notified")').first().click(); await settle(page, 250); }
    await page.fill('#incFu', 'Guardian called back.'); await btn(page, '#drawer', 'Save note').click(); await settle(page, 300);
    const d3 = await page.evaluate(() => el('drawer').innerText);
    check('safety: Mark notified on all three stops the clock and records who and when; a follow-up note is kept', !/hours? left|overdue by/.test(d3) && (d3.match(/Just now by D\.M\./g) || []).length === 3 && /Guardian called back/.test(d3));
    await btn(page, '#drawer', 'Close report').click(); await settle(page, 400);
    await until(() => (B.rows('np_demo_incidents').find((i) => i.id === old.id) || {}).status === 'Closed');
    check('safety: Close report saves it closed, and the sidebar count drops to one', (B.rows('np_demo_incidents').find((i) => i.id === old.id) || {}).hours_left === null && await badge() === '1', await badge());
    await page.locator('#view .tabs button:has-text("Incidents")').click(); await settle(page, 300);
    check('client > Incidents lists the closed report', /Fall[\s\S]*Closed/.test(await view(page)));
    // a fire drill and water temperatures
    await go(page, 'safety');
    check('safety: "No drill logged this month" shows before any drill', /No drill logged this month/.test(await view(page)));
    await btn(page, '#view', 'Log a drill').click(); await settle(page, 500);
    const drillLines = await page.evaluate(() => el('inspFull').innerText);
    await page.locator('#inspFull select').first().selectOption('Oak House');
    await page.locator('#inspFull input[type="time"]').first().fill('10:00');
    await page.locator('#inspFull input[type="number"]').first().fill('3');
    await page.locator('#inspFull button:has-text("Yes")').first().click(); await settle(page, 200);
    await page.locator('#inspFull button:has-text("Complete")').first().click(); await settle(page, 800);
    await until(() => B.rows('np_demo_fire_drills').length === 1);
    check('safety: Log a drill (home, shift, time, evacuation, all accounted for) files the drill and clears the warning', (B.rows('np_demo_fire_drills')[0] || {}).home === 'Oak House' && !/No drill logged this month/.test(await view(page)) && /Evacuation/i.test(drillLines), JSON.stringify(B.rows('np_demo_fire_drills')[0]));
    const temp = async (vals) => {
      await btn(page, '#view', 'Add reading').click(); await settle(page, 500);
      await page.locator('#inspFull select').first().selectOption('Oak House');
      const n = page.locator('#inspFull input[type="number"]');
      for (let i = 0; i < vals.length; i++) await n.nth(i).fill(String(vals[i]));
      await page.locator('#inspFull button:has-text("Complete")').first().click(); await settle(page, 800);
    };
    let f0 = F.errs.length;
    await temp([118, 124, 117, 38, -2]);
    await until(() => B.rows('np_demo_water_temps').length === 1);
    const wt = await view(page);
    check('safety: a water temperature reading over 120°F is saved and shows red ("Over 120°F")', (B.rows('np_demo_water_temps')[0] || {}).temp === 124 && /124°F[\s\S]{0,40}Over 120°F/.test(wt) && !errsFor('np_demo_water_temps', f0).length);
    f0 = F.errs.length;
    await temp([118.5, 117, 116.5, 38, -2]);
    await until(() => B.rows('np_demo_water_temps').length === 2 || errsFor('np_demo_water_temps', f0).length, 4000);
    check('a reading with a decimal (118.5°F) saves; the reading goes into a whole-number column and the database refuses it', B.rows('np_demo_water_temps').length === 2 && !errsFor('np_demo_water_temps', f0).length, JSON.stringify(errsFor('np_demo_water_temps', f0)));
    await page.evaluate(() => { SB_FAILS = []; });
    // a log of the team's own
    await btn(page, '#view', 'New log or inspection').click(); await settle(page, 300);
    await page.fill('#itName', 'Night walk-through'); await page.fill('#itPerWeek', '3');
    await page.locator('#itQs input.inp').first().fill('Doors locked');
    await btn(page, '#formFull', 'Create form').click(); await settle(page, 400);
    const sv = await view(page);
    check('safety: New log or inspection with 3 a week shows in Digital inspections and under Weekly logs (0 / 3)', /Night walk-through/.test(sv) && /0 of 3 this week/.test(sv), sv.slice(0, 200));
    await page.locator('#view .docrow:has-text("Night walk-through") button:has-text("Run now")').click(); await settle(page, 400);
    await page.locator('#inspFull .chip, #inspFull button').filter({ hasText: /^(Yes|Pass|✓|Compliant)$/ }).first().click().catch(() => {});
    await page.locator('#inspFull button:has-text("Complete")').first().click(); await settle(page, 700);
    await reload(page); await go(page, 'safety');
    const sv2 = await view(page);
    check('safety: after a reload the team’s log, its completed run, the drill and the readings are all still there', /Night walk-through — /.test(sv2) && /1\/1 · 100%/.test(sv2) && /124°F/.test(sv2) && !/No drill logged this month/.test(sv2), sv2.slice(0, 300));
    const wk = (sv2.match(/Night walk-through\s*\n\s*(\d+ of 3 this week)/) || [])[1] || '', wkT = (sv2.match(/Water temperature log\s*\n\s*(\d+ of 7 this week)/) || [])[1] || '';
    check('after a reload, Weekly logs still counts this week’s runs (Night walk-through 1 of 3, water temperatures 2 of 7); completed runs come back without their date, so every weekly count, and This week’s inspection lines, drop to 0', wk === '1 of 3 this week' && wkT === '2 of 7 this week', JSON.stringify([wk, wkT]));
  }

  // ================= 6. Accountability =================
  {
    await reload(sp); await go(sp, 'acct');
    const p0 = await sp.evaluate(() => document.querySelector('#view .cx-pane').innerText);
    check('accountability (staff): the day says who has no entry yet (the first client; the library visit is there)', /No entry yet for 1 person/.test(p0) && p0.includes(UCI1) && /Library/.test(p0), p0.replace(/\s+/g, ' ').slice(0, 300));
    await btn(sp, '#view .cx-pane', 'Log where someone was').click(); await settle(sp, 300);
    await sp.selectOption('#acC', cid1); await sp.fill('#acP', 'Day program'); await sp.fill('#acW', 'Tom Hale'); await sp.fill('#acS', '09:00'); await sp.fill('#acE', '14:00'); await sp.fill('#acR', 'Program day');
    await btn(sp, '#mdFoot', 'Log it').click(); await settle(sp, 400);
    await until(() => B.rows('np_demo_whereabouts').length === 2);
    check('accountability (staff): Log it saves the entry and everyone has an entry now', /Everyone has an entry for this day/.test(await sp.evaluate(() => document.querySelector('#view .cx-pane').innerText)));
    await sp.locator('#view .cx-pane .cx-row:has-text("Library") .cx-ti').click(); await settle(sp, 300);
    await sp.fill('#acP', 'Public library'); await btn(sp, '#mdFoot', 'Save changes').click(); await settle(sp, 500);
    await until(() => B.rows('np_demo_whereabouts').some((w) => w.place === 'Public library'));
    check('accountability: an edit replaces the entry (no second copy)', B.rows('np_demo_whereabouts').length === 2 && !B.rows('np_demo_whereabouts').some((w) => w.place === 'Library'), JSON.stringify(B.rows('np_demo_whereabouts').map((w) => w.place)));
    await sp.locator('#view .cx-pane .cx-row:has-text("Day program") .cx-ti').click(); await settle(sp, 300);
    await btn(sp, '#mdFoot', 'Delete').click(); await settle(sp, 250); await sp.locator('#mdFoot .btn.danger').click(); await settle(sp, 400);
    await until(() => B.rows('np_demo_whereabouts').length === 1);
    await reload(page); await go(page, 'acct');
    const p1 = await page.evaluate(() => document.querySelector('#view .cx-pane').innerText);
    check('accountability: after a reload the director sees the edited entry, not the deleted one, and the first client missing again', /Public library/.test(p1) && !/Day program/.test(p1) && /No entry yet for 1 person/.test(p1), p1.replace(/\s+/g, ' ').slice(0, 300));
  }

  // ================= 7. Home, signed in: the numbers agree with the pages =================
  {
    await go(page, 'home');
    const tiles = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#view .hm-tile')].map((t) => { const l = t.querySelector('.hm-tile-h span:last-child'); return [l ? l.textContent.trim() : '', (t.innerText.match(/\n\s*(\d+)/) || [])[1]]; })));
    const truth = await page.evaluate(() => ({ tasks: myTasks().filter((t) => t.stage !== 'Done').length, inc: visIncidents().filter((i) => i.status !== 'Closed').length, appts: cxAppts('home').filter((a) => a.date === T && !a.cancelled).length }));
    check('home: Open tasks and Open incidents tiles agree with Tasks and the Safety log', +tiles['Open tasks'] === truth.tasks && +tiles['Open incidents'] === truth.inc, JSON.stringify({ tiles, truth }));
    const sb = await page.evaluate(() => { const s = el('brandName') ? '' : ''; return (document.querySelector('.nav-item[onclick="go(\'tasks\')"] .badge') || {}).innerText; });
    check('home: the Tasks badge agrees with the open tasks', +sb === truth.tasks, sb + ' vs ' + truth.tasks);
  }

  // ================= 8. Delete a client, with everything filed under them =================
  {
    const f0 = F.errs.length;
    await openClient(page, UCI1); await btn(page, '#view', 'Delete client').click(); await settle(page, 250); await page.locator('#mdFoot .btn.danger').click(); await settle(page, 900);
    await until(() => !B.rows('np_demo_clients').some((c) => c.id === cid1));
    check('clients: Delete client removes the client after everything filed under them (the database refuses it otherwise)', !B.rows('np_demo_clients').some((c) => c.id === cid1) && !errsFor('np_demo_clients', f0).length && !B.rows('np_demo_appointments').some((a) => a.cid === cid1));
    const left = ['weekly', 'goals', 'prognotes', 'clientdir'].filter((k) => JSON.stringify(((B.prog(org, k) || {}).map) || {}).includes(cid1));
    check('a deleted client’s progress notes, goals, checklist and contacts leave the team’s saved settings too ("Everything on their file goes with them")', !left.length, 'still saved under ' + left.join(', '));
    await reload(sp);
    check('clients (staff): after a reload the deleted client is gone for Tom', !(await sp.evaluate(() => visibleClients().map((c) => c.uci))).includes(UCI1));
  }

  // ================= 9. what the real database would have refused, and sample records in the team's rows =================
  {
    const cols = await page.evaluate(() => JSON.stringify(COL_UNSUPPORTED)) + await sp.evaluate(() => JSON.stringify(COL_UNSUPPORTED));
    check('every column the pages wrote exists in the real tables (none dropped)', cols === '{}{}', cols);
    const other = F.errs.filter((e) => !(e.t === 'np_demo_tasks' && /""/.test(e.msg)) && !(e.t === 'np_demo_water_temps' && /118\.5/.test(e.msg)));
    check('no other save would have been refused by the real database', !other.length, JSON.stringify(other));
    const sample = ['weekly', 'goals', 'prognotes', 'apptextras', 'guides', 'training'].filter((k) => /"(c[1-6]|s[1-6]|a\d{1,2})"/.test(JSON.stringify(B.prog(org, k) || {})));
    check('the built-in sample records are not written into a real team’s saved settings (sample clients’ notes, goals and checklists, sample staff’s acknowledgements)', !sample.length, 'sample ids in: ' + sample.join(', '));
  }
  await S.ctx.close(); await D.ctx.close();

  // ================= 10. the family pages (demo view: no family sign-ins in this pilot) =================
  {
    const { ctx, page: fp } = await H.newPage(env, { bucket: errors });
    await fp.clock.setFixedTime(new Date(2026, 9, 22, 10, 0, 0));
    await fp.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await fp.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    await fp.evaluate(() => signIn('family')); await fp.waitForTimeout(400);
    const fam = await fp.evaluate(() => ({ nav: [...document.querySelectorAll('.nav-item')].filter((b) => b.offsetParent).map((b) => b.innerText.replace(/\s+/g, ' ').trim().replace(/\s*\d+$/, '')), clients: visibleClients().map((c) => c.uci) }));
    check('family: the menu is Overview, Appointments, Documents, Messages, for one client', JSON.stringify(fam.nav.map((x) => x.replace(/^▤\s*/, ''))) === JSON.stringify(['Overview', 'Appointments', 'Documents', 'Messages']) && fam.clients.length === 1, JSON.stringify(fam));
    const ovw = await fp.evaluate(() => el('view').innerText);
    check('family: Overview is about their client only, with nothing staff-only on it', ovw.includes(fam.clients[0]) && !/Internal notes|Open tasks|Who's working|Staff roster/.test(ovw), ovw.slice(0, 200));
    await fp.evaluate(() => { closeAll(); go('calendar'); }); await fp.waitForTimeout(300);
    check('family: Appointments has no Add item, and no shifts, reminders or whole-team items', await fp.evaluate(() => !document.querySelector('#view .cx-add-b') && !cxDayItems('calendar', T).some((i) => ['shift', 'rem', 'where'].includes(i.k) || /Whole team/.test(i.lines.join(' ')))));
    const ab = await fp.evaluate(() => { const a = cxDayItems('calendar', T).find((i) => i.k === 'appt'); return a ? a.go : ''; });
    await fp.evaluate((g) => eval(g), ab); await fp.waitForTimeout(250);
    check('family: an appointment opens read-only (no Reschedule, Cancel, Edit details or notes box)', await fp.evaluate(() => el('drawer').classList.contains('on') && !el('rsDate') && !/Cancel appointment|Edit details/.test(el('drawer').innerText) && !el('apptNote')));
    await fp.evaluate(() => closeAll());
    // search, as a family member would use it
    await fp.locator('#globalSearch').fill(fam.clients[0].slice(0, 4)); await fp.waitForTimeout(700);
    const res = await fp.evaluate(() => el('drawer').classList.contains('on') ? el('drawer').innerText : '');
    if (/Clients/.test(res)) { await fp.locator('#drawer .attn').first().click(); await fp.waitForTimeout(400); }
    const leak = await fp.evaluate(() => ({ view: state.view, text: el('view').innerText }));
    check('a family member’s search does not open the client’s staff record (it opens the client page: internal "Staff-only" notes, progress notes, the weekly checklist, incidents, Care)', !(leak.view === 'clients' && /Internal notes|Progress notes/.test(leak.text)), leak.view + ': ' + (leak.text.match(/Internal notes[^\n]*\n[^\n]*/) || [''])[0]);
    await ctx.close();
  }

  check('no page errors', !errors.filter((e) => !/ResizeObserver/.test(e)).length, errors.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
