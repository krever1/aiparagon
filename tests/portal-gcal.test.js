// Google Calendar regression tests for E-&-G-Home-Inc.html (#2, the care portal), v12.40: a connection kept on
// the server (np-gcal) comes back after a reload or a sign-in without the page offering Connect while it looks it
// up (it used to show Connect for the 4 to 5 seconds np-gcal took, then connect by itself). Until np-gcal answers
// the calendar page and its settings say Checking; once it answers they show the connection, or Connect when there
// is none, when the server piece is not set up, and after 20 seconds with no answer. np-gcal is called in the
// database's region (forceFunctionRegion), and anywhere when that region can't be reached. Signed in to a stub
// account; np-gcal and Google are answered by the suite. See tests/README.md.
// Usage: node tests/portal-gcal.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const dir = 'dana@maple.test';
  const S = { email: dir, password: 'qa-pass-1234', role: 'director',
    program: [{ key: 'users', value: { map: { [dir]: { name: 'Dana Director', role: 'director', title: 'Executive Director' } } } }] };

  // np-gcal as the suite says: mode 'kept' (a connection on file), 'none', 'notset' (no client secret yet);
  // hold: the answer waits until release() is called
  const G = { mode: 'kept', calls: [], hold: null };
  const holdOn = () => { let release; G.hold = new Promise((r) => { release = r; }); G.release = () => { G.hold = null; release(); }; };
  const rest = async ({ method, path, body }) => {
    if (path.startsWith('/auth/v1/token?grant_type=refresh_token')) return { status: 200, body: { access_token: 'qa-access-token', refresh_token: 'qa-refresh-token', expires_in: 3600, token_type: 'bearer', user: { id: 'qa-user', email: dir } } };
    if (path.startsWith('/auth/v1/user')) return { status: 200, body: { id: 'qa-user', email: dir } };
    if (!path.startsWith('/functions/v1/np-gcal')) return null;
    if (method !== 'POST') return { status: 204, body: '' };
    const b = JSON.parse(body || '{}');
    G.calls.push({ path, action: b.action });
    if (G.hold) await G.hold;
    if (G.mode === 'notset') return { status: 503, body: { ready: false, error: 'Google Calendar can’t stay connected until the Google client secret is added.' } };
    if (G.mode === 'none') return { status: 200, body: { ready: true, connected: false } };
    return { status: 200, body: { ready: true, connected: true, email: 'dana@gmail.test', access_token: 'qa-google', expires_in: 3600 } };
  };
  const { ctx, page } = await H.newPage(env, { session: S, bucket: errors, rest });
  await page.route('https://www.googleapis.com/calendar/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  // every Connect button that ever shows up, from the first paint on
  await page.addInitScript(() => {
    window.__connectSeen = [];
    const look = () => document.querySelectorAll('button').forEach((b) => {
      const t = (b.textContent || '').trim();
      if (/^Connect( Google Calendar)?$/.test(t) && b.offsetParent) window.__connectSeen.push({ t, at: Date.now(), checked: typeof _gcalAsked !== 'undefined' && _gcalAsked === gcalWho() });
    });
    document.addEventListener('DOMContentLoaded', () => new MutationObserver(look).observe(document.body, { childList: true, subtree: true }));
  });

  const booted = () => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  const inApp = () => page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 20000 });
  const toCal = () => page.evaluate(() => { closeAll(); go('calendar'); });
  const head = () => page.evaluate(() => [...document.querySelectorAll('.page-acts button')].map((b) => (b.textContent || '').trim() + (b.disabled ? ' [off]' : '')).join(' | '));
  const card = () => page.evaluate(() => { settingsHub('cal', 'calendar'); const t = [...document.querySelectorAll('#modal .set-int')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()).join(' | '); closeAll(); return t; });
  const tokenCalls = () => G.calls.filter((c) => c.action === 'token');

  // ---------------- 1. sign in with a connection kept: Checking, never Connect, then connected ----------------
  holdOn();
  await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted();
  await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
  await inApp();
  await toCal();
  await page.waitForFunction(() => /Checking Google Calendar/.test(document.querySelector('.page-acts').textContent), null, { timeout: 15000 }).catch(() => {});
  const h1 = await head();
  check('sign-in: while np-gcal looks the connection up, the calendar page says Checking Google Calendar (not clickable)', /Checking Google Calendar… \[off\]/.test(h1) && !/Connect Google Calendar/.test(h1), h1);
  const c1 = await card();
  check('sign-in: the calendar settings card says it is checking, with no Connect', /Checking for a connection you made earlier… Checking…/.test(c1) && !/Connect$|Connect \|/.test(c1), c1);
  await page.waitForFunction(() => _gcalCheckT > 0, null, { timeout: 3000 }).catch(() => {});
  G.release();
  await page.waitForFunction(() => GCAL.connected, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const h2 = await head();
  check('sign-in: once np-gcal answers, the page shows the connection', /Google ✓ · Disconnect/.test(h2) && !/Checking/.test(h2), h2);
  const c2 = await card();
  check('sign-in: the settings card says connected as the Google account and kept', /Connected as dana@gmail\.test · stays connected until you disconnect/.test(c2), c2);
  check('sign-in: Connect never showed while the connection was being looked up', (await page.evaluate(() => window.__connectSeen.length)) === 0, JSON.stringify(await page.evaluate(() => window.__connectSeen)));
  check('sign-in: the fail-safe timer is cleared once np-gcal answers', await page.evaluate(() => _gcalCheckT === 0));
  const t1 = tokenCalls();
  check('np-gcal is called in the database’s region (forceFunctionRegion=us-west-2)', t1.length >= 1 && t1.every((c) => /\/functions\/v1\/np-gcal\?forceFunctionRegion=us-west-2$/.test(c.path)), JSON.stringify(t1));

  // ---------------- 2. a reload: the same, from the saved sign-in ----------------
  holdOn(); G.calls.length = 0;
  await page.reload({ waitUntil: 'load' }); await booted();
  const resumed = await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 20000 }).then(() => true, () => false);
  check('reload: the saved sign-in opens the app again', resumed);
  await toCal();
  await page.waitForTimeout(600);
  const h3 = await head();
  check('reload: the calendar page says Checking Google Calendar, not Connect', /Checking Google Calendar… \[off\]/.test(h3) && !/Connect Google Calendar/.test(h3), h3);
  await page.evaluate(() => settingsHub('cal', 'calendar'));             // left open while np-gcal answers
  G.release();
  await page.waitForFunction(() => GCAL.connected, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const open = await page.evaluate(() => [...document.querySelectorAll('#modal.on .set-int')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
  check('reload: a calendar settings window left open on Checking shows the connection once np-gcal answers', /Connected as dana@gmail\.test · stays connected until you disconnect/.test(open), open);
  await page.evaluate(() => closeAll());
  check('reload: then the connection, and Connect never showed', /Google ✓ · Disconnect/.test(await head()) && (await page.evaluate(() => window.__connectSeen.length)) === 0, (await head()) + ' ' + JSON.stringify(await page.evaluate(() => window.__connectSeen)));

  // ---------------- 3. no connection on file: Connect once np-gcal has said so ----------------
  holdOn(); G.mode = 'none';
  await page.reload({ waitUntil: 'load' }); await booted(); await inApp();
  await toCal(); await page.waitForTimeout(400);
  check('nothing kept: Checking while np-gcal answers', /Checking Google Calendar/.test(await head()), await head());
  G.release();
  await page.waitForFunction(() => /Connect Google Calendar/.test(document.querySelector('.page-acts').textContent), null, { timeout: 8000 }).catch(() => {});
  const h4 = await head();
  check('nothing kept: Connect Google Calendar shows once np-gcal says there is no connection', /Connect Google Calendar/.test(h4) && !/Checking/.test(h4), h4);
  check('nothing kept: Connect showed only after the answer', await page.evaluate(() => window.__connectSeen.length > 0 && window.__connectSeen.every((x) => x.checked)), JSON.stringify(await page.evaluate(() => window.__connectSeen.slice(0, 3))));
  const c4 = await card();
  check('nothing kept: the settings card offers Connect', /Not connected\. .* Connect$/.test(c4), c4);

  // ---------------- 4. the server piece not set up: Connect (for this session) right after the answer ----------------
  G.mode = 'notset';
  await page.reload({ waitUntil: 'load' }); await booted(); await inApp();
  await toCal();
  await page.waitForFunction(() => GCAL.ready === false, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  check('not set up: Connect Google Calendar shows (the this-session connect)', /Connect Google Calendar/.test(await head()) && !/Checking/.test(await head()), await head());

  // ---------------- 5. the region can't be reached: np-gcal is called again without it ----------------
  G.mode = 'kept'; G.calls.length = 0;
  await page.route(/\/functions\/v1\/np-gcal\?forceFunctionRegion=/, (route) => (route.request().method() === 'OPTIONS' ? route.fallback() : route.abort('connectionrefused')));
  await page.reload({ waitUntil: 'load' }); await booted(); await inApp();
  await toCal();
  await page.waitForFunction(() => GCAL.connected, null, { timeout: 10000 }).catch(() => {});
  const t5 = tokenCalls();
  check('region down: the page asks np-gcal again without the region, and connects', (await page.evaluate(() => GCAL.connected)) && t5.some((c) => /np-gcal$/.test(c.path)), JSON.stringify(t5));
  await page.unroute(/\/functions\/v1\/np-gcal\?forceFunctionRegion=/);

  // ---------------- 6. no answer at all: Connect comes back after 20 seconds ----------------
  holdOn();
  await page.reload({ waitUntil: 'load' }); await booted(); await inApp();
  await toCal(); await page.waitForTimeout(400);
  check('no answer: Checking at first', /Checking Google Calendar/.test(await head()), await head());
  await page.waitForFunction(() => /Connect Google Calendar/.test(document.querySelector('.page-acts').textContent), null, { timeout: 25000 }).catch(() => {});
  const h6 = await head();
  check('no answer: Connect Google Calendar is offered again after 20 seconds, so the page is never stuck', /Connect Google Calendar/.test(h6) && !/Checking/.test(h6), h6);
  G.release();
  await page.waitForFunction(() => GCAL.connected, null, { timeout: 10000 }).catch(() => {});
  check('no answer: a late answer still connects', await page.evaluate(() => GCAL.connected));

  // ---------------- 7. the demo view: Connect as before (no server connection there) ----------------
  {
    const p2 = await ctx.newPage();
    await p2.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await p2.waitForFunction(() => typeof go === 'function' && el('app').classList.contains('on'), null, { timeout: 20000 }).catch(() => {});
    await p2.evaluate(() => { closeAll(); go('calendar'); });
    await p2.waitForTimeout(500);
    const h7 = await p2.evaluate(() => [...document.querySelectorAll('.page-acts button')].map((b) => (b.textContent || '').trim()).join(' | '));
    check('demo view: Connect Google Calendar shows straight away (nothing to look up)', /Connect Google Calendar/.test(h7) && !/Checking/.test(h7), h7);
    await p2.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
