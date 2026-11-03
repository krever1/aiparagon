// v131 tests for new-aiparagon-dashboard.html (#1) and go.html: Fathom Analytics (usefathom.com, not the Fathom call
// recorder). The dashboard counts one page view per page shown, as its address without a query or #anchor, on the
// live site only; the landing pages load Fathom on a site of their own and record each sign-up as an event. The pages
// are served as https://aiparagon.vercel.app (and a preview host) from the local copy, and Fathom's script is a stub
// that records what it is asked to send, so nothing reaches Fathom, Supabase or n8n.
// Usage: node tests/dashboard-v131.test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const H = require('./lib/dashboard-harness');

const ROOT = path.resolve(__dirname, '..');
const LIVE = 'https://aiparagon.vercel.app';
const PREVIEW = 'https://aiparagon-git-qa-kaesers-projects.vercel.app';
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const N8N = 'https://n8n.aiparagonconsulting.com/webhook/';
const SITE = 'HXYHZOYN';
const GO_TEST = 'TESTGO01';
// what the stub records: the script tag's settings, then every page view and event the page sends
const STUB = "(function(){var me=document.currentScript;window.__fx={site:me&&me.getAttribute('data-site'),auto:me&&me.getAttribute('data-auto'),defer:!!(me&&me.defer),calls:[]};" +
  "window.fathom={trackPageview:function(o){window.__fx.calls.push({pv:(o&&o.url)||location.href,ref:o?o.referrer:undefined});},trackEvent:function(n,o){window.__fx.calls.push({ev:n,opts:o||null});}};})();";
// the page lp_public returns for /go/spring-webinar (made up)
const GO_PAGE = { slug: 'spring-webinar', title: 'Spring webinar', kind: 'webinar', brand: { name: 'AI Paragon', website: 'https://www.aiparagonconsulting.com/' },
  content: { headline: 'Governed AI for RIAs', subheadline: 'A 45 minute session.', when: 'Thu 6 Nov, 11am PT', cta: 'Save my seat', fields: ['name', 'email', 'company'],
    thanks: { headline: 'You are registered', body: 'Check your inbox.' } } };
