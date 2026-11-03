// Staff onboarding regression tests for E-&-G-Home-Inc.html (#2, the care portal), v12.41: a staff member added by
// the director gets the team's onboarding checklist, and can find it and tick it off. Until v12.41 the welcome notice
// sent them to their Profile page, but the Profile only had a Credentials tab, so the checklist could not be reached
// from their own view. Now the Profile has an Onboarding tab (opened first while steps are left), My shift's training
// card has the checklist's progress with Open, and the onboarding notices open it. Two people in their own browsers
// against the stand-in for the Supabase project (lib/portal-backend.js), as in the end-to-end suite.
// Usage: node tests/portal-onboarding.test.js [baseline.html]
const H = require('./lib/portal-harness');
const { makeBackend } = require('./lib/portal-backend');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const today = new Date().toISOString().slice(0, 10);
const DIR = { email: 'lena@cedar.test', pw: 'cedar-pass-1', org: 'Cedar Care', name: 'Lena Park', title: 'Executive Director' };
const STF = { email: 'omar@cedar.test', pw: 'omar-pass-12', name: 'Omar Diaz' };

(async () => {
  const env = await H.start(process.argv[2]);
  const B = makeBackend({});
  const errors = [];
  async function open() {
    const { ctx, page } = await H.newPage(env, { rest: B.rest, bucket: errors, viewport: { width: 1440, height: 900 } });
    await B.route(ctx);
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
  async function addOption(page, sel, val) {
    await page.selectOption(sel, '__add__');
    const box = page.locator(sel + ' ~ .inline-add input, .inline-add input').first();
    await box.fill(val); await box.press('Enter'); await settle(page, 250);
  }
  async function signPilot(page, who) {
    if (!(await page.locator('#pgAccept').count())) return false;
    if (await page.locator('#pgAgency').isVisible()) await page.fill('#pgAgency', who.org || '');
    await page.fill('#pgName', who.name); await page.fill('#pgTitle', who.title || 'Staff');
    await page.check('#pgAccept'); await page.locator('#modal button:has-text("Continue")').click();
    await page.waitForFunction(() => !window._gateLock && !el('modal').classList.contains('on'), null, { timeout: 10000 }).catch(() => {});
    return true;
  }
  // what the Profile shows: its tabs, the one open, and the checklist rows
  const profile = (page) => page.evaluate(() => ({
    tabs: [...document.querySelectorAll('#view .tabs button')].map((b) => b.textContent.trim()),
    on: ((document.querySelector('#view .tabs button.active') || {}).textContent || '').trim(),
    rows: [...document.querySelectorAll('#view .checkrow')].map((r) => ({ t: r.querySelector('.ct').textContent.trim(), on: r.querySelector('.cb').classList.contains('on') })),
    note: [...document.querySelectorAll('#view .tiny.muted')].map((n) => n.textContent.trim()).join(' | '),
  }));

  // ---------------- a new team, a home, a staff member added with an invite ----------------
  const D = await open();
  const page = D.page;
  await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
  await page.click('text=Get your team started');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'regOrg');
  await page.fill('#regOrg', DIR.org); await page.fill('#regName', DIR.name); await page.fill('#regRole', DIR.title);
  await page.fill('#liEmail', DIR.email); await page.fill('#liPw', DIR.pw);
  await page.click('#liGo');
  await page.waitForFunction(() => el('onbRoot') && el('onbRoot').classList.contains('on'), null, { timeout: 20000 });
  for (let i = 0; i < 8; i++) {
    if (!(await page.evaluate(() => el('onbRoot').classList.contains('on')))) break;
    await page.locator('#onbRoot .opt >> visible=true').first().click().catch(() => {});
    await page.locator('#onbRoot #next').click(); await settle(page, 400);
  }
  await inApp(page); await settle(page, 1500);
  await signPilot(page, DIR);
  const org = B.myOrg(DIR.email);
  await go(page, 'clients'); await btn(page, '#view', 'Add client').click(); await settle(page, 400);
  await page.fill('#clUci', '7350999'); await page.fill('#clAge', '38');
  await addOption(page, '#clHome', 'Elm House');
  await btn(page, '#view', 'Save client').click(); await settle(page, 600);
  await go(page, 'team'); await btn(page, '#view', 'Add staff').click(); await settle(page, 400);
  await page.fill('#sfName', STF.name); await page.fill('#sfInit', 'O.D.'); await page.fill('#sfRole', 'Direct Support Professional');
  await page.selectOption('#sfHome', 'Elm House'); await page.fill('#sfHired', today); await page.fill('#sfEmail', STF.email);
  await btn(page, '#modal', 'Add staff member').click(); await settle(page, 800);
  await until(() => B.relay.some((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite'));
  const sid = (B.rows('np_demo_staff').find((x) => x.email === STF.email) || {}).id;
  await until(() => (((B.prog(org, 'onboard') || {}).assign || {})[sid] || []).length);
  const shared = (((B.prog(org, 'onboard') || {}).assign || {})[sid]) || [];
  check('adding a staff member shares the team’s onboarding checklist with them', !!sid && shared.length >= 1 && shared.every((x) => !x.d), JSON.stringify(shared).slice(0, 200));
  const welcome = B.rows('np_demo_notifications').find((n) => n.for_staff === sid && n.title === 'Welcome to the portal') || {};
  check('the welcome notice says the checklist is on their Profile page, under Onboarding', /Your onboarding checklist is on your Profile page, under Onboarding\./.test(welcome.body || '') && !/—/.test(welcome.body || ''), welcome.body);
  await go(page, 'profile');
  check('the director’s own Profile has no Onboarding tab (they set the steps on Training & onboarding)', !(await profile(page)).tabs.some((t) => /Onboarding/.test(t)), JSON.stringify((await profile(page)).tabs));

  // ---------------- the staff member joins and finds the checklist ----------------
  const S = await open();
  const sp = S.page;
  const link = ((B.relay.find((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite') || {}).payload || {}).link;
  await sp.goto(link, { waitUntil: 'load' }); await booted(sp);
  await sp.waitForFunction(() => /Join/.test((el('loginTitle') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await sp.fill('#liPw', STF.pw); if (await sp.locator('#liPw2').count()) await sp.fill('#liPw2', STF.pw);
  await sp.click('#liGo');
  await sp.waitForFunction(() => typeof state !== 'undefined' && state.role === 'staff', null, { timeout: 20000 }).catch(() => {});
  await settle(sp, 1500);
  await signPilot(sp, { name: STF.name, title: 'Direct Support Professional' });
  await reload(sp);
  check('they are in as staff, as themselves', await sp.evaluate((id) => state.role === 'staff' && meSid() === id, sid));

  await go(sp, 'home');
  const card = await sp.evaluate(() => { const c = [...document.querySelectorAll('#view .card')].find((x) => /Training to finish/.test(x.innerText)); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
  check('My shift’s training card lists the onboarding checklist with its progress, counted as pending', new RegExp('Onboarding checklist 0 of ' + shared.length + ' steps done').test(card) && /1 pending/.test(card), card.slice(0, 300));
  await sp.locator('#view .card:has-text("Training to finish") button:has-text("Open")').first().click(); await settle(sp, 400);
  let pr = await profile(sp);
  check('Open goes to their Profile, on the Onboarding tab', await sp.evaluate(() => state.view === 'profile') && pr.on === 'Onboarding · 0 of ' + shared.length && pr.tabs.join('|') === 'Credentials|Onboarding · 0 of ' + shared.length, JSON.stringify(pr));
  check('the tab lists each step shared with them, unticked', pr.rows.length === shared.length && pr.rows.every((r, i) => r.t.startsWith(shared[i].t) && !r.on), JSON.stringify(pr.rows));

  // the notices open it too
  await go(sp, 'home');
  await sp.evaluate(() => openAlerts()); await settle(sp, 300);
  const nrow = sp.locator('#drawer .attn:has-text("Welcome to the portal")').first();
  check('the welcome notice in Notifications says Open', /Open/.test(await nrow.innerText().catch(() => '')), await nrow.innerText().catch(() => 'missing'));
  await nrow.click(); await settle(sp, 400);
  check('and opens the Onboarding tab', await sp.evaluate(() => state.view === 'profile' && !el('drawer').classList.contains('on')) && (await profile(sp)).on.startsWith('Onboarding'));

  // the Profile opens on Onboarding by itself while steps are left
  await go(sp, 'home'); await sp.evaluate(() => { state.profTab = ''; }); await go(sp, 'profile');
  check('the Profile opens on Onboarding while steps are left', (await profile(sp)).on.startsWith('Onboarding'), (await profile(sp)).on);

  // tick one: saved for the team, and the director sees it
  await sp.locator('#view .checkrow').first().click(); await settle(sp, 500);
  pr = await profile(sp);
  check('ticking a step marks it and counts it, and they stay on the Profile', pr.rows[0].on && pr.on === 'Onboarding · 1 of ' + shared.length && await sp.evaluate(() => state.view === 'profile'), JSON.stringify(pr));
  await until(() => ((((B.prog(org, 'onboard') || {}).assign || {})[sid]) || [])[0].d === 1);
  const saved = ((((B.prog(org, 'onboard') || {}).assign || {})[sid]) || [])[0] || {};
  check('the tick is saved for the team, with who ticked it', saved.d === 1 && saved.by === STF.name, JSON.stringify(saved));
  await reload(sp); await go(sp, 'profile');
  check('after a reload the tick is still there', (await profile(sp)).on === 'Onboarding · 1 of ' + shared.length, (await profile(sp)).on);
  await reload(page);
  const dirView = await page.evaluate((id) => { openStaffPage(id); const c = [...document.querySelectorAll('.card')].find((x) => /Onboarding checklist/.test(x.innerText)); return c ? c.innerText.replace(/\s+/g, ' ') : ''; }, sid);
  check('the director sees their progress on the staff page', new RegExp('1 of ' + shared.length).test(dirView), dirView.slice(0, 200));

  // finish it
  for (let i = 1; i < shared.length; i++) { await sp.locator('#view .checkrow').nth(i).click(); await settle(sp, 300); }
  pr = await profile(sp);
  check('with every step ticked the tab says so', pr.on === 'Onboarding · ' + shared.length + ' of ' + shared.length && /All done/.test(pr.note), JSON.stringify(pr));
  await go(sp, 'home'); await sp.evaluate(() => { state.profTab = ''; }); await go(sp, 'profile');
  check('once it is done the Profile opens on Credentials, with Onboarding still there', (await profile(sp)).on === 'Credentials' && (await profile(sp)).tabs.length === 2, JSON.stringify(await profile(sp)));
  await go(sp, 'home');
  const done = await sp.evaluate(() => { const c = [...document.querySelectorAll('#view .card')].find((x) => /Training to finish/.test(x.innerText)); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
  check('My shift’s card drops the checklist once it is done', !/Onboarding checklist/.test(done) && /All current|Nothing outstanding/.test(done), done.slice(0, 200));

  // ---------------- the demo view: nothing shared with the sample staff member, no tab, no errors ----------------
  {
    const X = await open();
    await X.page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await X.page.waitForFunction(() => typeof go === 'function' && el('app').classList.contains('on'), null, { timeout: 20000 }).catch(() => {});
    await X.page.evaluate(() => { signIn('staff'); }); await settle(X.page, 600);
    await go(X.page, 'profile');
    const dv = await profile(X.page);
    check('demo view, staff: the Profile works and shows Credentials (no checklist shared there)', dv.on === 'Credentials' && !dv.tabs.some((t) => /Onboarding/.test(t)), JSON.stringify(dv));
    await X.ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
