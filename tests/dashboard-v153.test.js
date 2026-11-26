// v153 tests for new-aiparagon-dashboard.html (#1): the client workspace's preview panel and folder suggestions for calls
// (the two parts of Erica's workspace mockup v145 left out). A click on an item's name opens a side panel: Preview (a
// document's text, a file's text as read, a call's summary and transcript), Details (what it is, where it is, the
// description and source switch, saved) and Activity (what happened to it, with every change made in the workspace
// logged); Star, Rename and Move in its head, Open and View related call in its foot. On Calls, the calls with no folder
// get Review suggestions: a folder each, with why, filed in one go. Supabase answers from an in-memory store
// (lib/rest-stub.js) with synthetic data (lib/qa-fixtures.js), n8n and Fathom from stubs. Everyone is made up.
// Fails on the build before v153.
// Usage: node tests/dashboard-v153.test.js
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
const L1 = FX.L1, ME = 'qa@aiparagonconsulting.com';
const call = (id, title, start, mins) => ({ id, title, start, end: new Date(Date.parse(start) + (mins || 30) * 60e3).toISOString(), share_url: 'https://fathom.video/share/' + id + 'abcdefgh',
  recorded_by: { name: 'QA Tester', email: ME }, invitees: [{ name: 'Pat QA', email: L1, external: true }, { name: 'QA Tester', email: ME, external: false }] });
