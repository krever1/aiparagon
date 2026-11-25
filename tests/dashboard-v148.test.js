// v148 tests for new-aiparagon-dashboard.html (#1): Canvas · Make a deliverable. On Deliverables, a meeting recap and
// next steps for a client is made from a lead (one of its recorded calls, or notes), a recorded call (its lead, or the
// create-client question when nobody on it is a lead) or an inquiry (a landing page sign-up or a new HubSpot contact,
// added as a lead first). Catalyst · Meeting Prep writes it (kind recap); it lands as a draft on Deliverables, opens to
// read, edit, copy, save as PDF and mark ready for the client. Supabase answers from an in-memory store
// (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js); n8n webhooks answer from stubs. Everyone is made
// up. Fails on the build before v148.
// Usage: node tests/dashboard-v148.test.js
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
const L1 = FX.L1, L2 = FX.L2, L3 = FX.L3;
const ME = 'qa@aiparagonconsulting.com';
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const call = (id, h, title, guests, mins) => ({ id, title, start: ago(h), end: new Date(Date.now() - h * 3600e3 + (mins || 40) * 60e3).toISOString(),
  share_url: 'https://fathom.video/share/' + id + 'abcdef', recorded_by: { name: 'QA Tester', email: ME },
  invitees: guests.map((g) => ({ name: g[0], email: g[1], external: true })).concat([{ name: 'QA Tester', email: ME, external: false }]) });
