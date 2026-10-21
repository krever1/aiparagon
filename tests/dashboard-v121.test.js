// v121 tests for new-aiparagon-dashboard.html (#1), the 21 October feedback round.
// The build plan: the right pane on Content Transformation and Marketing Generation shows what gets built, step by
// step, before it runs (a piece's parts, a funnel's steps), each step opens to change it (name, what it should say,
// the details it needs, moved there from Details), steps are added, removed and moved, and the runs get it: a
// piece's parts as its template sections, a funnel's steps as the Funnel Builder's plan, book a call's in the
// Low-Ticket request as its plan (since v123, which tests/dashboard-v123.test.js covers), Reset, and Save as our
// default (ai_settings build_plans).
// Calls: on Tasks each call shows its type (changed right there, the team's own types too) and the people on it,
// calls are filed in client folders, and type buttons along the top show one kind of call (Tasks and Calls).
// The sign-in screen: a saved session opens the dashboard with no sign-in screen first (sampled every frame).
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks (Fathom, Calendly, the Funnel Builder, the Low-Ticket Agent, post-call actions) answer from stubs,
// so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v121.test.js
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
const P = (n, e, x) => ({ name: n, email: e, external: !!x });
const TEAM = [P('Kaeser Valencerina', 'kser@aiparagonconsulting.com'), P('Erica Dresslar', 'erica@aiparagonconsulting.com')];
// the calls Fathom has (made-up people at example domains)
const CALLS = [
  { id: 'fathom-qa-1', title: 'QA weekly sync', start: iso('2026-10-06T16:00:00Z'), end: iso('2026-10-06T16:40:00Z'), recorded_by: { name: 'Kaeser Valencerina', email: 'kser@aiparagonconsulting.com' }, invitees: TEAM, summary: 'Synthetic summary', actions: [] },
  { id: 'fathom-qa-2', title: 'Northwind demo', start: iso('2026-10-15T17:00:00Z'), end: iso('2026-10-15T17:45:00Z'), recorded_by: { name: 'Erica Dresslar', email: 'erica@aiparagonconsulting.com' },
    invitees: [TEAM[1], P('Pat Example', 'pat@northwind-advisors.example', 1), P('Sam Example', 'sam@northwind-advisors.example', 1)], summary: 'Synthetic demo', actions: [] },
  { id: 'fathom-qa-3', title: 'Impromptu Zoom Meeting', start: iso('2026-10-21T15:00:00Z'), end: iso('2026-10-21T15:30:00Z'), recorded_by: { name: 'Kaeser Valencerina', email: 'kser@aiparagonconsulting.com' }, invitees: TEAM, summary: 'Synthetic', actions: [] },
  { id: 'fathom-qa-4', title: 'Acme check-in', start: iso('2026-10-18T15:00:00Z'), end: iso('2026-10-18T15:30:00Z'), recorded_by: { name: 'Erica Dresslar', email: 'erica@aiparagonconsulting.com' },
    invitees: [TEAM[1], P('Lee Example', 'lee@gmail.com', 1)], summary: 'Synthetic', actions: [] },
  { id: 'fathom-qa-5', title: 'Partner intro', start: iso('2026-10-12T15:00:00Z'), end: iso('2026-10-12T15:20:00Z'), recorded_by: { name: 'Erica Dresslar', email: 'erica@aiparagonconsulting.com' },
    invitees: [TEAM[1], P('Jo Example', 'jo@brightpath.example', 1)], summary: 'Synthetic', actions: [] },
];
function out(id, title, start, type, tasks) {
  return { id: '00000000-0000-4000-8000-0000000ca1' + id.slice(-2).padStart(2, '0'), call_id: id, call_title: title, call_start: iso(start), meeting_type: type, meeting_type_guess: true, summary: ['A point'],
    tasks: tasks.map((x, i) => ({ id: 't' + (i + 1), text: x, owner: 'AI Paragon', due: '', why: 'Synthetic', done: false })), deliverable: { title: 'Notes', markdown: '- a' }, follow_up: {}, status: 'done',
    error: null, source: 'auto', created_by: 'auto', asana: null, slack_posted_at: null, created_at: iso(start), updated_at: iso(start) };
}
function tables(o) {
  o = o || {};
  const t = FX.tables();
  t.call_outputs.push(out('fathom-qa-2', 'Northwind demo', '2026-10-15T17:00:00Z', 'other', ['Send the demo recording', 'Price the pilot']),
    out('fathom-qa-3', 'Impromptu Zoom Meeting', '2026-10-21T15:00:00Z', 'internal', ['Fix the login flash', 'Ship the plan pane', 'Write the tests']),
    out('fathom-qa-4', 'Acme check-in', '2026-10-18T15:00:00Z', 'checkin', ['Send the status update']),
    out('fathom-qa-5', 'Partner intro', '2026-10-12T15:00:00Z', 'other', ['Share the deck']));
  t.call_meta = [
    { call_id: 'fathom-qa-4', client: 'Acme Wealth', meeting_type: null, tags: [], guests: null, created_at: iso('2026-10-18T16:00:00Z'), updated_at: iso('2026-10-18T16:00:00Z') },
    { call_id: 'fathom-qa-5', folder: 'Partners', meeting_type: 'demo', tags: [], guests: null, created_at: iso('2026-10-12T16:00:00Z'), updated_at: iso('2026-10-12T16:00:00Z') },
  ];
  t.offers = (t.offers && t.offers.length) ? t.offers : [{ id: '00000000-0000-4000-8000-0000000000o1', name: 'AI Readiness Scorecard', price: 0, action: 'call', is_default: true, archived: false, created_at: '2026-07-23T18:10:34Z' }];
  if (o.tweak) o.tweak(t);
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
    const store = makeStore(tables(o));
    const hooks = [];
    const hook = (u, m, b) => {
      let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) {}
      hooks.push({ u, b: body });
      if (/fathom-proxy/.test(u)) {
        if (o.noFathom) return { body: { ok: false, code: 'not_connected', message: 'Fathom is not connected yet.' } };
        if (body.action === 'status') return { body: { ok: true, connected: true, hint: 'ab12' } };
        if (body.action === 'list') return { body: { ok: true, items: JSON.parse(JSON.stringify(CALLS)), next_cursor: null } };
        return { body: { ok: true, transcript: [] } };
      }
      if (/\/e3-calendly/.test(u)) return { body: { ok: true, connected: true, user: { name: 'QA Tester' }, types: [{ name: 'Intro call', url: 'https://calendly.com/qa-team/intro', duration: 20 }, { name: 'Diagnostic', url: 'https://calendly.com/qa-team/diagnostic', duration: 45 }] } };
      if (/\/e3-funnel-run/.test(u)) return { body: { ok: true, started: true, run_id: 'funnel_qa_new' } };
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
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
  const names = (page, pg) => ev(page, (p) => [...document.querySelectorAll('#v121Plan_' + p + ' .v121-stt b')].map((b) => b.textContent), pg);
  const openStep = async (page, pg, i) => { await page.click('#v121Plan_' + pg + ' .v121-st[data-i="' + i + '"] .v121-sth'); await wait(page, 200); };
  const inStep = (pg, sel) => '#v121Plan_' + pg + ' .v121-st.is-open ' + sel;
  const txt = (page, sel) => ev(page, (s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
  const material = 'Synthetic notes about governed AI for advisers, written for this test only. '.repeat(10);

  // ---------------- A. a piece's parts: Content Transformation ----------------
  {
    const { ctx, page, store } = await open('/dashboard/content-transformation');
    await page.click('#nwCtForm .nw-tile[data-k="report"]'); await wait(page, 500);
    check('a report shows its parts in order', JSON.stringify(await names(page, 'ct')) === JSON.stringify(['Executive summary', 'What we found', 'What it means', 'What to do next', 'Sources']), JSON.stringify(await names(page, 'ct')));
    const side = await txt(page, '#nwCtSide');
    check('the pane says what the piece is and what else comes with it', /The plan 1 report with an executive summary, in these parts:/.test(side) && /Also: 3 title options/.test(side), side.slice(0, 160));
    check('the old "You\'ll get" list is gone', !/ll get/.test(side) && !(await page.$('#nwCtSide .nw-gets')), side.slice(0, 80));
    check('it still says what it will use and has the Generate button', /It will use/i.test(side) && !!(await page.$('#nwCtSide #cfGo')));
    await openStep(page, 'ct', 1);
    const ed = await ev(page, () => { const li = document.querySelector('#v121Plan_ct .v121-st.is-open'); return { n: li && li.querySelector('input[data-f="name"]').value, g: li && li.querySelector('textarea[data-f="note"]').value }; });
    check('a part opens with its name and what goes in it', ed.n === 'What we found' && ed.g === 'The findings from the material, each with its evidence.', JSON.stringify(ed));
    await page.fill(inStep('ct', 'input[data-f="name"]'), 'What the data shows');
    await page.fill(inStep('ct', 'textarea[data-f="note"]'), 'Lead with the three numbers that matter.');
    check('the header follows the typing and the plan says Changed', (await txt(page, '#v121Plan_ct .v121-st[data-i="1"] .v121-stt b')) === 'What the data shows' && /Changed/.test(await txt(page, '#v121Plan_ct .v121-ph')) && /Reset/.test(await txt(page, '#v121Plan_ct .v121-pf')));
    await page.click(inStep('ct', 'button[aria-label="Move down"]')); await wait(page, 200);
    check('Move down moves the part', JSON.stringify(await names(page, 'ct')) === JSON.stringify(['Executive summary', 'What it means', 'What the data shows', 'What to do next', 'Sources']), JSON.stringify(await names(page, 'ct')));
    await openStep(page, 'ct', 4); await page.click(inStep('ct', '.v121-del')); await wait(page, 200);
    await page.click('#v121Plan_ct .v121-add'); await wait(page, 200);
    const focus = await ev(page, () => document.activeElement && document.activeElement.dataset.f === 'name' && document.activeElement.value === 'New part');
    check('Add a part opens a new part with its name ready to type', focus);
    await page.fill(inStep('ct', 'input[data-f="name"]'), 'A client story');
    await page.fill(inStep('ct', 'textarea[data-f="note"]'), 'One example, no names.');
    await page.click('#nwCtForm .nw-src-seg [data-s="paste"]'); await wait(page, 200);
    await page.fill('#cfText', material); await ev(page, () => nwCtSync());
    await ev(page, () => nwCtSubmit()); await wait(page, 1500);
    const r = store.db.content_requests[store.db.content_requests.length - 1] || {};
    const secs = r.template && r.template.sections;
    check('the request carries the parts as the template sections, in the plan\'s order', Array.isArray(secs) && JSON.stringify(secs.map((s) => s.title)) === JSON.stringify(['Executive summary', 'What it means', 'What the data shows', 'What to do next', 'A client story']), JSON.stringify(secs && secs.map((s) => s.title)));
    check('with what goes in each one', secs && secs[2].guidance === 'Lead with the three numbers that matter.' && secs[4].guidance === 'One example, no names.' && secs[0].guidance === 'Three to five lines: what was found and what to do about it.', JSON.stringify(secs && secs.map((s) => s.guidance)));
    check('it is still a report request', r.content_type === 'report' && r.status === 'queued', JSON.stringify({ t: r.content_type, s: r.status }));
    await page.click('#v121Plan_ct .v121-pf button:has-text("Reset")'); await wait(page, 300);
    check('Reset puts the usual parts back', JSON.stringify(await names(page, 'ct')) === JSON.stringify(['Executive summary', 'What we found', 'What it means', 'What to do next', 'Sources']) && !/Changed/.test(await txt(page, '#v121Plan_ct .v121-ph')), JSON.stringify(await names(page, 'ct')));
    // Save as our default
    await openStep(page, 'ct', 0); await page.fill(inStep('ct', 'input[data-f="name"]'), 'The short version');
    await page.click('#v121Plan_ct .v121-pf button:has-text("Save as our default")'); await wait(page, 800);
    const bp = (store.db.ai_settings.find((x) => x.key === 'build_plans') || {}).value || {};
    check('Save as our default keeps the plan for the team', bp['piece:report'] && bp['piece:report'].steps.length === 5 && bp['piece:report'].steps[0].name === 'The short version' && !!bp['piece:report'].by, JSON.stringify(bp).slice(0, 200));
    check('the plan now says it is the team\'s default', /Your team’s default/.test(await txt(page, '#v121Plan_ct .v121-pf')) && !/Changed/.test(await txt(page, '#v121Plan_ct .v121-ph')) && (await names(page, 'ct'))[0] === 'The short version', await txt(page, '#v121Plan_ct .v121-pf'));
    await page.click('#nwCtForm .nw-tile[data-k="deck"]'); await wait(page, 300);
    await page.click('#nwCtForm .nw-tile[data-k="report"]'); await wait(page, 300);
    check('a report starts from the team\'s default from then on', (await names(page, 'ct'))[0] === 'The short version', JSON.stringify(await names(page, 'ct')));
    await page.click('#v121Plan_ct .v121-pf button:has-text("Use the usual steps")'); await wait(page, 300);
    check('Use the usual steps brings the built-in parts back, as a change', (await names(page, 'ct'))[0] === 'Executive summary' && /Changed/.test(await txt(page, '#v121Plan_ct .v121-ph')));
    await page.click('#v121Plan_ct .v121-pf button:has-text("Reset")'); await wait(page, 300);
    check('and Reset goes back to the team\'s default', (await names(page, 'ct'))[0] === 'The short version');
    // a picked structure template gives its own parts, and its plan is not saved as the team default
    const tpl = await ev(page, () => { const s = document.getElementById('v97Struct'); if (!s) return null; const o = [...s.options].find((x) => /LinkedIn post/.test(x.textContent)); return o ? o.value : ''; });
    if (tpl !== null) {
      await page.click('#nwCtForm .nw-tile[data-k="thought_leadership"]'); await wait(page, 300);
      const has = await ev(page, () => { const s = document.getElementById('v97Struct'); const o = s && [...s.options].find((x) => /LinkedIn post/.test(x.textContent)); if (!o) return false; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true; });
      await wait(page, 300);
      if (has) check('a structure picked in More options gives its own parts', JSON.stringify(await names(page, 'ct')) === JSON.stringify(['Hook', 'Body']) && /From the LinkedIn post template/.test(await txt(page, '#v121Plan_ct .v121-sub')), JSON.stringify(await names(page, 'ct')));
      await ev(page, () => { const s = document.getElementById('v97Struct'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
    }
    // the event kit's pieces are its parts, so What to make left the questions
    await page.click('#nwCtForm .nw-tile[data-k="event_kit"]'); await wait(page, 400);
    const q = await ev(page, () => [...document.querySelectorAll('#v113CtQ .nw-lbl')].map((x) => x.textContent.replace(/optional$/, '')).join('|'));
    check('an event kit no longer asks What to make; its pieces are the plan', !/What to make/.test(q) && /The event/.test(q) && JSON.stringify(await names(page, 'ct')) === JSON.stringify(['The invite post', 'The event page', 'Invite email', 'Reminder emails', 'Follow-up email', 'Run of show']), q + ' / ' + JSON.stringify(await names(page, 'ct')));
    // Something else has no set parts until some are added
    await page.click('#nwCtForm .nw-tile[data-k="other"]'); await wait(page, 300);
    check('Something else starts with no set parts', /No set parts/.test(await txt(page, '#v121Plan_ct')) && !!(await page.$('#v121Plan_ct .v121-add')));
    await ctx.close();
  }

  // ---------------- A. a post's parts on Marketing Generation ----------------
  {
    const { ctx, page, store } = await open('/dashboard/marketing-generation');
    await page.click('#nwMgForm .nw-tile[data-k="thought_leadership"]'); await wait(page, 500);
    check('a LinkedIn post shows its parts', JSON.stringify(await names(page, 'mg')) === JSON.stringify(['The common belief', 'What we see', 'Why it matters']), JSON.stringify(await names(page, 'mg')));
    await openStep(page, 'mg', 2); await page.fill(inStep('mg', 'textarea[data-f="note"]'), 'One example from a client, no names.');
    await page.fill('#v97MgWhat', 'Why governance comes before tools for advisers');
    await page.click('#v97MgGoBtn'); await wait(page, 1500);
    const r = store.db.content_requests[store.db.content_requests.length - 1] || {};
    check('the post request carries the edited parts', r.template && r.template.sections && r.template.sections.length === 3 && r.template.sections[2].guidance === 'One example from a client, no names.', r.template && JSON.stringify(r.template.sections));
    await ctx.close();
  }

  // ---------------- A. a funnel's steps: book a call and a webinar ----------------
  {
    const { ctx, page, store, hooks } = await open('/dashboard/marketing-generation');
    check('book a call shows its four parts, in order', JSON.stringify(await names(page, 'mg')) === JSON.stringify(['Ads', 'Qualification survey', 'Landing page', 'Booking page']), JSON.stringify(await names(page, 'mg')));
    const fx = await ev(page, () => ({ add: !!document.querySelector('#v121Plan_mg .v121-add'), lock: (document.querySelector('#v121Plan_mg .v121-lock') || {}).textContent || '', sum: [...document.querySelectorAll('#v121Plan_mg .v121-stt small')].map((x) => x.textContent) }));
    check('since v123 it takes steps of its own: Add a step, no locked line', fx.add && !fx.lock, fx.lock);
    check('each part says what it has: 3 ads with images, and the booking page wants its link', fx.sum[0] === '3 ads with images' && /20 min · add booking link/.test(fx.sum[3]), JSON.stringify(fx.sum));
    const left = await ev(page, () => [...document.querySelectorAll('#v113MgB .nw-lbl')].map((x) => x.textContent.replace(/optional$/, '')).join('|'));
    check('Details keeps what the whole campaign needs; each part\'s details moved to the plan', /What is the campaign for\?/.test(left) && /Button text/.test(left) && !/Call length|Who should book|Booking link|Anything about the funnel/.test(left) && !(await page.$('#v113FunNote')) && /Each step’s details are in the plan/.test(await txt(page, '#v113MgB')), left);
    await openStep(page, 'mg', 3);
    const bk = await ev(page, () => { const li = document.querySelector('#v121Plan_mg .v121-st.is-open'); return { name: !!li.querySelector('input[data-f="name"]'), del: !!li.querySelector('.v121-del'), len: !!li.querySelector('[aria-label="Call length"]'), cal: !!li.querySelector('#v113CalSel') }; });
    check('the booking page holds the call length and the Calendly link (since v123 it can be renamed or removed)', bk.name && bk.del && bk.len && bk.cal, JSON.stringify(bk));
    await page.selectOption('#v113CalSel', 'https://calendly.com/qa-team/diagnostic'); await wait(page, 300);
    await page.click('#v121Plan_mg .v121-st[data-i="0"] .v121-sth'); await wait(page, 300);
    check('picking the event fills the booking page\'s line', /45 min · Diagnostic/.test(await txt(page, '#v121Plan_mg .v121-st[data-i="3"] .v121-stt small')), await txt(page, '#v121Plan_mg .v121-st[data-i="3"] .v121-stt small'));
    await openStep(page, 'mg', 1); await page.fill(inStep('mg', 'textarea[data-f="note"]'), 'Ask about AUM first');
    await openStep(page, 'mg', 2); await page.fill(inStep('mg', 'textarea[data-f="note"]'), 'Name the diagnostic');
    await page.click('#v97MgGoBtn'); await wait(page, 1800);
    const lt = last(hooks, /e3-low-ticket-run/), lb = lt ? lt.b : {};
    const st = (k) => (lb.plan || []).find((x) => x.key === k) || {};
    check('book a call goes to the Low-Ticket Agent with each step\'s notes in its plan (v123), not in the request text', st('survey').note === 'Ask about AUM first' && st('landing').note === 'Name the diagnostic' && !/About the funnel/.test(lb.request || ''), JSON.stringify(lb.plan));
    check('with the booking link and the call length, as before', lb.setup && lb.setup.booking && lb.setup.booking.url === 'https://calendly.com/qa-team/diagnostic' && /Call length: 45 min/.test(lb.setup.details || ''), lb.setup && lb.setup.details);
    check('and the funnel note is not left set after the send', (await ev(page, () => V113.mg.funNote || '')) === '');
    // a webinar: every step can change
    await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await wait(page, 500);
    check('a webinar shows its steps', JSON.stringify(await names(page, 'mg')) === JSON.stringify(['Ads', 'Registration page', 'Confirmation page', 'Confirmation, reminder and follow-up emails', 'Session outline']), JSON.stringify(await names(page, 'mg')));
    const reg = await txt(page, '#v121Plan_mg .v121-st[data-i="1"] .v121-stt small');
    check('the registration page asks for what is missing', /^Zoom · add title, date and time$/.test(reg) && !!(await page.$('#v121Plan_mg .v121-st[data-i="1"] small.is-todo')), reg);
    await openStep(page, 'mg', 1);
    const rq = await ev(page, () => [...document.querySelectorAll('#v121Plan_mg .v121-st.is-open .v121-q .nw-lbl')].map((x) => x.textContent.replace(/optional$/, '')).join('|'));
    check('its details are its own: title, date and time, where it runs, the link and the presenter', rq === 'Title|Date and time|Where it runs|Registration link|Presenter', rq);
    await page.fill(inStep('mg', 'input[placeholder="e.g. Governed AI for RIAs: the first 90 days"]'), 'Governed AI for RIAs');
    await page.click('#v121Plan_mg .v121-st[data-i="0"] .v121-sth'); await wait(page, 300);
    check('the step\'s line follows what was typed once you leave it', /Governed AI for RIAs/.test(await txt(page, '#v121Plan_mg .v121-st[data-i="1"] .v121-stt small')), await txt(page, '#v121Plan_mg .v121-st[data-i="1"] .v121-stt small'));
    await page.click(inStep('mg', '[aria-label="How many ads"] button:has-text("2")')); await wait(page, 200);
    await openStep(page, 'mg', 2); await page.click(inStep('mg', '.v121-del')); await wait(page, 200);
    await page.click('#v121Plan_mg .v121-add'); await wait(page, 250);
    await page.selectOption(inStep('mg', 'select[data-f="kind"]'), 'survey'); await wait(page, 250);
    check('a new step takes a kind, and its name follows the kind until it is renamed', (await ev(page, () => document.querySelector('#v121Plan_mg .v121-st.is-open input[data-f="name"]').value)) === 'New survey');
    await page.fill(inStep('mg', 'input[data-f="name"]'), 'Two quick questions');
    await page.fill(inStep('mg', 'textarea[data-f="note"]'), 'Ask their AUM and their role');
    await page.click(inStep('mg', 'button[aria-label="Move up"]')); await wait(page, 200);
    await page.click(inStep('mg', 'button[aria-label="Move up"]')); await wait(page, 200);
    await openStep(page, 'mg', 4); await page.click(inStep('mg', '.v121-del')); await wait(page, 300);
    check('the plan after the changes', JSON.stringify(await names(page, 'mg')) === JSON.stringify(['Ads', 'Registration page', 'Two quick questions', 'Confirmation, reminder and follow-up emails']), JSON.stringify(await names(page, 'mg')));
    check('a removed step\'s details stay in the plan under Other details', /Other details/.test(await txt(page, '#v121Plan_mg .v121-more')) && /Length/.test(await txt(page, '#v121Plan_mg .v121-more')), await txt(page, '#v121Plan_mg .v121-more'));
    const n0 = hooks.filter((h) => /e3-low-ticket-run/.test(h.u)).length;
    await page.click('#v97MgGoBtn'); await wait(page, 1500);
    const fr = last(hooks, /e3-funnel-run/), fb = fr ? fr.b : {};
    check('a webinar goes to the Funnel Builder with the plan', fb.funnel_type === 'webinar' && Array.isArray(fb.plan) && JSON.stringify(fb.plan.map((s) => s.key)) === JSON.stringify(['ads', 'registration_page', 'step_5', 'emails']) &&
      JSON.stringify(fb.plan.map((s) => s.kind)) === JSON.stringify(['ads', 'page', 'survey', 'emails']) && hooks.filter((h) => /e3-low-ticket-run/.test(h.u)).length === n0, fr && JSON.stringify(fb.plan));
    check('each step with its name, what it makes, the team\'s notes and the ads count', fb.plan && fb.plan[0].n === 2 && fb.plan[2].title === 'Two quick questions' && fb.plan[2].note === 'Ask their AUM and their role' && /three things they will learn/.test(fb.plan[1].does), fb.plan && JSON.stringify(fb.plan[2]));
    check('and the details as before', fb.details && fb.details.Title === 'Governed AI for RIAs' && fb.details['Where it runs'] === 'Zoom', fb.details && JSON.stringify(fb.details));
    // a funnel keeps one step besides the ads
    await ev(page, () => { const s = v121Edit('mg').steps; s.splice(1, s.length - 2); v121Paint('mg', true); });
    await openStep(page, 'mg', 1); await page.click(inStep('mg', '.v121-del')); await wait(page, 300);
    check('the last step besides the ads cannot be removed', (await names(page, 'mg')).length === 2 && /A funnel needs at least one step besides the ads/.test(await txt(page, '#nwToast')), await txt(page, '#nwToast'));
    // Save as our default for a funnel
    await page.click('#v121Plan_mg .v121-pf button:has-text("Save as our default")'); await wait(page, 800);
    const bp = (store.db.ai_settings.find((x) => x.key === 'build_plans') || {}).value || {};
    check('a funnel\'s plan saves as the team default too', bp['funnel:webinar'] && bp['funnel:webinar'].steps.length === 2, JSON.stringify(Object.keys(bp)));
    await page.click('#v111Cats_mg .v111-cat[data-c="download"]'); await wait(page, 300);
    await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await wait(page, 300);
    check('and the next webinar starts from it', (await names(page, 'mg')).length === 2 && /Your team’s default/.test(await txt(page, '#v121Plan_mg .v121-pf')), JSON.stringify(await names(page, 'mg')));
    await ctx.close();
  }

  // ---------------- A. the pane's size: it scrolls on its own at desktop width and fits a phone ----------------
  {
    const { ctx, page } = await open('/dashboard/marketing-generation');
    await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await wait(page, 400);
    await openStep(page, 'mg', 1);
    const sz = await ev(page, () => { const s = document.getElementById('nwMgSide'), cs = getComputedStyle(s); return { mh: cs.maxHeight, oy: cs.overflowY, pos: cs.position, fits: s.getBoundingClientRect().height <= innerHeight }; });
    check('at desktop width the pane stays in the window and scrolls on its own', sz.mh !== 'none' && sz.oy === 'auto' && sz.pos === 'sticky' && sz.fits, JSON.stringify(sz));
    await page.setViewportSize({ width: 390, height: 844 }); await wait(page, 500);
    const ph = await ev(page, () => ({ sw: document.documentElement.scrollWidth, w: innerWidth, plan: (() => { const r = document.getElementById('v121Plan_mg').getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= -1; })() }));
    check('on a phone the plan fits and nothing scrolls sideways', ph.sw <= ph.w && ph.plan, JSON.stringify(ph));
    await ctx.close();
  }

  // ---------------- C. calls on Tasks: type, people, client folders, type buttons ----------------
  {
    const { ctx, page, store, hooks } = await open('/dashboard/tasks');
    await wait(page, 800);
    const btn = await ev(page, () => [...document.querySelectorAll('#apTk .v121-cats .nw-chip')].map((b) => b.textContent));
    check('type buttons along the top, with how many calls each', JSON.stringify(btn) === JSON.stringify(['All5', 'Client demos1', 'Sales0', 'Client work1', 'Internal development0', 'Internal meetings2', 'Other1']), JSON.stringify(btn));
    const fd = await ev(page, () => [...document.querySelectorAll('#apTk .v121-fd')].map((s) => s.dataset.f + ':' + [...s.querySelectorAll('.ap-tk-call')].map((c) => c.dataset.id.slice(-1)).join('')));
    check('calls are filed in client folders: the team\'s own calls, a client company set on the call, the guests\' company, a folder set on the call', JSON.stringify(fd) === JSON.stringify(['AI Paragon (internal):31', 'Acme Wealth:4', 'Northwind Advisors:2', 'Partners:5']), JSON.stringify(fd));
    const fb = await ev(page, () => { const m = AP_CX.meta['fathom-qa-4'], was = m.client; m.client = null; const f = v121Folder('fathom-qa-4'); m.client = was;
      return { free: f, co: [v121Co('lee@gmail.com'), v121Co('jo@brightpath.example'), v121Co('a@smith-wealth.co.uk'), v121Co('pat@northwind-advisors.example')] }; });
    check('a guest on a free email names the folder by the guest; a company comes from the email domain', fb.free === 'Lee Example' && JSON.stringify(fb.co) === JSON.stringify(['', 'Brightpath', 'Smith Wealth', 'Northwind Advisors']), JSON.stringify(fb));
    const bar = await txt(page, '#apTk .ap-tk-call[data-id="fathom-qa-2"] .v121-bar');
    check('each call shows its type and the people on it, client side first', /Call type/.test(bar) && /With Pat Example, Sam Example, Erica Dresslar/.test(bar) && /Edit people and client/.test(bar), bar);
    const sel = await ev(page, () => { const s = document.querySelector('#apTk .ap-tk-call[data-id="fathom-qa-3"] select'); return { v: s.value, first: s.options[0].textContent, groups: [...s.querySelectorAll('optgroup')].map((g) => g.label).join('|'), last: s.options[s.options.length - 1].textContent }; });
    check('the type picker: the AI\'s pick until one is set, grouped like the buttons, and a way to add a type', sel.v === '' && sel.first === 'AI pick: Internal meeting' && sel.groups === 'Client demos|Sales|Client work|Internal development|Internal meetings|Other' && sel.last === '+ New type…', JSON.stringify(sel));
    await page.selectOption('#apTk .ap-tk-call[data-id="fathom-qa-3"] select', 'dev'); await wait(page, 800);
    const cm = store.db.call_meta.find((x) => x.call_id === 'fathom-qa-3');
    check('setting the type saves it on the call', cm && cm.meeting_type === 'dev', JSON.stringify(cm));
    const btn2 = await ev(page, () => [...document.querySelectorAll('#apTk .v121-cats .nw-chip')].map((b) => b.textContent));
    check('and the buttons count it', btn2.indexOf('Internal development1') >= 0 && btn2.indexOf('Internal meetings1') >= 0, JSON.stringify(btn2));
    await page.click('#apTk .v121-cats .nw-chip[data-cat="dev"]'); await wait(page, 300);
    const only = await ev(page, () => ({ ids: [...document.querySelectorAll('#apTk .ap-tk-call')].map((c) => c.dataset.id), on: (document.querySelector('#apTk .v121-cats [aria-pressed="true"]') || {}).textContent, n: (document.querySelector('#apTk .ap-tk-n') || {}).textContent }));
    check('a button shows only that kind of call, and the open count follows', JSON.stringify(only.ids) === '["fathom-qa-3"]' && only.on === 'Internal development1' && only.n === '3 open', JSON.stringify(only));
    await page.click('#apTk .v121-cats .nw-chip[data-cat="sales"]'); await wait(page, 300);
    check('a kind with no calls says so', /Nothing under Sales yet/.test(await txt(page, '#apTk')) || /No sales calls/.test(await txt(page, '#apTk')), (await txt(page, '#apTk')).slice(-120));
    await page.click('#apTk .v121-cats .nw-chip[data-cat="all"]'); await wait(page, 300);
    // a type of the team's own
    await page.selectOption('#apTk .ap-tk-call[data-id="fathom-qa-2"] select', '__new'); await wait(page, 400);
    check('+ New type asks for its name', await ev(page, () => { const m = document.getElementById('v121TypeM'); return !!m && m.style.display === 'flex'; }));
    await page.fill('#v121TypeIn', 'Sales call'); await page.click('#v121TypeGo'); await wait(page, 300);
    check('a type already in the list is refused', /That type is already in the list/.test(await txt(page, '#v121TypeErr')), await txt(page, '#v121TypeErr'));
    await page.fill('#v121TypeIn', 'Partner call'); await page.click('#v121TypeGo'); await wait(page, 1000);
    const ct = (store.db.ai_settings.find((x) => x.key === 'call_types') || {}).value;
    const cm2 = store.db.call_meta.find((x) => x.call_id === 'fathom-qa-2');
    check('the new type is saved for the team and set on the call', JSON.stringify(ct) === '["Partner call"]' && cm2 && cm2.meeting_type === 'Partner call', JSON.stringify({ ct, mt: cm2 && cm2.meeting_type }));
    const btn3 = await ev(page, () => [...document.querySelectorAll('#apTk .v121-cats .nw-chip')].map((b) => b.textContent));
    check('it gets its own button', btn3.indexOf('Partner call1') >= 0, JSON.stringify(btn3));
    const opts = await ev(page, () => [...document.querySelectorAll('#apTk .ap-tk-call[data-id="fathom-qa-4"] select optgroup')].map((g) => g.label).join('|'));
    check('and shows on every call\'s picker under Your types', /Your types$/.test(opts), opts);
    const w0 = store.writes.length;
    await page.selectOption('#apTk .ap-tk-call[data-id="fathom-qa-4"] select', '__new'); await wait(page, 300);
    await page.keyboard.press('Escape'); await wait(page, 500);
    check('closing the new type box saves nothing and puts the picker back', store.writes.length === w0 && (await ev(page, () => document.querySelector('#apTk .ap-tk-call[data-id="fathom-qa-4"] select').value)) === '', String(store.writes.length - w0));
    // people and client
    await page.click('#apTk .ap-tk-call[data-id="fathom-qa-2"] .v121-bar .nw-link'); await wait(page, 400);
    const md = await ev(page, () => { const m = document.getElementById('apCxEditM'); return m ? [...m.querySelectorAll('.f > span, .l')].map((x) => x.textContent).join('|') : ''; });
    check('Edit people and client opens the call\'s details: call type, client folder and the people on the call', /Call type/.test(md) && /Client folder/.test(md) && /People on the call/.test(md) && !/Meeting type|Guests/.test(md), md);
    check('the guests are there to edit (who recorded it is not a guest)', (await ev(page, () => [...document.querySelectorAll('#cxGuests .ap-cx-grow input.n')].map((i) => i.value).join(','))) === 'Pat Example,Sam Example');
    await page.fill('#cxClient', 'Northwind Advisors LLC');
    await page.click('#apCxEditM .ap-m89f .rd-btn.pri'); await wait(page, 900);
    const fd2 = await ev(page, () => [...document.querySelectorAll('#apTk .v121-fd')].map((s) => s.dataset.f));
    check('a client company set on the call names its folder', fd2.indexOf('Northwind Advisors LLC') >= 0 && fd2.indexOf('Northwind Advisors') < 0, JSON.stringify(fd2));
    // a folder shuts and opens
    await page.click('#apTk .v121-fd[data-f="Partners"] .v121-fdh'); await wait(page, 200);
    check('a folder folds up', await ev(page, () => { const s = document.querySelector('#apTk .v121-fd[data-f="Partners"]'); return s.classList.contains('is-shut') && getComputedStyle(s.querySelector('.v121-fdb')).display === 'none'; }));
    // the post-call actions get the team's type
    await ev(page, () => apCxGen('fathom-qa-2', null, '')); await wait(page, 600);
    const ca = (last(hooks, /call-actions/) || {}).b || {};
    check('writing the post-call actions again sends the call\'s type, the team\'s own too', ca.meeting_type === 'Partner call', JSON.stringify(ca.meeting_type));
    await ctx.close();
  }

  // ---------------- C. Tasks without Fathom ----------------
  {
    const { ctx, page, store } = await open('/dashboard/tasks', { noFathom: true });
    await wait(page, 800);
    const t = await ev(page, () => ({ cards: document.querySelectorAll('#apTk .ap-tk-call').length, who: (document.querySelector('#apTk .ap-tk-call[data-id="fathom-qa-2"] .v121-who') || {}).textContent, fd: [...document.querySelectorAll('#apTk .v121-fd')].map((s) => s.dataset.f) }));
    check('without Fathom the to-dos still show, filed by what is known', t.cards === 5 && t.who === 'No people listed' && JSON.stringify(t.fd) === JSON.stringify(['AI Paragon (internal)', 'Acme Wealth', 'No client yet', 'Partners']), JSON.stringify(t));
    await page.click('#apTk .ap-tk-call[data-id="fathom-qa-2"] .v121-bar .nw-link'); await wait(page, 400);
    check('Add people still opens the call\'s details', await ev(page, () => { const m = document.getElementById('apCxEditM'); return !!m && m.style.display === 'flex' && !!document.getElementById('cxGuests'); }));
    await page.click('#apCxEditM button:has-text("Add a person")'); await wait(page, 100);
    await page.fill('#cxGuests .ap-cx-grow:last-child input.n', 'Pat Example');
    await page.fill('#cxGuests .ap-cx-grow:last-child input.e', 'pat@northwind-advisors.example');
    await page.click('#apCxEditM .ap-m89f .rd-btn.pri'); await wait(page, 900);
    const cm = store.db.call_meta.find((x) => x.call_id === 'fathom-qa-2');
    const fd = await ev(page, () => [...document.querySelectorAll('#apTk .v121-fd')].map((s) => s.dataset.f));
    check('the people saved on the call file it under their company', cm && Array.isArray(cm.guests) && cm.guests[0].email === 'pat@northwind-advisors.example' && fd.indexOf('Northwind Advisors') >= 0, JSON.stringify({ g: cm && cm.guests, fd }));
    await ctx.close();
  }

  // ---------------- C. Calls: the buttons along the top, the type, people and folder on a call ----------------
  {
    const { ctx, page } = await open('/dashboard/calls');
    await wait(page, 800);
    const b = await ev(page, () => [...document.querySelectorAll('.v121-cats-w .nw-chip')].map((x) => x.textContent));
    check('Calls has the same type buttons along the top', b[0] === 'All5' && b.indexOf('Internal meetings2') >= 0 && b.indexOf('Client demos1') >= 0, JSON.stringify(b));
    await page.click('.v121-cats-w .nw-chip[data-cat="internal"]'); await wait(page, 400);
    const rows = await ev(page, () => [...document.querySelectorAll('.ap-call-row')].map((r) => r.dataset.id));
    check('a button shows only that kind of call', JSON.stringify(rows.sort()) === JSON.stringify(['fathom-qa-1', 'fathom-qa-3']), JSON.stringify(rows));
    const d = await txt(page, '.ap-calls .detail .ap-cx-meta');
    check('a call\'s details show its type, the people and the folder it is filed under', /Call type/.test(d) && /With Kaeser Valencerina, Erica Dresslar/.test(d) && /Filed under AI Paragon \(internal\)/.test(d), d);
    const fo = await ev(page, () => { const s = document.querySelector('.ap-cx-f select[aria-label="All folders"]'); return s ? [...s.options].map((o) => o.textContent).join('|') : ''; });
    check('the folder filter lists the client folders, with no type filter left', /AI Paragon \(internal\)/.test(fo) && /Northwind Advisors/.test(fo) && /Acme Wealth/.test(fo) && !(await page.$('.ap-cx-f select[aria-label="All types"]')), fo);
    // a call filed under a type of the team's own: its post-call tab says meeting notes, and Write again keeps the type
    await page.click('.v121-cats-w .nw-chip[data-cat="all"]'); await wait(page, 300);
    await page.click('.ap-call-row[data-id="fathom-qa-5"]'); await wait(page, 400);
    await ev(page, () => apCxSaveMeta('fathom-qa-5', { meeting_type: 'Partner call' }).then(() => apCxRepaint('fathom-qa-5'))); await wait(page, 400);
    await page.click('.ap-calls .detail .ap-call-seg [data-s="post"]'); await wait(page, 400);
    const pt = await txt(page, '.ap-calls .detail .ap-cx-ph');
    check('a team type\'s post-call tab reads meeting notes', /next steps, the meeting notes and a follow-up email/.test(pt) && !/undefined/.test(pt), pt);
    await page.click('.ap-calls .detail button:has-text("Write again")'); await wait(page, 400);
    const rg = await ev(page, () => { const s = document.querySelector('#apCxRegenM #apCxType'); return s ? s.value + '|' + [...s.querySelectorAll('optgroup')].map((g) => g.label).join(',') : ''; });
    check('and Write again offers it, picked', /^Partner call\|.*Your types$/.test(rg), rg);
    await ev(page, () => apModalClose('apCxRegenM'));
    await page.click('.v121-cats-w .nw-chip[data-cat="sales"]'); await wait(page, 400);
    check('a kind with no calls says so, with a way back', /Nothing under Sales here yet/.test(await txt(page, '.ap-calls .rows')) || /No sales calls here yet/.test(await txt(page, '.ap-calls .rows')), await txt(page, '.ap-calls .rows'));
    await ctx.close();
  }

  // ---------------- B. no sign-in flash ----------------
  {
    const sampler = () => {
      window.__v121f = [];
      const tick = () => {
        const lg = document.getElementById('view-login'), app = document.getElementById('view-app'), html = document.documentElement;
        let vis = false;
        if (lg) { const cs = getComputedStyle(lg); vis = cs.visibility !== 'hidden' && cs.display !== 'none' && !lg.classList.contains('hidden'); }
        const appOn = !!(app && !app.classList.contains('hidden'));
        window.__v121f.push({ vis: vis, resume: html.classList.contains('ap-resume'), app: appOn });
        if (window.__v121f.length < 3000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    // a saved session: never a frame with the sign-in screen
    {
      const { ctx, page } = await H.newPage(browser, BASE, { seed: true, bucket: errors });
      await ctx.addInitScript(sampler);
      await page.goto(BASE + '/dashboard', { waitUntil: 'load' });
      await H.settled(page, 'app'); await wait(page, 600);
      const f = await ev(page, () => window.__v121f.slice());
      check('with a saved session the sign-in screen never shows, frame by frame', f.length > 5 && !f.some((x) => x.vis), JSON.stringify({ n: f.length, vis: f.filter((x) => x.vis).length }));
      check('a loading screen covers it until the dashboard is up', f.some((x) => x.resume) && !(await ev(page, () => document.documentElement.classList.contains('ap-resume'))), JSON.stringify({ resume: f.filter((x) => x.resume).length }));
      await page.click('#nwNav .nw-item[data-view="tasks"]'); await wait(page, 800);
      check('and the dashboard takes clicks once it is up', /\/dashboard\/tasks$/.test(new URL(page.url()).pathname) && !!(await page.$('#apTk')), page.url());
      await ctx.close();
    }
    // no session: the sign-in screen shows straight away
    {
      const { ctx, page } = await H.newPage(browser, BASE, { bucket: errors });
      await ctx.addInitScript(sampler);
      await page.goto(BASE + '/dashboard', { waitUntil: 'load' });
      await H.settled(page, 'login');
      const f = await ev(page, () => window.__v121f.slice());
      check('signed out, the sign-in screen shows with no loading screen', f.some((x) => x.vis) && !f.some((x) => x.resume) && /\/dashboard\/login$/.test(page.url()), JSON.stringify({ vis: f.filter((x) => x.vis).length, resume: f.filter((x) => x.resume).length }));
      await page.fill('#apEmail', H.USER.email); await page.fill('#apPw', 'qa-password-1'); await page.click('#apAuthBtn');
      await H.settled(page, 'app');
      check('and signing in still works', await ev(page, () => !document.getElementById('view-app').classList.contains('hidden')));
      await ctx.close();
    }
    // a saved session that no longer works: the sign-in screen comes up once the check fails
    {
      const { ctx, page } = await H.newPage(browser, BASE, { bucket: errors });
      await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('qa.old')) { localStorage.setItem('ap.session.v1', JSON.stringify({ access_token: 'old', refresh_token: 'old-refresh', expires_at: Date.now() - 60000, user: { id: 'x', email: 'qa@aiparagonconsulting.com' } })); sessionStorage.setItem('qa.old', '1'); } } catch (e) {} });
      await ctx.addInitScript(sampler);
      await ctx.route('**/auth/v1/token**', (route) => route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token' }) }));
      await page.goto(BASE + '/dashboard', { waitUntil: 'load' });
      await H.settled(page, 'login'); await wait(page, 400);
      const f = await ev(page, () => window.__v121f.slice());
      const end = await ev(page, () => ({ resume: document.documentElement.classList.contains('ap-resume'), sess: localStorage.getItem('ap.session.v1') }));
      check('an old session that is refused: the loading screen, then the sign-in screen', f.some((x) => x.resume) && !end.resume && end.sess === null && /\/dashboard\/login$/.test(page.url()) && f[f.length - 1].vis, JSON.stringify(end));
      await ctx.close();
    }
  }

  const real = errors.filter((e) => !/ResizeObserver|Failed to fetch|NetworkError|Load failed|net::ERR/.test(e));
  check('no page errors', real.length === 0, real.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); }
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