const CALLS = [call('c-prop', 'Proposal walkthrough', '2026-11-20T17:00:00Z', 27), call('c-intro', 'Intro chat', '2026-10-01T18:00:00Z', 22), call('c-type', 'Catch-up with Pat', '2026-11-22T17:00:00Z', 15)];

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(o) {
    o = o || {};
    const t = FX.tables();
    t.lead_files.push({ id: '00000000-0000-4000-8000-0000000f1003', lead_email: L1, file_name: 'Discovery call notes.txt', file_url: 'https://lesyptuwllcgajdxzjje.supabase.co/storage/v1/object/public/lead-files/qa/notes.txt', file_path: 'qa/notes.txt',
      stage: 'interview_script', source: 'upload', note: 'What Pat said about reporting', uploaded_by: 'QA Tester', created_at: new Date(Date.now() - 86400e3).toISOString(), file_text: 'Pat: Month-end reports take us two days.\nQA Tester: What would a pilot need?', category: 'transcript' });
    t.call_outputs.push({ id: '00000000-0000-4000-8000-0000000ca0b1', call_id: 'c-prop', call_title: 'Proposal walkthrough', call_start: '2026-11-20T17:00:00Z', meeting_type: 'proposal', summary: ['Walked through the proposed pilot', 'Pat asked for a January start'], tasks: [{ id: 't9', text: 'Send the revised scope', owner: 'Kaeser', done: false }], status: 'done', created_at: '2026-11-20T18:00:00Z', updated_at: '2026-11-20T18:00:00Z' });
    t.call_meta.push({ call_id: 'c-type', meeting_type: o.typeKey || 'onboarding', updated_at: '2026-11-22T18:00:00Z', updated_by: ME });
    if (o.more) o.more(t);
    const store = makeStore(t);
    const hooks = [];
    const hook = (u, m, b) => {
      let j = null; try { j = JSON.parse(b || ''); } catch (e) {}
      const p = u.replace(/^https:\/\/n8n\.aiparagonconsulting\.com\/webhook\//, '');
      hooks.push({ p, b: j });
      if (/fathom-proxy$/.test(u)) {
        if (j && j.action === 'list') return { body: { ok: true, items: o.calls || CALLS } };
        if (j && j.action === 'transcript') return { body: { ok: true, transcript: [{ speaker: 'Pat QA', text: 'We want to start in January.' }, { speaker: 'QA Tester', text: 'Then the scope comes first.' }] } };
        return { body: { ok: true, connected: true, hint: 'abcd' } };
      }
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    page.on('dialog', (d) => d.accept());
    await page.setViewportSize({ width: o.width || 1440, height: 900 });
    await page.goto(BASE + '/dashboard/lead-pipeline', { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1500);
    await page.evaluate((e) => openE1Lead(e), L1); await page.waitForTimeout(2600);
    const t2 = page.locator('#apChrome .rd-tab', { hasText: /^Files/ }); if (await t2.count()) { await t2.first().click(); await page.waitForTimeout(600); }
    return { ctx, page, store, hooks };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 300);
  const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  const ws = (store) => { const r = store.db.ai_settings.find((x) => x.key === 'catalyst_ws'); return ((r ? (typeof r.value === 'string' ? JSON.parse(r.value) : r.value) : {})[L1] || {}).items || {}; };
  const openItem = async (page, name) => { await page.locator('#main .v145-wr .v153-open', { hasText: name }).first().click(); await page.waitForSelector('#v153D', { timeout: 6000 }); await wait(page, 500); };
  const tab = async (page, name) => { await page.click('#v153D .v153-tabs button:has-text("' + name + '")'); await wait(page, 300); };
  const F1 = 'f:00000000-0000-4000-8000-0000000f1001';

  // 1. A file opens in the panel: its text, details, activity; rename, star, move and the description are saved and logged
  if (want('file')) {
    const { ctx, page, store } = await open();
    check('Each item\'s name in the workspace is a button that opens it', await page.locator('#main .v145-wr .v153-open').count() >= 4);
    await openItem(page, 'QA-Form-ADV.pdf');
    const head = await txt(page, '#v153D .nw-d-head');
    check('The panel says it is a file preview, with its folder, name, who uploaded it and when', /File preview/.test(head) && /Prospect research/.test(head) && /QA-Form-ADV\.pdf/.test(head) && /Uploaded by QA Tester/.test(head) && /Oct 2, 2026/.test(head), head);
    check('It opens on Preview, with the text read from the file', (await page.getAttribute('#v153T-preview', 'aria-selected')) === 'true' && /Synthetic ADV text\./.test(await txt(page, '#v153Pane')), await txt(page, '#v153Pane'));
    check('Its foot opens the file', /Open PDF/.test(await txt(page, '#v153D .nw-d-foot')) && (await page.getAttribute('#v153D .nw-d-foot a', 'href') || '').endsWith('QA-Form-ADV.pdf'));
    await tab(page, 'Details');
    const det = await txt(page, '#v153Pane');
    check('Details: kind, folder, format, who and when', /Kind ?Uploaded file/.test(det) && /Folder ?Prospect research/.test(det) && /Uploaded by ?QA Tester/.test(det) && /Date ?Oct 2, 2026/.test(det), det);
    await page.fill('#v153Desc', 'Their Form ADV, for the assessment');
    await page.click('#v153D button:has-text("Save details")'); await wait(page, 900);
    check('The description is saved for the team and shows on the row', (ws(store)[F1] || {}).desc === 'Their Form ADV, for the assessment' && /Their Form ADV, for the assessment/.test(await txt(page, '#main .v145-wr:has-text("QA-Form-ADV.pdf")')), JSON.stringify(ws(store)[F1]));
    await page.click('#v153D button:has-text("Rename")'); await wait(page, 300);
    await page.fill('#v153RnIn', 'Form ADV (2026)'); await page.keyboard.press('Enter'); await wait(page, 900);
    check('Rename saves the new name, in the panel and on the row', (ws(store)[F1] || {}).name === 'Form ADV (2026)' && /Form ADV \(2026\)/.test(await txt(page, '#v153D .nw-d-title')) && await page.locator('#main .v145-wr .v153-open', { hasText: 'Form ADV (2026)' }).count() === 1);
    await page.click('#v153D .v145-star'); await wait(page, 900);
    check('Star stars it', (ws(store)[F1] || {}).star === true && (await page.getAttribute('#v153D .v145-star', 'aria-pressed')) === 'true');
    await page.selectOption('#v153Move', 'assessment'); await wait(page, 1200);
    check('Move puts it in another folder', (ws(store)[F1] || {}).folder === 'assessment' && /Assessment/.test(await txt(page, '#v153D .nw-d-head .v145-fchip')));
    await tab(page, 'Activity');
    const act = await txt(page, '#v153Pane');
    check('Activity: uploaded, read, and each change made here, newest first, with who', /Uploaded by QA Tester/.test(act) && /Text read for the Ask bot/.test(act) && /Description changed/.test(act) && /Renamed to “Form ADV \(2026\)”/.test(act) && /Starred/.test(act) && /Moved to Assessment/.test(act) && act.indexOf('Moved to Assessment') < act.indexOf('Renamed to'), act);
    const log = (ws(store)[F1] || {}).log || [];
    check('…kept on the item for the team', log.length === 4 && log.every((l) => l.at && l.by && l.what), JSON.stringify(log));
    await page.keyboard.press('Escape'); await wait(page, 300);
    check('Esc closes the panel', await page.locator('#v153D').count() === 0);
    await ctx.close();
  }

  // 2. A document and a transcript: the document's own text, the related call, a transcript's source switch
  if (want('doc')) {
    const { ctx, page, store } = await open({ more: (t) => { t.call_meta.push({ call_id: 'c-prop', lead_email: L1, lead_stage: 'proposal', updated_at: '2026-11-20T18:00:00Z', updated_by: ME }); } });
    await openItem(page, 'Proposal presentation');
    const pv = await txt(page, '#v153Pane');
    check('A Catalyst document shows its own text, laid out', /growth_plan for QA Firm/.test(pv) && /Summary/.test(pv) && await page.locator('#v153Pane .v153-doc li', { hasText: 'Point one' }).count() === 1, pv.slice(0, 200));
    check('…with its formats as links', await page.locator('#v153Pane .v153-fm a', { hasText: 'Google Doc' }).count() === 1);
    const foot = await txt(page, '#v153D .nw-d-foot');
    check('View related call: the newest call in the same folder', /View related call/.test(foot), foot);
    await page.click('#v153D .nw-d-foot button:has-text("View related call")'); await wait(page, 600);
    check('…opens that call in the panel', /Call preview/.test(await txt(page, '#v153D .nw-d-head')) && /Proposal walkthrough/.test(await txt(page, '#v153D .nw-d-title')));
    await page.keyboard.press('Escape'); await wait(page, 300);
    await openItem(page, 'Discovery call notes.txt');
    check('A transcript shows its text', /Month-end reports take us two days/.test(await txt(page, '#v153Pane')));
    await tab(page, 'Details');
    check('Details say it is a source for the stage runs', /Source ?Yes/.test(await txt(page, '#v153Pane')) && await page.isChecked('#v153Src'));
    await page.uncheck('#v153Src'); await page.click('#v153D button:has-text("Save details")'); await wait(page, 900);
    check('Unticking source is saved and logged', ws(store)['f:00000000-0000-4000-8000-0000000f1003'].source === false && /No longer a source/.test(JSON.stringify(ws(store)['f:00000000-0000-4000-8000-0000000f1003'].log || [])));
    await ctx.close();
  }

  // 3. A call: summary, next steps, transcript on request, Open on Calls
  if (want('call')) {
    const { ctx, page, hooks } = await open();
    await page.click('#main .v145-wtabs button:has-text("Calls")'); await wait(page, 500);
    await openItem(page, 'Proposal walkthrough');
    const pv = await txt(page, '#v153Pane');
    check('A call shows its post-call summary and next steps', /Walked through the proposed pilot/.test(pv) && /Send the revised scope \(Kaeser\)/.test(pv), pv);
    check('…and reads no transcript until asked', !hooks.some((h) => h.b && h.b.action === 'transcript'));
    await page.click('#v153Pane button:has-text("Show the transcript")'); await wait(page, 1200);
    check('Show the transcript reads it from Fathom', /Pat QA: We want to start in January\./.test(await txt(page, '#v153Pane')) && hooks.some((h) => h.b && h.b.action === 'transcript' && h.b.id === 'c-prop'));
    const foot = await txt(page, '#v153D .nw-d-foot');
    check('Its foot opens it in Fathom and on Calls', /Open in Fathom/.test(foot) && /Open on Calls/.test(foot), foot);
    await tab(page, 'Details');
    check('Details: people, length, call type, and not filed yet', /People ?Pat QA/.test(await txt(page, '#v153Pane')) && /Length ?27 min/.test(await txt(page, '#v153Pane')) && /Not filed under a stage yet/.test(await txt(page, '#v153Pane')), await txt(page, '#v153Pane'));
    await ctx.close();
  }

  // 4. Calls with no folder: Review suggestions, a folder each with why, filed in one go
  if (want('suggest')) {
    const { ctx, page, store } = await open();
    await page.click('#main .v145-wtabs button:has-text("Calls")'); await wait(page, 500);
    const note = await txt(page, '#main .v145-wnote');
    check('The calls view says how many need a folder, with Review suggestions', /3 calls need a folder/.test(note) && await page.locator('#main .v145-wnote button:has-text("Review suggestions")').count() === 1, note);
    await page.click('#main .v145-wnote button:has-text("Review suggestions")'); await page.waitForSelector('#v153S', { timeout: 5000 }); await wait(page, 300);
    const rows = await page.$$eval('#v153S .v153-sg li', (l) => l.map((x) => ({ n: x.querySelector('b').textContent, f: x.querySelector('select').value, why: (x.querySelector('.v153-why') || {}).textContent || '', on: x.querySelector('input').checked })));
    const by = (n) => rows.find((r) => r.n === n) || {};
    check('Each call gets a folder, ticked', rows.length === 3 && rows.every((r) => r.f && r.on), JSON.stringify(rows));
    check('…from its title', by('Proposal walkthrough').f === 'proposal' && /Its title says “Proposal”/.test(by('Proposal walkthrough').why), JSON.stringify(by('Proposal walkthrough')));
    check('…from the stage documents written before it', by('Intro chat').f === 'research' && /Held after the .* was written \(Oct 1, 2026\)/.test(by('Intro chat').why), JSON.stringify(by('Intro chat')));
    check('…from its call type when that is a stage\'s meeting', by('Catch-up with Pat').f === 'onboarding' && /Its call type is Onboarding: the Onboarding stage’s meeting/.test(by('Catch-up with Pat').why), JSON.stringify(by('Catch-up with Pat')));
    check('The button counts what will be filed', /File 3 calls/.test(await txt(page, '#v153SGo')));
    await page.locator('#v153S .v153-sg li', { hasText: 'Catch-up with Pat' }).locator('input').uncheck(); await wait(page, 200);
    await page.locator('#v153S .v153-sg li', { hasText: 'Intro chat' }).locator('select').selectOption('consultation'); await wait(page, 200);
    check('Unticking one and changing another updates the count', /File 2 calls/.test(await txt(page, '#v153SGo')));
    await page.click('#v153SGo'); await wait(page, 1500);
    const meta = (id) => store.db.call_meta.find((r) => r.call_id === id) || {};
    check('Filing a call into a stage folder files it under that stage', meta('c-prop').lead_stage === 'proposal' && meta('c-prop').lead_email === L1 && meta('c-intro').lead_stage === 'consultation' && !meta('c-type').lead_stage, JSON.stringify(store.db.call_meta));
    const w = ws(store);
    check('…and the workspace keeps the folders, logged', w['c:c-prop'].folder === 'proposal' && w['c:c-intro'].folder === 'consultation' && !w['c:c-type'] && /Moved to Proposal/.test(JSON.stringify(w['c:c-prop'].log)), JSON.stringify(w));
    check('The message and the banner follow', /Filed 2 calls/.test(await txt(page, '#nwToast')) && /1 call needs a folder/.test(await txt(page, '#main .v145-wnote')));
    await ctx.close();
  }

  // 5. "/" puts the cursor in the workspace search
  if (want('slash')) {
    const { ctx, page } = await open();
    await page.mouse.click(5, 300); await page.keyboard.press('/'); await wait(page, 200);
    check('"/" goes to the workspace search', await page.evaluate(() => document.activeElement && document.activeElement.matches('.v145-wq input')));
    await ctx.close();
  }

  // 6. On a phone the panel and the suggestions fit the screen
  if (want('phone')) {
    const { ctx, page } = await open({ width: 390 });
    await openItem(page, 'QA-Form-ADV.pdf');
    for (const t of ['Preview', 'Details', 'Activity']) { await tab(page, t); }
    const over = await page.evaluate(() => { const d = document.getElementById('v153D'); return d.scrollWidth - d.clientWidth; });
    check('The panel has no sideways scroll on a phone', over <= 1, String(over));
    await page.keyboard.press('Escape'); await wait(page, 300);
    await page.click('#main .v145-wtabs button:has-text("Calls")'); await wait(page, 500);
    await page.click('#main .v145-wnote button:has-text("Review suggestions")'); await page.waitForSelector('#v153S'); await wait(page, 300);
    const box = await page.evaluate(() => { const m = document.getElementById('v153S').getBoundingClientRect(); return { l: m.left, r: m.right, w: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }; });
    check('The suggestions fit the screen', box.l >= -1 && box.r <= box.w + 1 && box.sw <= box.w + 1, JSON.stringify(box));
    await ctx.close();
  }

  check('No page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
