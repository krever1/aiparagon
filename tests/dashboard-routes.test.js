// Routing tests for new-aiparagon-dashboard.html (#1 internal dashboard): /dashboard/<page> paths (Vercel),
// #/<page> elsewhere, /dashboard/login and the saved-workspace resume, Back/Forward, engine switching,
// leads, popups, sign-out, odd input, frames and the old-address forward. Given an earlier copy of the
// file it also checks every view reads the same as that copy. Supabase answers from stubs
// (tests/lib/dashboard-harness.js). See tests/README.md.
// Usage: node tests/dashboard-routes.test.js [baseline.html]
const path = require('path');
const H = require('./lib/dashboard-harness');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = process.argv[2] ? path.resolve(process.argv[2]) : null;   // an earlier copy of the file, for the page-by-page comparison
const FILE = H.FILE;
const SLUG = {
  e3overview: 'engine-3', e3intel: 'intel-tracker', e3ads: 'ad-strategist', e3briefs: 'briefs',
  e3create: 'content-transformation', e3funnel: 'marketing-generation', e3testing: 'ad-testing',
  approvals: 'approvals', e3history: 'runs',
  e1overview: 'engine-1', e1pipeline: 'lead-pipeline', calls: 'calls', tasks: 'tasks',
  e3client: 'company-profile', integrations: 'integrations', kb: 'knowledge-base', files: 'files',
  templates: 'templates', learning: 'ai-settings', audit: 'audit-log', profile: 'account', hubspot: 'hubspot', notion: 'notion',
};
const A = (v) => '/dashboard/' + SLUG[v];
const E3_SIDE = ['e3overview', 'e3intel', 'e3ads', 'e3briefs', 'e3create', 'e3funnel', 'e3testing', 'approvals', 'e3history'];
const E1_SIDE = ['e1overview', 'e1pipeline', 'calls', 'tasks', 'approvals'];
const SETTINGS = ['e3client', 'integrations', 'kb', 'files', 'templates', 'learning', 'audit'];
const MENU = [['profile', 'Your account'], ['e3client', 'Company profile'], ['learning', 'AI settings']];

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

