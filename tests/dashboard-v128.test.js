// v128 tests for new-aiparagon-dashboard.html (#1): what the team said when a campaign's survey, landing or booking page
// was turned down rides in the campaign setup line after the guardrails, so it never pushes the blocked phrases or the
// disclosure out of a book-a-call, low-ticket or Funnel Builder request (in v127 it sat ahead of them and could). Across
// a range of request sizes, every guardrail that fits without the page denials fits with them; the page denials still
// ride when there is room, after the guardrails, in the book-a-call request and in a webinar's funnel note. Supabase
// answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and n8n webhooks
// answer from stubs, so no real account, data or workflow is touched. Fails on the build before v128.
// Usage: node tests/dashboard-v128.test.js
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
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const DISC = 'Advisory services are offered through a registered investment adviser. Past performance does not guarantee future results.';
const BLOCKED = ['game-changer', 'revolutionary', 'guaranteed results', 'risk-free', 'cutting-edge', 'world-class', 'best-in-class', 'unlock your potential'];
const PAGE = (id, step, text, days) => ({ id: '00000000-0000-4000-8000-0000000fb' + id, agent: 'low_ticket_content', target_type: 'funnel_asset',
  target_id: '00000000-0000-4000-8000-0000000000b1:' + step, action: 'rejected', feedback: text, author: 'qa@aiparagonconsulting.com', created_at: ago(days) });
function tables() {
  const t = FX.tables();
  t.ai_settings.push({ key: 'e3_guardrails', value: { reviewer: 'QA Tester', blocked: BLOCKED, disclosure: DISC, refs: [] }, updated_at: ago(9) });
  t.ai_settings.push({ key: 'e3_prefs', value: { creative: 'Short sentences\nNo exclamation marks\nLead with a number', running: '', use_read: false, memory: [{ text: 'Say advisers, not advisors' }, { text: 'Never mention competitors by name' }] }, updated_at: ago(9) });
  t.agent_feedback = [
    PAGE('001', 'survey', 'Too many questions for a cold audience, ask two at most and drop the revenue one', 2),
    PAGE('002', 'landing', 'The headline promises a result we cannot back up, lead with the diagnostic itself', 3),
    PAGE('003', 'booking', 'Say what happens on the call and how long it takes, people did not book', 4),
  ];
  return t;
}

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];
  const hooks = [];
  const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: makeStore(tables()), bucket: errors,
    hooks: (u, m, b) => { let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) {} hooks.push({ u, b: body }); return { body: { ok: true, started: true, run_id: 'funnel_qa_v128' } }; } });
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/dashboard/marketing-generation', { waitUntil: 'load' });
  await H.settled(page, 'app');
  await page.waitForTimeout(1800);
  check('the page denials are loaded', await page.evaluate(() => (V127.fa || []).length === 3), await page.evaluate(() => JSON.stringify(V127.fa)));

  // 1. across request sizes, the guardrails that fit without the page denials still fit with them
  const sweep = await page.evaluate(() => {
    const keep = V127.fa, rows = [];
    for (let used = 100; used <= 1000; used += 50) {
      V127.fa = [];
      const a = v103SetupBuild(used);
      V127.fa = keep;
      const b = v103SetupBuild(used);
      rows.push({ used, a: { blocked: a.has.blocked || false, disc: !!a.has.disc }, b: { blocked: b.has.blocked || false, disc: !!b.has.disc, pages: b.has.pages || false } });
    }
    return rows;
  });
  const lost = sweep.filter((r) => (r.a.disc && !r.b.disc) || (r.a.blocked === true && r.b.blocked !== true) || (r.a.blocked && !r.b.blocked));
  check('no request size loses the disclosure or blocked phrases to the page denials', lost.length === 0, JSON.stringify(lost));
  check('the disclosure fits in the middle sizes that v127 lost it at (500 to 600 used)', sweep.filter((r) => r.used >= 500 && r.used <= 600).every((r) => r.b.disc), JSON.stringify(sweep.filter((r) => r.used >= 500 && r.used <= 600)));
  check('the page denials still ride when there is room', sweep.some((r) => r.b.pages), JSON.stringify(sweep.map((r) => r.used + ':' + r.b.pages)));

  // 2. a book-a-call request: the guardrails first, then what was said about the pages
  await page.fill('#v97MgWhat', 'Ads for the AI Readiness Diagnostic');
  await page.click('#v97MgGoBtn'); await page.waitForTimeout(2200);
  const lt = hooks.filter((h) => /e3-low-ticket-run/.test(h.u)).pop(), req = (lt && lt.b.request) || '';
  const iD = req.indexOf('Include this disclosure exactly as written: ' + DISC), iB = req.indexOf('Never use these phrases: '), iP = req.indexOf('Earlier pages were turned down.');
  check('the book-a-call request carries the blocked phrases and the disclosure', iB >= 0 && iD >= 0, req);
  check('and what was said about the pages, after them', iP > iD && iD > iB, [iB, iD, iP].join(','));
  check('within the 1200 characters the Low-Ticket Agent reads', req.length <= 1200, String(req.length));

  // 3. a webinar's funnel note: the same order
  await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await page.waitForTimeout(700);
  await page.fill('#v97MgWhat', 'A webinar on governed AI for RIAs');
  await page.click('#v97MgGoBtn'); await page.waitForTimeout(2200);
  const fr = hooks.filter((h) => /e3-funnel-run/.test(h.u)).pop(), note = String((fr && fr.b.funnel_note) || '');
  const fD = note.indexOf('Include this disclosure exactly as written: ' + DISC), fP = note.indexOf('Earlier pages were turned down.');
  check('a webinar\'s funnel note has the disclosure before the page denials', fD >= 0 && fP > fD, [fD, fP].join(','));
  check('within the 1500 characters the Funnel Builder reads', note.length <= 1500, String(note.length));

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
