// Care portal v12.48 (Erica's note of Nov 11: the log buttons' words, "Record vitals" and "Log an activity", can't be
// changed; Kser's picks: client logs the team builds too, and the words are the team's). Log buttons: in edit mode a
// director types over the words of Record vitals, Log an activity, Log a drill, Add reading and a form's Start or Run
// button, and the Safety log's builders take Button text; everyone on the team sees the new words, a ＋ stays in
// front, and an empty box or the standard words put the standard ones back. Client logs: a director sets one up (its
// name, button text, the fields an entry records, which clients), staff fill it in on a client's Care tab and it is
// kept by day like vital signs, in a table; entries are edited and deleted, the log is renamed, changed, removed and
// restored, and it is part of the client's record. A director and a staff member in their own browsers against the
// stand-in for the Supabase project (lib/portal-backend.js), then a phone and the demo view.
// Usage: node tests/portal-clientlogs.test.js [baseline.html]
const H = require('./lib/portal-harness');
const { makeBackend } = require('./lib/portal-backend');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const today = new Date().toISOString().slice(0, 10);
const DIR = { email: 'rosa@birch.test', pw: 'birch-pass-1', org: 'Birch Care', name: 'Rosa Lind', title: 'Executive Director' };
const STF = { email: 'kai@birch.test', pw: 'kai-pass-123', name: 'Kai Moreno' };

