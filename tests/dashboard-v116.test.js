// v116 tests for new-aiparagon-dashboard.html (#1): the QA round on v115. Landing pages made from the campaigns as
// they are really saved (the Low-Ticket Agent's hooks as plain lines in a JSON string, Marketing Generation's details
// by label and its booking link), the going-live checks counting only what the editor shows, the link after sign-up
// needed for a call or a download, Save and preview on a live page, dashes in ranges, the LinkedIn note on Ad links,
// Ad Testing spend over the same 30 days, Deliverables for the people the Lead pipeline shows, and load errors said
// on Today and Deliverables; Open on a document going to its own tab, synced and logged spend never added together, Show more on
// the sign-ups, a note when an unfinished item is left out, product names where engine names were left, and the public page
// on a phone and with a fast (autofilled) sign-up; the editor's message by its buttons, money in the Working panel, synced
// results read only, the Campaigns count, Settings in the narrow sidebar and the page name in the top bar. Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data
// (lib/qa-fixtures.js) and n8n webhooks answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v116.test.js
const path = require('path');
const H = require('./lib/dashboard-harness');
const { makeStore } = require('./lib/rest-stub');
const FX = require('./lib/qa-fixtures');

const ROOT = path.resolve(__dirname, '..');
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const BOOK = '00000000-0000-4000-8000-0000000001b1';
const NEWS = '00000000-0000-4000-8000-0000000001b2';
const DOWN = '00000000-0000-4000-8000-0000000001b3';
const LIVE = '00000000-0000-4000-8000-0000000c1001';
const HOOKS = ['Stop paying the manual tax', 'Three workflows ready for AI', 'Your team is the bottleneck', 'Ten hours back a week', 'What a 20 minute call shows'];

