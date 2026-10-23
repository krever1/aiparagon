// Routing tests for voice-agent-client.html (#4 Command Center): /voice/<page> paths (Vercel), #/<page>
// elsewhere, Back/Forward, deep links, bad input and the old-address forward. Given an earlier copy of
// the file it also checks every page reads the same as that copy. See tests/README.md.
// Usage: node tests/voice-routes.test.js [baseline.html]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = process.argv[2] ? path.resolve(process.argv[2]) : null;   // an earlier copy of the file, for the page-by-page comparison
const FILE = 'voice-agent-client.html';
const KEYS = ['overview', 'conversations', 'messages', 'opportunities', 'appointments', 'quality', 'training', 'knowledge', 'library', 'analytics', 'portal', 'tiers', 'settings'];
const SLUG = Object.fromEntries(KEYS.map((k) => [k, k === 'appointments' ? 'calendar' : k]));

// Same rewrites as vercel.json, read from the file itself
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const REWRITES = cfg.rewrites.map((r) => ({
  re: new RegExp('^' + r.source.replace(/\/:path\*$/, '(?:/.*)?').replace(/\//g, '\\/') + '$'),
  dest: r.destination,
}));

// Same redirects as vercel.json (permanent false = 307, true = 308)
const REDIRECTS = (cfg.redirects || []).map((r) => ({ source: r.source, dest: r.destination, code: r.permanent ? 308 : 307 }));

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch (e) {}                 // a malformed address still routes, like on Vercel
  const red = REDIRECTS.find((r) => r.source === p);
  if (red) { res.writeHead(red.code, { Location: red.dest }); return res.end(); }
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
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: (opts && opts.tz) || undefined });
    // Offline on purpose: no Supabase, jsDelivr or n8n, so every run sees the same signed-out demo
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(BASE) || u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    const page = await ctx.newPage();
    if (opts && opts.fixed) await page.clock.setFixedTime(new Date('2026-10-15T15:00:00-04:00'));
    const bucket = opts && opts.original ? pageErrors.original : pageErrors.patched;
    page.on('pageerror', (e) => bucket.push(url + ' :: ' + e.message));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    return { ctx, page };
  }
  async function state(page) {
    return page.evaluate((keys) => ({
      path: location.pathname,
      hash: location.hash,
      search: location.search,
      visible: keys.filter((k) => { const el = document.getElementById('s-' + k); return el && !el.classList.contains('hidden'); }),
      nav: [...document.querySelectorAll('.nav[aria-current="true"]')].map((e) => e.dataset.go),
      clientOpen: (document.getElementById('clientPanel') || {}).dataset ? document.getElementById('clientPanel').dataset.open === 'true' : false,
    }), KEYS);
  }
  const shows = (s, key) => s.visible.length === 1 && s.visible[0] === key && s.nav.length === 1 && s.nav[0] === key;
  const settle = (page) => page.waitForTimeout(150);

  // 1. /voice lands on Overview and settles on /voice/overview
  {
    const { ctx, page } = await open(BASE + '/voice');
    const s = await state(page);
    check('/voice opens Overview at /voice/overview', shows(s, 'overview') && s.path === '/voice/overview', JSON.stringify(s));
    await ctx.close();
  }
  // 2. every sidebar button writes its address
  {
    const { ctx, page } = await open(BASE + '/voice/overview');
    for (const k of KEYS) {
      await page.click('.nav[data-go="' + k + '"]');
      await settle(page);
      const s = await state(page);
      check('sidebar ' + k + ' -> /voice/' + SLUG[k], shows(s, k) && s.path === '/voice/' + SLUG[k], JSON.stringify(s));
    }
    await ctx.close();
  }
  // 3. every address opens its page directly (deep link)
  for (const k of KEYS) {
    const { ctx, page } = await open(BASE + '/voice/' + SLUG[k]);
    const s = await state(page);
    check('deep link /voice/' + SLUG[k] + ' opens ' + k, shows(s, k) && s.path === '/voice/' + SLUG[k], JSON.stringify(s));
    await ctx.close();
  }
  // 4. odd input: old word, unknown page, case + trailing slash, extra segments, encoded junk, query kept
  const odd = [
    ['/voice/appointments', 'appointments', '/voice/calendar'],
    ['/voice/nope', 'overview', '/voice/overview'],
    ['/voice/', 'overview', '/voice/overview'],
    ['/voice/Conversations/', 'conversations', '/voice/conversations'],
    ['/voice/library/abc/def', 'library', '/voice/library'],
    ['/voice/%E0%A4%A', 'overview', '/voice/overview'],
    ['/voice/%3Cscript%3E', 'overview', '/voice/overview'],
  ];
  for (const [url, key, want] of odd) {
    const { ctx, page } = await open(BASE + url);
    const s = await state(page);
    check('odd address ' + url + ' -> ' + key + ' at ' + want, shows(s, key) && s.path === want, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/voice/conversations?demo=1');
    await page.click('.nav[data-go="appointments"]');
    await settle(page);
    const s = await state(page);
    check('query string survives a page change', shows(s, 'appointments') && s.path === '/voice/calendar' && s.search === '?demo=1', JSON.stringify(s));
    await ctx.close();
  }
  // 5. Back / Forward / reload
  {
    const { ctx, page } = await open(BASE + '/voice/overview');
    await page.click('.nav[data-go="conversations"]'); await settle(page);
    await page.click('.nav[data-go="appointments"]'); await settle(page);
    await page.goBack(); await settle(page);
    let s = await state(page);
    check('Back -> conversations', shows(s, 'conversations') && s.path === '/voice/conversations', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back again -> overview', shows(s, 'overview') && s.path === '/voice/overview', JSON.stringify(s));
    await page.goForward(); await settle(page);
    s = await state(page);
    check('Forward -> conversations', shows(s, 'conversations') && s.path === '/voice/conversations', JSON.stringify(s));
    await page.click('.nav[data-go="library"]'); await settle(page);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250);
    s = await state(page);
    check('reload keeps the page (library)', shows(s, 'library') && s.path === '/voice/library', JSON.stringify(s));
    const len0 = await page.evaluate(() => history.length);
    await page.click('.nav[data-go="library"]'); await settle(page);
    const len1 = await page.evaluate(() => history.length);
    check('clicking the page you are on adds no history entry', len0 === len1, len0 + ' vs ' + len1);
    await ctx.close();
  }
  // 6. links inside a page (data-go buttons that are not in the sidebar)
  {
    const { ctx, page } = await open(BASE + '/voice/overview');
    const inner = await page.$('#s-overview [data-go="conversations"]');
    if (inner) {
      await inner.click(); await settle(page);
      const s = await state(page);
      check('in-page link on Overview -> /voice/conversations', shows(s, 'conversations') && s.path === '/voice/conversations', JSON.stringify(s));
    } else check('in-page link on Overview exists', false, 'no [data-go] button inside #s-overview');
    await ctx.close();
  }
  // 7. Back with the customer drawer open closes it
  {
    const { ctx, page } = await open(BASE + '/voice/overview');
    await page.click('.nav[data-go="messages"]'); await settle(page);
    const btn = await page.$('#s-messages [data-client]');
    if (btn) {
      await btn.click(); await settle(page);
      const before = await state(page);
      await page.goBack(); await settle(page);
      const s = await state(page);
      check('drawer was open before Back', before.clientOpen === true, JSON.stringify(before));
      check('Back closes the drawer and shows Overview', !s.clientOpen && shows(s, 'overview') && s.path === '/voice/overview', JSON.stringify(s));
    } else check('a customer link exists on Messages', false, 'no [data-client] in #s-messages');
    await ctx.close();
  }
  // 8. adversarial: rapid clicks, then a burst of Back presses; the page must always match the address
  {
    const { ctx, page } = await open(BASE + '/voice/overview');
    for (const k of KEYS.concat(['training', 'overview', 'appointments'])) await page.click('.nav[data-go="' + k + '"]');
    await settle(page);
    let s = await state(page);
    check('rapid clicks end on the last page clicked', shows(s, 'appointments') && s.path === '/voice/calendar', JSON.stringify(s));
    await page.evaluate(() => { for (let i = 0; i < 5; i++) history.back(); });
    await page.waitForTimeout(600);
    s = await state(page);
    const want = Object.keys(SLUG).find((k) => '/voice/' + SLUG[k] === s.path);
    check('after 5 quick Backs the page matches the address', !!want && shows(s, want), JSON.stringify(s));
    await ctx.close();
  }
  // 9. the old address forwards to /voice/overview; a #/<page> carried through the forward opens that page
  for (const [suffix, key, wantPath, wantHash] of [
    ['', 'overview', '/voice/overview', ''],
    ['#/calendar', 'appointments', '/voice/calendar', ''],
    ['#/conversations', 'conversations', '/voice/conversations', ''],
    ['#/nope', 'overview', '/voice/overview', ''],
    ['#section-2', 'overview', '/voice/overview', '#section-2'],
  ]) {
    const { ctx, page } = await open(BASE + '/' + FILE + suffix);
    const s = await state(page);
    check('old address ' + (suffix || '(plain)') + ' forwards to ' + wantPath + wantHash, shows(s, key) && s.path === wantPath && s.hash === wantHash, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/' + FILE);
    await page.click('.nav[data-go="conversations"]'); await settle(page);
    await page.goBack(); await settle(page);
    let s = await state(page);
    check('after the forward, Back returns to /voice/overview', shows(s, 'overview') && s.path === '/voice/overview', JSON.stringify(s));
    await page.goForward(); await settle(page);
    s = await state(page);
    check('after the forward, Forward returns to /voice/conversations', shows(s, 'conversations') && s.path === '/voice/conversations', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/voice/settings#/calendar');
    const s = await state(page);
    check('a #/<page> on /voice wins and is dropped from the address', shows(s, 'appointments') && s.path === '/voice/calendar' && s.hash === '', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/voice/settings');
    await page.evaluate(() => { location.hash = '#/calendar'; });
    await settle(page);
    const s = await state(page);
    check('typing #/<page> on an open /voice page changes nothing', shows(s, 'settings') && s.path === '/voice/settings', JSON.stringify(s));
    await ctx.close();
  }
  // 9b. the same file on a host without the rewrite keeps its address and uses #/<page>
  const COPY = '/copy/' + FILE;
  {
    const { ctx, page } = await open(BASE + COPY);
    let s = await state(page);
    check('other host: opens Overview with no hash added', shows(s, 'overview') && s.path === COPY && s.hash === '', JSON.stringify(s));
    await page.click('.nav[data-go="conversations"]'); await settle(page);
    s = await state(page);
    check('other host: sidebar writes #/conversations', shows(s, 'conversations') && s.path === COPY && s.hash === '#/conversations', JSON.stringify(s));
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250);
    s = await state(page);
    check('other host: reload keeps conversations', shows(s, 'conversations'), JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('other host: Back returns to Overview', shows(s, 'overview') && s.hash === '', JSON.stringify(s));
    await ctx.close();
  }
  for (const [hash, key, want] of [['#/calendar', 'appointments', '#/calendar'], ['#/nope', 'overview', '#/overview'], ['#section-2', 'overview', '#section-2']]) {
    const { ctx, page } = await open(BASE + COPY + hash);
    const s = await state(page);
    check('other host ' + hash + ' -> ' + key + ' (' + want + ')', shows(s, key) && s.path === COPY && s.hash === want, JSON.stringify(s));
    await ctx.close();
  }
  // 10. a local copy (file://) works with #/<page>
  {
    const { ctx, page } = await open('file://' + path.join(ROOT, FILE));
    await page.click('.nav[data-go="knowledge"]'); await settle(page);
    let s = await state(page);
    check('local file: sidebar writes #/knowledge', shows(s, 'knowledge') && s.hash === '#/knowledge', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('local file: Back returns to Overview', shows(s, 'overview'), JSON.stringify(s));
    await ctx.close();
  }
  // 11. with a baseline: every page reads the same as that copy (same fixed clock, signed out, offline)
  if (!BASELINE) console.log('SKIP page-by-page comparison: no baseline file given');
  else for (const k of KEYS) {
    const texts = [];
    for (const [url, original] of [[BASE + '/baseline.html', true], [BASE + '/voice/overview', false]]) {
      const { ctx, page } = await open(url, { fixed: true, original });
      await page.click('.nav[data-go="' + k + '"]'); await settle(page);
      texts.push(await page.evaluate((key) => document.getElementById('s-' + key).innerText, k));
      await ctx.close();
    }
    check('regression: ' + k + ' reads the same as the baseline', texts[0] === texts[1], 'lengths ' + texts[0].length + ' vs ' + texts[1].length);
  }

  // 12. the calendar is in the business's time zone (Pacific), whatever time zone the viewer is in
  for (const tz of ['Asia/Dubai', 'America/New_York']) {
    const { ctx, page } = await open(BASE + '/voice/calendar', { tz });
    const t = await page.evaluate(() => ({ range: document.getElementById('calRange').textContent, sub: document.getElementById('calSub').textContent }));
    check('calendar viewed from ' + tz + ' says Pacific', / · Pacific time$/.test(t.range) && /Times are Pacific/.test(t.sub) && !/Eastern/.test(t.range + t.sub), JSON.stringify(t));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/voice/calendar', { tz: 'America/Los_Angeles' });
    const t = await page.evaluate(() => document.getElementById('calRange').textContent + ' ' + document.getElementById('calSub').textContent);
    check('calendar viewed from Pacific adds no time zone note', !/Pacific|Eastern/.test(t), t);
    await ctx.close();
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
