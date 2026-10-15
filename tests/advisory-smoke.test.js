// Smoke walk of mhwp-dashboard.html (#3 Advisory OS demo): sign in, open every sidebar page at three
// dates (today, plus two simulated dates that exercise the demo's date shift), and fail on any JS error.
// Usage: node tests/advisory-smoke.test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FILE = 'mhwp-dashboard.html';

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  try { p = decodeURIComponent(p); } catch (e) {}
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const RUNS = [
  { label: 'today', time: null },
  { label: 'simulated 2026-09-10', time: '2026-09-10T10:00:00' },
  { label: 'simulated 2027-01-05', time: '2027-01-05T10:00:00' },
];

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/' + FILE;
  const browser = await chromium.launch();
  for (const run of RUNS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    if (run.time) await page.clock.setFixedTime(new Date(run.time));
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto(base, { waitUntil: 'load' });
    const pw = await page.evaluate(() => CREDS.Kaeser);
    await page.fill('#loginU', 'Kaeser');
    await page.fill('#loginP', pw);
    await page.click('#view-login button:has-text("Sign in")');
    await page.waitForTimeout(400);
    await page.evaluate(() => obGo(4));
    await page.click('#obp4 button:has-text("Finish setup")');
    await page.waitForTimeout(900);

    const today = await page.evaluate(() => (typeof RD_TODAY !== 'undefined' ? RD_TODAY : null));
    check(run.label + ': signed in, the demo has a date', !!today, JSON.stringify(today));
    const items = await page.$$eval('.sb-item[data-page]', (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.dataset.page));
    check(run.label + ': 7 sidebar pages', items.length === 7, items.join(', '));
    for (const p of items) {
      const before = errors.length;
      await page.click('.sb-item[data-page="' + p + '"]');
      await page.waitForTimeout(500);
      const on = await page.evaluate(() => [...document.querySelectorAll('.page.on')].map((e) => e.id));
      check(run.label + ': ' + p + ' opens with no errors', on.length === 1 && on[0] === 'page-' + p && errors.length === before,
        JSON.stringify(on) + ' ' + errors.slice(before, before + 3).join(' | '));
    }
    check(run.label + ': no JS errors in the whole walk', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST RUN CRASHED:', e); server.close(); process.exit(2); });
