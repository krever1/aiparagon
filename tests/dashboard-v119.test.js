// v119 tests for new-aiparagon-dashboard.html (#1): Your account's "Brand voice" opens Company profile, where the
// brand voice lives, instead of the old demo Brand voice page (it showed the demo firm's files and a note from its
// founder). The other links in that row still go where they did, and Back returns to Your account.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v119.test.js
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

  async function open(url) {
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: makeStore(FX.tables()), hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    await page.setViewportSize({ width: 1280, height: 860 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1500);
    return { ctx, page };
  }
  const shown = (page) => page.evaluate(() => [...document.querySelectorAll('#view-app .page')].filter((p) => p.getClientRects().length).map((p) => p.id).join(','));
  const link = (page, name) => page.locator('#main .ap-cp-links button').filter({ hasText: new RegExp('^\\s*' + name + '\\s*\u2192\\s*$') }).first();

  // 1. Brand voice opens Company profile with the voice at the top, not the old demo page
  {
    const { ctx, page } = await open('/dashboard/account');
    const names = await page.$$eval('#main .ap-cp-links button', (b) => b.map((x) => x.textContent.trim()));
    check('Your account lists the company-wide links', JSON.stringify(names) === JSON.stringify(['Brand voice \u2192', 'Templates \u2192', 'Knowledge base \u2192', 'Dashboard AI settings \u2192', 'Integrations \u2192']), JSON.stringify(names));
    await link(page, 'Brand voice').click();
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const v = document.getElementById('v104Voice'), b = v && v.getBoundingClientRect();
      return { path: location.pathname, voice: !!(v && v.getClientRects().length && b.top < innerHeight), text: (document.querySelector('#view-app .page.on') || {}).innerText || '' };
    });
    check('Brand voice opens Company profile', r.path === '/dashboard/company-profile' && (await shown(page)) === 'page-ap60', r.path + ' / ' + (await shown(page)));
    check('with the brand voice on screen', r.voice && /Your voice, summarized/.test(r.text), r.text.slice(0, 200));
    check('and none of the old demo page', !/deltaadvisory|Delta-Report-Shell|Delta-Deck-Shell|Delta-Letterhead|from Rita|from your team, Aug/.test(r.text), r.text.slice(0, 200));
    await page.goBack(); await page.waitForTimeout(1500);
    check('Back returns to Your account', await page.evaluate(() => location.pathname) === '/dashboard/account', await page.evaluate(() => location.pathname));
    await ctx.close();
  }

  // 2. the other links in the row go where they did
  for (const [name, want] of [['Templates', '/dashboard/templates'], ['Knowledge base', '/dashboard/knowledge-base'], ['Dashboard AI settings', '/dashboard/ai-settings'], ['Integrations', '/dashboard/integrations']]) {
    const { ctx, page } = await open('/dashboard/account');
    await link(page, name).click();
    await page.waitForTimeout(1500);
    const p = await page.evaluate(() => location.pathname);
    check(name + ' still opens ' + want, p === want, p);
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
