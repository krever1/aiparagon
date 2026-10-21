// v118 tests for new-aiparagon-dashboard.html (#1): three leftovers found while taking the Oct 20 update
// screenshots. The demo-name sweep (the old Delta Advisory demo's names) stays out of the live pages, so a real lead,
// contact or file named like a demo client (Ellison, Rita) or carrying the anonymizer's alias (Delta Advisory) shows
// as it is, while the old demo Brand voice page is still cleaned. The lead pipeline's stage count stays inside its
// cell (it ran into the date on the New tab, where the empty Fit column hides). Visible labels use the product names
// (Catalyst, Pipeline) where they still said Engine 1 or Engine 3.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v118.test.js
const fs = require('fs');
const path = require('path');
const H = require('./lib/dashboard-harness');
const { makeStore } = require('./lib/rest-stub');
const FX = require('./lib/qa-fixtures');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'new-aiparagon-dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

// made-up people whose names a demo client shares, and the anonymizer's alias on the first lead
function tables() {
  const t = FX.tables();
  const ren = { 'Pat QA': 'Rita Ellison', 'QA Firm LLC': 'Boone & Raman Advisors' };
  t.e1_leads.forEach((l) => { if (ren[l.prospect_name]) l.prospect_name = ren[l.prospect_name]; if (ren[l.company_name]) l.company_name = ren[l.company_name]; });
  const first = t.e1_leads[0];
  t.e1_leads.push(Object.assign({}, first, { email: 'contact@deltaadvisory.com', company_name: 'Delta Advisory', lead_source: 'Anonymizer', updated_at: '2026-09-21T10:00:00.000Z' }));
  t.agent_outputs.forEach((o) => { const d = o.data; if (d && d.prospectName === 'Pat QA') d.prospectName = 'Rita Ellison'; if (d && d.companyName === 'QA Firm LLC') d.companyName = 'Boone & Raman Advisors'; });
  t.hubspot_contacts.push({ email: 'marisol.whitfield@example.com', first_name: 'Marisol', last_name: 'Whitfield', company: 'Delta Advisory', phone: '', job_title: 'Founder', website: '', lifecycle_stage: 'lead', lead_status: 'NEW', hs_id: '9105', props: {}, synced_at: '2026-10-15T06:00:00.000Z' });
  return t;
}

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(url, opts) {
    opts = opts || {};
    const store = makeStore(tables());
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    await page.setViewportSize({ width: opts.width || 1280, height: 860 });
    page.on('dialog', (d) => d.accept());
    page.on('popup', (p) => p.close().catch(() => {}));
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1500);
    return { ctx, page, store };
  }
  const txt = (page, sel) => page.evaluate((s) => ((document.querySelector(s) || {}).innerText || '').replace(/\s+/g, ' ').trim(), sel || '#view-app');
  const wait = (page, ms) => page.waitForTimeout(ms || 400);
  // the sweep runs after navigation, after every click and 1.2 and 2.6 seconds in, so look after all of them
  const settleSweep = async (page) => { await page.mouse.click(5, 5).catch(() => {}); await wait(page, 3000); };
  const tab = (page, name) => page.locator('#apChrome .rd-tab:visible').filter({ hasText: new RegExp('^\\s*' + name + '\\s*\\d+\\s*$') }).first().click();
  const ENGINE = /\bengine [123]\b/i;

  // 1. real names that match a demo client stay as they are on the live pages
  {
    const { ctx, page } = await open('/dashboard/lead-pipeline');
    await settleSweep(page);
    const rows = await txt(page, '#apE1List tbody');
    check('the lead pipeline keeps a lead called Rita Ellison at Boone & Raman Advisors', /Rita Ellison/.test(rows) && /Boone & Raman Advisors/.test(rows) && !/your team|— Advisors/.test(rows), rows.slice(0, 300));
    const chip = await page.evaluate(() => { const c = [...document.querySelectorAll('#e1Body .chip')].find((x) => /🕶/.test(x.textContent)); return c ? { t: c.textContent.trim(), title: c.getAttribute('title') } : null; });
    check('and its anonymized identity still reads Delta Advisory, not AI Paragon', !!chip && /contact@deltaadvisory\.com/.test(chip.t) && /Delta Advisory · contact@deltaadvisory\.com/.test(chip.title || ''), JSON.stringify(chip));
    await ctx.close();
  }
  {
    const { ctx, page } = await open('/dashboard/hubspot');
    await settleSweep(page);
    const t = await txt(page, '#main');
    check('HubSpot contacts keep Marisol Whitfield at Delta Advisory', /Marisol Whitfield/.test(t) && /Delta Advisory/.test(t), t.slice(0, 400));
    await ctx.close();
  }
  for (const slug of ['deliverables', 'files', 'knowledge-base']) {
    const { ctx, page } = await open('/dashboard/' + slug);
    await settleSweep(page);
    const t = await txt(page);
    check(slug + ' keeps the lead name Rita Ellison', /Rita Ellison/.test(t) && !/your team Ellison|Rita —|— Ellison/.test(t), t.slice(0, 300));
    await ctx.close();
  }
  // an old demo page is still cleaned: Brand voice, opened directly (since v119 Your account's link goes to Company profile)
  {
    const { ctx, page } = await open('/dashboard/account');
    await page.evaluate(() => navPm('voice')); await settleSweep(page);
    const t = await txt(page, '#page-voice');
    check('the old Brand voice page still has the demo firm swept out', t.length > 200 && !/deltaadvisory|Delta-Report-Shell|Delta-Deck-Shell|Delta Advisory|\bRita\b/.test(t), t.slice(0, 300));
    await ctx.close();
  }

  // 2. the stage bar and its count stay inside their cell, segments on one line, with and without the Fit column;
  //    a phone keeps its wider table that scrolls sideways
  for (const width of [390, 900, 1024, 1280, 1440]) {
    const { ctx, page } = await open('/dashboard/lead-pipeline', { width });
    for (const name of ['All', 'New', 'At Research']) {
      await tab(page, name); await wait(page, 800);
      const r = await page.evaluate(() => [...document.querySelectorAll('#e1Body tbody tr')].map((tr) => {
        const td = tr.children[2], bar = td && td.querySelector('.ap-e1bar');
        if (!bar) return null;
        const cs = getComputedStyle(td), cr = td.getBoundingClientRect(), inner = cr.right - parseFloat(cs.paddingRight);
        const right = Math.max(...[...bar.children].map((c) => c.getBoundingClientRect().right));
        const next = [...tr.children].slice(3).find((c) => c.getClientRects().length && c.textContent.trim());
        let nextLeft = Infinity;
        if (next) { const rg = document.createRange(); rg.selectNodeContents(next); nextLeft = rg.getBoundingClientRect().left; }
        const segs = [...bar.querySelectorAll('.seg')].map((x) => x.getBoundingClientRect());
        return { right: Math.round(right), inner: Math.round(inner), gap: Math.round(nextLeft - right), rows: new Set(segs.map((x) => Math.round(x.top))).size, seg: Math.round(segs[0].width) };
      }).filter(Boolean));
      check('at ' + width + ' wide on ' + name + ' the stage bar stays in its cell on one line, clear of the next column',
        r.length > 0 && r.every((x) => x.right <= x.inner + 1 && x.gap >= 12 && x.rows === 1 && x.seg >= 10 && (width > 860 || x.seg === 22)), JSON.stringify(r));
    }
    await ctx.close();
  }

  // 3. product names on the labels that still said Engine 1 / Engine 3
  {
    const { ctx, page } = await open('/dashboard/today');
    const t = await txt(page, '#main');
    check('Today offers Run Catalyst for a lead', /Run Catalyst for a lead/.test(t) && !ENGINE.test(t), (t.match(/.{0,60}engine [123].{0,40}/i) || [t.slice(0, 200)])[0]);
    await ctx.close();
  }
  {
    const { ctx, page } = await open('/dashboard/engine-1');
    const t = await txt(page, '#main');
    check('the Catalyst Overview has no engine label', !ENGINE.test(t), (t.match(/.{0,60}engine [123].{0,40}/i) || [''])[0]);
    await ctx.close();
  }
  {
    const { ctx, page } = await open('/dashboard/lead-pipeline');
    const t = await txt(page, '#main');
    check('the Lead pipeline says Every prospect in Catalyst, with no engine label', /Every prospect in Catalyst/.test(t) && !ENGINE.test(t), (t.match(/.{0,60}engine [123].{0,40}/i) || [t.slice(0, 200)])[0]);
    await page.click('#main button:has-text("New run"), #apChrome button:has-text("New run")'); await wait(page, 800);
    const m = await txt(page, '#e1Run');
    check('New run opens as New Catalyst run', /^New Catalyst run/.test(m), m.slice(0, 120));
    await ctx.close();
  }
  {
    const { ctx, page } = await open('/dashboard/deliverables');
    const t = await txt(page, '#main');
    check('Deliverables counts and tags lead documents under Catalyst', /from Catalyst/.test(t) && /Catalyst documents for each lead/.test(t) && /Catalyst · Prospect intelligence/.test(t) && !ENGINE.test(t), (t.match(/.{0,60}engine [123].{0,40}/i) || [t.slice(0, 300)])[0]);
    await ctx.close();
  }
  for (const [slug, want] of [['ai-settings', /Catalyst agents \(research, interview, anonymizer, discovery, growth plan\)/], ['templates', /The Catalyst documents .*Pipeline briefs/],
    ['account', /Catalyst · Clients and meetings[\s\S]*Pipeline · Content and ads/i], ['files', null], ['knowledge-base', null]]) {
    const { ctx, page } = await open('/dashboard/' + slug);
    const t = await txt(page);
    check(slug + ' has product names, no engine label', (!want || want.test(t)) && !ENGINE.test(t), (t.match(/.{0,60}engine [123].{0,40}/i) || [t.slice(0, 200)])[0]);
    if (slug === 'files') {
      const tips = await page.$$eval('[title]', (els) => els.map((e) => e.getAttribute('title')));
      check('the Files tile for lead documents says written by the Catalyst agents', tips.includes('written by the Catalyst agents') && !tips.some((x) => ENGINE.test(x)), JSON.stringify(tips.filter((x) => /written by|engine/i.test(x))));
    }
    await ctx.close();
  }
  // pop-ups and the landing page editor, from the source
  for (const [old, now] of [['Engine 3 · knowledge base', 'Pipeline · knowledge base'], ['Engine 3 · Content Transformation</div>', 'Pipeline · Content Transformation</div>'],
    ['Engine 3 · market reading', 'Pipeline · market reading'], ['Engine 3 \\u00b7 Custom run', 'Pipeline \\u00b7 Custom run'], ['ready for Engine 1.', 'ready for lead research.'],
    ['Engine 3 \\u00b7 Ad Strategist</div>', 'Pipeline \\u00b7 Ad Strategist</div>'], ['Engine 3 \\u00b7 Ad copy', 'Pipeline \\u00b7 Ad copy'], ['Save to Engine 3', 'Save to Pipeline'],
    ['Engine 3 · Competitor Intelligence Tracker</div>', 'Pipeline · Intel Tracker</div>'], ["g:'Engine 1 leads'", "g:'Leads'"],
    ['Start Engine 1 from this call', 'Run Catalyst from this call'], ['Start Engine 1 at the Assessment', 'Run Catalyst from the Assessment'], ['Engine 1 lead: <b>', 'Catalyst lead: <b>'],
    ['Engine 3 already posts its review messages', 'Pipeline already posts its review messages'], ['Meetings feed Engine 1 prep', 'Meetings feed Catalyst prep']]) {
    check('the source says ' + now.replace(/<[^>]+>/g, '') + ' where it said ' + old.replace(/<[^>]+>/g, ''), !SRC.includes(old) && SRC.includes(now));
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
