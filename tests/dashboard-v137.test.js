// v137 tests for new-aiparagon-dashboard.html (#1): between the meetings (Erica's Nov 5 notes, the second part).
// A contact new in HubSpot (first seen by the sync in the last 14 days, not a lead, not the team's, not set aside) asks
// to run the pre-meeting prospect brief (it adds the lead in Prospect research and runs that stage only, with the CRM
// record), or to add the lead without running, or to set the contact aside; a recorded Fathom call with a lead asks to
// file its transcript under the lead's stage and run the next stage with it (or just file it, or set it aside); both
// show on Today and in the bell. On Templates each meeting stage has its own card: the meeting type, a template
// document (the stage is its kind), what it reads (call transcripts, the CRM record, the discovery call questions) and
// what it writes; the setup is saved team-wide (ai_settings catalyst_stage_setup) and every stage run sends what it
// reads, the team's notes first. A lead's page lists its calls and where each is filed, and a lead with no follow-up
// guide no longer shows that empty section under every tab. Layout at 1024 and 390 wide.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js), and
// n8n webhooks (Fathom included) answer from stubs, so no real account, data, call or workflow is touched.
// Usage: node tests/dashboard-v137.test.js
const path = require('path');
const H = require('./lib/dashboard-harness');
const { makeStore } = require('./lib/rest-stub');
const FX = require('./lib/qa-fixtures');

