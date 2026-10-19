// Engine 3 tests for new-aiparagon-dashboard.html (#1): editing a brief (Request changes), the brief layout
// (Structure), categories and brief insights on Marketing Generation and Content Transformation, and the
// Ad Strategist's Following tab (ads only, or ads and posts), industries, the follow step after an upload, and
// the Intel Tracker leaving out the accounts followed for ads only. Supabase answers from an
// in-memory store (lib/rest-stub.js) filled with synthetic data (lib/e3-fixtures.js), and n8n webhooks
// answer from stubs, so no real account, data or workflow is touched. See tests/README.md.
// Usage: node tests/dashboard-e3.test.js
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
const J = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/briefs');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  // one signed-in page on a fresh copy of the synthetic data; hooks[] records every n8n call
  async function open(url, extra) {
    const tables = F.tables();
    tables.winner_creatives.push(Object.assign({}, tables.winner_creatives[4], { id: '00000000-0000-4000-8000-0000000000a9', advertiser_name: 'Notion Saved Co', source: 'swipe_file', ad_library_url: 'swipe:notion:1', hook: 'A saved ad from Notion' }));
    const store = makeStore(Object.assign(tables, extra || {}));
    const hooks = [];
    const hook = (u, m, b) => {
      hooks.push({ u, b });
      if (/\/ad-upload/.test(u)) return { body: { ok: true, analysis: { hook: 'Meeting notes that write themselves', body: 'Try it free', cta: 'Learn more', format: 'text' } } };
      if (/e3-ad-industries/.test(u)) {
        const o = {}; (JSON.parse(b || '{}').advertisers || []).forEach((a) => { if (a.name !== 'Scribewell') o[a.name] = 'Agent says ' + a.name; });
        return { body: { ok: true, industries: o } };
      }
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: true });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1300);
    return { ctx, page, store, hooks };
  }
  const ev = (page, fn, arg) => page.evaluate(fn, arg);
  const wait = (page, ms) => page.waitForTimeout(ms || 250);

  // ---------------- 1. editing the organic brief ----------------
  {
    const { ctx, page, store } = await open('/dashboard/briefs');
    await page.click('#nwBrReview button:has-text("Request changes")'); await wait(page, 500);
    const secs = await ev(page, () => [...document.querySelectorAll('.v111-es')].map((s) => s.dataset.sec + ':' + s.querySelectorAll('.v111-it').length));
    check('Request changes opens the editor with every section and the posts', secs.join(' ') === 'five:5 short:3 shift:3 dev:3 themes:0 hand:0 post:6', secs.join(' '));
    await page.click('.v111-es[data-sec="post"] .v111-it[data-i="0"] button:has-text("Remove")'); await wait(page);
    const flags = await ev(page, () => [...document.querySelectorAll('.v111-it.is-flag')].map((li) => li.dataset.k + ':' + li.dataset.i));
    check('removing a post flags the line that quoted it', flags.join(',') === 'short:0', flags.join(','));
    const devLeft = await ev(page, () => document.querySelectorAll('.v111-es[data-sec="dev"] .v111-it').length);
    check('the development that was that post goes with it', devLeft === 2, String(devLeft));
    await page.click('.v111-es[data-sec="shift"] .v111-it[data-i="1"] button:has-text("Edit")'); await wait(page, 150);
    await page.fill('.v111-it.is-open input[name="h"]', 'From pilots to a governed rollout plan');
    await page.click('.v111-it.is-open button:has-text("Keep this change")'); await wait(page, 150);
    await page.click('.v111-es[data-sec="hand"] .v111-secdel'); await wait(page, 150);
    await page.click('.v111-es[data-sec="dev"] .v111-secdel'); await wait(page, 150);
    await page.click('.v111-edside button:has-text("Undo")'); await wait(page, 150);
    const undone = await ev(page, () => ({ n: V111.ed.n, hidden: V111.ed.cur.rev.hidden.join(',') }));
    check('Undo puts the last change back', undone.n === 3 && undone.hidden === 'hand', JSON.stringify(undone));
    await page.click('.v111-es[data-sec="dev"] .v111-secdel'); await wait(page, 150);
    await page.click('.v111-edside button:has-text("Preview")'); await wait(page, 400);
    const prev = await ev(page, () => ({ secs: [...document.querySelectorAll('#main section[id]')].map((s) => s.id).join(' '), ev: document.querySelectorAll('#nwBrEv tbody tr').length,
      shift: (document.querySelectorAll('#nwBrShift .nw-acc-t')[1] || {}).textContent, foot: (document.querySelector('#nwBrReview .nw-card-foot') || {}).textContent || '' }));
    check('Preview shows the brief as it now reads', prev.secs === 'nwBrFive nwBrShort nwBrShift nwBrThemes nwBrEv nwBrReview' && prev.ev === 5 && prev.shift === 'From pilots to a governed rollout plan', JSON.stringify(prev));
    check('approving waits until the edits are saved', /You are editing this brief/.test(prev.foot), prev.foot);
    await page.fill('#v111EdNote', 'Leave job posts out.').catch(() => {});
    await page.click('#v111EdGo'); await wait(page, 1500);
    const rows = store.db.agent_outputs.filter((r) => r.run_id === F.RUN && r.output_type === 'intel_brief');
    const d0 = J(rows[0].data), d1 = J(rows[1].data);
    check('Save writes both stored copies of the brief', rows.every((r) => !/## 4\./.test(r.content_md) && r.content_md.includes('From pilots to a governed rollout plan') && r.edited_by_human === true),
      rows.map((r) => r.edited_by_human).join(','));
    check('the edited brief keeps its data as a JSON string, as the agents stored it', typeof rows[0].data === 'string');
    check('the agent’s own version is kept', d0.review && d0.review.original && /## 4\./.test(d0.review.original.content_md) && !d0.review.original.data.review, d0.review && Object.keys(d0.review).join(','));
    check('the removed post is out of the evidence and the topic watch', d0.items.length === 5 && !d0.items.some((x) => x.url === F.P(1)) && !(d0.topic_watch.governance || []).some((x) => x.url === F.P(1)) && d1.items.length === 5);
    const fb = store.db.agent_feedback.find((f) => f.action === 'edited');
    check('the edit is on the record, with a plain summary', fb && fb.target_id === F.RUN && /^Removed 1 post\. Took out Content handoff and Notable developments\. Edited 1 shift\./.test(fb.feedback), fb && fb.feedback);
    const after = await ev(page, () => ({ pill: (document.querySelector('.nw-brbar .nw-pill') || {}).textContent, meta: (document.querySelector('.v111-edmeta') || {}).textContent || '',
      opt: [...document.querySelectorAll('.nw-brbar select option')].map((o) => o.textContent).join('|'), rail: [...document.querySelectorAll('.nw-railnav button')].map((b) => b.textContent).join('|') }));
    check('the edited brief waits for review again and says who edited it', after.pill === 'Needs review' && /Edited by qa/.test(after.meta) && /newest · edited/.test(after.opt), JSON.stringify(after));
    check('the side list drops the sections taken out', !/Notable developments|Content handoff/.test(after.rail), after.rail);
    await page.click('.v111-edmeta button'); await wait(page, 1500);
    const back = store.db.agent_outputs.find((r) => r.id.endsWith('001'));
    check('Put back the agent’s version restores the brief', /## 4\./.test(back.content_md) && !J(back.data).review && J(back.data).items.length === 6 && back.edited_by_human === false);
    await ctx.close();
  }

  // ---------------- earlier behaviour that must stay ----------------
  {
    const { ctx, page, store } = await open('/dashboard/briefs');
    await page.click('.nw-brbar button:has-text("Approve brief")'); await wait(page, 1200);
    const ok = store.db.agent_feedback.find((f) => f.action === 'approved' && f.target_id === F.RUN);
    check('Approve brief still records the approval', !!ok && (await ev(page, () => (document.querySelector('.nw-brbar .nw-pill') || {}).textContent)) === 'Approved');
    await page.click('#nwBrReview button:has-text("Request changes")'); await wait(page, 400);
    await page.click('.v111-edhead button:has-text("Leave a note instead")'); await wait(page, 400);
    check('Leave a note instead opens the note box, as before', await ev(page, () => !V111.ed && !!document.getElementById('aipModalText')));
    await ctx.close();
  }

  // ---------------- 2. editing the ads brief ----------------
  {
    const { ctx, page, store } = await open('/dashboard/briefs');
    await page.click('.nw-tabs button[data-tab="ads"]'); await wait(page, 1300);
    await page.click('#nwBrReview button:has-text("Request changes")'); await wait(page, 500);
    const secs = await ev(page, () => [...document.querySelectorAll('.v111-es')].map((s) => s.dataset.sec).join(' '));
    check('the ads editor lists its sections, the creative structure locked', secs === 'five short arch offer pain cross test ad' && (await ev(page, () => !document.querySelector('.v111-es[data-sec="arch"] .v111-secdel'))), secs);
    await page.click('.v111-it[data-k="angle"] button:has-text("Edit")'); await wait(page, 150);
    await page.fill('.v111-it.is-open textarea[name="t"]', 'Sell proof, not speed.');
    await page.click('.v111-it.is-open button:has-text("Keep this change")'); await wait(page, 150);
    await page.click('.v111-it[data-k="hook"][data-i="1"] button:has-text("Remove")'); await wait(page, 150);
    await page.click('.v111-it[data-k="ad"][data-i="0"] button:has-text("Remove")'); await wait(page, 150);
    await page.click('.v111-es[data-sec="offer"] .v111-secdel'); await wait(page, 150);
    await page.click('#v111EdGo'); await wait(page, 1500);
    const cb = store.db.creative_briefs[0];
    check('the ads brief takes the edits, lists still stored as JSON strings', cb.differentiation_angle === 'Sell proof, not speed.' && typeof cb.winning_hooks === 'string' && J(cb.winning_hooks).length === 3 && J(cb.winning_offers).length === 0);
    const ao = J(store.db.agent_outputs.find((r) => r.agent === 'ad_strategist').data);
    check('the agent’s ads brief is kept, and the removed ad recorded', ao.review && ao.review.original && J(ao.review.original.cb.winning_hooks).length === 4 && ao.review.removed.length === 1);
    const s = await ev(page, () => ({ ev: document.querySelectorAll('#nwBrEv tbody tr').length, off: !document.getElementById('nwBrOffer') }));
    check('the ads brief reads as edited', s.ev === 5 && s.off, JSON.stringify(s));
    store.db.__lockCreative = true;
    await page.click('#nwBrReview button:has-text("Request changes")'); await wait(page, 500);
    await page.click('.v111-it[data-k="hook"][data-i="0"] button:has-text("Remove")'); await wait(page, 150);
    await page.click('#v111EdGo'); await wait(page, 1200);
    const err = await ev(page, () => (document.querySelector('.v111-err') || {}).textContent || '');
    check('a save the database refuses says so and keeps the edits open', /cannot be changed from the dashboard/.test(err) && (await ev(page, () => !!V111.ed)), err);
    await ctx.close();
  }

  // ---------------- 3. the brief layout ----------------
  {
    const { ctx, page, store } = await open('/dashboard/briefs');
    await page.click('.nw-brbar button:has-text("Structure")'); await wait(page, 400);
    await page.click('.v111-st-r[data-k="shift"] .v111-sw');
    await page.click('.v111-st-r[data-k="themes"] button[aria-label$=" up"]'); await wait(page, 100);
    await page.click('.v111-st-r[data-k="themes"] button[aria-label$=" up"]'); await wait(page, 100);
    await page.selectOption('.v111-st-r[data-k="five"] select >> nth=0', '3');
    for (const k of ['x_formats', 'x_questions', 'x_rising']) { await page.selectOption('#v111StAdd', k); await page.click('.v111-st-add button:has-text("Add")'); await wait(page, 80); }
    check('Record and five things cannot move, Review stays last', await ev(page, () => !document.querySelector('.v111-st-r[data-k="rec"] .v111-mv') && !document.querySelector('.v111-st-r[data-k="five"] .v111-mv') && [...document.querySelectorAll('.v111-st-r')].pop().dataset.k === 'review'));
    await page.click('#v111StGo'); await wait(page, 800);
    const saved = (store.db.ai_settings.find((r) => r.key === 'brief_structure') || {}).value || {};
    check('the layout is saved for the team', saved.org && saved.org.off.join() === 'shift' && saved.org.order.slice(2, 4).join() === 'short,themes' && saved.org.opt.five.n === '3', JSON.stringify(saved.org));
    await page.click('.nw-brbar button:has-text("Brief")'); await wait(page, 800);
    const b = await ev(page, () => ({ main: [...document.querySelectorAll('.nw-brmain > section')].map((s) => s.id).join(' '), five: document.querySelectorAll('.nw-five-c').length, h2: (document.querySelector('#nwBrFive h2') || {}).textContent,
      q: document.querySelectorAll('#nwBrX_x_questions .v111-x-r').length, rise: (document.querySelector('#nwBrX_x_rising .v111-x-r b') || {}).textContent, rail: [...document.querySelectorAll('.nw-railnav button')].map((x) => x.textContent).join('|') }));
    check('the brief follows the layout: order, switched off, added sections', b.main === 'nwBrShort nwBrThemes nwBrDev nwBrHand nwBrEv nwBrX_x_formats nwBrX_x_questions nwBrX_x_rising nwBrReview', b.main);
    check('how much of each: three things working', b.five === 3 && b.h2 === 'Three things working', b.five + ' ' + b.h2);
    check('added sections are counted from the posts', b.q === 3 && b.rise === 'Governance', JSON.stringify(b));
    check('the side list follows the layout', b.rail.indexOf('What changed') < 0 && /Questions buyers ask/.test(b.rail), b.rail);
    await page.click('.nw-tabs button[data-tab="ads"]'); await wait(page, 1300);
    await page.click('.nw-brbar button:has-text("Structure")'); await wait(page, 300);
    await page.selectOption('.v111-st-r[data-k="arch"] select', '3');
    for (const k of ['x_cta', 'x_landing']) { await page.selectOption('#v111StAdd', k); await page.click('.v111-st-add button:has-text("Add")'); await wait(page, 80); }
    await page.click('#v111StGo'); await wait(page, 700);
    await page.click('.nw-brbar button:has-text("Brief")'); await wait(page, 800);
    const a = await ev(page, () => ({ hooks: document.querySelectorAll('#nwBrArch .nw-hook-g:not(.nw-hook-g4) .nw-hook').length, cta: [...document.querySelectorAll('#nwBrX_x_cta .v111-x-r b')].map((x) => x.textContent).join('|') }));
    const s2 = (store.db.ai_settings.find((r) => r.key === 'brief_structure') || {}).value || {};
    check('the ads layout is its own, and both are kept', a.hooks === 3 && /Learn more/.test(a.cta) && s2.org && s2.ads, JSON.stringify(a));
    await ctx.close();
  }

  // ---------------- 4. categories and insights ----------------
  {
    const { ctx, page, store, hooks } = await open('/dashboard/marketing-generation');
    const s0 = await ev(page, () => ({ steps: [...document.querySelectorAll('#nwMgForm .nw-wstep-h h3')].map((h) => h.textContent).join('|'), chips: [...document.querySelectorAll('#v111Cats_mg .v111-cat')].map((b) => b.dataset.c).join('|') }));
    check('Marketing Generation: the briefs’ findings are step 2, the ad campaign has its kinds (v113: six)', s0.steps === 'What are you making?|What the briefs found|Details' && s0.chips === 'direct_to_call|low_ticket|webinar|download|newsletter_signup|landing', JSON.stringify(s0));
    await page.click('#nwMgForm .nw-tile[data-k="thought_leadership"]'); await wait(page, 400);
    const chips = await ev(page, () => [...document.querySelectorAll('#v111Cats_mg .v111-cat')].map((b) => b.dataset.c + ':' + (b.querySelector('.nw-cnt') || {}).textContent));
    check('a LinkedIn post has the Intel Tracker’s categories, each with what the briefs found', chips.length === 7 && chips[0] === 'opinion:6' && chips.indexOf('case_studies:3') >= 0, chips.join(' '));
    await page.click('#v111Cats_mg .v111-cat[data-c="case_studies"]'); await wait(page, 300);
    check('picking a category sets the kind of post', (await ev(page, () => nwMgType())) === 'social_proof');
    await page.click('#v111Cats_mg .v111-cat[data-c="opinion"]'); await wait(page, 300);
    const ids = await ev(page, () => [...document.querySelectorAll('#v111InsB_mg .v111-in')].map((c) => c.dataset.id));
    await page.click('#v111InsB_mg .v111-in[data-id="' + ids[0] + '"] button:has-text("Use")'); await wait(page, 120);
    await page.click('#v111InsB_mg .v111-in[data-id="' + ids[1] + '"] button:has-text("Use")'); await wait(page, 120);
    await page.click('#v111InsB_mg .v111-in[data-id="' + ids[2] + '"] button:has-text("Save for later")'); await wait(page, 400);
    await page.click('#v111InsB_mg .v111-in[data-id="' + ids[3] + '"] button:has-text("Not this")'); await wait(page, 300);
    const note = store.db.idea_notes[0];
    check('Save for later keeps it in Ideas, with where it came from', note && note.status === 'open' && note.tags.indexOf('insight:' + ids[2]) >= 0 && /From the organic brief of/.test(note.note), note && JSON.stringify(note.tags));
    check('Not this drops it from the list', !(await ev(page, (id) => !!document.querySelector('#v111InsB_mg .v111-in[data-id="' + id + '"]'), ids[3])));
    check('the side says what it will use', /From the briefs · 2 picks/.test(await ev(page, () => document.getElementById('nwMgSideB').textContent)));
    await page.click('.v111-ins-foot button:has-text("Write it from")'); await wait(page, 1500);
    const req = store.db.content_requests[0];
    check('Write it from these sends the request at once', !!req && hooks.some((h) => /e3-content-run/.test(h.u)));
    check('the picks ride in the request: thesis and setup', req && /What the team picked from the briefs to build on:\n1\. /.test(req.thesis) && !/What the organic brief of/.test(req.thesis) && req.setup.insights.length === 2 && req.setup.category === 'opinion', req && req.thesis);
    await page.click('#nwMgForm .nw-tile[data-k="ad"]'); await wait(page, 400);
    await page.click('#v111Cats_mg .v111-cat[data-c="low_ticket"]'); await wait(page, 300);
    check('the campaign kind is the funnel', (await ev(page, () => V97.mg.pk)) === 'low_ticket');
    const firstOffer = await ev(page, () => [...document.querySelectorAll('#v111InsB_mg .v111-in')].map((c) => c.querySelector('.nw-tag').textContent + ':' + c.querySelector('.v111-in-t').textContent).find((t) => /^Offer/.test(t)));
    check('offers that fit a low-ticket campaign are offered', /Low-ticket workshop at \$47/.test(firstOffer || ''), firstOffer);
    const aid = await ev(page, () => [...document.querySelectorAll('#v111InsB_mg .v111-in')].map((c) => c.dataset.id));
    await page.click('#v111InsB_mg .v111-in[data-id="' + aid[0] + '"] button:has-text("Use")'); await wait(page, 120);
    await page.click('.v111-ins-foot button:has-text("Write it from")'); await wait(page, 1500);
    const lt = hooks.find((h) => /e3-low-ticket-run/.test(h.u)), lb = lt ? JSON.parse(lt.b) : {};
    check('an ad campaign carries the picks in its setup and its request', lb.funnel_mode === 'low_ticket' && lb.setup && lb.setup.insights && lb.setup.insights.length === 1 && /Build the ads on these, picked from the briefs:/.test(lb.request || ''), lt && lt.b.slice(0, 200));
    await ctx.close();
  }
  {
    const { ctx, page, store } = await open('/dashboard/content-transformation');
    const steps = await ev(page, () => [...document.querySelectorAll('#nwCtForm .nw-wstep-h')].map((h) => h.querySelector('.nw-step-dot').textContent + ' ' + h.querySelector('h3').textContent).join('|'));
    check('Content Transformation: steps renumbered around the briefs’ findings', steps === '1 What are you making?|2 What the briefs found|3 Your material|4 Details', steps);
    await page.click('#v111Cats_ct .v111-cat[data-c="events"]'); await wait(page, 300);
    const id = await ev(page, () => document.querySelector('#v111InsB_ct .v111-in').dataset.id);
    await page.click('#v111InsB_ct .v111-in[data-id="' + id + '"] button:has-text("Use")'); await wait(page, 120);
    await page.click('.v111-ins-foot button:has-text("Write it from")'); await wait(page, 1500);
    const r = store.db.content_requests[0];
    check('with no material yet, the picks become the idea it is written from', r && r.start_mode === 'idea' && r.content_type === 'event' && /from what the market briefs found/.test(r.thesis) && r.setup.insights.length === 1, r && JSON.stringify({ m: r.start_mode, t: r.content_type }));
    await page.click('#nwCtForm .nw-tile[data-k="adcopy"]'); await wait(page, 900);
    check('a paid ad has the ad types as categories', (await ev(page, () => [...document.querySelectorAll('#v111Cats_ct .v111-cat')].map((b) => b.dataset.c).join()) ) === 'ad_image,ad_text,ad_carousel,ad_video');
    await page.click('#v111Cats_ct .v111-cat[data-c="ad_carousel"]'); await wait(page, 300);
    check('a carousel offers the carousel ads the Ad Strategist read first', /Stop losing referrals/.test(await ev(page, () => document.querySelector('#v111InsB_ct .v111-in-t').textContent)));
    await page.click('#nwCtForm .nw-src-seg [data-s="paste"]'); await wait(page, 150);
    await page.fill('#cfText', 'Synthetic source text for a test. '.repeat(20)); await ev(page, () => nwCtSync());
    const cid = await ev(page, () => document.querySelector('#v111InsB_ct .v111-in').dataset.id);
    await page.click('#v111InsB_ct .v111-in[data-id="' + cid + '"] button:has-text("Use")'); await wait(page, 120);
    await page.click('.v111-ins-foot button:has-text("Write it from")'); await wait(page, 1500);
    const r2 = store.db.content_requests[1];
    check('a carousel ad is written to the carousel shape, with the picks in its rules', r2 && r2.format === 'ad' && r2.content_type === 'ad_carousel' && r2.template.name === 'Carousel ad' && /^Build it on these findings the team picked/.test(r2.template.rules), r2 && JSON.stringify({ f: r2.format, t: r2.template && r2.template.name }));
    await ctx.close();
  }

  // ---------------- 5. the Ad Strategist ----------------
  {
    const { ctx, page, store, hooks } = await open('/dashboard/ad-strategist');
    await wait(page, 1500);
    const tabs = await ev(page, () => [...document.querySelectorAll('.nw-tabs button')].map((b) => b.dataset.tab + ':' + b.textContent.replace(/\d+$/, '')).join('|'));
    check('Swipe file is now Uploads, and Following is a tab', /swipe:Uploads/.test(tabs) && /follow:Following/.test(tabs) && !/Swipe file/.test(tabs), tabs);
    const ih = hooks.filter((h) => /e3-ad-industries/.test(h.u));
    check('missing industries are asked of the agent once, with the ads to read', ih.length === 1 && JSON.parse(ih[0].b).advertisers.some((a) => a.name === 'Ledgerline' && a.site === 'ledgerline.example' && a.ads.length === 2), String(ih.length));
    const ai = (store.db.ai_settings.find((r) => r.key === 'ad_industries_ai') || {}).value || {};
    check('the agent’s industries are kept apart from the ones set by hand', ai.ledgerline === 'Agent says Ledgerline' && !store.db.ai_settings.some((r) => r.key === 'ad_industries'), JSON.stringify(ai));
    check('an industry set by hand wins', await ev(page, () => { AP_AISET.ad_industries = { ledgerline: 'Finance software' }; return v96Ind('Ledgerline') === 'Finance software' && v96Ind('Cobalt CRM') === 'Agent says Cobalt CRM'; }));
    await page.click('.nw-tabs button[data-tab="all"]'); await wait(page, 500);
    check('ads from the Notion swipe file say so', /From Notion/.test(await ev(page, () => document.getElementById('nwAdsPanel').textContent)));
    await page.click('.nw-tabs button[data-tab="follow"]'); await wait(page, 800);
    await page.click('#v111FolAcc button:has-text("Add an account")'); await wait(page, 200);
    await page.fill('#v111AccName', 'Cobalt CRM'); await page.fill('#v111AccPage', 'not a page !!');
    await page.click('.v111-addacc button:has-text("Follow")'); await wait(page, 500);
    check('a link that is not a Facebook page is refused', /does not look like a Facebook page/.test(await ev(page, () => (document.querySelector('.v111-addacc .v111-err') || {}).textContent || '')));
    await page.fill('#v111AccPage', 'https://www.facebook.com/cobaltcrm/');
    await page.click('.v111-addacc button:has-text("Follow")'); await wait(page, 800);
    await page.click('.v111-nopage summary'); await wait(page, 100);
    await page.fill('.v111-nopage input', 'https://www.facebook.com/ads/library/?active_status=all&view_all_page_id=123456789');
    await page.click('.v111-nopage button:has-text("Add page")'); await wait(page, 800);
    await page.click('#v111FolAcc .v111-acc:has-text("Ledgerline") button:has-text("Stop reading ads")'); await wait(page, 800);
    // page / who reads it / status, per account
    const fc = () => Object.fromEntries(store.db.competitors.map((x) => [x.name, (x.meta_page_id || '-') + '/' + (x.follow_for || 'both') + '/' + (x.status || '')]));
    let c = fc();
    check('follow, add a page, stop reading ads: the accounts change as asked (the page stays for the Intel Tracker)',
      c['Cobalt CRM'] === 'cobaltcrm/ads/approved' && c['Northwind Advisory'] === '123456789/both/approved' && c.Ledgerline === '1000001/posts/approved', JSON.stringify(c));
    const lists = await ev(page, () => ({ on: [...document.querySelectorAll('#v111FolAcc > .v111-accs .v111-acc-m > b')].map((b) => b.textContent).sort(),
      off: [...document.querySelectorAll('.v111-nopage .v111-acc-m > b')].map((b) => b.textContent).sort(), cnt: (document.querySelector('.nw-tabs button[data-tab="follow"] .nw-cnt') || {}).textContent }));
    check('accounts read for posts only sit apart from the ones followed for ads', lists.on.join() === 'Cobalt CRM,Harbor Funnels,Northwind Advisory,Pine Street Media' && lists.off.join() === 'Ledgerline,Quill Partners' && lists.cnt === '4', JSON.stringify(lists));
    const harbor = await ev(page, () => { const li = [...document.querySelectorAll('#v111FolAcc > .v111-accs .v111-acc')].find((x) => /Harbor Funnels/.test(x.textContent));
      return li ? (li.querySelector('[role="radio"][aria-checked="true"]') || {}).textContent + '|' + [...li.querySelectorAll('button')].pop().textContent : ''; });
    check('an account followed for ads only says so, and its stop button stops following', harbor === 'Ads only|Stop following', harbor);
    await page.click('#v111FolAcc .v111-acc:has-text("Harbor Funnels") [role="radio"]:has-text("Ads and posts")'); await wait(page, 800);
    await page.click('.v111-nopage summary'); await wait(page, 100);
    await page.click('.v111-nopage .v111-acc:has-text("Quill Partners") button:has-text("Pull their ads too")'); await wait(page, 800);
    await page.click('#v111FolAcc .v111-acc:has-text("Pine Street Media") button:has-text("Stop following")'); await wait(page, 800);
    c = fc();
    check('ads and posts, pull their ads too, stop following: each is saved', c['Harbor Funnels'] === 'harborfunnels/both/approved' && c['Quill Partners'] === 'quillpartners/both/approved' && c['Pine Street Media'] === 'pinestreetmedia/ads/denied', JSON.stringify(c));
    await page.click('#v111FolAcc button:has-text("Add an account")'); await wait(page, 200);
    await page.fill('#v111AccName', 'Mesa Ledger'); await page.fill('#v111AccPage', 'mesaledger');
    await page.click('#v111AccFor [role="radio"]:has-text("Ads and posts")');
    await page.click('.v111-addacc button:has-text("Follow")'); await wait(page, 800);
    check('a new account is followed for ads only unless the team picks ads and posts', fc()['Mesa Ledger'] === 'mesaledger/both/approved' && fc()['Cobalt CRM'] === 'cobaltcrm/ads/approved', JSON.stringify(fc()));
    await page.fill('#v111F_kw', 'AI automation'); await page.press('#v111F_kw', 'Enter'); await wait(page, 100);
    await page.click('#v111FolFilt button:has-text("Video")'); await page.click('#v111FolFilt [role="radio"]:has-text("Running now")'); await wait(page, 100);
    await page.click('#v111FolFilt button:has-text("Save")'); await wait(page, 800);
    const af = (store.db.ai_settings.find((r) => r.key === 'ads_follow') || {}).value || {};
    check('searches and filters are saved for the Ad Strategist', af.keywords && af.keywords[0] === 'AI automation' && af.types.join() === 'video' && af.active === 'active', JSON.stringify(af));
    const ft = await ev(page, () => document.getElementById('v111FolFilt').textContent);
    check('the tab says the next run follows them, and what the country is for', /Saved\. The next run follows these\./.test(ft) && /Country\s*for the searches/.test(ft), ft.slice(-200));
    // after an upload: follow the advertiser too?
    const up = async (adv) => {
      await page.click('#main button:has-text("Upload ads")'); await wait(page, 300);
      await page.fill('#apUpAdv', adv); await page.fill('#apUpCopy', 'Meeting notes that write themselves. Try it free.');
      await page.click('#apUpGo'); await wait(page, 1500);
    };
    await up('Scribewell');
    check('after an upload, an advertiser not followed yet is offered', /Follow Scribewell too\?/.test(await ev(page, () => (document.querySelector('#apUpModal h3') || {}).textContent || '')));
    await page.fill('#v111FaPage', 'scribewell'); await page.click('#v111FaFor [role="radio"]:has-text("Ads and posts")'); await page.click('#v111FaGo'); await wait(page, 2500);
    check('Follow saves the account, for what the team picked, and carries on to the ad', store.db.competitors.some((x) => x.name === 'Scribewell' && x.meta_page_id === 'scribewell' && x.follow_for === 'both') && (await ev(page, () => document.getElementById('apUpModal').style.display === 'none' && !!document.querySelector('.nw-drawer'))));
    await page.keyboard.press('Escape'); await wait(page, 300);
    await up('Ledgerline');
    const lp = await ev(page, () => ({ h: (document.querySelector('#apUpModal h3') || {}).textContent || '', v: (document.getElementById('v111FaPage') || {}).value || '', f: (document.querySelector('#v111FaFor [aria-checked="true"]') || {}).textContent }));
    check('an advertiser read for posts only is asked, with its page filled in and ads only picked', /Follow Ledgerline too\?/.test(lp.h) && lp.v === '1000001' && lp.f === 'Ads only', JSON.stringify(lp));
    await page.click('#v111FaGo'); await wait(page, 2500);
    check('following it switches its ads on and keeps its posts', fc().Ledgerline === '1000001/both/approved', fc().Ledgerline);
    await page.keyboard.press('Escape'); await wait(page, 300);
    await up('Cobalt CRM');
    check('an advertiser already followed is not asked', await ev(page, () => !/Follow/.test((document.querySelector('#apUpModal h3') || {}).textContent || '')));
    await wait(page, 2000); await page.keyboard.press('Escape'); await wait(page, 300);
    await up('Gray Hollis Media');
    await page.click('#apUpModal button:has-text("Not now")'); await wait(page, 2200); await page.keyboard.press('Escape'); await wait(page, 300);
    await up('Gray Hollis Media');
    check('Not now is remembered', await ev(page, () => document.getElementById('apUpModal').style.display === 'none' || !/Follow/.test((document.querySelector('#apUpModal h3') || {}).textContent || '')));
    await ctx.close();
  }

  // ---------------- 6. the Intel Tracker leaves out the accounts followed for ads only ----------------
  {
    const { ctx, page, store } = await open('/dashboard/intel-tracker');
    const said = []; page.on('dialog', (d) => said.push(d.message()));
    await wait(page, 1200);
    const reads = await ev(page, () => (document.getElementById('main').textContent.match(/Reads \d+ accounts?/) || [''])[0]);
    check('the header counts only the accounts it reads', reads === 'Reads 3 accounts', reads);
    await page.click('.nw-tabs button[data-tab="follow"]'); await wait(page, 1500);
    const s = await ev(page, () => { const t = (sel) => [...document.querySelectorAll(sel)].map((b) => b.textContent.trim());
      return { lists: t('.v96-fol-g .who > b').sort(), ads: t('.v111-adsonly .who > b').sort(), sum: (document.querySelector('.v111-adsonly summary') || {}).textContent || '',
        cnt: (document.querySelector('.nw-tabs button[data-tab="follow"] .nw-cnt') || {}).textContent, n: t('.v96-fol-g .hd .n') }; });
    check('accounts followed for ads only sit apart, out of its lists and counts', s.lists.join() === 'Ledgerline,Northwind Advisory,Quill Partners' && s.ads.join() === 'Harbor Funnels,Pine Street Media' &&
      /Followed for ads only \(2\)/.test(s.sum) && s.cnt === '3' && s.n.join() === '1,2', JSON.stringify(s));
    await page.click('.v111-adsonly summary'); await wait(page, 100);
    await page.click('.v111-adsonly li:has-text("Harbor Funnels") button:has-text("Read their posts too")'); await wait(page, 1500);
    const hf = store.db.competitors.find((x) => x.name === 'Harbor Funnels');
    check('Read their posts too puts it on the list', hf.follow_for === 'both' && (await ev(page, () => [...document.querySelectorAll('.v96-fol-g .who > b')].some((b) => /Harbor Funnels/.test(b.textContent)))), hf.follow_for);
    await page.click('button[data-e9="folAdd"][data-k="company"]'); await wait(page, 300);
    await page.fill('#v96FName', 'Pine Street Media'); await page.fill('#v96FLi', 'https://www.linkedin.com/company/pine-street-qa');
    await page.click('#v96FGo'); await wait(page, 1500);
    const pines = store.db.competitors.filter((x) => x.name === 'Pine Street Media');
    check('following an ads-only account by name reads its posts too, with no second row', pines.length === 1 && pines[0].follow_for === 'both' && pines[0].handle_linkedin === 'company/pine-street-qa', JSON.stringify(pines));
    await page.click('.v96-fol-g li:has-text("Ledgerline") button[data-e9="folStop"]'); await wait(page, 1200);
    const lg = store.db.competitors.find((x) => x.name === 'Ledgerline');
    check('stopping an account whose ads are pulled too says neither agent reads it', lg.status === 'denied' && said.some((m) => /neither agent reads them, posts or ads/.test(m)), said.join(' | '));
    await ctx.close();
  }

  const real = errors.filter((e) => !/Failed to load resource/.test(e));
  check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) console.log(failures.map((f) => ' - ' + f).join('\n'));
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
