// Calendar choices and Google calendars for E-&-G-Home-Inc.html (#2, the care portal), v12.43. A row of calendar chips
// on the Calendar page and over the home page schedule (each calendar the person can see, Google ones included) hides
// or shows a calendar with a click, kept per person; the home page follows those choices and shows the person's
// Google events (list, timeline, month, Next up, Coming up). More Google calendars: one the person owns is added by its
// ID (checked with Google, named as Google names it, renamed, recoloured, removed), and, once the list permissions are
// on (?gcallist=1 for the review video, or GCAL_LIST_LIVE once Google approves), picked from a list that includes
// calendars shared with them. Signed in to a stub account with a Google connection kept on the server; np-gcal and
// Google are answered by the suite. Then the demo view for staff and families, and a phone's width. See tests/README.md.
// Usage: node tests/portal-calendars.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const NOW = new Date(2026, 10, 9, 9, 0, 0);                            // Mon Nov 9 2026, 9:00 on the page's clock
const at = (d, h, m) => new Date(2026, 10, d, h, m || 0).toISOString();
const OWNED = 'https://www.googleapis.com/auth/calendar.events.owned';
const LIST = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const EVRO = 'https://www.googleapis.com/auth/calendar.events.readonly';
const VAN = 'team-van@group.calendar.google.com', SHARED = 'erica-shared@group.calendar.google.com';

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const dir = 'dana@maple.test';
  const S = { email: dir, password: 'qa-pass-1234', role: 'director',
    program: [{ key: 'users', value: { map: { [dir]: { name: 'Dana Director', role: 'director', title: 'Executive Director' } } } },
      { key: 'hidesample', value: { v: true } },
      { key: 'pilot', value: { signatures: { ['u:' + dir]: { by: 'Dana Director', at: 'Oct 1, 2026', role: 'Director' } } } }] };
  const rest = async ({ method, path }) => {
    if (path.startsWith('/auth/v1/token?grant_type=refresh_token')) return { status: 200, body: { access_token: 'qa-access-token', refresh_token: 'qa-refresh-token', expires_in: 3600, token_type: 'bearer', user: { id: 'qa-user', email: dir } } };
    if (path.startsWith('/auth/v1/user')) return { status: 200, body: { id: 'qa-user', email: dir } };
    if (!path.startsWith('/functions/v1/np-gcal')) return null;
    if (method !== 'POST') return { status: 204, body: '' };
    return { status: 200, body: { ready: true, connected: true, email: 'dana@gmail.test', access_token: 'qa-google', expires_in: 3600 } };
  };
  // Google, as the suite says: the main calendar, Dana's van calendar (hers), Erica's (shared with her, readable only
  // with the list permissions), one that isn't hers (403) and one that doesn't exist (404)
  const G = { list: 'ok', denied: new Set(), asked: [] };
  const CAL = {
    primary: { summary: 'dana@gmail.test', items: [
      { id: 'ev1', summary: 'Board call', start: { dateTime: at(9, 14) }, end: { dateTime: at(9, 15) }, htmlLink: 'https://www.google.com/calendar/event?eid=ev1' },
      { id: 'ev2', summary: 'Staff birthday', start: { date: '2026-11-09' }, end: { date: '2026-11-10' }, htmlLink: 'https://www.google.com/calendar/event?eid=ev2' },
      { id: 'ev3', summary: 'Grant deadline', start: { dateTime: at(11, 10) }, end: { dateTime: at(11, 11) }, htmlLink: 'https://www.google.com/calendar/event?eid=ev3' }] },
    [VAN]: { summary: 'Van schedule', items: [
      { id: 'v1', summary: 'Van service', start: { dateTime: at(9, 11, 30) }, end: { dateTime: at(9, 12, 30) }, htmlLink: 'https://www.google.com/calendar/event?eid=v1' }] },
    [SHARED]: { summary: 'Erica’s calendar', items: [
      { id: 's1', summary: 'Site visit', start: { dateTime: at(9, 13) }, end: { dateTime: at(9, 14) }, htmlLink: 'https://www.google.com/calendar/event?eid=s1' }] },
  };
  const google = async (route) => {
    const u = new URL(route.request().url());
    G.asked.push(u.pathname + u.search);
    const send = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname.endsWith('/users/me/calendarList')) {
      if (G.list !== 'ok') return send(403, { error: { code: 403, message: 'Request had insufficient authentication scopes.' } });
      return send(200, { items: [{ id: 'dana@gmail.test', summary: 'dana@gmail.test', backgroundColor: '#4285f4', accessRole: 'owner', primary: true },
        { id: VAN, summary: 'Van schedule', backgroundColor: '#7986cb', accessRole: 'owner' },
        { id: SHARED, summary: 'Erica’s calendar', backgroundColor: '#e67c73', accessRole: 'reader' },
        { id: 'bad id"><img src=x>', summary: 'Not an id', accessRole: 'reader' }] });
    }
    const m = u.pathname.match(/\/calendar\/v3\/calendars\/([^/]+)\/events/);
    if (!m) return send(404, {});
    const id = decodeURIComponent(m[1]), c = CAL[id];
    if (!c) return send(/notmine/.test(id) ? 403 : 404, { error: { code: 404, message: 'Not Found' } });
    if (G.denied.has(id)) return send(403, { error: { code: 403, message: 'Forbidden' } });
    if (u.searchParams.get('fields') === 'summary') return send(200, { summary: c.summary });
    return send(200, { summary: c.summary, items: c.items });
  };

  const booted = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  const signedIn = async (url) => {
    const { ctx, page } = await H.newPage(env, { session: S, bucket: errors, rest });
    await page.clock.setFixedTime(NOW);
    await page.route('https://www.googleapis.com/calendar/**', google);
    await page.goto(env.BASE + '/portal.html' + (url || ''), { waitUntil: 'load' }); await booted(page);
    await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 20000 });
    await page.waitForFunction(() => GCAL.connected && GCAL.events.length > 0, null, { timeout: 15000 }).catch(() => {});
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
  const chips = (page, scope) => page.evaluate((s) => [...document.querySelectorAll(s + ' .v1243-c')].map((b) => ({ n: b.textContent.trim(), on: b.getAttribute('aria-pressed') === 'true' })), scope);
  const chipBtns = (page, scope) => page.evaluate((s) => [...document.querySelectorAll(s + ' .v1243-x')].map((b) => b.textContent.trim()), scope);
  // v12.45: one ＋ Add calendar button; its menu's items
  const addMenu = async (page, scope) => { const b = await page.$(scope + ' .v1245-add'); if (!b) return []; await b.click(); await page.waitForTimeout(150);
    const it = await page.evaluate(() => [...document.querySelectorAll('#cxMenu .cx-mi b')].map((x) => x.textContent.trim())); await page.evaluate(() => cxMenuClose()); return it; };
  const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#view .hm-sched .hm-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  const clickChip = async (page, scope, name) => { await page.click(`${scope} .v1243-c:has-text("${name}")`); await page.waitForTimeout(250); };
  const homeCfg = (page, sched) => page.evaluate((v) => { hmOwnSave(Object.assign(hmClean(hmCfg(true)), { sched: v })); render(); }, sched);
  const pane = (page) => page.evaluate(() => [...document.querySelectorAll('#view .cx-pane .cx-row')].map((r) => ({ k: r.dataset.k, t: r.innerText.replace(/\s+/g, ' ').trim() })));
  const saved = (k) => { const r = S.program.find((x) => x.key === 'usersettings'); return r && r.value && r.value.map && r.value.map[dir] ? r.value.map[dir][k] : undefined; };

  // ======================= 1. signed in, Google connected =======================
  const { ctx, page } = await signedIn();
  check('the page is on Monday Nov 9 with the Google connection kept', await page.evaluate(() => T === '2026-11-09' && GCAL.connected && GCAL.kept), await page.evaluate(() => [T, GCAL.connected, GCAL.kept].join()));
  check('the main Google calendar was read', G.asked.some((a) => a.startsWith('/calendar/v3/calendars/primary/events')));

  // ---- the home page, list ----
  let R = await rows(page);
  check('home: Today’s schedule lists the Google event at its time', R.some((r) => /^2:00 PM Board call/.test(r)), JSON.stringify(R));
  check('home: an all-day Google event says All day', R.some((r) => /^All day Staff birthday/.test(r)), JSON.stringify(R));
  check('home: Google events say which calendar they are from', R.filter((r) => /Board call|Staff birthday/.test(r)).every((r) => /Google Calendar/.test(r)), JSON.stringify(R));
  check('home: an appointment on a person’s own calendar names it; the team’s calendar is not named', R.some((r) => /Supervision with Lee.*Dana’s calendar/.test(r)) && R.some((r) => /Team huddle/.test(r) && !/calendar/i.test(r)), JSON.stringify(R));
  const kinds = await page.evaluate(() => [...document.querySelectorAll('#view .hm-chips .hm-chip')].map((b) => b.textContent.trim()));
  check('home: the kinds above the list count Google Calendar', kinds.includes('Google Calendar · 2'), JSON.stringify(kinds));
  let C = await chips(page, '#view .hm-sched');
  check('home: the calendar chips sit over the schedule: the team’s, the person’s and Google', C.map((c) => c.n).join('|') === 'Company calendar|Dana’s calendar|Google Calendar' && C.every((c) => c.on), JSON.stringify(C));
  check('home: + Add calendar over the schedule offers Add a Google calendar (v12.45)', (await chipBtns(page, '#view .hm-sched')).includes('＋ Add calendar') && (await addMenu(page, '#view .hm-sched')).includes('Add a Google calendar'));
  let nx = await page.evaluate(() => (document.querySelector('#view .hm-next') || {}).innerText || '');
  check('home: Next up is the next thing on the calendars shown (the 10:30 huddle)', /Team huddle/.test(nx), nx);

  // hide Google
  await clickChip(page, '#view .hm-sched', 'Google Calendar');
  R = await rows(page); C = await chips(page, '#view .hm-sched');
  check('home: hiding Google Calendar takes its events off the schedule', !R.some((r) => /Board call|Staff birthday/.test(r)) && R.some((r) => /Team huddle/.test(r)), JSON.stringify(R));
  check('home: the hidden chip stays, marked off, with Show all', C.find((c) => c.n === 'Google Calendar').on === false && (await chipBtns(page, '#view .hm-sched')).includes('Show all'), JSON.stringify(C));
  check('the choice is kept for this person (saved with their settings)', JSON.stringify(saved('calsOff')) === '["google"]', JSON.stringify(saved('calsOff')));
  await page.evaluate(() => go('calendar')); await page.waitForTimeout(300);
  C = await chips(page, '#view .cx-card');
  let P = await pane(page);
  check('Calendar page: the same choice holds there (Google off, no Google events in the day’s plan)', C.find((c) => c.n === 'Google Calendar').on === false && !P.some((r) => r.k === 'google'), JSON.stringify({ C, P }));
  const dirMenu = await addMenu(page, '#view .cx-card');
  check('Calendar page: the chips are labelled Calendars, with one + Add calendar: a Google calendar or a portal calendar for a director (v12.45)',
    await page.evaluate(() => (document.querySelector('#view .cx-card .v1243-cl') || {}).textContent === 'Calendars') && (await chipBtns(page, '#view .cx-card')).join('|') === 'Show all|＋ Add calendar'
      && dirMenu.join('|') === 'Add a Google calendar|Create a portal calendar',
    JSON.stringify({ btns: await chipBtns(page, '#view .cx-card'), dirMenu }));
  await clickChip(page, '#view .cx-card', 'Google Calendar');
  P = await pane(page);
  check('Calendar page: an appointment on a person’s own calendar with no client doesn’t say Whole team', P.some((r) => /Supervision with Lee/.test(r.t) && /Dana’s calendar/.test(r.t) && !/Whole team/.test(r.t)) && P.some((r) => /Team huddle/.test(r.t) && /Whole team/.test(r.t)), JSON.stringify(P));
  check('Calendar page: turning Google back on puts its events in the plan, named by calendar', P.some((r) => r.k === 'google' && /Board call/.test(r.t) && /Google Calendar/i.test(r.t)), JSON.stringify(P));
  check('...and the choice is saved again', JSON.stringify(saved('calsOff')) === '[]', JSON.stringify(saved('calsOff')));
  await page.evaluate(() => go('home')); await page.waitForTimeout(250);

  // hide the team's calendar: the tile and Next up follow, Next up can be a Google event
  await clickChip(page, '#view .hm-sched', 'Company calendar');
  R = await rows(page);
  const tile = await page.evaluate(() => { const t = [...document.querySelectorAll('#view .hm-tile')].find((x) => /Appointments today/.test(x.textContent)); return t ? t.innerText.replace(/\s+/g, ' ') : ''; });
  nx = await page.evaluate(() => (document.querySelector('#view .hm-next') || {}).innerText.replace(/\s+/g, ' ') || '');
  check('home: hiding the team’s calendar takes its appointment off the schedule', !R.some((r) => /Team huddle/.test(r)), JSON.stringify(R));
  check('home: the appointments tile counts only what is shown, and never a Google event as an appointment', /Appointments today 1 Next at 4:00 PM/.test(tile), tile);
  check('home: Next up can be a Google event, with its calendar and Open in Google Calendar', /Board call/.test(nx) && /Google Calendar/.test(nx) && /Open in Google Calendar/.test(nx), nx);
  await page.click('#view .hm-next a'); await page.waitForTimeout(150);
  check('home: Open in Google Calendar opens the event in Google', (await page.evaluate(() => window.__opened.slice(-1)[0])) === 'https://www.google.com/calendar/event?eid=ev1');
  await page.click('#view .hm-sched .v1243-x:has-text("Show all")'); await page.waitForTimeout(250);
  check('home: Show all brings every calendar back', (await chips(page, '#view .hm-sched')).every((c) => c.on) && (await rows(page)).some((r) => /Team huddle/.test(r)));
  await page.click('#view .hm-sched .hm-row:has-text("Board call")'); await page.waitForTimeout(150);
  check('home: a Google event on the schedule opens in Google', (await page.evaluate(() => window.__opened.slice(-1)[0])) === 'https://www.google.com/calendar/event?eid=ev1');

  // ---- timeline and month ----
  await homeCfg(page, 'timeline'); await page.waitForTimeout(250);
  const tl = await page.evaluate(() => ({ lanes: [...document.querySelectorAll('#view .hm-tl-ln b')].map((b) => b.textContent), bars: [...document.querySelectorAll('#view .hm-bar')].map((b) => b.textContent.trim()),
    chips: document.querySelectorAll('#view .hm-sched .v1243-c').length }));
  check('home timeline: a Google Calendar lane with its events, and the calendar chips', tl.lanes.includes('Google Calendar') && tl.bars.some((b) => /Board call/.test(b)) && tl.bars.some((b) => /All day · Staff birthday/.test(b)) && tl.chips === 3, JSON.stringify(tl));
  await clickChip(page, '#view .hm-sched', 'Google Calendar');
  check('home timeline: hiding Google takes its lane away', !(await page.evaluate(() => [...document.querySelectorAll('#view .hm-tl-ln b')].map((b) => b.textContent))).includes('Google Calendar'));
  await clickChip(page, '#view .hm-sched', 'Google Calendar');
  await homeCfg(page, 'month'); await page.waitForTimeout(250);
  await page.click('#view .hm-day[aria-label^="Wednesday, November 11"]'); await page.waitForTimeout(200);
  const md = await page.evaluate(() => (document.querySelector('#view .hm-mon-day') || {}).innerText || '');
  check('home month: another day lists its Google events, named by calendar', /Grant deadline/.test(md) && /Google Calendar/.test(md), md);
  check('home month: the day shows a dot for it', await page.evaluate(() => document.querySelector('#view .hm-day[aria-label^="Wednesday, November 11"]').getAttribute('aria-label').includes('1 item')));
  await homeCfg(page, 'list'); await page.waitForTimeout(250);
  const coming = await page.evaluate(() => (document.querySelector('#view .hm-coming') || {}).innerText || '');
  check('home: Coming up lists the next Google event with its calendar', /Grant deadline/.test(coming) && /Google Calendar/.test(coming), coming);

  // ======================= 2. another Google calendar, by its ID =======================
  await page.click('#view .hm-sched .v1245-add'); await page.waitForTimeout(150);
  await page.click('#cxMenu .cx-mi:has-text("Add a Google calendar")'); await page.waitForTimeout(250);
  const form = await page.evaluate(() => ({ t: el('mdTitle').textContent, box: !!el('gcId'), how: (document.querySelector('#modal .v1243-how') || {}).innerText || '', focus: document.activeElement && document.activeElement.id }));
  check('+ Google calendar opens Add a Google calendar, with the ID box (focused) and where to find the ID', form.t === 'Add a Google calendar' && form.box && /Integrate calendar/.test(form.how) && form.focus === 'gcId', JSON.stringify(form));
  const tryId = async (v) => { await page.fill('#gcId', v); await page.click('#gcIdGo'); await page.waitForTimeout(300); return page.evaluate(() => el('gcIdMsg').textContent); };
  check('an empty box asks for the ID', /Paste the calendar’s ID first/.test(await tryId('')));
  check('text with spaces is not an ID', /doesn’t look like a calendar ID/.test(await tryId('my van calendar')));
  check('the main calendar’s address says it already shows', /That’s your main Google calendar/.test(await tryId('dana@gmail.test')));
  check('an ID Google doesn’t know says so', /Google has no calendar with that ID/.test(await tryId('nothere@group.calendar.google.com')));
  check('a calendar that isn’t the person’s says only their own can be added', /isn’t yours.*Only calendars you own/.test(await tryId('notmine@group.calendar.google.com')));
  check('a refused ID adds nothing', (saved('gcals') || []).length === 0);
  await page.fill('#gcId', 'https://calendar.google.com/calendar/embed?src=' + encodeURIComponent(VAN) + '&ctz=America%2FLos_Angeles');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !el('modal').classList.contains('on'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => GCAL.events.some((g) => g.title === 'Van service'), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  const toastT = await page.evaluate(() => el('toastTxt').textContent);
  check('an embed link works too: the calendar is added under the name Google gives it', /^Van schedule added/.test(toastT), toastT);
  check('it is saved with the person’s settings (ID, name, colour)', JSON.stringify((saved('gcals') || []).map((x) => [x.id, x.name, /^#[0-9a-f]{6}$/i.test(x.color)])) === JSON.stringify([[VAN, 'Van schedule', true]]), JSON.stringify(saved('gcals')));
  R = await rows(page); C = await chips(page, '#view .hm-sched');
  check('its events show on the home page, named by calendar', R.some((r) => /^11:30 AM Van service/.test(r) && /Van schedule/.test(r)), JSON.stringify(R));
  check('it gets a chip of its own', C.some((c) => c.n === 'Van schedule' && c.on), JSON.stringify(C));
  await page.evaluate(() => go('calendar')); await page.waitForTimeout(300);
  P = await pane(page);
  check('Calendar page: its events are in the day’s plan, named by calendar', P.some((r) => r.k === 'google' && /Van service/.test(r.t) && /Van schedule/i.test(r.t)), JSON.stringify(P));
  check('Calendar page: it has a chip there too', (await chips(page, '#view .cx-card')).some((c) => c.n === 'Van schedule'));
  await page.evaluate(() => gcalAddForm()); await page.waitForTimeout(200);
  check('adding the same calendar again says it is already added', /already added/.test(await tryId(VAN)));
  await page.evaluate(() => closeAll());
  check('an extra Google calendar’s event never opens the editor that writes to the main calendar (openAppt sends it to Google)', await page.evaluate(() => { const g = GCAL.events.find((x) => x.title === 'Van service'); closeAll(); window.__opened = []; openAppt(g.id); const ok = window.__opened[0] === 'https://www.google.com/calendar/event?eid=v1' && !document.querySelector('#geTitle'); closeAll(); return ok; }));
  check('a portal appointment can’t be booked onto a Google calendar (it isn’t in the calendar picker)', await page.evaluate(() => !calSelect('x').includes('gcal:') && !calSelect('x').includes('value="google"')));
  check('Google calendars stay out of Who sees each calendar (they are the person’s own)', await page.evaluate(() => { calAccessForm(); const t = el('modal').innerText; closeAll(); return !/Van schedule|Google Calendar/.test(t); }));

  // the settings window lists them; rename and recolour; hide; a calendar that stops being readable; remove
  await page.evaluate(() => settingsHub('cal', 'calendar')); await page.waitForTimeout(200);
  let card = await page.evaluate(() => (document.querySelector('#modal [data-gcals]') || {}).innerText || '');
  check('settings: Your Google calendars lists the main one (with its address) and Van schedule', /Your Google calendars/i.test(card) && /Google Calendar\s+Your main calendar · dana@gmail\.test/.test(card) && /Van schedule/.test(card), card);
  await page.click('#modal [data-gcals] button[title="Rename or recolor"]'); await page.waitForTimeout(200);
  check('✎ opens Edit Google calendar', await page.evaluate(() => /Edit Google calendar$/.test(el('mdTitle').textContent) && el('gpName').value === 'Van schedule'));
  await page.fill('#gpName', 'Van'); await page.evaluate(() => { window._gp.name = 'Van'; window._gp.color = PICK_COLORS[3]; });
  await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(250);
  check('the new name and colour are saved and show on the chips', saved('gcals')[0].name === 'Van' && saved('gcals')[0].color.toLowerCase() === (await page.evaluate(() => PICK_COLORS[3])).toLowerCase()
    && (await chips(page, '#view .cx-card')).some((c) => c.n === 'Van'), JSON.stringify(saved('gcals')));
  await page.evaluate(() => go('home')); await page.waitForTimeout(250);
  await clickChip(page, '#view .hm-sched', 'Van');
  check('hiding it takes its events off the home page', !(await rows(page)).some((r) => /Van service/.test(r)));
  check('what is hidden is left out of what Ask Spectrum reads and of the reminders', await page.evaluate(() => !upcomingReminders().some((x) => /Van service/.test(JSON.stringify(x)))));
  await clickChip(page, '#view .hm-sched', 'Van');
  G.denied.add(VAN);
  await page.evaluate(() => gcalFetch(true)); await page.waitForTimeout(500);
  await page.evaluate(() => settingsHub('cal', 'calendar')); await page.waitForTimeout(200);
  card = await page.evaluate(() => (document.querySelector('#modal [data-gcals]') || {}).innerText || '');
  check('settings: a calendar Google stops letting the portal read says so', /Van\s+Can’t be read with this Google account/.test(card), card);
  G.denied.delete(VAN);
  await page.click('#modal [data-gcals] button[title="Remove from the portal"]'); await page.waitForTimeout(250);
  check('✕ removes it: gone from the saved list and the window, nothing changed in Google', (saved('gcals') || []).length === 0 && !(await page.evaluate(() => /Van/.test((document.querySelector('#modal [data-gcals]') || {}).innerText || '')))
    && /removed from the portal\. Nothing changed in Google/.test(await page.evaluate(() => el('toastTxt').textContent)));
  await page.evaluate(() => closeAll());
  check('...and from the home page and the chips', !(await rows(page)).some((r) => /Van service/.test(r)) && !(await chips(page, '#view .hm-sched')).some((c) => /Van/.test(c.n)));

  // ======================= 3. the picker (the list permissions) =======================
  const scopes = () => page.evaluate(() => {
    const seen = [], prev = window.google;
    window.google = { accounts: { oauth2: {
      initCodeClient: (c) => { seen.push(c.scope); return { requestCode() {} }; },
      initTokenClient: (c) => { seen.push(c.scope); return { requestAccessToken() {} }; }, revoke() {} } } };
    const keep = { c: GCAL.connected, r: GCAL.ready, l: GCAL.loading };
    GCAL.loading = false; GCAL.ready = null; gcalConnect(); GCAL.ready = false; gcalConnect();
    GCAL.ready = keep.r; GCAL.loading = keep.l; window.google = prev;
    return seen;
  });
  let sc = await scopes();
  check('picker off (the default): connecting asks only for events on the person’s own calendars', sc.length === 2 && sc[0] === 'openid ' + OWNED && sc[1] === OWNED, JSON.stringify(sc));
  check('picker off: + Google calendar opens the ID box', await page.evaluate(async () => { gcalAddForm(); await new Promise((r) => setTimeout(r, 150)); const t = el('mdTitle').textContent; closeAll(); return t === 'Add a Google calendar'; }));
  await ctx.close();

  // turned on for this device, as for the review video
  const B = await signedIn('?gcallist=1');
  const p2 = B.page;
  check('?gcallist=1 turns the picker on for this device', await p2.evaluate(() => gcalListOn() && localStorage.getItem('np_gcal_list') === '1'));
  sc = await p2.evaluate(() => { const seen = [], prev = window.google;
    window.google = { accounts: { oauth2: { initCodeClient: (c) => { seen.push(c.scope); return { requestCode() {} }; }, initTokenClient: (c) => { seen.push(c.scope); return { requestAccessToken() {} }; }, revoke() {} } } };
    GCAL.loading = false; const r = GCAL.ready; GCAL.ready = null; gcalConnect(); GCAL.ready = r; window.google = prev; return seen; });
  check('picker on: connecting also asks to see the calendar list and events on calendars shared with the person (read only)', sc[0] === ['openid', OWNED, LIST, EVRO].join(' '), JSON.stringify(sc));
  check('picker on: never the wider calendar.events or calendar.readonly', !sc[0].split(' ').some((s) => /\/calendar\.events$|\/calendar\.readonly$|\/calendar$/.test(s)), sc[0]);
  await p2.evaluate(() => gcalAddForm()); await p2.waitForTimeout(400);
  const pk = await p2.evaluate(() => ({ t: el('mdTitle').textContent, rows: [...document.querySelectorAll('#modal .v1243-pk')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()), html: el('modal').innerHTML.includes('<img') }));
  check('picker: + Google calendar lists the person’s other calendars, theirs and shared, never the main one', pk.t === 'Add Google calendars' && pk.rows.join('|') === 'Van schedule Yours|Erica’s calendar Shared with you', JSON.stringify(pk));
  check('picker: an entry whose ID isn’t a calendar ID is left out, and nothing in it becomes markup', !pk.html && !pk.rows.some((r) => /Not an id/.test(r)));
  await p2.check('#modal [data-gcp="1"]'); await p2.click('#mdFoot .btn.navy');
  await p2.waitForFunction(() => GCAL.events.some((g) => g.title === 'Site visit'), null, { timeout: 5000 }).catch(() => {});
  await p2.waitForTimeout(250);
  check('picker: ticking a shared calendar adds it, under its Google name and colour', JSON.stringify((saved('gcals') || []).map((x) => [x.id, x.name, x.color])) === JSON.stringify([[SHARED, 'Erica’s calendar', '#e67c73']]), JSON.stringify(saved('gcals')));
  check('picker: its events show on the home page', (await rows(p2)).some((r) => /^1:00 PM Site visit/.test(r) && /Erica’s calendar/.test(r)), JSON.stringify(await rows(p2)));
  await p2.evaluate(() => gcalAddForm()); await p2.waitForTimeout(400);
  check('picker: opened again, the calendars shown are ticked', await p2.evaluate(() => document.querySelector('#modal [data-gcp="1"]').checked && !document.querySelector('#modal [data-gcp="0"]').checked));
  await p2.uncheck('#modal [data-gcp="1"]'); await p2.click('#mdFoot .btn.navy'); await p2.waitForTimeout(300);
  check('picker: unticking takes it away', (saved('gcals') || []).length === 0 && !(await rows(p2)).some((r) => /Site visit/.test(r)));
  G.list = 'no';
  await p2.evaluate(() => gcalAddForm()); await p2.waitForTimeout(400);
  const fb = await p2.evaluate(() => ({ t: el('mdTitle').textContent, m: el('gcIdMsg') && el('gcIdMsg').textContent }));
  check('picker: without the list permission granted, it says to reconnect and offers the ID box', fb.t === 'Add a Google calendar' && /disconnect Google Calendar and connect it again/.test(fb.m), JSON.stringify(fb));
  await p2.evaluate(() => closeAll());
  await p2.goto(env.BASE + '/portal.html?gcallist=0', { waitUntil: 'load' }); await booted(p2);
  check('?gcallist=0 turns it off again', await p2.evaluate(() => !gcalListOn() && localStorage.getItem('np_gcal_list') === null));
  G.list = 'ok';
  await B.ctx.close();

  // ======================= 4. staff and family (demo view), and a phone =======================
  async function demo(role, viewport) {
    const { ctx, page } = await H.newPage(env, { viewport: viewport || { width: 1440, height: 900 }, bucket: errors });
    await page.clock.setFixedTime(NOW);
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    if (role) { await page.evaluate((r) => signIn(r), role); await page.waitForFunction((r) => state.role === r, role); }
    await page.evaluate(() => go('home')); await page.waitForTimeout(300);
    return { ctx, page };
  }
  {
    const { ctx, page } = await demo('staff');
    C = await chips(page, '#view .hm-sched');
    check('staff: chips for the team’s calendar and their own, and no portal calendar to create', C.length >= 2 && C[0].n === 'Company calendar' && !(await addMenu(page, '#view .hm-sched')).includes('Create a portal calendar'), JSON.stringify(C));
    await page.evaluate(() => go('calendar')); await page.waitForTimeout(250);
    check('staff: on the Calendar page too, with no portal calendar to create', (await chips(page, '#view .cx-card')).length >= 2 && !(await addMenu(page, '#view .cx-card')).includes('Create a portal calendar'));
    await page.evaluate(() => go('home')); await page.waitForTimeout(250);
    const own = C.find((c) => c.n !== 'Company calendar').n;
    await clickChip(page, '#view .hm-sched', 'Company calendar');
    check('staff: hiding the team’s calendar keeps their own', (await chips(page, '#view .hm-sched')).find((c) => c.n === own).on);
    await ctx.close();
  }
  {
    const { ctx, page } = await demo('family');
    const btns = await chipBtns(page, '#view .hm-sched');
    check('family: no add buttons over the schedule', !btns.some((b) => /＋/.test(b)), JSON.stringify(btns));
    await ctx.close();
  }
  for (const w of [390, 768]) {
    const { ctx, page } = await demo(null, { width: w, height: 860 });
    const fit = async () => page.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth <= innerWidth + 1,
      chips: [...document.querySelectorAll('#view .v1243-c, #view .v1243-x')].every((b) => { const r = b.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= -1 && r.height >= 30; }) }));
    let f = await fit();
    check(`${w}px: home: the calendar chips fit (tap targets 30px or more) and the page doesn’t scroll sideways`, f.scroll && f.chips, JSON.stringify(f));
    await page.evaluate(() => go('calendar')); await page.waitForTimeout(250);
    f = await fit();
    check(`${w}px: Calendar page: the same`, f.scroll && f.chips, JSON.stringify(f));
    await page.evaluate(() => { GCAL.connected = true; GCAL.email = 'demo@gmail.test'; gcalIdForm(); }); await page.waitForTimeout(200);
    const md = await page.evaluate(() => { const b = el('modal').querySelector('.modal, .md, [role="dialog"]') || el('modal').firstElementChild; const r = b.getBoundingClientRect(); return { w: r.width <= innerWidth + 1, box: el('gcId').getBoundingClientRect().right <= innerWidth }; });
    check(`${w}px: Add a Google calendar fits the screen`, md.w && md.box, JSON.stringify(md));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n'));
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
