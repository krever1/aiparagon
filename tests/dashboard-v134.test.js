// v134 tests for new-aiparagon-dashboard.html (#1): AI settings keeps its place when it draws itself again. Until
// v134, Add rule, Save changes, Cancel and Delete put the page's loading screen up before drawing it again, so the
// page emptied for a moment and the window jumped to the top: after Make it a rule (which brings the rule box into
// view lower down) and Add rule, the rule just added was out of sight. Now the page stays on screen until the new one
// is ready, the window keeps its scroll, and a rule just added is brought into view if it is not on screen. Opening
// AI settings from another page still starts at the top, and one rule per click (v130) and the product header (v129)
// hold through it all.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js, plus
// made-up rules and reasons here) and n8n webhooks answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v134.test.js
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

// enough house rules and reasons that the page scrolls well past one screen
function tables() {
  const t = FX.tables();
  const iso = (s) => new Date(s).toISOString();
  for (let i = 1; i <= 8; i++) {
    t.ai_rules.push({ id: '00000000-0000-4000-8000-0000000b13' + String(i).padStart(2, '0'), rule: 'Made-up house rule ' + i + ' for the scroll checks.', category: 'Format', applies_to: ['all'],
      active: true, source: 'manual', created_by: 'QA Tester', created_at: iso('2026-09-1' + (i % 10) + 'T00:00:00Z'), updated_at: iso('2026-09-1' + (i % 10) + 'T00:00:00Z') });
  }
  t.agent_feedback = [
    { id: '00000000-0000-4000-8000-0000000c1301', agent: 'client_proposal', target_type: 'e1_document', target_id: 'qa.lead@example.com:client_proposal', action: 'changes',
      feedback: 'Open with what the delays cost them, then the plan.', author: 'qa.tester@example.com', created_at: iso('2026-10-30T10:00:00Z') },
    { id: '00000000-0000-4000-8000-0000000c1302', agent: 'ad_strategist', target_type: 'brief_approval', target_id: 'agent2_2026-10-19_1500', action: 'approved',
      feedback: 'Open with the cost of waiting. It is the hook our buyers answer.', author: 'qa.tester@example.com', created_at: iso('2026-10-19T17:05:00Z') },
    { id: '00000000-0000-4000-8000-0000000c1303', agent: 'intel_tracker', target_type: 'brief_approval', target_id: 'agent1_2026-10-12_1300', action: 'approved',
      feedback: 'Leave out posts older than two weeks. They go stale before we write.', author: 'qa.tester@example.com', created_at: iso('2026-10-12T16:40:00Z') },
  ];
  return t;
}

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(width, height) {
    const store = makeStore(tables());
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    await page.setViewportSize({ width: width || 1280, height: height || 860 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + '/dashboard/ai-settings', { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(2500);
    return { ctx, page, store };
  }
  const sy = (page) => page.evaluate(() => Math.round(window.scrollY));
  const settle = async (page) => { let a = -1, b = await sy(page); for (let i = 0; i < 20 && a !== b; i++) { a = b; await page.waitForTimeout(150); b = await sy(page); } return b; };
  // watch #page-learning for the loading screen while an action runs
  const watch = (page) => page.evaluate(() => {
    window.__v134Loading = false; const pg = document.getElementById('page-learning');
    if (window.__v134Mo) window.__v134Mo.disconnect();
    window.__v134Mo = new MutationObserver(() => { if (pg.querySelector('.loading')) window.__v134Loading = true; });
    window.__v134Mo.observe(pg, { childList: true, subtree: true });
  });
  const sawLoading = (page) => page.evaluate(() => window.__v134Loading);
  // a row (or the box) on screen: below the top bar and above the bottom edge
  const onScreen = (page, css, re) => page.evaluate(([css, src]) => {
    const el = [...document.querySelectorAll(css)].find((e) => !src || new RegExp(src).test(e.innerText)); if (!el) return 'missing';
    const b = el.getBoundingClientRect(); return b.top >= 60 && b.bottom <= window.innerHeight ? 'yes' : 'no (' + Math.round(b.top) + ' to ' + Math.round(b.bottom) + ' of ' + window.innerHeight + ')';
  }, [css, re ? re.source : null]);
  const head = (page) => page.evaluate(() => {
    const pg = document.querySelector('.page.on'), h = pg && pg.querySelector('h1'), e = h && h.parentNode.querySelector('.rd-eyebrow,.eyebrow');
    return (e ? e.textContent.trim() : '-') + ' | ' + (h ? h.textContent.trim() : '-');
  });
  const saves = (store, re, method) => store.writes.filter((w) => w.table === 'ai_rules' && w.method === (method || 'POST') && !w.refused && re.test(JSON.stringify(w.body || ''))).length;

  // 1. Make it a rule from a reason lower down, then Add rule: the page stays where it is and the new rule shows
  {
    const { ctx, page, store } = await open();
    await page.evaluate(() => document.getElementById('apFbList').scrollIntoView({ block: 'start' }));
    await settle(page);
    await page.locator('#apFbList .ap-fb', { hasText: 'delays cost them' }).locator('button', { hasText: 'Make it a rule' }).click();
    const y0 = await settle(page);
    check('Make it a rule brings the rule box into view, well down the page', y0 > 150 && (await onScreen(page, '#apRuleTa')) === 'yes', 'scroll ' + y0 + ', box ' + (await onScreen(page, '#apRuleTa')));
    const activeN = async () => parseInt((await page.locator('.ap-ais .rd-strip button').first().innerText()).trim(), 10);
    const n0 = await activeN();
    await watch(page);
    await page.click('#apRuleGo');
    await page.waitForTimeout(2500);
    const y1 = await settle(page);
    check('Add rule: the rule is saved once', saves(store, /delays cost them/) === 1, String(saves(store, /delays cost them/)));
    check('Add rule: the window keeps its place (no jump to the top)', Math.abs(y1 - y0) <= 2, y0 + ' -> ' + y1);
    check('Add rule: no loading screen in between', (await sawLoading(page)) === false);
    check('Add rule: the rule just added is on screen', (await onScreen(page, '.ap-rule', /delays cost them/)) === 'yes', await onScreen(page, '.ap-rule', /delays cost them/));
    check('Add rule: it applies to the Catalyst agents', /Catalyst agents/.test(await page.locator('.ap-rule', { hasText: 'delays cost them' }).first().innerText()));
    check('Add rule: the box is empty again, on screen and ready', (await page.inputValue('#apRuleTa')) === '' && (await onScreen(page, '#apRuleTa')) === 'yes' && !(await page.isDisabled('#apRuleGo')));
    check('Add rule: the header stays Settings | AI settings', (await head(page)) === 'Settings | AI settings', await head(page));
    // (the dashboard also adds rules from the company profile in the background, so count what is saved)
    const saved = store.db.ai_rules.filter((r) => r.active !== false).length;
    check('Add rule: Active rules counts every rule saved, the new one too', (await activeN()) === saved && (await activeN()) > n0 && (await page.locator('.ap-rule', { hasText: 'delays cost them' }).count()) === 1, n0 + ' -> ' + (await activeN()) + ', saved ' + saved);

    // 2. Delete a rule lower in the list: it goes, the page stays
    await page.evaluate(() => { const r = [...document.querySelectorAll('.ap-rule')].find((x) => /house rule 5 /.test(x.innerText)); r.scrollIntoView({ block: 'center' }); });
    const y2 = await settle(page);
    await watch(page);
    await page.locator('.ap-rule', { hasText: 'house rule 5 ' }).locator('button', { hasText: /^Delete$/ }).click();
    await page.waitForTimeout(2500);
    const y3 = await settle(page);
    check('Delete: the rule is deleted', store.writes.filter((w) => w.table === 'ai_rules' && w.method === 'DELETE').length === 1 && (await page.locator('.ap-rule', { hasText: 'house rule 5 ' }).count()) === 0);
    check('Delete: the window keeps its place', y2 > 150 && Math.abs(y3 - y2) <= 2, y2 + ' -> ' + y3);
    check('Delete: no loading screen in between', (await sawLoading(page)) === false);

    // 3. Edit, then Save changes: the box comes into view as before, and the save keeps the place
    await page.locator('.ap-rule', { hasText: 'house rule 7 ' }).locator('button', { hasText: /^Edit$/ }).click();
    await page.waitForTimeout(1200);
    const y4 = await settle(page);
    check('Edit: the rule is in the box, on screen', /house rule 7 /.test(await page.inputValue('#apRuleTa')) && (await onScreen(page, '#apRuleTa')) === 'yes');
    await page.fill('#apRuleTa', 'Made-up house rule 7, changed for the scroll checks.');
    await watch(page);
    await page.click('#apRuleGo');
    await page.waitForTimeout(2500);
    const y5 = await settle(page);
    check('Save changes: the change is sent once', saves(store, /rule 7, changed/, 'PATCH') === 1, String(saves(store, /rule 7, changed/, 'PATCH')));
    check('Save changes: the window keeps its place', Math.abs(y5 - y4) <= 2, y4 + ' -> ' + y5);
    check('Save changes: no loading screen in between', (await sawLoading(page)) === false);
    check('Save changes: the changed rule shows', (await page.locator('.ap-rule', { hasText: 'rule 7, changed' }).count()) === 1);

    // 4. Edit, then Cancel: the place holds
    await page.locator('.ap-rule', { hasText: 'house rule 2 ' }).locator('button', { hasText: /^Edit$/ }).click();
    await page.waitForTimeout(1200);
    const y6 = await settle(page);
    await page.locator('.ap-rule-new button', { hasText: /^Cancel$/ }).click();
    await page.waitForTimeout(2000);
    const y7 = await settle(page);
    check('Cancel: the window keeps its place and the box is empty', Math.abs(y7 - y6) <= 2 && (await page.inputValue('#apRuleTa')) === '', y6 + ' -> ' + y7);

    // 5. a rule added with the window away from the list (scrolled to the bottom): it is brought into view
    await page.fill('#apRuleTa', 'Name the client company in the first line.');
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
    await settle(page);
    check('the new rule is off screen before it is added', (await onScreen(page, '#apRuleTa')) !== 'yes');
    await page.evaluate(() => apRuleSave());
    await page.waitForTimeout(2500);
    await settle(page);
    check('added away from the list: saved once and brought into view', saves(store, /client company in the first line/) === 1 && (await onScreen(page, '.ap-rule', /client company in the first line/)) === 'yes', await onScreen(page, '.ap-rule', /client company in the first line/));

    // 6. opening AI settings from another page still starts at the top, the loading screen first
    await page.evaluate(() => apGo('templates'));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, 500));
    await settle(page);
    await watch(page);
    await page.evaluate(() => apGo('learning'));
    await page.waitForTimeout(2500);
    const y8 = await settle(page);
    check('from another page: AI settings opens at the top', y8 === 0, String(y8));
    check('from another page: the loading screen shows first, as before', (await sawLoading(page)) === true);
    check('from another page: the header is Settings | AI settings', (await head(page)) === 'Settings | AI settings', await head(page));
    // and AI settings asked for again while on it (the sidebar or a link) is a page change too
    await page.evaluate(() => window.scrollTo(0, 700));
    await settle(page);
    await page.evaluate(() => apGo('learning'));
    await page.waitForTimeout(2500);
    check('AI settings asked for again while on it: back at the top', (await settle(page)) === 0);
    await ctx.close();
  }

  // 7. at phone width: Make it a rule, Add rule
  {
    const { ctx, page, store } = await open(390, 844);
    await page.evaluate(() => document.getElementById('apFbList').scrollIntoView({ block: 'start' }));
    await settle(page);
    await page.locator('#apFbList .ap-fb', { hasText: 'two weeks' }).locator('button', { hasText: 'Make it a rule' }).click();
    const y0 = await settle(page);
    await watch(page);
    await page.click('#apRuleGo');
    await page.waitForTimeout(2500);
    const y1 = await settle(page);
    check('phone: the rule is saved once', saves(store, /two weeks/) === 1, String(saves(store, /two weeks/)));
    check('phone: no jump to the top, no loading screen', y1 > 150 && (await sawLoading(page)) === false, y0 + ' -> ' + y1);
    check('phone: the rule just added is on screen', (await onScreen(page, '.ap-rule', /two weeks/)) === 'yes', await onScreen(page, '.ap-rule', /two weeks/));
    await ctx.close();
  }

  // 8. while it draws again, the page on screen takes no clicks and the rule box no typing (as under the loading
  //    screen it replaced); both come back once the new page is there
  {
    const { ctx, page, store } = await open();
    // the reads the redraw makes are held back for a moment, so the in-between state can be looked at
    await page.evaluate(() => { const _s = apSb; window.apSb = async function (u) { if (window.__v134Slow && /^agent_feedback\?select=id,agent/.test(String(u))) await new Promise((r) => setTimeout(r, 1500)); return _s.apply(this, arguments); }; });
    await page.evaluate(() => document.getElementById('apFbList').scrollIntoView({ block: 'start' }));
    await settle(page);
    await page.locator('#apFbList .ap-fb', { hasText: 'cost of waiting' }).locator('button', { hasText: 'Make it a rule' }).click();
    const y0 = await settle(page);
    await page.evaluate(() => { window.__v134Slow = true; });
    await page.click('#apRuleGo');
    await page.waitForTimeout(600);
    const mid = await page.evaluate(() => { const ta = document.getElementById('apRuleTa'); return { pe: getComputedStyle(document.getElementById('page-learning')).pointerEvents, ro: ta ? ta.readOnly : 'no box', loading: !!document.querySelector('#page-learning .loading'), y: Math.round(window.scrollY) }; });
    check('while it draws again: no clicks, no typing, no loading screen, the same place', mid.pe === 'none' && mid.ro === true && !mid.loading && Math.abs(mid.y - y0) <= 2, JSON.stringify(mid) + ' from ' + y0);
    await page.evaluate(() => { window.__v134Slow = false; });
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => { const ta = document.getElementById('apRuleTa'); return { pe: getComputedStyle(document.getElementById('page-learning')).pointerEvents, ro: ta ? ta.readOnly : 'no box', y: Math.round(window.scrollY) }; });
    check('once it is drawn: clicks and typing are back, the same place', after.pe !== 'none' && after.ro === false && Math.abs(after.y - y0) <= 2, JSON.stringify(after) + ' from ' + y0);
    check('and the rule is saved once and on screen', saves(store, /cost of waiting/) === 1 && (await onScreen(page, '.ap-rule', /cost of waiting/)) === 'yes', await onScreen(page, '.ap-rule', /cost of waiting/));
    await page.fill('#apRuleTa', 'Typed after the redraw: it takes typing again.');
    check('the box takes typing again', (await page.inputValue('#apRuleTa')) === 'Typed after the redraw: it takes typing again.');
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
