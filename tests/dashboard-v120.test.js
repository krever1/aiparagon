// v120 tests for new-aiparagon-dashboard.html (#1): Put it live on a landing page whose campaign is not approved
// asks once ("Approve and put it live"), then approves the campaign (funnel_packages status approved, plus an
// agent_feedback row saying who did it and how) and puts the page live. An approved campaign goes live in one click,
// a sent-back funnel says so, a refused approval leaves the page as it was, and the picker says Approved the way
// Marketing Generation does (a book-a-call campaign with every ad approved counts).
// And the Lead pipeline as a board: a column per step, each lead where its last finished step is, the card's Run
// button and drag and drop both ask first, then start the run (what each start point sends, with the lead's earlier
// documents), a running card, Discovery and growth plan documents linked back to their lead by name, the drops it
// refuses, and the layout at 1024 and 390 wide.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v120.test.js
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
const BOOK = '00000000-0000-4000-8000-0000000000b1';     // the fixtures' book-a-call campaign, waiting for approval
const WEBINAR = '00000000-0000-4000-8000-0000000000b2';  // a Funnel Builder webinar, approved
const SENT = '00000000-0000-4000-8000-0000000000b3';     // a newsletter funnel that was sent back
const PG = { book: '00000000-0000-4000-8000-0000000c2001', web: '00000000-0000-4000-8000-0000000c2002', sent: '00000000-0000-4000-8000-0000000c2003',
  gone: '00000000-0000-4000-8000-0000000c2004', paused: '00000000-0000-4000-8000-0000000c2005' };

