// v129 tests for new-aiparagon-dashboard.html (#1): AI settings and Templates keep their product header when they draw
// themselves again in place. Until v129 the old header came back after Add rule, Edit, Cancel or Delete on AI settings
// ("System · Dashboard AI settings") and after a save, a copy, a delete or a tile filter on Templates ("System ·
// Templates"), and stayed until the next page change. Every header painted while each action runs is recorded (one
// sample per animation frame), so a flash of the old one counts too.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v129.test.js
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

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(url, width) {
    const store = makeStore(FX.tables());
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    await page.setViewportSize({ width: width || 1280, height: 860 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + url, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(2500);
    return { ctx, page, store };
  }
  // the page's header as painted: eyebrow | title (a dash while the page shows its loading line)
  const head = (page) => page.evaluate(() => {
    const pg = document.querySelector('.page.on'), h = pg && pg.querySelector('h1'), e = h && h.parentNode.querySelector('.rd-eyebrow,.eyebrow');
    return (e ? e.textContent.trim() : '-') + ' | ' + (h ? h.textContent.trim() : '-');
  });
  // every header painted from now on, one sample per animation frame
  const watch = (page) => page.evaluate(() => {
    window.__heads = []; cancelAnimationFrame(window.__headRaf || 0);
    (function tick() {
      const pg = document.querySelector('.page.on'), h = pg && pg.querySelector('h1'), e = h && h.parentNode.querySelector('.rd-eyebrow,.eyebrow');
      const s = (e ? e.textContent.trim() : '-') + ' | ' + (h ? h.textContent.trim() : '-');
      if (window.__heads[window.__heads.length - 1] !== s) window.__heads.push(s);
      window.__headRaf = requestAnimationFrame(tick);
    })();
  });
  const painted = async (page, ms) => { await page.waitForTimeout(ms || 2500); return page.evaluate(() => window.__heads.slice()); };
  // only the product header (or the loading line) was painted
  const onlyRight = (seen, want) => seen.length > 0 && seen.every((s) => s === want || s === '- | -') && seen[seen.length - 1] === want;

  // 1. AI settings: Add rule, Edit, Cancel, Delete
  {
    const AIS = 'Settings | AI settings';
    const { ctx, page, store } = await open('/dashboard/ai-settings');
    check('AI settings opens with its product header', (await head(page)) === AIS, await head(page));
    check('and the tab names the page', (await page.title()) === 'AI settings · AI Paragon', await page.title());

    await watch(page);
    await page.fill('#apRuleTa', 'Open with what the delays cost them, then the plan.');
    await page.click('#apRuleGo');
    let seen = await painted(page);
    check('Add rule: the page draws again with the same header, never the old one', onlyRight(seen, AIS), JSON.stringify(seen));
    const added = store.writes.filter((w) => w.table === 'ai_rules' && w.method === 'POST' && /delays cost them/.test(JSON.stringify(w.body)));
    check('the rule is saved once', added.length === 1, String(added.length));
    check('and shows in House rules', await page.evaluate(() => [...document.querySelectorAll('.ap-rule')].some((r) => /delays cost them/.test(r.innerText))));
    check('the tab still names the page', (await page.title()) === 'AI settings · AI Paragon', await page.title());

    await watch(page);
    await page.locator('.ap-rule', { hasText: 'delays cost them' }).first().locator('button', { hasText: /^Edit$/ }).click();
    seen = await painted(page);
    check('Edit: same header', onlyRight(seen, AIS), JSON.stringify(seen));
    check('Edit opens the rule in the box', /delays cost them/.test(await page.inputValue('#apRuleTa')) && /Save changes/.test(await page.textContent('#apRuleGo')));

    await watch(page);
    await page.click('button[onclick="apRuleCancel()"]');
    seen = await painted(page);
    check('Cancel: same header', onlyRight(seen, AIS), JSON.stringify(seen));
    check('Cancel leaves the box empty for a new rule', (await page.inputValue('#apRuleTa')) === '' && /Add rule/.test(await page.textContent('#apRuleGo')));

    await watch(page);
    await page.locator('.ap-rule', { hasText: 'delays cost them' }).first().locator('button', { hasText: /^Delete$/ }).click();
    seen = await painted(page);
    check('Delete: same header', onlyRight(seen, AIS), JSON.stringify(seen));
    check('the rule is gone', !(await page.evaluate(() => [...document.querySelectorAll('.ap-rule')].some((r) => /delays cost them/.test(r.innerText)))));

    // a page change still sets the header, as before
    await page.goto(BASE + '/dashboard/today', { waitUntil: 'load' }); await H.settled(page, 'app'); await page.waitForTimeout(1500);
    await page.goto(BASE + '/dashboard/ai-settings', { waitUntil: 'load' }); await H.settled(page, 'app'); await page.waitForTimeout(2500);
    check('opening AI settings again: the product header', (await head(page)) === AIS, await head(page));
    await ctx.close();
  }

  // 2. Templates: a tile filter, a copy, a save, a delete
  {
    const TPL = 'Atlas | Templates';
    const { ctx, page, store } = await open('/dashboard/templates');
    check('Templates opens with its product header', (await head(page)) === TPL, await head(page));

    await watch(page);
    const tile = page.locator('#page-templates button[aria-pressed]').first();
    const tiles = await page.locator('#page-templates button[aria-pressed]').count();
    check('Templates has its filter tiles', tiles >= 2, String(tiles));
    await tile.click();
    let seen = await painted(page, 1500);
    check('a tile filter: same header', onlyRight(seen, TPL), JSON.stringify(seen));
    check('the tile is picked', (await tile.getAttribute('aria-pressed')) === 'true');
    await tile.click(); await page.waitForTimeout(800);

    await watch(page);
    await page.locator('#page-templates button[onclick^="apTplDup"]').first().click();
    seen = await painted(page);
    check('a copy: same header', onlyRight(seen, TPL), JSON.stringify(seen));
    check('the copy is saved', store.writes.some((w) => w.table === 'doc_templates' && w.method === 'POST' && /\(copy\)/.test(JSON.stringify(w.body))));

    await page.click('#page-templates button[onclick="apTplEdit()"]');
    await page.waitForSelector('#apTeName', { state: 'visible' });
    await page.fill('#apTeName', 'Client story, short');
    // two sections (what the editor's own rows would hold)
    await page.evaluate(() => { AP_TED.sections = [{ title: 'Before', guidance: '' }, { title: 'After', guidance: '' }]; });
    await watch(page);
    await page.click('#apTeGo');
    seen = await painted(page);
    check('a save: same header', onlyRight(seen, TPL), JSON.stringify(seen));
    check('the new template is saved', store.writes.some((w) => w.table === 'doc_templates' && w.method === 'POST' && /Client story, short/.test(JSON.stringify(w.body))), JSON.stringify(store.writes.filter((w) => w.table === 'doc_templates').map((w) => w.method)));

    await watch(page);
    await page.locator('#page-templates button[onclick^="apTplDel"]').first().click();
    seen = await painted(page);
    check('a delete: same header', onlyRight(seen, TPL), JSON.stringify(seen));
    check('the template is deleted', store.writes.some((w) => w.table === 'doc_templates' && w.method === 'DELETE'));
    check('the tab names the page', (await page.title()) === 'Templates · AI Paragon', await page.title());
    await ctx.close();
  }

  // 3. at phone width too
  {
    const { ctx, page } = await open('/dashboard/ai-settings', 390);
    await watch(page);
    await page.fill('#apRuleTa', 'Keep the first paragraph to two sentences.');
    await page.click('#apRuleGo');
    const seen = await painted(page);
    check('phone: Add rule keeps the product header', onlyRight(seen, 'Settings | AI settings'), JSON.stringify(seen));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n' + failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
