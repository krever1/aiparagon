// Sign-in renewal tests for E-&-G-Home-Inc.html (#2, the care portal), v12.37. Supabase hands out a new renewal key
// with every renewal and cancels the old one; two tabs spending the same key ended the sign-in everywhere, and the
// page stayed on the dashboard while every save came back "JWT expired" (Oct 21). Covered here: a sign-in refused for
// good goes to the sign-in page with the email kept, stops retrying, and the change that was refused is sent after
// signing back in; two tabs renewing at once spend the key once; a page opened on a dead saved sign-in shows the
// sign-in page, not the dashboard; the 'Not saved' list in plain words; signing out ends this device's sign-in only.
// Supabase answers from stubs (lib/portal-harness.js and this suite's own `rest`). See tests/README.md.
// Usage: node tests/portal-session.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

const DIR = 'dana@maple.test';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (exp, tag) => b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ exp, sub: 'qa-user', tag }) + '.sig';
const now = () => Math.floor(Date.now() / 1000);

// what Supabase holds: renewal keys and which were spent, the saves that arrived, and the token each carried
function makeDb() { return { keys: {}, refreshes: [], saved: [], refused: [], expired: new Set(), dead: false }; }
function rest(db) {
  return async ({ method, path, body, headers }) => {
    const auth = (headers && (headers.authorization || headers.Authorization)) || '';
    if (path.startsWith('/auth/v1/token?grant_type=refresh_token')) {
      const b = JSON.parse(body || '{}');
      db.refreshes.push(b.refresh_token);
      const k = db.keys[b.refresh_token];
      if (db.dead || !k || k.spent) return { status: 400, body: { code: 400, error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' } };
      k.spent = true;
      const n = Object.keys(db.keys).length + 1, t = jwt(now() + 3600, 'n' + n), r = 'R' + n;
      db.keys[r] = { t };
      return { status: 200, body: { access_token: t, refresh_token: r, expires_in: 3600, token_type: 'bearer', user: { id: 'qa-user', email: DIR } } };
    }
    if (path.startsWith('/rest/v1/') && [...db.expired].some((t) => auth === 'Bearer ' + t)) {
      if (method !== 'GET') db.refused.push(path);
      return { status: 401, body: { code: 'PGRST303', details: null, hint: null, message: 'JWT expired' } };
    }
    if (path.startsWith('/rest/v1/np_demo_audit_log') && method === 'POST') {
      const rows = [].concat(JSON.parse(body || '[]'));
      rows.forEach((r) => db.saved.push(Object.assign({ auth }, r)));
      return { status: 201 };
    }
    return undefined;
  };
}

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const program = () => [
    { key: 'users', value: { map: { [DIR]: { name: 'Dana Director', role: 'director', title: 'Executive Director' } } } },
    { key: 'pilot', value: { signatures: { ['u:' + DIR]: { by: 'Dana Director', at: 'Oct 1, 2026', role: 'Director' } } } }];
  async function signin(S, db, calls, ctx0) {
    let ctx, page;
    if (ctx0) { ctx = ctx0; page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message)); }
    else ({ ctx, page } = await H.newPage(env, { session: S, rest: rest(db), calls, bucket: errors }));
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
    if (!ctx0) { await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo'); }
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { try { closeAll(); } catch (e) {} });
    return { ctx, page };
  }
  const login = (page) => page.evaluate(() => ({
    shown: getComputedStyle(el('login')).display !== 'none', app: el('app').classList.contains('on'),
    email: (el('liEmail') || {}).value || '', err: (el('liErr') || {}).textContent || '', dead: typeof SB_DEAD !== 'undefined' && SB_DEAD,
    held: typeof SB_HELD !== 'undefined' ? SB_HELD.length : -1 }));
  const nRefresh = (calls) => calls.filter((c) => c.startsWith('POST /auth/v1/token?grant_type=refresh_token')).length;

  // ---------------- 1. a sign-in refused for good, then signing back in ----------------
  {
    const db = makeDb(), calls = [];
    const S = { email: DIR, password: 'qa-pass-1234', role: 'director', program: program() };
    const { ctx, page } = await signin(S, db, calls);
    // the sign-in this page holds has run out, and its renewal key was spent elsewhere (Supabase ended it)
    const old = jwt(now() - 600, 'old'); db.expired.add(old); db.dead = true;
    await page.evaluate((t) => { AUTH.session = { t, r: 'R-spent', at: Date.now() - 7200000 }; saveAuth(); }, old);
    const before = nRefresh(calls);
    await page.evaluate(() => logAudit('Test entry before the sign-in ran out', 'qa'));
    await page.waitForFunction(() => getComputedStyle(el('login')).display !== 'none', null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    let L = await login(page);
    check('a sign-in refused for good shows the sign-in page, not the dashboard', L.shown && !L.app, JSON.stringify(L));
    check('the email is kept on the sign-in page', L.email === DIR, L.email);
    check('the sign-in page says why, in plain words, and that the change will be sent', /Your sign-in ran out, so the portal could not save\. Sign in again to keep going\./.test(L.err) && /The change that did not save yet will be sent as soon as you are back in\./.test(L.err), L.err);
    check('the refused change is waiting, not thrown away', L.held === 1, String(L.held));
    check('nothing was saved with the expired sign-in', !db.saved.some((r) => /before the sign-in ran out/.test(r.act || '')));
    await page.evaluate(() => { sbKeepFresh(); sbKeepFresh(); sbKeepFresh(); });
    await page.waitForTimeout(400);
    check('it stops trying to renew a dead sign-in (one try, not one a minute forever)', nRefresh(calls) - before === 1, String(nRefresh(calls) - before));
    const fails = await page.evaluate(() => SB_FAILS.map((f) => f.t + ' ' + f.detail));
    check('a refused read or save is not listed as a raw database error', !fails.some((f) => /JWT|PGRST|401/.test(f)), JSON.stringify(fails));
    // sign back in, on the same page
    db.dead = false;
    await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => realSession() && el('app').classList.contains('on'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    L = await login(page);
    check('signing back in opens the dashboard again', !L.shown && L.app && !L.dead, JSON.stringify(L));
    const sent = db.saved.filter((r) => /before the sign-in ran out/.test(r.act || ''));
    check('the change that waited is saved after signing back in, with the new sign-in', sent.length === 1 && sent[0].auth === 'Bearer qa-access-token', JSON.stringify(sent));
    check('nothing is left waiting', L.held === 0, String(L.held));
    const tst = await page.evaluate(() => (el('toast') || {}).textContent || '');
    check('it says the change that was waiting has been saved', /The change that was waiting has been saved\./.test(tst) || db.saved.length > 0, tst);
    await ctx.close();
  }

  // ---------------- 2. two tabs renewing at the same moment spend the key once ----------------
  {
    const db = makeDb(), calls = [];
    const S = { email: DIR, password: 'qa-pass-1234', role: 'director', program: program() };
    const { ctx, page: A } = await signin(S, db, calls);
    const { page: B } = await signin(S, db, calls, ctx);              // a second tab, the same browser
    const soon = jwt(now() + 30, 'soon');
    db.keys.R1 = { t: soon };
    for (const p of [A, B]) await p.evaluate((t) => { AUTH.session = { t, r: 'R1', at: Date.now() }; saveAuth(); }, soon);
    const before = db.refreshes.length;
    const [ra, rb] = await Promise.all([A.evaluate(() => sbRefresh()), B.evaluate(() => sbRefresh())]);
    const used = db.refreshes.slice(before);
    check('two tabs renewing at once: the key goes to Supabase once', used.length === 1 && used[0] === 'R1', JSON.stringify(used));
    const keys = await Promise.all([A, B].map((p) => p.evaluate(() => ({ r: AUTH.session && AUTH.session.r, dead: SB_DEAD }))));
    check('both tabs end on the new key and stay signed in', ra && rb && keys.every((k) => k.r === keys[0].r && k.r !== 'R1' && !k.dead), JSON.stringify({ ra, rb, keys }));
    // later, a tab still holding the old key in memory takes the newer one instead of spending the old one
    const newer = keys[0].r;
    await B.evaluate(() => { AUTH.session = Object.assign({}, AUTH.session, { r: 'R1', t: AUTH.session.t.replace(/\.sig$/, '.old') }); });
    const n0 = db.refreshes.length;
    await B.evaluate(() => sbRefresh());
    check('a tab with an old key takes the one another tab renewed (no second use of the old key)', db.refreshes.length === n0 && (await B.evaluate(() => AUTH.session.r)) === newer, JSON.stringify(db.refreshes.slice(n0)));
    await ctx.close();
  }

  // ---------------- 3. opening the portal on a dead saved sign-in (what Erica saw) ----------------
  {
    const db = makeDb(), calls = [];
    const S = { email: DIR, password: 'qa-pass-1234', role: 'director', program: program() };
    const { ctx, page } = await signin(S, db, calls);
    const old = jwt(now() - 40 * 3600, 'oct20'); db.expired.add(old); db.dead = true;
    await page.evaluate((t) => { AUTH.session = { t, r: 'R-spent', at: Date.now() - 40 * 3600000 }; saveAuth(); }, old);
    const before = nRefresh(calls);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof SB_DEAD !== 'undefined' && SB_DEAD, null, { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const L = await login(page);
    check('a page opened on a dead saved sign-in ends on the sign-in page, not the dashboard', L.shown && !L.app && L.dead, JSON.stringify(L));
    check('...with the email kept and the plain reason', L.email === DIR && /Your sign-in ran out/.test(L.err), JSON.stringify(L));
    check('...and it does not keep retrying the dead key', nRefresh(calls) - before <= 2, String(nRefresh(calls) - before));
    const shown = await page.evaluate(() => ({ warn: getComputedStyle(el('sbWarn')).display !== 'none', fails: SB_FAILS.length, modal: !!document.querySelector('.modal.on, #modal.on') }));
    check('no "Not saved" list of database errors on the way in', shown.fails === 0, JSON.stringify(shown));
    await ctx.close();
  }

  // ---------------- 3b. two tabs lose the sign-in; signing back in in one brings the other back ----------------
  {
    const db = makeDb(), calls = [];
    const S = { email: DIR, password: 'qa-pass-1234', role: 'director', program: program() };
    const { ctx, page: A } = await signin(S, db, calls);
    const { page: B } = await signin(S, db, calls, ctx);
    const old = jwt(now() - 600, 'old2'); db.expired.add(old); db.dead = true;
    for (const p of [A, B]) await p.evaluate((t) => { AUTH.session = { t, r: 'R-spent', at: Date.now() - 7200000 }; saveAuth(); }, old);
    await B.evaluate(() => logAudit('Saved in the second tab while signed out', 'qa'));
    await A.evaluate(() => logAudit('Saved in the first tab while signed out', 'qa'));
    await Promise.all([A, B].map((p) => p.waitForFunction(() => SB_DEAD, null, { timeout: 8000 }).catch(() => {})));
    const both = await Promise.all([A, B].map((p) => login(p)));
    check('two tabs: both end on the sign-in page', both.every((L) => L.shown && !L.app), JSON.stringify(both));
    db.dead = false;
    await A.fill('#liPw', S.password); await A.click('#liGo');
    await B.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 15000 }).catch(() => {});
    await B.waitForTimeout(1500);
    const LB = await login(B);
    check('signing back in in one tab brings the other back to the dashboard', !LB.shown && LB.app && !LB.dead, JSON.stringify(LB));
    const sent = db.saved.filter((r) => /while signed out/.test(r.act || '')).map((r) => r.act);
    check('...and both tabs\' waiting changes are saved', sent.includes('Saved in the second tab while signed out') && sent.includes('Saved in the first tab while signed out'), JSON.stringify(sent));
    await ctx.close();
  }

  // ---------------- 4. the 'Not saved' list in plain words; signing out ends this device only ----------------
  {
    const db = makeDb(), calls = [];
    const S = { email: DIR, password: 'qa-pass-1234', role: 'director', program: program() };
    const { ctx, page } = await signin(S, db, calls);
    await page.evaluate(() => {
      SB_FAILS = [{ t: 'np_demo_audit_log', kind: 'write', detail: 'HTTP 401 {"code":"PGRST303","details":null,"hint":null,"message":"JWT expired"}' },
        { t: 'np_demo_tasks', kind: 'write', detail: 'HTTP 403 {"code":"42501","message":"new row violates row-level security policy"}' }];
      sbFailsShow();
    });
    await page.waitForTimeout(300);
    const txt = await page.evaluate(() => (document.querySelector('#modal') || document.body).innerText);
    check('Not saved: says what each one was (Change log entry, Task)', /Change log entry/.test(txt) && /\bTask\b/.test(txt), txt.slice(0, 300));
    check('Not saved: says why in plain words', /Your sign-in ran out before this saved/.test(txt) && /This account is not allowed to change this/.test(txt), txt.slice(0, 300));
    check('Not saved: no raw database text (table names, codes, JWT)', !/np_demo_|PGRST|JWT|42501|HTTP \d/.test(txt), txt.slice(0, 300));
    await page.evaluate(() => closeAll());
    const n0 = calls.length;
    await page.evaluate(() => signOut());
    await page.waitForTimeout(300);
    const out = calls.slice(n0).filter((c) => /\/auth\/v1\/logout/.test(c));
    check('signing out ends this device\'s sign-in only (a phone sign-out no longer ends the laptop\'s)', out.length === 1 && /logout\?scope=local$/.test(out[0]), JSON.stringify(out));
    await ctx.close();
  }

  const real = errors.filter((e) => !/ResizeObserver/.test(e));
  check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
