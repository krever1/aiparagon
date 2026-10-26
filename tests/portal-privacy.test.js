// Privacy regression tests for E-&-G-Home-Inc.html (#2, the care portal), v12.33: what leaves the portal names no
// client. Signed in to a stub account, with the relay answered by the suite, so every payload is seen. The scrub
// takes out a client's UCI, name and initials (and any other 7-digit number, email address and phone number) and
// leaves ordinary words alone. Ask Spectrum sends Client 1, Client 2 and Home A, Home B in the question, the snapshot
// and the history, withholds identity boxes on forms, and the answer shows the portal's own names again. Google
// Calendar events (pushed, updated, or opened from the portal) carry the appointment only, and the portal still knows
// its own events. Incidents and appointments go to the relay without the client's ID. Emails go as a kind and its
// fields (no subject or HTML from the page), and the summary test copy carries no task titles. See tests/README.md.
// Usage: node tests/portal-privacy.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
// what must never be in anything sent out (a home's name may go with an incident or an appointment, never to Ask)
const SECRET = [/7310452/, /8840217/, /Maria/, /Gonzalez/, /\bMG\b/, /M\.G\./, /#17\b/];
const leaks = (s, home) => SECRET.concat(home ? [/Elm Street House/] : []).filter((r) => r.test(s)).map(String);

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const dir = 'dana@maple.test', stf = 'sam@maple.test';
  const S = {
    email: dir, password: 'qa-pass-1234', role: 'director',
    program: [{ key: 'users', value: { map: { [dir]: { name: 'Dana Director', role: 'director', title: 'Executive Director' }, [stf]: { name: 'Sam Staff', role: 'staff', title: 'Direct Support Professional', sid: 'sx1' } } } }],
  };
  const sent = [];
  let askReply = null;
  const relay = (b) => {
    sent.push(b);
    if (b.action === 'ask') return { body: { reply: askReply ? askReply(b.payload) : 'Nothing to report.' } };
    return { body: { ok: true } };
  };
  const { ctx, page } = await H.newPage(env, { session: S, bucket: errors, relay });
  const google = [];
  await page.route('https://www.googleapis.com/calendar/**', (route) => {
    const r = route.request();
    google.push({ method: r.method(), url: r.url(), body: r.postData() || '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'gev' + google.length }) });
  });
  await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
  await page.waitForFunction(() => typeof realSession === 'function' && realSession() && relayOn(), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  // two clients of this agency: one with a name typed in (as staff sometimes do), one as the portal makes them
  await page.evaluate((stf) => {
    const base = { age: null, since: T, guardian: 'None on file', tag: '', dx: 'Supported living', alerts: [], support: '', goals: [] };
    CLIENTS.push(Object.assign({}, base, { id: 'cx1', uci: '7310452', name: 'Maria Gonzalez', init: 'MG', home: 'Elm Street House',
      support: 'Maria likes a quiet room. Call her sister on 555-201-7788 or maria.g@example.com.' }));
    CLIENTS.push(Object.assign({}, base, { id: 'cx2', uci: '8840217', name: 'Client 8840217', init: '#17', home: 'Elm Street House' }));
    if (!HOMES.includes('Elm Street House')) HOMES.push('Elm Street House');
    STAFF.push({ id: 'sx1', name: 'Sam Staff', init: 'SS', role: 'Direct Support Professional', home: 'Elm Street House', email: stf, hired: '2025-01-02' });
    window.__opened = [];
    window.open = (u) => { window.__opened.push(String(u)); return null; };
  }, stf);

  // ---------------- 1. the scrub ----------------
  {
    const r = await page.evaluate(() => ({
      a: extScrub('Dentist for Maria Gonzalez (7310452)'),
      b: extScrub('Take MG to the ER, then PT'),
      c: extScrub('M.G. refused lunch'),
      d: extScrub('#17 (8840217) seizure check'),
      e: extScrub('Maria went to the store'),
      f: extScrub('Call 555-123-4567 or jo@x.com about UCI J-402318 and 9999999'),
      g: extScrub('2026-10-20 at 14:00, 30 min, Elm Street House'),
      h: extScrub('MG (7310452) — Dentist'),
      i: extScrub('May checkup with Dr. Lee'),
    }));
    check('scrub: a client’s full name and UCI go', r.a === 'Dentist for', JSON.stringify(r.a));
    check('scrub: initials go, other capitals (ER, PT) stay', r.b === 'Take to the ER, then PT', JSON.stringify(r.b));
    check('scrub: dotted initials go', r.c === 'refused lunch', JSON.stringify(r.c));
    check('scrub: the portal’s own #17 (8840217) form goes', r.d === 'seizure check', JSON.stringify(r.d));
    check('scrub: a first name on its own goes', r.e === 'went to the store', JSON.stringify(r.e));
    check('scrub: phone, email, a letter-dash UCI and any 7-digit number go', !/555|@|402318|9999999/.test(r.f) && /\[phone\]/.test(r.f) && /\[email\]/.test(r.f), JSON.stringify(r.f));
    check('scrub: dates, times and a home’s name stay', r.g === '2026-10-20 at 14:00, 30 min, Elm Street House', JSON.stringify(r.g));
    check('scrub: no dash is left hanging', r.h === 'Dentist', JSON.stringify(r.h));
    check('scrub: an ordinary word that is a month stays', r.i === 'May checkup with Dr. Lee', JSON.stringify(r.i));
  }

  // ---------------- 2. Google Calendar ----------------
  {
    await page.evaluate(() => {
      GCAL.token = 'qa-google'; GCAL.owner = gcalWho(); GCAL.connected = true; GCAL.kept = false; GCAL.exp = Date.now() + 3600e3;
      const a = { id: 'apx1', cid: 'cx1', title: 'Dentist for Maria (MG)', type: 'Medical', date: T, time: '10:00', dur: 30, provider: 'Dr. Lee', loc: 'Bright Smiles, 12 Oak Ave', flag: '', ride: '', cancelled: 0, notes: [], files: [], cal: 'company' };
      APPTS.push(a); gcalPush(a);
    });
    await page.waitForTimeout(800);
    const push = google.find((g) => g.method === 'POST');
    const ev = push ? JSON.parse(push.body) : {};
    check('Google: a pushed event is sent', !!push);
    check('Google: its title is the appointment only', ev.summary === 'Dentist for', JSON.stringify(ev.summary));
    check('Google: no client name, initials or UCI anywhere in it', push && !leaks(push.body).length, push && leaks(push.body).join(' '));
    check('Google: it says the details stay in the portal', /Client details stay in the portal/.test(ev.description || ''), ev.description);
    check('Google: the location is kept', ev.location === 'Bright Smiles, 12 Oak Ave', ev.location);
    const gid = await page.evaluate(() => APPTS.find((a) => a.id === 'apx1').gid);
    check('Google: the portal keeps the event’s id', gid === 'gev1', gid);
    await page.evaluate(() => { const a = APPTS.find((x) => x.id === 'apx1'); a.time = '11:00'; return gcalUpdate(a); });
    const upd = google.find((g) => g.method === 'PATCH');
    check('Google: an update says nothing about the client either', upd && !leaks(upd.body).length && JSON.parse(upd.body).summary === 'Dentist for', upd && upd.body.slice(0, 200));
    await page.evaluate(() => gcalTemplateOpen({ cid: 'cx2', title: 'Seizure follow-up #17 (8840217)', type: 'Medical', date: T, time: '15:00', dur: 30, loc: 'Elm Street House' }));
    const url = await page.evaluate(() => window.__opened.pop() || '');
    check('Google: opening it in Google Calendar (no connection) names no client', /calendar\.google\.com/.test(url) && !leaks(decodeURIComponent(url)).length, decodeURIComponent(url).slice(0, 200));
    // the portal still knows its own events, by id or (opened without a connection) by title, day and time
    const m = await page.evaluate(() => {
      APPTS.push({ id: 'apx2', cid: 'cx2', title: 'Eye exam', type: 'Medical', date: T, time: '15:00', dur: 30, cancelled: 0, notes: [], files: [] });
      const mk = (id, title, time) => gcalMapClient({ id, title, date: T, time, loc: '' });
      const own = mk('g_gev1', 'Dentist for', '11:00'), tmpl = mk('g_x9', 'Eye exam', '15:00'),
        old = mk('g_x8', 'Lab work — MG (7310452)', '09:00'), other = mk('g_x7', 'Team lunch', '12:00');
      return { own: [own.cid, !!own.dup], tmpl: [tmpl.cid, !!tmpl.dup], old: old.cid || '', other: [other.cid || '', !!other.dup] };
    });
    check('Google: an event the portal pushed is known by its id (shown once)', m.own[0] === 'cx1' && m.own[1], JSON.stringify(m.own));
    check('Google: one opened from the portal is known by its title, day and time', m.tmpl[0] === 'cx2' && m.tmpl[1], JSON.stringify(m.tmpl));
    check('Google: an older event that still has the UCI in it is still matched', m.old === 'cx1', m.old);
    check('Google: anyone else’s event is left alone', !m.other[0] && !m.other[1], JSON.stringify(m.other));
  }

  // ---------------- 3. the relay: incidents and appointments ----------------
  {
    sent.length = 0;
    await page.evaluate(() => {
      n8nPost({ event: 'incident.created', id: 'inx1', uci: '7310452', home: 'Elm Street House', type: 'Fall', severity: 'Moderate', date: T, time: '09:10', reported_by: 'Sam Staff' });
      n8nCal({ event: 'appointment.created', id: 'apx1', uci: '7310452', init: 'MG', title: 'Dentist for Maria (MG)', type: 'Medical', date: T, time: '10:00', dur: 30, provider: 'Dr. Lee', loc: 'Bright Smiles', attendees: ['sam@maple.test'] });
      n8nHook('reminders', { event: 'pilot.signed', by: 'Dana Director', agency: 'Maple Care', at: new Date().toISOString() });
    });
    await page.waitForTimeout(800);
    const inc = sent.find((b) => b.action === 'incident'), cal = sent.find((b) => b.action === 'calendar'), rem = sent.find((b) => b.action === 'reminders');
    check('relay: an incident goes without the client’s ID', inc && !('uci' in inc.payload) && !leaks(JSON.stringify(inc)).length, JSON.stringify(inc && inc.payload));
    check('relay: and keeps what the notice needs (type, severity, home, time, who reported it)', inc && inc.payload.type === 'Fall' && inc.payload.severity === 'Moderate' && inc.payload.home === 'Elm Street House' && inc.payload.reported_by === 'Sam Staff' && inc.payload.time === '09:10');
    check('relay: an appointment goes without UCI or initials, its title scrubbed', cal && !('uci' in cal.payload) && !('init' in cal.payload) && cal.payload.title === 'Dentist for' && !leaks(JSON.stringify(cal)).length, JSON.stringify(cal && cal.payload));
    check('relay: the people invited keep their addresses', cal && JSON.stringify(cal.payload.attendees) === '["sam@maple.test"]');
    check('relay: other messages go as they were', rem && rem.payload.by === 'Dana Director' && rem.payload.agency === 'Maple Care');
  }

  // ---------------- 4. emails: a kind and its fields ----------------
  {
    sent.length = 0;
    await page.evaluate(() => {
      inviteSendNow('', 'new.director@maple.test', 'https://np.aiparagonconsulting.com/?join=qaToken123', 'Jo New', 'Director', true);
      NOTIF_RULES.doc = { who: ['director'], email: true, sms: false, portal: false };
      notifyRule('doc', 'Document uploaded', 'Care plan for 7310452');
      NOTIF_REMIND.task = Object.assign({}, NOTIF_REMIND.task || {}, { on: true, who: ['assignee'], email: true, portal: false });
      notifyTaskAssigned({ id: 'tx1', title: 'Take Maria (7310452) to the dentist', sid: 'sx1', due: T, stage: 'To do' }, true);
      TASKS.push({ id: 'tx2', title: 'Refill for Maria Gonzalez', due: T, stage: 'To do', sid: 'sx1' });
      digestTestSend();
    });
    await page.waitForTimeout(1000);
    const mails = sent.filter((b) => b.action === 'email').map((b) => b.payload);
    const by = (k) => mails.find((m) => m.kind === k);
    const inv = by('invite'), nt = by('notify'), tk = by('task'), dg = by('digest');
    check('email: the invite goes as its fields, no HTML or subject from the page', inv && inv.to === 'new.director@maple.test' && inv.name === 'Jo New' && inv.dir === true && /join=qaToken123/.test(inv.link) && !('html' in inv) && !('subject' in inv), JSON.stringify(inv));
    check('email: a notification goes as its event only', nt && nt.ev === 'doc' && Object.keys(nt).sort().join() === 'ev,kind,to', JSON.stringify(nt));
    check('email: a new task goes as its due day only', tk && tk.due && tk.to === stf && Object.keys(tk).sort().join() === 'due,kind,to', JSON.stringify(tk));
    check('email: the summary test copy goes as data, with no task titles', dg && dg.data && Array.isArray(dg.data.tasks) && dg.data.tasks.length > 0 && dg.data.tasks.every((t) => !('title' in t)), JSON.stringify(dg && dg.data && dg.data.tasks.slice(0, 2)));
    check('email: nothing in any of them names a client', !leaks(JSON.stringify(mails)).length, leaks(JSON.stringify(mails)).join(' '));
    check('email: no email carries HTML from the page', mails.length >= 4 && mails.every((m) => !('html' in m)), mails.length + ' sent');
  }

  // ---------------- 5. Ask Spectrum ----------------
  {
    const r = await page.evaluate(() => {
      ASK_LBL = {}; ASK_HOME = {};
      const out = askOut('- MG · 7310452 · Elm Street House · notes\n   Client name: Maria Gonzalez\n   Medication: Lisinopril 10 mg\n   Date of birth: 1990-01-02\n   Is a resident of: 12 Oak Ave\n- #17 (8840217) at Elm Street House');
      return { out, back: askIn(out), lbl: Object.assign({}, ASK_LBL) };
    });
    check('Ask: a client goes out as Client N', /^- Client 1 · /.test(r.out) && /Client 2 at Home A/.test(r.out), r.out);
    check('Ask: identity boxes are withheld, the rest is kept', /Client name: \[withheld\]/.test(r.out) && /Date of birth: \[withheld\]/.test(r.out) && /resident of: \[withheld\]/.test(r.out) && /Medication: Lisinopril 10 mg/.test(r.out), r.out);
    check('Ask: nothing names a client', !leaks(r.out, 1).length, leaks(r.out, 1).join(' '));
    check('Ask: the labels turn back into the portal’s own names', /MG \(7310452\)/.test(r.back) && /#17 \(8840217\) at Elm Street House/.test(r.back), r.back);
    // end to end: the question, the snapshot and the history all go out with labels, and the answer comes back named
    sent.length = 0;
    askReply = (p) => {
      const m = p.context.match(/Client (\d+) · [^\n]*Home ([A-Z])/);
      return m ? `Client ${m[1]} lives at Home ${m[2]}.\n[go:calendar]` : 'No client found.';
    };
    await page.evaluate(() => { ASK_HIST = []; if (!el('askPanel').classList.contains('on')) toggleAsk(); askSend('When is 7310452 (Maria) seeing the dentist?'); });
    await page.waitForFunction(() => !document.getElementById('askWait'), null, { timeout: 8000 });
    await page.evaluate(() => askSend('And MG’s next visit?'));
    await page.waitForFunction(() => !document.getElementById('askWait'), null, { timeout: 8000 });
    const asks = sent.filter((b) => b.action === 'ask').map((b) => b.payload);
    check('Ask: two questions went to the relay', asks.length === 2, asks.length + '');
    check('Ask: the question goes with a label', asks[0] && /Client \d+/.test(asks[0].question) && !leaks(asks[0].question, 1).length, asks[0] && asks[0].question);
    check('Ask: the snapshot names no client, home, phone or email', asks[0] && !leaks(asks[0].context, 1).length && !/555-201-7788|maria\.g@/.test(asks[0].context), asks[0] && leaks(asks[0].context, 1).join(' '));
    check('Ask: the snapshot tells it to use the labels', asks[0] && /Clients are named Client 1, Client 2/.test(asks[0].context));
    check('Ask: the history sent with the next question names no client', asks[1] && asks[1].history.length === 1 && !leaks(JSON.stringify(asks[1].history), 1).length, asks[1] && JSON.stringify(asks[1].history).slice(0, 300));
    check('Ask: the same client keeps the same label all session', asks[0] && asks[1] && asks[0].question.match(/Client \d+/)[0] === asks[1].question.match(/Client \d+/)[0]);
    const shown = await page.evaluate(() => [...document.querySelectorAll('#askLog .msg.bot')].slice(-1)[0].textContent);
    check('Ask: the answer on screen names the client and home as the portal does', /\(7310452\) lives at Elm Street House|\(8840217\) lives at Elm Street House/.test(shown), shown);
    check('Ask: a [go:] token still becomes a button', await page.evaluate(() => !![...document.querySelectorAll('#askLog .msg.bot')].slice(-1)[0].querySelector('button')));
  }

  // ---------------- Google's permission: the narrowest one, and only that (v12.38.3) ----------------
  {
    const asked = await page.evaluate(() => {
      const seen = [], prev = window.google;
      window.google = { accounts: { oauth2: {
        initCodeClient: (c) => { seen.push({ kind: 'code', scope: c.scope, incl: c.include_granted_scopes }); return { requestCode() {} }; },
        initTokenClient: (c) => { seen.push({ kind: 'token', scope: c.scope, incl: c.include_granted_scopes }); return { requestAccessToken() {} }; },
        revoke() {} } } };
      gcalClear(); GCAL.ready = null; GCAL.loading = false;
      gcalConnect();                                       // signed in: the connection the server keeps
      GCAL.ready = false; gcalConnect();                   // the server piece not in: this session only
      GCAL.ready = null; window.google = prev;
      return seen;
    });
    const OWNED = 'https://www.googleapis.com/auth/calendar.events.owned';
    const code = asked.find((x) => x.kind === 'code'), tok = asked.find((x) => x.kind === 'token');
    check('Google: connecting asks for calendar.events.owned (with openid, so the server knows the account)', code && code.scope === 'openid ' + OWNED, JSON.stringify(asked));
    check('Google: connecting for this session only asks for calendar.events.owned alone', tok && tok.scope === OWNED, JSON.stringify(asked));
    check('Google: never the wider calendar.events, and never a permission granted before', asked.length === 2 && asked.every((x) => x.incl === false && !x.scope.split(' ').includes('https://www.googleapis.com/auth/calendar.events')), JSON.stringify(asked));
    // the booking form says what really goes to Google (v12.38.4): title, time and place, no client details
    const note = await page.evaluate(() => {
      const read = () => { const n = document.querySelector('#apGcal'); const t = n ? n.closest('label').innerText.replace(/\s+/g, ' ').trim() : null; closeAll(); return t; };
      const was = GCAL.connected;
      GCAL.connected = true; openApptForm(); const on = read();
      GCAL.connected = false; openApptForm(); const off = read();
      GCAL.connected = was; return { on, off };
    });
    const says = (t) => !!t && /title, time and place/.test(t) && /Client names, initials and UCIs are left out/.test(t) && !/provider|initials and UCI,|Never a full name/.test(t);
    check('Google: the booking form says only the title, time and place go to Google, connected or not', says(note.on) && says(note.off) && /^Also send to Google Calendar Added to your connected/.test(note.on) && /Opens Google Calendar prefilled/.test(note.off), JSON.stringify(note));
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
