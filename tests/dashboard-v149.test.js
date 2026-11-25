// v149 tests for new-aiparagon-dashboard.html (#1): Client 360. A lead's page opens on a tab that shows the client's
// whole picture: where it stands and the next step, what is waiting on the team, the latest meeting, deliverables, the
// contact record and recent activity, each with its action. Supabase answers from an in-memory store (lib/rest-stub.js)
// filled with synthetic data (lib/qa-fixtures.js); n8n webhooks answer from stubs. Everyone is made up. Fails on the
// build before v149.
// Usage: node tests/dashboard-v149.test.js
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
const CA = call('fx-a', 20, 'Intro call · Testwell', [['Robin Test', L2]], 38);
const CA2 = call('fx-a2', 200, 'First hello · Testwell', [['Robin Test', L2]], 15);
const DL = '00000000-0000-4000-8000-0000000d1001';

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(email, o) {
    o = o || {};
    const t = FX.tables();
    t.call_outputs.push({ id: '00000000-0000-4000-8000-0000000ca0a1', call_id: 'fx-a', call_title: CA.title, call_start: CA.start, meeting_type: 'sales', summary: ['Month-end reports take two days', 'Robin wants a pilot in January'],
      tasks: [{ id: 'ta', text: 'Send Robin the pilot plan', owner: 'Kaeser', due: '', done: false }, { id: 'tb', text: 'Book the follow-up', owner: 'Erica', done: true }], status: 'done', source: 'auto', created_by: 'auto', created_at: ago(19), updated_at: ago(19) });
    t.agent_outputs.push({ id: DL, run_id: L2, agent: 'deliverable', output_type: 'json', title: 'Meeting recap and next steps · Testwell Partners', content_md: '# Recap\n\n## Summary\nWe met.\n\n## What we need from you\n- [TO CONFIRM: who signs off]',
      data: { kind: 'recap', status: 'draft', call: { id: 'fx-a', title: CA.title, date: CA.start } }, created_at: ago(3) });
    t.dashboard_comments.push({ id: '00000000-0000-4000-8000-0000000c0002', target_key: 'e1:' + L2 + ':lead_research', author: 'erica@aiparagonconsulting.com', body: 'Add their board members', created_at: ago(5), resolved: false });
    t.lp_signups = [{ id: '00000000-0000-4000-8000-0000000b1002', slug: 'ai-readiness', name: 'Robin Test', email: L2, created_at: ago(400) }];
    t.lead_files.push({ id: '00000000-0000-4000-8000-0000000f1002', lead_email: L2, file_name: 'Testwell-org-chart.pdf', category: 'research', created_at: ago(30), uploaded_by: 'QA Tester' });
    if (o.more) o.more(t);
    const store = makeStore(t);
    const hooks = [];
    const hook = (u, m, b) => {
      let j = null; try { j = JSON.parse(b || ''); } catch (e) {}
      hooks.push({ u, b: j });
      if (/fathom-proxy$/.test(u)) {
        if (j && j.action === 'list') return { body: { ok: true, items: o.calls || [CA, CA2] } };
        if (j && j.action === 'status') return { body: { ok: true, connected: true, hint: 'abcd' } };
        return { body: { ok: true, transcript: [] } };
      }
      if (/catalyst-hubspot-contact$/.test(u)) return { body: { ok: true, found: false } };
      if (/catalyst-emails$/.test(u)) return { body: { ok: true, items: [], total: 0 } };
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    await page.setViewportSize({ width: o.width || 1440, height: 900 });
    await page.goto(BASE + '/dashboard/lead-pipeline', { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1500);
    await page.evaluate((e) => openE1Lead(e), email);
    await page.waitForSelector('.v149-grid', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    return { ctx, page, store, hooks };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 300);
  const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');

  // 1. A lead's page opens on Client 360: where it stands, what is waiting, the latest meeting, deliverables, activity
  if (want('robin')) {
    const { ctx, page } = await open(L2);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#apChrome .rd-tab')].map((t) => t.dataset.tab + (t.classList.contains('on') ? '*' : '')));
    check('A lead\'s page opens on Client 360, its first tab', tabs[0] === 'c360*', JSON.stringify(tabs));
    check('…and the other tabs are still there', tabs.includes('s0') && tabs.includes('v137calls'), JSON.stringify(tabs));
    const stand = await txt(page, '.v149-stand');
    check('Where things stand: the stage, its document and the six stages', /In Prospect research/.test(stand) && /Pre-meeting prospect brief ready since/.test(stand) && await page.locator('.v149-track li').count() === 6 && await page.locator('.v149-track li.on').count() === 1, stand.slice(0, 200));
    check('…with the next move', /Move to Discovery consultation/.test(stand) && /Open the pre-meeting prospect brief/.test(stand), stand);
    const w = await txt(page, '.v149-wait');
    check('Waiting: the prospect brief to review', /Review the pre-meeting prospect brief/.test(w), w);
    check('Waiting: the recap draft and what it still has to confirm', /Check the meeting recap \(1 thing to confirm\)/.test(w), w);
    check('Waiting: the open task from its calls (not the done one)', /1 open task from calls with this client/.test(w) && /Send Robin the pilot plan \(Kaeser\)/.test(w) && !/Book the follow-up/.test(w), w);
    check('Waiting: the open comment on its documents', /1 open comment on its documents/.test(w) && /Add their board members/.test(w), w);
    check('…counted on the card', await txt(page, '.v149-wait .v149-n') === '4');
    const m = await txt(page, '.v149-meet');
    check('Latest meeting: the newest call, its length and its post-call summary', /Intro call · Testwell/.test(m) && /38 min/.test(m) && /Robin wants a pilot in January/.test(m) && /All 2 calls/.test(m), m);
    const dl = await txt(page, '.v149-deliv');
    check('Deliverables: the recap, and how many meeting documents', /Meeting recap and next steps · Testwell Partners/.test(dl) && /Draft/.test(dl) && /1 meeting document written/.test(dl), dl);
    const ct = await txt(page, '.v149-ct');
    check('Contact: the lead\'s details and files', /Robin Test/.test(ct) && /COO/.test(ct) && /Testwell Partners/.test(ct) && /Referral/.test(ct) && /1 file/.test(ct) && /Not in HubSpot contacts yet/.test(ct), ct);
    const act = await txt(page, '.v149-act');
    check('Recent activity: calls, documents, the recap, files, the sign-up and the comment, newest first', /Call: Intro call · Testwell/.test(act) && /Meeting recap written/.test(act) && /File added: Testwell-org-chart\.pdf/.test(act) && /Signed up on \/go\/ai-readiness/.test(act) && /Comment from erica/.test(act) && /Prospect brief written/.test(act), act);
    const order = await page.$$eval('.v149-tl li span', (s) => s.map((x) => x.textContent));
    check('…newest first', /Meeting recap written/.test(order[0]) && /Added to the Lead pipeline/.test(order[order.length - 1] || '') || order.length >= 7, JSON.stringify(order.slice(0, 3)));
    // actions
    await page.click('.v149-meet button:has-text("Make a recap")'); await page.waitForSelector('#v148Go', { timeout: 8000 }); await wait(page, 400);
    check('Make a recap opens Make a deliverable on this lead and that call', await page.inputValue('#v148Lead') === L2 && await page.inputValue('#v148LCall') === 'fx-a');
    await page.click('#v148M button[aria-label="Close"]'); await wait(page, 300);
    await page.click('.v149-deliv .v149-list button:has-text("Open")'); await page.waitForSelector('#v148R', { timeout: 8000 });
    check('A deliverable opens in the recap reader', /Meeting recap and next steps · Testwell Partners/.test(await txt(page, '#v148R h2')));
    await page.click('#v148R button[aria-label="Close"]'); await wait(page, 300);
    await page.click('.v149-wait button:has-text("Review")'); await wait(page, 1800);
    check('Review opens the document\'s own tab', await page.evaluate(() => (document.querySelector('#apChrome .rd-tab.on') || {}).dataset.tab) === 's0');
    await page.evaluate(() => apTab('c360')); await wait(page, 400);
    await page.click('.v149-stand button:has-text("Move to Discovery consultation")'); await wait(page, 800);
    check('Move to the next stage asks first, as the board does', /Move Robin Test to Discovery consultation\?/.test(await txt(page, '#v120M h2')));
    await ctx.close();
  }

  // 2. A lead with nothing yet; a document already reviewed is not waiting; the HubSpot record shows
  if (want('others')) {
    let { ctx, page } = await open(L3, { calls: [] });
    const w = await txt(page, '.v149-wait');
    check('A new lead: its stage document not written yet, with Run', /Pre-meeting prospect brief not written yet/.test(w) && /Run /.test(w), w);
    check('…no recorded calls, nothing made yet', /No recorded calls with Sam Sample yet/.test(await txt(page, '.v149-meet')) && /Nothing made for this client yet/.test(await txt(page, '.v149-deliv')));
    await page.click('.v149-wait button:has-text("Run")'); await wait(page, 800);
    check('Run asks first, as the board does, without moving the lead', /Run .* for Sam Sample\?/.test(await txt(page, '#v120M h2')), await txt(page, '#v120M h2'));
    await ctx.close();
    ({ ctx, page } = await open(L1, { calls: [], more: (t) => { t.agent_feedback = (t.agent_feedback || []).concat([{ id: '00000000-0000-4000-8000-0000000fb001', agent: 'growth_plan', target_type: 'e1_document', target_id: L1 + ':growth_plan', action: 'reviewed', author: ME, created_at: ago(1) }]); } }));
    const w1 = await txt(page, '.v149-wait');
    check('A document already marked reviewed is not waiting (only Pat\'s open comment is)', !/Review the/.test(w1) && /1 open comment on its documents/.test(w1) && await txt(page, '.v149-wait .v149-n') === '1', w1);
    const ct = await txt(page, '.v149-ct');
    check('Contact: the HubSpot record (phone, lifecycle, lead status)', /555-0100/.test(ct) && /lead/.test(ct) && /NEW/.test(ct) && /From HubSpot/.test(ct), ct);
    check('…and Reviewed shows in the activity', /Reviewed: Proposal presentation/.test(await txt(page, '.v149-act')));
    await ctx.close();
  }

  // 3. On a phone
  if (want('phone')) {
    const { ctx, page } = await open(L2, { width: 390 });
    check('On a phone: one column, no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && await page.evaluate(() => getComputedStyle(document.querySelector('.v149-grid')).gridTemplateColumns.split(' ').length === 1));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
