// The three Scaling Review ad images (made up), rendered with Playwright: 1080 x 1080 PNGs.
const path = require('path');
const { chromium } = require('playwright');
const V = require('../lib/vharness.cjs');
const ADS = [
  { f: 'summit-a.png', bg: '#f4eee2', ink: '#1f4d3a', sub: '#6b5a3a', t: 'You do not have a hiring problem.', k: 'You have a handoff problem.' },
  { f: 'summit-b.png', bg: '#1f4d3a', ink: '#f4eee2', sub: '#d8c79a', t: 'Write down five decisions before your next hire.', k: 'Who can say yes, so you do not have to.' },
  { f: 'summit-c.png', bg: '#efe6d3', ink: '#24433a', sub: '#8a6a2f', t: 'The 40-person plateau has a fix.', k: 'It starts with five decisions.' },
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1080 } });
  const css = V.cached('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=Instrument+Sans:wght@500;600&display=swap').toString()
    .replace(/url\((https:[^)]+)\)/g, (m, u) => 'url(data:font/woff2;base64,' + V.cached(u).toString('base64') + ')');
  for (const a of ADS) {
    await p.setContent('<html><head><style>' + css + 'body{margin:0;width:1080px;height:1080px;background:' + a.bg + ';font-family:Newsreader,serif;position:relative;overflow:hidden}' +
      '.m{position:absolute;left:90px;top:84px;font:600 26px "Instrument Sans";letter-spacing:4px;color:' + a.sub + '}' +
      '.t{position:absolute;left:90px;right:90px;top:230px;font-weight:500;font-size:104px;line-height:1.04;color:' + a.ink + ';letter-spacing:-1px}' +
      '.k{position:absolute;left:90px;bottom:120px;font:500 34px "Instrument Sans";color:' + a.sub + '}' +
      '.r{position:absolute;right:-120px;bottom:-120px;width:420px;height:420px;border-radius:50%;border:3px solid ' + a.sub + ';opacity:.35}</style></head>' +
      '<body><div class="m">SUMMIT BUSINESS ADVISORS</div><div class="t">' + a.t + '</div><div class="k">' + a.k + '</div><div class="r"></div></body></html>');
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(__dirname, a.f) });
  }
  await b.close();
})();
