// v7 title cards as transparent 1920 x 1080 layers: the intro (title, then the two jobs one at a time) and a card for
// each section. The composer dims the frame behind them. Usage: node cards.cjs -> cards/*.png
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const V = require('../lib/vharness.cjs');
const OUT = path.join(__dirname, 'cards');
const fontCss = (u) => V.cached(u).toString().replace(/url\((https:[^)]+)\)/g, (m, x) => 'url(data:font/woff2;base64,' + V.cached(x).toString('base64') + ')');
const CSS = 'body{margin:0;width:1920px;height:1080px;overflow:hidden;background:transparent;font-family:"Plus Jakarta Sans",sans-serif;color:#E6EBF3}' +
  '.k{font-size:22px;font-weight:700;letter-spacing:6px;color:#C9A227;text-transform:uppercase}' +
  'h1{font-family:"Playfair Display",serif;font-weight:600;font-size:92px;line-height:1.05;margin:20px 0 0;color:#fff;letter-spacing:-1px}' +
  '.col{position:absolute;top:500px;width:700px;padding:44px 48px;border-radius:22px;background:rgba(255,255,255,.06);border:1px solid rgba(201,162,39,.35);box-sizing:border-box}' +
  '.n{display:inline-flex;width:56px;height:56px;border-radius:50%;background:#C9A227;color:#0c1a33;font:800 28px "Plus Jakarta Sans";align-items:center;justify-content:center}' +
  '.col h2{font-family:"Playfair Display",serif;font-weight:600;font-size:60px;margin:24px 0 0;color:#fff}' +
  '.col p{font-size:28px;line-height:1.4;margin:16px 0 0;color:#C7D0DE}' +
  '.col .w{margin-top:26px;font-size:21px;font-weight:700;letter-spacing:3px;color:#C9A227;text-transform:uppercase}' +
  '.sec{position:absolute;left:0;right:0;top:330px;text-align:center}.sec .n{width:84px;height:84px;font-size:42px}' +
  '.sec h1{font-size:120px;margin-top:30px}.sec p{font-size:34px;color:#C7D0DE;margin:22px 0 0}';
const LAYERS = {
  intro_a: '<div style="position:absolute;left:180px;top:130px"><div class="k">AI Paragon · Pipeline</div><h1>Two intelligent lead<br>generation systems</h1></div>',
  intro_b: '<div class="col" style="left:180px"><span class="n">1</span><h2>Organic content</h2><p>Thought leadership posts, newsletters, emails and reports that build your authority.</p><div class="w">Content Transformation</div></div>',
  intro_c: '<div class="col" style="left:1040px"><span class="n">2</span><h2>Ads</h2><p>Ad campaigns that book calls: a call, a webinar, a download or a landing page.</p><div class="w">Marketing Generation</div></div>',
  sec_org: '<div class="sec"><span class="n">1</span><h1>Organic content</h1><p>Content Transformation · written from the organic brief</p></div>',
  sec_ads: '<div class="sec"><span class="n">2</span><h1>Ads</h1><p>Marketing Generation · written from the ads brief</p></div>',
};
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const css = fontCss('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [k, html] of Object.entries(LAYERS)) {
    await p.setContent('<html><head><style>' + css + CSS + '</style></head><body>' + html + '</body></html>');
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT, k + '.png'), omitBackground: true });
  }
  await b.close(); console.log('cards', Object.keys(LAYERS).length);
})().catch((e) => { console.error(e); process.exit(1); });
