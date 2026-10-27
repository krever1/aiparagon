// v124 tests for new-aiparagon-dashboard.html (#1): AI settings' "Where these apply" says what the agents read now.
// The Catalyst agents (research, interview, anonymizer, discovery, growth plan) and post-call actions read the house
// rules on every run (n8n Catalyst · House Rules, published 27 October), and the Intel Tracker on every scheduled and
// custom run (it still said "Live once the new tracker is published in n8n" long after it was). A rule saved for
// Catalyst agents keeps that scope, which is what the Catalyst workflows read.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched. Fails on the build before v124.
// Usage: node tests/dashboard-v124.test.js
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

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(width, store) {
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store || makeStore(FX.tables()), hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    await page.setViewportSize({ width, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + '/dashboard/ai-settings', { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForSelector('.ap-ais .ap-where', { timeout: 15000 });
    await page.waitForTimeout(800);
    return { ctx, page };
  }
  // each line of the card: its name, what it says, its dot and the dot's colour as drawn
  const rows = (page) => page.$$eval('.ap-ais .ap-where > div', (els) => els.map((el) => {
    const d = el.querySelector('.d');
    return { name: (el.querySelector('b') || {}).textContent || '', says: (el.querySelector('small') || {}).textContent || '', dot: d ? d.className.replace(/\bd\b/, '').trim() : '', color: d ? getComputedStyle(d).backgroundColor : '' };
  }));

  // 1. the card at desktop and phone width
  for (const width of [1440, 390]) {
    const { ctx, page } = await open(width);
    const r = await rows(page);
    const at = ' at ' + width;
    const cat = r.find((x) => /^Catalyst agents/.test(x.name)) || {};
    const intel = r.find((x) => /Intel Tracker/.test(x.name)) || {};
    const later = r.find((x) => /Ad upload analyzer/.test(x.name)) || {};
    const green = (r.find((x) => /^Ad Strategist/.test(x.name)) || {}).color;
    check('Catalyst agents and post-call actions are listed' + at, cat.name === 'Catalyst agents (research, interview, anonymizer, discovery, growth plan, post-call actions)', cat.name);
    check('they read the rules on every run' + at, cat.says === 'Rules, on every run', cat.says);
    check('with the live dot, drawn like the other live agents' + at, cat.dot === 'live' && !!green && cat.color === green, cat.dot + ' ' + cat.color + ' vs ' + green);
    check('the Intel Tracker reads them on every scheduled and custom run' + at, intel.says === 'Rules, on every scheduled and custom run' && intel.dot === 'live' && intel.color === green, JSON.stringify(intel));
    check('no line waits on a publish in n8n any more' + at, !r.some((x) => x.dot === 'ready') && !/Live once|published in n8n|daily/.test(r.map((x) => x.says).join(' | ')), r.map((x) => x.name + ': ' + x.says).join(' | '));
    check('the upload analyzer and the funnel builder still say Not yet' + at, later.says === 'Not yet' && later.dot === 'no' && later.color !== green, JSON.stringify(later));
    // v126: drafts also read what the team asked to change, and the book-a-call and low-ticket line was added
    check('the other lines are as they were' + at, JSON.stringify(r.map((x) => [x.says, x.dot])) === JSON.stringify([['Rules, the chosen template, the knowledge base and what the team asked to change in earlier drafts', 'live'], ['Rules', 'live'],
      ['Rules, on every scheduled and custom run', 'live'], ['Rules, sent with each question', 'live'], ['Rules, on every run', 'live'],
      ['Not the rules yet. They follow the reasons given when ads were denied', 'no'], ['Not yet', 'no']]), JSON.stringify(r.map((x) => [x.says, x.dot])));
    if (width === 390) check('the card fits a phone', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), String(await page.evaluate(() => document.documentElement.scrollWidth)));
    await ctx.close();
  }

  // 2. a rule for Catalyst agents is saved with that scope, the one the Catalyst workflows read (all or engine1)
  {
    const store = makeStore(FX.tables());
    const { ctx, page } = await open(1440, store);
    await page.fill('#apRuleTa', 'Ask what they already tried before suggesting a fix.');
    await page.locator('.ap-rule-opts label', { hasText: /^Catalyst agents$/ }).click();
    const picked = await page.$$eval('.ap-rule-opts input', (els) => els.filter((i) => i.checked).map((i) => i.value));
    check('picking Catalyst agents leaves Everything unticked', JSON.stringify(picked) === '["engine1"]', JSON.stringify(picked));
    await page.click('#apRuleGo');
    await page.waitForTimeout(1500);
    const w = store.writes.filter((x) => x.method === 'POST' && x.table === 'ai_rules');
    const sent = w.length ? w[w.length - 1].body : null;
    check('the rule is saved for Catalyst agents only', !!sent && JSON.stringify(sent.applies_to) === '["engine1"]' && sent.active === true && /already tried/.test(sent.rule), JSON.stringify(sent));
    const shownRule = await page.$$eval('.ap-rule', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')).find((t) => /already tried/.test(t)) || '');
    check('it shows in House rules as a Catalyst agents rule', /Catalyst agents/.test(shownRule), shownRule.slice(0, 160));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