(async () => {
  const server = H.makeServer(ROOT, BASELINE, '/dashboard/briefs');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = { patched: [], original: [] };

  async function open(url, opts) {
    opts = Object.assign({ seed: true }, opts || {});
    opts.bucket = opts.original ? errors.original : errors.patched;
    const { ctx, page } = await H.newPage(browser, BASE, opts);
    await page.goto(url, { waitUntil: 'load' });
    const len0 = await page.evaluate(() => history.length);
    if (opts.wait !== false) await H.settled(page, opts.seed ? 'app' : 'login');
    return { ctx, page, len0 };
  }
  async function state(page) {
    return page.evaluate(() => ({
      path: location.pathname, hash: location.hash, search: location.search,
      cur: (function () { try { return apCurrentView(); } catch (e) { return null; } })(),
      page: S.page, eng: V107.eng,
      side: [...document.querySelectorAll('#nwNav .nw-item[aria-current="page"]')].map((b) => b.dataset.view),
      app: !document.getElementById('view-app').classList.contains('hidden'),
      login: !document.getElementById('view-login').classList.contains('hidden'),
      pm: !!document.querySelector('#profileMenu.open'), engMenu: !!document.getElementById('nwMenu'),
      len: history.length,
    }));
  }
  const HL = { hubspot: 'integrations', notion: 'integrations' };
  const shows = (s, v) => s.app && s.cur === v &&
    (!(E3_SIDE.includes(v) || E1_SIDE.includes(v) || SETTINGS.includes(v) || HL[v]) || (s.side.length === 1 && s.side[0] === (HL[v] || v)));
  const settle = (page) => page.waitForTimeout(250);
  async function side(page, v) { await page.click('#nwNav .nw-item[data-view="' + v + '"]'); await settle(page); }
  async function setting(page, v) {
    if (!(await page.$('#nwNav .nw-sub'))) await page.click('#nwNav .nw-parent');
    await page.click('#nwNav .nw-sub .nw-item[data-view="' + v + '"]'); await settle(page);
  }
  async function menu(page, label) {
    await page.click('#sbFoot .sb-user'); await page.waitForTimeout(100);
    await page.click('#profileMenu .pm-item:has-text("' + label + '")'); await settle(page);
  }
  async function engine(page, k) { await page.click('#nwEng'); await page.click('#nwMenu [onclick="nwEngPick(\'' + k + '\')"]'); await settle(page); }

  // 1. bare /dashboard resumes as before (nothing saved: Engine 3 Overview) and settles the address in place
  {
    const { ctx, page, len0 } = await open(BASE + '/dashboard');
    const s = await state(page);
    check('bare /dashboard, nothing saved -> Engine 3 Overview at /dashboard/engine-3, no entry added', shows(s, 'e3overview') && s.path === '/dashboard/engine-3' && s.len === len0, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard', { prefs: { view: 'e3ads', e60: { engine: 'e3', view: 'ads' } } });
    const s = await state(page);
    check('bare /dashboard resumes the saved page (Ad Strategist) at /dashboard/ad-strategist', shows(s, 'e3ads') && s.path === '/dashboard/ad-strategist', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard', { prefs: { view: 'e1pipeline', e60: { engine: 'e1', view: 'e1pipeline' } } });
    const s = await state(page);
    check('bare /dashboard resumes an Engine 1 page with its sidebar', shows(s, 'e1pipeline') && s.eng === 'e1' && s.path === '/dashboard/lead-pipeline', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard/briefs', { prefs: 'none' });
    await page.waitForTimeout(900);
    let s = await state(page);
    const welcome = await page.evaluate(() => { const m = document.getElementById('apWelcome'); return !!m && m.style.display === 'flex'; });
    check('new account: welcome shows over the linked page (Briefs)', welcome && shows(s, 'e3briefs') && s.path === '/dashboard/briefs', JSON.stringify(s));
    await page.click('#apWelcome button:has-text("Get started")'); await settle(page);
    s = await state(page);
    check('new account: closing the welcome leaves Briefs and its address', shows(s, 'e3briefs') && s.path === '/dashboard/briefs', JSON.stringify(s));
    await ctx.close();
  }
  // 2. a page in the address wins over the saved page
  {
    const { ctx, page, len0 } = await open(BASE + '/dashboard/intel-tracker', { prefs: { view: 'e3ads', e60: { engine: 'e3', view: 'ads' } } });
    const s = await state(page);
    check('/dashboard/intel-tracker beats the saved Ad Strategist, no entry added', shows(s, 'e3intel') && s.path === '/dashboard/intel-tracker' && s.len === len0, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard/calls', { prefs: { view: 'e3ads', e60: { engine: 'e3', view: 'ads' } } });
    const s = await state(page);
    check('/dashboard/calls switches the sidebar to Engine 1', shows(s, 'calls') && s.eng === 'e1' && s.path === '/dashboard/calls', JSON.stringify(s));
    await ctx.close();
  }
  // 3. every sidebar row, settings row and account-menu item writes its address
  {
    const { ctx, page } = await open(BASE + '/dashboard');
    for (const v of E3_SIDE.slice(1).concat(['e3overview'])) {
      await side(page, v);
      const s = await state(page);
      check('Engine 3 sidebar ' + v + ' -> ' + A(v), shows(s, v) && s.path === A(v), JSON.stringify(s));
    }
    await engine(page, 'e1');
    let s = await state(page);
    check('engine menu: Engine 1 -> /dashboard/engine-1', shows(s, 'e1overview') && s.eng === 'e1' && s.path === '/dashboard/engine-1', JSON.stringify(s));
    for (const v of E1_SIDE.slice(1)) {
      await side(page, v);
      s = await state(page);
      check('Engine 1 sidebar ' + v + ' -> ' + A(v), shows(s, v) && s.path === A(v), JSON.stringify(s));
    }
    for (const v of SETTINGS) {
      await setting(page, v);
      s = await state(page);
      check('settings ' + v + ' -> ' + A(v), shows(s, v) && s.path === A(v), JSON.stringify(s));
    }
    for (const [v, label] of MENU) {
      await menu(page, label);
      s = await state(page);
      check('account menu "' + label + '" -> ' + A(v), s.app && s.cur === v && s.path === A(v), JSON.stringify(s));
    }
    await ctx.close();
  }
  // 4. every address opens its page (deep link)
  for (const v of Object.keys(SLUG)) {
    const { ctx, page, len0 } = await open(BASE + A(v));
    const s = await state(page);
    check('deep link ' + A(v) + ' opens ' + v, (shows(s, v) || (s.app && s.cur === v)) && s.path === A(v) && s.len === len0, JSON.stringify(s));
    await ctx.close();
  }
  // 5. odd input
  const odd = [
    ['/dashboard/', 'e3overview', '/dashboard/engine-3'], ['/dashboard/nope', 'e3overview', '/dashboard/engine-3'],
    ['/dashboard/INTEL-Tracker/', 'e3intel', '/dashboard/intel-tracker'], ['/dashboard/kb', 'kb', '/dashboard/knowledge-base'],
    ['/dashboard/e3funnel', 'e3funnel', '/dashboard/marketing-generation'], ['/dashboard/overview', 'e3overview', '/dashboard/engine-3'],
    ['/dashboard/home', 'e3overview', '/dashboard/engine-3'], ['/dashboard/e1lead', 'e3overview', '/dashboard/engine-3'],
    ['/dashboard/lead-pipeline/abc/def', 'e1pipeline', '/dashboard/lead-pipeline'], ['/dashboard/%E0%A4%A', 'e3overview', '/dashboard/engine-3'],
    ['/dashboard/%3Cscript%3E', 'e3overview', '/dashboard/engine-3'], ['/dashboard/constructor', 'e3overview', '/dashboard/engine-3'],
    ['/dashboard/__proto__', 'e3overview', '/dashboard/engine-3'], ['/dashboard/toString', 'e3overview', '/dashboard/engine-3'],
  ];
  for (const [url, v, want] of odd) {
    const { ctx, page } = await open(BASE + url);
    const s = await state(page);
    check('odd address ' + url + ' -> ' + v + ' at ' + want, s.app && s.cur === v && s.path === want, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard/overview', { prefs: { view: 'e1pipeline', e60: { engine: 'e1', view: 'e1pipeline' } } });
    const s = await state(page);
    check('/dashboard/overview opens the Overview of the engine you are in (Engine 1)', shows(s, 'e1overview') && s.path === '/dashboard/engine-1', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard/briefs?x=1');
    await side(page, 'e3intel');
    const s = await state(page);
    check('query string survives a page change', shows(s, 'e3intel') && s.path === '/dashboard/intel-tracker' && s.search === '?x=1', JSON.stringify(s));
    await ctx.close();
  }
  // 6. Back / Forward / reload / same page
  {
    const { ctx, page } = await open(BASE + '/dashboard');
    await side(page, 'e3intel'); await side(page, 'e3ads');
    await page.goBack(); await settle(page);
    let s = await state(page);
    check('Back -> Intel Tracker', shows(s, 'e3intel') && s.path === '/dashboard/intel-tracker', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back again -> Engine 3 Overview', shows(s, 'e3overview') && s.path === '/dashboard/engine-3', JSON.stringify(s));
    await page.goForward(); await settle(page);
    s = await state(page);
    check('Forward -> Intel Tracker', shows(s, 'e3intel') && s.path === '/dashboard/intel-tracker', JSON.stringify(s));
    await side(page, 'e3history');
    await page.reload({ waitUntil: 'load' }); await H.settled(page, 'app');
    s = await state(page);
    check('reload keeps the page (Runs & uploads)', shows(s, 'e3history') && s.path === '/dashboard/runs', JSON.stringify(s));
    const len0 = s.len;
    await side(page, 'e3history');
    s = await state(page);
    check('clicking the page you are on adds no history entry', s.len === len0, len0 + ' vs ' + s.len);
    await engine(page, 'e1');
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back across an engine switch restores Engine 3 and its sidebar', shows(s, 'e3history') && s.eng === 'e3' && s.path === '/dashboard/runs', JSON.stringify(s));
    await ctx.close();
  }
  // 7. pages that move on their own keep the address in step; a lead keeps the Lead pipeline address
  {
    const { ctx, page } = await open(BASE + '/dashboard/engine-1');
    await page.evaluate(() => { state.view = 'e1pipeline'; render(); }); await settle(page);   // what the Overview's own links do
    let s = await state(page);
    check("an engine's own page switch (render) moves the address", s.cur === 'e1pipeline' && s.path === '/dashboard/lead-pipeline', JSON.stringify(s));
    const len0 = s.len;
    await page.evaluate(() => apOpenLead60('lead@example.com')); await settle(page);
    s = await state(page);
    check('opening a lead keeps /dashboard/lead-pipeline and adds no entry', s.cur === 'e1pipeline' && s.path === '/dashboard/lead-pipeline' && s.len === len0, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard/engine-3');
    const link = page.locator('#main [onclick*="apGo(\'e3intel\')"]').first();
    if (await link.count()) {
      await link.click(); await settle(page);
      const s = await state(page);
      check('a link inside the Overview -> /dashboard/intel-tracker', shows(s, 'e3intel') && s.path === '/dashboard/intel-tracker', JSON.stringify(s));
    } else check('a link to the Intel Tracker exists on the Overview', false, 'none found');
    await ctx.close();
  }
  // 8. Back closes open menus
  {
    const { ctx, page } = await open(BASE + '/dashboard');
    await side(page, 'e3briefs');
    await page.click('#sbFoot .sb-user'); await page.waitForTimeout(100);
    let s = await state(page);
    const wasOpen = s.pm;
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back closes the account menu and shows the Overview', wasOpen && !s.pm && shows(s, 'e3overview') && s.path === '/dashboard/engine-3', JSON.stringify(s));
    await page.goForward(); await settle(page);
    await page.click('#nwEng'); await page.waitForTimeout(100);
    s = await state(page);
    const engOpen = s.engMenu;
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back closes the engine menu', engOpen && !s.engMenu && shows(s, 'e3overview'), JSON.stringify(s));
    await ctx.close();
  }
  // 9. adversarial: rapid clicks, then a burst of Back presses
  {
    const { ctx, page } = await open(BASE + '/dashboard');
    for (const v of ['e3intel', 'e3ads', 'e3briefs', 'e3create', 'e3funnel', 'e3testing', 'approvals', 'e3history', 'e3overview', 'e3intel', 'e3ads'])
      await page.click('#nwNav .nw-item[data-view="' + v + '"]');
    await settle(page);
    let s = await state(page);
    check('rapid clicks end on the last page clicked', shows(s, 'e3ads') && s.path === '/dashboard/ad-strategist', JSON.stringify(s));
    await page.evaluate(() => { for (let i = 0; i < 5; i++) history.back(); });
    await page.waitForTimeout(900);
    s = await state(page);
    const want = Object.keys(SLUG).find((v) => A(v) === s.path);
    check('after 5 quick Backs the page matches the address', !!want && s.cur === want, JSON.stringify(s));
    await ctx.close();
  }
  // 10. the sign-in screen lives at /dashboard/login; a page asked for opens after sign-in, otherwise the resume
  const SAVED_ADS = { view: 'e3ads', e60: { engine: 'e3', view: 'ads' } }, SAVED_BRIEFS = { view: 'e3briefs', e60: { engine: 'e3', view: 'briefs' } };
  {
    const { ctx, page, len0 } = await open(BASE + '/dashboard/ad-testing', { seed: false, prefs: SAVED_ADS });
    let s = await state(page);
    check('signed out: /dashboard/ad-testing shows the sign-in screen at /dashboard/login, no entry added', s.login && s.path === '/dashboard/login' && s.len === len0, JSON.stringify(s));
    await page.click('#apTabUp'); await page.waitForTimeout(100);
    s = await state(page);
    check('the Create account tab keeps /dashboard/login', s.login && s.path === '/dashboard/login', JSON.stringify(s));
    await page.click('#apTabIn'); await page.waitForTimeout(100);
    await H.signIn(page, 'wrong-password');
    s = await state(page);
    const err = await page.evaluate(() => (document.getElementById('apAuthErr') || {}).innerText || '');
    check('a refused password stays on /dashboard/login with the error', s.login && s.path === '/dashboard/login' && /not right/i.test(err), JSON.stringify(s) + ' err=' + err);
    await H.signIn(page);
    s = await state(page);
    check('signing in opens the page asked for (Ad Testing), no entry added', shows(s, 'e3testing') && s.path === '/dashboard/ad-testing' && s.len === len0, JSON.stringify(s));
    await side(page, 'e3intel');
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back after sign-in goes to Ad Testing, not the sign-in screen', shows(s, 'e3testing') && s.path === '/dashboard/ad-testing', JSON.stringify(s));
    // 11. signing out goes to /dashboard/login, and the next sign-in resumes the account's own page
    await page.click('#sbFoot .sb-user'); await page.waitForTimeout(100);
    await Promise.all([page.waitForEvent('load'), page.click('#profileMenu .pm-item:has-text("Sign out")')]);
    await H.settled(page, 'login');
    s = await state(page);
    check('sign out lands on the sign-in screen at /dashboard/login', s.login && s.path === '/dashboard/login', JSON.stringify(s));
    await H.signIn(page);
    s = await state(page);
    check('signing back in resumes the saved page (Ad Strategist)', shows(s, 'e3ads') && s.path === '/dashboard/ad-strategist', JSON.stringify(s));
    await ctx.close();
  }
  for (const url of ['/dashboard', '/dashboard/login', '/dashboard/LOGIN/', '/dashboard/nope', '/' + FILE]) {
    const { ctx, page } = await open(BASE + url, { seed: false, prefs: SAVED_BRIEFS });
    let s = await state(page);
    const atLogin = s.login && s.path === '/dashboard/login' && s.hash === '';
    await H.signIn(page);
    s = await state(page);
    check('signed out: ' + url + ' -> /dashboard/login, then signing in resumes Briefs', atLogin && shows(s, 'e3briefs') && s.path === '/dashboard/briefs', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/' + FILE + '#/calls', { seed: false, prefs: SAVED_BRIEFS });
    let s = await state(page);
    const atLogin = s.login && s.path === '/dashboard/login' && s.hash === '';
    await H.signIn(page);
    s = await state(page);
    check('signed out: old address with #/calls -> /dashboard/login, then Calls', atLogin && shows(s, 'calls') && s.path === '/dashboard/calls', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard/login', { prefs: SAVED_BRIEFS });
    const s = await state(page);
    check('already signed in: /dashboard/login resumes Briefs at /dashboard/briefs', shows(s, 'e3briefs') && s.path === '/dashboard/briefs', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard/login#/calls', { seed: false, prefs: SAVED_BRIEFS });
    let s = await state(page);
    const atLogin = s.login && s.path === '/dashboard/login' && s.hash === '';
    await H.signIn(page);
    s = await state(page);
    check('/dashboard/login#/calls: sign-in screen, then Calls', atLogin && shows(s, 'calls') && s.path === '/dashboard/calls', JSON.stringify(s));
    await ctx.close();
  }
  {
    // the session ends while working: "Sign in" reloads the page you were on
    const { ctx, page } = await open(BASE + '/dashboard/intel-tracker', { prefs: SAVED_ADS });
    await page.evaluate(() => localStorage.removeItem('ap.session.v1'));
    await page.reload({ waitUntil: 'load' }); await H.settled(page, 'login');
    let s = await state(page);
    check('session ended + reload: sign-in screen at /dashboard/login', s.login && s.path === '/dashboard/login', JSON.stringify(s));
    await H.signIn(page);
    s = await state(page);
    check('then signing in returns to the Intel Tracker', shows(s, 'e3intel') && s.path === '/dashboard/intel-tracker', JSON.stringify(s));
    await ctx.close();
  }
  {
    // on the sign-in screen, an edited address only changes which page opens after sign-in
    const { ctx, page } = await open(BASE + '/dashboard/briefs', { seed: false, prefs: SAVED_ADS });
    await page.evaluate(() => { location.hash = '#/calls'; }); await settle(page);
    let s = await state(page);
    check('editing the hash on the sign-in screen keeps /dashboard/login', s.login && s.path === '/dashboard/login', JSON.stringify(s));
    await H.signIn(page);
    s = await state(page);
    check('and the page asked for (Briefs) still opens', shows(s, 'e3briefs') && s.path === '/dashboard/briefs', JSON.stringify(s));
    await ctx.close();
  }
  // 12. the old address forwards to /dashboard; a #/<page> carried through the forward opens that page
  for (const [suffix, v, wantHash, prefs] of [
    ['', 'e3ads', '', { view: 'e3ads', e60: { engine: 'e3', view: 'ads' } }],
    ['', 'e3overview', '', null],
    ['#/briefs', 'e3briefs', '', { view: 'e3ads', e60: { engine: 'e3', view: 'ads' } }],
    ['#/nope', 'e3overview', '', null],
    ['#section-2', 'e3overview', '#section-2', null],
  ]) {
    const { ctx, page } = await open(BASE + '/' + FILE + suffix, { prefs });
    const s = await state(page);
    check('old address ' + (suffix || '(plain)') + (prefs ? ' (saved ' + prefs.view + ')' : '') + ' -> ' + A(v) + wantHash, shows(s, v) && s.path === A(v) && s.hash === wantHash, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/' + FILE);
    await side(page, 'e3intel');
    await page.goBack(); await settle(page);
    let s = await state(page);
    check('after the forward, Back returns to /dashboard/engine-3', shows(s, 'e3overview') && s.path === '/dashboard/engine-3', JSON.stringify(s));
    await page.goForward(); await settle(page);
    s = await state(page);
    check('after the forward, Forward returns to /dashboard/intel-tracker', shows(s, 'e3intel') && s.path === '/dashboard/intel-tracker', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard/files#/briefs');
    const s = await state(page);
    check('a #/<page> on /dashboard wins and is dropped from the address', shows(s, 'e3briefs') && s.path === '/dashboard/briefs' && s.hash === '', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/dashboard/files');
    await page.evaluate(() => { location.hash = '#/briefs'; }); await settle(page);
    let s = await state(page);
    check('typing #/<page> on an open /dashboard page changes nothing', s.cur === 'files' && s.path === '/dashboard/files', JSON.stringify(s));
    await side(page, 'e3intel');
    s = await state(page);
    check('the next page change drops the stray #anchor', shows(s, 'e3intel') && s.path === '/dashboard/intel-tracker' && s.hash === '', JSON.stringify(s));
    await ctx.close();
  }
  // 13. the same file on a host without the rewrite uses #/<page>
  const COPY = '/copy/' + FILE;
  {
    const { ctx, page } = await open(BASE + COPY);
    let s = await state(page);
    check('other host: resumes and settles #/engine-3', shows(s, 'e3overview') && s.path === COPY && s.hash === '#/engine-3', JSON.stringify(s));
    await side(page, 'e3intel');
    s = await state(page);
    check('other host: sidebar writes #/intel-tracker', shows(s, 'e3intel') && s.hash === '#/intel-tracker', JSON.stringify(s));
    await page.reload({ waitUntil: 'load' }); await H.settled(page, 'app');
    s = await state(page);
    check('other host: reload keeps Intel Tracker', shows(s, 'e3intel') && s.hash === '#/intel-tracker', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('other host: Back -> Engine 3 Overview', shows(s, 'e3overview') && s.hash === '#/engine-3', JSON.stringify(s));
    await page.evaluate(() => { location.hash = '#section-2'; }); await settle(page);
    s = await state(page);
    check('other host: an #anchor that is not a page changes nothing', shows(s, 'e3overview'), JSON.stringify(s));
    await ctx.close();
  }
  for (const [hash, v, want, prefs] of [['#/briefs', 'e3briefs', '#/briefs', null], ['#/CALLS', 'calls', '#/calls', null], ['#/nope', 'e3ads', '#/ad-strategist', { view: 'e3ads', e60: { engine: 'e3', view: 'ads' } }]]) {
    const { ctx, page } = await open(BASE + COPY + hash, { prefs });
    const s = await state(page);
    check('other host ' + hash + ' -> ' + v + ' (' + want + ')', shows(s, v) && s.path === COPY && s.hash === want, JSON.stringify(s));
    await ctx.close();
  }
  for (const [hash, v, want] of [['', 'e3ads', '#/ad-strategist'], ['#/briefs', 'e3briefs', '#/briefs'], ['#/login', 'e3ads', '#/ad-strategist']]) {
    const { ctx, page } = await open(BASE + COPY + hash, { seed: false, prefs: SAVED_ADS });
    let s = await state(page);
    const atLogin = s.login && s.path === COPY && s.hash === '#/login';
    await H.signIn(page);
    s = await state(page);
    check('other host signed out ' + (hash || '(plain)') + ' -> #/login, then ' + want, atLogin && shows(s, v) && s.hash === want, JSON.stringify(s));
    await ctx.close();
  }
  // 14. a local copy (file://)
  {
    const { ctx, page } = await open('file://' + path.join(ROOT, FILE));
    await side(page, 'e3testing');
    let s = await state(page);
    check('local file: sidebar writes #/ad-testing', shows(s, 'e3testing') && s.hash === '#/ad-testing', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('local file: Back -> Engine 3 Overview', shows(s, 'e3overview') && s.hash === '#/engine-3', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open('file://' + path.join(ROOT, FILE), { seed: false });
    const s = await state(page);
    check('local file signed out: sign-in screen at #/login', s.login && s.hash === '#/login', JSON.stringify(s));
    await ctx.close();
  }
  // 15. inside a frame the address is left alone and the app works as before
  {
    const { ctx, page } = await open(BASE + '/frame.html', { wait: false });
    const fr = page.frame({ url: /\/dashboard\/briefs/ });
    if (fr) {
      await H.settled(fr, 'app');
      const s0 = await state(fr);
      const top0 = await page.evaluate(() => history.length);
      await fr.click('#nwNav .nw-item[data-view="e3intel"]'); await fr.waitForTimeout(250);
      const s = await state(fr);
      const top1 = await page.evaluate(() => history.length);
      check('frame: resumes as the original does (Overview), address untouched', s0.cur === 'e3overview' && s0.path === '/dashboard/briefs', JSON.stringify(s0));
      check('frame: clicks change the page but not the address or the host history', s.cur === 'e3intel' && s.path === '/dashboard/briefs' && s.hash === '' && top1 === top0, JSON.stringify(s) + ' top ' + top0 + '->' + top1);
    } else check('frame loaded', false, 'no frame');
    await ctx.close();
  }
  // 16. with a baseline: every view reads the same as that copy (same stubs, same fixed clock)
  if (!BASELINE) console.log('SKIP view-by-view comparison: no baseline file given');
  else {
    const texts = { original: {}, patched: {} };
    for (const [url, key] of [[BASE + '/baseline.html', 'original'], [BASE + '/dashboard', 'patched']]) {
      const { ctx, page } = await open(url, { fixed: true, original: key === 'original' });
      for (const v of Object.keys(SLUG)) {
        await page.evaluate((x) => apGo(x), v); await page.waitForTimeout(300);
        texts[key][v] = await page.evaluate(() => ((document.getElementById('crumb') || {}).innerText || '') + '\n' + ((document.querySelector('.page.on') || {}).innerText || ''));
      }
      await ctx.close();
    }
    for (const v of Object.keys(SLUG)) {
      const a = texts.original[v], b = texts.patched[v];
      check('regression: ' + v + ' reads the same as the baseline', a === b, 'lengths ' + (a || '').length + ' vs ' + (b || '').length);
    }
  }

  // without a baseline any page error fails; with one, only errors the baseline did not have
  const newErrors = errors.patched.filter((e) => !errors.original.includes(e));
  check(BASELINE ? 'no new page errors' : 'no page errors', newErrors.length === 0, newErrors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (errors.original.length ? ' (the baseline logged ' + errors.original.length + ' page errors under the same stubs)' : ''));
  if (failures.length) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST RUN CRASHED:', e); process.exit(2); });
