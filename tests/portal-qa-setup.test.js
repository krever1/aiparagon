// QA regression suite for E-&-G-Home-Inc.html (#2, the care portal): getting in, setup and settings, and people,
// checked the way a new team (Ezra's) would use them, against the stand-in for the whole Supabase project
// (lib/portal-backend.js) with several people in their own browsers and a reload after each change. It follows
// the how-tos in docs/np-portal-guide.md (Getting in, Setup and settings, People) and the guide's Overview,
// Profile and Account settings, Page settings, Customize your home page and top bar sections.
// The checks for the Nov 5 pre-pilot QA findings (fixed in v12.42) fail on v12.41.1.
// Usage: node tests/portal-qa-setup.test.js [baseline.html]
const H = require('./lib/portal-harness');
const { makeBackend } = require('./lib/portal-backend');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + String(detail).slice(0, 400) + ']'));
}
const today = new Date().toISOString().slice(0, 10);
const DIR = { email: 'nora@willow.test', pw: 'willow-pass-1', org: 'Willow Care', name: 'Nora Lane', title: 'Executive Director', lic: '347001234' };
const STF = { email: 'omar@willow.test', pw: 'omar-pass-12', name: 'Omar Diaz', title: 'Direct Support Professional' };
const DIR2 = { email: 'ida@willow.test', pw: 'ida-pass-123', name: 'Ida Moss', title: 'Program Director' };
const UCI = '7350612';
const STOP = +(process.env.QA_STOP || 99);                        // development: stop after this section

