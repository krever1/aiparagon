// v115 tests for new-aiparagon-dashboard.html (#1) and go.html: the sidebar by product (Touchpoint, Catalyst,
// Canvas, Pipeline, Atlas), Today, Deliverables, Landing pages (made from a funnel, edited, put live, ad links,
// paused, deleted), the sign-ups list and its CSV, the Ad Testing table of sign-ups per ad, and the public page at
// /go/<page> (what it shows, the form, what it sends, the thanks, a missing page, a preview, unsafe content).
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched. See tests/README.md.
// Usage: node tests/dashboard-v115.test.js
const path = require('path');
const H = require('./lib/dashboard-harness');
const { makeStore } = require('./lib/rest-stub');
const FX = require('./lib/qa-fixtures');

const ROOT = path.resolve(__dirname, '..');
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const N8N = 'https://n8n.aiparagonconsulting.com/webhook/';
const SITE = 'https://aiparagon.vercel.app';
let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const WEBINAR = '00000000-0000-4000-8000-0000000000b2';
const LIVE = '00000000-0000-4000-8000-0000000c1001';

// the QA tables plus a Funnel Builder webinar that still has a placeholder, and (when asked) a live page with sign-ups
function tables(withLive) {
  const t = FX.tables();
  t.landing_pages = []; t.lp_signups = []; t.lp_views = [];
  t.e1_leads[1].interview_url = 'javascript:alert(1)';
  t.funnel_packages.push({ id: WEBINAR, run_id: 'funnel_2026-10-14_1200_abcd', funnel_type: 'webinar', status: 'approved', created_at: '2026-10-14T12:00:00Z',
    setup: { title: 'Governed AI for RIAs', details: { 'Date and time': '[ADD DATE]' }, review_flags: ['Check the date'] },
    ad_variations: { variants: [{ hook: 'Your AI pilot is not a plan yet', primary_text: 'Join us', headline: 'Governed AI', cta: 'Save my seat' }, { hook: 'Second hook', headline: 'B' }, { hook: 'Third hook' }] },
    steps: [{ key: 'registration_page', title: 'Registration page', content: { headline: 'Governed AI for RIAs', subheadline: 'A 45 minute session — for operators',
      bullets: ['One', 'Two', 'Three'], who: 'COOs at RIAs', when: '[ADD DATE]', presenter: 'QA Tester', cta: 'Save my seat', fields: ['Name', 'Email', 'Firm'] } },
      { key: 'confirmation_page', title: 'Confirmation page', content: { headline: 'You are in', body: 'We sent the details.', cta: 'Add it to your calendar' } }] });
  if (withLive) {
    t.landing_pages.push({ id: LIVE, slug: 'spring-webinar', title: 'Spring webinar', status: 'live', kind: 'webinar', source_type: 'funnel_package', source_id: null,
      content: { headline: 'Spring webinar', cta: 'Save my seat', fields: ['name', 'email'], thanks: { headline: 'Done' } }, add_to_pipeline: true,
      ads: [{ code: 'PK7Q2-A1', n: 1, hook: 'Hook one' }, { code: 'PK7Q2-A2', n: 2, hook: 'Hook two' }],
      created_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-12T10:00:00Z', published_at: '2026-10-10T11:00:00Z' });
    const day = new Date().toISOString().slice(0, 10);
    t.lp_views.push({ page_id: LIVE, day, ad_code: 'PK7Q2-A1', views: 40 }, { page_id: LIVE, day, ad_code: '', views: 10 });
    const now = Date.now(), iso = (m) => new Date(now - m * 60000).toISOString();
    t.lp_signups.push(
      { id: 's1', page_id: LIVE, slug: 'spring-webinar', name: 'Jamie Sample', email: 'jamie@example.com', company: 'Sample Co', job_title: 'COO', utm: { source: 'meta', content: 'PK7Q2-A1' }, ad_code: 'PK7Q2-A1', hubspot_id: '901', lead_added: true, created_at: iso(30) },
      { id: 's2', page_id: LIVE, slug: 'spring-webinar', name: 'Alex Example', email: 'alex@example.com', company: 'Example LLC', utm: { source: 'linkedin', content: 'PK7Q2-A1' }, ad_code: 'PK7Q2-A1', hubspot_error: 'This app is missing a scope', lead_added: false, created_at: iso(90) },
      { id: 's3', page_id: LIVE, slug: 'spring-webinar', name: 'Robin Direct', email: 'robin.d@example.com', company: '=HYPERLINK("http://bad.example","x")', utm: {}, ad_code: null, lead_added: false, created_at: iso(200) });
    t.e1_leads.push({ email: 'jamie@example.com', prospect_name: 'Jamie Sample', company_name: 'Sample Co', lead_source: 'Landing page · Spring webinar', status: 'new', created_at: iso(30), updated_at: iso(30) });
    t.content_results = [{ id: 'r1', kind: 'ad', title: 'PK7Q2-A1 Spring webinar', platform: 'meta', spend: 120, leads: 3, impressions: 4000, clicks: 80, attribution: 'api', created_at: iso(60) },
      { id: 'r2', kind: 'ad', title: 'Another ad entirely', platform: 'meta', spend: 999, leads: 1, attribution: 'api', created_at: iso(60) }];
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
    const store = makeStore(tables(opts.live));
    const hooks = [];
    const hook = (u, m, b) => { hooks.push({ p: u.slice(N8N.length), b: J(b || '') }); return { body: { ok: true } }; };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: !opts.realClock });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1200);
    return { ctx, page, store, hooks };
  }
  const st = (page) => page.evaluate(() => ({ cur: apCurrentView(), path: location.pathname, title: document.title, prod: V115.prod,
    open: [...document.querySelectorAll('#nwNav .nw-prod-btn[aria-expanded="true"]')].map((b) => b.dataset.prod),
    crumb: ((document.getElementById('nwCrumb') || {}).innerText || '').replace(/\s+/g, ' ').trim() }));
  const txt = (page, sel) => page.evaluate((s) => ((document.querySelector(s) || {}).innerText || '').replace(/\s+/g, ' ').trim(), sel);
  const wait = (page, ms) => page.waitForTimeout(ms || 400);
  const writes = (store, table, method) => store.writes.filter((w) => w.table === table && (!method || w.method === method));

  // 1. the sidebar by product, and Today
  {
    const { ctx, page } = await open('/dashboard');
    let s = await st(page);
    check('Today is home: /dashboard/today, its tab title and the top bar', s.cur === 'today' && s.path === '/dashboard/today' && s.title === 'Today · AI Paragon' && s.crumb === 'Touchpoint Today', JSON.stringify(s));
    const prods = await page.evaluate(() => [...document.querySelectorAll('#nwNav .nw-prod-btn')].map((b) => b.querySelector('b span').textContent + '|' + b.querySelector('small').textContent));
    check('five products with their few-word descriptions', JSON.stringify(prods) === JSON.stringify(['Touchpoint|Home and tasks', 'Catalyst|Clients and meetings', 'Canvas|Client deliverables', 'Pipeline|Content and ads', 'Atlas|Knowledge and files']), JSON.stringify(prods));
    check('only the product you are in is open, and there is no engine switcher', s.open.join() === 'touch' && !(await page.$('#nwEng')) && !(await page.$('#nwMenu')), JSON.stringify(s));
    const widths = await page.evaluate(() => [...document.querySelectorAll('#nwNav .nw-prod-btn small')].map((e) => e.scrollWidth <= e.clientWidth + 1));
    check('no product description is cut off', widths.every(Boolean), JSON.stringify(widths));
    const cards = await page.evaluate(() => [...document.querySelectorAll('#main .nw-widgets > section .nw-kicker:first-child')].map((k) => k.textContent));
    check('Today has Needs you, Quick start, Your workspace, Recent runs and Latest sign-ups', ['Needs you', 'Quick start', 'Your workspace', 'Recent runs', 'Latest sign-ups'].every((k) => cards.includes(k)), JSON.stringify(cards));
    const quick = await page.evaluate(() => [...document.querySelectorAll('#main .nw-quick button b')].map((b) => b.textContent));
    check('quick starts reach both engines and the landing pages', JSON.stringify(quick) === JSON.stringify(['Run Catalyst for a lead', 'Make an ad campaign', 'Turn content into a post', 'Put a landing page live']), JSON.stringify(quick));
    const chips = await page.evaluate(() => [...document.querySelectorAll('#main .v115-prod')].map((p) => p.querySelector('b').textContent + ':' + p.querySelectorAll('.v115-prod-l button').length));
    check('Your workspace lists each product with its pages', JSON.stringify(chips) === JSON.stringify(['Touchpoint:3', 'Catalyst:4', 'Canvas:1', 'Pipeline:9', 'Atlas:4']), JSON.stringify(chips));
    await page.click('#main .v115-prod:nth-child(4) .v115-prod-l button:has-text("Landing pages")'); await wait(page, 700);
    s = await st(page);
    check('a page chip on Today opens it, with its product open', s.cur === 'e3landing' && s.path === '/dashboard/landing-pages' && s.open.join() === 'pipe' && s.crumb === 'Pipeline Landing pages', JSON.stringify(s));
    // G then a letter
    await page.click('#main h1'); await page.keyboard.press('g'); await page.keyboard.press('o'); await wait(page, 600);
    s = await st(page);
    check('G then O on a Pipeline page opens the Pipeline Overview', s.cur === 'e3overview' && s.title === 'Pipeline overview · AI Paragon', JSON.stringify(s));
    await page.keyboard.press('g'); await page.keyboard.press('l'); await wait(page, 600);
    await page.keyboard.press('g'); await page.keyboard.press('o'); await wait(page, 600);
    s = await st(page);
    check('G then L opens the Lead pipeline, and G then O there opens the Catalyst Overview', s.cur === 'e1overview' && s.title === 'Catalyst overview · AI Paragon' && s.open.join() === 'cat', JSON.stringify(s));
    await page.keyboard.press('g'); await page.keyboard.press('h'); await wait(page, 600);
    s = await st(page);
    check('G then H goes home to Today', s.cur === 'today', JSON.stringify(s));
    // the product names on the page headers
    const heads = {};
    for (const v of ['approvals', 'e3intel', 'e3ads', 'e3testing', 'e3history', 'calls', 'hubspot', 'kb', 'tasks', 'learning']) {
      await page.evaluate((x) => apGo(x), v); await wait(page, 900);
      heads[v] = await page.evaluate(() => { const e = [...document.querySelectorAll('#main .nw-ph-eyebrow, #apChrome .rd-eyebrow, .page.on .rd-eyebrow, .page.on .eyebrow')].find((x) => x.offsetParent !== null); return e ? e.textContent.trim() : ''; });
    }
    check('page headers name the product: Approvals, Intel Tracker, Ad Strategist, Ad Testing', heads.approvals === 'Touchpoint' && heads.e3intel === 'Pipeline · Agent 1' && heads.e3ads === 'Pipeline · Agent 2' && heads.e3testing === 'Pipeline · Results', JSON.stringify(heads));
    check('and Runs & uploads, Calls, HubSpot contacts, the Knowledge base, Tasks and AI settings', heads.e3history === 'Pipeline' && /^Catalyst/.test(heads.calls) && /^Catalyst/.test(heads.hubspot) &&
      heads.kb === 'Atlas' && heads.tasks === 'Touchpoint' && heads.learning === 'Settings', JSON.stringify(heads));
    const tour = await page.evaluate(() => NW_TOUR[0].t + ' | ' + NW_TOUR[0].p);
    check('the tour starts with the five products', /Five products/.test(tour) && /Touchpoint/.test(tour) && /Atlas/.test(tour) && !/Switch engines/.test(tour), tour);
    // the narrow sidebar: a product opens on its first page
    await page.click('#nwCollapseBtn'); await wait(page, 300);
    await page.click('#nwNav .nw-prod-btn[data-prod="canvas"]'); await wait(page, 800);
    s = await st(page);
    check('in the narrow sidebar a product opens on its first page (Canvas, Deliverables)', s.cur === 'deliverables' && s.path === '/dashboard/deliverables', JSON.stringify(s));
    await page.click('#nwCollapseBtn'); await wait(page, 200);
    await ctx.close();
  }

  // 2. Deliverables: Engine 1 documents and call write-ups
  {
    const { ctx, page } = await open('/dashboard/deliverables');
    const rows = () => page.evaluate(() => [...document.querySelectorAll('#v115DlList .v115-dl-row')].map((r) => r.querySelector('.nw-row-title').textContent + ' | ' + r.querySelector('.nw-row-prev').textContent));
    let r = await rows();
    const pdfs = await page.evaluate(() => [...document.querySelectorAll('#v115DlList a')].map((a) => a.getAttribute('href')));
    check('PDF links are only ever web addresses', pdfs.length > 0 && pdfs.every((h) => /^https?:\/\//.test(h)), JSON.stringify(pdfs));
    check('every document made for a client: 6 from Engine 1 and 1 call write-up', r.length === 7 && r.filter((x) => /Pat QA|Robin Test/.test(x)).length === 6 && r.some((x) => /QA weekly sync/.test(x)), JSON.stringify(r));
    check('the header counts them', /7\s*documents/.test(await txt(page, '#main .nw-stats')) && /6\s*from Catalyst/.test(await txt(page, '#main .nw-stats')), await txt(page, '#main .nw-stats'));
    await page.click('#main .nw-seg button:has-text("Calls")'); await wait(page);
    r = await rows();
    check('the Calls filter shows the call write-up only', r.length === 1 && /QA weekly sync/.test(r[0]), JSON.stringify(r));
    await page.click('#main .nw-seg button:has-text("All")'); await wait(page);
    await page.fill('#main .v115-q', 'robin'); await wait(page);
    r = await rows();
    check('search finds a lead by name and keeps the search box', r.length === 1 && /Robin Test/.test(r[0]) && (await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('v115-q'))), JSON.stringify(r));
    await page.fill('#main .v115-q', ''); await wait(page);
    await page.click('#v115DlList .v115-dl-row:has-text("QA weekly sync") button:has-text("Open")'); await wait(page, 900);
    let s = await page.evaluate(() => ({ cur: apCurrentView(), sel: AP_FT.sel }));
    check('a call write-up opens on Calls with that call picked', s.cur === 'calls' && s.sel === 'fathom-qa-1', JSON.stringify(s));
    await page.evaluate(() => apGo('deliverables')); await wait(page, 900);
    await page.click('#v115DlList .v115-dl-row:has-text("Robin Test") button:has-text("Open")'); await wait(page, 1200);
    s = await page.evaluate(() => ({ cur: apCurrentView(), view: state.view, lead: state.e1Lead }));
    check('an Engine 1 document opens the lead', s.cur === 'e1pipeline' && s.view === 'e1lead' && s.lead === FX.L2, JSON.stringify(s));
    await ctx.close();
  }

  // 3. Landing pages: made from a funnel, edited, checked, put live, ad links, paused; a draft deleted
  {
    const { ctx, page, store } = await open('/dashboard/landing-pages');
    check('no pages yet: the empty state says how to start', /No landing pages yet/.test(await txt(page, '#main .nw-tabpanel')), await txt(page, '#main .nw-tabpanel'));
    await page.click('#main .nw-ph-actions button:has-text("Put a page live")'); await wait(page, 900);
    const picks = await page.evaluate(() => [...document.querySelectorAll('#v115PickB .nw-row')].map((r) => r.innerText.replace(/\s+/g, ' ')));
    check('the picker lists the funnels and campaigns to put live', picks.length === 2 && picks.some((x) => /Governed AI for RIAs/.test(x) && /Webinar/.test(x)) && picks.some((x) => /Book a call/.test(x)), JSON.stringify(picks));
    await page.click('#v115PickB .nw-row:has-text("Governed AI for RIAs") button:has-text("Use this")'); await wait(page, 1200);
    const made = writes(store, 'landing_pages', 'POST')[0];
    const b = made && (Array.isArray(made.body) ? made.body[0] : made.body);
    check('Use this makes a draft page from the funnel', !!b && b.status === 'draft' && b.kind === 'webinar' && b.slug === 'governed-ai-for-rias' && b.source_id === WEBINAR, JSON.stringify(b && { s: b.status, k: b.kind, slug: b.slug }));
    check('the page carries the registration step and the confirmation after it', b && b.content.headline === 'Governed AI for RIAs' && b.content.bullets.length === 3 && b.content.presenter === 'QA Tester' && b.content.thanks.headline === 'You are in' && b.content.thanks.body === 'We sent the details.', JSON.stringify(b && b.content));
    check('the form fields come from the funnel (Name, Email, Firm)', b && JSON.stringify(b.content.fields) === JSON.stringify(['name', 'email', 'company']), JSON.stringify(b && b.content.fields));
    check('no em dashes reach the page, and the review flags ride along', b && !/[—–]/.test(JSON.stringify(b.content)) && JSON.stringify(b.content.flags) === JSON.stringify(['Check the date']), b && b.content.subheadline);
    const codes = b ? b.ads.map((a) => a.code) : [];
    check('each of the three ads gets a code from one page code', codes.length === 3 && /^P[A-Z2-9]{4}-A1$/.test(codes[0]) && codes[1] === codes[0].replace(/1$/, '2') && codes[2] === codes[0].replace(/1$/, '3'), JSON.stringify(codes));
    check('sign-ups go to the lead pipeline by default', b && b.add_to_pipeline === true);
    check('the editor opens on the new page', !!(await page.$('#v115LpD')) && /Governed AI for RIAs/.test(await txt(page, '#v115LpD .nw-d-title')));
    check('it lists the placeholder still to fill in', /\[ADD DATE\]/.test(await txt(page, '#v115LpD .v115-holes')), await txt(page, '#v115LpD .v115-holes'));
    const before = writes(store, 'landing_pages', 'PATCH').length;
    await page.click('#v115LpD button:has-text("Put it live")'); await wait(page);
    check('a page with a placeholder cannot go live', writes(store, 'landing_pages', 'PATCH').length === before && /Fill in \[ADD DATE\]/.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    await page.fill('#v115E-when', 'Thursday 6 November, 11am Pacific');
    await page.click('#v115LpD button:has-text("Put it live")'); await wait(page);
    check('the review flags must be ticked first', writes(store, 'landing_pages', 'PATCH').length === before && /I checked these/.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    await page.fill('#v115E-thu', 'javascript:alert(1)'); await page.check('#v115E-ok');
    await page.click('#v115LpD button:has-text("Put it live")'); await wait(page);
    check('a button link that is not https is refused', writes(store, 'landing_pages', 'PATCH').length === before && /https/.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    await page.fill('#v115E-thu', 'https://calendly.com/qa/intro');
    await page.fill('#v115E-bullets', 'One\nTwo\n\nThree — with a dash\nFour');
    await page.click('#v115LpD [data-f="phone"]');
    await page.click('#v115LpD button:has-text("Put it live")'); await wait(page, 900);
    const live = writes(store, 'landing_pages', 'PATCH').slice(-1)[0];
    check('Put it live saves it as live, with the time it went live', live && live.body.status === 'live' && !!live.body.published_at, JSON.stringify(live && live.body.status));
    check('the edits are saved: when, points (blank line dropped, dash gone), phone field, booking link', live && live.body.content.when === 'Thursday 6 November, 11am Pacific' &&
      JSON.stringify(live.body.content.bullets) === JSON.stringify(['One', 'Two', 'Three, with a dash', 'Four']) && live.body.content.fields.includes('phone') && live.body.content.thanks.url === 'https://calendly.com/qa/intro', JSON.stringify(live && live.body.content));
    await wait(page, 500);
    const adm = await txt(page, '#v115AdsM');
    check('the ad links open next, one block per ad with its code', /Ad links/.test(adm) && codes.every((c) => adm.includes(c)), adm.slice(0, 200));
    const urls = await page.evaluate(() => [...document.querySelectorAll('#v115AdsM code')].map((c) => c.textContent));
    check('each ad has a Meta, a LinkedIn and a post link with the right tracking', urls.length === 9 &&
      urls[0] === SITE + '/go/governed-ai-for-rias?utm_source=meta&utm_medium=paid&utm_campaign=governed-ai-for-rias&utm_content=' + codes[0] &&
      urls[1].includes('utm_source=linkedin&utm_medium=paid') && urls[2].includes('utm_source=post&utm_medium=organic'), JSON.stringify(urls.slice(0, 3)));
    await page.click('#v115AdsM button[aria-label="Close"]'); await wait(page);
    const row = await txt(page, '#main .v115-lp-row');
    check('the page shows as live with its address', /Live/.test(row) && /aiparagon\.vercel\.app\/go\/governed-ai-for-rias/.test(row) && /0 visits in 30 days/.test(row), row);
    await page.click('#main .v115-lp-row button:has-text("Edit")'); await wait(page, 500);
    await page.click('#v115LpD button:has-text("Pause")'); await wait(page, 900);
    check('Pause takes it offline', writes(store, 'landing_pages', 'PATCH').slice(-1)[0].body.status === 'paused' && /Paused/.test(await txt(page, '#main .v115-lp-row')), await txt(page, '#main .v115-lp-row'));
    // a book-a-call campaign: its landing page, its qualifying questions and its booking page
    await page.click('#main .nw-ph-actions button:has-text("Put a page live")'); await wait(page, 900);
    const pk = await page.evaluate(() => [...document.querySelectorAll('#v115PickB .nw-row')].map((r) => r.innerText.replace(/\s+/g, ' ')));
    check('a funnel that already has a page says so', pk.some((x) => /Governed AI for RIAs/.test(x) && /Paused/.test(x) && /Open its page/.test(x)), JSON.stringify(pk));
    await page.click('#v115PickB .nw-row:has-text("Book a call") button:has-text("Use this")'); await wait(page, 1200);
    const bc = writes(store, 'landing_pages', 'POST')[1];
    const c2 = bc && (Array.isArray(bc.body) ? bc.body[0] : bc.body);
    check('a book-a-call page takes the campaign\'s landing page, questions and booking page', c2 && c2.kind === 'book_call' && c2.content.headline === 'Find the hours you lose to manual work' &&
      c2.content.questions.length === 2 && c2.content.questions[0].label === 'Annual revenue?' && c2.content.thanks.headline === 'Pick a time', JSON.stringify(c2 && c2.content));
    await page.fill('#v115E-slug', 'governed-ai-for-rias');
    await page.click('#v115LpD .nw-d-foot button:has-text("Save")'); await wait(page);
    check('an address another page uses is refused', /Another page already uses that address/.test(await txt(page, '#v115E-msg')), await txt(page, '#v115E-msg'));
    const draftId = (store.db.landing_pages.find((p) => p.kind === 'book_call') || {}).id;
    await page.click('#v115LpD button:has-text("Delete")'); await wait(page, 900);
    const del = writes(store, 'landing_pages', 'DELETE').slice(-1)[0];
    check('a draft that never went live can be deleted', !!draftId && !!del && JSON.stringify(del.filters) === JSON.stringify([['id', 'eq.' + draftId]]) && (await page.$$('#main .v115-lp-row')).length === 1, JSON.stringify(del));
    await page.click('#main .v115-lp-row button:has-text("Edit")'); await wait(page, 500);
    check('a page that has been live offers no Delete', !(await page.$('#v115LpD button:has-text("Delete")')));
    await page.keyboard.press('Escape'); await page.evaluate(() => nwDrawerClose());
    await ctx.close();
  }

  // 4. the funnel's own drawer puts its page live; sign-ups and their CSV; Ad Testing counts sign-ups per ad
  {
    const { ctx, page, store } = await open('/dashboard/landing-pages', { live: true, realClock: true });
    const t = await txt(page, '#main .nw-stats');
    check('the header counts live pages, visits and sign-ups in 30 days', /1\s*live/.test(t) && /50\s*visits in 30 days/.test(t) && /3\s*sign-ups in 30 days/.test(t) && /6%\s*sign-up rate/.test(t), t);
    await page.click('#main .nw-tabs button:has-text("Sign-ups")'); await wait(page);
    const su = await page.evaluate(() => [...document.querySelectorAll('#v115SuList tbody tr')].map((r) => [...r.cells].map((c) => c.innerText.replace(/\s+/g, ' ').trim())));
    check('the sign-ups table lists each one with page, source, HubSpot and lead', su.length === 3 && su[0][1].startsWith('Jamie Sample') && su[0][4] === 'Spring webinar' && su[0][5] === 'PK7Q2-A1 · meta' && su[0][6] === 'Added' && su[0][7] === 'Open lead' &&
      su[1][6] === 'Not added' && su[2][5] === 'Direct', JSON.stringify(su));
    await page.fill('#main .v115-q', 'example llc'); await wait(page);
    check('search narrows the sign-ups', (await page.$$('#v115SuList tbody tr')).length === 1);
    await page.fill('#main .v115-q', ''); await wait(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#main button:has-text("Export CSV")')]);
    const csv = await new Promise((res) => { const chunks = []; dl.createReadStream().then((s) => { s.on('data', (c) => chunks.push(c)); s.on('end', () => res(Buffer.concat(chunks).toString('utf8'))); }); });
    const lines = csv.trim().split('\n');
    check('Export CSV downloads every sign-up with a header row', /^sign-ups-\d{4}-\d\d-\d\d\.csv$/.test(dl.suggestedFilename()) && lines.length === 4 && /^When,Name,Email,Company/.test(lines[0]) && lines.some((l) => /jamie@example\.com/.test(l) && /,Added,Yes$/.test(l)), lines.join(' / '));
    check('a value a spreadsheet would run as a formula is kept as text', lines.some((l) => l.includes('"\'=HYPERLINK(""http://bad.example"",""x"")"')) && !lines.some((l) => /,=HYPERLINK/.test(l)), lines.filter((l) => /HYPERLINK/.test(l)).join(' / '));
    await page.click('#v115SuList button:has-text("Open lead")'); await wait(page, 1200);
    let s = await page.evaluate(() => ({ cur: apCurrentView(), view: state.view, lead: state.e1Lead }));
    check('Open lead goes to the lead in Catalyst', s.cur === 'e1pipeline' && s.view === 'e1lead' && s.lead === 'jamie@example.com', JSON.stringify(s));
    // Ad Testing
    await page.evaluate(() => { RD.aptab.testing = 'results'; apGo('e3testing'); }); await wait(page, 1800);
    const adt = await page.evaluate(() => [...document.querySelectorAll('#main .v115-adt tbody tr')].map((r) => [...r.cells].map((c) => c.innerText.trim())));
    check('Ad Testing counts visits, sign-ups and spend per ad code', adt.length === 3 && adt[0][0].startsWith('PK7Q2-A1') && adt[0][2] === '40' && adt[0][3] === '2' && adt[0][4] === '5%' && adt[0][5] === '$120' && adt[0][6] === '$60', JSON.stringify(adt));
    check('an ad with nothing yet shows zeros, and visits without a code have their own row', adt[1][0].startsWith('PK7Q2-A2') && adt[1][3] === '0' && adt[1][5] === '' && /without an ad code/.test(adt[2][0]) && adt[2][2] === '10' && adt[2][3] === '1', JSON.stringify(adt.slice(1)));
    // the funnel drawer
    await page.evaluate(async () => { await v113FunLoad(true); v113FunOpen('00000000-0000-4000-8000-0000000000b2'); }); await wait(page, 600);
    check('the funnel\'s drawer can put its page live', !!(await page.$('#v113FunD .v115-golive')) && /Put its page live/.test(await txt(page, '#v113FunD .v113-real')), await txt(page, '#v113FunD .v113-real'));
    await page.click('#v113FunD .v115-golive'); await wait(page, 1500);
    s = await page.evaluate(() => ({ cur: apCurrentView(), drawer: !!document.getElementById('v115LpD'), title: ((document.querySelector('#v115LpD .nw-d-title') || {}).textContent || '') }));
    check('it opens Landing pages with the new page in the editor', s.cur === 'e3landing' && s.drawer && /Governed AI for RIAs/.test(s.title) && writes(store, 'landing_pages', 'POST').length === 1, JSON.stringify(s));
    await page.keyboard.press('Escape');
    // Today's latest sign-ups
    await page.evaluate(() => apGo('today')); await wait(page, 1500);
    // only the Latest sign-ups card: Needs you can list the new lead too, once older items age out of it
    const ls = await page.evaluate(() => { const k = [...document.querySelectorAll('#main .nw-widgets > section')].find((s) => /Latest sign-ups/i.test(s.innerText));
      return k ? [...k.querySelectorAll('.nw-mini-row')].map((r) => r.innerText.replace(/\s+/g, ' ')).filter((x) => /Jamie|Alex|Robin Direct/.test(x)) : []; });
    check('Today shows the latest sign-ups', ls.length === 3 && /Jamie Sample/.test(ls[0]), JSON.stringify(ls));
    await ctx.close();
  }

  // 5. the public page at /go/<page>
  const PAGE = { slug: 'spring-webinar', title: 'Spring webinar', kind: 'webinar', brand: { name: 'AI Paragon', website: 'https://www.aiparagonconsulting.com/' },
    content: { headline: 'Governed AI for RIAs', subheadline: 'A 45 minute session.', when: 'Thu 6 Nov, 11am PT', presenter: 'QA Tester', who: 'COOs at RIAs',
      bullets: ['One', 'Two'], sections: [{ title: 'What we cover', body: 'First part.\n\nSecond part.' }], faq: [{ q: 'Is it recorded?', a: 'Yes.' }],
      cta: 'Save my seat', fields: ['name', 'email', 'company', 'phone'], questions: [{ key: 'q1', label: 'Firm size?', options: ['1-10', '11-50'] }, { key: 'q2', label: 'Hidden one', off: true }],
      thanks: { headline: 'You are registered', body: 'Check your inbox.', cta: 'Add to calendar', url: 'https://calendly.com/qa/intro' } } };
  async function openGo(url, o) {
    o = o || {};
    const calls = { rpc: [], hook: [], rest: [] };
    const store = makeStore({ landing_pages: o.draft ? [o.draft] : [] });
    const hook = (u, m, b) => { calls.hook.push({ p: u.slice(N8N.length), b: J(b || '') }); return o.reply || { body: { ok: true } }; };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: !!o.seed, rest: { handle: (m, p, b, h) => { calls.rest.push({ m, p, h }); return store.handle(m, p, b, h); } }, hooks: hook, bucket: errors });
    if (o.width) await page.setViewportSize({ width: o.width, height: 800 });
    await page.route(SB + '/rest/v1/rpc/lp_public', (route) => {
      calls.rpc.push(J(route.request().postData() || ''));
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o.page === undefined ? PAGE : o.page) });
    });
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    return { ctx, page, calls };
  }
  {
    const { ctx, page, calls } = await openGo('/go/spring-webinar?utm_source=meta&utm_medium=paid&utm_campaign=spring-webinar&utm_content=PK7Q2-A1&utm_x=no');
    check('the page asks for its content once, with the ad code, and counts the visit', calls.rpc.length === 1 && calls.rpc[0].p_slug === 'spring-webinar' && calls.rpc[0].p_code === 'PK7Q2-A1' && calls.rpc[0].p_view === true, JSON.stringify(calls.rpc));
    const v = await page.evaluate(() => ({ title: document.title, h1: (document.querySelector('h1') || {}).textContent, kicker: (document.querySelector('.lp-kicker') || {}).textContent, brand: (document.querySelector('.lp-brand') || {}).textContent,
      meta: (document.querySelector('.lp-meta') || {}).innerText, bullets: document.querySelectorAll('.lp-bullets li').length, secP: document.querySelectorAll('.lp-sec p').length, faq: document.querySelectorAll('.lp-faq details').length,
      labels: [...document.querySelectorAll('.lp-field label')].map((l) => l.textContent), btn: (document.querySelector('.lp-f button') || {}).textContent, privacy: (document.querySelector('.lp-privacy a') || {}).getAttribute('href') }));
    check('it shows the headline, brand, kicker and the when, who presents and who it is for', v.title === 'Governed AI for RIAs · AI Paragon' && v.h1 === 'Governed AI for RIAs' && v.brand === 'AI Paragon' && v.kicker === 'Webinar' && /When Thu 6 Nov/.test(v.meta) && /With QA Tester/.test(v.meta) && /For COOs at RIAs/.test(v.meta), JSON.stringify(v));
    check('points, sections in paragraphs and the questions people ask', v.bullets === 2 && v.secP === 2 && v.faq === 1, JSON.stringify(v));
    check('the form has the page\'s fields, the qualifying question (not the one switched off), its button and the privacy link',
      JSON.stringify(v.labels) === JSON.stringify(['Full name', 'Work email', 'Company', 'Phoneoptional', 'Firm size?optional']) && v.btn === 'Save my seat' && v.privacy === '/privacy-policy.html', JSON.stringify(v));
    await page.click('.lp-f button[type=submit]'); await page.waitForTimeout(200);
    check('an empty form says what is missing and sends nothing', /Fill in full name/.test(await txt(page, '.lp-err')) && calls.hook.length === 0, await txt(page, '.lp-err'));
    await page.fill('#lp-name', 'Pat Example'); await page.fill('#lp-email', 'not-an-email'); await page.fill('#lp-company', 'Example Firm');
    await page.click('.lp-f button[type=submit]'); await page.waitForTimeout(200);
    check('a bad email is caught before it is sent', /Check the email address/.test(await txt(page, '.lp-err')) && calls.hook.length === 0 && (await page.getAttribute('#lp-email', 'aria-invalid')) === 'true');
    await page.fill('#lp-email', 'pat@example.com'); await page.selectOption('#lp-q1', '11-50');
    await page.waitForTimeout(2100);
    await page.click('.lp-f button[type=submit]'); await page.waitForTimeout(600);
    const sent = calls.hook[0] || {};
    const sb = sent.b || {};
    check('a good sign-up posts to the Landing Page · Sign-up workflow', sent.p === 'lp-signup' && sb.slug === 'spring-webinar' && sb.name === 'Pat Example' && sb.email === 'pat@example.com' && sb.company === 'Example Firm' && sb.phone === '', JSON.stringify(sb));
    check('with the tracking, the code, the time on the page, an empty hidden field and the answer', sb.code === 'PK7Q2-A1' && JSON.stringify(sb.utm) === JSON.stringify({ source: 'meta', medium: 'paid', campaign: 'spring-webinar', content: 'PK7Q2-A1' }) &&
      sb.t >= 2000 && sb.hp === '' && JSON.stringify(sb.answers) === JSON.stringify({ q1: '11-50' }) && !('auth' in sb), JSON.stringify(sb));
    const done = await page.evaluate(() => ({ h: (document.querySelector('.lp-done h2') || {}).textContent, a: document.querySelector('.lp-done a') && { href: document.querySelector('.lp-done a').href, t: document.querySelector('.lp-done a').textContent, target: document.querySelector('.lp-done a').target } }));
    check('then the thanks shows, with the booking button opening in a new tab', done.h === 'You are registered' && done.a && done.a.href === 'https://calendly.com/qa/intro' && done.a.t === 'Add to calendar' && done.a.target === '_blank', JSON.stringify(done));
    await ctx.close();
  }
  {
    const { ctx, page, calls } = await openGo('/go/spring-webinar', { reply: { status: 429, body: { ok: false, code: 'slow_down', message: 'Too many sign-ups from here. Try again in an hour.' } } });
    await page.fill('#lp-name', 'Pat Example'); await page.fill('#lp-email', 'pat@example.com'); await page.fill('#lp-company', 'Example Firm');
    await page.waitForTimeout(2100);
    await page.click('.lp-f button[type=submit]'); await page.waitForTimeout(600);
    check('a refusal from the workflow is shown and the button works again', calls.hook.length === 1 && /Too many sign-ups/.test(await txt(page, '.lp-err')) && !(await page.$('.lp-done')) && !(await page.getAttribute('.lp-f button[type=submit]', 'disabled')), await txt(page, '.lp-err'));
    await ctx.close();
  }
  {
    const { ctx, page } = await openGo('/go/nope-nope', { page: null });
    check('a page that is not live says it is not available', /This page is not available/.test(await txt(page, '.lp-gone')) && (await page.title()).startsWith('Not available'));
    await ctx.close();
  }
  {
    const { ctx, page, calls } = await openGo('/go/..%2F..%2Fetc');
    check('an odd address never asks Supabase', calls.rpc.length === 0 && /not available/.test(await txt(page, '.lp-gone')), JSON.stringify(calls.rpc));
    await ctx.close();
  }
  {
    const nasty = JSON.parse(JSON.stringify(PAGE));
    nasty.content.headline = '<img src=x onerror="window.__x=1">Hello';
    nasty.content.bullets = ['<script>window.__y=1</script>'];
    nasty.content.thanks.url = 'javascript:alert(1)';
    const { ctx, page } = await openGo('/go/spring-webinar', { page: nasty });
    const v = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, img: !!document.querySelector('h1 img'), x: window.__x, y: window.__y }));
    check('content is shown as text, never run', v.h1.startsWith('<img') && !v.img && v.x === undefined && v.y === undefined, JSON.stringify(v));
    await page.fill('#lp-name', 'Pat'); await page.fill('#lp-email', 'pat@example.com'); await page.fill('#lp-company', 'X');
    await page.waitForTimeout(2100); await page.click('.lp-f button[type=submit]'); await page.waitForTimeout(500);
    check('a button link that is not https is left out of the thanks', !!(await page.$('.lp-done')) && !(await page.$('.lp-done a')));
    await ctx.close();
  }
  {
    const draft = { id: 'd1', slug: 'draft-page', title: 'Draft page', kind: 'landing', status: 'draft', content: { headline: 'Still a draft', cta: 'Get in touch', fields: ['name', 'email'] } };
    const { ctx, page, calls } = await openGo('/go/draft-page?preview=1', { seed: true, draft });
    const v = await page.evaluate(() => ({ banner: (document.querySelector('.lp-preview') || {}).textContent, h1: (document.querySelector('h1') || {}).textContent }));
    const rest = calls.rest.find((r) => /landing_pages/.test(r.p));
    check('a preview from the dashboard reads the draft with the signed-in session', v.h1 === 'Still a draft' && /Preview, not live yet/.test(v.banner) && !!rest && /^Bearer qa-token/.test(rest.h.authorization || '') && calls.rpc.length === 0, JSON.stringify(v));
    await page.fill('#lp-name', 'Pat'); await page.fill('#lp-email', 'pat@example.com');
    await page.click('.lp-f button[type=submit]'); await page.waitForTimeout(300);
    check('and sign-ups are off in a preview', /preview/.test(await txt(page, '.lp-err')) && calls.hook.length === 0, await txt(page, '.lp-err'));
    await ctx.close();
  }
  {
    const { ctx, page } = await openGo('/go/spring-webinar', { width: 375 });
    const v = await page.evaluate(() => {
      const side = document.querySelector('.lp-side').getBoundingClientRect(), rest = document.querySelector('.lp-rest').getBoundingClientRect(), hero = document.querySelector('.lp-hero').getBoundingClientRect();
      return { scroll: document.documentElement.scrollWidth <= window.innerWidth, order: hero.bottom <= side.top + 1 && side.bottom <= rest.top + 1 };
    });
    check('on a phone nothing scrolls sideways and the form comes right after the top of the page', v.scroll && v.order, JSON.stringify(v));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST RUN CRASHED:', e); process.exit(2); });
