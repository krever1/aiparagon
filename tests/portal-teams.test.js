// Teams test for E-&-G-Home-Inc.html (#2, the care portal): one team of a director and five staff, each in their own
// browser, working both ways, and a second team signed up the same way that sees nothing of the first (and the other
// way round). Against the stand-in for the Supabase project (lib/portal-backend.js) with the per-role database rules
// (migration np_role_rules, Nov 6) on, so what each person can read is checked twice: on their screens, and straight
// from the database with their own sign-in, as someone using the browser's developer tools would.
//   Team one, Willow Grove Care: Marcus (director); Ana and Ben (Elm House), Cara and Dev (Oak House), Eli (All homes).
//   Team two, Pine Ridge Homes: Nora (director) and Finn (staff).
// Usage: node tests/portal-teams.test.js [baseline.html]   (NP_ROLE_RULES=off runs it against the database as it was before the rules)
const H = require('./lib/portal-harness');
const { makeBackend } = require('./lib/portal-backend');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const today = new Date().toISOString().slice(0, 10);
const T1 = { org: 'Willow Grove Care', name: 'Marcus Hale', title: 'Executive Director', email: 'marcus@willowgrove.test', pw: 'willow-pass-1' };
const T2 = { org: 'Pine Ridge Homes', name: 'Nora Vance', title: 'Program Director', email: 'nora@pineridge.test', pw: 'pine-pass-12' };
const STAFF = [
  { k: 'ana', name: 'Ana Ruiz', init: 'A.R.', home: 'Elm House', email: 'ana@willowgrove.test', pw: 'ana-pass-123' },
  { k: 'ben', name: 'Ben Cole', init: 'B.C.', home: 'Elm House', email: 'ben@willowgrove.test', pw: 'ben-pass-123' },
  { k: 'cara', name: 'Cara Diaz', init: 'C.D.', home: 'Oak House', email: 'cara@willowgrove.test', pw: 'cara-pass-123' },
  { k: 'dev', name: 'Dev Shah', init: 'D.S.', home: 'Oak House', email: 'dev@willowgrove.test', pw: 'dev-pass-1234' },
  { k: 'eli', name: 'Eli Moss', init: 'E.M.', home: 'All homes', email: 'eli@willowgrove.test', pw: 'eli-pass-1234' },
];
const FINN = { k: 'finn', name: 'Finn Lowe', init: 'F.L.', home: 'Pine House', email: 'finn@pineridge.test', pw: 'finn-pass-123' };
const UCI = { elm: '7350111', oak: '7350222', birch: '7350333', pine: '7350999' };
const TABLES = ['np_demo_clients', 'np_demo_staff', 'np_demo_threads', 'np_demo_messages', 'np_demo_notifications', 'np_demo_tasks',
  'np_demo_incidents', 'np_demo_client_notes', 'np_demo_credentials', 'np_demo_agreements', 'np_demo_audit_log', 'np_demo_shifts',
  'np_demo_documents', 'np_demo_appointments', 'np_demo_invites', 'np_demo_accounts', 'np_demo_program'];

