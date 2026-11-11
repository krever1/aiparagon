// Care portal v12.44: more than one Google account, views and calendar filters by account. Signed in to a stub team
// whose np-gcal keeps two Google accounts for Dana (a personal one and a work one, then a third added from the page);
// np-gcal and Google are answered by the suite, each Google account with its own token and its own calendar. Checks:
// both accounts' events on the home page and the Calendar page, the view bar (All, Portal, each account), the chips
// grouped by account (a group hidden or shown at once), account names and colours (never an address saved in the
// team's settings row), where portal appointments go (the main account, changeable, and an older copy still updated
// in the account it went to), a calendar added by ID found in the account that owns it, connecting another account,
// disconnecting one, renewing each account's token, an account Google ended, a choice made before accounts had ids,
// a server that keeps one account only, and a phone's width. See tests/README.md.
// Usage: node tests/portal-accounts.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const NOW = new Date(2026, 10, 9, 9, 0, 0);                            // Mon Nov 9 2026, 9:00 on the page's clock
const at = (d, h, m) => new Date(2026, 10, d, h, m || 0).toISOString();
const VAN = 'team-van@group.calendar.google.com', NOBODY = 'nobody@group.calendar.google.com';
const A1 = { id: 'a1111111111111111', email: 'dana@gmail.test', tok: 'tokA' };
const A2 = { id: 'a2222222222222222', email: 'dana@work.test', tok: 'tokB' };
const A3 = { id: 'a3333333333333333', email: 'dana@school.test', tok: 'tokC' };

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const dir = 'dana@maple.test';
  const S = { email: dir, password: 'qa-pass-1234', role: 'director',
    program: [{ key: 'users', value: { map: { [dir]: { name: 'Dana Director', role: 'director', title: 'Executive Director' } } } },
      { key: 'hidesample', value: { v: true } },
      { key: 'usersettings', value: { map: { [dir]: { calsOff: ['google'] } } } },     // hidden before accounts had ids
      { key: 'pilot', value: { signatures: { ['u:' + dir]: { by: 'Dana Director', at: 'Oct 1, 2026', role: 'Director' } } } }] };
  const saved = (k) => { const r = S.program.find((x) => x.key === 'usersettings'); return r && r.value && r.value.map && r.value.map[dir] ? r.value.map[dir][k] : undefined; };
  const savedRow = () => JSON.stringify((S.program.find((x) => x.key === 'usersettings') || {}).value || {});

  // np-gcal v4, as the suite says
  const NG = { accts: [A1, A2], calls: [], multi: true, gone: new Set(), next: null, n: 0, reply: null };
  const minted = (a) => ({ id: a.id, email: a.email, access_token: a.tok + '-' + (++NG.n), expires_in: 3600 });
  const list = () => NG.accts.map((a) => ({ id: a.id, email: a.email }));
  const base = () => ({ ready: true, multi: NG.multi, max: NG.multi ? 5 : 1 });
  const rest = async ({ method, path, body }) => {
    if (path.startsWith('/auth/v1/token?grant_type=refresh_token')) return { status: 200, body: { access_token: 'qa-access-token', refresh_token: 'qa-refresh-token', expires_in: 3600, token_type: 'bearer', user: { id: 'qa-user', email: dir } } };
    if (path.startsWith('/auth/v1/user')) return { status: 200, body: { id: 'qa-user', email: dir } };
    if (!path.startsWith('/functions/v1/np-gcal')) return null;
    if (method !== 'POST') return { status: 204, body: '' };
    const b = JSON.parse(body || '{}');
    NG.calls.push(b);
    if (NG.reply) { const r = NG.reply; NG.reply = null; return r; }
    if (b.action === 'token') {
      if (!NG.accts.length) return { status: 200, body: { ...base(), connected: false, accounts: [] } };
      if (b.all) { const out = NG.accts.map(minted); return { status: 200, body: { ...base(), connected: true, accounts: out, account: out[0].id, email: out[0].email, access_token: out[0].access_token, expires_in: 3600 } }; }
      if (b.account) {
        if (NG.gone.has(b.account)) { NG.accts = NG.accts.filter((a) => a.id !== b.account); return { status: 200, body: { ...base(), connected: NG.accts.length > 0, gone: true, reason: 'expired', account: b.account, accounts: list() } }; }
        const a = NG.accts.find((x) => x.id === b.account);
        if (!a) return { status: 200, body: { ...base(), connected: true, gone: true, account: b.account, accounts: list() } };
        const m = minted(a); return { status: 200, body: { ...base(), connected: true, account: a.id, email: a.email, access_token: m.access_token, expires_in: 3600 } };
      }
      const m = minted(NG.accts[0]); return { status: 200, body: { ...base(), connected: true, account: m.id, email: m.email, access_token: m.access_token, expires_in: 3600 } };
    }
    if (b.action === 'connect') {
      const a = NG.next; if (!NG.accts.some((x) => x.id === a.id)) NG.accts.push(a);
      const m = minted(a); return { status: 200, body: { ...base(), connected: true, account: a.id, email: a.email, access_token: m.access_token, expires_in: 3600, accounts: list() } };
    }
    if (b.action === 'disconnect') {
      if (b.account) NG.accts = NG.accts.filter((a) => a.id !== b.account); else NG.accts = [];
      return { status: 200, body: { ...base(), connected: NG.accts.length > 0, account: b.account, accounts: list() } };
    }
    return { status: 400, body: { error: 'Unknown action.' } };
  };
  // Google: each account's main calendar, read with that account's token; Van schedule is the personal account's own
  const G = { asked: [], writes: [] };
  const EV = {
    tokA: [{ id: 'ea1', summary: 'Board call', start: { dateTime: at(9, 14) }, end: { dateTime: at(9, 15) }, htmlLink: 'https://www.google.com/calendar/event?eid=ea1' },
      { id: 'ea2', summary: 'Grant deadline', start: { dateTime: at(11, 10) }, end: { dateTime: at(11, 11) }, htmlLink: 'https://www.google.com/calendar/event?eid=ea2' }],
    tokB: [{ id: 'eb1', summary: 'Vendor call', start: { dateTime: at(9, 15) }, end: { dateTime: at(9, 15, 30) }, htmlLink: 'https://www.google.com/calendar/event?eid=eb1' },
      { id: 'eb2', summary: 'Quarterly review', start: { dateTime: at(12, 9) }, end: { dateTime: at(12, 10) }, htmlLink: 'https://www.google.com/calendar/event?eid=eb2' }],
    tokC: [{ id: 'ec1', summary: 'School pickup', start: { dateTime: at(9, 17) }, end: { dateTime: at(9, 17, 30) }, htmlLink: 'https://www.google.com/calendar/event?eid=ec1' }],
  };
  const google = async (route) => {
    const req = route.request(), u = new URL(req.url());
    const tok = String(req.headers().authorization || '').replace('Bearer ', ''), who = tok.split('-')[0];
    G.asked.push({ who, m: req.method(), p: u.pathname + u.search });
    const send = (status, b) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    const m = u.pathname.match(/\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (!m) return send(404, {});
    const cal = decodeURIComponent(m[1]), evId = m[2] ? decodeURIComponent(m[2]) : '';
    if (cal === 'primary') {
      if (req.method() === 'POST') { G.writes.push({ who, m: 'POST' }); return send(200, { id: 'new-' + who }); }
      if (req.method() === 'PATCH' || req.method() === 'DELETE') {
        G.writes.push({ who, m: req.method(), ev: evId });
        return evId === 'old-in-A' && who !== 'tokA' ? send(404, { error: { code: 404 } }) : send(200, {});
      }
      return send(200, { summary: '', items: EV[who] || [] });
    }
    if (cal === VAN) {
      if (who !== 'tokA') return send(403, { error: { code: 403, message: 'Forbidden' } });
      if (u.searchParams.get('fields') === 'summary') return send(200, { summary: 'Van schedule' });
      return send(200, { summary: 'Van schedule', items: [{ id: 'v1', summary: 'Van service', start: { dateTime: at(9, 11, 30) }, end: { dateTime: at(9, 12, 30) }, htmlLink: 'https://www.google.com/calendar/event?eid=v1' }] });
    }
    return send(403, { error: { code: 403, message: 'Forbidden' } });
  };

  const booted = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  const signedIn = async (viewport) => {
    const { ctx, page } = await H.newPage(env, { session: S, bucket: errors, rest, viewport: viewport || { width: 1440, height: 1000 } });
    await page.clock.setFixedTime(NOW);
    await page.route('https://www.googleapis.com/calendar/**', google);
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 20000 });
    await page.waitForFunction(() => GCAL.connected && GCAL.events.length > 0 && !GCAL.loading, null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => {
      window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; };
      const me = userKey();
      APPTS.push({ id: 'qa-a1', cid: null, title: 'Team huddle', type: 'Meeting', date: T, time: '10:30', dur: 30, cal: 'company', notes: [], files: [] },
        { id: 'qa-a2', cid: null, title: 'Supervision with Lee', type: 'Meeting', date: T, time: '16:00', dur: 60, cal: 'personal', owner: me, notes: [], files: [] });
      closeAll(); go('home');
    });
    await page.waitForTimeout(300);
    return { ctx, page };
  };
  const chips = (page, scope) => page.evaluate((s) => [...document.querySelectorAll(s + ' .v1243-c')].map((b) => ({ n: b.textContent.trim(), on: b.getAttribute('aria-pressed') === 'true', k: b.dataset.cal })), scope);
  const groups = (page, scope) => page.evaluate((s) => [...document.querySelectorAll(s + ' .v1244-g')].map((b) => ({ n: b.textContent.trim(), on: b.getAttribute('aria-pressed') === 'true' })), scope);
  const views = (page, scope) => page.evaluate((s) => [...document.querySelectorAll(s + ' .v1244-v')].map((b) => ({ n: b.textContent.trim(), on: b.getAttribute('aria-pressed') === 'true' })), scope);
  const chipBtns = (page, scope) => page.evaluate((s) => [...document.querySelectorAll(s + ' .v1243-x')].map((b) => b.textContent.trim()), scope);
  const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#view .hm-sched .hm-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  const pane = (page) => page.evaluate(() => [...document.querySelectorAll('#view .cx-pane .cx-row')].map((r) => ({ k: r.dataset.k, t: r.innerText.replace(/\s+/g, ' ').trim() })));
  const pickView = async (page, scope, name) => { await page.click(`${scope} .v1244-v:has-text("${name}")`); await page.waitForTimeout(300); };
  const card = (page) => page.evaluate(() => { settingsHub('cal', 'calendar'); const n = el('modal').querySelector('[data-gcals]'); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; });
  const lastToast = (page) => page.evaluate(() => { const t = [...document.querySelectorAll('.toast, #toast, .np-toast')].map((n) => n.textContent.trim()).filter(Boolean); return t.slice(-1)[0] || ''; });
  const toastWatch = (page) => page.evaluate(() => { window.__toasts = []; const o = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return o.apply(this, arguments); }; });
  const toasts = (page) => page.evaluate(() => window.__toasts.slice());

  // ======================= 1. two accounts kept: both read, the first is the main one =======================
  let { ctx, page } = await signedIn();
  await toastWatch(page);
  const tk = NG.calls.filter((c) => c.action === 'token');
  check('sign-in: the page asks np-gcal for every account at once', tk.length >= 1 && tk[0].all === true, JSON.stringify(tk));
  const st = await page.evaluate(() => ({ n: GCAL.accts.length, main: GCAL.main, email: GCAL.email, multi: GCAL.multi, max: GCAL.max, tok: GCAL.token }));
  check('two accounts held, the first one is the main one (its token is the page’s own)', st.n === 2 && st.main === A1.id && st.email === A1.email && st.multi && st.max === 5 && /^tokA-/.test(st.tok), JSON.stringify(st));
  check('each account’s main calendar was read with its own token', G.asked.some((a) => a.who === 'tokA' && /\/calendars\/primary\/events/.test(a.p)) && G.asked.some((a) => a.who === 'tokB' && /\/calendars\/primary\/events/.test(a.p)));
  const ev = await page.evaluate(() => GCAL.events.map((g) => ({ id: g.id, k: g.gkey, a: g.acct })));
  check('the main account’s events can be edited from the portal (g_), the other account’s open in Google (gx_)',
    ev.filter((e) => e.a === 'a1111111111111111').every((e) => /^g_/.test(e.id)) && ev.filter((e) => e.a === 'a2222222222222222').every((e) => /^gx_/.test(e.id)) && ev.length === 4, JSON.stringify(ev));
  check('each account’s calendar has its own key', ev.every((e) => e.k === 'gacct:' + e.a), JSON.stringify(ev));
  check('a calendar hidden before accounts had ids stays hidden (google became the first account’s key)', JSON.stringify(saved('calsOff')) === JSON.stringify(['gacct:' + A1.id]), JSON.stringify(saved('calsOff')));
  await page.evaluate(() => { calAll(); go('home'); }); await page.waitForTimeout(250);
  let R = await rows(page);
  check('home: both accounts’ events are on today’s schedule, each named by its account', R.some((r) => /Board call/.test(r) && /dana@gmail\.test/.test(r)) && R.some((r) => /Vendor call/.test(r) && /dana@work\.test/.test(r)), JSON.stringify(R));
  let V = await views(page, '#view .hm-sched');
  check('home: the view bar offers All, Portal and each account, All picked', V.map((v) => v.n).join('|') === 'All|Portal|dana@gmail.test|dana@work.test' && V[0].on, JSON.stringify(V));
  let C = await chips(page, '#view .hm-sched'), Gp = await groups(page, '#view .hm-sched');
  check('home: in All, the chips are grouped: Portal, then each account', Gp.map((g) => g.n).join('|') === 'Portal|dana@gmail.test|dana@work.test' && C.map((c) => c.n).join('|') === 'Company calendar|Dana’s calendar|Main calendar|Main calendar', JSON.stringify({ Gp, C }));
  await page.click('#view .hm-row:has-text("Vendor call")'); await page.waitForTimeout(150);
  check('home: the other account’s event opens in Google', (await page.evaluate(() => window.__opened.slice(-1)[0])) === 'https://www.google.com/calendar/event?eid=eb1');

  // ======================= 2. views =======================
  await pickView(page, '#view .hm-sched', 'dana@work.test');
  R = await rows(page); C = await chips(page, '#view .hm-sched');
  check('view: one account shows only that account’s events', R.some((r) => /Vendor call/.test(r)) && !R.some((r) => /Board call|Team huddle|Supervision/.test(r)), JSON.stringify(R));
  check('view: its chips are only that account’s calendars, no group labels', C.map((c) => c.n).join('|') === 'dana@work.test' && !(await groups(page, '#view .hm-sched')).length, JSON.stringify(C));
  check('view: the choice is kept for this person (by account id, not address)', saved('calView') === 'g:' + A2.id, JSON.stringify(saved('calView')));
  const tile = await page.evaluate(() => (document.querySelector('#view .hm-tile') || {}).innerText || '');
  check('view: the home tiles follow it (no portal appointments in a Google account’s view)', !/Next at 10:30/.test(tile), tile);
  await page.evaluate(() => go('calendar')); await page.waitForTimeout(300);
  let P = await pane(page);
  check('Calendar page: the same view holds (only the work account’s events in the day’s plan)', P.some((r) => /Vendor call/.test(r.t)) && !P.some((r) => /Board call|Team huddle/.test(r.t)), JSON.stringify(P));
  V = await views(page, '#view .cx-card');
  check('Calendar page: the view bar shows the view picked', V.find((v) => v.on).n === 'dana@work.test', JSON.stringify(V));
  await pickView(page, '#view .cx-card', 'Portal');
  P = await pane(page);
  check('Portal view: the team’s calendars only, no Google events', P.some((r) => /Team huddle/.test(r.t)) && !P.some((r) => r.k === 'google'), JSON.stringify(P));
  const rem = await page.evaluate(() => upcomingReminders().map((x) => x.t));
  check('a view never takes events out of the reminders (they follow the chips only)', rem.some((t) => /Board call|Vendor call/.test(t)), JSON.stringify(rem));
  await page.evaluate(() => go('home')); await page.waitForTimeout(250);
  R = await rows(page);
  check('home: Portal view there too', R.some((r) => /Team huddle/.test(r)) && !R.some((r) => /Board call|Vendor call/.test(r)), JSON.stringify(R));
  await pickView(page, '#view .hm-sched', 'All');
  R = await rows(page);
  check('All brings everything back', ['Board call', 'Vendor call', 'Team huddle'].every((t) => R.some((r) => r.includes(t))), JSON.stringify(R));

  // ======================= 3. a whole account's calendars at once =======================
  await page.click('#view .hm-sched .v1244-g:has-text("dana@work.test")'); await page.waitForTimeout(250);
  R = await rows(page); Gp = await groups(page, '#view .hm-sched');
  check('group: one click hides every calendar of that account', !R.some((r) => /Vendor call/.test(r)) && R.some((r) => /Board call/.test(r)) && Gp.find((g) => g.n === 'dana@work.test').on === false && (saved('calsOff') || []).includes('gacct:' + A2.id), JSON.stringify({ R, Gp, off: saved('calsOff') }));
  await page.click('#view .hm-sched .v1244-g:has-text("dana@work.test")'); await page.waitForTimeout(250);
  check('group: a second click shows them again', (await rows(page)).some((r) => /Vendor call/.test(r)) && !(saved('calsOff') || []).includes('gacct:' + A2.id));
  await page.click('#view .hm-sched .v1244-g:has-text("Portal")'); await page.waitForTimeout(250);
  R = await rows(page);
  check('group: Portal hides the team’s calendars at once', !R.some((r) => /Team huddle|Supervision/.test(r)) && R.some((r) => /Board call/.test(r)), JSON.stringify(R));
  await page.evaluate(() => calAll()); await page.waitForTimeout(150);

  // ======================= 4. account names and colours =======================
  await page.evaluate((id) => gacctEdit(id), A2.id); await page.waitForTimeout(150);
  const ed = await page.evaluate(() => ({ t: el('mdTitle').textContent, v: el('gpName').value }));
  check('✎ on an account opens Edit Google account, filled with its address', /Edit Google account$/.test(ed.t) && ed.v === 'dana@work.test', JSON.stringify(ed));
  await page.fill('#gpName', 'Work');
  await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(250);
  V = await views(page, '#view .hm-sched'); C = await chips(page, '#view .hm-sched');
  check('the account’s name shows on the view bar, its group and the tag on its events', V.some((v) => v.n === 'Work') && (await groups(page, '#view .hm-sched')).some((g) => g.n === 'Work') && (await rows(page)).some((r) => /Vendor call/.test(r) && /Work/.test(r)), JSON.stringify({ V, C }));
  check('the name is saved with the person’s settings, and no account address is', (saved('gaccts') || {})[A2.id] && saved('gaccts')[A2.id].name === 'Work' && !/dana@work\.test|dana@gmail\.test/.test(savedRow()), savedRow());

  // ======================= 5. where portal appointments go =======================
  let cd = await card(page);
  check('settings: Your Google accounts lists both, the first marked Main, with where appointments go', /Your Google accounts/.test(cd) && /dana@gmail\.test Main/.test(cd) && /Portal appointments you send to Google go here/.test(cd) && /Work/.test(cd) && /Use for appointments/.test(cd), cd);
  const setMenu = await page.evaluate(() => { settingsHub('cal', 'calendar'); const b = el('modal').querySelector('.v1246-add'); if (!b) return [];   // v12.46: one Add calendar button
    b.click(); const it = [...document.querySelectorAll('#cxMenu .cx-mi b')].map((x) => x.textContent.trim()); cxMenuClose(); return it; });
  check('settings: the Add calendar button offers Link another Google account', setMenu.includes('Link another Google account'), JSON.stringify(setMenu));
  await page.click('#modal [data-acct="' + A2.id + '"] button:has-text("Use for appointments")'); await page.waitForTimeout(500);
  const m2 = await page.evaluate(() => ({ main: GCAL.main, tok: GCAL.token, email: GCAL.email }));
  check('Use for appointments: the work account becomes the main one (its token is the page’s own), saved', m2.main === A2.id && /^tokB-/.test(m2.tok) && saved('gcalMain') === A2.id, JSON.stringify(m2));
  await page.waitForFunction(() => !GCAL.loading && GCAL.events.some((g) => g.title === 'Vendor call' && /^g_/.test(g.id)), null, { timeout: 5000 }).catch(() => {});
  const ev2 = await page.evaluate(() => GCAL.events.map((g) => ({ t: g.title, id: g.id })));
  check('...its events can now be edited from the portal, the personal account’s open in Google', ev2.find((e) => e.t === 'Vendor call').id.startsWith('g_') && ev2.find((e) => e.t === 'Board call').id.startsWith('gx_'), JSON.stringify(ev2));
  check('the booking form says which Google account an appointment goes to', await page.evaluate(() => { closeAll(); openApptForm && openApptForm(); const t = el('modal').innerText; closeAll(); return /Added to your connected Google Calendar \(dana@work\.test\)/.test(t); }).catch(() => false));
  G.writes = [];
  await page.evaluate(() => gcalPush({ id: 'qa-p1', title: 'Dentist', type: 'Medical', date: T, time: '13:00', dur: 30, loc: '' }));
  await page.waitForTimeout(300);
  check('a portal appointment sent to Google goes to the main account', G.writes.length === 1 && G.writes[0].who === 'tokB' && G.writes[0].m === 'POST', JSON.stringify(G.writes));
  G.writes = [];
  const upd = await page.evaluate(async () => gcalUpdate({ id: 'qa-p2', gid: 'old-in-A', title: 'Checkup', date: T, time: '14:00', dur: 30, loc: '' }));
  check('an older appointment whose copy is in the other account is still updated there', upd === true && G.writes.map((w) => w.who + ':' + w.m).join(',') === 'tokB:PATCH,tokA:PATCH', JSON.stringify({ upd, w: G.writes }));
  G.writes = [];
  const del = await page.evaluate(async () => gcalDelete({ id: 'qa-p3', gid: 'old-in-A' }));
  check('...and deleted there', del === true && G.writes.map((w) => w.who + ':' + w.m).join(',') === 'tokB:DELETE,tokA:DELETE', JSON.stringify({ del, w: G.writes }));
  await page.evaluate(() => closeAll());

  // ======================= 6. a calendar added by ID, found in the account that owns it =======================
  const tryId = async (id) => page.evaluate(async (v) => { closeAll(); gcalIdForm(); el('gcId').value = v; await gcalIdAdd(); await new Promise((r) => setTimeout(r, 50)); const m = el('gcIdMsg'); return m ? m.textContent : ''; }, id);
  check('the work account’s address is its main calendar, already shown', /That’s the main calendar of Work/.test(await tryId('dana@work.test')));
  check('a calendar none of the accounts owns says so', /None of your connected Google accounts owns that calendar/.test(await tryId(NOBODY)));
  await page.evaluate(async (v) => { closeAll(); gcalIdForm(); el('gcId').value = v; await gcalIdAdd(); }, VAN);
  await page.waitForTimeout(500);
  const g1 = saved('gcals') || [];
  check('Van schedule is tried with the main (work) account, then found in the personal one, and saved under it', g1.length === 1 && g1[0].id === VAN && g1[0].acct === A1.id, JSON.stringify(g1));
  check('...the toast says which account it came from', (await toasts(page)).some((t) => /^Van schedule added from dana@gmail\.test/.test(t)), JSON.stringify(await toasts(page)));
  await page.waitForFunction(() => GCAL.events.some((g) => g.title === 'Van service'), null, { timeout: 5000 }).catch(() => {});
  check('its events are read with the personal account’s token', G.asked.some((a) => a.who === 'tokA' && a.p.includes(encodeURIComponent(VAN)) && !a.p.includes('fields=summary')));
  await page.evaluate(() => go('home')); await page.waitForTimeout(250);
  C = await chips(page, '#view .hm-sched');
  check('its chip sits in the personal account’s group', await page.evaluate(() => [...document.querySelectorAll('#view .hm-sched .v1244-gp')].some((g) => /dana@gmail\.test/.test(g.querySelector('.v1244-g').textContent) && /Van schedule/.test(g.textContent))), JSON.stringify(C));
  await pickView(page, '#view .hm-sched', 'dana@gmail.test');
  R = await rows(page);
  check('the personal account’s view includes Van schedule', R.some((r) => /Van service/.test(r)) && R.some((r) => /Board call/.test(r)) && !R.some((r) => /Vendor call/.test(r)), JSON.stringify(R));
  await pickView(page, '#view .hm-sched', 'All');

  // ======================= 7. connecting another account =======================
  await page.evaluate(() => go('calendar')); await page.waitForTimeout(250);
  await page.click('#view .cx-card .v1245-add'); await page.waitForTimeout(150);
  const am = await page.evaluate(() => [...document.querySelectorAll('#cxMenu .cx-mi b')].map((x) => x.textContent.trim())); await page.evaluate(() => cxMenuClose());
  check('Calendar page: + Add calendar offers Link another Google account (v12.45: one button)', am.includes('Link another Google account') && am.includes('Add a Google calendar'), JSON.stringify(am));
  const hdr = await page.evaluate(() => [...document.querySelectorAll('.page-acts button')].map((b) => b.textContent.trim()).join(' | '));
  check('Calendar page: the header says how many Google accounts (it opens them), not Disconnect', /Google ✓ · 2 accounts/.test(hdr) && !/Google ✓ · Disconnect/.test(hdr), hdr);
  const connect = async (acct) => {
    NG.next = acct;
    return page.evaluate(async () => {
      const prev = window.google; let cfg = null;
      window.google = { accounts: { oauth2: { initCodeClient: (c) => { cfg = c; return { requestCode() { c.callback({ code: 'qa-code' }); } }; }, revoke() {} } } };
      gcalConnect(true);
      await new Promise((r) => setTimeout(r, 400));
      window.google = prev;
      return { scope: cfg && cfg.scope, select: cfg && cfg.select_account };
    });
  };
  const cc = await connect(A3);
  const cb = NG.calls.filter((c) => c.action === 'connect').slice(-1)[0];
  check('+ Google account opens Google’s account chooser, asking for the same permission as before', cc.select === true && cc.scope === 'openid https://www.googleapis.com/auth/calendar.events.owned', JSON.stringify(cc));
  check('the page asks np-gcal to add it, keeping the others', cb && cb.add === true && cb.code === 'qa-code', JSON.stringify(cb));
  await page.waitForFunction(() => GCAL.accts.length === 3 && GCAL.events.some((g) => g.title === 'School pickup'), null, { timeout: 5000 }).catch(() => {});
  check('the third account is added, its events read with its own token, the main account unchanged', (await page.evaluate(() => GCAL.accts.length === 3 && GCAL.main === 'a2222222222222222')) && G.asked.some((a) => a.who === 'tokC'), JSON.stringify(await page.evaluate(() => GCAL.accts.map((a) => a.id))));
  check('...and the toast says so', (await toasts(page)).some((t) => /^Google account dana@school\.test added/.test(t)), JSON.stringify((await toasts(page)).slice(-3)));
  await connect(A3);
  check('connecting an account already connected says so', (await toasts(page)).slice(-1)[0] === 'That Google account (dana@school.test) is already connected.', JSON.stringify((await toasts(page)).slice(-1)));
  NG.reply = { status: 400, body: { ready: true, multi: true, max: 5, connected: true, reason: 'max', error: 'You can connect up to 5 Google accounts. Disconnect one first.', accounts: [] } };
  await connect({ id: 'a4444444444444444', email: 'x@x.test', tok: 'tokD' });
  check('a refusal from np-gcal (too many accounts) is said as it is', (await toasts(page)).slice(-1)[0] === 'You can connect up to 5 Google accounts. Disconnect one first.', JSON.stringify((await toasts(page)).slice(-1)));
  check('...and an empty list in a refusal never drops the accounts the page holds', await page.evaluate(() => GCAL.accts.length === 3));

  // ======================= 8. each account's token is renewed on its own; one Google ended goes alone =======================
  NG.calls = [];
  await page.evaluate(async () => { gcalAcct('a3333333333333333').exp = Date.now() - 1000; await gcalFetch(true); });
  const rn = NG.calls.filter((c) => c.action === 'token');
  check('an expired token is renewed for that account only', rn.length === 1 && rn[0].account === A3.id, JSON.stringify(rn));
  NG.gone.add(A3.id);
  await page.evaluate(async () => { gcalAcct('a3333333333333333').exp = Date.now() - 1000; await gcalFetch(true); });
  await page.waitForTimeout(200);
  const g3 = await page.evaluate(() => ({ n: GCAL.accts.length, ev: GCAL.events.some((g) => g.title === 'School pickup'), c: GCAL.connected }));
  check('an account Google ended is dropped with its events, the others stay', g3.n === 2 && !g3.ev && g3.c, JSON.stringify(g3));
  check('...and the person is told', (await toasts(page)).some((t) => /Google ended the connection to dana@school\.test/.test(t)), JSON.stringify((await toasts(page)).slice(-2)));

  // ======================= 9. disconnecting one account =======================
  await page.evaluate(() => calSetView('g:a2222222222222222')); await page.waitForTimeout(100);
  await card(page);
  await page.click('#modal [data-acct="' + A2.id + '"] button:has-text("Disconnect")'); await page.waitForTimeout(500);
  const dc = NG.calls.filter((c) => c.action === 'disconnect').slice(-1)[0];
  check('Disconnect on one account asks np-gcal for that account only', dc && dc.account === A2.id, JSON.stringify(dc));
  const g4 = await page.evaluate(() => ({ n: GCAL.accts.length, main: GCAL.main, ev: GCAL.events.some((g) => g.title === 'Vendor call'), c: GCAL.connected, view: calViewOf() }));
  check('it goes with its events; the main account moves to the one left; a view of it falls back to All', g4.n === 1 && g4.main === A1.id && !g4.ev && g4.c && g4.view === 'all', JSON.stringify(g4));
  check('...and the toast says where appointments go now', (await toasts(page)).some((t) => /^Work disconnected on every device\. Portal appointments you send to Google now go to dana@gmail\.test\./.test(t)), JSON.stringify((await toasts(page)).slice(-2)));
  await page.evaluate(() => { closeAll(); go('calendar'); }); await page.waitForTimeout(300);
  const hdr2 = await page.evaluate(() => [...document.querySelectorAll('.page-acts button')].map((b) => b.textContent.trim()).join(' | '));
  check('one account left: the header offers Disconnect again, and no group labels', /Google ✓ · Disconnect/.test(hdr2) && !(await groups(page, '#view .cx-card')).length, hdr2);
  V = await views(page, '#view .cx-card');
  check('one account left: the view bar says All, Portal, Google', V.map((v) => v.n).join('|') === 'All|Portal|Google', JSON.stringify(V));
  C = await chips(page, '#view .cx-card');
  check('one account left: its main calendar is called Google Calendar again, Van schedule kept', C.some((c) => c.n === 'Google Calendar') && C.some((c) => c.n === 'Van schedule'), JSON.stringify(C));
  await ctx.close();

  // ======================= 10. a server that keeps one account only =======================
  NG.multi = false; NG.accts = [A1]; NG.calls = [];
  ({ ctx, page } = await signedIn());
  check('one-account server: connected, but no + Google account or Connect another account', (await page.evaluate(() => GCAL.connected && !gcalCanAdd())) && !/Connect another Google account/.test(await card(page)), JSON.stringify(await page.evaluate(() => ({ multi: GCAL.multi, n: GCAL.accts.length }))));
  await ctx.close();
  NG.multi = true; NG.accts = [A1, A2];

  // ======================= 11. a phone =======================
  for (const w of [390, 768]) {
    ({ ctx, page } = await signedIn({ width: w, height: 900 }));
    const fit = async () => page.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth <= innerWidth + 1,
      btns: [...document.querySelectorAll('#view .v1243-c, #view .v1243-x, #view .v1244-v, #view .v1244-g')].every((b) => { const r = b.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= -1 && r.height >= 30; }) }));
    let f = await fit();
    check(`${w}px: home: the view bar and grouped chips fit (tap targets 30px or more), no sideways scroll`, f.scroll && f.btns, JSON.stringify(f));
    await page.evaluate(() => go('calendar')); await page.waitForTimeout(250);
    f = await fit();
    check(`${w}px: Calendar page: the same`, f.scroll && f.btns, JSON.stringify(f));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
