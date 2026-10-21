// Sign-in page tests for E-&-G-Home-Inc.html (#2, the care portal), v12.23: the split-screen sign-in (Erica's
// design), at desktop, tablet and phone width, with real clicks; the screens that share it (new agency, invite,
// forgot password, choose a view); the show-password eye; and "Remember my email on this device".
// Supabase answers from stubs (lib/portal-harness.js), so no real account or agency is touched. See tests/README.md.
// Usage: node tests/portal-login.test.js [baseline.html]
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
  async function open(url, viewport) {
    const { ctx, page, calls } = await H.newPage(env, { viewport, bucket: errors });
    await page.goto(env.BASE + (url || '/portal.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
    await page.waitForTimeout(700);
    return { ctx, page, calls };
  }
  // what is on the screen: the two panels' boxes and the texts that change from screen to screen
  const look = (page) => page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), vis: getComputedStyle(e).display !== 'none' && b.width > 0 }; };
    const t = (s) => ((document.querySelector(s) || {}).textContent || '').replace(/\s+/g, ' ').trim();
    return { main: r('#login .lg-main'), side: r('#login .lg-side'), title: t('#loginTitle'), sub: t('#loginSub'), top: t('#lgTop'), ver: t('#lgVer'),
      go: t('#liGoT'), rem: r('#liRemWrap'), mark: r('#login .login-box .login-mark'), forgot: r('#liForgotWrap'),
      ph: [(document.getElementById('liEmail') || {}).placeholder, (document.getElementById('liPw') || {}).placeholder],
      font: getComputedStyle(document.getElementById('loginTitle')).fontFamily, sw: document.documentElement.scrollWidth, vw: innerWidth };
  });
  // a real click lands on the element itself, not on something drawn over it
  const clickable = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return 'missing'; const b = e.getBoundingClientRect();
    const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return at && (at === e || e.contains(at)) ? 'ok' : 'covered by ' + (at && (at.id || at.className || at.tagName)); }, sel);

  // ---------------- 1. the sign-in screen, desktop ----------------
  {
    const { ctx, page } = await open();
    const s = await look(page);
    check('sign-in: the green panel is on the left, the form on the right', s.side && s.main && s.side.vis && s.side.x < s.main.x && s.side.x === 0, JSON.stringify([s.side, s.main]));
    check('sign-in: both panels fill the window height', s.side.h >= 880 && s.main.h >= 880, s.side.h + '/' + s.main.h);
    check('sign-in: Welcome back, Sign in to your team’s workspace', s.title === 'Welcome back' && s.sub === 'Sign in to your team’s workspace.', s.title + ' | ' + s.sub);
    check('sign-in: Hanken Grotesk, as in the design', /Hanken Grotesk/.test(s.font), s.font);
    const side = await page.evaluate(() => document.querySelector('#login .lg-side').innerText);
    check('sign-in: the panel says Care, with clarity. and its three features', /Care, with clarity\./.test(side) && /Role-based access/.test(side) && /Inspection ready/.test(side) && /One shared calendar to coordinate important events, meetings and appointments for your organization’s team and clients\./.test(side), side.slice(0, 200));
    check('sign-in: the wording is general (no day programs or residential care teams)', !/day programs|residential care teams/i.test(side), side);
    check('sign-in: New here? Get your team started at the top right', /New here\?\s*Get your team started/.test(s.top), s.top);
    // v12.34: the sign-in page talks about your team, not your agency
    check('sign-in: the panel says Your team, connected and One shared workspace for your staff, care providers…',
      /your team, connected/i.test(side) && /One shared workspace for your staff, care providers and the people you support, across community and residential services\./.test(side), side.slice(0, 200));
    check('sign-in: the email box suggests you@example.org', s.ph[0] === 'you@example.org', s.ph[0]);
    check('sign-in: the word agency is nowhere on the sign-in page', await page.evaluate(() => !/agency/i.test(document.querySelector('#login').innerText)),
      await page.evaluate(() => (document.querySelector('#login').innerText.match(/[^\n]*agency[^\n]*/i) || [''])[0]));
    check('sign-in: the version sits in the footer', s.ver === (await page.evaluate(() => APP_VERSION)) && /^v12\.(2[3-9]|[3-9]\d) beta$/.test(s.ver), s.ver);
    check('sign-in: Support writes to support@aiparagonconsulting.com, and there are no dead Privacy or Terms links',
      await page.evaluate(() => { const a = [...document.querySelectorAll('#login .lg-foot a')]; return a.length === 1 && a[0].href === 'mailto:support@aiparagonconsulting.com'; }));
    check('sign-in: Forgot password? sits beside the Password label', s.forgot && s.forgot.vis, JSON.stringify(s.forgot));
    check('sign-in: Remember my email is shown and ticked', s.rem.vis && await page.isChecked('#liRemember'));
    check('sign-in: the joining-a-team note is under the form', /Joining your team’s workspace\? Open the invitation link from your director or administrator\. It sets up your sign-in\./.test(await page.evaluate(() => (document.querySelector('#loginFresh .lg-note') || {}).textContent || '')));
    check('sign-in: the brand mark above the form is hidden on a wide screen (it is in the panel)', !s.mark.vis);
    check('sign-in: nothing covers the Sign in button', (await clickable(page, '#liGo')) === 'ok', await clickable(page, '#liGo'));
    check('sign-in: nothing covers the email field', (await clickable(page, '#liEmail')) === 'ok', await clickable(page, '#liEmail'));
    check('sign-in: no sideways scrolling', s.sw <= s.vw, s.sw + ' > ' + s.vw);

    // the eye
    await page.fill('#liPw', 'not-a-real-password');
    await page.click('#liEye');
    check('the eye shows the password', (await page.getAttribute('#liPw', 'type')) === 'text' && (await page.getAttribute('#liEye', 'aria-label')) === 'Hide password');
    await page.click('#liEye');
    check('and hides it again', (await page.getAttribute('#liPw', 'type')) === 'password' && (await page.getAttribute('#liEye', 'aria-label')) === 'Show password');

    // a wrong password is said on the card
    await page.fill('#liEmail', 'someone@agency.test');
    await page.click('#liGo');
    await page.waitForTimeout(600);
    const err = await page.evaluate(() => { const e = document.getElementById('liErr'); return getComputedStyle(e).display !== 'none' ? e.textContent : ''; });
    check('a wrong password shows a message on the card', /Wrong password|no login/i.test(err), err);

    // new agency and back
    await page.click('#lgTop a');
    await page.waitForTimeout(300);
    const r = await look(page);
    check('Get your team started opens Set up a new agency', r.title === 'Set up a new agency' && /Already have an account\?\s*Sign in/.test(r.top) && r.go === 'Create agency account', r.title + ' | ' + r.top + ' | ' + r.go);
    check('the new-agency screen has no remember box and asks for the agency and person', !r.rem.vis && await page.isVisible('#regOrg') && await page.isVisible('#regName'));
    check('and keeps the green panel', r.side.vis && r.side.x < r.main.x);
    await page.click('#liEye');
    await page.click('#lgTop a');
    await page.waitForTimeout(300);
    const b = await look(page);
    check('Sign in at the top right comes back to Welcome back', b.title === 'Welcome back' && b.go === 'Sign in' && /New here\?/.test(b.top), b.title + ' | ' + b.go);
    check('the sign-in placeholders are back (not the new-agency ones)', b.ph[0] === 'you@example.org' && b.ph[1] === 'Enter your password', b.ph.join(' | '));
    check('and the password is hidden again', (await page.getAttribute('#liPw', 'type')) === 'password');

    // forgot password and back
    await page.click('#liForgotWrap');
    await page.waitForTimeout(300);
    check('Forgot password? opens Reset your password in the same page', (await look(page)).title === 'Reset your password' && await page.isVisible('#fpEmail') && (await clickable(page, '#fpGo')) === 'ok');
    await page.click('#fpBack a');
    await page.waitForTimeout(300);
    check('Back to log in returns to the form', (await look(page)).title === 'Welcome back' && await page.isVisible('#liEmail'));

    // choose a view (switching views from inside the app)
    await page.evaluate(() => showRolePicker());
    await page.waitForTimeout(200);
    const v = await page.evaluate(() => ({ cards: [...document.querySelectorAll('#roleGrid .role-card')].filter((c) => c.getBoundingClientRect().width > 0).length, top: document.getElementById('lgTop').textContent.trim() }));
    check('Choose a view keeps its three cards on the new page, with no sign-up link', v.cards === 3 && v.top === '', JSON.stringify(v));
    await ctx.close();
  }

  // ---------------- 2. Remember my email ----------------
  {
    const { ctx, page } = await open();
    const st = await page.evaluate(() => {
      AUTH.email = 'erica@deltacare.test'; AUTH.mode = 'supabase';
      localStorage.removeItem('np__' + NP_WS + '__noremember');
      showLoginPage();
      const a = { email: el('liEmail').value, other: !!document.querySelector('#loginFresh .lg-other'), ticked: el('liRemember').checked };
      el('liRemember').checked = false; lgRememberSave();
      const flag = localStorage.getItem('np__' + NP_WS + '__noremember');
      showLoginPage();
      const b = { email: el('liEmail').value, other: !!document.querySelector('#loginFresh .lg-other'), ticked: el('liRemember').checked };
      el('liRemember').checked = true; lgRememberSave();
      return { a, flag, b, after: localStorage.getItem('np__' + NP_WS + '__noremember'), device: !!NP_DEVICE_KEYS.noremember };
    });
    check('remembered: the email is filled in, with Not you? Use a different account', st.a.email === 'erica@deltacare.test' && st.a.other && st.a.ticked, JSON.stringify(st.a));
    check('unticking it is saved on this device', st.flag === '1' && st.device, st.flag);
    check('not remembered: the email is not offered, and the box stays unticked', st.b.email === '' && !st.b.other && !st.b.ticked, JSON.stringify(st.b));
    check('ticking it again clears that', st.after === null, st.after);
    await ctx.close();
  }

  // ---------------- 3. an invite link ----------------
  {
    const { ctx, page, calls } = await open('/portal.html?join=' + H.INVITE.token);
    await page.waitForFunction(() => /Join/.test(document.getElementById('loginTitle').textContent), null, { timeout: 8000 }).catch(() => {});
    const s = await look(page);
    check('an invite link opens Join Maple Care on the split page', s.title === 'Join Maple Care' && s.side.vis && s.go === 'Join Maple Care', s.title + ' | ' + s.go);
    check('it names the person and fills in the invited email', /Jo Rivera/.test(s.sub) && (await page.inputValue('#liEmail')) === H.INVITE.email, s.sub);
    check('the invite asked the stubbed backend, nothing else', calls.some((c) => /np_invite_peek/.test(c)), calls.join(' '));
    await ctx.close();
  }

  // ---------------- 4. tablet and phone ----------------
  for (const [w, h, name] of [[820, 1180, 'tablet'], [390, 844, 'phone']]) {
    const { ctx, page } = await open(null, { width: w, height: h });
    const s = await look(page);
    check(name + ': the form comes first, the green panel under it', s.main.y < s.side.y && s.main.x === 0 && s.side.x === 0, JSON.stringify([s.main, s.side]));
    check(name + ': the brand mark shows above the form', s.mark.vis);
    check(name + ': no sideways scrolling', s.sw <= w, s.sw + ' > ' + w);
    check(name + ': nothing covers the Sign in button', (await clickable(page, '#liGo')) === 'ok', await clickable(page, '#liGo'));
    const sz = await page.evaluate(() => [el('liGo').getBoundingClientRect().height, el('liEmail').getBoundingClientRect().height]);
    check(name + ': the button and fields stay thumb-sized', sz[0] >= 44 && sz[1] >= 44, sz.join('/'));
    await ctx.close();
  }

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
