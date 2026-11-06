// v139 tests for new-aiparagon-dashboard.html (#1): Read inline on a lead's Onboarding plan and Client review brief tabs
// shows the document. Since v136 the button turned to Hide but the document stayed hidden: its box is an .e1brief, which
// the older page styles keep hidden until it has .open, and Read inline only took away [hidden]. The v136 and v138 suites
// read the text, which a hidden box still has, so they passed. These checks look at what is on screen.
// Found while recording the Meeting Intelligence video v9. Supabase answers from an in-memory store (lib/rest-stub.js)
// filled with synthetic data (lib/qa-fixtures.js), and the n8n webhooks answer from stubs.
// Usage: node tests/dashboard-v139.test.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
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
const L1 = FX.L1;   // Pat QA (all five documents)
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const ONB_MD = '# Onboarding plan · QA Firm LLC\n\n## What we agreed\n\n- Twelve weeks, starting in January.\n\n## Goals and how we will measure them\n\n- Less overtime at North.\n\n## The first 30 days\n\n- Week 1: the kickoff.';
const ONB_VIS = [{ type: 'timeline', title: 'The first weeks', after: 'What we agreed', unit: 'week', items: [{ label: 'Kickoff and map', start: 1, end: 2 }, { label: 'Design', start: 3, end: 6 }] },
  { type: 'bars', title: 'Overtime baseline', after: 'Goals and how we will measure them', unit: 'hours', items: [{ label: 'North', value: 400 }, { label: 'South', value: 250 }] }];
const REV_MD = '# Client review brief · QA Firm LLC\n\n## What we set out to do\n\n- Fewer approvals waiting on Pat.\n\n## What changed\n\n- Weekly review in place.';
const prep = (id, stage, title, md, vis, h) => ({ id, run_id: L1, agent: 'meeting_prep', output_type: 'meeting_prep', title, created_at: ago(h), content_md: md,
  data: Object.assign({ stage, stage_name: stage === 'review' ? 'Client review' : 'Onboarding', doc_name: stage === 'review' ? 'Client review brief' : 'Onboarding plan' }, vis ? { visuals: vis } : {}) });

// marked, the version the dashboard loads from cdnjs, kept in tests/.cache (as in the v138 suite)
const MARKED = '12.0.0';
function markedJs() {
  const dir = path.join(__dirname, '.cache', 'marked-' + MARKED), f = path.join(dir, 'package', 'marked.min.js');
  if (!fs.existsSync(f)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('npm', ['pack', 'marked@' + MARKED], { cwd: dir, stdio: 'ignore' });
    execFileSync('tar', ['xzf', 'marked-' + MARKED + '.tgz'], { cwd: dir });
  }
  return fs.readFileSync(f);
}

