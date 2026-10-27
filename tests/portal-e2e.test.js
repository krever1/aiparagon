// End-to-end tests for E-&-G-Home-Inc.html (#2, the care portal): one made-up team used the way a real one is, by
// several people in their own browsers, against a stand-in for the whole Supabase project (lib/portal-backend.js:
// sign-up, sign-in, the team functions, row security by team, the tables, storage and the relay). A director
// starts a new team, signs the pilot agreement, adds a home, a client and a staff member with an invite; the staff
// member joins from the emailed link; then tasks, messages, the calendar, incidents, the safety logs, training,
// the directory, the change log, Ask Spectrum and a form filled in and signed go back and forth between them, each
// checked in the other person's browser after a reload. Access removed, and a second team on the same computer,
// close it out. No real account, team or email is touched. See tests/README.md.
// Usage: node tests/portal-e2e.test.js [baseline.html]
const H = require('./lib/portal-harness');
const { makeBackend } = require('./lib/portal-backend');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const today = new Date().toISOString().slice(0, 10);
const DIR = { email: 'hana@harbor.test', pw: 'harbor-pass-1', org: 'Harbor Care', name: 'Hana Lead', title: 'Executive Director' };
const STF = { email: 'sam@harbor.test', pw: 'sam-pass-12', name: 'Sam Rivera' };
const UCI = '7350214';

