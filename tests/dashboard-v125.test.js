// v125 tests for new-aiparagon-dashboard.html (#1): "What should change?" on every Catalyst document. Each finished
// document on a lead's page (research, call guide, assessment, discovery framework, growth plan) takes a reason; it is
// saved to agent_feedback with the document's agent, shows on AI settings under From your feedback as "asked for
// changes", and Make it a rule turns it into a house rule for the Catalyst agents only. The card counts the changes
// asked on it. Desktop and phone width.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched. Fails on the build before v125.
// Usage: node tests/dashboard-v125.test.js
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
const REASON = 'Ask about their compliance review date before any pricing questions.';

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(width, store, url) {
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    await page.setViewportSize({ width, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + (url || '/dashboard/lead-pipeline'), { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1200);
    return { ctx, page };
  }
  async function lead(page, email) {
    await page.evaluate((e) => openE1Lead(e), email);
    await page.waitForFunction(() => document.querySelectorAll('#main section.block').length >= 5, null, { timeout: 15000 });
    await page.waitForTimeout(1200);
  }
  // each document card: its step number, whether it has the button, and its count line
  const cards = (page) => page.$$eval('#main section.block', (secs) => secs.map((s) => {
    const h = (s.querySelector('h2') || {}).textContent || '', c = s.querySelector('.ap-docc');
    const b = c && c.querySelector('.statline .v125-btn'), n = c && c.querySelector('.statline .v125-n');
    return { step: (h.match(/^\s*(\d)\./) || [])[1] || '', card: !!c, btn: !!(b && b.getClientRects().length), label: b ? b.textContent : '', n: n ? n.textContent : '' };
  }).filter((x) => x.step));
  const posts = (store) => store.writes.filter((w) => w.method === 'POST' && w.table === 'agent_feedback');
  // the lead page shows one document at a time, under its tab (Research, Interview, Assessment, Discovery, Growth Plan)
  async function tab(page, i) {
    await page.locator('button.rd-tab[onclick="apTab(\'s' + i + '\')"]').click();
    await page.waitForTimeout(300);
  }
  const btn = (page, i) => page.locator('#main section.block').nth(i).locator('.v125-btn');
  // every document's tab, opened in turn: is its button on screen?
  async function shown(page) {
    const out = [];
    for (let i = 0; i < 5; i++) {
      if (!(await page.locator('button.rd-tab[onclick="apTab(\'s' + i + '\')"]').count())) { out.push(null); continue; }
      await tab(page, i);
      out.push(await btn(page, i).isVisible().catch(() => false));
    }
    return out;
  }

  // 1. a lead with every document: the button on each, the reason saved with its document's agent
  {
    const store = makeStore(FX.tables());
    const { ctx, page } = await open(1440, store);
    await lead(page, FX.L1);
    let c = await cards(page);
    check('every finished Catalyst document has What should change?', c.length === 5 && c.every((x) => x.card && x.label === 'What should change?'), JSON.stringify(c));
    const vis = await shown(page);
    check('and it is on screen on each document\'s tab', JSON.stringify(vis) === '[true,true,true,true,true]', JSON.stringify(vis));
    check('no changes asked yet', c.every((x) => !x.n), JSON.stringify(c.map((x) => x.n)));
    // the discovery framework (step 4)
    await tab(page, 3);
    await btn(page, 3).click();
    await page.waitForSelector('#v125M', { state: 'visible', timeout: 5000 });
    const head = await page.$eval('#v125M', (m) => ({ k: (m.querySelector('.nw-kicker') || {}).textContent, h: (m.querySelector('h2') || {}).textContent, focus: document.activeElement && document.activeElement.id }));
    check('it asks what should change in the discovery framework, for this lead', head.k === 'Catalyst · Pat QA' && head.h === 'What should change in the discovery framework?', JSON.stringify(head));
    check('the reason box has the focus', head.focus === 'v125Ta', head.focus);
    await page.click('#v125Go');
    await page.waitForTimeout(300);
    check('an empty reason is not saved, and it says why', posts(store).length === 0 && /Write a sentence or two/.test(await page.textContent('#v125Msg')), await page.textContent('#v125Msg'));
    await page.fill('#v125Ta', 'too short');
    await page.click('#v125Go');
    await page.waitForTimeout(300);
    check('nor a few words', posts(store).length === 0, String(posts(store).length));
    await page.fill('#v125Ta', REASON);
    await page.click('#v125Go');
    await page.waitForTimeout(1500);
    const p = posts(store);
    const w = p.length ? p[p.length - 1].body : {};
    check('the reason is saved once, with the document\'s agent and the lead', p.length === 1 && w.agent === 'discovery_call' && w.target_type === 'e1_document' &&
      w.target_id === FX.L1 + ':discovery_call' && w.action === 'changes' && w.feedback === REASON && w.author === H.USER.email, JSON.stringify(p.map((x) => x.body)));
    check('the dialog closes', !(await page.$('#v125M')), 'still open');
    c = await cards(page);
    check('the discovery framework now counts 1 change asked, the others none', c[3].n === '1 change asked' && c.filter((x) => x.n).length === 1, JSON.stringify(c.map((x) => x.n)));
    // Cancel saves nothing
    await tab(page, 1);
    await btn(page, 1).click();
    await page.waitForSelector('#v125M', { state: 'visible', timeout: 5000 });
    check('the call guide asks about the call guide', (await page.textContent('#v125M h2')) === 'What should change in the call guide?', await page.textContent('#v125M h2'));
    await page.fill('#v125Ta', 'Not saved because this one is cancelled.');
    await page.click('#v125M .nw-btn-ghost');
    await page.waitForTimeout(400);
    check('Cancel closes it and saves nothing', !(await page.$('#v125M')) && posts(store).length === 1, String(posts(store).length));
    // the count opens AI settings, where the reason waits under From your feedback
    await tab(page, 3);
    await page.locator('#main section.block').nth(3).locator('.v125-n').click();
    await page.waitForSelector('#apFbList', { timeout: 10000 });
    await page.waitForTimeout(800);
    check('the count opens AI settings', await page.evaluate(() => location.pathname) === '/dashboard/ai-settings', await page.evaluate(() => location.pathname));
    const fb = await page.$$eval('#apFbList .ap-fb', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
    const mine = fb.find((t) => t.indexOf(REASON) >= 0) || '';
    check('the reason is listed as asked for changes on the Discovery Call Framework', /Discovery Call Framework · asked for changes · qa/.test(mine), mine || JSON.stringify(fb));
    await page.locator('#apFbList .ap-fb', { hasText: REASON }).locator('button', { hasText: 'Make it a rule' }).click();
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => ({ v: document.getElementById('apRuleTa').value, on: [...document.querySelectorAll('.ap-rule-opts input')].filter((i) => i.checked).map((i) => i.value) }));
    check('Make it a rule fills the rule box and ticks Catalyst agents only', box.v === REASON && JSON.stringify(box.on) === '["engine1"]', JSON.stringify(box));
    await page.click('#apRuleGo');
    await page.waitForTimeout(1500);
    // (the page writes the Company profile's own rules too; this is the one made from the reason)
    const rw = store.writes.filter((x) => x.method === 'POST' && x.table === 'ai_rules' && x.body && !Array.isArray(x.body) && x.body.rule === REASON);
    check('the rule is saved for the Catalyst agents, from feedback', rw.length === 1 && JSON.stringify(rw[0].body.applies_to) === '["engine1"]' && rw[0].body.source === 'feedback', JSON.stringify(rw.map((x) => x.body)));
    await ctx.close();

    // the count is read back from the table on the next visit
    const again = await open(1440, store);
    await lead(again.page, FX.L1);
    c = await cards(again.page);
    check('after a reload the discovery framework still counts 1 change asked', c[3].n === '1 change asked' && c.filter((x) => x.n).length === 1, JSON.stringify(c.map((x) => x.n)));
    await again.ctx.close();
  }

  // 2. leads with fewer documents: a button only where a document is
  {
    const store = makeStore(FX.tables());
    const { ctx, page } = await open(1440, store);
    await lead(page, FX.L2);
    let c = await cards(page);
    check('a lead with only its research has one button, on the research', c.filter((x) => x.label).length === 1 && c[0].btn, JSON.stringify(c));
    await lead(page, FX.L3);
    c = await cards(page);
    check('a lead with no documents has none', c.every((x) => !x.label), JSON.stringify(c));
    await ctx.close();
  }

  // 3. a phone
  {
    const store = makeStore(FX.tables());
    const { ctx, page } = await open(390, store);
    await lead(page, FX.L1);
    const vis = await shown(page);
    check('on a phone every document still has the button', JSON.stringify(vis) === '[true,true,true,true,true]', JSON.stringify(vis));
    await tab(page, 0);
    await btn(page, 0).scrollIntoViewIfNeeded();
    await btn(page, 0).click();
    await page.waitForSelector('#v125M', { state: 'visible', timeout: 5000 });
    const fit = await page.evaluate(() => { const r = document.getElementById('v125M').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, sw: document.documentElement.scrollWidth }; });
    check('the dialog fits the phone', fit.l >= 0 && fit.r <= fit.w + 1 && fit.sw <= fit.w + 1, JSON.stringify(fit));
    check('and asks about the lead research', (await page.textContent('#v125M h2')) === 'What should change in the lead research?', await page.textContent('#v125M h2'));
    await page.fill('#v125Ta', REASON);
    await page.click('#v125Go');
    await page.waitForTimeout(1500);
    const p = posts(store);
    check('and saves it with the research agent', p.length === 1 && p[0].body.agent === 'lead_research' && p[0].body.target_id === FX.L1 + ':lead_research', JSON.stringify(p.map((x) => x.body)));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
