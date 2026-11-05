// v136 tests for new-aiparagon-dashboard.html (#1): the Lead pipeline by meeting stage (Erica's Nov 5 notes).
// The board's columns are the six meetings (Prospect research, Discovery consultation, Assessment, Proposal,
// Onboarding, Client review); a lead sits in the stage it is in (e1_leads.stage, or the furthest stage it has a
// document for); moving it into a stage asks, then saves the stage and writes only that stage's document (only:true,
// the notes as the transcript), or just moves it; a card offers its own stage's document, never the next one; the
// proposal needs an assessment; Onboarding and Client review go to Catalyst · Meeting Prep; the team renames the
// stages (ai_settings catalyst_stages); the list's tabs and Stage column, the overview, a lead's page (its stage, the
// prep for Onboarding and Client review, the follow-up guide only when it has one), the older New run form and the
// renamed documents; the layout at 1024 and 390 wide.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v136.test.js
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
const L1 = FX.L1, L2 = FX.L2, L3 = FX.L3;   // Pat QA (all five documents), Robin Test (the prospect brief), Sam Sample (nothing yet)
const DOC = (a) => 'QA' + a.replace(/_/g, '') + 'Doc0123456789abcdef';   // the fixtures' Google Doc ids
const FULL = '870a1ffa-cbc6-4085-894a-6f3bc90a40f2', CUSTOM = 'e1-custom-run-erica', PREP = 'catalyst-meeting-prep';
const NAMES = ['Prospect research', 'Discovery consultation', 'Assessment', 'Proposal', 'Onboarding', 'Client review'];
const KEYS = ['research', 'consultation', 'assessment', 'proposal', 'onboarding', 'review'];

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(o, url, width) {
    o = o || {};
    const t = FX.tables();
    if (o.more) o.more(t);
    const store = makeStore(t);
    const hooks = [];
    const hook = (u, m, b) => { let j = null; try { j = JSON.parse(b || ''); } catch (e) {} hooks.push({ p: u.replace(/^https:\/\/n8n\.aiparagonconsulting\.com\/webhook\//, ''), b: j });
      return o.hookFail && /e1-custom|870a1ffa|meeting-prep/.test(u) ? { status: 500, body: { message: 'boom' } } : { body: { ok: true, started: true } }; };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    await page.setViewportSize({ width: width || 1440, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + (url || '/dashboard/lead-pipeline'), { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1600);
    return { ctx, page, store, hooks };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 700);
  const txt = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
  const card = (email) => '#v120Board .v120-card[data-email="' + email + '"]';
  const col = (s) => '#v120Board .v120-col[data-s="' + s + '"]';
  const board = (page) => page.evaluate(() => [...document.querySelectorAll('#v120Board .v120-col')].map((c) => ({ s: c.dataset.s,
    name: c.querySelector('.v120-col-h').childNodes[1].textContent.trim(), n: +c.querySelector('.v120-col-h .c').textContent,
    cards: [...c.querySelectorAll('.v120-card')].map((x) => ({ who: x.querySelector('b').textContent, doc: ((x.querySelector('.v136-ok,.v120-next,.run') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      drag: x.getAttribute('draggable') })) })));
  const where = (b, who) => (b.find((c) => c.cards.some((x) => x.who === who)) || {}).s;
  const docOf = (b, who) => { for (const c of b) { const x = c.cards.find((y) => y.who === who); if (x) return x.doc; } return null; };
  const ask = (page) => page.evaluate(() => { const M = document.getElementById('v120M'); if (!M) return null;
    return { h: M.querySelector('h2').textContent, on: [...M.querySelectorAll('.v120-steps li.on')].map((x) => x.textContent), cur: [...M.querySelectorAll('.v120-steps li.cur')].map((x) => x.textContent),
      p: (M.querySelector('.nw-m-body > p') || {}).textContent || '', from: (M.querySelector('.v136-from') || {}).textContent || '', all: M.innerText.replace(/\s+/g, ' '),
      note: !!M.querySelector('#v120Note'), hint: (M.querySelector('.nw-lbl small') || {}).textContent || '', err: (M.querySelector('.v120-msg.err') || {}).textContent || '',
      btns: [...M.querySelectorAll('.nw-m-foot button')].map((b) => b.textContent.trim()) }; });
  const hookTo = (hooks, p) => hooks.filter((x) => x.p === p);
  const leadWrites = (store) => store.writes.filter((w) => w.table === 'e1_leads');
  const out = (email, agent, extra) => Object.assign({ id: '00000000-0000-4000-8000-0000000e' + String(Math.floor(Math.random() * 9000) + 1000), run_id: email, agent, output_type: 'json', title: agent,
    created_at: new Date().toISOString(), content_md: '# ' + agent + '\n\nSynthetic text.', data: { status: 'success', documentId: 'QA' + agent.replace(/_/g, '') + 'New0123456789ab' } }, extra || {});
  const tabs = (page) => page.$$eval('#apChrome .rd-tab', (b) => b.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
  const strip = (page) => page.$$eval('#apStrip button, #apStrip .rd-st, #apStrip > div > *', (b) => b.map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));

  // 1. the board by stage: six columns, each lead in its stage, each card offering its own stage's document
  {
    const { ctx, page } = await open();
    const b = await board(page);
    check('the board has a column per meeting stage, in order', JSON.stringify(b.map((c) => c.name)) === JSON.stringify(NAMES) && JSON.stringify(b.map((c) => c.s)) === JSON.stringify(KEYS), JSON.stringify(b.map((c) => c.name)));
    check('a lead sits in the furthest stage it has a document for, nothing yet means Prospect research', where(b, 'Sam Sample') === 'research' && where(b, 'Robin Test') === 'research' && where(b, 'Pat QA') === 'proposal' &&
      JSON.stringify(b.map((c) => c.n)) === JSON.stringify([2, 0, 0, 1, 0, 0]), JSON.stringify(b.map((c) => [c.s, c.n, c.cards.map((x) => x.who)])));
    check('each card offers its own stage\'s document: run it, or it is ready', docOf(b, 'Sam Sample') === 'Run prospect brief' && docOf(b, 'Robin Test') === '✓ Prospect brief ready' && docOf(b, 'Pat QA') === '✓ Proposal ready',
      JSON.stringify(b.map((c) => c.cards.map((x) => x.who + ': ' + x.doc))));
    check('no card offers the next stage\'s document', !(await txt(page, '#v120Board')).match(/Run (consultation|assessment|interview|follow)/i), await txt(page, '#v120Board'));
    check('the help line says what moving a lead does', /Move a lead to the stage it is in\. Catalyst writes that stage’s prep, and asks before it runs anything\./.test(await txt(page, '#v120Board .v120-help')), await txt(page, '#v120Board .v120-help'));
    const tb = await tabs(page);
    check('the list\'s tabs are the stages, with counts', JSON.stringify(tb) === JSON.stringify(['Board', 'All 3', 'Prospect research 2', 'Discovery consultation 0', 'Assessment 0', 'Proposal 1', 'Onboarding 0', 'Client review 0']), JSON.stringify(tb));
    const st = await txt(page, '#apStrip');
    check('the strip counts leads, the sales stages and clients', /3\s*Leads/.test(st) && /3\s*In the sales stages/.test(st) && /0\s*Clients/.test(st), st);
    await page.click(card(L2) + ' .v136-ok'); await wait(page, 2200);
    const v = await page.evaluate(() => ({ view: state.view, lead: state.e1Lead, tab: (document.querySelector('#apChrome .rd-tab.on') || {}).dataset ? document.querySelector('#apChrome .rd-tab.on').dataset.tab : '' }));
    check('a ready line opens the lead on that document', v.view === 'e1lead' && v.lead === L2 && v.tab === 's0', JSON.stringify(v));
    await ctx.close();
  }

  // 2. moving a lead into a stage asks, then saves the stage and writes only that stage's document
  {
    const { ctx, page, store, hooks } = await open();
    await page.dragAndDrop(card(L2), col('consultation')); await wait(page, 800);
    const m = await ask(page);
    check('dropping a lead on a stage asks first', m && m.h === 'Move Robin Test to Discovery consultation?', JSON.stringify(m));
    check('it names the stage, the document and that only that runs', m && JSON.stringify(m.on) === '["Discovery consultation"]' && JSON.stringify(m.cur) === '["Prospect research"]' &&
      m.p === 'In Discovery consultation, Catalyst writes the consultation guide. Only that runs, and nothing goes to the client.' && m.from === 'It works from the prospect brief and what was said in the first meeting.', JSON.stringify(m));
    check('with the brief on file the notes are optional; it can also just move it', m && m.note && /Optional\.$/.test(m.hint) && JSON.stringify(m.btns.slice(-3)) === '["Cancel","Just move it","Move and run it"]', JSON.stringify(m && m.btns));
    check('nothing is saved or started before the answer', leadWrites(store).length === 0 && hookTo(hooks, CUSTOM).length === 0);
    await page.fill('#v120Note', 'Synthetic notes from the first meeting.');
    await page.click('#v120Go'); await wait(page, 1400);
    const w = leadWrites(store);
    check('Move and run it saves the lead\'s stage', w.length === 1 && w[0].method === 'PATCH' && JSON.stringify(w[0].filters) === JSON.stringify([['email', 'eq.' + L2]]) && w[0].body.stage === 'consultation', JSON.stringify(w));
    const h = hookTo(hooks, CUSTOM)[0];
    check('then starts only the consultation guide, with the notes and the brief it works from', h && h.b.entry === 'interview_script' && h.b.only === true && h.b.stage === 'consultation' &&
      h.b.transcript === 'Synthetic notes from the first meeting.' && h.b.researchDocId === DOC('lead_research') && h.b.emailAddress === L2 && !!h.b.auth, JSON.stringify(h && h.b));
    check('the question closes and says it started', !(await page.$('#v120M')) && /^Started\. Consultation guide shows up on the card when it is done\./.test(await txt(page, '#nwToast')), await txt(page, '#nwToast'));
    let b = await board(page);
    check('the card is in Discovery consultation, writing the guide, and cannot be dragged meanwhile', where(b, 'Robin Test') === 'consultation' && docOf(b, 'Robin Test') === 'Writing the consultation guide' &&
      b.find((c) => c.s === 'consultation').cards[0].drag === null, JSON.stringify(b.map((c) => [c.s, c.cards])));
    check('the tab counts follow', JSON.stringify(await tabs(page)) === JSON.stringify(['Board', 'All 3', 'Prospect research 1', 'Discovery consultation 1', 'Assessment 0', 'Proposal 1', 'Onboarding 0', 'Client review 0']), JSON.stringify(await tabs(page)));
    check('the run is kept with the workspace, by stage', await page.evaluate((e) => !!(RD.e1run && RD.e1run[e] && RD.e1run[e].s === 'consultation'), L2));
    store.db.agent_outputs.push(out(L2, 'interview_script'));
    await page.evaluate(async () => { await v120Reload(); v120Paint(); }); await wait(page, 400);
    b = await board(page);
    check('when the guide lands the card says it is ready and stays in its stage: nothing else runs', where(b, 'Robin Test') === 'consultation' && docOf(b, 'Robin Test') === '✓ Consultation guide ready' &&
      !(await page.evaluate((e) => !!(RD.e1run || {})[e], L2)) && hookTo(hooks, CUSTOM).length === 1, JSON.stringify(b.map((c) => [c.s, c.cards])));
    await page.evaluate((e) => { RD.e1run[e] = { s: 'assessment', t0: Date.now() - 46 * 60e3, seen: 0 }; v120Paint(); }, L3); await wait(page, 200);
    check('a run with no news for 45 minutes stops showing as running', docOf(await board(page), 'Sam Sample') === 'Run prospect brief' && !(await page.evaluate((e) => !!(RD.e1run || {})[e], L3)));
    await ctx.close();
  }

  // 3. Just move it; then the card's own Run, with notes standing in for what the lead does not have
  {
    const { ctx, page, store, hooks } = await open();
    await page.dragAndDrop(card(L3), col('assessment')); await wait(page, 800);
    await page.click('#v136Move'); await wait(page, 1200);
    const w = leadWrites(store);
    check('Just move it saves the stage and starts nothing', w.length === 1 && w[0].body.stage === 'assessment' && hooks.filter((x) => x.p === CUSTOM || x.p === FULL || x.p === PREP).length === 0, JSON.stringify(w));
    let b = await board(page);
    check('the card sits in Assessment and offers the assessment', where(b, 'Sam Sample') === 'assessment' && docOf(b, 'Sam Sample') === 'Run assessment' && /^Moved to Assessment\./.test(await txt(page, '#nwToast')), JSON.stringify(b.map((c) => [c.s, c.cards])));
    await page.click(card(L3) + ' .v120-next'); await wait(page, 800);
    const m = await ask(page);
    check('its Run asks without moving it, and needs notes: the lead has no consultation guide', m && m.h === 'Run the assessment report for Sam Sample?' && m.note && /^Needed: this lead has no consultation guide yet/.test(m.hint) &&
      !m.btns.includes('Just move it') && m.btns.includes('Run it'), JSON.stringify(m));
    await page.click('#v120Go'); await wait(page, 900);
    check('it will not start without notes', hookTo(hooks, CUSTOM).length === 0 && /Paste the meeting transcript or your notes first\. This lead has no consultation guide to work from yet, and no recorded call with it\./.test(await txt(page, '#v120Msg'))   /* v137: and no recorded call */, await txt(page, '#v120Msg'));
    await page.fill('#v120Note', 'Synthetic consultation notes.');
    await page.click('#v120Go'); await wait(page, 1300);
    const h = hookTo(hooks, CUSTOM)[0];
    check('with notes it writes only the assessment, from the notes', h && h.b.entry === 'anonymizer' && h.b.only === true && h.b.stage === 'assessment' && h.b.transcript === 'Synthetic consultation notes.' &&
      h.b.researchDocId === '' && h.b.interviewDocId === '', JSON.stringify(h && h.b));
    check('a run in place saves no stage', leadWrites(store).length === 1);
    await ctx.close();
  }

  // 4. the proposal needs the assessment; Onboarding goes to Meeting Prep; the prospect brief is the full run, alone
  {
    const { ctx, page, store, hooks } = await open();
    await page.dragAndDrop(card(L2), col('proposal')); await wait(page, 800);
    let m = await ask(page);
    check('the proposal without an assessment says so and offers only Just move it', m && /^The proposal works from the assessment report, and this lead has none yet\. Run the assessment first\.$/.test(m.err) &&
      JSON.stringify(m.btns.slice(-2)) === '["Cancel","Just move it"]' && !m.note, JSON.stringify(m));
    await page.evaluate(() => nwModalClose());
    await page.dragAndDrop(card(L1), col('onboarding')); await wait(page, 800);
    m = await ask(page);
    check('Onboarding writes the onboarding plan from everything so far', m && m.h === 'Move Pat QA to Onboarding?' && /Catalyst writes the onboarding plan\. Only that runs/.test(m.p) && /every document so far/.test(m.from), JSON.stringify(m));
    await page.fill('#v120Note', 'Synthetic kickoff notes.');
    await page.click('#v120Go'); await wait(page, 1300);
    const h = hookTo(hooks, PREP)[0];
    check('it goes to Catalyst · Meeting Prep with the stage, its name, the lead and the notes', h && h.b.stage === 'onboarding' && h.b.stageName === 'Onboarding' && h.b.docName === 'Onboarding plan' &&
      h.b.leadEmail === L1 && JSON.stringify(h.b.emails) === JSON.stringify([L1]) && h.b.transcript === 'NOTES FROM THE TEAM\nSynthetic kickoff notes.\n\nTHE CRM RECORD (HubSpot)\nPat QA · Managing Partner · QA Firm LLC · lifecycle stage: lead · lead status: NEW · website: https://qafirm.example' && h.b.companyName === 'QA Firm LLC'   /* v137: Onboarding reads the CRM record too */ && !!h.b.auth && hookTo(hooks, CUSTOM).length === 0, JSON.stringify(h && h.b));
    check('and saves the stage', leadWrites(store).some((w) => w.body.stage === 'onboarding'));
    check('the card shows the onboarding plan being written', docOf(await board(page), 'Pat QA') === 'Writing the onboarding plan', docOf(await board(page), 'Pat QA'));
    await page.click(card(L3) + ' .v120-next'); await wait(page, 800);
    m = await ask(page);
    check('Run prospect brief asks for no notes: the first meeting has not happened', m && m.h === 'Run the pre-meeting prospect brief for Sam Sample?' && !m.note, JSON.stringify(m));
    await page.click('#v120Go'); await wait(page, 1300);
    const f = hookTo(hooks, FULL)[0];
    check('it starts the full run for the brief alone, with the intake form\'s fields', f && f.b.only === true && f.b.stage === 'research' && !('entry' in f.b) && f.b.firstName === 'Sam' && f.b.lastName === 'Sample' &&
      f.b.emailAddress === L3 && f.b.hearAboutUs === 'Dashboard run', JSON.stringify(f && f.b));
    await ctx.close();
    const x = await open({ hookFail: true });
    await x.page.dragAndDrop(card(L2), col('consultation')); await wait(x.page, 800);
    await x.page.click('#v120Go'); await wait(x.page, 1300);
    check('a start n8n refuses: moved, it says so, the question stays open', !!(await x.page.$('#v120M')) && /^Moved to Discovery consultation, but it could not start: Webhook returned 500\. Try again in a minute\.$/.test(await txt(x.page, '#v120Msg')) &&
      leadWrites(x.store).length === 1, await txt(x.page, '#v120Msg'));
    check('and shows no run', !(await x.page.evaluate((e) => !!(RD.e1run || {})[e], L2)) && docOf(await board(x.page), 'Robin Test') === 'Run consultation guide', docOf(await board(x.page), 'Robin Test'));
    await x.ctx.close();
  }

  // 5. drops it refuses: its own stage, and a lead being written for
  {
    const { ctx, page, store, hooks } = await open();
    await page.dragAndDrop(card(L1), col('proposal')); await wait(page, 500);
    check('a lead dropped on its own stage asks nothing', !(await page.$('#v120M')) && leadWrites(store).length === 0);
    await page.hover(card(L2)); await page.mouse.down();
    const bx = await page.locator(col('review')).boundingBox();
    await page.mouse.move(bx.x + bx.width / 2, bx.y + 80, { steps: 6 }); await wait(page, 200);
    const faded = await page.evaluate(() => [...document.querySelectorAll('#v120Board .v120-col')].map((c) => c.classList.contains('no')));
    await page.mouse.up(); await wait(page, 600);
    check('while dragging, only its own stage fades', JSON.stringify(faded) === JSON.stringify([true, false, false, false, false, false]), JSON.stringify(faded));
    await page.evaluate(() => nwModalClose());
    check('nothing started', hooks.filter((x) => x.p === CUSTOM || x.p === FULL || x.p === PREP).length === 0);
    await ctx.close();
  }

  // 6. a stored stage wins over the documents; Client review's prep on the board and on the lead's page
  {
    const more = (t) => {
      t.e1_leads.find((l) => l.email === L1).stage = 'review';
      t.agent_outputs.push(out(L2, 'meeting_prep', { title: 'Client review brief · Testwell Partners', content_md: '# Client review brief\n\n## What we set out to do\n\nSynthetic review text.', data: { stage: 'review', stage_name: 'Client review' } }));
      t.e1_leads.find((l) => l.email === L2).stage = 'review';
    };
    const { ctx, page } = await open({ more });
    const b = await board(page);
    check('a lead moved to a stage stays there, whatever documents it has', where(b, 'Pat QA') === 'review' && where(b, 'Robin Test') === 'review', JSON.stringify(b.map((c) => [c.s, c.cards.map((x) => x.who)])));
    check('Client review offers the review brief, or says it is ready', docOf(b, 'Pat QA') === 'Run review brief' && docOf(b, 'Robin Test') === '✓ Review brief ready', JSON.stringify(b.map((c) => c.cards)));
    const st = await txt(page, '#apStrip');
    check('the strip counts them as clients', /2\s*Clients/.test(st) && /1\s*In the sales stages/.test(st), st);
    await page.evaluate((e) => openE1Lead(e), L2); await wait(page, 2400);
    let tb = await tabs(page);
    check('the lead\'s page has the review brief\'s tab and no follow-up guide tab (it has none)', tb.includes('✓ Client review brief') && !tb.some((t) => /Follow-up/.test(t)), JSON.stringify(tb));
    const pur = await txt(page, '#apChrome .rd-purpose');
    check('it says the stage and that its prep is ready', /Stage: Client review · Client review brief ready/.test(pur), pur);
    await page.click('#apChrome .rd-tab[data-tab="m_review"]'); await wait(page, 500);
    await page.click('section[data-v136="review"] button:has-text("Read inline")'); await wait(page, 300);
    check('the brief reads inline', /What we set out to do/.test(await txt(page, 'section[data-v136="review"] .v136-prep')), await txt(page, 'section[data-v136="review"]'));
    await page.evaluate((e) => openE1Lead(e), L1); await wait(page, 2400);
    tb = await tabs(page);
    check('a lead in Client review with no brief yet has the tab, saying so, with Run', tb.includes('Client review brief') && /has not been written yet/.test(await txt(page, 'section[data-v136="review"]')) &&
      !!(await page.$('section[data-v136="review"] .v136-none button')), JSON.stringify(tb) + ' ' + (await txt(page, 'section[data-v136="review"]')));
    check('and the follow-up guide tab, which it has', tb.some((t) => /Follow-up guide/.test(t)), JSON.stringify(tb));
    await page.selectOption('#apChrome .v136-move select', 'assessment'); await wait(page, 900);
    const m = await ask(page);
    check('the Stage picker on the lead\'s page asks the same question', m && m.h === 'Move Pat QA to Assessment?' && (await page.$eval('#apChrome .v136-move select', (s) => s.value)) === 'review', JSON.stringify(m));
    await page.click('#v136Move'); await wait(page, 2600);
    check('Just move it from the lead\'s page shows the new stage there', /Stage: Assessment · Assessment report ready/.test(await txt(page, '#apChrome .rd-purpose')) &&
      (await page.$eval('#apChrome .v136-move select', (s) => s.value)) === 'assessment', await txt(page, '#apChrome .rd-purpose'));
    await ctx.close();
  }

  // 7. renaming the stages, for the whole team
  {
    const { ctx, page, store } = await open();
    await page.click('#v120Board .v136-rn'); await wait(page, 600);
    const inputs = await page.$$eval('#v136R input[data-k]', (els) => els.map((e) => e.dataset.k + '=' + e.value));
    check('Rename stages lists the six, with their names', JSON.stringify(inputs) === JSON.stringify(KEYS.map((k, i) => k + '=' + NAMES[i])), JSON.stringify(inputs));
    await page.fill('#v136R input[data-k="research"]', 'First look');
    await page.fill('#v136R input[data-k="review"]', '  Quarterly   review ');
    await page.click('#v136RGo'); await wait(page, 1200);
    const w = store.writes.filter((x) => x.table === 'ai_settings' && JSON.stringify(x.body).indexOf('catalyst_stages') >= 0).map((x) => Array.isArray(x.body) ? x.body[0] : x.body);
    const v = w.length ? (typeof w[w.length - 1].value === 'string' ? JSON.parse(w[w.length - 1].value) : w[w.length - 1].value) : {};
    check('saving stores the team\'s names, tidied, and nothing for the ones unchanged', v.research && v.research.name === 'First look' && v.review && v.review.name === 'Quarterly review' && v.consultation && v.consultation.name === '', JSON.stringify(v));
    const b = await board(page);
    check('the board and the tabs use them', b[0].name === 'First look' && b[5].name === 'Quarterly review' && (await tabs(page)).includes('First look 2') && (await tabs(page)).includes('Quarterly review 0'), JSON.stringify([b.map((c) => c.name), await tabs(page)]));
    await page.dragAndDrop(card(L3), col('review')); await wait(page, 800);
    check('and the question too', ((await ask(page)) || {}).h === 'Move Sam Sample to Quarterly review?', JSON.stringify(await ask(page)));
    await page.evaluate(() => nwModalClose());
    await page.click('#v120Board .v136-rn'); await wait(page, 600);
    await page.click('#v136R button:has-text("Use the usual names")'); await wait(page, 200);
    check('Use the usual names puts them back in the boxes', (await page.$eval('#v136R input[data-k="research"]', (e) => e.value)) === 'Prospect research');
    await page.click('#v136RGo'); await wait(page, 1200);
    check('and saving them shows them again', (await board(page))[0].name === 'Prospect research', (await board(page))[0].name);
    await ctx.close();
  }

  // 8. the list's Stage column and tabs, the overview, the renamed documents, Deliverables
  {
    const { ctx, page } = await open();
    await page.click('#apChrome .rd-tab[data-tab="all"]'); await wait(page, 800);
    const rows = await page.$$eval('#e1Body tbody tr', (r) => r.map((x) => [x.children[0].innerText.split('\n')[0], x.children[2].innerText.replace(/\s+/g, ' ').trim()]));
    check('the list\'s Stage column says each lead\'s stage and how many documents it has', JSON.stringify(rows.map((r) => r[1]).sort()) === JSON.stringify(['Proposal 5 documents', 'Prospect research 0 documents', 'Prospect research 1 document'].sort()) &&
      (await page.$eval('#e1Body thead th:nth-child(3)', (e) => e.textContent)) === 'Stage', JSON.stringify(rows));
    await page.click('#apChrome .rd-tab[data-tab="st_proposal"]'); await wait(page, 800);
    const pr = await page.$$eval('#e1Body tbody tr', (r) => r.map((x) => x.innerText.split('\n')[0]).filter((t) => !/No leads/.test(t)));
    check('a stage tab lists the leads in that stage', JSON.stringify(pr) === '["Pat QA"]', JSON.stringify(pr));
    await page.evaluate(() => apGo('e1overview')); await wait(page, 2200);
    const ov = await page.evaluate(() => ({ h: (document.querySelector('#main section[data-tp="agents"] h2') || {}).textContent || '',
      cards: [...document.querySelectorAll('#main .ap-a5s .ap-a3')].map((c) => c.querySelector('.kind').textContent + ' / ' + c.querySelector('.nm').textContent + ' / ' + c.querySelector('.ft').textContent.trim()) }));
    check('the overview shows the six meetings and what each writes', ov.h === 'Six meetings, prep for each' && JSON.stringify(ov.cards) === JSON.stringify([
      'Prospect research / Pre-meeting prospect brief / 2 leads in this stage', 'Discovery consultation / Consultation guide / 0 leads in this stage', 'Assessment / Assessment report / 0 leads in this stage',
      'Proposal / Proposal presentation / 1 lead in this stage', 'Onboarding / Onboarding plan / 0 leads in this stage', 'Client review / Client review brief / 0 leads in this stage']), JSON.stringify(ov));
    await page.evaluate((e) => openE1Lead(e), L1); await wait(page, 2400);
    const h2 = await page.$$eval('#main > section.block > h2', (h) => h.map((x) => x.childNodes[0].textContent.trim()).filter((t) => /^\d\./.test(t)));
    check('the lead\'s page names the documents for the meeting each one prepares', JSON.stringify(h2) === JSON.stringify(['1. Pre-meeting prospect brief', '2. Consultation guide', '3. Assessment report', '4. Follow-up guide', '5. Proposal presentation']), JSON.stringify(h2));
    await page.evaluate(() => apGo('deliverables')); await wait(page, 1800);
    const dl = await page.evaluate(() => (V115.dl.rows || []).filter((r) => r.who === 'Pat QA').map((r) => r.title).sort().join(' | '));
    check('Deliverables uses the same names', /Consultation guide/.test(dl) && /Proposal presentation/.test(dl) && /Pre-meeting prospect brief/.test(dl) && !/Growth Plan|Interview Script|Lead Research/.test(dl), dl);
    await page.evaluate(() => apGo('learning')); await wait(page, 1800);
    const w = await page.$$eval('.ap-ais .ap-where > div', (els) => els.map((el) => (el.querySelector('b') || {}).textContent || ''));
    check('AI settings lists what the Catalyst agents write now', w.includes('Catalyst agents (prospect brief, consultation guide, assessment, proposal, onboarding and client review prep, post-call actions)'), JSON.stringify(w));
    await ctx.close();
  }

  // 9. the older New run form starts a client at a stage and runs only that one
  {
    const { ctx, page, store, hooks } = await open();
    await page.evaluate(() => openE1RunModal()); await wait(page, 600);
    const opts = await page.$$eval('#e1Run .e1run-opt b', (b) => b.map((x) => x.textContent));
    check('New run asks which stage the client is at', JSON.stringify(opts) === '["Prospect research","Discovery consultation","Assessment"]' && /Only that stage runs\./.test(await txt(page, '#e1Run')), JSON.stringify(opts));
    await page.check('#e1Run input[name="e1entry"][value="anonymizer"]');
    await page.fill('#rFirst', 'Nova'); await page.fill('#rLast', 'Synthetic'); await page.fill('#rCompany', 'Synthetic Advisors'); await page.fill('#rEmail', 'nova.synthetic@example.com');
    await page.fill('#rTranscript', 'Synthetic consultation transcript.');
    await page.click('#rGo'); await wait(page, 1500);
    const h = hookTo(hooks, CUSTOM)[0];
    check('it starts only the assessment', h && h.b.entry === 'anonymizer' && h.b.only === true && h.b.stage === 'assessment' && h.b.transcript === 'Synthetic consultation transcript.', JSON.stringify(h && h.b));
    const w = leadWrites(store);
    check('and puts the new client in Assessment', w.some((x) => x.method === 'POST' && (Array.isArray(x.body) ? x.body[0] : x.body).stage === 'assessment' && (Array.isArray(x.body) ? x.body[0] : x.body).email === 'nova.synthetic@example.com'), JSON.stringify(w));
    await ctx.close();
  }

  // 10. the board at 1024 and 390 wide
  {
    const { ctx, page } = await open({}, '/dashboard/lead-pipeline', 1024);
    let g = await page.evaluate(() => getComputedStyle(document.querySelector('#v120Board .v120-kan')).gridTemplateColumns.split(' ').length);
    check('at 1024 wide the stages sit in two rows of three', g === 3, String(g));
    await page.setViewportSize({ width: 390, height: 860 }); await wait(page, 600);
    g = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector('#v120Board .v120-kan')).gridTemplateColumns.split(' ').length, sw: document.documentElement.scrollWidth,
      btn: (() => { const b = document.querySelector('#v120Board .v136-rn').getBoundingClientRect(); return b.right <= 390 && b.width > 0; })() }));
    check('on a phone the stages stack, Rename stages fits, with no sideways scroll', g.cols === 1 && g.sw <= 390 && g.btn, JSON.stringify(g));
    await page.click('#v120Board .v136-rn'); await wait(page, 500);
    const d = await page.evaluate(() => { const m = document.querySelector('#v136R'); const r = m.getBoundingClientRect(); return { right: Math.round(r.right), sw: document.documentElement.scrollWidth }; });
    check('and the rename dialog fits too', d.right <= 390 && d.sw <= 390, JSON.stringify(d));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
