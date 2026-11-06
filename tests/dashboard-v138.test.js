// v138 tests for new-aiparagon-dashboard.html (#1): Erica's notes on the Meeting Intelligence video v7.
// The lead's emails logged in HubSpot are an input to every stage that meets the client (Templates sets it per stage,
// on by default): the questions list them and the runs send them in the notes, after the CRM record and before the
// transcripts; with the emails off, or none, the notes are what v137 sent. The client proposal, the onboarding plan
// and the client review draw charts (a timeline, bars) from the documents' own numbers, drawn on the page under the
// section they name, kept through an edit and in Save as PDF, with a table in their place on a phone. The client
// proposal reads the consultation guide, and Write the client proposal reads what the Proposal stage reads. A stage card
// on Templates no longer stretches when the card beside it opens its Writes list.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js), and the
// n8n webhooks (Fathom and HubSpot emails included) answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v138.test.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
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
const CUSTOM = 'e1-custom-run-erica', PREP = 'catalyst-meeting-prep', MAILS = 'catalyst-emails', PROP = 'catalyst-proposal';
const ME = 'qa@aiparagonconsulting.com';
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const day = (v) => { const d = new Date(v); const o = { month: 'short', day: 'numeric' }; if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric'; return d.toLocaleDateString('en-US', o); };
const dayY = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const call = (id, h, title, guests, mins) => ({ id, title, start: ago(h), end: new Date(Date.now() - h * 3600e3 + (mins || 40) * 60e3).toISOString(),
  share_url: 'https://fathom.video/share/' + id + 'abcdef', recorded_by: { name: 'QA Tester', email: ME },
  invitees: guests.map((g) => ({ name: g[0], email: g[1], external: true })).concat([{ name: 'QA Tester', email: ME, external: false }]) });
const CA = call('fx-a', 20, 'Intro call · Testwell', [['Robin Test', L2]], 38);
const CD = call('fx-d', 6, 'Proposal walk-through · QA Firm', [['Pat QA', L1]], 45);
const TX = {
  'fx-a': [{ speaker: 'Robin Test', text: 'Our month-end reports take two days.' }, { speaker: 'QA Tester', text: 'Who puts them together today?' }],
  'fx-d': [{ speaker: 'Pat QA', text: 'The proposal looks right. Can we start in January?' }],
};
// the emails HubSpot has logged, as Dashboard · HubSpot Emails Proxy returns them (newest first)
const E2a = { id: 'm2', at: ago(30), incoming: true, subject: 'Month-end numbers', from: L2, to: [ME], text: 'Hi,\n\nThe month-end close took 9 days in September and 7 in October.\n\nRobin' };
const E2b = { id: 'm1', at: ago(60), incoming: false, subject: 'Before our first call', from: ME, to: [L2], text: 'Robin,\n\nCould you bring the close times for the last two months?\n\nQA' };
const E1a = { id: 'm3', at: ago(10), incoming: true, subject: 'Overtime by site', from: L1, to: [ME], text: 'Pat here. Overtime last quarter: North 400 hours, South 250 hours.' };
const EM = { [L2]: [E2a, E2b], [L1]: [E1a] };
const BRAND = { colors: { primary: '#0E5A63', accent: '#D9902F', text: '#1E2A33' }, fonts: { heading: 'Montserrat', body: 'Source Serif 4' }, found: ['colors', 'fonts'] };
function sources() {
  return [
    { id: '00000000-0000-4000-8000-000000138001', kind: 'proposal_template', file_name: 'QA proposal template.docx', file_type: 'docx', file_path: 'sources/1-a.docx', active: true,
      created_at: '2026-10-27T10:00:00Z', sections: [{ title: 'Where you are today' }, { title: 'Scope of work' }, { title: 'Timeline and investment' }], brand: BRAND, file_text: '# Proposal and Scope of Work' },
    { id: '00000000-0000-4000-8000-000000138002', kind: 'discovery_template', file_name: 'QA discovery call questions.docx', file_type: 'docx', file_path: 'sources/1-b.docx', active: true,
      created_at: '2026-10-27T10:00:01Z', sections: [{ title: 'Open with' }], brand: BRAND, file_text: '# Discovery call questions' },
    { id: '00000000-0000-4000-8000-000000138003', kind: 'past_assessment', file_name: 'QA past assessment.docx', file_type: 'docx', file_path: 'sources/1-c.docx', active: true,
      created_at: '2026-10-27T10:00:02Z', sections: [{ title: 'Summary' }], brand: BRAND, file_text: '# Operating model assessment' }];
}
const TL = { type: 'timeline', title: 'The 12-week engagement', after: 'Scope of work', unit: 'week', items: [{ label: 'Map', start: 1, end: 2 }, { label: 'Design', start: 3, end: 6 },
  { label: 'Pilot at North', start: 7, end: 10 }, { label: 'Roll out to South', start: 11, end: 12 }] };
const BARS = { type: 'bars', title: 'Overtime hours by site, last quarter', after: 'Where you are today', unit: 'hours', items: [{ label: 'North', value: 400 }, { label: 'South', value: 250 }, { label: 'East', value: 100 }] };
function proposalRow(brand, visuals) {
  const doc = { title: 'Decisions at every site', subtitle: 'For QA Firm', kicker: 'Proposal and Scope of Work', client: 'QA Firm LLC', prepared_for: 'Pat QA, Managing Partner', prepared_by: 'QA Advisors',
    date: 'November 2, 2026', note: 'Confidential. Prepared for QA Firm LLC.', sections: [
      { title: 'Where you are today', body: 'Overtime last quarter: North 400 hours, South 250 hours, East 100 hours.', sources: ['call', 'consultation', 'assessment'] },
      { title: 'Scope of work', body: '- **Map (weeks 1 to 2):** every decision\n- **Design (weeks 3 to 6):** the rules', sources: ['template', 'growth_plan'] },
      { title: 'Timeline and investment', body: '**Fee:** [FILL IN: fee]', sources: ['template'] }], visuals: visuals || [BARS, TL] };
  return { id: '00000000-0000-4000-8000-0000000c1380', run_id: L1, agent: 'client_proposal', output_type: 'client_proposal', title: 'Proposal and Scope of Work · QA Firm LLC', created_at: '2026-11-02T15:00:00Z',
    content_md: '# Decisions at every site', data: { doc, brand: brand || BRAND, call: { id: '', title: '', date: '' }, via: 'growth_plan',
      sources: [{ key: 'template', label: 'your proposal template' }, { key: 'call', label: 'the meetings' }, { key: 'consultation', label: 'the consultation guide' }, { key: 'assessment', label: 'the assessment' }] } };
}
const PREP_MD = '# Onboarding plan · QA Firm LLC\n\n## What we agreed\n\n- Twelve weeks, starting in January.\n\n## Goals and how we will measure them\n\n- Less overtime at North.\n\n## The first 30 days\n\n- Week 1: the kickoff.';
const PREP_VIS = [{ type: 'timeline', title: 'The first weeks', after: 'What we agreed', unit: 'week', items: [{ label: 'Kickoff and map', start: 1, end: 2 }, { label: 'Design', start: 3, end: 6 }] },
  { type: 'bars', title: 'Overtime baseline', after: 'Goals and how we will measure them', unit: 'hours', items: [{ label: 'North', value: 400 }, { label: 'South', value: 250 }] }];

// marked, the version the dashboard loads from cdnjs, kept in tests/.cache (fetched from npm once, like pdf.js in the v132 suite),
// so the meeting prep documents render their sections as they do on the live site
const MARKED = '12.0.0';
function markedJs() {
  const dir = path.join(__dirname, '.cache', 'marked-' + MARKED), f = path.join(dir, 'package', 'marked.min.js');
  if (!fs.existsSync(f)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('npm', ['pack', 'marked@' + MARKED], { cwd: dir, stdio: 'ignore' });
    execFileSync('tar', ['xzf', 'marked-' + MARKED + '.tgz'], { cwd: dir });
  }
  return fs.readFileSync(f);
}

(async () => {
  const MK = markedJs();
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  // o.more(t): change the tables; o.calls: Fathom's list; o.mail: how the emails webhook answers ('down' 404, 'hubspot' a refusal)
  async function open(o, url, width) {
    o = o || {};
    const t = FX.tables();
    t.hubspot_contacts.push({ email: L2, first_name: 'Robin', last_name: 'Test', company: 'Testwell Partners', phone: '', job_title: 'COO', website: 'https://testwell.example',
      lifecycle_stage: 'lead', lead_status: 'NEW', hs_id: '9050', props: {}, synced_at: ago(1), first_seen: null });
    if (o.more) o.more(t);
    const store = makeStore(t);
    const hooks = [];
    const hook = (u, m, b) => {
      let j = null; try { j = JSON.parse(b || ''); } catch (e) {}
      const p = u.replace(/^https:\/\/n8n\.aiparagonconsulting\.com\/webhook\//, '');
      hooks.push({ p, b: j });
      if (/fathom-proxy$/.test(u)) {
        if (j && j.action === 'list') return { body: { ok: true, items: o.calls || [CA] } };
        if (j && j.action === 'transcript') return TX[j.id] ? { body: { ok: true, transcript: TX[j.id] } } : { body: { ok: false, message: 'Fathom did not answer' } };
        return { body: { ok: true } };
      }
      if (p === MAILS) {
        if (o.mail === 'down') return { status: 404, body: { message: 'not registered' } };
        if (o.mail === 'hubspot') return { body: { ok: false, code: 'hubspot', message: 'HubSpot did not answer: rate limit' } };
        const em = ((j && j.emails) || []).map((e) => String(e).toLowerCase());
        const items = [].concat(...em.map((e) => EM[e] || []));
        return { body: { ok: true, items, total: items.length } };
      }
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    await ctx.route(/\/marked\/12\.0\.0\/marked\.min\.js$/, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: MK }));
    await page.setViewportSize({ width: width || 1440, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + (url || '/dashboard/today'), { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1200);
    return { ctx, page, store, hooks };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 700);
  const txt = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
  const runs = (hooks) => hooks.filter((h) => !/fathom-proxy/.test(h.p) && h.p !== MAILS);
  const mails = (hooks) => hooks.filter((h) => h.p === MAILS);
  const W = (store, table, method) => store.writes.filter((w) => w.table === table && (!method || w.method === method));
  const setup = (store) => { const r = (store.db.ai_settings || []).find((x) => x.key === 'catalyst_stage_setup'); return r ? r.value : null; };
  const reads = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s + ' .v137-reads .u')].map((u) => (u.classList.contains('v132-off') ? '– ' : '✓ ') + u.innerText.replace(/^[✓–…]\s*/, '').replace(/\s+/g, ' ').trim()), sel);
  const card = (page, k) => page.evaluate((s) => { const c = document.querySelector('.v137-st[data-s="' + s + '"]'); return c ? {
    boxes: [...c.querySelectorAll('.v137-ck')].map((b) => [b.querySelector('b').textContent, b.querySelector('input').checked]),
    secs: [...c.querySelectorAll('.v137-wr ol li')].map((l) => l.textContent), writes: c.querySelector('.v137-wr summary').innerText.replace(/\s+/g, ' ').trim(),
    always: (c.querySelector('.v137-always') || {}).textContent || '', chartsLine: (c.querySelector('.v137-wr .v138-wch') || {}).textContent || '', chartsIn: !!c.querySelector('.v137-wr + .v138-ch, .v137-f .v138-ch') } : null; }, k);

  // 1. Templates: Emails among the reads, Charts and visuals among the writes, the card that no longer stretches
  {
    const { ctx, page, store } = await open({}, '/dashboard/templates');
    await page.waitForSelector('#v132Src .v137-st', { timeout: 15000 });
    await wait(page, 600);
    const S = {};
    for (const k of ['research', 'consultation', 'assessment', 'proposal', 'onboarding', 'review']) S[k] = await card(page, k);
    check('every stage after Prospect research reads the emails, on by default, after the transcripts', ['consultation', 'assessment', 'proposal', 'onboarding', 'review'].every((k) => S[k].boxes[0][0] === 'Call transcripts' && S[k].boxes[1][0] === 'Emails' && S[k].boxes[1][1] === true && S[k].boxes[2][0] === 'CRM record'),
      JSON.stringify(Object.keys(S).map((k) => [k, S[k].boxes])));
    check('Prospect research has no boxes (no meeting yet), so no emails either', S.research.boxes.length === 0, JSON.stringify(S.research.boxes));
    const sub = await page.evaluate(() => { const b = [...document.querySelectorAll('.v137-st[data-s="consultation"] .v137-ck')].find((x) => x.querySelector('b').textContent === 'Emails'); return b ? b.querySelector('small').textContent : ''; });
    check('the Emails box says what it reads', sub === 'The lead’s emails logged in HubSpot, newest first', sub);
    check('the proposal, onboarding and client review draw charts, on by default; the others have no charts box', ['proposal', 'onboarding', 'review'].every((k) => S[k].boxes.some((b) => b[0] === 'Charts and visuals' && b[1] === true) && S[k].chartsIn) &&
      ['research', 'consultation', 'assessment'].every((k) => !S[k].boxes.some((b) => b[0] === 'Charts and visuals')), JSON.stringify(Object.keys(S).map((k) => [k, S[k].boxes.map((b) => b[0])])));
    const ch = await page.evaluate(() => [...document.querySelectorAll('.v138-ch small')].map((s) => s.textContent));
    check('each says what its charts show, drawn only from the documents', JSON.stringify(ch) === JSON.stringify(['A timeline of the engagement, and bars where the documents give numbers, drawn only from the numbers and dates in the documents',
      'A timeline of the first weeks, drawn only from the numbers and dates in the documents', 'The results against the goals, as bars, drawn only from the numbers and dates in the documents']), JSON.stringify(ch));
    check('the Writes lists name the charts on a line of their own, under the parts, which keep their count', S.proposal.chartsLine === 'Charts: a timeline of the engagement, and bars where the documents give numbers.' &&
      S.onboarding.chartsLine === 'Charts: a timeline of the first weeks.' && S.review.chartsLine === 'Charts: the results against the goals, as bars.' &&
      ['proposal', 'onboarding', 'review'].every((k) => !S[k].secs.some((x) => /^Charts/.test(x))) && S.proposal.secs.length === 4 && S.onboarding.secs.length === 7 &&
      S.proposal.writes === 'Proposal presentation and client proposal · 4 parts, with charts' && S.onboarding.writes === 'Onboarding plan · 7 sections, with charts' &&
      S.assessment.writes === 'Assessment report · 9 sections' && !S.assessment.chartsLine, JSON.stringify([S.proposal.secs, S.proposal.writes, S.onboarding.writes, S.proposal.chartsLine]));
    const lay = await page.evaluate(() => { const c = document.querySelector('.v137-st[data-s="proposal"]'), d = c.querySelector('.v137-wr').getBoundingClientRect(), b = c.querySelector('.v138-ch').getBoundingClientRect();
      return { dx: Math.round(b.left - d.left), w: Math.round(b.width), below: b.top >= d.bottom - 1 }; });
    check('the charts box sits under the Writes list, as wide as it', lay.dx === 0 && lay.w > 250 && lay.below, JSON.stringify(lay));
    check('the client proposal says it reads the consultation guide', S.proposal.always === 'Always: The assessment report. The client proposal also reads the prospect brief, the consultation guide, your discovery call questions, your past assessment and your house rules.', S.proposal.always);
    // the card beside an opened Writes list keeps its fields where they were
    const pos = () => page.evaluate(() => { const c = document.querySelector('.v137-st[data-s="assessment"]'), top = c.getBoundingClientRect().top;
      return { f: [...c.querySelectorAll(':scope > .v137-f')].map((f) => Math.round(f.getBoundingClientRect().top - top)), h: Math.round(c.getBoundingClientRect().height), ac: getComputedStyle(c).alignContent }; });
    const p0 = await pos();
    await page.click('.v137-st[data-s="proposal"] .v137-wr summary');
    await wait(page, 300);
    const p1 = await pos();
    check('opening Writes on one card leaves the card beside it as it was: its fields stay at the top', p1.ac === 'start' && JSON.stringify(p0.f) === JSON.stringify(p1.f) && p1.h >= p0.h, JSON.stringify([p0, p1]));
    // the team turns the emails off for the assessment and the charts off for onboarding
    await page.click('.v137-st[data-s="assessment"] .v137-ck:has-text("Emails") input');
    await wait(page, 700);
    await page.click('.v137-st[data-s="onboarding"] .v138-ch input');
    await wait(page, 800);
    const v = setup(store) || {};
    check('the choices are saved team-wide, with who and when', v.assessment && v.assessment.emails === false && v.onboarding && v.onboarding.charts === false && v.onboarding.by === ME, JSON.stringify(v));
    const a2 = await card(page, 'assessment'), o2 = await card(page, 'onboarding');
    check('and the cards show them: emails off, charts off and gone from the Writes list', a2.boxes.find((b) => b[0] === 'Emails')[1] === false && o2.boxes.find((b) => b[0] === 'Charts and visuals')[1] === false &&
      !o2.chartsLine && o2.writes === 'Onboarding plan · 7 sections', JSON.stringify([a2.boxes, o2.boxes, o2.writes, o2.chartsLine]));
    await ctx.close();
  }

  // 2. the board's question lists the emails, and the run sends them after the CRM record, before the transcripts
  {
    const { ctx, page, hooks } = await open({}, '/dashboard/lead-pipeline');
    await page.waitForSelector('#v120Board', { timeout: 15000 });
    await page.evaluate((e) => v136Ask(e, 'consultation', true), L2);
    await page.waitForSelector('#v120M .v137-reads .v138-ml', { timeout: 15000 }).catch(() => {});
    const R = await reads(page, '#v120M');
    check('the question lists the call, then the emails by who they are from or to, then the CRM record', JSON.stringify(R) === JSON.stringify(['– No template for this stage yet, so the usual sections. Add one on Templates.',
      '✓ The call on ' + day(CA.start) + ': Intro call · Testwell (transcript)', '✓ The email on ' + day(E2a.at) + ' from Robin Test: Month-end numbers', '✓ The email on ' + day(E2b.at) + ' to Robin Test: Before our first call',
      '✓ The CRM record: Robin Test · COO · Testwell Partners · lifecycle stage: lead · lead status: NEW · website: https://testwell.example', '✓ The prospect brief and your house rules']), JSON.stringify(R));
    check('the notes box says the transcripts and emails go with it', (await txt(page, '#v120M label.nw-field small')) === 'Optional: the call transcripts and emails above go with it. Add anything else from the meeting.', await txt(page, '#v120M label.nw-field small'));
    const M = mails(hooks);
    check('it asked HubSpot for the lead\'s emails by address and contact id, signed in', M.length >= 1 && M[0].b.action === 'list' && JSON.stringify(M[0].b.emails) === JSON.stringify([L2]) && JSON.stringify(M[0].b.ids) === '["9050"]' && M[0].b.limit === 8 && !!M[0].b.auth, JSON.stringify(M.map((x) => x.b)));
    await page.fill('#v120Note', 'Robin wants a pilot first.');
    const n0 = hooks.length;
    await page.click('#v120Go');
    await wait(page, 2500);
    const r = runs(hooks.slice(n0)), t = (r[0] && r[0].b.transcript) || '';
    check('the run sends the notes, the CRM record, the emails and the call, in that order', r.length === 1 && r[0].p === CUSTOM && r[0].b.stage === 'consultation' &&
      t.indexOf('NOTES FROM THE TEAM\nRobin wants a pilot first.\n\nTHE CRM RECORD (HubSpot)\nRobin Test · COO') === 0 &&
      t.indexOf('\n\nEMAILS WITH THE CLIENT (HubSpot, newest first)\n\nEmail on ' + dayY(E2a.at) + ' from ' + L2 + ' to ' + ME + ': Month-end numbers\nHi,\n\nThe month-end close took 9 days in September and 7 in October.\n\nRobin\n\nEmail on ' + dayY(E2b.at) + ' from ' + ME + ' to ' + L2 + ': Before our first call\n') > 0 &&
      t.indexOf('EMAILS WITH THE CLIENT') < t.indexOf('WHAT WAS SAID IN THE MEETINGS') && /\nCall on .*: Intro call · Testwell \(filed under|\nCall on .*: Intro call · Testwell\n/.test(t), t.slice(0, 900));
    check('it asked HubSpot once for the question and the run (kept a minute)', mails(hooks).length === 1, String(mails(hooks).length));
    await ctx.close();
  }
  {
    // emails off for the stage: nothing asked of HubSpot, nothing listed, the notes as v137 sent them
    const { ctx, page, hooks } = await open({ more: (t) => { t.ai_settings.push({ key: 'catalyst_stage_setup', value: { consultation: { emails: false, by: ME, at: ago(5) } }, updated_at: ago(5) }); } }, '/dashboard/lead-pipeline');
    await page.waitForSelector('#v120Board', { timeout: 15000 });
    await page.evaluate((e) => v136Ask(e, 'consultation', true), L2);
    await wait(page, 1800);
    const R = await reads(page, '#v120M');
    check('with the emails off, the question lists none', !R.some((x) => /email/i.test(x)) && R.length === 4, JSON.stringify(R));
    const n0 = hooks.length;
    await page.click('#v120Go');
    await wait(page, 2500);
    const t = ((runs(hooks.slice(n0))[0] || { b: {} }).b.transcript) || '';
    check('and the run sends the CRM record and the call only, as before', mails(hooks).length === 0 && /^THE CRM RECORD \(HubSpot\)\nRobin Test/.test(t) && !/EMAILS WITH THE CLIENT/.test(t) && /\n\nWHAT WAS SAID IN THE MEETINGS/.test(t), t.slice(0, 300));
    await ctx.close();
  }
  {
    // the emails workflow switched off, then HubSpot refusing: the question says so and the run goes on without them
    const { ctx, page, hooks } = await open({ mail: 'down' }, '/dashboard/lead-pipeline');
    await page.waitForSelector('#v120Board', { timeout: 15000 });
    await page.evaluate((e) => v136Ask(e, 'consultation', true), L2);
    await wait(page, 1800);
    const R = await reads(page, '#v120M');
    check('a switched-off emails workflow is said, by name, in the list', R.includes('– Emails: HubSpot could not be read (The HubSpot Emails workflow in n8n is switched off. Turn on “Dashboard · HubSpot Emails Proxy” in n8n.).'), JSON.stringify(R));
    const n0 = hooks.length;
    await page.click('#v120Go');
    await wait(page, 2500);
    const r = runs(hooks.slice(n0)), t = (r[0] && r[0].b.transcript) || '';
    check('and the run still goes, without emails', r.length === 1 && !/EMAILS WITH THE CLIENT/.test(t) && /WHAT WAS SAID IN THE MEETINGS/.test(t), t.slice(0, 200));
    await ctx.close();
    const b = await open({ mail: 'hubspot' }, '/dashboard/lead-pipeline');
    await b.page.waitForSelector('#v120Board', { timeout: 15000 });
    await b.page.evaluate((e) => v136Ask(e, 'consultation', true), L2);
    await wait(b.page, 1800);
    const R2 = await reads(b.page, '#v120M');
    check('HubSpot refusing is said with its reason', R2.includes('– Emails: HubSpot could not be read (HubSpot did not answer: rate limit).'), JSON.stringify(R2));
    await b.ctx.close();
  }
  {
    // a lead with no brief and no call, but emails: they count as something to work from
    const { ctx, page, hooks } = await open({ calls: [], more: (t) => { EM[L3] = [{ id: 'm9', at: ago(5), incoming: true, subject: 'Hello', from: L3, to: [ME], text: 'Sam here. We run 40 volunteers.' }]; } }, '/dashboard/lead-pipeline');
    await page.waitForSelector('#v120Board', { timeout: 15000 });
    await page.evaluate((e) => v136Ask(e, 'consultation', true), L3);
    await wait(page, 1800);
    const n0 = hooks.length;
    await page.click('#v120Go');
    await wait(page, 2500);
    const r = runs(hooks.slice(n0)), t = (r[0] && r[0].b.transcript) || '';
    check('an email is something to work from: the stage runs on it', r.length === 1 && /^EMAILS WITH THE CLIENT \(HubSpot, newest first\)\n\nEmail on .* from qa\.lead3@example\.com .*: Hello\nSam here\. We run 40 volunteers\.$/.test(t), t + ' ' + (await txt(page, '#v120Msg')));
    delete EM[L3];
    await ctx.close();
  }

  // 3. the new transcript question reads the emails too
  {
    const { ctx, page, hooks } = await open({}, '/dashboard/today');
    await page.evaluate(async () => { await v137Load(true); });
    await page.evaluate(() => v137AskCall('fx-a'));
    await page.waitForSelector('#v137M .v137-reads .v138-ml', { timeout: 15000 }).catch(() => {});
    const R = await reads(page, '#v137M');
    check('the transcript question lists the emails', R.includes('✓ The email on ' + day(E2a.at) + ' from Robin Test: Month-end numbers'), JSON.stringify(R));
    const n0 = hooks.length;
    await page.click('#v137Go');
    await wait(page, 3000);
    const r = runs(hooks.slice(n0)), t = (r[0] && r[0].b.transcript) || '';
    check('and Move and run it sends them, before the call', r.length === 1 && t.indexOf('EMAILS WITH THE CLIENT') >= 0 && t.indexOf('EMAILS WITH THE CLIENT') < t.indexOf('WHAT WAS SAID IN THE MEETINGS'), t.slice(0, 300));
    await ctx.close();
  }

  // 4. Write the client proposal reads what the Proposal stage reads
  {
    const { ctx, page, hooks } = await open({ calls: [CD], more: (t) => { t.catalyst_sources = sources(); } }, '/dashboard/lead-pipeline');
    await page.evaluate((a) => openE1LeadStage(a[0], a[1]), [L1, 4]);
    await page.waitForFunction(() => document.querySelectorAll('#main section.block').length >= 5, null, { timeout: 15000 });
    await wait(page, 1500);
    const sub = await txt(page, '.v132-pc .ap-doc-t small');
    check('the card says it is written from the meetings and the assessment', /^The proposal the client receives, from the meetings and the assessment, in the sections and branding of QA proposal template\.docx\./.test(sub), sub);
    await page.locator('.v132-write').click();
    await page.waitForSelector('#v132M .v138-ml', { timeout: 15000 }).catch(() => {});
    const m = await page.$eval('#v132M', (x) => ({ t: (x.querySelector('.v132-uses .t') || {}).textContent, u: [...x.querySelectorAll('.v132-uses .u')].map((u) => u.lastElementChild.textContent.trim()) }));
    check('the question says what it uses: the past documents, the call and the email', m.t === 'Using 3 past documents, the call transcript and an email', m.t);
    check('each by name: the documents, the call, the email, the assessment, the consultation guide, the prospect brief', JSON.stringify(m.u) === JSON.stringify([
      'Proposal template: QA proposal template.docx (3 sections, your branding)', 'Discovery call questions: QA discovery call questions.docx', 'Past assessment: QA past assessment.docx',
      'The call on ' + day(CD.start) + ': Proposal walk-through · QA Firm (transcript)', 'The email on ' + day(E1a.at) + ' from Pat QA: Overtime by site', 'The assessment of Oct 3', 'The consultation guide', 'The prospect brief']), JSON.stringify(m.u));
    const n0 = hooks.length;
    await page.click('#v132Go');
    await wait(page, 2500);
    const hk = hooks.slice(n0).filter((h) => h.p === PROP), c = (hk[0] && hk[0].b.call) || {};
    check('Write it sends the meetings\' notes: the email, then the call, with no single call\'s title', hk.length === 1 && hk[0].b.leadEmail === L1 && c.id === '' && c.title === '' && c.date === '' &&
      c.transcript === 'EMAILS WITH THE CLIENT (HubSpot, newest first)\n\nEmail on ' + dayY(E1a.at) + ' from ' + L1 + ' to ' + ME + ': Overtime by site\nPat here. Overtime last quarter: North 400 hours, South 250 hours.\n\n' +
        'WHAT WAS SAID IN THE MEETINGS (call transcripts, newest first)\n\nCall on ' + dayY(CD.start) + ': Proposal walk-through · QA Firm\nPat QA: The proposal looks right. Can we start in January?', JSON.stringify(c).slice(0, 600));
    const run = await txt(page, '.v132-pc .v132-run');
    check('the card shows it is being written, with what it uses', /Writing the client proposal…/.test(run) && /Using 3 past documents, the call transcript and an email/.test(run), run);
    await ctx.close();
  }

  // 5. the client proposal draws its charts under the sections they name
  {
    const { ctx, page, store } = await open({ calls: [], more: (t) => { t.catalyst_sources = sources(); t.agent_outputs.push(proposalRow()); } }, '/dashboard/lead-pipeline');
    await page.evaluate((a) => openE1LeadStage(a[0], a[1]), [L1, 4]);
    await page.waitForFunction(() => document.querySelectorAll('#main section.block').length >= 5, null, { timeout: 15000 });
    await wait(page, 1500);
    await page.locator('.v132-read').click();
    await page.waitForSelector('.v132-doc .v138-fig', { timeout: 8000 }).catch(() => {});
    const d = await page.evaluate(() => [...document.querySelectorAll('.v132-doc .v132-sec')].map((s) => ({ t: s.querySelector('.t').textContent, src: [...s.querySelectorAll('.src span')].map((x) => x.textContent),
      figs: [...s.querySelectorAll('.v138-fig')].map((f) => ({ type: f.dataset.v138, cap: (f.querySelector('figcaption') || {}).textContent, marks: f.querySelectorAll('.mk').length,
        fills: [...new Set([...f.querySelectorAll('.mk')].map((m) => m.getAttribute('fill')))], texts: [...f.querySelectorAll('svg text')].map((x) => x.textContent),
        widths: [...f.querySelectorAll('path.mk')].map((p) => Math.round(p.getBBox().width)), rows: [...f.querySelectorAll('.v138-tbl tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()),
        svg: getComputedStyle(f.querySelector('svg')).display, w: Math.round(f.querySelector('svg').getBoundingClientRect().width), hidden: f.querySelector('svg').getAttribute('aria-hidden') })) })));
    const by = (t) => d.find((s) => s.t === t) || { figs: [] };
    check('the chips say what each section came from, the consultation guide and the meetings included', JSON.stringify(by('Where you are today').src) === '["From the meetings","From the consultation guide","From the assessment"]', JSON.stringify(by('Where you are today').src));
    const b = by('Where you are today').figs[0] || {}, tl = by('Scope of work').figs[0] || {};
    check('the bars sit under the section they name, titled, one bar per site, in the brand\'s color', b.type === 'bars' && b.cap === 'Overtime hours by site, last quarter' && b.marks === 3 && JSON.stringify(b.fills) === '["#0E5A63"]', JSON.stringify(b));
    check('the bars are as long as their numbers, each labelled with its value and unit', b.widths.length === 3 && b.widths[0] > b.widths[1] && b.widths[1] > b.widths[2] && Math.abs(b.widths[1] / b.widths[0] - 250 / 400) < 0.03 &&
      ['400 hours', '250 hours', '100 hours'].every((v) => b.texts.includes(v)) && ['North', 'South', 'East'].every((v) => b.texts.includes(v)), JSON.stringify([b.widths, b.texts]));
    check('the timeline sits under Scope of work: a bar per phase, its weeks said, the weeks along the bottom', tl.type === 'timeline' && tl.cap === 'The 12-week engagement' && tl.marks === 4 &&
      tl.texts.some((x) => x === 'Map · Weeks 1 to 2') && tl.texts.some((x) => x === 'Roll out to South · Weeks 11 to 12') && tl.texts.includes('Week 1') && tl.texts.includes('12'), JSON.stringify(tl.texts));
    check('each chart has its numbers as a table for screen readers, and the drawing is hidden from them', JSON.stringify(b.rows) === '["North 400 hours","South 250 hours","East 100 hours"]' &&
      JSON.stringify(tl.rows) === '["Map Weeks 1 to 2","Design Weeks 3 to 6","Pilot at North Weeks 7 to 10","Roll out to South Weeks 11 to 12"]' && b.hidden === 'true' && b.svg === 'block' && b.w > 400, JSON.stringify([b.rows, tl.rows, b.svg, b.w]));
    check('the section with no chart has none', by('Timeline and investment').figs.length === 0, '');
    // edit: a renamed section keeps its chart, and the markdown keeps the charts as lines
    await page.locator('.v132-edit').click();
    await page.evaluate(() => { document.querySelector('.v132-sec[data-i="1"] .t').textContent = 'Scope and phases'; });
    await page.locator('.v132-dbar .pri').click();
    await wait(page, 1200);
    const pw = W(store, 'agent_outputs', 'PATCH'), body = pw.length ? pw[0].body : {}, nd = (body.data || {}).doc || {};
    check('a renamed section keeps its chart: the chart now names the new title', pw.length === 1 && nd.sections[1].title === 'Scope and phases' && nd.visuals.find((v) => v.type === 'timeline').after === 'Scope and phases' &&
      nd.visuals.find((v) => v.type === 'bars').after === 'Where you are today', JSON.stringify(nd.visuals && nd.visuals.map((v) => v.after)));
    check('the saved markdown keeps each chart as a line under its section', /\n## Where you are today\n\nOvertime last quarter: North 400 hours, South 250 hours, East 100 hours\.\n\nChart: Overtime hours by site, last quarter\. North: 400 hours; South: 250 hours; East: 100 hours\.\n/.test(body.content_md || '') &&
      /\n## Scope and phases\n[\s\S]*\n\nChart: The 12-week engagement\. Map \(weeks 1 to 2\); Design \(weeks 3 to 6\); Pilot at North \(weeks 7 to 10\); Roll out to South \(weeks 11 to 12\)\.\n/.test(body.content_md || ''), body.content_md);
    const after = await page.evaluate(() => [...document.querySelectorAll('.v132-doc .v132-sec')].map((s) => [s.querySelector('.t').textContent, s.querySelectorAll('.v138-fig').length]));
    check('and on the page the chart is still under it', JSON.stringify(after) === '[["Where you are today",1],["Scope and phases",1],["Timeline and investment",0]]', JSON.stringify(after));
    // Save as PDF prints the charts with their styles
    await page.evaluate(() => { V132.printer = function () {}; });
    const [pop] = await Promise.all([ctx.waitForEvent('page'), page.locator('.v132-pc .statline .v132-pdf').click()]);
    await pop.waitForLoadState('load').catch(() => {});
    await wait(page, 1200);
    const pd = await pop.evaluate(() => ({ figs: document.querySelectorAll('.v138-fig svg').length, css: [...document.querySelectorAll('style')].some((s) => /\.v138-fig/.test(s.textContent)),
      shown: [...document.querySelectorAll('.v138-fig svg')].every((s) => getComputedStyle(s).display === 'block'), tbl: [...document.querySelectorAll('.v138-tbl')].every((t) => t.getBoundingClientRect().width <= 1) }));
    check('Save as PDF prints the charts, with their styles, the tables kept for screen readers', pd.figs === 2 && pd.css && pd.shown && pd.tbl, JSON.stringify(pd));
    await pop.close();
    await ctx.close();
  }
  {
    // a pale brand color is not used for the marks (it would not stand out on white); on a phone a table stands in for the drawing
    const pale = Object.assign({}, BRAND, { colors: { primary: '#F7E9A0', text: '#FAFAFA' } });
    const { ctx, page } = await open({ calls: [], more: (t) => { t.catalyst_sources = sources(); t.agent_outputs.push(proposalRow(pale)); } }, '/dashboard/lead-pipeline', 390);
    await page.evaluate((a) => openE1LeadStage(a[0], a[1]), [L1, 4]);
    await page.waitForFunction(() => document.querySelectorAll('#main section.block').length >= 5, null, { timeout: 15000 });
    await wait(page, 1500);
    await page.locator('.v132-read').click();
    await page.waitForSelector('.v132-doc .v138-fig', { timeout: 8000 }).catch(() => {});
    const r = await page.evaluate(() => ({ fills: [...new Set([...document.querySelectorAll('.v138-fig .mk')].map((m) => m.getAttribute('fill')))],
      ink: [...new Set([...document.querySelectorAll('.v138-fig svg text[fill], .v138-fig svg tspan[fill]')].map((m) => m.getAttribute('fill')).filter((f) => f !== '#667085'))],
      svg: [...document.querySelectorAll('.v138-fig svg')].map((s) => getComputedStyle(s).display), tbl: [...document.querySelectorAll('.v138-fig .v138-tbl')].map((t) => Math.round(t.getBoundingClientRect().width)),
      rows: [...document.querySelectorAll('.v138-fig[data-v138="bars"] .v138-tbl tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()), sw: document.documentElement.scrollWidth, iw: innerWidth }));
    check('a pale brand color gives way to the dashboard\'s navy for the marks and dark ink for the words', JSON.stringify(r.fills) === '["#1C2647"]' && JSON.stringify(r.ink) === '["#1D2433"]', JSON.stringify([r.fills, r.ink]));
    check('on a phone each chart shows as its table, and nothing spills sideways', r.svg.every((x) => x === 'none') && r.tbl.every((w) => w > 200) && JSON.stringify(r.rows) === '["North 400 hours","South 250 hours","East 100 hours"]' && r.sw <= r.iw + 1, JSON.stringify(r));
    await ctx.close();
  }

  // 6. the onboarding plan draws its charts at the end of the sections they name
  {
    const { ctx, page } = await open({ calls: [], more: (t) => {
      t.e1_leads.find((l) => l.email === L1).stage = 'onboarding';
      t.agent_outputs.push({ id: '00000000-0000-4000-8000-0000000e1381', run_id: L1, agent: 'meeting_prep', output_type: 'meeting_prep', title: 'Onboarding plan · QA Firm LLC', created_at: ago(2),
        content_md: PREP_MD, data: { stage: 'onboarding', stage_name: 'Onboarding', doc_name: 'Onboarding plan', visuals: PREP_VIS } });
    } }, '/dashboard/lead-pipeline');
    await page.evaluate((e) => openE1Lead(e), L1);
    await wait(page, 2400);
    await page.click('#apChrome .rd-tab[data-tab="m_onboarding"]'); await wait(page, 500);
    await page.click('section[data-v136="onboarding"] button:has-text("Read inline")'); await wait(page, 400);
    const o = await page.evaluate(() => [...document.querySelectorAll('section[data-v136="onboarding"] .v136-prep .brief > *')].map((e) => e.tagName === 'FIGURE' ? 'FIG:' + e.dataset.v138 + ':' + e.querySelector('figcaption').textContent : e.tagName + ':' + e.textContent.trim().slice(0, 60)));
    check('the timeline closes What we agreed and the bars close the goals, before the next section', JSON.stringify(o) === JSON.stringify(['H1:Onboarding plan · QA Firm LLC', 'H2:What we agreed', 'UL:Twelve weeks, starting in January.', 'FIG:timeline:The first weeks',
      'H2:Goals and how we will measure them', 'UL:Less overtime at North.', 'FIG:bars:Overtime baseline', 'H2:The first 30 days', 'UL:Week 1: the kickoff.']), JSON.stringify(o));
    await ctx.close();
  }

  // 7. AI settings says what the Catalyst agents read and draw now; and the chart code on its own
  {
    const { ctx, page } = await open({}, '/dashboard/ai-settings');
    await page.waitForSelector('.ap-where', { timeout: 15000 });
    const w = await page.evaluate(() => [...document.querySelectorAll('.ap-where > div')].map((d) => [d.querySelector('b').textContent, d.querySelector('small').textContent]));
    const cat = w.find((x) => /^Catalyst agents/.test(x[0])) || [], cp = w.find((x) => x[0] === 'Client proposal') || [];
    check('Where these apply: the stages read the emails and draw charts where their setup says so', /the call transcripts, the emails in HubSpot, the CRM record, your discovery call questions\. The proposal, onboarding and client review prep draw charts from the documents’ own numbers when their setup says so$/.test(cat[1] || ''), cat[1]);
    check('and the client proposal reads what its stage reads, the consultation guide and charts', /what the Proposal stage reads \(the call transcripts and emails, and the CRM record when it is on\), the lead's documents with the consultation guide, and charts when the stage draws them$/.test(cp[1] || ''), cp[1]);
    const u = await page.evaluate(() => {
      const V = v138Vis([{ type: 'timeline', items: [{ label: 'A', start: 1, end: 2 }, { label: '', start: 1, end: 2 }, { label: 'B', start: 3, end: 1 }, { label: 'C', start: '4', end: '5' }, { label: 'D', start: null, end: 2 }] },
        { type: 'pie', items: [{ label: 'x', value: 1 }, { label: 'y', value: 2 }] }, { type: 'bars', items: [{ label: 'only', value: 3 }, { label: 'bad', value: 'many' }] }]);
      const many = v138Vis([{ type: 'bars', items: Array.from({ length: 15 }, (_, i) => ({ label: 'Site ' + i, value: i + 1 })) }])[0];
      const pts = document.createElement('div'); pts.innerHTML = v138Chart({ type: 'timeline', title: 'From zero', unit: '', items: [{ label: 'Start', start: 0, end: 0 }, { label: 'Then', start: 0.5, end: 2 }] }, '#1C2647', '#1D2433');
      const long = document.createElement('div'); long.innerHTML = v138Chart({ type: 'bars', title: 'Long names', unit: 'hours', items: [{ label: 'The distribution centre on the north side of the river', value: 10 }, { label: 'Zero site', value: 0 }] }, '#1C2647', '#1D2433');
      return { kept: V.map((v) => [v.type, v.items.map((x) => x.label)]), many: many.items.length, ptsW: [...pts.querySelectorAll('rect.mk')].map((r) => +r.getAttribute('width')),
        wrap: long.querySelector('text tspan + tspan') ? [...long.querySelector('text').querySelectorAll('tspan')].map((t) => t.textContent) : [], zeroBars: long.querySelectorAll('path.mk').length,
        zeroVal: [...long.querySelectorAll('svg text')].some((t) => t.textContent === '0 hours'), ink: [v138Ink('#F7E9A0', 'N'), v138Ink('#0E5A63', 'N'), v138Ink('nope', 'N')],
        line: v138ChartText({ type: 'bars', title: 'Overtime hours', unit: 'hours', items: [{ label: 'Hillcrest', value: 820 }, { label: 'Northgate', value: 410 }] }) };
    });
    check('charts with bad items keep only the good ones; a pie, or bars with one good item, are dropped', JSON.stringify(u.kept) === '[["timeline",["A","C"]]]', JSON.stringify(u.kept));
    check('at most twelve items', u.many === 12, String(u.many));
    check('a timeline that starts at zero is drawn from points, every bar visible', u.ptsW.length === 2 && u.ptsW.every((w) => w >= 4), JSON.stringify(u.ptsW));
    check('a long label takes two lines; a zero draws no bar but keeps its value', u.wrap.length === 2 && u.wrap.join(' ').indexOf('The distribution') === 0 && u.zeroBars === 1 && u.zeroVal, JSON.stringify([u.wrap, u.zeroBars, u.zeroVal]));
    check('a brand color is used only when it stands out on white', JSON.stringify(u.ink) === '["N","#0E5A63","N"]', JSON.stringify(u.ink));
    check('a chart as a line of text, as the client proposal workflow writes it', u.line === 'Chart: Overtime hours. Hillcrest: 820 hours; Northgate: 410 hours.', u.line);
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n- ' + failures.join('\n- ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
