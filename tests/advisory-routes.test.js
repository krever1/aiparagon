// Routing tests for mhwp-dashboard.html (#3 Advisory OS demo): /advisory/<page> paths (Vercel), #/<page>
// elsewhere, the sign-in gate, Back/Forward, deep links, detail pages, modals, bad input, frames and the
// old-address forward. Given an earlier copy of the file it also checks every page reads the same as
// that copy. See tests/README.md.
// Usage: node tests/advisory-routes.test.js [baseline.html]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = process.argv[2] ? path.resolve(process.argv[2]) : null;   // an earlier copy of the file, for the page-by-page comparison
const FILE = 'mhwp-dashboard.html';
// page, address word, where a user finds it (sidebar or the profile menu)
const PAGES = [
  ['home', 'touchpoint', 'side'], ['c360', 'catalyst', 'side'], ['delivs', 'canvas', 'side'], ['studio', 'pipeline', 'side'],
  ['kb', 'atlas', 'side'], ['templates', 'templates', 'side'], ['audit', 'audit', 'side'],
  ['company', 'company', 'menu'], ['voice', 'brand-voice', 'menu'], ['learning', 'ai-settings', 'menu'], ['integrations', 'integrations', 'menu'],
];
const SLUG = Object.fromEntries(PAGES.map(([p, s]) => [p, s]));
const WHERE = Object.fromEntries(PAGES.map(([p, , w]) => [p, w]));
const A = (p) => '/advisory/' + SLUG[p];