(async () => {
  const env = await H.start(process.argv[2]);
  const B = makeBackend({ roleRules: process.env.NP_ROLE_RULES !== 'off' });   // NP_ROLE_RULES=off: the database before the role rules
  const errors = [];
  async function open() {
    const { ctx, page } = await H.newPage(env, { rest: B.rest, bucket: errors, viewport: { width: 1280, height: 860 } });
    await B.route(ctx);
    page.on('dialog', (d) => d.accept());
    return { ctx, page };
  }
  const booted = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  const inApp = (page) => page.waitForFunction(() => el('app').classList.contains('on') && typeof state !== 'undefined' && state.role, null, { timeout: 20000 });
  const settle = (page, ms) => page.waitForTimeout(ms || 500);
  const until = async (fn, ms) => { const end = Date.now() + (ms || 6000); while (Date.now() < end) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
  const go = async (page, v) => { await page.evaluate((v) => { closeAll(); go(v); }, v); await settle(page, 350); };
  const reload = async (page) => { await page.reload({ waitUntil: 'load' }); await booted(page); await inApp(page); await settle(page, 1300); };
  const btn = (page, scope, text) => page.locator(scope + ' button:has-text("' + text + '")').first();
  const text = (page) => page.evaluate(() => el('view').innerText);
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
  // straight from the database with this person's sign-in: every row of a table they are given
  const api = (page, t, q) => page.evaluate(async ([t, q]) => {
    const r = await fetch(BACKEND.url + '/rest/v1/' + t + '?' + (q || 'select=*'), { headers: sbH() });
    return r.ok ? r.json() : { status: r.status };
  }, [t, q]);
  const apiWrite = (page, method, t, q, body) => page.evaluate(async ([method, t, q, body]) => {
    const r = await fetch(BACKEND.url + '/rest/v1/' + t + (q ? '?' + q : ''), { method, headers: Object.assign({}, sbH(), { 'Content-Type': 'application/json' }), body: body ? JSON.stringify(body) : undefined });
    return r.status;
  }, [method, t, q, body]);

  async function newTeam(T) {
    const P = await open(), page = P.page;
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    await page.click('text=Get your team started');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'regOrg');
    await page.fill('#regOrg', T.org); await page.fill('#regName', T.name); await page.fill('#regRole', T.title);
    await page.fill('#liEmail', T.email); await page.fill('#liPw', T.pw);
    await page.click('#liGo');
    await page.waitForFunction(() => el('onbRoot') && el('onbRoot').classList.contains('on'), null, { timeout: 20000 });
    for (let i = 0; i < 8; i++) {
      if (!(await page.evaluate(() => el('onbRoot').classList.contains('on')))) break;
      await page.locator('#onbRoot .opt >> visible=true').first().click().catch(() => {});
      await page.locator('#onbRoot #next').click(); await settle(page, 400);
    }
    await inApp(page); await settle(page, 1300);
    await signPilot(page, T);
    return Object.assign(P, { org: B.myOrg(T.email) });
  }
  async function addClient(page, uci, home, isNewHome) {
    await go(page, 'clients'); await btn(page, '#view', 'Add client').click(); await settle(page, 400);
    await page.fill('#clUci', uci); await page.fill('#clAge', '40');
    if (isNewHome) await addOption(page, '#clHome', home); else await page.selectOption('#clHome', home);
    await btn(page, '#view', 'Save client').click(); await settle(page, 600);
  }
  async function addStaff(page, s) {
    await go(page, 'team'); await btn(page, '#view', 'Add staff').click(); await settle(page, 400);
    await page.fill('#sfName', s.name); await page.fill('#sfInit', s.init); await page.fill('#sfRole', 'Direct Support Professional');
    await page.selectOption('#sfHome', s.home); await page.fill('#sfHired', today); await page.fill('#sfEmail', s.email);
    await btn(page, '#modal', 'Add staff member').click(); await settle(page, 700);
    await until(() => B.relay.some((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite' && r.payload.to === s.email));
    s.sid = (B.rows('np_demo_staff').find((x) => x.email === s.email) || {}).id;
  }
  async function join(s, teamName) {
    const P = await open(), sp = P.page;
    const link = ((B.relay.find((r) => r.action === 'email' && r.payload && r.payload.kind === 'invite' && r.payload.to === s.email) || {}).payload || {}).link;
    await sp.goto(link, { waitUntil: 'load' }); await booted(sp);
    await sp.waitForFunction(() => /Join/.test((el('loginTitle') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
    await sp.fill('#liPw', s.pw); if (await sp.locator('#liPw2').count()) await sp.fill('#liPw2', s.pw);
    await sp.click('#liGo');
    await sp.waitForFunction(() => typeof state !== 'undefined' && state.role === 'staff', null, { timeout: 20000 }).catch(() => {});
    await settle(sp, 1200);
    await signPilot(sp, { name: s.name, title: 'Direct Support Professional' });
    await reload(sp);
    const v = await sp.evaluate(() => ({ role: state.role, me: meSid(), team: agencyName() }));
    check(`${s.name} joins ${teamName} from the emailed invite, as staff, as themselves`, v.role === 'staff' && v.me === s.sid && v.team.includes(teamName), JSON.stringify(v));
    return Object.assign(P, s);
  }
  // a conversation as each person's Messages page lists it
  const threadsSeen = (page) => page.evaluate(() => visThreads().map((t) => t.sub));
  async function newMessage(page, to, sub, body) {
    await go(page, 'messages'); await page.evaluate(() => openNewThread()); await settle(page, 300);
    await page.selectOption('#nmTo', to); await page.fill('#nmSub', sub); await page.fill('#nmBody', body);
    await btn(page, '#modal', 'Send message').click(); await settle(page, 700);
  }
  async function reply(page, sub, body) {
    await go(page, 'messages');
    await page.evaluate((sub) => { const t = visThreads().find((x) => x.sub === sub); state.thread = t && t.id; render(); }, sub); await settle(page, 400);
    await page.fill('#msgIn', body); await btn(page, '#view', '↑').click(); await settle(page, 700);
  }

  // ================= team one: the director, two houses, two clients, five staff who join from their invites =================
  const D = await newTeam(T1);
  check('Willow Grove Care is a team of its own, with Marcus as its director', !!D.org && await D.page.evaluate(() => state.role === 'director'));
  await addClient(D.page, UCI.elm, 'Elm House', true);
  await addClient(D.page, UCI.oak, 'Oak House', true);
  for (const s of STAFF) await addStaff(D.page, s);
  check('five staff records, each with an invite tied to it', STAFF.every((s) => s.sid && B.rows('np_demo_invites').some((i) => i.email === s.email && i.sid === s.sid && i.org_id === D.org)), JSON.stringify(STAFF.map((s) => s.sid)));
  const S = {};
  for (const s of STAFF) S[s.k] = await join(s, T1.org);
  check('all six are members of the one team: one director, five staff', B.members.filter((m) => m.org_id === D.org).map((m) => m.role).sort().join(',') === 'director,staff,staff,staff,staff,staff',
    JSON.stringify(B.members.filter((m) => m.org_id === D.org).map((m) => m.role)));

  // ================= the director's work reaches the staff =================
  // a client added after they joined
  await addClient(D.page, UCI.birch, 'Elm House');
  // a task for Ana, and one for Eli
  for (const [who, title] of [['ana', 'Refill the first-aid kit'], ['eli', 'Check the van tyres']]) {
    await go(D.page, 'tasks'); await btn(D.page, '#view', 'Assign task').click(); await settle(D.page, 300);
    await D.page.fill('#ntTitle', title); await D.page.selectOption('#ntWho', S[who].sid); await D.page.fill('#ntDue', today);
    await btn(D.page, '#modal', 'Assign task').click(); await settle(D.page, 500);
  }
  // a message to Ana alone, and one to everyone at Elm House
  await newMessage(D.page, 'staff:' + S.ana.sid, 'Ana only: schedule', 'Can you cover Saturday morning?');
  await newMessage(D.page, 'group:Elm House', 'Elm House: fire drill', 'Fire drill at Elm House on Friday at 10.');
  // a reminder for Cara, from her staff page
  await D.page.evaluate((sid) => { closeAll(); openStaffPage(sid); }, S.cara.sid); await settle(D.page, 400);
  await D.page.evaluate((sid) => reminderForm(sid), S.cara.sid); await settle(D.page, 300);
  await D.page.selectOption('#rmType', 'task').catch(() => {});
  await D.page.evaluate((sid) => { reminderItems(sid); if (!el('rmItem').value) { const o = document.createElement('option'); o.text = 'Hand-over notes — due today'; el('rmItem').appendChild(o); el('rmItem').value = o.text; } reminderSend(sid); }, S.cara.sid); await settle(D.page, 500);
  await until(() => B.rows('np_demo_notifications').some((n) => n.kind === 'remind' && n.for_staff === S.cara.sid));

  for (const s of STAFF) await reload(S[s.k].page);
  for (const s of STAFF) {
    const v = await S[s.k].page.evaluate(() => ({ clients: visibleClients().map((c) => c.uci) }));
    check(`${s.name} sees the client added after they joined (and the other two)`, [UCI.elm, UCI.oak, UCI.birch].every((u) => v.clients.includes(u)), JSON.stringify(v.clients));
  }
  {
    const ana = await S.ana.page.evaluate(() => myTasks().map((t) => t.title)), ben = await S.ben.page.evaluate(() => myTasks().map((t) => t.title));
    check('Ana sees the task assigned to her; Ben does not', ana.includes('Refill the first-aid kit') && !ben.includes('Refill the first-aid kit'), JSON.stringify({ ana, ben }));
    const annN = await S.ana.page.evaluate(() => SYS_NOTIFS.map((n) => n.t + ' ' + n.s).join(' | ')), benN = await S.ben.page.evaluate(() => SYS_NOTIFS.map((n) => n.t + ' ' + n.s).join(' | '));
    check('Ana gets the "Task assigned" notice; Ben does not', /Task assigned/.test(annN) && !/Refill the first-aid kit/.test(benN), (annN + ' || ' + benN).slice(0, 300));
  }
  {
    const seen = {}; for (const s of STAFF) seen[s.k] = await threadsSeen(S[s.k].page);
    check('Ana sees the message sent to her alone; none of the other four do', seen.ana.includes('Ana only: schedule') && ['ben', 'cara', 'dev', 'eli'].every((k) => !seen[k].includes('Ana only: schedule')), JSON.stringify(seen));
    check('the Elm House message reaches Ana, Ben and Eli (All homes), not Cara or Dev (Oak House)', ['ana', 'ben', 'eli'].every((k) => seen[k].includes('Elm House: fire drill')) && ['cara', 'dev'].every((k) => !seen[k].includes('Elm House: fire drill')), JSON.stringify(seen));
    const caraN = await S.cara.page.evaluate(() => SYS_NOTIFS.map((n) => n.t).join(' | ')), devN = await S.dev.page.evaluate(() => SYS_NOTIFS.map((n) => n.t).join(' | '));
    check('Cara gets the reminder the director sent her; Dev does not', /Reminder: Assigned task/.test(caraN) && !/Reminder/.test(devN), (caraN + ' || ' + devN).slice(0, 300));
  }
  for (const s of STAFF) {
    await go(S[s.k].page, 'profile');
    const tabs = await S[s.k].page.evaluate(() => [...document.querySelectorAll('#view .tabs button')].map((b) => b.textContent.trim()));
    check(`${s.name} has the team's onboarding checklist on their Profile`, tabs.some((t) => /^Onboarding · 0 of \d+/.test(t)), JSON.stringify(tabs));
  }

  // ================= the staff's work reaches the director =================
  await reply(S.ana.page, 'Ana only: schedule', 'Yes, I can cover Saturday.');
  {                                                                   // the To list offers the team's director by name
    await go(S.ben.page, 'messages'); await S.ben.page.evaluate(() => openNewThread()); await settle(S.ben.page, 300);
    const opts = await S.ben.page.evaluate(() => [...el('nmTo').options].map((o) => o.value + ' ' + o.text));
    check('Ben’s New message offers Marcus by name, and the other four staff', opts.some((o) => o.startsWith('director:' + 'marcus@willowgrove.test') && /Marcus Hale/.test(o)) && ['Ana Ruiz', 'Cara Diaz', 'Dev Shah', 'Eli Moss'].every((n) => opts.some((o) => o.includes(n))), JSON.stringify(opts));
    await S.ben.page.evaluate(() => closeAll());
    await newMessage(S.ben.page, 'director:' + T1.email, 'Ben to Marcus: overtime', 'Can we talk about overtime this week?');
  }
  await newMessage(S.ana.page, 'staff:' + S.dev.sid, 'Ana to Dev: swap', 'Want to swap Tuesday for Thursday?');
  // Cara reports an incident on the Oak House client
  await go(S.cara.page, 'incidents'); await btn(S.cara.page, '#view', 'Report an incident').click(); await settle(S.cara.page, 400);
  await addOption(S.cara.page, '#icType', 'Fall');
  await S.cara.page.evaluate((u) => { const s = el('icClient') || el('icCid'); if (s) { const o = [...s.options].find((x) => x.text.includes(u)); if (o) s.value = o.value; } }, UCI.oak);
  await S.cara.page.fill('#tg7', 'Slipped on the porch step, no injury.');
  await btn(S.cara.page, '#modal', 'File report').click(); await settle(S.cara.page, 900);
  await S.cara.page.evaluate(() => closeAll());
  // Dev writes a note on the Oak House client
  await go(S.dev.page, 'clients'); await S.dev.page.locator('#view :text("' + UCI.oak + '")').first().click(); await settle(S.dev.page, 500);
  await S.dev.page.fill('#cnNew', 'Likes a walk after lunch.'); await S.dev.page.locator('#cnNew').press('Enter'); await settle(S.dev.page, 700);
  // Eli finishes his task
  await S.eli.page.evaluate(() => { const t = myTasks().find((x) => x.title === 'Check the van tyres'); setStage(t.id, 'Done'); }); await settle(S.eli.page, 600);
  // Ana ticks her first onboarding step
  await go(S.ana.page, 'profile'); await S.ana.page.locator('#view .tabs button:has-text("Onboarding")').click(); await settle(S.ana.page, 300);
  await S.ana.page.locator('#view .checkrow').first().click(); await settle(S.ana.page, 500);
  // Ben adds a certification to his own record
  await S.ben.page.evaluate(() => { closeAll(); go('profile'); addMyCredential(); }); await settle(S.ben.page, 300);
  await S.ben.page.fill('#myCrName', 'CPR / First Aid'); await S.ben.page.fill('#myCrExp', '2027-06-30');
  await btn(S.ben.page, '#modal', 'Save').click(); await settle(S.ben.page, 600);
  await until(() => B.rows('np_demo_credentials').some((c) => c.sid === S.ben.sid));
  check('Ben’s certification is saved on his own record', B.rows('np_demo_credentials').some((c) => c.sid === S.ben.sid && /CPR/.test(c.cred_name)));
  await S.ana.page.evaluate(() => { closeAll(); go('profile'); addMyCredential(); }); await settle(S.ana.page, 300);
  await S.ana.page.fill('#myCrName', 'Food handler card'); await S.ana.page.fill('#myCrExp', '2027-03-31');
  await btn(S.ana.page, '#modal', 'Save').click(); await settle(S.ana.page, 600);
  await until(() => B.rows('np_demo_credentials').some((c) => c.sid === S.ana.sid));
  // what Ana asked Ask Spectrum (the n8n workflow saves it with its own key; written here as it would be)
  B.rows('np_demo_ask_log').push({ id: 9901, org_id: D.org, role: 'staff', asked_by: 'Ana Ruiz', question: 'What is due this week?', reply: 'Two tasks.', created_at: new Date().toISOString() });

  await reload(D.page);
  {
    const subs = await threadsSeen(D.page);
    check('Marcus sees every conversation in his team: his own, Ben’s to him, and Ana’s to Dev', ['Ana only: schedule', 'Elm House: fire drill', 'Ben to Marcus: overtime', 'Ana to Dev: swap'].every((x) => subs.includes(x)), JSON.stringify(subs));
    const anaReply = await D.page.evaluate(() => { const t = visThreads().find((x) => x.sub === 'Ana only: schedule'); return t ? (t.msgs || []).map((m) => m.t).join(' | ') : ''; });
    check('Ana’s reply is in Marcus’s conversation with her', /Yes, I can cover Saturday/.test(anaReply), anaReply);
    const dn = await D.page.evaluate(() => SYS_NOTIFS.map((n) => n.t + ' ' + n.s).join(' | '));
    check('Marcus gets the notices for the replies and the new message', (dn.match(/New message/g) || []).length >= 2, dn.slice(0, 300));
    const inc = await D.page.evaluate(() => visIncidents().filter((i) => i.status !== 'Closed').map((i) => i.type));
    check('Marcus sees the incident Cara reported', inc.includes('Fall'), JSON.stringify(inc));
    await go(D.page, 'clients'); await D.page.locator('#view :text("' + UCI.oak + '")').first().click(); await settle(D.page, 500);
    check('Marcus sees Dev’s note on the client’s page', /Likes a walk after lunch/.test(await text(D.page)));
    const eliTask = await D.page.evaluate(() => (TASKS.find((t) => t.title === 'Check the van tyres') || {}).stage);
    check('Marcus sees Eli’s task as done', eliTask === 'Done', eliTask);
    const prog = await D.page.evaluate((sid) => { openStaffPage(sid); const c = [...document.querySelectorAll('.card')].find((x) => /Onboarding checklist/.test(x.innerText)); return c ? c.innerText.replace(/\s+/g, ' ') : ''; }, S.ana.sid);
    check('Marcus sees Ana’s onboarding progress on her staff page', /1 of \d+/.test(prog), prog.slice(0, 200));
    const creds = await D.page.evaluate((sid) => (CREDS[sid] || []).map((c) => c.c), S.ben.sid);
    check('Marcus sees the certification Ben added to his own record', creds.some((c) => /CPR/.test(c)), JSON.stringify(creds));
  }
  // staff to staff
  await reload(S.dev.page); await reload(S.ben.page);
  check('Dev sees the message Ana sent him; Ben does not', (await threadsSeen(S.dev.page)).includes('Ana to Dev: swap') && !(await threadsSeen(S.ben.page)).includes('Ana to Dev: swap'));
  check('Ben’s message to Marcus is his and Marcus’s: Ana does not see it', !(await threadsSeen(S.ana.page)).includes('Ben to Marcus: overtime'));

  // ================= inside the team, straight from the database =================
  {
    const ben = S.ben.page;
    const th = await api(ben, 'np_demo_threads'), ms = await api(ben, 'np_demo_messages'), nt = await api(ben, 'np_demo_notifications');
    const subj = th.map((t) => t.subject);
    check('database, Ben: the conversations he can read are his own and Elm House’s, not Ana’s or Ana and Dev’s',
      subj.includes('Ben to Marcus: overtime') && subj.includes('Elm House: fire drill') && !subj.includes('Ana only: schedule') && !subj.includes('Ana to Dev: swap'), JSON.stringify(subj));
    const ids = new Set(th.map((t) => t.id));
    check('database, Ben: every message he can read belongs to one of those conversations', Array.isArray(ms) && ms.every((m) => ids.has(m.thread_id)), JSON.stringify(ms).slice(0, 200));
    check('database, Ben: no notice meant for the directors or for another staff member',
      Array.isArray(nt) && nt.every((n) => !n.for_staff || n.for_staff === S.ben.sid || /^@home:(Elm House)$/.test(n.for_staff)), JSON.stringify(nt.map((n) => n.for_staff)));
    const cr = await api(ben, 'np_demo_credentials');
    check('database, Ben: his own certification only', Array.isArray(cr) && cr.length >= 1 && cr.every((c) => c.sid === S.ben.sid), JSON.stringify(cr.map((c) => c.sid)));
    const ag = await api(ben, 'np_demo_agreements'), ac = await api(ben, 'np_demo_accounts');
    check('database, Ben: his own signed agreement and sign-in record only', ag.every((a) => String(a.signer_email || '').toLowerCase() === S.ben.email) && ac.every((a) => String(a.email || '').toLowerCase() === S.ben.email), JSON.stringify({ ag: ag.map((a) => a.signer_email), ac: ac.map((a) => a.email) }));
    const al = await api(ben, 'np_demo_ask_log');
    check('database, Ben: none of the Ask Spectrum history', Array.isArray(al) && al.length === 0, JSON.stringify(al).slice(0, 100));
    const sh = await apiWrite(ben, 'POST', 'np_demo_shifts', '', { staff_id: S.ben.sid, start_time: '08:00', end_time: '16:00', home: 'Elm House', shift_date: today });
    check('database, Ben: cannot add a shift (the rota is the director’s)', sh === 403, String(sh));
    const nClients = B.rows('np_demo_clients').filter((c) => c.org_id === D.org).length;
    await apiWrite(ben, 'DELETE', 'np_demo_clients', 'uci=eq.' + UCI.elm);
    const addC = await apiWrite(ben, 'POST', 'np_demo_clients', '', { id: 'c-ben', uci: '7350444', name: 'Client 7350444' });
    check('database, Ben: cannot remove or add a client', B.rows('np_demo_clients').filter((c) => c.org_id === D.org).length === nClients && addC === 403, JSON.stringify({ nClients, addC }));
    const nAudit = B.rows('np_demo_audit_log').filter((a) => a.org_id === D.org).length;
    await apiWrite(ben, 'DELETE', 'np_demo_audit_log', 'id=not.is.null');
    await apiWrite(ben, 'PATCH', 'np_demo_audit_log', 'id=not.is.null', { act: 'changed' });
    check('database, Ben: cannot clear or change the change log', B.rows('np_demo_audit_log').filter((a) => a.org_id === D.org).length === nAudit && !B.rows('np_demo_audit_log').some((a) => a.act === 'changed'));
    const post = await apiWrite(ben, 'POST', 'np_demo_messages', '', { thread_id: (B.rows('np_demo_threads').find((t) => t.subject === 'Ana only: schedule') || {}).id, author: 'Ben Cole', author_email: S.ben.email, body: 'reading along' });
    check('database, Ben: cannot write into Ana’s conversation with Marcus', post === 403, String(post));
    const dth = await api(D.page, 'np_demo_threads'), dcr = await api(D.page, 'np_demo_credentials');
    check('database, Marcus: every conversation and every certification in his team', dth.length === B.rows('np_demo_threads').filter((t) => t.org_id === D.org).length && dcr.length === B.rows('np_demo_credentials').filter((c) => c.org_id === D.org).length);
  }

  // ================= team two signs up the same way and sees nothing of team one, and the other way round =================
  const N = await newTeam(T2);
  check('Pine Ridge Homes is a team of its own, with Nora as its director', !!N.org && N.org !== D.org && await N.page.evaluate(() => state.role === 'director'));
  await addClient(N.page, UCI.pine, 'Pine House', true);
  await addStaff(N.page, FINN);
  const F = await join(FINN, T2.org);
  await newMessage(N.page, 'staff:' + FINN.sid, 'Nora to Finn: welcome', 'Welcome to Pine Ridge.');
  await go(N.page, 'tasks'); await btn(N.page, '#view', 'Assign task').click(); await settle(N.page, 300);
  await N.page.fill('#ntTitle', 'Pine House walkthrough'); await N.page.selectOption('#ntWho', FINN.sid); await N.page.fill('#ntDue', today);
  await btn(N.page, '#modal', 'Assign task').click(); await settle(N.page, 500);
  await reload(N.page); await reload(F.page); await reload(D.page); await reload(S.ana.page);

  for (const [who, page] of [['Nora', N.page], ['Finn', F.page]]) {
    const v = await page.evaluate(() => ({ clients: visibleClients().map((c) => c.uci), staff: visibleStaff().map((s) => s.name), threads: visThreads().map((t) => t.sub), tasks: TASKS.map((t) => t.title), notices: SYS_NOTIFS.map((n) => n.t + ' ' + n.s).join(' | '), view: el('view').innerText }));
    const leak = [UCI.elm, UCI.oak, UCI.birch, 'Ana Ruiz', 'Ben Cole', 'Cara Diaz', 'Dev Shah', 'Eli Moss', 'Marcus', 'Willow Grove', 'Refill the first-aid kit', 'Ana only', 'Elm House'].filter((x) => JSON.stringify(v).includes(x));
    check(`${who} (team two) sees only Pine Ridge on screen: its client, its staff, its conversations and tasks`, v.clients.join() === UCI.pine && !leak.length, 'leaked: ' + leak.join(', ') + ' ' + JSON.stringify({ clients: v.clients, staff: v.staff }));
  }
  for (const [who, page] of [['Marcus', D.page], ['Ana', S.ana.page]]) {
    const v = await page.evaluate(() => ({ clients: visibleClients().map((c) => c.uci), staff: visibleStaff().map((s) => s.name), threads: visThreads().map((t) => t.sub), tasks: TASKS.map((t) => t.title), notices: SYS_NOTIFS.map((n) => n.t + ' ' + n.s).join(' | ') }));
    const leak = [UCI.pine, 'Finn Lowe', 'Nora', 'Pine Ridge', 'Pine House walkthrough', 'Nora to Finn'].filter((x) => JSON.stringify(v).includes(x));
    check(`${who} (team one) sees nothing of Pine Ridge on screen`, !leak.length, 'leaked: ' + leak.join(', '));
  }
  for (const [who, page, other] of [['Nora', N.page, D.org], ['Finn', F.page, D.org], ['Marcus', D.page, N.org], ['Ana', S.ana.page, N.org], ['Ben', S.ben.page, N.org]]) {
    const leaks = [];
    for (const t of TABLES) { const r = await api(page, t); if (!Array.isArray(r)) { leaks.push(t + ':' + JSON.stringify(r)); continue; } const n = r.filter((x) => x.org_id === other).length; if (n) leaks.push(t + '=' + n); }
    check(`database, ${who}: not one row of the other team in any table`, !leaks.length, leaks.join(', '));
  }
  {
    const tid = (B.rows('np_demo_threads').find((t) => t.subject === 'Ana only: schedule') || {}).id;
    const w = [await apiWrite(N.page, 'POST', 'np_demo_messages', '', { thread_id: tid, author: 'Nora', author_email: T2.email, body: 'hello there', org_id: D.org }),
      await apiWrite(N.page, 'POST', 'np_demo_clients', '', { id: 'c-x', uci: '7350555', name: 'x', org_id: D.org })];
    const before = JSON.stringify(B.rows('np_demo_tasks').filter((t) => t.org_id === D.org));
    await apiWrite(N.page, 'PATCH', 'np_demo_tasks', 'org_id=eq.' + D.org, { stage: 'Done' });
    await apiWrite(F.page, 'DELETE', 'np_demo_clients', 'org_id=eq.' + D.org);
    check('database, team two: cannot write into team one, change its tasks or remove its clients', w.every((s) => s === 403) && before === JSON.stringify(B.rows('np_demo_tasks').filter((t) => t.org_id === D.org)) && B.rows('np_demo_clients').filter((c) => c.org_id === D.org).length === 3, JSON.stringify(w));
    const back = await apiWrite(D.page, 'POST', 'np_demo_notifications', '', { title: 'hi', body: 'x', kind: 'info', for_staff: null, org_id: N.org });
    check('database, team one: cannot post a notice into team two', back === 403, String(back));
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