(async () => {
  const env = await H.start(process.argv[2]);
  const asks = [];
  const B = makeBackend({ ask: async (p) => { asks.push(p); const r = B.askReplyFn ? B.askReplyFn(p) : null; return r && r.status ? r : { reply: r || 'Okay.' }; } });
  const errors = [];

  async function open(viewport) {
    const { ctx, page } = await H.newPage(env, { rest: B.rest, bucket: errors, viewport: viewport || { width: 1440, height: 900 } });
    await B.route(ctx);
    page.on('dialog', (d) => d.accept());
    return { ctx, page };
  }
  const booted = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  const inApp = (page) => page.waitForFunction(() => el('app').classList.contains('on') && typeof state !== 'undefined' && state.role, null, { timeout: 20000 });
  const toast = (page) => page.evaluate(() => (el('toast') || {}).innerText || '');
  const settle = (page, ms) => page.waitForTimeout(ms || 500);
  // waits for something the backend should have (a save goes out a moment after the click)
  const until = async (fn, ms) => { const end = Date.now() + (ms || 6000); while (Date.now() < end) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
  const go = async (page, v) => { await page.evaluate((v) => { closeAll(); go(v); }, v); await settle(page, 350); };
  const reload = async (page) => { await page.reload({ waitUntil: 'load' }); await booted(page); await inApp(page); await settle(page, 1500); };
  const btn = (page, scope, text) => page.locator(scope + ' button:has-text("' + text + '")').first();
  const closeModal = async (page) => { await page.evaluate(() => closeAll()); await settle(page, 200); };
  // a pick list's "＋ Add…" line, then the name box under it
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
  async function signIn(page, who) {
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    if (!(await page.evaluate(() => el('app').classList.contains('on')))) {
      await page.fill('#liEmail', who.email); await page.fill('#liPw', who.pw); await page.click('#liGo');
      await inApp(page);
    }
    await settle(page, 1500);
  }

  // ---------------- 1. a new team: sign-up, setup, the pilot agreement ----------------
  const D = await open();
  {
    const page = D.page;
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    await page.click('text=Get your team started');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'regOrg');   // the form puts the cursor in Team name a moment after it opens
    await page.fill('#regOrg', DIR.org); await page.fill('#regName', DIR.name); await page.fill('#regRole', DIR.title);
    await page.fill('#liEmail', DIR.email); await page.fill('#liPw', DIR.pw);
    await page.click('#liGo');
    await page.waitForFunction(() => el('onbRoot') && el('onbRoot').classList.contains('on'), null, { timeout: 20000 });
    const u = B.users.find((x) => x.email === DIR.email);
    check('sign-up makes the login, tagged as a care portal one, with a team of its own and them its director', !!u && u.meta.app === 'spectrum' && B.members.filter((m) => m.user_id === u.id).length === 1 && B.members.find((m) => m.user_id === u.id).role === 'director', JSON.stringify(B.members));
    const steps = [];
    for (let i = 0; i < 8; i++) {
      if (!(await page.evaluate(() => el('onbRoot').classList.contains('on')))) break;
      steps.push(await page.evaluate(() => (el('onbRoot').innerText.match(/STEP \d+ OF \d+/) || [''])[0]));
      await page.locator('#onbRoot .opt >> visible=true').first().click().catch(() => {});
      await page.locator('#onbRoot #next').click(); await settle(page, 400);
    }
    check('setup asks its five questions', steps.join() === 'STEP 1 OF 5,STEP 2 OF 5,STEP 3 OF 5,STEP 4 OF 5,STEP 5 OF 5', steps.join());
    await inApp(page); await settle(page, 1500);
    const gate = await page.evaluate(() => ({ lock: !!window._gateLock, title: el('modal').classList.contains('on') ? el('mdTitle').innerText : '' }));
    check('the pilot agreement comes up before anything else, and cannot be closed', gate.lock && /Pilot/.test(gate.title), JSON.stringify(gate));
    await page.evaluate(() => closeAll()); await settle(page, 200);
    check('closing it does nothing until it is signed', await page.evaluate(() => el('modal').classList.contains('on')));
    check('the pilot agreement is signed and the dashboard unlocks', await signPilot(page, DIR) && await page.evaluate(() => !window._gateLock && !el('modal').classList.contains('on')));
    const org = B.myOrg(DIR.email);
    const s = await page.evaluate(() => ({ role: state.role, view: state.view, hide: state.hideSample, clients: visibleClients().length, staff: visibleStaff().length, team: (el('brandName') || {}).innerText || agencyName(), me: (PERSON || {}).name }));
    check('they land on Home as the director of Harbor Care, named as they signed up', s.role === 'director' && s.view === 'home' && /Harbor Care/.test(s.team) && s.me === DIR.name, JSON.stringify(s));
    check('a new team starts empty: no sample clients or staff (Development)', s.hide === true && s.clients === 0 && s.staff === 0, JSON.stringify(s));
    check('the team’s name, contact email and team list are saved for the team', (B.prog(org, 'org') || {}).name === DIR.org && (B.prog(org, 'email') || {}).v === DIR.email && ((B.prog(org, 'users') || {}).map || {})[DIR.email].role === 'director', JSON.stringify([B.prog(org, 'org'), B.prog(org, 'users')]));
    await until(() => B.rows('np_demo_agreements').some((x) => x.org_id === org));
    const ag = B.rows('np_demo_agreements').find((x) => x.org_id === org);
    check('the signed agreement is saved for the team, with who signed it', !!ag && JSON.stringify(ag).includes(DIR.name), JSON.stringify(ag || {}).slice(0, 200));
    await reload(page);
    const r = await page.evaluate(() => ({ role: state.role, gate: !!window._gateLock, onb: el('onbRoot').classList.contains('on'), team: agencyName() }));
    check('after a reload: straight back in, no setup, no agreement again', r.role === 'director' && !r.gate && !r.onb && /Harbor Care/.test(r.team), JSON.stringify(r));
  }

  // ---------------- 2. sign out, a wrong password, sign back in, forgot password ----------------
  {
    const page = D.page;
    await go(page, 'profile');
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), btn(page, '#view', 'Sign out').click()]);   // it reloads, so nothing of the account stays in the tab
    await booted(page); await settle(page, 400);
    check('Sign out goes to the sign-in page', await page.evaluate(() => getComputedStyle(el('login')).display !== 'none' && !el('app').classList.contains('on')));
    await page.fill('#liEmail', DIR.email); await page.fill('#liPw', 'not-the-password'); await page.click('#liGo'); await settle(page, 800);
    const err = await page.evaluate(() => (el('liErr') || {}).innerText || '');
    check('a wrong password is refused with a plain message', /password|incorrect|didn|not/i.test(err) && await page.evaluate(() => !el('app').classList.contains('on')), err);
    await page.fill('#liPw', DIR.pw); await page.click('#liGo'); await inApp(page); await settle(page, 1200);
    check('the right one opens the same team as its director', await page.evaluate(() => state.role === 'director' && /Harbor Care/.test(agencyName())));
    // forgot password, from a second browser
    const X = await open();
    await X.page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(X.page);
    await X.page.click('text=Forgot password?'); await X.page.fill('#fpEmail', DIR.email); await X.page.click('#fpGo'); await settle(X.page, 600);
    check('Forgot password? asks the server to email a reset link and says so', B.mails.some((m) => m.action === 'request' && m.email === DIR.email) && /reset link is on its way/.test(await X.page.evaluate(() => el('fpMsg').innerText)), JSON.stringify(B.mails));
    await X.ctx.close();
  }

  // ---------------- 3. a home, a program and a client ----------------
  const org = B.myOrg(DIR.email);
  {
    const page = D.page;
    await go(page, 'clients'); await btn(page, '#view', 'Add client').click(); await settle(page, 400);
    await page.fill('#clUci', UCI); await page.fill('#clAge', '41');
    await addOption(page, '#clHome', 'Pier House');
    await addOption(page, '#clDx', 'Supported living');
    await page.fill('#clGuard', 'Guardian on file'); await page.fill('#clAlerts', 'Allergy: latex'); await page.fill('#clSupport', 'Likes a written plan for the day.');
    await btn(page, '#view', 'Save client').click(); await settle(page, 600);
    await until(() => B.rows('np_demo_clients').some((x) => x.uci === UCI));
    const row = B.rows('np_demo_clients').find((x) => x.uci === UCI) || {};
    check('Add client saves the client for the team, with the new home and program', row.org_id === org && row.home === 'Pier House' && /Supported living/.test(row.dx || '') && String(row.age) === '41', JSON.stringify(row).slice(0, 300));
    check('the new home is kept as one of the team’s homes', JSON.stringify(B.prog(org, 'homes') || {}).includes('Pier House'), JSON.stringify(B.prog(org, 'homes')));
    await reload(page); await go(page, 'clients');
    check('after a reload the client is listed on Clients', (await page.evaluate(() => el('view').innerText)).includes(UCI));
  }

  // ---------------- 4. add a staff member with an invite; they join from the emailed link ----------------
  const S = await open();
  let sid = '';
  {
    const page = D.page;
    await go(page, 'team'); await btn(page, '#view', 'Add staff').click(); await settle(page, 400);
    await page.fill('#sfName', STF.name); await page.fill('#sfInit', 'S.R.'); await page.fill('#sfRole', 'Direct Support Professional');
    await page.selectOption('#sfHome', 'Pier House'); await page.fill('#sfHired', today); await page.fill('#sfEmail', STF.email);
    check('the invite tick is on by default', await page.isChecked('#sfInvite'));
    await btn(page, '#modal', 'Add staff member').click(); await settle(page, 800);
    await until(() => B.relay.some((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite'));
    const st = B.rows('np_demo_staff').find((x) => x.email === STF.email) || {};
    sid = st.id;
    const iv = B.rows('np_demo_invites').find((x) => x.email === STF.email) || {};
    const mail = (B.relay.find((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite') || {}).payload || {};
    check('the staff record is saved for the team', st.org_id === org && st.name === STF.name && st.home === 'Pier House', JSON.stringify(st).slice(0, 200));
    check('an invite is saved for their email, tied to their record', iv.org_id === org && iv.sid === sid && !!iv.token, JSON.stringify(iv).slice(0, 200));
    check('the invite email goes to them with the link that opens their sign-up', mail.to === STF.email && mail.link === env.BASE + '/portal.html?join=' + iv.token, JSON.stringify(mail).slice(0, 300));
    // their browser
    const sp = S.page;
    await sp.goto(mail.link, { waitUntil: 'load' }); await booted(sp);
    await sp.waitForFunction(() => /Join/.test((el('loginTitle') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
    const j = await sp.evaluate(() => ({ title: el('loginTitle').textContent, email: el('liEmail').value }));
    check('the link opens Join Harbor Care with their email filled in', /Join Harbor Care/.test(j.title) && j.email === STF.email, JSON.stringify(j));
    await sp.fill('#liPw', STF.pw); if (await sp.locator('#liPw2').count()) await sp.fill('#liPw2', STF.pw);
    await sp.click('#liGo');
    await sp.waitForFunction(() => typeof state !== 'undefined' && state.role === 'staff', null, { timeout: 20000 }).catch(() => {});
    await settle(sp, 1500);
    const su = B.users.find((x) => x.email === STF.email);
    const mem = B.members.filter((m) => su && m.user_id === su.id);
    check('joining puts their login in Harbor Care as staff, and the empty team their sign-up made is gone', mem.length === 1 && mem[0].org_id === org && mem[0].role === 'staff', JSON.stringify(mem));
    check('the invite is used up', !!(B.rows('np_demo_invites').find((x) => x.email === STF.email) || {}).used_at);
    check('they sign the pilot agreement as a user of the team’s pilot', await signPilot(sp, { name: STF.name, title: 'Direct Support Professional' }) && await sp.evaluate(() => !window._gateLock));
    const v = await sp.evaluate((u) => ({ role: state.role, team: agencyName(), me: (PERSON || {}).name, client: visibleClients().map((c) => c.uci).includes(u) }), UCI);
    check('they see the staff view of Harbor Care, as themselves, with the client in their home', v.role === 'staff' && /Harbor Care/.test(v.team) && v.me === STF.name && v.client, JSON.stringify(v));
    await until(() => ((B.prog(org, 'users') || {}).map || {})[STF.email]);
    const ent = ((B.prog(org, 'users') || {}).map || {})[STF.email] || {};
    check('the team list has them as staff, tied to their staff record', ent.role === 'staff' && ent.sid === sid, JSON.stringify(ent));
    await reload(sp);
    check('after a reload they are still in, as staff', await sp.evaluate(() => state.role === 'staff' && !window._gateLock));
  }

  // ---------------- 5. a task: assigned by the director, done by the staff member ----------------
  {
    const page = D.page, sp = S.page;
    await go(page, 'tasks'); await btn(page, '#view', 'Assign task').click(); await settle(page, 300);
    await page.fill('#ntTitle', 'Update the face sheet'); await page.selectOption('#ntWho', sid); await page.fill('#ntDue', today);
    await page.selectOption('#ntClient', { label: 'Client ' + UCI }).catch(async () => { const v = await page.evaluate((u) => [...el('ntClient').options].find((o) => o.text.includes(u)).value, UCI); await page.selectOption('#ntClient', v); });
    await btn(page, '#modal', 'Assign task').click(); await settle(page, 600);
    await until(() => B.rows('np_demo_tasks').some((t) => t.title === 'Update the face sheet'));
    const t = B.rows('np_demo_tasks').find((x) => x.title === 'Update the face sheet') || {};
    check('Assign task saves it for the team, for Sam, for the client, due today', t.org_id === org && t.sid === sid && !!t.cid && t.due === today && t.stage === 'Not started', JSON.stringify(t).slice(0, 250));
    await until(() => B.rows('np_demo_notifications').some((n) => n.kind === 'task' && n.for_staff === sid));
    check('Sam gets a "Task assigned" notification in the portal', B.rows('np_demo_notifications').some((n) => n.kind === 'task' && n.for_staff === sid && /Task assigned/.test(n.title)));
    await reload(sp); await go(sp, 'tasks');
    const v = await sp.evaluate(() => ({ text: el('view').innerText, badge: (document.querySelector('.nav-item[onclick="go(\'tasks\')"] .badge') || {}).innerText || '' }));
    check('Sam sees it on My tasks, with a count on Tasks', /Update the face sheet/.test(v.text) && v.badge === '1', JSON.stringify({ badge: v.badge }));
    await sp.locator('#view :text("Update the face sheet")').first().click(); await settle(sp, 500);
    await btn(sp, '#drawer', 'Mark done').click(); await settle(sp, 800);
    await until(() => (B.rows('np_demo_tasks').find((x) => x.title === 'Update the face sheet') || {}).stage === 'Done');
    const t2 = B.rows('np_demo_tasks').find((x) => x.title === 'Update the face sheet') || {};
    check('Mark done saves it as done', t2.stage === 'Done', JSON.stringify(t2).slice(0, 250));
    await reload(page);
    check('the director sees it done after a reload', await page.evaluate(() => (TASKS.find((x) => x.title === 'Update the face sheet') || {}).stage === 'Done'));
  }

  // ---------------- 6. messages, both ways, without reloading ----------------
  {
    const page = D.page, sp = S.page;
    await reload(sp); await go(sp, 'messages');                       // Sam has Messages open before anything is sent
    await go(page, 'messages');
    const team = await page.evaluate(() => [...document.querySelectorAll('#msgTeam .team-i')].map((x) => x.innerText.replace(/\s+/g, ' ')));
    check('the director’s Messages lists Sam in the team', team.length === 1 && /Sam Rivera/.test(team[0]), JSON.stringify(team));
    await page.locator('#msgTeam .team-i').first().click(); await settle(page, 400);
    check('a click on Sam opens a new message to Sam', await page.evaluate((sid) => el('modal').classList.contains('on') && el('nmTo').value === 'staff:' + sid, sid));
    await page.fill('#nmSub', 'Face sheet'); await page.fill('#nmBody', 'Can you check the face sheet for ' + UCI + ' today?');
    await btn(page, '#modal', 'Send message').click(); await settle(page, 600);
    await until(() => B.rows('np_demo_messages').length === 1);
    const th = B.rows('np_demo_threads')[0] || {}, m = B.rows('np_demo_messages')[0] || {};
    check('the conversation and its message are saved for the team, from Hana to Sam', th.org_id === org && th.to_ref === sid && th.from_email === DIR.email && m.thread_id === th.id && m.author_email === DIR.email, JSON.stringify([th, m]).slice(0, 300));
    check('a new conversation is unread for the person it is sent to (v12.39)', th.unread === 1, JSON.stringify(th).slice(0, 200));
    check('Sam gets a "New message" notification', B.rows('np_demo_notifications').some((n) => n.kind === 'msg' && n.for_staff === sid));
    // Sam's page picks it up on its own (every 30 seconds while Messages is open)
    const got = await sp.waitForFunction((id) => !!document.querySelector('#view .thread-i') && THREADS.some((t) => t.id === id), th.id, { timeout: 40000 }).then(() => true).catch(() => false);
    check('Sam’s open Messages page shows it without a reload (v12.39)', got);
    const un = await sp.evaluate(() => ({ list: (document.querySelector('#view .thread-i') || {}).innerText || '', badge: (el('msgBadge') || {}).textContent || '' }));
    check('with an unread count on the conversation and on the Messages button', /1/.test(un.list) && un.badge === '1', JSON.stringify(un));
    await sp.locator('#view .thread-i').first().click(); await settle(sp, 600);
    await until(() => (B.rows('np_demo_threads')[0] || {}).unread === 0);
    check('opening it marks it read', (B.rows('np_demo_threads')[0] || {}).unread === 0 && await sp.evaluate(() => (el('msgBadge') || {}).style.display === 'none'));
    // Hana is typing in the same conversation when Sam answers
    await page.locator('#view .thread-i').first().click(); await settle(page, 300);
    await page.fill('#msgIn', 'Also the IPP');
    await sp.fill('#msgIn', 'Will do, done by 3pm.'); await btn(sp, '#view', '↑').click(); await settle(sp, 600);
    await until(() => B.rows('np_demo_messages').length === 2);
    const r = B.rows('np_demo_messages')[1] || {};
    check('Sam’s reply is saved in the same conversation, as Sam', r.thread_id === th.id && r.author_email === STF.email && r.body === 'Will do, done by 3pm.', JSON.stringify(r).slice(0, 200));
    const urls = []; const seen = (r) => { if (/np_demo_messages/.test(r.url()) && r.method() === 'GET') urls.push(decodeURIComponent(r.url())); };
    page.on('request', seen);
    await page.evaluate(() => msgPull());                             // what the 30-second tick runs
    page.off('request', seen);
    await settle(page, 400);
    const d = await page.evaluate(() => ({ text: el('view').innerText, draft: el('msgIn').value }));
    check('the read asks only for messages newer than the newest one the page has', urls.length === 1 && /created_at=gt\.\d{4}-/.test(urls[0]), JSON.stringify(urls));
    check('the reply shows on Hana’s open conversation without a reload, and what she was typing is kept', /Will do, done by 3pm\./.test(d.text) && d.draft === 'Also the IPP', JSON.stringify({ draft: d.draft }));
    check('her open conversation is marked read', (B.rows('np_demo_threads')[0] || {}).unread === 0);
    await reload(page); await go(page, 'messages');
    const all = await page.evaluate(() => (THREADS.find((t) => t.sub === 'Face sheet') || { msgs: [] }).msgs.map((x) => (x.me ? 'me' : x.w) + ': ' + x.t));
    check('after a reload the conversation reads in order, the director’s own words as hers', all.length === 2 && /^me: Can you check/.test(all[0]) && all[1] === 'Sam Rivera: Will do, done by 3pm.', JSON.stringify(all));
    check('no message went out through the relay with its words (only notifications by kind)', !B.relay.some((x) => JSON.stringify(x.payload || {}).includes('face sheet')));
  }

  // ---------------- 7. Ask Spectrum: what goes out, what comes back, the links, past chats ----------------
  {
    const page = D.page;
    B.askReply = null;
    const ask = async (q) => {
      await page.fill('#askInput', q); await page.locator('#askPanel .ask-in button[aria-label="Send"]').click();
      await page.waitForFunction(() => !el('askWait'), null, { timeout: 15000 }).catch(() => {}); await settle(page, 300);
    };
    // the stand-in for the AI answers with the labels the page sent, a page link and a document link
    B.askReply = null;
    const replyFor = (p) => { const lab = ((p.context || '') + ' ' + p.question).match(/Client \d+/); const hm = (p.context || '').match(/Home [A-Z]\b/); const doc = (p.context || '').match(/\[open:([A-Za-z0-9_-]+)\]/);
      return `${lab ? lab[0] : 'Nobody'} lives at ${hm ? hm[0] : 'no home'} and has no open tasks. [go:tasks]${doc ? ' [open:' + doc[1] + ']' : ''}`; };
    const prevAsk = B.rest;
    asks.length = 0;
    await page.evaluate(() => { closeAll(); toggleAsk(); }); await settle(page, 400);
    check('the Ask Spectrum panel opens', await page.evaluate(() => el('askPanel').classList.contains('on')));
    // answer from the request itself: queue a reply builder
    const origAsk = B.askReplyFn;
    B.askReplyFn = replyFor;
    await ask('What is coming up for ' + UCI + ' at Pier House?');
    const out = asks[0] || {};
    const sent = JSON.stringify(out);
    check('the question goes out through the relay, with the asker and their role', !!out.question && out.role === 'director' && out.user === DIR.name, sent.slice(0, 200));
    check('no UCI, home name or client name leaves the portal: labels go instead', !sent.includes(UCI) && !sent.includes('Pier House') && /Client 1/.test(out.question) && /Home A/.test(out.question), out.question);
    check('the team’s records go along as context, labelled the same way', /Client 1/.test(out.context || '') && !String(out.context || '').includes(UCI), String(out.context || '').slice(0, 200));
    const ans = await page.evaluate(() => { const m = [...document.querySelectorAll('#askLog .msg.bot')].pop(); return { text: m ? m.innerText : '', html: m ? m.innerHTML : '' }; });
    check('the answer comes back with the portal’s own names put back (the UCI and the home)', ans.text.includes(UCI) && ans.text.includes('Pier House') && !/Client 1|Home A/.test(ans.text), ans.text);
    check('[go:tasks] becomes a Go to Tasks button', /Go to Tasks/.test(ans.text));
    await page.locator('#askLog .msg.bot >> text=Go to Tasks').last().click(); await settle(page, 400);
    check('and the button opens Tasks', await page.evaluate(() => state.view === 'tasks'));
    await until(() => JSON.stringify(B.prog(org, 'askchats') || {}).includes('What is coming up'));
    const hist = B.prog(org, 'askchats') || {};
    check('the chat is kept under the director’s own name', Object.keys(hist.byUser || {}).some((k) => k.includes(DIR.email)) && JSON.stringify(hist).includes('What is coming up'), JSON.stringify(Object.keys(hist.byUser || {})));
    // a second question in the same chat carries the first as history, labelled
    await page.evaluate(() => { if (!el('askPanel').classList.contains('on')) toggleAsk(); });
    await ask('And who works there?');
    const h2 = asks[1] || {};
    check('a follow-up carries the chat so far, still with labels only', Array.isArray(h2.history) && h2.history.length === 1 && !JSON.stringify(h2.history).includes(UCI) && /Client 1/.test(JSON.stringify(h2.history)), JSON.stringify(h2.history || []).slice(0, 200));
    // past chats after a reload
    await reload(page);
    await page.evaluate(() => { closeAll(); toggleAsk(); askHistory(); }); await settle(page, 400);
    const past = await page.evaluate(() => el('modal').innerText);
    check('after a reload, Past chats lists the chat', /What is coming up/.test(past) && /4 messages/.test(past), past.slice(0, 200));
    await page.locator('#modal .docrow').first().click(); await settle(page, 400);
    check('opening it shows the questions and answers again', await page.evaluate(() => /What is coming up/.test(el('askLog').innerText) && /no open tasks/.test(el('askLog').innerText)));
    // the AI service down: a plain answer from the portal itself, not a hang
    B.askReplyFn = () => ({ status: 502, body: { error: 'n8n down' } });
    await page.evaluate(() => askNew()); await ask('How many open tasks do I have?');
    const fb = await page.evaluate(() => { const m = [...document.querySelectorAll('#askLog .msg.bot')].pop(); return m ? m.innerText : ''; });
    check('with the AI service down it still answers from the portal’s own records', !!fb && !/Thinking/.test(fb), fb);
    B.askReplyFn = origAsk;
    await page.evaluate(() => toggleAsk());
  }

  // ---------------- 8. the calendar: an appointment the director books, the staff member sees ----------------
  {
    const page = D.page, sp = S.page;
    await go(page, 'calendar'); await btn(page, '#view', 'Add item').click(); await settle(page, 300);
    await page.locator('.cx-menu button:has-text("Appointment")').first().click(); await settle(page, 400);
    const cv = await page.evaluate((u) => [...el('apClient').options].find((o) => o.text.includes(u)).value, UCI);
    await page.selectOption('#apClient', cv); await page.fill('#apTitle', 'Dental cleaning'); await page.fill('#apDate', today); await page.fill('#apTime', '15:30');
    await page.fill('#apProv', 'Dr. Ames'); await page.fill('#apLoc', 'Bayside Dental');
    check('“Also send to Google Calendar” is ticked to start with', await page.isChecked('#apGcal'));
    await page.locator('#apGcal').uncheck();                          // not this time
    await page.locator('#modal .md-foot button.navy, #modal button:has-text("Save")').last().click(); await settle(page, 700);
    await until(() => B.rows('np_demo_appointments').some((x) => x.title === 'Dental cleaning'));
    const ap = B.rows('np_demo_appointments').find((x) => x.title === 'Dental cleaning') || {};
    check('the appointment is saved for the team, for the client, at 3:30 pm today', ap.org_id === org && !!ap.cid && ap.appt_date === today && /^15:30/.test(ap.appt_time || ''), JSON.stringify(ap).slice(0, 250));
    check('nothing is sent to Google or the calendar workflow when it is not ticked', !B.relay.some((r) => r.action === 'calendar'));
    await reload(sp); await go(sp, 'calendar');
    check('Sam sees it on the calendar after a reload', await sp.evaluate(() => APPTS.some((a) => a.title === 'Dental cleaning' && !a.cancelled) && /Dental cleaning/.test(el('view').innerText)));
    await go(sp, 'home');
    check('and on his Home page for today', /Dental cleaning/.test(await sp.evaluate(() => el('view').innerText)));
  }

  // ---------------- 9. an incident the staff member files, the director follows up ----------------
  {
    const page = D.page, sp = S.page;
    await go(sp, 'incidents'); await btn(sp, '#view', 'Report an incident').click(); await settle(sp, 400);
    const types = await sp.evaluate(() => [...el('icType').options].map((o) => o.value).filter((v) => v && v !== '__add__'));
    check('a new team has no incident types yet; staff can add one from the form', types.length === 0, JSON.stringify(types));
    await addOption(sp, '#icType', 'Fall');
    await sp.fill('#tg7', 'Slipped on the wet kitchen floor, no injury.');
    await btn(sp, '#modal', 'File report').click(); await settle(sp, 900);
    await until(() => B.rows('np_demo_incidents').length === 1);
    const inc = B.rows('np_demo_incidents')[0] || {};
    check('the report is saved for the team, as Sam’s, for the client', inc.org_id === org && inc.type === 'Fall' && !!inc.cid && /Slipped/.test(inc.summary || ''), JSON.stringify(inc).slice(0, 250));
    const ev = (B.relay.find((r) => r.action === 'incident') || {}).payload || {};
    check('the incident notice goes out without the client’s ID or the story', ev.type === 'Fall' && !JSON.stringify(ev).includes(UCI) && !JSON.stringify(ev).includes('Slipped'), JSON.stringify(ev));
    check('the completed form is filed for the client (Agency binder, SIR)', B.rows('np_demo_documents').some((d) => /Fall|incident|SIR/i.test(d.n || '') ) || B.rows('np_demo_example_docs').some((d) => /SIR|incident/i.test(JSON.stringify(d))), JSON.stringify(B.rows('np_demo_documents').map((d) => d.n)));
    await closeModal(sp);
    await reload(page);
    const dv = await page.evaluate(() => ({ open: visIncidents().filter((i) => i.status !== 'Closed').map((i) => i.type), badge: (document.querySelector('.nav-item[onclick="go(\'safety\')"] .badge') || {}).innerText || '' }));
    check('the director sees it as an open incident, counted on the Safety log', dv.open.includes('Fall') && dv.badge === '1', JSON.stringify(dv));
  }

  // ---------------- 10. the safety logs: a fire drill and a water temperature ----------------
  {
    const sp = S.page;
    await go(sp, 'safety'); await btn(sp, '#view', 'Log a drill').click(); await settle(sp, 500);
    await sp.locator('#inspFull select').first().selectOption('Pier House');
    await sp.locator('#inspFull input[type="time"]').first().fill('10:00');
    await sp.locator('#inspFull input[type="number"]').first().fill('3');
    await sp.locator('#inspFull button:has-text("Yes")').first().click(); await settle(sp, 200);
    await sp.locator('#inspFull button:has-text("Complete")').first().click(); await settle(sp, 900);
    await until(() => B.rows('np_demo_inspections').some((r) => r.kind !== 'template'));
    const run = B.rows('np_demo_inspections').find((r) => r.kind !== 'template') || {};
    check('a fire drill logged by staff is filed for the team', run.org_id === org && /drill/i.test(JSON.stringify(run)), JSON.stringify(run).slice(0, 250));
    await reload(D.page); await go(D.page, 'safety');
    check('the director sees this month’s drill on the Safety log', !/No drill logged this month/.test(await D.page.evaluate(() => el('view').innerText)));
  }

  // ---------------- 11. a note on the client, the directory and the change log ----------------
  {
    const page = D.page, sp = S.page;
    await go(sp, 'clients'); await sp.locator('#view :text("' + UCI + '")').first().click(); await settle(sp, 500);
    await sp.fill('#cnNew', 'Prefers the 3pm slot for appointments.'); await sp.locator('#cnNew').press('Enter'); await settle(sp, 700);
    await until(() => B.rows('np_demo_client_notes').length === 1);
    const cn = B.rows('np_demo_client_notes')[0] || {};
    check('a note on the client is saved, by Sam', cn.org_id === org && /3pm slot/.test(cn.note || '') && /Sam|S\.R\./.test(cn.noted_by || ''), JSON.stringify(cn).slice(0, 200));
    await reload(page); await go(page, 'clients'); await page.locator('#view :text("' + UCI + '")').first().click(); await settle(page, 500);
    check('the director sees it on the client’s page', /3pm slot/.test(await page.evaluate(() => el('view').innerText)));
    await go(page, 'directory'); await btn(page, '#view', 'Add entry').click(); await settle(page, 300);
    await addOption(page, '#drCat', 'Pharmacy');
    await page.fill('#drName', 'Front desk'); await page.fill('#drOrg', 'Bayside Pharmacy'); await page.fill('#drPhone', '555-010-2000');
    await btn(page, '#modal', 'Add entry').click(); await settle(page, 600);
    await go(page, 'changelog'); await btn(page, '#view', 'Add entry').click(); await settle(page, 300);
    await page.selectOption('#ceCat', { index: 0 }).catch(() => {});
    if (!(await page.evaluate(() => el('ceCat').value)) || (await page.evaluate(() => el('ceCat').value)) === '__add__') await addOption(page, '#ceCat', 'Admin');
    await page.fill('#ceAct', 'Moved the med cart to the hallway'); await btn(page, '#modal', 'Add to the log').click(); await settle(page, 700);
    await reload(page);
    await go(page, 'directory');
    check('the directory entry is there after a reload', /Bayside Pharmacy/.test(await page.evaluate(() => el('view').innerText)));
    await go(page, 'changelog');
    check('the change log entry is there after a reload', /Moved the med cart/.test(await page.evaluate(() => el('view').innerText)));
    await reload(sp); await go(sp, 'directory');
    check('the directory is the director’s: Sam is told so, and sees no entries', /limited to the director/.test(await sp.evaluate(() => el('view').innerText)) && !/Bayside Pharmacy/.test(await sp.evaluate(() => el('view').innerText)));
  }

  // ---------------- 12. a form: Sam fills in and signs a face sheet, the director finds it ----------------
  let docName = '';
  {
    const page = D.page, sp = S.page;
    await go(sp, 'clients'); await sp.locator('#view :text("' + UCI + '")').first().click(); await settle(sp, 400);
    await btn(sp, '#view', 'Files').click(); await settle(sp, 300);
    await btn(sp, '#view', 'New from template').click(); await settle(sp, 400);
    await sp.locator('#modal .docrow:has-text("Face sheet") button:has-text("Start"), #modal div:has(> .dt:has-text("Face sheet")) button:has-text("Start")').first().click().catch(async () => { await sp.locator('#modal button:has-text("Start")').first().click(); });
    await settle(sp, 800);
    await sp.evaluate(() => { window.__did = Object.keys(USER_DOCS).find((k) => /^fx-/.test(k)); });
    const did = await sp.evaluate(() => window.__did);
    check('Start opens the face sheet as a draft for the client', !!did && await sp.evaluate(() => el('modal').classList.contains('on')), did);
    await sp.evaluate(([lab, v]) => { const d = docById(window.__did); const i = d.fields.findIndex((f) => f.l === lab); const n = el('dg' + i); n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); }, ['Allergies', 'Latex']);
    const sigLab = await sp.evaluate(() => { const d = docById(window.__did); const f = d.fields.find((x) => x.ty === 'signature'); return f ? f.l : ''; });
    await sp.evaluate((lab) => { const d = docById(window.__did); const i = d.fields.findIndex((f) => f.l === lab); document.querySelector(`#mdBody [data-sig="dg${i}"] .sig-slot`).click(); }, sigLab);
    await settle(sp, 150); await sp.evaluate(() => { if (!el('sigOv').classList.contains('typing')) sigOvMode(); });
    await sp.fill('#sigOv .sp-typed', STF.name); await sp.evaluate(() => sigUse()); await settle(sp, 200);
    await sp.evaluate(() => docFinalise(window.__did)); await settle(sp, 300);
    await sp.evaluate(() => { [...document.querySelectorAll('#mdFoot button')].find((b) => /Sign and finalize/.test(b.textContent)).click(); }); await settle(sp, 900);
    await until(() => B.rows('np_demo_documents').some((d) => /^Face sheet/.test(d.n || '') && d.cat === 'Completed form'));
    const row = B.rows('np_demo_documents').find((d) => /^Face sheet/.test(d.n || '') && d.cat === 'Completed form') || {};
    docName = row.n || '';
    check('signed and finalized by Sam: a completed form in the client’s file, saved for the team', row.org_id === org && !!row.cid && /Sam|S\.R\./.test(JSON.stringify(row)), JSON.stringify(row).slice(0, 250));
    await reload(page);
    const f = await page.evaluate((n) => { const d = DOCS.find((x) => x.n === n); const fid = d && d.fid; const fd = fid && FILED_DOCS[fid]; return { has: !!d, st: fd && fd.status, sig: fd && Object.values(fd.values || {}).includes(window.__nope || 'Sam Rivera'), allergy: fd && fd.values && fd.values.Allergies, binder: d && docBinderOf(d), tab: d && docSubOf(d, docBinderOf(d)) }; }, docName);
    check('the director sees it after a reload: final, signed by Sam, with his answers, under Agency / Face Sheet', f.has && f.st === 'final' && f.sig && f.allergy === 'Latex' && f.binder === 'Agency' && f.tab === 'Face Sheet', JSON.stringify(f));
    await go(page, 'clients'); await page.locator('#view :text("' + UCI + '")').first().click(); await settle(page, 400); await btn(page, '#view', 'Files').click(); await settle(page, 300);
    const ft = await page.evaluate(() => el('view').innerText);
    check('the client’s Files count it in the Agency binder (with the incident report from 9)', /AGENCY BINDER\s+2 files/i.test(ft), (ft.match(/AGENCY BINDER[\s\S]{0,40}/i) || [ft.slice(0, 300)])[0]);
  }

  // ---------------- 13. Ask Spectrum’s links to a document and to pages ----------------
  {
    const page = D.page;
    const id = await page.evaluate((n) => (DOCS.find((x) => x.n === n) || {}).id, docName);
    B.askReplyFn = () => `It is filed. [open:${id}] [go:documents] [go:staff]`;
    await page.evaluate(() => { closeAll(); if (!el('askPanel').classList.contains('on')) toggleAsk(); askNew(); });
    await page.fill('#askInput', 'Where is the face sheet?'); await page.locator('#askPanel .ask-in button[aria-label="Send"]').click();
    await page.waitForFunction(() => !el('askWait'), null, { timeout: 15000 }).catch(() => {}); await settle(page, 300);
    const bts = await page.evaluate(() => [...[...document.querySelectorAll('#askLog .msg.bot')].pop().querySelectorAll('button')].map((b) => b.innerText));
    check('the answer has an Open button for the document and Go to buttons for the pages', bts.some((t) => t.startsWith('Open ')) && bts.includes('Go to Documents') && bts.includes('Go to Staff'), JSON.stringify(bts));
    await page.locator('#askLog .msg.bot >> text=Go to Documents').last().click(); await settle(page, 400);
    check('Go to Documents opens Documents, not Home (v12.39)', await page.evaluate(() => state.view === 'templates' && /Documents/.test(el('view').innerText.slice(0, 200))));
    await page.evaluate(() => { if (!el('askPanel').classList.contains('on')) toggleAsk(); }); await page.locator('#askLog .msg.bot >> text=Go to Staff').last().click(); await settle(page, 400);
    check('Go to Staff opens Staff, not Home (v12.39)', await page.evaluate(() => state.view === 'team' && /Sam Rivera/.test(el('view').innerText)));
    await page.evaluate(() => { if (!el('askPanel').classList.contains('on')) toggleAsk(); }); await page.locator('#askLog .msg.bot button:has-text("Open ")').last().click(); await settle(page, 700);
    check('Open opens the signed face sheet itself, read-only, from the client’s Files (v12.39)', await page.evaluate(() => el('modal').classList.contains('on') && /Face sheet/.test(el('mdTitle').innerText) && !document.querySelector('#mdBody input.inp') && state.view === 'clients'));
    await closeModal(page); await page.evaluate(() => { if (el('askPanel').classList.contains('on')) toggleAsk(); });
    const ctx0 = (asks[asks.length - 1] || {}).context || '';
    check('the snapshot Ask reads gives the signed form a link of its own (v12.39)', ctx0.includes('[open:' + id + ']'), (ctx0.match(/Client file documents[\s\S]{0,200}/) || [''])[0]);
    check('the snapshot Ask reads names the signed-in director as the viewer, not a sample name', ctx0.includes('Viewer: ' + DIR.name) || !/Rosa Castillo/.test(ctx0), (ctx0.match(/Viewer:[^.]*/) || [''])[0]);
    B.askReplyFn = null;
  }

  // ---------------- 14. a shift and a credential for Sam ----------------
  {
    const page = D.page, sp = S.page;
    await go(page, 'team'); await btn(page, '#view', 'Add shift').click(); await settle(page, 300);
    await page.selectOption('#shWho', sid); await page.fill('#shDate', today); await page.fill('#shStart', '00:00'); await page.fill('#shEnd', '23:59');
    await page.selectOption('#shHome', 'Pier House'); await btn(page, '#modal', 'Add shift').click(); await settle(page, 700);
    await until(() => B.rows('np_demo_shifts').some((x) => x.staff_id === sid));
    const sh = B.rows('np_demo_shifts').find((x) => x.staff_id === sid) || {};
    check('the shift is saved for the team, for Sam, today at Pier House', sh.org_id === org && sh.shift_date === today && sh.home === 'Pier House', JSON.stringify(sh).slice(0, 200));
    await go(page, 'team'); await page.locator('#view :text("Sam Rivera")').first().click(); await settle(page, 500);
    await btn(page, '#view', 'Add credential').click(); await settle(page, 300);
    const soon = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
    await page.fill('#crName', 'CPR and first aid'); await page.fill('#crExp', soon); await btn(page, '#modal', 'Save').click(); await settle(page, 700);
    await until(() => B.rows('np_demo_credentials').some((x) => x.sid === sid));
    const cr = B.rows('np_demo_credentials').find((x) => x.sid === sid) || {};
    check('the credential is saved for Sam, with its expiry', cr.org_id === org && cr.cred_name === 'CPR and first aid' && cr.expires_on === soon, JSON.stringify(cr).slice(0, 200));
    await reload(sp);
    const h = await sp.evaluate(() => el('view').innerText);
    check('Sam’s My shift page shows him on shift now, at Pier House', /Pier House/.test(h) && await sp.evaluate(() => shiftsNow().some((x) => x.sid === meSid())), h.slice(0, 200));
    await go(sp, 'profile');
    check('his profile lists the credential as expiring soon', /CPR and first aid/.test(await sp.evaluate(() => el('view').innerText)));
  }

  // ---------------- 15. the director renames a menu; everyone sees the team’s word ----------------
  {
    const page = D.page, sp = S.page;
    await page.evaluate(() => { closeAll(); labelsForm(); }); await settle(page, 300);
    await page.fill('#modal input[data-lbl="clients"]', 'People we support'); await btn(page, '#modal', 'Save names').click(); await settle(page, 700);
    await until(() => ((B.prog(org, 'labels') || {}).map || {}).clients === 'People we support');
    check('the new name is saved for the team', ((B.prog(org, 'labels') || {}).map || {}).clients === 'People we support', JSON.stringify(B.prog(org, 'labels')));
    await reload(sp);
    check('Sam’s menu says People we support after a reload', await sp.evaluate(() => [...document.querySelectorAll('.nav-item')].some((b) => /People we support/.test(b.innerText))));
  }

  // ---------------- 16. the director removes Sam’s access ----------------
  {
    const page = D.page, sp = S.page;
    await page.evaluate(() => { closeAll(); openSettings(); }); await settle(page, 400);
    await page.locator('#drawer div:has(> span:has-text("Sam Rivera")) button:has-text("Remove")').first().click().catch(async () => { await page.evaluate((em) => teamAccessRemove(em), STF.email); });
    await settle(page, 300);
    await page.locator('#mdFoot button:has-text("Remove access")').click(); await settle(page, 900);
    const su = B.users.find((x) => x.email === STF.email);
    await until(() => !B.members.some((m) => m.user_id === su.id && m.org_id === org));
    check('Remove access takes Sam’s login out of the team (his staff record stays)', !B.members.some((m) => m.user_id === su.id && m.org_id === org) && B.rows('np_demo_staff').some((x) => x.id === sid), JSON.stringify(B.members));
    await sp.reload({ waitUntil: 'load' }); await booted(sp); await settle(sp, 2500);
    const r = await sp.evaluate(() => ({ app: el('app').classList.contains('on'), login: getComputedStyle(el('login')).display !== 'none', err: (el('liErr') || {}).innerText || '', clients: typeof visibleClients === 'function' ? visibleClients().length : -1 }));
    check('Sam’s next visit no longer opens Harbor Care, and says why', !r.app && r.login, JSON.stringify(r));
    await sp.fill('#liEmail', STF.email); await sp.fill('#liPw', STF.pw); await sp.click('#liGo'); await settle(sp, 1500);
    const r2 = await sp.evaluate(() => ({ app: el('app').classList.contains('on'), err: (el('liErr') || {}).innerText || '' }));
    check('signing in again is refused with a plain reason', !r2.app && /isn.t part of a team|new invite/i.test(r2.err), JSON.stringify(r2));
  }

  // ---------------- 17. a second team on the same computer sees nothing of the first ----------------
  {
    const page = D.page;
    await go(page, 'profile');
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), btn(page, '#view', 'Sign out').click()]); await booted(page); await settle(page, 400);
    await page.click('text=Get your team started');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'regOrg');   // the form puts the cursor in Team name a moment after it opens
    await page.fill('#regOrg', 'Cove Care'); await page.fill('#regName', 'Kai Moss'); await page.fill('#regRole', 'Program Director');
    await page.fill('#liEmail', 'kai@cove.test'); await page.fill('#liPw', 'cove-pass-12'); await page.click('#liGo');
    await page.waitForFunction(() => el('onbRoot') && el('onbRoot').classList.contains('on'), null, { timeout: 20000 });
    const pre = await page.evaluate(() => el('onbRoot').innerText);
    check('the new team’s setup carries nothing of Harbor Care', !/Harbor Care|Hana/.test(pre), pre.slice(0, 120));
    for (let i = 0; i < 8; i++) { if (!(await page.evaluate(() => el('onbRoot').classList.contains('on')))) break; await page.locator('#onbRoot .opt >> visible=true').first().click().catch(() => {}); await page.locator('#onbRoot #next').click(); await settle(page, 400); }
    await inApp(page); await settle(page, 1500); await signPilot(page, { org: 'Cove Care', name: 'Kai Moss', title: 'Program Director' });
    const org2 = B.myOrg('kai@cove.test');
    const k = await page.evaluate((u) => ({ team: agencyName(), clients: visibleClients().length, staff: visibleStaff().length, tasks: myTasks().length, threads: visThreads().length, appts: APPTS.filter((a) => !a._seed && a.title === 'Dental cleaning').length, inc: visIncidents().length, text: document.body.innerText.includes(u) }), UCI);
    check('Cove Care is its own team, empty: no clients, staff, tasks, messages, appointments or incidents of Harbor Care', org2 && org2 !== org && /Cove Care/.test(k.team) && !k.clients && !k.staff && !k.tasks && !k.threads && !k.appts && !k.inc && !k.text, JSON.stringify(k));
    check('and its menus have the standard names, not Harbor Care’s', await page.evaluate(() => [...document.querySelectorAll('.nav-item')].some((b) => /^\s*Clients/.test(b.innerText)) && ![...document.querySelectorAll('.nav-item')].some((b) => /People we support/.test(b.innerText))));
    // and back to Harbor Care
    await go(page, 'profile');
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), btn(page, '#view', 'Sign out').click()]); await booted(page); await settle(page, 400);
    await page.evaluate(() => { try { loginOtherAccount(); } catch (e) {} });
    await page.fill('#liEmail', DIR.email); await page.fill('#liPw', DIR.pw); await page.click('#liGo'); await inApp(page); await settle(page, 1500);
    const h = await page.evaluate((u) => ({ team: agencyName(), client: visibleClients().some((c) => c.uci === u), cove: document.body.innerText.includes('Cove Care') }), UCI);
    check('Hana signing back in on the same computer gets Harbor Care back, with nothing of Cove Care', /Harbor Care/.test(h.team) && h.client && !h.cove, JSON.stringify(h));
  }

  await S.ctx.close();
  await D.ctx.close();
  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n  ' + failures.join('\n  ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
