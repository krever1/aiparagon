// v135 tests for new-aiparagon-dashboard.html (#1): Templates keeps its place when it draws itself again, as AI
// settings has since v134. Until v135, Save in the template editor, Duplicate, Delete and the redraw after the
// dashboard's own data load put the loading screen up first, so the page emptied and the window jumped to the top,
// and the past documents card (v132) came back a moment after the rest, once its own read was done. Now a redraw in
// place reads first with the page on screen (taking no clicks meanwhile), then draws it all in one go and keeps the
// scroll; a template just made or copied is brought into view. Opening Templates from another page still starts at
// the top with the loading screen. The product header (v129) and the past documents card's words (v132) hold.
// The past documents read is held back for a moment in most checks, so a page drawn in two steps would show.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js, plus
// made-up templates and past documents here) and n8n webhooks answer from stubs, so nothing real is touched.
// Usage: node tests/dashboard-v135.test.js
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

const SUB = 'Your past documents for Catalyst, and the structures Content Transformation drafts follow.';
// enough templates that the page scrolls well past one screen, and three past documents above them
function tables() {
  const t = FX.tables();
  const iso = (s) => new Date(s).toISOString();
  for (let i = 1; i <= 10; i++) {
    t.doc_templates.push({ id: '00000000-0000-4000-8000-0000000d13' + String(i).padStart(2, '0'), name: 'Made-up template ' + i, format: i % 3 === 0 ? 'ad' : 'thought_leadership',
      description: 'Made-up template ' + i + ' for the scroll checks', sections: [{ title: 'Hook', guidance: 'One line' }, { title: 'Body', guidance: 'Two short paragraphs' }, { title: 'Close', guidance: 'One question' }],
      rules: '', example_text: '', active: true, uses: 0, created_by: 'QA Tester', created_at: iso('2026-09-1' + (i % 10) + 'T0' + (i % 10) + ':00:00Z'), updated_at: iso('2026-09-10T00:00:00Z') });
  }
  const brand = { colors: { primary: '#0E5A63', accent: '#D9902F', text: '#1E2A33' }, fonts: { heading: 'Montserrat', body: 'Source Serif 4' }, found: ['colors', 'fonts'] };
  t.catalyst_sources = [
    { id: '00000000-0000-4000-8000-0000000e1301', kind: 'proposal_template', file_name: 'Made-up proposal template.docx', file_type: 'docx', file_path: 'sources/1-a.docx', active: true,
      created_at: '2026-10-27T10:00:00Z', sections: ['Summary', 'Where you are', 'Our plan', 'Scope', 'Timeline', 'Next steps'].map((x) => ({ title: x })), brand, file_text: '# Proposal' },
    { id: '00000000-0000-4000-8000-0000000e1302', kind: 'discovery_template', file_name: 'Made-up discovery questions.docx', file_type: 'docx', file_path: 'sources/1-b.docx', active: true,
      created_at: '2026-10-27T10:00:01Z', sections: [{ title: 'Open with' }, { title: 'Close with' }], brand, file_text: '# Questions' },
    { id: '00000000-0000-4000-8000-0000000e1303', kind: 'past_assessment', file_name: 'Made-up past assessment.docx', file_type: 'docx', file_path: 'sources/1-c.docx', active: true,
      created_at: '2026-10-27T10:00:02Z', sections: [{ title: 'Summary' }, { title: 'What we found' }], brand, file_text: '# Assessment' }];
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
    await page.goto(BASE + '/dashboard/templates', { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(2500);
    // the past documents read can be held back (window.__v135Slow), so a page drawn in two steps shows
    await page.evaluate(() => { const _s = apSb; window.apSb = async function (u) { if (window.__v135Slow && /^catalyst_sources\?/.test(String(u))) await new Promise((r) => setTimeout(r, 900)); return _s.apply(this, arguments); }; });
    return { ctx, page, store };
  }
  const sy = (page) => page.evaluate(() => Math.round(window.scrollY));
  const settle = async (page) => { let a = -1, b = await sy(page); for (let i = 0; i < 20 && a !== b; i++) { a = b; await page.waitForTimeout(150); b = await sy(page); } return b; };
  // while an action runs: every change to the page is checked for the loading screen, and every frame for the card
  const watch = (page) => page.evaluate(() => {
    const el = document.getElementById('rd-templates');
    const W = window.__v135W = { loading: false, frames: 0, noCard: 0, on: true };
    if (window.__v135Mo) window.__v135Mo.disconnect();
    window.__v135Mo = new MutationObserver(() => { if (el.querySelector('.loading')) W.loading = true; });
    window.__v135Mo.observe(el, { childList: true, subtree: true });
    const tick = () => { if (!W.on) return; W.frames++; if (!document.getElementById('v132Src')) W.noCard++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const seen = (page) => page.evaluate(() => { const W = window.__v135W; W.on = false; if (window.__v135Mo) window.__v135Mo.disconnect(); return { loading: W.loading, frames: W.frames, noCard: W.noCard }; });
  const slow = (page, on) => page.evaluate((v) => { window.__v135Slow = v; }, on);
  const onScreen = (page, re) => page.evaluate((src) => {
    const el = [...document.querySelectorAll('.ap-tpl-card')].find((e) => new RegExp(src).test(e.innerText)); if (!el) return 'missing';
    const b = el.getBoundingClientRect(); return b.top >= 60 && b.bottom <= window.innerHeight ? 'yes' : 'no (' + Math.round(b.top) + ' to ' + Math.round(b.bottom) + ' of ' + window.innerHeight + ')';
  }, re.source);
  const toCard = async (page, name) => { await page.evaluate((n) => { const c = [...document.querySelectorAll('.ap-tpl-card')].find((x) => x.querySelector('h3').textContent === n); c.scrollIntoView({ block: 'center' }); }, name); return settle(page); };
  const card = (page, name) => page.locator('.ap-tpl-card', { has: page.locator('h3', { hasText: new RegExp('^' + name.replace(/[()]/g, '\\$&') + '$') }) });
  const looks = (page) => page.evaluate(() => {
    const pg = document.querySelector('.page.on'), h = pg && pg.querySelector('h1'), e = h && h.parentNode.querySelector('.rd-eyebrow,.eyebrow'), sub = document.querySelector('#rd-templates .rd-head p');
    return { head: (e ? e.textContent.trim() : '-') + ' | ' + (h ? h.textContent.trim() : '-'), sub: sub ? sub.textContent : '', rows: document.querySelectorAll('#v132Src .v132-row').length, pe: getComputedStyle(document.getElementById('rd-templates')).pointerEvents };
  });
  const writes = (store, method, re) => store.writes.filter((w) => w.table === 'doc_templates' && w.method === method && (!re || re.test(JSON.stringify(w.body || '') + JSON.stringify(w.filters || '')))).length;
  const nice = (w) => !w.loading && w.noCard === 0 && w.frames > 5;

  {
    const { ctx, page, store } = await open();
    const l0 = await looks(page);
    check('Templates opens with its product header, the past documents card and its words', l0.head !== '- | -' && !/^system/i.test(l0.head) && /Templates$/.test(l0.head) && l0.rows === 3 && l0.sub === SUB, JSON.stringify(l0));

    // 1. Edit a template lower down, then Save changes: the page stays where it is
    const y0 = await toCard(page, 'Made-up template 7');
    await card(page, 'Made-up template 7').locator('button', { hasText: /^Edit$/ }).click();
    await page.waitForSelector('#apTeDesc', { timeout: 5000 });
    await page.fill('#apTeDesc', 'Changed for the scroll checks');
    await slow(page, true); await watch(page);
    await page.click('#apTeGo');
    await page.waitForTimeout(3000);
    const w1 = await seen(page); await slow(page, false);
    const y1 = await settle(page);
    check('Save changes: the change is sent once', writes(store, 'PATCH', /Changed for the scroll checks/) === 1, String(writes(store, 'PATCH', /Changed for the scroll checks/)));
    check('Save changes: the window keeps its place (no jump to the top)', y0 > 300 && Math.abs(y1 - y0) <= 2, y0 + ' -> ' + y1);
    check('Save changes: no loading screen, and the past documents card never leaves', nice(w1), JSON.stringify(w1));
    check('Save changes: the card has the change (its description is in the card, hidden by the page\'s styles)', /Changed for the scroll checks/.test(await card(page, 'Made-up template 7').evaluate((e) => e.textContent)));
    const l1 = await looks(page);
    check('Save changes: header, card and words as before, and clicks back', l1.head === l0.head && l1.rows === 3 && l1.sub === SUB && l1.pe !== 'none', JSON.stringify(l1));

    // 2. Duplicate: the copy is made once and brought into view
    await toCard(page, 'Made-up template 5');
    await slow(page, true); await watch(page);
    await card(page, 'Made-up template 5').locator('button', { hasText: /^Duplicate$/ }).click();
    await page.waitForTimeout(400);
    const mid = await looks(page);
    check('while it reads: the page takes no clicks and stays as it was', mid.pe === 'none' && mid.rows === 3, JSON.stringify(mid));
    await page.waitForTimeout(2600);
    const w2 = await seen(page); await slow(page, false);
    await settle(page);
    check('Duplicate: the copy is saved once', writes(store, 'POST', /Made-up template 5 \(copy\)/) === 1, String(writes(store, 'POST', /Made-up template 5 \(copy\)/)));
    check('Duplicate: the copy is on screen', (await onScreen(page, /Made-up template 5 \(copy\)/)) === 'yes', await onScreen(page, /Made-up template 5 \(copy\)/));
    check('Duplicate: no loading screen, the card never leaves, clicks back', nice(w2) && (await looks(page)).pe !== 'none', JSON.stringify(w2));

    // 3. Delete a template: it goes, the page stays
    const y3 = await toCard(page, 'Made-up template 4');
    await watch(page);
    await card(page, 'Made-up template 4').locator('button', { hasText: /^Delete$/ }).click();
    await page.waitForTimeout(2500);
    const w3 = await seen(page);
    const y4 = await settle(page);
    check('Delete: the template is deleted', writes(store, 'DELETE') === 1 && (await card(page, 'Made-up template 4').count()) === 0, String(writes(store, 'DELETE')));
    check('Delete: the window keeps its place', y3 > 150 && Math.abs(y4 - y3) <= 2, y3 + ' -> ' + y4);
    check('Delete: no loading screen, the card never leaves', nice(w3), JSON.stringify(w3));

    // 4. New template from the top: it is made and brought into view
    await page.evaluate(() => window.scrollTo(0, 0)); await settle(page);
    await page.locator('.ap-fhead-acts button', { hasText: 'New template' }).click();
    await page.waitForSelector('#apTeName', { timeout: 5000 });
    await page.fill('#apTeName', 'Made-up template made here');
    await slow(page, true); await watch(page);
    await page.click('#apTeGo');
    await page.waitForTimeout(3000);
    const w4 = await seen(page); await slow(page, false);
    await settle(page);
    check('New template: saved once and on screen', writes(store, 'POST', /made here/) === 1 && (await onScreen(page, /Made-up template made here/)) === 'yes', await onScreen(page, /Made-up template made here/));
    check('New template: no loading screen, the card never leaves', nice(w4), JSON.stringify(w4));

    // 5. a tile filter, and the redraw after the dashboard's data load, keep the place too
    await page.evaluate(() => window.scrollTo(0, 0)); await settle(page);
    await watch(page);
    await page.locator('.rd-strip button', { hasText: 'Paid ads' }).click();
    await page.waitForTimeout(800);
    const nAds = await page.locator('.ap-tpl-card').count();
    await page.locator('.rd-strip button', { hasText: 'Paid ads' }).click();
    await page.waitForTimeout(800);
    const nAll = await page.locator('.ap-tpl-card').count();
    const w5 = await seen(page);
    check('a tile filter shows its kind, again shows all, with no loading screen', nAds >= 3 && nAll > nAds && !w5.loading && w5.noCard === 0, nAds + ' / ' + nAll + ' ' + JSON.stringify(w5));
    const y5 = await toCard(page, 'Made-up template 9');
    await slow(page, true); await watch(page);
    await page.evaluate(() => rdTemplates());
    await page.waitForTimeout(2500);
    const w6 = await seen(page); await slow(page, false);
    const y6 = await settle(page);
    check('the redraw after the data load: same place, no loading screen, the card never leaves', y5 > 300 && Math.abs(y6 - y5) <= 2 && nice(w6), y5 + ' -> ' + y6 + ' ' + JSON.stringify(w6));

    // 6. opening Templates from another page still starts at the top, the loading screen first
    await page.evaluate(() => apGo('learning'));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, 500)); await settle(page);
    await watch(page);
    await page.evaluate(() => apGo('templates'));
    await page.waitForTimeout(2500);
    const w7 = await seen(page);
    const y7 = await settle(page);
    const l7 = await looks(page);
    check('from another page: Templates opens at the top', y7 === 0, String(y7));
    check('from another page: the loading screen shows first, as before', w7.loading === true, JSON.stringify(w7));
    check('from another page: header, card and words as before', l7.head === l0.head && l7.rows === 3 && l7.sub === SUB, JSON.stringify(l7));
    await page.evaluate(() => window.scrollTo(0, 700)); await settle(page);
    await page.evaluate(() => apGo('templates'));
    await page.waitForTimeout(2500);
    check('Templates asked for again while on it: back at the top', (await settle(page)) === 0);
    await ctx.close();
  }

  // 7. at phone width: Edit, Save changes
  {
    const { ctx, page, store } = await open(390, 844);
    const y0 = await toCard(page, 'Made-up template 6');
    await card(page, 'Made-up template 6').locator('button', { hasText: /^Edit$/ }).click();
    await page.waitForSelector('#apTeDesc', { timeout: 5000 });
    await page.fill('#apTeDesc', 'Changed on a phone');
    await slow(page, true); await watch(page);
    await page.click('#apTeGo');
    await page.waitForTimeout(3000);
    const w = await seen(page); await slow(page, false);
    const y1 = await settle(page);
    check('phone: the change is sent once', writes(store, 'PATCH', /Changed on a phone/) === 1);
    check('phone: no jump to the top, no loading screen, the card never leaves', y0 > 300 && Math.abs(y1 - y0) <= 2 && nice(w), y0 + ' -> ' + y1 + ' ' + JSON.stringify(w));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
