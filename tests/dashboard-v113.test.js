// v113 tests for new-aiparagon-dashboard.html (#1), the 18 October feedback round: the Ad Strategist (key
// takeaways, the fit score, use in the next ads brief, Utilize this ad copy, honest Live labels, the uploads
// overview), Content Transformation (the new formats, what the material is, questions per format, notes,
// written cards), Marketing Generation (campaign types, who it is for, the Funnel Builder, Calendly, posts
// and newsletters), Ad Testing and Integrations (Meta and LinkedIn ad numbers, what is working), Company
// profile drafts, and the small fixes (Educational, the briefs note, the tab title). Supabase answers from
// an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/e3-fixtures.js), and n8n webhooks
// answer from stubs, so no real account, data or workflow is touched. See tests/README.md.
// Usage: node tests/dashboard-v113.test.js
const path = require('path');
const H = require('./lib/dashboard-harness');
const { makeStore } = require('./lib/rest-stub');
const F = require('./lib/e3-fixtures');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

const UP = '00000000-0000-4000-8000-0000000000b1';
const upload = {
  id: UP, run_id: 'upload_2026-09-23', advertiser_name: 'Scribewell', source: 'swipe_file', ad_library_url: 'swipe:upload:x1', uploaded_by: 'qa@aiparagonconsulting.com',
  hook: 'Meeting notes that write themselves', body: 'Try it free for advisers.', cta: 'Learn more', format: 'static_image', first_seen: '2026-09-23', last_seen: '2026-09-23',
  is_active: true, stale_days: 0, days_running: null, performance_score: null, created_at: '2026-09-23T18:29:23Z', in_brief: true,
  extracted_patterns: ['Bottleneck identity hook: removes you as the bottleneck', 'Free event as lead magnet: zero-cost entry'],
  offer_inferred: 'A free virtual bootcamp for wealth advisers',
  upload_analysis: { status: 'done', takeaways: ['Open with the hidden cost of growth', 'Use a revenue-range qualifier'], visual: { visual_hook: 'An embedded post card', text_on_image: 'Advisers everywhere are turning to AI' }, confidence: 0.8 },
};
const FUNNEL = {
  id: '00000000-0000-4000-8000-0000000000f1', run_id: 'funnel_2026-10-14_qa', funnel_type: 'webinar', status: 'pending_approval', created_at: '2026-10-14T15:00:00Z', requested_by: 'qa@aiparagonconsulting.com',
  setup: { objective: 'Get registrations', details: { Title: 'Governed AI for RIAs' }, targeting: { titles: ['COO'], sizes: ['11 to 50'], market: 'RIAs', line: 'Job titles: COO. Company size: 11 to 50 people. Market: RIAs' } },
  ad_variations: { variants: [{ hook: 'Your AI pilot is not a plan', primary_text: 'Join the session.', headline: 'Governed AI in 90 days', cta: 'Save my seat', image_direction: 'A calm desk, one laptop' }, { hook: 'Regulators will ask', primary_text: 'Be ready.', headline: 'Ready for the questions', cta: 'Save my seat', image_direction: 'A checklist' }] },
  steps: [{ key: 'registration_page', title: 'Registration page', why: 'Where the ads send people', content: { headline: 'Governed AI for RIAs', bullets: ['The first 90 days', 'What to inventory', 'Who signs off'], cta: 'Save my seat' } },
    { key: 'reminders', title: 'Reminder emails', content: { emails: [{ subject: 'Tomorrow: governed AI', body: 'See you at noon.' }] } }],
};
const RESULTS = [
  { id: 'r1', kind: 'ad', title: 'Governance webinar ad', platform: 'Facebook ads', spend: 300, leads: 15, clicks: 120, impressions: 9000, attribution: 'api', source: 'meta', external_id: 'm1', period_start: '2026-10-13', posted_on: '2026-10-13', created_at: '2026-10-14T06:00:00Z' },
  { id: 'r2', kind: 'ad', title: 'Scorecard ad', platform: 'Instagram ads', spend: 200, leads: 2, clicks: 40, impressions: 5000, attribution: 'api', source: 'meta', external_id: 'm2', period_start: '2026-10-13', posted_on: '2026-10-13', created_at: '2026-10-14T06:00:00Z' },
  { id: 'r3', kind: 'ad', title: 'Diagnostic call ad', platform: 'LinkedIn ads', spend: 250, leads: 0, clicks: 30, impressions: 4000, attribution: 'api', source: 'linkedin', external_id: 'l1', period_start: '2026-10-13', posted_on: '2026-10-13', created_at: '2026-10-14T06:00:00Z' },
  { id: 'r4', kind: 'ad', title: 'Old manual ad', platform: 'Meta ads', spend: 100, leads: 5, attribution: 'manual', posted_on: '2026-10-01', created_at: '2026-10-02T06:00:00Z' },
];

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/marketing-generation');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  // one signed-in page on a fresh copy of the synthetic data; hooks[] records every n8n call
  async function open(url, opts) {
    opts = opts || {};
    const t = F.tables();
    t.winner_creatives.push(upload);                         // winner_creatives and ad_records are one array in the fixtures
    t.ai_settings.push({ key: 'ads_follow', value: { keywords: ['AI notes', 'advisers'], industries: ['Wealth management'], types: [], active: 'all', country: 'US' } });
    t.funnel_packages = [JSON.parse(JSON.stringify(FUNNEL))];
    t.content_results = JSON.parse(JSON.stringify(RESULTS));
    t.client_personas = opts.personas || [];
    t.client_proof = opts.proof || [];
    t.brand_voice = opts.voice || [];
    t.offers = [{ id: '00000000-0000-4000-8000-0000000000o1', name: 'AI Readiness Scorecard', price: 0, action: 'call', is_default: true, archived: false, created_at: '2026-07-23T18:10:34Z' }];
    if (opts.tweak) opts.tweak(t);
    const store = makeStore(t);
    const hooks = [];
    const S = { cal: !!opts.calendly, ads: opts.ads || {} };
    const hook = (u, m, b) => {
      let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) {}
      hooks.push({ u, b: body });
      if (/\/e3-calendly/.test(u)) {
        if (body.action === 'connect') { S.cal = true; return { body: { ok: true, connected: true } }; }
        if (body.action === 'disconnect') { S.cal = false; return { body: { ok: true, connected: false } }; }
        return { body: S.cal ? { ok: true, connected: true, user: { name: 'QA Tester' }, types: [{ name: 'Intro call', url: 'https://calendly.com/qa-team/intro', duration: 20, uri: 'https://api.calendly.com/event_types/QA1' }, { name: 'Diagnostic', url: 'https://calendly.com/qa-team/diagnostic', duration: 45, uri: 'https://api.calendly.com/event_types/QA2' }] } : { ok: true, connected: false, types: [] } };
      }
      if (/\/e3-ad-results/.test(u)) {
        if (body.action === 'connect') { S.ads[body.platform] = { connected: true, account_id: body.account_id, account_name: 'QA ' + body.platform }; return { body: { ok: true } }; }
        if (body.action === 'disconnect') { S.ads[body.platform] = { connected: false }; return { body: { ok: true } }; }
        if (body.action === 'sync') return { body: { ok: true, rows: 3 } };
        return { body: { ok: true, meta: S.ads.meta || { connected: false }, linkedin: S.ads.linkedin || { connected: false } } };
      }
      if (/\/e3-funnel-run/.test(u)) return { body: { ok: true, started: true, run_id: 'funnel_qa_new' } };
      if (/\/e3-profile-drafts/.test(u)) {
        // what the workflow does: saves drafts, then says how it went in ai_settings.profile_drafts
        const now = new Date().toISOString();
        if (body.what === 'personas' || body.what === 'all') store.db.client_personas.push({ id: '00000000-0000-4000-8000-0000000000p1', name: 'Operations lead at a growing RIA', role: 'COO', firm: 'RIA', size: '20 to 80 staff', pain: 'Too many AI tools and no plan', objection: 'We tried AI and it did not stick', source: 'ai_draft', ai_draft: true, is_default: true, archived: false, created_at: now, updated_at: now });
        if (body.what === 'proof' || body.what === 'all') store.db.client_proof.push({ id: '00000000-0000-4000-8000-0000000000q1', name: 'Scorecard results', kind: 'Client result', claim: 'Firms finish the scorecard in 10 minutes', source: 'Company profile', status: 'pending', ai_draft: true, archived: false, persona_ids: [], offer_ids: [], created_at: now, updated_at: now });
        if (body.what === 'voice' || body.what === 'all') store.db.brand_voice.push({ id: '00000000-0000-4000-8000-0000000000v1', created_at: now, about: 'We help advisers adopt AI with governance first.', tone: ['Plain', 'Direct'], summary: 'Short sentences\nNo hype', source: 'ai_draft', change_note: 'Drafted from the company profile' });
        const st = { key: 'profile_drafts', value: { state: 'done', at: now, personas: body.what === 'personas' || body.what === 'all' ? 1 : 0, proof: body.what === 'proof' || body.what === 'all' ? 1 : 0, voice: body.what === 'voice' || body.what === 'all' } };
        const ex = store.db.ai_settings.find((r) => r.key === 'profile_drafts'); if (ex) Object.assign(ex, st); else store.db.ai_settings.push(st);
        return { body: { ok: true, started: true } };
      }
      if (/\/regen-ad-image/.test(u)) return { body: { ok: true, url: 'https://lesyptuwllcgajdxzjje.supabase.co/storage/v1/object/public/creatives/' + body.file } };
      if (/\/ad-upload/.test(u)) return { body: { ok: true, analysis: { hook: 'Notes that write themselves', body: 'Try it', cta: 'Learn more', format: 'text' } } };
      if (/e3-ad-industries/.test(u)) return { body: { ok: true, industries: {} } };
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: true });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1300);
    return { ctx, page, store, hooks, S };
  }
  const ev = (page, fn, arg) => page.evaluate(fn, arg);
  const wait = (page, ms) => page.waitForTimeout(ms || 250);
  const last = (hooks, re) => hooks.filter((h) => re.test(h.u)).pop();

  // ---------------- A. the Ad Strategist ----------------
  {
    const { ctx, page, store } = await open('/dashboard/ad-strategist');
    await wait(page, 800);
    const a = await ev(page, async (id) => {
      nwAdOpen(id); await new Promise((r) => setTimeout(r, 250));
      const d = document.getElementById('nwAdD');
      return { secs: [...d.querySelectorAll('.nw-d-sec h4')].map((h) => h.textContent).join('|'), head: d.querySelector('.nw-pc-meta').textContent,
        key: d.querySelector('.v113-kt').textContent, fit: (d.querySelector('.v113-fit') || {}).textContent || '', btn: [...d.querySelectorAll('.nw-d-foot .nw-btn-primary')].map((b) => b.textContent).join(','),
        sw: !!d.querySelector('#v113InBrief') && d.querySelector('#v113InBrief').checked };
    }, UP);
    check('an upload opens on its key takeaways, first', /^Key takeaways\|/.test(a.secs) && /Open with the hidden cost of growth/.test(a.key) && /The image: An embedded post card/.test(a.key), a.secs);
    check('an upload says how it fits the strategy, scored against the Following tab', /How it fits your strategy/.test(a.key) && /Fit with what you follow: \d+ out of 100/.test(a.fit) && /“AI notes”/.test(a.fit), a.fit.slice(0, 160));
    check('an upload with no Ad Library days says Uploaded, not 0 days', /Uploaded 23 Sept/.test(a.head) && !/0 days/.test(a.head), a.head);
    check('the main button reads Utilize this ad copy', a.btn === 'Utilize this ad copy', a.btn);
    check('an upload goes into the next ads brief unless switched off', a.sw === true);
    await page.click('#v113InBrief'); await wait(page, 600);
    const pw = store.writes.filter((w) => w.method === 'PATCH' && /ad_records|winner_creatives/.test(w.table)).pop();
    check('switching it off saves ad_records.in_brief', pw && pw.table === 'ad_records' && pw.body.in_brief === false, pw && JSON.stringify(pw.body));
    await ev(page, () => nwDrawerClose());
    const lib = await ev(page, async () => {
      nwAdOpen('00000000-0000-4000-8000-0000000000a1'); await new Promise((r) => setTimeout(r, 250));
      const d = document.getElementById('nwAdD');
      const r = { head: d.querySelector('.nw-pc-meta').textContent, key: d.querySelector('.v113-kt').textContent };
      nwDrawerClose(); return r;
    });
    check('a library ad opens on what it does: the hook, the offer and the formula', /Opens with/.test(lib.key) && /Offers Free month-end audit/.test(lib.key), lib.key.slice(0, 160));
    check('Live comes with how many days it ran', /Live/.test(lib.head) && /days running/.test(lib.head), lib.head);
    await page.click('#v113InBrief').catch(() => {});
    await ev(page, () => { nwAdsGoTab('swipe'); }); await wait(page, 400);
    const ov = await ev(page, () => (document.querySelector('.v113-upov') || {}).textContent || '');
    check('Uploads opens with what the uploads show: patterns, takeaways and offers', /What they show/.test(ov) && /Bottleneck identity hook/.test(ov) && /A free virtual bootcamp/.test(ov) && /1 upload/.test(ov), ov.slice(0, 200));
    await ev(page, () => apOpenAdUpload()); await wait(page, 150);
    const dlg = await ev(page, () => {
      const c = document.getElementById('v113UpIn'), on = !!c && c.checked;
      const r1 = apAdRowFromAnalysis({ urls: [], link: '', copy: 'x', adv: 'A', plat: 'meta', analysis: null, error: 'e', idx: 0 }).in_brief;
      c.checked = false;
      const r2 = apAdRowFromAnalysis({ urls: [], link: '', copy: 'x', adv: 'A', plat: 'meta', analysis: null, error: 'e', idx: 0 }).in_brief;
      apCloseAdUpload(); return { on, r1, r2 };
    });
    check('every upload asks to use it in the brief, yes by default, and saves the answer', dlg.on === true && dlg.r1 === true && dlg.r2 === false, JSON.stringify(dlg));
    const cap = await ev(page, () => document.body.innerHTML.indexOf('Live means it was still running when the agent pulled it.') < 0);
    check('the Live caption no longer says it was running when pulled', cap);
    check('the tab names the page', (await page.title()) === 'Ad Strategist · AI Paragon', await page.title());
    await ctx.close();
  }

  // ---------------- B. Content Transformation ----------------
  {
    const { ctx, page, store, hooks } = await open('/dashboard/content-transformation');
    const g = await ev(page, () => ({ groups: [...document.querySelectorAll('#nwCtForm .v113-tg-g > .nw-faint')].map((x) => x.textContent).join('|'),
      tiles: [...document.querySelectorAll('#nwCtForm .v113-tg .nw-tile')].map((x) => x.dataset.k).join(',') }));
    check('the formats come in groups', g.groups === 'Posts and emails|Long reads|Events and decks|Video|Something else', g.groups);
    check('reports, white papers, articles, how-to guides, events, decks, video and clips are there', ['report', 'white_paper', 'news_article', 'how_to', 'event_kit', 'deck', 'webinar_deck', 'video', 'clips', 'other'].every((k) => g.tiles.split(',').indexOf(k) >= 0), g.tiles);
    await page.click('#nwCtForm .nw-tile[data-k="deck"]'); await wait(page, 500);
    const q = await ev(page, () => ({ q: [...document.querySelectorAll('#v113CtQ .nw-lbl, #v113CtQ .v113-sw span')].map((x) => x.textContent.replace(/optional$/, '')).join('|'),
      side: (document.getElementById('nwCtSide') || {}).textContent || '', who: !!document.querySelector('.v113-ctq #v105CtPer'), notes: !!document.getElementById('v113CtNotes') }));
    check('a deck asks how many slides, speaker notes and where it is shown', /^Slides\|Speaker notes\|Where it is shown\|Topics or messages to stress/.test(q.q), q.q);
    check('who it is for sits with the questions, and there is a notes box', q.who && q.notes);
    check('the side says what a deck gives', /Slide-by-slide cards with speaker notes/.test(q.side), q.side.slice(0, 160));
    await page.click('#nwCtForm .nw-src-seg [data-s="paste"]'); await wait(page, 200);
    const st = await ev(page, () => { const w = document.getElementById('v113SrcTyW'); return { shown: !!w && !w.hidden, opts: w ? [...w.querySelectorAll('option')].map((o) => o.textContent).join('|') : '' }; });
    check('What is this material? sits with the material, with every kind of source', st.shown && /Presentation/.test(st.opts) && /Podcast or audio/.test(st.opts) && /Book chapter/.test(st.opts) && /Interview/.test(st.opts), st.opts);
    await page.selectOption('#cfType', 'presentation');
    await page.fill('#cfText', 'Synthetic talk notes about governed AI for advisers. '.repeat(12)); await ev(page, () => nwCtSync());
    await page.click('#v113CtQ [role="radiogroup"][aria-label="Slides"] button:has-text("20")'); await wait(page, 150);
    await page.fill('#v113CtNotes', 'Keep it to the governance story.');
    await ev(page, () => nwCtSubmit()); await wait(page, 1500);
    const r = store.db.content_requests[0] || {};
    check('a deck is saved with a format the table takes, and its own content type', r.format === 'thought_leadership' && r.content_type === 'deck' && r.source_type === 'presentation', JSON.stringify({ f: r.format, t: r.content_type, s: r.source_type }));
    check('the answers and the notes ride in the request', r.setup && r.setup.questions && r.setup.questions.Slides === '20' && r.setup.questions['Speaker notes'] === true && r.setup.notes === 'Keep it to the governance story.' && r.setup.format_label === 'Presentation deck', r.setup && JSON.stringify(r.setup.questions));
    check('the writer reads them in the template', r.template && /The team answered: Slides: 20\. Speaker notes/.test(r.template.description) && /Notes from the team: Keep it to the governance story\./.test(r.template.description) && /Slide N:/.test(r.template.rules), r.template && r.template.description);
    check('the request starts the Content from Source workflow', hooks.some((h) => /e3-content-run/.test(h.u)));
    check('the notes box empties after a send', (await ev(page, () => document.getElementById('v113CtNotes').value)) === '');
    await page.click('#nwCtForm .nw-tile[data-k="report"]'); await wait(page, 400);
    await ev(page, () => nwCtSync());
    const rr = await ev(page, () => [...document.querySelectorAll('#v113CtQ .nw-lbl, #v113CtQ .v113-sw span')].map((x) => x.textContent.replace(/optional$/, '')).join('|'));
    check('a report asks length, an executive summary, charts and what it is for', /^Length\|Executive summary at the top\|Suggest charts/.test(rr) && /What is it for\?/.test(rr), rr);
    const cards = await ev(page, () => { const d = document.createElement('div'); d.innerHTML = apCfParas('Slide 1: Why governance first\n- Point one\nNotes: say this\nSlide 2: The first 90 days\n- Inventory\nNotes: and this'); return { n: d.querySelectorAll('.v113-card').length, real: !!d.querySelector('.v113-real'), h: d.querySelector('.v113-card-h').textContent }; });
    check('a deck draft reads as written cards, with a note that the real file comes later', cards.n === 2 && cards.real && cards.h === 'Slide 1: Why governance first', JSON.stringify(cards));
    const plain = await ev(page, () => apCfParas('Just a paragraph.\n\nAnother one with Step 1: inside.').indexOf('v113-cards') < 0);
    check('ordinary drafts read as before', plain);
    await ctx.close();
  }

  // ---------------- C/D/E. Marketing Generation ----------------
  {
    const { ctx, page, store, hooks } = await open('/dashboard/marketing-generation', { calendly: true });
    const c = await ev(page, () => [...document.querySelectorAll('#v111Cats_mg .v111-cat')].map((b) => b.dataset.c).join(','));
    check('six campaign types', c === 'direct_to_call,low_ticket,webinar,download,newsletter_signup,landing', c);
    const blk = await ev(page, () => ({ h: [...document.querySelectorAll('#v113MgB .v113-sub')].map((x) => x.textContent).join('|'), titles: !!document.querySelector('#v113MgB [aria-label="Job titles"]'),
      sizes: !!document.querySelector('#v113MgB [aria-label="Company size (people)"]'), market: [...document.querySelectorAll('#v113MgB input')].some((i) => i.value === 'Wealth managers and advisers'), per: !!document.querySelector('#v113MgPer #v105Per') }));
    check('who it is for: persona, job titles, company size and the market from the profile', blk.titles && blk.sizes && blk.market && blk.per && /^Who it is for\|Book a call: the details$/.test(blk.h), JSON.stringify(blk));
    await wait(page, 600);
    await page.click('#v121Plan_mg .v121-st[data-i="3"] .v121-sth'); await wait(page, 200);   // v121: the booking page step holds the booking link
    const cal = await ev(page, () => { const s = document.getElementById('v113CalSel'); return s ? [...s.options].map((o) => o.textContent).join('|') : ''; });
    check('book a call offers the Calendly event types', /Intro call · 20 min/.test(cal) && /Diagnostic · 45 min/.test(cal), cal);
    await page.selectOption('#v113CalSel', 'https://calendly.com/qa-team/diagnostic'); await wait(page, 200);
    await page.click('#v113MgB [aria-label="Job titles"] button:has-text("COO")'); await wait(page, 150);
    await page.click('#v113MgB [aria-label="Company size (people)"] button:has-text("11 to 50")'); await wait(page, 150);
    await page.click('#v97MgGoBtn'); await wait(page, 1800);
    const lt = last(hooks, /e3-low-ticket-run/), lb = lt ? lt.b : {};
    check('a book-a-call campaign carries who it is for and the booking link to the Low-Ticket agent', lb.setup && lb.setup.targeting && lb.setup.targeting.titles.indexOf('COO') >= 0 && lb.setup.targeting.sizes[0] === '11 to 50' && lb.setup.booking && lb.setup.booking.url === 'https://calendly.com/qa-team/diagnostic', lt && JSON.stringify(lb.setup && lb.setup.targeting));
    check('the call length follows the Calendly event, and the request says who it is for', lb.setup && /Call length: 45 min/.test(lb.setup.details || '') && /Who it is for: Job titles: COO\. Company size: 11 to 50 people\./.test(lb.request || ''), lb.setup && lb.setup.details);
    await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await wait(page, 400);
    await page.click('#v121Plan_mg .v121-st[data-i="1"] .v121-sth'); await wait(page, 200);   // v121: each step's details are in its step
    const wq = await ev(page, () => ({ h: [...document.querySelectorAll('#v113MgB .v113-sub')].map((x) => x.textContent).join('|'), lbl: [...document.querySelectorAll('#v121Plan_mg .v121-st.is-open .nw-lbl')].map((x) => x.textContent.replace(/optional$/, '')).join('|'), gets: document.getElementById('v121Plan_mg').textContent }));
    check('a webinar asks its own details, and keeps who it is for', /Webinar or masterclass: the details/.test(wq.h) && /Title\|Date and time\|Where it runs\|Registration link\|Presenter/.test(wq.lbl), wq.lbl);
    check('the side says what a webinar funnel gives', /Registration page/.test(wq.gets) && /Confirmation page/.test(wq.gets), wq.gets.slice(0, 120));
    await page.fill('#v121Plan_mg .v121-st.is-open input[placeholder="e.g. Governed AI for RIAs: the first 90 days"]', 'Governed AI for RIAs'); await wait(page, 100);
    await page.click('#v121Plan_mg .v121-st[data-i="3"] .v121-sth'); await wait(page, 200);
    await page.fill('#v121Plan_mg .v121-st.is-open textarea[data-f="note"]', 'Skip the replay email.');
    await page.click('#v97MgGoBtn'); await wait(page, 1500);
    const fr = last(hooks, /e3-funnel-run/), fb = fr ? fr.b : {};
    check('a webinar goes to the Funnel Builder, not the Low-Ticket agent', !!fr && fb.funnel_type === 'webinar' && hooks.filter((h) => /e3-low-ticket-run/.test(h.u)).length === 1, fr && JSON.stringify(Object.keys(fb)));
    check('the Funnel Builder gets the targeting, goal, button, details and notes', fb.targeting && fb.targeting.titles.indexOf('COO') >= 0 && fb.objective === 'Get registrations' && fb.cta === 'Save my seat' && fb.details && fb.details.Title === 'Governed AI for RIAs' && fb.plan && fb.plan[3].note === 'Skip the replay email.' && fb.offer && fb.offer.name === 'AI Readiness Scorecard', JSON.stringify({ o: fb.objective, c: fb.cta, d: fb.details }));
    // the campaigns tab lists the new funnels; one opens as cards with its images and Approve
    await ev(page, () => { if (typeof nwMgGoTab === 'function') nwMgGoTab('campaigns'); }); await wait(page, 900);
    const list = await ev(page, () => [...document.querySelectorAll('.v113-funs .nw-row')].map((r) => r.textContent).join('|'));
    check('Campaigns lists the new funnels with their state', /Governed AI for RIAs/.test(list) && /Waiting for review/.test(list), list);
    await ev(page, (id) => v113FunOpen(id), FUNNEL.id); await wait(page, 300);
    const dr = await ev(page, () => { const d = document.getElementById('v113FunD'); return d ? { cards: [...d.querySelectorAll('.v113-card-h')].map((h) => h.textContent).join('|'), real: !!d.querySelector('.v113-real') } : null; });
    check('a funnel opens as cards: each ad, then each step', dr && dr.cards === 'Ad A|Ad B|Registration page|Reminder emails' && dr.real, dr && dr.cards);
    await page.click('#v113FunD .v113-card:first-child button:has-text("Make the image")'); await wait(page, 900);
    const img = store.writes.filter((w) => w.method === 'PATCH' && w.table === 'funnel_packages').pop();
    check('Make the image asks the image workflow and saves the picture on that ad', img && /creatives\/funnel-funnel_2026-10-14_qa-a\.png/.test(img.body.ad_variations.variants[0].image_url) && hooks.some((h) => /regen-ad-image/.test(h.u) && h.b.notes === 'A calm desk, one laptop'), img && JSON.stringify(img.body).slice(0, 160));
    await page.click('#v113FunD .nw-d-foot button:has-text("Send back")'); await wait(page, 600);
    const sb = store.writes.filter((w) => w.method === 'PATCH' && w.table === 'funnel_packages').pop(), fbk = store.db.agent_feedback.pop();
    check('Send back puts it back to draft, a status the table takes, and records why', sb.body.status === 'draft' && fbk && fbk.action === 'rejected' && fbk.agent === 'funnel_builder', JSON.stringify(sb.body));
    // a funnel is named by the builder's title first; a failed Funnel Builder run stops the wait and says why
    const nm = await ev(page, () => ({ got: v113FunName({ funnel_type: 'webinar', setup: { title: 'Named by the builder', details: { Title: 'Other' } } }) + '|' + v113FunName({ funnel_type: 'download', setup: {} }), want: 'Named by the builder|' + (NW_MG_PK.download || ['Funnel'])[0] }));
    check('a funnel takes the Funnel Builder title first, else its type', nm.got === nm.want, JSON.stringify(nm));
    store.db.runs.push({ run_id: 'funnel_qa_fail', agent: 'funnel_builder', status: 'failed', run_date: '2026-10-19', started_at: '2026-10-19T16:00:00Z', stats: JSON.stringify({ error: 'The model returned nothing', funnel_type: 'webinar' }) });
    await ev(page, () => { V113.fun.running = { run_id: 'funnel_qa_fail', type: 'webinar', t0: Date.now() }; v113FunPoll(); });
    await wait(page, 6900);
    const fl = await ev(page, () => ({ run: V113.fun.running, toast: (document.getElementById('nwToast') || {}).textContent || '', bar: !!document.querySelector('.v113-funs .nw-watch.is-run') }));
    check('a failed Funnel Builder run stops the wait and says why', fl.run === null && !fl.bar && /The funnel could not be written this time \(The model returned nothing\)\. Try again\./.test(fl.toast), JSON.stringify(fl));
    // posts, newsletters and emails: the goal and the next step
    await ev(page, () => nwMgGoTab('new')); await wait(page, 500);
    await page.click('#nwMgForm .nw-tile[data-k="newsletter"]'); await wait(page, 500);
    const nl = await ev(page, () => ({ lbl: [...document.querySelectorAll('#v113MgB .nw-lbl, #v113MgB .v113-sw span')].map((x) => x.textContent.replace(/optional$/, '')).join('|'), cats: [...document.querySelectorAll('#v111Cats_mg .v111-cat')].map((b) => b.dataset.c).join(',') }));
    check('a newsletter asks what it covers, length, a summary, visuals, charts and what readers should do', /What should it cover\?\|Length\|A short summary at the top\|Suggest visuals\|Suggest charts/.test(nl.lbl) && /What should readers do\?/.test(nl.lbl), nl.lbl);
    check('newsletter topics come from everything the briefs found', nl.cats === 'news,research,opinion,educational,case_studies,events,articles', nl.cats);
    await page.click('#v113MgB button:has-text("Use what the briefs found for the topics")'); await wait(page, 200);
    const topics = await ev(page, () => [...document.querySelectorAll('#v113MgB input')].map((i) => i.value).find((v) => v.indexOf(';') >= 0 || v.length > 20) || '');
    check('the topics fill from the briefs', topics.length > 10, topics);
    await page.fill('#v97MgWhat', 'A newsletter on governed AI for advisers this month');
    await page.click('#v97MgGoBtn'); await wait(page, 1500);
    const nr = store.db.content_requests[store.db.content_requests.length - 1] || {};
    check('a newsletter request carries the answers and who it is for', nr.format === 'newsletter' && nr.setup && nr.setup.questions && nr.setup.questions['What should readers do?'] === 'Read more' && nr.setup.targeting && nr.setup.targeting.titles.indexOf('COO') >= 0, nr.setup && JSON.stringify(nr.setup.questions));
    await page.click('#nwMgForm .nw-tile[data-k="other"]'); await wait(page, 400);
    await page.fill('#v97MgWhat', 'A one-page case study on the scorecard');
    await page.click('#v97MgGoBtn'); await wait(page, 1500);
    const orr = store.db.content_requests[store.db.content_requests.length - 1] || {};
    check('Something else is saved under a format the table takes, as its own content type', orr.format === 'thought_leadership' && orr.content_type === 'other', JSON.stringify({ f: orr.format, t: orr.content_type }));
    const note = await ev(page, () => { nwMgKindGo('thought_leadership'); return (document.querySelector('#v111InsB_mg .nw-faint.nw-small') || {}).textContent || ''; });
    check('one brief waiting: Its findings', note === 'The brief of 14 Oct isn’t approved yet. Its findings can still be used.', note);
    const notes = await ev(page, () => {
      // three briefs from one day, then two days, as v111InsAll would give them
      const keep = v111InsAll, at = (run, d) => ({ id: 'i' + run, src: 'Post', text: 'Finding from ' + run, why: '', url: '', who: '', c: 'opinion', w: 0, ord: 0, brief: { kind: 'org', run: run, date: d, ok: false } });
      const say = (L) => { v111InsAll = function () { return L; }; try { const d = document.createElement('div'); d.innerHTML = v111InsBody('mg'); return [...d.querySelectorAll('p.nw-faint.nw-small')].map((p) => p.textContent).join(' / '); } finally { v111InsAll = keep; } };
      return [say([at('a', '2026-07-30T13:00:00Z'), at('b', '2026-07-30T13:05:00Z'), at('c', '2026-07-30T13:09:00Z')]),
        say([at('a', '2026-07-30T13:00:00Z'), at('b', '2026-07-30T13:05:00Z'), at('d', '2026-08-02T13:00:00Z')])];
    });
    check('same-day briefs are counted, not listed three times', notes[0] === '3 briefs from 30 Jul aren’t approved yet. Their findings can still be used.', notes[0]);
    check('briefs from two days name each day once', notes[1] === '3 briefs from 30 Jul and 2 Aug aren’t approved yet. Their findings can still be used.', notes[1]);
    await ctx.close();
  }

  // ---------------- Educational and how-to ----------------
  {
    const tweak = (t) => {
      const o = t.agent_outputs[0], d = JSON.parse(o.data);
      d.items[0].working = 'How to set up an AI sign-off in three steps'; d.high_value_items[0].working = d.items[0].working;
      t.agent_outputs.forEach((x) => { if (x.run_id === o.run_id) x.data = JSON.stringify(d); });
    };
    const { ctx, page } = await open('/dashboard/marketing-generation', { tweak });
    await page.click('#nwMgForm .nw-tile[data-k="thought_leadership"]'); await wait(page, 400);
    await page.click('#v111Cats_mg .v111-cat[data-c="educational"]'); await wait(page, 300);
    const e = await ev(page, () => ({ n: (document.querySelector('#v111Cats_mg .v111-cat[data-c="educational"] .nw-cnt') || {}).textContent, t: [...document.querySelectorAll('#v111InsB_mg .v111-in-t')].map((x) => x.textContent).join('|') }));
    check('a how-to filed as an opinion post counts under Educational and how-to', /How to set up an AI sign-off/.test(e.t) && +e.n >= 2, JSON.stringify(e));
    await page.click('#v111Cats_mg .v111-cat[data-c="opinion"]'); await wait(page, 300);
    check('and still under Opinion', /How to set up an AI sign-off/.test(await ev(page, () => document.getElementById('v111InsB_mg').textContent)));
    await ctx.close();
  }

  // ---------------- F. Ad Testing and Integrations ----------------
  {
    const { ctx, page, hooks } = await open('/dashboard/ad-testing');
    await wait(page, 900);
    const h0 = await ev(page, () => (document.querySelector('#nwTsHead .v113-adsl') || {}).textContent || '');
    check('Ad Testing says where the numbers come from, and how to connect', /Connect Meta and LinkedIn on Integrations/.test(h0) && /Connect on Integrations/.test(h0), h0);
    await ev(page, () => nwTsGoTab('results')); await wait(page, 500);
    const w = await ev(page, () => { const c = document.querySelector('.v113-work'); return c ? { good: [...c.querySelectorAll('.v113-work-g > div:first-child li b')].map((x) => x.textContent), bad: [...c.querySelectorAll('.v113-work-g > div:last-child li b')].map((x) => x.textContent), all: c.textContent } : null; });
    check('what is working comes first: the lowest cost per lead', w && w.good[0] === 'Governance webinar ad', w && JSON.stringify(w.good));
    check('and what is not working yet: no leads or far behind', w && w.bad.indexOf('Diagnostic call ad') >= 0 && w.bad.indexOf('Scorecard ad') >= 0 && /Nothing changes your ads on its own/.test(w.all), w && JSON.stringify(w.bad));
    const tb = await ev(page, () => (document.querySelector('#nwTsRoot .nw-toolbar .nw-faint') || {}).textContent || '');
    check('synced rows are counted apart from the ones entered by hand', /1 entered by hand/.test(tb) && /3 synced from the ad platforms/.test(tb), tb);
    const plat = await ev(page, () => V98_PLAT.ad.slice(0, 3).join('|'));
    check('Facebook ads and Instagram ads are platforms to log against', plat === 'Meta ads|Facebook ads|Instagram ads', plat);
    check('the tab names the page', (await page.title()) === 'Ad Testing · AI Paragon', await page.title());
    // the daily strategy read says so, instead of "asked by Daily read"
    const rd = await ev(page, () => { const row = (d) => ({ created_at: '2026-10-20T14:20:00Z', title: 'Lead with governance', d: Object.assign({ insights: { headline: 'Lead with governance', summary: 's', recommendations: [], vision_fit: {} }, refs: {} }, d) });
      const a = v98ReadHtml(row({ daily: true, requested_by: 'Daily read' })), b = v98ReadHtml(row({ requested_by: 'qa@aiparagonconsulting.com' }));
      return { daily: /Strategy read · [^<]+ · Daily read</.test(a) && !/asked by Daily read/.test(a), asked: /asked by qa</.test(b) }; });
    check('the daily strategy read is labelled Daily read; one someone asked for keeps who asked', rd.daily && rd.asked, JSON.stringify(rd));
    const li = await ev(page, () => V113_INT.linkedin_ads.help);
    check('LinkedIn needs both ad permissions: r_ads for the campaigns, r_ads_reporting for the numbers', /r_ads and r_ads_reporting permissions/.test(li), li);
    await ctx.close();
  }
  {
    const { ctx, page, hooks, S } = await open('/dashboard/integrations');
    await page.waitForSelector('.ap-int-card[data-k="meta_ads"]', { timeout: 15000 }).catch(() => {});
    await wait(page, 600);
    const c = await ev(page, () => ({ k: [...document.querySelectorAll('.ap-tphost[data-tp="inuse"] .ap-int-card')].map((x) => x.dataset.k).join(','),
      st: [...document.querySelectorAll('.ap-int-card[data-k="calendly"],.ap-int-card[data-k="meta_ads"],.ap-int-card[data-k="linkedin_ads"]')].map((x) => x.querySelector('.st').textContent).join('|'),
      strip: (document.getElementById('apStrip') || {}).textContent || '' }));
    check('Integrations has Calendly, Meta Ads and LinkedIn Ads in use', /calendly,meta_ads,linkedin_ads$/.test(c.k), c.k);
    check('each says it is not connected yet', c.st === 'Not connected|Not connected|Not connected', c.st);
    check('the Working tile counts the new connections', /of 8 connections/.test(c.strip), c.strip.slice(0, 120));
    await page.click('.ap-int-card[data-k="meta_ads"] button:has-text("Connect")'); await wait(page, 200);
    await page.click('#v113IntGo'); await wait(page, 100);
    check('a key is asked for before anything is sent', /Paste the key first/.test(await ev(page, () => document.getElementById('v113IntErr').textContent)));
    await page.fill('#v113IntKey', 'qa-meta-token');
    await page.click('#v113IntGo'); await wait(page, 100);
    check('the ad account is asked for too', /ad account ID/.test(await ev(page, () => document.getElementById('v113IntErr').textContent)));
    await page.fill('#v113IntAcct', 'act_123');
    await page.click('#v113IntGo'); await wait(page, 900);
    const con = last(hooks, /e3-ad-results/), cb = hooks.filter((h) => /e3-ad-results/.test(h.u) && h.b.action === 'connect').pop();
    check('Connect sends the key to n8n with the account, for Facebook and Instagram', cb && cb.b.platform === 'meta' && cb.b.key === 'qa-meta-token' && cb.b.account_id === 'act_123', cb && JSON.stringify(cb.b));
    const after = await ev(page, () => ({ st: document.querySelector('.ap-int-card[data-k="meta_ads"] .st').textContent, acts: document.querySelector('.ap-int-card[data-k="meta_ads"] .acts').textContent, strip: document.getElementById('apStrip').textContent }));
    check('the card turns Connected, with Sync now', after.st === 'Connected' && /Sync now/.test(after.acts), JSON.stringify(after));
    const stored = await ev(page, () => { try { return JSON.stringify(localStorage).indexOf('qa-meta-token') < 0 && JSON.stringify(sessionStorage).indexOf('qa-meta-token') < 0; } catch (e) { return true; } });
    check('the key is not kept in the browser', stored);
    await page.click('.ap-int-card[data-k="meta_ads"] button:has-text("Sync now")'); await wait(page, 900);
    check('Sync now asks for a sync', hooks.some((h) => /e3-ad-results/.test(h.u) && h.b.action === 'sync'));
    await page.click('.ap-int-card[data-k="calendly"] button:has-text("Connect")'); await wait(page, 200);
    await page.fill('#v113IntKey', 'qa-calendly-token');
    await page.click('#v113IntGo'); await wait(page, 900);
    const ck = hooks.filter((h) => /e3-calendly/.test(h.u) && h.b.action === 'connect').pop();
    const cst = await ev(page, () => document.querySelector('.ap-int-card[data-k="calendly"] .meta').textContent);
    check('Calendly connects with its token and lists the event types', ck && ck.b.key === 'qa-calendly-token' && /Connected as QA Tester · 2 event types/.test(cst), cst);
    await ctx.close();
  }

  // ---------------- G. Company profile drafts ----------------
  {
    const { ctx, page, store, hooks } = await open('/dashboard/company-profile');
    await ev(page, () => v104Tab('audiences')); await wait(page, 700);
    const b = await ev(page, () => ({ btn: !!document.querySelector('#v104Per .hd .x .v113-draftb'), empty: (document.querySelector('#v104Per .v104-empty p') || {}).textContent || '' }));
    check('Personas has Draft for me', b.btn && /Press Draft for me/.test(b.empty), JSON.stringify(b));
    await page.click('#v104Per .v113-draftb'); await wait(page, 300);
    check('Draft for me asks the Profile Drafts workflow for personas', hooks.some((h) => /e3-profile-drafts/.test(h.u) && h.b.what === 'personas'));
    await ev(page, () => v113DraftPoll()); await wait(page, 900);
    const p = await ev(page, () => { const a = document.querySelector('#v104Per .v104-it'); return a ? { t: a.textContent, chip: !!a.querySelector('.v113-dchip'), keep: !!a.querySelector('button[onclick^="v113DraftKeep"]') } : null; });
    check('the drafted persona shows, marked Draft, with Looks right', p && /Operations lead at a growing RIA/.test(p.t) && p.chip && p.keep, p && p.t.slice(0, 120));
    await page.click('#v104Per .v104-it button:has-text("Looks right")'); await wait(page, 700);
    const kw = store.writes.filter((w) => w.method === 'PATCH' && w.table === 'client_personas').pop();
    check('Looks right clears the draft mark', kw && kw.body.ai_draft === false && !(await ev(page, () => !!document.querySelector('#v104Per .v113-dchip'))), kw && JSON.stringify(kw.body));
    await ev(page, () => v104Tab('proof')); await wait(page, 500);
    await page.click('#v104Proof .v113-draftb'); await wait(page, 300);
    await ev(page, () => v113DraftPoll()); await wait(page, 900);
    const q = await ev(page, () => { const a = document.querySelector('#v104Proof .v104-it'); return a ? { t: a.textContent, chip: !!a.querySelector('.v113-dchip') } : null; });
    check('drafted proof shows marked Draft, and still Needs checking', q && q.chip && /Needs checking/.test(q.t), q && q.t.slice(0, 140));
    await page.click('#v104Proof .v104-it button:has-text("Approve")'); await wait(page, 700);
    const aw = store.writes.filter((w) => w.method === 'PATCH' && w.table === 'client_proof').pop();
    check('approving drafted proof clears the draft mark with it', aw && aw.body.status === 'approved' && aw.body.ai_draft === false, aw && JSON.stringify(aw.body));
    await ev(page, () => v104Tab('brand')); await wait(page, 600);
    const v0 = await ev(page, () => !!document.querySelector('#v104Voice .v113-draftb'));
    check('with no voice yet, Brand & voice has Draft for me', v0);
    await page.click('#v104Voice .v113-draftb'); await wait(page, 300);
    await ev(page, () => v113DraftPoll()); await wait(page, 1200);
    const v1 = await ev(page, () => ({ note: (document.querySelector('#v104Voice .v113-dnote') || {}).textContent || '', btn: !!document.querySelector('#v104Voice .v113-draftb') }));
    check('the drafted voice says it is a draft and how to change it', /Drafted by AI/.test(v1.note) && /Press Edit/.test(v1.note), v1.note);
    await ev(page, () => { v96VoiceEdit(true); }); await wait(page, 200);
    await ev(page, () => apVoiceSave()); await wait(page, 900);
    const vs = store.writes.filter((w) => w.method === 'POST' && w.table === 'brand_voice').pop();
    check('saving an edit of the drafted voice makes it the team’s own', vs && vs.body.source === 'manual' && vs.body.change_note === 'Edited the AI draft', vs && JSON.stringify({ s: vs.body.source, n: vs.body.change_note }));
    check('the tab names the page', (await page.title()) === 'Company profile · AI Paragon', await page.title());
    await ctx.close();
  }

  // ---------------- H. the Intel Tracker's run wording ----------------
  {
    const { ctx, page, hooks } = await open('/dashboard/intel-tracker');
    const line = await ev(page, () => apIntelSourceLine({ src: 'schedule', legacy: false }));
    check('a scheduled intel run is called a scheduled run, not a daily one', line === 'Scheduled run', line);
    await ev(page, () => apOpenIntelRun()); await wait(page, 300);
    const help = await ev(page, () => (document.querySelector('#apIntelRun .help') || {}).textContent || '');
    check('the custom run form tells it apart from the scheduled runs', /apart from the scheduled runs/.test(help) && !/daily 6am/.test(help), help.slice(-90));
    await ev(page, () => { AP_IR.rows = [{ name: 'QA Advisory', website: 'qa-advisory.example.com' }]; return apIrSubmit(); }); await wait(page, 400);
    const msg = await ev(page, () => ((document.getElementById('toastMsg') || {}).textContent || '') + ' ' + ((document.getElementById('nwToast') || {}).textContent || ''));
    check('starting a custom run says the brief lands in 5 to 15 minutes', hooks.some((h) => /\/intel-run/.test(h.u)) && /5 to 15 minutes/.test(msg), msg.trim());
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
