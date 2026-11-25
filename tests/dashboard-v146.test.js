// v146 tests for new-aiparagon-dashboard.html (#1): the QA round after v145 (Meeting Types and Client Stages, the client
// workspace, the Intel Tracker's replies). Each check fails on the v145 build.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js); Fathom and
// n8n answer from stand-ins. Everyone is made up (example domains).
// Usage: node tests/dashboard-v146.test.js   (ONLY=stages,workspace,replies runs some sections)
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

  const call = (id, h, title, guests, mins) => ({ id, title, start: ago(h), end: new Date(Date.now() - h * 3600e3 + (mins || 40) * 60e3).toISOString(),
    share_url: 'https://fathom.video/share/' + id + 'abcdef', recorded_by: { name: 'QA Tester', email: ME },
    invitees: guests.map((g) => ({ name: g[0], email: g[1], external: true })).concat([{ name: 'QA Tester', email: ME, external: false }]) });
  const FID = '00000000-0000-4000-8000-0000000f1001';
  const toFiles = async (page, email) => {
    await page.evaluate((e) => openE1Lead(e), email); await page.waitForTimeout(3000);
    await page.locator('#apChrome .rd-tab', { hasText: /^Files/ }).first().click(); await page.waitForTimeout(600);
  };
  const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#main .v145-wl .v145-wr')].map((r) => ({ k: r.dataset.k, b: (r.querySelector('.v145-wm b') || {}).textContent, chip: (r.querySelector('.v145-fchip') || {}).textContent || '', src: !!r.querySelector('.v145-src'), t: r.innerText })));

  // 1. Client stages and meeting types
  if (want('stages')) {
    // an older save that removed Prospect research, and a lead in a stage that was deleted
    let { ctx, page, store } = await open('/dashboard/lead-pipeline', { more: (t) => {
      t.ai_settings.push({ key: 'catalyst_client_stages', value: { order: ['research', 'assessment', 'proposal', 'onboarding', 'review'], removed: ['research', 'consultation'], items: { 'cs-gone': { name: 'Gone', deleted: true } } }, updated_at: ago(2) });
      t.e1_leads.find((r) => r.email === FX.L3).stage = 'research';
      t.e1_leads.find((r) => r.email === L2).stage = 'cs-gone';
    } });
    const cols = await page.evaluate(() => [...document.querySelectorAll('.v120-col')].map((c) => c.dataset.s));
    check('Prospect research is always on the board, even after an older save removed it', cols[0] === 'research' && cols.length === 5, JSON.stringify(cols));
    const where = await page.evaluate((a) => a.map((e) => v136StageOf(v120Lead(e) || { email: e })), [FX.L3, L2]);
    check('A lead in Prospect research shows there, and one in a deleted stage sits in the first stage', where[0] === 'research' && where[1] === 'research', JSON.stringify(where));
    check('The research stage still answers for the HubSpot and new-client questions', await page.evaluate(() => !!v136St('research')));
    await page.click('.v136-rn'); await page.waitForTimeout(800);
    check('Edit stages: Prospect research has no delete, it says it is always kept', await page.locator('#v145Sl .v145-sr[data-k="research"] .v145-del').count() === 0 && /Always kept/.test(await page.textContent('#v145Sl .v145-sr[data-k="research"]')));
    // a change not saved yet stops a delete from losing it
    await page.fill('#v145Sl .v145-sr[data-k="assessment"] input', 'Findings review');
    await page.click('#v145Sl .v145-sr[data-k="onboarding"] .v145-del'); await page.waitForTimeout(300);
    check('Delete with a rename not saved says to save first, and keeps the rename', await page.locator('#v145D').count() === 0 && /Save your changes first/.test(await page.textContent('#v145Msg')) && await page.inputValue('#v145Sl .v145-sr[data-k="assessment"] input') === 'Findings review');
    await page.fill('#v145Sl .v145-sr[data-k="assessment"] input', 'Assessment');
    await page.click('#v145S details.v145-gone summary'); await page.waitForTimeout(200);
    await page.click('#v145S .v145-sr[data-k="consultation"] button:has-text("Bring back")'); await page.waitForTimeout(1500);
    const cs = obj(setting(store, 'catalyst_client_stages'));
    check('A stage brought back returns to its usual place (before Assessment)', (cs.order || []).indexOf('consultation') === (cs.order || []).indexOf('assessment') - 1 && !(cs.removed || []).includes('consultation'), JSON.stringify(cs.order));
    await page.evaluate(() => nwModalClose());
    // the first stage cannot be deleted by a direct call either
    await page.evaluate(() => v145StageDelAsk('research')); await page.waitForTimeout(300);
    check('Deleting Prospect research is refused', await page.locator('#v145D').count() === 0);
    await ctx.close();

    // a built-in meeting type carries its stage's name; a rename onto another stage's name is refused
    ({ ctx, page, store } = await open('/dashboard/engine-1', { more: (t) => {
      t.ai_settings.push({ key: 'catalyst_client_stages', value: { order: ['research', 'consultation', 'assessment', 'proposal', 'cs-a', 'onboarding', 'review'], items: { 'cs-a': { name: 'Strategy session', type: '' } } }, updated_at: ago(2) });
      t.ai_settings.push({ key: 'catalyst_meeting_types', value: { items: { review: { name: 'Old review name', kbFiles: ['gf-gone'] } } }, updated_at: ago(2) });
      t.ai_settings.push({ key: 'catalyst_stages', value: { review: { name: 'Quarterly check-in' } }, updated_at: ago(2) });
      t.guide_files = (t.guide_files || []).concat([{ id: 'gf-1', file_name: 'Our engagement playbook.md', file_text: 'Strategy sessions run 60 minutes.', in_kb: true, created_at: ago(30) }]);
    } }));
    check('A built-in meeting type is named as its stage is', await page.evaluate(() => v145Type('review').name) === 'Quarterly check-in');
    await page.evaluate(() => v145TypeOpen('review')); await page.waitForTimeout(1000);
    await page.fill('#v145TName', 'Strategy session'); await page.click('#v145TGo'); await page.waitForTimeout(800);
    check('Renaming a meeting type onto another stage\'s name is refused with why', /already a client stage called Strategy session/.test(await page.textContent('#v145TMsg')) && obj(setting(store, 'catalyst_stages')).review.name === 'Quarterly check-in');
    await page.fill('#v145TName', 'Quarterly check-in');
    await page.check('#v145T .v145-kbf input[value="gf-1"]'); await page.click('#v145TGo'); await page.waitForTimeout(1500);
    const kb = (obj(setting(store, 'catalyst_meeting_types')).items.review || {}).kbFiles || [];
    check('Knowledge base files not on the list are kept when the setup is saved', kb.includes('gf-gone') && kb.includes('gf-1'), JSON.stringify(kb));
    await ctx.close();

    // a lead's page: a stage with no checklist says where to set one
    ({ ctx, page, store } = await open('/dashboard/lead-pipeline'));
    await page.evaluate((e) => openE1Lead(e), L1); await page.waitForTimeout(3200);
    const sec = await page.evaluate(() => (document.querySelector('#main section[data-v145="stage"]') || {}).innerText || '');
    check('A stage with no deliverables or tasks says so, with its setup', /This stage:/.test(sec) && /No deliverables or tasks for this stage yet/.test(sec) && /Stage setup/.test(sec), sec);
    await ctx.close();
  }

  // 2. The client workspace
  if (want('workspace')) {
    const CD = call('fx-d', 6, 'Proposal walk-through', [['Pat QA', L1]], 45);
    let { ctx, page, store, storage } = await open('/dashboard/lead-pipeline', { calls: [CD], more: (t) => {
      t.lead_files[0].file_text = 'Synthetic ADV text: the firm manages 400 million for 300 families across three offices.';
      const ws = {}; ws[L1] = { folders: [], items: {} };
      t.ai_settings.push({ key: 'catalyst_ws', value: ws, updated_at: ago(2) });
    } });
    await toFiles(page, L1);
    let r = (await rows(page)).find((x) => x.k === 'f:' + FID);
    check('An older upload (not a transcript) is not marked Source, as the runs do not read it', r && !r.src, JSON.stringify(r));
    await page.evaluate((k) => v145WsEdit(k), 'f:' + FID); await page.waitForTimeout(500);
    check('…and its Edit box starts unticked', !(await page.isChecked('#v145WESrc')));
    await page.check('#v145WESrc'); await page.click('#v145WE button:has-text("Save")'); await page.waitForTimeout(1500);
    r = (await rows(page)).find((x) => x.k === 'f:' + FID);
    check('Ticked, it is marked Source', r && r.src, JSON.stringify(r));
    await page.evaluate((e) => v136Ask(e, 'assessment', false), L1); await page.waitForTimeout(2500);
    check('…and the run question lists it', /From the client workspace: QA-Form-ADV/.test(await page.evaluate(() => (document.querySelector('#v120M .v145-rd') || {}).textContent || '')));
    await page.evaluate(() => nwModalClose());
    // a call: filed by a move, then kept in a team folder, renamed and described
    await page.click('#main .v145-wtabs button:has-text("Calls")'); await page.waitForTimeout(400);
    await page.selectOption('#main .v145-wr[data-k="c:fx-d"] select', 'assessment'); await page.waitForTimeout(1500);
    await page.click('#main .v145-wsh button:has-text("New folder")'); await page.waitForTimeout(400);
    await page.fill('#v145WFName', 'Contracts'); await page.click('#v145WF button:has-text("Add folder")'); await page.waitForTimeout(1000);
    await page.click('#main .v145-wsn .v145-wf:has-text("All content")'); await page.waitForTimeout(300);
    await page.click('#main .v145-wtabs button:has-text("Calls")'); await page.waitForTimeout(300);
    await page.click('#main .v145-wr[data-k="c:fx-d"] button[aria-label^="Edit"]'); await page.waitForTimeout(500);
    const cf = (obj(setting(store, 'catalyst_ws'))[L1].folders || [])[0].id;
    await page.selectOption('#v145WEFold', cf); await page.fill('#v145WEName', 'Pricing call'); await page.fill('#v145WEDesc', 'They asked about the pilot price');
    await page.click('#v145WE button:has-text("Save")'); await page.waitForTimeout(1500);
    r = (await rows(page)).find((x) => x.k === 'c:fx-d');
    check('A filed call moved to a team folder shows there', r && r.chip === 'Contracts', JSON.stringify(r));
    check('A call keeps the name and description given in the workspace', r && r.b === 'Pricing call' && /pilot price/.test(r.t), JSON.stringify(r));
    await page.fill('#main .v145-wq input', 'Pricing'); await page.waitForTimeout(300);
    check('…and search finds it by that name', (await rows(page)).length === 1);
    await page.fill('#main .v145-wq input', ''); await page.waitForTimeout(300);
    check('It stays filed under its stage for the runs', (store.db.call_meta.find((m) => String(m.fathom_id || m.call_id || m.id) === 'fx-d' || m.lead_stage) || {}).lead_stage === 'assessment', JSON.stringify(store.db.call_meta));
    await page.evaluate((e) => v137File('fx-d', e, 'proposal').then(() => v145WsPaint()), L1); await page.waitForTimeout(1200);
    r = (await rows(page)).find((x) => x.k === 'c:fx-d');
    check('Filed somewhere else later (the board, a run), the filing wins', r && r.chip === 'Proposal', JSON.stringify(r));
    await ctx.close();

    // a folder that is gone means To organize
    ({ ctx, page, store, storage } = await open('/dashboard/lead-pipeline', { more: (t) => {
      const ws = {}; ws[L1] = { folders: [], items: { ['f:' + FID]: { folder: 'cs-gone' } } };
      t.ai_settings.push({ key: 'catalyst_ws', value: ws, updated_at: ago(2) });
    } }));
    await toFiles(page, L1);
    await page.click('#main .v145-wsn .v145-wf:has-text("To organize")'); await page.waitForTimeout(300);
    check('A file in a folder that no longer exists shows under To organize', (await rows(page)).some((x) => x.k === 'f:' + FID));
    // delete: refused by Supabase keeps the file and its workspace entry; allowed removes both
    store.db.__lock = { lead_files: true };
    await page.click('#main .v145-wsn .v145-wf:has-text("All content")'); await page.waitForTimeout(300);
    await page.evaluate((k) => v145WsDel(k), 'f:' + FID); await page.waitForTimeout(1500);
    check('A delete Supabase refuses keeps the file and its workspace entry, and says so', store.db.lead_files.length === 1 && !!(obj(setting(store, 'catalyst_ws'))[L1].items['f:' + FID]) && /Could not delete/.test(await page.evaluate(() => document.body.innerText)));
    store.db.__lock = {};
    await page.evaluate((k) => v145WsDel(k), 'f:' + FID); await page.waitForTimeout(2500);
    check('A delete that goes through removes the row, the stored file and the entry', store.db.lead_files.length === 0 && !(obj(setting(store, 'catalyst_ws'))[L1].items || {})['f:' + FID] && storage.some((x) => x.method === 'DELETE'), JSON.stringify({ n: store.db.lead_files.length, ws: obj(setting(store, 'catalyst_ws'))[L1], st: storage.filter((x) => x.method !== 'GET') }));
    await ctx.close();

    // a lead whose email has capitals: an upload is saved under it, shows, and the runs read it
    const MX = 'Pat.QA@Example.com';
    ({ ctx, page, store } = await open('/dashboard/lead-pipeline', { more: (t) => {
      t.e1_leads.find((x) => x.email === L1).email = MX;
      t.agent_outputs.forEach((o) => { if (o.run_id === L1) o.run_id = MX; });
      t.lead_files.forEach((f) => { if (f.lead_email === L1) f.lead_email = MX; });
    } }));
    await toFiles(page, MX);
    await page.click('#main .v145-wsh button:has-text("Upload file")'); await page.waitForTimeout(400);
    await page.check('#v145WU input[value="text"]');
    await page.fill('#v145WUName', 'Case call');
    await page.fill('#v145WUText', 'Pat: We lose two days a month on reporting. Our goal is a pilot with the ops team soon.');
    await page.click('#v145WUGo'); await page.waitForTimeout(3500);
    check('An upload is saved under the lead\'s email as the lead has it', store.db.lead_files.some((f) => f.file_name === 'Case call.txt' && f.lead_email === MX), JSON.stringify(store.db.lead_files.map((f) => f.lead_email)));
    await page.locator('#apChrome .rd-tab', { hasText: /^Files/ }).first().click().catch(() => {}); await page.waitForTimeout(800);
    check('…and shows in the workspace', (await rows(page)).some((x) => x.b === 'Case call'));
    await page.evaluate((e) => v136Ask(e, 'assessment', false), MX); await page.waitForTimeout(2500);
    check('…and the run question reads it', /Case call/.test(await page.evaluate(() => (document.querySelector('#v120M .v145-rd') || {}).textContent || '')));
    await ctx.close();

    // a very long file name on a phone: the edit window stays inside the screen
    ({ ctx, page, store } = await open('/dashboard/lead-pipeline', { width: 390, more: (t) => { t.lead_files[0].file_name = 'Q3_Strategy_Planning_Board_Deck_FINAL_v12_reviewed_by_everyone_on_the_team.pdf'; } }));
    await toFiles(page, L1);
    await page.evaluate((k) => v145WsEdit(k), 'f:' + FID); await page.waitForTimeout(500);
    const fit = await page.evaluate(() => { const m = document.getElementById('v145WE'), b = m.getBoundingClientRect(); return { r: Math.round(b.right), over: m.scrollWidth - m.clientWidth }; });
    check('A long file name wraps inside its window on a phone', fit.r <= 390 && fit.over <= 1, JSON.stringify(fit));
    await ctx.close();
  }

  // 3. The Intel Tracker's replies
  if (want('replies')) {
    const D9 = '00000000-0000-4000-8000-00000000d009';
    let { ctx, page, store } = await open('/dashboard/approvals', { more: (t) => {
      t.engagement_drafts.push({ id: D9, run_id: 'run-old', intel_item_id: null, competitor_name: 'Northwind Advisory', platform: 'linkedin', action: 'comment', source_url: 'https://www.linkedin.com/posts/not-stored-qa', draft: 'An older draft.', status: 'pending', created_at: ago(400) });
    } });
    await page.evaluate((id) => nwReplyOpen(id), D9); await page.waitForTimeout(1300);
    const w = await page.evaluate(() => (document.querySelector('#nwReplyM .v145-why') || {}).innerText || '');
    check('An older reply finds its account by name: from an account you follow, a competitor', /From an account you follow, a competitor/.test(w), w);
    check('No claim that a post was among the most engaged unless the run said so', !/most engaged,|among the run’s most engaged/.test(w.split('\n').filter((l) => !/drafts a reply when/.test(l)).join('\n')), w);
    await ctx.close();

    ({ ctx, page, store } = await open('/dashboard/intel-tracker', { more: (t) => {
      t.competitors.push({ id: '00000000-0000-4000-8000-0000000000e9', name: 'Dana Q', handle_linkedin: 'linkedin.com/in/dana-qa/', status: 'approved', source: 'manual', follow_kind: 'person', follow_for: 'posts', created_at: ago(100) });
    } }));
    await page.evaluate(() => apTab('follow')); await page.waitForTimeout(1800);
    await page.locator('.v145-imp').first().click(); await page.waitForTimeout(500);
    const csv = 'First Name,Last Name,URL,Email Address,Company,Position,Connected On\n' +
      'Ava,Lindqvist,http://uk.linkedin.com/in/ava-lindqvist-qa/?trk=x,,Lindqvist & Co,Founder,01 Nov 2026\n' +
      'Ava,Lindqvist,https://www.linkedin.com/in/ava-lindqvist-qa,,Lindqvist & Co,Founder,01 Nov 2026\n' +
      'Dana,Quinn,https://www.linkedin.com/in/dana-qa,,Quinn LLC,CEO,02 Nov 2026\n';
    await page.setInputFiles('#v145IFile', { name: 'Connections.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await page.waitForTimeout(800);
    const li = await page.$$eval('#v145IList .v145-irow', (x) => x.map((y) => y.innerText.replace(/\s+/g, ' ')));
    check('A LinkedIn link in another shape is read, and listed once', li.filter((x) => /Ava Lindqvist/.test(x)).length === 1, JSON.stringify(li));
    check('Someone followed already is marked though their link was saved in another shape', li.some((x) => /Dana Quinn.*followed already/.test(x)), JSON.stringify(li));
    await page.locator('#v145IList .v145-irow', { hasText: 'Ava Lindqvist' }).locator('label').first().locator('input').check();
    await page.click('#v145IGo'); await page.waitForTimeout(1500);
    const ava = store.db.competitors.find((c) => c.name === 'Ava Lindqvist');
    check('It is saved as the plain profile link', ava && ava.handle_linkedin === 'https://www.linkedin.com/in/ava-lindqvist-qa', ava && ava.handle_linkedin);
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