const CA = call('fx-a', 20, 'Intro call · Testwell', [['Robin Test', L2]], 38);                     // Robin is a lead
const CB = call('fx-b', 30, 'Team sync', [], 25);                                                   // only the team
const CN = call('fx-n', 5, 'First chat · Northwind', [['Nora Quill', 'nora@northwind.example']], 30); // nobody we know
const TX = [{ speaker: 'Robin Test', text: 'Month-end reports take us two days.' }, { speaker: 'QA Tester', text: 'We will send the pilot plan by Friday.' }];
const RECAP = '# Meeting recap and next steps · Testwell Partners\n\n## Summary\nWe met to talk about month-end reporting.\n\n## What we discussed\n- Reports take **two days** each month.\n\n## What we agreed\n- We send a pilot plan.\n\n## Next steps\n1. We send the pilot plan by Friday.\n\n## What we need from you\n- [TO CONFIRM: who signs off the pilot]\n\n## Open questions\n- None yet.';
const DL = '00000000-0000-4000-8000-0000000d1001';
const dlRow = (o) => Object.assign({ id: DL, run_id: L2, agent: 'deliverable', output_type: 'json', title: 'Meeting recap and next steps · Testwell Partners', content_md: RECAP,
  data: { kind: 'recap', status: 'draft', stage: 'recap', prospectName: 'Robin Test', companyName: 'Testwell Partners', call: { id: 'fx-a', title: CA.title, date: CA.start } },
  created_at: ago(2), edited_by_human: false, snapshot: null }, o || {});

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(o) {
    o = o || {};
    const t = FX.tables();
    t.lp_signups = [{ id: '00000000-0000-4000-8000-0000000b1001', page_id: null, slug: 'ai-readiness', name: 'Lee Signup', email: 'Lee.Signup@example.com', company: 'Signup Co', job_title: 'Owner',
      answers: { biggest_problem: 'Reporting takes too long', team_size: '12' }, created_at: ago(30) }];
    t.hubspot_contacts.forEach((c) => { if (c.email === 'qa.contact@example.com') c.first_seen = ago(48); });
    if (o.more) o.more(t);
    const store = makeStore(t);
    const hooks = [];
    const hook = (u, m, b) => {
      let j = null; try { j = JSON.parse(b || ''); } catch (e) {}
      const p = u.replace(/^https:\/\/n8n\.aiparagonconsulting\.com\/webhook\//, '');
      hooks.push({ p, b: j });
      if (/fathom-proxy$/.test(u)) {
        if (j && j.action === 'list') return { body: { ok: true, items: o.calls || [CA, CB, CN] } };
        if (j && j.action === 'status') return { body: { ok: true, connected: true, hint: 'abcd' } };
        return { body: { ok: true, transcript: j && j.id === 'fx-a' ? TX : [] } };
      }
      if (o.hook) { const r = o.hook(p, j); if (r) return r; }
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    await page.setViewportSize({ width: o.width || 1440, height: 900 });
    await page.goto(BASE + '/dashboard/deliverables', { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(o.wait || 1800);
    return { ctx, page, store, hooks };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 300);
  const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  const prep = (hooks) => hooks.filter((h) => /catalyst-meeting-prep$/.test(h.p)).pop();
  const make = async (page) => { await page.click('button:has-text("Make a deliverable")'); await page.waitForSelector('#v148Go', { timeout: 8000 }); await wait(page, 300); };

  // 1. Deliverables: the button, the For clients tab, a recap on file
  if (want('page')) {
    const { ctx, page } = await open({ more: (t) => { t.agent_outputs.push(dlRow()); } });
    check('Deliverables has Make a deliverable', await page.locator('.nw-ph-actions button:has-text("Make a deliverable")').count() === 1);
    check('…and a For clients tab', /For clients\s*1/.test(await txt(page, '.v115-dl .nw-toolbar')), await txt(page, '.v115-dl .nw-toolbar'));
    const row = await txt(page, '.v148-row');
    check('A recap on file is listed for its lead, as a draft to check', /Meeting recap and next steps · Testwell Partners/.test(row) && /Robin Test · Testwell Partners/.test(row) && /Draft · check before sending/.test(row), row);
    check('The old "come next" note is gone', !/come next/.test(await txt(page, '.v115-dl')));
    await page.click('.v115-dl .nw-seg button:has-text("For clients")'); await wait(page, 500);
    check('For clients shows only the recaps', await page.locator('#v115DlList .nw-row').count() === 1);
    await ctx.close();
  }

  // 2. From a lead: its newest recorded call is read; the run goes to Meeting Prep as a recap; it lands as a draft
  if (want('lead')) {
    const { ctx, page, store, hooks } = await open();
    await make(page);
    check('It starts on A lead, with Write the recap off until a lead is picked', await page.isDisabled('#v148Go') && /A lead/.test(await txt(page, '.v148-seg [aria-selected=true]')));
    const leads = await page.$$eval('#v148Lead option', (o) => o.map((x) => x.textContent));
    check('The leads are listed by name, with their company', leads.some((x) => /Robin Test · Testwell Partners/.test(x)) && leads.some((x) => /Pat QA · QA Firm LLC/.test(x)), JSON.stringify(leads));
    await page.selectOption('#v148Lead', L2); await wait(page, 400);
    const calls = await page.$$eval('#v148LCall option', (o) => o.map((x) => x.textContent));
    check('The lead\'s recorded calls are offered, newest first, then notes only', /Intro call · Testwell · 38 min/.test(calls[0]) && /No recording: use my notes/.test(calls[calls.length - 1]), JSON.stringify(calls));
    const reads = await txt(page, '.v148-reads');
    check('It says what it reads: the transcript, notes, the lead\'s documents as background, house rules', /The transcript of .*Intro call · Testwell/.test(reads) && /as background only/.test(reads) && /house rules/.test(reads), reads);
    await page.fill('#v148Note', 'They want the pilot to start in January.');
    await page.click('#v148Go'); await wait(page, 2500);
    const b = (prep(hooks) || {}).b || {};
    check('Meeting Prep gets a recap request for the lead and the call', b.kind === 'recap' && b.stage === 'recap' && b.leadEmail === L2 && b.callId === 'fx-a' && b.callTitle === CA.title && b.from === 'canvas' && b.docName === 'Meeting recap and next steps', JSON.stringify(Object.assign({}, b, { auth: undefined, transcript: undefined })));
    check('…with the notes first, then the CRM record if any, then the transcript', /^NOTES FROM THE TEAM:\nThey want the pilot/.test(b.transcript || '') && /CALL TRANSCRIPT \(.*Intro call · Testwell.*\):\nRobin Test: Month-end reports take us two days\./.test(b.transcript || ''), (b.transcript || '').slice(0, 300));
    check('The dialog closes and the recap shows as being written', !(await page.$('#v148M')) && /Writing…/.test(await txt(page, '.v148-row')));
    check('The run is kept across a reload', await page.evaluate((e) => { const r = JSON.parse(localStorage.getItem('ap.v148.runs') || '{}'); return !!r[e]; }, L2));
    store.db.agent_outputs.push(dlRow({ created_at: new Date().toISOString() }));
    await page.waitForFunction(() => !document.querySelector('.v148-pill.is-run'), null, { timeout: 15000 }).catch(() => {});
    const row = await txt(page, '.v148-row');
    check('When it lands it is listed as a draft, and the run is done', /Draft · check before sending/.test(row) && !/Writing/.test(row) && await page.evaluate(() => localStorage.getItem('ap.v148.runs')) === '{}', row);
    await ctx.close();
  }

  // 3. A lead with no recording needs notes; Meeting Prep switched off says so
  if (want('notes')) {
    const { ctx, page, hooks } = await open({ hook: (p) => (/catalyst-meeting-prep$/.test(p) ? { status: 404, body: {} } : null) });
    await make(page);
    await page.selectOption('#v148Lead', L3); await wait(page, 400);
    check('A lead with no calls is on notes only', (await page.$$eval('#v148LCall option', (o) => o.map((x) => x.value))).join() === 'none');
    await page.fill('#v148Note', 'Short.');
    await page.click('#v148Go'); await wait(page, 600);
    check('With no recording, a few lines of notes are needed', /Pick the recorded call, or write what was said/.test(await txt(page, '#v148Msg')) && !prep(hooks));
    await page.fill('#v148Note', 'We agreed to send a board deck by Tuesday and to meet again in two weeks.');
    await page.click('#v148Go'); await wait(page, 2000);
    const b = (prep(hooks) || {}).b || {};
    check('The notes go alone, with no call', b.leadEmail === L3 && b.callId === '' && /^NOTES FROM THE TEAM:\nWe agreed/.test(b.transcript || '') && !/CALL TRANSCRIPT/.test(b.transcript || ''));
    check('Meeting Prep switched off says so, and the dialog stays', /switched off in n8n/.test(await txt(page, '#v148Msg')) && !!(await page.$('#v148M')) && !(await page.isDisabled('#v148Go')), await txt(page, '#v148Msg'));
    await ctx.close();
  }

  // 4. From a recorded call: its lead, or the create-client question
  if (want('call')) {
    const { ctx, page } = await open();
    await make(page);
    await page.click('.v148-seg button:has-text("A recorded call")'); await wait(page, 300);
    const opts = await page.$$eval('#v148Call option', (o) => o.map((x) => x.textContent));
    check('Calls with someone from outside the team are listed, newest first; team-only calls are not', /First chat · Northwind/.test(opts[1]) && /Intro call · Testwell/.test(opts[2]) && !opts.some((x) => /Team sync/.test(x)), JSON.stringify(opts));
    await page.selectOption('#v148Call', 'fx-a'); await wait(page, 300);
    check('A call with a lead on it is for that lead', /For Robin Test, Testwell Partners/.test(await txt(page, '#v148B')) && !(await page.isDisabled('#v148Go')));
    await page.selectOption('#v148Call', 'fx-n'); await wait(page, 300);
    check('A call with no lead on it asks to create the client record first', /Nora Quill is not a lead yet/.test(await txt(page, '.v148-warn')) && await page.isDisabled('#v148Go'));
    await page.click('.v148-warn button:has-text("Create the client record")'); await wait(page, 1200);
    check('…which opens the new-contact question', !!(await page.$('#v144C')) && !(await page.$('#v148M')));
    await ctx.close();
  }

  // 5. From an inquiry: a sign-up becomes a lead, and its answers go in
  if (want('inquiry')) {
    const { ctx, page, store, hooks } = await open();
    await make(page);
    await page.click('.v148-seg button:has-text("An inquiry")'); await wait(page, 300);
    const opts = await page.$$eval('#v148Sig option', (o) => o.map((x) => x.textContent));
    check('Sign-ups and new HubSpot contacts are listed', opts.some((x) => /Lee Signup · Signup Co · Sign-up on \/go\/ai-readiness/.test(x)) && opts.some((x) => /Casey Contact · Contact Co · New in HubSpot/.test(x)), JSON.stringify(opts));
    await page.selectOption('#v148Sig', 'su:00000000-0000-4000-8000-0000000b1001'); await wait(page, 300);
    check('It says the sign-up is not a lead yet and will be added', /Not a lead yet\. Making the recap adds Lee Signup to the Lead pipeline/.test(await txt(page, '#v148B')));
    await page.fill('#v148Note', 'Lee wants a short call next week about the reporting pilot and pricing.');
    await page.click('#v148Go'); await wait(page, 2500);
    const lead = store.db.e1_leads.find((r) => r.email === 'lee.signup@example.com');
    check('The sign-up is added as a lead in Prospect research, from its landing page', lead && lead.stage === 'research' && lead.lead_source === 'Landing page · ai-readiness' && lead.prospect_name === 'Lee Signup', JSON.stringify(lead));
    const b = (prep(hooks) || {}).b || {};
    check('The recap request carries the sign-up and its answers', b.leadEmail === 'lee.signup@example.com' && /LANDING PAGE SIGN-UP \(\/go\/ai-readiness\)/.test(b.transcript || '') && /biggest problem: Reporting takes too long/.test(b.transcript || ''), (b.transcript || '').slice(0, 300));
    await ctx.close();
  }

  // 6. Reading a recap: TO CONFIRM, edit, mark ready, copy, save as PDF
  if (want('read')) {
    const { ctx, page, store } = await open({ more: (t) => { t.agent_outputs.push(dlRow()); } });
    await page.click('.v148-row button:has-text("Open")'); await page.waitForSelector('#v148R', { timeout: 8000 }); await wait(page, 300);
    const head = await txt(page, '#v148R');
    check('It opens as a draft, with its lead, call and the things to confirm', /Canvas · Meeting recap · Draft/.test(head) && /From Intro call · Testwell/.test(head) && /1 thing marked TO CONFIRM/.test(head), head.slice(0, 300));
    check('The recap reads as sections, lists and bold', await page.locator('#v148Doc h3').count() === 6 && await page.locator('#v148Doc ol li').count() === 1 && await page.locator('#v148Doc strong').count() === 1 && await page.locator('#v148Doc .v132-fill').count() === 1);
    await page.click('#v148R button:has-text("Mark ready for the client")'); await wait(page, 500);
    check('Mark ready asks again while something is still TO CONFIRM', /still marked TO CONFIRM\. Click again/.test(await txt(page, '#v148RMsg')) && (store.db.agent_outputs.find((o) => o.id === DL).data.status === 'draft'));
    await page.click('#v148R button:has-text("Edit")'); await wait(page, 300);
    const md = await page.inputValue('#v148Ed');
    await page.fill('#v148Ed', md.replace('[TO CONFIRM: who signs off the pilot]', 'Robin signs off the pilot.'));
    await page.click('#v148Save'); await wait(page, 1200);
    const o = store.db.agent_outputs.find((x) => x.id === DL);
    check('Edit saves the words, marks it edited and keeps the agent\'s version once', /Robin signs off the pilot\./.test(o.content_md) && o.edited_by_human === true && o.snapshot && /TO CONFIRM/.test(o.snapshot.content_md) && o.data.edited && o.data.edited.by === ME && o.data.kind === 'recap', JSON.stringify({ e: o.edited_by_human, s: !!o.snapshot, d: o.data.edited }));
    check('…and the warning goes', !/TO CONFIRM/.test(await txt(page, '#v148R .nw-m-body')));
    await page.click('#v148R button:has-text("Mark ready for the client")'); await wait(page, 1200);
    check('Mark ready saves it for the team', o.data.status === 'ready' && o.data.ready && o.data.ready.by === ME && /Ready for the client/.test(await txt(page, '#v148R .nw-kicker')));
    check('The list says Ready for the client', /Ready for the client/.test(await txt(page, '.v148-row')));
    await page.click('#v148R button:has-text("Copy")'); await wait(page, 400);
    const copied = await page.evaluate(() => V148.copied || '');
    check('Copy gives plain text, without the markdown marks', /^Meeting recap and next steps · Testwell Partners\n\nSummary/.test(copied) && /Reports take two days each month/.test(copied) && !/[#*]/.test(copied), copied.slice(0, 120));
    await page.evaluate(() => { V148.printer = function (w) { window.__printed = w.document.body.innerText; }; });
    await page.click('#v148R button:has-text("Save as PDF")'); await wait(page, 800);
    const printed = await page.evaluate(() => window.__printed || '');
    check('Save as PDF prints the recap on its own, the edited version', /Meeting recap and next steps · Testwell Partners/.test(printed) && /Robin signs off the pilot\./.test(printed) && !/Mark ready/.test(printed), printed.slice(0, 160));
    await page.click('#v148R button:has-text("Back to draft")'); await wait(page, 1000);
    check('Back to draft', o.data.status === 'draft');
    await ctx.close();
  }

  // 7. On a phone
  if (want('phone')) {
    const { ctx, page } = await open({ width: 390, more: (t) => { t.agent_outputs.push(dlRow()); } });
    await make(page);
    await page.selectOption('#v148Lead', L2); await wait(page, 300);
    check('On a phone the dialog fits: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.click('#v148M button[aria-label="Close"]'); await wait(page, 300);
    await page.click('.v148-row button:has-text("Open")'); await page.waitForSelector('#v148R', { timeout: 8000 }); await wait(page, 300);
    check('…and so does the recap', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
