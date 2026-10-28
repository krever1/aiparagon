// v127 tests for new-aiparagon-dashboard.html (#1): screens say what the agents really do with feedback, and the
// feedback that went nowhere reaches the next run. Rejecting an Intel Tracker reply asks why (quick reasons and a
// note, or none); the reason is saved to agent_feedback and AI settings offers it as a rule for the tracker. What the
// team said when a campaign's survey, landing or booking page was turned down rides in the next book-a-call request,
// and the Funnel Builder gets the same setup line (guardrails, preferences, denials) in its funnel note. From your
// feedback leaves out the texts the dashboard writes itself, and the texts that promised more say what happens.
// The sign-in page has no demo labels. Desktop and phone width. Supabase answers from an in-memory store
// (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and n8n webhooks answer from stubs, so no real
// account, data or workflow is touched. Fails on the build before v127.
// Usage: node tests/dashboard-v127.test.js
const fs = require('fs');
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
const REPLY = '00000000-0000-4000-8000-00000000d001';                 // the pending reply in the fixtures (Northwind Advisory)
const PKG = '00000000-0000-4000-8000-0000000000b1', PKG2 = '00000000-0000-4000-8000-0000000000b9';
const fbRow = (id, o) => Object.assign({ id: '00000000-0000-4000-8000-00000000f' + id, author: 'qa@aiparagonconsulting.com', created_at: ago(2) }, o);
const STOCK = ['Reviewed on the dashboard', 'Approved in Approvals', 'Undone in Approvals', 'Score manually set to 0.80 (was 0.45)', 'survey edited on dashboard',
  'Changed after approval', 'Put back the agent’s own version.', 'Approved by putting its landing page live (/go/qa-page)', 'Regenerated without notes', 'Approved on dashboard'];
const PAGES = [
  fbRow('a01', { agent: 'low_ticket_content', target_type: 'funnel_asset', target_id: PKG + ':survey', action: 'rejected', feedback: 'Too many questions, ask two at most', created_at: ago(3) }),
  fbRow('a02', { agent: 'low_ticket_content', target_type: 'funnel_asset', target_id: PKG + ':landing', action: 'rejected', feedback: 'Headline is vague', created_at: ago(6) }),
  fbRow('a03', { agent: 'low_ticket_content', target_type: 'funnel_asset', target_id: PKG + ':landing', action: 'approved', feedback: 'Approved on dashboard', created_at: ago(4) }),
  fbRow('a04', { agent: 'low_ticket_content', target_type: 'funnel_asset', target_id: PKG + ':booking', action: 'rejected', feedback: '', created_at: ago(2) }),
  fbRow('a05', { agent: 'low_ticket_content', target_type: 'funnel_asset', target_id: PKG2 + ':landing', action: 'rejected', feedback: 'Lead with the diagnostic, not the price', created_at: ago(1) }),
  fbRow('a06', { agent: 'low_ticket_content', target_type: 'funnel_asset', target_id: PKG2 + ':survey', action: 'rejected', feedback: 'An old note from the spring', created_at: ago(130) }),
];
const AD_DENY = fbRow('a07', { agent: 'low_ticket_content', target_type: 'ad_image_variant', target_id: 'qa-ad-a.png', action: 'rejected', feedback: 'Copy: weak proof, off-voice. Too much jargon', created_at: ago(2) });
const GUARD = { reviewer: 'QA Tester', require: false, blocked: ['game-changer', 'revolutionary'], disclosure: 'Past results do not guarantee future outcomes.', refs: [] };
const PREFS = { creative: 'Short sentences\nNo exclamation marks', running: '', use_read: false, memory: [{ text: 'Say advisers, not advisors', at: ago(5) }] };

