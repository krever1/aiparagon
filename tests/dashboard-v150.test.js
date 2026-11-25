// v150 tests for new-aiparagon-dashboard.html (#1): campaigns learn. Send back on a Funnel Builder campaign asks why
// (quick reasons and a note, or none; Cancel keeps it as it was) and saves the reason with the decision; the campaign
// setup line both campaign workflows read (the Low-Ticket Agent's request, the Funnel Builder's funnel note) carries
// what was said about funnels sent back and the house rules for Everything and the Pipeline agents, after the
// guardrails and within each workflow's limit; the side pane and AI settings say so. Supabase answers from an
// in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js); n8n webhooks answer from stubs.
// Everyone is made up. Fails on the build before v150.
// Usage: node tests/dashboard-v150.test.js
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
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const ME = 'qa@aiparagonconsulting.com';
const WEB = { id: '00000000-0000-4000-8000-0000000000e1', run_id: 'funnel_qa_web', run_date: '2026-11-20', status: 'pending_approval', funnel_type: 'webinar', created_at: ago(2), updated_at: ago(2),
  setup: { title: 'Governed AI for RIAs' }, ad_variations: { variants: [{ headline: 'Governed AI in 90 days', primary_text: 'A webinar for RIA owners.', cta: 'Save my seat' }] },
  steps: [{ key: 'registration_page', title: 'Registration page', content: { headline: 'Governed AI for RIAs: the first 90 days', cta: 'Save my seat' } }] };
const OLD = '00000000-0000-4000-8000-0000000000e2', OLD2 = '00000000-0000-4000-8000-0000000000e3';
const fb = (id, o) => Object.assign({ id: '00000000-0000-4000-8000-00000000f5' + id, agent: 'funnel_builder', target_type: 'funnel_package', author: ME, created_at: ago(3) }, o);
const rule = (id, text, to, o) => Object.assign({ id: '00000000-0000-4000-8000-0000000a50' + id, rule: text, category: 'Other', applies_to: to, active: true, source: 'manual', created_by: 'QA Tester', created_at: ago(9), updated_at: ago(9 - +id / 10) }, o || {});
const GUARD = { reviewer: 'QA Tester', require: false, blocked: ['game-changer', 'revolutionary'], disclosure: 'Past results do not guarantee future outcomes.', refs: [] };

