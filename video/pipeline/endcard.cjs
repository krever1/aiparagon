// The Pipeline end card as frames, 1920 x 1080: navy, gold call to action, and the security row under it.
// Rebuilt Nov 17 (the earlier source was lost with the scratchpad). Usage: node endcard.cjs <secs> <fps> <outdir>
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const V = require('../lib/vharness.cjs');
const [secs, fpsArg, out] = process.argv.slice(2);
const FPS = +fpsArg || 24, N = Math.round((+secs || 7) * FPS), OUT = path.join(__dirname, out || 'endcard');
const fontCss = (u) => V.cached(u).toString().replace(/url\((https:[^)]+)\)/g, (m, x) => 'url(data:font/woff2;base64,' + V.cached(x).toString('base64') + ')');
const SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M8.8 12.2l2.2 2.2 4.4-4.6"/></svg>';
const HTML = (css) => '<html><head><style>' + css +
  'body{margin:0;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(120% 120% at 15% 10%,#16294a 0%,#0c1a33 55%,#08132a 100%);font-family:"Plus Jakarta Sans",sans-serif;color:#E6EBF3}' +
  '.logo{position:absolute;left:120px;top:96px}.logo b{display:block;font:800 34px "Plus Jakarta Sans";letter-spacing:2px;color:#fff}.logo i{display:block;font:600 15px "Plus Jakarta Sans";letter-spacing:5px;color:#C9A227;font-style:normal;margin-top:2px}' +
  '.main{position:absolute;left:120px;top:262px;width:1560px}' +
  '.k{font-size:22px;font-weight:700;letter-spacing:6px;color:#C9A227;text-transform:uppercase}' +
  'h1{font-family:"Playfair Display",serif;font-weight:600;font-size:96px;line-height:1.05;margin:26px 0 0;color:#fff;letter-spacing:-1px}' +
  'p{font-size:32px;margin:26px 0 0;color:#C7D0DE}' +
  '.cta{display:inline-flex;align-items:center;gap:16px;margin-top:52px;background:#C9A227;color:#0c1a33;font-weight:700;font-size:32px;padding:24px 40px;border-radius:14px;box-shadow:0 12px 40px rgba(201,162,39,.25)}' +
  '.sec{margin-top:54px;display:flex;align-items:center;flex-wrap:wrap;gap:16px 34px;padding-top:30px;border-top:1px solid rgba(201,162,39,.35);width:1340px}' +
  '.sec .sk{font-size:20px;font-weight:700;letter-spacing:4px;color:#C9A227;text-transform:uppercase;margin-right:6px}' +
  '.sec .si{display:inline-flex;align-items:center;gap:12px;font-size:27px;font-weight:600;color:#E6EBF3}.sec svg{width:28px;height:28px;flex:none}' +
  '.foot{position:absolute;left:120px;bottom:80px;font-size:20px;color:#7D8AA3}' +
  '.in{opacity:0;transform:translateY(18px)}</style></head><body>' +
  '<div class="logo in" id="e0"><b>AI PARAGON</b><i>CONSULTING GROUP</i></div>' +
  '<div class="main"><div class="k in" id="e1">Pipeline</div><h1 class="in" id="e2">Content to conversations.</h1><p class="in" id="e3">Built around the systems you already use.</p>' +
  '<div class="cta in" id="e4">Book a 20-minute strategy session <span>&rarr;</span></div>' +
  '<div class="sec in" id="e6"><span class="sk">Security</span><span class="si">' + SHIELD + 'Hosted on AWS Fargate</span><span class="si">' + SHIELD + 'SOC 2 compliant</span><span class="si">' + SHIELD + 'Audit controls on every action</span></div></div>' +
  '<div class="foot in" id="e5">aiparagonconsulting.com · Shown with sample data</div></body></html>';
// [start second, rise in px] for e0..e6
const P = [[0.15, 0], [0.30, 12], [0.40, 18], [0.55, 14], [0.75, 14], [0.95, 0], [1.6, 12]];
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const css = fontCss('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.setContent(HTML(css)); await p.evaluate(() => document.fonts.ready);
  for (let i = 0; i < N; i++) {
    const t = i / FPS;
    await p.evaluate(([t, P]) => P.forEach(([s, dy], k) => {
      const e = document.getElementById('e' + k); const a = Math.min(1, Math.max(0, (t - s) / 0.55)); const ease = 1 - Math.pow(1 - a, 3);
      e.style.opacity = ease; e.style.transform = 'translateY(' + (dy * (1 - ease)).toFixed(2) + 'px)'; }), [t, P]);
    await p.screenshot({ path: path.join(OUT, 'f' + String(i).padStart(4, '0') + '.png') });
  }
  console.log('frames', N, OUT);
  await b.close();
})();
