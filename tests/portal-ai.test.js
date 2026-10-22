// AI mark tests for E-&-G-Home-Inc.html (#2, the care portal), v12.37. One icon, the Ask Spectrum sparkle, on
// everything the AI does: an Ask Spectrum chip under each page title with that page's question (a click asks it),
// the Ask button, panel and past chats, and the form reader (Upload a form, Find boxes). Things that are not AI
// carry no star. The chip's question goes through the same scrub as any question (no client IDs leave).
// Usage: node tests/portal-ai.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  async function demo(role, viewport) {
    const { ctx, page } = await H.newPage(env, { viewport: viewport || { width: 1440, height: 900 }, bucket: errors });
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    if (role) { await page.evaluate((r) => signIn(r), role); await page.waitForFunction((r) => state.role === r, role); }
    await page.waitForTimeout(300);
    return { ctx, page };
  }
  const chip = (page) => page.evaluate(() => {
    const b = document.querySelector('#view .ai-ask'); if (!b) return null;
    const r = b.getBoundingClientRect();
    return { q: b.dataset.q, text: b.innerText.replace(/\s+/g, ' ').trim(), icon: !!b.querySelector('svg.ai-ic'), shown: r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden', n: document.querySelectorAll('#view .ai-ask').length };
  });

  // ---------------- 1. a director: every page has its question ----------------
  {
    const { ctx, page } = await demo();
    const want = { home: 'Summarize today for me', tasks: 'What is overdue, and who is behind?', calendar: 'What is on the schedule this week?',
      clients: 'Which clients need attention this week?', team: 'Whose certifications are expiring soon?', trainhub: 'Who still owes training?',
      safety: 'Summarize this week’s safety logs', acct: 'Who has no accountability entry today?', templates: 'Which documents are missing?',
      forms: 'Which form do I use after an incident?', changelog: 'What changed today?' };
    for (const [v, q] of Object.entries(want)) {
      await page.evaluate((x) => go(x), v); await page.waitForTimeout(250);
      const c = await chip(page);
      check(`${v}: an Ask Spectrum chip with the sparkle asks "${q}"`, !!c && c.q === q && c.icon && c.shown && c.n === 1 && c.text === 'Ask Spectrum ' + q, JSON.stringify(c));
    }
    await page.evaluate(() => { go('clients'); openClient(visibleClients()[0].id); }); await page.waitForTimeout(300);
    let c = await chip(page);
    const uci = await page.evaluate(() => visibleClients()[0].uci);
    check('a client\'s page asks for that client\'s last week, by UCI', !!c && c.q === 'Summarize the last week for ' + uci, JSON.stringify(c));
    const out = await page.evaluate((q) => askOut(q), c.q);
    check('...and the question leaves the portal with a label, not the client ID', !/\d{7}/.test(out) && /Client \d/.test(out), out);
    await page.evaluate(() => go('home')); await page.waitForTimeout(250);
    await page.click('#view .ai-ask'); await page.waitForTimeout(900);
    const asked = await page.evaluate(() => ({ open: el('askPanel').classList.contains('on'), mine: [...document.querySelectorAll('#askLog .msg.me')].map((m) => m.textContent), bot: document.querySelectorAll('#askLog .msg.bot').length }));
    check('clicking the chip opens Ask Spectrum and asks the question', asked.open && asked.mine.includes('Summarize today for me') && asked.bot >= 2, JSON.stringify(asked));
    const panel = await page.evaluate(() => ({ pill: !!document.querySelector('#askPanel .ai-pill svg.ai-ic'), pillText: document.querySelector('#askPanel .ai-pill').textContent.trim(), tour: !!document.querySelector('#askSug svg.ai-ic, #askLog svg.ai-ic') || true, greet: document.querySelector('#askLog .msg.bot').textContent.slice(0, 40) }));
    check('the Ask panel says AI with the sparkle', panel.pill && panel.pillText === 'AI', JSON.stringify(panel));
    check('the greeting has no text star', !/✦/.test(panel.greet), panel.greet);
    await page.evaluate(() => { askNew(); askHistory(); }); await page.waitForTimeout(250);
    const hist = await page.evaluate(() => ({ icons: document.querySelectorAll('#mdBody .di.ai-di svg.ai-ic').length, rows: document.querySelectorAll('#mdBody .docrow').length }));
    check('past chats carry the sparkle', hist.rows > 0 && hist.icons === hist.rows, JSON.stringify(hist));
    await page.evaluate(() => { closeAll(); if (el('askPanel').classList.contains('on')) toggleAsk(); });
    const top = await page.evaluate(() => ({ tb: !!document.querySelector('.tb-ask svg'), fab: document.querySelectorAll('#askFab svg.ai-ic').length }));
    check('the Ask Spectrum button and the phone Ask button use the same sparkle', top.tb && top.fab === 1, JSON.stringify(top));
    // the form reader
    await page.evaluate(() => go('forms')); await page.waitForTimeout(250);
    const up = await page.evaluate(() => [...document.querySelectorAll('#view button')].filter((b) => /Upload a form/.test(b.textContent)).map((b) => ({ icon: !!b.querySelector('svg.ai-ic'), title: b.title })));
    check('Upload a form buttons carry the sparkle and say AI reads the form', up.length > 0 && up.every((b) => b.icon && /AI reads/.test(b.title)), JSON.stringify(up));
    await page.evaluate(() => ovUploadStart()); await page.waitForTimeout(250);
    const note = await page.evaluate(() => { const n = document.querySelector('#mdBody .ai-note'); return n ? { text: n.innerText.replace(/\s+/g, ' '), icon: !!n.querySelector('svg.ai-ic') } : null; });
    check('Upload a form says AI reads the form, on this computer, nothing sent', !!note && note.icon && /AI reads your form\./.test(note.text) && /nothing is sent anywhere/.test(note.text), JSON.stringify(note));
    await page.evaluate(() => closeAll());
    // no text star left on what is not AI
    const stars = [];
    for (const v of ['home', 'tasks', 'calendar', 'clients', 'team', 'safety', 'acct', 'templates', 'forms']) {
      await page.evaluate((x) => go(x), v); await page.waitForTimeout(200);
      if (await page.evaluate(() => /✦/.test(document.body.innerText))) stars.push(v);
    }
    check('no text star (✦) left anywhere on the pages', stars.length === 0, stars.join());
    check('a document made from a template is not marked as AI', await page.evaluate(() => ACT_ICON.generated !== '✦'));
    await ctx.close();
  }

  // ---------------- 2. staff and families get their own questions ----------------
  {
    const { ctx, page } = await demo('staff');
    await page.evaluate(() => go('home')); await page.waitForTimeout(250);
    let c = await chip(page);
    check('staff home: "What do I need to do this shift?"', !!c && c.q === 'What do I need to do this shift?', JSON.stringify(c));
    await page.evaluate(() => go('tasks')); await page.waitForTimeout(250);
    c = await chip(page);
    check('staff tasks: "What should I do first today?"', !!c && c.q === 'What should I do first today?', JSON.stringify(c));
    await page.evaluate(() => signIn('family')); await page.waitForTimeout(250);
    await page.evaluate(() => go('home')); await page.waitForTimeout(250);
    c = await chip(page);
    check('family home: "What is coming up next?"', !!c && c.q === 'What is coming up next?', JSON.stringify(c));
    await page.evaluate(() => go('calendar')); await page.waitForTimeout(250);
    c = await chip(page);
    check('family appointments: "When is the next appointment?"', !!c && c.q === 'When is the next appointment?', JSON.stringify(c));
    await ctx.close();
  }

  // ---------------- 3. a phone ----------------
  {
    const { ctx, page } = await demo(null, { width: 390, height: 844 });
    await page.evaluate(() => go('home')); await page.waitForTimeout(250);
    const c = await chip(page);
    const fit = await page.evaluate(() => { const b = document.querySelector('#view .ai-ask').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; });
    check('phone: the chip shows and fits the screen', !!c && c.shown && fit, JSON.stringify(c));
    const fab = await page.evaluate(() => { const f = el('askFab'); return { shown: getComputedStyle(f).display !== 'none', after: getComputedStyle(f, '::after').content, icons: f.querySelectorAll('svg').length }; });
    check('phone: the round Ask button shows the sparkle once', fab.shown && fab.icons === 1 && (fab.after === 'none' || fab.after === 'normal'), JSON.stringify(fab));
    await ctx.close();
  }

  const real = errors.filter((e) => !/ResizeObserver/.test(e));
  check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
