// Test for site-builder.html (#5): the AI Paragon logo (www.aiparagonconsulting.com/logo.png) is the tab and
// home-screen icon, and it stands in for the P mark in the top bar once it has loaded. If it can't load, the P
// stays as it was. Checks the built file in a browser and the source it is built from (builder-src/src/index.html).
// The logo is served by the test (a 1x1 PNG) or refused; nothing else outside the test server is reached.
// Usage: node tests/builder-logo.test.js
const fs = require('fs');
const path = require('path');
const I = require('./lib/icon-check');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

(async () => {
  const server = I.serve();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await I.chromium.launch();
  const errors = [];

  async function open(url, logo, viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 } });
    await I.route(ctx, BASE, logo);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(url + ' :: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|fonts\.g/.test(m.text())) errors.push(url + ' :: console: ' + m.text().slice(0, 300)); });
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForSelector('.ap-logo-mark', { timeout: 10000 });
    await page.waitForTimeout(400);
    return { ctx, page };
  }
  const mark = (page) => page.evaluate(() => {
    const e = document.querySelector('.ap-logo-mark');
    if (!e) return null;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    return { text: e.textContent.trim(), bg: cs.backgroundImage, color: cs.color, fs: cs.fontSize, shadow: cs.boxShadow,
      w: Math.round(r.width), h: Math.round(r.height), ok: document.documentElement.classList.contains('ap-logo-ok') };
  });
  const want = ['icon ' + I.LOGO, 'apple-touch-icon ' + I.LOGO];

  // 1. the logo loads: the tab icon, and the logo in place of the P
  {
    const { ctx, page } = await open('/builder', true);
    const links = await I.iconLinks(page);
    check('the tab and home-screen icons are the logo, and only those', links.length === 2 && links.includes(want[0]) && links.includes(want[1]), JSON.stringify(links));
    const m = await mark(page);
    check('top bar: the logo stands in for the P', !!m && m.ok && m.bg.includes('aiparagonconsulting.com/logo.png') && m.color === 'rgba(0, 0, 0, 0)' && m.fs === '0px' && m.text === 'P', JSON.stringify(m));
    check('top bar: the mark keeps its size (32 px) and drops the gold edge', !!m && m.w === 32 && m.h === 32 && m.shadow === 'none', JSON.stringify(m));
    check('top bar: AI Paragon and Site Builder still sit next to it', await page.evaluate(() => (document.querySelector('.ap-logo-name') || {}).textContent === 'AI Paragon' && (document.querySelector('.ap-logo-sub') || {}).textContent === 'Site Builder'));
    await ctx.close();
  }

  // 2. a phone: the name gives way, the logo stays
  {
    const { ctx, page } = await open('/builder', true, { width: 390, height: 844 });
    const m = await mark(page);
    check('phone: the logo stands in for the P', !!m && m.ok && m.bg.includes('logo.png') && m.w === 32, JSON.stringify(m));
    await ctx.close();
  }

  // 3. the logo can't load: the P stays as it was
  {
    const { ctx, page } = await open('/builder', false);
    const m = await mark(page);
    check('logo refused: the P stays (white on the tile, with its gold edge)', !!m && !m.ok && !m.bg.includes('logo.png') && m.color === 'rgb(255, 255, 255)' && m.fs === '19px' && /inset/.test(m.shadow) && m.text === 'P', JSON.stringify(m));
    check('logo refused: the tab icon link is there all the same', (await I.iconLinks(page)).includes(want[0]));
    await ctx.close();
  }

  // 4. the source the file is built from has the links, so a rebuild keeps them
  {
    const src = fs.readFileSync(path.join(I.ROOT, 'builder-src', 'src', 'index.html'), 'utf8');
    check('builder-src/src/index.html links the logo as the tab and home-screen icon',
      src.includes('<link rel="icon" href="' + I.LOGO + '">') && src.includes('<link rel="apple-touch-icon" href="' + I.LOGO + '">'));
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
