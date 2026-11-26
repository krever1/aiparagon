// v152 tests for new-aiparagon-dashboard.html (#1): two layout fixes found while taking screenshots on Nov 26. The
// Intel Tracker's Following rows squeezed each account's name to one letter per line (v145's controls in a row that
// did not wrap), and the board's Run button was wider than its card with a long stage name. Each check fails on v151.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js); Fathom and
// n8n answer from stand-ins. Everyone is made up (example domains).
// Usage: node tests/dashboard-v152.test.js   (ONLY=following,board runs one section)
const path = require('path');
const H = require('./lib/dashboard-harness');
const { makeStore } = require('./lib/rest-stub');
const FX = require('./lib/qa-fixtures');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const ONLY = process.env.ONLY || '';
const want = (k) => !ONLY || ONLY.split(',').includes(k);
const L1 = FX.L1, L2 = FX.L2;
const ME = 'qa@aiparagonconsulting.com';
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(addr, o) {
    o = o || {};
    const t = FX.tables();
    if (o.more) o.more(t);
    const store = makeStore(t);
    const hooks = [];
    const hook = (u, m, b) => {
      let j = null; try { j = JSON.parse(b || ''); } catch (e) {}
      const p = u.replace(/^https:\/\/n8n\.aiparagonconsulting\.com\/webhook\//, '');
      hooks.push({ p, b: j });
      if (/fathom-proxy$/.test(u)) {
        if (j && j.action === 'list') return { body: { ok: true, items: o.calls || [] } };
        if (j && j.action === 'status') return { body: { ok: true, connected: true, hint: 'abcd' } };
        return { body: { ok: true, transcript: [] } };
      }
      if (o.hook) { const r = o.hook(p, j); if (r) return r; }
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    const storage = [];
    await ctx.route('**/storage/v1/**', (route) => {
      const r = route.request();
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      storage.push({ method: r.method(), at: r.url().split('/storage/v1/object/')[1] || '', body: r.postData() || '' });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"Key":"x"}' });
    });
    page.on('dialog', (d) => d.accept());
    await page.setViewportSize({ width: o.width || 1440, height: 900 });
    await page.goto(BASE + addr, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(o.wait || 1800);
    return { ctx, page, store, hooks, storage };
  }
  const setting = (store, k) => (store.db.ai_settings.find((r) => r.key === k) || {}).value;
  const obj = (v) => (typeof v === 'string' ? JSON.parse(v) : v) || {};

  const call = (id, h, title, guests, mins) => ({ id, title, start: ago(h), end: new Date(Date.now() - h * 3600e3 + (mins || 40) * 60e3).toISOString(),
    share_url: 'https://fathom.video/share/' + id + 'abcdef', recorded_by: { name: 'QA Tester', email: ME },
    invitees: guests.map((g) => ({ name: g[0], email: g[1], external: true })).concat([{ name: 'QA Tester', email: ME, external: false }]) });
  const FID = '00000000-0000-4000-8000-0000000f1001';
  const toFiles = async (page, email) => {
    await page.evaluate((e) => openE1Lead(e), email); await page.waitForTimeout(3000);
    await page.locator('#apChrome .rd-tab', { hasText: /^Files/ }).first().click(); await page.waitForTimeout(600);
  };
  const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#main .v145-wl .v145-wr')].map((r) => ({ k: r.dataset.k, b: (r.querySelector('.v145-wm b') || {}).textContent, chip: (r.querySelector('.v145-fchip') || {}).textContent || '', src: !!r.querySelector('.v145-src'), t: r.innerText })));


  // 1. Following: the account's name reads on one line, the controls sit under it
  if (want('following')) {
    for (const width of [1440, 1920, 1024]) {
      const { ctx, page } = await open('/dashboard/intel-tracker', { width });
      await page.evaluate(() => apTab('follow')); await page.waitForTimeout(1800);
      const rows = await page.$$eval('.v96-fol-c li', (ls) => ls.map((li) => {
        const b = li.querySelector('.who b'), c = li.querySelector('.v145-folc');
        const rb = b && b.getBoundingClientRect(), rc = c && c.getBoundingClientRect();
        return { name: b && b.textContent, w: rb ? Math.round(rb.width) : 0, h: rb ? Math.round(rb.height) : 0, below: !!(rb && rc && rc.top >= rb.bottom - 1), cw: rc ? Math.round(rc.width) : 0 };
      }));
      check('Following at ' + width + ': every account is listed', rows.length >= 2, JSON.stringify(rows));
      check('Following at ' + width + ': each name reads on one line, not a letter per line', rows.length && rows.every((r) => r.w > 60 && r.h < 30), JSON.stringify(rows));
      check('Following at ' + width + ': who they are and Draft replies sit under the name', rows.length && rows.every((r) => r.below && r.cw > 150), JSON.stringify(rows));
      await ctx.close();
    }
  }

  // 2. The board: a long stage name's Run button stays inside its card
  if (want('board')) {
    const more = (t) => {
      t.ai_settings.push({ key: 'catalyst_client_stages', value: { order: ['research', 'consultation', 'assessment', 'proposal', 'cs-strat1', 'onboarding', 'review'], items: {
        'cs-strat1': { name: 'Strategy session', type: 'mt-strat1', c: '#3F7F9F' } } }, updated_at: ago(2) });
      t.ai_settings.push({ key: 'catalyst_meeting_types', value: { order: ['mt-strat1'], items: { 'mt-strat1': { name: 'Strategy session', doc: 'Strategy session brief', sections: ['Goals', 'Constraints', 'The roadmap'] } } }, updated_at: ago(2) });
      t.e1_leads.find((r) => r.email === L2).stage = 'cs-strat1';
    };
    for (const width of [1440, 1280]) {
      const { ctx, page } = await open('/dashboard/lead-pipeline', { width, more });
      const r = await page.evaluate(() => {
        const card = document.querySelector('.v120-col[data-s="cs-strat1"] .v120-card');
        const b = card && card.querySelector('.v120-next');
        if (!b) return null;
        const rc = card.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return { text: b.textContent, inside: rb.left >= rc.left - 1 && rb.right <= rc.right + 1, clipped: b.scrollWidth > b.clientWidth + 1 };
      });
      check('Board at ' + width + ': the long Run button stays inside its card, nothing cut off', r && r.inside && !r.clipped && /strategy session/i.test(r.text), JSON.stringify(r));
      await ctx.close();
    }
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
