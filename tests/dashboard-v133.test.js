// v133 tests for new-aiparagon-dashboard.html (#1): the AI Paragon logo (www.aiparagonconsulting.com/logo.png) is
// the tab and home-screen icon, and it stands in for the P mark on the sign-in page and in the sidebar once it
// has loaded. If it can't load, the P stays as it was. The landing pages (go.html) link the same icon, and
// vercel.json forwards /favicon.ico and the apple-touch-icon addresses to it for the pages that link none.
// The logo is served by the test (a 1x1 PNG) or refused, and Supabase answers from stubs, so nothing real is touched.
// Usage: node tests/dashboard-v133.test.js
const fs = require('fs');
const path = require('path');
const H = require('./lib/dashboard-harness');
const I = require('./lib/icon-check');

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

  async function open(url, logo, opts) {
    const o = opts || {};
    const { ctx, page } = await H.newPage(browser, BASE, { seed: !!o.seed, bucket: errors });
    const asked = [];
    await ctx.route(I.LOGO, (r) => { asked.push(r.request().resourceType()); return logo ? r.fulfill({ status: 200, contentType: 'image/png', body: I.PNG }) : r.abort(); });
    if (o.before) await o.before(ctx);
    if (o.height) await page.setViewportSize({ width: 1440, height: o.height });
    await page.goto(BASE + url, { waitUntil: 'load' });
    if (o.wait !== false) await H.settled(page, o.seed ? 'app' : 'login');
    await page.waitForTimeout(300);
    return { ctx, page, asked };
  }
  const mark = (page, sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    return { text: e.textContent.trim(), bg: cs.backgroundImage, color: cs.color, fs: cs.fontSize, shadow: cs.boxShadow,
      w: Math.round(r.width), h: Math.round(r.height), ok: document.documentElement.classList.contains('ap-logo-ok') };
  }, sel);
  const isLogo = (m) => !!m && m.ok && m.bg.includes('aiparagonconsulting.com/logo.png') && m.color === 'rgba(0, 0, 0, 0)' && m.fs === '0px' && m.text === 'P';
  const isP = (m) => !!m && !m.ok && !m.bg.includes('logo.png') && m.color !== 'rgba(0, 0, 0, 0)' && m.fs !== '0px' && m.text === 'P';
  const LOGIN = '#view-login .brand-g', SIDE = '.nw-mark';
  const want = ['icon ' + I.LOGO, 'apple-touch-icon ' + I.LOGO];

  // 1. signed out: the tab icon, and the logo in place of the sign-in page's P
  {
    const { ctx, page, asked } = await open('/dashboard', true);
    const links = await I.iconLinks(page);
    check('the tab and home-screen icons are the logo, and only those', links.length === 2 && links.includes(want[0]) && links.includes(want[1]), JSON.stringify(links));
    check('the address is the sign-in page', new URL(page.url()).pathname === '/dashboard/login', page.url());
    const m = await mark(page, LOGIN);
    check('sign-in page: the logo stands in for the P', isLogo(m), JSON.stringify(m));
    check('sign-in page: the mark keeps its size (56 px)', !!m && m.w === 56 && m.h === 56, JSON.stringify(m));
    check('the page asked for the logo', asked.length >= 1, JSON.stringify(asked));

    // 2. signing in: the sidebar's mark is the logo too
    await H.signIn(page);
    const s = await mark(page, SIDE);
    check('sidebar: the logo stands in for the P', isLogo(s), JSON.stringify(s));
    check('sidebar: the mark keeps its size (34 px)', !!s && s.w === 34 && s.h === 34, JSON.stringify(s));
    check('sidebar: AI Paragon still sits next to it', await page.evaluate(() => (document.querySelector('.nw-brand-name') || {}).textContent === 'AI Paragon'));
    await ctx.close();
  }

  // 3. a saved session opening another page, and a short window on the sign-in page
  {
    const { ctx, page } = await open('/dashboard/templates', true, { seed: true });
    check('saved session on /dashboard/templates: the sidebar shows the logo', isLogo(await mark(page, SIDE)), JSON.stringify(await mark(page, SIDE)));
    await ctx.close();
    // a short window (under 760 px high): the logo takes the size the P has there
    const short = await open('/dashboard/login', true, { height: 700 });
    const m = await mark(short.page, LOGIN);
    await short.ctx.close();
    const shortP = await open('/dashboard/login', false, { height: 700 });
    const p = await mark(shortP.page, LOGIN);
    await shortP.ctx.close();
    check('a short window: the sign-in mark is the logo, the same size as the P there', isLogo(m) && isP(p) && m.w === p.w && m.h === p.h, JSON.stringify([m, p]));
  }

  // 4. the logo can't load: the P stays, on the sign-in page and in the sidebar
  {
    const { ctx, page } = await open('/dashboard', false);
    const m = await mark(page, LOGIN);
    check('logo refused: the sign-in page keeps its P', isP(m) && m.w === 56, JSON.stringify(m));
    await H.signIn(page);
    const s = await mark(page, SIDE);
    check('logo refused: the sidebar keeps its P', isP(s) && s.w === 34, JSON.stringify(s));
    check('logo refused: the tab icon link is there all the same', (await I.iconLinks(page)).includes(want[0]));
    await ctx.close();
  }

  // 5. the landing pages: the same icon, and the logo in place of an AI Paragon page's P; another brand keeps its letter
  {
    const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
    const PAGE = (brand) => ({ slug: 'spring-webinar', title: 'Spring webinar', kind: 'webinar', brand: { name: brand },
      content: { headline: 'Governed AI for RIAs', cta: 'Save my seat', fields: ['name', 'email'] } });
    async function goPage(brand, logo) {
      const o = await open('/go/spring-webinar', logo, { wait: false, before: (ctx) => ctx.route(SB + '/rest/v1/rpc/lp_public', (r) => r.fulfill({
        status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(brand ? PAGE(brand) : {}) })) });
      await o.page.waitForSelector('.lp-mark', { timeout: 10000 });
      await o.page.waitForTimeout(300);
      const m = await mark(o.page, '.lp-mark');
      m.ap = await o.page.evaluate(() => document.querySelector('.lp-mark').classList.contains('lp-mark-ap'));
      m.name = await o.page.evaluate(() => (document.querySelector('.lp-brand') || {}).textContent);
      return Object.assign(o, { m });
    }
    let g = await goPage('AI Paragon', true);
    const links = await I.iconLinks(g.page);
    check('go.html: the tab and home-screen icons are the logo, and only those', links.length === 2 && links.includes(want[0]) && links.includes(want[1]), JSON.stringify(links));
    check('go.html, an AI Paragon page: the logo stands in for the P, at its size (34 px)', isLogo(g.m) && g.m.ap && g.m.w === 34 && g.m.h === 34 && g.m.name === 'AI Paragon', JSON.stringify(g.m));
    await g.ctx.close();
    g = await goPage('Summit Advisors', true);
    check('go.html, another brand: its letter stays (no logo)', g.m.ok && !g.m.ap && g.m.text === 'S' && !g.m.bg.includes('logo.png') && g.m.color !== 'rgba(0, 0, 0, 0)', JSON.stringify(g.m));
    await g.ctx.close();
    g = await goPage('AI Paragon', false);
    check('go.html, logo refused: the AI Paragon page keeps its P', isP(g.m) && g.m.ap, JSON.stringify(g.m));
    await g.ctx.close();
    g = await goPage(null, true);
    check('go.html, a page that is not available: the logo stands in for the P there too', isLogo(g.m) && g.m.ap, JSON.stringify(g.m));
    await g.ctx.close();
  }

  // 6. vercel.json: the pages that link no icon get it from /favicon.ico; the app addresses are as they were
  {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    for (const p of ['/favicon.ico', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png']) {
      const r = await I.ask(BASE, p);
      const rule = (cfg.redirects || []).find((x) => x.source === p);
      check(p + ' forwards to the logo (307)', r.status === 307 && r.location === I.LOGO && !!rule && rule.permanent === false, JSON.stringify(r));
    }
    for (const p of ['/dashboard', '/dashboard/login', '/voice/overview', '/advisory/touchpoint', '/builder', '/go/qa-page']) {
      const r = await I.ask(BASE, p);
      check(p + ' still serves its app', r.status === 200, JSON.stringify(r));
    }
    const r = await I.ask(BASE, '/new-aiparagon-dashboard.html');
    check('the old file address still forwards to /dashboard', r.status === 307 && r.location === '/dashboard', JSON.stringify(r));
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
