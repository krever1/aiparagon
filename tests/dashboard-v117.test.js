// v117 tests for new-aiparagon-dashboard.html (#1): what the Oct 20 live review found. The Pipeline Overview's
// Ad Strategist tile says how long ago it ran (two functions shared the name nwAgo, so it said "just now" for
// yesterday's run), the Approvals Replies tab counts the way All does (replies older than a week sit in their own
// box), the Lead pipeline has a New tab for leads with nothing run yet and stage headings that match their counts,
// HubSpot contacts use product names (Run Catalyst, Follow) with the follow form's current wording, and a long
// persona name wraps on a phone instead of pushing Content Transformation and Marketing Generation sideways.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v117.test.js
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

function tables() {
  const t = FX.tables();
  const now = Date.now(), ago = (d) => new Date(now - d * 864e5).toISOString();
  // an Ad Strategist run that finished yesterday
  t.runs = (t.runs || []).concat([{ run_id: 'agent2_qa_yesterday', agent: 'ad_strategist', status: 'success', run_date: ago(1.1).slice(0, 10), started_at: ago(1.1), finished_at: ago(1.08), stats: {} }]);
  // replies: one from today, three older than a week
  const base = t.engagement_drafts[0];
  t.engagement_drafts = [0.2, 10, 12, 20].map((d, i) => Object.assign({}, base, { id: '00000000-0000-4000-8000-00000000d1' + String(i).padStart(2, '0'), draft: 'QA reply number ' + i, status: 'pending', created_at: ago(d) }));
  // a persona with a long name, as the drafted ones have
  t.client_personas = (t.client_personas || []).concat([Object.assign({}, (t.client_personas || [])[0] || {}, { id: '00000000-0000-4000-8000-0000000b1099', name: 'COO at a wealth management firm preparing for M&A', is_default: false })]);
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
    if (opts.width) await page.setViewportSize({ width: opts.width, height: 844 });
    page.on('dialog', (d) => d.accept());
    page.on('popup', (p) => p.close().catch(() => {}));
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1200);
    return { ctx, page, store };
  }
  const txt = (page, sel) => page.evaluate((s) => ((document.querySelector(s) || {}).innerText || '').replace(/\s+/g, ' ').trim(), sel);
  const wait = (page, ms) => page.waitForTimeout(ms || 400);
  const writes = (store, table, method) => store.writes.filter((w) => w.table === table && (!method || w.method === method));
  // the page tabs sit in the shell's header (#apChrome), e.g. "New 1"
  const tabs = (page) => page.$$eval('#apChrome .rd-tab', (b) => b.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
  const tab = (page, name) => page.locator('#apChrome .rd-tab:visible').filter({ hasText: new RegExp('^\\s*' + name + '\\s*\\d+\\s*$') }).first().click();

  // 1. the day-based nwAgo is the one the agent tiles get, and the minutes one has its own name
  {
    const { ctx, page } = await open('/dashboard/engine-3');
    const r = await page.evaluate(() => {
      const d = (n) => new Date(Date.now() - n * 864e5).toISOString();
      const m = typeof nwAgoMin === 'function' ? nwAgoMin : () => 'missing';
      return [nwAgo(d(0)), nwAgo(d(1.1)), nwAgo(d(12.2)), m(Date.now()), m(Date.now() - 5 * 60000), m(Date.now() - 60000)];
    });
    check('nwAgo counts days from a date, nwAgoMin minutes from a timestamp',
      JSON.stringify(r) === JSON.stringify(['today', 'yesterday', '12 days ago', 'just now', '5 minutes ago', 'a minute ago']), JSON.stringify(r));
    const tile = await page.evaluate(() => {
      const els = [...document.querySelectorAll('#main *')].filter((e) => /^\s*Ad Strategist/.test(e.innerText || '') && /Last run/.test(e.innerText || '') && (e.innerText || '').length < 400);
      return els.length ? els[els.length - 1].innerText.replace(/\s+/g, ' ') : '';
    });
    check('the Ad Strategist tile on the Pipeline Overview says its run was yesterday, not just now', /Last run [^,]+, yesterday/.test(tile) && !/just now/.test(tile), tile);
    await ctx.close();
  }

  // 2. Approvals: the Replies tab counts the way All does; the older ones are in their own box
  {
    const { ctx, page } = await open('/dashboard/approvals');
    const tabs = await page.$$eval('#main .nw-seg button', (b) => b.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
    check('the Replies tab leaves out replies older than a week, like All', tabs.indexOf('Replies 1') !== -1, JSON.stringify(tabs));
    await page.click('#main .nw-seg button:has-text("Replies")'); await wait(page, 600);
    const t = await txt(page, '#main');
    check('the Replies list shows the newest reply, with the three older ones in their box', (t.match(/Reply to /g) || []).length === 1 && /Older than a week\s*3/.test(t), t.slice(0, 400));
    await ctx.close();
    const o = await open('/dashboard/today');
    const tt = await txt(o.page, '#main');
    check('Today counts the same one reply', /\b1 reply\b/.test(tt), tt.slice(0, 300));
    await o.ctx.close();
  }

  // 3. Lead pipeline: a New tab, and stage headings that match what each tab counts
  {
    const { ctx, page } = await open('/dashboard/lead-pipeline');
    const tb = await tabs(page);
    check('the stage tabs put every lead in one of them (New for nothing run yet)',
      /* v120: the board comes first, with no count */
      JSON.stringify(tb) === JSON.stringify(['Board', 'All 3', 'New 1', 'At Research 1', 'At Interview 0', 'At Assessment 0', 'At Discovery 0', 'Completed 1']), JSON.stringify(tb));
    const rowsOf = () => txt(page, '#apE1List tbody');
    await tab(page, 'New'); await wait(page, 700);
    let t = await txt(page, '#apE1List'), rows = await rowsOf();
    check('New lists the lead with nothing run yet', /Sam Sample/.test(rows) && !/Robin Test/.test(rows) && !/Pat QA/.test(rows), rows.slice(0, 300));
    check('and says lead research is next', /Nothing run yet, lead research is next/.test(t), t.slice(0, 300));
    await tab(page, 'At Research'); await wait(page, 700);
    t = await txt(page, '#apE1List'); rows = await rowsOf();
    check('At Research lists the researched lead and says the interview script is next', /Robin Test/.test(rows) && !/Sam Sample/.test(rows) && /Researched, the interview script is next/.test(t), rows.slice(0, 200) + ' / ' + t.slice(0, 200));
    await ctx.close();
  }

  // 4. HubSpot contacts: product names on the actions, and the follow form's current wording
  {
    const { ctx, page, store } = await open('/dashboard/hubspot');
    const b = await page.$$eval('#main .hs-cta', (x) => x.map((e) => e.innerText.trim()));
    check('each contact offers Run Catalyst and Follow, not engine names', b.length >= 4 && b.every((t) => t === '▶ Run Catalyst' || t === '◎ Follow'), JSON.stringify(b));
    await page.click('#main .hs-cta[onclick*="qa.contact@example.com"]:has-text("Follow")'); await wait(page, 700);
    const m = await txt(page, '#e3Track');
    check('Follow opens the form with the current wording', /^Follow this company/.test(m) && /Intel Tracker reads their posts on its next run/.test(m) && !/Engine 3|daily run|Agent 1/.test(m), m.slice(0, 300));
    await page.fill('#e3Li', 'company/contact-co'); await page.click('#e3Go'); await wait(page, 1000);
    const body = await page.evaluate(() => document.body.innerText);
    const w = writes(store, 'competitors', 'POST');
    check('saving it adds the company and says it is followed now', w.length === 1 && /Contact Co is followed now/.test(body) && !/Engine 3 watchlist/.test(body), JSON.stringify(w.map((x) => x.body)).slice(0, 200) + ' / ' + body.slice(-300));
    await ctx.close();
  }

  // 5. on a phone, a long persona name wraps instead of pushing the page sideways
  for (const slug of ['content-transformation', 'marketing-generation']) {
    const { ctx, page } = await open('/dashboard/' + slug, { width: 390 });
    await wait(page, 600);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, long: [...document.querySelectorAll('.v105-pc')].some((b) => /preparing for M&A/.test(b.innerText)) }));
    check(slug + ' at 390 wide shows the long persona and does not scroll sideways', w.long && w.sw <= w.cw, JSON.stringify(w));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