(async () => {
  const MK = markedJs();
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  async function open(width, withMarked) {
    const t = FX.tables();
    t.e1_leads.find((l) => l.email === L1).stage = 'review';
    t.agent_outputs.push(prep('00000000-0000-4000-8000-0000000e1391', 'onboarding', 'Onboarding plan · QA Firm LLC', ONB_MD, ONB_VIS, 30));
    t.agent_outputs.push(prep('00000000-0000-4000-8000-0000000e1392', 'review', 'Client review brief · QA Firm LLC', REV_MD, null, 2));
    const store = makeStore(t);
    const hook = (u, m, b) => (/fathom-proxy$/.test(u) ? { body: { ok: true, items: [] } } : { body: { ok: true, started: true } });
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: hook, bucket: errors, fixed: false });
    if (withMarked !== false) await ctx.route(/\/marked\/12\.0\.0\/marked\.min\.js$/, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: MK }));
    await page.setViewportSize({ width: width || 1440, height: 900 });
    await page.goto(BASE + '/dashboard/lead-pipeline', { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1200);
    await page.evaluate((e) => openE1Lead(e), L1);
    await page.waitForTimeout(2400);
    return { ctx, page };
  }
  const wait = (page, ms) => page.waitForTimeout(ms || 500);
  // what is on screen in a stage's tab: the box, its size and display, its charts, the button
  const seen = (page, s) => page.evaluate((s) => {
    const sec = document.querySelector('section[data-v136="' + s + '"]'), box = sec && sec.querySelector('.v136-prep');
    const btn = sec && [...sec.querySelectorAll('button')].find((b) => /Read inline|Hide/.test(b.textContent));
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return { display: getComputedStyle(box).display, h: Math.round(r.height), onScreen: !!box.offsetParent, hidden: box.hidden,
      text: box.innerText.replace(/\s+/g, ' ').trim().slice(0, 80), figs: [...box.querySelectorAll('.v138-fig')].map((f) => Math.round(f.getBoundingClientRect().height)),
      btn: btn ? btn.textContent.trim() : '', expanded: btn ? btn.getAttribute('aria-expanded') : '' };
  }, s);

  // 1. the onboarding plan: Read inline shows it, with its charts; Hide takes it away again
  {
    const { ctx, page } = await open();
    await page.click('#apChrome .rd-tab[data-tab="m_onboarding"]'); await wait(page);
    let o = await seen(page, 'onboarding');
    check('before Read inline the onboarding plan is not on screen', o && o.display === 'none' && o.h === 0 && o.btn === 'Read inline ▾', JSON.stringify(o));
    await page.click('section[data-v136="onboarding"] button:has-text("Read inline")'); await wait(page);
    o = await seen(page, 'onboarding');
    check('Read inline shows the onboarding plan on screen', o && o.display === 'block' && o.onScreen && o.h > 150 && /What we agreed/.test(o.text), JSON.stringify(o));
    check('with its two charts on screen', o && o.figs.length === 2 && o.figs.every((h) => h > 40), JSON.stringify(o && o.figs));
    check('and the button says Hide, expanded', o && o.btn === 'Hide ▴' && o.expanded === 'true', JSON.stringify(o));
    const shot = await page.evaluate(() => { const f = document.querySelector('section[data-v136="onboarding"] .v138-fig'); f.scrollIntoView({ block: 'center' });
      const r = f.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + 30); return !!(e && f.contains(e)); });
    check('nothing covers the plan\'s first chart', shot, String(shot));
    await page.click('section[data-v136="onboarding"] button:has-text("Hide")'); await wait(page);
    o = await seen(page, 'onboarding');
    check('Hide takes it off the screen again', o && o.display === 'none' && o.h === 0 && o.hidden && o.btn === 'Read inline ▾' && o.expanded === 'false', JSON.stringify(o));
    await page.click('section[data-v136="onboarding"] button:has-text("Read inline")'); await wait(page);
    o = await seen(page, 'onboarding');
    check('and Read inline shows it once more', o && o.display === 'block' && o.h > 150, JSON.stringify(o));

    // 2. the client review brief, the same way
    await page.click('#apChrome .rd-tab[data-tab="m_review"]'); await wait(page);
    let r = await seen(page, 'review');
    check('the client review brief starts closed', r && r.display === 'none' && r.btn === 'Read inline ▾', JSON.stringify(r));
    await page.click('section[data-v136="review"] button:has-text("Read inline")'); await wait(page);
    r = await seen(page, 'review');
    check('Read inline shows the client review brief on screen', r && r.display === 'block' && r.onScreen && r.h > 60 && /What we set out to do/.test(r.text), JSON.stringify(r));
    await page.click('section[data-v136="review"] button:has-text("Hide")'); await wait(page);
    r = await seen(page, 'review');
    check('and Hide closes it', r && r.display === 'none' && r.btn === 'Read inline ▾', JSON.stringify(r));
    await ctx.close();
  }

  // 3. on a phone, the plan opens too, its charts as tables (as v138 draws them under 600 px)
  {
    const { ctx, page } = await open(390);
    await page.click('#apChrome .rd-tab[data-tab="m_onboarding"]'); await wait(page);
    await page.click('section[data-v136="onboarding"] button:has-text("Read inline")'); await wait(page);
    const o = await seen(page, 'onboarding');
    const tbl = await page.evaluate(() => [...document.querySelectorAll('section[data-v136="onboarding"] .v138-tbl')].map((t) => Math.round(t.getBoundingClientRect().height)));
    check('on a phone, Read inline shows the plan, its charts as tables', o && o.display === 'block' && o.h > 150 && tbl.length === 2 && tbl.every((h) => h > 30), JSON.stringify([o, tbl]));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check('and the page does not scroll sideways', wide, String(wide));
    await ctx.close();
  }

  // 4. without marked (the CDN refused), the plan still opens, as plain text
  {
    const { ctx, page } = await open(1440, false);
    await page.route(/\/marked\/12\.0\.0\/marked\.min\.js$/, (route) => route.abort());
    await page.click('#apChrome .rd-tab[data-tab="m_onboarding"]'); await wait(page);
    await page.click('section[data-v136="onboarding"] button:has-text("Read inline")'); await wait(page);
    const o = await seen(page, 'onboarding');
    check('the plan opens on screen whether or not marked loaded', o && o.display === 'block' && o.h > 60 && /What we agreed/.test(o.text), JSON.stringify(o));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\nFailures:\n- ' + failures.join('\n- ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
