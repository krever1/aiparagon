// v144 tests for new-aiparagon-dashboard.html (#1), Erica's notes of Nov 24, release 2: folders and call types the team
// can change (Tasks and Calls); a calendar of calls; calls filed under clients, and Create a client record when a call's
// people match no client; a lead's HubSpot tab read live; feedback pins on any part of a page, with a Feedback list.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js); Fathom and
// n8n answer from stand-ins. Everyone is made up (example domains).
// Usage: node tests/dashboard-v144.test.js   (ONLY=folders,calendar,... runs some sections)
const path = require('path');
const H = require('./lib/dashboard-harness');
const { makeStore } = require('./lib/rest-stub');
const FX = require('./lib/qa-fixtures');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const ONLY = process.env.ONLY || '';
const want = (k) => !ONLY || ONLY.split(',').includes(k);
const L1 = FX.L1, L2 = FX.L2;
const ME = 'qa@aiparagonconsulting.com';
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const call = (id, h, title, guests, mins) => ({ id, title, start: ago(h), end: new Date(Date.now() - h * 3600e3 + (mins || 40) * 60e3).toISOString(),
  share_url: 'https://fathom.video/share/' + id + 'abcdef', recorded_by: { name: 'QA Tester', email: ME },
  invitees: guests.map((g) => ({ name: g[0], email: g[1], external: true })).concat([{ name: 'QA Tester', email: ME, external: false }]) });
