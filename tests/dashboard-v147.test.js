// v147 tests for new-aiparagon-dashboard.html (#1): Marketing Generation starts a campaign from the team's own content
// (Engine 3, User 2): pick a library piece, earlier material or paste it; one Generate sends the campaign to the
// Low-Ticket Agent or the Funnel Builder with the content and the organic brief in place of the ads brief, and writes
// the posts picked from the same content through Content from Source. Works with no ads brief on file; the market
// briefs path is as before. Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data
// (lib/qa-fixtures.js); n8n webhooks answer from stubs. Everyone is made up. Fails on the build before v147.
// Usage: node tests/dashboard-v147.test.js
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
const ESSAY = 'Most advisory firms lose two days a month to client reporting. We moved every report to a single owner and a fixed template, and the time came down to half a day. Here is what we changed, in order, and what we would do differently. ';
const PIECE = '00000000-0000-4000-8000-0000000c0001', REQ = '00000000-0000-4000-8000-0000000c0002';
function tables(extra) {
  const t = FX.tables();
  t.content_pieces = [{ id: PIECE, title: 'The two-day reporting tax', format: 'thought_leadership', body: ESSAY.repeat(3), status: 'ready', archived: false, created_at: ago(3) },
    { id: '00000000-0000-4000-8000-0000000c0003', title: 'Archived piece', format: 'thought_leadership', body: ESSAY.repeat(2), archived: true, created_at: ago(2) },
    { id: '00000000-0000-4000-8000-0000000c0004', title: 'Too short', format: 'email', body: 'Short.', archived: false, created_at: ago(1) }];
  t.content_requests = [{ id: REQ, title: 'Our podcast on onboarding', source_type: 'podcast', start_mode: 'source', source_text: ESSAY.repeat(2), takeaway: 'Onboarding is the first report', status: 'done', format: 'thought_leadership', created_at: ago(5) },
    { id: '00000000-0000-4000-8000-0000000c0005', title: 'From the organic brief', source_type: 'brief', start_mode: 'idea', thesis: 'x', status: 'done', format: 'thought_leadership', created_at: ago(4) }];
  if (extra) extra(t);
  return t;
}

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];
  async function open(width, store) {
    const hooks = [];
    const hook = (u, m, b) => {
      let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) {}
      hooks.push({ u, b: body });
      if (/\/e3-funnel-run/.test(u)) return { body: { ok: true, started: true, run_id: 'funnel_qa_v147' } };
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors });
    await page.setViewportSize({ width, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + '/dashboard/marketing-generation', { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1600);
    return { ctx, page, hooks };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 300);
  const last = (hooks, re) => hooks.filter((h) => re.test(h.u)).pop();
  const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  const own = async (page) => { await page.click('#v147W button:has-text("Your own content")'); await wait(page, 900); };

  // 1. the choice, what it lists, and the ads brief stepping aside
  {
    const store = makeStore(tables());
    const { ctx, page, hooks } = await open(1440, store);
    check('A campaign has Start from: the market briefs or your own content', await page.locator('#v147W [role=radio]').count() === 2 && /The market briefs/.test(await txt(page, '#v147W')));
    check('It starts on the market briefs, with the ads brief picker shown', !(await page.isHidden('#nwMgBriefAdW')) && await page.isHidden('#v147Box'));
    await own(page);
    check('Your own content hides the ads brief picker', await page.isHidden('#nwMgBriefAdW') && !(await page.isHidden('#v147Box')));
    const opts = await page.$$eval('#v147Src option', (o) => o.map((x) => x.textContent));
    check('It lists library pieces and earlier material, newest first, not archived, too short or brief-made ones', opts.some((x) => /The two-day reporting tax · Library/.test(x)) && opts.some((x) => /Our podcast on onboarding · Podcast/.test(x)) && !opts.some((x) => /Archived|Too short|From the organic brief/.test(x)) && /Paste it here/.test(opts[opts.length - 1]), JSON.stringify(opts));
    check('Generate waits until content is picked, and says so', await page.isDisabled('#v97MgGoBtn') && /Pick the content to start from/.test(await txt(page, '#nwMgSideB')));
    await page.selectOption('#v147Src', 'p:' + PIECE); await wait(page, 500);
    const side = await txt(page, '#nwMgSideB');
    check('The side says it uses your content and the organic brief, and also writes a LinkedIn post', /Your content ?“The two-day reporting tax”/.test(side) && /your content decides the angle/.test(side) && !/the brief decides/.test(side) && /Organic brief ?of/.test(side) && /Also writes ?LinkedIn post from the same content/.test(side), side);
    check('Generate is on', !(await page.isDisabled('#v97MgGoBtn')));
    await page.check('#v147W input[value="email"]'); await wait(page, 200);
    await page.fill('#v147Take', 'One owner per report');
    const n0 = store.db.content_requests.length;
    await page.click('#v97MgGoBtn'); await wait(page, 3500);
    const lt = last(hooks, /e3-low-ticket-run/), b = (lt && lt.b) || {};
    check('Book a call goes to the Low-Ticket Agent with your content in place of the ads brief', b.source_brief_run === null && b.own_content && b.own_content.title === 'The two-day reporting tax' && /two days a month/.test(b.own_content.text) && b.own_content.takeaway === 'One owner per report', JSON.stringify(Object.assign({}, b, { auth: undefined, own_content: b.own_content && b.own_content.title })));
    check('…with the organic brief\'s findings', b.organic_brief && Array.isArray(b.organic_brief.items) && b.organic_brief.items.length > 0 && /^\d{4}-\d\d-\d\d$/.test(b.organic_brief.day), JSON.stringify(b.organic_brief));
    check('…and everything the form adds as before (setup, plan)', b.setup && Array.isArray(b.plan) && b.plan.length > 0 && b.funnel_mode === 'direct_to_call');
    const reqs = store.db.content_requests.slice(n0);
    check('A LinkedIn post and an email are written from the same content', reqs.length === 2 && reqs.map((r) => r.format).sort().join() === 'email,thought_leadership' && reqs.every((r) => r.start_mode === 'source' && /two days a month/.test(r.source_text) && r.title === 'The two-day reporting tax' && r.takeaway === 'One owner per report' && r.status === 'queued'), JSON.stringify(reqs.map((r) => [r.format, r.start_mode, r.title])));
    const runs = hooks.filter((h) => /e3-content-run/.test(h.u)).map((h) => h.b.request_id);
    check('Each post is started in Content from Source', reqs.every((r) => runs.indexOf(r.id) >= 0), JSON.stringify(runs));
    check('The ads brief picker is back to the ads brief (nothing left behind)', await page.$$eval('#v97MgBrief option', (o) => o.every((x) => x.value !== 'own_content')));
    await ctx.close();
  }

  // 2. no ads brief on file: a campaign still starts from your content; pasted content; a webinar on the Funnel Builder
  {
    const store = makeStore(tables((t) => { t.creative_briefs = []; t.agent_outputs = t.agent_outputs.filter((o) => o.agent !== 'ad_strategist'); }));
    const { ctx, page, hooks } = await open(1440, store);
    check('With no ads brief, the market briefs path still asks for the Ad Strategist', await page.isDisabled('#v97MgGoBtn'));
    await own(page);
    await page.selectOption('#v147Src', 'paste'); await wait(page, 300);
    await page.fill('#v147Text', 'Too short to build on.'); await wait(page, 300);
    check('Pasted content needs a few paragraphs', await page.isDisabled('#v97MgGoBtn') && /Paste your content first/.test(await txt(page, '#nwMgSideB')));
    await page.fill('#v147Title', 'Notes from our webinar'); await page.selectOption('#v147Type', 'transcript');
    await page.fill('#v147Text', ESSAY.repeat(2)); await wait(page, 300);
    await page.uncheck('#v147W input[value="thought_leadership"]');
    await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await wait(page, 800);
    check('Your own content stays picked when the campaign changes', !(await page.isHidden('#v147Box')) && await page.inputValue('#v147Title') === 'Notes from our webinar');
    const n0 = store.db.content_requests.length;
    await page.click('#v97MgGoBtn'); await wait(page, 3000);
    const fr = last(hooks, /e3-funnel-run/), b = (fr && fr.b) || {};
    check('A webinar goes to the Funnel Builder from the pasted content, with no ads brief', b.funnel_type === 'webinar' && b.source_brief_run === null && b.own_content && b.own_content.title === 'Notes from our webinar' && b.own_content.type === 'transcript', JSON.stringify({ t: b.funnel_type, s: b.source_brief_run, o: b.own_content && b.own_content.title }));
    check('No posts when none are ticked', store.db.content_requests.length === n0);
    await ctx.close();
  }

  // 3. the market briefs path is as before
  {
    const store = makeStore(tables());
    const { ctx, page, hooks } = await open(1440, store);
    await page.fill('#v97MgWhat', 'Ads for the AI Readiness Diagnostic');
    await page.click('#v97MgGoBtn'); await wait(page, 3000);
    const b = (last(hooks, /e3-low-ticket-run/) || { b: {} }).b;
    check('The market briefs path sends the ads brief and no own content', b.source_brief_run && b.source_brief_run !== 'own_content' && !('own_content' in b) && !('organic_brief' in b), JSON.stringify({ s: b.source_brief_run, k: Object.keys(b) }));
    check('…and writes no posts', store.db.content_requests.length === 2);
    await ctx.close();
  }

  // 4. on a phone
  {
    const store = makeStore(tables());
    const { ctx, page } = await open(390, store);
    await own(page);
    await page.selectOption('#v147Src', 'paste'); await wait(page, 300);
    check('On a phone: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