const ROOT = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'catalyst');
let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const L1 = FX.L1, L2 = FX.L2, L3 = FX.L3;   // Pat QA (all five documents: Proposal), Robin Test (the prospect brief: Prospect research), Sam Sample (nothing yet)
const FULL = '870a1ffa-cbc6-4085-894a-6f3bc90a40f2', CUSTOM = 'e1-custom-run-erica', PREP = 'catalyst-meeting-prep';
const TOM = 'tom.becker@halvern.example';
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const day = (v) => { const d = new Date(v); const o = { month: 'short', day: 'numeric' }; if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric'; return d.toLocaleDateString('en-US', o); };
const dayY = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const ME = 'qa@aiparagonconsulting.com';
const call = (id, h, title, guests, mins) => ({ id, title, start: ago(h), end: new Date(Date.now() - h * 3600e3 + (mins || 40) * 60e3).toISOString(),
  share_url: 'https://fathom.video/share/' + id + 'abcdef', recorded_by: { name: 'QA Tester', email: ME },
  invitees: guests.map((g) => ({ name: g[0], email: g[1], external: true })).concat([{ name: 'QA Tester', email: ME, external: false }]) });
const CA = call('fx-a', 20, 'Intro call · Testwell', [['Robin Test', L2]], 38);       // Robin, in Prospect research
const CB = call('fx-b', 30, 'Team sync', [], 25);                                     // only the team
const CC = call('fx-c', 24 * 20, 'Old call · Sample', [['Sam Sample', L3]], 30);       // 20 days ago
const CD = call('fx-d', 6, 'Proposal walk-through · QA Firm', [['Pat QA', L1]], 45);   // Pat, in Proposal (only where a test asks for it)
const CE = call('fx-e', 4, 'Hello call · Halvern', [['Tom Becker', TOM]], 20);         // Tom is not a lead
const TX = {
  'fx-a': [{ speaker: 'Robin Test', text: 'Our month-end reports take two days.' }, { speaker: 'QA Tester', text: 'Who puts them together today?' }],
  'fx-c': [{ speaker: 'Sam Sample', text: 'We want to grow the volunteer team.' }],
  'fx-d': [{ speaker: 'Pat QA', text: 'The proposal looks right. Can we start in January?' }],
};
// HubSpot: Tom is new; Olive came 20 days ago; Ally is the team's; Sid was set aside; Pat (a lead) is recent too
function people(t) {
  t.hubspot_contacts.push(
    { email: TOM, first_name: 'Tom', last_name: 'Becker', company: 'Halvern Foods', phone: '555-0101', job_title: 'VP Operations', website: 'https://halvern.example', lifecycle_stage: 'lead', lead_status: 'NEW', hs_id: '9100', props: {}, synced_at: ago(1), first_seen: ago(26) },
    { email: 'olive.old@example.com', first_name: 'Olive', last_name: 'Old', company: 'Old Co', phone: '', job_title: 'CFO', website: '', lifecycle_stage: 'lead', lead_status: '', hs_id: '9101', props: {}, synced_at: ago(1), first_seen: ago(24 * 20) },
    { email: 'ally@aiparagonconsulting.com', first_name: 'Ally', last_name: 'Team', company: 'AI Paragon', phone: '', job_title: '', website: '', lifecycle_stage: '', lead_status: '', hs_id: '9102', props: {}, synced_at: ago(1), first_seen: ago(5) },
    { email: 'sid.aside@example.com', first_name: 'Sid', last_name: 'Aside', company: 'Aside LLC', phone: '', job_title: '', website: '', lifecycle_stage: 'subscriber', lead_status: '', hs_id: '9103', props: {}, synced_at: ago(1), first_seen: ago(30) });
  t.hubspot_contacts.find((c) => c.email === L1).first_seen = ago(3);
  t.ai_settings.push({ key: 'catalyst_inbox', value: { crm: { 'sid.aside@example.com': { by: ME, at: ago(10) } } }, updated_at: ago(10) });
  t.call_outputs.push({ id: '00000000-0000-4000-8000-0000000ca0a1', call_id: 'fx-a', call_title: CA.title, call_start: CA.start, meeting_type: 'sales', meeting_type_guess: true,
    summary: ['Month-end reports take two days', 'Robin wants a pilot before the first quarter'], tasks: [], deliverable: null, follow_up: null, status: 'done', error: null, source: 'auto', created_by: 'auto', asana: null, slack_posted_at: null, created_at: ago(19), updated_at: ago(19) });
}

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  // o.more(t): change the tables; o.calls: Fathom's list (default A, B, C and E); o.tx: false when transcripts cannot be read;
  // o.ftDown: Fathom's list fails; o.hookFail: n8n refuses the runs
  async function open(o, url, width) {
    o = o || {};
    const t = FX.tables();
    people(t);
    if (o.more) o.more(t);
    const store = o.store || makeStore(t);
    const hooks = [];
    const hook = (u, m, b) => {
      let j = null; try { j = JSON.parse(b || ''); } catch (e) {}
      const p = u.replace(/^https:\/\/n8n\.aiparagonconsulting\.com\/webhook\//, '');
      hooks.push({ p, b: j });
      if (/fathom-proxy$/.test(u)) {
        if (j && j.action === 'list') return o.ftDown ? { body: { ok: false, message: 'Fathom is not connected' } } : { body: { ok: true, items: o.calls || [CA, CB, CC, CE] } };
        if (j && j.action === 'transcript') return o.tx === false || !TX[j.id] ? { body: { ok: false, message: 'Fathom did not answer' } } : { body: { ok: true, transcript: o.longTx && j.id === 'fx-a' ? o.longTx : TX[j.id] } };
        return { body: { ok: true } };
      }
      return o.hookFail && /e1-custom|870a1ffa|meeting-prep/.test(u) ? { status: 500, body: { message: 'boom' } } : { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    await page.setViewportSize({ width: width || 1440, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + (url || '/dashboard/today'), { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1200);
    await page.evaluate(async () => { await v137Load(true); apBuildNotifs(); if (nwOn('home.today')) nwRepaint(); });
    await page.waitForTimeout(400);
    return { ctx, page, store, hooks };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 700);
  const txt = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
  const runs = (hooks) => hooks.filter((h) => !/fathom-proxy/.test(h.p) && h.p !== 'catalyst-emails');   /* v138: the emails read is not a run */
  const W = (store, table, method) => store.writes.filter((w) => w.table === table && (!method || w.method === method));
  const today = (page) => page.evaluate(() => [...document.querySelectorAll('.v137-today .v137-in-r')].map((r) => ({ t: r.querySelector('b').textContent, s: r.querySelector('small').textContent, b: r.querySelector('button').textContent })));
  const bell = (page) => page.evaluate(() => NOTIFS.filter((n) => /^v137:/.test(n.key)).map((n) => [n.key, n.t, n.s]));
  const setup = (store) => { const r = (store.db.ai_settings || []).find((x) => x.key === 'catalyst_stage_setup'); return r ? r.value : null; };
  const modal = (page) => txt(page, '#v137M');
  const foot = (page) => page.evaluate(() => [...document.querySelectorAll('#v137M .nw-m-foot button')].map((b) => b.textContent.trim()));
  const reads = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s + ' .v137-reads .u')].map((u) => (u.classList.contains('v132-off') ? '– ' : '✓ ') + u.innerText.replace(/^[✓–…]\s*/, '').replace(/\s+/g, ' ').trim()), sel);
  async function stages(page) {
    return page.evaluate(() => [...document.querySelectorAll('#v132Src .v137-st')].map((s) => ({
      s: s.dataset.s, name: s.querySelector('.v137-st-h b').textContent, doc: s.querySelector('.v137-st-h small').textContent,
      type: s.querySelector('select.v137-type').value, typeL: s.querySelector('select.v137-type').selectedOptions[0].textContent,
      own: [...s.querySelectorAll('select.v137-type optgroup')].map((g) => g.label),
      tpw: s.querySelector('.v137-tpw').innerText.replace(/\s+/g, ' ').trim(),
      drop: (s.querySelector('.v137-drop b') || {}).textContent || '',
      boxes: [...s.querySelectorAll('.v137-ck')].map((c) => [c.querySelector('b').textContent, c.querySelector('input').checked, c.querySelector('input').disabled]),
      always: (s.querySelector('.v137-always') || {}).textContent || '',
      writes: s.querySelector('.v137-wr summary').innerText.replace(/\s+/g, ' ').trim(),
      secs: [...s.querySelectorAll('.v137-wr ol li')].map((l) => l.textContent),
      rows: [...s.querySelectorAll('.v132-row')].map((r) => ({ name: (r.querySelector('.nm') || {}).textContent || '', inUse: !!r.querySelector('.v132-use'), picker: !!r.querySelector('select'), busy: !!r.querySelector('.v132-busy'), err: (r.querySelector('.v132-err') || {}).textContent || '' })) })));
  }

  // 1. Templates: a card for each meeting stage
  {
    const { ctx, page, store } = await open({ more: (t) => {
      t.ai_settings.push({ key: 'catalyst_stages', value: { consultation: { name: 'Discovery call', by: ME, at: ago(50) } }, updated_at: ago(50) });
      t.ai_settings.push({ key: 'call_types', value: ['Partner call'], updated_at: ago(50) });
    } }, '/dashboard/templates');
    await page.waitForSelector('#v132Src .v137-st', { timeout: 15000 });
    await wait(page, 600);
    const top = await page.evaluate(() => ({ h: (document.querySelector('#v132Src h3') || {}).textContent, k: (document.querySelector('#v132Src .k') || {}).textContent,
      n: (document.querySelector('#v132Src .rd-secn') || {}).textContent, lead: (document.querySelector('#v132Src .v132-lead') || {}).textContent,
      sub: (document.querySelector('#rd-templates .rd-head p') || {}).textContent, old: !!document.getElementById('v132Drop') || !!document.getElementById('v132File'),
      fixed: [...document.querySelectorAll('#rd-templates .rd-card .rd-blank')].map((b) => b.textContent).find((x) => /n8n workflows/.test(x)) || '',
      order: [...document.querySelectorAll('#rd-templates > *')].map((e) => e.id || e.className.split(' ')[0]).slice(0, 3) }));
    check('Templates starts with Meeting stages, for Catalyst, six of them', top.h === 'Meeting stages' && top.k === 'Catalyst' && top.n === '6' && JSON.stringify(top.order) === '["rd-head","v132Src","v132-ctpl"]', JSON.stringify(top));
    check('it says what a stage card is for', /^Each meeting stage writes its own prep\. For each one, pick the meeting it prepares for, add a past document as its template, and choose what it reads\./.test(top.lead), top.lead);
    check('the page says what it holds now, and the one drop zone for every kind is gone', top.sub === 'The prep Catalyst writes for each meeting stage, and the structures Content Transformation drafts follow.' && !top.old, JSON.stringify([top.sub, top.old]));
    check('the formats note says the stages\' sections are listed, and which documents take a template\'s sections', /^The Catalyst documents keep the sections their n8n workflows set, listed under each meeting stage above\. The client proposal, the onboarding plan and the client review brief take the sections of your template when you add one/.test(top.fixed), top.fixed);
    const S = await stages(page);
    const by = (k) => S.find((x) => x.s === k) || {};
    check('one card per stage, in order, with the team\'s names and what each writes', JSON.stringify(S.map((x) => [x.s, x.name, x.doc])) === JSON.stringify([['research', 'Prospect research', 'Pre-meeting prospect brief'],
      ['consultation', 'Discovery call', 'Consultation guide'], ['assessment', 'Assessment', 'Assessment report'], ['proposal', 'Proposal', 'Proposal presentation and client proposal'],
      ['onboarding', 'Onboarding', 'Onboarding plan'], ['review', 'Client review', 'Client review brief']]), JSON.stringify(S.map((x) => [x.s, x.name, x.doc])));
    check('each stage has its usual meeting type, and Assessment none', JSON.stringify(S.map((x) => x.typeL)) === JSON.stringify(['Sales call', 'Discovery', 'No meeting type', 'Proposal', 'Onboarding', 'Check-in']), JSON.stringify(S.map((x) => x.typeL)));
    check('the meeting types are the call types, the team\'s own included', JSON.stringify(by('research').own) === JSON.stringify(['Client demos', 'Sales', 'Client work', 'Internal development', 'Internal meetings', 'Other', 'Your types']), JSON.stringify(by('research').own));
    check('each template slot says what the template is and what Catalyst does with it', by('research').tpw === 'A past prospect brief. Catalyst matches its tone and level of detail, in the brief’s own sections.' &&
      by('consultation').tpw === 'Your discovery call questions. The guide asks your questions, in your order and your way of asking.' && by('proposal').tpw === 'Your proposal template. The client proposal follows its sections, wording and branding.' &&
      by('onboarding').tpw === 'A past onboarding plan. Catalyst writes the plan in its sections and tone, never its facts.' && by('review').drop === 'Add a past client review', JSON.stringify(S.map((x) => x.tpw)));
    check('Prospect research reads no meeting: no boxes, its fixed inputs said', by('research').boxes.length === 0 && by('research').always === 'The lead’s details from HubSpot (name, title, company, website), what is public about the firm, and your house rules.', JSON.stringify(by('research')));
    check('the reads: transcripts on everywhere after research, the CRM record on where names belong', JSON.stringify(S.slice(1).map((x) => x.boxes.map((b) => b[0] + ':' + (b[1] ? 1 : 0) + (b[2] ? 'x' : '')))) ===
      JSON.stringify([['Call transcripts:1', 'Emails:1', 'CRM record:1'], ['Call transcripts:1', 'Emails:1', 'CRM record:0', 'Your discovery call questions:0x'], ['Call transcripts:1', 'Emails:1', 'CRM record:0', 'Charts and visuals:1'],
        ['Call transcripts:1', 'Emails:1', 'CRM record:1', 'Your discovery call questions:0x', 'Charts and visuals:1'], ['Call transcripts:1', 'Emails:1', 'CRM record:1', 'Your discovery call questions:0x', 'Charts and visuals:1']]), JSON.stringify(S.map((x) => x.boxes)));   /* v138: Emails, and Charts and visuals */
    check('the question script waits for the discovery call questions to be added', by('assessment').boxes[2] && /None added yet: add them under Discovery consultation|None added yet: add them under Discovery call/.test(
      (await page.evaluate(() => document.querySelector('.v137-st[data-s="assessment"] .v137-ck.dis small').textContent))), '');
    check('each stage says what it always reads', by('consultation').always === 'Always: The prospect brief and your house rules.' && by('onboarding').always === 'Always: Every document so far and your house rules.' &&
      /^Always: The assessment report\. The client proposal also reads the prospect brief/.test(by('proposal').always), JSON.stringify(S.map((x) => x.always)));
    check('what each writes, with its real sections', by('research').writes === 'Pre-meeting prospect brief · 11 sections' && by('research').secs[0] === 'Company snapshot' && by('research').secs[10] === 'Sources used' &&
      by('consultation').writes === 'Consultation guide · 11 sections' && by('consultation').secs[4] === 'Theme A: Business context' && by('assessment').writes === 'Assessment report · 9 sections' &&
      by('proposal').writes === 'Proposal presentation and client proposal · 4 parts, with charts' && by('onboarding').secs.join('|') === 'What we agreed|Goals and how we will measure them|The first 30 days|Who does what|What we need from the client|Risks to watch|Questions for the onboarding meeting' &&   /* v138: with charts */
      by('review').writes === 'Client review brief · 7 sections, with charts', JSON.stringify(S.map((x) => [x.writes, x.secs.length])));
    const sectionsShut = await page.evaluate(() => [...document.querySelectorAll('.v137-wr')].every((d) => !d.open));
    check('the sections are folded until asked for', sectionsShut, '');
    // a meeting type and a read change are saved for the team
    await page.selectOption('.v137-st[data-s="assessment"] select.v137-type', 'discovery');
    await wait(page, 700);
    await page.click('.v137-st[data-s="assessment"] .v137-ck:has-text("CRM record") input');
    await wait(page, 700);
    const v = setup(store) || {};
    check('the meeting type and the read are saved team-wide, with who and when', v.assessment && v.assessment.type === 'discovery' && v.assessment.crm === true && v.assessment.by === ME && !!v.assessment.at && Object.keys(v).length === 1, JSON.stringify(v));
    check('and the card shows them', JSON.stringify((await stages(page)).find((x) => x.s === 'assessment').boxes.map((b) => b[1])) === '[true,true,true,false]' &&   /* v138: Emails among them */
      (await page.$eval('.v137-st[data-s="assessment"] select.v137-type', (e) => e.value)) === 'discovery', '');
    // templates go into their stage's card, as that stage's kind
    await page.setInputFiles('#v137File_consultation', [path.join(FIX, 'Summit discovery call questions.docx')]);
    await page.waitForFunction(() => { const r = document.querySelector('.v137-st[data-s="consultation"] .v132-row'); return r && !r.querySelector('.v132-busy'); }, null, { timeout: 30000 });
    await page.setInputFiles('#v137File_onboarding', [{ name: 'Summit onboarding plan.md', mimeType: 'text/markdown', buffer: Buffer.from('# Onboarding plan\n\n## Kickoff\nWho meets whom.\n\n## First month\nWeek by week.\n\n## Access we need\nSystems and data.\n\n## Owners\nWho does what.\n') }]);
    await page.waitForFunction(() => { const r = document.querySelector('.v137-st[data-s="onboarding"] .v132-row'); return r && !r.querySelector('.v132-busy'); }, null, { timeout: 30000 });
    await page.setInputFiles('#v137File_proposal', [path.join(FIX, 'Summit proposal template.docx')]);
    await page.waitForFunction(() => { const r = document.querySelector('.v137-st[data-s="proposal"] .v132-row'); return r && !r.querySelector('.v132-busy'); }, null, { timeout: 30000 });
    await wait(page, 500);
    const src = store.db.catalyst_sources || [];
    check('each file is kept as its stage\'s kind', JSON.stringify(src.map((r) => [r.file_name, r.kind]).sort()) === JSON.stringify([['Summit discovery call questions.docx', 'discovery_template'], ['Summit onboarding plan.md', 'past_onboarding'], ['Summit proposal template.docx', 'proposal_template']]), JSON.stringify(src.map((r) => [r.file_name, r.kind])));
    const S2 = await stages(page);
    const b2 = (k) => S2.find((x) => x.s === k) || {};
    check('each shows in its own card only, in use, with no kind picker', b2('consultation').rows.length === 1 && b2('onboarding').rows.length === 1 && b2('proposal').rows.length === 1 && b2('research').rows.length === 0 &&
      [b2('consultation'), b2('onboarding'), b2('proposal')].every((x) => x.rows[0].inUse && !x.rows[0].picker), JSON.stringify(S2.map((x) => [x.s, x.rows])));
    check('a stage with a template offers a newer one', b2('onboarding').drop === 'Add a newer one' && b2('assessment').drop === 'Add a past assessment', JSON.stringify([b2('onboarding').drop, b2('assessment').drop]));
    check('the onboarding plan now writes in its template\'s sections', b2('onboarding').writes === 'Onboarding plan · 4 sections, from your template, with charts' && b2('onboarding').secs.join('|') === 'Kickoff|First month|Access we need|Owners', JSON.stringify([b2('onboarding').writes, b2('onboarding').secs]));   /* v138: with charts */
    check('the client proposal names the template\'s sections', /^Client proposal, in your template’s sections: Executive summary, /.test(b2('proposal').secs[3] || ''), b2('proposal').secs[3]);
    check('the discovery call questions can now be read by the later stages', JSON.stringify(['assessment', 'onboarding', 'review'].map((k) => b2(k).boxes[2] && b2(k).boxes[2][2])) === '[false,false,false]', JSON.stringify(['assessment', 'onboarding', 'review'].map((k) => b2(k).boxes[2])));
    await page.click('.v137-st[data-s="review"] .v137-ck:has-text("discovery call questions") input');
    await wait(page, 700);
    check('turning them on for a stage saves it', ((setup(store) || {}).review || {}).questions === true, JSON.stringify(setup(store)));
    await ctx.close();
    // the setup and the templates are there after a reload
    const again = await open({ store }, '/dashboard/templates');
    await again.page.waitForSelector('#v132Src .v137-st', { timeout: 15000 });
    await wait(again.page, 600);
    const S3 = await stages(again.page);
    const b3 = (k) => S3.find((x) => x.s === k) || {};
    check('after a reload the cards keep the setup and the templates', b3('assessment').type === 'discovery' && b3('assessment').boxes[1][1] === true && b3('review').boxes[2][1] === true && b3('onboarding').rows.length === 1, JSON.stringify(S3.map((x) => [x.s, x.type, x.boxes.map((b) => b[1]), x.rows.length])));
    const where = await again.page.evaluate(() => (AP_WHERE.find((r) => /^Catalyst agents/.test(r[0])) || [])[1]);
    check('AI settings says each stage follows its template and its reads', where === 'Rules, on every run. Each meeting stage also follows its template from Templates and reads what its setup there says: the call transcripts, the emails in HubSpot, the CRM record, your discovery call questions. The proposal, onboarding and client review prep draw charts from the documents’ own numbers when their setup says so', where);   /* v138 */
    await again.ctx.close();
  }

  // 2. a new client from HubSpot: Today, the bell, the question, and running the prospect brief
  {
    const { ctx, page, store, hooks } = await open();
    const T = await today(page);
    check('Today lists the new HubSpot contact and the new transcript, newest first', JSON.stringify(T.map((x) => x.t)) === JSON.stringify(['New transcript: your call with Robin Test on ' + day(CA.start), 'New client from HubSpot: Tom Becker, Halvern Foods']), JSON.stringify(T));
    check('with what each asks and its button', T[1] && T[1].s === 'Run the pre-meeting prospect brief?' && T[1].b === 'Run the brief' && T[0].s === 'In Prospect research. Run the discovery consultation stage?' && T[0].b === 'Run discovery consultation', JSON.stringify(T));
    check('a contact seen 20 days ago, the team\'s own, one set aside and one that is a lead are not asked about', !T.some((x) => /Olive|Ally|Sid|Pat/.test(x.t)), JSON.stringify(T));
    check('calls with only the team, with someone who is not a lead, or from 20 days ago are not asked about', T.length === 2, JSON.stringify(T));
    const hello = await txt(page, '.nw-hello p');
    const approvals = await page.evaluate(() => nwApprovalItems().length);
    check('the hello line counts them with the approvals', hello === (approvals + 2) + ' things need you.', hello + ' / ' + approvals);
    check('Today\'s card comes first and runs the full width', await page.evaluate(() => { const w = document.querySelector('.nw-widgets'), c = w && w.firstElementChild; return !!c && c.classList.contains('v137-today') && c.classList.contains('nw-w-3'); }), '');
    const B = await bell(page);
    check('the bell has one notification for each, with what it asks', B.length === 2 && B.some((x) => x[0] === 'v137:crm:' + TOM && x[1] === 'New client from HubSpot: Tom Becker, Halvern Foods' && x[2] === 'Catalyst · Run the pre-meeting prospect brief?') &&
      B.some((x) => x[0] === 'v137:call:fx-a' && x[2] === 'Catalyst · In Prospect research. Run the discovery consultation stage?'), JSON.stringify(B));
    // the bell opens the same question
    await page.evaluate(() => { rdOpenNotifs && rdOpenNotifs(); });
    await wait(page, 400);
    await page.evaluate(() => { const n = NOTIFS.findIndex((x) => /^v137:crm:/.test(x.key)); const rows = document.querySelectorAll('#notifPane .notif-list .named'); if (rows[n]) rows[n].click(); });
    await wait(page, 1200);
    const M = await modal(page);
    check('the bell opens the question: run the pre-meeting prospect brief for Tom Becker', /^CATALYST · NEW CLIENT FROM HUBSPOT Run the pre-meeting prospect brief for Tom Becker\?/.test(M), M.slice(0, 200));
    check('it says who it is and what happens, and that only that runs', M.indexOf('Tom Becker, VP Operations, Halvern Foods is new in HubSpot since ' + day(ago(26)) + '. Catalyst adds them to the Lead pipeline in Prospect research and writes the pre-meeting prospect brief. Only that runs, and nothing goes to the client.') >= 0, M);
    const R = await reads(page, '#v137M');
    check('and what it reads: no template yet, the CRM record, the rest', JSON.stringify(R) === JSON.stringify(['– No template for this stage yet, so the usual sections. Add one on Templates.',
      '✓ The CRM record: Tom Becker · VP Operations · Halvern Foods · lifecycle stage: lead · lead status: NEW · website: https://halvern.example', '✓ What is public about the firm, and your house rules']), JSON.stringify(R));
    check('its buttons: Not a client, Add without running, Run the prospect brief', JSON.stringify(await foot(page)) === '["Not a client","Add without running","Run the prospect brief"]', JSON.stringify(await foot(page)));
    const n0 = hooks.length;
    await page.click('#v137Go');
    await wait(page, 2000);
    const ins = W(store, 'e1_leads', 'POST');
    check('Run adds Tom to the Lead pipeline in Prospect research, from HubSpot', ins.length === 1 && ins[0].body.email === TOM && ins[0].body.prospect_name === 'Tom Becker' && ins[0].body.prospect_title === 'VP Operations' &&
      ins[0].body.company_name === 'Halvern Foods' && ins[0].body.lead_source === 'HubSpot' && ins[0].body.stage === 'research', JSON.stringify(ins.map((w) => w.body)));
    const r = runs(hooks.slice(n0));
    check('and starts the prospect brief only, with the CRM details, signed in', r.length === 1 && r[0].p === FULL && r[0].b.only === true && r[0].b.stage === 'research' && r[0].b.email === TOM && r[0].b.prospectName === 'Tom Becker' &&
      r[0].b.prospectTitle === 'VP Operations' && r[0].b.companyName === 'Halvern Foods' && r[0].b.website === 'https://halvern.example' && r[0].b.hearAboutUs === 'HubSpot' && !!r[0].b.auth, JSON.stringify(r.map((x) => x.b)));
    check('the question closes with a toast', !(await page.$('#v137M')) && /Started\. The prospect brief shows on the Lead pipeline when it is done\./.test(await txt(page, '.nw-toast, #nwToast, .toast')), await txt(page, '.nw-toast, #nwToast, .toast'));
    await wait(page, 800);
    const T2 = await today(page), B2 = await bell(page);
    check('Tom is no longer asked about as a new client, on Today or in the bell', !T2.some((x) => /New client/.test(x.t)) && !B2.some((x) => /crm/.test(x[0])), JSON.stringify([T2, B2]));
    check('and now that Tom is a lead, the call with him is a new transcript in Prospect research', T2.some((x) => x.t === 'New transcript: your call with Tom Becker on ' + day(CE.start) && x.s === 'In Prospect research. Run the discovery consultation stage?'), JSON.stringify(T2));
    await page.evaluate(() => apGo('e1pipeline'));
    await page.waitForSelector('#v120Board', { timeout: 15000 });
    await wait(page, 1500);
    const tom = await page.evaluate((e) => { const c = document.querySelector('#v120Board .v120-card[data-email="' + e + '"]'); return c ? { col: c.closest('.v120-col').dataset.s, t: c.innerText.replace(/\s+/g, ' ') } : null; }, TOM);
    check('on the board Tom is in Prospect research, the brief being written', tom && tom.col === 'research' && /Writing the pre-meeting prospect brief/.test(tom.t), JSON.stringify(tom));
    await ctx.close();
  }

  // 3. the other answers: add without running, not a client, and n8n refusing
  {
    const { ctx, page, store, hooks } = await open();
    await page.evaluate((e) => v137AskCrm(e), TOM);
    await wait(page, 900);
    const n0 = hooks.length;
    await page.click('#v137M .nw-m-foot button:has-text("Add without running")');
    await wait(page, 1500);
    check('Add without running adds the lead in Prospect research and runs nothing', W(store, 'e1_leads', 'POST').length === 1 && W(store, 'e1_leads', 'POST')[0].body.stage === 'research' && runs(hooks.slice(n0)).length === 0, JSON.stringify(runs(hooks.slice(n0))));
    check('and says where it went', /Added to Prospect research on the Lead pipeline\./.test(await txt(page, '.nw-toast, #nwToast, .toast')), await txt(page, '.nw-toast, #nwToast, .toast'));
    await ctx.close();
  }
  {
    const { ctx, page, store, hooks } = await open();
    await page.evaluate((e) => v137AskCrm(e), TOM);
    await wait(page, 900);
    const n0 = hooks.length;
    await page.click('#v137M .nw-m-foot button:has-text("Not a client")');
    await wait(page, 1500);
    const inbox = ((store.db.ai_settings || []).find((x) => x.key === 'catalyst_inbox') || {}).value || {};
    check('Not a client sets the contact aside for the team, keeping the one set aside before', inbox.crm && inbox.crm[TOM] && inbox.crm[TOM].by === ME && inbox.crm['sid.aside@example.com'] && W(store, 'e1_leads').length === 0 && runs(hooks.slice(n0)).length === 0, JSON.stringify(inbox));
    check('it says the contact stays in HubSpot contacts, and is not asked about again', /Set aside\. Tom Becker stays in HubSpot contacts\./.test(await txt(page, '.nw-toast, #nwToast, .toast')) && !(await today(page)).some((x) => /Tom/.test(x.t)), '');
    await ctx.close();
    const again = await open({ store });
    check('after a reload it stays set aside', !(await today(again.page)).some((x) => /Tom/.test(x.t)) && (await today(again.page)).length === 1, JSON.stringify(await today(again.page)));
    await again.ctx.close();
  }
  {
    const { ctx, page, store } = await open({ hookFail: true });
    await page.evaluate((e) => v137AskCrm(e), TOM);
    await wait(page, 900);
    await page.click('#v137Go');
    await wait(page, 2000);
    const m = await txt(page, '#v137Msg');
    check('when n8n refuses, the lead is still added and the question says it could not start', W(store, 'e1_leads', 'POST').length === 1 && /^Added to Prospect research, but it could not start: .*Run it from the Lead pipeline\.$/.test(m) && !!(await page.$('#v137M')), m);
    await ctx.close();
  }

  // 4. a new transcript: file it under the lead's stage and run the next stage with it
  {
    const { ctx, page, store, hooks } = await open();
    await page.click('.v137-today .v137-in-r:has-text("New transcript") button');
    await page.waitForSelector('#v137M .v137-reads .u:not(.v132-off) , #v137M .v137-reads .v132-cl', { timeout: 15000 }).catch(() => {});
    await wait(page, 800);
    const M = await modal(page);
    check('the question: run the discovery consultation stage for Robin Test', /^CATALYST · NEW TRANSCRIPT Run the discovery consultation stage for Robin Test\?/.test(M), M.slice(0, 160));
    check('it shows the call: when, how long, its title, and what the post-call summary says', M.indexOf('Your call with Robin Test ' + day(CA.start) + ' · 38 min · Intro call · Testwell') >= 0 &&
      M.indexOf('Month-end reports take two days Robin wants a pilot before the first quarter From the post-call summary') >= 0, M);
    check('it says where the transcript is filed and what runs', M.indexOf('Its transcript is filed under Prospect research, where Robin Test is now. In Discovery consultation, Catalyst writes the consultation guide from everything so far and this call. Only that runs, and nothing goes to the client.') >= 0, M);
    const R = await reads(page, '#v137M');
    check('and what the stage reads: no template, the call\'s transcript, no HubSpot contact, the brief', JSON.stringify(R) === JSON.stringify(['– No template for this stage yet, so the usual sections. Add one on Templates.',
      '✓ The call on ' + day(CA.start) + ': Intro call · Testwell (transcript)', '– No emails with this lead logged in HubSpot.', '– No HubSpot contact with this lead’s email.', '✓ The prospect brief and your house rules']), JSON.stringify(R));   /* v138: the emails line */
    check('its buttons: Not about this client, Just file it, Move and run it', JSON.stringify(await foot(page)) === '["Not about this client","Just file it","Move and run it"]', JSON.stringify(await foot(page)));
    await page.fill('#v137Note', 'They want the monthly report automated first.');
    const n0 = hooks.length;
    await page.click('#v137Go');
    await wait(page, 2500);
    const meta = W(store, 'call_meta');
    const last = (store.db.call_meta || []).find((m) => m.call_id === 'fx-a') || {};
    check('the call is filed under Prospect research for Robin, with the stage\'s meeting type', last.lead_email === L2 && last.lead_stage === 'research' && last.meeting_type === 'sales' && last.updated_by, JSON.stringify(last));
    const st = W(store, 'e1_leads', 'PATCH').map((w) => [w.filters, w.body.stage]);
    check('Robin moves to Discovery consultation', st.length === 1 && JSON.stringify(st[0][0]) === JSON.stringify([['email', 'eq.' + L2]]) && st[0][1] === 'consultation', JSON.stringify(st));
    const r = runs(hooks.slice(n0));
    const want = 'NOTES FROM THE TEAM\nThey want the monthly report automated first.\n\nWHAT WAS SAID IN THE MEETINGS (call transcripts, newest first)\n\nCall on ' + dayY(CA.start) + ': Intro call · Testwell (filed under Prospect research)\nRobin Test: Our month-end reports take two days.\nQA Tester: Who puts them together today?';
    check('only the consultation guide runs, with the notes first and the transcript after', r.length === 1 && r[0].p === CUSTOM && r[0].b.entry === 'interview_script' && r[0].b.only === true && r[0].b.stage === 'consultation' && r[0].b.transcript === want, JSON.stringify(r.map((x) => [x.p, x.b.entry, x.b.only, x.b.stage, x.b.transcript])));
    check('the question closes, and the transcript is no longer asked about', !(await page.$('#v137M')) && !(await today(page)).some((x) => /transcript/.test(x.t)) && !(await bell(page)).some((x) => /call/.test(x[0])), JSON.stringify(await today(page)));
    check('nothing else was written to the call', meta.every((w) => !w.body || !('title' in w.body)), JSON.stringify(meta.map((w) => w.body)));
    await ctx.close();
  }
  // just file it, and set it aside
  {
    const { ctx, page, store, hooks } = await open({ calls: [CA, CD] });
    await page.evaluate(() => v137AskCall('fx-a'));
    await wait(page, 1200);
    const n0 = hooks.length;
    await page.click('#v137M .nw-m-foot button:has-text("Just file it")');
    await wait(page, 1200);
    const m = (store.db.call_meta || []).find((x) => x.call_id === 'fx-a') || {};
    check('Just file it files the call under the stage the lead is in, and runs and moves nothing', m.lead_stage === 'research' && m.lead_email === L2 && runs(hooks.slice(n0)).length === 0 && W(store, 'e1_leads').length === 0, JSON.stringify(m));
    check('it says where', /Filed under Prospect research\./.test(await txt(page, '.nw-toast, #nwToast, .toast')), '');
    await page.evaluate(() => v137AskCall('fx-d'));
    await wait(page, 1200);
    const M = await modal(page);
    check('a lead in Proposal is asked about Onboarding', /^CATALYST · NEW TRANSCRIPT Run the onboarding stage for Pat QA\?/.test(M), M.slice(0, 120));
    await page.click('#v137M .nw-m-foot button:has-text("Not about this client")');
    await wait(page, 1200);
    const d = (store.db.call_meta || []).find((x) => x.call_id === 'fx-d') || {};
    check('Not about this client sets the call aside, with no meeting type put on it', d.lead_stage === 'none' && d.lead_email === L1 && !d.meeting_type, JSON.stringify(d));
    check('Today asks about neither any more', (await today(page)).every((x) => !/transcript/.test(x.t)), JSON.stringify(await today(page)));
    await ctx.close();
  }
  // the last stage runs again; a lead being written is not run; a call type the team set is kept
  {
    const CS = call('fx-s', 2, 'Quarterly review · Sample', [['Sam Sample', L3]], 50);
    TX['fx-s'] = [{ speaker: 'Sam Sample', text: 'Volunteer sign-ups doubled this quarter.' }];
    const { ctx, page, store, hooks } = await open({ calls: [CS, CA], more: (t) => {
      t.e1_leads.find((l) => l.email === L3).stage = 'review';
      t.call_meta.push({ call_id: 'fx-s', title: null, folder: null, client: null, tags: [], meeting_type: 'checkin', description: null, guests: null, updated_by: ME, created_at: ago(1), updated_at: ago(1) });
    } });
    const T = await today(page);
    check('a lead in Client review is asked to run its review brief again', T.some((x) => x.t === 'New transcript: your call with Sam Sample on ' + day(CS.start) && x.s === 'In Client review. Run the client review brief again with it?' && x.b === 'Run it again'), JSON.stringify(T));
    await page.evaluate(() => v137AskCall('fx-s'));
    await wait(page, 1500);
    const M = await modal(page);
    check('the question says it runs again with this call', /^CATALYST · NEW TRANSCRIPT Run the client review brief again with this call\?/.test(M) && M.indexOf('Catalyst writes the client review brief again, with this call.') >= 0 && JSON.stringify(await foot(page)) === '["Not about this client","Just file it","Run it again"]', M);
    const n0 = hooks.length;
    await page.click('#v137Go');
    await wait(page, 2500);
    const r = runs(hooks.slice(n0));
    check('it goes to Meeting Prep for Client review, with the transcript as what was said', r.length === 1 && r[0].p === PREP && r[0].b.stage === 'review' && r[0].b.leadEmail === L3 &&
      r[0].b.transcript === 'WHAT WAS SAID IN THE MEETINGS (call transcripts, newest first)\n\nCall on ' + dayY(CS.start) + ': Quarterly review · Sample (filed under Client review)\nSam Sample: Volunteer sign-ups doubled this quarter.', JSON.stringify(r.map((x) => x.b)));
    const m = (store.db.call_meta || []).find((x) => x.call_id === 'fx-s') || {};
    check('the call type the team set stays, and the lead does not move', m.meeting_type === 'checkin' && m.lead_stage === 'review' && W(store, 'e1_leads', 'PATCH').length === 0, JSON.stringify(m));
    // Robin's call while Robin's consultation guide is being written
    await page.evaluate((e) => { v120Runs()[e] = { s: 'consultation', t0: Date.now(), seen: 0 }; }, L2);
    await page.evaluate(() => v137AskCall('fx-a'));
    await wait(page, 1500);
    const M2 = await modal(page);
    check('a lead still being written: the question says so and offers no run', M2.indexOf('Catalyst is still writing the consultation guide for Robin Test. File the transcript now, and run the next stage once that is done.') >= 0 &&
      JSON.stringify(await foot(page)) === '["Not about this client","Just file it"]', M2);
    await ctx.close();
  }

  // 5. the board's own runs read what the stage's setup says
  {
    const { ctx, page, store, hooks } = await open({ calls: [CA, CD] }, '/dashboard/lead-pipeline');
    await page.waitForSelector('#v120Board', { timeout: 15000 });
    await page.evaluate((e) => v136Ask(e, 'consultation', true), L2);
    await page.waitForSelector('#v120M .v137-reads .v132-cl', { timeout: 15000 }).catch(() => {});
    const R = await reads(page, '#v120M');
    check('the board\'s question says what the stage reads, the call included', JSON.stringify(R) === JSON.stringify(['– No template for this stage yet, so the usual sections. Add one on Templates.',
      '✓ The call on ' + day(CA.start) + ': Intro call · Testwell (transcript)', '– No emails with this lead logged in HubSpot.', '– No HubSpot contact with this lead’s email.', '✓ The prospect brief and your house rules']), JSON.stringify(R));   /* v138: the emails line */
    check('and the notes box says the transcripts go with it', (await txt(page, '#v120M label.nw-field small')) === 'Optional: the call transcripts above go with it. Add anything else from the meeting.', await txt(page, '#v120M label.nw-field small'));
    const n0 = hooks.length;
    await page.click('#v120Go');
    await wait(page, 2500);
    const r = runs(hooks.slice(n0));
    check('Move and run sends the transcript as what was said (no notes section when there are none)', r.length === 1 && r[0].p === CUSTOM && r[0].b.only === true && r[0].b.stage === 'consultation' &&
      r[0].b.transcript === 'WHAT WAS SAID IN THE MEETINGS (call transcripts, newest first)\n\nCall on ' + dayY(CA.start) + ': Intro call · Testwell\nRobin Test: Our month-end reports take two days.\nQA Tester: Who puts them together today?', JSON.stringify(r.map((x) => x.b.transcript)));
    const m = (store.db.call_meta || []).find((x) => x.call_id === 'fx-a') || {};
    check('the call it read is filed under the stage Robin was in', m.lead_stage === 'research' && m.lead_email === L2, JSON.stringify(m));
    // Pat is in HubSpot: Onboarding reads the CRM record and the call
    await page.evaluate((e) => v136Ask(e, 'onboarding', true), L1);
    await page.waitForSelector('#v120M .v137-reads .v132-cl', { timeout: 15000 }).catch(() => {});
    await page.fill('#v120Note', 'Start date agreed for January.');
    const n1 = hooks.length;
    await page.click('#v120Go');
    await wait(page, 2500);
    const r1 = runs(hooks.slice(n1));
    check('Onboarding gets the notes, the CRM record and the call, in that order', r1.length === 1 && r1[0].p === PREP && r1[0].b.stage === 'onboarding' &&
      r1[0].b.transcript === 'NOTES FROM THE TEAM\nStart date agreed for January.\n\nTHE CRM RECORD (HubSpot)\nPat QA · Managing Partner · QA Firm LLC · lifecycle stage: lead · lead status: NEW · website: https://qafirm.example\n\nWHAT WAS SAID IN THE MEETINGS (call transcripts, newest first)\n\nCall on ' + dayY(CD.start) + ': Proposal walk-through · QA Firm\nPat QA: The proposal looks right. Can we start in January?', JSON.stringify(r1.map((x) => x.b.transcript)));
    await ctx.close();
  }
  {
    // with transcripts and the CRM record off, a run sends just the notes, as before; and no call is filed
    const { ctx, page, store, hooks } = await open({ calls: [CA, CD], more: (t) => { t.ai_settings.push({ key: 'catalyst_stage_setup', value: { onboarding: { calls: false, crm: false, by: ME, at: ago(5) } }, updated_at: ago(5) }); } }, '/dashboard/lead-pipeline');
    await page.waitForSelector('#v120Board', { timeout: 15000 });
    await page.evaluate((e) => v136Ask(e, 'onboarding', true), L1);
    await wait(page, 1500);
    const R = await reads(page, '#v120M');
    check('with both off, the question lists neither (the emails, still on, say there are none)', JSON.stringify(R) === JSON.stringify(['– No template for this stage yet, so the usual sections. Add one on Templates.', '– No emails with this lead logged in HubSpot.', '✓ Every document so far and your house rules']), JSON.stringify(R));   /* v138 */
    await page.fill('#v120Note', 'Start date agreed for January.');
    const n0 = hooks.length;
    await page.click('#v120Go');
    await wait(page, 2000);
    const r = runs(hooks.slice(n0));
    check('and the run sends just the notes, exactly as typed', r.length === 1 && r[0].b.transcript === 'Start date agreed for January.', JSON.stringify(r.map((x) => x.b.transcript)));
    check('and files no call', !(store.db.call_meta || []).some((x) => x.call_id === 'fx-d'), JSON.stringify(store.db.call_meta));
    await ctx.close();
  }
  {
    // a long transcript is cut to fit; transcripts that cannot be read leave a lead with no brief needing notes
    const long = []; for (let i = 0; i < 1400; i++) long.push({ speaker: i % 2 ? 'QA Tester' : 'Robin Test', text: 'Line ' + i + ' of a very long meeting about month-end reporting and the pilot.' });
    const { ctx, page, hooks } = await open({ longTx: long }, '/dashboard/lead-pipeline');
    await page.waitForSelector('#v120Board', { timeout: 15000 });
    await page.evaluate((e) => v136Ask(e, 'consultation', true), L2);
    await wait(page, 1500);
    await page.fill('#v120Note', 'Short note.');
    const n0 = hooks.length;
    await page.click('#v120Go');
    await wait(page, 2500);
    const t = (runs(hooks.slice(n0))[0] || { b: {} }).b.transcript || '';
    check('a long transcript is cut so the notes stay under 44,000 characters, and says so', t.length <= 44000 && t.length > 40000 && /^NOTES FROM THE TEAM\nShort note\.\n\nWHAT WAS SAID/.test(t) && /\n\[the rest of this call is left out\]$/.test(t), t.length + ' ' + t.slice(-60));
    await ctx.close();
  }
  {
    const { ctx, page, hooks } = await open({ tx: false, calls: [call('fx-s3', 3, 'First call · Sample', [['Sam Sample', L3]], 30)] }, '/dashboard/lead-pipeline');
    await page.waitForSelector('#v120Board', { timeout: 15000 });
    await page.evaluate((e) => v136Ask(e, 'consultation', true), L3);
    await wait(page, 1500);
    const n0 = hooks.length;
    await page.click('#v120Go');
    await wait(page, 2000);
    const m = await txt(page, '#v120Msg');
    check('a lead with no brief and a transcript that cannot be read still needs notes', runs(hooks.slice(n0)).length === 0 && m === 'Paste the meeting transcript or your notes first. This lead has no prospect brief to work from yet, and no recorded call with it.', m);
    await ctx.close();
  }
  {
    // a prospect brief run from the board takes the CRM record as the lead's details
    const { ctx, page, hooks } = await open({ more: (t) => { const l = t.e1_leads.find((x) => x.email === L3); l.stage = 'consultation'; t.hubspot_contacts.push({ email: L3, first_name: 'Sam', last_name: 'Sample', company: 'Sample Nonprofit', job_title: 'Executive Director', website: 'https://sample.example', lifecycle_stage: 'lead', lead_status: '', hs_id: '9200', props: {}, synced_at: ago(1), first_seen: null }); } }, '/dashboard/lead-pipeline');
    await page.waitForSelector('#v120Board', { timeout: 15000 });
    await page.evaluate((e) => v136Ask(e, 'research', true), L3);
    await wait(page, 1500);
    const n0 = hooks.length;
    await page.click('#v120Go');
    await wait(page, 2000);
    const r = runs(hooks.slice(n0));
    check('a board run of the prospect brief sends the website from HubSpot, and not as a HubSpot intake', r.length === 1 && r[0].p === FULL && r[0].b.website === 'https://sample.example' && r[0].b.hearAboutUs === 'Dashboard run' && r[0].b.only === true, JSON.stringify(r.map((x) => [x.b.website, x.b.hearAboutUs])));
    await ctx.close();
  }

  // 6. a lead's page: its calls, and no empty follow-up guide under every tab
  {
    const { ctx, page } = await open({ more: (t) => { t.call_meta.push({ call_id: 'fx-c', title: null, folder: null, client: null, tags: [], meeting_type: null, description: null, guests: null, lead_email: L3, lead_stage: 'none', updated_by: ME, created_at: ago(1), updated_at: ago(1) }); } }, '/dashboard/lead-pipeline');
    await page.evaluate((e) => openE1Lead(e), L2);
    await page.waitForSelector('#apChrome .rd-tab[data-tab="v137calls"]', { timeout: 15000 });
    await wait(page, 1200);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#apChrome .rd-tab')].map((t) => t.dataset.tab));
    check('a lead\'s page has a Calls tab, last', tabs[tabs.length - 1] === 'v137calls', JSON.stringify(tabs));
    const hidden = await page.evaluate(() => [...document.querySelectorAll('#main section.block')].filter((s) => { const h = s.querySelector(':scope > h2'); return h && /^\s*4\./.test(h.textContent); }).map((s) => [s.dataset.tp, getComputedStyle(s).display]));
    check('a lead with no follow-up guide: its empty section is hidden under every tab', hidden.length === 1 && hidden[0][0] === 'v136-none' && hidden[0][1] === 'none', JSON.stringify(hidden));
    await page.click('#apChrome .rd-tab[data-tab="v137calls"]');
    await page.waitForSelector('.v137-lcs .v137-lc', { timeout: 15000 }).catch(() => {});
    const c = await page.evaluate(() => ({ h: document.querySelector('.v137-lcs h2').innerText.replace(/\s+/g, ' '), p: (document.querySelector('.v137-lcp') || {}).textContent,
      rows: [...document.querySelectorAll('.v137-lcs .v137-lc')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()), vis: [...document.querySelectorAll('#main [data-tp]')].filter((n) => getComputedStyle(n).display !== 'none').map((n) => n.dataset.tp) }));
    check('the Calls tab lists the call, not filed yet, with File it and Open on Calls', c.h === 'Calls 1' && c.rows.length === 1 && c.rows[0] === 'Intro call · Testwell ' + day(CA.start) + ' · 38 min Not filed yet File it Open on Calls', JSON.stringify(c));
    check('and says what the calls are for; only the Calls tab shows', c.p === 'Calls recorded in Fathom with Robin Test. Each is filed under the stage Robin Test was in, and the stages after it read its transcript.' && c.vis.every((x) => x === 'v137calls'), JSON.stringify([c.p, c.vis]));
    await page.click('.v137-lcs .v137-lc button:has-text("File it")');
    await wait(page, 1200);
    check('File it opens the transcript question', /^CATALYST · NEW TRANSCRIPT Run the discovery consultation stage for Robin Test\?/.test(await modal(page)), '');
    await page.evaluate(() => nwModalClose());
    await page.evaluate((e) => openE1Lead(e), L3);
    await page.waitForSelector('#apChrome .rd-tab[data-tab="v137calls"]', { timeout: 15000 });
    await page.click('#apChrome .rd-tab[data-tab="v137calls"]');
    await wait(page, 1500);
    const c3 = await page.evaluate(() => [...document.querySelectorAll('.v137-lcs .v137-lc')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    check('a call set aside says so, with no File it', c3.length === 1 && c3[0] === 'Old call · Sample ' + day(CC.start) + ' · 30 min Set aside Open on Calls', JSON.stringify(c3));
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ ftDown: true }, '/dashboard/lead-pipeline');
    await page.evaluate((e) => openE1Lead(e), L2);
    await page.waitForSelector('#apChrome .rd-tab[data-tab="v137calls"]', { timeout: 15000 });
    await page.click('#apChrome .rd-tab[data-tab="v137calls"]');
    await wait(page, 1500);
    check('when Fathom cannot be read, the Calls tab says so', (await txt(page, '.v137-lcs .empty')) === 'Could not read the calls from Fathom: Fathom is not connected', await txt(page, '.v137-lcs .empty'));
    await page.evaluate(() => apGo('home'));
    await wait(page, 1500);
    check('with Fathom down, Today still asks about the new contact', JSON.stringify((await today(page)).map((x) => x.t)) === JSON.stringify(['New client from HubSpot: Tom Becker, Halvern Foods']), JSON.stringify(await today(page)));
    await ctx.close();
  }
  {
    // nothing new: no card on Today, no notifications, the hello line as before
    const { ctx, page } = await open({ calls: [], more: (t) => { t.hubspot_contacts.forEach((c) => { c.first_seen = null; }); } });
    const n = await page.evaluate(() => ({ card: !!document.querySelector('.v137-today'), bell: NOTIFS.filter((x) => /^v137:/.test(x.key)).length, hello: document.querySelector('.nw-hello p').textContent, ap: nwApprovalItems().length }));
    check('with nothing new, Today has no Catalyst card and the bell nothing from it', !n.card && n.bell === 0 && n.hello === (n.ap ? (n.ap === 1 ? '1 thing needs you.' : n.ap + ' things need you.') : 'Nothing needs you right now.'), JSON.stringify(n));
    await ctx.close();
  }

  // 7. layout at 1024 and 390 wide
  for (const w of [1024, 390]) {
    const { ctx, page } = await open({}, '/dashboard/today', w);
    const a = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, card: !!document.querySelector('.v137-today'),
      over: [...document.querySelectorAll('.v137-in-r')].filter((r) => r.getBoundingClientRect().right > innerWidth + 1).length }));
    check(w + ' wide: Today\'s card fits', a.card && a.sw <= a.iw + 1 && a.over === 0, JSON.stringify(a));
    await page.evaluate(() => v137AskCall('fx-a'));
    await wait(page, 1500);
    const m = await page.evaluate(() => { const e = document.getElementById('v137M'); const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, iw: innerWidth, btn: [...e.querySelectorAll('.nw-m-foot button')].every((b) => b.getBoundingClientRect().right <= innerWidth + 1) }; });
    check(w + ' wide: the question fits, buttons too', m.l >= -1 && m.r <= m.iw + 1 && m.btn, JSON.stringify(m));
    await page.evaluate(() => nwModalClose());
    await page.evaluate(() => apGo('templates'));
    await page.waitForSelector('#v132Src .v137-st', { timeout: 15000 });
    await wait(page, 800);
    const t = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, cols: new Set([...document.querySelectorAll('.v137-st')].map((s) => Math.round(s.getBoundingClientRect().left))).size,
      over: [...document.querySelectorAll('.v137-st, .v137-st select, .v137-drop')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length }));
    check(w + ' wide: the stage cards fit, one column', t.sw <= t.iw + 1 && t.over === 0 && t.cols === 1, JSON.stringify(t));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
