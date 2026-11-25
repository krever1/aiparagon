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
    await page.setViewportSize({ width: o.width || 1440, height: 900 });
    await page.goto(BASE + addr, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(o.wait || 1800);
    return { ctx, page, store, hooks };
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

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