const GO_SITE = (fs.readFileSync(path.join(ROOT, 'go.html'), 'utf8').match(/var FATHOM_SITE='([^']*)';/) || [])[1];

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];
  const local = (p) => new Promise((res, rej) => http.get(BASE + p, (r) => { const b = []; r.on('data', (c) => b.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b) })); }).on('error', rej));

  // o: seed, prefs, block (Fathom's script fails to load), goSite (the landing pages' site ID served in go.html),
  //    page (what lp_public answers), reply (what the sign-up workflow answers), draft (a draft for a preview)
  async function open(url, o) {
    o = o || {};
    const calls = { hook: [], rpc: [] };
    const hook = (u, m, b) => { calls.hook.push({ p: u.slice(N8N.length), b: J(b || '') }); return o.reply || { body: { ok: true } }; };
    const store = { handle: (m, p) => (m === 'GET' ? { status: 200, body: /landing_pages/.test(p) && o.draft ? [o.draft] : [] } : { status: 204 }) };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: !!o.seed, prefs: o.prefs, rest: store, hooks: hook, bucket: errors });
    const fx = { loads: 0 };
    await ctx.route(/^https:\/\/cdn\.usefathom\.com\//, (route) => { fx.loads++; if (o.block) return route.abort(); return route.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }); });
    for (const host of [LIVE, PREVIEW]) {
      await ctx.route(host + '/**', async (route) => {
        const u = new URL(route.request().url());
        const r = await local(u.pathname + u.search);
        let body = r.body;
        if (o.goSite !== undefined && /^\/go(\/|\.html|$)/.test(u.pathname)) body = Buffer.from(String(body).replace(/var FATHOM_SITE='[^']*';/, "var FATHOM_SITE='" + o.goSite + "';"));
        const headers = { 'content-type': r.headers['content-type'] || 'text/html; charset=utf-8' };
        if (r.headers.location) headers.location = r.headers.location;
        return route.fulfill({ status: r.status, headers, body });
      });
    }
    await page.route(SB + '/rest/v1/rpc/lp_public', (route) => {
      calls.rpc.push(J(route.request().postData() || ''));
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o.page === undefined ? GO_PAGE : o.page) });
    });
    await page.goto(url, { waitUntil: 'load' });
    return { ctx, page, fx, calls };
  }
  const fxOf = (page) => page.evaluate(() => window.__fx || null);
  const views = async (page) => ((await fxOf(page)) || { calls: [] }).calls.filter((c) => c.pv).map((c) => c.pv.replace(/^https:\/\/aiparagon\.vercel\.app/, ''));
  const go = (page, v) => page.evaluate((v) => apGo(v), v);

  // 1. signed in on the live site: the script once, with the site and its own page view off; then one view per page
  {
    const { ctx, page, fx } = await open(LIVE + '/dashboard/today', { seed: true });
    await H.settled(page, 'app'); await page.waitForTimeout(1800);
    const f = await fxOf(page);
    check('live site: Fathom loads once, on the dashboard\'s site, deferred', fx.loads === 1 && f && f.site === SITE && f.defer === true, JSON.stringify({ loads: fx.loads, f: f && { site: f.site, defer: f.defer } }));
    check('the script\'s own page view is off (data-auto false); the dashboard sends them', f && f.auto === 'false', f && f.auto);
    check('the page shown counts once, as its address', JSON.stringify(f && f.calls) === JSON.stringify([{ pv: LIVE + '/dashboard/today', ref: '' }]), JSON.stringify(f && f.calls));
    await go(page, 'e1pipeline'); await page.waitForTimeout(1300);
    await go(page, 'calls'); await page.waitForTimeout(1300);
    const f2 = await fxOf(page);
    check('each page change counts, with the page before it as the referrer', JSON.stringify(f2.calls.slice(1)) === JSON.stringify([
      { pv: LIVE + '/dashboard/lead-pipeline', ref: LIVE + '/dashboard/today' }, { pv: LIVE + '/dashboard/calls', ref: LIVE + '/dashboard/lead-pipeline' }]), JSON.stringify(f2.calls));
    await page.goBack(); await page.waitForTimeout(1300);
    check('Back counts the page it goes back to', (await views(page)).slice(-1)[0] === '/dashboard/lead-pipeline' && page.url() === LIVE + '/dashboard/lead-pipeline', JSON.stringify(await views(page)));
    const n = (await views(page)).length;
    await go(page, 'e1pipeline'); await page.waitForTimeout(1300);
    check('opening the page already shown adds nothing', (await views(page)).length === n, JSON.stringify(await views(page)));
    await go(page, 'files'); await page.waitForTimeout(150); await go(page, 'templates'); await page.waitForTimeout(1300);
    const v = await views(page);
    check('a page left within a moment is not counted, the one that holds is', v.slice(-1)[0] === '/dashboard/templates' && v.indexOf('/dashboard/files') < 0, JSON.stringify(v));
    await page.evaluate(() => apSignOut()); await H.settled(page, 'login'); await page.waitForTimeout(1300);
    check('signing out counts the sign-in screen', (await views(page)).slice(-1)[0] === '/dashboard/login' && new URL(page.url()).pathname === '/dashboard/login', JSON.stringify(await views(page)));
    await ctx.close();
  }

  // 2. what an address counts as
  {
    const { ctx, page } = await open(LIVE + '/dashboard/calls?from=mail#top', { seed: true });
    await H.settled(page, 'app'); await page.waitForTimeout(1800);
    check('an address with a query and an #anchor counts as the page alone', JSON.stringify(await views(page)) === JSON.stringify(['/dashboard/calls']), JSON.stringify(await views(page)));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(LIVE + '/dashboard', { seed: true });
    await H.settled(page, 'app'); await page.waitForTimeout(1800);
    const v = await views(page);
    check('a bare /dashboard counts the page it opens, not itself', v.length === 1 && v[0] === '/dashboard/today' && new URL(page.url()).pathname === '/dashboard/today', JSON.stringify(v));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(LIVE + '/dashboard/pipeline', { seed: true });
    await H.settled(page, 'app'); await page.waitForTimeout(1800);
    check('a product name settles into its page and only that page counts', JSON.stringify(await views(page)) === JSON.stringify(['/dashboard/engine-3']), JSON.stringify(await views(page)));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(LIVE + '/dashboard/calls', {});
    await H.settled(page, 'login'); await page.waitForTimeout(1800);
    check('signed out: the sign-in screen counts, not the page asked for', JSON.stringify(await views(page)) === JSON.stringify(['/dashboard/login']), JSON.stringify(await views(page)));
    await H.signIn(page); await page.waitForTimeout(1800);
    const f = await fxOf(page);
    check('after sign-in the page asked for counts, with the sign-in screen as its referrer', JSON.stringify(f.calls) === JSON.stringify([{ pv: LIVE + '/dashboard/login', ref: '' }, { pv: LIVE + '/dashboard/calls', ref: LIVE + '/dashboard/login' }]), JSON.stringify(f.calls));
    await ctx.close();
  }

  // 3. nowhere else
  for (const [label, url] of [['a local copy', BASE + '/dashboard/today'], ['a preview deployment', PREVIEW + '/dashboard/today']]) {
    const { ctx, page, fx } = await open(url, { seed: true });
    await H.settled(page, 'app'); await go(page, 'calls'); await page.waitForTimeout(1500);
    check(label + ': no Fathom at all', fx.loads === 0 && (await page.evaluate(() => typeof window.fathom)) === 'undefined', String(fx.loads));
    await ctx.close();
  }
  {
    const { ctx, page, fx } = await open(LIVE + '/frame.html', { seed: true });
    await page.waitForTimeout(5000);
    const inFrame = await page.frames()[1].evaluate(() => ({ app: !!document.getElementById('view-app'), v: typeof window.V131 })).catch(() => null);
    check('inside a frame: no Fathom (the dashboard did load there)', fx.loads === 0 && inFrame && inFrame.app && inFrame.v === 'object', JSON.stringify({ loads: fx.loads, inFrame }));
    await ctx.close();
  }
  {
    const before = errors.length;
    const { ctx, page, fx } = await open(LIVE + '/dashboard/today', { seed: true, block: true });
    await H.settled(page, 'app'); await go(page, 'e1pipeline'); await page.waitForTimeout(1500);
    check('a blocked script (an ad blocker): the dashboard works and sends nothing', fx.loads === 1 && new URL(page.url()).pathname === '/dashboard/lead-pipeline' &&
      (await page.evaluate(() => typeof window.fathom)) === 'undefined' && (await page.evaluate(() => window.V131.ready)) === false && errors.length === before, JSON.stringify({ loads: fx.loads, errs: errors.slice(before) }));
    await ctx.close();
  }

  // 4. the landing pages
  check('go.html carries a landing page site ID of its own, or none yet', GO_SITE !== undefined && GO_SITE !== SITE, String(GO_SITE));
  {
    const { ctx, page, fx } = await open(LIVE + '/go/spring-webinar', {});
    await page.waitForSelector('.lp-f', { timeout: 8000 }); await page.waitForTimeout(800);
    if (GO_SITE) check('as shipped: a live page loads Fathom on the landing pages\' site (' + GO_SITE + ')', fx.loads === 1 && ((await fxOf(page)) || {}).site === GO_SITE, String(fx.loads));
    else check('as shipped, with no landing page site ID yet: a live page loads no Fathom', fx.loads === 0, String(fx.loads));
    await ctx.close();
  }
  {
    const { ctx, page, fx, calls } = await open(LIVE + '/go/spring-webinar?utm_source=meta&utm_medium=paid&utm_campaign=spring-webinar&utm_content=PK7Q2-A1', { goSite: GO_TEST });
    await page.waitForSelector('.lp-f', { timeout: 8000 }); await page.waitForTimeout(800);
    const f = await fxOf(page);
    check('a live page loads Fathom once, on its own site, deferred, with Fathom\'s own page view on', fx.loads === 1 && f && f.site === GO_TEST && f.defer === true && f.auto === null, JSON.stringify({ loads: fx.loads, f }));
    check('the page still counts its visit in Supabase as before', calls.rpc.length === 1 && calls.rpc[0].p_view === true && calls.rpc[0].p_code === 'PK7Q2-A1', JSON.stringify(calls.rpc));
    await page.fill('#lp-name', 'Pat Example'); await page.fill('#lp-email', 'pat@example.com');
    await page.click('.lp-f button[type=submit]'); await page.waitForTimeout(300);
    check('a form that is not filled in records no sign-up', !((await fxOf(page)).calls.some((c) => c.ev)), JSON.stringify((await fxOf(page)).calls));
    await page.fill('#lp-company', 'Example Firm'); await page.waitForTimeout(2100);
    await page.click('.lp-f button[type=submit]'); await page.waitForTimeout(800);
    const ev = (await fxOf(page)).calls.filter((c) => c.ev);
    check('a sign-up that goes through is recorded once, as the page\'s own event', calls.hook.length === 1 && JSON.stringify(ev) === JSON.stringify([{ ev: 'Sign up: spring-webinar', opts: null }]) && !!(await page.$('.lp-done')), JSON.stringify(ev));
    await ctx.close();
  }
  {
    const { ctx, page, calls } = await open(LIVE + '/go/spring-webinar', { goSite: GO_TEST, reply: { status: 429, body: { ok: false, message: 'Too many sign-ups from here. Try again in an hour.' } } });
    await page.waitForSelector('.lp-f', { timeout: 8000 });
    await page.fill('#lp-name', 'Pat Example'); await page.fill('#lp-email', 'pat@example.com'); await page.fill('#lp-company', 'Example Firm');
    await page.waitForTimeout(2100); await page.click('.lp-f button[type=submit]'); await page.waitForTimeout(800);
    check('a sign-up the workflow turns down records nothing', calls.hook.length === 1 && !((await fxOf(page)).calls.some((c) => c.ev)) && !(await page.$('.lp-done')), JSON.stringify((await fxOf(page)).calls));
    await ctx.close();
  }
  for (const [label, url, o] of [
    ['a preview from the dashboard', LIVE + '/go/draft-page?preview=1', { seed: true, draft: { slug: 'draft-page', title: 'Draft', kind: 'landing', status: 'draft', content: { headline: 'A draft page', fields: ['name', 'email'] } } }],
    ['a page that is not live', LIVE + '/go/nope-nope', { page: null }],
    ['a local copy', BASE + '/go/spring-webinar', {}],
    ['a preview deployment', PREVIEW + '/go/spring-webinar', {}]]) {
    const { ctx, page, fx } = await open(url, Object.assign({ goSite: GO_TEST }, o));
    await page.waitForTimeout(1800);
    const shown = await page.evaluate(() => ({ form: !!document.querySelector('.lp-f'), gone: !!document.querySelector('.lp-gone') }));
    check('landing page, ' + label + ': no Fathom', fx.loads === 0 && (shown.form || shown.gone), JSON.stringify({ loads: fx.loads, shown }));
    await ctx.close();
  }
  {
    const before = errors.length;
    const { ctx, page, calls } = await open(LIVE + '/go/spring-webinar', { goSite: GO_TEST, block: true });
    await page.waitForSelector('.lp-f', { timeout: 8000 });
    await page.fill('#lp-name', 'Pat Example'); await page.fill('#lp-email', 'pat@example.com'); await page.fill('#lp-company', 'Example Firm');
    await page.waitForTimeout(2100); await page.click('.lp-f button[type=submit]'); await page.waitForTimeout(800);
    check('landing page with the script blocked: the sign-up still goes through', calls.hook.length === 1 && !!(await page.$('.lp-done')) && errors.length === before, JSON.stringify(errors.slice(before)));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
