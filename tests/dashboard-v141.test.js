// v141 tests for new-aiparagon-dashboard.html (#1): the Intel Tracker's and the Ad Strategist's search fields draw one
// box. The older page styles' `.ap60 input[type=search]` (white, padded, rounded, with a shadow, 38px high on a phone)
// outranked `.nw-search-in input`, so the field drew a second white box inside its frame (seen in the Pipeline demo
// video v8). These checks look at what is drawn: the field's own background, shadow and size inside its frame.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js).
// Usage: node tests/dashboard-v141.test.js
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

  async function open(addr, width) {
    const store = makeStore(FX.tables());
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(BASE + addr, { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1500);
    return { ctx, page };
  }
  // the search field as drawn: its own paint, and where it sits in its frame
  const look = (page) => page.evaluate(() => {
    const i = [...document.querySelectorAll('#view-app .nw-search-in input')].find((x) => x.offsetParent);
    if (!i) return null;
    const cs = getComputedStyle(i), f = i.closest('.nw-search-in'), a = i.getBoundingClientRect(), b = f.getBoundingClientRect();
    return { bg: cs.backgroundColor, shadow: cs.boxShadow, radius: cs.borderRadius, padL: cs.paddingLeft, border: cs.borderTopWidth,
      h: Math.round(a.height), frameH: Math.round(b.height), inside: a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5 && a.right <= b.right + 0.5,
      ph: i.placeholder };
  });
  const clean = (s) => s && (s.bg === 'rgba(0, 0, 0, 0)' || s.bg === 'transparent') && s.shadow === 'none' && s.radius === '0px' && s.padL === '0px' && s.border === '0px' && s.inside && s.h < s.frameH;

  for (const width of [1440, 390]) {
    // 1. the Intel Tracker's Search posts
    {
      const { ctx, page } = await open('/dashboard/intel-tracker', width);
      const s = await look(page);
      check(width + 'px: the Intel Tracker has its Search posts field', s && s.ph === 'Search posts', JSON.stringify(s));
      check(width + 'px: Search posts draws no box of its own (no fill, shadow, corners or padding) and sits inside its frame', clean(s), JSON.stringify(s));
      // typing still filters, and the frame shows where the cursor is
      const inp = page.locator('#view-app .nw-search-in input').first();
      await inp.click(); await inp.type('zzzz-no-such-post', { delay: 5 }); await page.waitForTimeout(700);
      const after = await page.evaluate(() => ({ text: document.getElementById('view-app').innerText,
        ring: getComputedStyle(document.querySelector('#view-app .nw-search-in')).boxShadow, focused: !!(document.activeElement && document.activeElement.closest('.nw-search-in')) }));
      check(width + 'px: typing in it still filters the posts', /Nothing matches/.test(after.text), after.text.slice(0, 120));
      check(width + 'px: the frame shows the focus ring and keeps the cursor', after.ring !== 'none' && after.focused, JSON.stringify({ ring: after.ring, focused: after.focused }));
      await ctx.close();
    }
    // 2. the Ad Strategist's Search ads (on All ads)
    {
      const { ctx, page } = await open('/dashboard/ad-strategist', width);
      if (!(await look(page))) {
        const tab = page.locator('#view-app [role=tab]', { hasText: /^All ads/ }).first();
        if (await tab.count()) { await tab.click(); await page.waitForTimeout(800); }
      }
      const s = await look(page);
      check(width + 'px: the Ad Strategist has its Search ads field', s && s.ph === 'Search ads', JSON.stringify(s));
      check(width + 'px: Search ads draws no box of its own and sits inside its frame', clean(s), JSON.stringify(s));
      await ctx.close();
    }
  }

  // 3. the older pages' own search fields keep their look (the rule only reaches fields inside a .nw-search-in frame)
  {
    const { ctx, page } = await open('/dashboard/lead-pipeline', 1440);
    const old = await page.evaluate(() => [...document.querySelectorAll('.ap60 input[type=search]')].filter((x) => x.offsetParent && !x.closest('.nw-search-in'))
      .map((x) => ({ bg: getComputedStyle(x).backgroundColor, pad: getComputedStyle(x).paddingLeft })));
    check('an older page still has a search field of its own to compare', old.length > 0, JSON.stringify(old));
    check('and it keeps its white fill and padding', old.length > 0 && old.every((o) => o.bg !== 'rgba(0, 0, 0, 0)' && o.pad !== '0px'), JSON.stringify(old));
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