function page(id, slug, kind, src, extra) {
  return Object.assign({ id, slug, title: slug.replace(/-/g, ' '), status: 'draft', kind, source_type: 'funnel_package', source_id: src, source_run: null,
    content: { headline: 'A headline for ' + slug, subheadline: 'Under it', bullets: ['One', 'Two'], cta: 'Sign me up', fields: ['name', 'email'],
      thanks: { headline: 'Thanks', body: 'See you soon', cta: '', url: kind === 'book_call' ? 'https://calendly.com/qa/intro' : '' } },
    ads: [{ code: 'PQ7RS-A1', n: 1, hook: 'Hook one' }], add_to_pipeline: true, created_at: '2026-10-15T10:00:00Z', updated_at: '2026-10-15T10:00:00Z', published_at: null }, extra || {});
}
function tables(o) {
  o = o || {};
  const t = FX.tables();
  t.lp_signups = []; t.lp_views = [];
  t.funnel_packages.push(
    { id: WEBINAR, run_id: 'funnel_2026-10-14_1200_abcd', funnel_type: 'webinar', status: 'approved', created_at: '2026-10-14T12:00:00Z', setup: { title: 'Governed AI for RIAs' }, steps: [] },
    { id: SENT, run_id: 'funnel_2026-10-13_0900_efgh', funnel_type: 'newsletter_signup', status: 'draft', created_at: '2026-10-13T09:00:00Z', setup: { title: 'The Monday memo' }, steps: [] });
  t.landing_pages = [
    page(PG.book, 'book-the-diagnostic', 'book_call', BOOK),
    page(PG.web, 'governed-ai-webinar', 'webinar', WEBINAR),
    page(PG.sent, 'monday-memo', 'newsletter_signup', SENT),
    page(PG.gone, 'old-campaign-page', 'landing', '00000000-0000-4000-8000-0000000000ff'),
  ];
  if (o.paused) t.landing_pages.push(page(PG.paused, 'paused-diagnostic', 'book_call', BOOK, { status: 'paused', published_at: '2026-10-16T10:00:00Z' }));
  if (o.adsApproved) {
    const out = t.agent_outputs.find((x) => x.run_id === 'lt_2026-10-11');
    const d = JSON.parse(out.data); d.ad_images = [{ file: 'lt-qa-a.png', variant: 'A' }, { file: 'lt-qa-b.png', variant: 'B' }]; out.data = JSON.stringify(d);
    t.agent_feedback.push({ id: 'fb1', agent: 'low_ticket_content', target_type: 'ad_image_variant', target_id: 'lt-qa-a.png', action: 'approved', author: 'QA Tester', created_at: '2026-10-12T10:00:00Z' },
      { id: 'fb2', agent: 'low_ticket_content', target_type: 'ad_image_variant', target_id: 'lt-qa-b.png', action: 'approved', author: 'QA Tester', created_at: '2026-10-12T10:01:00Z' });
  }
  return t;
}

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(o, url, width) {
    o = o || {};
    const t = tables(o);
    if (o.more) o.more(t);
    const store = makeStore(t);
    const hooks = [];
    const hook = (u, m, b) => { let j = null; try { j = JSON.parse(b || ''); } catch (e) {} hooks.push({ p: u.replace(/^https:\/\/n8n\.aiparagonconsulting\.com\/webhook\//, ''), b: j }); return o.hookFail ? { status: 500, body: { message: 'boom' } } : { body: { ok: true } }; };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    await page.setViewportSize({ width: width || 1280, height: 860 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + (url || '/dashboard/landing-pages'), { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1500);
    return { ctx, page, store, hooks };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 700);
  const txt = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
  const writes = (store, table, method) => store.writes.filter((w) => w.table === table && w.method === method);
  const body = (w) => (w && (Array.isArray(w.body) ? w.body[0] : w.body)) || {};
  async function edit(page, id) {
    await page.click('#main .v115-lp-row[data-id="' + id + '"] button:has-text("Edit")'); await wait(page, 600);
  }
  // the editor's go-live button, whatever it says at the moment
  const goLive = (page) => page.locator('#v115LpD .nw-d-foot button', { hasText: /put it live/i }).first().click();

  // 1. a campaign that is not approved: the first click asks, the second approves it, then the page goes live
  {
    const { ctx, page, store } = await open();
    await edit(page, PG.book);
    check('the editor offers Put it live', (await txt(page, '#v115E-live')) === 'Put it live', await txt(page, '#v115E-live'));
    await goLive(page); await wait(page, 900);
    check('the first click saves nothing', writes(store, 'landing_pages', 'PATCH').length === 0 && writes(store, 'funnel_packages', 'PATCH').length === 0 && writes(store, 'agent_feedback', 'POST').length === 0,
      JSON.stringify(store.writes.map((w) => w.table + ' ' + w.method)));
    check('it says the campaign is not approved and that going live approves it', /This campaign is not approved yet\. Putting the page live approves it\./.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    check('the button becomes Approve and put it live', (await txt(page, '#v115E-live')) === 'Approve and put it live', await txt(page, '#v115E-live'));
    await goLive(page); await wait(page, 1200);
    const fp = writes(store, 'funnel_packages', 'PATCH');
    check('the second click approves the campaign', fp.length === 1 && body(fp[0]).status === 'approved' && JSON.stringify(fp[0].filters) === JSON.stringify([['id', 'eq.' + BOOK]]), JSON.stringify(fp));
    const fb = writes(store, 'agent_feedback', 'POST').map(body);
    check('and records who approved it, and how', fb.length === 1 && fb[0].target_type === 'funnel_package' && fb[0].target_id === BOOK && fb[0].action === 'approved' &&
      fb[0].agent === 'low_ticket_content' && /^Approved by putting its landing page live \(\/go\/book-the-diagnostic\)$/.test(fb[0].feedback) && !!fb[0].author, JSON.stringify(fb));
    const lp = writes(store, 'landing_pages', 'PATCH');
    check('then the page goes live', lp.length === 1 && body(lp[0]).status === 'live' && !!body(lp[0]).published_at, JSON.stringify(lp.map(body).map((b) => b.status)));
    check('the campaign is approved before the page goes live', store.writes.indexOf(fp[0]) < store.writes.indexOf(lp[0]));
    check('the message says both', /^Campaign approved\. It is live at aiparagon\.vercel\.app\/go\/book-the-diagnostic/.test(await txt(page, '#nwToast')), await txt(page, '#nwToast'));
    const camp = await page.evaluate(async () => { V97.cache.lt = null; const L = await v97LtLoad(true); const o = L.outs.find((x) => x.run_id === 'lt_2026-10-11'); return o ? v97CampStatus(L, o).t : 'no campaign'; });
    check('Marketing Generation now counts the campaign as approved', camp === 'Approved', camp);
    await page.evaluate(() => nwModalClose && nwModalClose());
    await page.click('#main .nw-ph-actions button:has-text("Put a page live")'); await wait(page, 1200);
    const pick = await page.evaluate(() => [...document.querySelectorAll('#v115PickB .nw-row')].map((r) => r.innerText.replace(/\s+/g, ' ')));
    check('the picker says Approved for it, Approved for the webinar and Sent back for the newsletter', pick.some((x) => /Book a call/.test(x) && /Approved/.test(x) && !/Not approved yet/.test(x)) &&
      pick.some((x) => /Governed AI for RIAs/.test(x) && /Approved/.test(x)) && pick.some((x) => /The Monday memo/.test(x) && /Sent back/.test(x)), JSON.stringify(pick));
    await ctx.close();
  }

  // 2. an approved campaign goes live in one click, with no approval written
  {
    const { ctx, page, store } = await open();
    await edit(page, PG.web);
    await goLive(page); await wait(page, 1200);
    const lp = writes(store, 'landing_pages', 'PATCH');
    check('an approved campaign\'s page goes live in one click', lp.length === 1 && body(lp[0]).status === 'live', JSON.stringify(lp.map(body)));
    check('without touching the campaign or writing an approval', writes(store, 'funnel_packages', 'PATCH').length === 0 && writes(store, 'agent_feedback', 'POST').length === 0);
    check('and the message is the usual one', /^It is live at aiparagon\.vercel\.app\/go\/governed-ai-webinar/.test(await txt(page, '#nwToast')), await txt(page, '#nwToast'));
    await ctx.close();
  }

  // 3. a sent-back funnel says so; going live approves it anyway, as funnel_builder
  {
    const { ctx, page, store } = await open();
    await edit(page, PG.sent);
    await goLive(page); await wait(page, 900);
    check('a sent-back campaign says it was sent back', /This campaign was sent back for changes\. Putting the page live approves it anyway\./.test(await txt(page, '#v115E-msg')) && writes(store, 'landing_pages', 'PATCH').length === 0, await txt(page, '#v115E-msg'));
    await goLive(page); await wait(page, 1200);
    const fb = writes(store, 'agent_feedback', 'POST').map(body);
    check('confirming approves it as the Funnel Builder\'s', fb.length === 1 && fb[0].agent === 'funnel_builder' && fb[0].target_id === SENT && body(writes(store, 'funnel_packages', 'PATCH')[0]).status === 'approved', JSON.stringify(fb));
    check('and the page goes live', body(writes(store, 'landing_pages', 'PATCH')[0]).status === 'live');
    await ctx.close();
  }

  // 4. an approval Supabase refuses keeps the page as it was
  {
    const { ctx, page, store } = await open();
    store.db.__lock = { funnel_packages: true };
    await edit(page, PG.book);
    await goLive(page); await wait(page, 900);
    await goLive(page); await wait(page, 1200);
    check('a refused approval says so by the buttons', /Could not approve the campaign, so the page did not go live: Supabase did not save it/.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    check('and the page stays a draft', writes(store, 'landing_pages', 'PATCH').length === 0 && store.db.landing_pages.find((p) => p.id === PG.book).status === 'draft' && writes(store, 'agent_feedback', 'POST').length === 0);
    await ctx.close();
  }

  // 5. a page whose campaign is gone goes live as before; Save and Preview never ask
  {
    const { ctx, page, store } = await open();
    await edit(page, PG.book);
    await page.click('#v115LpD .nw-d-foot button:has-text("Save")'); await wait(page, 900);
    const sv = writes(store, 'landing_pages', 'PATCH');
    check('Save on a draft does not ask or approve', sv.length === 1 && !('status' in body(sv[0])) && writes(store, 'funnel_packages', 'PATCH').length === 0, JSON.stringify(sv.map(body).map((b) => b.status)));
    await edit(page, PG.gone);
    await goLive(page); await wait(page, 1200);
    const lp = writes(store, 'landing_pages', 'PATCH');
    check('a page whose campaign is gone goes live in one click', lp.length === 2 && body(lp[1]).status === 'live' && writes(store, 'funnel_packages', 'PATCH').length === 0, JSON.stringify(lp.map(body).map((b) => b.status)));
    await ctx.close();
  }

  // 6. putting a paused page back live asks too, when its campaign is not approved
  {
    const { ctx, page, store } = await open({ paused: true });
    await edit(page, PG.paused);
    await goLive(page); await wait(page, 900);
    check('putting a paused page live again asks first', /not approved yet/.test(await txt(page, '#v115E-msg')) && writes(store, 'landing_pages', 'PATCH').length === 0, await txt(page, '#v115E-msg'));
    await ctx.close();
  }

  // 7. a book-a-call campaign with every ad approved counts as approved: no question
  {
    const { ctx, page, store } = await open({ adsApproved: true });
    await page.click('#main .nw-ph-actions button:has-text("Put a page live")'); await wait(page, 1200);
    const pick = await page.evaluate(() => [...document.querySelectorAll('#v115PickB .nw-row')].map((r) => r.innerText.replace(/\s+/g, ' ')));
    check('the picker says Approved when every ad is', pick.some((x) => /Book a call/.test(x) && /Approved/.test(x) && !/Not approved yet/.test(x)), JSON.stringify(pick));
    await page.evaluate(() => nwModalClose());
    await edit(page, PG.book);
    await goLive(page); await wait(page, 1200);
    check('its page goes live in one click', body(writes(store, 'landing_pages', 'PATCH')[0]).status === 'live' && writes(store, 'funnel_packages', 'PATCH').length === 0);
    await ctx.close();
  }

  // ---------- the Lead pipeline as a board ----------
  const L1 = FX.L1, L2 = FX.L2, L3 = FX.L3;   // Pat QA (all five steps), Robin Test (lead research), Sam Sample (nothing yet)
  const DOC = (a) => 'QA' + a.replace(/_/g, '') + 'Doc0123456789abcdef';   // the fixtures' Google Doc ids
  const card = (email) => '#v120Board .v120-card[data-email="' + email + '"]';
  const col = (k) => '#v120Board .v120-col[data-k="' + k + '"]';
  const board = (page) => page.evaluate(() => {
    const B = document.getElementById('v120Board'), S = document.getElementById('apE1List');
    return { on: !!B && B.getClientRects().length > 0, list: !!S && S.getClientRects().length > 0,
      cols: [...document.querySelectorAll('#v120Board .v120-col')].map((c) => ({ k: +c.dataset.k, name: c.querySelector('.v120-col-h').childNodes[1].textContent.trim(),
        n: +c.querySelector('.v120-col-h .c').textContent, cards: [...c.querySelectorAll('.v120-card b')].map((b) => b.textContent) })) };
  });
  const ask = (page) => page.evaluate(() => { const M = document.getElementById('v120M'); return M ? { h: M.querySelector('h2').textContent,
    on: [...M.querySelectorAll('.v120-steps li.on')].map((x) => x.textContent), p: M.querySelector('.nw-m-body > p').textContent,
    again: (M.querySelector('p.nw-muted') || {}).textContent || '', note: !!M.querySelector('#v120Note'), hint: (M.querySelector('.nw-lbl small') || {}).textContent || '' } : null; });
  const custom = (hooks) => hooks.filter((x) => x.p === 'e1-custom-run-erica');
  const runLine = (page, email) => page.evaluate((s) => { const e = document.querySelector(s); return e ? { run: (e.querySelector('.run') || {}).textContent || '', drag: e.getAttribute('draggable'), btn: !!e.querySelector('.v120-next') } : null; }, card(email));
  const out = (email, agent, extra) => Object.assign({ id: '00000000-0000-4000-8000-0000000e' + String(Math.floor(Math.random() * 9000) + 1000), run_id: email, agent, output_type: 'json', title: agent,
    created_at: new Date().toISOString(), content_md: '# ' + agent, data: { status: 'success', prospectName: 'Robin Test', companyName: 'Testwell Partners', documentId: 'QA' + agent.replace(/_/g, '') + 'Robin0123456789ab' } }, extra || {});

  // 8. the page opens on the board: a column per step, each lead where its last finished step is
  {
    const { ctx, page } = await open({}, '/dashboard/lead-pipeline');
    let s = await board(page);
    check('the Lead pipeline opens on the board, the list hidden', s.on && !s.list && (await page.evaluate(() => RD.aptab.e1pipeline)) === 'board', JSON.stringify({ on: s.on, list: s.list }));
    check('a column per step, in order', JSON.stringify(s.cols.map((c) => c.name)) === JSON.stringify(['New', 'Researched', 'Interview', 'Assessment', 'Discovery call', 'Growth plan']), JSON.stringify(s.cols.map((c) => c.name)));
    check('each lead sits where its last finished step is, with counts', s.cols[0].cards.join() === 'Sam Sample' && s.cols[1].cards.join() === 'Robin Test' && s.cols[5].cards.join() === 'Pat QA' &&
      JSON.stringify(s.cols.map((c) => c.n)) === JSON.stringify([1, 1, 0, 0, 0, 1]), JSON.stringify(s.cols));
    const btns = await page.evaluate(() => [...document.querySelectorAll('#v120Board .v120-card')].map((c) => (c.querySelector('.v120-next') || {}).textContent || ''));
    check('each card offers its next step, the last step none', JSON.stringify(btns) === JSON.stringify(['Run lead research', 'Run interview', '']), JSON.stringify(btns));
    await page.click('#apChrome .rd-tab[data-tab="all"]'); await wait(page, 600);
    s = await board(page);
    check('the other tabs still show the list', !s.on && s.list, JSON.stringify({ on: s.on, list: s.list }));
    await page.click('#apChrome .rd-tab[data-tab="board"]'); await wait(page, 600);
    s = await board(page);
    check('and Board brings the board back', s.on && !s.list, JSON.stringify({ on: s.on, list: s.list }));
    await page.fill('#v120Board .v120-tools input', 'testwell'); await wait(page, 300);
    s = await board(page);
    check('search narrows the cards', s.cols.reduce((n, c) => n + c.cards.length, 0) === 1 && (await txt(page, '#v120Board .v120-n')) === '1 of 3 shown', await txt(page, '#v120Board .v120-n'));
    await page.fill('#v120Board .v120-tools input', ''); await wait(page, 300);
    await page.click(card(L2) + ' b'); await wait(page, 1200);
    let v = await page.evaluate(() => ({ view: state.view, lead: state.e1Lead, path: location.pathname }));
    check('a card opens its lead', v.view === 'e1lead' && v.lead === L2 && v.path === '/dashboard/lead-pipeline', JSON.stringify(v));
    await page.evaluate(() => apGo('e1pipeline')); await wait(page, 1500);
    await page.focus(card(L3)); await page.keyboard.press('Enter'); await wait(page, 1200);
    v = await page.evaluate(() => ({ view: state.view, lead: state.e1Lead }));
    check('Enter on a card opens it too', v.view === 'e1lead' && v.lead === L3, JSON.stringify(v));
    await ctx.close();
  }

  // 9. the card's Run button asks, then starts the run with the documents on file; the card shows the run
  {
    const { ctx, page, store, hooks } = await open({}, '/dashboard/lead-pipeline');
    await page.click(card(L2) + ' .v120-next'); await wait(page, 600);
    const m = await ask(page);
    check('Run interview asks first, naming what runs', m && m.h === 'Run the interview script for Robin Test?' && JSON.stringify(m.on) === JSON.stringify(['Interview', 'Assessment', 'Discovery call', 'Growth plan']) &&
      /^The interview script runs first, then the assessment, the discovery call framework and the growth plan follow on their own\. Each document shows up on the lead when it is done\.$/.test(m.p), JSON.stringify(m));
    check('with the research on file it asks for no notes, and starts nothing yet', m && !m.note && !m.again && custom(hooks).length === 0, JSON.stringify(m));
    await page.click('#v120Go'); await wait(page, 1200);
    const h = custom(hooks)[0];
    check('Run it starts the custom run at the interview script, with the lead\'s details', h && h.b.entry === 'interview_script' && h.b.emailAddress === L2 && h.b.prospectName === 'Robin Test' &&
      h.b.firstName === 'Robin' && h.b.lastName === 'Test' && h.b.companyName === 'Testwell Partners' && h.b.from === 'board' && !!h.b.auth, JSON.stringify(h && h.b));
    check('and the research document it works from', h && h.b.researchDocId === DOC('lead_research') && h.b.interviewDocId === '' && h.b.anonymizedDocId === '' && h.b.transcript === '', JSON.stringify(h && h.b));
    check('the question closes and says it started', !(await page.$('#v120M')) && /^Started\. The interview script shows up on the lead when it is done\./.test(await txt(page, '#nwToast')), await txt(page, '#nwToast'));
    let c = await runLine(page, L2);
    check('the card shows the run, with no Run button and no drag meanwhile', c && c.run === 'Writing the interview script' && c.drag === null && !c.btn, JSON.stringify(c));
    check('the run is kept with the workspace', await page.evaluate((e) => !!(RD.e1run && RD.e1run[e] && RD.e1run[e].k === 1), L2));
    store.db.agent_outputs.push(out(L2, 'interview_script'));
    await page.evaluate(async () => { await v120Reload(); v120Paint(); }); await wait(page, 300);
    const s = await board(page);
    c = await runLine(page, L2);
    check('when the interview script lands the card moves to Interview, writing the assessment', s.cols[2].cards.join() === 'Robin Test' && c.run === 'Writing the assessment', JSON.stringify(s.cols.map((x) => x.cards)) + ' ' + JSON.stringify(c));
    ['anonymizer', 'discovery_call', 'growth_plan'].forEach((a) => store.db.agent_outputs.push(out(L2, a)));
    await page.evaluate(async () => { await v120Reload(); v120Paint(); }); await wait(page, 300);
    c = await runLine(page, L2);
    check('when the growth plan lands the run is over', (await board(page)).cols[5].cards.includes('Robin Test') && c.run === '' && !(await page.evaluate((e) => !!(RD.e1run || {})[e], L2)), JSON.stringify(c));
    await page.evaluate((e) => { RD.e1run[e] = { k: 1, t0: Date.now() - 46 * 60e3 }; v120Paint(); }, L3); await wait(page, 200);
    c = await runLine(page, L3);
    check('a run with no news for 45 minutes stops showing as running', c && c.run === '' && c.btn && !(await page.evaluate((e) => !!(RD.e1run || {})[e], L3)), JSON.stringify(c));
    await ctx.close();
  }

  // 10. drag and drop: a lead dragged to a step asks first; notes stand in for what a lead does not have yet
  {
    const { ctx, page, store, hooks } = await open({}, '/dashboard/lead-pipeline');
    await page.dragAndDrop(card(L3), col(2)); await wait(page, 700);
    const m = await ask(page);
    check('dragging a lead to a step asks first', m && m.h === 'Run the assessment for Sam Sample?', JSON.stringify(m));
    check('a step the lead has nothing for asks for notes', m && m.note && /^Needed: this lead has no interview script yet/.test(m.hint), JSON.stringify(m));
    await page.click('#v120Go'); await wait(page, 900);
    check('and will not start without them', custom(hooks).length === 0 && /Paste a call transcript or notes first/.test(await txt(page, '#v120Msg')), await txt(page, '#v120Msg'));
    await page.fill('#v120Note', 'Synthetic prequalification call notes.');
    await page.click('#v120Go'); await wait(page, 1200);
    const h = custom(hooks)[0];
    check('with notes it starts at the assessment, the notes standing in', h && h.b.entry === 'anonymizer' && h.b.transcript === 'Synthetic prequalification call notes.' && h.b.researchDocId === '' && h.b.interviewDocId === '', JSON.stringify(h && h.b));
    await page.dragAndDrop(card(L1), col(3)); await wait(page, 700);
    const m2 = await ask(page);
    check('a step already done runs again, and says so', m2 && m2.h === 'Run the discovery call framework for Pat QA?' && m2.again === 'The discovery call framework and the steps after it are written again. Earlier versions stay in Files.', JSON.stringify(m2));
    check('Discovery asks for no notes: it works from the assessment', m2 && !m2.note);
    await page.click('#v120Go'); await wait(page, 1200);
    const h2 = custom(hooks)[1];
    check('it starts at Discovery with the assessment, the interview script and the research', h2 && h2.b.entry === 'discovery_call' && h2.b.anonymizedDocId === DOC('anonymizer') &&
      h2.b.interviewDocId === DOC('interview_script') && h2.b.researchDocId === DOC('lead_research') && h2.b.transcript === '', JSON.stringify(h2 && h2.b));
    let c3 = await runLine(page, L1);
    check('a step run again shows as running though its old document is on file', c3 && c3.run === 'Writing the discovery call framework', JSON.stringify(c3));
    store.db.agent_outputs.push(Object.assign(out(L1, 'discovery_call'), { created_at: new Date(Date.now() - 10 * 60e3).toISOString() }));
    await page.evaluate(async () => { await v120Reload(); v120Paint(); }); await wait(page, 300);
    c3 = await runLine(page, L1);
    check('a new document counts by Supabase\'s own time, even with this computer\'s clock ahead', c3 && c3.run === 'Writing the growth plan', JSON.stringify(c3));
    await ctx.close();
  }

  // 11. drops it refuses: past a missing assessment, onto New, onto its own step
  {
    const { ctx, page, hooks } = await open({}, '/dashboard/lead-pipeline');
    await page.hover(card(L2)); await page.mouse.down();
    const box = await page.locator(col(3)).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 80, { steps: 6 }); await wait(page, 200);
    const faded = await page.evaluate(() => [...document.querySelectorAll('#v120Board .v120-col')].map((c) => c.classList.contains('no')));
    await page.mouse.up(); await wait(page, 600);
    check('while dragging, the steps a lead cannot go to fade', JSON.stringify(faded) === JSON.stringify([true, true, false, false, true, true]), JSON.stringify(faded));
    check('a lead with no assessment cannot be dropped on Discovery', !(await page.$('#v120M')));
    await page.dragAndDrop(card(L2), col(-1)); await wait(page, 500);
    check('nor on New', !(await page.$('#v120M')));
    await page.dragAndDrop(card(L1), col(4)); await wait(page, 500);
    check('nor on the step it is already on, and nothing ran', !(await page.$('#v120M')) && custom(hooks).length === 0 && !hooks.some((x) => x.p === '870a1ffa-cbc6-4085-894a-6f3bc90a40f2'), JSON.stringify(hooks.map((x) => x.p)));
    await ctx.close();
  }

  // 12. the growth plan on its own, a full run from New, and a start that n8n refuses
  {
    const more = (t) => { t.agent_outputs.push(Object.assign(out(L2, 'anonymizer'), { created_at: '2026-10-13T12:00:00Z' })); };
    const { ctx, page, hooks } = await open({ more }, '/dashboard/lead-pipeline');
    check('a lead with an assessment sits on Assessment', (await board(page)).cols[3].cards.join() === 'Robin Test');
    await page.dragAndDrop(card(L2), col(4)); await wait(page, 700);
    const m = await ask(page);
    check('the growth plan can start straight after the assessment, on its own', m && m.h === 'Run the growth plan for Robin Test?' && /^Only the growth plan runs\./.test(m.p) && !m.note, JSON.stringify(m));
    await page.click('#v120Go'); await wait(page, 1200);
    const h = custom(hooks)[0];
    check('it sends the assessment it works from', h && h.b.entry === 'growth_plan' && h.b.anonymizedDocId === 'QAanonymizerRobin0123456789ab', JSON.stringify(h && h.b));
    await page.click(card(L3) + ' .v120-next'); await wait(page, 600);
    const m2 = await ask(page);
    check('Run lead research asks before the full run', m2 && m2.h === 'Run lead research for Sam Sample?' && /^Lead research runs first, then the interview script, the assessment, the discovery call framework and the growth plan follow on their own\./.test(m2.p) && !m2.note, JSON.stringify(m2));
    await page.click('#v120Go'); await wait(page, 1200);
    const f = hooks.find((x) => x.p === '870a1ffa-cbc6-4085-894a-6f3bc90a40f2');
    check('and starts the full run with the intake form\'s fields', f && !('entry' in f.b) && f.b.firstName === 'Sam' && f.b.lastName === 'Sample' && f.b.companyName === 'Sample Nonprofit' && f.b.emailAddress === L3 && f.b.hearAboutUs === 'Dashboard run', JSON.stringify(f && f.b));
    await ctx.close();
    const x = await open({ hookFail: true }, '/dashboard/lead-pipeline');
    await x.page.click(card(L2) + ' .v120-next'); await wait(x.page, 600);
    await x.page.click('#v120Go'); await wait(x.page, 1200);
    check('a start n8n refuses says so and keeps the question open', !!(await x.page.$('#v120M')) && /^Could not start it: Webhook returned 500\. Try again in a minute\.$/.test(await txt(x.page, '#v120Msg')), await txt(x.page, '#v120Msg'));
    check('and shows no run', (await runLine(x.page, L2)).run === '' && !(await x.page.evaluate((e) => !!(RD.e1run || {})[e], L2)));
    await x.ctx.close();
  }

  // 13. Discovery and growth plan documents saved under the anonymizer's placeholder go back to their lead, by name
  {
    const holder = 'contact@deltaadvisory.com';
    const more = (t) => {
      const d = (who, a) => ({ status: 'success', prospectName: who, companyName: 'Delta Advisory', documentId: 'QA' + a + who.replace(/\W/g, '') + '0123456789', pdfUrl: 'https://drive.google.com/file/d/QA' + a + 'Pdf0123456789abcdef/view' });
      t.agent_outputs.push(Object.assign(out(holder, 'discovery_call'), { created_at: '2026-10-13T12:00:00Z', data: d('Robin Test', 'disco') }),
        Object.assign(out(holder, 'growth_plan'), { created_at: '2026-10-13T13:00:00Z', data: d('Robin Test', 'growth') }),
        Object.assign(out(holder, 'discovery_call'), { created_at: '2026-10-13T14:00:00Z', data: d('Nobody Known', 'disco') }));
    };
    const { ctx, page } = await open({ more }, '/dashboard/lead-pipeline');
    const s = await board(page);
    check('a lead\'s Discovery and growth plan documents count for that lead', s.cols[5].cards.includes('Robin Test') && s.cols[5].cards.includes('Pat QA'), JSON.stringify(s.cols.map((c) => c.cards)));
    const st = await page.evaluate((e) => { const l = window._e1.leads.find((x) => x.email === e); return E1_STAGES.map((x) => e1StageState(l, window._e1.outs, x).done ? 1 : 0).join(''); }, L2);
    check('on the lead itself: research, Discovery and the growth plan done', st === '10011', st);
    const other = await page.evaluate((e) => window._e1.outs.filter((o) => o.run_id === e && o.agent === 'discovery_call').length, L2);
    check('a document for a name no lead has stays off every lead', other === 1, String(other));
    await page.evaluate(() => apGo('deliverables')); await wait(page, 1800);
    const dl = await page.evaluate(() => (V115.dl.rows || []).filter((r) => r.who === 'Robin Test').map((r) => r.title).sort().join(' | '));
    check('Deliverables lists them on the lead too', dl === 'Discovery Call Framework | Growth Plan Proposal | Lead Research', dl);
    await ctx.close();
  }

  // 14. the older Run buttons ask the same question; the board at 1024 and 390 wide
  {
    const { ctx, page } = await open({}, '/dashboard/lead-pipeline', 1024);
    let g = await page.evaluate(() => getComputedStyle(document.querySelector('#v120Board .v120-kan')).gridTemplateColumns.split(' ').length);
    check('at 1024 wide the steps sit in two rows of three', g === 3, String(g));
    await page.evaluate((e) => apRunStage(e, 'growth_plan'), L1); await wait(page, 700);
    check('an older Run button opens the same question', ((await ask(page)) || {}).h === 'Run the growth plan for Pat QA?', JSON.stringify(await ask(page)));
    await page.evaluate(() => nwModalClose());
    await page.setViewportSize({ width: 390, height: 860 }); await wait(page, 600);
    g = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector('#v120Board .v120-kan')).gridTemplateColumns.split(' ').length, sw: document.documentElement.scrollWidth }));
    check('on a phone the steps stack, with no sideways scroll', g.cols === 1 && g.sw <= 390, JSON.stringify(g));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
