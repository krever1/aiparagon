// Care portal v12.49 (Erica's note from the VAI conference: talk to the dashboard and have it answer out loud; Kaeser's
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
    setTimeout(() => { this.emit('call-start'); if (window.__scene) window.__scene.go(this); }, 20);   // v12.52: a scene plays with the call
    return { id: 'call-test' };
  }
  stop(){ window.__vapi.stopped++; setTimeout(() => this.emit('call-end'), 10); }
  setMuted(m){ window.__vapi.muted = m; }
  isMuted(){ return !!window.__vapi.muted; }
  // v12.50: the call's room, with Ask Spectrum's audio track, and the messages sent into it
  getDailyCallObject(){
    if (!window.__room) {
      let track = window.__scene ? window.__scene.track : null;
      if (!track) try { const c = new AudioContext(); const o = c.createOscillator(); const d = c.createMediaStreamDestination(); o.connect(d); o.start(); track = d.stream.getAudioTracks()[0]; } catch (e) {}
      window.__room = { sent: [], track };
    }
    const r = window.__room;
    return { participants: () => ({ local: { local: true, user_name: '' }, spk: { local: false, user_name: 'Vapi Speaker', tracks: { audio: { state: 'playable', persistentTrack: r.track } } } }),
      sendAppMessage: (m) => { r.sent.push(m); } };
  }
}`;

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const sdkHits = [];
  async function open(opts) {
    opts = opts || {};
    const { ctx, page } = await H.newPage(env, { viewport: opts.viewport || { width: 1440, height: 900 }, bucket: errors, session: opts.session, relay: opts.relay });
    await ctx.route('https://cdn.jsdelivr.net/npm/@vapi-ai/web@*/**', (r) => {
      sdkHits.push(r.request().url());
      if (opts.noSdk) return r.abort();
      return r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE });
    });
    // v12.50: every play() is noted, and a test can make the browser refuse sound (as Safari does once the tap is past)
    await page.addInitScript(() => { const p0 = HTMLMediaElement.prototype.play; window.__plays = [];
      HTMLMediaElement.prototype.play = function () { window.__plays.push({ id: this.id, src: String(this.getAttribute('src') || '').slice(0, 22), stream: !!this.srcObject });
        if (window.__refuse) return Promise.reject(Object.assign(new Error('play() failed because the user did not interact with the document first.'), { name: 'NotAllowedError' }));
        try { return p0.apply(this, arguments).catch(() => {}); } catch (e) { return Promise.resolve(); } }; });
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
    check('(v12.51) no dictation mic button next to it, Talk is the one voice button', await page.evaluate(() => !document.querySelector('#askPanel #askMic') && !/🎤/.test(el('askPanel').innerHTML)));
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

  // ======================= 6. a browser that refuses sound started after the tap (v12.50) =======================
  {
    const { ctx, page } = await demo('director');
    await openAsk(page);
    await page.click('#askTalk');
    await page.waitForFunction(() => window.__vapi && window.__vapi.starts.length === 1); await page.waitForTimeout(100);
    let pl = await page.evaluate(() => window.__plays.filter((x) => x.id === 'askVoiceOut'));
    check('the Talk tap itself plays a moment of silence on Ask Spectrum\'s player, so the browser lets it make sound', pl.length >= 1 && pl[0].src.startsWith('data:audio/wav'), JSON.stringify(pl));
    // the SDK's own player is refused (Safari, an iPhone): the call goes on, and Ask Spectrum's audio plays on ours
    await emit(page, 'error', { type: 'audio-start-failed', error: { name: 'NotAllowedError', message: 'play() failed because the user did not interact with the document first.' } });
    await page.waitForTimeout(150);
    let st = await page.evaluate(() => { const a = el('askVoiceOut'); return { stream: !!(a.srcObject && a.srcObject.getAudioTracks()[0] === window.__room.track), sent: window.__room.sent.slice(), stopped: window.__vapi.stopped }; });
    let b = await bar(page);
    check('a refused SDK player does not end the call or blame the microphone', b.on && !/microphone|could not/i.test(b.text) && st.stopped === 0, JSON.stringify(b));
    check('...Ask Spectrum\'s audio plays on the player the tap unlocked, and Vapi is told it can speak', st.stream && st.sent.includes('playable'), JSON.stringify(st));
    check('...with no extra button when it plays', !/Tap to hear/.test(b.text), b.text);
    await emit(page, 'audio', {}); await page.waitForTimeout(80);
    check('if the SDK\'s own player starts after all, ours lets go (no doubled voice)', await page.evaluate(() => !el('askVoiceOut').srcObject));
    await page.click('#askVoice button:has-text("End")'); await page.waitForTimeout(80);
    check('End lets go of the player', await page.evaluate(() => { const a = el('askVoiceOut'); return !a.srcObject && !a.getAttribute('src'); }));

    // the browser refuses our player too: the bar offers a tap, which plays it
    await page.evaluate(() => { window.__room = null; });
    await page.click('#askTalk'); await page.waitForTimeout(150);
    await page.evaluate(() => { window.__refuse = true; });
    await emit(page, 'error', { type: 'audio-start-failed', error: { name: 'NotAllowedError' } });
    await page.waitForTimeout(150);
    b = await bar(page);
    check('sound refused everywhere: the bar says so and offers "Tap to hear Ask Spectrum"', b.on && /Sound is off/.test(b.text) && /Tap to hear Ask Spectrum/.test(b.text) && !(await page.evaluate(() => window.__room.sent.includes('playable'))), b.text);
    await page.evaluate(() => { window.__refuse = false; });
    await page.click('#askVoice button:has-text("Tap to hear")'); await page.waitForTimeout(150);
    b = await bar(page);
    check('...the tap plays it, tells Vapi, and the button goes', /Listening/.test(b.text) && !/Tap to hear/.test(b.text) && (await page.evaluate(() => window.__room.sent.includes('playable') && !!el('askVoiceOut').srcObject)), b.text);
    await page.click('#askVoice button:has-text("End")'); await page.waitForTimeout(80);

    // the SDK says nothing at all: after 8 seconds with no sound, the page plays it itself
    await page.evaluate(() => { window.__room = null; });
    await page.click('#askTalk'); await page.waitForTimeout(150);
    check('...nothing taken over before the SDK has had its chance', await page.evaluate(() => !el('askVoiceOut').srcObject));
    await page.waitForTimeout(8300);
    check('no sound 8 seconds into the call: the page plays Ask Spectrum\'s audio itself', await page.evaluate(() => !!el('askVoiceOut').srcObject && window.__room.sent.includes('playable')));
    await page.click('#askVoice button:has-text("End")'); await page.waitForTimeout(80);

    // any other error ends the call at Vapi too, not only on the page
    await page.click('#askTalk'); await page.waitForTimeout(150);
    const before = await page.evaluate(() => window.__vapi.stopped);
    await emit(page, 'error', { type: 'start-method-error', error: { message: 'Something broke' } });
    await page.waitForTimeout(100);
    b = await bar(page);
    check('another error ends the call at Vapi as well and says so', !b.on && /could not start/.test(b.text) && (await page.evaluate(() => window.__vapi.stopped)) === before + 1, JSON.stringify(b));
    await ctx.close();
  }

  // ======================= 7. the voice check (v12.52) =======================
  // A made-up voice (pitched buzz through moving formants, the engine's own test signal: no recording of anyone) plays
  // through the call's audio track, with the messages Vapi's SDK sends a page (voice-input pieces, speech-update, her
  // transcript) in step with it. The page takes her track, checks it once the conversation ends, and sends an alert with
  // only the kinds of fault and when they came, through the relay, when it finds a fault.
  {
    const SR = 16000;
    const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
    const resonator = (fc, bw) => { const r = Math.exp(-Math.PI * bw / SR), th = 2 * Math.PI * fc / SR, a1 = -2 * r * Math.cos(th), a2 = r * r, g = 1 - r; let y1 = 0, y2 = 0; return (x) => { const y = g * x - a1 * y1 - a2 * y2; y2 = y1; y1 = y; return y; }; };
    const VOWELS = [[700, 1220, 2600], [530, 1840, 2480], [300, 2200, 2950], [570, 840, 2410], [440, 1020, 2240], [640, 1190, 2390], [400, 1900, 2550], [350, 870, 2250]];
    const voice = (words, seed) => {
      const r = rng(seed), out = []; let phase = 0, t = 0; const push = (v) => { out.push(v); t += 1 / SR; };
      for (let w = 0; w < words; w++) {
        if (r() < 0.6) { const n = Math.round(SR * (0.03 + 0.03 * r())); for (let i = 0; i < n; i++) push((r() * 2 - 1) * 0.02); }
        const a = VOWELS[Math.floor(r() * VOWELS.length)], b = VOWELS[Math.floor(r() * VOWELS.length)];
        const len = Math.round(SR * (0.14 + 0.1 * r())), glide = 0.85 + 0.3 * r();
        let F = [resonator(a[0], 90), resonator(a[1], 110), resonator(a[2], 160)];
        for (let i = 0; i < len; i++) {
          const p = i / len;
          if (i % 80 === 0) { const fc = [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * p); F = [resonator(fc[0], 90), resonator(fc[1], 110), resonator(fc[2], 160)]; }
          phase += 205 * (glide + (1 - glide) * p) * (1 + 0.03 * Math.sin(2 * Math.PI * 5 * t)) / SR;
          const pulse = phase >= 1 ? (phase -= 1, 1) : 0, src = pulse - 0.02, env = Math.min(1, p * 8) * Math.min(1, (1 - p) * 6);
          push(0.35 * env * (F[0](src) + F[1](src) * 0.6 + F[2](src) * 0.3));
        }
        for (let i = 0; i < Math.round(SR * (0.06 + 0.04 * r())); i++) push(0);
      }
      let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v));
      return Float32Array.from(out, (v) => v * 0.3 / (pk || 1));
    };
    // turns of speech with quiet between them: the track, and the messages a page gets for it (times in ms from the start)
    const FIRST = "Hi, it's Ask Spectrum. What would you like to know?";
    const scene = (howl) => {
      const turns = [FIRST, 'Client 2 has three appointments this week, the first one on Tuesday morning at ten.', 'Is there anything else you would like to know about this week?'];
      const parts = [], ev = []; let pos = 0;
      turns.forEach((text, i) => {
        const gap = i ? 1.6 : 0.5; parts.push(new Float32Array(Math.round(gap * SR))); pos += gap;
        const v = voice(text.split(/\s+/).length, 300 + i), start = pos, dur = v.length / SR; parts.push(v); pos += dur;
        const ms = (x) => Math.round(x * 1000);
        if (i) {
          ev.push({ at: ms(start - 1.4), m: { type: 'speech-update', status: 'started', role: 'user' } }, { at: ms(start - 0.9), m: { type: 'speech-update', status: 'stopped', role: 'user' } },
            { at: ms(start - 0.85), m: { type: 'transcript', role: 'user', transcriptType: 'final', transcript: 'anything for morgan vale this week' } });
          text.split(/(?=\s)/).forEach((piece, k) => ev.push({ at: ms(start - 0.3) + k, m: { type: 'voice-input', input: piece, turn: i } }));
        }
        ev.push({ at: ms(start), m: { type: 'speech-update', status: 'started', role: 'assistant', turn: i } });
        ev.push({ at: ms(start + dur), m: { type: 'speech-update', status: 'stopped', role: 'assistant', turn: i } });
        ev.push({ at: ms(start + dur + 0.35), m: { type: 'transcript', role: 'assistant', transcriptType: 'final', transcript: text } });
        // the fault: a steady 350 Hz howl over a second of her words, from 0.8 s into turn 1
        if (i === 1 && howl) parts[parts.length - 1] = Float32Array.from(v, (x, k) => (k >= 0.8 * SR && k < 1.8 * SR) ? 0.25 * Math.sin(2 * Math.PI * 350 * (k / SR)) : x);
      });
      parts.push(new Float32Array(SR)); pos += 1;
      const n = parts.reduce((s2, p2) => s2 + p2.length, 0), x = new Float32Array(n); let o = 0; parts.forEach((p2) => { x.set(p2, o); o += p2.length; });
      const fl = rng(7919); for (let i = 0; i < n; i++) if (x[i] === 0) x[i] = 1.8e-4 * (fl() * 2 - 1);   // a real line is never perfectly silent
      return { b64: Buffer.from(x.buffer).toString('base64'), ev, ms: Math.round(pos * 1000) };
    };
    const play = (page, sc) => page.evaluate(([b64, ev]) => {
      const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const x = new Float32Array(u8.buffer), c = new AudioContext(), dest = c.createMediaStreamDestination();
      window.__room = null;
      window.__scene = { track: dest.stream.getAudioTracks()[0], go(inst) {
        c.resume().then(() => { const b = c.createBuffer(1, x.length, 16000); b.copyToChannel(x, 0); const s = c.createBufferSource(); s.buffer = b; s.connect(dest); s.start(); });
        ev.forEach((e) => setTimeout(() => inst.emit('message', e.m), e.at));
      } };
    }, [sc.b64, sc.ev]);
    const vgLine = (page) => page.evaluate(() => { const d = [...document.querySelectorAll('#askLog .v1252-vg')].pop(); return d ? d.textContent : ''; });
    const dir = 'dana@deltadayprogram.test';
    const S = { email: dir, password: 'qa-pass-1234', role: 'director',
      program: [{ key: 'users', value: { map: { [dir]: { name: 'Dana Lee', role: 'director', title: 'Executive Director' } } } },
        { key: 'org', value: { name: 'Delta Day Program' } },
        { key: 'pilot', value: { signatures: { ['u:' + dir]: { by: 'Dana Lee', at: 'Oct 1, 2026', role: 'Director' } } } }] };
    const relayed = [];
    const { ctx, page } = await open({ session: S, relay: (b) => { relayed.push(b); return { status: 200, body: { ok: true } }; } });
    await page.goto(env.BASE + '/portal.html?voicecheck=1', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
    await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => { CLIENTS.push({ id: 'qa-v2', uci: '4023998', name: 'Morgan Vale', init: 'M.V.', home: 'Cedar House' }); closeAll(); });
    check('the Voice Guard copy loads in its own script block, and the page can build the engine from it', await page.evaluate(() => typeof vgEngine === 'function' && typeof vgEngine().check === 'function' && /^function vgEngine\(\)/.test(vgEngine.toString())));
    await openAsk(page);

    // a clean conversation: nothing is sent, and the switch shows the result
    const clean = scene(false);
    await play(page, clean);
    await page.click('#askTalk'); await page.waitForFunction(() => window.__vapi && window.__vapi.starts.length >= 1);
    await page.waitForTimeout(clean.ms + 300);
    const took = await page.evaluate(() => ({ on: VG.on, n: VG.n, sr: VG.sr, ev: VG.ev.length, kinds: [...new Set(VG.ev.map((e) => e.m.type))].sort().join(','), user: VG.ev.some((e) => e.m.type === 'transcript' && e.m.role !== 'assistant') }));
    check('during the call the page takes her track and the messages the check reads', took.on && took.n > took.sr * 5 && took.ev >= 10 && took.kinds === 'speech-update,transcript,voice-input' && !took.user, JSON.stringify(took));
    check('...and sends nothing while the call is on', relayed.length === 0, JSON.stringify(relayed));
    await page.click('#askVoice button:has-text("End")');
    await page.waitForFunction(() => document.querySelector('#askLog .v1252-vg'), null, { timeout: 20000 });
    let line = await vgLine(page);
    check('a clean conversation: no alert goes anywhere', relayed.length === 0, JSON.stringify(relayed));
    check('...the test switch shows it was checked, with nothing wrong', /^Voice check: nothing wrong/.test(line) && /\d+ s of her voice checked/.test(line) && !/AI Paragon told/.test(line), line);
    check('...and everything taken was dropped (the track let go, the audio context closed)', await page.evaluate(() => !VG.on && !VG.ac && !VG.ds && VG.ev.length === 0 && VG.n === 0));

    // a howl over her words: one alert, kinds and times only
    const bad = scene(true);
    await play(page, bad);
    await page.click('#askTalk'); await page.waitForFunction(() => window.__vapi && window.__vapi.starts.length >= 2);
    await page.waitForTimeout(bad.ms + 300);
    check('...still nothing sent before the conversation ends', relayed.length === 0);
    await page.click('#askVoice button:has-text("End")');
    await page.waitForFunction((n) => document.querySelectorAll('#askLog .v1252-vg').length > n, 1, { timeout: 20000 });
    await page.waitForTimeout(300);
    line = await vgLine(page);
    const vc = relayed.filter((b) => b.action === 'voicecheck');
    const pay = vc.length ? JSON.stringify(vc[0].payload) : '';
    check('a howl over her words: one alert goes through the relay, as voicecheck', vc.length === 1 && relayed.length === 1, JSON.stringify(relayed));
    check('...naming the kind of fault and when it came, nothing else', /^\{"issues":\[(\{"kind":"[a-z]+","at":[0-9.]+\},?)+\]\}$/.test(pay) && /"kind":"(stuck|tone)"/.test(pay), pay);
    const at = vc.length ? vc[0].payload.issues.map((i) => i.at) : [];
    const turn1 = clean.ev.find((e) => e.m.type === 'speech-update' && e.m.role === 'assistant' && e.m.turn === 1).at / 1000;
    check('...at the right moment of the call', at.some((a) => a >= turn1 && a <= turn1 + 3.5), JSON.stringify(at) + ' turn 1 at ' + turn1);
    check('...with no client, words or names in it', !/4023998|Morgan|Vale|Cedar|Client|appointment|Tuesday/i.test(pay), pay);
    check('...and the switch says AI Paragon was told', /fault/.test(line) && /AI Paragon told/.test(line), line);
    await ctx.close();

    // the demo view checks too, but sends nothing
    const d = await demo('director');
    const sent = [];
    d.page.on('request', (r) => { if (/np-relay/.test(r.url()) && r.method() === 'POST') sent.push(r.url()); });
    await d.page.evaluate(() => { try { localStorage.setItem('np_vgshow', '1'); } catch (e) {} });
    await openAsk(d.page);
    await play(d.page, bad);
    await d.page.click('#askTalk'); await d.page.waitForFunction(() => window.__vapi && window.__vapi.starts.length >= 1);
    await d.page.waitForTimeout(bad.ms + 300);
    await d.page.click('#askVoice button:has-text("End")');
    await d.page.waitForFunction(() => document.querySelector('#askLog .v1252-vg'), null, { timeout: 20000 });
    line = await vgLine(d.page);
    check('the demo view: the fault is found but nothing is sent', sent.length === 0 && /fault/.test(line) && /not sent from the demo view/.test(line), line + ' | ' + sent.join(' '));
    await d.ctx.close();

    // turned off in the page's settings: no audio context, no check, Talk as before
    const o = await demo('director');
    await o.page.evaluate(() => { window.NP_CONFIG = Object.assign({}, window.NP_CONFIG || {}, { voiceCheck: false }); try { localStorage.setItem('np_vgshow', '1'); } catch (e) {} });
    await openAsk(o.page);
    await o.page.click('#askTalk'); await o.page.waitForFunction(() => window.__vapi && window.__vapi.starts.length >= 1); await o.page.waitForTimeout(300);
    const offState = await o.page.evaluate(() => ({ on: VG.on, ac: !!VG.ac }));
    await o.page.click('#askVoice button:has-text("End")'); await o.page.waitForTimeout(400);
    check('NP_CONFIG.voiceCheck false: nothing is taken or checked, and Talk works as before', !offState.on && !offState.ac && !(await vgLine(o.page)), JSON.stringify(offState));
    await o.ctx.close();

    // an iPhone: off unless the test switch is on (an audio context there shares the call's audio session)
    for (const sw of [false, true]) {
      const ip = await open();
      await ip.page.addInitScript(() => { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1' }); });
      await ip.page.goto(env.BASE + '/portal.html?demo=1' + (sw ? '&voicecheck=1' : ''), { waitUntil: 'load' });
      await ip.page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
      await ip.page.evaluate(() => signIn('director')); await ip.page.waitForTimeout(300);
      await openAsk(ip.page);
      await ip.page.click('#askTalk'); await ip.page.waitForFunction(() => window.__vapi && window.__vapi.starts.length >= 1); await ip.page.waitForTimeout(300);
      const st = await ip.page.evaluate(() => ({ ios: VG_IOS, on: VG.on, ac: !!VG.ac }));
      await ip.page.click('#askVoice button:has-text("End")'); await ip.page.waitForTimeout(200);
      if (!sw) check('an iPhone: the check stays off, so Talk sounds exactly as before', st.ios && !st.on && !st.ac, JSON.stringify(st));
      else check('...and runs there only with the test switch, to try it on a real one', st.ios && st.on && st.ac, JSON.stringify(st));
      await ip.ctx.close();
    }
  }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
