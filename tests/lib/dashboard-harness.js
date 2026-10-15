// Harness for tests/dashboard-routes.test.js (new-aiparagon-dashboard.html): a local server that applies
// vercel.json, and a browser context where Supabase Auth/REST answer from stubs, so the real sign-in,
// session restore and saved-workspace resume code runs offline. No real account, data or n8n workflow is
// touched: everything else external is blocked. The QA user and passwords below exist only in the stubs.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const FILE = 'new-aiparagon-dashboard.html';
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'qa@aiparagonconsulting.com', user_metadata: { display_name: 'QA Tester' } };

function makeServer(ROOT, BASELINE, frameSrc) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const REWRITES = cfg.rewrites.map((r) => ({
    re: new RegExp('^' + r.source.replace(/\/:path\*$/, '(?:/.*)?').replace(/\//g, '\\/') + '$'),
    dest: r.destination,
  }));
  const REDIRECTS = (cfg.redirects || []).map((r) => ({ source: r.source, dest: r.destination, code: r.permanent ? 308 : 307 }));
  const FRAME = '<!doctype html><meta charset="utf-8"><title>frame</title><iframe id="f" src="' + frameSrc + '" style="width:1400px;height:860px;border:0"></iframe>';
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://local');
    let p = u.pathname;
    try { p = decodeURIComponent(p); } catch (e) {}
    const red = REDIRECTS.find((r) => r.source === p);
    if (red) { res.writeHead(red.code, { Location: red.dest }); return res.end(); }   // like Vercel: the query string is not added by the server here
    if (p === '/frame.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(FRAME); }
    let file;
    if (p === '/baseline.html' && BASELINE) file = BASELINE;
    else if (p === '/copy/' + FILE) file = path.join(ROOT, FILE);
    else {
      const hit = REWRITES.find((r) => r.re.test(p));
      file = path.join(ROOT, hit ? hit.dest : p);
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') || p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

function session() {
  return { access_token: 'qa-token', refresh_token: 'qa-refresh', expires_in: 3600, token_type: 'bearer', user: USER };
}

// opts: seed (start signed in), prefs (saved workspace; 'none' for a new account), fixed (fixed clock), bucket (array for page errors)
async function newPage(browser, BASE, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const log = { prefsPosts: 0 };
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = req.url();
    if (u.startsWith(BASE) || u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    if (u.startsWith(SB)) {
      const p = u.slice(SB.length);
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (p.startsWith('/auth/v1/token')) {
        let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
        if (body.password === 'wrong-password') return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        return json(200, session());
      }
      if (p.startsWith('/auth/v1/user')) return json(200, USER);
      if (p.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      if (p.startsWith('/auth/v1/')) return json(200, {});
      if (p.startsWith('/rest/v1/ap_prefs') && req.method() === 'GET') {
        if (opts.prefs === 'none') return json(200, []);                                  // a brand-new account
        return json(200, [{ prefs: Object.assign({ v: 1, rd: null, seen_welcome: true }, opts.prefs || {}), updated_at: '2026-10-14T16:00:00Z', device: 'QA' }]);
      }
      if (p.startsWith('/rest/v1/ap_prefs')) { log.prefsPosts++; return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' } }); }
      if (p.startsWith('/rest/v1/ap_profiles') && req.method() === 'GET') return json(200, [{ id: USER.id, display_name: 'QA Tester', email: USER.email }]);
      if (req.method() === 'GET') return json(200, []);
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    return route.abort();
  });
  if (opts.seed) {
    const s = session();
    const stored = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Date.now() + 3600 * 1000, user: USER };
    await ctx.addInitScript((v) => {
      try { if (!sessionStorage.getItem('qa.seeded')) { localStorage.setItem('ap.session.v1', v); sessionStorage.setItem('qa.seeded', '1'); } } catch (e) {}
    }, JSON.stringify(stored));
  }
  const page = await ctx.newPage();
  if (opts.fixed) await page.clock.setFixedTime(new Date('2026-10-15T10:00:00'));
  if (opts.bucket) page.on('pageerror', (e) => opts.bucket.push(e.message));
  return { ctx, page, log };
}

// waits until the app shell is showing and the v107 sidebar is built (or the sign-in screen is up)
async function settled(page, want) {
  await page.waitForFunction((w) => {
    const app = document.getElementById('view-app'), lg = document.getElementById('view-login');
    const appOn = app && !app.classList.contains('hidden') && document.getElementById('nwNav');
    const loginOn = lg && !lg.classList.contains('hidden');
    return w === 'login' ? loginOn : appOn;
  }, want || 'app', { timeout: 15000 });
  await page.waitForTimeout(350);
}

async function signIn(page, pw) {
  await page.fill('#apEmail', USER.email);
  await page.fill('#apPw', pw || 'qa-password-1');
  await page.click('#apAuthBtn');
  if (pw) { await page.waitForTimeout(600); return; }   // a password that may be refused: do not wait for the app
  await settled(page, 'app');
}

module.exports = { FILE, USER, makeServer, newPage, settled, signIn, chromium };
