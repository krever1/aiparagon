// v145 tests for new-aiparagon-dashboard.html (#1), Erica's notes of Nov 24, release 3: Meeting Types and Client Stages
// the team can change, each with a setup; the client workspace on a lead's page; the Intel Tracker's replies.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js); Fathom and
// n8n answer from stand-ins. Everyone is made up (example domains).
// Usage: node tests/dashboard-v145.test.js   (ONLY=stages,workspace,replies runs some sections)
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
const L1 = FX.L1, L2 = FX.L2;
const ME = 'qa@aiparagonconsulting.com';
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(addr, o) {
    o = o || {};
    const t = FX.tables();
    if (o.more) o.more(t);
    const store = makeStore(t);
    const hooks = [];
    const hook = (u, m, b) => {
      let j = null; try { j = JSON.parse(b || ''); } catch (e) {}
      const p = u.replace(/^https:\/\/n8n\.aiparagonconsulting\.com\/webhook\//, '');
      hooks.push({ p, b: j });
      if (/fathom-proxy$/.test(u)) {
        if (j && j.action === 'list') return { body: { ok: true, items: o.calls || [] } };
        if (j && j.action === 'status') return { body: { ok: true, connected: true, hint: 'abcd' } };
        return { body: { ok: true, transcript: [] } };
      }
      if (o.hook) { const r = o.hook(p, j); if (r) return r; }
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    const storage = [];
    await ctx.route('**/storage/v1/**', (route) => {
      const r = route.request();
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      storage.push({ method: r.method(), at: r.url().split('/storage/v1/object/')[1] || '', body: r.postData() || '' });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"Key":"x"}' });
    });
    page.on('dialog', (d) => d.accept());
    await page.setViewportSize({ width: o.width || 1440, height: 900 });
    await page.goto(BASE + addr, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(o.wait || 1800);
    return { ctx, page, store, hooks, storage };
  }
  const setting = (store, k) => (store.db.ai_settings.find((r) => r.key === k) || {}).value;
  const obj = (v) => (typeof v === 'string' ? JSON.parse(v) : v) || {};

  // 1. Meeting Types and Client Stages
  if (want('stages')) {
    let { ctx, page, store, hooks } = await open('/dashboard/lead-pipeline');
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#apChrome .rd-tab')].map((t) => t.textContent.trim()));
    check('Lead pipeline: the board tab is Client Stages', tabs.some((t) => /^Client Stages/.test(t)) && !tabs.some((t) => /^Board/.test(t)), JSON.stringify(tabs));
    const heads = await page.locator('.v120-col-h .v145-colb').count();
    check('Each column\'s name opens its setup', heads === 6);
    check('Rename stages is now Edit stages', /Edit stages/.test(await page.textContent('.v136-rn')));
    // add a stage
    await page.click('.v136-rn'); await page.waitForTimeout(700);
    check('Client stages lists the six in order', await page.locator('#v145Sl .v145-sr').count() === 6);
    await page.fill('#v145NewS', 'Prospect research'); await page.click('#v145S button:has-text("Add stage")');
    check('A name already there is refused with why', /already a stage called/.test(await page.textContent('#v145Msg')));
    await page.fill('#v145NewS', 'Strategy session'); await page.click('#v145S button:has-text("Add stage")'); await page.waitForTimeout(150);
    // move it up above Onboarding (it lands last, after Client review)
    await page.locator('#v145Sl .v145-sr.is-new button[aria-label="Move up"]').click();
    await page.locator('#v145Sl .v145-sr.is-new button[aria-label="Move up"]').click();
    await page.click('#v145Go'); await page.waitForTimeout(1500);
    const cs = obj(setting(store, 'catalyst_client_stages'));
    const newKey = (cs.order || []).find((k) => /^cs-/.test(k));
    check('Saved for the team, in the order set', newKey && cs.order.indexOf(newKey) === 4 && cs.items[newKey].name === 'Strategy session', JSON.stringify(cs.order));
    const cols = await page.evaluate(() => [...document.querySelectorAll('.v120-col')].map((c) => c.dataset.s));
    check('The board shows the new column in its place', cols[4] === newKey && cols.length === 7, JSON.stringify(cols));
    await ctx.close();

    // a meeting type of the team's own, on the Overview
    ({ ctx, page, store, hooks } = await open('/dashboard/engine-1', { more: (t) => {
      t.ai_settings.push({ key: 'catalyst_client_stages', value: { order: ['research', 'consultation', 'assessment', 'proposal', 'cs-strat1', 'onboarding', 'review'], items: { 'cs-strat1': { name: 'Strategy session', type: '', c: '#3F7F9F' } } }, updated_at: ago(2) });
      t.guide_files = (t.guide_files || []).concat([{ id: 'gf-1', file_name: 'Our engagement playbook.md', file_text: 'We run strategy sessions in 60 minutes: goals, constraints, a roadmap.', in_kb: true, created_at: ago(30) }]);
    } }));
    const ov = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('#apChrome .rd-tab')].map((t) => t.textContent.trim()), h: (document.querySelector('#main section[data-tp="agents"] h2') || {}).textContent, n: document.querySelectorAll('.v145-mt').length }));
    check('Overview: the Stages tab is Meeting Types, listing the six', ov.tabs.some((t) => /^Meeting Types/.test(t)) && /Meeting types/.test(ov.h || '') && ov.n === 6, JSON.stringify(ov));
    await page.evaluate(() => apTab && apTab('agents')); await page.waitForTimeout(300);
    await page.click('.v145-new'); await page.waitForTimeout(900);
    await page.fill('#v145TName', 'Strategy session');
    await page.click('#v145TGo'); await page.waitForTimeout(200);
    check('A new meeting type needs what it writes', /Say what it writes/.test(await page.textContent('#v145TMsg')));
    await page.fill('#v145TDoc', 'Strategy session brief');
    await page.fill('#v145TDesc', 'Agree the roadmap for the next quarter.');
    await page.fill('#v145TSecs', 'Goals for the quarter\nConstraints\n- The roadmap\nQuestions to ask');
    await page.fill('#v145TKb', 'Keep it to three priorities.');
    await page.check('#v145T .v145-kbf input[value="gf-1"]');
    await page.uncheck('#v145TCrm');
    await page.click('#v145TGo'); await page.waitForTimeout(1500);
    const mt = obj(setting(store, 'catalyst_meeting_types'));
    const mtKey = Object.keys(mt.items || {}).find((k) => /^mt-/.test(k));
    const m1 = mtKey && mt.items[mtKey];
    check('Saved for the team: what it writes, its sections, its knowledge base', m1 && m1.doc === 'Strategy session brief' && m1.sections.join('|') === 'Goals for the quarter|Constraints|The roadmap|Questions to ask' && m1.kb === 'Keep it to three priorities.' && m1.kbFiles.join() === 'gf-1', JSON.stringify(m1));
    const su = obj(setting(store, 'catalyst_stage_setup'));
    check('What it reads is kept with it (no CRM record)', su[mtKey] && su[mtKey].crm === false && su[mtKey].calls === true, JSON.stringify(su[mtKey]));
    check('It shows on the Overview, marked yours', await page.locator('.v145-mt', { hasText: 'Strategy session brief' }).count() === 1);
    // a built-in: rename it, and it cannot be deleted, only hidden
    await page.click('.v145-mt[data-mt="review"]'); await page.waitForTimeout(800);
    check('A built-in meeting type can be hidden, not deleted', await page.locator('#v145T button:has-text("Hide it")').count() === 1 && await page.locator('#v145T .v145-del').count() === 0);
    await page.fill('#v145TName', 'Quarterly review'); await page.click('#v145TGo'); await page.waitForTimeout(1300);
    check('Renaming a built-in renames its stage for the team (catalyst_stages)', obj(setting(store, 'catalyst_stages')).review.name === 'Quarterly review', JSON.stringify(setting(store, 'catalyst_stages')));
    await ctx.close();

    // the stage's setup, then a run
    const seed = (t) => {
      t.ai_settings.push({ key: 'catalyst_client_stages', value: { order: ['research', 'consultation', 'assessment', 'proposal', 'cs-strat1', 'onboarding', 'review'], items: { 'cs-strat1': { name: 'Strategy session', type: '', c: '#3F7F9F' } } }, updated_at: ago(2) });
      t.ai_settings.push({ key: 'catalyst_meeting_types', value: { order: ['mt-strat1'], items: { 'mt-strat1': { name: 'Strategy session', doc: 'Strategy session brief', desc: 'Agree the roadmap.', sections: ['Goals for the quarter', 'Constraints', 'The roadmap'], kb: 'Keep it to three priorities.', kbFiles: ['gf-1'] } } }, updated_at: ago(2) });
      t.guide_files = (t.guide_files || []).concat([{ id: 'gf-1', file_name: 'Our engagement playbook.md', file_text: 'We run strategy sessions in 60 minutes: goals, constraints, a roadmap.', in_kb: true, created_at: ago(30) }]);
    };
    ({ ctx, page, store, hooks } = await open('/dashboard/lead-pipeline', { more: seed }));
    check('A stage that runs nothing has no Run button on its cards', await page.locator('.v120-col[data-s="cs-strat1"] .v120-next').count() === 0);
    await page.click('.v120-col[data-s="cs-strat1"] .v145-colb'); await page.waitForTimeout(900);
    await page.selectOption('#v145PType', 'mt-strat1');
    await page.fill('#v145PIn', 'The signed proposal, the kickoff date');
    await page.fill('#v145PBefore', 'Book a 60 minute slot with the partners');
    await page.fill('#v145PAfter', 'Send the roadmap within two days');
    await page.fill('#v145PDel', 'Roadmap deck\nSigned SOW');
    await page.fill('#v145PTask', '- Send the agenda\n- Share the playbook');
    await page.click('#v145PGo'); await page.waitForTimeout(1500);
    const it = obj(setting(store, 'catalyst_client_stages')).items['cs-strat1'];
    check('The stage setup is saved for the team (type, inputs, before, after, deliverables, tasks)', it.type === 'mt-strat1' && it.inputs && it.before && it.after && it.deliverables.join('|') === 'Roadmap deck|Signed SOW' && it.tasks.join('|') === 'Send the agenda|Share the playbook', JSON.stringify(it));
    await page.waitForTimeout(500);
    check('Its cards now say what it runs', await page.evaluate(() => v136St('cs-strat1').doc === 'Strategy session brief' && v136St('cs-strat1').agent === 'meeting_prep'));
    // move Pat QA (who has documents) into it and run it
    await page.evaluate((e) => v136Ask(e, 'cs-strat1', true), L1); await page.waitForTimeout(1200);
    const ask = await page.evaluate(() => (document.querySelector('#v120M .v145-ask') || {}).innerText || '');
    check('The move question says what to have ready, before, the deliverables and tasks', /Have these ready/.test(ask) && /signed proposal/.test(ask) && /Roadmap deck/.test(ask) && /Send the agenda/.test(ask), ask);
    await page.fill('#v120Note', 'The partners want a 90-day plan.');
    await page.click('#v120Go'); await page.waitForTimeout(2500);
    const run = hooks.filter((h) => h.p === 'catalyst-meeting-prep').pop();
    const b = (run && run.b) || {};
    check('It runs through Meeting Prep, under the stage, with its sections and purpose', b.stage === 'cs-strat1' && b.docName === 'Strategy session brief' && (b.sections || []).join('|') === 'Goals for the quarter|Constraints|The roadmap' && /roadmap/i.test(b.purpose || ''), JSON.stringify(b).slice(0, 400));
    check('Its knowledge base context and file go with the notes', /KNOWLEDGE BASE CONTEXT/.test(b.transcript || '') && /three priorities/.test(b.transcript) && /60 minutes/.test(b.transcript) && /90-day plan/.test(b.transcript), (b.transcript || '').slice(0, 300));
    const lead = store.db.e1_leads.find((r) => r.email === L1);
    check('The lead moved to the stage', lead.stage === 'cs-strat1', lead.stage);
    // the lead's page: this stage's checklist, and the prep tab for its document
    await page.evaluate((e) => openE1Lead(e), L1); await page.waitForTimeout(2600);
    const sec = await page.evaluate(() => (document.querySelector('#main section[data-v145="stage"]') || {}).innerText || '');
    check('A lead\'s page shows this stage: what to have, before, after, deliverables and tasks', /This stage: Strategy session/.test(sec) && /Roadmap deck/.test(sec) && /Send the agenda/.test(sec) && /Send the roadmap within two days/.test(sec), sec.slice(0, 300));
    await page.locator('#main section[data-v145] .v145-cl input').first().check(); await page.waitForTimeout(1200);
    const ticks = obj(setting(store, 'catalyst_stage_ticks'));
    check('A tick is kept for the team', ticks[L1] && ticks[L1]['cs-strat1'] && ticks[L1]['cs-strat1']['d:0'] === true, JSON.stringify(ticks));
    const tabs2 = await page.evaluate(() => [...document.querySelectorAll('#apChrome .rd-tab')].map((t) => t.textContent.trim()));
    check('The lead\'s page has a tab for the stage\'s document', tabs2.some((t) => /Strategy session brief/.test(t)), JSON.stringify(tabs2));
    await ctx.close();

    // delete a stage that has a lead: it asks where they go
    ({ ctx, page, store } = await open('/dashboard/lead-pipeline', { more: (t) => { seed(t); t.e1_leads.find((r) => r.email === L2).stage = 'cs-strat1'; } }));
    await page.click('.v136-rn'); await page.waitForTimeout(800);
    await page.click('#v145Sl .v145-sr[data-k="cs-strat1"] .v145-del'); await page.waitForTimeout(400);
    check('Deleting a stage with leads asks where they go', /1 lead is in Strategy session/.test(await page.textContent('#v145D')));
    await page.selectOption('#v145To', 'proposal'); await page.click('#v145DGo'); await page.waitForTimeout(1800);
    check('Its lead moves, and the stage is gone', store.db.e1_leads.find((r) => r.email === L2).stage === 'proposal' && obj(setting(store, 'catalyst_client_stages')).items['cs-strat1'].deleted === true && await page.locator('.v120-col[data-s="cs-strat1"]').count() === 0);
    // remove a built-in, then bring it back
    await page.waitForTimeout(400);
    await page.click('#v145Sl .v145-sr[data-k="review"] .v145-del'); await page.waitForTimeout(400);
    await page.click('#v145DGo'); await page.waitForTimeout(1800);
    check('A built-in stage can be removed', (obj(setting(store, 'catalyst_client_stages')).removed || []).includes('review') && await page.locator('.v120-col[data-s="review"]').count() === 0);
    await page.click('#v145S .v145-gone summary'); await page.click('#v145S .v145-gone button:has-text("Bring back")'); await page.waitForTimeout(1800);
    check('…and brought back', !(obj(setting(store, 'catalyst_client_stages')).removed || []).includes('review') && await page.locator('.v120-col[data-s="review"]').count() === 1);
    await page.evaluate(() => nwModalClose());
    // a phone
    await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(300);
    await page.evaluate(() => v145StageOpen('proposal')); await page.waitForTimeout(800);
    const ph = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, w: Math.round(document.getElementById('v145P').getBoundingClientRect().width) }));
    check('A stage\'s setup on a phone: fits, no sideways scroll', !ph.over && ph.w <= 390, JSON.stringify(ph));
    await ctx.close();
  }

  // 2. The client workspace on a lead's page
  if (want('workspace')) {
    let { ctx, page, store, hooks, storage } = await open('/dashboard/lead-pipeline');
    await page.evaluate((e) => openE1Lead(e), L1); await page.waitForTimeout(2600);
    const filesTab = async () => { const t = page.locator('#apChrome .rd-tab', { hasText: /^Files/ }); if (await t.count()) { await t.first().click(); await page.waitForTimeout(300); } };
    await filesTab();
    const ws = await page.evaluate(() => {
      const box = document.querySelector('#main .v145-ws'); if (!box) return null;
      return { tabs: [...box.querySelectorAll('.v145-wtabs button')].map((b) => b.textContent.trim()), folders: [...box.querySelectorAll('.v145-wsn .v145-wf span')].map((s) => s.childNodes[0].textContent.trim()),
        cur: (box.querySelector('.v145-wcard.is-cur b') || {}).textContent, rows: [...box.querySelectorAll('.v145-wr')].map((r) => r.querySelector('b').textContent), fmts: [...box.querySelectorAll('.v145-wr')].map((r) => [...r.querySelectorAll('.v145-fmt')].map((x) => x.textContent).join('+')) };
    });
    check('A lead\'s Files tab is the workspace: Files and Calls, All content, Starred, To organize and a folder per client stage', ws && /^Files/.test(ws.tabs[0]) && /^Calls/.test(ws.tabs[1]) && ws.folders.slice(0, 3).join() === 'All content,Starred,To organize' && ws.folders.includes('Prospect research') && ws.folders.includes('Client review'), JSON.stringify(ws));
    check('The stage folder cards mark the lead\'s current stage', ws && ws.cur === 'Proposal', ws && ws.cur);
    check('Each stage document is one row, its formats together; uploads show with their type', ws && ws.rows.includes('Pre-meeting prospect brief') && ws.rows.includes('QA-Form-ADV.pdf') && ws.fmts.some((f) => /PDF/.test(f)), JSON.stringify(ws && { rows: ws.rows, fmts: ws.fmts }));
    await page.click('#main .v145-wsn .v145-wf:has-text("Prospect research")'); await page.waitForTimeout(200);
    const inF = await page.$$eval('#main .v145-wr b', (b) => b.map((x) => x.textContent));
    check('A folder shows its own: the prospect brief and the upload filed with it', inF.includes('Pre-meeting prospect brief') && inF.includes('QA-Form-ADV.pdf') && !inF.includes('Assessment report'), JSON.stringify(inF));
    await page.click('#main .v145-wsn .v145-wf:has-text("All content")');
    await page.fill('#main .v145-wq input', 'ADV'); await page.waitForTimeout(200);
    check('Search narrows the list', (await page.$$eval('#main .v145-wr b', (b) => b.map((x) => x.textContent))).join() === 'QA-Form-ADV.pdf');
    await page.fill('#main .v145-wq input', ''); await page.waitForTimeout(150);
    await page.click('#main .v145-wr:has-text("QA-Form-ADV.pdf") .v145-star'); await page.waitForTimeout(900);
    const meta = () => obj(setting(store, 'catalyst_ws'))[L1] || {};
    const fid = '00000000-0000-4000-8000-0000000f1001';
    check('Star is kept for the team', (meta().items || {})['f:' + fid] && meta().items['f:' + fid].star === true, JSON.stringify(meta()));
    // a folder of the team's own, then a file moved into it with a description
    await page.click('#main .v145-wsh button:has-text("New folder")'); await page.waitForTimeout(400);
    await page.fill('#v145WFName', 'Contracts'); await page.click('#v145WF button:has-text("Add folder")'); await page.waitForTimeout(900);
    check('New folder is kept for the team and opens', (meta().folders || []).some((f) => f.name === 'Contracts') && await page.locator('#main .v145-wf.on:has-text("Contracts")').count() === 1, JSON.stringify(meta().folders));
    await page.click('#main .v145-wsn .v145-wf:has-text("All content")');
    await page.click('#main .v145-wr:has-text("QA-Form-ADV.pdf") button[aria-label^="Edit"]'); await page.waitForTimeout(400);
    const cf = (meta().folders || []).find((f) => f.name === 'Contracts').id;
    await page.selectOption('#v145WEFold', cf); await page.fill('#v145WEName', 'Form ADV (2026)'); await page.fill('#v145WEDesc', 'The firm\'s latest filing.');
    await page.click('#v145WE button:has-text("Save")'); await page.waitForTimeout(900);
    const it = meta().items['f:' + fid];
    check('Edit names it, files it and describes it', it.folder === cf && it.name === 'Form ADV (2026)' && /latest filing/.test(it.desc), JSON.stringify(it));
    check('The row shows the new name and its folder', /Form ADV \(2026\)/.test(await page.textContent('#main .v145-ws')) && await page.locator('#main .v145-wr:has-text("Form ADV (2026)") .v145-fchip:has-text("Contracts")').count() === 1);
    // a transcript pasted in, as a source
    await page.click('#main .v145-wsh button:has-text("Upload file")'); await page.waitForTimeout(400);
    await page.check('#v145WU input[value="text"]');
    await page.fill('#v145WUName', 'Partner call, Nov 20');
    await page.click('#v145WUGo'); await page.waitForTimeout(200);
    check('A transcript needs some text first', /Paste the transcript first/.test(await page.textContent('#v145WUMsg')));
    await page.fill('#v145WUText', 'Pat: We lose two days a month on reporting. Our main goal is a 90-day pilot with the ops team.');
    await page.selectOption('#v145WUFold', 'assessment'); await page.fill('#v145WUDesc', 'Notes from the partner call.');
    await page.click('#v145WUGo'); await page.waitForTimeout(2600);
    const row = store.db.lead_files.find((r) => /Partner_call/.test(r.file_path || ''));
    check('Uploaded to the lead\'s files in Storage, and its row saved as a transcript with its text', storage.some((x) => x.method === 'POST' && x.at.indexOf('lead-files/' + L1 + '/') === 0) && row && row.category === 'transcript' && /two days a month/.test(row.file_text || ''), JSON.stringify(row));
    const tm = row && meta().items['f:' + row.id];
    check('Kept with its name, folder, description, as a source', tm && tm.name === 'Partner call, Nov 20' && tm.folder === 'assessment' && tm.source === true, JSON.stringify(tm));
    await filesTab(); await page.click('#main .v145-wtabs button:has-text("Calls")'); await page.waitForTimeout(400);
    check('It shows under Calls, as uploaded, in its folder', /Partner call, Nov 20/.test(await page.textContent('#main .v145-wl')) && /Uploaded/.test(await page.textContent('#main .v145-wl')));
    // a stage run reads it
    await page.evaluate((e) => v136Ask(e, 'assessment', false), L1); await page.waitForTimeout(2200);
    check('The run question lists it among what the stage reads', /From the client workspace: Partner call, Nov 20/.test(await page.textContent('#v120M')));
    await page.click('#v120Go'); await page.waitForTimeout(2500);
    const sent = hooks.filter((h) => /e1-custom-run|catalyst-meeting-prep/.test(h.p)).pop();
    check('The run sends it in the notes, after what the team typed', sent && /FILES AND TRANSCRIPTS ADDED TO THE CLIENT WORKSPACE/.test(JSON.stringify(sent.b)) && /two days a month/.test(JSON.stringify(sent.b)), sent && JSON.stringify(sent.b).slice(0, 300));
    // a phone
    await page.evaluate((e) => openE1Lead(e), L1); await page.waitForTimeout(2200); await filesTab();
    await page.setViewportSize({ width: 390, height: 820 }); await page.waitForTimeout(400);
    const ph = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1 }));
    check('The workspace on a phone: no sideways scroll', !ph.over, JSON.stringify(ph));
    await ctx.close();
  }

  // 3. The Intel Tracker's replies: why a post, who each account is, whether it gets replies, LinkedIn connections
  if (want('replies')) {
    const D1 = '00000000-0000-4000-8000-00000000d001', D2 = '00000000-0000-4000-8000-00000000d002', NW = '00000000-0000-4000-8000-0000000000e1';
    let { ctx, page, store } = await open('/dashboard/approvals', { more: (t) => {
      const d = t.engagement_drafts.find((r) => r.id === D1); d.why = { found: 'followed', account: 'Northwind Advisory', relation: 'connection', value: 'high', engagement: 410, top: true };
      t.competitors.find((c) => c.id === NW).relation = 'connection';
    } });
    await page.evaluate((id) => nwReplyOpen(id), D1); await page.waitForTimeout(1200);
    const w1 = await page.evaluate(() => (document.querySelector('#nwReplyM .v145-why') || {}).innerText || '');
    check('The reply window says why: an account you follow, a connection, its value and engagement', /Why this post/.test(w1) && /From an account you follow, one of your LinkedIn connections/.test(w1) && /Rated high value/.test(w1) && /410 reactions/.test(w1), w1);
    check('…and how replies are picked', /10 most engaged or rated high value/.test(w1));
    await page.evaluate(() => nwModalClose());
    await page.evaluate((id) => nwReplyOpen(id), D2); await page.waitForTimeout(1200);
    const w2 = await page.evaluate(() => (document.querySelector('#nwReplyM .v145-why') || {}).innerText || '');
    check('A reply drafted before this round is explained from its post', /Why this post/.test(w2) && /Found by a|From an account/.test(w2) && !/Reading/.test(w2), w2);
    await ctx.close();
    // Following: who each account is, and replies on or off
    ({ ctx, page, store } = await open('/dashboard/intel-tracker'));
    await page.evaluate(() => apTab('follow')); await page.waitForTimeout(1800);
    const row = page.locator('.v96-fol-c li', { hasText: 'Northwind Advisory' }).first();
    check('Each account on Following says who they are and whether replies are drafted', await row.locator('.v145-folc select').count() === 1 && await row.locator('.v145-rep input').isChecked());
    await row.locator('.v145-folc select').selectOption('prospect'); await page.waitForTimeout(700);
    await row.locator('.v145-rep input').uncheck(); await page.waitForTimeout(900);
    const nw = store.db.competitors.find((c) => c.id === NW);
    check('Saved for the team: a prospect, no replies', nw.relation === 'prospect' && nw.draft_replies === false, JSON.stringify({ r: nw.relation, d: nw.draft_replies }));
    // Import LinkedIn connections
    const imp = page.locator('.v145-imp');
    check('People has Import LinkedIn connections', await imp.count() === 1);
    await imp.click(); await page.waitForTimeout(400);
    await page.setInputFiles('#v145IFile', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Company\nA,B\n') }); await page.waitForTimeout(400);
    check('A file that is not LinkedIn\'s connections export is turned away with why', /not LinkedIn.s Connections.csv/.test(await page.textContent('#v145IMsg')));
    const csv = 'Notes:\n"When exporting your connection data, you may notice that some of the email addresses are missing."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\n' +
      'Ava,Lindqvist,https://www.linkedin.com/in/ava-lindqvist-qa,,"Lindqvist & Co, LLC",Founder,01 Nov 2026\nBen,Okoro,https://www.linkedin.com/in/ben-okoro-qa,,Okoro Wealth,CEO,02 Nov 2026\n' +
      'Northwind,Advisory,https://www.linkedin.com/in/northwind-qa,,Northwind,Team,03 Nov 2026\nNo,Link,,,X,Y,04 Nov 2026\n';
    await page.setInputFiles('#v145IFile', { name: 'Connections.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await page.waitForTimeout(800);
    const li = await page.$$eval('#v145IList .v145-irow', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')));
    check('Its connections are listed (quoted commas read right, no-link rows left out), one followed already marked', li.length === 3 && li.some((x) => /Lindqvist & Co, LLC/.test(x)) && li.some((x) => /Northwind Advisory.*followed already/.test(x)), JSON.stringify(li));
    await page.fill('#v145IList input[type=search]', 'okoro'); await page.waitForTimeout(300);
    check('Search narrows them', await page.locator('#v145IList .v145-irow').count() === 1);
    await page.fill('#v145IList input[type=search]', ''); await page.waitForTimeout(300);
    await page.locator('#v145IList .v145-irow', { hasText: 'Ava Lindqvist' }).locator('label').first().locator('input').check();
    await page.locator('#v145IList .v145-irow', { hasText: 'Ben Okoro' }).locator('label').first().locator('input').check();
    await page.locator('#v145IList .v145-irow', { hasText: 'Ben Okoro' }).locator('.v145-rep input').uncheck();
    check('The button counts the picks', /Follow 2 people/.test(await page.textContent('#v145IGo')));
    await page.click('#v145IGo'); await page.waitForTimeout(1500);
    const ava = store.db.competitors.find((c) => c.name === 'Ava Lindqvist'), ben = store.db.competitors.find((c) => c.name === 'Ben Okoro');
    check('Saved as people followed for posts, connections, from LinkedIn, replies as picked', ava && ben && ava.handle_linkedin === 'https://www.linkedin.com/in/ava-lindqvist-qa' && ava.follow_for === 'posts' && ava.follow_kind === 'person' && ava.relation === 'connection' && ava.source === 'linkedin_import' && ava.draft_replies === true && ben.draft_replies === false && /Founder at Lindqvist/.test(ava.notes || ''), JSON.stringify([ava, ben]));
    check('They show under People', /Ava Lindqvist/.test(await page.textContent('.v96-fol')));
    await page.setViewportSize({ width: 390, height: 820 }); await page.waitForTimeout(400);
    check('Following on a phone: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