function tables(o) {
  o = o || {};
  const t = FX.tables();
  t.funnel_packages.push(WEB);
  t.agent_feedback = [
    fb('01', { target_id: OLD, action: 'rejected', feedback: 'Funnel: weak hook. Open with the cost of month-end reporting.', created_at: ago(4) }),
    fb('02', { target_id: OLD2, action: 'rejected', feedback: 'Funnel: wrong offer.', created_at: ago(6) }),
    fb('03', { target_id: OLD2, action: 'approved', created_at: ago(5) }),                                    // approved after: left out
    fb('04', { target_id: '00000000-0000-4000-8000-0000000000e4', action: 'rejected', feedback: 'Funnel: too long. From the spring.', created_at: ago(140) }), // too old
    fb('05', { target_id: '00000000-0000-4000-8000-0000000000e5', action: 'rejected', created_at: ago(2) })];   // no reason
  t.ai_rules = [rule('01', 'Never promise specific savings', ['all']), rule('02', 'Say advisers, not advisors', ['engine3']),
    rule('03', 'Only for posts: end with a question', ['content_generation']), rule('04', 'An old rule nobody uses', ['all'], { active: false }),
    rule('05', 'Catalyst only: use the client\'s real name', ['engine1'])].concat(o.rules || []);
  t.ai_settings.push({ key: 'e3_guardrails', value: o.guard || GUARD, updated_at: ago(9) });
  return t;
}

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];
  async function open(width, store, url) {
    const hooks = [];
    const hook = (u, m, b) => {
      let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) {}
      hooks.push({ u, b: body });
      if (/\/e3-funnel-run/.test(u)) return { body: { ok: true, started: true, run_id: 'funnel_qa_v150' } };
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors });
    await page.setViewportSize({ width, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1600);
    return { ctx, page, hooks };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 300);
  const ev = (page, fn, arg) => page.evaluate(fn, arg);
  const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  const last = (hooks, re) => hooks.filter((h) => re.test(h.u)).pop();
  const pkgRow = (store) => store.db.funnel_packages.find((x) => x.id === WEB.id);
  const fbOf = (store) => store.db.agent_feedback.filter((x) => x.target_id === WEB.id);
  const openFun = async (page) => { await ev(page, async (id) => { await v113FunLoad(true); v113FunOpen(id); }, WEB.id); await wait(page, 500); };

  // 1. Send back asks why; Cancel keeps it; the reason is saved with the decision
  if (want('send')) {
    const store = makeStore(tables());
    const { ctx, page, hooks } = await open(1440, store, '/dashboard/marketing-generation');
    await openFun(page);
    await page.click('#v113FunD .nw-d-foot button:has-text("Send back")'); await page.waitForSelector('#v150M', { timeout: 5000 });
    check('Send back asks why first', /Why send this campaign back\?/.test(await txt(page, '#v150M h2')) && await page.locator('#v150M .v103-why button').count() === 8);
    await page.click('#v150M button:has-text("Cancel")'); await wait(page, 400);
    check('Cancel keeps the campaign as it was, and saves nothing', pkgRow(store).status === 'pending_approval' && !fbOf(store).length && !(await page.$('#v150M')));
    await page.click('#v113FunD .nw-d-foot button:has-text("Send back")'); await page.waitForSelector('#v150M');
    await page.keyboard.press('Escape'); await wait(page, 400);
    check('Esc keeps it too', pkgRow(store).status === 'pending_approval' && !fbOf(store).length);
    await page.click('#v113FunD .nw-d-foot button:has-text("Send back")'); await page.waitForSelector('#v150M');
    await page.click('#v150M .v103-why button:has-text("Too salesy")'); await page.click('#v150M .v103-why button:has-text("Weak hook")');
    await page.fill('#v150Ta', 'Lead with the cost of month-end reporting, not AI');
    await page.click('#v150Go'); await wait(page, 1000);
    const f = fbOf(store)[0] || {};
    check('Send back saves the campaign as a draft', pkgRow(store).status === 'draft');
    check('…and the reason with the decision', f.action === 'rejected' && f.agent === 'funnel_builder' && f.target_type === 'funnel_package' && f.feedback === 'Funnel: too salesy, weak hook. Lead with the cost of month-end reporting, not AI.', JSON.stringify(f));
    check('The message says the next campaigns read why', /The next campaigns read why/.test(await txt(page, '#nwToast')));
    // the next campaign reads it straight away
    await ev(page, () => nwMgGoTab('new')); await wait(page, 500);
    await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await wait(page, 700);
    await page.fill('#v97MgWhat', 'A webinar on governed AI for RIAs');
    await page.click('#v97MgGoBtn'); await wait(page, 2200);
    const note = String(((last(hooks, /e3-funnel-run/) || {}).b || {}).funnel_note || '');
    check('The next campaign reads the new reason first', /What the team said: “Funnel: too salesy, weak hook\. Lead with the cost of month-end reporting, not AI\.”/.test(note), note.slice(-500));
    await ctx.close();
  }
  if (want('send')) {
    // no reason given: it is sent back without one
    const store = makeStore(tables());
    const { ctx, page } = await open(1440, store, '/dashboard/marketing-generation');
    await openFun(page);
    await page.click('#v113FunD .nw-d-foot button:has-text("Send back")'); await page.waitForSelector('#v150M');
    await page.click('#v150Go'); await wait(page, 1000);
    const f = fbOf(store)[0] || {};
    check('With no reason it is sent back without one', pkgRow(store).status === 'draft' && f.action === 'rejected' && !('feedback' in f), JSON.stringify(f));
    await openFun(page);
    await page.click('#v113FunD .nw-d-foot button:has-text("Approve")'); await wait(page, 800);
    check('Approve still approves at once', pkgRow(store).status === 'approved');
    await ctx.close();
  }

  // 2. the setup line: the house rules and what was said about funnels sent back, after the guardrails
  if (want('line')) {
    const store = makeStore(tables());
    const { ctx, page, hooks } = await open(1440, store, '/dashboard/marketing-generation');
    await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await wait(page, 900);
    const uses = await txt(page, '#nwMgSideB .nw-uses');
    check('The side pane says the campaign follows the house rules and avoids what was said about funnels', /Follows your house rules/.test(uses) && !/shortened to fit/.test(uses) && /Avoids what was said about funnels sent back/.test(uses), uses);
    await page.fill('#v97MgWhat', 'A webinar on governed AI for RIAs');
    await page.click('#v97MgGoBtn'); await wait(page, 2200);
    const note = String(((last(hooks, /e3-funnel-run/) || {}).b || {}).funnel_note || '');
    check('The Funnel Builder\'s note carries the house rules for Everything and the Pipeline agents, newest first', /House rules: Say advisers, not advisors; Never promise specific savings\./.test(note), note);
    check('…not rules for posts or Catalyst only, nor a rule switched off', !/end with a question|real name|old rule nobody uses/.test(note), note);
    check('…and what was said about funnels sent back (not one approved since, one with no reason, or one older than 120 days)', /Earlier funnels were sent back\. What the team said: “Funnel: weak hook\. Open with the cost of month-end reporting\.”\. Do not repeat these\./.test(note) && !/wrong offer|From the spring/.test(note), note);
    check('…after the guardrails, which still go in whole', note.indexOf('Never use these phrases: game-changer; revolutionary.') >= 0 && note.indexOf('Include this disclosure exactly as written') >= 0 && note.indexOf('Include this disclosure') < note.indexOf('House rules:') && note.indexOf('House rules:') < note.indexOf('Earlier funnels'), note);
    check('…within the 1500 characters the Funnel Builder reads', note.length <= 1500, String(note.length));
    await page.click('#v111Cats_mg .v111-cat[data-c="direct_to_call"]'); await wait(page, 900);
    await page.fill('#v97MgWhat', 'Ads for the AI Readiness Diagnostic');
    await page.click('#v97MgGoBtn'); await wait(page, 2200);
    const req = String(((last(hooks, /e3-low-ticket-run/) || {}).b || {}).request || '');
    check('Book a call carries the same, within the 1200 characters the Low-Ticket Agent reads', /House rules: Say advisers, not advisors; Never promise specific savings\./.test(req) && /Earlier funnels were sent back/.test(req) && /Never use these phrases: game-changer; revolutionary\./.test(req) && req.length <= 1200, req.length + ' ' + req.slice(-400));
    await ctx.close();
  }

  // 3. many long rules: the guardrails still fit, the rules are shortened, and the pane says so
  if (want('long')) {
    const many = Array.from({ length: 20 }, (_, i) => rule(String(10 + i), 'A long house rule number ' + i + ' that explains in some detail how every piece of copy should be written for our buyers', ['all']));
    const store = makeStore(tables({ rules: many }));
    const { ctx, page, hooks } = await open(1440, store, '/dashboard/marketing-generation');
    await page.click('#v111Cats_mg .v111-cat[data-c="direct_to_call"]'); await wait(page, 900);
    const uses = await txt(page, '#nwMgSideB .nw-uses');
    check('With more rules than fit, the pane says they were shortened', /Follows your house rules, shortened to fit/.test(uses), uses);
    await page.fill('#v97MgWhat', 'Ads for the AI Readiness Diagnostic');
    await page.click('#v97MgGoBtn'); await wait(page, 2200);
    const req = String(((last(hooks, /e3-low-ticket-run/) || {}).b || {}).request || '');
    check('The guardrails still go in whole, and the request stays within 1200 characters', /Never use these phrases: game-changer; revolutionary\./.test(req) && /Include this disclosure exactly as written: Past results do not guarantee future outcomes\./.test(req) && /House rules: /.test(req) && req.length <= 1200, req.length + ' ' + req.slice(-300));
    await ctx.close();
  }

  // 4. AI settings: where these apply, and Make it a rule on a funnel's reason
  if (want('ai')) {
    const store = makeStore(tables());
    const { ctx, page } = await open(1440, store, '/dashboard/ai-settings');
    await wait(page, 600);
    const where = await page.$$eval('.ap-ais .ap-where > div', (els) => els.map((el) => [(el.querySelector('b') || {}).textContent || '', (el.querySelector('small') || {}).textContent || '']));
    check('Where these apply: book a call and low-ticket follow the rules now', where.some((w) => w[0] === 'Book a call and low-ticket campaigns' && /^Rules for Everything and the Pipeline agents/.test(w[1])), JSON.stringify(where));
    check('…and so does the Funnel Builder', where.some((w) => /^Funnel builder/.test(w[0]) && /^Rules for Everything and the Pipeline agents/.test(w[1]) && /funnels were turned down/.test(w[1])), JSON.stringify(where));
    const row = page.locator('#apFbList .ap-fb', { hasText: 'Open with the cost of month-end reporting' });
    check('A funnel\'s reason is listed under From your feedback', await row.count() === 1);
    await row.locator('button', { hasText: 'Make it a rule' }).click(); await wait(page, 400);
    const box = await ev(page, () => [...document.querySelectorAll('.ap-rule-opts input')].filter((i) => i.checked).map((i) => i.value));
    check('Make it a rule scopes it to the Pipeline agents, which the campaigns read', JSON.stringify(box) === '["engine3"]', JSON.stringify(box));
    await ctx.close();
  }

  // 5. on a phone
  if (want('phone')) {
    const store = makeStore(tables());
    const { ctx, page } = await open(390, store, '/dashboard/marketing-generation');
    await openFun(page);
    await page.click('#v113FunD .nw-d-foot button:has-text("Send back")'); await page.waitForSelector('#v150M');
    check('On a phone the question fits', await ev(page, () => document.documentElement.scrollWidth <= innerWidth + 1));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
