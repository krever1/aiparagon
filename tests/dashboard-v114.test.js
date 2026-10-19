// v114 tests for new-aiparagon-dashboard.html (#1): every call to an n8n webhook carries the signed-in user's
// token in "auth", so the workflows can turn away anyone who is not signed in. Checked on each webhook address
// and on the real functions behind each button; a body that already has a token keeps it; a 401 gets one more
// try with a refreshed token; a token with under 20 minutes left is refreshed before it goes out.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js),
// and n8n webhooks answer from stubs, so no real account, data or workflow is touched. See tests/README.md.
// Usage: node tests/dashboard-v114.test.js
const path = require('path');
const H = require('./lib/dashboard-harness');
const { makeStore } = require('./lib/rest-stub');
const FX = require('./lib/qa-fixtures');

const ROOT = path.resolve(__dirname, '..');
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const N8N = 'https://n8n.aiparagonconsulting.com/webhook/';
// the webhooks that checked nobody before v114, plus Learn Voice (Ask questions also get the house rules added by an older
// wrapper, so questions are matched by how they start)
const HOOKS = ['ask-bot', 'regen-ad-image', 'file-ingest', 'hubspot-file-sync', 'profile-enrich', 'ad-brief', 'ad-upload',
  'e3-content-run', 'e1-custom-run-erica', '870a1ffa-cbc6-4085-894a-6f3bc90a40f2', 'learn-voice'];
