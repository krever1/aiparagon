// Routing tests for voice-agent-client.html (#4 Command Center): /voice/<page> paths (Vercel), #/<page>
// elsewhere, Back/Forward, deep links, bad input and the old-address forward. Given an earlier copy of
// the file it also checks every page reads the same as that copy. See tests/README.md.
// Usage: node tests/voice-routes.test.js [baseline.html]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = process.argv[2] ? path.resolve(process.argv[2]) : null;   // an earlier copy of the file, for the page-by-page comparison
const FILE = 'voice-agent-client.html';
const KEYS = ['overview', 'conversations', 'messages', 'opportunities', 'appointments', 'quality', 'training', 'knowledge', 'library', 'analytics', 'portal', 'tiers', 'settings'];
const SLUG = Object.fromEntries(KEYS.map((k) => [k, k === 'appointments' ? 'calendar' : k]));

// Same rewrites as vercel.json, read from the file itself
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const REWRITES = cfg.rewrites.map((r) => ({
  re: new RegExp('^' + r.source.replace(/\/:path\*$/, '(?:/.*)?').replace(/\//g, '\\/') + '$'),
  dest: r.destination,
}));

// Same redirects as vercel.json (permanent false = 307, true = 308)
const REDIRECTS = (cfg.redirects || []).map((r) => ({ source: r.source, dest: r.destination, code: r.permanent ? 308 : 307 }));

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch (e) {}                 // a malformed address still routes, like on Vercel
  const red = REDIRECTS.find((r) => r.source === p);
  if (red) { res.writeHead(red.code, { Location: red.dest }); return res.end(); }
  let file;
  if (p === '/baseline.html' && BASELINE) file = BASELINE;
  else if (p === '/copy/' + FILE) file = path.join(ROOT, FILE);       // the same file on a host without the rewrite or the forward
  else {
    const hit = REWRITES.find((r) => r.re.test(p));
    file = path.join(ROOT, hit ? hit.dest : p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.html') || p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const pageErrors = { patched: [], original: [] };

  async function open(url, opts) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: (opts && opts.tz) || undefined });
    // Offline on purpose: no Supabase, jsDelivr or n8n, so every run sees the same signed-out demo
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(BASE) || u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    const page = await ctx.newPage();
    if (opts && opts.testHook) await page.addInitScript(() => { window.__VC_TEST__ = true; });
    if (opts && opts.fixed) await page.clock.setFixedTime(new Date('2026-10-15T15:00:00-04:00'));
    if (opts && opts.at) await page.clock.setFixedTime(new Date(opts.at));
    const bucket = opts && opts.original ? pageErrors.original : pageErrors.patched;
    page.on('pageerror', (e) => bucket.push(url + ' :: ' + e.message));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    return { ctx, page };
  }
  async function state(page) {
    return page.evaluate((keys) => ({
      path: location.pathname,
      hash: location.hash,
      search: location.search,
      visible: keys.filter((k) => { const el = document.getElementById('s-' + k); return el && !el.classList.contains('hidden'); }),
      nav: [...document.querySelectorAll('.nav[aria-current="true"]')].map((e) => e.dataset.go),
      clientOpen: (document.getElementById('clientPanel') || {}).dataset ? document.getElementById('clientPanel').dataset.open === 'true' : false,
    }), KEYS);
  }
  const shows = (s, key) => s.visible.length === 1 && s.visible[0] === key && s.nav.length === 1 && s.nav[0] === key;
  const settle = (page) => page.waitForTimeout(150);

  // 1. /voice lands on Overview and settles on /voice/overview
  {
    const { ctx, page } = await open(BASE + '/voice');
    const s = await state(page);
    check('/voice opens Overview at /voice/overview', shows(s, 'overview') && s.path === '/voice/overview', JSON.stringify(s));
    await ctx.close();
  }
  // 2. every sidebar button writes its address
  {
    const { ctx, page } = await open(BASE + '/voice/overview');
    for (const k of KEYS) {
      await page.click('.nav[data-go="' + k + '"]');
      await settle(page);
      const s = await state(page);
      check('sidebar ' + k + ' -> /voice/' + SLUG[k], shows(s, k) && s.path === '/voice/' + SLUG[k], JSON.stringify(s));
    }
    await ctx.close();
  }
  // 3. every address opens its page directly (deep link)
  for (const k of KEYS) {
    const { ctx, page } = await open(BASE + '/voice/' + SLUG[k]);
    const s = await state(page);
    check('deep link /voice/' + SLUG[k] + ' opens ' + k, shows(s, k) && s.path === '/voice/' + SLUG[k], JSON.stringify(s));
    await ctx.close();
  }
  // 4. odd input: old word, unknown page, case + trailing slash, extra segments, encoded junk, query kept
  const odd = [
    ['/voice/appointments', 'appointments', '/voice/calendar'],
    ['/voice/nope', 'overview', '/voice/overview'],
    ['/voice/', 'overview', '/voice/overview'],
    ['/voice/Conversations/', 'conversations', '/voice/conversations'],
    ['/voice/library/abc/def', 'library', '/voice/library'],
    ['/voice/%E0%A4%A', 'overview', '/voice/overview'],
    ['/voice/%3Cscript%3E', 'overview', '/voice/overview'],
  ];
  for (const [url, key, want] of odd) {
    const { ctx, page } = await open(BASE + url);
    const s = await state(page);
    check('odd address ' + url + ' -> ' + key + ' at ' + want, shows(s, key) && s.path === want, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/voice/conversations?demo=1');
    await page.click('.nav[data-go="appointments"]');
    await settle(page);
    const s = await state(page);
    check('query string survives a page change', shows(s, 'appointments') && s.path === '/voice/calendar' && s.search === '?demo=1', JSON.stringify(s));
    await ctx.close();
  }
  // 5. Back / Forward / reload
  {
    const { ctx, page } = await open(BASE + '/voice/overview');
    await page.click('.nav[data-go="conversations"]'); await settle(page);
    await page.click('.nav[data-go="appointments"]'); await settle(page);
    await page.goBack(); await settle(page);
    let s = await state(page);
    check('Back -> conversations', shows(s, 'conversations') && s.path === '/voice/conversations', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('Back again -> overview', shows(s, 'overview') && s.path === '/voice/overview', JSON.stringify(s));
    await page.goForward(); await settle(page);
    s = await state(page);
    check('Forward -> conversations', shows(s, 'conversations') && s.path === '/voice/conversations', JSON.stringify(s));
    await page.click('.nav[data-go="library"]'); await settle(page);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250);
    s = await state(page);
    check('reload keeps the page (library)', shows(s, 'library') && s.path === '/voice/library', JSON.stringify(s));
    const len0 = await page.evaluate(() => history.length);
    await page.click('.nav[data-go="library"]'); await settle(page);
    const len1 = await page.evaluate(() => history.length);
    check('clicking the page you are on adds no history entry', len0 === len1, len0 + ' vs ' + len1);
    await ctx.close();
  }
  // 6. links inside a page (data-go buttons that are not in the sidebar)
  {
    const { ctx, page } = await open(BASE + '/voice/overview');
    const inner = await page.$('#s-overview [data-go="conversations"]');
    if (inner) {
      await inner.click(); await settle(page);
      const s = await state(page);
      check('in-page link on Overview -> /voice/conversations', shows(s, 'conversations') && s.path === '/voice/conversations', JSON.stringify(s));
    } else check('in-page link on Overview exists', false, 'no [data-go] button inside #s-overview');
    await ctx.close();
  }
  // 7. Back with the customer drawer open closes it
  {
    const { ctx, page } = await open(BASE + '/voice/overview');
    await page.click('.nav[data-go="messages"]'); await settle(page);
    const btn = await page.$('#s-messages [data-client]');
    if (btn) {
      await btn.click(); await settle(page);
      const before = await state(page);
      await page.goBack(); await settle(page);
      const s = await state(page);
      check('drawer was open before Back', before.clientOpen === true, JSON.stringify(before));
      check('Back closes the drawer and shows Overview', !s.clientOpen && shows(s, 'overview') && s.path === '/voice/overview', JSON.stringify(s));
    } else check('a customer link exists on Messages', false, 'no [data-client] in #s-messages');
    await ctx.close();
  }
  // 8. adversarial: rapid clicks, then a burst of Back presses; the page must always match the address
  {
    const { ctx, page } = await open(BASE + '/voice/overview');
    for (const k of KEYS.concat(['training', 'overview', 'appointments'])) await page.click('.nav[data-go="' + k + '"]');
    await settle(page);
    let s = await state(page);
    check('rapid clicks end on the last page clicked', shows(s, 'appointments') && s.path === '/voice/calendar', JSON.stringify(s));
    await page.evaluate(() => { for (let i = 0; i < 5; i++) history.back(); });
    await page.waitForTimeout(600);
    s = await state(page);
    const want = Object.keys(SLUG).find((k) => '/voice/' + SLUG[k] === s.path);
    check('after 5 quick Backs the page matches the address', !!want && shows(s, want), JSON.stringify(s));
    await ctx.close();
  }
  // 9. the old address forwards to /voice/overview; a #/<page> carried through the forward opens that page
  for (const [suffix, key, wantPath, wantHash] of [
    ['', 'overview', '/voice/overview', ''],
    ['#/calendar', 'appointments', '/voice/calendar', ''],
    ['#/conversations', 'conversations', '/voice/conversations', ''],
    ['#/nope', 'overview', '/voice/overview', ''],
    ['#section-2', 'overview', '/voice/overview', '#section-2'],
  ]) {
    const { ctx, page } = await open(BASE + '/' + FILE + suffix);
    const s = await state(page);
    check('old address ' + (suffix || '(plain)') + ' forwards to ' + wantPath + wantHash, shows(s, key) && s.path === wantPath && s.hash === wantHash, JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/' + FILE);
    await page.click('.nav[data-go="conversations"]'); await settle(page);
    await page.goBack(); await settle(page);
    let s = await state(page);
    check('after the forward, Back returns to /voice/overview', shows(s, 'overview') && s.path === '/voice/overview', JSON.stringify(s));
    await page.goForward(); await settle(page);
    s = await state(page);
    check('after the forward, Forward returns to /voice/conversations', shows(s, 'conversations') && s.path === '/voice/conversations', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/voice/settings#/calendar');
    const s = await state(page);
    check('a #/<page> on /voice wins and is dropped from the address', shows(s, 'appointments') && s.path === '/voice/calendar' && s.hash === '', JSON.stringify(s));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/voice/settings');
    await page.evaluate(() => { location.hash = '#/calendar'; });
    await settle(page);
    const s = await state(page);
    check('typing #/<page> on an open /voice page changes nothing', shows(s, 'settings') && s.path === '/voice/settings', JSON.stringify(s));
    await ctx.close();
  }
  // 9b. the same file on a host without the rewrite keeps its address and uses #/<page>
  const COPY = '/copy/' + FILE;
  {
    const { ctx, page } = await open(BASE + COPY);
    let s = await state(page);
    check('other host: opens Overview with no hash added', shows(s, 'overview') && s.path === COPY && s.hash === '', JSON.stringify(s));
    await page.click('.nav[data-go="conversations"]'); await settle(page);
    s = await state(page);
    check('other host: sidebar writes #/conversations', shows(s, 'conversations') && s.path === COPY && s.hash === '#/conversations', JSON.stringify(s));
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250);
    s = await state(page);
    check('other host: reload keeps conversations', shows(s, 'conversations'), JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('other host: Back returns to Overview', shows(s, 'overview') && s.hash === '', JSON.stringify(s));
    await ctx.close();
  }
  for (const [hash, key, want] of [['#/calendar', 'appointments', '#/calendar'], ['#/nope', 'overview', '#/overview'], ['#section-2', 'overview', '#section-2']]) {
    const { ctx, page } = await open(BASE + COPY + hash);
    const s = await state(page);
    check('other host ' + hash + ' -> ' + key + ' (' + want + ')', shows(s, key) && s.path === COPY && s.hash === want, JSON.stringify(s));
    await ctx.close();
  }
  // 10. a local copy (file://) works with #/<page>
  {
    const { ctx, page } = await open('file://' + path.join(ROOT, FILE));
    await page.click('.nav[data-go="knowledge"]'); await settle(page);
    let s = await state(page);
    check('local file: sidebar writes #/knowledge', shows(s, 'knowledge') && s.hash === '#/knowledge', JSON.stringify(s));
    await page.goBack(); await settle(page);
    s = await state(page);
    check('local file: Back returns to Overview', shows(s, 'overview'), JSON.stringify(s));
    await ctx.close();
  }
  // 11. with a baseline: every page reads the same as that copy (same fixed clock, signed out, offline)
  if (!BASELINE) console.log('SKIP page-by-page comparison: no baseline file given');
  else for (const k of KEYS) {
    const texts = [];
    for (const [url, original] of [[BASE + '/baseline.html', true], [BASE + '/voice/overview', false]]) {
      const { ctx, page } = await open(url, { fixed: true, original });
      await page.click('.nav[data-go="' + k + '"]'); await settle(page);
      texts.push(await page.evaluate((key) => document.getElementById('s-' + key).innerText, k));
      await ctx.close();
    }
    check('regression: ' + k + ' reads the same as the baseline', texts[0] === texts[1], 'lengths ' + texts[0].length + ' vs ' + texts[1].length);
  }

  // 12. the calendar is in the business's time zone (Pacific), whatever time zone the viewer is in
  for (const tz of ['Asia/Dubai', 'America/New_York']) {
    const { ctx, page } = await open(BASE + '/voice/calendar', { tz });
    const t = await page.evaluate(() => ({ range: document.getElementById('calRange').textContent, sub: document.getElementById('calSub').textContent }));
    check('calendar viewed from ' + tz + ' says Pacific', / · Pacific time$/.test(t.range) && /Times are Pacific/.test(t.sub) && !/Eastern/.test(t.range + t.sub), JSON.stringify(t));
    await ctx.close();
  }
  {
    const { ctx, page } = await open(BASE + '/voice/calendar', { tz: 'America/Los_Angeles' });
    const t = await page.evaluate(() => document.getElementById('calRange').textContent + ' ' + document.getElementById('calSub').textContent);
    check('calendar viewed from Pacific adds no time zone note', !/Pacific|Eastern/.test(t), t);
    await ctx.close();
  }

  // 13. the tool server's reply formats (Oct 23): offered times are read out of each, refused bookings show as refused,
  // and Test a callback gives the agent the customer's last four digits
  {
    const { ctx, page } = await open(BASE + '/voice/overview', { testHook: true });
    const got = await page.evaluate(() => {
      const { parseOffered, askedFor, callbackFor, callPhone, customers } = window.__VC_TEST__;
      const ref = '2026-10-23T16:00:00Z';
      const n = (r) => parseOffered(r, ref).length;
      const cu = customers().find((c) => callPhone(c.phone)) || null;
      return {
        old: n('Open times: Thursday, October 29 at 8:00 AM; Thursday, November 5 at 8:00 AM; Thursday, October 29 at 10:30 AM. Offer two or three of these naturally, by day and time, and ask which works.'),
        day: n('Open times on Thursday, October 29: Thursday, October 29 at 8:00 AM; Thursday, October 29 at 10:30 AM. Offer two or three of these naturally, by day and time, and ask which works.'),
        exact: n('That exact time is open: Tuesday, October 27 at 10:30 AM. Tell them it is open and book it with book_appointment as soon as they say yes. Do not list other times.'),
        closest: n('2:00 PM on Thursday, October 29 is not one of our inspection times. The closest open times that day: Thursday, October 29 at 1:00 PM; Thursday, October 29 at 3:30 PM. Offer those. If neither works, ask what other day suits them and check again.'),
        nothing: n('Nothing is open on Sunday, November 1. We do not book inspections on Sundays. The closest open times: Friday, October 30 at 3:30 PM; Saturday, October 31 at 3:30 PM; Monday, November 2 at 8:00 AM. Offer two or three of these naturally, by day and time, and ask which works.'),
        at: n('Open at 3:30 PM: Saturday, October 24 at 3:30 PM; Monday, October 26 at 3:30 PM. Offer two or three of these naturally, by day and time, and ask which works.'),
        mismatch: n('October 30 is a Friday, not a Thursday. Ask which they meant: Thursday, October 29, or Friday, October 30. Do not offer times until they tell you.'),
        asked: askedFor({ requested: 'Thursday, October 29th at 2pm' }) + ' | ' + askedFor({ preference: 'mornings' }),
        last4: cu ? callbackFor(cu).overrides.variableValues.caller_id_last4 : null,
        phone: cu ? callPhone(cu.phone) : null,
        // a number from another country keeps every digit (Oct 27: a 12-digit number was cut to 10)
        intl4: cu ? callbackFor(Object.assign({}, cu, { phone: '+44 7700 900123' })).overrides.variableValues.caller_id_last4 : null,
        forms: [callPhone('+44 7700 900123'), callPhone('(555) 010-1234'), callPhone('1 555 010 1234'), callPhone('010-1234')].join('|'),
      };
    });
    check('reply formats: offered times read from every form', got.old === 3 && got.day === 2 && got.exact === 1 && got.closest === 2 && got.nothing === 3 && got.at === 2 && got.mismatch === 0, JSON.stringify(got));
    check('reply formats: "Asked for" shows the exact words, else the wish', got.asked === 'Thursday, October 29th at 2pm | mornings', got.asked);
    check('Test a callback passes the last four digits', !!got.phone && got.last4 === got.phone.slice(-4), JSON.stringify(got));
    check('Test a callback keeps every digit of a number from another country', got.intl4 === '0123' && got.forms === '447700900123|5550101234|5550101234|', JSON.stringify(got));
    await ctx.close();
  }

  // 14. find_caller (Oct 26): a plain test call says there's no caller ID, the tool is listed on the Knowledge page,
  // and each of its answers reads plainly in a call's timeline
  {
    const { ctx, page } = await open(BASE + '/voice/overview', { testHook: true });
    const got = await page.evaluate(() => {
      const { plainCall, stepCard } = window.__VC_TEST__;
      const c = { id: 'qa-call', transcript: [], actions: [] };
      const step = (result, args) => { const d = document.createElement('div'); d.innerHTML = stepCard(c, { tool: 'find_caller', t: 12, args: args || { name: 'Kaye Moreno', phone: '5550101234' }, result: result }, 0, [], false); return d.innerText.replace(/\s+/g, ' '); };
      return {
        vars: plainCall(),
        match: step('MATCH. This is their customer file, matched by the number and their name. Name on file: Kaye Moreno. [file 5550101234]'),
        check: step('CHECK. Ask them to spell their first name, letter by letter, then call find_caller again with the same number and name, and the letters in spelling. Do not suggest a spelling.', { name: 'Kate Moreno', phone: '5550101234' }),
        last: step('CHECK. Ask for their last name, then call find_caller again with the same number and their full name.', { name: 'Kaye', phone: '5550101234' }),
        nomatch: step('NO MATCH. Treat them as a new caller and take their details as usual.', { name: 'Brian Arrington', phone: '5550101234' }),
        nofile: step('NO FILE. Nothing is on file under that number, so this is a new caller.'),
        full: step('CHECK. Ask for their first and last name, then call find_caller again with the same number and the name. Do not suggest a name.', { phone: '5550101234' }),
        partial: step('That number is not complete. Ask for the whole number with the area code, read it back, then call find_caller again.', { name: 'Kaye', phone: '010-1234' }),
        sample: step('This is a demo call with a sample customer, and their file is already loaded. Do not look anything else up.'),
        tries: step('NO MATCH. Treat them as a new caller and take their details as usual. Do not call find_caller again on this call.'),
        broken: step('The file could not be checked just now. Treat them as a new caller and take their details as usual.'),
        // two people on one number: the second has their own customer, as the database files them
        split: (function () {
          const mk = (id, name, file, h) => ({ id: id, receivedAt: '2026-10-27T1' + h + ':00:00Z', phone: '5550109000', customer: name, email: '', address: 'not captured', intent: 'Roof leak', structured: file ? { _file: 'name' } : {} });
          const list = window.__VC_TEST__.deriveCustomers([mk('a', 'Kaye Moreno', false, 1), mk('b', 'Edward', true, 2), mk('c', 'Edward Smith', true, 3), mk('d', 'Kaye', false, 4)], [], []);
          return list.map((cu) => cu.name + ':' + cu.id).sort().join(' | ');
        })(),
        household: step('MATCH. This is their customer file, matched by the number and their name. Name on file: Edward. [file 5550109000 for edward]', { name: 'Edward' }),
        // a lookup with no approved answer: flagged when an escalation follows it, otherwise nothing was flagged (off topic)
        offTopic: (function () { const st = [{ tool: 'lookup_knowledge', t: 70, q: 'How can I buy from Walmart?', kb: null, args: { question: 'How can I buy from Walmart?' } }]; const d = document.createElement('div'); d.innerHTML = stepCard(c, st[0], 0, st, false); return d.innerText.replace(/\s+/g, ' '); })(),
        flagged: (function () { const st = [{ tool: 'lookup_knowledge', t: 70, q: 'Do you fix solar panels on the roof?', kb: null, args: { question: 'Do you fix solar panels on the roof?' } }, { tool: 'escalate_to_human', t: 72, args: { reason: 'solar panels', urgency: 'normal' } }]; const d = document.createElement('div'); d.innerHTML = stepCard(c, st[0], 0, st, false); return d.innerText.replace(/\s+/g, ' '); })(),
        // Oct 28: a number she hasn't read back, or that they haven't said yes to, is turned down first
        readback: step('READ BACK FIRST. You have not read this number back to them yet. Read it back now, slowly, every digit: 4 4 7, 7 0 0, 9 0 0, 1 2 3. Ask if that is right, then stop and wait.', { name: 'Kaye', phone: '447700900123' }),
        readwait: step('READ BACK FIRST. Wait for their answer to your read-back. Once they say yes, call find_caller again with the same number and their name.', { name: 'Kaye', phone: '447700900123' }),
        readno: step('READ BACK FIRST. They did not say yes to the number you read back. Ask for their number again, read every digit back, and once they say yes, call find_caller again.', { name: 'Kaye', phone: '447700900123' }),
        digits: step('CHECK. The caller said 12 digits, 4 4 7, 7 0 0, 9 0 0, 1 2 3, but you passed 10. Read the whole number back to them, every digit the way they said it, and once they say yes, call find_caller again with all 12 digits and their name.', { name: 'Kaye', phone: '4477009001' }),
      };
    });
    check('a plain test call has no caller ID and no caller file', got.vars.caller_id_last4 === '' && got.vars.caller_history === 'none' && got.vars.caller_known === 'no' && !Object.values(got.vars).some((v) => /\d/.test(String(v))), JSON.stringify(got.vars));
    check('find_caller in the timeline: a match says so and opens their file', /Looked for their file/.test(got.match) && /Matched their file by the number and their name/.test(got.match) && /Open their file/.test(got.match), got.match);
    check('find_caller in the timeline: a check says what she asked', /asked them to spell their first name/.test(got.check) && /asked them to give their last name/.test(got.last), got.check + ' | ' + got.last);
    check('find_caller in the timeline: a missing name asks for the full name, an incomplete number for the whole number', /No name yet, so she asked for their full name/.test(got.full) && /wasn.t complete, so she asked for the whole number/.test(got.partial), got.full + ' | ' + got.partial);
    check('find_caller in the timeline: a sample call, the try limit and a failed check each say so', /sample customer.s call/.test(got.sample) && /Three tries on this call already/.test(got.tries) && /couldn.t check the file/.test(got.broken) && !/couldn.t check/.test(got.sample + got.partial + got.tries), got.sample + ' | ' + got.tries + ' | ' + got.broken);
    check('two people on one number are two customers in the Command Center', got.split === 'Edward Smith:lc-p5550109000-edward | Kaye:lc-p5550109000', got.split);
    check('a lookup with no answer and nothing flagged reads as off topic; one followed by a flag says she flagged it', /Nothing was flagged for a person, as for a question that isn.t about roofing/.test(got.offTopic) && !/flagged it for a person/.test(got.offTopic) && /rather not guess and flagged it for a person/.test(got.flagged), got.offTopic + ' | ' + got.flagged);
    check('find_caller in the timeline: someone else on a number finds their own file, by the number they call from', /Edward, the number they.re calling from/.test(got.household) && /Matched their own file on that number by their name/.test(got.household) && /Open their file/.test(got.household), got.household);
    check('find_caller in the timeline: a number with digits missing says she was told to read it all back', /didn.t match the digits the caller said/.test(got.digits) && !/Close but not a match/.test(got.digits), got.digits);
    check('find_caller in the timeline: a number not read back yet, not answered yet, or not confirmed each say so', /hadn.t read the number back yet/.test(got.readback) && /wait for their yes/.test(got.readwait) && /didn.t say yes to the number she read back/.test(got.readno) && !/couldn.t check|Close but not a match/.test(got.readback + got.readwait + got.readno), got.readback + ' | ' + got.readwait + ' | ' + got.readno);
    check('find_caller in the timeline: no match and no file read as a new caller', /didn.t fit the file on that number/.test(got.nomatch) && !/Open their file/.test(got.nomatch) && /Nothing on file under that number/.test(got.nofile), got.nomatch + ' | ' + got.nofile);
    await page.evaluate(() => { location.hash = ''; });
    await ctx.close();
    const k = await open(BASE + '/voice/knowledge');
    const row = await k.page.evaluate(() => { const r = document.querySelector('[data-toolrow="find_caller"]'); return r ? r.innerText.replace(/\s+/g, ' ') : ''; });
    check('the Knowledge page lists find_caller', /Find a caller.s file/.test(row) && /name has to match/.test(row) && /reads the number back/.test(row), row);
    await k.ctx.close();
  }

  // 15. availability (Nov 2): the inspection days and times set on Settings, the three holidays closed, on the calendar
  //     too. Fixed on Friday, Nov 20, so Thanksgiving (Nov 26) is inside the two weeks the agent books.
  {
    const AT = '2026-11-20T10:00:00-08:00';
    const { ctx, page } = await open(BASE + '/voice/calendar', { testHook: true, at: AT });
    const hook = await page.evaluate(() => {
      const T = window.__VC_TEST__;
      const slots = T.openSlots('');
      return {
        hol: [T.holidayOn(2026, 10, 26), T.holidayOn(2026, 11, 25), T.holidayOn(2027, 0, 1), T.holidayOn(2026, 10, 27), T.holidayOn(2027, 10, 25)],
        summary: T.availSummary(),
        nov26: slots.filter((iso) => /^2026-11-26/.test(new Date(new Date(iso).getTime() - 8 * 3600000).toISOString())).length,
        nov25: slots.filter((iso) => /^2026-11-25/.test(new Date(new Date(iso).getTime() - 8 * 3600000).toISOString())).length,
        sundays: slots.filter((iso) => new Date(new Date(iso).getTime() - 8 * 3600000).getUTCDay() === 0).length,
      };
    });
    check('availability: the three holidays (Thanksgiving is the fourth Thursday of November)', JSON.stringify(hook.hol) === JSON.stringify(['Thanksgiving', 'Christmas Day', "New Year's Day", null, 'Thanksgiving']), JSON.stringify(hook.hol));
    check('availability: the usual times read as one sentence', hook.summary === 'Monday to Saturday at 8:00 AM, 10:30 AM, 1:00 PM and 3:30 PM', hook.summary);
    check('availability: no open times on Thanksgiving or a Sunday, the day before is open', hook.nov26 === 0 && hook.sundays === 0 && hook.nov25 === 4, JSON.stringify(hook));
    await page.click('#calNext'); await settle(page);
    const wk = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('#calGrid .ch')].slice(1).map((h) => ({ text: h.innerText.replace(/\s+/g, ' '), closed: h.classList.contains('closed') }));
      const cols = [...document.querySelectorAll('#calGrid .dc')].map((c) => ({ open: c.querySelectorAll('.open').length, tag: (c.querySelector('.closedtag') || {}).textContent || '' }));
      return { heads, cols, grid: document.getElementById('calAvail').innerText.replace(/\s+/g, ' ') };
    });
    check('calendar: Thanksgiving week shows Thursday closed with no open times', wk.heads.length === 6 && wk.heads[3].closed && /Thanksgiving/.test(wk.heads[3].text) && wk.cols[3].open === 0 && /Closed for Thanksgiving/.test(wk.cols[3].tag) && wk.cols[2].open === 4 && !wk.heads[2].closed, JSON.stringify(wk.heads) + JSON.stringify(wk.cols));
    check('calendar: the grid says Closed for the holiday and the note names the times and links to Settings', /Closed/.test(wk.grid) && /These are the times the agent offers: Monday to Saturday at 8:00 AM, 10:30 AM, 1:00 PM and 3:30 PM, Pacific\. Closed all day on Thanksgiving, Christmas Day and New Year.s Day\. Change them in Settings/.test(wk.grid), wk.grid);
    await page.click('#calAvail [data-go="settings"]'); await settle(page);
    const ed = await page.evaluate(() => ({
      path: location.pathname,
      rows: [...document.querySelectorAll('#availDays .avrow')].map((r) => r.innerText.replace(/\s+/g, ' ')),
      closed: document.getElementById('availClosed').innerText.replace(/\s+/g, ' '),
      msg: document.getElementById('availMsg').value,
      preview: document.getElementById('availPreview').innerText,
      state: document.getElementById('availState').innerText,
    }));
    check('settings: Change them in Settings opens the Availability section', ed.path === '/voice/settings' && ed.rows.length === 7, ed.path + ' ' + ed.rows.length);
    check('settings: each day with its times, Monday first, Sunday without inspections', /^Monday 8:00 AM.*10:30 AM.*1:00 PM.*3:30 PM/.test(ed.rows[0]) && /^Sunday No inspections/.test(ed.rows[6]), JSON.stringify(ed.rows));
    check('settings: the closed days with their dates, and the default message', /Closed all day on Thanksgiving \(Thursday, November 26\), Christmas Day \(Friday, December 25\) and New Year.s Day \(Friday, January 1\)/.test(ed.closed) && ed.msg === "Thanks for calling Arrington Roofing. We're closed today for {holiday}. Please call us back on our next business day." && /On Thanksgiving callers hear: .Thanks for calling Arrington Roofing\. We're closed today for Thanksgiving\./.test(ed.preview) && /Sign in to change the live agent/.test(ed.state), JSON.stringify(ed));
    // change it: Saturday closed, Sunday at 9, a time outside the day refused, the team's own message
    for (const t of ['08:00', '10:30', '13:00', '15:30']) await page.click('[data-avail-del="sat|' + t + '"]');
    await page.fill('[data-avail-new="sun"]', '09:00'); await page.click('[data-avail-add="sun"]');
    await page.fill('[data-avail-new="mon"]', '18:00'); await page.click('[data-avail-add="mon"]');
    const refused = await page.evaluate(() => document.getElementById('toastMsg').textContent);
    await page.fill('[data-avail-new="mon"]', '08:00'); await page.click('[data-avail-add="mon"]');
    const dup = await page.evaluate(() => document.getElementById('toastMsg').textContent);
    await page.fill('#availMsg', 'Happy {holiday}! We are closed today, call us tomorrow.');
    const ch = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#availDays .avrow')].map((r) => r.innerText.replace(/\s+/g, ' ')), preview: document.getElementById('availPreview').innerText, state: document.getElementById('availState').innerText }));
    check('settings: a time outside 7 AM to 5 PM and a time already there are turned away', /7:00 AM to 5:00 PM/.test(refused) && /already there/.test(dup) && !/6:00 PM/.test(ch.rows[0]), refused + ' | ' + dup);
    check('settings: changes show at once and wait for Save', /^Saturday No inspections/.test(ch.rows[5]) && /^Sunday 9:00 AM/.test(ch.rows[6]) && /Happy Thanksgiving! We are closed today, call us tomorrow\./.test(ch.preview) && ch.state === 'Not saved yet', JSON.stringify(ch));
    await page.click('#saveAvail'); await settle(page);
    const saved = await page.evaluate(() => ({ toast: document.getElementById('toastMsg').textContent, state: document.getElementById('availState').innerText }));
    check('settings: Save keeps it (in this browser when signed out)', /Saved in this browser/.test(saved.toast) && /Sign in to change the live agent/.test(saved.state), JSON.stringify(saved));
    await page.click('.nav[data-go="appointments"]'); await settle(page);
    await page.click('#calNext'); await settle(page);
    const wk2 = await page.evaluate(() => ({
      heads: [...document.querySelectorAll('#calGrid .ch')].slice(1).map((h) => h.innerText.replace(/\s+/g, ' ')),
      opens: [...document.querySelectorAll('#calGrid .dc')].map((c) => [...c.querySelectorAll('.open')].map((b) => b.textContent.trim())),
      note: document.getElementById('calAvail').innerText.replace(/\s+/g, ' '),
      slots: window.__VC_TEST__.openSlots('').map((iso) => new Date(new Date(iso).getTime() - 8 * 3600000).getUTCDay()),
    }));
    check('calendar: follows the saved days (Sunday shown with 9:00, Saturday without times)', wk2.heads.length === 7 && /^Sun \d+/.test(wk2.heads[6]) && JSON.stringify(wk2.opens[6]) === '["+ 9:00 AM"]' && wk2.opens[5].length === 0 && wk2.slots.indexOf(6) === -1 && wk2.slots.indexOf(0) !== -1, JSON.stringify(wk2.heads) + JSON.stringify(wk2.opens));
    check('calendar: the note reads the saved days', /Monday to Friday at 8:00 AM, 10:30 AM, 1:00 PM and 3:30 PM; Sunday at 9:00 AM, Pacific/.test(wk2.note), wk2.note);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250);
    await page.click('.nav[data-go="settings"]'); await settle(page);
    const kept = await page.evaluate(() => ({ sun: document.querySelector('#availDays [data-avday="sun"]').innerText.replace(/\s+/g, ' '), msg: document.getElementById('availMsg').value }));
    check('settings: the saved availability is still there after a reload', /9:00 AM/.test(kept.sun) && kept.msg === 'Happy {holiday}! We are closed today, call us tomorrow.', JSON.stringify(kept));
    await page.click('#availReset');
    const reset = await page.evaluate(() => ({ sat: document.querySelector('#availDays [data-avday="sat"]').innerText.replace(/\s+/g, ' '), sun: document.querySelector('#availDays [data-avday="sun"]').innerText.replace(/\s+/g, ' '), state: document.getElementById('availState').innerText, msg: document.getElementById('availMsg').value }));
    check('settings: Use the usual times puts the days back and keeps the message, unsaved', /8:00 AM/.test(reset.sat) && /No inspections/.test(reset.sun) && reset.state === 'Not saved yet' && /^Happy \{holiday\}/.test(reset.msg), JSON.stringify(reset));
    await ctx.close();
  }

  // 16. background sound (Nov 3): Erica heard Vapi's busy office sound as a call center. Settings picks light ambient
  //     (the default), quiet office, busy office or off; phone calls get it from Caller Lookup, browser calls from here.
  {
    const { ctx, page } = await open(BASE + '/voice/settings', { testHook: true });
    const LIGHT = 'https://aiparagon.vercel.app/voice-sounds/light-ambient.mp3';
    const QUIET = 'https://aiparagon.vercel.app/voice-sounds/quiet-office.mp3';
    const hk = await page.evaluate(() => {
      const T = window.__VC_TEST__;
      return {
        key: T.soundKey(), light: T.soundFor('light'), quiet: T.soundFor('quiet'), office: T.soundFor('office'), off: T.soundFor('off'), odd: T.soundFor('loud'),
        plain: T.startOverrides({}),
        test: T.startOverrides({ as: { overrides: { firstMessage: 'Hi', variableValues: { caller_known: 'yes' } } } }),
      };
    });
    check('sound: light ambient by default, and what Vapi gets for each choice', hk.key === 'light' && hk.light === LIGHT && hk.quiet === QUIET && hk.office === 'office' && hk.off === 'off' && hk.odd === LIGHT, JSON.stringify(hk));
    check('sound: Call the agent sends it, a plain call and a test callback alike, and keeps their own overrides', hk.plain.backgroundSound === LIGHT && hk.plain.variableValues.test_call === 'yes' && hk.test.backgroundSound === LIGHT && hk.test.firstMessage === 'Hi' && hk.test.variableValues.caller_known === 'yes', JSON.stringify(hk.test));
    const files = await page.evaluate(async () => Promise.all(['light-ambient', 'quiet-office'].map(async (f) => {
      const r = await fetch('/voice-sounds/' + f + '.mp3'); const b = new Uint8Array(await r.arrayBuffer());
      return { status: r.status, size: b.length, mp3: (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) };
    })));
    check('sound: both files are served as mp3 at /voice-sounds, not caught by the /voice rewrite', files.every((f) => f.status === 200 && f.mp3 && f.size > 100000), JSON.stringify(files));
    const ui = () => page.evaluate(() => ({
      names: [...document.querySelectorAll('#soundOpts .sndopt')].map((o) => o.querySelector('.sndhead').innerText.trim()),
      on: (document.querySelector('#soundOpts .sndopt.on .sndhead') || {}).innerText,
      checked: (document.querySelector('#soundOpts input[name="sndPick"]:checked') || {}).value,
      listen: [...document.querySelectorAll('[data-sound-play]')].map((b) => b.dataset.soundPlay + ':' + b.textContent),
      foot: [...document.querySelectorAll('#soundOpts .sndfoot')].map((f) => f.innerText.trim()),
      state: document.getElementById('soundState').innerText,
    }));
    let u = await ui();
    check('settings: Background sound lists the four choices, light ambient picked', JSON.stringify(u.names.map((n) => n.trim())) === JSON.stringify(['Light ambient', 'Quiet office', 'Busy office', 'Off']) && u.checked === 'light' && /Light ambient/.test(u.on), JSON.stringify(u));
    check('settings: Listen on our two sounds only; busy office says it has no preview', JSON.stringify(u.listen) === JSON.stringify(['light:Listen', 'quiet:Listen']) && /No preview/.test(u.foot[2]) && u.foot[3] === '' && /Demo\. Sign in/.test(u.state), JSON.stringify(u));
    await page.click('[data-sound-play="quiet"]'); await page.waitForTimeout(300);
    u = await ui();
    const toastAfterPlay = await page.evaluate(() => document.getElementById('toastMsg').textContent);
    check('settings: Listen plays it and turns into Stop', JSON.stringify(u.listen) === JSON.stringify(['light:Listen', 'quiet:Stop']), JSON.stringify(u.listen) + ' ' + toastAfterPlay);
    await page.click('[data-sound-play="quiet"]');
    u = await ui();
    check('settings: Stop stops it', JSON.stringify(u.listen) === JSON.stringify(['light:Listen', 'quiet:Listen']), JSON.stringify(u.listen));
    await page.click('[data-sound-play="light"]'); await page.waitForTimeout(200);
    await page.click('.nav[data-go="overview"]'); await settle(page);
    await page.click('.nav[data-go="settings"]'); await settle(page);
    u = await ui();
    check('settings: leaving Settings stops the sound', JSON.stringify(u.listen) === JSON.stringify(['light:Listen', 'quiet:Listen']), JSON.stringify(u.listen));
    await page.check('#soundOpts input[value="quiet"]');
    u = await ui();
    check('settings: picking another waits for Save', u.checked === 'quiet' && /Quiet office/.test(u.on) && u.state === 'Not saved yet', JSON.stringify(u));
    await page.click('#saveSound'); await settle(page);
    const sv = await page.evaluate(() => ({ toast: document.getElementById('toastMsg').textContent, key: window.__VC_TEST__.soundKey(), call: window.__VC_TEST__.startOverrides({}).backgroundSound }));
    check('settings: Save keeps it (in this browser when signed out) and the next browser call uses it', /Saved in this browser/.test(sv.toast) && sv.key === 'quiet' && sv.call === QUIET, JSON.stringify(sv));
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250);
    u = await ui();
    check('settings: still quiet office after a reload', u.checked === 'quiet' && /Demo\. Sign in/.test(u.state), JSON.stringify(u));
    await page.check('#soundOpts input[value="off"]'); await page.click('#saveSound'); await settle(page);
    const off = await page.evaluate(() => window.__VC_TEST__.startOverrides({}).backgroundSound);
    check('settings: Off sends off', off === 'off', off);
    await ctx.close();
  }

  // 17. hang-ups (Nov 3): end_call replaces Vapi's endCall; the tool server hangs up only once the caller is done, and
  //     the timeline says when it didn't and why.
  {
    const { ctx, page } = await open(BASE + '/voice/conversations', { testHook: true });
    const h = await page.evaluate(() => {
      const T = window.__VC_TEST__;
      const text = (html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); const t = d.innerText.replace(/\s+/g, ' ').trim(); d.remove(); return t; };
      const c = { id: 't', transcript: [['Caller', 'hi'], ['Agent', 'hello'], ['Caller', 'wait']], actions: [] };
      const card = (st) => T.stepCard(c, Object.assign({ after: 0 }, st), 0, [st], false);
      const cls = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild.className; };
      const no = card({ tool: 'end_call', result: 'NOT YET. Don\'t hang up: the call is still on. The caller isn\'t done: they said "That\'s all. But don\'t you wanna". You already said goodbye, so start with a few words like "Oh, sorry, go ahead," then answer what they said, and ask if there\'s anything else you can help with.' });
      const yes = card({ tool: 'end_call', result: 'Ending the call. Say nothing more.' });
      const old = card({ tool: 'endCall' });
      const hold = card({ tool: 'end_call', result: 'NOT YET. Don\'t hang up: the call is still on. The caller asked you to hold: they said "No thanks, hold on". Say "Sure, take your time" and wait for them. Do not call end_call until they are back and say they are done.' });
      return { no: text(no), noCls: cls(no), yes: text(yes), old: text(old), oldCls: cls(old), hold: text(hold),
        ended: ['assistant-ended-call', 'assistant-ended-call-after-message-spoken', 'customer-ended-call', 'silence-timed-out'].map(T.ended) };
    });
    check('hang-ups: a refused end_call reads Didn\'t hang up yet, with what the caller said', /^× Didn't hang up yet end_call/.test(h.no) && /the call went on\. The caller isn't done: they said "That's all\. But don't you wanna"\./.test(h.no) && /changed/.test(h.noCls) && !/You already said goodbye/.test(h.no), h.no);
    check('hang-ups: asked to hold reads as such, without the agent\'s instructions', /^× Didn't hang up yet end_call/.test(h.hold) && /The caller asked her to hold: they said "No thanks, hold on"\.$/.test(h.hold) && !/Sure, take your time|end_call until/.test(h.hold.replace(/^× Didn't hang up yet end_call/, '')), h.hold);
    check('hang-ups: an end_call that went through reads Hung up', /^× Hung up end_call/.test(h.yes) && /hung up a second after her goodbye/.test(h.yes), h.yes);
    check('hang-ups: older calls with Vapi\'s endCall read as before', /^× Ended the call endCall/.test(h.old) && /caller was still talking afterwards/.test(h.old) && /warn/.test(h.oldCls), h.old);
    check('hang-ups: every agent-ended reason reads Agent ended the call', JSON.stringify(h.ended) === JSON.stringify(['Agent ended the call', 'Agent ended the call', 'Caller hung up', 'Went quiet, call timed out']), JSON.stringify(h.ended));
    await ctx.close();
  }

  // 18. one booking a call (QA round 2, Nov 3): a second book_appointment moves the first, the same time again is not
  //     booked twice. The timeline and the live call rows say so.
  {
    const { ctx, page } = await open(BASE + '/voice/conversations', { testHook: true });
    const b = await page.evaluate(() => {
      const T = window.__VC_TEST__;
      const text = (html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); const t = d.innerText.replace(/\s+/g, ' ').trim(); d.remove(); return t; };
      const cls = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild.className; };
      const c = { id: 't', transcript: [['Caller', 'hi'], ['Agent', 'hello']], actions: [] };
      const card = (args, result) => { const st = { tool: 'book_appointment', after: 0, args: args, result: result }; return T.stepCard(c, st, 0, [st], false); };
      const R = {
        moved: 'Moved the roof inspection booked on this call from Wednesday, November 4 at 10:30 AM to Thursday, November 5 at 1:00 PM. Reference INS-ABC123. There is still one booking, not two. Confirm the new day, date and time in one sentence.',
        held: 'Moved the roof inspection booked on this call from Wednesday, November 4 at 10:30 AM to Thursday, November 5 at 1:00 PM, held for a coordinator to confirm. There is still one booking, not two.',
        twice: 'That time is already booked on this call: Wednesday, November 4 at 10:30 AM, reference INS-ABC123. Do not book it again. Confirm the day, date and time in one sentence.',
        booked: 'Booked a roof inspection for Wednesday, November 4 at 10:30 AM. Reference INS-ABC123. Confirm the day, date and time in one sentence.',
        taken: 'That time was just taken. Apologise briefly and offer these instead: Thursday, November 5 at 1:00 PM.'
      };
      const out = {};
      Object.keys(R).forEach((k) => { const h = card({ slot: k === 'twice' ? 'Wednesday at 10:30' : k === 'booked' ? 'Wednesday, November 4 at 10:30 AM' : 'Thursday, November 5 at 1:00 PM' }, R[k]); out[k] = text(h); out[k + 'Cls'] = cls(h); });
      // the live rows, from vc_tool_events
      const at = (s) => '2026-11-03T18:0' + s + ':00Z';
      const ev = (i, result, slot) => ({ call_id: 'c1', created_at: at(i), tool: 'book_appointment', args: { slot: slot }, result: result });
      const V = T.buildLive({ calls: [{ id: 'c1', started_at: at(0), ended_at: at(9), source: 'web', customer_name: 'Sam Lee', transcript: 'AI: Hi\nUser: Hi', outcome: 'booked' }],
        events: [ev(1, R.booked, 'Wednesday, November 4 at 10:30 AM'), ev(2, R.twice, 'Wednesday at 10:30'), ev(3, R.moved, 'Thursday, November 5 at 1:00 PM'), ev(4, R.taken, 'Friday at 8')],
        missions: [], approvals: [], escalations: [], knowledge: [], caseUpdates: [], suggestions: [], authority: [], feedback: [], rules: [], versions: [], collections: [], library: [], notifications: [],
        appointments: [{ id: 'a1', call_id: 'c1', status: 'confirmed', slot: 'Thursday, November 5 at 1:00 PM', starts_at: '2026-11-05T21:00:00Z', customer_name: 'Sam Lee' }] });
      const call = V.calls.find((x) => x.id === 'c1');
      out.live = (call.actions || []).filter((a) => a.t === 'book_appointment').map((a) => ({ r: a.r, ok: a.ok, ref: a.ref && a.ref.kind }));
      return out;
    });
    check('one booking a call: a second booking reads as a move of the first', /Moved the booking made on this call from Wednesday, November 4 at 10:30 AM to Thursday, November 5 at 1:00 PM, so there is still one booking/.test(b.moved) && !/changed/.test(b.movedCls), b.moved);
    check('one booking a call: a held move says where it moved to', /from Wednesday, November 4 at 10:30 AM to Thursday, November 5 at 1:00 PM, so there is still one booking/.test(b.held), b.held);
    check('one booking a call: the same time again was not booked twice', /Wednesday, November 4 at 10:30 AM was already booked on this call, so it wasn't booked twice/.test(b.twice) && !/changed/.test(b.twiceCls), b.twice);
    check('one booking a call: a plain booking and a taken time read as before', /Booked Wednesday, November 4 at 10:30 AM/.test(b.booked) && /Tried Thursday, November 5 at 1:00 PM, not booked/.test(b.taken) && /changed/.test(b.takenCls), b.booked + ' | ' + b.taken);
    check('one booking a call: the live rows say booked, already booked, moved, not booked', JSON.stringify(b.live) === JSON.stringify([{ r: '', ok: true, ref: 'appt' }, { r: 'Already booked on this call, not booked twice', ok: true, ref: 'appt' }, { r: 'Moved the booking made on this call from Wednesday, November 4 at 10:30 AM', ok: true, ref: 'appt' }, { r: 'Asked for Friday at 8, not booked', ok: false, ref: null }]), JSON.stringify(b.live));
    await ctx.close();
  }

  // 19. no times on any day (QA round 2, Nov 3): Save asks first, since the agent would then book nobody.
  {
    const { ctx, page } = await open(BASE + '/voice/settings', { fixed: true });
    const empty = async () => { for (;;) { const b = await page.$('[data-avail-del]'); if (!b) break; await b.click(); } };
    await empty();
    await page.click('#saveAvail'); await settle(page);
    const asked = await page.evaluate(() => ({ title: document.getElementById('mTitle').textContent, body: document.getElementById('mBody').innerText, btns: [...document.querySelectorAll('#mFoot button')].map((b) => b.textContent), state: document.getElementById('availState').innerText }));
    check('no times: Save asks before turning off every day', asked.title === 'Save with no inspection times?' && /won't offer or book any inspection/.test(asked.body) && JSON.stringify(asked.btns) === '["Keep editing","Save with no times"]' && asked.state === 'Not saved yet', JSON.stringify(asked));
    await page.click('#mFoot button:text("Keep editing")'); await settle(page);
    const kept = await page.evaluate(() => ({ state: document.getElementById('availState').innerText, rows: [...document.querySelectorAll('#availDays .avrow')].map((r) => r.innerText.replace(/\s+/g, ' ')) }));
    check('no times: Keep editing saves nothing and keeps the edit', kept.state === 'Not saved yet' && kept.rows.every((r) => /No inspections/.test(r)), JSON.stringify(kept));
    await page.click('#saveAvail'); await settle(page);
    await page.click('#mFoot button:text("Save with no times")'); await settle(page);
    const done = await page.evaluate(() => ({ toast: document.getElementById('toastMsg').textContent, state: document.getElementById('availState').innerText }));
    check('no times: Save with no times saves it', /Saved in this browser/.test(done.toast) && done.state !== 'Not saved yet', JSON.stringify(done));
    // a day with times saves straight away, no question
    await page.click('#availReset'); await settle(page);
    await page.click('#saveAvail'); await settle(page);
    const plain = await page.evaluate(() => ({ toast: document.getElementById('toastMsg').textContent, open: !!document.querySelector('#modal.open, .modal.open, [data-open="true"]') }));
    check('no times: the usual times save without a question', /Saved in this browser/.test(plain.toast), JSON.stringify(plain));
    await ctx.close();
  }

  // without a baseline any page error fails; with one, only errors the baseline did not have
  const newErrors = pageErrors.patched.filter((e) => !pageErrors.original.some((o) => o.split(' :: ')[1] === e.split(' :: ')[1]));
  check(BASELINE ? 'no new page errors' : 'no page errors', newErrors.length === 0, newErrors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (pageErrors.original.length ? ' (the baseline itself logged ' + pageErrors.original.length + ' page errors offline)' : ''));
  if (failures.length) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST RUN CRASHED:', e); server.close(); process.exit(2); });