(async () => {
  const env = await H.start(process.argv[2]);
  let ASK_REPLY = 'Okay.';
  const B = makeBackend({ ask: async () => ({ reply: ASK_REPLY }) });
  const errors = [];
  // the stand-in has no password-reset tokens: a reset link here trades its token once for a session, as Supabase does
  const RESET = {};
  const hooks = { failInvites: false };
  const rest = async (r) => {
    if (r.path.startsWith('/auth/v1/verify')) {
      let b = {}; try { b = JSON.parse(r.body || '{}'); } catch (e) {}
      const t = RESET[b.token_hash];
      if (t && !t.used) { t.used = true; const u = B.users.find((x) => x.email === t.email); return B.rest({ method: 'POST', path: '/auth/v1/token?grant_type=password', body: JSON.stringify({ email: u.email, password: u.password }), headers: {} }); }
      return { status: 400, body: { msg: 'Token has expired or is invalid' } };
    }
    if (hooks.failInvites && r.method === 'POST' && r.path.startsWith('/rest/v1/np_demo_invites')) return { status: 403, body: { code: '42501', message: 'permission denied' } };
    return B.rest(r);
  };
  async function open(viewport) {
    const { ctx, page } = await H.newPage(env, { rest, bucket: errors, viewport: viewport || { width: 1440, height: 900 } });
    await B.route(ctx);
    // print and new tabs are recorded instead of opened
    await ctx.addInitScript(() => { window.__printed = 0; window.__opened = []; window.print = () => { window.__printed++; }; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
    page.on('dialog', (d) => d.accept());
    return { ctx, page };
  }
  const booted = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  const inApp = (page) => page.waitForFunction(() => el('app').classList.contains('on') && typeof state !== 'undefined' && state.role, null, { timeout: 20000 });
  const settle = (page, ms) => page.waitForTimeout(ms || 500);
  const until = async (fn, ms) => { const end = Date.now() + (ms || 6000); while (Date.now() < end) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
  const go = async (page, v) => { await page.evaluate((v) => { closeAll(); go(v); }, v); await settle(page, 350); };
  const reload = async (page) => { await page.reload({ waitUntil: 'load' }); await booted(page); await inApp(page); await settle(page, 1500); };
  const btn = (page, scope, text) => page.locator(scope + ' button:has-text("' + text + '")').first();
  const toastOf = (page) => page.evaluate(() => ({ text: (el('toastTxt') || {}).textContent || '', warn: el('toast').classList.contains('warn') }));
  const modal = (page) => page.evaluate(() => (el('modal').classList.contains('on') ? el('mdTitle').innerText : ''));
  const settings = async (page) => { await page.evaluate(() => { closeAll(); }); await go(page, 'profile'); await btn(page, '#view', 'Settings').click(); await settle(page, 400); };
  const card = (page, h) => page.locator('#drawer section:has(h2:text-is("' + h + '"))');
  async function signPilot(page, who) {
    if (!(await page.locator('#pgAccept').count())) return false;
    if (await page.locator('#pgAgency').isVisible()) await page.fill('#pgAgency', who.org || '');
    if (who.lic && await page.locator('#pgLicense').isVisible()) await page.fill('#pgLicense', who.lic);
    await page.fill('#pgName', who.name); await page.fill('#pgTitle', who.title || 'Staff');
    await page.check('#pgAccept'); await page.locator('#modal button:has-text("Continue")').click();
    await page.waitForFunction(() => !window._gateLock && !el('modal').classList.contains('on'), null, { timeout: 10000 }).catch(() => {});
    return true;
  }
  async function startSignUp(page, who) {
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    await page.click('text=Get your team started');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'regOrg');   // the form puts the cursor in Team name a moment after it opens
    await page.fill('#regOrg', who.org); await page.fill('#regName', who.name); await page.fill('#regRole', who.title);
    await page.fill('#liEmail', who.email); await page.fill('#liPw', who.pw);
    await page.click('#liGo');
    await page.waitForFunction(() => el('onbRoot') && el('onbRoot').classList.contains('on'), null, { timeout: 20000 });
  }
  async function quickSetup(page) {                                // the first answer to every setup question
    for (let i = 0; i < 8; i++) {
      if (!(await page.evaluate(() => el('onbRoot').classList.contains('on')))) break;
      await page.locator('#onbRoot .opt >> visible=true').first().click().catch(() => {});
      await page.locator('#onbRoot #next').click(); await settle(page, 400);
    }
    await inApp(page); await settle(page, 1500);
  }
  async function signInAs(page, who) {
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    if (!(await page.evaluate(() => el('app').classList.contains('on')))) {
      await page.fill('#liEmail', who.email); await page.fill('#liPw', who.pw); await page.click('#liGo');
      await inApp(page);
    }
    await settle(page, 1500);
  }
  async function signOutUI(page) {                                 // the power button on the name card
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.locator('.side-user .su-out').click()]);
    await booted(page); await settle(page, 400);
  }
  const shot = async (page, name) => { if (process.env.QA_SHOTS) await page.screenshot({ path: require('path').join(process.env.QA_SHOTS, name + '.png') }).catch(() => {}); };
  const loginState = (page) => page.evaluate(() => ({ shown: getComputedStyle(el('login')).display !== 'none', app: el('app').classList.contains('on'), title: (el('loginTitle') || {}).textContent || '', sub: (el('loginSub') || {}).textContent || '', email: (el('liEmail') || {}).value || '', err: (el('liErr') || {}).style.display !== 'none' ? (el('liErr') || {}).innerText || '' : '', other: !!document.querySelector('#loginFresh .lg-other'), rem: el('liRemember') ? el('liRemember').checked : null }));

  // ======================= 1. GETTING IN: a new team signs up =======================
  const D = await open();
  let org = '';
  {
    const page = D.page;
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    await page.click('text=Get your team started');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'regOrg');
    // the form refuses what it should, before any login is made
    await page.fill('#regOrg', DIR.org); await page.fill('#regName', DIR.name); await page.fill('#regRole', DIR.title);
    await page.fill('#liEmail', DIR.email); await page.fill('#liPw', 'short'); await page.click('#liGo'); await settle(page, 1200);
    let t = await toastOf(page), L = await loginState(page);
    check('sign-up: a password under 8 characters is refused, with the reason on the card, and no login is made', /at least 8 characters/.test(L.err) && !B.users.length, L.err);
    check('sign-up: the "at least 8 characters" message is shown as a warning (!), not a success tick', t.warn, JSON.stringify(t));
    await page.fill('#regOrg', ''); await page.fill('#liPw', DIR.pw); await page.click('#liGo'); await settle(page, 800);
    t = await toastOf(page); L = await loginState(page);
    check('sign-up: no team name: "Give your team a name." and the cursor goes to Team name, no login made', /Give your team a name/.test(t.text) && t.warn && await page.evaluate(() => document.activeElement.id === 'regOrg') && !B.users.length, JSON.stringify(t));
    check('sign-up: the card does not keep showing the earlier password message once the password is fixed', !/at least 8 characters/.test(L.err), L.err);
    // now for real
    await page.fill('#regOrg', DIR.org); await page.click('#liGo');
    await page.waitForFunction(() => el('onbRoot') && el('onbRoot').classList.contains('on'), null, { timeout: 20000 });
    const u = B.users.find((x) => x.email === DIR.email);
    check('Create team account makes the login with a team of its own, them its director', !!u && B.members.filter((m) => m.user_id === u.id).length === 1 && B.members.find((m) => m.user_id === u.id).role === 'director');
    // the setup questions, answered for real (Program leadership)
    const q1 = await page.evaluate(() => ({ title: document.querySelector('#onbRoot .ob-q.on h2, #onbRoot .ob-q.on h1, #whoTitle') ? (el('whoTitle') || {}).textContent : '', opts: [...document.querySelectorAll('#onbRoot .ob-q.on .opt b')].map((b) => b.textContent.trim()), step: (el('stepLabel') || {}).textContent }));
    check('setup: the first question is the role, with Program leadership, Care provider, Family member or guardian, Just looking around', /what.s your role/i.test(q1.title) && q1.opts.join('|') === 'Program leadership|Care provider|Family member or guardian|Just looking around' && q1.step === 'Step 1 of 5', JSON.stringify(q1));
    check('setup: Continue waits until a role is picked', await page.evaluate(() => el('next').disabled));
    await page.locator('#onbRoot .ob-q.on .opt:has-text("Program leadership")').click();
    await page.locator('#onbRoot #next').click(); await settle(page, 300);
    const q2 = await page.evaluate(() => ({ org: (el('org') || {}).value || '', step: el('stepLabel').textContent, next: el('next').disabled }));
    check('setup: the organization question has the team name from sign-up filled in', q2.org === DIR.org && q2.step === 'Step 2 of 5', JSON.stringify(q2));
    await page.locator('#onbRoot .ob-q.on .opt >> visible=true').first().click(); await settle(page, 200);
    await page.locator('#onbRoot #next').click(); await settle(page, 300);
    for (let i = 3; i <= 5; i++) {
      const st = await page.evaluate(() => ({ step: el('stepLabel').textContent, dis: el('next').disabled, label: el('next').firstChild.nodeValue.trim() }));
      if (i === 5) check('setup: the last step\'s button says Open my workspace', st.label === 'Open my workspace' && st.step === 'Step 5 of 5', JSON.stringify(st));
      await page.locator('#onbRoot .ob-q.on .opt >> visible=true').first().click(); await settle(page, 200);
      await page.locator('#onbRoot #next').click(); await settle(page, 400);
    }
    await inApp(page); await settle(page, 1500);
    org = B.myOrg(DIR.email);
    // the pilot agreement
    const g = await page.evaluate(() => ({ lock: !!window._gateLock, title: el('modal').classList.contains('on') ? el('mdTitle').innerText : '', agency: (el('pgAgency') || {}).value, lic: !!el('pgLicense'), user: !!window._pgUser }));
    check('the Pilot Dashboard Agreement comes up first, for the team (legal entity name, license number), with the team name filled in', g.lock && g.title === 'Pilot Dashboard Agreement' && g.agency === DIR.org && g.lic && !g.user, JSON.stringify(g));
    await page.fill('#pgAgency', ''); await page.locator('#modal button:has-text("Continue")').click(); await settle(page, 300);
    t = await toastOf(page);
    check('agreement: Continue with no legal entity name is refused', /legal entity name/.test(t.text) && t.warn && await page.evaluate(() => !!window._gateLock), JSON.stringify(t));
    await page.fill('#pgAgency', DIR.org); await page.fill('#pgLicense', DIR.lic); await page.fill('#pgName', DIR.name); await page.fill('#pgTitle', DIR.title);
    await page.locator('#modal button:has-text("Continue")').click(); await settle(page, 300);
    t = await toastOf(page);
    check('agreement: Continue without the tick is refused', /acceptance box/.test(t.text) && await page.evaluate(() => !!window._gateLock), JSON.stringify(t));
    check('agreement: "Check the acceptance box to sign." shows as a warning (!), not a success tick', t.warn, JSON.stringify(t));
    await page.locator('#mdFoot button:has-text("Print")').click(); await settle(page, 300);
    check('agreement: Print in the agreement window prints it (with what is typed so far)', await page.evaluate(() => window.__printed > 0 && /Willow Care/.test(el('printArea').innerText) && /347001234/.test(el('printArea').innerText)));
    await page.check('#pgAccept'); await page.locator('#modal button:has-text("Continue")').click();
    await page.waitForFunction(() => !window._gateLock && !el('modal').classList.contains('on'), null, { timeout: 10000 }).catch(() => {});
    check('agreement: signing unlocks the dashboard', await page.evaluate(() => !window._gateLock && el('app').classList.contains('on') && state.role === 'director'));
    await until(() => B.rows('np_demo_agreements').some((x) => x.org_id === org) && ((B.prog(org, 'pilot') || {}).signatures || {})['u:' + DIR.email]);
    const ag = B.rows('np_demo_agreements').find((x) => x.org_id === org) || {};
    const sig = ((B.prog(org, 'pilot') || {}).signatures || {})['u:' + DIR.email] || {};
    check('agreement: saved for the team with the legal name, license, signer, title and email', ag.agency === DIR.org && ag.license === DIR.lic && ag.signed_by === DIR.name && ag.title === DIR.title && ag.signer_email === DIR.email && sig.license === DIR.lic && !sig.user, JSON.stringify([ag, sig]).slice(0, 400));
    const s = await page.evaluate(() => ({ hide: state.hideSample, clients: visibleClients().length, staff: visibleStaff().length, banner: getComputedStyle(el('modeBanner')).display, nav: [...document.querySelectorAll('#nav .nav-item')].map((b) => [...b.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim()), groups: [...document.querySelectorAll('#nav .nav-g, #nav .nav-group, #nav [class*="grp"]')].map((n) => n.innerText.trim()) }));
    check('a new team starts in Development: no sample records, no Demo banner', s.hide === true && !s.clients && !s.staff && s.banner === 'none', JSON.stringify(s));
    check('the director menu is the guide\'s: Home, Tasks, Calendar, Clients, Staff, Training & onboarding, Safety log, Accountability, Documents, Templates, Directory, Change log', s.nav.join('|') === 'Home|Tasks|Calendar|Clients|Staff|Training & onboarding|Safety log|Accountability|Documents|Templates|Directory|Change log', s.nav.join('|'));
    // re-open the agreement: the sidebar link, Settings and the profile
    await page.locator('#pilotLink').click(); await settle(page, 300);
    const re = await page.evaluate(() => ({ title: el('mdTitle').innerText, body: el('mdBody').innerText }));
    check('re-open: Pilot agreement in the sidebar shows the signed copy (signer, team, license)', re.title === 'Signed agreement' && /Nora Lane/.test(re.body) && /Willow Care/.test(re.body) && /347001234/.test(re.body), re.title + ' | ' + re.body.slice(0, 200));
    await page.evaluate(() => { window.__printed = 0; }); await btn(page, '#mdFoot', 'Print copy').click(); await settle(page, 200);
    check('re-open: Print copy prints the signed agreement', await page.evaluate(() => window.__printed === 1 && /Authorized signer: Nora Lane/.test(el('printArea').innerText)));
    await settings(page);
    const sc = await card(page, 'Signed agreement').innerText().catch(() => '');
    check('re-open: Settings has the Signed agreement with Print', /Nora Lane/.test(sc) && /347001234/.test(sc) && /Print/.test(sc), sc.slice(0, 160));
    await page.evaluate(() => closeAll());
    await reload(page);
    const r = await page.evaluate(() => ({ role: state.role, gate: !!window._gateLock, onb: el('onbRoot').classList.contains('on'), team: el('brandName').textContent }));
    check('after a reload: straight in as director, no setup or agreement again, the team name on the sidebar', r.role === 'director' && !r.gate && !r.onb && r.team === DIR.org, JSON.stringify(r));
  }
  if (STOP <= 1) return finish();

  // ======================= 2. sign out and in, Remember my email, a wrong password =======================
  {
    const page = D.page;
    await signOutUI(page);
    let L = await loginState(page);
    check('sign out (the power button on the name card) goes to the sign-in page, email remembered, with "Not you? Use a different account"', L.shown && !L.app && L.email === DIR.email && L.other && L.rem === true, JSON.stringify(L));
    await page.fill('#liPw', 'not-the-password'); await page.click('#liGo'); await settle(page, 900);
    L = await loginState(page);
    check('a wrong password is refused on the card', !L.app && /password|incorrect|no login/i.test(L.err), L.err);
    await page.fill('#liEmail', 'nobody@willow.test'); await page.fill('#liPw', DIR.pw); await page.click('#liGo'); await settle(page, 900);
    L = await loginState(page);
    check('an email with no login is refused too, without saying which part was wrong', !L.app && L.err.length > 0, L.err);
    // Remember my email off: signed in, then out, the email is not offered
    await page.fill('#liEmail', DIR.email); await page.fill('#liPw', DIR.pw); await page.uncheck('#liRemember'); await page.click('#liGo'); await inApp(page); await settle(page, 1200);
    await signOutUI(page);
    L = await loginState(page);
    check('Remember my email unticked: after sign out the email is not filled in and the box stays unticked', L.email === '' && !L.other && L.rem === false, JSON.stringify(L));
    await page.fill('#liEmail', DIR.email); await page.fill('#liPw', DIR.pw); await page.check('#liRemember'); await page.click('#liGo'); await inApp(page); await settle(page, 1200);
    await signOutUI(page);
    L = await loginState(page);
    check('ticked again: the email is offered after the next sign out', L.email === DIR.email && L.rem === true, JSON.stringify(L));
    await page.fill('#liPw', DIR.pw); await page.click('#liGo'); await inApp(page); await settle(page, 1200);
    check('signed back in as the director of Willow Care', await page.evaluate(() => state.role === 'director' && agencyName() === 'Willow Care'));
  }
  if (STOP <= 2) return finish();

  // ======================= 3. Forgot password, the reset link, Change password =======================
  {
    const X = await open();
    const x = X.page;
    await x.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(x);
    await x.click('text=Forgot password?'); await settle(x, 200);
    await x.fill('#fpEmail', 'not-an-email'); await x.click('#fpGo'); await settle(x, 300);
    check('Forgot password?: a bad address is refused before anything is sent', /valid email/.test(await x.evaluate(() => el('fpMsg').innerText)) && !B.mails.length);
    await x.fill('#fpEmail', DIR.email.toUpperCase()); await x.click('#fpGo'); await settle(x, 600);
    check('Send reset link asks the server for the email (lower-cased) and says it is on its way, then offers Back to log in', B.mails.some((m) => m.action === 'request' && m.email === DIR.email) && /on its way/.test(await x.evaluate(() => el('fpMsg').innerText)) && /Back to log in/.test(await x.evaluate(() => el('fpGo').textContent)), JSON.stringify(B.mails));
    // the link from the email
    RESET['qa-reset-1'] = { email: DIR.email };
    await x.goto(env.BASE + '/portal.html?reset=qa-reset-1', { waitUntil: 'load' }); await booted(x); await settle(x, 300);
    check('the reset link opens Choose a new password', /Choose a new password/.test(await x.evaluate(() => el('loginTitle').textContent)) && await x.isVisible('#rsPw'));
    await x.fill('#rsPw', 'short'); await x.fill('#rsPw2', 'short'); await x.click('#rsGo'); await settle(x, 300);
    check('reset: under 8 characters is refused', /at least 8/.test(await x.evaluate(() => el('rsErr').innerText)));
    await x.fill('#rsPw', 'willow-new-22'); await x.fill('#rsPw2', 'willow-new-23'); await x.click('#rsGo'); await settle(x, 300);
    check('reset: two different passwords are refused', /different/.test(await x.evaluate(() => el('rsErr').innerText)));
    await x.fill('#rsPw', DIR.pw); await x.fill('#rsPw2', DIR.pw); await x.click('#rsGo'); await settle(x, 700);
    check('reset: the password already in use is refused in plain words', /already have/.test(await x.evaluate(() => el('rsErr').innerText)), await x.evaluate(() => el('rsErr').innerText));
    await x.fill('#rsPw', 'willow-new-22'); await x.fill('#rsPw2', 'willow-new-22'); await x.click('#rsGo'); await settle(x, 800);
    const rs = await x.evaluate(() => ({ title: el('loginTitle').textContent, email: el('liEmail').value, url: location.search }));
    check('reset: saved, then Password changed with the email filled in and the token gone from the address', rs.title === 'Password changed' && rs.email === DIR.email && rs.url === '', JSON.stringify(rs));
    DIR.pw = 'willow-new-22';
    await x.fill('#liPw', 'willow-pass-1'); await x.click('#liGo'); await settle(x, 900);
    check('reset: the old password no longer works', !(await x.evaluate(() => el('app').classList.contains('on'))));
    await x.fill('#liPw', DIR.pw); await x.click('#liGo'); await inApp(x); await settle(x, 1000);
    check('reset: the new one does, into Willow Care as its director', await x.evaluate(() => state.role === 'director' && agencyName() === 'Willow Care'));
    await X.ctx.close();
    const Y = await open();
    await Y.page.goto(env.BASE + '/portal.html?reset=qa-reset-1', { waitUntil: 'load' }); await booted(Y.page);
    await Y.page.fill('#rsPw', 'willow-new-33'); await Y.page.fill('#rsPw2', 'willow-new-33'); await Y.page.click('#rsGo'); await settle(Y.page, 600);
    check('reset: the same link a second time says it expired or was used, and changes nothing', /expired or was already used/.test(await Y.page.evaluate(() => el('rsErr').innerText)) && B.users.find((u) => u.email === DIR.email).password === DIR.pw);
    await Y.ctx.close();
    // Change password from Settings > Security (how-to 4)
    const page = D.page;
    await reload(page).catch(async () => { await signInAs(page, DIR); });
    if (!(await page.evaluate(() => el('app').classList.contains('on')))) await signInAs(page, DIR);
    await settings(page);
    await card(page, 'Security').locator('button:has-text("Change password")').click(); await settle(page, 300);
    check('Settings > Security > Change password opens with the sign-in email shown', (await modal(page)) === 'Change your password' && (await page.inputValue('#modal input[disabled]')) === DIR.email);
    await page.fill('#crPw', 'willow-pass-77'); await page.fill('#crPw2', 'willow-pass-78'); await page.click('#crGo'); await settle(page, 300);
    check('Change password: two different passwords are refused', /do not match/.test((await toastOf(page)).text));
    await page.fill('#crPw', 'willow-pass-77'); await page.fill('#crPw2', 'willow-pass-77'); await page.click('#crGo'); await settle(page, 700);
    check('Change password: saved, and the new password is the one that signs in', /Password changed/.test((await toastOf(page)).text) && B.users.find((u) => u.email === DIR.email).password === 'willow-pass-77', (await toastOf(page)).text);
    DIR.pw = 'willow-pass-77';
  }
  if (STOP <= 3) return finish();

  // ======================= 4. Your profile and Account settings (director) =======================
  {
    const page = D.page;
    await settings(page);
    const cards = await page.evaluate(() => [...document.querySelectorAll('#drawer section.card')].filter((s) => s.offsetParent).map((s) => (s.querySelector('h2') || {}).textContent));
    const want = ['Profile', 'Security', 'Notifications', 'Team access', 'Demo vs. Development', 'Workspace data', 'Lists', 'Demonstration view', 'Colors', 'Names', 'Certification reminders', 'Session', 'Staff display', 'Switch view'];
    check('Settings (director) has every card the guide lists: ' + want.join(', '), want.every((w) => cards.includes(w)), cards.join(', '));
    check('Notifications has Run setup again for the director who set up the team', (await card(page, 'Notifications').locator('button:has-text("Run setup again")').count()) === 1);
    // name and title
    await card(page, 'Profile').locator('button:has-text("Edit")').click(); await settle(page, 300);
    await page.fill('#meName', ''); await btn(page, '#modal', 'Save').click(); await settle(page, 200);
    check('name: an empty name is refused', /Enter your name/.test((await toastOf(page)).text) && (await modal(page)) === 'Your name');
    await page.fill('#meName', 'Nora Q. Lane'); await page.fill('#meRoleT', 'Owner and Director'); await btn(page, '#modal', 'Save').click(); await settle(page, 800);
    await until(() => (((B.prog(org, 'users') || {}).map || {})[DIR.email] || {}).name === 'Nora Q. Lane');
    const um = ((B.prog(org, 'users') || {}).map || {})[DIR.email] || {};
    check('name: Settings > Profile > Edit saves the name and title on the team list, keeping the director role', um.name === 'Nora Q. Lane' && um.title === 'Owner and Director' && um.role === 'director', JSON.stringify(um));
    // own credential
    await go(page, 'profile');
    await btn(page, '#view', 'Add credential').click(); await settle(page, 300);
    await page.fill('#myCrName', 'Administrator certificate'); await page.fill('#myCrExp', new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10));
    await btn(page, '#modal', 'Save').click(); await settle(page, 600);
    // preferences
    await btn(page, '#view', 'Edit').last().click(); await settle(page, 300);
    const isPrefs = (await modal(page)) === 'Preferences';
    if (!isPrefs) await page.evaluate(() => { closeAll(); editPrefs(); });
    await page.selectOption('#pfTime', '24-hour'); await btn(page, '#modal', 'Save').click(); await settle(page, 400);
    // team alerts email (profile > About > Team alerts > Add)
    await page.locator('#view tr:has-text("Team alerts") button').click(); await settle(page, 300);
    await page.fill('#meEmail', 'not an email'); await btn(page, '#modal', 'Save').click(); await settle(page, 200);
    check('Team alerts: a bad address is refused', /valid email/.test((await toastOf(page)).text) && (await modal(page)) === 'Team alerts email');
    await page.fill('#meEmail', 'alerts@willow.test'); await btn(page, '#modal', 'Save').click(); await settle(page, 400);
    // session, staff display, certification reminders
    await settings(page);
    await card(page, 'Session').locator('select').selectOption('30'); await settle(page, 300);
    check('Session: the toast says it is for your account only', /just for your account/.test((await toastOf(page)).text));
    await card(page, 'Staff display').locator('button:has-text("Initials only")').click(); await settle(page, 300);
    await settings(page);
    await card(page, 'Certification reminders').locator('button:has-text("Edit")').click(); await settle(page, 300);
    await page.fill('#crDays', '30'); await page.selectOption('#crWho', 'director'); await btn(page, '#modal', 'Save').click(); await settle(page, 400);
    // notification settings (how-to 11)
    await settings(page);
    await card(page, 'Notifications').locator('button:has-text("Notification settings")').click(); await settle(page, 400);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#modal .set-tab')].map((b) => b.textContent.trim()));
    check('Notification settings has the three tabs: Reminders, Activity, Daily summary', tabs.join('|') === 'Reminders|Activity|Daily summary', tabs.join('|'));
    await page.locator('#modal .ns-card:has(b:text-is("Appointments")) select.ns-sel').selectOption('48'); await settle(page, 300);
    await page.locator('#modal .ns-card:has(b:text-is("Portal messages")) .ns-tog input').uncheck(); await settle(page, 300);
    await page.locator('#modal .set-tab:has-text("Daily summary")').click(); await settle(page, 300);
    await page.locator('#modal .ns-card select.ns-sel').first().selectOption('weekly'); await settle(page, 400);
    const dig = await page.evaluate(() => ({ txt: el('mdBody').innerText, btns: [...document.querySelectorAll('#mdBody button')].map((b) => b.textContent.trim()) }));
    check('Daily summary: Once a week adds the day, the time, who gets it, what it covers, Preview mine and Email me a test copy', /Who gets it/i.test(dig.txt) && /What it covers/i.test(dig.txt) && dig.btns.some((b) => /Preview mine/.test(b)) && dig.btns.some((b) => /Email me a test copy/.test(b)), JSON.stringify(dig.btns));
    const r0 = B.relay.length;
    await btn(page, '#mdBody', 'Email me a test copy').click(); await settle(page, 800);
    const tc = B.relay.slice(r0).find((x) => x.action === 'email') || {};
    check('Email me a test copy goes to your own address only, as a summary (no task titles)', (tc.payload || {}).to === DIR.email && /digest|summary/.test((tc.payload || {}).kind || ''), JSON.stringify(tc).slice(0, 300));
    await page.evaluate(() => closeAll()); await settle(page, 600);
    // names (how-to 9)
    await settings(page);
    await card(page, 'Names').locator('button:has-text("Rename")').click(); await settle(page, 300);
    await page.fill('#modal input[data-lbl="clients"]', 'People we support'); await page.fill('#modal input[data-bnd="Agency"]', 'Alta binder');
    await btn(page, '#modal', 'Save names').click(); await settle(page, 700);
    await go(page, 'templates');
    const nm = await page.evaluate(() => ({ nav: [...document.querySelectorAll('#nav .nav-item')].map((b) => [...b.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim()), docs: el('view').innerText }));
    check('Names: the menu and the binder show the team\'s words (sidebar, Documents)', nm.nav.includes('People we support') && /Alta binder/.test(nm.docs), nm.nav.join('|'));
    // houses and appointment types (how-to 12) through the gear
    await go(page, 'calendar');
    await page.evaluate(() => closeAll()); await settle(page, 200); await page.locator('#view button.gear').first().click(); await settle(page, 300);
    await page.locator('#modal .set-tab:has-text("Display settings")').click(); await settle(page, 300);
    await btn(page, '#modal', 'Add house').click(); await settle(page, 300);
    check('gear > Display settings > Houses > Add house opens New house', /New house/.test(await modal(page)), await modal(page));
    await page.fill('#gpName', 'Pine House'); await page.locator('#mdFoot button:has-text("Add house")').click(); await settle(page, 500);
    await page.evaluate(() => closeAll()); await settle(page, 200); await page.locator('#view button.gear').first().click(); await settle(page, 300);
    await page.locator('#modal .set-tab:has-text("Calendar integrations")').click(); await settle(page, 200);   // v12.46: types moved to the calendar tab
    await page.locator('#modal .seg button:has-text("Appointment types")').click(); await settle(page, 200);
    await btn(page, '#modal', 'New type').click(); await settle(page, 300);
    await page.fill('#gpName', 'Hydrotherapy'); await page.locator('#mdFoot button:has-text("Create type")').click(); await settle(page, 500);
    // calendars: a new calendar (Calendar integrations)
    await page.evaluate(() => closeAll()); await settle(page, 200); await page.locator('#view button.gear').first().click(); await settle(page, 300);
    await page.locator('#modal .set-tab:has-text("Calendar integrations")').click(); await settle(page, 200);
    await btn(page, '#modal', 'Add calendar').click(); await settle(page, 200);   // v12.46: one Add calendar button
    await page.locator('#cxMenu .cx-mi:has-text("Create a portal calendar")').click(); await settle(page, 300);
    await page.fill('#gpName', 'Day program'); await page.locator('#mdFoot button:has-text("Create calendar")').click(); await settle(page, 500);
    // task categories (Lists)
    await settings(page);
    await card(page, 'Lists').locator('button:has-text("Manage task categories")').click(); await settle(page, 300);
    await page.fill('#lmNew', 'Meds'); await btn(page, '#modal', 'Add').click(); await settle(page, 300);
    await page.evaluate(() => closeAll());
    // attention colours
    await settings(page);
    await card(page, 'Colors').locator('button:has-text("Attention")').click(); await settle(page, 300);
    await page.evaluate(() => { const i = el('ac_incident'); i.value = '#123456'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await btn(page, '#modal', 'Save colors').click(); await settle(page, 600);
    await page.waitForTimeout(1500);
    await go(page, 'profile');
    const about = await page.evaluate(() => [...document.querySelectorAll('#view tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()).filter((t) => /^(Phone|Permission|Role|Sign-in email)/.test(t)));
    check('profile > About does not show "Phone: On file" (the portal never asks for a phone number; the line is fixed text)', !about.some((t) => /^Phone On file/.test(t)), about.join(' | '));
    // all of it after a reload
    await reload(page);
    const a = await page.evaluate(() => ({ me: el('suName').textContent, title: (PERSON || {}).title, quals: JSON.stringify(MY_QUALS_P), prefs: PREFS.timeFmt, hm: hm12('13:30'), alerts: AGENCY_EMAIL, idle: IDLE_MIN, nm: NAME_MODE, cert: CERT_REMIND, remind: NOTIF_REMIND, dig: NOTIF_DIGEST.freq, labels: LABELS, folder: FOLDER_NAMES.Agency, homes: HOMES.slice(), cats: Object.keys(APPT_CATS), cals: calDefsAll().map((c) => c.name), tcats: TASK_CATS.slice(), attn: ATTN_COLORS.incident }));
    check('after a reload: the name and title on the name card and records', a.me === 'Nora Q. Lane' && a.title === 'Owner and Director', JSON.stringify([a.me, a.title]));
    check('after a reload: the director\'s own credential is on their profile', /Administrator certificate/.test(a.quals) && /Administrator certificate/.test(await page.evaluate(() => { go('profile'); return el('view').innerText; })), a.quals);
    check('after a reload: the team alerts email, the idle sign-out, initials, certification reminders (30 days, director only)', a.alerts === 'alerts@willow.test' && a.idle === 30 && a.nm === 'initials' && a.cert.days === 30 && a.cert.who === 'director', JSON.stringify([a.alerts, a.idle, a.nm, a.cert]));
    check('after a reload: Notification settings kept (appointments 48 h ahead, message nudges off, a weekly summary)', +a.remind.appt.lead === 48 && a.remind.msg.on === false && a.dig === 'weekly', JSON.stringify([a.remind.appt, a.remind.msg, a.dig]));
    check('after a reload: the renamed menu and binder, the new house, appointment type, calendar, task category and attention colour', a.labels.clients === 'People we support' && a.folder === 'Alta binder' && a.homes.includes('Pine House') && a.cats.includes('Hydrotherapy') && a.cals.includes('Day program') && a.tcats.includes('Meds') && a.attn === '#123456', JSON.stringify([a.labels, a.folder, a.homes, a.cats, a.cals, a.tcats, a.attn]));
    check('Preferences > Time format 24-hour is saved but changes nothing: times still read 1:30 PM (Theme and Language are the same)', a.prefs !== '24-hour' || a.hm === '13:30', a.prefs + ' -> ' + a.hm);
    // un-renaming: a blank field gives the standard name back
    await settings(page);
    await card(page, 'Names').locator('button:has-text("Rename")').click(); await settle(page, 300);
    const bv = await page.evaluate(() => ({ v: document.querySelector('#modal input[data-bnd="Agency"]').value, ph: document.querySelector('#modal input[data-bnd="Agency"]').placeholder, note: el('mdBody').innerText }));
    await page.fill('#modal input[data-lbl="clients"]', ''); await page.fill('#modal input[data-bnd="Agency"]', '');
    await btn(page, '#modal', 'Save names').click(); await settle(page, 1200);
    await reload(page);
    const un = await page.evaluate(() => ({ lbl: LABELS.clients || '', folder: FOLDER_NAMES.Agency, nav: [...document.querySelectorAll('#nav .nav-item')].map((b) => [...b.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim()) }));
    check('Names: a blank menu field gives the standard name back (Clients)', !un.lbl && un.nav.includes('Clients'), JSON.stringify(un));
    check('Names: a blank binder field gives the standard name back ("Leave a field blank to keep the standard name"), but the binder stays "Alta binder"', un.folder === 'Agency binder', un.folder + ' (field held ' + JSON.stringify(bv.v) + ', placeholder ' + bv.ph + ')');
    // time zone (Settings > Profile > Change): saved, then put back to automatic
    await settings(page);
    await card(page, 'Profile').locator('button:has-text("Change")').click(); await settle(page, 300);
    await page.selectOption('#meTz', 'America/New_York');
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => {}), btn(page, '#modal', 'Save').click()]);
    await booted(page); await inApp(page); await settle(page, 1500);
    const tz = await page.evaluate(() => ({ force: TZ_FORCE, mine: (USER_SET[userKey()] || {}).tzForce }));
    check('Time zone: saved to the account and the page follows it', tz.force === 'America/New_York' && tz.mine === 'America/New_York', JSON.stringify(tz));
    await settings(page);
    await card(page, 'Profile').locator('button:has-text("Change")').click(); await settle(page, 300);
    await page.selectOption('#meTz', '');
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => {}), btn(page, '#modal', 'Save').click()]);
    await booted(page); await inApp(page); await settle(page, 1500);
    check('Time zone: back to Automatic', await page.evaluate(() => !TZ_FORCE));
    await settings(page);
    await card(page, 'Staff display').locator('button:has-text("Full names")').click(); await settle(page, 300);
    await card(page, 'Session').locator('select').selectOption('0'); await settle(page, 300);
    await page.evaluate(() => closeAll());
  }
  if (STOP <= 4) return finish();

  // ======================= 5. People: a client, staff, invites and joining =======================
  const S = await open();
  let sid = '', pid = '', link1 = '', link2 = '';
  {
    const page = D.page;
    // how-to 13: Add client, with the UCI rules
    await go(page, 'clients'); await btn(page, '#view', 'Add client').click(); await settle(page, 400);
    await page.fill('#clUci', '12345'); await btn(page, '#view', 'Save client').click(); await settle(page, 200);
    check('Add client: a UCI that is not 7 digits is refused', /7-digit/.test((await toastOf(page)).text));
    await page.fill('#clUci', UCI); await page.fill('#clAge', '44'); await page.selectOption('#clHome', 'Pine House');
    await btn(page, '#view', 'Save client').click(); await settle(page, 700);
    check('Add client: saved, then the second window offers a note, IPP goals or the weekly checklist', /Client created/.test(await modal(page)) && /progress note/.test(await page.evaluate(() => el('mdBody').innerText)), await modal(page));
    await page.evaluate(() => closeAll());
    await go(page, 'clients'); await btn(page, '#view', 'Add client').click(); await settle(page, 400);
    await page.fill('#clUci', UCI); await btn(page, '#view', 'Save client').click(); await settle(page, 300);
    check('Add client: a UCI already in use is refused', /already a client/.test((await toastOf(page)).text));
    await until(() => B.rows('np_demo_clients').some((c) => c.uci === UCI));
    // how-to 15: Add staff with an invite
    await go(page, 'team'); await btn(page, '#view', 'Add staff').click(); await settle(page, 400);
    await page.fill('#sfName', STF.name); await page.fill('#sfInit', 'O.D.'); await page.fill('#sfRole', STF.title);
    await page.selectOption('#sfHome', 'Pine House'); await page.fill('#sfHired', today); await page.fill('#sfEmail', STF.email);
    const r0 = B.relay.length;
    await btn(page, '#modal', 'Add staff member').click(); await settle(page, 1000);
    await until(() => B.relay.slice(r0).some((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite'));
    const st = B.rows('np_demo_staff').find((x) => x.email === STF.email) || {};
    sid = st.id;
    const inv1 = B.rows('np_demo_invites').find((x) => x.email === STF.email) || {};
    const mail = (B.relay.slice(r0).find((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite') || {}).payload || {};
    link1 = mail.link || '';
    check('Add staff (invite ticked): the invite email goes to them through the relay with the team, their name and role, and the one-time link', mail.to === STF.email && mail.org === DIR.org && mail.name === STF.name && mail.role === STF.title && link1 === env.BASE + '/portal.html?join=' + inv1.token && !mail.dir, JSON.stringify(mail).slice(0, 300));
    check('Add staff: the invite is saved for that email and their staff record', inv1.org_id === org && inv1.sid === sid && inv1.email === STF.email, JSON.stringify(inv1).slice(0, 200));
    // a second staff member with no sign-in
    await btn(page, '#view', 'Add staff').click(); await settle(page, 400);
    await page.fill('#sfName', 'Pat Quill'); await page.selectOption('#sfHome', 'Pine House'); await page.uncheck('#sfInvite');
    await btn(page, '#modal', 'Add staff member').click(); await settle(page, 800);
    await until(() => B.rows('np_demo_staff').some((x) => x.name === 'Pat Quill'));
    pid = (B.rows('np_demo_staff').find((x) => x.name === 'Pat Quill') || {}).id;
    // task categories: a task in Meds, then Meds renamed
    await go(page, 'tasks'); await btn(page, '#view', 'Assign task').click(); await settle(page, 300);
    await page.fill('#ntTitle', 'Order refills'); await page.selectOption('#ntWho', sid); await page.selectOption('#ntCat', 'Meds');
    await btn(page, '#modal', 'Assign task').click(); await settle(page, 600);
    await until(() => B.rows('np_demo_tasks').some((t) => t.title === 'Order refills'));
    await settings(page);
    await card(page, 'Lists').locator('button:has-text("Manage task categories")').click(); await settle(page, 300);
    await page.locator('#modal .lm-row:has-text("Meds") button:has-text("Rename")').click(); await settle(page, 200);
    await page.fill('#lmEdit', 'Medication'); await btn(page, '#modal', 'Save').click(); await settle(page, 1200);
    await page.evaluate(() => closeAll());
    // how-to 16: Invite someone already on the roster: Staff > their name > edit mode > Invite to the portal
    await go(page, 'team'); await page.locator('#view :text("' + STF.name + '")').first().click(); await settle(page, 500);
    check('the staff page has no Invite to the portal until edit mode is on', !(await page.locator('#view button:has-text("Invite to the portal")').count()));
    await page.locator('#view button.gear').first().click(); await settle(page, 300);
    await page.locator('#modal .set-tab:has-text("Editing tool")').click(); await settle(page, 200);
    await page.locator('#modal .set-row:has-text("Edit this page")').click(); await settle(page, 500);
    await btn(page, '#view', 'Invite to the portal').click(); await settle(page, 300);
    check('Invite to the portal: their work email is filled in', (await page.inputValue('#ivEmail')) === STF.email);
    await btn(page, '#modal', 'Create invite link').click(); await settle(page, 700);
    link2 = await page.inputValue('#ivLink').catch(() => '');
    const iv2 = B.rows('np_demo_invites').filter((x) => x.email === STF.email).pop() || {};
    check('Create invite link: Invite link ready, with the link for a new saved invite', /Invite link ready/.test(await modal(page)) && link2 === env.BASE + '/portal.html?join=' + iv2.token && link2 !== link1, link2);
    await btn(page, '#modal', 'Copy link').click(); await settle(page, 200);
    check('Copy link: the link is selected and the director is told it is copied', /Link copied/.test((await toastOf(page)).text) && await page.evaluate(() => document.activeElement === el('ivLink') || window.getSelection().toString().includes('?join=')));
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('#mdBody a')].map((a) => ({ t: a.textContent.trim(), h: a.href })));
    const gm = hrefs.find((a) => /Gmail draft/.test(a.t)) || {}, ma = hrefs.find((a) => /Mail app/.test(a.t)) || {};
    check('Gmail draft and Mail app: addressed to them, with the link in the body', /mail\.google\.com/.test(gm.h || '') && decodeURIComponent(gm.h).includes('to=' + STF.email) && decodeURIComponent(gm.h).includes(link2) && /^mailto:/.test(ma.h || '') && decodeURIComponent(ma.h).includes(link2), JSON.stringify(hrefs).slice(0, 300));
    const r1 = B.relay.length;
    await btn(page, '#modal', 'Email the invite now').click(); await settle(page, 700);
    const m2 = ((B.relay.slice(r1).find((r) => r.action === 'email') || {}).payload) || {};
    check('Email the invite now: sent through the relay with that link', m2.kind === 'invite' && m2.to === STF.email && m2.link === link2 && /Invite emailed/.test((await toastOf(page)).text), JSON.stringify(m2).slice(0, 200));
    await page.evaluate(() => closeAll());
    // an invite that cannot be saved
    hooks.failInvites = true;
    await btn(page, '#view', 'Invite to the portal').click(); await settle(page, 300);
    await btn(page, '#modal', 'Create invite link').click(); await settle(page, 900);
    const failed = { title: await modal(page), toast: await toastOf(page), warn: await page.evaluate(() => getComputedStyle(el('sbWarn')).display !== 'none') };
    check('Invite to the portal: when the invite cannot be saved, no "Invite link ready" with a link that will not work (Add staff already says so)', !/Invite link ready/.test(failed.title), JSON.stringify(failed));
    check('a save that fails puts up the red ! button (Something did not save)', failed.warn);
    hooks.failInvites = false;
    await page.evaluate(() => closeAll());
    await page.evaluate(() => { state.layoutEdit = false; render(); });
  }
  {
    // a link that is not an invite, then the right link with the wrong email
    const W = await open();
    const w = W.page;
    await w.goto(env.BASE + '/portal.html?join=not-a-real-token', { waitUntil: 'load' }); await booted(w); await settle(w, 600);
    check('an unknown invite link: the sign-in page, "not valid — ask your director for a new one"', /not valid/.test((await toastOf(w)).text) && (await loginState(w)).title === 'Welcome back');
    await w.goto(link1, { waitUntil: 'load' }); await booted(w);
    await w.waitForFunction(() => /Join/.test(el('loginTitle').textContent), null, { timeout: 15000 }).catch(() => {});
    const j = await w.evaluate(() => ({ title: el('loginTitle').textContent, email: el('liEmail').value, sub: el('loginSub').innerText, go: el('liGo').innerText }));
    check('the invite link opens "Join Willow Care", their email filled in, naming them and their role', j.title === 'Join Willow Care' && j.email === STF.email && /Omar Diaz/.test(j.sub) && /Direct Support Professional/.test(j.sub) && /Join Willow Care/.test(j.go), JSON.stringify(j));
    await w.fill('#liEmail', 'stranger@other.test'); await w.fill('#liPw', 'stranger-pass-1'); await w.click('#liGo'); await settle(w, 2500);
    const wt = await toastOf(w);
    const su = B.users.find((x) => x.email === 'stranger@other.test');
    check('a different email cannot use the invite: told it was sent to their address, not joined, the invite still unused', /sent to omar@willow\.test/.test(wt.text) && (!su || !B.members.some((m) => m.user_id === su.id && m.org_id === org)) && !B.rows('np_demo_invites').find((x) => x.token === link1.split('join=')[1]).used_at, JSON.stringify(wt));
    await W.ctx.close();
    // Omar joins from the emailed link (how-to 2)
    const sp = S.page;
    await sp.goto(link1, { waitUntil: 'load' }); await booted(sp);
    await sp.waitForFunction(() => /Join/.test(el('loginTitle').textContent), null, { timeout: 15000 }).catch(() => {});
    await sp.fill('#liPw', STF.pw); await sp.click('#liGo');
    await sp.waitForFunction(() => typeof state !== 'undefined' && state.role === 'staff' && el('app').classList.contains('on'), null, { timeout: 20000 }).catch(() => {});
    await settle(sp, 1500);
    const g = await sp.evaluate(() => ({ lock: !!window._gateLock, user: !!window._pgUser, agencyShown: el('pgAgency') ? getComputedStyle(el('pgAgency').closest('.row2')).display !== 'none' : false, name: (el('pgName') || {}).value }));
    check('joined: the agreement asks them to accept as a user (no legal entity or license boxes)', g.lock && g.user && !g.agencyShown, JSON.stringify(g));
    await signPilot(sp, { name: STF.name, title: STF.title });
    const me = await sp.evaluate(() => ({ role: state.role, team: agencyName(), me: el('suName').textContent, url: location.search, nav: [...document.querySelectorAll('#nav .nav-item')].map((b) => [...b.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim()) }));
    check('joined: they land in Willow Care with the staff role, as themselves, the token gone from the address', me.role === 'staff' && me.team === DIR.org && me.me === STF.name && me.url === '', JSON.stringify(me));
    check('staff menu is the guide\'s: My shift, My tasks, Calendar, Clients, Safety log, Accountability', me.nav.join('|') === 'My shift|My tasks|Calendar|Clients|Safety log|Accountability', me.nav.join('|'));
    await until(() => (((B.prog(org, 'pilot') || {}).signatures || {})['u:' + STF.email]));
    const ps = ((B.prog(org, 'pilot') || {}).signatures || {})['u:' + STF.email] || {};
    check('joined: their acceptance is saved as a user of the team\'s pilot, beside the director\'s signature', ps.user === true && ps.by === STF.name && !!((B.prog(org, 'pilot') || {}).signatures || {})['u:' + DIR.email], JSON.stringify(ps));
    // the used link again
    const U = await open();
    await U.page.goto(link1, { waitUntil: 'load' }); await booted(U.page); await settle(U.page, 800);
    const ul = await loginState(U.page);
    check('a used invite link: "already used — just sign in", on the sign-in page with their email filled in', /already used/.test((await toastOf(U.page)).text) && ul.title === 'Welcome back' && ul.email === STF.email, JSON.stringify(ul));
    await U.ctx.close();
  }
  {
    // how-to 17: Invite another director
    const page = D.page;
    await settings(page);
    await card(page, 'Team access').locator('button:has-text("Invite a director")').click(); await settle(page, 300);
    await page.fill('#idName', DIR2.name); await page.fill('#idEmail', 'not-an-email'); await page.click('#idGo'); await settle(page, 200);
    check('Invite a director: a bad email is refused', /valid email/.test((await toastOf(page)).text));
    await page.fill('#idEmail', DIR2.email); await page.fill('#idTitle', DIR2.title); await page.click('#idGo'); await settle(page, 800);
    const dl = await page.inputValue('#ivLink').catch(() => '');
    const r2 = B.relay.length;
    await btn(page, '#modal', 'Email the invite now').click(); await settle(page, 700);
    const dm = ((B.relay.slice(r2).find((r) => r.action === 'email') || {}).payload) || {};
    check('Invite a director: the invite email says director, to them, with the link', dm.kind === 'invite' && dm.to === DIR2.email && dm.dir === true && dm.name === DIR2.name && dm.link === dl && !!dl, JSON.stringify(dm).slice(0, 300));
    await page.evaluate(() => closeAll());
    const I = await open();
    const ip = I.page;
    await ip.goto(dl, { waitUntil: 'load' }); await booted(ip);
    await ip.waitForFunction(() => /Join/.test(el('loginTitle').textContent), null, { timeout: 15000 }).catch(() => {});
    await ip.fill('#liPw', DIR2.pw); await ip.click('#liGo');
    await ip.waitForFunction(() => typeof state !== 'undefined' && state.role === 'director' && el('app').classList.contains('on'), null, { timeout: 20000 }).catch(() => {});
    await settle(ip, 1500);
    const ig = await ip.evaluate(() => ({ role: state.role, lock: !!window._gateLock, user: !!window._pgUser }));
    await signPilot(ip, { name: DIR2.name, title: DIR2.title });
    const iu = B.users.find((x) => x.email === DIR2.email);
    check('the invited director joins Willow Care as a director (membership and view)', ig.role === 'director' && B.members.some((m) => iu && m.user_id === iu.id && m.org_id === org && m.role === 'director'), JSON.stringify(ig));
    check('the invited director accepts the agreement as a user, not as the team\'s signer', ig.lock && ig.user, JSON.stringify(ig));
    await settings(ip);
    const ta = await card(ip, 'Team access').innerText();
    check('their Team access lists Nora, Omar and themselves; Remove only beside staff', /Nora Q\. Lane/.test(ta) && /Omar Diaz/.test(ta) && /Ida Moss/.test(ta) && (await card(ip, 'Team access').locator('button:has-text("Remove")').count()) === 1, ta.replace(/\s+/g, ' ').slice(0, 300));
    check('Run setup again is only for the director who set up the team (not in the invited director\'s Notifications card)', !(await card(ip, 'Notifications').locator('button:has-text("Run setup again")').count()));
    await I.ctx.close();
  }
  {
    // the director sees the renamed task category on the task after a reload
    const page = D.page;
    await reload(page);
    const tc = await page.evaluate(() => ({ cats: TASK_CATS.slice(), task: (TASKS.find((t) => t.title === 'Order refills') || {}).cat }));
    const row = B.rows('np_demo_tasks').find((t) => t.title === 'Order refills') || {};
    check('Lists > Manage task categories > Rename ("Renaming updates existing tasks"): the task in Meds is in Medication after a reload', tc.task === 'Medication', JSON.stringify({ inPage: tc.task, saved: row.category, cats: tc.cats }));
  }
  {
    // renaming a house moves everyone in it (gear > Display settings > Houses > the house)
    const page = D.page;
    await go(page, 'calendar');
    await page.evaluate(() => closeAll()); await page.locator('#view button.gear').first().click(); await settle(page, 300);
    await page.locator('#modal .set-tab:has-text("Display settings")').click(); await settle(page, 200);
    await page.locator('#modal .gp-row:has-text("Pine House")').click(); await settle(page, 300);
    await page.fill('#gpName', 'Pine Lodge'); await page.locator('#mdFoot button:has-text("Save")').last().click(); await settle(page, 1200);
    await page.evaluate(() => closeAll());
    await reload(page);
    const hm = { homes: await page.evaluate(() => HOMES.slice()), client: (B.rows('np_demo_clients').find((c) => c.uci === UCI) || {}).home, staff: (B.rows('np_demo_staff').find((x) => x.id === sid) || {}).home };
    check('renaming a house saves it for everyone in it: the client and staff records move to Pine Lodge', hm.homes.includes('Pine Lodge') && !hm.homes.includes('Pine House') && hm.client === 'Pine Lodge' && hm.staff === 'Pine Lodge', JSON.stringify(hm));
  }
  if (STOP <= 5) return finish();

  // ======================= 6. Roles: what staff and family can reach =======================
  {
    const sp = S.page;
    await reload(sp);
    await settings(sp);
    const sc = await sp.evaluate(() => [...document.querySelectorAll('#drawer section.card')].filter((s) => s.offsetParent).map((s) => (s.querySelector('h2') || {}).textContent));
    const dirOnly = ['Team access', 'Demo vs. Development', 'Workspace data', 'Lists', 'Demonstration view', 'Colors', 'Names', 'Certification reminders', 'Staff display', 'Switch view'];
    check('staff Settings: Profile, Security, Notifications, Session and the signed agreement, none of the director\'s cards', ['Profile', 'Security', 'Notifications', 'Session', 'Signed agreement'].every((c) => sc.includes(c)) && !dirOnly.some((c) => sc.includes(c)), sc.join(', '));
    await card(sp, 'Notifications').locator('button:has-text("What reaches me")').click(); await settle(sp, 300);
    check('staff: Notifications > What reaches me shows their own, not the team settings', (await modal(sp)) === 'Your notifications');
    await sp.evaluate(() => { closeAll(); notifSettings('rem'); }); await settle(sp, 200);
    check('staff: the team Notification settings cannot be opened (it shows theirs instead)', (await modal(sp)) === 'Your notifications');
    await sp.evaluate(() => { closeAll(); setMode('demo'); }); await settle(sp, 300);
    check('staff: Demo vs. Development cannot be switched', /Only a director/.test((await toastOf(sp)).text) && await sp.evaluate(() => state.hideSample === true));
    // the gear, for staff: only on Calendar, only Calendar integrations
    await go(sp, 'calendar');
    await sp.locator('#view button.gear').first().click(); await settle(sp, 300);
    const stabs = await sp.evaluate(() => [...document.querySelectorAll('#modal .set-tab')].map((b) => b.textContent.trim()));
    check('staff: the Calendar gear opens Settings with Calendar integrations only', (await modal(sp)) === 'Settings' && stabs.join('|') === 'Calendar integrations', stabs.join('|'));
    await sp.evaluate(() => closeAll());
    // pages limited to the director, opened directly
    const pages = { directory: 'Directory', changelog: 'Change log', team: 'Staff', trainhub: 'Training & onboarding', forms: 'Templates', templates: 'Documents', newclient: 'Add a client' };
    const res = {};
    for (const v of Object.keys(pages)) {
      await go(sp, v);
      res[v] = await sp.evaluate(() => ({ text: el('view').innerText.slice(0, 600), btns: [...el('view').querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()) }));
    }
    check('staff opening Directory or Change log directly: "limited to the director"', /limited to the director/.test(res.directory.text) && /limited to the director/.test(res.changelog.text));
    const leaked = ['team', 'trainhub', 'forms', 'templates', 'newclient'].filter((v) => !/limited to the director|Available to the director/.test(res[v].text));
    check('staff opening a director page directly (go(\'team\'), go(\'trainhub\'), go(\'forms\'), go(\'templates\'), go(\'newclient\')) is refused like Directory', !leaked.length, leaked.map((v) => v + ': ' + res[v].btns.filter((b) => /Add|New|Upload|Create|Assign|Save/.test(b)).slice(0, 4).join(', ')).join(' | '));
    // Ask Spectrum's page buttons, as staff: its instructions offer [go:staff] and [go:documents] to everyone
    ASK_REPLY = 'The staff list is on the Staff page [go:staff] and forms are under Documents [go:documents].';
    await go(sp, 'home');
    await sp.evaluate(() => { if (!el('askPanel').classList.contains('on')) toggleAsk(); });
    await sp.fill('#askInput', 'Where do I find the staff list?'); await sp.press('#askInput', 'Enter');
    const gotGo = await sp.waitForFunction(() => /Go to Staff/.test((el('askLog') || {}).innerText || ''), null, { timeout: 15000 }).then(() => true).catch(() => false);
    let askLand = null;
    if (gotGo) {
      await sp.locator('#askLog .msg.bot button:has-text("Go to Staff")').last().click(); await settle(sp, 500);
      askLand = await sp.evaluate(() => ({ view: state.view, btns: [...el('view').querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()).filter((t) => /Add staff|Add shift/.test(t)) }));
    }
    check('staff: Ask Spectrum\'s "Go to Staff" button does not open the director\'s Staff page (roster, Add staff)', !askLand || askLand.view !== 'team', JSON.stringify(askLand));
    await sp.evaluate(() => { closeAll(); if (el('askPanel').classList.contains('on')) toggleAsk(); });
    ASK_REPLY = 'Okay.';
    // search, as staff
    await go(sp, 'home');
    await sp.click('#globalSearch'); await sp.fill('#globalSearch', 'Pat'); await settle(sp, 800);
    const sr = await sp.evaluate(() => ({ on: el('drawer').classList.contains('on') && el('drTitle').textContent === 'Search results', staff: [...document.querySelectorAll('#drawer .attn b')].map((b) => b.textContent) }));
    let page2 = null;
    if (sr.on && sr.staff.includes('Pat Quill')) {
      await sp.locator('#drawer .attn:has-text("Pat Quill")').click(); await settle(sp, 500);
      page2 = await sp.evaluate(() => ({ view: state.view, text: el('view').innerText.slice(0, 400), btns: [...el('view').querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()) }));
    }
    await shot(sp, 'staff-search-opens-staff-page');
    check('staff searching a teammate\'s name do not land on that person\'s staff page (a director page: certifications, client access, Send reminder, Add credential)', !page2 || page2.view !== 'staffpage', JSON.stringify(page2 && { view: page2.view, btns: page2.btns.slice(0, 8) }));
    if (page2 && page2.view === 'staffpage') {
      await btn(sp, '#view', 'Add credential').click(); await settle(sp, 300);
      await sp.fill('#crName', 'Added by a teammate'); await btn(sp, '#modal', 'Save').click(); await settle(sp, 900);
    }
    check('staff cannot add a credential to a teammate\'s staff record', !B.rows('np_demo_credentials').some((x) => x.sid === pid && x.cred_name === 'Added by a teammate'), JSON.stringify(B.rows('np_demo_credentials').filter((x) => x.sid === pid)).slice(0, 200));
    // how-to 21: staff add their own certification on their profile; the director sees it on their staff page
    await go(sp, 'profile');
    const ptabs = await sp.evaluate(() => [...document.querySelectorAll('#view .tabs button')].map((b) => b.textContent.trim()));
    check('staff profile tabs: Credentials, and Onboarding with their progress (shared when they were added)', ptabs[0] === 'Credentials' && /^Onboarding · 0 of \d+$/.test(ptabs[1] || ''), ptabs.join(' | '));
    await btn(sp, '#view', 'Add credential').click(); await settle(sp, 300);
    await sp.fill('#myCrName', 'Med administration'); await sp.fill('#myCrExp', new Date(Date.now() + 300 * 864e5).toISOString().slice(0, 10));
    await btn(sp, '#modal', 'Save').click(); await settle(sp, 800);
    await until(() => B.rows('np_demo_credentials').some((x) => x.sid === sid && x.cred_name === 'Med administration'));
    await reload(D.page); await D.page.evaluate((s) => openStaffPage(s), sid); await settle(D.page, 500);
    check('staff add their own credential on their profile; the director sees it on their staff page after a reload', B.rows('np_demo_credentials').some((x) => x.sid === sid && x.org_id === org && x.cred_name === 'Med administration') && /Med administration/.test(await D.page.evaluate(() => el('view').innerText)));
    // how-to 19: Client access, Only these clients
    const dp = D.page;
    await btn(dp, '#view', 'Client access').click(); await settle(dp, 300);
    await dp.check('#modal input[name=acMode][value=some]'); await dp.locator('#modal .acC').first().uncheck(); await btn(dp, '#modal', 'Save access').click(); await settle(dp, 300);
    check('Client access: "Only these clients" with none ticked is refused', /Pick at least one client/.test((await toastOf(dp)).text));
    await dp.evaluate(() => closeAll());
    // the team's calendars: one only for listed staff (gear > Calendar integrations > the calendar > Who sees it; v12.46, was Access)
    await go(dp, 'calendar');
    await dp.evaluate(() => closeAll()); await dp.locator('#view button.gear').first().click(); await settle(dp, 300);
    await dp.locator('#modal .set-tab:has-text("Calendar integrations")').click(); await settle(dp, 200);
    await dp.locator('#modal .gp-row:has-text("Day program")').first().click(); await settle(dp, 300);
    await dp.check('#modal input[name="gpWho"][value="listed"]'); await dp.locator('#gpWhoL input[type=checkbox]').evaluateAll((xs) => xs.forEach((x) => { if (x.checked) x.click(); }));
    await dp.locator('#mdFoot .btn.navy').click(); await settle(dp, 1200);
    await reload(sp);
    const c1 = await sp.evaluate(() => calDefs().map((c) => c.name));
    check('calendar access: a calendar for listed staff only is hidden from staff not on the list (after a reload)', !c1.includes('Day program') && await dp.evaluate(() => calDefs().some((c) => c.name === 'Day program')), c1.join(', '));
    await dp.evaluate(() => closeAll()); await dp.locator('#view button.gear').first().click(); await settle(dp, 300);
    await dp.locator('#modal .set-tab:has-text("Calendar integrations")').click(); await settle(dp, 200);
    await dp.locator('#modal .gp-row:has-text("Day program")').first().click(); await settle(dp, 300);
    await dp.locator('#gpWhoL input[type=checkbox][value="' + sid + '"]').check();
    await dp.locator('#mdFoot .btn.navy').click(); await settle(dp, 1200);
    await reload(sp);
    check('...and shown once they are ticked', await sp.evaluate(() => calDefs().some((c) => c.name === 'Day program')));
    // Staff display: Initials only, for the whole team
    await settings(dp);
    await card(dp, 'Staff display').locator('button:has-text("Initials only")').click(); await settle(dp, 800);
    await dp.evaluate(() => closeAll()); await go(dp, 'team');
    const rosterI = await dp.evaluate(() => el('view').innerText);
    await reload(sp); await go(sp, 'messages');
    const msgI = await sp.evaluate(() => (el('msgTeam') || el('view')).innerText);
    check('Staff display > Initials only: the Staff roster shows O.D. instead of the full name', /O\.D\./.test(rosterI) && !/Omar Diaz/.test(rosterI), rosterI.replace(/\s+/g, ' ').slice(0, 200));
    check('Staff display > Initials only ("how staff names appear across the whole dashboard") also reaches the Messages team list staff see (it still shows Pat Quill, Ida Moss in full)', !/Pat Quill/.test(msgI), msgI.replace(/\s+/g, ' ').slice(0, 160));
    await settings(dp);
    await card(dp, 'Staff display').locator('button:has-text("Full names")').click(); await settle(dp, 800);
    await dp.evaluate(() => closeAll());
    await sp.fill('#globalSearch', ''); await sp.evaluate(() => closeAll());
  }
  {
    // the director previews the staff and family views (how-to 8)
    const page = D.page;
    await settings(page);
    await card(page, 'Switch view').locator('button:has-text("Switch view")').click(); await settle(page, 400);
    const pick = await page.evaluate(() => ({ title: el('loginTitle').textContent, cards: [...document.querySelectorAll('#roleGrid .role-card')].filter((c) => c.offsetParent).map((c) => c.querySelector('h3').textContent.trim()) }));
    check('Switch view opens the view picker with Director, Care staff and Family member', pick.cards.join('|') === 'Director|Care staff|Family member', JSON.stringify(pick));
    const famCard = await page.evaluate(() => (document.querySelectorAll('#roleGrid .role-card')[2] || {}).innerText || '');
    check('the Family member card does not promise "their medications" (medication records were removed from the portal)', !/medication/i.test(famCard), famCard.replace(/\s+/g, ' '));
    await page.locator('#roleGrid .role-card:has(h3:text-is("Care staff"))').click(); await settle(page, 800);
    const pv = await page.evaluate(() => ({ role: state.role, nav: [...document.querySelectorAll('#nav .nav-item')].map((b) => [...b.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim()) }));
    check('previewing Care staff shows the staff menu', pv.role === 'staff' && pv.nav[0] === 'My shift', JSON.stringify(pv));
    const n0 = B.rows('np_demo_tasks').length;
    await go(page, 'tasks'); await btn(page, '#view', 'Add task').click(); await settle(page, 300);
    await page.fill('#ntTitle', 'Preview task'); await btn(page, '#modal', 'Add task').click(); await settle(page, 600);
    check('previewing: Add task says "You are previewing" and saves nothing', /You are previewing/.test((await toastOf(page)).text) && B.rows('np_demo_tasks').length === n0, (await toastOf(page)).text);
    await page.evaluate(() => closeAll());
    // something else that saves, in the staff preview: a progress note on the client
    const cid = await page.evaluate((u) => (CLIENTS.find((c) => c.uci === u) || {}).id, UCI);
    await page.evaluate((c) => { closeAll(); openClient(c); }, cid); await settle(page, 500);
    await btn(page, '#view', 'Write note').click(); await settle(page, 300);
    await page.fill('#pnNew', 'Written while previewing the staff view.'); await btn(page, '#modal', 'Save note').click(); await settle(page, 1200);
    const pnSaved = () => JSON.stringify(((B.prog(org, 'prognotes') || {}).map || {})[cid] || []);
    await until(() => /previewing the staff view/.test(pnSaved()), 2500);
    const pn = { toast: await toastOf(page), saved: pnSaved() };
    const guide = require('fs').readFileSync(require('path').join(__dirname, '..', 'docs', 'np-portal-guide.md'), 'utf8');
    check('previewing: a progress note written in the staff preview is saved under the director\'s own name, never the sample staff member\'s, and the guide says so (it said anything that would save stops)', /previewing the staff view/.test(pn.saved) && !/Maria Reyes|M\.R\./.test(pn.saved) && !/anything that would save says/.test(guide) && /saved under your own name/.test(guide), JSON.stringify({ toast: pn.toast.text, saved: pn.saved.slice(0, 160) }));
    await page.evaluate(() => closeAll());
    await page.evaluate(() => switchView()); await settle(page, 300);
    await page.locator('#roleGrid .role-card:has(h3:text-is("Family member"))').click(); await settle(page, 800);
    const fv = await page.evaluate(() => ({ role: state.role, text: el('view').innerText.slice(0, 300) }));
    check('previewing Family member in Development: "Nothing to show yet" with Back to the director view', fv.role === 'family' && /Nothing to show yet/.test(fv.text), JSON.stringify(fv));
    await btn(page, '#view', 'Back to the director view').click(); await settle(page, 800);
    check('Back to the director view returns to the director view', await page.evaluate(() => state.role === 'director'));
  }
  if (STOP <= 6) return finish();

  // ======================= 7. Demo vs. Development and the demo view =======================
  {
    const page = D.page, sp = S.page;
    await settings(page);
    await card(page, 'Demo vs. Development').locator('button.mode-opt:has-text("Demo")').click(); await settle(page, 1200);
    await page.evaluate(() => closeAll());
    await reload(sp);
    const sb = await sp.evaluate(() => ({ on: getComputedStyle(el('modeBanner')).display !== 'none', text: el('modeBanner').innerText, hide: state.hideSample }));
    check('Demo, switched by the director: staff see the Demo banner after a reload, telling them a director can switch', sb.on && /sample data, not real/.test(sb.text) && /A director can switch/.test(sb.text) && sb.hide === false, JSON.stringify(sb));
    await reload(page);
    await page.locator('#modeBanner a:has-text("Switch to Development")').click(); await settle(page, 500);
    check('the banner\'s Switch to Development opens Settings at the Demo vs. Development card', await page.evaluate(() => el('drawer').classList.contains('on') && !!el('modeCard')));
    await card(page, 'Demo vs. Development').locator('button.mode-opt:has-text("Development")').click(); await settle(page, 1200);
    await page.evaluate(() => closeAll());
    await reload(sp);
    check('Development again: the staff banner is gone after a reload, and nothing of the team was deleted', await sp.evaluate(() => getComputedStyle(el('modeBanner')).display === 'none' && state.hideSample === true) && B.rows('np_demo_clients').some((c) => c.uci === UCI) && B.rows('np_demo_staff').length === 2);
    // how-to 7: the demonstration view
    await settings(page);
    await card(page, 'Demonstration view').locator('button:has-text("Open the demo dashboard")').click(); await settle(page, 300);
    const op = await page.evaluate(() => window.__opened.slice(-1)[0] || '');
    check('Demonstration view opens ?demo=1 in a new tab', /\/portal\.html\?demo=1$/.test(op), op);
    await page.evaluate(() => closeAll());
    const Q = await open();
    const qp = Q.page;
    await qp.goto(op || env.BASE + '/portal.html?demo=1', { waitUntil: 'load' }); await booted(qp); await settle(qp, 800);
    const dv = await qp.evaluate(() => ({ app: el('app').classList.contains('on'), banner: getComputedStyle(el('demoBanner')).display !== 'none', gate: !!window._gateLock, clients: visibleClients().length }));
    check('the demo view: no sign-in, no agreement, sample data, its own banner', dv.app && dv.banner && !dv.gate && dv.clients > 0, JSON.stringify(dv));
    await qp.evaluate(() => { closeAll(); openSettings(); }); await settle(qp, 300);
    await qp.locator('#drawer section:has(h2:text-is("Switch view")) button').click(); await settle(qp, 400);
    await qp.locator('#roleGrid .role-card:has(h3:text-is("Care staff"))').click(); await settle(qp, 600);
    const dstaff = await qp.evaluate(() => [...document.querySelectorAll('#nav .nav-item')].map((b) => [...b.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim()).join('|'));
    await qp.evaluate(() => switchView()); await settle(qp, 300);
    await qp.locator('#roleGrid .role-card:has(h3:text-is("Family member"))').click(); await settle(qp, 600);
    const dfam = await qp.evaluate(() => [...document.querySelectorAll('#nav .nav-item')].map((b) => [...b.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim()).join('|'));
    const famIcons = await qp.evaluate(() => [...document.querySelectorAll('#nav .nav-item')].map((b) => [...b.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim() + ':' + (b.querySelector('.ni svg') ? 'icon' : JSON.stringify(b.querySelector('.ni').textContent))));
    check('every family menu item has a drawn icon like the rest of the portal (Documents shows a plain ▤ character)', famIcons.every((x) => /:icon$/.test(x)), famIcons.join(', '));
    check('the demo view\'s Switch view shows the staff and family menus the guide lists', dstaff === 'My shift|My tasks|Calendar|Clients|Safety log|Accountability' && dfam === 'Overview|Appointments|Documents|Messages', dstaff + ' / ' + dfam);
    const n0 = B.log.length;
    await qp.evaluate(() => signIn('director')); await go(qp, 'clients');
    await qp.evaluate(() => { const c = visibleClients()[0]; if (c) delClient(c.id); }); await settle(qp, 200);
    await qp.locator('#mdFoot button.danger').click().catch(() => {}); await settle(qp, 500);
    const gone = await qp.evaluate(() => visibleClients().length);
    await qp.reload({ waitUntil: 'load' }); await booted(qp); await settle(qp, 800);
    check('the demo view saves nothing ("every visit starts from the original sample data"): a client deleted there is back after reloading the tab (nothing reached the database)', (await qp.evaluate(() => visibleClients().length)) === dv.clients && gone === dv.clients - 1 && !B.log.slice(n0).some((x) => x.t !== 'auth'), JSON.stringify({ before: dv.clients, afterDelete: gone, afterReload: await qp.evaluate(() => visibleClients().length), log: B.log.slice(n0).length }));
    await Q.ctx.close();
  }
  if (STOP <= 7) return finish();

  // ======================= 8. Customize your home page: per person, and the team default =======================
  {
    const page = D.page, sp = S.page;
    const look = (p) => p.evaluate(() => { const r = document.querySelector('#view .hm'); return { look: r ? r.className : '', sched: (document.querySelector('#view [data-sched]') || {}).dataset ? document.querySelector('#view [data-sched]').dataset.sched : '' }; });
    await go(page, 'home');
    await page.click('#view button[aria-label="Customize your home page"]'); await settle(page, 300);
    const tg = await page.evaluate(() => [...document.querySelectorAll('.hm-tgt .set-tab')].map((b) => b.textContent.trim()).join('|'));
    check('Customize your home page (director): Your home page, then the team default for Directors, Staff, Families', tg === 'Your home page|Directors|Staff|Families', tg);
    await page.click('.hm-tgt .set-tab:has-text("Staff")'); await settle(page, 200);
    await page.click('.hm-opt:has-text("Bold overview")'); await page.click('.hm-opt:has-text("Timeline")');
    await page.click('#mdFoot button:has-text("Save the default for staff")'); await settle(page, 1200);
    await until(() => ((B.prog(org, 'homedefault') || {}).staff || {}).look === 'b');
    check('the team default for staff is saved for the team', ((B.prog(org, 'homedefault') || {}).staff || {}).look === 'b', JSON.stringify(B.prog(org, 'homedefault')));
    check('the director\'s own home page is unchanged (Clear agenda)', /\bhm-a\b/.test((await look(page)).look), (await look(page)).look);
    await reload(sp); await go(sp, 'home');
    check('staff with no layout of their own get the team default after a reload (Bold overview)', /\bhm-b\b/.test((await look(sp)).look), (await look(sp)).look);
    await sp.click('#view button[aria-label="Customize your home page"]'); await settle(sp, 300);
    check('staff cannot set the team default', !(await sp.$('.hm-tgt')));
    await sp.click('.hm-opt:has-text("Clear agenda")'); await sp.click('#mdFoot button:has-text("Save")'); await settle(sp, 1500);
    await reload(sp); await go(sp, 'home');
    check('staff\'s own layout wins over the default, after a reload (Clear agenda)', /\bhm-a\b/.test((await look(sp)).look), (await look(sp)).look);
    await reload(page); await go(page, 'home');
    check('the director\'s home page is still their own after a reload', /\bhm-a\b/.test((await look(page)).look));
  }
  if (STOP <= 8) return finish();

  // ======================= 9. The tour, Help and support, search =======================
  {
    const page = D.page;
    await go(page, 'home');
    await btn(page, '#view', 'Show me around').click(); await settle(page, 500);
    const t1 = await page.evaluate(() => (el('tourCard') || {}).innerText || '');
    await page.locator('#tourCard button:has-text("Next")').click(); await settle(page, 300);
    const t2 = await page.evaluate(() => (el('tourCard') || {}).innerText || '');
    check('Show me around: a guided tour, step by step', /Step 1 of \d+/i.test(t1) && /Step 2 of \d+/i.test(t2), t1.slice(0, 80) + ' / ' + t2.slice(0, 80));
    await page.locator('#tourCard .tc-skip').click(); await settle(page, 200);
    check('Skip tour ends it', await page.evaluate(() => !el('tourCard')));
    await page.locator('.topbar button[aria-label="Help and support"]').click(); await settle(page, 300);
    const hs = await page.evaluate(() => ({ title: el('mdTitle').innerText, body: el('mdBody').innerText }));
    check('Help and support (the ? button): write to support@aiparagonconsulting.com, by Gmail, mail app or copying the address', /Help/.test(hs.title) && /support@aiparagonconsulting\.com/.test(hs.body) && /Gmail/.test(hs.body) && /Copy the address/.test(hs.body), JSON.stringify(hs).slice(0, 200));
    await btn(page, '#modal', 'Gmail').click(); await settle(page, 200);
    check('Help and support > Gmail opens a message to support', /mail\.google\.com.*to=support@aiparagonconsulting\.com/.test(await page.evaluate(() => window.__opened.slice(-1)[0] || '')));
    await page.evaluate(() => closeAll());
    await page.locator('.side-foot a:has-text("Help and support")').click(); await settle(page, 200);
    check('the sidebar footer\'s Help and support opens the same window', /Help/.test(await modal(page)));
    await page.evaluate(() => { closeAll(); document.activeElement && document.activeElement.blur(); });
    await page.keyboard.press('/'); await settle(page, 200);
    check('pressing / jumps to the search box', await page.evaluate(() => document.activeElement === el('globalSearch')));
    await page.keyboard.type(UCI.slice(0, 5)); await settle(page, 800);
    const s1 = await page.evaluate(() => ({ on: el('drawer').classList.contains('on'), t: el('drawer').innerText }));
    check('search by UCI finds the client', s1.on && /Clients/.test(s1.t) && s1.t.includes(UCI), s1.t.slice(0, 200));
    await page.locator('#drawer .attn').first().click(); await settle(page, 500);
    check('a client result opens the client', await page.evaluate((u) => !!state.client && (client(state.client) || {}).uci === u, UCI));
    await page.fill('#globalSearch', 'omar'); await settle(page, 800);
    const s2 = await page.evaluate(() => el('drawer').classList.contains('on') ? el('drawer').innerText : '');
    check('search finds staff by name (any case), for the director', /Staff/.test(s2) && /Omar Diaz/.test(s2), s2.slice(0, 200));
    await page.evaluate(() => closeAll());
    await page.fill('#globalSearch', 'zzqq'); await settle(page, 800);
    const s3 = await page.evaluate(() => ({ drawer: el('drawer').classList.contains('on'), toast: el('toast').classList.contains('on') ? el('toastTxt').textContent : '' }));
    check('a search with no match says so (it used to show nothing at all, so it looked broken)', s3.drawer || /no match|nothing matches|nothing found|no results/i.test(s3.toast), JSON.stringify(s3));
    await page.fill('#globalSearch', ''); await page.evaluate(() => closeAll());
  }
  if (STOP <= 9) return finish();

  // ======================= 10. Erase all data, then Restore sample data =======================
  {
    const page = D.page, sp = S.page;
    const keysBefore = B.program.filter((r) => r.org_id === org).map((r) => r.key).sort();
    const agBefore = B.rows('np_demo_agreements').filter((x) => x.org_id === org).length;
    await settings(page);
    await card(page, 'Workspace data').locator('button:has-text("Erase all data")').click(); await settle(page, 300);
    const ask = await page.evaluate(() => ({ title: el('mdTitle').innerText, body: el('mdBody').innerText }));
    check('Erase all data asks first, saying what goes and what is kept', /Erase all workspace data/.test(ask.title) && /cannot be undone/i.test(ask.body) && /signed agreement are kept/.test(ask.body), JSON.stringify(ask).slice(0, 200));
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => {}), page.locator('#mdFoot button:has-text("Erase everything")').click()]);
    await booted(page); await inApp(page); await settle(page, 2000);
    const keysAfter = B.program.filter((r) => r.org_id === org).map((r) => r.key).sort();
    const kept = ['org', 'email', 'pilot', 'users', 'usersettings'];
    check('after Erase: the team, contact email, signatures, team list and personal settings are kept', kept.every((k) => keysAfter.includes(k)) && (B.prog(org, 'org') || {}).name === DIR.org && Object.keys(((B.prog(org, 'users') || {}).map) || {}).length === 3 && B.rows('np_demo_agreements').filter((x) => x.org_id === org).length === agBefore, keysAfter.join(','));
    check('after Erase: clients, staff and tasks are gone, team settings (names, notification settings) are reset, and Development stays on', !B.rows('np_demo_clients').some((x) => x.org_id === org) && !B.rows('np_demo_staff').some((x) => x.org_id === org) && !B.rows('np_demo_tasks').some((x) => x.org_id === org) && !keysAfter.includes('notifremind') && (B.prog(org, 'hidesample') || {}).v === true, 'before: ' + keysBefore.join(',') + ' | after: ' + keysAfter.join(','));
    check('after Erase: the owner record (the "profile" settings row: who set up the team) is kept, so "Run setup again" and the owner\'s rights stay with the owner and are not handed to every director', keysAfter.includes('profile'), keysAfter.join(','));
    const da = await page.evaluate(() => ({ role: state.role, team: agencyName(), clients: visibleClients().length, gate: !!window._gateLock }));
    check('after Erase: the director lands back in Willow Care, empty, with no agreement to sign again', da.role === 'director' && da.team === DIR.org && !da.clients && !da.gate, JSON.stringify(da));
    await sp.reload({ waitUntil: 'load' }); await booted(sp); await settle(sp, 2500);
    const ds = await sp.evaluate(() => ({ app: el('app').classList.contains('on'), role: typeof state !== 'undefined' ? state.role : '', gate: !!window._gateLock, me: (el('suName') || {}).textContent }));
    check('after Erase: the staff member\'s sign-in still opens Willow Care as staff (their record is gone)', ds.app && ds.role === 'staff' && !ds.gate, JSON.stringify(ds));
    const I2 = await open();
    await signInAs(I2.page, DIR2);
    await settings(I2.page);
    const rsa = await card(I2.page, 'Notifications').locator('button:has-text("Run setup again")').count();
    check('...after Erase the invited director (not the owner) is offered Run setup again', rsa === 0, 'Run setup again buttons for Ida: ' + rsa);
    await I2.ctx.close();
    // Restore sample data
    await settings(page);
    await card(page, 'Workspace data').locator('button:has-text("Restore sample data")').click(); await settle(page, 300);
    await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => {}), page.locator('#mdFoot button:has-text("Restore sample data")').click()]);
    await booted(page); await inApp(page); await settle(page, 2000);
    const rs = await page.evaluate(() => ({ hide: state.hideSample, clients: visibleClients().length, banner: getComputedStyle(el('modeBanner')).display !== 'none', role: state.role, team: agencyName() }));
    const keysR = B.program.filter((r) => r.org_id === org).map((r) => r.key);
    check('Restore sample data: sample records show (Demo, with its banner), the team, signatures and team list are kept', rs.hide === false && rs.clients > 0 && rs.banner && rs.role === 'director' && rs.team === DIR.org && kept.every((k) => keysR.includes(k)), JSON.stringify(rs) + ' ' + keysR.join(','));
    await settings(page);
    await card(page, 'Demo vs. Development').locator('button.mode-opt:has-text("Development")').click(); await settle(page, 1200);
    await page.evaluate(() => closeAll());
  }
  if (STOP <= 10) return finish();

  // ======================= 11. Setup choices, signing up twice, a second team on the same computer =======================
  {
    // the setup's role question: someone starting a team who picks Care provider
    const C = await open();
    const cp = C.page;
    const CP = { email: 'hal@birch.test', pw: 'birch-pass-12', org: 'Birch Care', name: 'Hal Birch', title: 'House supervisor' };
    await startSignUp(cp, CP);
    await cp.locator('#onbRoot .ob-q.on .opt:has-text("Care provider")').click();
    await cp.locator('#onbRoot #next').click(); await settle(cp, 400);
    await inApp(cp); await settle(cp, 1500);
    const borg = B.myOrg(CP.email);
    const c1 = await cp.evaluate(() => ({ role: state.role, member: roleFor(), team: agencyName() }));
    await shot(cp, 'care-provider-creator-in-staff-view');
    await signPilot(cp, CP);
    check('a team\'s creator who picks "Care provider" in setup still opens their own team as its director (the database makes them director; the page opens the staff view)', c1.role === 'director', JSON.stringify(c1));
    await reload(cp);
    const c2 = await cp.evaluate(() => ({ role: state.role, member: roleFor() }));
    check('...and after a reload they are still stuck in the staff view of their own team (no Settings > Team access, no Add staff)', c2.role === 'director', JSON.stringify(c2));
    const sw = await cp.evaluate(() => { openSettings(); return !!document.querySelector('#drawer section h2') && [...document.querySelectorAll('#drawer section h2')].some((h) => h.textContent === 'Switch view'); });
    check('...their way out today: Settings still offers Switch view (they are a director)', sw);
    await cp.evaluate(() => closeAll());
    // signing up again with the same login, by mistake
    await cp.evaluate(() => signOut()); await cp.waitForNavigation({ waitUntil: 'load' }).catch(() => {}); await booted(cp); await settle(cp, 400);
    await cp.click('text=Get your team started');
    await cp.waitForFunction(() => document.activeElement && document.activeElement.id === 'regOrg');
    await cp.fill('#regOrg', 'Birch Care Two'); await cp.fill('#regName', 'Someone Else'); await cp.fill('#regRole', 'Director');
    await cp.fill('#liEmail', CP.email); await cp.fill('#liPw', CP.pw); await cp.click('#liGo'); await settle(cp, 2500);
    const dup = await cp.evaluate(() => ({ err: el('liErr').innerText, onb: el('onbRoot').classList.contains('on') }));
    if (dup.onb) await quickSetup(cp);
    await settle(cp, 800);
    check('"Get your team started" with a login that already has a team (signed agreement, no clients yet) says to log in instead, not re-run setup and rename the team', !dup.onb && (B.prog(borg, 'org') || {}).name === 'Birch Care', JSON.stringify({ dup, team: (B.prog(borg, 'org') || {}).name }));
    await C.ctx.close();
    // a second team on the same computer as Willow Care
    const page = D.page;
    await signOutUI(page);
    await startSignUp(page, { email: 'kai@cove.test', pw: 'cove-pass-12', org: 'Cove Care', name: 'Kai Moss', title: 'Program Director' });
    await quickSetup(page);
    await signPilot(page, { org: 'Cove Care', name: 'Kai Moss', title: 'Program Director' });
    const k = await page.evaluate(() => ({ team: agencyName(), users: Object.keys(USERS), labels: JSON.stringify(LABELS), folder: FOLDER_NAMES.Agency, cert: CERT_REMIND.days, alerts: AGENCY_EMAIL, nm: NAME_MODE, idle: IDLE_MIN, homes: HOMES.slice(), cats: Object.keys(APPT_CATS), tcats: TASK_CATS.slice(), dig: NOTIF_DIGEST.freq, attn: ATTN_COLORS.incident || '', text: document.body.innerText }));
    check('a second team on the same computer starts clean: its own name and team list, none of Willow Care\'s settings', k.team === 'Cove Care' && k.users.join() === 'kai@cove.test' && k.labels === '{}' && k.cert === 90 && k.alerts === 'kai@cove.test' && k.nm === 'full' && !k.homes.includes('Pine House') && !k.cats.includes('Hydrotherapy') && !k.tcats.includes('Medication') && k.dig === 'off' && k.attn !== '#123456' && !/Willow|Nora|Omar/.test(k.text), JSON.stringify(Object.assign({}, k, { text: undefined })));
    check('...including the Agency binder\'s name ("Alta binder" in Willow Care)', k.folder === 'Agency binder', k.folder);
    await settings(page);
    const ta = await card(page, 'Team access').innerText();
    check('its Team access lists only Kai', /Kai Moss/.test(ta) && !/Nora|Omar|Ida/.test(ta), ta.replace(/\s+/g, ' ').slice(0, 200));
    await page.evaluate(() => closeAll());
    await signOutUI(page);
    const L = await loginState(page);
    check('signing out offers Kai\'s email, not Nora\'s', L.email === 'kai@cove.test', JSON.stringify(L));
  }
  {
    // Run setup again (Settings > Notifications), on the Cove team
    const page = D.page;
    await page.fill('#liPw', 'cove-pass-12'); await page.click('#liGo'); await inApp(page); await settle(page, 1200);
    const org2 = B.myOrg('kai@cove.test');
    await settings(page);
    await card(page, 'Notifications').locator('button:has-text("Run setup again")').click(); await settle(page, 600);
    const w = await page.evaluate(() => ({ wel: el('welRoot') && el('welRoot').classList.contains('on'), onb: el('onbRoot').classList.contains('on'), name: (el('name') || {}).value, email: (el('wemail') || {}).value }));
    if (w.wel) { if (!w.name) await page.fill('#welRoot #name', 'Kai Moss'); await page.click('#welRoot #start'); await settle(page, 600); }
    const o = await page.evaluate(() => ({ on: el('onbRoot').classList.contains('on'), org: '' }));
    let orgPrefill = null;
    for (let i = 0; i < 8; i++) {
      if (!(await page.evaluate(() => el('onbRoot').classList.contains('on')))) break;
      if (await page.locator('#onbRoot #org').isVisible()) { if (orgPrefill === null) orgPrefill = await page.inputValue('#onbRoot #org'); if (!orgPrefill) await page.fill('#onbRoot #org', 'Cove Care'); }
      await page.locator('#onbRoot .ob-q.on .opt >> visible=true').first().click().catch(() => {});
      await page.locator('#onbRoot #next').click(); await settle(page, 400);
    }
    await inApp(page); await settle(page, 1500);
    const prof = B.prog(org2, 'profile') || {};
    const after = await page.evaluate(() => ({ role: state.role, team: agencyName(), me: el('suName').textContent }));
    check('Run setup again: the setup questions come back (after the welcome screen)', w.wel || w.onb, JSON.stringify(w));
    check('Run setup again: the team keeps its name and the director stays director, as themselves', after.role === 'director' && after.team === 'Cove Care' && (B.prog(org2, 'org') || {}).name === 'Cove Care' && after.me === 'Kai Moss', JSON.stringify(after));
    check('Run setup again: the team name is filled in on the organization question (it starts blank, so a typo there renames the team)', !!orgPrefill, JSON.stringify(orgPrefill));
    check('Run setup again: the owner record keeps the director\'s name and email', prof.name === 'Kai Moss' && prof.email === 'kai@cove.test', JSON.stringify(prof));
  }

  return finish();

  async function finish() {
    try { for (const c of env.browser.contexts()) await c.close(); } catch (e) {}
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
    await env.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) { console.log('\nFailures:\n  ' + failures.join('\n  ')); process.exit(1); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
