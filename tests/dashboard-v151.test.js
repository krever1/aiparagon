// v151 tests for new-aiparagon-dashboard.html (#1): the client workspace sends files, transcripts and calls to Asana or
// Notion. Select in the workspace's header picks items; Send to Asana makes a task per item (named for it and the client,
// its description with the folder and the link) in the project picked, through the browser's Asana token; Send to
// Notion adds an entry per item (and a follow-up if ticked) through the Notion proxy; what went where shows on each row.
// Asana answers from a stand-in (page.route), Supabase from an in-memory store (lib/rest-stub.js) filled with synthetic
// data (lib/qa-fixtures.js), n8n webhooks from stubs. Everyone is made up. Fails on the build before v151.
// Usage: node tests/dashboard-v151.test.js
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
const L1 = FX.L1;
const DB1 = '11111111-1111-4111-8111-111111111111', DB2 = '22222222-2222-4222-8222-222222222222';

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
      stage: 'interview_script', source: 'upload', note: 'What Pat said about reporting', uploaded_by: 'QA Tester', created_at: new Date(Date.now() - 86400e3).toISOString(), file_text: 'Synthetic notes.', category: 'transcript' });
    const store = makeStore(t);
    const hooks = [], adds = [];
    const hook = (u, m, b) => {
      let j = null; try { j = JSON.parse(b || ''); } catch (e) {}
      const p = u.replace(/^https:\/\/n8n\.aiparagonconsulting\.com\/webhook\//, '');
      hooks.push({ p, b: j });
      if (/fathom-proxy$/.test(u)) return { body: j && j.action === 'list' ? { ok: true, items: [] } : { ok: true, connected: true } };
      if (p === 'notion-proxy') {
        if (j.action === 'databases') return { body: { object: 'list', action: 'databases', results: o.share === false ? [] : [{ object: 'database', id: DB1, title: [{ plain_text: 'Engine 3: Digest Page' }] }, { object: 'database', id: DB2, title: [{ plain_text: 'Erica Tasks' }] }] } };
        if (j.action === 'add') { if (o.failAt && adds.length === o.failAt && !o.failed) { o.failed = true; return { body: { object: 'error', code: 'notion_error', message: 'Notion is busy.' } }; } adds.push(j); return { body: { object: 'list', action: 'add', results: [{ object: 'page', id: 'p' + adds.length }] } }; }
      }
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    const log = [];
    await page.route('https://app.asana.com/**', async (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname.replace('/api/1.0', '');
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const auth = req.headers()['authorization'] || '';
      log.push({ m: req.method(), p, body: req.postData() || '' });
      const j = (s, data) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
      if (!/good-qa-token/.test(auth)) return j(401, { errors: [{ message: 'Not Authorized' }] });
      if (p === '/workspaces') return j(200, { data: [{ gid: 'w1', name: 'QA Workspace' }] });
      if (p === '/projects') return j(200, { data: [{ gid: 'p1', name: 'Client launches' }, { gid: 'p2', name: 'Internal' }] });
      if (p === '/users') return j(200, { data: [{ gid: 'u1', name: 'QA Tester' }, { gid: 'u2', name: 'Erica Example' }] });
      if (p === '/tasks' && req.method() === 'POST') { const b = JSON.parse(req.postData() || '{}').data || {}; return j(201, { data: { gid: 'a' + log.length, name: b.name, permalink_url: 'https://app.asana.com/0/p/' + log.length } }); }
      return j(404, { errors: [{ message: 'not stubbed' }] });
    });
    if (o.token !== false) await page.addInitScript(() => { try { localStorage.setItem('asana_pat', 'good-qa-token'); } catch (e) {} });
    await page.setViewportSize({ width: o.width || 1440, height: 900 });
    await page.goto(BASE + '/dashboard/lead-pipeline', { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1500);
    await page.evaluate((e) => openE1Lead(e), L1); await page.waitForTimeout(2600);
    const t2 = page.locator('#apChrome .rd-tab', { hasText: /^Files/ }); if (await t2.count()) { await t2.first().click(); await page.waitForTimeout(400); }
    return { ctx, page, store, hooks, adds, log };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 300);
  const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  const ws = (store) => { const r = store.db.ai_settings.find((x) => x.key === 'catalyst_ws'); return r ? (typeof r.value === 'string' ? JSON.parse(r.value) : r.value) : {}; };
  const pickRow = async (page, name) => { await page.locator('#main .v145-wr', { hasText: name }).first().locator('.v151-ck input').check(); await wait(page, 300); };

  // 1. Select, then Send to Asana: a task per item, named for it and the client, with its link; the row says so
  if (want('asana')) {
    const { ctx, page, store, log } = await open();
    check('The workspace has Select, and no boxes until it is on', await page.locator('#main .v145-wsh .v151-tg').count() === 1 && await page.locator('#main .v151-ck').count() === 0);
    await page.click('#main .v151-tg'); await wait(page, 300);
    check('Select shows a box on each row and the send bar, with sending off until something is picked', await page.locator('#main .v151-ck').count() >= 2 && await page.isDisabled('#main .v151-bar button:has-text("Send to Asana")'));
    await pickRow(page, 'QA-Form-ADV.pdf'); await pickRow(page, 'Discovery call notes.txt');
    check('The bar counts what is picked', /2 items picked/.test(await txt(page, '#main .v151-bar')));
    await page.click('#main .v151-bar button:has-text("Send to Asana")'); await page.waitForSelector('#v151AsM .v143-as-row', { timeout: 8000 });
    const rows = await page.$$eval('#v151AsM .v143-as-row', (r) => r.map((x) => ({ n: x.querySelector('.v151-nm').value, d: x.querySelector('textarea').value })));
    check('Each item is a task named for it and the client', rows.length === 2 && rows.some((r) => r.n === 'QA-Form-ADV.pdf · QA Firm LLC') && rows.some((r) => r.n === 'Discovery call notes.txt · QA Firm LLC'), JSON.stringify(rows.map((r) => r.n)));
    const tr = rows.find((r) => /Discovery/.test(r.n)) || {};
    check('…its description says what it is, where it is filed, what it is about and how to open it', /^Transcript from QA Firm LLC’s workspace · Discovery consultation · /.test(tr.d) && /About it: What Pat said about reporting/.test(tr.d) && /Open it: https:\/\/lesyptuwllcgajdxzjje\.supabase\.co\/storage\/v1\/object\/public\/lead-files\/qa\/notes\.txt/.test(tr.d), tr.d);
    await page.selectOption('#v151AsP', 'p2'); await page.selectOption('#v151AsU', 'u2');
    await page.locator('#v151AsM .v143-as-row').first().locator('input[type=date]').fill('2026-12-05');
    await page.click('#v151AsGo'); await wait(page, 1500);
    const posts = log.filter((l) => l.m === 'POST' && l.p === '/tasks').map((l) => JSON.parse(l.body).data);
    check('Asana gets the tasks in the project picked, with the assignee and due date', posts.length === 2 && posts.every((x) => x.projects[0] === 'p2' && x.assignee === 'u2') && posts.some((x) => x.due_on === '2026-12-05') && posts.some((x) => /Open it: https:/.test(x.notes)), JSON.stringify(posts));
    const meta = (ws(store)[L1] || {}).items || {};
    check('What went where is kept on each item', meta['f:00000000-0000-4000-8000-0000000f1001'] && meta['f:00000000-0000-4000-8000-0000000f1001'].asana && meta['f:00000000-0000-4000-8000-0000000f1001'].asana.project_name === 'Internal', JSON.stringify(meta));
    check('The rows say In Asana, and picking is done', /In Asana · Internal/.test(await txt(page, '#main .v145-wr:has-text("QA-Form-ADV.pdf")')) && await page.locator('#main .v151-ck').count() === 0, await txt(page, '#main .v145-wr:has-text("QA-Form-ADV.pdf")'));
    check('The message says where they went', /2 items sent to Internal/.test(await txt(page, '#nwToast')));
    await ctx.close();
  }

  // 2. Not connected: the 3 steps, not an error
  if (want('off')) {
    const { ctx, page } = await open({ token: false });
    await page.click('#main .v151-tg'); await wait(page, 300);
    await pickRow(page, 'QA-Form-ADV.pdf');
    await page.click('#main .v151-bar button:has-text("Send to Asana")'); await wait(page, 2500);
    const t = await txt(page, '#v151AsM');
    check('With no Asana connection it shows how to connect, not an error', /Connect Asana once|personal access token|Asana is not connected/i.test(t) && !/could not be reached/i.test(t), t.slice(0, 200));
    await ctx.close();
  }

  // 3. Send to Notion: an entry per item and a follow-up; a stop halfway sends the rest after
  if (want('notion')) {
    const { ctx, page, store, adds } = await open({ failAt: 1 });
    await page.click('#main .v151-tg'); await wait(page, 300);
    await pickRow(page, 'QA-Form-ADV.pdf'); await pickRow(page, 'Discovery call notes.txt');
    await page.click('#main .v151-bar button:has-text("Send to Notion")'); await page.waitForSelector('#v151NtDb', { timeout: 8000 });
    check('It offers the databases shared with the connection, a tasks one first', await page.inputValue('#v151NtDb') === DB2);
    await page.check('#v151NtFu');
    await page.click('#v151NtGo'); await wait(page, 1500);
    check('A stop halfway says how many went and offers the rest', /1 sent, then Notion stopped: Notion is busy\./.test(await txt(page, '#v151NtErr')) && /Send the rest/.test(await txt(page, '#v151NtGo')), await txt(page, '#v151NtErr'));
    await page.click('#v151NtGo'); await wait(page, 1500);
    const titles = adds.map((a) => a.title);
    check('Notion gets an entry per item, named for it and the client, then the follow-up, once each', titles.length === 3 && titles.includes('QA-Form-ADV.pdf · QA Firm LLC') && titles.includes('Discovery call notes.txt · QA Firm LLC') && titles[2] === 'Follow-up: QA Firm LLC' && adds.every((a) => a.id === DB2), JSON.stringify(titles));
    check('The rows say In Notion', /In Notion · Erica Tasks/.test(await txt(page, '#main .v145-wr:has-text("Discovery call notes.txt")')));
    check('The database is kept for the team', ((store.db.ai_settings.find((x) => x.key === 'notion_tasks_db') || {}).value || {}).id === DB2);
    await ctx.close();
  }

  // 4. Notion shares no database yet: the steps to share one
  if (want('noshare')) {
    const { ctx, page } = await open({ share: false });
    await page.click('#main .v151-tg'); await wait(page, 300);
    await pickRow(page, 'QA-Form-ADV.pdf');
    await page.click('#main .v151-bar button:has-text("Send to Notion")'); await wait(page, 1500);
    check('With no database shared it says how to share one', /shares no databases/.test(await txt(page, '#v151NtM')) && /Connections/.test(await txt(page, '#v151NtM')));
    await ctx.close();
  }

  // 5. On a phone
  if (want('phone')) {
    const { ctx, page } = await open({ width: 390 });
    await page.click('#main .v151-tg'); await wait(page, 300);
    await pickRow(page, 'QA-Form-ADV.pdf');
    check('On a phone the bar fits: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.click('#main .v151-bar button:has-text("Send to Asana")'); await page.waitForSelector('#v151AsM .v143-as-row', { timeout: 8000 });
    check('…and so does Send to Asana', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
