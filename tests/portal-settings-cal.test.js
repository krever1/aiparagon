// Care portal v12.46 (Erica's Loom and note of Nov 10 on Settings > Calendar integrations). The calendar tab has
// sub-tabs like Display settings (Calendars | Appointment types | Clients); Calendars lists the team's calendars
// (never a Google one) with one + Add calendar button; no Contractors, Access, New calendar or "Calendars and
// filters"; a calendar's own page renames, recolors, sets who sees it and deletes it (asking first, its
// appointments go to the team calendar); windows opened from Settings have Back and go back to Settings after a
// save; appointment types moved here from Display settings; each client (by UCI) gets a color that is saved and
// read back after a reload; the client filter is on the Calendar page. Signed in to a stub team with one Google
// account kept by np-gcal (answered by the suite), then the demo view for staff, and a phone.
// See tests/README.md. Usage: node tests/portal-settings-cal.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const NOW = new Date(2026, 10, 10, 9, 0, 0);                           // Tue Nov 10 2026, 9:00 on the page's clock
const at = (d, h, m) => new Date(2026, 10, d, h, m || 0).toISOString();
const A1 = { id: 'a1111111111111111', email: 'dana@gmail.test', tok: 'tokA' };

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const dir = 'dana@maple.test';
  const S = { email: dir, password: 'qa-pass-1234', role: 'director',
    program: [{ key: 'users', value: { map: { [dir]: { name: 'Dana Director', role: 'director', title: 'Executive Director' } } } },
      { key: 'org', value: { name: 'Maple Care' } },
      { key: 'hidesample', value: { v: true } },
      { key: 'contractors', value: { list: [{ id: 'misc1', name: 'Misc Calendar', color: '#D61FB0' }] } },
      { key: 'pilot', value: { signatures: { ['u:' + dir]: { by: 'Dana Director', at: 'Oct 1, 2026', role: 'Director' } } } }] };
  const row = (k) => { const r = S.program.find((x) => x.key === k); return r ? r.value : undefined; };

  // np-gcal v4 with one account (as on the live portal), multi on
  const NG = { accts: [A1], n: 0 };
  const minted = (a) => ({ id: a.id, email: a.email, access_token: a.tok + '-' + (++NG.n), expires_in: 3600 });
  const base = () => ({ ready: true, multi: true, max: 5 });
  const rest = async ({ method, path, body }) => {
    if (path.startsWith('/auth/v1/token?grant_type=refresh_token')) return { status: 200, body: { access_token: 'qa-access-token', refresh_token: 'qa-refresh-token', expires_in: 3600, token_type: 'bearer', user: { id: 'qa-user', email: dir } } };
    if (path.startsWith('/auth/v1/user')) return { status: 200, body: { id: 'qa-user', email: dir } };
    if (!path.startsWith('/functions/v1/np-gcal')) return null;
    if (method !== 'POST') return { status: 204, body: '' };
    const b = JSON.parse(body || '{}');
    if (b.action === 'token') {
      if (!NG.accts.length) return { status: 200, body: { ...base(), connected: false, accounts: [] } };
      if (b.all) { const out = NG.accts.map(minted); return { status: 200, body: { ...base(), connected: true, accounts: out, account: out[0].id, email: out[0].email, access_token: out[0].access_token, expires_in: 3600 } }; }
      const a = NG.accts.find((x) => x.id === b.account) || NG.accts[0]; const m = minted(a);
      return { status: 200, body: { ...base(), connected: true, account: a.id, email: a.email, access_token: m.access_token, expires_in: 3600 } };
    }
    return { status: 400, body: { error: 'Unknown action.' } };
  };
  const google = async (route) => {
    const u = new URL(route.request().url());
    const send = (status, b) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (/\/calendars\/primary\/events/.test(u.pathname)) return send(200, { summary: '', items: [{ id: 'ea1', summary: 'Board call', start: { dateTime: at(10, 14) }, end: { dateTime: at(10, 15) }, htmlLink: 'https://www.google.com/calendar/event?eid=ea1' }] });
    return send(404, {});
  };

  const booted = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  const signedIn = async (viewport) => {
    const { ctx, page } = await H.newPage(env, { session: S, bucket: errors, rest, viewport: viewport || { width: 1440, height: 1000 } });
    await page.clock.setFixedTime(NOW);
    await page.route('https://www.googleapis.com/calendar/**', google);
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 20000 });
    await page.waitForFunction(() => GCAL.connected && !GCAL.loading, null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => {
      window.open = () => null;
      CLIENTS.push({ id: 'qa-c1', uci: '4023999', name: 'Client 4023999', init: '99', home: '' }, { id: 'qa-c2', uci: '4023888', name: 'Client 4023888', init: '88', home: '' });
      STAFF.push({ id: 'qa-s1', name: 'Jo Rivera', init: 'JR', role: 'DSP' }, { id: 'qa-s2', name: 'Sam Lee', init: 'SL', role: 'DSP' });
      APPTS.push({ id: 'qa-m1', cid: 'qa-c1', title: 'Speech therapy', type: 'Dental', date: T, time: '10:00', dur: 60, cal: 'ct:misc1', notes: [], files: [] },
        { id: 'qa-m2', cid: 'qa-c2', title: 'Van ride', type: 'Transport', date: T, time: '13:00', dur: 30, cal: 'ct:misc1', notes: [], files: [] },
        { id: 'qa-t1', cid: 'qa-c1', title: 'Team lunch', type: 'Meeting', date: T, time: '12:00', dur: 30, cal: 'company', notes: [], files: [] });
      closeAll(); go('calendar');
    });
    await page.waitForTimeout(300);
    return { ctx, page };
  };
  const md = (page) => page.evaluate(() => ({ title: el('mdTitle').textContent.replace(/\s+/g, ' ').trim(), back: !!el('mdTitle').querySelector('.md-back'), body: el('mdBody').innerText, foot: el('mdFoot').innerText, open: el('modal').classList.contains('on') }));
  const gear = async (page) => { await page.evaluate(() => closeAll()); await page.waitForTimeout(150); await page.locator('#view button.gear').first().click(); await page.waitForTimeout(250);
    await page.locator('#modal .set-tab:has-text("Calendar integrations")').click(); await page.waitForTimeout(250); };
  const subTabs = (page) => page.evaluate(() => [...document.querySelectorAll('#modal .v1246-seg button')].map((b) => ({ t: b.textContent.trim(), on: b.classList.contains('active') })));
  const rowsText = (page) => page.evaluate(() => [...document.querySelectorAll('#modal .gp-row')].map((r) => r.querySelector('.gp-row-t').textContent.trim()));
  const buttons = (page) => page.evaluate(() => [...document.querySelectorAll('#modal button')].filter((b) => b.offsetParent).map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
  const menuOf = async (page) => { await page.click('#modal .v1246-add'); await page.waitForTimeout(150);
    return page.evaluate(() => [...document.querySelectorAll('#cxMenu .cx-mi b')].map((x) => x.textContent.trim())); };

  // ======================= 1. the calendar tab =======================
  let { ctx, page } = await signedIn();
  await gear(page);
  let st = await subTabs(page);
  check('Calendar integrations has sub-tabs like Display settings: Calendars, Appointment types, Clients (Calendars first)', st.map((x) => x.t).join('|') === 'Calendars|Appointment types|Clients' && st[0].on, JSON.stringify(st));
  let B = await buttons(page);
  check('no Contractors, Access, New calendar, Add another Google calendar or Connect another Google account buttons', !B.some((b) => /Contractors|Access|New calendar|Add another Google calendar|Connect another Google account/.test(b)), JSON.stringify(B));
  check('exactly one + Add calendar button', B.filter((b) => /Add calendar/.test(b)).length === 1, JSON.stringify(B));
  let M = await md(page);
  check('no Calendars and filters page, and no word of contractors', !/Calendars and filters|ontractor/.test(M.body), M.body.slice(0, 400));
  let R = await rowsText(page);
  check('the portal calendars are listed: the team’s, my own and the one the team made', R.some((r) => /^Maple Care calendar/.test(r)) && R.some((r) => /^Dana’s calendar/.test(r)) && R.includes('Misc Calendar'), JSON.stringify(R));
  check('no Google calendar in the portal list (it is listed with its account above)', !R.some((r) => /Google/.test(r)) && /Your Google calendars/i.test(M.body), JSON.stringify(R));
  let menu = await menuOf(page);
  check('+ Add calendar offers a Google calendar by ID, another Google account and a portal calendar', menu.join('|') === 'Add a Google calendar|Link another Google account|Create a portal calendar', JSON.stringify(menu));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  M = await md(page);
  check('Esc closes the menu and leaves Settings open', M.open && /Portal calendars/i.test(M.body) && await page.evaluate(() => !el('cxMenu')), M.title);

  // ======================= 2. a calendar's own page: Back, who sees it, save goes back =======================
  await page.click('#modal .gp-row:has-text("Misc Calendar")'); await page.waitForTimeout(250);
  M = await md(page);
  check('clicking a calendar opens its page, with Back', /Edit calendar/.test(M.title) && M.back, M.title);
  check('its page has Delete calendar and Who sees it', /Delete calendar/.test(M.foot) && /Who sees it/.test(M.body), M.foot + ' || ' + M.body.slice(0, 300));
  await page.click('#modal .md-back'); await page.waitForTimeout(250);
  M = await md(page);
  check('Back goes to Settings, on the Calendars sub-tab', /Settings/.test(M.title) && (await subTabs(page)).find((x) => x.on).t === 'Calendars' && /Portal calendars/i.test(M.body), M.title);
  await page.click('#modal .gp-row:has-text("Misc Calendar")'); await page.waitForTimeout(250);
  await page.check('#modal input[name="gpWho"][value="listed"]'); await page.waitForTimeout(100);
  check('Only these staff shows the staff to tick', await page.evaluate(() => !el('gpWhoL').hidden && el('gpWhoL').innerText.includes('Jo Rivera')));
  await page.check('#gpWhoL input[value="qa-s1"]');
  await page.click('#modal .gp-c[title="#15998F"]'); await page.waitForTimeout(150);                 // a colour change redraws the page
  check('the staff ticked survive a redraw (a colour picked)', await page.evaluate(() => el('gpWhoL') && !el('gpWhoL').hidden && el('gpWhoL').querySelector('input[value="qa-s1"]').checked));
  await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(350);
  M = await md(page);
  const acc = row('calaccess');
  check('Save keeps who sees it (saved for the team) and goes back to Settings', /Settings/.test(M.title) && acc && acc.map && acc.map['ct:misc1'] && acc.map['ct:misc1'].mode === 'listed' && acc.map['ct:misc1'].sids.join() === 'qa-s1', JSON.stringify(acc) + ' ' + M.title);
  R = await rowsText(page);
  check('the list says who sees it', R.includes('Misc Calendar · listed staff only'), JSON.stringify(R));
  check('its colour is saved', await page.evaluate(() => calDef('ct:misc1').color.toLowerCase() === '#15998f'));

  // ======================= 3. delete, asking first =======================
  await page.click('#modal .gp-row:has-text("Misc Calendar")'); await page.waitForTimeout(250);
  await page.click('#mdFoot button:has-text("Delete calendar")'); await page.waitForTimeout(150);
  M = await md(page);
  check('Delete asks first, saying where its appointments go', /Delete Misc Calendar\? Its 2 appointments move to the Maple Care calendar/.test(M.foot) && /Keep it/.test(M.foot), M.foot);
  check('nothing deleted yet', await page.evaluate(() => CONTRACTORS.some((c) => c.id === 'misc1')));
  await page.click('#mdFoot button:has-text("Keep it")'); await page.waitForTimeout(150);
  M = await md(page);
  check('Keep it goes back to the page as it was', /Edit calendar/.test(M.title) && /Save/.test(M.foot) && !/Keep it/.test(M.foot), M.foot);
  await page.click('#mdFoot button:has-text("Delete calendar")'); await page.waitForTimeout(150);
  await page.click('#mdFoot button.danger:has-text("Delete calendar")'); await page.waitForTimeout(400);
  M = await md(page);
  const del = await page.evaluate(() => ({ ct: CONTRACTORS.some((c) => c.id === 'misc1'), moved: APPTS.filter((a) => /^qa-m/.test(a.id)).map((a) => a.cal), meta: !!CAL_META['ct:misc1'], acc: !!CAL_ACCESS['ct:misc1'] }));
  check('Delete removes the calendar; its appointments move to the team calendar', !del.ct && del.moved.join() === 'company,company' && !del.meta && !del.acc, JSON.stringify(del));
  check('the change is saved for the team (contractors row)', !((row('contractors') || {}).list || []).some((c) => c.id === 'misc1'), JSON.stringify(row('contractors')));
  check('after deleting, Settings is back without it', /Settings/.test(M.title) && !(await rowsText(page)).some((r) => /Misc/.test(r)), JSON.stringify(await rowsText(page)));
  check('the calendar chips no longer show it', await page.evaluate(() => !document.querySelector('#view .v1243-c[data-cal="ct:misc1"]')));
  await page.click('#modal .gp-row:has-text("Maple Care calendar")'); await page.waitForTimeout(250);
  M = await md(page);
  check('the team calendar has no Delete (only calendars the team made do)', /Edit calendar/.test(M.title) && !/Delete/.test(M.foot), M.foot);
  await page.click('#modal .md-back'); await page.waitForTimeout(200);
  await page.click('#modal .gp-row:has-text("Dana’s calendar")'); await page.waitForTimeout(250);
  M = await md(page);
  check('my own calendar has no Delete and no Who sees it', !/Delete/.test(M.foot) && !/Who sees it/.test(M.body), M.foot);
  await page.click('#modal .md-back'); await page.waitForTimeout(200);

  // ======================= 4. Add calendar from Settings: Back, and back after a save =======================
  await menuOf(page); await page.click('#cxMenu .cx-mi:has-text("Add a Google calendar")'); await page.waitForTimeout(250);
  M = await md(page);
  check('Add a Google calendar opened from Settings has Back', /Add a Google calendar/.test(M.title) && M.back, M.title);
  await page.click('#modal .md-back'); await page.waitForTimeout(200);
  check('Back goes to Settings', /Settings/.test((await md(page)).title));
  await menuOf(page); await page.click('#cxMenu .cx-mi:has-text("Create a portal calendar")'); await page.waitForTimeout(250);
  M = await md(page);
  check('Create a portal calendar has Back', /New calendar/.test(M.title) && M.back, M.title);
  await page.fill('#gpName', 'Therapy'); await page.click('#mdFoot button:has-text("Create calendar")'); await page.waitForTimeout(350);
  M = await md(page);
  check('creating it goes back to Settings, with the new calendar listed', /Settings/.test(M.title) && (await rowsText(page)).includes('Therapy'), JSON.stringify(await rowsText(page)));

  // ======================= 5. appointment types moved here =======================
  await page.click('#modal .v1246-seg button:has-text("Appointment types")'); await page.waitForTimeout(250);
  R = await rowsText(page);
  check('Appointment types sub-tab lists the types', R.includes('Dental') && R.includes('Transport'), JSON.stringify(R));
  await page.click('#modal button:has-text("New type")'); await page.waitForTimeout(250);
  M = await md(page);
  check('New type has Back', /New appointment type/.test(M.title) && M.back, M.title);
  await page.fill('#gpName', 'Hydrotherapy'); await page.click('#mdFoot button:has-text("Create type")'); await page.waitForTimeout(350);
  st = await subTabs(page);
  check('creating a type goes back to the Appointment types sub-tab, with it listed', st.find((x) => x.on).t === 'Appointment types' && (await rowsText(page)).includes('Hydrotherapy'), JSON.stringify(st));
  await page.click('#modal .set-tab:has-text("Display settings")'); await page.waitForTimeout(250);
  const ds = await page.evaluate(() => [...document.querySelectorAll('#modal .seg button')].map((b) => b.textContent.trim()));
  check('Display settings keeps Houses and Attention icons (types moved)', ds.join('|') === 'Houses|Attention icons', JSON.stringify(ds));
  await page.evaluate(() => { closeAll(); displaySettings('cats'); }); await page.waitForTimeout(250);
  check('an old link to the types opens the calendar tab’s Appointment types', (await subTabs(page)).find((x) => x.on).t === 'Appointment types');

  // ======================= 6. clients: a color each, saved and read back =======================
  await page.click('#modal .v1246-seg button:has-text("Clients")'); await page.waitForTimeout(250);
  R = await rowsText(page);
  M = await md(page);
  check('Clients sub-tab lists clients by UCI only, with an automatic color until one is set', R.includes('4023999 · automatic color') && R.includes('4023888 · automatic color') && !/Client 4023/.test(M.body), JSON.stringify(R));
  await page.click('#modal .gp-row:has-text("4023999")'); await page.waitForTimeout(250);
  M = await md(page);
  const cf = await page.evaluate(() => ({ icons: !!el('mdBody').querySelector('.gp-icons'), name: el('gpName').value, dis: el('gpName').disabled }));
  check('a client opens Client color: Back, its UCI (not editable), colors and no icons', /Client color/.test(M.title) && M.back && cf.name === '4023999' && cf.dis && !cf.icons, JSON.stringify(cf));
  await page.click('#modal .gp-c[title="#E5484D"]'); await page.waitForTimeout(150);
  await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(350);
  const cc = row('clientcolors');
  check('Save keeps the color for the team (clientcolors) and goes back to Clients', cc && cc.map && String(cc.map['qa-c1']).toLowerCase() === '#e5484d' && (await subTabs(page)).find((x) => x.on).t === 'Clients' && (await rowsText(page)).includes('4023999'), JSON.stringify(cc));
  check('sample clients never go into a real team’s saved colors', await page.evaluate(() => { CLIENT_COLORS.c1 = '#000000'; clientColorsSave(); delete CLIENT_COLORS.c1; return true; }) && !('c1' in ((row('clientcolors') || {}).map || {})), JSON.stringify(row('clientcolors')));
  await page.evaluate(() => { CAL_COLOR_BY = 'client'; render(); }); await page.waitForTimeout(200);
  check('the board uses the client’s color when colored by client', await page.evaluate(() => apptColor(APPTS.find((a) => a.id === 'qa-t1')).toLowerCase() === '#e5484d'));
  await page.evaluate(() => { CAL_COLOR_BY = 'type'; render(); });
  await page.click('#modal .gp-row:has-text("4023999")').catch(() => {}); await page.waitForTimeout(200);
  if (!/Client color/.test((await md(page)).title)) { await gear(page); await page.click('#modal .v1246-seg button:has-text("Clients")'); await page.waitForTimeout(200); await page.click('#modal .gp-row:has-text("4023999")'); await page.waitForTimeout(200); }
  check('a client with its own color can go back to the automatic one', /Use the automatic color/.test((await md(page)).foot));
  await page.click('#modal .md-back'); await page.waitForTimeout(200);

  // ======================= 7. the client filter is on the Calendar page; old entry points =======================
  await page.evaluate(() => { closeAll(); go('calendar'); }); await page.waitForTimeout(250);
  const cfOpts = await page.evaluate(() => { const s = document.querySelector('#view .v1246-cf'); return s ? [...s.options].map((o) => o.textContent.trim()) : null; });
  check('the Calendar page has the client filter next to the search box (UCI only)', cfOpts && cfOpts.join('|') === 'All clients|4023999|4023888', JSON.stringify(cfOpts));
  await page.selectOption('#view .v1246-cf', 'qa-c2'); await page.waitForTimeout(250);
  const flt = await page.evaluate(() => ({ f: state.calFilter.client, rows: [...document.querySelectorAll('#view .cx-pane .cx-row .cx-ti')].map((x) => x.textContent.trim()) }));
  check('picking a client shows only that client’s appointments', flt.f === 'qa-c2' && flt.rows.join() === 'Van ride', JSON.stringify(flt));
  await page.selectOption('#view .v1246-cf', ''); await page.waitForTimeout(200);
  await page.evaluate(() => calControls()); await page.waitForTimeout(250);
  check('anything still asking for Calendars and filters opens Settings, Calendars', /Settings/.test((await md(page)).title) && (await subTabs(page)).find((x) => x.on).t === 'Calendars');
  await page.evaluate(() => { closeAll(); manageContractors(); }); await page.waitForTimeout(250);
  check('the old Contractors list opens Settings, Calendars, too', /Settings/.test((await md(page)).title) && !/Contractor calendars/.test((await md(page)).title));
  await page.evaluate(() => { closeAll(); calLookForm(); }); await page.waitForTimeout(250);
  check('Calendar colors and text no longer says contractor', !/ontractor/.test((await md(page)).body), (await md(page)).body.slice(0, 300));
  await page.evaluate(() => closeAll());

  // ======================= 8. after a reload: client color read back =======================
  await ctx.close();
  ({ ctx, page } = await signedIn());
  const back = await page.evaluate(() => ({ c: CLIENT_COLORS['qa-c1'], col: clientColor('qa-c1'), ct: CONTRACTORS.map((c) => c.name), acc: CAL_ACCESS }));
  check('after a reload the client’s color is read back (it used to be saved and never read)', String(back.c).toLowerCase() === '#e5484d' && back.col.toLowerCase() === '#e5484d', JSON.stringify(back));
  check('after a reload the deleted calendar stays deleted and the new one is there', !back.ct.includes('Misc Calendar') && back.ct.includes('Therapy'), JSON.stringify(back.ct));
  await ctx.close();

  // ======================= 9. a phone =======================
  ({ ctx, page } = await signedIn({ width: 390, height: 844 }));
  await page.evaluate(() => { closeAll(); settingsHub('cal', 'calendar', 'cals'); }); await page.waitForTimeout(300);
  const ph = await page.evaluate(() => { const m = el('modal'); return { wide: m.scrollWidth <= m.clientWidth + 1, page: document.scrollingElement.scrollWidth <= innerWidth + 1, seg: [...m.querySelectorAll('.v1246-seg button')].every((b) => b.getBoundingClientRect().right <= innerWidth + 1) }; });
  check('390px: the calendar tab and its sub-tabs fit, nothing sideways', ph.wide && ph.page && ph.seg, JSON.stringify(ph));
  await page.click('#modal .gp-row:has-text("Therapy")'); await page.waitForTimeout(250);
  await page.click('#mdFoot button:has-text("Delete calendar")'); await page.waitForTimeout(150);
  const pa = await page.evaluate(() => { const a = document.querySelector('#mdFoot .v1246-ask'); const r = a.getBoundingClientRect(); return { fits: r.right <= innerWidth + 1 && r.left >= -1, h: r.height > 0, btns: [...document.querySelectorAll('#mdFoot .btn')].every((b) => b.getBoundingClientRect().right <= innerWidth + 1) }; });
  check('390px: the delete question and its buttons fit', pa.fits && pa.h && pa.btns, JSON.stringify(pa));
  await ctx.close();

  // ======================= 10. staff and family (demo view) =======================
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
  await page.evaluate(() => settingsHub('cal', 'calendar', 'types')); await page.waitForTimeout(250);
  M = await md(page);
  check('staff: Calendar integrations has no sub-tabs and no portal calendar list (as before)', !(await subTabs(page)).length && !/Portal calendars/i.test(M.body), M.body.slice(0, 200));
  check('staff: no Contractors, Access or Delete', !/Contractors|Access|Delete/.test(M.body + M.foot));
  check('staff: the client filter on the Calendar page', await page.evaluate(() => { closeAll(); return !!document.querySelector('#view .v1246-cf'); }));
  await ctx.close();
  ({ ctx, page } = await demo('family'));
  check('family: no client filter', await page.evaluate(() => !document.querySelector('#view .v1246-cf')));
  await ctx.close();

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
