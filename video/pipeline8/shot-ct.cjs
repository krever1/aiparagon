// Content Transformation's What are you making? card, from whichever dashboard AP_ROOT holds. Usage: node shot-ct.cjs <file.png>
const V = require('../lib/vharness.cjs');
const { makeStore } = require(V.ROOT + '/tests/lib/rest-stub');
const D = require('../lib/pipeline-data.cjs');
(async () => {
  const server = V.H.makeServer(V.ROOT, null, '/dashboard/today'); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await V.H.chromium.launch();
  const { page } = await V.newPage(browser, BASE, { rest: makeStore(D.tables()), time: '2026-10-26T09:40:00-07:00', errors: [], hooks: () => ({ body: { ok: true } }), dsf: 2, w: 1200, h: 675 });
  await page.goto(BASE + '/dashboard/content-transformation', { waitUntil: 'load' }); await V.H.settled(page, 'app'); await page.waitForTimeout(2400);
  const r = await page.evaluate(() => { const g = document.querySelector('#nwCtForm .nw-tiles'); const s = g.closest('.nw-wstep'); s.scrollIntoView({ block: 'start' }); scrollBy(0, -70); const b = s.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width }; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: process.argv[2], clip: { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.min(r.w + 16, 1200 - r.x), height: 330 } });
  await browser.close(); server.close(); console.log('ok', JSON.stringify(r));
})().catch((e) => { console.error(e); process.exit(1); });
