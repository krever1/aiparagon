const V = require('../lib/vharness.cjs');
const { makeStore } = require(V.ROOT + '/tests/lib/rest-stub');
const D = require('../lib/pipeline-data.cjs');
(async () => {
  const [url, sy, out] = process.argv.slice(2);
  const server = V.H.makeServer(V.ROOT, null, '/dashboard/today'); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await V.H.chromium.launch(); const errors = [];
  const { page } = await V.newPage(browser, BASE, { rest: makeStore(D.tables()), time: '2026-10-26T09:40:00-07:00', errors, dsf: 1, w: 1200, h: 675 });
  await page.context().addInitScript(() => { try { localStorage.setItem('ap.nw.collapsed', '1'); } catch (e) {} });
  await page.goto(BASE + url, { waitUntil: 'load' }); await V.H.settled(page, 'app'); await page.waitForTimeout(2500);
  await page.evaluate((y) => window.scrollTo(0, +y), sy); await page.waitForTimeout(400);
  await page.screenshot({ path: out });
  console.log('errors', errors.slice(0, 3));
  await browser.close(); server.close();
})();
