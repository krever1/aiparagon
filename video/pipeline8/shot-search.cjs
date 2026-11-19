// Before and after of the v141 fix: the Intel Tracker's and the Ad Strategist's search rows, with the v141 rule
// taken out (before) and in place (after). Usage: node shot-search.cjs <outdir>
const path = require('path');
const V = require('../lib/vharness.cjs');
const { makeStore } = require(V.ROOT + '/tests/lib/rest-stub');
const D = require('../lib/pipeline-data.cjs');
const OUT = process.argv[2];
(async () => {
  const server = V.H.makeServer(V.ROOT, null, '/dashboard/today'); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await V.H.chromium.launch();
  for (const [addr, name] of [['/dashboard/intel-tracker', 'intel'], ['/dashboard/ad-strategist', 'ads']]) {
    for (const mode of ['before', 'after']) {
      const { page } = await V.newPage(browser, BASE, { rest: makeStore(D.tables()), time: '2026-10-26T09:40:00-07:00', errors: [], hooks: () => ({ body: { ok: true } }), dsf: 2, w: 1200, h: 675 });
      await page.goto(BASE + addr, { waitUntil: 'load' }); await V.H.settled(page, 'app'); await page.waitForTimeout(2200);
      if (name === 'ads' && !(await page.locator('#view-app .nw-search-in input').count())) {
        const tab = page.locator('#view-app [role=tab]', { hasText: /^All ads/ }).first(); if (await tab.count()) { await tab.click(); await page.waitForTimeout(900); }
      }
      if (mode === 'before') await page.evaluate(() => { for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch (e) { continue; }
        for (let i = rs.length - 1; i >= 0; i--) if (rs[i].selectorText === '.ap60 .nw-search-in input') sh.deleteRule(i); } });
      await page.waitForTimeout(300);
      const box = await page.evaluate(() => { const f = [...document.querySelectorAll('#view-app .nw-search-in')].find((x) => x.offsetParent);
        f.scrollIntoView({ block: 'center' }); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      await page.waitForTimeout(300);
      const b2 = await page.evaluate(() => { const r = [...document.querySelectorAll('#view-app .nw-search-in')].find((x) => x.offsetParent).getBoundingClientRect(); return { x: r.x, y: r.y }; });
      await page.screenshot({ path: path.join(OUT, name + '-' + mode + '.png'), clip: { x: Math.max(0, b2.x - 24), y: Math.max(0, b2.y - 40), width: 720, height: 150 } });
      console.log(name, mode, JSON.stringify(box));
      await page.close();
    }
  }
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
