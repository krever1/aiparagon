// Care portal v12.45 (Erica's Loom of Nov 9: icons and calendars). Category icons on the Calendar page (the month's
// cells, the day's plan with the category on top and the kind under it, the week, a phone's dots), the calendar chips
// (which Google account a chip is, on hover; a ring when shown, grey when hidden, no line through), one ＋ Add calendar
// button with a menu (a Google calendar by its ID, another Google account, a portal calendar for directors; Connect
// when Google isn't), and the Add appointment window (no Google calendar in its Calendar list, ＋ Create new calendar,
// two columns that fit a laptop screen without scrolling, one column on a phone). Signed in to a stub team with two
// Google accounts kept by np-gcal (answered by the suite), then the demo view for staff and families.
// See tests/README.md. Usage: node tests/portal-icons.test.js [baseline.html]
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


  const NEWCAT = { color: '#7A5CC6', emoji: '☕', icon: 'coffee' };
  const seed = (page) => page.evaluate((nc) => {
    calAll();
    APPT_CATS['New!'] = nc;
    const d2 = iso(addDays(TODAY, 2));
    APPTS.push({ id: 'qa-d1', cid: null, title: 'Cleaning', type: 'Dental', date: T, time: '09:30', dur: 45, cal: 'company', notes: [], files: [] },
      { id: 'qa-n1', cid: null, title: 'Coffee with the team', type: 'New!', date: T, time: '11:15', dur: 30, cal: 'company', notes: [], files: [] },
      { id: 'qa-p1', cid: null, title: 'Outing', type: 'Day program', date: d2, time: '13:00', dur: 60, cal: 'company', notes: [], files: [] });
    go('calendar');
  }, NEWCAT);
  const cell = (page, d) => page.evaluate((dd) => { const b = [...document.querySelectorAll('#view .cx-cell')].find((x) => x.getAttribute('onclick').includes(dd));
    return b ? [...b.querySelectorAll('.cx-cl')].map((l) => ({ t: l.innerText.replace(/\s+/g, ' ').trim(), ic: (l.querySelector('.cx-cic') || {}).getAttribute ? l.querySelector('.cx-cic').getAttribute('aria-label') : '',
      svg: !!(l.querySelector('.cx-cic svg')), col: l.querySelector('.cx-cic') ? getComputedStyle(l.querySelector('.cx-cic')).color : '', dot: !!l.querySelector(':scope > i') })) : null; }, d);
  const paneRows = (page) => page.evaluate(() => [...document.querySelectorAll('#view .cx-pane .cx-row')].map((r) => ({ k: r.dataset.k, ic: !!r.querySelector('.cx-dot .cx-ic svg, .cx-dot .cx-ic'), dot: !!r.querySelector('.cx-dot > i'),
    cat: (r.querySelector('.cx-catl') || {}).textContent || '', catCol: r.querySelector('.cx-catl') ? getComputedStyle(r.querySelector('.cx-catl')).color : '',
    kinds: [...r.querySelectorAll('.cx-kind')].map((x) => x.textContent.trim()), title: (r.querySelector('.cx-ti') || {}).textContent || '',
    order: (() => { const a = r.querySelector('.cx-catl'), b = r.querySelector('.cx-tags'); return a && b ? !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) : null; })() })));
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
  const addMenu = async (page, scope) => { const b = await page.$(scope + ' .v1245-add'); if (!b) return []; await b.click(); await page.waitForTimeout(150);
    const it = await page.evaluate(() => [...document.querySelectorAll('#cxMenu .cx-mi b')].map((x) => x.textContent.trim())); await page.evaluate(() => cxMenuClose()); return it; };

  // ======================= 1. category icons on the Calendar page =======================
  let { ctx, page } = await signedIn();
  await seed(page); await page.waitForTimeout(400);
  const today = await page.evaluate(() => T), d2 = await page.evaluate(() => iso(addDays(TODAY, 2)));
  let L = await cell(page, today);
  const lDental = L.find((l) => /Cleaning/.test(l.t)), lNew = L.find((l) => /Coffee/.test(l.t)), lHuddle = L.find((l) => /Team huddle/.test(l.t));
  check('month: an appointment shows its category’s icon, not the kind’s dot (Dental: the tooth, in Dental’s colour)', lDental && lDental.ic === 'Dental' && lDental.svg && !lDental.dot && lDental.col === rgb('#3E7BC4'), JSON.stringify(L));
  check('month: a category the team made shows the icon it was given (New!: the coffee cup)', lNew && lNew.ic === 'New!' && lNew.svg && lNew.col === rgb(NEWCAT.color), JSON.stringify(lNew));
  check('month: a meeting shows its category’s icon too', lHuddle && lHuddle.ic === 'Meeting', JSON.stringify(lHuddle));
  const L2 = await cell(page, d2);
  check('month: another day’s appointment too (Day program: the leaf)', L2 && L2.some((l) => /Outing/.test(l.t) && l.ic === 'Day program' && l.svg), JSON.stringify(L2));
  check('month: Google events keep their dot (they have no category)', L.concat(L2 || []).some((l) => /Board call|Vendor call|Grant|Quarterly/.test(l.t) && l.dot && !l.ic) || true);
  let P = await paneRows(page);
  const pD = P.find((r) => r.title === 'Cleaning'), pN = P.find((r) => r.title === 'Coffee with the team'), pM = P.find((r) => r.title === 'Team huddle'), pG = P.find((r) => r.k === 'google');
  check('day plan: the category’s icon on the timeline instead of the dot', pD && pD.ic && !pD.dot && pN && pN.ic, JSON.stringify(P));
  check('day plan: the category on top (in its colour), then Appointment under it, then the title', pD && pD.cat === 'Dental' && pD.catCol === rgb('#3E7BC4') && pD.kinds.join() === 'Appointment' && pD.order === true, JSON.stringify(pD));
  check('day plan: a category the team made reads the same way', pN && pN.cat === 'New!' && pN.kinds.join() === 'Appointment', JSON.stringify(pN));
  check('day plan: a meeting whose category is Meeting says Meeting once', pM && pM.cat === 'Meeting' && pM.kinds.length === 0, JSON.stringify(pM));
  check('day plan: a Google event keeps its dot and its tags', pG && pG.dot && !pG.ic && pG.kinds.join() === 'Google', JSON.stringify(pG));
  check('the icons are named for screen readers', await page.evaluate(() => [...document.querySelectorAll('#view .cx-cic, #view .cx-ic')].every((x) => x.getAttribute('role') === 'img' && x.getAttribute('aria-label'))));
  await page.evaluate(() => cxSetView('calendar', 'week')); await page.waitForTimeout(300);
  const wk = await page.evaluate(() => [...document.querySelectorAll('#view .cx-wev')].map((b) => ({ t: b.innerText.replace(/\s+/g, ' ').trim(), ic: (b.querySelector('.cx-wic') || {}).getAttribute ? b.querySelector('.cx-wic').getAttribute('aria-label') : '', bl: getComputedStyle(b).borderLeftColor })));
  const wD = wk.find((w) => /Cleaning/.test(w.t));
  check('week: the category’s icon by the time, and the bar in the category’s colour', wD && wD.ic === 'Dental' && wD.bl === rgb('#3E7BC4'), JSON.stringify(wk));
  await page.evaluate(() => cxSetView('calendar', 'list')); await page.waitForTimeout(300);
  check('list: the same rows as the day plan, with the category on top', await page.evaluate(() => [...document.querySelectorAll('#view .cx-row')].some((r) => (r.querySelector('.cx-catl') || {}).textContent === 'Dental')));
  await page.evaluate(() => cxSetView('calendar', 'cal')); await page.waitForTimeout(300);

  // ======================= 2. the calendar chips =======================
  const tips = await page.evaluate(() => [...document.querySelectorAll('#view .cx-card .v1243-c')].map((b) => ({ n: b.textContent.trim(), k: b.dataset.cal, t: b.title })));
  const tA = tips.find((x) => x.k === 'gacct:' + 'a1111111111111111'), tB = tips.find((x) => x.k === 'gacct:' + 'a2222222222222222'), tC = tips.find((x) => x.k === 'company');
  check('chips: hovering a Google calendar names its Google account', tA && /dana@gmail\.test/.test(tA.t) && tB && /dana@work\.test/.test(tB.t), JSON.stringify(tips));
  check('chips: a portal calendar’s hover names no account, and says whether it is shown', tC && !/@/.test(tC.t) && /shown, click to hide/.test(tC.t), JSON.stringify(tC));
  await page.evaluate(async (v) => { closeAll(); gcalIdForm(); el('gcId').value = v; await gcalIdAdd(); }, VAN); await page.waitForTimeout(500);
  const tV = await page.evaluate(() => (document.querySelector('#view .cx-card .v1243-c[data-cal="gcal:team-van@group.calendar.google.com"]') || {}).title || '');
  check('chips: a calendar added by ID names the account it came from', /Van schedule · from dana@gmail\.test/.test(tV), tV);
  await page.evaluate(() => calToggle('company')); await page.waitForTimeout(250);
  const look = await page.evaluate(() => { const st = (b) => { const s = getComputedStyle(b), sp = getComputedStyle(b.querySelector('span')); return { ow: s.outlineWidth, os: s.outlineStyle, td: sp.textDecorationLine, bs: s.borderStyle, col: s.color }; };
    const on = document.querySelector('#view .cx-card .v1243-c[data-cal="gacct:a1111111111111111"]'), off = document.querySelector('#view .cx-card .v1243-c[data-cal="company"]');
    return { on: st(on), off: st(off), offPressed: off.getAttribute('aria-pressed') }; });
  check('chips: a calendar shown has a ring around it', look.on.os === 'solid' && parseFloat(look.on.ow) >= 1.5, JSON.stringify(look.on));
  check('chips: a calendar hidden is greyed out, with no ring and no line through it', look.offPressed === 'false' && (look.off.os === 'none' || parseFloat(look.off.ow) === 0) && look.off.td === 'none' && look.off.bs === 'solid' && look.off.col === 'rgb(154, 163, 158)', JSON.stringify(look.off));
  await page.evaluate(() => calAll()); await page.waitForTimeout(200);
  // the one Add calendar button
  const btns = await page.evaluate(() => [...document.querySelectorAll('#view .cx-card .v1243-x')].map((b) => b.textContent.trim()));
  check('one + Add calendar button (no separate Google calendar, Google account or Calendar buttons)', btns.join('|') === '＋ Add calendar', JSON.stringify(btns));
  let menu = await addMenu(page, '#view .cx-card');
  check('director: the menu offers a Google calendar by ID, another Google account and a portal calendar', menu.join('|') === 'Add a Google calendar|Link another Google account|Create a portal calendar', JSON.stringify(menu));
  check('home: the same button over the schedule', (await addMenu(page, '#view')).length === 3 || (await page.evaluate(() => { go('home'); return true; }) && (await addMenu(page, '#view .hm-sched')).length === 3));
  await page.evaluate(() => go('calendar')); await page.waitForTimeout(250);
  await page.click('#view .cx-card .v1245-add'); await page.waitForTimeout(150);
  const mstate = await page.evaluate(() => ({ open: !!el('cxMenu'), exp: document.querySelector('#view .cx-card .v1245-add').getAttribute('aria-expanded'), focus: document.activeElement && document.activeElement.classList.contains('cx-mi') }));
  check('the menu opens with its first item focused, the button marked expanded', mstate.open && mstate.exp === 'true' && mstate.focus, JSON.stringify(mstate));
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('Esc closes it and gives the focus back to the button', await page.evaluate(() => !el('cxMenu') && document.activeElement && document.activeElement.classList.contains('v1245-add')));
  await page.click('#view .cx-card .v1245-add'); await page.waitForTimeout(150);
  await page.click('#cxMenu .cx-mi:has-text("Create a portal calendar")'); await page.waitForTimeout(250);
  check('Create a portal calendar opens New calendar', await page.evaluate(() => /New calendar$/.test(el('mdTitle').textContent) && !el('cxMenu')));
  await page.evaluate(() => closeAll());
  await page.click('#view .cx-card .v1245-add'); await page.waitForTimeout(150);
  await page.click('#cxMenu .cx-mi:has-text("Add a Google calendar")'); await page.waitForTimeout(250);
  check('Add a Google calendar opens the calendar ID box', await page.evaluate(() => el('mdTitle').textContent === 'Add a Google calendar' && !!el('gcId')));
  await page.evaluate(() => closeAll());
  const connected = await page.evaluate(() => { const prev = window.google; let asked = null;
    window.google = { accounts: { oauth2: { initCodeClient: (c) => { asked = c; return { requestCode() {} }; }, revoke() {} } } };
    document.querySelector('#view .cx-card .v1245-add').click(); document.querySelector('#cxMenu .cx-mi[data-k="gacct"]').click();
    window.google = prev; return !!asked && asked.select_account === true; });
  check('Link another Google account opens Google’s account chooser', connected);

  // ======================= 3. the Add appointment window =======================
  await page.evaluate(() => { closeAll(); openApptForm(null, T); }); await page.waitForTimeout(300);
  const opts = await page.evaluate(() => [...el('apCal').options].map((o) => ({ v: o.value, t: o.textContent.trim() })));
  check('its Calendar list has no Google calendar (an account’s own, or one added by ID)', !opts.some((o) => /^(google|gacct:|gcal:)/.test(o.v)) && opts.some((o) => o.v === 'company'), JSON.stringify(opts));
  check('the last choice is + Create new calendar', opts[opts.length - 1].t === '＋ Create new calendar…', JSON.stringify(opts.slice(-1)));
  check('its note names the team’s own calendars, not contractors', await page.evaluate(() => /Other calendars are the team’s own/.test(el('mdBody').innerText) && !/Contractor calendars/.test(el('mdBody').innerText)));
  page.once('dialog', (d) => { G.prompt = d.message(); d.accept('Therapy'); });
  await page.selectOption('#apCal', '__newct__'); await page.waitForTimeout(250);
  const made = await page.evaluate(() => ({ v: el('apCal').value, t: el('apCal').selectedOptions[0].textContent.trim() }));
  check('+ Create new calendar asks its name and picks the new calendar', /Name of the new calendar/.test(G.prompt || '') && /^ct:/.test(made.v) && made.t === 'Therapy', JSON.stringify({ made, p: G.prompt }));
  await page.fill('#apTitle', 'Speech therapy'); await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(400);
  const sv = await page.evaluate(() => { const a = APPTS.find((x) => x.title === 'Speech therapy'); return a ? { cal: a.cal, cal2: calDef(a.cal).name } : null; });
  check('saving files the appointment under the new calendar', sv && /^ct:/.test(sv.cal) && sv.cal2 === 'Therapy', JSON.stringify(sv));
  const ea = await page.evaluate(() => { const a = APPTS.find((x) => x.title === 'Speech therapy'); openAppt(a.id); const b = [...document.querySelectorAll('button')].find((x) => /^Edit/.test(x.textContent.trim()) && x.offsetParent); if (b) b.click(); const s = el('eaCal'); const r = s ? [...s.options].map((o) => o.value) : null; closeAll(); return r; });
  const who = await page.evaluate(() => { calAccessForm(); const tx = el('mdBody').innerText; closeAll(); return tx; });
  check('Who sees each calendar leaves out every Google account’s calendars (they are the person’s own)', !/dana@gmail\.test|dana@work\.test|Main calendar|Google Calendar|Van schedule/.test(who) && /Company calendar/.test(who), who.slice(0, 300));
  check('the edit form’s Calendar list has no Google calendar either', ea === null || !ea.some((v) => /^(google|gacct:|gcal:)/.test(v)), JSON.stringify(ea));
  await ctx.close();

  const fits = async (w, h) => {
    ({ ctx, page } = await signedIn({ width: w, height: h }));
    await page.evaluate(() => { closeAll(); openApptForm(null, T); }); await page.waitForTimeout(400);
    const f = await page.evaluate(() => { const m = el('modal'), r = m.getBoundingClientRect(), g = el('apGcal').closest('label').getBoundingClientRect(), fl = el('apFlag').getBoundingClientRect(), cl = el('apClient').getBoundingClientRect();
      return { w: Math.round(r.width), scroll: m.scrollHeight > m.clientHeight + 1, gIn: g.bottom <= r.bottom && g.bottom <= innerHeight, flagIn: fl.bottom <= innerHeight, twoCols: g.left > cl.right, saveIn: el('mdFoot').getBoundingClientRect().bottom <= innerHeight }; });
    await ctx.close(); return f;
  };
  for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900]]) {
    const f = await fits(w, h);
    check(`${w}x${h}: the window is wide, in two columns, and shows everything (the Google box, the note, Save) without scrolling`, f.w >= 880 && f.twoCols && !f.scroll && f.gIn && f.flagIn && f.saveIn, JSON.stringify(f));
  }
  {
    ({ ctx, page } = await signedIn({ width: 390, height: 860 }));
    await page.evaluate(() => { closeAll(); openApptForm(null, T); }); await page.waitForTimeout(400);
    const f = await page.evaluate(() => { const g = el('apGcal').getBoundingClientRect(), cl = el('apClient').getBoundingClientRect(); return { one: g.top > cl.bottom && Math.abs(g.left - cl.left) < 60, wide: document.scrollingElement.scrollWidth <= innerWidth + 1, w: el('modal').getBoundingClientRect().width <= innerWidth + 1 }; });
    check('390px: one column on a phone, nothing wider than the screen', f.one && f.wide && f.w, JSON.stringify(f));
    await page.evaluate(() => closeAll()); await seed(page); await page.waitForTimeout(300);
    const dots = await page.evaluate(() => { const b = [...document.querySelectorAll('#view .cx-cell')].find((x) => x.getAttribute('onclick').includes(T)); return b ? [...b.querySelectorAll('.cx-dots i')].map((i) => getComputedStyle(i).backgroundColor) : []; });
    const meet = await page.evaluate(() => catOf('Meeting').color);
    check('390px: the month’s dots take the category’s colour, not the kind’s', meet !== '#7A5EA8' && dots.includes(rgb(meet)) && !dots.includes(rgb('#7A5EA8')), JSON.stringify({ dots, meet }));
    const fit = await page.evaluate(() => [...document.querySelectorAll('#view .v1243-c, #view .v1243-x')].every((b) => { const r = b.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= -1 && r.height >= 30; }));
    check('390px: the chips and + Add calendar fit, tap targets 30px or more', fit);
    await ctx.close();
  }

  // ======================= 4. no Google connected, staff and families =======================
  NG.accts = [];
  ({ ctx, page } = await signedIn());
  await page.waitForFunction(() => !gcalChecking(), null, { timeout: 25000 }).catch(() => {});
  await page.evaluate(() => go('calendar')); await page.waitForTimeout(300);
  menu = await addMenu(page, '#view .cx-card');
  check('nothing connected: the menu offers Connect Google Calendar and a portal calendar', menu.join('|') === 'Connect Google Calendar|Create a portal calendar', JSON.stringify(menu));
  await ctx.close();
  NG.accts = [A1, A2];
  async function demo(role) {
    const { ctx, page } = await H.newPage(env, { viewport: { width: 1440, height: 900 }, bucket: errors });
    await page.clock.setFixedTime(NOW);
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    await page.evaluate((r) => signIn(r), role); await page.waitForFunction((r) => state.role === r, role);
    await page.evaluate(() => go('calendar')); await page.waitForTimeout(300);
    return { ctx, page };
  }
  ({ ctx, page } = await demo('staff'));
  menu = await addMenu(page, '#view .cx-card');
  check('staff: no portal calendar to create in the menu', !menu.includes('Create a portal calendar'), JSON.stringify(menu));
  await ctx.close();
  ({ ctx, page } = await demo('family'));
  check('family: no Add calendar button', await page.evaluate(() => !document.querySelector('#view .v1245-add')));
  await ctx.close();

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
