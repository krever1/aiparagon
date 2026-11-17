// Video harness: the old dashboard (new-aiparagon-dashboard.html) served locally, signed in as a made-up teammate,
// Supabase answered by an in-memory store, n8n by the recorder's hooks, and fonts and CDN scripts fetched once
// through the session's proxy (curl) and kept in a cache. Nothing reaches the real Supabase or n8n.
// Rebuilt Nov 17 after a container reset (the earlier copy was lost with the scratchpad).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = process.env.AP_ROOT || require('path').join(__dirname, '..', '..');
const H = require(ROOT + '/tests/lib/dashboard-harness');
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const CACHE = path.join(__dirname, '..', 'cache');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function cached(url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, crypto.createHash('sha1').update(url).digest('hex'));
  if (!fs.existsSync(f)) {
    try { execFileSync('curl', ['-sSfL', '-A', UA, '-o', f, url], { timeout: 60000 }); }
    catch (e) { console.error('  not fetched:', url.slice(0, 120)); return null; }
  }
  return fs.readFileSync(f);
}
function typeOf(url) {
  if (/\.woff2(\?|$)/.test(url) || /fonts\.gstatic/.test(url)) return 'font/woff2';
  if (/fonts\.googleapis\.com\/css/.test(url)) return 'text/css';
  if (/\.m?js(\?|$)/.test(url)) return 'application/javascript';
  if (/\.css(\?|$)/.test(url)) return 'text/css';
  return 'application/octet-stream';
}
const EXTERNAL = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//;

function mkUser(name, email) { return { id: '00000000-0000-4000-8000-000000000001', email, user_metadata: { display_name: name } }; }
async function newPage(browser, BASE, o) {
  const USER = mkUser(o.name || 'Jordan Reyes', o.email || 'jordan@summitadvisors.example');
  const ctx = await browser.newContext({ viewport: { width: o.w || 1440, height: o.h || 810 }, deviceScaleFactor: o.dsf || 2, timezoneId: o.tz || 'America/Los_Angeles', locale: 'en-US' });
  const session = { access_token: 'demo-token', refresh_token: 'demo-refresh', expires_in: 3600, token_type: 'bearer', user: USER };
  await ctx.route('**/*', async (route) => {
    const req = route.request(); const u = req.url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    if (o.files) { const f = o.files(u); if (f) return route.fulfill(f); }
    if (EXTERNAL.test(u)) {
      const body = cached(u);
      if (!body) return route.abort();
      return route.fulfill({ status: 200, contentType: typeOf(u), headers: { 'access-control-allow-origin': '*' }, body });
    }
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (u.startsWith(SB)) {
      const p = u.slice(SB.length);
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (p.startsWith('/auth/v1/token')) return json(200, session);
      if (p.startsWith('/auth/v1/user')) return json(200, USER);
      if (p.startsWith('/auth/v1/')) return json(200, {});
      if (p.startsWith('/rest/v1/ap_prefs') && req.method() === 'GET') return json(200, [{ prefs: Object.assign({ v: 1, rd: null, seen_welcome: true }, o.prefs || {}), updated_at: new Date().toISOString(), device: 'demo' }]);
      if (p.startsWith('/rest/v1/ap_prefs')) return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' } });
      if (p.startsWith('/rest/v1/ap_profiles') && req.method() === 'GET') return json(200, [{ id: USER.id, display_name: USER.user_metadata.display_name, email: USER.email }]);
      if (o.rest && p.startsWith('/rest/v1/')) {
        const r = o.rest.handle(req.method(), p, req.postData(), req.headers());
        if (r.status === 204 || r.body == null) return route.fulfill({ status: r.status, headers: { 'access-control-allow-origin': '*' } });
        return json(r.status, r.body);
      }
      if (req.method() === 'GET') return json(200, []);
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (u.startsWith('https://n8n.aiparagonconsulting.com/')) {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const r = (o.hooks && o.hooks(u, req.method(), req.postData())) || { body: { ok: true } };
      return route.fulfill({ status: r.status || 200, contentType: 'application/json', headers: cors, body: JSON.stringify(r.body == null ? {} : r.body) });
    }
    return route.abort();
  });
  const stored = { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: Date.now() + 3600 * 1000 * 24 * 30, user: USER };
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('demo.seeded')) { localStorage.setItem('ap.session.v1', v); sessionStorage.setItem('demo.seeded', '1'); } } catch (e) {} }, JSON.stringify(stored));
  const page = await ctx.newPage();
  if (o.time) await page.clock.setFixedTime(new Date(o.time));
  page.on('pageerror', (e) => (o.errors || []).push(e.message));
  page.on('dialog', (d) => d.accept());
  return { ctx, page, USER };
}
// hide toasts and the floating bits a still frame should not carry
const CLEAN_CSS = '#toast,#nwToast,.nw-toast{display:none!important} *{caret-color:transparent!important}';
async function clean(page, extra) { await page.addStyleTag({ content: CLEAN_CSS + (extra || '') }); }
// blur elements (CSS selectors) in place; px = blur radius
async function blur(page, sels, px) {
  await page.addStyleTag({ content: sels.map((s) => s + '{filter:blur(' + (px || 6) + 'px)!important;pointer-events:none}').join('\n') });
}
module.exports = { ROOT, H, SB, newPage, clean, blur, cached };
