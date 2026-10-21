// v123 tests for new-aiparagon-dashboard.html (#1): book a call and low-ticket steps change like any funnel's.
// The plan pane: a step is renamed, told what to do and filled in, steps are added, removed and moved, and the ads
// step says how many ads; the ads and the main page stay (the Low-Ticket Agent always writes them). The Low-Ticket
// request carries the plan and the call length instead of notes squeezed into the request text, and Save as our
// default keeps the whole plan. A campaign made from a plan shows its steps on its page in that order, with their
// names; an added step opens in the whole funnel; a campaign made before keeps its four steps. Landing pages read
// such a campaign: no survey questions when it has no survey, and the booking link it saved.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks (Calendly, the Low-Ticket Agent) answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v123.test.js
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
const iso = (s) => new Date(s).toISOString();

// a book-a-call campaign written from a plan: the survey left out, the landing page renamed, a reminder email added
const RUN = 'agent3_2026-10-21_0933', PKG = '00000000-0000-4000-8000-0000000000b2';
const PLAN = [
  { key: 'ads', kind: 'ads', title: 'Ads', does: 'Ads with images.', note: 'Lead with the cost of manual work', n: 2 },
  { key: 'landing', kind: 'page', title: 'Bridge page', does: 'A short bridge page.', note: 'Name the diagnostic' },
  { key: 'step_5', kind: 'email', title: 'Reminder email', does: '', note: 'The day before the call' },
  { key: 'booking', kind: 'booking', title: 'Booking page', does: 'They pick a time.', note: '' },
];
const STEPS = [{ key: 'step_5', kind: 'email', title: 'Reminder email', content: { subject: 'Your diagnostic is tomorrow', preview: 'Two things to bring', body: 'Bring last month’s numbers and one workflow you want gone.' } }];
const IMG = (f) => 'https://lesyptuwllcgajdxzjje.supabase.co/storage/v1/object/public/creatives/' + f;
function tables() {
  const t = FX.tables();
  t.agent_outputs.push({ id: '00000000-0000-4000-8000-0000000f0123', run_id: RUN, agent: 'low_ticket_content', output_type: 'funnel_package', title: 'Campaign · AI Readiness Diagnostic · 2026-10-21',
    created_at: iso('2026-10-21T09:33:00Z'), content_md: '# Funnel Package', snapshot: null, edited_by_human: false,
    data: JSON.stringify({ offer_name: 'AI Readiness Diagnostic', funnel_mode: 'direct_to_call', status: 'pending_approval', source_brief_run: FX.F.ADRUN,
      ad_images: [{ variant: 'A', label: 'Scorecard layout', url: IMG('qa-v123-a.png'), file: 'qa-v123-a.png' }, { variant: 'B', label: 'Big type', url: IMG('qa-v123-b.png'), file: 'qa-v123-b.png' }],
      assets: [{ title: 'Overview', content_md: '# Funnel Package' }, { title: 'Ads', content_md: '## Ads' }, { title: 'Qualification survey', content_md: '_Not in this campaign’s plan._', skipped: true },
        { title: 'Bridge page', content_md: '## Bridge page' }, { title: 'Booking page', content_md: '## Booking page' }, { title: 'Test Plan & Review', content_md: '## Test plan' },
        { title: 'Reminder email', content_md: '## Reminder email', key: 'step_5' }],
      plan: PLAN, steps: STEPS, call_minutes: 45 }) });
  t.funnel_packages.push({ id: PKG, creative_brief_id: '00000000-0000-4000-8000-0000000000c1', offer_id: '00000000-0000-4000-8000-0000000000f1', run_id: RUN, run_date: '2026-10-21', status: 'pending_approval',
    created_at: iso('2026-10-21T09:32:00Z'), updated_at: iso('2026-10-21T09:32:00Z'), funnel_type: null, requested_by: 'qa@aiparagonconsulting.com',
    ad_variations: JSON.stringify({ stable_body: 'Most firms lose hours to manual admin.', hook_variations: ['Stop paying the manual tax', 'Three workflows ready for AI', 'Your inbox is not a CRM'], cta: 'Book the diagnostic' }),
    survey: '{}', landing_page: JSON.stringify({ vsl_state: 'image_led', headline: 'Find the hours you lose to manual work', subheadline: 'A 45-minute diagnostic', benefit_bullets: ['See where the hours go', 'Leave with three fixes'], cta: 'Book my diagnostic' }),
    booking_page: JSON.stringify({ headline: 'Pick a time', reassurance_subhead: 'No pitch, just the map', what_happens_next: ['Pick a time', 'Get a reminder the day before'], primary_action: 'Book it', confirmation_microcopy: 'See you then' }),
    test_plan: JSON.stringify({ phase_1: 'Two hooks' }), variant_copy: {}, original_snapshot: null, notes: JSON.stringify({ through_line: 'Find the hours' }), source_brief_id: '00000000-0000-4000-8000-0000000000c1',
    steps: JSON.stringify(STEPS), setup: JSON.stringify({ booking: { name: 'Diagnostic', url: 'https://calendly.com/qa-team/diagnostic', duration: 45 }, cta: 'Book my diagnostic', plan: PLAN, call_minutes: 45 }) });
  return t;
}

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(url, o) {
    o = o || {};
    const store = makeStore(tables());
    const hooks = [];
    const hook = (u, m, b) => {
      let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) {}
      hooks.push({ u, b: body });
      if (/\/e3-calendly/.test(u)) return { body: { ok: true, connected: true, user: { name: 'QA Tester' }, types: [{ name: 'Intro call', url: 'https://calendly.com/qa-team/intro', duration: 20 }, { name: 'Diagnostic', url: 'https://calendly.com/qa-team/diagnostic', duration: 45 }] } };
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors });
    await page.setViewportSize({ width: o.width || 1440, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1600);
    return { ctx, page, store, hooks };
  }
  const ev = (page, fn, arg) => page.evaluate(fn, arg);
  const wait = (page, ms) => page.waitForTimeout(ms || 300);
  const last = (hooks, re) => hooks.filter((h) => re.test(h.u)).pop();
  const names = (page) => ev(page, () => [...document.querySelectorAll('#v121Plan_mg .v121-stt b')].map((b) => b.textContent));
  const openStep = async (page, i) => { await page.click('#v121Plan_mg .v121-st[data-i="' + i + '"] .v121-sth'); await wait(page, 200); };
  const inStep = (sel) => '#v121Plan_mg .v121-st.is-open ' + sel;
  const txt = (page, sel) => ev(page, (s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
  const bar = (page) => ev(page, () => [...document.querySelectorAll('#adImgBlock .fsteps > button')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.textContent.replace(/\s+/g, ' ').trim()));

  // ---------------- book a call: every step changes, the ads and the landing page stay ----------------
  {
    const { ctx, page, store, hooks } = await open('/dashboard/marketing-generation');
    check('book a call starts from its four steps', JSON.stringify(await names(page)) === JSON.stringify(['Ads', 'Qualification survey', 'Landing page', 'Booking page']), JSON.stringify(await names(page)));
    const top = await ev(page, () => ({ add: !!document.querySelector('#v121Plan_mg .v121-add'), lock: !!document.querySelector('#v121Plan_mg .v121-lock'), sub: (document.querySelector('#v121Plan_mg .v121-sub') || {}).textContent || '' }));
    check('it can take steps of its own: Add a step, no locked line', top.add && !top.lock && /Book a call, step by step:/.test(top.sub), JSON.stringify(top));
    await openStep(page, 0);
    const ads = await ev(page, () => { const li = document.querySelector('#v121Plan_mg .v121-st.is-open'); return { chips: !!li.querySelector('[aria-label="How many ads"]'), del: !!li.querySelector('.v121-del'), keep: (li.querySelector('.v123-keep') || {}).textContent || '', name: !!li.querySelector('input[data-f="name"]') }; });
    check('the ads step picks how many ads and stays in (no Remove)', ads.chips && !ads.del && ads.keep === 'Always included' && ads.name, JSON.stringify(ads));
    await page.click(inStep('[aria-label="How many ads"] button:has-text("2")')); await wait(page);
    check('its line follows the count, with images', (await txt(page, '#v121Plan_mg .v121-st[data-i="0"] .v121-stt small')) === '2 ads with images', await txt(page, '#v121Plan_mg .v121-st[data-i="0"] .v121-stt small'));
    await openStep(page, 2);
    const lp = await ev(page, () => { const li = document.querySelector('#v121Plan_mg .v121-st.is-open'); return { del: !!li.querySelector('.v121-del'), keep: !!li.querySelector('.v123-keep'), name: !!li.querySelector('input[data-f="name"]') }; });
    check('the landing page can be renamed but stays in', lp.name && lp.keep && !lp.del, JSON.stringify(lp));
    await page.fill(inStep('input[data-f="name"]'), 'Bridge page');
    await page.fill(inStep('textarea[data-f="note"]'), 'Name the diagnostic');
    await ev(page, () => v121Del('mg', 0)); await wait(page);
    check('removing the ads (or the landing page) is refused with a reason', (await names(page)).length === 4 && /always writes this step/.test(await txt(page, '#nwToast')), await txt(page, '#nwToast'));
    // the survey goes, its detail stays under Other details
    await openStep(page, 1);
    check('the survey can be removed', !!(await page.$(inStep('.v121-del'))));
    await page.click(inStep('.v121-del')); await wait(page);
    check('and is gone from the plan', JSON.stringify(await names(page)) === JSON.stringify(['Ads', 'Bridge page', 'Booking page']), JSON.stringify(await names(page)));
    check('its question (who should book) stays under Other details', /Other details/.test(await txt(page, '#v121Plan_mg .v121-more')) && /Who should book/.test(await txt(page, '#v121Plan_mg .v121-more')), await txt(page, '#v121Plan_mg .v121-more'));
    // the booking page: renamed, its details still in it
    await openStep(page, 2);
    const bk = await ev(page, () => { const li = document.querySelector('#v121Plan_mg .v121-st.is-open'); return { del: !!li.querySelector('.v121-del'), len: !!li.querySelector('[aria-label="Call length"]'), cal: !!li.querySelector('#v113CalSel') }; });
    check('the booking page can be removed, and keeps the call length and the Calendly link', bk.del && bk.len && bk.cal, JSON.stringify(bk));
    await page.selectOption('#v113CalSel', 'https://calendly.com/qa-team/diagnostic'); await wait(page, 300);
    // a step of our own: a reminder email before the booking page
    await page.click('#v121Plan_mg .v121-add'); await wait(page, 250);
    await page.selectOption(inStep('select[data-f="kind"]'), 'email'); await wait(page, 250);
    await page.fill(inStep('input[data-f="name"]'), 'Reminder email');
    await page.fill(inStep('textarea[data-f="note"]'), 'The day before the call');
    await page.click(inStep('button[aria-label="Move up"]')); await wait(page, 200);
    check('a step of our own goes where it is moved', JSON.stringify(await names(page)) === JSON.stringify(['Ads', 'Bridge page', 'Reminder email', 'Booking page']), JSON.stringify(await names(page)));
    check('the plan says Changed, with Reset and Save as our default', /Changed/.test(await txt(page, '#v121Plan_mg .v121-ph')) && /Reset/.test(await txt(page, '#v121Plan_mg .v121-pf')) && /Save as our default/.test(await txt(page, '#v121Plan_mg .v121-pf')));
    await page.fill('#v97MgWhat', 'Ads for the AI Readiness Diagnostic');
    await page.click('#v97MgGoBtn'); await wait(page, 1800);
    const lt = last(hooks, /e3-low-ticket-run/), lb = lt ? lt.b : {};
    check('the run goes to the Low-Ticket Agent with the plan, in order', Array.isArray(lb.plan) && JSON.stringify(lb.plan.map((s) => s.key)) === JSON.stringify(['ads', 'landing', 'step_4', 'booking']) &&
      JSON.stringify(lb.plan.map((s) => s.kind)) === JSON.stringify(['ads', 'page', 'email', 'booking']), lt && JSON.stringify(lb.plan));
    check('each step with its name, the team’s notes and the ads count', lb.plan && lb.plan[0].n === 2 && lb.plan[1].title === 'Bridge page' && lb.plan[1].note === 'Name the diagnostic' && lb.plan[2].title === 'Reminder email' && lb.plan[2].note === 'The day before the call', lb.plan && JSON.stringify(lb.plan.slice(0, 3)));
    check('the call length goes as minutes (the booked event’s), with the booking link and details as before', lb.call_minutes === 45 && lb.setup && lb.setup.booking && lb.setup.booking.url === 'https://calendly.com/qa-team/diagnostic' && /Call length: 45 min/.test(lb.setup.details || ''), JSON.stringify({ m: lb.call_minutes, d: lb.setup && lb.setup.details }));
    check('the notes are not squeezed into the request text any more', !/About the funnel/.test(lb.request || '') && !/Name the diagnostic/.test(lb.request || '') && /Ads for the AI Readiness Diagnostic/.test(lb.request || ''), lb.request);
    // Save as our default keeps the whole plan
    await page.click('#v121Plan_mg .v121-pf button:has-text("Save as our default")'); await wait(page, 800);
    const bp = (store.db.ai_settings.find((x) => x.key === 'build_plans') || {}).value || {};
    const saved = bp['funnel:direct_to_call'];
    check('Save as our default keeps the steps, not only the notes', saved && JSON.stringify(saved.steps.map((s) => s.key)) === JSON.stringify(['ads', 'landing', 'step_4', 'booking']) && saved.steps[1].name === 'Bridge page', saved && JSON.stringify(saved.steps.map((s) => s.key + ':' + s.name)));
    await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await wait(page, 300);
    await page.click('#v111Cats_mg .v111-cat[data-c="direct_to_call"]'); await wait(page, 300);
    check('the next book a call starts from it', JSON.stringify(await names(page)) === JSON.stringify(['Ads', 'Bridge page', 'Reminder email', 'Booking page']) && /Your team’s default/.test(await txt(page, '#v121Plan_mg .v121-pf')), JSON.stringify(await names(page)));
    await page.click('#v121Plan_mg .v121-pf button:has-text("Use the usual steps")'); await wait(page, 300);
    check('Use the usual steps brings the four back', JSON.stringify(await names(page)) === JSON.stringify(['Ads', 'Qualification survey', 'Landing page', 'Booking page']), JSON.stringify(await names(page)));
    await ctx.close();
  }
  // ---------------- low-ticket: the page for the paid offer stays ----------------
  {
    const { ctx, page, hooks } = await open('/dashboard/marketing-generation');
    await page.click('#v111Cats_mg .v111-cat[data-c="low_ticket"]'); await wait(page, 400);
    check('low-ticket shows its four steps', JSON.stringify(await names(page)) === JSON.stringify(['Ads', 'Landing page for the paid offer', 'Qualification survey', 'Onboarding call booking']), JSON.stringify(await names(page)));
    await openStep(page, 1);
    check('the page for the paid offer stays, with its price and checkout link', !!(await page.$(inStep('.v123-keep'))) && !(await page.$(inStep('.v121-del'))) && /Price shown/.test(await txt(page, inStep('.v121-q'))), await txt(page, inStep('.v121-q')));
    await openStep(page, 3); await page.click(inStep('.v121-del')); await wait(page);
    await openStep(page, 2); await page.click(inStep('button[aria-label="Move up"]')); await wait(page, 200);
    check('the low-ticket steps change too', JSON.stringify(await names(page)) === JSON.stringify(['Ads', 'Qualification survey', 'Landing page for the paid offer']), JSON.stringify(await names(page)));
    const n0 = hooks.filter((h) => /e3-low-ticket-run/.test(h.u)).length;
    await page.fill('#v97MgWhat', 'A small paid offer');
    await page.click('#v97MgGoBtn'); await wait(page, 1800);
    const lt2 = hooks.filter((h) => /e3-low-ticket-run/.test(h.u));
    const b2 = lt2.length > n0 ? lt2[lt2.length - 1].b : {};
    check('a low-ticket run carries its plan and no call length', b2.funnel_mode === 'low_ticket' && b2.plan && JSON.stringify(b2.plan.map((s) => s.key)) === JSON.stringify(['ads', 'survey', 'offer_page']) && b2.call_minutes === undefined, JSON.stringify({ m: b2.funnel_mode, p: b2.plan && b2.plan.map((s) => s.key), c: b2.call_minutes }));
    await ctx.close();
  }

  // ---------------- the campaign page: the plan's steps, in order, with their names ----------------
  {
    const { ctx, page } = await open('/dashboard/marketing-generation');
    await ev(page, (r) => v97OpenCamp(r), RUN); await wait(page, 2600);
    const b1 = await bar(page);
    check('the step bar follows the plan: no survey, the renamed page, the added email', JSON.stringify(b1) === JSON.stringify(['1Ad creatives (2)', '2Bridge page', '3Reminder email', '4Booking page', 'Whole funnel']), JSON.stringify(b1));
    const fl = await ev(page, () => [...document.querySelectorAll('#adImgBlock .fl-title')].map((x) => x.textContent));
    check('the ad cards say the call length it was made with', fl.length === 2 && fl.every((t) => /45-minute/.test(t) && !/20-minute/.test(t)), JSON.stringify(fl));
    await page.click('#adImgBlock .fsteps > button:has-text("Bridge page")'); await wait(page, 1200);
    check('the renamed page opens the landing page step', (await ev(page, () => state.funnelStep)) === 'landing' && /Find the hours you lose to manual work/.test(await txt(page, '#v96Read')), await txt(page, '#v96Read'));
    check('and the bar keeps the plan after the redraw', JSON.stringify(await bar(page)) === JSON.stringify(b1), JSON.stringify(await bar(page)));
    await page.click('#adImgBlock .fsteps > button[data-v123="step_5"]'); await wait(page, 1500);
    const all = await ev(page, () => {
      const cols = [...document.querySelectorAll('#adImgBlock .v106-flow > .v106-fc')];
      const em = cols.find((c) => c.dataset.k === 'step_5');
      return { all: V106.all, titles: cols.map((c) => c.querySelector('.v106-fh b').textContent), em: em ? em.innerText.replace(/\s+/g, ' ') : '', hi: !!(em && em.classList.contains('v123-hi')), open: !!(em && em.querySelector('.v97-link')),
        chip: (document.querySelector('#adImgBlock .fsteps > [data-v123="step_5"]') || {}).className || '', whole: (document.querySelector('#adImgBlock .fsteps > [data-v106]') || {}).className || '' };
    });
    check('an added step opens the whole funnel, in the plan’s order', all.all && JSON.stringify(all.titles) === JSON.stringify(['Ads', 'Bridge page', 'Reminder email', 'Booking page']), JSON.stringify(all.titles));
    check('with what the agent wrote for it, picked out', /Your diagnostic is tomorrow/.test(all.em) && /Bring last month’s numbers/.test(all.em) && all.hi && !all.open, all.em);
    check('its chip is the one lit', /\bon\b/.test(all.chip) && !/\bon\b/.test(all.whole), JSON.stringify([all.chip, all.whole]));
    await page.click('#adImgBlock .fsteps > button[data-v106]'); await wait(page, 1200);
    const all2 = await ev(page, () => ({ hi: document.querySelectorAll('#adImgBlock .v123-hi').length, n: document.querySelectorAll('#adImgBlock .v106-flow > .v106-fc').length }));
    check('Whole funnel shows the same steps with none picked out', all2.n === 4 && all2.hi === 0, JSON.stringify(all2));
    // a campaign made before keeps its four steps
    await ev(page, () => v97OpenCamp('lt_2026-10-11')); await wait(page, 2400);
    const b0 = await bar(page);
    check('a campaign made before keeps its four steps', JSON.stringify(b0) === JSON.stringify(['1Ad creatives (1)', '2Qualification survey', '3Landing page', '4Booking page', 'Whole funnel']) && !(await page.$('#adImgBlock .fsteps [data-v123]')), JSON.stringify(b0));
    await page.click('#adImgBlock .fsteps > button[data-v106]'); await wait(page, 1200);
    const t0 = await ev(page, () => [...document.querySelectorAll('#adImgBlock .v106-flow > .v106-fc .v106-fh b')].map((b) => b.textContent));
    check('and its whole funnel the four as before', JSON.stringify(t0) === JSON.stringify(['Ad', 'Qualification survey', 'Landing page', 'Booking page']), JSON.stringify(t0));
    // a workspace saved on a step this campaign does not have goes back to the ads
    await ev(page, (r) => { state.funnelRun = r; state.funnelStep = 'survey'; state.funnelTab = 2; V106.all = false; renderFunnel(); }, RUN); await wait(page, 2200);
    check('a step the campaign does not have falls back to the ads', (await ev(page, () => state.funnelStep)) === 'ad' && JSON.stringify(await bar(page)) === JSON.stringify(b1), await ev(page, () => state.funnelStep));
    await ctx.close();
  }

  // ---------------- Landing pages read a campaign made from a plan ----------------
  {
    const { ctx, page, store } = await open('/dashboard/landing-pages');
    await ev(page, (id) => v115LpFromPkg(id, null), PKG); await wait(page, 1500);
    const row = (store.db.landing_pages || []).find((p) => p.source_id === PKG) || {};
    const c = row.content || {};
    check('its page has no survey questions, and the headline of its landing page', row.kind === 'book_call' && Array.isArray(c.questions) && c.questions.length === 0 && c.headline === 'Find the hours you lose to manual work', JSON.stringify({ k: row.kind, q: c.questions, h: c.headline }));
    check('the link after sign-up is the booking link it was made with', c.thanks && c.thanks.url === 'https://calendly.com/qa-team/diagnostic' && c.cta === 'Book my diagnostic', JSON.stringify(c.thanks));
    await ev(page, () => { try { nwDrawerClose(); } catch (e) {} });
    await ev(page, () => v115LpFromPkg('00000000-0000-4000-8000-0000000000b1', null)); await wait(page, 1500);
    const old = ((store.db.landing_pages || []).find((p) => p.source_id === '00000000-0000-4000-8000-0000000000b1') || {}).content || {};
    check('a campaign made before still gives its survey questions', Array.isArray(old.questions) && old.questions.length === 2, JSON.stringify(old.questions));
    await ctx.close();
  }

  // ---------------- a phone ----------------
  {
    const { ctx, page } = await open('/dashboard/marketing-generation', { width: 390 });
    await openStep(page, 2);
    const fit = await ev(page, () => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, keep: !!document.querySelector('#v121Plan_mg .v121-st.is-open .v123-keep') }));
    check('the plan fits a phone, the kept step marked', fit.sw <= fit.cw + 1 && fit.keep, JSON.stringify(fit));
    await ev(page, (r) => v97OpenCamp(r), RUN); await wait(page, 2600);
    const w = await ev(page, () => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    check('the campaign page fits a phone too', w.sw <= w.cw + 1, JSON.stringify(w));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
