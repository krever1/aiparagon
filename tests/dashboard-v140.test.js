// v140 tests for new-aiparagon-dashboard.html (#1): password reset. This page has no Set a new password screen, so
// Forgot your password? asks Supabase for a link back to the new dashboard's reset page (aiparagon-dashboard.vercel.app/
// auth/reset), which sets the password for both apps; and a reset link that lands here anyway (Supabase's Site URL, for
// a reset sent from the Supabase dashboard) goes on to that page with its tokens. Before v140 the link went to the Site
// URL, which on Nov 16 was http://localhost:3000, and nothing anywhere read it.
// Supabase and the new dashboard are stubbed; nothing leaves the machine.
// Usage: node tests/dashboard-v140.test.js
const path = require('path');
const H = require('./lib/dashboard-harness');

const ROOT = path.resolve(__dirname, '..');
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const RESET = 'https://aiparagon-dashboard.vercel.app/auth/reset';
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

  // the new dashboard's reset page, answered here (routes added later win over the harness's)
  async function withResetPage(ctx, seen) {
    await ctx.route('https://aiparagon-dashboard.vercel.app/**', (route) => {
      seen.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Set a new password</title><h1>Set a new password</h1>' });
    });
  }

  // 1. Forgot your password? asks for a link back to the reset page
  {
    const { ctx, page } = await H.newPage(browser, BASE, { bucket: errors });
    const recover = [];
    page.on('request', (r) => { if (r.url().startsWith(SB + '/auth/v1/recover') && r.method() === 'POST') recover.push({ url: r.url(), body: r.postData() }); });
    await page.goto(BASE + '/dashboard/login');
    await H.settled(page, 'login');
    await page.click('#apForgot');
    await page.waitForTimeout(300);
    check('Forgot your password? with no email asks for it and sends nothing', recover.length === 0, recover.length + ' sent');
    await page.fill('#apEmail', 'Pat.QA@aiparagonconsulting.com ');
    await page.click('#apForgot');
    await page.waitForFunction(() => /reset link is on its way/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {});
    check('one reset request goes to Supabase', recover.length === 1, recover.length + ' sent');
    const u = recover[0] ? new URL(recover[0].url) : null;
    check('it asks for a link back to the new dashboard\'s Set a new password page', u && u.searchParams.get('redirect_to') === RESET, u ? u.search : 'none');
    let body = {}; try { body = JSON.parse((recover[0] || {}).body || '{}'); } catch (e) {}
    check('the email goes trimmed and in lower case, as before', body.email === 'pat.qa@aiparagonconsulting.com', JSON.stringify(body));
    check('it says a link is on its way, as before', /If that address has an account, a reset link is on its way\./.test(await page.innerText('#view-login')));
    await ctx.close();
  }

  // 2. a reset link that lands here goes on to the reset page, with its tokens
  for (const at of ['/dashboard', '/dashboard/today', '/new-aiparagon-dashboard.html']) {
    const { ctx, page } = await H.newPage(browser, BASE, { bucket: errors });
    const seen = [];
    await withResetPage(ctx, seen);
    const hash = '#access_token=aaa.bbb.ccc&expires_at=1900000000&expires_in=3600&refresh_token=rrr123&token_type=bearer&type=recovery';
    await page.goto(BASE + at + hash);
    await page.waitForURL(/aiparagon-dashboard\.vercel\.app/, { timeout: 8000 }).catch(() => {});
    check('a reset link opened at ' + at + ' goes on to the reset page', page.url() === RESET + hash, page.url().slice(0, 120));
    check('  and it shows that page', (await page.title()) === 'Set a new password');
    await ctx.close();
  }

  // 3. nothing else goes there: a page address, a signed-in visit, another kind of link
  for (const [label, at, seed] of [
    ['a page address (#/approvals in a local copy)', '/copy/new-aiparagon-dashboard.html#/approvals', true],
    ['a signed-in visit', '/dashboard/today', true],
    ['an email confirmation link (type=signup)', '/dashboard#access_token=aaa.bbb.ccc&refresh_token=rrr&type=signup', false],
    ['a hash that only mentions recovery', '/dashboard#type=recovery', false],
  ]) {
    const { ctx, page } = await H.newPage(browser, BASE, { seed, bucket: errors });
    const seen = [];
    await withResetPage(ctx, seen);
    await page.goto(BASE + at);
    await page.waitForTimeout(1200);
    check(label + ' stays on the dashboard', seen.length === 0 && page.url().startsWith(BASE), page.url().slice(0, 120));
    await ctx.close();
  }

  // 4. signing in still works, and nothing broke on the way
  {
    const { ctx, page } = await H.newPage(browser, BASE, { bucket: errors });
    await page.goto(BASE + '/dashboard/login');
    await H.settled(page, 'login');
    await H.signIn(page);
    check('signing in still opens the dashboard', await page.evaluate(() => !document.getElementById('view-app').classList.contains('hidden')));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
