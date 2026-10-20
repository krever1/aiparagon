// Harness for the care portal suites (E-&-G-Home-Inc.html): a local server for the file, and a browser
// context where Supabase answers from stubs and pdf.js comes from a local copy, so the real sign-in,
// invite and template code runs offline. No real account, agency or data is touched; everything else
// external is blocked. The invite below exists only in the stubs.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const FILE = 'E-&-G-Home-Inc.html';
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const PDFJS = '3.11.174';
const FORMS = path.join(__dirname, '..', 'fixtures', 'forms');
const INVITE = { token: 'qa-invite-token', email: 'new.staff@maplecare.test', org_name: 'Maple Care', role_title: 'Direct support professional', staff_name: 'Jo Rivera', staff_id: 's9', used: false, access: 'staff' };

// pdf.js, the same version the portal loads from cdnjs, kept in tests/.cache (fetched from npm once)
function pdfjsBuild() {
  const dir = path.join(__dirname, '..', '.cache', 'pdfjs-dist-' + PDFJS);
  const build = path.join(dir, 'package', 'build');
  if (!fs.existsSync(path.join(build, 'pdf.worker.min.js'))) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('npm', ['pack', 'pdfjs-dist@' + PDFJS], { cwd: dir, stdio: 'ignore' });
    execFileSync('tar', ['xzf', 'pdfjs-dist-' + PDFJS + '.tgz'], { cwd: dir });
  }
  return build;
}

// the in-browser word reader (tesseract.js, its engine, and the English and Spanish data), the versions the
// portal loads from jsDelivr, kept in tests/.cache the same way
const OCR_PKGS = { 'tesseract.js@5.1.1': 'tesseract.js@5.1.1', 'tesseract.js-core@5.1.1': 'tesseract.js-core@5.1.1', '@tesseract.js-data/eng@1.0.0': '@tesseract.js-data/eng@1.0.0', '@tesseract.js-data/spa@1.0.0': '@tesseract.js-data/spa@1.0.0' };
function ocrPkg(spec) {
  const dir = path.join(__dirname, '..', '.cache', 'ocr', spec.replace(/[@/]/g, '_'));
  if (!fs.existsSync(path.join(dir, 'package', 'package.json'))) {
    fs.mkdirSync(dir, { recursive: true });
    const tgz = execFileSync('npm', ['pack', spec], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').pop();
    execFileSync('tar', ['xzf', tgz], { cwd: dir });
  }
  return path.join(dir, 'package');
}
const OCR_TYPES = { '.js': 'application/javascript', '.wasm': 'application/wasm', '.gz': 'application/gzip' };

function makeServer(file) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://local');
    if (u.pathname === '/portal.html' || u.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(file || path.join(ROOT, FILE)).pipe(res);
    }
    res.writeHead(404); res.end('not found');
  });
}

async function start(file) {
  const srv = makeServer(file);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  return { srv, BASE, browser, close: async () => { await browser.close(); srv.close(); } };
}

// opts: viewport, bucket (page errors), calls (array that records Supabase calls), session (a stub account, below),
// noOcr (the word reader cannot be fetched)
async function newPage(env, opts) {
  opts = opts || {};
  const build = pdfjsBuild();
  const ctx = await env.browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 } });
  const calls = opts.calls || [];
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = req.url();
    if (u.startsWith(env.BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    const m = u.match(/pdf\.js\/3\.11\.174\/(pdf(?:\.worker)?\.min\.js)$/);
    if (m) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(build, m[1])) });
    // opts.noOcr: the word reader cannot be fetched (offline, or blocked)
    const o = u.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@tesseract\.js-data\/[a-z_]+|tesseract\.js-core|tesseract\.js)@[\d.]+)\/(.+)$/);
    if (o && OCR_PKGS[o[1]]) {
      if (opts.noOcr) return route.fulfill({ status: 404, body: 'not found' });
      const f = path.join(ocrPkg(OCR_PKGS[o[1]]), o[2].split('?')[0]);
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: OCR_TYPES[path.extname(f)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    }
    if (u.startsWith(SB)) {
      const p = u.slice(SB.length);
      calls.push(req.method() + ' ' + p);
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (p.startsWith('/rest/v1/rpc/np_invite_peek')) {
        const b = JSON.parse(req.postData() || '{}');
        return json(200, b.p_token === INVITE.token ? [INVITE] : []);
      }
      if (p.startsWith('/rest/v1/rpc/np_invite_access')) return json(200, 'staff');
      // opts.session: one stub account ({email, password, role, program}) that signs in for real. Its agency's
      // settings rows live in session.program, so a second browser context with the same session object is
      // the same account on another device. Writes to them are recorded in session.writes.
      const S = opts.session;
      if (S) {
        S.writes = S.writes || [];
        if (p.startsWith('/auth/v1/token')) {
          const b = JSON.parse(req.postData() || '{}');
          if (b.email === S.email && b.password === S.password) return json(200, { access_token: 'qa-access-token', refresh_token: 'qa-refresh-token', expires_in: 3600, token_type: 'bearer', user: { id: 'qa-user', email: S.email } });
        }
        if (p.startsWith('/rest/v1/rpc/np_my_org')) return json(200, 'org-qa');
        if (p.startsWith('/rest/v1/rpc/np_my_role')) return json(200, S.role || 'director');
        if (p.startsWith('/rest/v1/np_demo_program')) {
          S.program = S.program || [];
          if (req.method() === 'GET') {
            const k = (p.match(/[?&]key=eq\.([^&]+)/) || [])[1];
            return json(200, S.program.filter((r) => !k || r.key === decodeURIComponent(k)));
          }
          if (req.method() === 'POST') {
            let b = JSON.parse(req.postData() || '[]'); if (!Array.isArray(b)) b = [b];
            b.forEach((row) => { S.writes.push(row); const i = S.program.findIndex((r) => r.key === row.key); if (i >= 0) S.program[i] = Object.assign({}, S.program[i], row); else S.program.push(row); });
            return json(201, []);
          }
        }
      }
      if (p.startsWith('/auth/v1/token')) return json(400, { error_description: 'Invalid login credentials' });
      if (p.startsWith('/functions/v1/np-password')) return json(200, { ok: true });
      if (req.method() === 'GET') return json(200, []);
      return json(201, []);
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  if (opts.bucket) page.on('pageerror', (e) => opts.bucket.push(e.message));
  return { ctx, page, calls };
}

// a PDF from tests/fixtures/forms, as base64 (page.evaluate turns it back into bytes)
const formB64 = (name) => fs.readFileSync(path.join(FORMS, name)).toString('base64');

module.exports = { start, newPage, formB64, FORMS, INVITE, FILE, ROOT };
