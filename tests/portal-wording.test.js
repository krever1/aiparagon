// Wording tests for E-&-G-Home-Inc.html (#2, the care portal), v12.35: the portal says team, not agency. Every
// page for director, staff and family (demo view), the windows that open from them, the screens of a signed-in
// stub account (the alerts address, team access, the pilot agreement and its printout) and the tour. What keeps
// the word on purpose: the Agency binder (the client's regional center file) and the Agency task category.
// Supabase answers from stubs (lib/portal-harness.js), so no real account or agency is touched. See tests/README.md.
// Usage: node tests/portal-wording.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

// every piece of text on the page (shown or not, scripts aside) and the placeholders, titles and labels,
// that still says agency once the binder and the task category are taken out
const stray = (page, sel) => page.evaluate((sel) => {
  const root = sel ? document.querySelector(sel) : document.body;
  if (!root) return ['(no ' + sel + ')'];
  const keep = (t) => t
    .replace(/\bAgency, Medical and Daily Logs binders\b/g, '')
    .replace(/\bAgency(?: docs)? binders?\b/g, '')
    .replace(/\bthe client agency file\b/g, '')
    .replace(/(^|·\s*)Agency(?=\s*(?:·|$))/g, '$1');                // the task category, on its own or in a task's line
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(n.parentNode.nodeName) ? 2 : 1 });
  let n; while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (/agenc/i.test(keep(t))) out.push(t.slice(0, 160)); }
  root.querySelectorAll('[placeholder],[title],[aria-label]').forEach((e) => ['placeholder', 'title', 'aria-label'].forEach((a) => { const v = e.getAttribute(a); if (v && /agenc/i.test(v)) out.push('@' + a + ' ' + v); }));
  return [...new Set(out)];
}, sel);

const VIEWS = ['home', 'clients', 'meds', 'calendar', 'tasks', 'billing', 'incidents', 'team', 'messages', 'compliance', 'trainhub', 'newclient', 'changelog',
  'forms', 'stafffiles', 'directory', 'weekly', 'staffpage', 'templates', 'integrations', 'training', 'docs', 'safety', 'acct', 'profile'];
