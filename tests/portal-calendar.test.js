// Calendar and Accountability tests for E-&-G-Home-Inc.html (#2, the care portal), v12.37. Both pages share one
// calendar: Add item opens a colour-coded menu (appointment, event or outing, meeting, shift, reminder or task, where
// someone was); Calendar shows the month with the picked day's plan beside it; List shows every day with something
// on it; the Calendar page also has Week. The legend counts each kind and turns it on or off. Events and meetings can
// be for the whole team (an appointment with no client), which families never see. Checked in the demo view at three
// widths, as a director, a staff member and a family, plus one signed-in save through the Supabase stubs.
// Usage: node tests/portal-calendar.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const NOON = new Date(2026, 9, 22, 10, 0, 0);                         // Thu Oct 22 2026, 10:00 on the page's clock

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  async function demo(view, role, viewport) {
    const { ctx, page } = await H.newPage(env, { viewport: viewport || { width: 1440, height: 900 }, bucket: errors });
    await page.clock.setFixedTime(NOON);
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    if (role) { await page.evaluate((r) => signIn(r), role); await page.waitForFunction((r) => state.role === r, role); }
    await page.evaluate((v) => go(v), view);
    await page.waitForTimeout(300);
    return { ctx, page };
  }
  const pane = (page) => page.evaluate(() => {
    const p = document.querySelector('#view .cx-pane'); if (!p) return null;
    return { day: (p.querySelector('.cx-ph h3') || {}).textContent, date: (p.querySelector('.cx-pd') || {}).textContent,
      rows: [...p.querySelectorAll('.cx-row')].map((r) => ({ k: r.dataset.k, title: r.querySelector('.cx-ti').textContent.trim(), text: r.innerText.replace(/\s+/g, ' ') })),
      text: p.innerText };
  });
  const legend = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#view .cx-lg')].map((b) => { const n = b.querySelector('b').textContent;
    return [b.textContent.replace(n, '').replace(/\s+/g, ' ').trim(), { on: b.getAttribute('aria-pressed') === 'true', n }]; })));
  const openMenu = async (page, sel) => { await page.click(sel || '#view .page-acts .cx-add-b'); await page.waitForTimeout(150);
    return page.evaluate(() => [...document.querySelectorAll('#cxMenu .cx-mi')].map((b) => ({ k: b.dataset.k, t: b.querySelector('b').textContent, c: getComputedStyle(b.querySelector('i')).backgroundColor }))); };
  const modal = (page) => page.evaluate(() => ({ on: el('modal').classList.contains('on'), title: el('mdTitle').textContent.trim() }));
  const noScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);

  // ---------------- 1. the Calendar page, as a director ----------------
  {
    const { ctx, page } = await demo('calendar');
    const head = await page.evaluate(() => ({ acts: [...document.querySelectorAll('#view .page-acts button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
      seg: [...document.querySelectorAll('#view .cx-seg button')].map((b) => b.textContent + (b.classList.contains('active') ? '*' : '')) }));
    check('one Add item button replaces Add shift and Add appointment', head.acts.filter((a) => /Add item/.test(a)).length === 1 && !head.acts.some((a) => /Add shift|Add appointment/.test(a)), JSON.stringify(head.acts));
    check('views: Calendar (picked), Week and List', head.seg.join() === 'Calendar*,Week,List', head.seg.join());
    const items = await openMenu(page);
    check('Add item lists appointment, event, meeting, shift, reminder, where someone was', items.map((i) => i.t).join('|') === 'Appointment|Event or outing|Meeting|Shift|Reminder or task|Where someone was', JSON.stringify(items.map((i) => i.t)));
    check('each kind in the menu has its own colour', new Set(items.map((i) => i.c)).size === items.length, JSON.stringify(items.map((i) => i.c)));
    const menuTop = await page.evaluate(() => ({ head: el('cxMenu').querySelector('.cx-mh').textContent, focus: document.activeElement && document.activeElement.dataset.k }));
    check('the menu says which day it adds to, and the first choice has the focus', /Add to today, Thursday, October 22$/.test(menuTop.head) && menuTop.focus === 'appt', JSON.stringify(menuTop));
    await page.keyboard.press('ArrowDown');
    check('arrow keys move through the menu', await page.evaluate(() => document.activeElement.dataset.k) === 'event');
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    check('Escape closes the menu and goes back to the button', await page.evaluate(() => !el('cxMenu') && document.activeElement.classList.contains('cx-add-b')));
    await openMenu(page); await page.mouse.click(700, 160); await page.waitForTimeout(100);
    check('a click elsewhere closes the menu', await page.evaluate(() => !el('cxMenu')));

    const grid = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector('#view .cx-grid')).gridTemplateColumns.split(' ').length, today: (document.querySelector('#view .cx-cell.is-today .cx-dn') || {}).textContent, on: (document.querySelector('#view .cx-cell.is-on .cx-dn') || {}).textContent, month: document.querySelector('#view .cx-mhead h3').textContent }));
    check('Calendar: the month in seven columns, today marked and picked', grid.cols === 7 && grid.today === '22' && grid.on === '22' && /October 2026/.test(grid.month), JSON.stringify(grid));
    let P = await pane(page);
    check('the day\'s plan sits to the right of the month, for today', !!P && P.day === 'Thursday' && /October 22, 2026 · Today/i.test(P.date), JSON.stringify(P && [P.day, P.date]));
    const side = await page.evaluate(() => { const g = document.querySelector('#view .cx-cal').getBoundingClientRect(), p = document.querySelector('#view .cx-pane').getBoundingClientRect(); return p.left >= g.right - 1 && p.top < g.top + 60; });
    check('...beside it at a computer screen\'s width', side);
    check('the plan lists today\'s appointments, shifts and reminders in time order', P.rows.some((r) => r.k === 'appt') && P.rows.some((r) => r.k === 'shift') && P.rows.some((r) => r.k === 'rem') && P.rows.findIndex((r) => r.k === 'rem') > P.rows.findIndex((r) => r.k === 'appt'), JSON.stringify(P.rows.map((r) => r.k)));
    const shift = P.rows.find((r) => r.k === 'shift');
    check('shifts are grouped (Day shift) with each person on it', !!shift && /Day shift/.test(shift.title) && /on this shift/.test(shift.text), shift && shift.text);
    check('an appointment says its client by UCI only, never a name', P.rows.filter((r) => r.k === 'appt').every((r) => /Client \d{7}/.test(r.text)), JSON.stringify(P.rows.filter((r) => r.k === 'appt').map((r) => r.text)));
    // another day
    const other = await page.evaluate(() => { const a = APPTS.find((x) => x.date && x.date !== T && x.date.slice(0, 7) === T.slice(0, 7) && !x.cancelled && !hid('appt', x.id)); return a ? { d: a.date, title: a.title } : null; });
    await page.click(`#view .cx-cell[onclick*="'${other.d}'"]`); await page.waitForTimeout(250);
    P = await pane(page);
    check('clicking another day shows that day\'s plan', P.rows.some((r) => r.title === other.title) && (await page.evaluate((d) => document.querySelector('#view .cx-cell.is-on').getAttribute('onclick').includes(d), other.d)), JSON.stringify({ other, rows: P.rows.map((r) => r.title) }));
    await page.click('#view .cx-pane .cx-arrow[aria-label="Next day"]'); await page.waitForTimeout(200);
    const nx = await page.evaluate(() => cxDay('calendar'));
    check('the arrows in the plan step a day at a time', nx === new Date(new Date(other.d + 'T12:00:00').getTime() + 864e5).toISOString().slice(0, 10), nx);
    await page.evaluate(() => cxToday('calendar')); await page.waitForTimeout(150);
    // the legend
    let L = await legend(page);
    check('the legend counts appointments, events, meetings, shifts and reminders; accountability is off here', L.Appointments && +L.Appointments.n > 0 && L.Shifts && +L.Shifts.n > 0 && L.Reminders && L.Accountability && !L.Accountability.on, JSON.stringify(L));
    await page.click('#view .cx-lg:has-text("Shifts")'); await page.waitForTimeout(200);
    P = await pane(page); L = await legend(page);
    check('turning Shifts off takes them off the plan and the legend says off', !P.rows.some((r) => r.k === 'shift') && !L.Shifts.on && L.Shifts.n === 'off', JSON.stringify(L.Shifts));
    check('...and it is kept for this person', await page.evaluate(() => ((USER_SET[userKey()].cxoff || {}).calendar || []).includes('shift')));
    await page.click('#view .cx-lg:has-text("Shifts")'); await page.waitForTimeout(150);

    // add an event for the whole team
    await openMenu(page); await page.click('#cxMenu .cx-mi[data-k="event"]'); await page.waitForTimeout(250);
    let f = await page.evaluate(() => ({ title: el('mdTitle').textContent, cl: el('apClient').value, clT: el('apClient').selectedOptions[0].textContent, type: apTypeVal('apType'), date: el('apDate').value, save: document.querySelector('#mdFoot .btn.navy').textContent }));
    check('Event or outing opens the form as Add an event, for the whole team, on the picked day', f.title === 'Add an event' && f.cl === '' && /whole team/.test(f.clT) && f.type === 'Event' && f.date === '2026-10-22' && f.save === 'Save event', JSON.stringify(f));
    await page.fill('#apTitle', 'Bowling night'); await page.evaluate(() => { el('apGcal').checked = false; });
    await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(300);
    const ev = await page.evaluate(() => { const a = APPTS.find((x) => x.title === 'Bowling night'); return a && { cid: a.cid, type: a.type, kind: cxApptKind(a), toast: el('toast').textContent }; });
    P = await pane(page);
    const evRow = P.rows.find((r) => r.title === 'Bowling night');
    check('the event is saved for no one client and says Event saved', !!ev && ev.cid === null && ev.kind === 'event' && /Event saved\./.test(ev.toast), JSON.stringify(ev));
    check('it shows on the plan as an Event for the whole team', !!evRow && evRow.k === 'event' && /Whole team/.test(evRow.text), evRow && evRow.text);
    check('a whole-team event shows on Home\'s schedule too', await page.evaluate(() => hmData().items.some((i) => i.title === 'Bowling night')));
    await page.evaluate(() => { const a = APPTS.find((x) => x.title === 'Bowling night'); editAppt(a.id); });
    await page.waitForTimeout(200);
    f = await page.evaluate(() => ({ cl: el('eaClient').value, txt: el('eaClient').selectedOptions[0].textContent }));
    check('editing it keeps it for the whole team', f.cl === '' && /whole team/.test(f.txt), JSON.stringify(f));
    await page.evaluate(() => saveApptEdit(APPTS.find((x) => x.title === 'Bowling night').id)); await page.waitForTimeout(200);
    check('...and saving the edit leaves it with no client', await page.evaluate(() => APPTS.find((x) => x.title === 'Bowling night').cid === null));
    await page.evaluate(() => closeAll());
    // a meeting
    await openMenu(page); await page.click('#cxMenu .cx-mi[data-k="meeting"]'); await page.waitForTimeout(250);
    f = await page.evaluate(() => ({ title: el('mdTitle').textContent, type: apTypeVal('apType'), lead: el('apProv').previousElementSibling.textContent }));
    check('Meeting opens Add a meeting (type Meeting, Led by)', f.title === 'Add a meeting' && f.type === 'Meeting' && f.lead === 'Led by', JSON.stringify(f));
    await page.fill('#apTitle', 'Weekly team huddle'); await page.evaluate(() => { el('apGcal').checked = false; el('apTime').value = '15:00'; });
    await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(300);
    P = await pane(page);
    check('the meeting shows on the plan as a Meeting', P.rows.some((r) => r.title === 'Weekly team huddle' && r.k === 'meeting'), JSON.stringify(P.rows.map((r) => r.k + ':' + r.title)));
    // an event for one client
    await openMenu(page); await page.click('#cxMenu .cx-mi[data-k="event"]'); await page.waitForTimeout(250);
    const cl1 = await page.evaluate(() => { const c = visibleClients()[0]; el('apClient').value = c.id; el('apTitle').value = 'Park outing'; el('apGcal').checked = false; return c.uci; });
    await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(300);
    P = await pane(page);
    const po = P.rows.find((r) => r.title === 'Park outing');
    check('an event can be for one client, shown by UCI', !!po && po.k === 'event' && po.text.includes('Client ' + cl1), po && po.text);
    // the other choices open their forms on the picked day
    await page.evaluate(() => cxPick('calendar', '2026-10-27')); await page.waitForTimeout(150);
    await openMenu(page, '#view .cx-pane .cx-add-b'); await page.click('#cxMenu .cx-mi[data-k="appt"]'); await page.waitForTimeout(200);
    f = await page.evaluate(() => ({ t: el('mdTitle').textContent, d: el('apDate').value, team: !!el('apClient').querySelector('option[value=""]') }));
    check('Appointment (from the plan) opens Add appointment on that day, with a client needed', f.t === 'Add appointment' && f.d === '2026-10-27' && !f.team, JSON.stringify(f));
    await page.evaluate(() => closeAll());
    await openMenu(page, '#view .cx-pane .cx-add-b'); await page.click('#cxMenu .cx-mi[data-k="shift"]'); await page.waitForTimeout(200);
    f = await page.evaluate(() => ({ t: el('mdTitle').textContent, d: el('shDate').value }));
    check('Shift opens Add a shift on that day', /Add a shift/.test(f.t) && f.d === '2026-10-27', JSON.stringify(f));
    await page.evaluate(() => closeAll());
    await openMenu(page, '#view .cx-pane .cx-add-b'); await page.click('#cxMenu .cx-mi[data-k="rem"]'); await page.waitForTimeout(200);
    f = await page.evaluate(() => ({ t: el('mdTitle').textContent, d: el('ntDue').value }));
    check('Reminder or task opens the task form, due that day', f.t === 'Add a reminder or task' && f.d === '2026-10-27', JSON.stringify(f));
    await page.evaluate(() => closeAll());
    await openMenu(page, '#view .cx-pane .cx-add-b'); await page.click('#cxMenu .cx-mi[data-k="where"]'); await page.waitForTimeout(200);
    f = await page.evaluate(() => ({ t: el('mdTitle').textContent, d: el('acD').value }));
    check('Where someone was opens the accountability form on that day', f.t === 'Where were they?' && f.d === '2026-10-27', JSON.stringify(f));
    await page.evaluate(() => { closeAll(); cxToday('calendar'); });
    // search
    await page.click('#view .cx-q'); await page.keyboard.type('Bowling'); await page.waitForTimeout(500);
    P = await pane(page);
    const kept = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('cx-q') && document.activeElement.value === 'Bowling');
    check('search narrows the plan and the cursor stays in the box', P.rows.length === 1 && P.rows[0].title === 'Bowling night' && kept, JSON.stringify({ rows: P.rows.map((r) => r.title), kept }));
    await page.evaluate(() => { state.calQ = ''; render(); });
    // List and Week
    await page.click('#view .cx-seg button:has-text("List")'); await page.waitForTimeout(250);
    const list = await page.evaluate(() => ({ days: [...document.querySelectorAll('#view .cx-lday')].map((d) => d.querySelector('.cx-ldn b').textContent + ' ' + d.querySelector('em').textContent), adds: document.querySelectorAll('#view .cx-lday .cx-add-b').length, range: (document.querySelector('#view .cx-lbar .active') || {}).textContent }));
    check('List: every day with something on it from today, today first, each with Add item', list.range === 'Upcoming' && /^22 Today/.test(list.days[0]) && list.days.length > 2 && list.adds === list.days.length, JSON.stringify(list));
    check('List: later days say how far off they are', list.days.slice(2).every((d) => /In \d+ days/.test(d)), JSON.stringify(list.days));
    await page.click('#view .cx-lbar button:has-text("Past")'); await page.waitForTimeout(200);
    const past = await page.evaluate(() => [...document.querySelectorAll('#view .cx-lday')].map((d) => d.querySelector('em').textContent));
    check('List: Past shows earlier days, nearest first', past.length > 0 && /Yesterday|days ago/.test(past[0]), JSON.stringify(past));
    check('List view is kept for this person', await page.evaluate(() => (USER_SET[userKey()].cxv || {}).calendar === 'list'));
    await page.click('#view .cx-seg button:has-text("Week")'); await page.waitForTimeout(250);
    const wk = await page.evaluate(() => ({ cols: document.querySelectorAll('#view .cx-wcol').length, today: (document.querySelector('#view .cx-wcol.is-today .cx-wh b') || {}).textContent, below: (() => { const w = document.querySelector('#view .cx-week').getBoundingClientRect(), p = document.querySelector('#view .cx-pane').getBoundingClientRect(); return p.top >= w.bottom - 1; })() }));
    check('Week: seven days with today marked, the day\'s plan below', wk.cols === 7 && wk.today === '22' && wk.below, JSON.stringify(wk));
    await page.click('#view .cx-seg button:has-text("Calendar")'); await page.waitForTimeout(150);
    check('no sideways scrolling at 1440', await noScroll(page));
    // a family never sees whole-team items
    await page.evaluate(() => signIn('family')); await page.waitForTimeout(200); await page.evaluate(() => go('calendar')); await page.waitForTimeout(250);
    const fam = await page.evaluate(() => ({ h1: document.querySelector('#view h1').textContent, add: !!document.querySelector('#view .cx-add-b'), leg: [...document.querySelectorAll('#view .cx-lg')].map((b) => b.textContent.replace(b.querySelector('b').textContent, '').replace(/\s+/g, ' ').trim()), team: cxDayItems('calendar', T).some((i) => /Bowling night|Weekly team huddle/.test(i.title)), shifts: cxDayItems('calendar', T).some((i) => i.k === 'shift' || i.k === 'rem') }));
    check('family: Appointments, no Add item, only appointments, events and meetings', fam.h1 === 'Appointments' && !fam.add && fam.leg.join('|') === 'Appointments|Events|Meetings', JSON.stringify(fam));
    check('family: no whole-team events or meetings, no shifts or reminders', !fam.team && !fam.shifts, JSON.stringify(fam));
    await ctx.close();
  }

  // ---------------- 2. a staff member adds no shifts ----------------
  {
    const { ctx, page } = await demo('calendar', 'staff');
    const items = await openMenu(page);
    check('staff: Add item has everything but Shift', items.map((i) => i.k).join() === 'appt,event,meeting,rem,where', JSON.stringify(items.map((i) => i.k)));
    await ctx.close();
  }

  // ---------------- 3. the Accountability page ----------------
  {
    const { ctx, page } = await demo('acct');
    const head = await page.evaluate(() => ({ acts: [...document.querySelectorAll('#view .page-acts button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), seg: [...document.querySelectorAll('#view .cx-seg button')].map((b) => b.textContent) }));
    check('Accountability: Add item and Calendar / List (no old Add entry)', head.acts.some((a) => /Add item/.test(a)) && !head.acts.some((a) => /Add entry/.test(a)) && head.seg.join() === 'Calendar,List', JSON.stringify(head));
    const items = await openMenu(page);
    check('Accountability: Where someone was comes first in the menu', items[0] && items[0].k === 'where', JSON.stringify(items.map((i) => i.k)));
    await page.keyboard.press('Escape');
    const L = await legend(page);
    check('Accountability: where people were, appointments and events on; shifts, meetings and reminders off', L.Accountability.on && L.Appointments.on && L.Events.on && !L.Shifts.on && !L.Meetings.on && !L.Reminders.on, JSON.stringify(L));
    let P = await pane(page);
    const miss0 = +((P.text.match(/No entry yet for (\d+)/) || [])[1] || 0);
    check('the plan says who has no entry for the day', miss0 > 0, P.text.slice(-200));
    await page.click('#view .cx-pane .cx-add-b'); await page.click('#cxMenu .cx-mi[data-k="where"]'); await page.waitForTimeout(200);
    const uci = await page.evaluate(() => { el('acP').value = 'Horizons day program'; el('acW').value = 'Maria Reyes'; el('acS').value = '09:00'; el('acE').value = '14:00'; return client(el('acC').value).uci; });
    await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(300);
    P = await pane(page);
    const row = P.rows.find((r) => r.k === 'where');
    check('a logged entry shows on the day\'s plan, with Open', !!row && row.title === uci + ' at Horizons day program' && /With Maria Reyes/.test(row.text) && /Open/.test(row.text), row && row.text);
    const miss1 = +((P.text.match(/No entry yet for (\d+)/) || [])[1] || 0);
    check('...and one person fewer has no entry', miss1 === miss0 - 1, miss0 + ' -> ' + miss1);
    check('the month shows how many people have an entry that day', await page.evaluate(() => /^1\/\d+$/.test((document.querySelector('#view .cx-cell.is-on .cx-cov') || {}).textContent || '')));
    await ctx.close();
  }

  // ---------------- 4. tablet and phone widths ----------------
  for (const [w, h] of [[1024, 800], [390, 844]]) {
    const { ctx, page } = await demo('calendar', null, { width: w, height: h });
    const lay = await page.evaluate(() => { const g = document.querySelector('#view .cx-cal').getBoundingClientRect(), p = document.querySelector('#view .cx-pane').getBoundingClientRect(), dots = document.querySelector('#view .cx-cell.is-today .cx-dots'); return { below: p.top >= g.bottom - 1, dots: dots ? getComputedStyle(dots).display : '' }; });
    check(w + ' wide: the day\'s plan goes below the month', lay.below, JSON.stringify(lay));
    check(w + ' wide: no sideways scrolling', await noScroll(page));
    if (w < 600) check('phone: each day shows coloured dots instead of lines', lay.dots === 'flex', lay.dots);
    await page.click('#view .page-acts .cx-add-b'); await page.waitForTimeout(150);
    const m = await page.evaluate(() => { const r = el('cxMenu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; });
    check(w + ' wide: the Add item menu fits on the screen', m);
    await ctx.close();
  }

  // ---------------- 5. signed in: a whole-team event is saved with no client ----------------
  {
    const posts = [];
    const S = { email: 'dana@maple.test', password: 'qa-pass-1234', role: 'director', program: [
      { key: 'users', value: { map: { 'dana@maple.test': { name: 'Dana Director', role: 'director', title: 'Executive Director' } } } },
      { key: 'pilot', value: { signatures: { 'u:dana@maple.test': { by: 'Dana Director', at: 'Oct 1, 2026', role: 'Director' } } } }] };
    const rest = async ({ method, path, body }) => { if (path.startsWith('/rest/v1/np_demo_appointments') && method === 'POST') { posts.push(JSON.parse(body || '{}')); return { status: 201 }; } return undefined; };
    const { ctx, page } = await H.newPage(env, { session: S, rest, bucket: errors });
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
    await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { closeAll(); go('calendar'); }); await page.waitForTimeout(250);
    await page.evaluate(() => cxAdd('meeting', T, 'calendar')); await page.waitForTimeout(200);
    await page.evaluate(() => { el('apTitle').value = 'All-staff meeting'; el('apGcal').checked = false; });
    await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(500);
    const row = posts.find((p) => p.title === 'All-staff meeting');
    check('signed in: the meeting is saved to the team\'s calendar with no client', !!row && row.cid === null && row.type === 'Meeting', JSON.stringify(row));
    check('signed in: it shows on the day\'s plan', (await pane(page)).rows.some((r) => r.title === 'All-staff meeting'));
    await ctx.close();
  }

  const real = errors.filter((e) => !/ResizeObserver/.test(e));
  check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
