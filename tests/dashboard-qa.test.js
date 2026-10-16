// QA round tests for new-aiparagon-dashboard.html (#1): the Intel Tracker opens on the newest live run, a lead
// opens from Files, the knowledge base and HubSpot, stat tiles that used to do nothing now filter or open their
// page, a lead file uploaded on Files is attached in HubSpot, and the assistant greets whoever is signed in.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js),
// and n8n webhooks answer from stubs, so no real account, data or workflow is touched. See tests/README.md.
// Usage: node tests/dashboard-qa.test.js
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

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/engine-3');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  // one signed-in page on a fresh copy of the synthetic data; hooks[] records every n8n call, reads[] every REST read
  async function open(url) {
    const store = makeStore(FX.tables());
    const hooks = [], reads = [];
    const rest = { handle: (m, p, b, h) => { if (m === 'GET') reads.push(p); return store.handle(m, p, b, h); } };
    const hook = (u, m, b) => { hooks.push({ u, b: b || '' }); return { body: { ok: true, started: true } }; };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest, hooks: hook, bucket: errors, fixed: true });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1300);
    return { ctx, page, store, hooks, reads };
  }
  const where = (page) => page.evaluate(() => ({ url: location.pathname, eng: state.engine, view: state.view, h1: ((document.querySelector('.page.on h1') || {}).textContent || '').trim() }));
  const wait = (page, ms) => page.waitForTimeout(ms || 400);

  // ---------------- 1. the Intel Tracker opens on the newest live run ----------------
  {
    const { ctx, page, reads } = await open('/dashboard/intel-tracker');
    const s = await page.evaluate(() => ({ run: state.intelRun, panel: (document.getElementById('nwIntelPanel') || {}).innerText || '' }));
    check('the Intel Tracker opens on the newest run with posts', s.run === FX.F.RUN, s.run);
    check('and shows that run\'s posts, not "No posts in this run"', !/No posts in this run/.test(s.panel) && /Accountability stays with the firm/.test(s.panel), s.panel.slice(0, 120));
    check('it never asks for the built-in sample run', !reads.some((p) => /2026-07-21/.test(p)), reads.filter((p) => /2026-07-21/.test(p)).join(' '));
    await ctx.close();
  }
  // a run remembered from an earlier visit that has no posts and is not in the list gives way to the newest
  {
    const { ctx, page } = await open('/dashboard/engine-3');
    await page.evaluate(() => { state.intelRun = 'agent1_2026-07-21_1913'; V108.items['agent1_2026-07-21_1913'] = []; });
    await page.click('#nwNav button:has-text("Intel Tracker")'); await wait(page, 1500);
    const run = await page.evaluate(() => state.intelRun);
    check('a remembered run with no posts falls back to the newest run', run === FX.F.RUN, run);
    await ctx.close();
  }

  // ---------------- 2. a lead opens from Files, the knowledge base and HubSpot ----------------
  for (const [slug, sel] of [['files', '#apFList a[onclick^="openE1Lead"]'], ['knowledge-base', '#apKbList a[onclick^="openE1Lead"]'], ['hubspot', '#hsTable button[onclick^="openE1Lead"]']]) {
    const n0 = errors.length;
    const { ctx, page } = await open('/dashboard/' + slug);
    await page.locator(sel).first().click(); await wait(page, 1500);
    const w = await where(page);
    check('a lead link on ' + slug + ' opens the lead page', errors.length === n0 && w.eng === 'e1' && w.view === 'e1lead' && w.url === '/dashboard/lead-pipeline' && /Pat QA|Robin Test/.test(w.h1),
      JSON.stringify(w) + ' ' + errors.slice(n0).join(' | '));
    await ctx.close();
  }
  // inside Engine 1 the lead still opens the same way
  {
    const n0 = errors.length;
    const { ctx, page } = await open('/dashboard/lead-pipeline');
    await page.evaluate(() => openE1Lead('qa.lead2@example.com')); await wait(page, 1200);
    const w = await where(page);
    check('openE1Lead inside the Lead pipeline still opens the lead', errors.length === n0 && w.view === 'e1lead' && /Robin Test/.test(w.h1), JSON.stringify(w));
    await ctx.close();
  }

  // ---------------- 3. stat tiles that did nothing ----------------
  {
    const { ctx, page } = await open('/dashboard/integrations');
    await page.click('#apStrip button:has-text("Slack channels")'); await wait(page, 300);
    check('Integrations: the Slack channels tile points at the Slack card', await page.evaluate(() => !!document.querySelector('.ap-int-card[data-k="slack"].v112-flash')));
    await page.click('#apStrip button:has-text("HubSpot contacts")'); await wait(page, 1200);
    check('Integrations: the HubSpot contacts tile opens HubSpot contacts', (await where(page)).url === '/dashboard/hubspot', (await where(page)).url);
    await ctx.close();
  }
  {
    const { ctx, page } = await open('/dashboard/knowledge-base');
    const rows = () => page.evaluate(() => document.querySelectorAll('#apKbList .ap-frow:not(.hd)').length);
    const n0 = await rows();
    await page.click('.rd-strip button:has-text("Waiting to be read")'); await wait(page);
    const n1 = await rows(), on1 = await page.evaluate(() => [...document.querySelectorAll('.rd-strip button.on')].map((b) => b.textContent).join('|'));
    await page.click('.rd-strip button:has-text("Waiting to be read")'); await wait(page);
    const n2 = await rows();
    await page.click('.rd-strip button:has-text("Readable")'); await wait(page);
    const n3 = await rows();
    check('Knowledge base: Waiting to be read shows only the unread ones', n1 === 0 && /Waiting to be read/.test(on1), n0 + ' -> ' + n1 + ' ' + on1);
    check('pressing it again shows everything', n2 === n0, n0 + ' -> ' + n2);
    check('Knowledge base: Readable shows the ones with text', n3 === n0 && n0 > 0, n0 + ' -> ' + n3);
    await ctx.close();
  }
  {
    const { ctx, page, reads } = await open('/dashboard/templates');
    const cards = () => page.evaluate(() => document.querySelectorAll('.ap-tpl-card').length);
    const n0 = await cards(), g0 = reads.filter((p) => p.startsWith('/rest/v1/doc_templates')).length;
    await page.click('.rd-strip button:has-text("Paid ads")'); await wait(page);
    const ad = await page.evaluate(() => ({ cards: document.querySelectorAll('.ap-tpl-card').length, empty: !!document.querySelector('#rd-templates .rd-empty'), on: [...document.querySelectorAll('.rd-strip button.on')].map((b) => b.textContent).join('|') }));
    await page.click('.rd-strip button:has-text("Posts and newsletters")'); await wait(page);
    const org = await cards();
    await page.click('.rd-strip button:has-text("Posts and newsletters")'); await wait(page);
    const back = await cards();
    await page.click('.rd-strip button:has-text("Active templates")'); await wait(page);
    const act = await cards();
    check('Templates: Paid ads lists only ad templates', ad.cards === 0 && ad.empty && /Paid ads/.test(ad.on), JSON.stringify(ad));
    check('Templates: Posts and newsletters filters, and a second press shows all', org === 0 && back === n0 && n0 > 0, n0 + '/' + org + '/' + back);
    check('Templates: Active templates lists the active ones', act === n0, String(act));
    check('Templates: the tiles filter without reloading from Supabase', reads.filter((p) => p.startsWith('/rest/v1/doc_templates')).length === g0, g0 + ' -> ' + reads.filter((p) => p.startsWith('/rest/v1/doc_templates')).length);
    await page.click('.rd-strip button:has-text("Drafts built")'); await wait(page, 1200);
    check('Templates: Drafts built opens Content Transformation', (await where(page)).url === '/dashboard/content-transformation', (await where(page)).url);
    await ctx.close();
  }

  // ---------------- 4. a lead file uploaded on Files is attached in HubSpot ----------------
  {
    const { ctx, page, hooks, store } = await open('/dashboard/files');
    await page.click('button:has-text("Upload a file")'); await wait(page);
    await page.setInputFiles('#apUpF', { name: 'qa-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic notes for the QA suite. Governance beats cost cutting.') });
    await page.selectOption('#apUpWhere', 'lead'); await wait(page, 300);
    const help = await page.evaluate(() => document.getElementById('apUpLeadW').innerText);
    await page.selectOption('#apUpLead', 'qa.lead1@example.com');
    await page.click('#apUpGo'); await wait(page, 2500);
    const hs = hooks.filter((h) => /\/hubspot-file-sync$/.test(h.u)).map((h) => JSON.parse(h.b));
    const row = store.db.lead_files.find((r) => r.file_name === 'qa-notes.txt');
    check('Files: the upload dialog says a lead file also goes to HubSpot', /HubSpot/.test(help), help);
    check('Files: the lead file is saved for the lead', !!row && row.lead_email === 'qa.lead1@example.com', JSON.stringify(row || {}).slice(0, 160));
    check('Files: and sent to Lead File → HubSpot Sync with its link and lead', hs.length === 1 && hs[0].leadEmail === 'qa.lead1@example.com' && hs[0].fileName === 'qa-notes.txt' && !!row && hs[0].fileUrl === row.file_url, JSON.stringify(hs));
    await ctx.close();
  }
  {
    const { ctx, page, hooks } = await open('/dashboard/files');
    await page.click('button:has-text("Upload a file")'); await wait(page);
    await page.setInputFiles('#apUpF', { name: 'qa-guide.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic firm guide for the QA suite, long enough to read.') });
    await page.click('#apUpGo'); await wait(page, 2500);
    check('Files: a firm-wide upload is not sent to HubSpot', !hooks.some((h) => /hubspot-file-sync/.test(h.u)), hooks.map((h) => h.u).join(' '));
    await ctx.close();
  }

  // ---------------- 5. the assistant greets whoever is signed in ----------------
  {
    const { ctx, page } = await open('/dashboard/engine-3');
    await page.click('.nw-ask'); await wait(page);
    const g = await page.evaluate(() => (document.querySelector('#chatBody .msg.bot') || {}).textContent || '');
    check('the assistant greets the signed-in user, not Kaeser', /^Hi QA\./.test(g), g);
    await ctx.close();
  }

  // ---------------- 6. the older parts of the page name the signed-in person, not "Team" ----------------
  {
    const { ctx, page, store } = await open('/dashboard/engine-3');
    const who = await page.evaluate(() => whoAmI());
    await page.evaluate(() => saveFeedback({ agent: 'intel_tracker', target_type: 'qa_check', target_id: 'qa-1', action: 'noted', feedback: 'QA suite' }));
    await wait(page, 600);
    const fb = (store.db.agent_feedback || []).find((r) => r.target_id === 'qa-1');
    check('whoAmI() names the signed-in user after a restored session', who === 'QA Tester', who);
    check('feedback saved by the older code is credited to them', !!fb && fb.author === 'QA Tester', JSON.stringify(fb || {}));
    await page.evaluate(() => apSignOut());
    await page.waitForURL(/\/dashboard\/login/, { timeout: 10000 }).catch(() => {});
    await wait(page, 800);
    check('signing out forgets that name', await page.evaluate(() => sessionStorage.getItem('aip_user')) === null);
    await ctx.close();
  }
  {
    const { ctx, page } = await H.newPage(browser, BASE, { rest: makeStore(FX.tables()), hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: true });
    await page.goto(BASE + '/dashboard/login', { waitUntil: 'load' });
    await H.settled(page, 'login');
    await H.signIn(page);
    await wait(page, 800);
    check('whoAmI() names the user after a fresh sign-in too', await page.evaluate(() => whoAmI()) === 'QA Tester', await page.evaluate(() => whoAmI()));
    await ctx.close();
  }

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
