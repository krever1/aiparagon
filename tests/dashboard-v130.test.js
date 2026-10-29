// v130 tests for new-aiparagon-dashboard.html (#1): one house rule per click on AI settings. Until v130 a double click
// on Add rule saved the rule twice (two ai_rules rows, so every agent read it twice), and a double click on Save
// changes sent the change twice. Now the button is off while the rule saves; a failed save says so and the button
// comes back for another try. The product header (v129) holds through it all.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v130.test.js
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

  // the store can be told to refuse the next rule saves (a 500 from Supabase)
  async function open(width) {
    const store = makeStore(FX.tables());
    const gate = { refuse: 0 };
    const rest = { db: store.db, writes: store.writes, handle: (m, p, body, h) => {
      if (gate.refuse > 0 && (m === 'POST' || m === 'PATCH') && /\/ai_rules/.test(p)) { gate.refuse--; return { status: 500, body: { message: 'database unavailable' } }; }
      return store.handle(m, p, body, h); } };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest, hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    await page.setViewportSize({ width: width || 1280, height: 860 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + '/dashboard/ai-settings', { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(2500);
    return { ctx, page, store, gate };
  }
  const saves = (store, re, method) => store.writes.filter((w) => w.table === 'ai_rules' && w.method === (method || 'POST') && !w.refused && re.test(JSON.stringify(w.body || ''))).length;
  const shown = (page, re) => page.evaluate(([src, fl]) => [...document.querySelectorAll('.ap-rule')].filter((r) => new RegExp(src, fl).test(r.innerText)).length, [re.source, re.flags]);
  const head = (page) => page.evaluate(() => {
    const pg = document.querySelector('.page.on'), h = pg && pg.querySelector('h1'), e = h && h.parentNode.querySelector('.rd-eyebrow,.eyebrow');
    return (e ? e.textContent.trim() : '-') + ' | ' + (h ? h.textContent.trim() : '-');
  });

  // 1. a double click on Add rule saves the rule once
  {
    const { ctx, page, store } = await open();
    await page.fill('#apRuleTa', 'Open with what the delays cost them, then the plan.');
    await page.dblclick('#apRuleGo');
    await page.waitForTimeout(2500);
    check('double click on Add rule: one rule saved', saves(store, /delays cost them/) === 1, String(saves(store, /delays cost them/)));
    check('and House rules lists it once', (await shown(page, /delays cost them/)) === 1, String(await shown(page, /delays cost them/)));
    check('the header stays Settings | AI settings', (await head(page)) === 'Settings | AI settings', await head(page));
    check('the box is ready for the next rule', (await page.inputValue('#apRuleTa')) === '' && !(await page.isDisabled('#apRuleGo')));
    // three quick clicks
    await page.fill('#apRuleTa', 'Keep the first paragraph to two sentences.');
    await page.click('#apRuleGo', { clickCount: 3 });
    await page.waitForTimeout(2500);
    check('three quick clicks: still one rule saved', saves(store, /two sentences/) === 1, String(saves(store, /two sentences/)));

    // 2. a double click on Save changes sends the change once
    await page.locator('.ap-rule', { hasText: 'delays cost them' }).first().locator('button', { hasText: /^Edit$/ }).click();
    await page.waitForTimeout(1500);
    await page.fill('#apRuleTa', 'Open with what the delays cost them, then the plan and the price.');
    await page.dblclick('#apRuleGo');
    await page.waitForTimeout(2500);
    check('double click on Save changes: one change sent', saves(store, /plan and the price/, 'PATCH') === 1, String(saves(store, /plan and the price/, 'PATCH')));
    check('the changed rule shows once', (await shown(page, /plan and the price/)) === 1 && (await shown(page, /delays cost them, then the plan\.$/m)) === 0);
    check('and no new rule was added for it', saves(store, /plan and the price/) === 0, String(saves(store, /plan and the price/)));
    await ctx.close();
  }

  // 3. a failed save says so and gives the button back; the next try saves once
  {
    const { ctx, page, store, gate } = await open();
    gate.refuse = 1;
    await page.fill('#apRuleTa', 'Never quote fees in a first email.');
    await page.click('#apRuleGo');
    await page.waitForTimeout(2000);
    const toast = await page.evaluate(() => [...document.querySelectorAll('.toast,#toast,.ap-toast,.nw-toast')].map((t) => t.innerText).join(' | '));
    check('a refused save: the page says it could not save the rule', /Could not save the rule/.test(toast), toast.slice(0, 160));
    check('the rule is kept in the box', (await page.inputValue('#apRuleTa')) === 'Never quote fees in a first email.');
    check('the button is back for another try', !(await page.isDisabled('#apRuleGo')));
    check('nothing was saved', saves(store, /quote fees/) === 0, String(saves(store, /quote fees/)));
    await page.click('#apRuleGo');
    await page.waitForTimeout(2500);
    check('the next try saves it once', saves(store, /quote fees/) === 1 && (await shown(page, /quote fees/)) === 1, String(saves(store, /quote fees/)));
    check('a rule too short is still refused before saving', await (async () => {
      await page.fill('#apRuleTa', 'ok'); await page.click('#apRuleGo'); await page.waitForTimeout(800);
      return saves(store, /"rule":"ok"/) === 0 && !(await page.isDisabled('#apRuleGo'));
    })());
    await ctx.close();
  }

  // 4. at phone width
  {
    const { ctx, page, store } = await open(390);
    await page.fill('#apRuleTa', 'Use the client company name, never a nickname.');
    await page.dblclick('#apRuleGo');
    await page.waitForTimeout(2500);
    check('phone: a double click saves the rule once', saves(store, /never a nickname/) === 1, String(saves(store, /never a nickname/)));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