(async () => {
  const env = await H.start(process.argv[2]);
  const B = makeBackend({});
  const errors = [];
  async function open(viewport) {
    const { ctx, page } = await H.newPage(env, { rest: B.rest, bucket: errors, viewport: viewport || { width: 1440, height: 900 } });
    await B.route(ctx);
    page.on('dialog', (d) => d.accept());
    await page.addInitScript(() => { window.__toasts = []; });
    return { ctx, page };
  }
  const booted = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  const inApp = (page) => page.waitForFunction(() => el('app').classList.contains('on') && typeof state !== 'undefined' && state.role, null, { timeout: 20000 });
  const settle = (page, ms) => page.waitForTimeout(ms || 500);
  const until = async (fn, ms) => { const end = Date.now() + (ms || 6000); while (Date.now() < end) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
  const go = async (page, v) => { await page.evaluate((v) => { closeAll(); go(v); }, v); await settle(page, 350); };
  const reload = async (page) => { await page.reload({ waitUntil: 'load' }); await booted(page); await inApp(page); await settle(page, 1500); await watchToasts(page); };
  const btn = (page, scope, text) => page.locator(scope + ' button:has-text("' + text + '")').first();
  const watchToasts = (page) => page.evaluate(() => { window.__toasts = []; if (window.toast && !window.toast.__w) { const o = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return o.apply(this, arguments); }; window.toast.__w = 1; } });
  const lastToast = (page) => page.evaluate(() => (window.__toasts || []).slice(-1)[0] || '');
  const md = (page) => page.evaluate(() => ({ on: el('modal').classList.contains('on'), t: el('mdTitle').textContent.trim(), b: el('mdBody').innerText }));
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
  const care = async (page, cid) => { await page.evaluate((id) => { closeAll(); state.careDay = ''; state.careAll = false; openClient(id, 'care'); }, cid); await settle(page, 400); };
  // the log buttons on the page: real buttons and, in edit mode, the words a director types over
  const btns = (page) => page.evaluate(() => ({
    real: [...document.querySelectorAll('#view button[data-bkey]')].map((b) => ({ k: b.dataset.bkey, t: b.textContent.trim() })),
    ed: [...document.querySelectorAll('#view .v1248-bt')].map((b) => ({ k: b.dataset.bkey, t: b.textContent.trim(), pre: !!b.parentElement.querySelector('.v1248-pre') })),
  }));
  async function typeOver(page, key, words, end) {
    const t = page.locator(`#view .v1248-bt[data-bkey="${key}"]`).first();
    await t.click(); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); if (words) await page.keyboard.type(words);
    if (end !== 'none') await page.keyboard.press(end || 'Enter');
    await settle(page, 300);
  }
  // a client log card: its title, count, button, rows (cells), empty text
  const logCard = (page, name) => page.evaluate((n) => {
    const s = [...document.querySelectorAll('#view section.v1248-log')].find((x) => x.querySelector('h2').textContent.trim() === n);
    if (!s) return null;
    return { lid: s.dataset.lid, n: s.querySelector('.hd-n').textContent.trim(), btn: ((s.querySelector('button[data-bkey]') || s.querySelector('.v1248-bt') || {}).textContent || '').trim(),
      heads: [...s.querySelectorAll('thead th')].map((x) => x.textContent.trim()), rows: [...s.querySelectorAll('tbody tr')].map((r) => [...r.cells].map((c) => c.textContent.trim())),
      empty: ((s.querySelector('.empty') || {}).innerText || '').replace(/\s+/g, ' ').trim() };
  }, name);

  // ---------------- a new team: two clients, a staff member who joins from the invite ----------------
  const D = await open();
  const page = D.page;
  await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
  await page.click('text=Get your team started');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'regOrg');
  await page.fill('#regOrg', DIR.org); await page.fill('#regName', DIR.name); await page.fill('#regRole', DIR.title);
  await page.fill('#liEmail', DIR.email); await page.fill('#liPw', DIR.pw);
  await page.click('#liGo');
  await page.waitForFunction(() => el('onbRoot') && el('onbRoot').classList.contains('on'), null, { timeout: 20000 });
  for (let i = 0; i < 8; i++) {
    if (!(await page.evaluate(() => el('onbRoot').classList.contains('on')))) break;
    await page.locator('#onbRoot .opt >> visible=true').first().click().catch(() => {});
    await page.locator('#onbRoot #next').click(); await settle(page, 400);
  }
  await inApp(page); await settle(page, 1500);
  await signPilot(page, DIR);
  await watchToasts(page);
  const org = B.myOrg(DIR.email);
  for (const [uci, home] of [['7350111', 'Elm House'], ['7350222', 'Oak House']]) {
    await go(page, 'clients'); await btn(page, '#view', 'Add client').click(); await settle(page, 400);
    await page.fill('#clUci', uci); await page.fill('#clAge', '40');
    await addOption(page, '#clHome', home);
    await btn(page, '#view', 'Save client').click(); await settle(page, 600);
  }
  const cid1 = (B.rows('np_demo_clients').find((x) => x.uci === '7350111') || {}).id;
  const cid2 = (B.rows('np_demo_clients').find((x) => x.uci === '7350222') || {}).id;
  await go(page, 'team'); await btn(page, '#view', 'Add staff').click(); await settle(page, 400);
  await page.fill('#sfName', STF.name); await page.fill('#sfInit', 'K.M.'); await page.fill('#sfRole', 'Direct Support Professional');
  await page.selectOption('#sfHome', 'Elm House'); await page.fill('#sfHired', today); await page.fill('#sfEmail', STF.email);
  await btn(page, '#modal', 'Add staff member').click(); await settle(page, 800);
  await until(() => B.relay.some((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite'));
  check('setup: a team with two clients and a staff member invited', !!org && !!cid1 && !!cid2, JSON.stringify({ org, cid1, cid2 }));

  const S = await open();
  const sp = S.page;
  const link = ((B.relay.find((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite') || {}).payload || {}).link;
  await sp.goto(link, { waitUntil: 'load' }); await booted(sp);
  await sp.waitForFunction(() => /Join/.test((el('loginTitle') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await sp.fill('#liPw', STF.pw); if (await sp.locator('#liPw2').count()) await sp.fill('#liPw2', STF.pw);
  await sp.click('#liGo');
  await sp.waitForFunction(() => typeof state !== 'undefined' && state.role === 'staff', null, { timeout: 20000 }).catch(() => {});
  await settle(sp, 1500);
  await signPilot(sp, { name: STF.name, title: 'Direct Support Professional' });
  await reload(sp);
  check('setup: the staff member is in as staff', await sp.evaluate(() => state.role === 'staff'));

  // ======================= 1. the Care tab's buttons, renamed by the director =======================
  await care(page, cid1);
  let b = await btns(page);
  check('Care tab: Record vitals and Log an activity are real buttons with their standard words', b.real.some((x) => x.k === 'care:vitals' && x.t === '＋ Record vitals') && b.real.some((x) => x.k === 'care:adl' && x.t === '＋ Log an activity') && !b.ed.length, JSON.stringify(b));
  await page.evaluate(() => pageEdit(true)); await settle(page, 400);
  b = await btns(page);
  check('edit mode (director): their words become text to type over, the ＋ kept in front', b.ed.some((x) => x.k === 'care:vitals' && x.t === 'Record vitals' && x.pre) && b.ed.some((x) => x.k === 'care:adl' && x.t === 'Log an activity' && x.pre) && !b.real.some((x) => /^care:/.test(x.k)), JSON.stringify(b));
  await page.locator('#view .v1248-bt[data-bkey="care:vitals"]').click(); await settle(page, 200);
  check('clicking the words while editing opens nothing', !(await md(page)).on);
  await typeOver(page, 'care:vitals', 'Take vitals');
  const bl = () => ((B.prog(org, 'btnlabels') || {}).map) || {};
  await until(() => bl()['care:vitals'] === 'Take vitals');
  check('Enter keeps the new words, saved for the team', bl()['care:vitals'] === 'Take vitals', JSON.stringify(bl()));
  check('…and says so', /Renamed for the whole team: “Take vitals”/.test(await lastToast(page)), await lastToast(page));
  await typeOver(page, 'care:adl', '+ Log a meal', 'none');
  await page.locator('#view button:has-text("Done editing")').first().click(); await settle(page, 500);
  await until(() => bl()['care:adl'] === 'Log a meal');
  check('typing then clicking Done editing straight away keeps the words (the click is not lost), a typed + dropped', bl()['care:adl'] === 'Log a meal' && !(await page.evaluate(() => state.layoutEdit)), JSON.stringify(bl()));
  b = await btns(page);
  check('out of edit mode the buttons read the team’s words', b.real.some((x) => x.k === 'care:vitals' && x.t === '＋ Take vitals') && b.real.some((x) => x.k === 'care:adl' && x.t === '＋ Log a meal'), JSON.stringify(b));
  await page.locator('#view button[data-bkey="care:adl"]').click(); await settle(page, 300);
  check('the renamed button opens its form, titled with the new words', (await md(page)).t === 'Log a meal', (await md(page)).t);
  await page.evaluate(() => closeAll());
  await page.evaluate(() => pageEdit(true)); await settle(page, 300);
  await typeOver(page, 'care:adl', 'Something else', 'Escape');
  check('Esc puts the words back and saves nothing', bl()['care:adl'] === 'Log a meal' && (await btns(page)).ed.find((x) => x.k === 'care:adl').t === 'Log a meal', JSON.stringify(bl()));
  await typeOver(page, 'care:vitals', '');
  await until(() => !bl()['care:vitals']);
  check('an empty box puts the standard words back (Record vitals), and the team setting goes', !bl()['care:vitals'] && (await btns(page)).ed.find((x) => x.k === 'care:vitals').t === 'Record vitals', JSON.stringify(bl()));
  check('…and says so', /Back to the standard words: “Record vitals”/.test(await lastToast(page)), await lastToast(page));
  await typeOver(page, 'care:vitals', 'Check vitals');
  await page.evaluate(() => pageEdit(false)); await settle(page, 300);
  const audit = B.rows('np_demo_audit_log').filter((r) => r.org_id === org && /Renamed a button/.test(r.action || r.what || JSON.stringify(r)));
  check('each rename goes in the change log', audit.length >= 3, audit.length + '');

  // the staff member sees the team's words, and can't type over them
  await reload(sp); await care(sp, cid1);
  b = await btns(sp);
  check('staff see the team’s words', b.real.some((x) => x.k === 'care:vitals' && x.t === '＋ Check vitals') && b.real.some((x) => x.k === 'care:adl' && x.t === '＋ Log a meal'), JSON.stringify(b));
  await sp.evaluate(() => pageEdit(true)); await settle(sp, 300);
  b = await btns(sp);
  check('staff in their own edit mode get real buttons, nothing to type over', !b.ed.length && b.real.some((x) => x.k === 'care:vitals'), JSON.stringify(b));
  await sp.evaluate(() => pageEdit(false)); await settle(sp, 200);

  // ======================= 2. the Safety log's buttons and builders =======================
  await go(page, 'safety');
  await page.evaluate(() => pageEdit(true)); await settle(page, 400);
  b = await btns(page);
  check('Safety log in edit mode: Log a drill and Add reading can be typed over', b.ed.some((x) => x.k === 'safety:drills' && x.t === 'Log a drill') && b.ed.some((x) => x.k === 'safety:temps' && x.t === 'Add reading'), JSON.stringify(b));
  await typeOver(page, 'safety:drills', 'Record a fire drill');
  await until(() => bl()['safety:drills'] === 'Record a fire drill');
  check('…typing over Log a drill neither opens the log nor its form', bl()['safety:drills'] === 'Record a fire drill' && !(await md(page)).on && !(await page.evaluate(() => !!el('inspFull') || !!el('formFull'))), JSON.stringify(bl()));
  await page.evaluate(() => pageEdit(false)); await settle(page, 300);
  b = await btns(page);
  check('the drill log’s button reads “＋ Record a fire drill”', b.real.some((x) => x.k === 'safety:drills' && x.t === '＋ Record a fire drill'), JSON.stringify(b));
  // New log or inspection: Button text
  await page.evaluate(() => openInspTemplateForm()); await settle(page, 400);
  await page.fill('#itName', 'Van walkaround');
  await page.locator('#itQs input').first().fill('Tires look right');
  await page.fill('#itBtn', 'Begin walkaround');
  await page.locator('#formFull button:has-text("Create form")').click(); await settle(page, 500);
  const vanId = await page.evaluate(() => (INSP_TEMPLATES.find((t) => t.name === 'Van walkaround') || {}).id);
  check('New log or inspection takes Button text, saved for the team', !!vanId && bl()['insp:' + vanId] === 'Begin walkaround', JSON.stringify({ vanId, m: bl() }));
  await page.evaluate((id) => { state.openInsp = id; render(); }, vanId); await settle(page, 300);
  b = await btns(page);
  check('…and the form’s Start button reads it', b.real.some((x) => x.k === 'insp:' + vanId && x.t === 'Begin walkaround'), JSON.stringify(b));
  await page.evaluate((id) => openInspTemplateForm(id), vanId); await settle(page, 300);
  check('editing the form shows its Button text', (await page.inputValue('#itBtn')) === 'Begin walkaround');
  await page.fill('#itBtn', ''); await page.locator('#formFull button:has-text("Save changes")').click(); await settle(page, 400);
  check('…and clearing it gives back Start inspection', !bl()['insp:' + vanId] && (await btns(page)).real.some((x) => x.k === 'insp:' + vanId && x.t === 'Start inspection'), JSON.stringify(bl()));
  // Settings > Create a log: Button text
  await page.evaluate(() => newLogType()); await settle(page, 300);
  await page.fill('#nlName', 'Fridge temps'); await page.fill('#nlQs', 'Fridge at 41°F or below'); await page.fill('#nlWk', '7'); await page.fill('#nlBtn', 'Check the fridge');
  await page.locator('#modal button:has-text("Create log")').click(); await settle(page, 400);
  const frId = await page.evaluate(() => (INSP_TEMPLATES.find((t) => t.name === 'Fridge temps') || {}).id);
  b = await btns(page);
  check('Create a log takes Button text: the weekly log’s Run now button reads it', !!frId && bl()['insp:' + frId] === 'Check the fridge' && b.real.some((x) => x.k === 'insp:' + frId && x.t === 'Check the fridge'), JSON.stringify(b.real));

  // ======================= 3. a client log: set up by the director =======================
  await care(page, cid1);
  const tile = await page.evaluate(() => ((document.querySelector('#view .v1248-new') || {}).innerText || '').replace(/\s+/g, ' '));
  check('the director’s Care tab offers ＋ New client log', /New client log/.test(tile), tile);
  await care(sp, cid1);
  check('staff don’t get it', !(await sp.evaluate(() => !!document.querySelector('#view .v1248-new'))));
  await page.locator('#view .v1248-new button:has-text("New client log")').click(); await settle(page, 300);
  check('it opens New client log', (await md(page)).t === 'New client log', (await md(page)).t);
  await page.locator('#mdFoot button:has-text("Create log")').click(); await settle(page, 200);
  check('a log needs a name', /Name the log/.test(await lastToast(page)) && (await md(page)).on, await lastToast(page));
  await page.fill('#clName', 'Sleep log'); await page.fill('#clBtn', 'Log sleep');
  const fieldRow = (i) => page.locator('#clFields .v1248-fr').nth(i);
  await fieldRow(0).locator('input').first().fill('Hours slept');
  await fieldRow(0).locator('select').selectOption('number'); await settle(page, 150);
  await fieldRow(0).locator('input').nth(1).fill('hours');
  for (const [label, type] of [['Woke up in the night', 'yesno'], ['Quality', 'choice'], ['Bed time', 'time']]) {
    await page.locator('#modal button:has-text("Add a field")').click(); await settle(page, 150);
    const n = await page.locator('#clFields .v1248-fr').count();
    check('＋ Add a field puts the cursor in the new field', await page.evaluate((n) => document.activeElement === document.querySelectorAll('#clFields .v1248-fr')[n - 1].querySelector('input'), n));
    await fieldRow(n - 1).locator('input').first().fill(label);
    await fieldRow(n - 1).locator('select').selectOption(type); await settle(page, 150);
  }
  check('the field typed before an answer type was changed is kept', (await fieldRow(0).locator('input').first().inputValue()) === 'Hours slept' && (await fieldRow(0).locator('input').nth(1).inputValue()) === 'hours');
  await fieldRow(2).locator('input').nth(1).fill('Good');
  await page.locator('#mdFoot button:has-text("Create log")').click(); await settle(page, 200);
  check('a Pick one field needs two choices', /at least two choices/.test(await lastToast(page)), await lastToast(page));
  await fieldRow(2).locator('input').nth(1).fill('Good, Fair, Poor');
  await page.locator('#mdFoot button:has-text("Create log")').click(); await settle(page, 500);
  const defs = () => ((B.prog(org, 'clientlogs') || {}).list) || [];
  await until(() => defs().length === 1);
  const def0 = defs()[0] || {};
  check('Create log saves it for the team: name, four fields in order with their types, every client', def0.name === 'Sleep log' && (def0.fields || []).map((f) => f.label + ':' + f.type).join('|') === 'Hours slept:number|Woke up in the night:yesno|Quality:choice|Bed time:time' && def0.fields[0].unit === 'hours' && def0.fields[2].opts.join() === 'Good,Fair,Poor' && !(def0.cids || []).length, JSON.stringify(def0));
  check('…and its button text', bl()['clog:' + def0.id] === 'Log sleep', JSON.stringify(bl()));
  check('…and says where it went', /“Sleep log” is on the Care tab of every client/.test(await lastToast(page)), await lastToast(page));
  let lc = await logCard(page, 'Sleep log');
  check('the Care tab shows the log: its name, 0, ＋ Log sleep, and how to add the first entry', lc && lc.n === '0' && lc.btn === '＋ Log sleep' && /Nothing logged on this day/.test(lc.empty) && /Use ＋ Log sleep to add the first entry/.test(lc.empty), JSON.stringify(lc));

  // ======================= 4. staff fill it in =======================
  await reload(sp); await care(sp, cid1);
  lc = await logCard(sp, 'Sleep log');
  check('staff see the log on the client’s Care tab after a reload', lc && lc.btn === '＋ Log sleep', JSON.stringify(lc));
  await sp.locator('#view section.v1248-log button[data-bkey]').first().click(); await settle(sp, 300);
  let m = await md(sp);
  check('＋ Log sleep opens the log’s form: date, time, each field, notes', m.t === 'Sleep log' && /Date[\s\S]*Time[\s\S]*Hours slept[\s\S]*Woke up in the night[\s\S]*Quality[\s\S]*Bed time[\s\S]*Notes/.test(m.b), m.t + ' ' + m.b.slice(0, 200));
  await sp.locator('#mdFoot button:has-text("Save entry")').click(); await settle(sp, 200);
  check('an empty entry is refused', /Fill in at least one field/.test(await lastToast(sp)) && (await md(sp)).on, await lastToast(sp));
  const fid = (i) => def0.fields[i].id;
  await sp.fill('#ce_' + fid(0), '7.5');
  await sp.selectOption('#ce_' + fid(1), 'Yes');
  await sp.selectOption('#ce_' + fid(2), 'Good');
  await sp.fill('#ce_' + fid(3), '21:30');
  await sp.fill('#ceN', 'Up once around 3');
  await sp.locator('#mdFoot button:has-text("Save entry")').click(); await settle(sp, 500);
  const entries = () => B.rows('np_demo_client_logs').filter((r) => r.org_id === org);
  await until(() => entries().length === 1);
  const e0 = entries()[0] || {};
  check('Save entry writes one row for the team: the log, the client, the day, each value by field, notes, who', e0.log_id === def0.id && e0.cid === cid1 && String(e0.entry_date).slice(0, 10) === today && e0.vals[fid(0)] === '7.5' && e0.vals[fid(1)] === 'Yes' && e0.vals[fid(2)] === 'Good' && e0.vals[fid(3)] === '21:30' && e0.notes === 'Up once around 3' && e0.recorded_by === 'K.M.', JSON.stringify(e0));
  lc = await logCard(sp, 'Sleep log');
  check('the table shows it: time, each field (with its unit, as a time), who, notes', lc.n === '1' && lc.heads.join('|') === 'Time|Hours slept|Woke up in the night|Quality|Bed time|By|Notes' && lc.rows.length === 1 && lc.rows[0].slice(1).join('|') === '7.5 hours|Yes|Good|9:30 PM|K.M.|Up once around 3', JSON.stringify(lc));
  const dot = await sp.evaluate(() => { const b = [...document.querySelectorAll('#view .cal-grid button.is-on')][0]; return b ? { dot: !!b.querySelector('i'), t: b.title } : null; });
  check('the day gets a dot in the month', dot && dot.dot && /1 entry/.test(dot.t), JSON.stringify(dot));
  await sp.evaluate(() => { state.careAll = true; render(); }); await settle(sp, 200);
  lc = await logCard(sp, 'Sleep log');
  check('Show the full history adds the date column', lc.heads[0] === 'Date' && lc.rows.length === 1, JSON.stringify(lc.heads));
  await sp.evaluate(() => { state.careAll = false; render(); }); await settle(sp, 200);

  // the director reads it, corrects it
  await reload(page); await care(page, cid1);
  lc = await logCard(page, 'Sleep log');
  check('the director sees the entry after a reload', lc && lc.rows.length === 1 && lc.rows[0][3] === 'Good', JSON.stringify(lc));
  await page.locator('#view section.v1248-log tbody tr').first().click(); await settle(page, 300);
  m = await md(page);
  check('clicking the row opens it filled in, with Delete', m.t === 'Sleep log' && (await page.inputValue('#ce_' + fid(0))) === '7.5' && (await page.inputValue('#ce_' + fid(2))) === 'Good' && await page.locator('#mdFoot button:has-text("Delete")').count() === 1);
  await page.selectOption('#ce_' + fid(2), 'Fair');
  await page.locator('#mdFoot button:has-text("Save changes")').click(); await settle(page, 500);
  await until(() => (entries()[0] || { vals: {} }).vals[fid(2)] === 'Fair');
  check('Save changes updates the same row (no second one), noting who changed it', entries().length === 1 && entries()[0].vals[fid(2)] === 'Fair' && !!entries()[0].edited_by && entries()[0].recorded_by === 'K.M.', JSON.stringify(entries()));

  // ======================= 5. the log changes: a new field, moved, the button back to standard =======================
  await page.evaluate(() => pageEdit(true)); await settle(page, 300);
  const bar = await page.evaluate(() => { const s = document.querySelector('#view section.v1248-log'); const b = s && s.querySelector('.lay-bar'); return b ? [...b.querySelectorAll('button')].map((x) => x.textContent.trim()) : null; });
  check('in edit mode the log’s bar has ✎ Edit log', bar && bar.includes('✎ Edit log'), JSON.stringify(bar));
  await page.locator('#view section.v1248-log .lay-bar button:has-text("Edit log")').click(); await settle(page, 300);
  check('✎ Edit log opens its setup, filled in', (await md(page)).t === 'Edit client log' && (await page.inputValue('#clName')) === 'Sleep log' && (await page.inputValue('#clBtn')) === 'Log sleep' && await page.locator('#clFields .v1248-fr').count() === 4);
  await page.locator('#modal button:has-text("Add a field")').click(); await settle(page, 150);
  await fieldRow(4).locator('input').first().fill('Naps');
  await fieldRow(4).locator('select').selectOption('number'); await settle(page, 150);
  await fieldRow(4).locator('button[title="Move up"]').click(); await settle(page, 150);
  check('a field moves up', (await fieldRow(3).locator('input').first().inputValue()) === 'Naps' && (await fieldRow(4).locator('input').first().inputValue()) === 'Bed time');
  await page.fill('#clBtn', '');
  await page.locator('#mdFoot button:has-text("Save changes")').click(); await settle(page, 500);
  await until(() => (defs()[0] || { fields: [] }).fields.length === 5);
  const def1 = defs()[0] || {};
  check('the change is saved: the same log, its fields kept by id, Naps before Bed time', def1.id === def0.id && def1.fields.map((f) => f.label).join('|') === 'Hours slept|Woke up in the night|Quality|Naps|Bed time' && def1.fields[0].id === fid(0) && def1.fields[4].id === fid(3), JSON.stringify(def1.fields));
  lc = await logCard(page, 'Sleep log');
  check('the earlier entry keeps its values, the new column empty; the button back to ＋ Add an entry', !bl()['clog:' + def0.id] && lc.heads.join('|') === 'Time|Hours slept|Woke up in the night|Quality|Naps|Bed time|By|Notes' && lc.rows[0].slice(1, 6).join('|') === '7.5 hours|Yes|Fair||9:30 PM', JSON.stringify(lc));
  check('…and the edit-mode button can be typed over like the others', (await btns(page)).ed.some((x) => x.k === 'clog:' + def0.id && x.t === 'Add an entry'), JSON.stringify((await btns(page)).ed));
  await typeOver(page, 'clog:' + def0.id, 'Log the night');
  await until(() => bl()['clog:' + def0.id] === 'Log the night');
  check('typing over it saves the log’s button text', bl()['clog:' + def0.id] === 'Log the night', JSON.stringify(bl()));
  // the bar's title renames the log for the team
  const lt = page.locator('#view section.v1248-log .lay-bar .lay-t');
  await lt.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('Night log'); await page.keyboard.press('Enter'); await settle(page, 400);
  await until(() => (defs()[0] || {}).name === 'Night log');
  check('renaming it in the bar renames the log for the whole team', (defs()[0] || {}).name === 'Night log' && /Renamed for the whole team/.test(await lastToast(page)), JSON.stringify(defs().map((d) => d.name)) + ' ' + await lastToast(page));
  check('…and its heading follows at once', await page.evaluate(() => document.querySelector('#view section.v1248-log h2').textContent.trim()) === 'Night log');
  // Add a section offers a client log to a director, on the Care tab
  await page.locator('#view .add-sec-tile').first().click(); await settle(page, 300);
  const menu = await md(page);
  check('Add a section on the Care tab offers a Client log (director)', /Client log/.test(menu.b) && /Shared with the whole team/.test(menu.b), menu.b.slice(0, 300));
  await page.locator('#modal button:has-text("Client log")').click(); await settle(page, 300);
  check('…which opens New client log', (await md(page)).t === 'New client log');
  await page.evaluate(() => closeAll());
  await page.evaluate(() => pageEdit(false)); await settle(page, 300);
  await sp.evaluate(() => pageEdit(true)); await settle(sp, 300);
  await sp.locator('#view .add-sec-tile').first().click(); await settle(sp, 300);
  check('staff’s Add a section has no Client log', !/Client log/.test((await md(sp)).b));
  await sp.evaluate(() => { closeAll(); pageEdit(false); }); await settle(sp, 300);

  // ======================= 6. only some clients; removed and restored; in the record =======================
  await page.locator('#view .v1248-new button:has-text("New client log")').click(); await settle(page, 300);
  await page.fill('#clName', 'Seizure log');
  await page.locator('#clFields .v1248-fr').first().locator('input').first().fill('How long');
  await page.check('#modal input[name="clWho"][value="some"]');
  check('Only these clients lists the clients by UCI', await page.locator('#clWhoL').isVisible() && /7350111[\s\S]*7350222/.test(await page.locator('#clWhoL').innerText()));
  await page.locator('#mdFoot button:has-text("Create log")').click(); await settle(page, 200);
  check('Only these clients needs one ticked', /Tick at least one client/.test(await lastToast(page)), await lastToast(page));
  await page.check(`#clWhoL input[value="${cid2}"]`);
  await page.locator('#mdFoot button:has-text("Create log")').click(); await settle(page, 500);
  await until(() => defs().length === 2);
  check('a log for some clients saves them', (defs().find((d) => d.name === 'Seizure log') || {}).cids.join() === cid2 && /the clients you chose/.test(await lastToast(page)), JSON.stringify(defs()));
  await care(page, cid1);
  check('…and is not on another client’s Care tab', !(await logCard(page, 'Seizure log')) && !!(await logCard(page, 'Night log')));
  await care(page, cid2);
  check('…but is on theirs', !!(await logCard(page, 'Seizure log')) && !!(await logCard(page, 'Night log')));
  // remove (archive) and restore
  await care(page, cid1);
  await page.evaluate((id) => clogForm(id), def0.id); await settle(page, 300);
  await page.locator('#mdFoot button:has-text("Remove log")').click(); await settle(page, 300);
  m = await md(page);
  check('Remove log asks first, says its entries stay on file and how to bring it back', /Remove “Night log”\?/.test(m.t) && /Its 1 entry stays on file/.test(m.b) && /Restore at the bottom of any Care tab/.test(m.b), m.t + ' / ' + m.b);
  await page.locator('#mdFoot button:has-text("Remove log")').click(); await settle(page, 500);
  await until(() => (defs().find((d) => d.id === def0.id) || {}).archived === true);
  check('removing it archives it for the team, its entry kept', (defs().find((d) => d.id === def0.id) || {}).archived === true && entries().length === 1);
  check('…it leaves the Care tab, and Restore Night log is at the bottom', !(await logCard(page, 'Night log')) && /Restore Night log/.test(await page.locator('#view .v1248-new').innerText()));
  await page.locator('#view .v1248-new button:has-text("Restore Night log")').click(); await settle(page, 500);
  await until(() => (defs().find((d) => d.id === def0.id) || {}).archived === false);
  lc = await logCard(page, 'Night log');
  check('Restore brings it back with its entry', lc && lc.rows.length === 1 && (defs().find((d) => d.id === def0.id) || {}).archived === false, JSON.stringify(lc));
  const sheet = await page.evaluate((id) => clientRecordSheet(id), cid1);
  check('the client’s record (Export record) has the log with its entries', /<h3>Night log<\/h3>/.test(sheet) && /7\.5 hours/.test(sheet) && /Up once around 3/.test(sheet) && !/Seizure log/.test(sheet), sheet.slice(sheet.indexOf('Night log') - 20, sheet.indexOf('Night log') + 400));
  // delete the entry
  await page.locator('#view section.v1248-log tbody tr').first().click(); await settle(page, 300);
  await page.locator('#mdFoot button:has-text("Delete")').click(); await settle(page, 300);
  await page.locator('#mdFoot button:has-text("Delete entry")').click(); await settle(page, 500);
  await until(() => entries().length === 0);
  check('Delete asks first, then the entry comes off the record for the team', entries().length === 0 && (await logCard(page, 'Night log')).n === '0', JSON.stringify(entries()));
  // a client deleted takes their entries
  await reload(sp); await care(sp, cid2);
  await sp.locator('#view section.v1248-log:has(h2:text-is("Seizure log")) button[data-bkey]').click(); await settle(sp, 300);
  await sp.fill('#ce_' + (defs().find((d) => d.name === 'Seizure log').fields[0].id), '2 minutes');
  await sp.locator('#mdFoot button:has-text("Save entry")').click(); await settle(sp, 500);
  await until(() => entries().some((r) => r.cid === cid2));
  check('(an entry for the second client)', entries().some((r) => r.cid === cid2));
  await reload(page);
  await page.evaluate((id) => delClient(id), cid2); await settle(page, 300);
  await page.locator('#mdFoot button:has-text("Delete client")').click().catch(() => {}); await settle(page, 800);
  await until(() => !entries().some((r) => r.cid === cid2));
  check('deleting a client deletes their client log entries too', !entries().some((r) => r.cid === cid2), JSON.stringify(entries()));

  // ======================= 7. a phone =======================
  {
    const P = await open({ width: 390, height: 844 });
    const pp = P.page;
    await pp.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(pp);
    await pp.fill('#liEmail', DIR.email); await pp.fill('#liPw', DIR.pw); await pp.click('#liGo');
    await inApp(pp); await settle(pp, 1500); await watchToasts(pp);
    await care(pp, cid1);
    const wide = () => pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('phone: the Care tab with client logs fits the screen', (await wide()) <= 0, (await wide()) + 'px over');
    await pp.locator('#view .v1248-new button:has-text("New client log")').click(); await settle(pp, 300);
    await pp.locator('#modal button:has-text("Add a field")').click(); await settle(pp, 150);
    await pp.locator('#clFields .v1248-fr').nth(1).locator('select').selectOption('choice'); await settle(pp, 150);
    const over = await pp.evaluate(() => { const b = el('mdBody'); return { w: b.scrollWidth - b.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    check('phone: New client log’s field rows fit the window', over.w <= 1 && over.page <= 0, JSON.stringify(over));
    await pp.evaluate(() => closeAll());
    await pp.evaluate(() => pageEdit(true)); await settle(pp, 300);
    check('phone: the words to type over fit too', (await wide()) <= 0 && (await btns(pp)).ed.length >= 3, (await wide()) + '');
    await pp.evaluate(() => pageEdit(false));
    await P.ctx.close();
  }

  // ======================= 8. the demo view: a log made and filled in, nothing sent =======================
  {
    const X = await open();
    const xp = X.page;
    await xp.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await xp.waitForFunction(() => typeof go === 'function' && el('app').classList.contains('on'), null, { timeout: 20000 }).catch(() => {});
    await xp.evaluate(() => { signIn('director'); }); await settle(xp, 600); await watchToasts(xp);
    const c0 = await xp.evaluate(() => visibleClients()[0].id);
    await care(xp, c0);
    await xp.evaluate(() => clogForm()); await settle(xp, 300);
    await xp.fill('#clName', 'Outings'); await xp.locator('#clFields .v1248-fr').first().locator('input').first().fill('Where');
    await xp.fill('#clBtn', 'Log an outing');
    await xp.locator('#mdFoot button:has-text("Create log")').click(); await settle(xp, 400);
    await xp.locator('#view section.v1248-log button[data-bkey]').click(); await settle(xp, 300);
    const f0 = await xp.evaluate(() => CLOG_DEFS[0].fields[0].id);
    await xp.fill('#ce_' + f0, 'Library'); await xp.locator('#mdFoot button:has-text("Save entry")').click(); await settle(xp, 400);
    const dl = await logCard(xp, 'Outings');
    check('demo view: a director makes a log and fills it in, on the page only', dl && dl.btn === '＋ Log an outing' && dl.rows.length === 1 && dl.rows[0][1] === 'Library', JSON.stringify(dl));
    await X.ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