let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/engine-3');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  // one signed-in page; hooks[] records every n8n call. deny[path] = how many calls to turn away with a 401 first.
  // Refreshing the session hands out qa-token-r1, qa-token-r2, ... so a test can tell which token went out.
  async function open(url) {
    const hooks = [], deny = {};
    let refreshes = 0;
    const hook = (u, m, b) => {
      const p = u.slice(N8N.length);
      hooks.push({ u, p, m, raw: b || '', b: J(b || '') });
      if (deny[p] > 0) { deny[p]--; return { status: 401, body: { ok: false, code: 'unauthorized', message: 'Sign in with an AI Paragon account to use this.' } }; }
      return { body: { ok: true, answer: 'Stub answer.', analysis: { hook: 'x' }, brief: {}, run_id: 'qa-run', variants: [], extracted: true, chars: 10 } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: makeStore(FX.tables()), hooks: hook, bucket: errors, fixed: true });
    await page.route(SB + '/auth/v1/token**', (route) => {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      refreshes++;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors,
        body: JSON.stringify({ access_token: 'qa-token-r' + refreshes, refresh_token: 'qa-refresh-r' + refreshes, expires_in: 3600, token_type: 'bearer', user: H.USER }) });
    });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1300);
    return { ctx, page, hooks, deny, refreshes: () => refreshes };
  }
  const post = (page, url, body, extra) => page.evaluate(async ([u, b, x]) => {
    const r = await fetch(u, Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof b === 'string' ? b : JSON.stringify(b) }, x || {}));
    return r.status;
  }, [url, body, extra || null]);
  const last = (hooks, p) => hooks.filter((h) => h.p === p).pop();

  // ---------------- A. every webhook address gets the token ----------------
  {
    const { ctx, page, hooks } = await open('/dashboard/engine-3');
    for (const p of HOOKS) await post(page, N8N + p, { qa: p });
    for (const p of HOOKS) {
      const h = last(hooks, p);
      check('a POST to /' + p.slice(0, 24) + ' carries the signed-in token', !!h && h.b && h.b.auth === 'qa-token' && h.b.qa === p, h && h.raw.slice(0, 120));
    }
    // a body that already has one keeps it
    await post(page, N8N + 'ask-bot', { question: 'mine', auth: 'own-token' });
    const own = hooks.filter((h) => h.p === 'ask-bot' && h.b && String(h.b.question).startsWith('mine')).pop();
    check('a body that already carries a token keeps it', !!own && own.b.auth === 'own-token', own && own.raw);
    // what is not a JSON POST to n8n is left alone
    await post(page, N8N + 'ask-bot', 'plain words', { headers: { 'Content-Type': 'text/plain' } });
    const plain = hooks.filter((h) => h.p === 'ask-bot' && h.raw === 'plain words').pop();
    check('a body that is not JSON goes out unchanged', !!plain, hooks.map((h) => h.raw.slice(0, 30)).join(' | '));
    await page.evaluate(() => fetch('https://n8n.aiparagonconsulting.com/webhook/ask-bot?ping=1').catch(() => null));
    const get = hooks.filter((h) => h.m === 'GET').pop();
    check('a GET goes out unchanged', !!get && !get.raw, get && JSON.stringify(get));
    let other = null;
    await page.route('https://example.org/**', (route) => { other = route.request().postData(); return route.fulfill({ status: 200, body: '{}', headers: { 'access-control-allow-origin': '*' } }); });
    await page.evaluate(() => fetch('https://example.org/x', { method: 'POST', body: JSON.stringify({ x: 1 }) }).catch(() => null));
    check('a POST anywhere else gets no token', other === JSON.stringify({ x: 1 }), String(other));
    await ctx.close();
  }

  // ---------------- B. the real functions behind the buttons ----------------
  {
    const { ctx, page, hooks } = await open('/dashboard/engine-3');
    const ran = await page.evaluate(async () => {
      const out = {};
      const tryIt = async (k, f) => { try { await f(); out[k] = 'ok'; } catch (e) { out[k] = 'error: ' + (e.message || e); } };
      await tryIt('e1_full', () => apHook(AP_HOOKS.e1_full, { email: 'lead@example.com', firstName: 'Owen' }));
      await tryIt('e1_custom', () => apHook(AP_HOOKS.e1_custom, { email: 'lead@example.com', entry: 'interview_script' }));
      await tryIt('content', () => apCfKick('qa-req-1'));
      await tryIt('upload', () => apHookJson(AP_HOOKS.ad_upload, { mode: 'analyze', images: [] }));
      await tryIt('brief', () => apHookJson(AP_HOOKS.ad_brief, { intel: [], ads: [] }, 'Engine 3 · Custom Ad Strategy'));
      await tryIt('ingest', () => e1IngestFile('qa-file-1', 'https://lesyptuwllcgajdxzjje.supabase.co/storage/v1/object/public/lead-files/qa/notes.pdf', 'notes.pdf'));
      await tryIt('hubspot', async () => { v112HsMirror('https://lesyptuwllcgajdxzjje.supabase.co/storage/v1/object/public/lead-files/qa/notes.pdf', 'notes.pdf', 'lead@example.com'); await new Promise((r) => setTimeout(r, 400)); });
      await tryIt('enrich', () => pCallEnrich({ website: 'https://example.com', businessName: 'QA' }));
      await tryIt('ask', async () => { if (!document.getElementById('chatBody')) { const d = document.createElement('div'); d.id = 'chatBody'; document.body.appendChild(d); } await askChat('Who is new this week?'); });
      return out;
    });
    const want = { e1_full: ['870a1ffa-cbc6-4085-894a-6f3bc90a40f2', 'email'], e1_custom: ['e1-custom-run-erica', 'entry'], content: ['e3-content-run', 'request_id'],
      upload: ['ad-upload', 'mode'], brief: ['ad-brief', 'intel'], ingest: ['file-ingest', 'fileId'], hubspot: ['hubspot-file-sync', 'leadEmail'],
      enrich: ['profile-enrich', 'website'], ask: ['ask-bot', 'question'] };
    for (const [k, [p, field]] of Object.entries(want)) {
      const h = last(hooks, p);
      check(k + ': the call goes out with the token and its own fields', ran[k] === 'ok' && !!h && h.b && h.b.auth === 'qa-token' && h.b[field] != null, ran[k] + ' ' + (h ? h.raw.slice(0, 140) : 'no call'));
    }
    await ctx.close();
  }

  // ---------------- C. turned away: one more try with a refreshed token ----------------
  {
    const { ctx, page, hooks, deny, refreshes } = await open('/dashboard/engine-3');
    deny['ask-bot'] = 1;
    const st = await post(page, N8N + 'ask-bot', { question: 'retry me' });
    const calls = hooks.filter((h) => h.p === 'ask-bot' && h.b && String(h.b.question).startsWith('retry me'));
    check('a 401 is tried once more and the second answer is what the page gets', st === 200 && calls.length === 2, st + ' / ' + calls.length);
    check('the second try carries a refreshed token', calls.length === 2 && calls[0].b.auth === 'qa-token' && calls[1].b.auth === 'qa-token-r1', calls.map((c) => c.b.auth).join(', '));
    check('the refreshed session is kept for later calls', await page.evaluate(() => apSess().access_token) === 'qa-token-r1');
    deny['ask-bot'] = 5;
    const st2 = await post(page, N8N + 'ask-bot', { question: 'still no' });
    const calls2 = hooks.filter((h) => h.p === 'ask-bot' && h.b && String(h.b.question).startsWith('still no'));
    check('turned away twice: the page gets the 401 after two tries, no loop', st2 === 401 && calls2.length === 2, st2 + ' / ' + calls2.length);
    check('one refresh per turned-away call', refreshes() === 2, String(refreshes()));
    // a body that brought its own token is retried with the refreshed one too
    deny['learn-voice'] = 1;
    await post(page, N8N + 'learn-voice', { samples: 'x', auth: 'stale-token' });
    const lv = hooks.filter((h) => h.p === 'learn-voice');
    check('a turned-away call that brought its own token retries with the refreshed one', lv.length === 2 && lv[0].b.auth === 'stale-token' && lv[1].b.auth === 'qa-token-r3', lv.map((c) => c.b.auth).join(', '));
    await ctx.close();
  }

  // ---------------- D. a token close to running out is refreshed before it goes out ----------------
  {
    const { ctx, page, hooks } = await open('/dashboard/engine-3');
    const soon = () => page.evaluate(() => { const s = apSess(); s.expires_at = Date.now() + 10 * 60 * 1000; localStorage.setItem('ap.session.v1', JSON.stringify(s)); });
    await soon();
    await post(page, N8N + 'intel-run', { competitors: [], cascade: true, auth: 'qa-token' });
    const ir = last(hooks, 'intel-run');
    check('under 20 minutes left: an Intel run goes out with a fresh token for its hand-on', !!ir && ir.b.auth === 'qa-token-r1' && ir.b.cascade === true, ir && ir.raw);
    await soon();
    await post(page, N8N + 'ask-bot', { question: 'soon' });
    const ab = hooks.filter((h) => h.p === 'ask-bot').pop();
    check('under 20 minutes left: a call without a token gets the fresh one', !!ab && ab.b.auth === 'qa-token-r2', ab && ab.raw);
    const left = await page.evaluate(() => Math.round((apSess().expires_at - Date.now()) / 60000));
    check('and the session runs a full hour again', left >= 55, String(left));
    await ctx.close();
  }

  // ---------------- E. signed out: nothing to add, nothing breaks ----------------
  {
    const { ctx, page, hooks } = await open('/dashboard/engine-3');
    await page.evaluate(() => localStorage.removeItem('ap.session.v1'));
    const st = await post(page, N8N + 'ask-bot', { question: 'nobody' });
    const h = hooks.filter((x) => x.p === 'ask-bot').pop();
    check('signed out: the call goes out without a token', st === 200 && !!h && h.b && !('auth' in h.b), h && h.raw);
    await ctx.close();
  }

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
