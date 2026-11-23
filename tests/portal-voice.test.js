// Care portal v12.49 (Erica's note from the VAI conference: talk to the dashboard and have it answer out loud; Kser's
// picks: Vapi, client labels only, the care portal first). Talk in the Ask Spectrum panel starts a Vapi web call with
// an assistant the page describes itself: the snapshot Ask reads, with Ask's labels (Client 1, Home A), never a UCI,
// a name, initials, an email or a phone; nothing recorded and no report sent to any server. The bar says who is who,
// the conversation shows in the chat with the portal's own names put back and is kept in Ask's history; Mute and End
// work, closing the panel ends it, and a blocked microphone or an unreachable service says so in plain words. Vapi is
// a stand-in here (the SDK address is answered by a fake module), so nothing real is called.
// Usage: node tests/portal-voice.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + String(detail).slice(0, 400) + ']'));
}

// a stand-in for @vapi-ai/web: records what the page asks for and lets the test play the call's events
const FAKE = `
export default class Vapi {
  constructor(key){ this.h = {}; window.__vapi = { key, inst: this, starts: [], stopped: 0, muted: null }; }
  on(e, f){ (this.h[e] = this.h[e] || []).push(f); }
  emit(e, a){ (this.h[e] || []).forEach((f) => f(a)); }
  async start(a, o){
    window.__vapi.starts.push(JSON.parse(JSON.stringify(a)));
    if (window.__vapiFail) { const f = window.__vapiFail; window.__vapiFail = null; throw f; }
    setTimeout(() => this.emit('call-start'), 20);
    return { id: 'call-test' };
  }
  stop(){ window.__vapi.stopped++; setTimeout(() => this.emit('call-end'), 10); }
  setMuted(m){ window.__vapi.muted = m; }
  isMuted(){ return !!window.__vapi.muted; }
}`;

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const sdkHits = [];
  async function open(opts) {
    opts = opts || {};
    const { ctx, page } = await H.newPage(env, { viewport: opts.viewport || { width: 1440, height: 900 }, bucket: errors, session: opts.session });
    await ctx.route('https://cdn.jsdelivr.net/npm/@vapi-ai/web@*/**', (r) => {
      sdkHits.push(r.request().url());
      if (opts.noSdk) return r.abort();
      return r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE });
    });
    if (opts.noMic) await page.addInitScript(() => { try { Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }); } catch (e) {} });
    return { ctx, page };
  }
  async function demo(role, opts) {
    const o = await open(opts);
    await o.page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await o.page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    if (role) { await o.page.evaluate((r) => signIn(r), role); await o.page.waitForFunction((r) => state.role === r, role); }
    await o.page.waitForTimeout(300);
    return o;
  }
  const openAsk = (page) => page.evaluate(() => { if (!el('askPanel').classList.contains('on')) toggleAsk(); });
  const bar = (page) => page.evaluate(() => { const b = el('askVoice'); const t = el('askTalk');
    return { hidden: b.hidden, phase: b.dataset.phase || '', text: b.innerText.replace(/\s+/g, ' ').trim(), on: t.classList.contains('is-on'), pressed: t.getAttribute('aria-pressed') }; });
  const emit = (page, e, a) => page.evaluate(([e, a]) => window.__vapi.inst.emit(e, a), [e, a]);
  const say = (page, role, text, final) => emit(page, 'message', { type: 'transcript', role, transcriptType: final === false ? 'partial' : 'final', transcript: text });
  const voiceMsgs = (page) => page.evaluate(() => [...document.querySelectorAll('#askLog .msg.v1249-v')].map((m) => (m.classList.contains('me') ? 'me: ' : 'bot: ') + m.textContent.replace(/voice$/i, '').trim()));

  // ======================= 1. a director in the demo view =======================
  {
    const { ctx, page } = await demo('director');
    await openAsk(page);
    const btn = await page.evaluate(() => { const b = el('askTalk'); const r = b.getBoundingClientRect(); return { shown: getComputedStyle(b).display !== 'none' && r.width > 0, label: b.getAttribute('aria-label') }; });
    check('Ask Spectrum has a Talk button', btn.shown && /Talk with Ask Spectrum/.test(btn.label), JSON.stringify(btn));
    check('...and nothing loads the voice service until it is pressed', sdkHits.length === 0, sdkHits.join(','));
    await page.click('#askTalk');
    await page.waitForFunction(() => window.__vapi && window.__vapi.starts.length === 1, null, { timeout: 5000 });
    await page.waitForTimeout(150);
    const a = await page.evaluate(() => window.__vapi.starts[0]);
    const key = await page.evaluate(() => window.__vapi.key);
    check('Talk starts a Vapi web call with the public key, SDK 3.1.0 pinned', key === '45350115-e7ae-4c66-8fb0-9a789ddacab7' && sdkHits.length === 1 && /@vapi-ai\/web@3\.1\.0\/\+esm$/.test(sdkHits[0]), key + ' ' + sdkHits.join(','));
    check('...with an assistant the page describes: Clara, Deepgram, gpt-4.1', a.voice.provider === 'vapi' && a.voice.voiceId === 'Clara' && a.transcriber.provider === 'deepgram' && a.model.model === 'gpt-4.1' && /Ask Spectrum/.test(a.firstMessage), JSON.stringify({ voice: a.voice, tr: a.transcriber, m: a.model.model }));
    check('...that records nothing and reports to no server', a.artifactPlan && a.artifactPlan.recordingEnabled === false && Array.isArray(a.serverMessages) && a.serverMessages.length === 0 && !a.server && !a.serverUrl, JSON.stringify({ ap: a.artifactPlan, sm: a.serverMessages }));
    const prompt = a.model.messages[0].content;
    const ids = await page.evaluate(() => visibleClients().map((c) => ({ uci: c.uci, init: c.init, name: c.name || '' })));
    const homes = await page.evaluate(() => askHomes());
    const leaks = [];
    ids.forEach((c) => { if (c.uci && prompt.includes(c.uci)) leaks.push(c.uci); if (c.name && c.name.length > 2 && prompt.includes(c.name)) leaks.push(c.name); if (c.init && /[A-Za-z]/.test(c.init) && new RegExp('\\b' + c.init.replace(/\./g, '\\.') + '\\b').test(prompt)) leaks.push(c.init); });
    homes.forEach((h) => { if (prompt.includes(h)) leaks.push(h); });
    check('the assistant gets the portal snapshot with labels: no UCI, client name, initials or home name', /Client 1/.test(prompt) && /Home A/.test(prompt) && leaks.length === 0 && !/\b\d{7}\b/.test(prompt), leaks.join(', '));
    check('...and its rules: short spoken answers, labels only, read only, safety', /one to three sentences/.test(prompt) && /Client 1, Client 2/.test(prompt) && /can only read/.test(prompt) && /911/.test(prompt) && /PORTAL SNAPSHOT/.test(prompt) && /Appointments/.test(prompt) && /Water temperature/.test(prompt) && /Tasks/.test(prompt));
    let b = await bar(page);
    check('the bar shows Listening once the call starts, the Talk button turns into End', !b.hidden && b.phase === 'live' && /Listening/.test(b.text) && b.on && b.pressed === 'true', JSON.stringify(b));
    const c1 = await page.evaluate(() => { const id = Object.keys(ASK_LBL).find((k) => ASK_LBL[k] === 1); return client(id); });
    check('...and says who is who out loud, by UCI', b.text.includes('Client 1 is ' + c1.uci) && /Home A is /.test(b.text), b.text);
    check('...and that clients are said by number and nothing is recorded', /Ask by number, not by name/.test(b.text) && /nothing is recorded/.test(b.text), b.text);
    await emit(page, 'speech-start'); b = await bar(page);
    check('while Ask Spectrum talks the bar says so', b.phase === 'speaking' && /is speaking/.test(b.text), b.text);
    await emit(page, 'speech-end');
    await say(page, 'assistant', 'Hi, it\'s Ask Spectrum. What would you like to know?');
    await say(page, 'user', 'When is Client 1', false);
    let msgs = await voiceMsgs(page);
    check('what is being said shows as it comes, with the label shown as the client', msgs.length === 2 && msgs[1].startsWith('me: ') && msgs[1].includes(c1.uci), JSON.stringify(msgs));
    await say(page, 'user', 'When is Client 1\'s next appointment?');
    await say(page, 'assistant', 'Client 1 has a dentist visit Thursday at 2 PM.');
    await say(page, 'assistant', 'Anything else?');
    msgs = await voiceMsgs(page);
    check('each turn is one bubble; the answer reads the client by UCI, not "Client 1"', msgs.length === 3 && msgs[2].includes(c1.uci) && !/Client 1\b/.test(msgs[2]) && /Anything else\?$/.test(msgs[2]), JSON.stringify(msgs));
    await page.click('#askVoice button:has-text("Mute")');
    b = await bar(page);
    check('Mute mutes the microphone and says so', b.text.includes('Unmute') && /Muted/.test(b.text) && (await page.evaluate(() => window.__vapi.muted)) === true, b.text);
    await page.click('#askVoice button:has-text("Unmute")');
    check('...and Unmute turns it back on', (await page.evaluate(() => window.__vapi.muted)) === false);
    await page.click('#askVoice button:has-text("End")');
    await page.waitForTimeout(150);
    b = await bar(page);
    const st = await page.evaluate(() => ({ stopped: window.__vapi.stopped, hist: ASK_HIST.slice(-1)[0], cur: (ASK_CUR && ASK_CUR.msgs || []).map((m) => m.who + ':' + m.text) }));
    check('End stops the call, the bar goes and the button is Talk again', st.stopped === 1 && b.hidden && !b.on && b.pressed === 'false', JSON.stringify({ b, stopped: st.stopped }));
    check('the conversation is kept in Ask\'s history like a typed one, with the portal\'s names', st.cur.some((m) => m.startsWith('me:') && m.includes(c1.uci)) && st.cur.some((m) => m.startsWith('bot:') && /dentist/.test(m)) && st.hist && /dentist/.test(st.hist.a), JSON.stringify(st.cur));
    await page.evaluate(() => { el('askInput').value = 'What is overdue?'; askSend(); }); await page.waitForTimeout(800);
    check('typing still works after a voice conversation', await page.evaluate(() => [...document.querySelectorAll('#askLog .msg.me')].some((m) => m.textContent === 'What is overdue?')));
    // a second conversation: same SDK, a fresh snapshot
    await page.click('#askTalk'); await page.waitForFunction(() => window.__vapi.starts.length === 2); await page.waitForTimeout(80);
    check('Talk again starts a second conversation without loading the SDK again', sdkHits.length === 1 && (await bar(page)).on);
    await page.evaluate(() => toggleAsk()); await page.waitForTimeout(100);
    b = await bar(page);
    check('closing Ask Spectrum ends the conversation', (await page.evaluate(() => window.__vapi.stopped)) === 2 && !b.on, JSON.stringify(b));
    await openAsk(page);
    // the agent hanging up (its goodbye) ends it on the page too
    await page.click('#askTalk'); await page.waitForFunction(() => window.__vapi.starts.length === 3); await page.waitForTimeout(80);
    await emit(page, 'error', { type: 'daily-error', error: { msg: 'Meeting has ended' } }); await page.waitForTimeout(80);
    b = await bar(page);
    check('the call ending from the voice side (a goodbye) ends it quietly', b.hidden && !b.on, JSON.stringify(b));
    // the microphone refused
    await page.evaluate(() => { window.__vapiFail = { name: 'NotAllowedError', message: 'Permission denied' }; });
    await page.click('#askTalk'); await page.waitForTimeout(250);
    b = await bar(page);
    check('a blocked microphone says how to allow it, and Talk works again', !b.on && /microphone is blocked/.test(b.text) && /Allow it/.test(b.text), JSON.stringify(b));
    await page.click('#askTalk'); await page.waitForTimeout(150);
    b = await bar(page);
    check('...and the next try clears the message', b.on && !/blocked/.test(b.text), JSON.stringify(b));
    await page.click('#askVoice button:has-text("End")'); await page.waitForTimeout(80);
    await ctx.close();
  }

  // ======================= 2. the service cannot be reached =======================
  {
    const { ctx, page } = await demo('director', { noSdk: true });
    await openAsk(page);
    await page.click('#askTalk'); await page.waitForTimeout(600);
    const b = await bar(page);
    check('a voice service that cannot be reached says so in plain words', !b.on && /could not be reached/.test(b.text), JSON.stringify(b));
    await ctx.close();
  }

  // ======================= 3. staff and family =======================
  for (const role of ['staff', 'family']) {
    const { ctx, page } = await demo(role);
    await openAsk(page);
    await page.click('#askTalk'); await page.waitForFunction(() => window.__vapi && window.__vapi.starts.length === 1);
    const a = await page.evaluate(() => window.__vapi.starts[0]);
    const prompt = a.model.messages[0].content;
    const ucis = await page.evaluate(() => CLIENTS.map((c) => c.uci).filter(Boolean));
    const mine = await page.evaluate(() => visibleClients().length);
    check(`${role}: Talk works with their own snapshot and no UCI in it`, a.metadata.role === role && !ucis.some((u) => prompt.includes(u)) && /Client 1/.test(prompt), String(ucis.filter((u) => prompt.includes(u))));
    if (role === 'family') check('family: the snapshot names only their own client', !/Client 2\b/.test((prompt.split('PORTAL SNAPSHOT:')[1] || '').replace(/Client 1, Client 2 and so on/g, '')) && mine === 1, String(mine));
    await page.click('#askVoice button:has-text("End")');
    await ctx.close();
  }

  // ======================= 4. signed in to a real team =======================
  {
    const dir = 'dana@deltadayprogram.test';
    const S = { email: dir, password: 'qa-pass-1234', role: 'director',
      program: [{ key: 'users', value: { map: { [dir]: { name: 'Dana Lee', role: 'director', title: 'Executive Director' } } } },
        { key: 'org', value: { name: 'Delta Day Program' } },
        { key: 'pilot', value: { signatures: { ['u:' + dir]: { by: 'Dana Lee', at: 'Oct 1, 2026', role: 'Director' } } } }] };
    const { ctx, page } = await open({ session: S });
    const calls = [];
    page.on('request', (r) => { const u = r.url(); if (/supabase\.co|n8n|np-relay/.test(u) && r.method() !== 'OPTIONS') calls.push(r.method() + ' ' + u.replace(/^https:\/\/[^/]+/, '').split('?')[0]); });
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
    await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => { CLIENTS.push({ id: 'qa-v1', uci: '4023999', name: 'Riley Quinn', init: 'R.Q.', home: 'Juniper House' }); closeAll(); });
    await openAsk(page);
    const n0 = calls.length;
    await page.click('#askTalk'); await page.waitForFunction(() => window.__vapi && window.__vapi.starts.length === 1);
    await page.waitForTimeout(200);
    const prompt = await page.evaluate(() => window.__vapi.starts[0].model.messages[0].content);
    check('signed in: a real client goes out as a label, never its UCI, name, initials or home', !prompt.includes('4023999') && !prompt.includes('Riley') && !prompt.includes('R.Q.') && !prompt.includes('Juniper House') && /Client \d/.test(prompt));
    await say(page, 'user', 'Anything for Client ' + (await page.evaluate(() => ASK_LBL['qa-v1'])) + ' this week?');
    await page.waitForTimeout(100);
    const msgs = await voiceMsgs(page);
    check('...and the screen shows that client by UCI', msgs.some((m) => m.includes('4023999')), JSON.stringify(msgs));
    const extra = calls.slice(n0).filter((c) => !/np_demo_program/.test(c));
    check('starting a voice conversation sends nothing to the database, the relay or n8n', extra.length === 0, extra.join(' | '));
    await page.click('#askVoice button:has-text("End")');
    await ctx.close();
  }

  // ======================= 5. a phone, and a browser with no microphone =======================
  {
    const { ctx, page } = await demo('director', { viewport: { width: 390, height: 844 } });
    await openAsk(page);
    await page.click('#askTalk'); await page.waitForFunction(() => window.__vapi && window.__vapi.starts.length === 1); await page.waitForTimeout(100);
    const fit = await page.evaluate(() => { const b = el('askVoice').getBoundingClientRect(); const p = el('askPanel').getBoundingClientRect();
      const btns = [...document.querySelectorAll('#askVoice button')].map((x) => x.getBoundingClientRect());
      return { inside: b.left >= p.left - 1 && b.right <= p.right + 1, page: document.scrollingElement.scrollWidth - innerWidth, tap: Math.min(...btns.map((r) => r.height)), talk: el('askTalk').getBoundingClientRect().width }; });
    check('phone: the bar fits the panel, buttons big enough to tap, nothing sideways', fit.inside && fit.page <= 1 && fit.tap >= 32 && fit.talk >= 32, JSON.stringify(fit));
    await page.click('#askVoice button:has-text("End")');
    await ctx.close();
    const n = await demo('director', { noMic: true });
    await openAsk(n.page);
    const shown = await n.page.evaluate(() => getComputedStyle(el('askTalk')).display !== 'none');
    check('a browser with no microphone access shows no Talk button', !shown);
    await n.ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