// Same rewrites and redirects as vercel.json, read from the file itself
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const REWRITES = cfg.rewrites.map((r) => ({
  re: new RegExp('^' + r.source.replace(/\/:path\*$/, '(?:/.*)?').replace(/\//g, '\\/') + '$'),
  dest: r.destination,
}));
const REDIRECTS = (cfg.redirects || []).map((r) => ({ source: r.source, dest: r.destination, code: r.permanent ? 308 : 307 }));
const FRAME = '<!doctype html><meta charset="utf-8"><title>frame</title><iframe id="f" src="/advisory/canvas" style="width:1400px;height:860px;border:0"></iframe>';

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch (e) {}                 // a malformed address still routes, like on Vercel
  const red = REDIRECTS.find((r) => r.source === p);
  if (red) { res.writeHead(red.code, { Location: red.dest }); return res.end(); }
  if (p === '/frame.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(FRAME); }
  let file;
  if (p === '/baseline.html' && BASELINE) file = BASELINE;
  else if (p === '/copy/' + FILE) file = path.join(ROOT, FILE);       // the same file on a host without the rewrite or the forward
  else {
    const hit = REWRITES.find((r) => r.re.test(p));
    file = path.join(ROOT, hit ? hit.dest : p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.html') || p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const pageErrors = { patched: [], original: [] };

  async function open(url, opts) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Offline on purpose (Unsplash tiles, fonts): every run sees the same page
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(BASE) || u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    const page = await ctx.newPage();
    if (opts && opts.fixed) await page.clock.setFixedTime(new Date('2026-10-15T10:00:00'));
    const bucket = opts && opts.original ? pageErrors.original : pageErrors.patched;
    page.on('pageerror', (e) => bucket.push(url + ' :: ' + e.message));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    return { ctx, page };
  }
  // Sign in and finish onboarding with real clicks; `untick` switches capabilities off on step 1
  async function signIn(page, opts) {
    const pw = await page.evaluate(() => CREDS.Kaeser);
    await page.fill('#loginU', 'Kaeser');
    await page.fill('#loginP', pw);
    await page.click('#view-login button:has-text("Sign in")');
    await page.waitForTimeout(150);
    for (const k of (opts && opts.untick) || []) await page.click('#capGrid .cap-tile[onclick="toggleCap(\'' + k + '\')"]');
    await page.evaluate(() => obGo(4));
    await page.click('#obp4 button:has-text("Finish setup")');
    await page.waitForTimeout(500);
  }
  async function state(page) {
    return page.evaluate(() => ({
      path: location.pathname,
      hash: location.hash,
      search: location.search,
      page: S.page,
      on: [...document.querySelectorAll('.page.on')].map((e) => e.id.replace(/^page-/, '')),
      side: [...document.querySelectorAll('.rd-sidebar .sb-item.on')].map((e) => e.dataset.page),
      app: !document.getElementById('view-app').classList.contains('hidden'),
      login: !document.getElementById('view-login').classList.contains('hidden'),
      modals: [...document.querySelectorAll('.scrim.open')].map((e) => e.id),
      len: history.length,
    }));
  }
  const shows = (s, p) => s.app && s.page === p && s.on.length === 1 && s.on[0] === p &&
    (WHERE[p] !== 'side' || (s.side.length === 1 && s.side[0] === p));
  const settle = (page) => page.waitForTimeout(150);
  async function go(page, p) {                                       // the way a user gets there
    if (WHERE[p] === 'menu') { await page.click('.sb-user'); await page.click('.pm-item[data-page="' + p + '"]'); }
    else await page.click('.rd-sidebar .sb-item[data-page="' + p + '"]');
    await settle(page);
  }

  // 1. /advisory: the sign-in screen first, the address settles on /advisory/touchpoint, then Touchpoint
  {
    const { ctx, page } = await open(BASE + '/advisory');
    let s = await state(page);
    check('/advisory shows sign-in at /advisory/touchpoint', s.login && !s.app && s.path === '/advisory/touchpoint', JSON.stringify(s));
    const L0 = s.len;
    await signIn(page);
    s = await state(page);
    check('after onboarding: Touchpoint at /advisory/touchpoint, no history entry added', shows(s, 'home') && s.path === '/advisory/touchpoint' && s.len === L0, JSON.stringify(s));
    await ctx.close();
  }
  // 2. every sidebar and profile-menu page writes its address
  {
    const { ctx, page } = await open(BASE + '/advisory/touchpoint');
    await signIn(page);
    for (const [p] of PAGES.slice(1).concat([PAGES[0]])) {
      await go(page, p);
      const s = await state(page);
      check((WHERE[p] === 'side' ? 'sidebar ' : 'profile menu ') + p + ' -> ' + A(p), shows(s, p) && s.path === A(p), JSON.stringify(s));
    }
    await ctx.close();
  }
  // 3. every address opens its page once onboarding finishes (deep link), with no extra history entries
  for (const [p] of PAGES) {
    const { ctx, page } = await open(BASE + A(p));
    let s = await state(page);
    const before = s.path === A(p) && s.login, L0 = s.len;
    await signIn(page);
    s = await state(page);
    check('deep link ' + A(p) + ' opens ' + p + ', no history entry added', before && shows(s, p) && s.path === A(p) && s.len === L0, JSON.stringify(s));
    await ctx.close();
  }
  // 4. odd input: own names, unknown words, case + trailing slash, extra segments, encoded junk, prototype names
  const odd = [
    ['/advisory/', 'home'], ['/advisory/nope', 'home'], ['/advisory/home', 'home'], ['/advisory/c360', 'c360'],
    ['/advisory/kb', 'kb'], ['/advisory/delivs', 'delivs'], ['/advisory/studio', 'studio'], ['/advisory/learning', 'learning'],
    ['/advisory/Canvas/', 'delivs'], ['/advisory/ATLAS', 'kb'], ['/advisory/atlas/abc/def', 'kb'],
    ['/advisory/%E0%A4%A', 'home'], ['/advisory/%3Cscript%3E', 'home'], ['/advisory/constructor', 'home'],
    ['/advisory/__proto__', 'home'], ['/advisory/toString', 'home'], ['/advisory/cdetail', 'home'], ['/advisory/meetings', 'home'],
  ];
  for (const [url, p] of odd) {
    const { ctx, page } = await open(BASE + url);
    const s0 = await state(page);
    await signIn(page);
    const s = await state(page);
    check('odd address ' + url + ' -> ' + p + ' at ' + A(p), s0.path === A(p) && shows(s, p) && s.path === A(p), JSON.stringify(s0.path) + ' ' + JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/advisory/catalyst?demo=1');
    await signIn(page);
    await go(page, 'delivs');
    const s = await state(page);
    check('query string survives a page change', shows(s, 'delivs') && s.path === '/advisory/canvas' && s.search === '?demo=1', JSON.stringify(s));
    await ctx.close();
  }
  // 5. Back / Forward / reload
  {
    const { ctx, page } = await open(BASE + '/advisory/touchpoint');
    await signIn(page);
    await go(page, 'c360'); await go(page, 'delivs');
    await page.goBack(); await settle(page);
    let s = await state(page);
    check('Back -> Catalyst', shows(s, 'c360') && s.path === '/advisory/catalyst', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back again -> Touchpoint', shows(s, 'home') && s.path === '/advisory/touchpoint', JSON.stringify(s));
    await page.goForward(); await settle(page);
    s = await state(page);
    check('Forward -> Catalyst', shows(s, 'c360') && s.path === '/advisory/catalyst', JSON.stringify(s));
    await go(page, 'kb');
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250);
    s = await state(page);
    check('reload asks to sign in again and keeps the address', s.login && s.path === '/advisory/atlas', JSON.stringify(s));
    await signIn(page);
    s = await state(page);
    check('then opens Atlas', shows(s, 'kb') && s.path === '/advisory/atlas', JSON.stringify(s));
    const len0 = s.len;
    await go(page, 'kb');
    s = await state(page);
    check('clicking the page you are on adds no history entry', s.len === len0, len0 + ' vs ' + s.len);
    await ctx.close();
  }
  // 6. links inside a page and the app's own page names follow the page actually shown
  {
    const { ctx, page } = await open(BASE + '/advisory/catalyst');
    await signIn(page);
    const btn = page.locator('#page-c360 .rd-purpose button').first();
    if (await btn.count()) {
      await btn.click(); await settle(page);
      const s = await state(page);
      check('in-page "Open Canvas" on Catalyst -> /advisory/canvas', shows(s, 'delivs') && s.path === '/advisory/canvas', JSON.stringify(s));
    } else check('in-page link on Catalyst exists', false, 'no .rd-purpose button in #page-c360');
    await page.evaluate(() => nav('meetings')); await settle(page);
    let s = await state(page);
    check("nav('meetings') shows Catalyst at /advisory/catalyst", shows(s, 'c360') && s.path === '/advisory/catalyst', JSON.stringify(s));
    await page.evaluate(() => nav('pipeline')); await settle(page);
    s = await state(page);
    check("nav('pipeline') (Canvas stage board) stays at /advisory/canvas", shows(s, 'delivs') && s.path === '/advisory/canvas', JSON.stringify(s));
    await ctx.close();
  }
  // 7. detail pages keep their parent's address and add no history entries
  {
    const { ctx, page } = await open(BASE + '/advisory/touchpoint');
    await signIn(page);
    await go(page, 'c360');
    const len0 = (await state(page)).len;
    const row = page.locator('#page-c360 [onclick*="openClient(\'c1\')"]').first();
    const real = (await row.count()) > 0;
    if (real) await row.click(); else await page.evaluate(() => openClient('c1'));
    await settle(page);
    let s = await state(page);
    check('client page (' + (real ? 'real click' : 'openClient') + ') keeps /advisory/catalyst, no new entry', s.page === 'cdetail' && s.path === '/advisory/catalyst' && s.len === len0, JSON.stringify(s));
    await go(page, 'delivs');
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back from Canvas to the client page address shows Catalyst', shows(s, 'c360') && s.path === '/advisory/catalyst', JSON.stringify(s));
    await go(page, 'delivs');
    await page.evaluate(() => openDeliv(DELIVS[0].id)); await settle(page);
    s = await state(page);
    check('document editor keeps /advisory/canvas', s.page === 'editor' && s.path === '/advisory/canvas', JSON.stringify(s));
    await go(page, 'studio');
    await page.evaluate(() => { if (typeof openCampaign === 'function') openCampaign(); else nav('campaign'); }); await settle(page);
    s = await state(page);
    check('campaign keeps /advisory/pipeline', s.page === 'campaign' && s.path === '/advisory/pipeline', JSON.stringify(s));
    await ctx.close();
  }
  // 8. Back with a modal open closes it; Back out of the build wizard does not add history entries
  {
    const { ctx, page } = await open(BASE + '/advisory/touchpoint');
    await signIn(page);
    await go(page, 'c360');
    await page.evaluate(() => openModal('mAddClient')); await settle(page);
    let s = await state(page);
    const wasOpen = s.modals.includes('mAddClient');
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back closes the open modal and shows Touchpoint', wasOpen && s.modals.length === 0 && shows(s, 'home') && s.path === '/advisory/touchpoint', JSON.stringify(s));
    await go(page, 'templates');
    await page.evaluate(() => genFrom(TEMPLATES[0].id)); await page.waitForTimeout(300);
    s = await state(page);
    const wizard = s.modals.length > 0;
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back out of the build wizard closes it and shows Touchpoint', wizard && s.modals.length === 0 && shows(s, 'home') && s.path === '/advisory/touchpoint', JSON.stringify(s));
    await page.goForward(); await settle(page);
    s = await state(page);
    check('Forward still returns to Templates (no entry was added on the way back)', shows(s, 'templates') && s.path === '/advisory/templates', JSON.stringify(s));
    await ctx.close();
  }
  // 9. adversarial: rapid clicks, then a burst of Back presses; the page must always match the address
  {
    const { ctx, page } = await open(BASE + '/advisory/touchpoint');
    await signIn(page);
    for (const p of ['c360', 'delivs', 'studio', 'kb', 'templates', 'audit', 'home', 'c360', 'delivs']) await page.click('.rd-sidebar .sb-item[data-page="' + p + '"]');
    await settle(page);
    let s = await state(page);
    check('rapid clicks end on the last page clicked', shows(s, 'delivs') && s.path === '/advisory/canvas', JSON.stringify(s));
    await page.evaluate(() => { for (let i = 0; i < 5; i++) history.back(); });
    await page.waitForTimeout(700);
    s = await state(page);
    const want = Object.keys(SLUG).find((p) => A(p) === s.path);
    check('after 5 quick Backs the page matches the address', !!want && shows(s, want), JSON.stringify(s));
    await ctx.close();
  }
  // 10. before sign-in: Back/Forward/edits only change which page opens; nothing is written
  {
    const { ctx, page } = await open(BASE + '/advisory/canvas');
    let s = await state(page);
    check('sign-in screen keeps /advisory/canvas', s.login && s.path === '/advisory/canvas', JSON.stringify(s));
    const L0 = s.len;
    await page.click('#view-login button:has-text("Sign in")'); await settle(page);   // empty form: shows the error, stays put
    s = await state(page);
    check('a failed sign-in keeps the address and adds no history entry', s.login && s.path === '/advisory/canvas' && s.len === L0, JSON.stringify(s));
    await ctx.close();
  }
  // 11. capabilities switched off in onboarding: their addresses land on Touchpoint
  for (const [url, untick] of [['/advisory/pipeline', ['studio']], ['/advisory/templates', ['kb']], ['/advisory/catalyst', ['c360']]]) {
    const { ctx, page } = await open(BASE + url);
    await signIn(page, { untick });
    const s = await state(page);
    check(url + ' with ' + untick[0] + ' switched off -> Touchpoint', shows(s, 'home') && s.path === '/advisory/touchpoint', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/advisory/pipeline');
    await signIn(page, { untick: ['kb'] });
    const s = await state(page);
    check('/advisory/pipeline with only Atlas off still opens Pipeline', shows(s, 'studio') && s.path === '/advisory/pipeline', JSON.stringify(s));
    await ctx.close();
  }
  {
    // switched off, but an in-app link (a calendar event) still opens Pipeline: Back must show what was there
    const { ctx, page } = await open(BASE + '/advisory/touchpoint');
    await signIn(page, { untick: ['studio'] });
    await page.evaluate(() => nav('studio')); await settle(page);
    let s = await state(page);
    check('Pipeline switched off: an in-app link still opens it at /advisory/pipeline', s.page === 'studio' && s.on[0] === 'studio' && s.path === '/advisory/pipeline', JSON.stringify(s));
    await go(page, 'c360');
    await page.goBack(); await settle(page);
    s = await state(page);
    check('then Back shows Pipeline, matching the address', s.page === 'studio' && s.on[0] === 'studio' && s.path === '/advisory/pipeline', JSON.stringify(s));
    await ctx.close();
  }
  // 12. the old address forwards to /advisory/touchpoint; a #/<page> carried through the forward opens that page
  for (const [suffix, p, wantHash] of [['', 'home', ''], ['#/canvas', 'delivs', ''], ['#/atlas', 'kb', ''], ['#/nope', 'home', ''], ['#section-2', 'home', '#section-2']]) {
    const { ctx, page } = await open(BASE + '/' + FILE + suffix);
    const s0 = await state(page);
    await signIn(page);
    const s = await state(page);
    check('old address ' + (suffix || '(plain)') + ' forwards to ' + A(p) + wantHash, s0.path === A(p) && shows(s, p) && s.path === A(p) && s.hash === wantHash, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/' + FILE);
    await signIn(page);
    await go(page, 'c360');
    await page.goBack(); await settle(page);
    let s = await state(page);
    check('after the forward, Back returns to /advisory/touchpoint', shows(s, 'home') && s.path === '/advisory/touchpoint', JSON.stringify(s));
    await page.goForward(); await settle(page);
    s = await state(page);
    check('after the forward, Forward returns to /advisory/catalyst', shows(s, 'c360') && s.path === '/advisory/catalyst', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/advisory/audit#/canvas');
    const s0 = await state(page);
    await signIn(page);
    const s = await state(page);
    check('a #/<page> on /advisory wins and is dropped from the address', s0.path === '/advisory/canvas' && s0.hash === '' && shows(s, 'delivs') && s.path === '/advisory/canvas', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/advisory/audit');
    await signIn(page);
    await page.evaluate(() => { location.hash = '#/canvas'; });
    await settle(page);
    const s = await state(page);
    check('typing #/<page> on an open /advisory page changes nothing', shows(s, 'audit') && s.path === '/advisory/audit', JSON.stringify(s));
    await ctx.close();
  }
  // 13. the same file on a host without the rewrite keeps its address and uses #/<page>
  const COPY = '/copy/' + FILE;
  {
    const { ctx, page } = await open(BASE + COPY);
    await signIn(page);
    let s = await state(page);
    check('other host: Touchpoint with no hash added', shows(s, 'home') && s.path === COPY && s.hash === '', JSON.stringify(s));
    await go(page, 'delivs');
    s = await state(page);
    check('other host: sidebar writes #/canvas', shows(s, 'delivs') && s.path === COPY && s.hash === '#/canvas', JSON.stringify(s));
    await go(page, 'voice');
    s = await state(page);
    check('other host: profile menu writes #/brand-voice', shows(s, 'voice') && s.hash === '#/brand-voice', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('other host: Back -> Canvas', shows(s, 'delivs') && s.hash === '#/canvas', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('other host: Back again -> Touchpoint', shows(s, 'home') && s.hash === '', JSON.stringify(s));
    await page.goForward(); await settle(page);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250);
    await signIn(page);
    s = await state(page);
    check('other host: reload + sign in keeps Canvas', shows(s, 'delivs') && s.hash === '#/canvas', JSON.stringify(s));
    await ctx.close();
  }
  for (const [hash, p, want] of [['#/catalyst', 'c360', '#/catalyst'], ['#/CANVAS', 'delivs', '#/canvas'], ['#/nope', 'home', '#/touchpoint'], ['#section-2', 'home', '#section-2']]) {
    const { ctx, page } = await open(BASE + COPY + hash);
    await signIn(page);
    const s = await state(page);
    check('other host ' + hash + ' -> ' + p + ' (' + want + ')', shows(s, p) && s.path === COPY && s.hash === want, JSON.stringify(s));
    await ctx.close();
  }
  // 14. a local copy (file://) works with #/<page>
  {
    const { ctx, page } = await open('file://' + path.join(ROOT, FILE));
    await signIn(page);
    await go(page, 'kb');
    let s = await state(page);
    check('local file: sidebar writes #/atlas', shows(s, 'kb') && s.hash === '#/atlas', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('local file: Back returns to Touchpoint', shows(s, 'home') && s.hash === '', JSON.stringify(s));
    await ctx.close();
  }
  // 15. inside a frame (the landing page embed) the address is left alone and the app works as before
  {
    const { ctx, page } = await open(BASE + '/frame.html');
    const fr = page.frame({ url: /\/advisory\/canvas/ });
    const ok = !!fr;
    if (ok) {
      await signIn(fr);
      const s0 = await state(fr);
      const topLen0 = await page.evaluate(() => history.length);
      await fr.click('.rd-sidebar .sb-item[data-page="kb"]'); await fr.waitForTimeout(150);
      await fr.click('.rd-sidebar .sb-item[data-page="c360"]'); await fr.waitForTimeout(150);
      const s = await state(fr);
      const topLen = await page.evaluate(() => history.length);
      check('frame: opens Touchpoint like the original, address untouched', shows(s0, 'home') && s0.path === '/advisory/canvas', JSON.stringify(s0));
      check('frame: clicks change the page but not the address or the host history', shows(s, 'c360') && s.path === '/advisory/canvas' && s.hash === '' && topLen === topLen0, JSON.stringify(s) + ' top history ' + topLen0 + ' -> ' + topLen);
    } else check('frame loaded', false, 'no frame at /advisory/canvas');
    await ctx.close();
  }
  // 16. with a baseline: every page reads the same as that copy (same fixed clock, same clicks, offline)
  if (!BASELINE) console.log('SKIP page-by-page comparison: no baseline file given');
  else {
    const texts = { original: {}, patched: {} };
    for (const [url, key] of [[BASE + '/baseline.html', 'original'], [BASE + '/advisory', 'patched']]) {
      const { ctx, page } = await open(url, { fixed: true, original: key === 'original' });
      await signIn(page);
      for (const [p] of PAGES.slice(1).concat([PAGES[0]])) {
        await go(page, p);
        texts[key][p] = await page.evaluate((id) => document.getElementById('crumb').innerText + '\n' + document.getElementById('page-' + id).innerText, p);
      }
      await ctx.close();
    }
    for (const [p] of PAGES) {
      const a = texts.original[p], b = texts.patched[p];
      check('regression: ' + p + ' reads the same as the baseline', a === b, 'lengths ' + (a || '').length + ' vs ' + (b || '').length);
    }
  }

  // without a baseline any page error fails; with one, only errors the baseline did not have
  const newErrors = pageErrors.patched.filter((e) => !pageErrors.original.some((o) => o.split(' :: ')[1] === e.split(' :: ')[1]));
  check(BASELINE ? 'no new page errors' : 'no page errors', newErrors.length === 0, newErrors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (pageErrors.original.length ? ' (the baseline itself logged ' + pageErrors.original.length + ' page errors offline)' : ''));
  if (failures.length) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST RUN CRASHED:', e); server.close(); process.exit(2); });