async function sweep(page) {
  const bad = [];
  const ids = await page.evaluate((all) => [...new Set(NAV[state.role].filter((n) => n.id).map((n) => n.id).concat(all))], VIEWS);
  for (const id of ids) {
    const ok = await page.evaluate((id) => { try { closeAll(); state.client = null; go(id); return true; } catch (e) { return false; } }, id);
    if (!ok) continue;
    await page.waitForTimeout(60);
    const s = await stray(page);
    if (s.length) bad.push(id + ': ' + s.join(' | '));
  }
  const extra = [['a client', () => { closeAll(); if (CLIENTS[0]) openClient(CLIENTS[0].id); }], ['a staff page', () => { closeAll(); if (STAFF[0]) openStaffPage(STAFF[0].id); }], ['Settings', () => { closeAll(); go('home'); openSettings(); }]];
  for (const [name, fn] of extra) {
    if (!(await page.evaluate(fn).then(() => true, () => false))) continue;
    await page.waitForTimeout(150);
    const s = await stray(page);
    if (s.length) bad.push(name + ': ' + s.join(' | '));
  }
  await page.evaluate(() => { closeAll(); state.client = null; go('home'); });
  return { n: ids.length + extra.length, bad };
}

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  async function demo(role) {
    const { ctx, page } = await H.newPage(env, { viewport: { width: 1280, height: 900 }, bucket: errors });
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    await page.evaluate((r) => signIn(r), role); await page.waitForFunction((r) => state.role === r, role);
    await page.waitForTimeout(300);
    return { ctx, page };
  }

  // ---------------- 1. every page, for each role ----------------
  for (const role of ['director', 'staff', 'family']) {
    const { ctx, page } = await demo(role);
    const { n, bad } = await sweep(page);
    check(role + ': no page says agency (' + n + ' pages and windows, onboarding and the sign-in screens in the page too)', n >= 20 && !bad.length, bad.join(' || '));
    if (role === 'director') {
      const kept = await page.evaluate(() => { go('templates'); return document.querySelector('#view').innerText; });
      check('director: the Agency binder keeps its name', /Agency binders/.test(kept) && /Agency binder/.test(kept), kept.slice(0, 160));
      const cats = await page.evaluate(() => TASK_CATS.join(','));
      check('director: the Agency task category is kept', /\bAgency\b/.test(cats), cats);
    }
    await ctx.close();
  }

  // ---------------- 2. the windows a director opens ----------------
  {
    const { ctx, page } = await demo('director');
    const wins = [
      ['Customize your home page', () => { go('home'); document.querySelector('#view button[aria-label="Customize your home page"]').click(); }],
      ['Invite a director', () => inviteDirector()],
      ['the staff invite', () => inviteStaff((STAFF[0] || {}).id)],
      ['Export', () => exportAll()],
      ['the pilot agreement', () => openPilotAgreement()],
      ['your email', () => editEmail()],
      ['Add a section (Templates)', () => { go('templates'); csAddMenu('templates'); }]
    ];
    for (const [name, fn] of wins) {
      await page.evaluate(() => closeAll());
      await page.evaluate(fn).catch((e) => errors.push(name + ': ' + e.message));
      await page.waitForTimeout(250);
      const s = await stray(page);
      check('window: ' + name + ' does not say agency', !s.length, s.join(' | '));
    }
    await page.evaluate(() => { closeAll(); go('home'); document.querySelector('#view button[aria-label="Customize your home page"]').click(); });
    await page.waitForTimeout(250);
    const tgt = await page.evaluate(() => (document.querySelector('.hm-tgt-l') || {}).textContent);
    check('Customize: Team default for Directors, Staff, Families', tgt === 'Team default for', tgt);
    await page.evaluate(() => { closeAll(); inviteDirector(); });
    check('Invite a director: the email box suggests name@example.org', (await page.getAttribute('#idEmail', 'placeholder')) === 'name@example.org');
    await page.evaluate(() => { closeAll(); editEmail(); });
    check('your email: the box suggests you@example.org', (await page.getAttribute('#meEmail', 'placeholder')) === 'you@example.org');
    // the tour and the Ask card
    const tour = await page.evaluate(() => JSON.stringify(TOURS));
    check('the tour: no agency, and an empty morning list means the team is all caught up', !/agenc/i.test(tour) && /the team is all caught up/.test(tour), (tour.match(/[^"]*agenc[^"]*/i) || [''])[0]);
    const askCard = await page.evaluate(() => { closeAll(); go('home'); const d = document.createElement('div'); d.innerHTML = hmSecAsk(); return d.textContent; });
    check('home: Ask Spectrum gives plain-language answers from your team’s records', /Plain-language answers from your team’s records/.test(askCard), askCard.slice(0, 160));
    await ctx.close();
  }

  // ---------------- 3. a signed-in director: the agreement, the alerts address, team access ----------------
  {
    const dir = 'dana@maple.test';
    const S = { email: dir, password: 'qa-pass-1234', role: 'director', program: [
      { key: 'users', value: { map: { [dir]: { name: 'Dana Director', role: 'director', title: 'Executive Director' } } } },
      { key: 'email', value: { v: 'alerts@maple.test' } },
      { key: 'hidesample', value: { v: true } }] };
    const { ctx, page } = await H.newPage(env, { session: S, viewport: { width: 1280, height: 900 }, bucket: errors });
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
    await page.fill('#liEmail', dir); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && document.getElementById('pgAgency'), null, { timeout: 15000 });
    await page.waitForTimeout(600);
    // the pilot agreement, as its signer sees it
    const g = await page.evaluate(() => ({ label: document.getElementById('pgAgency').closest('.field').querySelector('label').textContent }));
    const gate = await page.evaluate(() => document.getElementById('mdBody').innerText);
    check('agreement: Team (legal entity name)', g.label === 'Team (legal entity name)', g.label);
    check('agreement: the signer is authorized to bind the Team', /authorized to bind the Team and agree to these terms/.test(gate), gate.slice(-300));
    check('agreement: the terms name the Team throughout, never the Agency', /AI Paragon provides the Team a non-exclusive/.test(gate) && /Records the Team enters remain the Team's property/.test(gate) && !/agenc/i.test(gate), (gate.match(/[^\n]*agenc[^\n]*/i) || [''])[0]);
    await page.click('#mdFoot button:has-text("Continue")');
    await page.waitForTimeout(300);
    const ask = await page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
    check('agreement: it asks for the team’s legal entity name first', /Enter the team’s legal entity name\./.test(ask), ask);
    await page.fill('#pgAgency', 'Maple Care LLC'); await page.fill('#pgName', 'Dana Director'); await page.check('#pgAccept');
    await page.click('#mdFoot button:has-text("Continue")');
    await page.waitForTimeout(500);
    const sheet = await page.evaluate(() => pilotSheet());
    check('agreement: the printed copy says Team: Maple Care LLC', /Team: Maple Care LLC/.test(sheet) && !/agenc/i.test(sheet.replace(/pgAgency/g, '')), (sheet.match(/[^<>]*agenc[^<>]*/i) || [''])[0]);
    // every page, signed in
    const sw = await sweep(page);
    check('signed in: no page says agency (' + sw.n + ' pages and windows)', sw.n >= 20 && !sw.bad.length, sw.bad.join(' || '));
    const prof = await page.evaluate(() => { closeAll(); go('profile'); return document.querySelector('#view').innerText; });
    check('signed in: Your profile lists Team alerts (Team-wide: daily digest and SIR alerts go here) and Team website',
      /Team alerts/.test(prof) && /Team-wide: daily digest and SIR alerts go here/.test(prof) && /Team website/.test(prof), prof.slice(0, 300));
    await page.evaluate(() => { closeAll(); go('home'); openSettings(); });             // signed in, it reads the team list first
    await page.waitForFunction(() => /Team access/.test(document.getElementById('drawer').innerText), null, { timeout: 5000 }).catch(() => {});
    const set = await page.evaluate(() => document.getElementById('drawer').innerText);
    check('signed in: Account has Team access (People who sign in to this team) and the summary for the team',
      /People who sign in to this team/.test(set) && /Reminders, alerts and the daily summary for the team/.test(set), set.replace(/\s+/g, ' ').slice(0, 600));
    await page.evaluate(() => closeAll());
    await page.evaluate(() => { closeAll(); editEmail(); });
    await page.waitForTimeout(200);
    const em = await page.evaluate(() => ({ title: document.getElementById('mdTitle').textContent, ph: document.getElementById('meEmail').placeholder, label: document.getElementById('meEmail').closest('.field').querySelector('label').textContent }));
    check('the alerts address: Team alerts email, Send team alerts to, director@example.org', em.title === 'Team alerts email' && em.label === 'Send team alerts to' && em.ph === 'director@example.org', JSON.stringify(em));
    const s = await stray(page);
    check('the alerts address window does not say agency', !s.length, s.join(' | '));
    await page.fill('#meEmail', 'office@maple.test');
    await page.click('#mdFoot .btn.navy');
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
    check('the alerts address: saving says Team alerts will go to office@maple.test', /Team alerts will go to office@maple\.test\./.test(t), t);
    const log = await page.evaluate(() => AUDIT.slice(0, 5).map((a) => a.act).join(' | '));
    check('the alerts address: the change log says Changed team alerts email', /Changed team alerts email/.test(log), log);
    await ctx.close();
  }

  // ---------------- 4. the messages a login sees when it has no team ----------------
  {
    const { ctx, page } = await H.newPage(env, { viewport: { width: 1280, height: 900 }, bucket: errors });
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
    const src = await page.evaluate(() => [noAgencyOut, agencyFromLogin, finishRegister, showRegisterGate, authSignInOnly, orgResolve, editEmail, teamAccessRemove, pilotGateSign, pilotBody].map((f) => typeof f === 'function' ? f.toString() : '').join('\n'));
    const gone = ['part of an agency', 'Set up a new agency', 'Starting a new agency', 'Create agency account', 'Give your agency a name', 'already has an agency', 'start an agency', 'Could not set up the agency',
      'Could not reach your agency', 'Agency alerts', 'agency alerts', 'opening this agency', 'opens this agency', 'access to this agency', 'the Agency', 'Agency legal entity', 'youragency.org', '@agency.org'];
    const left = gone.filter((g) => src.includes(g));
    check('the messages behind sign-in, team access and the agreement: none of the old agency wording is left', !left.length, left.join(', '));
    await page.evaluate(() => agencyFromLogin());
    await page.waitForTimeout(200);
    const sub = await page.evaluate(() => document.getElementById('loginSub').innerText);
    check('a login with no team can start one: Starting a new team with … The team gets its own private workspace', /^Starting a new team with/.test(sub) && /The team gets its own private workspace\./.test(sub), sub);
    await ctx.close();
  }

  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n  ' + failures.join('\n  ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
