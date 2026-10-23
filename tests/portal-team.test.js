// Team tests for E-&-G-Home-Inc.html (#2, the care portal), v12.36: Demo vs. Development in Settings with a banner
// while Demo is on; the phone note on Templates and signing with a finger at phone width; adding a staff member and
// inviting them in one step, their onboarding checklist shared on adding, and joining from that invite; the team in
// Messages with who is online, people who just joined, and a click on a name opening the conversation with them.
// Supabase and the relay answer from stubs (lib/portal-harness.js and the suite's own `rest`), so no real account,
// team or email is touched. See tests/README.md.
// Usage: node tests/portal-team.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

const DIR = 'dana@maple.test', STF = 'sam@maple.test', DIR2 = 'dee@maple.test', NEW = 'jo.new@maple.test';
const today = new Date().toISOString().slice(0, 10);
// what the team's tables hold, shared by every page of a section
function makeDb() {
  return { staff: [], invites: [], notifs: [], beats: [], age: {}, emails: [], failInvites: false };
}
function rest(db) {
  return async ({ method, path, body }) => {
    const b = (() => { try { return JSON.parse(body || 'null'); } catch (e) { return null; } })();
    const rows = Array.isArray(b) ? b : (b ? [b] : []);
    if (path.startsWith('/rest/v1/np_demo_staff')) {
      if (method === 'GET') return { body: db.staff };
      if (method === 'POST') { rows.forEach((r) => { const i = db.staff.findIndex((x) => x.id === r.id); if (i >= 0) db.staff[i] = Object.assign({}, db.staff[i], r); else db.staff.push(r); }); return { status: 201 }; }
      if (method === 'PATCH') return { status: 204, body: null };
    }
    if (path.startsWith('/rest/v1/np_demo_invites') && method === 'POST') {
      if (db.failInvites) return { status: 400, body: { message: 'refused' } };
      rows.forEach((r) => db.invites.push(r)); return { status: 201 };
    }
    if (path.startsWith('/rest/v1/np_demo_notifications') && method === 'POST') { rows.forEach((r) => db.notifs.push(r)); return { status: 201 }; }
    if (db.noTable && (path.startsWith('/rest/v1/np_demo_presence') || path.startsWith('/rest/v1/rpc/np_presence'))) { db.noTableHits = (db.noTableHits || 0) + 1; return { status: 404, body: { code: 'PGRST205', message: 'not found' } }; }
    if (path.startsWith('/rest/v1/np_demo_presence') && method === 'POST') { rows.forEach((r) => db.beats.push(Object.assign({ path }, r))); return { status: 201 }; }
    if (path.startsWith('/rest/v1/rpc/np_presence')) return { body: Object.entries(db.age).map(([email, age_s]) => ({ email, age_s })) };
    if (path.startsWith('/rest/v1/rpc/np_invite_peek')) {
      const iv = db.invites.find((x) => x.token === (b && b.p_token));
      return { body: iv ? [{ token: iv.token, email: iv.email, org_name: 'Maple Care', role_title: iv.role_title, staff_name: iv.name, staff_id: iv.sid, used: false, access: 'staff' }] : [] };
    }
    if (path.startsWith('/rest/v1/rpc/np_join_org')) return { body: 'org-qa' };
    if (path.startsWith('/auth/v1/signup') && b && b.email === db.joinEmail) return { body: { access_token: 'qa-access-token-2', refresh_token: 'qa-refresh-2', expires_in: 3600, token_type: 'bearer', user: { id: 'qa-user-2', email: b.email, identities: [{}] } } };
    return undefined;
  };
}
const relay = (db) => async ({ action, payload }) => { if (action === 'email') db.emails.push(payload); return { status: 200, body: { ok: true } }; };

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const program = (extra) => [
    { key: 'users', value: { map: Object.assign({ [DIR]: { name: 'Dana Director', role: 'director', title: 'Executive Director' } }, extra || {}) } },
    { key: 'pilot', value: { signatures: { ['u:' + DIR]: { by: 'Dana Director', at: 'Oct 1, 2026', role: 'Director' }, ['u:' + STF]: { by: 'Sam Staff', at: 'Oct 2, 2026', role: 'Staff' }, ['u:' + NEW]: { by: 'Jo New', at: 'Oct 21, 2026', role: 'Staff' } } } },
    { key: 'email', value: { v: 'alerts@maple.test' } }];
  async function signin(S, db, viewport) {
    const { ctx, page } = await H.newPage(env, { session: S, rest: rest(db), relay: relay(db), viewport: viewport || { width: 1440, height: 900 }, bucket: errors });
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
    await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && document.querySelector('#view'), null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { try { closeAll(); } catch (e) {} });
    return { ctx, page };
  }
  async function demo(role, viewport) {
    const { ctx, page } = await H.newPage(env, { viewport: viewport || { width: 1440, height: 900 }, bucket: errors });
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    if (role) { await page.evaluate((r) => signIn(r), role); await page.waitForFunction((r) => state.role === r, role); }
    await page.waitForTimeout(300);
    return { ctx, page };
  }
  const banner = (page) => page.evaluate(() => { const b = el('modeBanner'); return { shown: !!b && getComputedStyle(b).display !== 'none', text: b ? b.innerText : '' }; });
  const toast = (page) => page.evaluate(() => (el('toast') || {}).textContent || '');

  // ---------------- 1. Demo vs. Development, as a director ----------------
  {
    const db = makeDb();
    const S = { email: DIR, password: 'qa-pass-1234', role: 'director', program: program().concat([{ key: 'hidesample', value: { v: false } }]) };
    const { ctx, page } = await signin(S, db);
    let b = await banner(page);
    check('Demo: a banner across the top says the records are sample data, not real', b.shown && /Demo mode: the clients, staff and records here are sample data, not real\./.test(b.text), b.text);
    check('Demo: a director gets Switch to Development in the banner', /Switch to Development/.test(b.text));
    await page.click('#modeBanner a');
    await page.waitForTimeout(500);
    const card = await page.evaluate(() => { const c = el('modeCard'); if (!c) return null; const r = c.getBoundingClientRect(); return { text: c.innerText, inView: r.top >= 0 && r.top < innerHeight, on: [...c.querySelectorAll('.mode-opt.on b')].map((x) => x.textContent), checked: [...c.querySelectorAll('.mode-opt')].map((x) => x.getAttribute('aria-checked')) }; });
    check('Switch to Development opens Settings at the Demo vs. Development card', !!card && card.inView, JSON.stringify(card));
    check('the card is called Demo vs. Development and says Demo is sample data, not real', !!card && /Demo vs\. Development/.test(card.text) && /They are made up, not real records\./.test(card.text) && /Only your team’s real records show\./.test(card.text) && /Nothing is deleted either way/.test(card.text), card && card.text);
    check('Demo is the one picked (and says so to a screen reader)', !!card && card.on.join() === 'Demo' && card.checked.join() === 'true,false', JSON.stringify(card));
    S.writes = [];
    await page.click('#modeCard .mode-opt:has-text("Development")');
    await page.waitForTimeout(500);
    const dev = await page.evaluate(() => ({ hide: state.hideSample, on: [...document.querySelectorAll('#modeCard .mode-opt.on b')].map((x) => x.textContent).join() }));
    check('Development: picked, and sample records are hidden for the team', dev.hide === true && dev.on === 'Development', JSON.stringify(dev));
    check('Development: saved as the team setting (hidesample on)', S.writes.some((w) => w.key === 'hidesample' && w.value && w.value.v === true), JSON.stringify(S.writes.map((w) => w.key)));
    b = await banner(page);
    check('Development: no banner', !b.shown, b.text);
    check('Development: the message says only real records show now', /Development: only your team’s real records show now\./.test(await toast(page)), await toast(page));
    await page.click('#modeCard .mode-opt:has-text("Demo")');
    await page.waitForTimeout(500);
    b = await banner(page);
    check('back to Demo: the banner comes back, and it is saved for the team', b.shown && S.writes.some((w) => w.key === 'hidesample' && w.value && w.value.v === false), b.text);
    check('nothing is deleted when switching (no delete calls)', !(S.writes || []).some((w) => w.key === 'deleted'));
    await ctx.close();
  }

  // ---------------- 2. a staff member sees the banner, but no switch ----------------
  {
    const db = makeDb();
    db.staff.push({ id: 'st-sam', name: 'Sam Staff', init: 'S.S.', role: 'Direct Support Professional', home: '', hired: '2026-09-01', email: STF });
    const S = { email: STF, password: 'qa-pass-1234', role: 'staff', program: program({ [STF]: { name: 'Sam Staff', role: 'staff', title: 'Direct Support Professional', sid: 'st-sam' } }).concat([{ key: 'hidesample', value: { v: false } }]) };
    const { ctx, page } = await signin(S, db);
    const b = await banner(page);
    check('staff: the Demo banner shows, saying a director can switch', b.shown && /A director can switch to Development in Settings\./.test(b.text) && !/Switch to Development/.test(b.text), b.text);
    await page.evaluate(() => openSettings()); await page.waitForTimeout(300);
    check('staff: no Demo vs. Development card in Settings', await page.evaluate(() => !el('modeCard')));
    check('staff: setMode is refused', await page.evaluate(() => { setMode('dev'); return state.hideSample === false; }));
    await ctx.close();
  }

  // ---------------- 3. the separate demo view keeps its own banner ----------------
  {
    const { ctx, page } = await demo('director');
    const b = await banner(page);
    check('demo view: its own banner, not the Demo mode one', !b.shown && await page.evaluate(() => getComputedStyle(el('demoBanner')).display !== 'none'));
    await ctx.close();
  }

  // ---------------- 4. works on a phone ----------------
  {
    const { ctx, page } = await demo('director');
    await page.evaluate(() => go('forms')); await page.waitForTimeout(300);
    const note = await page.evaluate(() => (document.querySelector('#view .title-copy .phone-note') || {}).innerText || '');
    check('Templates: Works on your phone (a photo makes a template; fill in and sign with a finger)', /Works on your phone\. Take a photo of a paper form to turn it into a template, and fill in and sign forms with your finger\./.test(note), note);
    await page.evaluate(() => ovUploadStart('Medical')); await page.waitForTimeout(300);
    const up = await page.evaluate(() => ({ note: (document.querySelector('#mdBody .phone-note') || {}).innerText || '', accept: el('ovFile').getAttribute('accept') }));
    check('Upload a form: On a phone? take a photo of the paper form', /On a phone\? Tap Choose the form, then take a photo of the paper form\./.test(up.note), up.note);
    check('Upload a form: photos are accepted, so a phone offers its camera', /\.jpg/.test(up.accept) && /\.png/.test(up.accept), up.accept);
    await ctx.close();
  }
  {
    const { ctx, page } = await demo('director', { width: 390, height: 844 });
    await page.evaluate(() => go('forms')); await page.waitForTimeout(300);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, note: !!document.querySelector('#view .phone-note') && getComputedStyle(document.querySelector('#view .phone-note')).display !== 'none' }));
    check('phone width: Templates shows the note and nothing scrolls sideways', w.note && w.sw <= w.vw, JSON.stringify(w));
    await page.evaluate(() => { window._sigFor = { id: 'qa', drawn: false }; sigOpen('qa', 'Signature'); }); await page.waitForTimeout(300);
    const pad = await page.evaluate(() => { const c = document.querySelector('#sigOv .sp-c'); const r = c.getBoundingClientRect(); return { ta: getComputedStyle(c).touchAction, w: r.width, x: r.left, y: r.top, h: r.height, vw: innerWidth }; });
    check('phone width: the signature pad fits the screen and does not scroll the page under a finger', pad.ta === 'none' && pad.w > 200 && pad.x >= 0 && pad.x + pad.w <= pad.vw, JSON.stringify(pad));
    const drawn = await page.evaluate((p) => {
      const c = document.querySelector('#sigOv .sp-c');
      const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
      ev('pointerdown', p.x + 30, p.y + p.h / 2); for (let i = 1; i <= 12; i++) ev('pointermove', p.x + 30 + i * 12, p.y + p.h / 2 + (i % 2 ? 8 : -8)); ev('pointerup', p.x + 180, p.y + p.h / 2);
      const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink++;
      return { ink, signed: el('sigOv').classList.contains('signed') };
    }, pad);
    check('phone width: a finger signs (touch strokes draw on the pad)', drawn.signed && drawn.ink > 200, JSON.stringify(drawn));
    await ctx.close();
  }

  // ---------------- 5. add a staff member and invite them in one step ----------------
  const db5 = makeDb();
  const S5 = { email: DIR, password: 'qa-pass-1234', role: 'director', program: program().concat([{ key: 'hidesample', value: { v: true } }]) };
  {
    const { ctx, page } = await signin(S5, db5);
    await page.evaluate(() => openStaffForm()); await page.waitForTimeout(300);
    const tick = await page.evaluate(() => { const c = el('sfInvite'); return c ? { on: c.checked, text: c.closest('label').innerText } : null; });
    check('Add staff: an "Email them an invite to sign in" tick, on by default', !!tick && tick.on && /Email them an invite to sign in/.test(tick.text) && /works once/.test(tick.text), JSON.stringify(tick));
    await page.fill('#sfName', 'Jo New'); await page.fill('#sfRole', 'Direct Support Professional'); await page.fill('#sfEmail', 'Jo.New@maple.test');
    await page.click('#mdFoot .btn.navy');
    await page.waitForFunction(() => /Invite emailed to/.test((el('toast') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    const sid = await page.evaluate(() => (STAFF.find((s) => s.name === 'Jo New') || {}).id);
    const iv = db5.invites[0], mail = db5.emails.find((e) => e.kind === 'invite');
    check('saving adds them and saves one invite for their work email, tied to their record', !!sid && db5.invites.length === 1 && iv.email === NEW && iv.sid === sid && iv.name === 'Jo New' && /^iv[0-9a-f]{32}$/.test(iv.token), JSON.stringify(iv));
    check('the invite email goes out at once, with the portal link that opens their registration', !!mail && mail.to === NEW && mail.name === 'Jo New' && mail.link === env.BASE + '/portal.html?join=' + iv.token, JSON.stringify(mail));
    check('the director is told it went', /Invite emailed to jo\.new@maple\.test\./.test(await toast(page)), await toast(page));
    const ob = await page.evaluate((sid) => OB_ASSIGN[sid] || [], sid);
    check('their onboarding checklist is shared on adding (the team’s first checklist)', ob.length >= 1 && ob.every((x) => x.d === 0) && !!ob[0].list, JSON.stringify(ob.slice(0, 2)));
    check('and saved for the team, with a notice for them', S5.writes.some((w) => w.key === 'onboard' && w.value && w.value.assign && w.value.assign[sid]) && db5.notifs.some((n) => n.for_staff === sid && n.kind === 'onboard'));
    // the same person later: their checklist is not shared twice
    check('a checklist already shared is left as it is', await page.evaluate((sid) => obAutoShare(sid) === 0, sid));
    // unticked: added, no invite
    await page.evaluate(() => openStaffForm()); await page.waitForTimeout(200);
    await page.fill('#sfName', 'Pat Quiet'); await page.fill('#sfEmail', 'pat@maple.test'); await page.uncheck('#sfInvite');
    await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(800);
    check('unticked: added with no invite and no email', db5.invites.length === 1 && db5.emails.filter((e) => e.kind === 'invite').length === 1 && await page.evaluate(() => !!STAFF.find((s) => s.name === 'Pat Quiet')));
    // ticked with no email
    await page.evaluate(() => openStaffForm()); await page.waitForTimeout(200);
    await page.fill('#sfName', 'Lee NoMail');
    await page.click('#mdFoot .btn.navy'); await page.waitForTimeout(600);
    check('ticked with no work email: added, and told to add an email to invite them', /Add their work email to invite them\./.test(await toast(page)) && db5.invites.length === 1, await toast(page));
    // the invite cannot be saved: nothing is emailed
    db5.failInvites = true;
    await page.evaluate(() => openStaffForm()); await page.waitForTimeout(200);
    await page.fill('#sfName', 'Ari Fail'); await page.fill('#sfEmail', 'ari@maple.test');
    await page.click('#mdFoot .btn.navy');
    await page.waitForFunction(() => /could not be saved/.test((el('toast') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    check('an invite that cannot be saved is not emailed, and the director is told what to do', /The invite could not be saved\. Open their staff record and use Invite to try again\./.test(await toast(page)) && db5.emails.filter((e) => e.kind === 'invite').length === 1, await toast(page));
    db5.failInvites = false;
    // an edit has no invite tick
    await page.evaluate((sid) => openStaffForm(sid), sid); await page.waitForTimeout(200);
    check('editing someone: no invite tick (Invite is on their record)', await page.evaluate(() => !el('sfInvite')));
    await page.evaluate(() => closeAll());
    await ctx.close();
  }

  // ---------------- 6. they open the invite, set a password and land in the staff view ----------------
  {
    db5.joinEmail = NEW;
    const S6 = { email: NEW, password: 'qa-pass-5678', role: 'staff', program: S5.program };   // the same team settings rows
    const { ctx, page } = await H.newPage(env, { session: S6, rest: rest(db5), relay: relay(db5), bucket: errors });
    const link = db5.emails.find((e) => e.kind === 'invite').link;
    await page.goto(link, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot') && /Join/.test((el('loginTitle') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
    const join = await page.evaluate(() => ({ title: el('loginTitle').textContent, email: el('liEmail').value, sub: el('loginSub').innerText }));
    check('the invite link opens their registration: Join Maple Care, their email filled in, their name', /Join Maple Care/.test(join.title) && join.email === NEW && /Jo New/.test(join.sub), JSON.stringify(join));
    await page.fill('#liPw', S6.password);
    const pw2 = await page.$('#liPw2'); if (pw2) await page.fill('#liPw2', S6.password);
    await page.click('#liGo');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.role === 'staff' && realSession(), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const me = await page.evaluate((em) => ({ role: state.role, entry: USERS[em] || null }), NEW);
    check('they land in the staff view', me.role === 'staff', JSON.stringify(me));
    check('the team list has them as staff, tied to their record, with the day they joined', !!me.entry && me.entry.role === 'staff' && !!me.entry.sid && me.entry.joined === today, JSON.stringify(me.entry));
    const steps = (S5.program.find((r) => r.key === 'onboard') || { value: { assign: {} } }).value.assign[me.entry && me.entry.sid] || [];
    const tab = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = profOnboardTab(); return d.innerText; });
    check('their onboarding checklist is waiting on their profile, the steps the director’s add shared', steps.length > 0 && /Your onboarding checklist, shared by your director\./.test(tab) && steps.every((s) => tab.includes(s.t)), tab.slice(0, 300));
    await ctx.close();
  }

  // ---------------- 7. Messages: the team, who is online, new people, a click on a name ----------------
  {
    const db = makeDb();
    db.staff.push({ id: 'st-sam', name: 'Sam Staff', init: 'S.S.', role: 'Direct Support Professional', home: '', hired: '2026-08-01', email: STF });
    db.staff.push({ id: 'st-pat', name: 'Pat Quiet', init: 'P.Q.', role: 'House Lead', home: '', hired: '2026-08-02', email: 'pat@maple.test' });
    db.age = { [STF]: 30, [DIR2]: 7200, [DIR]: 5 };
    const S = { email: DIR, password: 'qa-pass-1234', role: 'director', program: program({ [STF]: { name: 'Sam Staff', role: 'staff', title: 'Direct Support Professional', sid: 'st-sam' }, [DIR2]: { name: 'Dee Deputy', role: 'director', title: 'Program Director' } }).concat([{ key: 'hidesample', value: { v: true } }]) };
    const { ctx, page } = await signin(S, db);
    await page.evaluate(() => go('messages'));
    await page.waitForFunction(() => /online/.test((el('msgTeam') || {}).innerText || '') && document.querySelector('#msgTeam .pres-dot.on'), null, { timeout: 8000 }).catch(() => {});
    const rowsOf = () => page.evaluate(() => [...document.querySelectorAll('#msgTeam .team-i')].map((b) => ({ name: b.querySelector('b').firstChild.textContent, line: b.querySelector('.ti>span').textContent, dot: (b.querySelector('.pres-dot').className.match(/\b(on|off|none|unk|sample)\b/) || [''])[0], isNew: !!b.querySelector('.new-tag') })));
    let rows = await rowsOf();
    check('Messages lists the team without being asked: everyone but me', rows.map((r) => r.name).sort().join() === 'Dee Deputy,Pat Quiet,Sam Staff', JSON.stringify(rows));
    check('online first: Sam is in now (green), with "Online"', rows[0] && rows[0].name === 'Sam Staff' && rows[0].dot === 'on' && /Direct Support Professional · Online/.test(rows[0].line), JSON.stringify(rows[0]));
    check('then who was in last: Dee, last seen 2 h ago (grey)', rows[1] && rows[1].name === 'Dee Deputy' && rows[1].dot === 'off' && /Last seen 2 h ago/.test(rows[1].line), JSON.stringify(rows[1]));
    check('a staff record with no sign-in says Not signed in yet, with no dot', rows[2] && rows[2].name === 'Pat Quiet' && rows[2].dot === 'none' && /Not signed in yet/.test(rows[2].line), JSON.stringify(rows[2]));
    check('the heading counts who is online', /^Team\s*1 online$/.test(await page.evaluate(() => document.querySelector('#msgTeam .msg-sec').textContent.trim())), await page.evaluate(() => document.querySelector('#msgTeam .msg-sec').textContent));
    const dots = await page.evaluate(() => { const cs = (sel, p) => { const n = document.querySelector(sel); return n ? getComputedStyle(n)[p] : null; }; return { on: cs('#msgTeam .pres-dot.on', 'backgroundColor'), off: cs('#msgTeam .pres-dot.off', 'backgroundColor'), none: cs('#msgTeam .pres-dot.none', 'display') }; });
    check('the dots: green online, grey offline, none for no sign-in', dots.on === 'rgb(46, 155, 99)' && dots.off === 'rgb(185, 192, 187)' && dots.none === 'none', JSON.stringify(dots));
    // this page says it is in, as the signed-in person, for this team
    await page.evaluate(() => presenceBeat()); await page.waitForTimeout(200);
    const beat = db.beats[db.beats.length - 1];
    check('this page writes its own row (my email, my team), merged, never another person', !!beat && beat.email === DIR && beat.org_id === 'org-qa' && /on_conflict=org_id,email/.test(beat.path), JSON.stringify(beat));
    // a draft is never lost to the live list, and status changes show without a reload
    await page.fill('#msgIn', 'half-written reply');
    db.age[STF] = 600; db.age[DIR2] = 20;
    await page.evaluate(() => { pres().tick = 1; return msgLiveTick(); }); await page.waitForTimeout(200);
    rows = await rowsOf();
    check('statuses change without a reload: Dee came in, Sam left 10 min ago', rows[0].name === 'Dee Deputy' && rows[0].dot === 'on' && rows.find((r) => r.name === 'Sam Staff').line.includes('Last seen 10 min ago'), JSON.stringify(rows));
    check('a message being written is kept while the list changes', (await page.inputValue('#msgIn')) === 'half-written reply');
    // someone joins the team: they show within a minute, marked New
    const users = S.program.find((r) => r.key === 'users');
    users.value = { map: Object.assign({}, users.value.map, { [NEW]: { name: 'Jo New', role: 'staff', title: 'Direct Support Professional', sid: 'st-jo', joined: today } }) };
    db.staff.push({ id: 'st-jo', name: 'Jo New', init: 'J.N.', role: 'Direct Support Professional', home: '', hired: today, email: NEW });
    db.age[NEW] = 12;
    await page.evaluate(() => { pres().tick = 1; return msgLiveTick(); }); await page.waitForTimeout(200);
    rows = await rowsOf();
    const jo = rows.find((r) => r.name === 'Jo New');
    check('someone who just joined shows without a reload, Online and marked New', !!jo && jo.dot === 'on' && jo.isNew, JSON.stringify(jo));
    check('and the draft is still there', (await page.inputValue('#msgIn')) === 'half-written reply');
    // a click on a name: the conversation with them, or a new message to them
    await page.evaluate((me) => { THREADS.unshift({ id: 'th-sam', who: 'Sam Staff', sub: 'Shift swap', role: 'Staff', toKind: 'staff', toRef: 'st-sam', from: me, last: 'Can you swap?', unread: 0, msgs: [{ t: 'Can you swap Friday?', me: true, w: 'Dana Director', at: 'Today' }] }); state.thread = ''; render(); }, DIR);
    await page.click('#msgTeam .team-i:has-text("Sam Staff")'); await page.waitForTimeout(300);
    check('a click on Sam opens our conversation', await page.evaluate(() => state.thread === 'th-sam'));
    const head = await page.evaluate(() => (el('msgHeadPres') || {}).innerText || '');
    check('the conversation says whether they are in: Sam, last seen 10 min ago', /Last seen 10 min ago/.test(head), head);
    await page.click('#msgTeam .team-i:has-text("Dee Deputy")'); await page.waitForTimeout(300);
    const nm = await page.evaluate(() => ({ title: el('mdTitle').textContent, to: el('nmTo').value, label: el('nmTo').selectedOptions[0].textContent }));
    check('a click on someone with no conversation yet opens New message to them, marked Online', nm.title === 'New message' && nm.to === 'director:' + DIR2 && /Online/.test(nm.label), JSON.stringify(nm));
    await page.evaluate(() => closeAll());
    // the table is not there yet (or cannot be read): the list still works, with no dots or times
    await page.evaluate(() => { const P = pres(); P.ok = false; P.age = {}; msgLiveSync(); });
    rows = await rowsOf();
    check('if who-is-in cannot be read, the team still lists, with no dots and no times', rows.length === 4 && rows.every((r) => !/Online|Last seen/.test(r.line)) && rows.every((r) => ['unk', 'none'].includes(r.dot)), JSON.stringify(rows));
    // the table is not there yet (404): one call, then no more writes or reads until a reload
    db.noTable = true; const before = db.beats.length;
    await page.evaluate(async () => { const P = pres(); P.none = 0; await presenceBeat(); await presenceBeat(); await presenceRead(); await presenceRead(); });
    const st = await page.evaluate(() => ({ none: pres().none, ok: pres().ok }));
    check('no table yet: the page stops writing and reading after the first miss', db.noTableHits === 1 && st.none === 1 && st.ok === false, JSON.stringify({ hits: db.noTableHits, st }));
    db.noTable = false;
    await ctx.close();
  }

  // ---------------- 8. the demo view and a family member ----------------
  {
    const { ctx, page } = await demo('director');
    await page.evaluate(() => go('messages')); await page.waitForTimeout(300);
    const d = await page.evaluate(() => ({ n: document.querySelectorAll('#msgTeam .team-i').length, on: document.querySelectorAll('#msgTeam .pres-dot.on').length, onNow: new Set(shiftsNow().map((s) => s.sid)).size, text: el('msgTeam').innerText }));
    check('demo view: the sample team lists, and whoever is on shift now shows as online', d.n >= 3 && d.on === d.onNow, JSON.stringify(d));
    await page.evaluate(() => signIn('staff')); await page.waitForFunction(() => state.role === 'staff'); await page.evaluate(() => go('messages')); await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({ names: [...document.querySelectorAll('#msgTeam .team-i b')].map((b) => b.firstChild.textContent), me: ME.staff.name, dir: ME.director.name }));
    check('demo view, staff: the director is listed and they are not listed themselves', s.names.includes(s.dir) && !s.names.includes(s.me), JSON.stringify(s));
    await page.evaluate(() => signIn('family')); await page.waitForFunction(() => state.role === 'family'); await page.evaluate(() => go('messages')); await page.waitForTimeout(300);
    check('family: no team list in Messages', await page.evaluate(() => !el('msgTeam')));
    await ctx.close();
  }

  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n  ' + failures.join('\n  ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
