// v143 tests for new-aiparagon-dashboard.html (#1), Erica's notes of Nov 24: Back in the top bar; Tasks (fold a call,
// remove a task with Undo, pick tasks, Send to Asana through the Asana connection made on Tasks, Connect Asana instead
// of an error); Approvals' leads say what is ready for review; Run on every report of a lead's page; the brief's
// sources share two words with the point.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js).
// Usage: node tests/dashboard-v143.test.js
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

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(addr, opts) {
    opts = opts || {};
    const store = makeStore(opts.tables || FX.tables());
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: opts.hooks || (() => ({ body: { ok: true } })), bucket: errors, fixed: false });
    await page.setViewportSize({ width: opts.width || 1440, height: 900 });
    await page.goto(BASE + addr, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1200);
    return { ctx, page, store };
  }
  const backState = (page) => page.evaluate(() => { const b = document.getElementById('nwBack'); return b ? { on: b.classList.contains('on'), drawn: !!b.offsetParent, title: b.title } : null; });
  const go = async (page, v) => { await page.evaluate((v) => apGo(v), v); await page.waitForTimeout(900); };

  // 1. Back: hidden on the first page, then back through pages and a lead's own page
  if (want('back')) {
    const { ctx, page } = await open('/dashboard/today');
    let b = await backState(page);
    check('Back: the button is in the top bar, hidden on the first page', b && !b.on && !b.drawn, JSON.stringify(b));
    await go(page, 'approvals');
    await go(page, 'e3intel');
    b = await backState(page);
    check('Back: shown after a page change, named for the page before', b && b.on && b.drawn && /^Back to Approvals/.test(b.title), JSON.stringify(b));
    await page.click('#nwBack'); await page.waitForTimeout(1000);
    check('Back: goes back to Approvals, and the address follows', await page.evaluate(() => apCurrentView() === 'approvals' && /\/dashboard\/approvals$/.test(location.pathname)));
    b = await backState(page);
    check('Back: then offers the page before that', b && b.on && /^Back to Today/.test(b.title), JSON.stringify(b));
    await page.click('#nwBack'); await page.waitForTimeout(1000);
    check('Back: goes to Today, then hides (nothing before it)', await page.evaluate(() => apCurrentView() === 'today') && !(await backState(page)).on);
    // a lead's own page counts as a place
    await go(page, 'e1pipeline');
    await page.evaluate((e) => openE1Lead(e), FX.L1); await page.waitForTimeout(1200);
    await go(page, 'calls');
    b = await backState(page);
    check('Back: from Calls it names the lead', b && /^Back to Pat QA/.test(b.title), JSON.stringify(b));
    await page.click('#nwBack'); await page.waitForTimeout(1300);
    const onLead = await page.evaluate((e) => typeof state !== 'undefined' && state.view === 'e1lead' && state.e1Lead === e, FX.L1);
    check('Back: reopens that lead\'s page', onLead);
    // a phone keeps the arrow and drops the word
    await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(400);
    const ph = await page.evaluate(() => { const b = document.getElementById('nwBack'); const s = b && b.querySelector('span'); return b ? { w: Math.round(b.getBoundingClientRect().width), word: s ? getComputedStyle(s).display : '', over: document.documentElement.scrollWidth > innerWidth + 1 } : null; });
    check('Back on a phone: the arrow only, no sideways scroll', ph && ph.word === 'none' && !ph.over, JSON.stringify(ph));
    await ctx.close();
  }

  // 2. Tasks: fold a call, pick tasks, remove one with Undo, Send to Asana through the token, Connect instead of an error
  const CO = '00000000-0000-4000-8000-0000000ca001';
  const tasksTables = () => { const t = FX.tables(); t.call_outputs[0].tasks.push({ id: 't2', due: '', why: '', done: false, text: 'Send Pat the governance memo', owner: 'Erica' }); return t; };
  function asanaStub(page, log) {
    return page.route('https://app.asana.com/**', async (route) => {
      const req = route.request(), u = new URL(req.url()), p = u.pathname.replace('/api/1.0', '');
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const auth = req.headers()['authorization'] || '';
      log.push({ m: req.method(), p, body: req.postData() || '', auth });
      const j = (s, data) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
      if (!/good-qa-token/.test(auth)) return j(401, { errors: [{ message: 'Not Authorized' }] });
      if (p === '/users/me') return j(200, { data: { gid: 'u1', name: 'QA Tester', email: 'qa@example.com', workspaces: [{ gid: 'w1', name: 'QA Workspace' }] } });
      if (p === '/workspaces') return j(200, { data: [{ gid: 'w1', name: 'QA Workspace' }] });
      if (p === '/projects') return j(200, { data: [{ gid: 'p1', name: 'Client launches' }, { gid: 'p2', name: 'Internal' }] });
      if (p === '/users') return j(200, { data: [{ gid: 'u1', name: 'QA Tester' }, { gid: 'u2', name: 'Erica Example' }] });
      if (p === '/tasks' && req.method() === 'POST') { const b = JSON.parse(req.postData() || '{}').data || {}; return j(201, { data: { gid: 'a' + log.length, name: b.name, permalink_url: 'https://app.asana.com/0/p/' + log.length } }); }
      return j(404, { errors: [{ message: 'not stubbed' }] });
    });
  }
  if (want('tasks')) {
    const log = [];
    const { ctx, page, store } = await open('/dashboard/tasks', { tables: tasksTables() });
    const card = () => page.locator('#apTk .ap-tk-call').first();
    const drawn = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!(e && e.offsetParent); }, sel);
    check('Tasks: each call has a fold caret and a Select button', await card().locator('.v143-fold').count() === 1 && await card().locator('.v143-selbtn').count() === 1);
    check('Tasks: each task has a remove ×', await card().locator('.v143-del').count() === 2);
    check('Tasks: pick boxes and the pick bar stay hidden until Select', !(await drawn('#apTk .v143-pk')) && !(await drawn('#apTk .v143-pickbar')));
    await card().locator('.v143-fold').click(); await page.waitForTimeout(200);
    check('Tasks: the caret folds the call (tasks hidden, aria-expanded false)', !(await drawn('#apTk .ap-cx-tasks')) && (await card().locator('.v143-fold').getAttribute('aria-expanded')) === 'false');
    await page.reload({ waitUntil: 'load' }); await H.settled(page, 'app'); await page.waitForTimeout(1200);
    check('Tasks: a folded call stays folded after a reload', await card().evaluate((c) => c.classList.contains('v143-shut')));
    await card().locator('.v143-fold').click(); await page.waitForTimeout(200);
    check('Tasks: the caret opens it again', await drawn('#apTk .ap-cx-tasks'));
    await card().locator('.v143-selbtn').click(); await page.waitForTimeout(200);
    check('Tasks: Select shows the pick boxes and the bar', await drawn('#apTk .v143-pk') && /Pick the tasks to send/.test(await card().locator('.v143-pickbar b').textContent()));
    await card().locator('.v143-pk').nth(1).check(); await page.waitForTimeout(100);
    check('Tasks: the bar counts the picks', /1 picked/.test(await card().locator('.v143-pickbar b').textContent()));
    await card().locator('.v143-pickbar [data-a="all"]').click(); await page.waitForTimeout(100);
    check('Tasks: All picks every task', /2 picked/.test(await card().locator('.v143-pickbar b').textContent()));
    await card().locator('.v143-pickbar [data-a="none"]').click(); await card().locator('.v143-pk').nth(1).check(); await page.waitForTimeout(100);
    // Send to Asana with no token: the 3 steps, not an error
    await card().locator('.v143-pickbar [data-a="asana"]').click(); await page.waitForTimeout(2500);
    const off = await page.evaluate(() => { const b = document.getElementById('cxAsBody'); return b ? { steps: !!b.querySelector('.v143-steps'), tok: !!document.getElementById('v143iTok'), txt: b.textContent } : null; });
    check('Send to Asana without a connection shows Connect in 3 steps, not an error', off && off.steps && off.tok && !/could not be reached|n8n/i.test(off.txt), JSON.stringify(off && off.txt.slice(0, 160)));
    await asanaStub(page, log);
    await page.fill('#v143iTok', 'bad'); await page.click('#v143iGo'); await page.waitForTimeout(300);
    check('Connect: a value that is not a token is refused with why', /does not look like an Asana token/.test(await page.textContent('#v143iErr')));
    await page.fill('#v143iTok', '2/qa/wrong-qa-token-1234567'); await page.click('#v143iGo'); await page.waitForTimeout(1200);
    check('Connect: a token Asana refuses says so and is not kept', /didn’t accept that token/.test(await page.textContent('#v143iErr')) && !(await page.evaluate(() => localStorage.getItem('asana_pat'))));
    await page.fill('#v143iTok', '2/qa/good-qa-token-1234567'); await page.click('#v143iGo'); await page.waitForTimeout(2500);
    const form = await page.evaluate(() => { const rows = [...document.querySelectorAll('#apCxAsM .v143-as-row')]; return { proj: [...document.querySelectorAll('#cxAsP option')].map((o) => o.textContent), users: [...document.querySelectorAll('#cxAsU option')].map((o) => o.textContent), ticked: rows.map((r) => r.querySelector('input[type=checkbox]').checked), due: rows.map((r) => r.querySelector('input[type=date]').value), notes: rows.map((r) => r.querySelector('textarea').value) }; });
    check('Connect: then the send window opens with the projects', form.proj.join('|') === 'Client launches|Internal', JSON.stringify(form.proj));
    check('Send window: an assignee list from the Asana workspace', form.users.join('|') === 'Unassigned|QA Tester|Erica Example', JSON.stringify(form.users));
    check('Send window: only the picked task is ticked', JSON.stringify(form.ticked) === '[false,true]', JSON.stringify(form.ticked));
    check('Send window: due dates and descriptions per task', form.due[0] === '2026-10-20' && /From the call “QA weekly sync”/.test(form.notes[0]) && /Owner: Erica/.test(form.notes[1]), JSON.stringify(form));
    await page.selectOption('#cxAsP', 'p2'); await page.selectOption('#cxAsU', 'u2');
    await page.locator('#apCxAsM .v143-as-row').nth(1).locator('input[type=date]').fill('2026-12-01');
    await page.locator('#apCxAsM .v143-as-row').nth(1).locator('textarea').fill('Draft the memo first.');
    await page.click('#apCxAsM button.pri'); await page.waitForTimeout(1500);
    const posts = log.filter((x) => x.m === 'POST');
    const sent = posts.map((x) => JSON.parse(x.body).data);
    check('Send: one task goes to Asana, with the project, assignee, due date and description', sent.length === 1 && sent[0].name === 'Send Pat the governance memo' && sent[0].projects[0] === 'p2' && sent[0].assignee === 'u2' && sent[0].due_on === '2026-12-01' && sent[0].notes === 'Draft the memo first.', JSON.stringify(sent));
    const saved = store.db.call_outputs.find((r) => r.id === CO);
    check('Send: the call says it is in Asana (saved for the team)', saved.asana && saved.asana.project === 'p2' && saved.asana.tasks.length === 1, JSON.stringify(saved.asana));
    check('Send: the window closed and the card says in Asana', !(await drawn('#apCxAsM')) && /in Asana/.test(await card().textContent()));
    // remove a task, then Undo
    await card().locator('li[data-tid="t1"] .v143-del').click(); await page.waitForTimeout(800);
    let row = store.db.call_outputs.find((r) => r.id === CO);
    check('Remove: the task leaves the call and is saved for the team', row.tasks.length === 1 && row.tasks[0].id === 't2' && await card().locator('li[data-tid="t1"]').count() === 0, JSON.stringify(row.tasks.map((t) => t.id)));
    const undo = page.locator('button', { hasText: /^Undo$/ }).last();
    check('Remove: a message with Undo', await undo.count() > 0 && await undo.isVisible());
    await undo.click(); await page.waitForTimeout(800);
    row = store.db.call_outputs.find((r) => r.id === CO);
    check('Undo puts the task back in its place, saved', row.tasks.map((t) => t.id).join(',') === 't1,t2' && await card().locator('li[data-tid="t1"]').count() === 1, JSON.stringify(row.tasks.map((t) => t.id)));
    await ctx.close();
  }

  if (want('tasks')) {
    // the real case: the team-wide Asana Proxy is not published, so n8n answers 404
    const hooks = (u) => (/asana/.test(u) ? { status: 404, body: { code: 404, message: 'The requested webhook is not registered.' } } : { body: { ok: true } });
    const { ctx, page } = await open('/dashboard/tasks', { tables: tasksTables(), hooks });
    await page.locator('#apTk .ap-tk-call').first().locator('button', { hasText: /^Send to Asana$/ }).first().click(); await page.waitForTimeout(3000);
    const off = await page.evaluate(() => { const b = document.getElementById('cxAsBody'); return b ? { steps: !!b.querySelector('.v143-steps'), txt: b.textContent } : null; });
    check('Send to Asana with the n8n proxy off: Connect in 3 steps, no "could not be reached"', off && off.steps && !/could not be reached|webhook/i.test(off.txt), JSON.stringify(off && off.txt.slice(0, 160)));
    await ctx.close();
  }

  // 3. Integrations: Connect Asana opens the 3 steps; a browser connection can be disconnected
  if (want('integrations')) {
    const log = [];
    const { ctx, page } = await open('/dashboard/integrations');
    await asanaStub(page, log);
    const c = page.locator('.ap-int-card[data-k="asana"]');
    check('Integrations: the Asana card says Connect Asana', await c.locator('button', { hasText: 'Connect Asana' }).count() === 1, (await c.textContent()).slice(0, 200));
    await c.locator('button', { hasText: 'Connect Asana' }).click(); await page.waitForTimeout(400);
    check('Integrations: Connect Asana opens the 3 steps pop-up', await page.locator('#v143AsC .v143-steps li').count() === 3 && await page.locator('#v143cTok').isVisible());
    await page.fill('#v143cTok', '2/qa/good-qa-token-1234567'); await page.click('#v143cGo'); await page.waitForTimeout(2500);
    check('Integrations: connected, the pop-up closes and the card offers Disconnect', !(await page.locator('#v143AsC').isVisible().catch(() => false)) && await c.locator('.v143-dis').count() === 1, (await c.textContent()).slice(0, 200));
    page.once('dialog', (d) => d.accept());
    await c.locator('.v143-dis').click(); await page.waitForTimeout(1500);
    check('Integrations: Disconnect forgets the token in this browser', !(await page.evaluate(() => localStorage.getItem('asana_pat'))) && await c.locator('button', { hasText: 'Connect Asana' }).count() === 1);
    await ctx.close();
  }

  // 4. Approvals: a lead's stage document says Ready for review, with Review and Mark reviewed (saved for the team)
  if (want('approvals')) {
    const { ctx, page, store } = await open('/dashboard/approvals');
    await page.waitForTimeout(1500);
    const rows = () => page.evaluate(() => [...document.querySelectorAll('#main .nw-row')].filter((r) => /^lead:/.test(r.dataset.key)).map((r) => ({ key: r.dataset.key, text: r.textContent.replace(/\s+/g, ' ') })));
    let R = await rows();
    const r1 = R.find((r) => r.key === 'lead:qa.lead1@example.com:proposal'), r2 = R.find((r) => r.key === 'lead:qa.lead2@example.com:research'), r3 = R.find((r) => r.key === 'lead:qa.lead3@example.com');
    check('Approvals: a lead whose stage document is written says Ready for review: <document>', r1 && /Ready for review: Proposal presentation/.test(r1.text) && /Mark reviewed/.test(r1.text) && /Review/.test(r1.text), JSON.stringify(R));
    check('Approvals: the prospect brief of a new lead is ready for review too', r2 && /Ready for review: Pre-meeting prospect brief/.test(r2.text), JSON.stringify(r2));
    check('Approvals: a lead with nothing written yet keeps Next: <document>, no Mark reviewed', r3 && /Next: Pre-meeting prospect brief/.test(r3.text) && !/Mark reviewed/.test(r3.text), JSON.stringify(r3));
    check('Approvals: no row names the old five-document "Next: Discovery" step', !R.some((r) => /Next: (Discovery|Growth plan|Interview)/.test(r.text)));
    // Review opens the lead at that document's tab
    await page.locator('.nw-row[data-key="lead:qa.lead2@example.com:research"] button', { hasText: /^Review$/ }).click(); await page.waitForTimeout(2200);
    const at = await page.evaluate(() => ({ lead: typeof state !== 'undefined' && state.view === 'e1lead' ? state.e1Lead : '', tab: (document.querySelector('#apChrome .rd-tab.on,#apChrome .rd-tab[aria-selected="true"]') || {}).dataset }));
    check('Review: opens the lead on its document\'s tab', at.lead === 'qa.lead2@example.com' && at.tab && at.tab.tab === 's0', JSON.stringify(at));
    await go(page, 'approvals'); await page.waitForTimeout(800);
    // Mark reviewed
    await page.locator('.nw-row[data-key="lead:qa.lead1@example.com:proposal"] button', { hasText: 'Mark reviewed' }).click(); await page.waitForTimeout(1500);
    const fb = store.db.agent_feedback.filter((f) => f.target_type === 'e1_document' && f.action === 'reviewed');
    check('Mark reviewed: saved for the team (agent_feedback e1_document, reviewed)', fb.length === 1 && fb[0].target_id === 'qa.lead1@example.com:growth_plan' && fb[0].agent === 'growth_plan' && fb[0].feedback === 'Reviewed in Approvals', JSON.stringify(fb));
    R = await rows();
    check('Mark reviewed: the row leaves the list, with a message', !R.some((r) => r.key === 'lead:qa.lead1@example.com:proposal') && await page.locator('text=Marked reviewed').count() > 0, JSON.stringify(R.map((r) => r.key)));
    await page.locator('button', { hasText: /^Undo$/ }).last().click(); await page.waitForTimeout(1500);
    R = await rows();
    check('Undo: the document is waiting again (a reopened row is saved)', R.some((r) => r.key === 'lead:qa.lead1@example.com:proposal') && store.db.agent_feedback.some((f) => f.target_type === 'e1_document' && f.action === 'reopened'), JSON.stringify(R.map((r) => r.key)));
    // the asks count on the lead's page is not raised by a review mark
    await page.locator('.nw-row[data-key="lead:qa.lead1@example.com:proposal"] button', { hasText: 'Mark reviewed' }).click(); await page.waitForTimeout(1200);
    await page.evaluate(() => openE1Lead('qa.lead1@example.com')); await page.waitForTimeout(2200);
    const asks = await page.evaluate(() => [...document.querySelectorAll('.v125-n')].map((e) => e.textContent));
    check('A review mark does not count as a change asked on the lead\'s page', !asks.some((t) => /\d/.test(t) && !/^0/.test(t)), JSON.stringify(asks));
    // a fresh load still knows it was reviewed
    await page.goto(BASE + '/dashboard/approvals'); await H.settled(page, 'app'); await page.waitForTimeout(2500);
    R = await rows();
    check('After a reload the reviewed document stays off the list', !R.some((r) => r.key === 'lead:qa.lead1@example.com:proposal') && R.some((r) => r.key === 'lead:qa.lead2@example.com:research'), JSON.stringify(R.map((r) => r.key)));
    await ctx.close();
  }

  // 5. A lead's page: Run (or Run again) on every report, only that report, and the lead stays in its stage
  if (want('run')) {
    const calls = [];
    const hooks = (u, m, body) => { if (m === 'POST') calls.push({ u, body: JSON.parse(body || '{}') }); return { body: { ok: true } }; };
    const { ctx, page, store } = await open('/dashboard/lead-pipeline', { hooks });
    const tabBtns = async (em) => {
      await page.evaluate((e) => openE1Lead(e), em); await page.waitForTimeout(2600);
      const tabs = await page.evaluate(() => [...document.querySelectorAll('#apChrome .rd-tab')].map((t) => t.dataset.tab));
      const out = {};
      for (const t of tabs.filter((x) => /^(s\d|m_)/.test(x))) {
        await page.evaluate((k) => apTab(k), t); await page.waitForTimeout(250);
        out[t] = await page.evaluate(() => [...document.querySelectorAll('#main section.block')].filter((s) => s.offsetParent).flatMap((s) => [...s.querySelectorAll('.v143-run,.v136-none button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim())));
      }
      return out;
    };
    let B = await tabBtns(FX.L1);
    check('Run again on each finished report tab (prospect brief, guide, assessment, proposal)', ['s0', 's1', 's2', 's4'].every((k) => (B[k] || []).includes('Run again')), JSON.stringify(B));
    check('No Run on the follow-up guide (it has no stage)', !(B.s3 || []).length, JSON.stringify(B.s3));
    B = await tabBtns(FX.L3);
    check('A report not written yet offers Run <report> on its tab', /^Run /.test((B.s0 || [])[0] || '') && /^Run /.test((B.s2 || [])[0] || ''), JSON.stringify(B));
    // run the consultation guide again for Pat (in Proposal): only that report, no move
    await page.evaluate((e) => openE1Lead(e), FX.L1); await page.waitForTimeout(2600);
    await page.evaluate(() => apTab('s1')); await page.waitForTimeout(300);
    await page.locator('#main .v143-run', { hasText: 'Run again' }).filter({ visible: true }).first().click(); await page.waitForTimeout(800);
    const q = await page.evaluate(() => { const m = document.getElementById('v120M'); return m ? { h: m.querySelector('h2').textContent, move: !!document.getElementById('v136Move'), go: (document.getElementById('v120Go') || {}).textContent } : null; });
    check('Run again asks first: Run <report> for <lead>, no move, Run it again', q && /^Run .*consultation.* for Pat QA\?$/i.test(q.h) && !q.move && /Run it again/.test(q.go), JSON.stringify(q));
    const stageBefore = (store.db.e1_leads.find((l) => l.email === FX.L1) || {}).stage || '';
    await page.click('#v120Go'); await page.waitForTimeout(2500);
    const runs = calls.filter((c) => /e1-custom-run-erica|870a1ffa|catalyst-meeting-prep/.test(c.u));
    check('Run it: one stage run starts, only that report (only: true, stage consultation)', runs.length === 1 && /e1-custom-run-erica/.test(runs[0].u) && runs[0].body.only === true && runs[0].body.stage === 'consultation', JSON.stringify(runs.map((c) => [c.u.split('/').pop(), c.body.only, c.body.stage, c.body.entry])));
    const stageAfter = (store.db.e1_leads.find((l) => l.email === FX.L1) || {}).stage || '';
    check('Run it: the lead stays in its stage', stageAfter === stageBefore && !store.writes.some((w) => w.table === 'e1_leads' && w.body && w.body.stage), JSON.stringify([stageBefore, stageAfter]));
    await page.waitForTimeout(1500);
    const writing = await page.evaluate(() => { apTab('s1'); return [...document.querySelectorAll('#main .v143-none')].filter((e) => e.offsetParent).map((e) => e.textContent); });
    check('While it runs, the report tab says Catalyst is writing it (no second Run)', writing.some((t) => /writing/.test(t)), JSON.stringify(writing));
    await ctx.close();
  }

  if (want('run')) {
    const t = FX.tables();
    t.e1_leads.find((l) => l.email === FX.L1).stage = 'onboarding';
    t.agent_outputs.push({ id: 'mp-qa-1', run_id: FX.L1, agent: 'meeting_prep', title: 'Onboarding plan · QA', content_md: '## Kickoff\n\nSynthetic onboarding plan for QA.', data: { stage: 'onboarding', stage_name: 'Onboarding', doc_name: 'Onboarding plan' }, created_at: '2026-10-08T12:00:00.000Z' });
    const { ctx, page } = await open('/dashboard/lead-pipeline', { tables: t });
    await page.evaluate((e) => openE1Lead(e), FX.L1); await page.waitForTimeout(2600);
    await page.evaluate(() => apTab('m_onboarding')); await page.waitForTimeout(300);
    const b = await page.evaluate(() => [...document.querySelectorAll('#main section.block')].filter((s) => s.offsetParent).flatMap((s) => [...s.querySelectorAll('.v143-run')].map((x) => x.textContent)));
    check('Run again on the Onboarding plan tab too', b.includes('Run again'), JSON.stringify(b));
    await ctx.close();
  }

  // 6. The brief's sources: a post needs two words in common with the point (or its engagement quoted there)
  if (want('brief')) {
    const { ctx, page } = await open('/dashboard/briefs');
    const r = await page.evaluate(() => {
      const it = { text: 'HubSpot workflows are where AI automation saves advisors the most time', why: 'Posts on HubSpot automation drew the most saves', tag: 'automation' };
      const rows = [
        { url: 'a', head: 'a', text: 'Three HubSpot workflows that saved our advisors ten hours', themes: ['automation'], value: 'high', eng: 40 },
        { url: 'b', head: 'b', text: 'AI automation for advisors: where it actually saves time', themes: ['automation'], value: 'medium', eng: 12 },
        { url: 'c', head: 'c', text: 'We are proud to welcome a new member to our board', themes: ['automation'], value: 'high', eng: 96 },
      ];
      const got = v96Rank(it, rows, true).map((x) => x.r.url);
      const quoted = v96Rank(Object.assign({}, it, { why: 'One post drew 96 reactions' }), rows, true).map((x) => x.r.url);
      return { got, quoted };
    });
    check('Brief sources: an unrelated post with only the tag and high value is not a source', r.got.includes('a') && r.got.includes('b') && !r.got.includes('c'), JSON.stringify(r));
    check('Brief sources: a post whose engagement is quoted in the point still counts', r.quoted.includes('c'), JSON.stringify(r));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
