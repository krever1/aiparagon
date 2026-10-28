// v126 tests for new-aiparagon-dashboard.html (#1): feedback on content drafts reaches the next drafts. Every draft in
// Content Transformation (Drafts) and Marketing Generation (Library) gets "What should change?" (quick reasons and a
// note). The ask is saved to agent_feedback (content_generation, draft_review, changes), the draft counts it, AI settings
// lists it with Make it a rule for Content Transformation, and each new content request carries the newest asks as
// setup.feedback (its own kind first, the last 120 days, at most 6), which the side pane shows. Desktop and phone width.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and n8n
// webhooks answer from stubs, so no real account, data or workflow is touched. Fails on the build before v126.
// Usage: node tests/dashboard-v126.test.js
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
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const D1 = '00000000-0000-4000-8000-0000000dd001', D2 = '00000000-0000-4000-8000-0000000dd002';
const R1 = '00000000-0000-4000-8000-0000000cr001', R2 = '00000000-0000-4000-8000-0000000cr002';
const ASK = 'LinkedIn post: too long, too salesy. Cut the intro and the pitch.';
const MATERIAL = 'Synthetic talk notes about governed AI for advisers: who owns the model, who signs off, and what the client hears. '.repeat(4);

// two made-up drafts: a LinkedIn post from an article (Content Transformation) and a newsletter from the briefs (Library)
function tables(extra) {
  const t = FX.tables();
  t.content_requests = [
    { id: R1, created_at: ago(13), updated_at: ago(13), requested_by: 'qa@aiparagonconsulting.com', start_mode: 'source', format: 'thought_leadership', title: 'Governance article', source_type: 'article', status: 'done', output_id: D1 },
    { id: R2, created_at: ago(13), updated_at: ago(13), requested_by: 'qa@aiparagonconsulting.com', start_mode: 'idea', format: 'newsletter', title: 'From the organic brief', source_type: 'brief', status: 'done', output_id: D2 },
  ];
  t.agent_outputs.push(
    { id: D1, run_id: 'content_qa1', agent: 'content_generation', output_type: 'content_draft', title: 'Who signs off when the model is wrong?', created_at: ago(13),
      data: JSON.stringify({ request_id: R1, format: 'thought_leadership', source_type: 'article', start_mode: 'source', title: 'Who signs off when the model is wrong?',
        hooks: [{ label: 'Hook A', text: 'Nobody signs off on the model. That is the problem.' }, { label: 'Hook B', text: 'Your AI pilot has no owner.' }],
        body: 'Paragraph one from the source.\n\nParagraph two from the source.', cta: 'Book a governance review', review_flags: [], trace: {},
        brief: { primary_signal: 'intel_tracker' }, house: { rules: 1, template: 'LinkedIn post', kb_docs: 2, feedback: 2 } }) },
    { id: D2, run_id: 'content_qa2', agent: 'content_generation', output_type: 'content_draft', title: 'The governance brief, October', created_at: ago(13),
      data: JSON.stringify({ request_id: R2, format: 'newsletter', source_type: 'brief', start_mode: 'idea', title: 'The governance brief, October',
        hooks: [{ label: 'Subject A', text: 'Governance before tools' }], body: 'Issue body.', cta: 'Reply to this email', review_flags: [], trace: {}, brief: {}, house: { rules: 0 } }) });
  if (extra) extra(t);
  return t;
}

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(width, store, url) {
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    await page.setViewportSize({ width, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1200);
    return { ctx, page };
  }
  const wait = (page, ms) => page.waitForTimeout(ms);
  const posts = (store) => store.writes.filter((w) => w.method === 'POST' && w.table === 'agent_feedback' && w.body && w.body.action === 'changes');
  const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  const lastReq = (store) => store.db.content_requests[store.db.content_requests.length - 1] || {};
  const setupOf = (r) => (typeof r.setup === 'string' ? JSON.parse(r.setup) : r.setup) || {};

  // 1. Content Transformation: ask for changes on a post, then the next post carries it
  {
    const store = makeStore(tables());
    const { ctx, page } = await open(1440, store, '/dashboard/content-transformation');
    await page.evaluate(() => nwCtGoTab('drafts')); await wait(page, 2500);
    const btn = page.locator('.ap-cf-rev .v126-btn');
    check('a draft has What should change?, next to the review checks', (await btn.count()) === 1 && (await btn.isVisible()) && (await btn.textContent()) === 'What should change?', String(await btn.count()));
    check('no changes asked yet', !(await page.$('.ap-cf-rev .v126-n')));
    check('the review info no longer promises that results rank future hooks', await page.evaluate(() => /What should change\?/.test(E9_INFO.rev.h) && !/rank future hooks/.test(E9_INFO.rev.h)));
    check('How this draft was made counts the asks it followed', /2 asks from earlier drafts/.test(await txt(page, '#e9MadeD')), await txt(page, '#e9MadeD .e9-made-c.wide'));
    await btn.click();
    await page.waitForSelector('#v126M', { state: 'visible', timeout: 5000 });
    const head = await page.$eval('#v126M', (m) => ({ k: m.querySelector('.nw-kicker').textContent, h: m.querySelector('h2').textContent, chips: [...m.querySelectorAll('.v103-why button')].map((b) => b.textContent), focus: !!(document.activeElement && document.activeElement.closest('.v103-why')) }));
    check('it asks what should change in this post, naming the draft', head.k === 'LinkedIn post · Who signs off when the model is wrong?' && head.h === 'What should change in this post?', JSON.stringify(head));
    check('with quick reasons to pick, the first one focused', head.chips.join('|') === 'Off-voice|Too long|Too generic|Too salesy|Weak hook|Needs a real example|Wrong audience|Unclear point' && head.focus, JSON.stringify(head));
    await page.click('#v126Go'); await wait(page, 300);
    check('nothing picked and nothing written is not saved, and it says why', posts(store).length === 0 && /Pick what was off, or write a sentence/.test(await txt(page, '#v126Msg')), await txt(page, '#v126Msg'));
    await page.fill('#v126Ta', 'too short'); await page.click('#v126Go'); await wait(page, 300);
    check('nor a few words', posts(store).length === 0);
    await page.click('#v126M .v103-why button:has-text("Too long")');
    await page.click('#v126M .v103-why button:has-text("Too salesy")');
    await page.fill('#v126Ta', 'Cut the intro and the pitch.');
    await page.click('#v126Go'); await wait(page, 1500);
    const p = posts(store), w = p.length ? p[p.length - 1].body : {};
    check('the ask is saved once, for this draft, as one sentence', p.length === 1 && w.agent === 'content_generation' && w.target_type === 'draft_review' && w.target_id === D1 && w.feedback === ASK && w.author === H.USER.email, JSON.stringify(p.map((x) => x.body)));
    check('the dialog closes', !(await page.$('#v126M')));
    check('the draft now counts 1 change asked', (await txt(page, '.ap-cf-rev .v126-n')) === '1 change asked', await txt(page, '.ap-cf-rev .v126-n'));
    check('an ask is not a sign-off: the draft still needs review', /Needs review/.test(await txt(page, '.ap-cf-dm')) && !!(await page.$('#cfReadyBtn')), await txt(page, '.ap-cf-dm'));
    // the next post
    await page.evaluate(() => nwCtGoTab('new')); await wait(page, 1500);
    const use = await txt(page, '#nwCtSideB .v126-use');
    check('the side pane says what the next post avoids', /Feedback on earlier drafts/.test(use) && /Avoids what was asked before: too long, too salesy · 1 note/.test(use), use);
    await page.click('#nwCtForm .nw-src-seg [data-s="paste"]'); await wait(page, 200);
    await page.fill('#cfText', MATERIAL); await page.evaluate(() => nwCtSync());
    const n0 = store.db.content_requests.length;
    await page.evaluate(() => nwCtSubmit()); await wait(page, 1800);
    const r = lastReq(store), su = setupOf(r);
    check('the new request carries the ask', store.db.content_requests.length === n0 + 1 && JSON.stringify(su.feedback) === JSON.stringify([ASK]), JSON.stringify(su.feedback));
    check('next to what the request always carried', su.format_label === 'LinkedIn post' && su.questions && typeof su.questions === 'object' && r.status === 'queued', JSON.stringify({ fl: su.format_label, st: r.status }));
    // the count opens AI settings, where the ask can become a house rule
    await page.evaluate(() => nwCtGoTab('drafts')); await wait(page, 2000);
    await page.click('.ap-cf-rev .v126-n');
    await page.waitForSelector('#apFbList', { timeout: 10000 }); await wait(page, 800);
    check('the count opens AI settings', (await page.evaluate(() => location.pathname)) === '/dashboard/ai-settings', await page.evaluate(() => location.pathname));
    const fb = await page.$$eval('#apFbList .ap-fb', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
    const mine = fb.find((t) => t.indexOf(ASK) >= 0) || '';
    check('it is listed as asked for changes on Content Transformation', /Content Transformation · asked for changes · qa/.test(mine), mine || JSON.stringify(fb));
    await page.locator('#apFbList .ap-fb', { hasText: ASK }).locator('button', { hasText: 'Make it a rule' }).click(); await wait(page, 500);
    const box = await page.evaluate(() => ({ v: document.getElementById('apRuleTa').value, on: [...document.querySelectorAll('.ap-rule-opts input')].filter((i) => i.checked).map((i) => i.value) }));
    check('Make it a rule fills the box, for Content Transformation only', box.v === ASK && JSON.stringify(box.on) === '["content_generation"]', JSON.stringify(box));
    // Where these apply
    const where = await page.$$eval('.ap-ais .ap-where > div', (els) => els.map((el) => ({ n: (el.querySelector('b') || {}).textContent || '', s: (el.querySelector('small') || {}).textContent || '', d: ((el.querySelector('.d') || {}).className || '').replace(/\bd\b/, '').trim() })));
    const ct = where.find((x) => /^Content/.test(x.n)) || {}, lt = where.find((x) => /^Book a call and low-ticket/.test(x.n)) || {};
    check('Where these apply: drafts read what the team asked to change', ct.s === 'Rules, the chosen template, the knowledge base and what the team asked to change in earlier drafts' && ct.d === 'live', JSON.stringify(ct));
    check('and the book-a-call and low-ticket campaigns are listed, reading denial reasons, not rules (v127: and the profile, and page denials)', lt.s === 'Not the rules yet. They follow the company profile and the reasons ads and pages were denied' && lt.d === 'no', JSON.stringify(lt));
    await ctx.close();
  }

  // 2. which asks go along: the last 120 days, its own kind first, newest first, at most 6
  {
    const fb = (id, target, text, days, action) => ({ id: '00000000-0000-4000-8000-00000000fb' + id, agent: 'content_generation', target_type: 'draft_review', target_id: target, action: action || 'changes', feedback: text, author: 'qa@aiparagonconsulting.com', created_at: ago(days) });
    const store = makeStore(tables((t) => {
      t.agent_feedback = (t.agent_feedback || []).concat([
        fb('01', D2, 'Newsletter: too long.', 1),
        fb('02', D1, 'LinkedIn post: weak hook. Start with the number.', 2),
        fb('03', D1, 'LinkedIn post: off-voice.', 200),
        fb('04', '00000000-0000-4000-8000-0000000dd999', 'Email: too generic. Name the client type.', 3),
        fb('05', D2, 'Newsletter: needs a real example.', 4), fb('06', D2, 'Newsletter: unclear point.', 5), fb('07', D2, 'Newsletter: wrong audience.', 6),
        fb('08', D2, 'Newsletter: too salesy.', 7), fb('09', D2, 'Newsletter: off-voice.', 8),
        fb('10', D1, '{"checked":["a"]}', 1, 'ready'),
      ]);
    }));
    const { ctx, page } = await open(1440, store, '/dashboard/marketing-generation');
    await page.evaluate(() => apCfLoad(true)); await wait(page, 500);
    const post = await page.evaluate(() => v126Lines('thought_leadership'));
    check('a post reads its own kind first, then the newest others, at most 6, nothing older than 120 days',
      JSON.stringify(post) === JSON.stringify(['LinkedIn post: weak hook. Start with the number.', 'Newsletter: too long.', 'Email: too generic. Name the client type.', 'Newsletter: needs a real example.', 'Newsletter: unclear point.', 'Newsletter: wrong audience.']), JSON.stringify(post));
    const news = await page.evaluate(() => v126Lines('newsletter'));
    check('a newsletter reads the six newsletter asks', news.length === 6 && news.every((x) => /^Newsletter:/.test(x)) && news[0] === 'Newsletter: too long.', JSON.stringify(news));
    // a newsletter from Marketing Generation carries them, and its side pane says so
    await page.click('#nwMgForm .nw-tile[data-k="newsletter"]'); await wait(page, 600);
    const use = await txt(page, '#nwMgSideB .v126-use');
    check('the newsletter\'s side pane counts the reasons and the notes', /Avoids what was asked before: too long, needs a real example, unclear point/.test(use), use);
    await page.fill('#v97MgWhat', 'A newsletter on governed AI for advisers this month');
    const n0 = store.db.content_requests.length;
    await page.click('#v97MgGoBtn'); await wait(page, 1800);
    const su = setupOf(lastReq(store));
    check('the Marketing Generation newsletter request carries the asks', store.db.content_requests.length === n0 + 1 && JSON.stringify(su.feedback) === JSON.stringify(news), JSON.stringify(su.feedback));
    await page.click('#nwMgForm .nw-tile[data-k="ad"]'); await wait(page, 600);
    check('an ad campaign shows no draft asks (it has the denial reasons)', !(await page.$('#nwMgSideB .v126-use')));
    await ctx.close();
  }

  // 3. the Library on Marketing Generation, and no asks at all
  {
    const store = makeStore(tables());
    const { ctx, page } = await open(1440, store, '/dashboard/marketing-generation');
    await page.evaluate(() => nwMgGoTab('library')); await wait(page, 2500);
    const b = page.locator('.ap-cf-rev .v126-btn');
    check('a draft in the Library has the button too', (await b.count()) === 1 && (await b.isVisible()));
    await b.click(); await page.waitForSelector('#v126M', { state: 'visible', timeout: 5000 });
    check('it asks about this issue', (await txt(page, '#v126M h2')) === 'What should change in this issue?' && /^Newsletter · The governance brief, October$/.test(await txt(page, '#v126M .nw-kicker')), await txt(page, '#v126M .nw-kicker'));
    await page.click('#v126M .nw-btn-ghost'); await wait(page, 300);
    check('Cancel closes it and saves nothing', !(await page.$('#v126M')) && posts(store).length === 0);
    await page.evaluate(() => nwMgGoTab('make')); await wait(page, 800);
    await page.click('#nwMgForm .nw-tile[data-k="thought_leadership"]').catch(() => {}); await wait(page, 500);
    check('with no asks on file the side pane shows no feedback row', !(await page.$('#nwMgSideB .v126-use')) && !(await page.$('#nwCtSideB .v126-use')));
    await ctx.close();
  }

  // 4. a phone
  {
    const store = makeStore(tables());
    const { ctx, page } = await open(390, store, '/dashboard/content-transformation');
    await page.evaluate(() => nwCtGoTab('drafts')); await wait(page, 2500);
    const b = page.locator('.ap-cf-rev .v126-btn');
    await b.scrollIntoViewIfNeeded();
    check('on a phone the button is there', await b.isVisible());
    await b.click(); await page.waitForSelector('#v126M', { state: 'visible', timeout: 5000 });
    const fit = await page.evaluate(() => { const r = document.getElementById('v126M').getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth, sw: document.documentElement.scrollWidth }; });
    check('the dialog fits the phone', fit.l >= 0 && fit.r <= fit.w + 1 && fit.sw <= fit.w + 1, JSON.stringify(fit));
    await page.click('#v126M .v103-why button:has-text("Off-voice")');
    await page.click('#v126Go'); await wait(page, 1500);
    const p = posts(store);
    check('one reason alone is enough, and reads as a sentence', p.length === 1 && p[0].body.feedback === 'LinkedIn post: off-voice.', JSON.stringify(p.map((x) => x.body)));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
