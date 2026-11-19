// v142 tests for new-aiparagon-dashboard.html (#1): Paid ad is off Content Transformation. The page makes organic
// content (posts, newsletters, emails, long reads, decks, video); ads are made on Marketing Generation. A form saved
// on Paid ad opens on LinkedIn post, and anything that asks Content Transformation for an ad (a Paid ad template, a
// link that names the kind) opens Marketing Generation's Ad campaign. Older ad drafts keep their name.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js).
// Usage: node tests/dashboard-v142.test.js
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

  async function open(addr, width) {
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: makeStore(FX.tables()), hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    await page.setViewportSize({ width: width || 1440, height: 900 });
    await page.goto(BASE + addr, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1500);
    return { ctx, page };
  }
  const tiles = (page) => page.evaluate(() => [...document.querySelectorAll('#nwCtForm .nw-tile[data-k]')].filter((b) => b.offsetParent)
    .map((b) => ({ k: b.dataset.k, t: b.querySelector('b').textContent, on: b.getAttribute('aria-pressed') === 'true' })));
  const mgOpen = (page) => page.evaluate(() => ({ path: location.pathname, mg: !!document.querySelector('#nwMgForm'),
    ad: !!document.querySelector('#nwMgForm .nw-tile[data-k="ad"][aria-pressed="true"]') }));

  for (const width of [1440, 390]) {
    const { ctx, page } = await open('/dashboard/content-transformation', width);
    const t = await tiles(page);
    check(width + 'px: Content Transformation offers no Paid ad', t.length > 0 && !t.some((x) => x.k === 'adcopy' || /Paid ad/.test(x.t)), JSON.stringify(t.map((x) => x.t)));
    check(width + 'px: Posts and emails is LinkedIn post, Newsletter and Email', t.slice(0, 3).map((x) => x.t).join('|') === 'LinkedIn post|Newsletter|Email', JSON.stringify(t.slice(0, 4).map((x) => x.t)));
    check(width + 'px: the long reads and the rest are still there', ['report', 'white_paper', 'news_article', 'how_to'].every((k) => t.some((x) => x.k === k)), JSON.stringify(t.map((x) => x.k)));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    check(width + 'px: the page does not scroll sideways', wide);
    await ctx.close();
  }

  // a form saved on Paid ad (in this browser, before v142) opens on LinkedIn post
  {
    const { ctx, page } = await open('/dashboard/content-transformation');
    await page.evaluate(() => { apCfState().format = 'ad'; apGo('e3today'); });
    await page.waitForTimeout(800);
    await page.evaluate(() => apGo('e3create'));
    await page.waitForTimeout(1500);
    const t = await tiles(page);
    check('a form saved on Paid ad opens on LinkedIn post', (t.find((x) => x.on) || {}).k === 'thought_leadership', JSON.stringify(t.filter((x) => x.on)));
    check('and its saved format is LinkedIn post again', await page.evaluate(() => apCfState().format) === 'thought_leadership');
    await ctx.close();
  }

  // asking Content Transformation for an ad opens Marketing Generation's Ad campaign
  for (const [label, call] of [['a Paid ad template (apCfFmt ad)', () => apCfFmt('ad')], ['a link that names the ad kind (nwCtApply kind ad)', () => nwCtApply({ kind: 'ad', src: 'upload' })]]) {
    const { ctx, page } = await open('/dashboard/content-transformation');
    await page.evaluate(call);
    await page.waitForTimeout(1800);
    const m = await mgOpen(page);
    check(label + ' opens Marketing Generation on Ad campaign', m.mg && m.ad && /marketing-generation/.test(m.path), JSON.stringify(m));
    await ctx.close();
  }

  // a post is still made as before
  {
    const { ctx, page } = await open('/dashboard/content-transformation');
    await page.click('#nwCtForm .nw-tile[data-k="newsletter"]'); await page.waitForTimeout(400);
    const t = await tiles(page);
    check('picking Newsletter still works', (t.find((x) => x.on) || {}).k === 'newsletter', JSON.stringify(t.filter((x) => x.on)));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