function tables(extra) {
  const t = FX.tables();
  t.agent_feedback = [];
  t.ai_settings.push({ key: 'e3_guardrails', value: GUARD, updated_at: ago(9) }, { key: 'e3_prefs', value: PREFS, updated_at: ago(9) });
  if (extra) extra(t);
  return t;
}

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(width, store, url, o) {
    o = o || {};
    const hooks = [];
    const hook = (u, m, b) => {
      let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) {}
      hooks.push({ u, b: body });
      if (/\/e3-funnel-run/.test(u)) return { body: { ok: true, started: true, run_id: 'funnel_qa_v127' } };
      return { body: { ok: true, started: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: o.signedOut ? false : true, rest: store, hooks: hook, bucket: errors });
    await page.setViewportSize({ width, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, o.signedOut ? 'login' : 'app');
    await page.waitForTimeout(o.signedOut ? 300 : 1400);
    return { ctx, page, hooks };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 300);
  const ev = (page, fn, arg) => page.evaluate(fn, arg);
  const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  const posts = (store, tt) => store.writes.filter((w) => w.method === 'POST' && w.table === 'agent_feedback' && w.body && (!tt || w.body.target_type === tt));
  const patches = (store) => store.writes.filter((w) => w.method === 'PATCH' && w.table === 'engagement_drafts');
  const last = (hooks, re) => hooks.filter((h) => re.test(h.u)).pop();
  const startReject = async (page) => {
    await ev(page, (id) => nwReplyOpen(id), REPLY); await wait(page, 300);
    await page.click('#nwReplyM .nw-m-foot button:has-text("Reject")');
    await page.waitForSelector('#v127M', { state: 'visible', timeout: 5000 });
  };

  // 1. a reply: Reject asks why, and the reason is saved for the tracker
  for (const width of [1440, 390]) {
    const at = ' at ' + width;
    const store = makeStore(tables());
    const { ctx, page } = await open(width, store, '/dashboard/approvals');
    await startReject(page);
    const m = await ev(page, () => {
      const el = document.getElementById('v127M');
      return { h: (el.querySelector('h2') || {}).textContent || '', k: (el.querySelector('.nw-kicker') || {}).textContent || '', chips: [...el.querySelectorAll('.v103-why button')].map((b) => b.textContent),
        note: !!el.querySelector('#v127Ta'), hint: (el.querySelector('.v103-dh') || {}).textContent || '', go: (document.getElementById('v127Go') || {}).textContent || '', focus: document.activeElement && document.activeElement.closest('#v127M .v103-why') ? 1 : 0 };
    });
    check('Reject asks why first' + at, m.h === 'Why reject this reply?' && /^Intel Tracker · reply to Northwind Advisory$/.test(m.k), JSON.stringify([m.h, m.k]));
    check('with quick reasons, a note and Reject' + at, JSON.stringify(m.chips) === JSON.stringify(['Off-voice', 'Too salesy', 'Too long', 'Too generic', 'Off-topic', 'Not worth a reply']) && m.note && m.go === 'Reject' && m.focus === 1, JSON.stringify(m));
    check('it says where the reason goes, and that none is fine' + at, m.hint === 'The reason shows on AI settings, where it can become a rule the tracker follows. Leave it empty to reject without one.', m.hint);
    if (width === 390) check('the question fits a phone' + at, await ev(page, () => document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('v127M').getBoundingClientRect().right <= innerWidth + 1), String(await ev(page, () => document.documentElement.scrollWidth)));
    check('nothing is saved while it asks' + at, patches(store).length === 0 && posts(store).length === 0);
    await page.click('#v127M .v103-why button:has-text("Too salesy")');
    await page.click('#v127M .v103-why button:has-text("Not worth a reply")');
    await page.fill('#v127Ta', '  Skip posts about a client   loss ');
    await page.click('#v127Go'); await wait(page, 900);
    const p = posts(store, 'engagement_draft')[0] || {}, b = p.body || {};
    check('the reason is saved with the decision, for the tracker' + at, b.agent === 'intel_tracker' && b.target_id === REPLY && b.action === 'rejected' && b.feedback === 'Reply: too salesy, not worth a reply. Skip posts about a client loss', JSON.stringify(b));
    check('and the reply is rejected' + at, patches(store).some((w) => w.body && w.body.status === 'rejected'), JSON.stringify(patches(store).map((w) => w.body)));
    check('the toast says where the reason is, not that the tracker learns on its own' + at, (await txt(page, '#nwToast')) === 'Rejected. The reason is on AI settings, where it can become a rule the tracker follows.', await txt(page, '#nwToast'));
    check('the question is gone' + at, !(await page.$('#v127M')) && !(await page.$('#nwScrim')));
    await ctx.close();
  }

  // 2. called off: Cancel, the X, Esc and a click outside keep the reply; Reject with nothing picked saves no reason
  {
    const store = makeStore(tables());
    const { ctx, page } = await open(1440, store, '/dashboard/approvals');
    for (const how of ['cancel', 'x', 'esc', 'scrim']) {
      await startReject(page);
      if (how === 'cancel') await page.click('#v127M .nw-m-foot button:has-text("Cancel")');
      if (how === 'x') await page.click('#v127M .nw-m-head .nw-icon-btn');
      if (how === 'esc') await page.keyboard.press('Escape');
      if (how === 'scrim') await page.mouse.click(8, 450);
      await wait(page, 500);
      check('closed with ' + how + ': nothing saved, the reply still waits', !(await page.$('#v127M')) && patches(store).length === 0 && posts(store).length === 0 &&
        (await ev(page, (id) => (nwFindReply(id) || {}).status, REPLY)) === 'pending', JSON.stringify({ p: patches(store).length, f: posts(store).length }));
    }
    check('nothing is left waiting on the question', await ev(page, () => V127.why === null));
    await startReject(page);
    await page.click('#v127Go'); await wait(page, 900);
    const b = (posts(store, 'engagement_draft')[0] || {}).body || {};
    check('Reject with nothing picked rejects, without a reason', patches(store).some((w) => w.body && w.body.status === 'rejected') && b.feedback === 'Reviewed on the dashboard', JSON.stringify(b));
    check('and says only Rejected', (await txt(page, '#nwToast')) === 'Rejected.', await txt(page, '#nwToast'));
    // a call that passes its own reason is not asked again
    const asked = await ev(page, async (id) => { const r = await apSetDraft(id, 'rejected', 'Reply: off-topic.'); return { r, open: !!document.getElementById('v127M') }; }, REPLY);
    check('a caller with its own reason is not asked', asked.open === false && asked.r !== false && posts(store, 'engagement_draft').some((w) => w.body.feedback === 'Reply: off-topic.'), JSON.stringify(asked));
    await ctx.close();
  }

  // 3. AI settings: the reason can become a rule for the tracker; the texts the dashboard writes itself are left out
  {
    const store = makeStore(tables((t) => {
      STOCK.forEach((s, i) => t.agent_feedback.push(fbRow('b' + String(i).padStart(2, '0'), { agent: i % 2 ? 'intel_tracker' : 'low_ticket_content', target_type: 'x', target_id: 'x' + i, action: 'rejected', feedback: s, created_at: ago(1) })));
      t.agent_feedback.push(fbRow('b90', { agent: 'intel_tracker', target_type: 'engagement_draft', target_id: REPLY, action: 'rejected', feedback: 'Reply: too salesy. Skip posts about a client loss.', created_at: ago(2) }));
    }));
    const { ctx, page } = await open(1440, store, '/dashboard/ai-settings');
    await wait(page, 600);
    const fb = await page.$$eval('#apFbList .ap-fb', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
    check('From your feedback lists the reason, as rejected on the Intel Tracker', fb.length === 1 && /Reply: too salesy\. Skip posts about a client loss\./.test(fb[0]) && /Intel Tracker · rejected · qa/.test(fb[0]), JSON.stringify(fb));
    check('and none of the texts the dashboard saves on its own', !STOCK.some((s) => fb.join(' | ').indexOf(s) >= 0), JSON.stringify(fb));
    check('the count says one reason', /^1/.test(await txt(page, '.ap-ais .rd-strip button:nth-child(2) .n')), await txt(page, '.ap-ais .rd-strip button:nth-child(2) .n'));
    await page.locator('#apFbList .ap-fb').first().locator('button', { hasText: 'Make it a rule' }).click(); await wait(page, 400);
    const box = await ev(page, () => ({ v: document.getElementById('apRuleTa').value, on: [...document.querySelectorAll('.ap-rule-opts input')].filter((i) => i.checked).map((i) => i.value) }));
    check('Make it a rule fills the box for the Intel Tracker, the scope its reply prompt reads', box.v === 'Reply: too salesy. Skip posts about a client loss.' && JSON.stringify(box.on) === '["intel_tracker"]', JSON.stringify(box));
    const where = await page.$$eval('.ap-ais .ap-where > div', (els) => els.map((el) => [(el.querySelector('b') || {}).textContent || '', (el.querySelector('small') || {}).textContent || '', ((el.querySelector('.d') || {}).className || '').replace(/\bd\b/, '').trim()]));
    check('Where these apply: book a call and low-ticket follow the profile and the reasons ads and pages were denied', where.some((w) => w[0] === 'Book a call and low-ticket campaigns' && w[1] === 'Not the rules yet. They follow the company profile and the reasons ads and pages were denied' && w[2] === 'no'), JSON.stringify(where));
    check('the funnel builder has its own line, and the upload analyzer still reads nothing', where.some((w) => w[0] === 'Funnel builder (webinar, download, sign-up and landing page)' && w[1] === 'Not the rules yet. It follows the company profile and the reasons ads and pages were denied' && w[2] === 'no') &&
      where.some((w) => w[0] === 'Ad upload analyzer' && w[1] === 'Not yet'), JSON.stringify(where));
    await ctx.close();
  }

  // 4. book a call: what was said about earlier pages rides in the request, and the side pane says so
  {
    const store = makeStore(tables((t) => { PAGES.forEach((r) => t.agent_feedback.push(r)); t.agent_feedback.push(AD_DENY); }));
    const { ctx, page, hooks } = await open(1440, store, '/dashboard/marketing-generation');
    await wait(page, 800);
    const uses = await txt(page, '#nwMgSideB .nw-uses');
    check('the side pane says the campaign avoids what was said about earlier pages, newest first', /Avoids what was said about earlier pages: landing page, survey/.test(uses), uses);
    check('next to what was denied before on the ads', /Avoids what was denied before: weak proof, off-voice/.test(uses), uses);
    await page.fill('#v97MgWhat', 'Ads for the AI Readiness Diagnostic');
    await page.click('#v97MgGoBtn'); await wait(page, 2200);
    const lt = last(hooks, /e3-low-ticket-run/), req = (lt && lt.b.request) || '';
    check('the request carries what the team said about the survey and the landing page',
      req.indexOf('Earlier pages were turned down. What the team said about the landing page: “Lead with the diagnostic, not the price”; the survey: “Too many questions, ask two at most”. Do not repeat these.') >= 0, req);
    check('a page approved after its denial, a denial with no reason and one older than 120 days are left out', !/Headline is vague|old note from the spring|booking page/.test(req), req);
    check('the ad denials and the guardrails still ride along', /Earlier ads were turned down for: weak proof, off-voice\./.test(req) && /Never use these phrases: game-changer; revolutionary\./.test(req) && /Include this disclosure exactly as written: Past results do not guarantee future outcomes\./.test(req), req);
    check('within the 1200 characters the Low-Ticket Agent reads', req.length <= 1200, String(req.length));
    await ctx.close();
  }

  // 5. a webinar: the Funnel Builder gets the same setup line in its funnel note
  {
    const store = makeStore(tables((t) => { PAGES.forEach((r) => t.agent_feedback.push(r)); t.agent_feedback.push(AD_DENY); }));
    const { ctx, page, hooks } = await open(1440, store, '/dashboard/marketing-generation');
    await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await wait(page, 700);
    const uses = await txt(page, '#nwMgSideB .nw-uses');
    check('a webinar says it follows the profile and avoids what was denied, on its own budget', /Follows blocked phrases, disclosure/.test(uses) && /Avoids what was denied before: weak proof, off-voice/.test(uses) && /Avoids what was said about earlier pages: landing page, survey/.test(uses), uses);
    await page.fill('#v97MgWhat', 'A webinar on governed AI for RIAs');
    await page.click('#v97MgGoBtn'); await wait(page, 2200);
    const fr = last(hooks, /e3-funnel-run/), fb = (fr && fr.b) || {}, note = String(fb.funnel_note || '');
    check('the webinar goes to the Funnel Builder', fb.funnel_type === 'webinar', JSON.stringify(Object.keys(fb)));
    check('its funnel note is the campaign setup line', /^Campaign setup \(from the form\): Audience: cold, people who have not heard of us yet\./.test(note), note);
    check('with the guardrails', /Never use these phrases: game-changer; revolutionary\./.test(note) && /Include this disclosure exactly as written: Past results do not guarantee future outcomes\./.test(note), note);
    check('the remembered corrections and the team preferences', /Remember from past runs: Say advisers, not advisors\./.test(note) && /Team preferences: Short sentences; No exclamation marks\./.test(note), note);
    check('and what was denied on ads and pages', /Earlier ads were turned down for: weak proof, off-voice\. Notes: “Too much jargon”\. Avoid repeating these\./.test(note) && /the landing page: “Lead with the diagnostic, not the price”; the survey: “Too many questions, ask two at most”\. Do not repeat these\./.test(note), note);
    check('within the 1500 characters the Funnel Builder reads', note.length <= 1500, String(note.length));
    check('the plan still goes along, as before', Array.isArray(fb.plan) && fb.plan.length > 1, JSON.stringify(fb.plan));
    // a team note keeps its place in front
    await ev(page, () => { V113.fun.running = null; clearTimeout(V113.fun.pt); V113.mg.funNote = 'Keep the registration page short'; nwMgSide(); });
    await page.click('#v97MgGoBtn'); await wait(page, 2200);
    const n2 = String((last(hooks, /e3-funnel-run/) || { b: {} }).b.funnel_note || '');
    check('a note of the team\'s comes first, then the setup line', /^Keep the registration page short\n\nCampaign setup \(from the form\): /.test(n2) && n2.length <= 1500, n2.slice(0, 120));
    await ctx.close();
  }

  // 6. a funnel whose guardrails do not all fit: the pane says so with advice that fits a funnel
  {
    const many = Array.from({ length: 60 }, (_, i) => 'a phrase we never want to see ' + String(i).padStart(2, '0'));
    const store = makeStore(tables((t) => { const g = t.ai_settings.find((x) => x.key === 'e3_guardrails'); g.value = Object.assign({}, GUARD, { blocked: many }); }));
    const { ctx, page, hooks } = await open(1440, store, '/dashboard/marketing-generation');
    await page.click('#v111Cats_mg .v111-cat[data-c="webinar"]'); await wait(page, 700);
    const warn = await txt(page, '#nwMgSideB .nw-long');
    check('the pane says only some blocked phrases fit, and what to shorten', warn === 'The request only has room for some of your blocked phrases. Shorten the blocked phrases or the disclosure on the company profile.', warn);
    await page.fill('#v97MgWhat', 'A webinar on governed AI for RIAs');
    await page.click('#v97MgGoBtn'); await wait(page, 2200);
    const note = String((last(hooks, /e3-funnel-run/) || { b: {} }).b.funnel_note || '');
    check('the request carries the shorter list, within 1500 characters', /Never use these phrases: a phrase we never want to see 00; .*05\./.test(note) && !/see 06/.test(note) && note.length <= 1500, note.length + ' ' + note.slice(0, 200));
    // book a call keeps its own advice
    await page.click('#v111Cats_mg .v111-cat[data-c="direct_to_call"]'); await wait(page, 700);
    const w2 = await txt(page, '#nwMgSideB .nw-long');
    check('book a call keeps its own advice (the focus and the ad structure)', /Shorten the focus or pick a shorter ad structure\./.test(w2), w2);
    await ctx.close();
  }

  // 7. the texts that promised more than happens
  {
    const store = makeStore(tables());
    const { ctx, page } = await open(1440, store, '/dashboard/content-transformation');
    const info = await ev(page, () => ({ mem: E9_INFO.v104mem.h, v3: E9_INFO.voice3.h }));
    check('How the agents remember says what a denial does, and that one with no reason changes nothing',
      /When an ad is denied, the reasons about its copy go with the next campaign, and the newest reasons steer the next book-a-call and low-ticket images\. A denial with no reason changes nothing\./.test(info.mem) && !/only steer the next images/.test(info.mem), info.mem);
    check('the voice: each saved edit makes a new version, nothing refines it on its own', /Each edit you save makes a new one\./.test(info.v3) && !/keep refining/.test(info.v3), info.v3);
    await ev(page, () => v96LearnOpen()); await wait(page, 1200);
    const learn = await txt(page, '#e9Learn');
    check('How it learns: feedback is the denial reasons and the asks on drafts', /The reasons ads were denied and what you asked to change on drafts go into the next run\./.test(learn) && !/denials with a reason and edits/.test(learn), learn);
    check('and house rules reach the agents listed on AI settings, not every agent', /Rules you set in AI settings go into every run of the agents listed there\./.test(learn) && !/apply to every agent, every time/.test(learn), learn);
    await ev(page, () => apModalClose('v96Learn')); await wait(page, 200);
    // the score dialog
    await ev(page, () => openScoreModal('Set ad score', 0.5, async () => {})); await wait(page, 200);
    const score = await ev(page, () => document.body.innerText);
    check('the score dialog says the score is kept on the item', /Your score is saved on this item, in place of the agent’s\./.test(score) && !/saved to the knowledge base/.test(score));
    await ev(page, () => { let e = document.getElementById('scoreRange'); while (e && e.parentElement && e.parentElement !== document.body) e = e.parentElement; if (e) e.remove(); });
    // a brief's change request and the older reject dialog
    await ev(page, () => apCfApprove('intel_tracker', 'intel_qa', 'changes')); await wait(page, 300);
    check('a brief change request says where it goes (the box\'s hint)', /It shows on AI settings, where it can become a rule the agent follows\./.test((await ev(page, () => (document.getElementById('aipModalText') || {}).placeholder || ''))), (await ev(page, () => (document.getElementById('aipModalText') || {}).placeholder || '')));
    await page.fill('#aipModalText', 'The governance finding needs a source'); await page.click('#aipModalSave'); await wait(page, 700);
    check('and the toast after it', /Saved\. It shows on AI settings, where it can become a rule\./.test(await ev(page, () => document.body.innerText)) && posts(store, 'brief_approval').some((w) => w.body.action === 'changes'));
    await ev(page, () => { const b = document.createElement('button'); b.id = 'qaRej'; document.body.appendChild(b); rejectWithFeedback('qa-1', b, 'intel_tracker', 'engagement_draft', 'engagement draft'); }); await wait(page, 300);
    check('the older reject dialog says where the reason goes', /The reason shows on AI settings, where it can become a rule the agent follows\. Leave it empty to reject without one\./.test((await ev(page, () => (document.getElementById('aipModalText') || {}).placeholder || ''))), (await ev(page, () => (document.getElementById('aipModalText') || {}).placeholder || '')));
    await ev(page, () => { let e = document.getElementById('aipModalText'); while (e && e.parentElement && e.parentElement !== document.body) e = e.parentElement; if (e) e.remove(); });
    await ev(page, () => assetDecision('survey', 'rejected')); await wait(page, 300);
    check('a page denial says the next campaign gets it', /The next campaign you make gets it with its request\./.test((await ev(page, () => (document.getElementById('aipModalText') || {}).placeholder || ''))) && !/steers the next generation run/.test((await ev(page, () => (document.getElementById('aipModalText') || {}).placeholder || ''))), (await ev(page, () => (document.getElementById('aipModalText') || {}).placeholder || '')));
    await ctx.close();
  }

  // 8. the sign-in page: no demo labels, at desktop and phone width
  for (const width of [1440, 390]) {
    const store = makeStore(tables());
    const { ctx, page } = await open(width, store, '/dashboard/login', { signedOut: true });
    const s = await ev(page, () => { const lg = document.getElementById('view-login');
      return { g: (lg.querySelector('.brand-g') || {}).textContent, line: (lg.querySelector('.brand-line') || {}).textContent, sub: (lg.querySelector('.sub') || {}).textContent, help: (document.getElementById('apAuthSub') || {}).textContent, all: lg.innerText, w: document.documentElement.scrollWidth <= innerWidth + 1 }; });
    check('the sign-in mark is the P the sidebar uses at ' + width, s.g === 'P', s.g);
    check('no Demo environment or Sample data on the sign-in page at ' + width, s.line === 'AI Paragon Consulting Group · Team workspace' && !/demo environment|sample data/i.test(s.all), s.line);
    check('the line under the heading says what it does, not that it learns on its own at ' + width, s.sub === 'Prepare every meeting, turn your market into campaigns, and review it all before anything goes to a client.' && !/improves with every edit/.test(s.all), s.sub);
    check('and no dash in the line under Welcome back at ' + width, s.help === 'Your workspace follows you. Sign in on any machine and pick up where you left off.', s.help);
    check('the sign-in page fits at ' + width, s.w);
    await ctx.close();
  }

  // 9. the old promises are gone from the file
  {
    const html = fs.readFileSync(path.join(ROOT, H.FILE), 'utf8');
    const gone = ['The tracker learns from it', 'This is saved and steers the next generation run', 'Your edits and feedback keep refining it', 'saved to the knowledge base and logged as feedback',
      'This is saved and used to steer future outputs', 'Denials without a reason only steer the next images', 'apply to every agent, every time', 'Approvals, denials with a reason and edits go into the next run',
      'Only want the agent to redo it next time?', "'Change request saved'", 'learns your voice and improves with every edit', '<em>Demo environment</em> · <em>Sample data</em>'];
    const left = gone.filter((s) => html.indexOf(s) >= 0);
    check('none of the old promises is left in the dashboard', left.length === 0, left.join(' | '));
    check('the brief editor offers a note that can become a rule', html.indexOf('Want the agent to do it differently next time? <button type="button" class="nw-link nw-small" onclick="v111EdNoteOnly()">Leave a note instead</button> On AI settings a note can become a rule the agent follows.') >= 0);
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
