// The AI Paragon logo as the tab and home-screen icon (Nov 3): every app links
// https://www.aiparagonconsulting.com/logo.png from its <head>, and vercel.json forwards /favicon.ico and the
// apple-touch-icon addresses to it for the pages that link no icon. Shared by the icon checks in each suite.
// The logo is never fetched from the real site: a test serves a 1x1 PNG in its place, or refuses it.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const LOGO = 'https://www.aiparagonconsulting.com/logo.png';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// a local server with the same rewrites and redirects as vercel.json, read from the file itself; `extra` rewrites
// ({re, dest}) come first (the voice suite serves the old file at /voice, which vercel.json now sends elsewhere)
function serve(extra) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const REWRITES = (extra || []).concat(cfg.rewrites).map((r) => r.re ? r : ({
    re: new RegExp('^' + r.source.replace(/\/:path\*$/, '(?:/.*)?').replace(/\//g, '\\/') + '$'),
    dest: r.destination,
  }));
  const REDIRECTS = (cfg.redirects || []).map((r) => ({ source: r.source, dest: r.destination, code: r.permanent ? 308 : 307 }));
  return http.createServer((req, res) => {
    let p = new URL(req.url, 'http://local').pathname;
    try { p = decodeURIComponent(p); } catch (e) {}
    const red = REDIRECTS.find((r) => r.source === p);
    if (red) { res.writeHead(red.code, { Location: red.dest }); return res.end(); }
    const hit = REWRITES.find((r) => r.re.test(p));
    const file = path.join(ROOT, hit ? hit.dest : p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

// the logo is served (a 1x1 PNG) or refused; everything else outside the test server is refused
async function route(ctx, BASE, logo) {
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    return r.abort();
  });
  await ctx.route(LOGO, (r) => (logo ? r.fulfill({ status: 200, contentType: 'image/png', body: PNG }) : r.abort()));
}

// the icon links in the page's head, as "rel href"
const iconLinks = (page) => page.evaluate(() => [...document.head.querySelectorAll('link')]
  .filter((l) => /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(l.rel)).map((l) => l.rel + ' ' + l.href));

// what an address on the test server answers, without following a redirect
function ask(BASE, p) {
  return new Promise((resolve, reject) => {
    http.get(BASE + p, (res) => { res.resume(); resolve({ status: res.statusCode, location: res.headers.location || '' }); }).on('error', reject);
  });
}

// One suite: the page at `url` links the logo as its tab and home-screen icon, and nothing else as an icon.
async function iconSuite({ url, label, rewrites }) {
  let pass = 0, fail = 0;
  const failures = [];
  const check = (name, ok, detail) => {
    if (ok) pass++; else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); }
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : '   [' + detail + ']'));
  };
  const server = serve(rewrites);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await route(ctx, BASE, true);
    const page = await ctx.newPage();
    const res = await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    check(label + ': ' + url + ' opens', !!res && res.status() === 200, String(res && res.status()));
    const got = await iconLinks(page);
    const want = ['icon ' + LOGO, 'apple-touch-icon ' + LOGO];
    check(label + ': the tab icon is the AI Paragon logo', got.includes(want[0]), JSON.stringify(got));
    check(label + ': so is the home-screen icon', got.includes(want[1]), JSON.stringify(got));
    check(label + ': no other icon links', got.length === 2, JSON.stringify(got));
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
}

module.exports = { ROOT, LOGO, PNG, serve, route, iconLinks, ask, iconSuite, chromium };