const CA = call('fx-a', 20, 'Intro call · Testwell', [['Robin Test', L2]], 38);                 // Robin is a lead
const CB = call('fx-b', 30, 'Team sync', [], 25);                                               // only the team
const CN = call('fx-n', 5, 'First chat · Northwind', [['Nora Quill', 'nora@northwind.example']], 30);   // nobody we know
const CG = call('fx-g', 48, 'Coffee chat', [['Gail Free', 'gail.free@gmail.com']], 20);        // a free email address

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(addr, o) {
    o = o || {};
    const t = FX.tables();
    t.call_outputs.push({ id: '00000000-0000-4000-8000-0000000ca0a1', call_id: 'fx-a', call_title: CA.title, call_start: CA.start, meeting_type: 'sales', meeting_type_guess: true,
      summary: ['Month-end reports take two days'], tasks: [{ id: 'ta', text: 'Send Robin the pilot plan', owner: 'Kaeser', due: '', done: false }], status: 'done', source: 'auto', created_by: 'auto', created_at: ago(19), updated_at: ago(19) });
    if (o.more) o.more(t);
    const store = makeStore(t);
    const hooks = [];
    const hook = (u, m, b) => {
      let j = null; try { j = JSON.parse(b || ''); } catch (e) {}
      const p = u.replace(/^https:\/\/n8n\.aiparagonconsulting\.com\/webhook\//, '');
      hooks.push({ p, b: j });
      if (/fathom-proxy$/.test(u)) {
        if (j && j.action === 'list') return { body: { ok: true, items: o.calls || [CA, CB, CN, CG] } };
        if (j && j.action === 'status') return { body: { ok: true, connected: true, hint: 'abcd' } };
        return { body: { ok: true, transcript: [] } };
      }
      if (o.hook) { const r = o.hook(p, j); if (r) return r; }
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    await page.setViewportSize({ width: o.width || 1440, height: 900 });
    await page.goto(BASE + addr, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(o.wait || 1800);
    return { ctx, page, store, hooks };
  }
  const meta = (store, id) => store.db.call_meta.find((r) => String(r.call_id) === id) || {};
  const setting = (store, k) => (store.db.ai_settings.find((r) => r.key === k) || {}).value;

  // 1. Folders and call types: rename, add, delete, for the whole team
  if (want('folders')) {
    const { ctx, page, store } = await open('/dashboard/tasks', { more: (t) => {
      t.call_meta.push({ call_id: 'fx-a', folder: 'Testwell Group', created_at: ago(10), updated_at: ago(10) });
      t.ai_settings.push({ key: 'call_types', value: ['Partner call'], updated_at: ago(30) });
      t.call_meta.push({ call_id: 'fx-n', meeting_type: 'Partner call', created_at: ago(4), updated_at: ago(4) });
    } });
    const btn = page.locator('#apTk .v144-mg');
    check('Tasks: a Folders and types button in the header', await btn.count() === 1);
    await btn.click(); await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const M = document.getElementById('v144M'); if (!M) return null;
      return { folders: [...M.querySelectorAll('#v144Fs .v144-row')].map((r) => r.dataset.f), types: [...M.querySelectorAll('.v144-t')].length,
        own: [...M.querySelectorAll('.v144-t[data-own]')].map((r) => r.dataset.t), groups: [...M.querySelectorAll('.v144-gl input')].map((i) => i.value) };
    });
    check('The window lists the folders, the call types under their buttons and the team\'s own types', m && m.folders.includes('Testwell Group') && m.types >= 11 && m.own.join() === 'Partner call' && m.groups.includes('Client demos'), JSON.stringify(m));
    // rename the folder, rename a button and a built-in type, rename the team's own type, add a folder
    await page.fill('#v144Fs .v144-row[data-f="Testwell Group"] input', 'Testwell Holdings');
    await page.fill('.v144-grp[data-c="demo"] .v144-gl input', 'Demos');
    await page.fill('.v144-t[data-t="sales"] input', 'Sales chat');
    await page.fill('.v144-t[data-own][data-t="Partner call"] input', 'Partner intro');
    await page.fill('#v144NewF', 'Acme Advisors'); await page.click('text=Add folder'); await page.waitForTimeout(200);
    await page.click('#v144Go'); await page.waitForTimeout(1500);
    check('Rename a folder: its calls carry the new name', meta(store, 'fx-a').folder === 'Testwell Holdings', JSON.stringify(meta(store, 'fx-a')));
    check('A new folder is kept for the team', JSON.stringify(setting(store, 'call_folders') || []).includes('Acme Advisors'), JSON.stringify(setting(store, 'call_folders')));
    const nm = setting(store, 'call_type_names') || {};
    check('Built-in names are kept as the team\'s names (button and type)', nm['cat:demo'] === 'Demos' && nm.sales === 'Sales chat', JSON.stringify(nm));
    check('Rename your own type: the list and every call that had it', JSON.stringify(setting(store, 'call_types')) === '["Partner intro"]' && meta(store, 'fx-n').meeting_type === 'Partner intro', JSON.stringify([setting(store, 'call_types'), meta(store, 'fx-n')]));
    const shown = await page.evaluate(() => ({ cats: [...document.querySelectorAll('#apTk .v121-cats button')].map((b) => b.textContent), folders: [...document.querySelectorAll('#apTk .v121-fdh b')].map((b) => b.textContent) }));
    check('Tasks shows the new names right away', shown.folders.includes('Testwell Holdings') && shown.cats.some((t) => /^Demos/.test(t)), JSON.stringify(shown));
    // delete the folder and the team's own type
    await page.click('#apTk .v144-mg'); await page.waitForTimeout(700);
    await page.click('#v144Fs .v144-row[data-f="Testwell Holdings"] .v144-del');
    await page.click('.v144-t[data-own][data-t="Partner intro"] .v144-del');
    await page.click('#v144Go'); await page.waitForTimeout(1500);
    check('Delete a folder: it comes off its calls', !meta(store, 'fx-a').folder, JSON.stringify(meta(store, 'fx-a')));
    check('Delete your own type: off the list and the calls', JSON.stringify(setting(store, 'call_types')) === '[]' && !meta(store, 'fx-n').meeting_type, JSON.stringify([setting(store, 'call_types'), meta(store, 'fx-n')]));
    // a name that clashes is refused with why
    await page.click('#apTk .v144-mg'); await page.waitForTimeout(700);
    await page.fill('#v144NewF', 'Acme Advisors'); await page.click('text=Add folder'); await page.waitForTimeout(200);
    check('A folder name already there is refused with why', /already/.test(await page.textContent('#v144Msg')));
    await page.keyboard.press('Escape');
    // after a reload the team's names still show
    await page.reload({ waitUntil: 'load' }); await H.settled(page, 'app'); await page.waitForTimeout(2200);
    const after = await page.evaluate(() => [...document.querySelectorAll('#apTk .v121-cats button')].map((b) => b.textContent));
    check('After a reload the team\'s names are used', after.some((t) => /^Sales/.test(t)) && await page.evaluate(() => AP_MT.sales.l === 'Sales chat'), JSON.stringify(after));
    await ctx.close();
    // Calls has the way in too
    const C = await open('/dashboard/calls');
    check('Calls: Folders and types sits with the filters', await C.page.locator('.ap-cx-f .v144-mg').count() > 0);
    await C.ctx.close();
  }

  // 2. The calls on a calendar: a month at a time, a day's recordings beside it, a call opens on All
  if (want('calendar')) {
    const { ctx, page } = await open('/dashboard/calls');
    const tab = page.locator('#apChrome .rd-tab[data-tab="cal"]');
    check('Calls: a Calendar tab next to All, Clients and Internal', await tab.count() === 1);
    await tab.click(); await page.waitForTimeout(500);
    const ymd = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const g = await page.evaluate(() => ({ month: (document.querySelector('.v144-ch h3') || {}).textContent, days: document.querySelectorAll('.v144-cd:not(.is-pad)').length, has: [...document.querySelectorAll('.v144-cd.has')].map((b) => b.dataset.d), today: !!document.querySelector('.v144-cd.is-today') }));
    check('The month shows, today marked, the days with calls stand out', g.days >= 28 && g.today && g.has.includes(ymd(CN.start)), JSON.stringify(g));
    await page.click('.v144-cd[data-d="' + ymd(CN.start) + '"]'); await page.waitForTimeout(300);
    const day = await page.evaluate(() => [...document.querySelectorAll('.v144-day .v144-dc b')].map((b) => b.textContent));
    check('A click on a day lists its recordings', day.some((t) => /First chat · Northwind/.test(t)), JSON.stringify(day));
    const meta = await page.textContent('.v144-day');
    check('Each recording says its time, length and client folder', /30 min/.test(meta) && /Northwind/.test(meta), meta.slice(0, 200));
    await page.locator('.v144-dc', { hasText: 'First chat' }).click(); await page.waitForTimeout(800);
    const opened = await page.evaluate(() => ({ tab: (document.querySelector('#apChrome .rd-tab.on') || {}).dataset, sel: String(AP_FT.sel), h: (document.querySelector('.ap-call-d h2') || {}).textContent }));
    check('A recording opens on the All tab', opened.tab && opened.tab.tab === 'all' && opened.sel === 'fx-n' && /First chat/.test(opened.h || ''), JSON.stringify(opened));
    await tab.click(); await page.waitForTimeout(300);
    await page.click('[aria-label="Previous month"]'); await page.waitForTimeout(300);
    const prev = await page.evaluate(() => ({ month: document.querySelector('.v144-ch h3').textContent, n: document.querySelector('.v144-cn').textContent, more: !!document.querySelector('.v144-more') }));
    check('Previous month: no calls, and no older page to load when Fathom has none', /0 calls/.test(prev.n) && !prev.more, JSON.stringify(prev));
    await page.click('.v144-ch button:has-text("Today")'); await page.waitForTimeout(300);
    check('Today comes back to this month', await page.locator('.v144-cd.is-today').count() === 1);
    await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(400);
    const ph = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, w: Math.round(document.querySelector('.v144-grid').getBoundingClientRect().width) }));
    check('Calendar on a phone: fits, no sideways scroll', !ph.over && ph.w <= 390, JSON.stringify(ph));
    const hd = await page.evaluate(() => Math.round(document.querySelector('#apChrome .rd-head > div').getBoundingClientRect().height));
    check('A page header on a phone is as tall as its text (it had a 320px gap)', hd < 200, String(hd));
    await ctx.close();
  }

  // 3. Calls filed under clients by their people; Create a client record for someone new
  const CD = call('fx-d', 8, 'Planning · Acme', [['Cal Finn', 'cal.finn@acme.example']], 35);    // works where a lead works
  const people = (t) => {
    t.e1_leads.push({ email: 'ceo@acme.example', prospect_name: 'Ada Chief', company_name: 'Acme Advisors', stage: 'proposal', updated_at: ago(50) });
    t.hubspot_contacts.push({ email: 'gail.free@gmail.com', first_name: 'Gail', last_name: 'Free', company: 'Free Consulting', hs_id: '9201', props: {}, synced_at: ago(1), first_seen: ago(24 * 40) });
  };
  const fresh = async (page) => { await page.evaluate(async () => { await v137Load(true); apBuildNotifs(); if (nwOn('home.today')) nwRepaint(); }); await page.waitForTimeout(500); };
  if (want('clients')) {
    let { ctx, page, store, hooks } = await open('/dashboard/today', { calls: [CA, CB, CN, CG, CD], more: people });
    await fresh(page);
    const f = await page.evaluate(() => ({ a: v121Folder('fx-a'), d: v121Folder('fx-d'), g: v121Folder('fx-g'), b: v121Folder('fx-b'), n: v121Folder('fx-n') }));
    check('Filed by a lead\'s email: the lead\'s company', f.a === 'Testwell Group' || /Test/.test(f.a), JSON.stringify(f));
    check('Filed by a lead at the same company (work email domain)', f.d === 'Acme Advisors', JSON.stringify(f));
    check('Filed by a HubSpot contact\'s company', f.g === 'Free Consulting', JSON.stringify(f));
    check('Only the team on it: AI Paragon (internal)', f.b === 'AI Paragon (internal)', JSON.stringify(f));
    const card = await page.evaluate(() => (document.querySelector('.v137-today') || {}).innerText || '');
    check('Today asks about someone new on a call', /New contact on a call: Nora Quill, Northwind/.test(card) && /Create a client record/.test(card), card.slice(0, 300));
    check('Known people are not asked about (lead, same company, HubSpot contact, the team)', !/New contact on a call: (Robin Test|Cal Finn|Gail Free)/.test(card), card.slice(0, 300));
    const bell = await page.evaluate(() => (typeof NOTIFS !== 'undefined' ? NOTIFS : []).filter((n) => /^v144:client:/.test(n.key)).map((n) => n.t));
    check('The bell asks too', bell.length === 1 && /Nora Quill/.test(bell[0]), JSON.stringify(bell));
    await page.locator('.v137-today button', { hasText: 'Create client' }).click(); await page.waitForTimeout(800);
    const q = await page.evaluate(() => ({ h: (document.querySelector('#v144C h2') || {}).textContent, name: (document.getElementById('v144CName') || {}).value, email: (document.getElementById('v144CEmail') || {}).value, co: (document.getElementById('v144CCo') || {}).value, folder: (document.getElementById('v144CFolder') || {}).value }));
    check('The question names them and fills in what the call knows', /Create a client record for Nora Quill\?/.test(q.h) && q.email === 'nora@northwind.example' && q.co === 'Northwind' && q.folder === 'Northwind', JSON.stringify(q));
    await page.fill('#v144CCo', 'Northwind Partners'); await page.waitForTimeout(100);
    check('The folder follows the company until it is typed in', (await page.inputValue('#v144CFolder')) === 'Northwind Partners');
    await page.check('#v144CRun');
    await page.click('#v144CGo'); await page.waitForTimeout(1800);
    const lead = store.db.e1_leads.find((r) => r.email === 'nora@northwind.example');
    check('Create client record: a lead in Prospect research, source Call', lead && lead.stage === 'research' && lead.lead_source === 'Call' && lead.company_name === 'Northwind Partners' && lead.prospect_name === 'Nora Quill', JSON.stringify(lead));
    check('The call is filed in the new folder, under the lead', meta(store, 'fx-n').folder === 'Northwind Partners' && meta(store, 'fx-n').lead_email === 'nora@northwind.example' && meta(store, 'fx-n').lead_stage === 'research', JSON.stringify(meta(store, 'fx-n')));
    check('The folder is kept for the team', JSON.stringify(setting(store, 'call_folders') || []).includes('Northwind Partners'));
    const run = hooks.filter((h) => /870a1ffa/.test(h.p));
    check('Write the prospect brief now: the full run starts for that one stage', run.length === 1 && run[0].b.only === true && /nora@northwind/.test(JSON.stringify(run[0].b)), JSON.stringify(run.map((h) => h.b && h.b.email)));
    const after = await page.evaluate(() => (document.querySelector('.v137-today') || {}).innerText || '');
    check('Once created, Today stops asking', !/Nora Quill/.test(after), after.slice(0, 200));
    await ctx.close();
    // Not a client, and Just file the call
    ({ ctx, page, store } = await open('/dashboard/today', { calls: [CN, CG, call('fx-z', 3, 'Hello · Zephyr', [['Zed Zane', 'zed@zephyr.example']], 15)], more: people }));
    await fresh(page);
    await page.evaluate(() => v137Open('v144:client:fx-z')); await page.waitForTimeout(700);
    await page.click('#v144C button:has-text("Not a client")'); await page.waitForTimeout(1200);
    const inbox = setting(store, 'catalyst_inbox') || {};
    check('Not a client: set aside for the team, and no lead made', inbox.calls && inbox.calls['fx-z'] && !store.db.e1_leads.some((r) => r.email === 'zed@zephyr.example'), JSON.stringify(inbox));
    await page.evaluate(() => v137Open('v144:client:fx-n')); await page.waitForTimeout(700);
    await page.click('#v144C button:has-text("Just file the call")'); await page.waitForTimeout(1200);
    check('Just file the call: the folder, no lead', meta(store, 'fx-n').folder === 'Northwind' && !meta(store, 'fx-n').lead_email && !store.db.e1_leads.some((r) => r.email === 'nora@northwind.example'), JSON.stringify(meta(store, 'fx-n')));
    const left = await page.evaluate(() => (V137.items || []).filter((x) => x.kind === 'client').map((x) => x.id));
    check('Both are off the list after', !left.includes('fx-z') && !left.includes('fx-n'), JSON.stringify(left));
    // a call question for a call with no lead asks to create the client instead of a dead end
    await page.evaluate(() => v137AskCall('fx-g')); await page.waitForTimeout(900);
    const asked = await page.evaluate(() => ({ modal: !!document.getElementById('v144C'), toast: /None of the people/.test(document.body.innerText) }));
    check('No lead on a call: the create-client question, not "None of the people on this call is a lead"', asked.modal && !asked.toast, JSON.stringify(asked));
    await ctx.close();
    // a folder the team already has wins over a new spelling
    ({ ctx, page } = await open('/dashboard/today', { calls: [CN], more: (t) => { t.ai_settings.push({ key: 'call_folders', value: ['NorthWind'], updated_at: ago(5) }); } }));
    await fresh(page);
    const nf = await page.evaluate(() => ({ f: v121Folder('fx-n'), asked: (V137.items || []).some((x) => x.kind === 'client') }));
    check('A folder the team has (NorthWind) files the call, and nobody is asked', nf.f === 'NorthWind' && !nf.asked, JSON.stringify(nf));
    await ctx.close();
  }

  // 4. A lead's HubSpot tab, read live
  if (want('hubspot')) {
    let mode = 'ok';
    const hook = (p, j) => {
      if (p !== 'catalyst-hubspot-contact') return null;
      if (mode === 'off') return { status: 404, body: { code: 404, message: 'The requested webhook is not registered.' } };
      if (mode === 'none') return { body: { ok: true, found: false, email: j.email, at: new Date().toISOString() } };
      return { body: { ok: true, found: true, id: '9001', at: new Date().toISOString(), contact: { email: j.email, firstname: 'Pat', lastname: 'QA', company: 'QA Firm LLC', jobtitle: 'Managing Partner',
        phone: '555-0110', website: 'qafirm.example', city: 'Austin', state: 'TX', lifecyclestage: 'salesqualifiedlead', hs_lead_status: 'IN_PROGRESS', num_notes: '4', num_associated_deals: '1',
        notes_last_contacted: '2026-11-20T15:00:00Z', hs_email_last_reply_date: '2026-11-21T10:00:00Z', createdate: '2026-09-02T10:00:00Z' } } };
    };
    const { ctx, page, hooks } = await open('/dashboard/lead-pipeline', { hook });
    const openTab = async () => {
      await page.evaluate((e) => openE1Lead(e), L1); await page.waitForTimeout(2600);
      const k = await page.evaluate(() => { const b = [...document.querySelectorAll('#apChrome .rd-tab')].find((x) => /HubSpot/.test(x.textContent)); return b ? b.dataset.tab : ''; });
      if (k) await page.evaluate((k) => apTab(k), k); await page.waitForTimeout(500);
      return k;
    };
    const k = await openTab();
    const live = await page.evaluate(() => { const b = document.querySelector('.v144-hs'); return b ? { text: b.innerText.replace(/\s+/g, ' '), drawn: !!b.offsetParent } : null; });
    check('The lead\'s HubSpot tab reads HubSpot live', !!k && live && live.drawn && /Live from HubSpot/i.test(live.text), JSON.stringify(live));
    check('It shows what HubSpot has now: stage, status, notes, deals, last contact and reply', live && /Sales qualified lead/.test(live.text) && /In progress/.test(live.text) && /notes 4/i.test(live.text) && /deals 1/i.test(live.text) && /last contacted Nov 20/i.test(live.text) && /last reply Nov 21/i.test(live.text), live && live.text);
    const req = hooks.filter((h) => h.p === 'catalyst-hubspot-contact');
    check('The request carries the lead\'s email and the sign-in, nothing else', req.length === 1 && req[0].b.email === L1 && !!req[0].b.auth && Object.keys(req[0].b).sort().join() === 'auth,email', JSON.stringify(req.map((h) => Object.keys(h.b))));
    await page.click('.v144-hs button:has-text("Refresh")'); await page.waitForTimeout(800);
    check('Refresh asks HubSpot again', hooks.filter((h) => h.p === 'catalyst-hubspot-contact').length === 2);
    mode = 'none'; await page.click('.v144-hs button:has-text("Refresh")'); await page.waitForTimeout(800);
    check('A lead HubSpot does not have says so', /HubSpot has no contact with qa\.lead1@example\.com/.test(await page.textContent('.v144-hs')));
    mode = 'off'; await page.click('.v144-hs button:has-text("Refresh")'); await page.waitForTimeout(800);
    const off = await page.evaluate(() => ({ t: document.querySelector('.v144-hs').innerText, err: document.querySelector('.v144-hs').classList.contains('is-err'), synced: /synced|No HubSpot contact/.test(document.querySelector('#main').innerText) }));
    check('HubSpot can\'t be read: it says why, and keeps the synced copy below', off.err && /switched off/.test(off.t) && /last copy the sync made/.test(off.t) && off.synced, JSON.stringify(off));
    await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(300);
    check('HubSpot tab on a phone: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