function tables(o) {
  o = o || {};
  const t = FX.tables();
  const now = Date.now(), ago = (d) => new Date(now - d * 864e5).toISOString();
  t.landing_pages = []; t.lp_signups = []; t.lp_views = [];
  // a book-a-call campaign as the Low-Ticket Agent saves it: no setup, its hooks as plain lines in a JSON string
  t.funnel_packages.push({ id: BOOK, run_id: 'lt_2026-10-18', run_date: '2026-10-18', funnel_type: null, status: 'pending_approval', setup: null, created_at: ago(2), updated_at: ago(2),
    ad_variations: JSON.stringify({ stable_body: 'Most firms lose ten hours a week to manual admin.', hook_variations: HOOKS, cta: 'Book the diagnostic' }),
    landing_page: JSON.stringify({ vsl_state: 'image_led', headline: 'Find where your firm loses time', subheadline: 'A 20–30 minute call, 11am–12pm Pacific — no pitch', bullets: ['One', 'Two'], cta: 'Book my call' }),
    booking_page: JSON.stringify({ headline: 'Pick a time' }), survey: null });
  // a newsletter sign-up whose page has placeholders the old editor had no box for, and a review flag that names one
  t.funnel_packages.push({ id: NEWS, run_id: 'funnel_2026-10-19_0900_news', funnel_type: 'newsletter_signup', status: 'approved', created_at: ago(1), updated_at: ago(1),
    setup: { title: 'The Governed AI Brief', details: { 'Newsletter name': 'The Governed AI Brief', 'How often': 'Every two weeks', 'Sign-up link': 'https://news.example.com/join' }, review_flags: ['Replace [ADD FREQUENCY] with how often it goes out'] },
    ad_variations: { variants: [{ hook: 'One AI move every two weeks', headline: 'The Brief' }] },
    steps: [{ key: 'signup_page', title: 'Sign-up page', content: { headline: 'The Governed AI Brief', subheadline: 'One practical move for advisers', how_often: '[ADD FREQUENCY]', proof: ['Read by [ADD NUMBER] advisers'], cta: 'Subscribe', fields: ['Name', 'Email'] } }] });
  // a download funnel: the file link is saved under its label
  t.funnel_packages.push({ id: DOWN, run_id: 'funnel_2026-10-19_1000_down', funnel_type: 'download', status: 'approved', created_at: ago(1), updated_at: ago(1),
    setup: { title: 'The AI governance checklist', details: { 'The resource': 'The AI governance checklist', 'File link': 'https://files.example.com/checklist.pdf', 'How they get it': 'Instant download' } },
    ad_variations: { variants: [{ hook: 'The checklist RIAs use' }] },
    steps: [{ key: 'optin_page', title: 'Opt-in page', content: { headline: 'Get the AI governance checklist', cta: 'Send it to me', fields: ['Name', 'Email'] } }] });
  // Deliverables: someone who exists only in agent_outputs (no e1_leads row), as the Lead pipeline shows them
  t.agent_outputs.push({ id: '00000000-0000-4000-8000-0000000e9001', run_id: 'olive.orphan@example.com', agent: 'discovery_call', output_type: 'json', title: 'discovery_call', created_at: ago(3),
    content_md: '# Discovery\n\nSynthetic.', data: { status: 'success', prospectName: 'Olive Orphan', companyName: 'Orphan Advisory', pdfUrl: 'https://drive.google.com/file/d/QAorphan/view' } });
  if (o.live) {
    t.landing_pages.push({ id: LIVE, slug: 'spring-webinar', title: 'Spring webinar', status: 'live', kind: 'webinar', source_type: 'funnel_package', source_id: null,
      content: { headline: 'Spring webinar', cta: 'Save my seat', fields: ['name', 'email'], thanks: { headline: 'Done' } }, add_to_pipeline: true,
      ads: [{ code: 'PK7Q2-A1', n: 1, hook: 'Hook one' }, { code: 'PK7Q2-A2', n: 2, hook: 'Hook two' }], created_at: ago(10), updated_at: ago(8), published_at: ago(10) });
    t.lp_views.push({ page_id: LIVE, day: new Date().toISOString().slice(0, 10), ad_code: 'PK7Q2-A1', views: 40 });
    t.lp_signups.push({ id: 's1', page_id: LIVE, slug: 'spring-webinar', name: 'Jamie Sample', email: 'jamie@example.com', utm: { source: 'meta', content: 'PK7Q2-A1' }, ad_code: 'PK7Q2-A1', hubspot_id: '901', lead_added: true, created_at: ago(1) },
      { id: 's2', page_id: LIVE, slug: 'spring-webinar', name: 'Alex Example', email: 'alex@example.com', utm: { source: 'meta', content: 'PK7Q2-A1' }, ad_code: 'PK7Q2-A1', hubspot_id: '902', lead_added: true, created_at: ago(2) },
      { id: 's3', page_id: LIVE, slug: 'spring-webinar', name: 'Robin Second', email: 'robin2@example.com', utm: { source: 'meta', content: 'PK7Q2-A2' }, ad_code: 'PK7Q2-A2', hubspot_id: '903', lead_added: true, created_at: ago(3) });
    for (let i = 0; i < (o.many || 0); i++) t.lp_signups.push({ id: 'm' + i, page_id: LIVE, slug: 'spring-webinar', name: 'Sample Person ' + i, email: 'sample' + i + '@example.com', utm: {}, ad_code: null, lead_added: false, created_at: ago(4 + i / 100) });
    t.content_results = [
      { id: 'r1', kind: 'ad', title: 'PK7Q2-A1 Spring webinar', platform: 'meta', source: 'meta', spend: 120, attribution: 'api', period_start: ago(30).slice(0, 10), period_end: ago(1).slice(0, 10), created_at: ago(1) },
      { id: 'r0', kind: 'ad', title: 'PK7Q2-A1 Spring webinar (old export)', platform: 'meta', spend: 500, attribution: 'manual', posted_on: ago(90).slice(0, 10), created_at: ago(89) },
      { id: 'r2', kind: 'ad', title: 'PK7Q2-A1-Retarget', platform: 'linkedin', spend: 30, attribution: 'api', period_start: ago(30).slice(0, 10), period_end: ago(1).slice(0, 10), created_at: ago(1) },
      { id: 'r3', kind: 'ad', title: 'PK7Q2-A1 logged by hand', platform: 'meta', spend: 7, attribution: 'manual', posted_on: ago(5).slice(0, 10), created_at: ago(5) },
      { id: 'r4', kind: 'ad', title: 'PK7Q2-A2 logged by hand', platform: 'linkedin', spend: 40, attribution: 'manual', posted_on: ago(5).slice(0, 10), created_at: ago(5) },
      { id: 'r5', kind: 'ad', title: 'PK7Q2-A10 another ad', platform: 'meta', spend: 900, attribution: 'api', period_end: ago(1).slice(0, 10), created_at: ago(1) }];
  }
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
    const store = makeStore(tables(opts));
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    page.on('dialog', (d) => d.accept());
    page.on('popup', (p) => p.close().catch(() => {}));
    for (const t of opts.failTables || []) {
      await page.route(new RegExp('^' + SB.replace(/\./g, '\\.') + '/rest/v1/' + t + '\\?'), (route) => route.request().method() === 'GET'
        ? route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ message: 'upstream timeout' }) })
        : route.fallback());
    }
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1200);
    return { ctx, page, store };
  }
  const txt = (page, sel) => page.evaluate((s) => ((document.querySelector(s) || {}).innerText || '').replace(/\s+/g, ' ').trim(), sel);
  const wait = (page, ms) => page.waitForTimeout(ms || 400);
  const writes = (store, table, method) => store.writes.filter((w) => w.table === table && (!method || w.method === method));
  const posted = (store, i) => { const w = writes(store, 'landing_pages', 'POST')[i]; return w && (Array.isArray(w.body) ? w.body[0] : w.body); };

  // 1. the pieces on their own: dashes, the link after sign-up, the placeholders that count, a real book-a-call package
  {
    const { ctx, page } = await open('/dashboard/landing-pages');
    const d = await page.evaluate(() => ['11am–12pm Pacific', 'A 20–30 minute call', 'Pages 3–5', 'Strategy — not tactics', '2026—2027', 'Firm—In one call'].map(v115Dash));
    check('a range keeps a hyphen (11am-12pm, 20-30, 3-5), any other dash becomes a comma',
      JSON.stringify(d) === JSON.stringify(['11am-12pm Pacific', 'A 20-30 minute call', 'Pages 3-5', 'Strategy, not tactics', '2026-2027', 'Firm, In one call']), JSON.stringify(d));
    const L = await page.evaluate(() => [
      v116Link('book_call', { booking: { name: 'Intro call', url: 'https://calendly.com/qa/intro', duration: 20 } }, {}),
      v116Link('book_call', { details: 'Price shown: $47. Checkout link: https://buy.example.com/abc. What it leads to: a call' }, {}),
      v116Link('webinar', {}, { 'Registration link': 'https://zoom.example.com/reg' }),
      v116Link('download', {}, { 'File link': 'https://files.example.com/x.pdf' }),
      v116Link('newsletter_signup', {}, { 'Sign-up link': 'https://news.example.com/join' }),
      v116Link('landing', {}, { 'Page link': 'https://www.example.com/page' }),
      v116Link('book_call', { booking: { url: 'javascript:alert(1)' } }, {}),
      v116Link('download', {}, {})]);
    check('the link after sign-up comes from the booking link or the campaign detail of that kind',
      JSON.stringify(L) === JSON.stringify(['https://calendly.com/qa/intro', 'https://buy.example.com/abc', 'https://zoom.example.com/reg', 'https://files.example.com/x.pdf', 'https://news.example.com/join', 'https://www.example.com/page', '', '']), JSON.stringify(L));
    const h = await page.evaluate(() => [
      v115Holes({ headline: 'Webinar', when: 'Thursday 6 November', flags: ['Replace [ADD DATE] with the real date'] }),
      v115Holes({ headline: 'News', how_often: '[ADD FREQUENCY]', proof: ['Read by [ADD NUMBER] advisers'] }),
      v115Holes({ headline: 'Call', questions: [{ key: 'q1', label: 'Revenue [ADD RANGE]?', off: true }, { key: 'q2', label: 'Role [FILL IN]?' }] })]);
    check('a review flag that names a placeholder does not hold the page up', h[0].length === 0, JSON.stringify(h[0]));
    check('placeholders are named with the box they are in', JSON.stringify(h[1]) === JSON.stringify(['[ADD FREQUENCY] (How often)', '[ADD NUMBER] (Proof)']), JSON.stringify(h[1]));
    check('a qualifying question switched off does not count, one still on does', h[2].length === 1 && /^\[FILL IN\] \(a qualifying question/.test(h[2][0]), JSON.stringify(h[2]));
    const x = await page.evaluate(async (id) => { const p = ((await apSb('funnel_packages?select=*&id=eq.' + id + '&limit=1')) || [])[0]; return v115LpFrom(p); }, BOOK);
    check('a book-a-call package with its hooks as plain lines gives one ad per hook', x.kind === 'book_call' && x.ads.length === 5 && x.ads.map((a) => a.hook).join('|') === HOOKS.join('|') && x.ads[4].n === 5, JSON.stringify(x.ads));
    check('and its page keeps the ranges in the copy', x.content.subheadline === 'A 20-30 minute call, 11am-12pm Pacific, no pitch', x.content.subheadline);
    await ctx.close();
  }

  // 2. Landing pages made from the campaigns as they are really saved
  {
    const { ctx, page, store } = await open('/dashboard/landing-pages');
    const pick = async (id) => {
      await page.click('#main .nw-ph-actions button:has-text("Put a page live")'); await wait(page, 900);
      await page.click('#v115PickB button[onclick*="' + id + '"]'); await wait(page, 1300);
    };
    // a book-a-call campaign from the Low-Ticket Agent: five ads, and a booking link before it goes live
    await pick(BOOK);
    let b = posted(store, 0);
    check('the book-a-call page gets a code for each of its five hooks', b && b.kind === 'book_call' && b.ads.length === 5 && b.ads.every((a, i) => new RegExp('^P[A-Z2-9]{4}-A' + (i + 1) + '$').test(a.code)) && b.ads[0].hook === HOOKS[0], JSON.stringify(b && b.ads));
    const before = writes(store, 'landing_pages', 'PATCH').length;
    await page.click('#v115LpD button:has-text("Put it live")'); await wait(page);
    check('without a booking link it does not go live, and says where the link goes', writes(store, 'landing_pages', 'PATCH').length === before && /Add your booking link under After they sign up/.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    const seen = await page.evaluate(() => { const m = document.getElementById('v115E-msg'), r = m.getBoundingClientRect(), b = document.querySelector('#v115LpD .nw-d-foot').getBoundingClientRect();
      return { top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight, inFoot: r.top >= b.top - 1 && r.bottom <= b.bottom + 1 }; });
    check('the refusal shows by the buttons, inside the window', seen.inFoot && seen.top > 0 && seen.top + seen.h <= seen.vh && seen.h > 0, JSON.stringify(seen));
    check('the link box says it is needed', /needed to go live/.test(await txt(page, '#v115LpD .nw-field:has(#v115E-thu)')), await txt(page, '#v115LpD .nw-field:has(#v115E-thu)'));
    await page.fill('#v115E-thu', 'https://calendly.com/qa/intro');
    await page.click('#v115LpD button:has-text("Put it live")'); await wait(page, 1000);
    const live = writes(store, 'landing_pages', 'PATCH').slice(-1)[0];
    check('with the link it goes live', writes(store, 'landing_pages', 'PATCH').length === before + 1 && live.body.status === 'live' && live.body.content.thanks.url === 'https://calendly.com/qa/intro', JSON.stringify(live && live.body.status));
    await wait(page, 500);
    const adm = await txt(page, '#v115AdsM');
    check('its ad links open, five ads, with the LinkedIn note on campaign names', (await page.$$('#v115AdsM .v115-ad')).length === 5 && /On LinkedIn, put the code in the campaign's name and keep one ad per campaign/.test(adm), adm.slice(0, 300));
    await page.click('#v115AdsM button[aria-label="Close"]'); await wait(page);
    check('the page row offers Ad links', !!(await page.$('#main .v115-lp-row button:has-text("Ad links")')));
    // the live page: Preview saves it for everyone, so it says so
    await page.click('#main .v115-lp-row button:has-text("Edit")'); await wait(page, 500);
    const pv = await txt(page, '#v115LpD .nw-d-foot');
    check('on a live page the preview button says Save and preview', /Save and preview/.test(pv) && !/\bPreview\b(?! )/.test(pv.replace('Save and preview', '')), pv);
    const n0 = writes(store, 'landing_pages', 'PATCH').length;
    await page.click('#v115LpD button:has-text("Save and preview")'); await wait(page, 900);
    check('and it saves, saying visitors see it now', writes(store, 'landing_pages', 'PATCH').length === n0 + 1 && /visitors see it now/.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    await page.evaluate(() => nwDrawerClose()); await wait(page);
    // a newsletter sign-up: How often and Proof get boxes, the flag does not hold it up
    await pick(NEWS);
    b = posted(store, 1);
    check('the newsletter page takes its sign-up link from the campaign details', b && b.kind === 'newsletter_signup' && b.content.thanks.url === 'https://news.example.com/join', JSON.stringify(b && b.content.thanks));
    check('the editor has boxes for How often and Proof', !!(await page.$('#v115E-often')) && !!(await page.$('#v115E-proof')));
    const holes = await txt(page, '#v115LpD .v115-holes');
    check('the placeholders to fill in say which box', /\[ADD FREQUENCY\] \(How often\)/.test(holes) && /\[ADD NUMBER\] \(Proof\)/.test(holes), holes);
    const p0 = writes(store, 'landing_pages', 'PATCH').length;
    await page.click('#v115LpD button:has-text("Put it live")'); await wait(page);
    check('it does not go live with them', writes(store, 'landing_pages', 'PATCH').length === p0 && /Fill in \[ADD FREQUENCY\] \(How often\)/.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    await page.fill('#v115E-often', 'Every two weeks');
    await page.fill('#v115E-proof', 'Read by 400 advisers');
    await page.click('#v115LpD button:has-text("Put it live")'); await wait(page);
    check('with them filled in, the review flags still need "I checked these"', writes(store, 'landing_pages', 'PATCH').length === p0 && /I checked these/.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    await page.check('#v115E-ok');
    await page.click('#v115LpD button:has-text("Put it live")'); await wait(page, 1000);
    const nl = writes(store, 'landing_pages', 'PATCH').slice(-1)[0];
    check('then it goes live, even though the flag itself names a placeholder', writes(store, 'landing_pages', 'PATCH').length === p0 + 1 && nl.body.status === 'live' &&
      nl.body.content.how_often === 'Every two weeks' && JSON.stringify(nl.body.content.proof) === JSON.stringify(['Read by 400 advisers']), JSON.stringify(nl && nl.body.content));
    await wait(page, 500); await page.evaluate(() => { try { nwModalClose(); } catch (e) {} });
    // a download: the file link comes in, and is needed
    await pick(DOWN);
    b = posted(store, 2);
    check('the download page takes its file link from the campaign details', b && b.kind === 'download' && b.content.thanks.url === 'https://files.example.com/checklist.pdf' &&
      b.content.thanks.headline === 'Here it is.', JSON.stringify(b && b.content.thanks));
    await page.fill('#v115E-thu', '');
    const d0 = writes(store, 'landing_pages', 'PATCH').length;
    await page.click('#v115LpD button:has-text("Put it live")'); await wait(page);
    check('without the file link a download page does not go live', writes(store, 'landing_pages', 'PATCH').length === d0 && /Add the link to the file/.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    await page.evaluate(() => nwDrawerClose());
    await ctx.close();
  }

  // 3. Ad Testing: spend over the same 30 days as the visits and sign-ups
  {
    const { ctx, page } = await open('/dashboard/ad-testing', { live: true });
    await page.evaluate(() => { RD.aptab.testing = 'results'; apGo('e3testing'); }); await wait(page, 1800);
    const adt = await page.evaluate(() => [...document.querySelectorAll('#main .v115-adt tbody tr')].map((r) => [...r.cells].map((c) => c.innerText.trim())));
    check('spend counts the synced rows of the last 30 days (a code then a dash too), not the old export, not A10', adt.length >= 2 && adt[0][0].startsWith('PK7Q2-A1') && adt[0][3] === '2' && adt[0][5] === '$150' && adt[0][6] === '$75', JSON.stringify(adt));
    check('a logged row is not added to an ad that has synced numbers, and counts for an ad that has none', adt[1][0].startsWith('PK7Q2-A2') && adt[1][3] === '1' && adt[1][5] === '$40' && adt[1][6] === '$40', JSON.stringify(adt[1]));
    await ctx.close();
  }

  // 4. Deliverables: the same people as the Lead pipeline
  {
    const { ctx, page } = await open('/dashboard/deliverables');
    const rows = await page.evaluate(() => [...document.querySelectorAll('#v115DlList .v115-dl-row')].map((r) => r.querySelector('.nw-row-title').textContent + ' | ' + r.querySelector('.nw-row-prev').textContent));
    check('someone who only has Engine 1 documents (no lead row yet) is listed', rows.some((x) => /Discovery Call Framework \| Olive Orphan · Orphan Advisory/.test(x)), JSON.stringify(rows));
    check('and the people with lead rows still are', rows.filter((x) => /Pat QA|Robin Test/.test(x)).length === 6, JSON.stringify(rows));
    await page.click('#v115DlList .v115-dl-row:has-text("Olive Orphan") button:has-text("Open")'); await wait(page, 1300);
    const s = await page.evaluate(() => ({ cur: apCurrentView(), view: state.view, lead: state.e1Lead }));
    check('Open on that row goes to them in Catalyst', s.cur === 'e1pipeline' && s.lead === 'olive.orphan@example.com', JSON.stringify(s));
    await ctx.close();
  }

  // 5. a read that fails is said, not shown as empty
  {
    const { ctx, page } = await open('/dashboard/today', { failTables: ['lp_signups'] });
    const card = await page.evaluate(() => { const k = [...document.querySelectorAll('#main .nw-widgets > section')].find((s) => /Latest sign-ups/i.test(s.innerText)); return k ? k.innerText.replace(/\s+/g, ' ') : ''; });
    check('Today says the sign-ups could not load, instead of "No sign-ups yet"', /Could not load the sign-ups/i.test(card) && !/No sign-ups yet/i.test(card), card);
    await ctx.close();
  }
  {
    const { ctx, page } = await open('/dashboard/deliverables', { failTables: ['e1_leads'] });
    const head = await txt(page, '#main .nw-ph');
    const n = (await page.$$('#v115DlList .v115-dl-row')).length;
    check('Deliverables says when one of its reads failed, and still lists what it has', /Some could not load/.test(head) && n > 0, head.slice(0, 200) + ' rows=' + n);
    await ctx.close();
  }

  // 6. Open on an Engine 1 document goes to that document's tab on the lead page
  {
    const { ctx, page } = await open('/dashboard/deliverables');
    await page.click('#v115DlList .v115-dl-row:has-text("Growth Plan Proposal"):has-text("Pat QA") button:has-text("Open")'); await wait(page, 2200);
    const tab = await page.evaluate(() => { const b = document.querySelector('#apChrome .rd-tab.on'); return b ? b.dataset.tab + '|' + b.textContent.trim() : ''; });
    check('Open on a Growth Plan opens the lead on its Growth Plan tab', /^s4\|/.test(tab) && /Growth Plan/.test(tab), tab);
    await page.evaluate(() => apGo('deliverables')); await wait(page, 1200);
    await page.click('#v115DlList .v115-dl-row:has-text("Interview Script"):has-text("Pat QA") button:has-text("Open")'); await wait(page, 2200);
    const tab2 = await page.evaluate(() => { const b = document.querySelector('#apChrome .rd-tab.on'); return b ? b.dataset.tab + '|' + b.textContent.trim() : ''; });
    check('and on an Interview Script, its Interview tab', /^s1\|/.test(tab2) && /Interview/.test(tab2), tab2);
    await ctx.close();
  }

  // 7. sign-ups: 200 at a time with Show more; an unfinished item left out is said; a paused page's Ad links say paused
  {
    const { ctx, page } = await open('/dashboard/landing-pages', { live: true, many: 233 });
    await page.click('#main .nw-tabs button:has-text("Sign-ups")'); await wait(page, 600);
    const n1 = (await page.$$('#v115SuList tbody tr')).length;
    const foot = await txt(page, '#v115SuList .v115-more');
    check('the sign-ups table shows 200 and says how many there are', n1 === 200 && /Showing 200 of 236/.test(foot), n1 + ' ' + foot);
    await page.click('#v115SuList button:has-text("Show more")'); await wait(page, 400);
    check('Show more shows the rest', (await page.$$('#v115SuList tbody tr')).length === 236 && !(await page.$('#v115SuList .v115-more')));
    await page.click('#main .nw-tabs button:has-text("Pages")'); await wait(page, 400);
    await page.click('#main .v115-lp-row button:has-text("Edit")'); await wait(page, 500);
    await page.click('#v115LpD button:has-text("Add a section")'); await wait(page, 200);
    await page.fill('#v115E-sec .v115-pair:last-child [data-k="title"]', 'A heading with no text yet');
    await page.click('#v115LpD .nw-d-foot button:text-is("Save")'); await wait(page, 900);
    const toast = await page.evaluate(() => document.body.innerText.match(/Saved\.[^\n]*/) ? document.body.innerText.match(/Saved\.[^\n]*/)[0] : '');
    check('Save says an unfinished section was left out', /One unfinished section or question was left out/.test(toast), toast);
    await page.click('#main .v115-lp-row button:has-text("Edit")'); await wait(page, 500);
    await page.click('#v115LpD button:has-text("Pause")'); await wait(page, 900);
    await page.click('#main .v115-lp-row button:has-text("Ad links")'); await wait(page, 500);
    check('Ad links on a paused page say it is paused', /The page is paused/.test(await txt(page, '#v115AdsM')), await txt(page, '#v115AdsM .nw-hint'));
    check('and the naming example uses this page, not a sample name', /PK7Q2-A1 Spring webinar/.test(await txt(page, '#v115AdsM .nw-m-body > p')) && (await txt(page, '#v115AdsM .nw-m-body > p')).indexOf('PK7Q2-A1 Spring webinar') >= 0, await txt(page, '#v115AdsM .nw-m-body > p'));
    await ctx.close();
  }

  // 8. product names where the engine names were left
  {
    const { ctx, page } = await open('/dashboard/calls');
    const t = await page.evaluate(() => ({ title: document.title, tags: ['e1pipeline', 'e1lead', 'e3intel', 'e3landing', 'e3client'].map((k) => AP_VIEWS[k].tag),
      side: [...document.querySelectorAll('#nwNav button, #nwNav a')].map((b) => b.textContent.trim()).filter((x) => /contacts/i.test(x)),
      act: apActivity().map((a) => a.sub).filter((x) => /Engine/.test(x)), notifs: (typeof NOTIFS !== 'undefined' ? NOTIFS : []).map((n) => n.s).filter((x) => /Engine [13]/.test(String(x))) }));
    check('the Calls tab title matches the page', t.title === 'Calls · AI Paragon', t.title);
    check('views carry their product: Catalyst, Pipeline, Atlas', JSON.stringify(t.tags) === JSON.stringify(['Catalyst', 'Catalyst', 'Pipeline', 'Pipeline', 'Atlas']), JSON.stringify(t.tags));
    check('the sidebar says HubSpot contacts', t.side.some((x) => /HubSpot contacts/.test(x)), JSON.stringify(t.side));
    check('the runs card and the bell name products, not engines', t.act.length === 0 && t.notifs.length === 0, JSON.stringify(t));
    await page.evaluate(() => openE1Lead('qa.lead1@example.com')); await wait(page, 1500);
    const crumb = await page.evaluate(() => [...document.querySelectorAll('.ap-crumb, #apChrome .rd-eyebrow, #main .rd-eyebrow')].map((e) => e.textContent.trim()).filter(Boolean).join(' | '));
    check('the lead page does not say Engine 1', !/Engine 1|ENGINE 1/.test(crumb), crumb);
    await ctx.close();
  }

  // 9. Knowledge base and Files fit at 1024 wide
  for (const slug of ['knowledge-base', 'files']) {
    const { ctx, page } = await open('/dashboard/' + slug);
    await page.setViewportSize({ width: 1024, height: 768 }); await wait(page, 900);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    check(slug + ' has no sideways scroll at 1024 wide', w <= 1025, String(w));
    await ctx.close();
  }

  // 11. Ad Testing results: money starting with $1 in the Working panel, and synced rows read only
  {
    const { ctx, page } = await open('/dashboard/ad-testing', { live: true });
    await page.evaluate(() => { RD.aptab.testing = 'results'; apGo('e3testing'); }); await wait(page, 1800);
    const w = await page.evaluate(() => { const s = document.querySelector('.v113-work'); return s ? { h2: s.querySelectorAll('h2, .nw-sec-title').length, text: s.innerText.replace(/\s+/g, ' ') } : null; });
    check('the Working panel shows "$120 spent" as it is (no stray heading)', !!w && w.h2 === 0 && /\$120 spent/.test(w.text) && !/Ads 20 spent/.test(w.text), JSON.stringify(w));
    const rows = await page.evaluate(() => [...document.querySelectorAll('#main .nw-res-tbl tbody tr')].map((r) => ({ t: r.innerText.replace(/\s+/g, ' '), acts: !!r.querySelector('.nw-res-acts') })));
    const synced = rows.find((r) => /PK7Q2-A1 Spring webinar/.test(r.t) && !/old export/.test(r.t)), logged = rows.find((r) => /logged by hand/.test(r.t));
    const synced2 = rows.find((r) => /PK7Q2-A1-Retarget/.test(r.t));
    check('a synced row says where it came from and has no Edit or Delete', !!synced && /synced from Meta/.test(synced.t) && !synced.acts && !!synced2 && /synced from LinkedIn/.test(synced2.t) && !synced2.acts, JSON.stringify([synced, synced2]));
    check('a row the team logged keeps Edit and Delete', !!logged && logged.acts, JSON.stringify(logged));
    await ctx.close();
  }

  // 12. Marketing Generation: the Campaigns count is what the tab lists
  {
    const { ctx, page } = await open('/dashboard/marketing-generation');
    await page.click('#nwMgTabs button[data-tab="campaigns"]'); await wait(page, 1800);
    const r = await page.evaluate(() => ({ tab: ((document.querySelector('#nwMgTabs button[data-tab="campaigns"] .nw-cnt') || {}).textContent || ''),
      listed: document.querySelectorAll('#nwMgP_campaigns .v113-funs .nw-row').length + document.querySelectorAll('#nwMgP_campaigns article').length }));
    check('the Campaigns tab counts the funnels and campaigns it lists', r.listed > 0 && r.tab === String(r.listed), JSON.stringify(r));
    await ctx.close();
  }

  // 13. the narrow sidebar's Settings opens its first page; the top bar keeps the page's name whole at 1024
  {
    const { ctx, page } = await open('/dashboard/today');
    await page.click('#nwCollapseBtn'); await wait(page, 300);
    await page.click('#nwNav .nw-parent[title="Settings"]'); await wait(page, 900);
    check('Settings in the narrow sidebar opens Integrations', await page.evaluate(() => apCurrentView()) === 'integrations', await page.evaluate(() => apCurrentView()));
    await page.click('#nwCollapseBtn'); await wait(page, 200);
    for (const [w, slug] of [[1024, 'briefs'], [1024, 'files'], [1280, 'briefs']]) {
      await page.setViewportSize({ width: w, height: 768 });
      await page.evaluate((v) => apGo(v), slug === 'files' ? 'files' : 'e3briefs'); await wait(page, 900);
      const c = await page.evaluate(() => { const b = document.querySelector('#nwCrumb b'); return b ? { cw: b.clientWidth, sw: b.scrollWidth, t: b.textContent } : null; });
      check('the page name in the top bar is whole at ' + w + ' (' + slug + ')', !!c && c.sw <= c.cw + 1, JSON.stringify(c));
    }
    await ctx.close();
  }

  // 10. the public page: long words wrap on a phone, and a fast sign-up waits out the bot check
  {
    const hooks = [];
    const { ctx, page } = await H.newPage(browser, BASE, { seed: false, rest: makeStore({}), hooks: (u, m, b) => { hooks.push(JSON.parse(b || '{}')); return { body: { ok: true } }; }, bucket: errors });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.route(SB + '/rest/v1/rpc/lp_public', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ slug: 'spring-webinar', title: 'Spring webinar', kind: 'webinar', brand: { name: 'AI Paragon' },
        content: { headline: 'Supercalifragilisticexpialidociousgovernanceforadvisersandoperators', subheadline: 'Questions to questions.and.answers.for.registered.advisers@example-advisory-firm.com',
          cta: 'Save my seat', fields: ['name', 'email'], thanks: { headline: 'You are registered' } } }) }));
    const t0 = Date.now();
    await page.goto(BASE + '/go/spring-webinar', { waitUntil: 'load' });
    await page.waitForSelector('#lp-email');
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    check('a long word and a long address wrap on a phone (no sideways scroll)', w <= 391, String(w));
    await page.fill('#lp-name', 'Fast Filler'); await page.fill('#lp-email', 'fast@example.com');
    await page.click('.lp-f button[type=submit]');
    const clickedAt = Date.now() - t0;
    await page.waitForTimeout(2600);
    check('a sign-up sent within two seconds of opening waits, so it is not taken for a bot', hooks.length === 1 && hooks[0].t >= 2000 && !!(await page.$('.lp-done')), 'clicked at ' + clickedAt + 'ms, ' + JSON.stringify(hooks.map((h) => h.t)));
    await ctx.close();
  }

  const real = errors.filter((e) => !/Failed to load resource|503/.test(e));
  check('no page errors', real.length === 0, real.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
