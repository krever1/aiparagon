// Upload a form and the box editor tests for E-&-G-Home-Inc.html (#2, the care portal), v12.38. Upload a form asks what
// is being uploaded: a blank form becomes a template ("Keep it in Templates", with where its signed copies are filed),
// a completed or signed form is filed as it is in Documents (a binder, a client's file or a staff member's file) with no
// boxes. In the box editor a name typed in the side panel no longer eats the next click (Date, Remove, Duplicate, the
// format bar: Oct 23), each box says its kind (Text, Date, Amount, Signature), and Number is called Amount and takes
// decimals. Checked in the demo view on Erica's form, plus a signed-in upload through the Supabase stubs.
// Usage: node tests/portal-upload.test.js [baseline.html]
const path = require('path');
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const FORM = path.join(H.FORMS, 'alta-medication-reason-for-use.pdf');

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  async function demo(viewport) {
    const { ctx, page } = await H.newPage(env, { viewport: viewport || { width: 1440, height: 1000 }, bucket: errors });
    page.on('dialog', (d) => d.accept());
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    await page.evaluate(() => go('forms')); await page.waitForTimeout(300);
    return { ctx, page };
  }
  const shown = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return !!n && !!n.offsetParent && getComputedStyle(n).display !== 'none'; }, sel);
  const toastText = (page) => page.evaluate(() => ((el('toast') || {}).textContent || '').replace(/^[✓!]\s*/, ''));
  const modalOn = (page) => page.evaluate(() => el('modal').classList.contains('on'));

  // ---------------- 1. the upload window asks what is being uploaded ----------------
  {
    const { ctx, page } = await demo();
    await page.evaluate(() => ovUploadStart('Medical')); await page.waitForTimeout(300);
    const w = await page.evaluate(() => ({ q: (document.querySelector('.ov-what-h') || {}).textContent, opts: [...document.querySelectorAll('.ov-what-o b')].map((b) => b.textContent),
      picked: (document.querySelector('input[name="ovWhat"]:checked') || {}).value, labels: [...document.querySelectorAll('#mdBody label')].map((l) => l.textContent.trim()),
      dest: [...el('ovDest').options].map((o) => o.textContent), note: el('ovDestSay').textContent, go: el('ovGo').textContent }));
    check('Upload a form asks "What are you uploading?": a blank form, or a completed or signed form', w.q === 'What are you uploading?' && w.opts.join('|') === 'A blank form|A completed or signed form' && w.picked === 'blank', JSON.stringify(w));
    check('a blank form: "Keep it in Templates", one choice per Templates section', w.labels.includes('Keep it in Templates') && w.dest.slice(0, 3).join('|') === 'Agency binder templates|Medical binder templates|Daily Logs binder templates' && !w.labels.some((l) => /Filled-in copies/.test(l)), JSON.stringify(w.labels) + ' ' + JSON.stringify(w.dest));
    check('...and it says where signed copies go: Documents, in that binder', /^Signed copies are filed in Documents, in the Medical binder, unless a client’s or staff member’s file is picked when signing\.$/.test(w.note), w.note);
    await page.selectOption('#ovDest', 'Agency'); await page.waitForTimeout(100);
    check('...which follows the choice', /in the Agency binder,/.test(await page.evaluate(() => el('ovDestSay').textContent)));
    check('a blank form shows the AI note, the language and "Upload the blank form"; the button says Set up the form',
      (await shown(page, '#mdBody .ai-note')) && (await shown(page, '#ovLang')) && (await page.evaluate(() => [...document.querySelectorAll('#mdBody .sec-note')].some((n) => /Upload the blank form/.test(n.textContent) && n.offsetParent))) && w.go === 'Set up the form');
    await page.click('input[name="ovWhat"][value="done"]'); await page.waitForTimeout(150);
    const d = await page.evaluate(() => ({ ai: !!document.querySelector('#mdBody .ai-note').offsetParent, lang: !!el('ovLang').offsetParent, lock: [...document.querySelectorAll('#mdBody .sec-note')].some((n) => /Upload the blank form/.test(n.textContent) && n.offsetParent),
      title: !!el('ovDoneTitle').offsetParent, date: el('ovDoneDate').value, where: [...el('ovDoneWhere').options].map((o) => o.textContent), who: !!el('ovDoneWho').offsetParent,
      drop: el('ovDropT').textContent, go: el('ovGo').textContent, say: el('ovDoneSay').textContent }));
    check('a completed form: no AI note, no language, no "Upload the blank form"', !d.ai && !d.lang && !d.lock, JSON.stringify(d));
    check('...a title, the date on it (today) and where to file it: a binder in Documents, a client’s file, a staff member’s file', d.title && /^\d{4}-\d\d-\d\d$/.test(d.date) && d.where.join('|') === 'A binder in Documents|A client’s file|A staff member’s file' && !d.who, JSON.stringify(d));
    check('..."Choose the file" (PDF, Word or a photo) and the button says File it', /^Choose the file/.test(d.drop) && d.go === 'File it' && /binder on the Documents page/.test(d.say), JSON.stringify(d));
    await page.setInputFiles('#ovFile', FORM); await page.waitForTimeout(150);
    check('picking the file fills in its title', await page.evaluate(() => el('ovDoneTitle').value) === 'alta medication reason for use');
    await page.selectOption('#ovDoneWhere', 'client'); await page.waitForTimeout(100);
    const c = await page.evaluate(() => ({ who: !!el('ovDoneWho').offsetParent, lab: el('ovDoneWhoL').textContent, n: el('ovDoneWho').options.length, first: el('ovDoneWho').options[1] && el('ovDoneWho').options[1].textContent, n7: visibleClients().length }));
    check('a client’s file asks which client (by client ID)', c.who && c.lab === 'Client' && c.n === c.n7 + 1 && /^\d{7}$/.test(c.first), JSON.stringify(c));
    await page.click('input[name="ovWhat"][value="blank"]'); await page.waitForTimeout(150);
    check('back to a blank form: the button says Set up the form again, and the template name is filled in', await page.evaluate(() => el('ovGo').textContent === 'Set up the form' && el('ovName').value === 'alta medication reason for use'));
    await ctx.close();
  }

  // ---------------- 2. a completed form filed in a binder, a client's file, a staff member's file ----------------
  {
    const { ctx, page } = await demo();
    const nTpl = await page.evaluate(() => TEMPLATES5.length);
    const start = async () => { await page.evaluate(() => { closeAll(); go('forms'); ovUploadStart('Agency', 'done'); }); await page.waitForTimeout(250); await page.setInputFiles('#ovFile', FORM); await page.waitForTimeout(100); };
    // a binder, in a subfolder
    await start();
    await page.fill('#ovDoneTitle', 'Medication reason, Dr. Chen signed');
    await page.selectOption('#udBinderKey', 'Medical'); await page.waitForTimeout(100);
    const sub = await page.evaluate(() => [...el('udSub').options].map((o) => o.value).find((v) => v && v !== '__add__'));
    await page.selectOption('#udSub', sub);
    await page.click('#ovGo'); await page.waitForTimeout(600);
    let r = await page.evaluate(() => ({ open: el('modal').classList.contains('on'), tpl: TEMPLATES5.length, top: (COMPLETED.Medical || [])[0], doc: DOCS[0], tag: DOCTAG['|' + DOCS[0].n] }));
    check('filed in a binder: no template is made', !r.open && r.tpl === nTpl, JSON.stringify({ open: r.open, tpl: r.tpl, nTpl }));
    check('...it is in the Medical binder, in the subfolder picked, as "Completed form"', r.top && r.top.n === 'Medication reason, Dr. Chen signed.pdf' && r.top.sb === sub && r.doc.cat === 'Completed form' && !r.doc.cid && r.tag && r.tag.b === 'Medical' && r.tag.sb === sub, JSON.stringify(r));
    check('...and it says where it went', (await toastText(page)) === `Filed in the Medical binder / ${sub} on the Documents page.`, await toastText(page));
    const act = await page.evaluate(() => ({ row: (COMPLETED.Medical || [])[0].sub, a: DOC_ACT[0] && { k: DOC_ACT[0].k, w: DOC_ACT[0].w } }));
    check('...its binder row and Recent activity say uploaded and name the binder, never "Agency" (v12.38.2)', /^Uploaded by \S/.test(act.row) && act.a && act.a.k === 'uploaded' && act.a.w === `Medical binder / ${sub}`, JSON.stringify(act));
    await page.evaluate(() => { closeAll(); go('templates'); }); await page.waitForTimeout(400);
    check('...it shows in the Medical binder on the Documents page', await page.evaluate(() => [...document.querySelectorAll('#view section')].some((s) => /Agency binders/.test(s.textContent) && /Medication reason, Dr\. Chen signed/.test(s.innerText))));
    // a client's file: the client must be picked
    await start();
    await page.selectOption('#ovDoneWhere', 'client'); await page.waitForTimeout(100);
    await page.click('#ovGo'); await page.waitForTimeout(250);
    check('a client’s file with no client picked: it asks for one and stays open', (await modalOn(page)) && /Pick the client/.test(await toastText(page)), await toastText(page));
    const cid = await page.evaluate(() => el('ovDoneWho').options[1].value);
    await page.selectOption('#ovDoneWho', cid); await page.fill('#ovDoneTitle', 'Release of information signed');
    await page.click('#ovGo'); await page.waitForTimeout(600);
    r = await page.evaluate((id) => ({ doc: DOCS[0], uci: client(id).uci, inBinder: Object.values(COMPLETED).flat().some((x) => /Release of information signed/.test(x.n)) }), cid);
    check('...filed in that client’s file, not in the team binder', r.doc.cid === cid && r.doc.n === 'Release of information signed.pdf' && r.doc.cat === 'Completed form' && !r.inBinder, JSON.stringify(r));
    check('...and it says whose file', (await toastText(page)) === `Filed in client ${r.uci}’s file on the Documents page.`, await toastText(page));
    const act2 = await page.evaluate(() => DOC_ACT[0] && { k: DOC_ACT[0].k, w: DOC_ACT[0].w });
    check('...and Recent activity says uploaded, to that client (v12.38.2)', act2 && act2.k === 'uploaded' && act2.w.includes(r.uci) && !/Agency/.test(act2.w), JSON.stringify(act2));
    await page.evaluate((id) => { closeAll(); go('clients'); openClient(id); state.tab = 'documents'; render(); }, cid); await page.waitForTimeout(400);
    check('...it shows in the client’s Files', await page.evaluate(() => /Release of information signed/.test(el('view').innerText)));
    // a staff member's file
    await start();
    await page.selectOption('#ovDoneWhere', 'staff'); await page.waitForTimeout(100);
    const sid = await page.evaluate(() => el('ovDoneWho').options[1].value);
    check('a staff member’s file asks who, by name', await page.evaluate(() => el('ovDoneWhoL').textContent === 'Staff member' && /·/.test(el('ovDoneWho').options[1].textContent)));
    await page.selectOption('#ovDoneWho', sid); await page.fill('#ovDoneTitle', 'CPR card renewal signed');
    await page.click('#ovGo'); await page.waitForTimeout(600);
    r = await page.evaluate((id) => ({ doc: DOCS[0], name: staff(id).name }), sid);
    check('...filed in that person’s staff file', r.doc.cid === sid && r.doc.n === 'CPR card renewal signed.pdf' && (await toastText(page)) === `Filed in ${r.name}’s staff file on the Documents page.`, JSON.stringify(r) + ' ' + (await toastText(page)));
    check('no template was made by any of them', await page.evaluate(() => TEMPLATES5.length) === nTpl);
    await ctx.close();
  }

  // ---------------- 3. signed in: the file is stored and recorded ----------------
  {
    const DIR = 'jordan@example.org', calls = [];
    const S = { email: DIR, password: 'qa-pass-1234', role: 'director', program: [
      { key: 'users', value: { map: { [DIR]: { name: 'Jordan Lee', role: 'director', title: 'Executive Director' } } } },
      { key: 'pilot', value: { signatures: { ['u:' + DIR]: { by: 'Jordan Lee', at: 'Oct 1, 2026', role: 'Director' } } } }] };
    const bodies = [];
    const rest = async ({ method, path: p, body }) => { if (method === 'POST' && p.startsWith('/rest/v1/np_demo_documents')) bodies.push(body); return undefined; };
    const { ctx, page } = await H.newPage(env, { session: S, rest, calls, viewport: { width: 1440, height: 1000 }, bucket: errors });
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
    await page.fill('#liEmail', DIR); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 15000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => { closeAll(); go('forms'); ovUploadStart('Agency', 'done'); }); await page.waitForTimeout(250);
    await page.setInputFiles('#ovFile', FORM); await page.fill('#ovDoneTitle', 'Signed agreement');
    await page.click('#ovGo'); await page.waitForTimeout(1200);
    const up = calls.filter((c) => /^POST \/storage\/v1\/object\/np-demo-docs\//.test(c));
    const rec = bodies.map((b) => { try { return [].concat(JSON.parse(b))[0]; } catch (e) { return {}; } }).find((b) => b.n === 'Signed agreement.pdf');
    check('signed in: the file itself is stored', up.length === 1 && /clients\/agency\//.test(up[0]), JSON.stringify(up));
    check('...and recorded as a completed form with where it is stored', !!rec && rec.cat === 'Completed form' && /clients\/agency\//.test(rec.storage_path || '') && !!rec.url, JSON.stringify(rec));
    await ctx.close();
  }

  // ---------------- 4. the box editor: kinds on the boxes, Amount, and no lost clicks after a rename ----------------
  {
    const { ctx, page } = await demo();
    await page.evaluate(() => ovUploadStart('Medical')); await page.waitForTimeout(250);
    await page.setInputFiles('#ovFile', FORM); await page.click('#ovGo');
    await page.waitForFunction(() => /Found \d+ places/.test((document.querySelector('.ov-intro') || {}).textContent || ''), null, { timeout: 120000 });
    await page.waitForTimeout(700);
    const at = (re) => page.evaluate((src) => { const i = ovT().fields.findIndex((f) => new RegExp(src).test(f.l)); if (i < 0) return null;
      const n = document.querySelector(`.ov-modal .ov-f[data-i="${i}"]`); n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { i, x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 }; }, re.source);
    const pick = async (re) => { const b = await at(re); await page.mouse.click(b.x, b.y); await page.waitForTimeout(200); return b.i; };
    const press = async (sel) => { const b = await page.evaluate((s) => { const n = typeof s === 'string' ? document.querySelector(s) : null; const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
      await page.mouse.click(b.x, b.y); await page.waitForTimeout(250); };
    const kindBtn = (k) => `#ovSide .ov-kinds button[onclick="ovSetKind('${k}')"]`;
    const fd = (re) => page.evaluate((src) => { const f = ovT().fields.find((x) => new RegExp(src).test(x.l)); return f ? { l: f.l, ty: f.ty, b: !!f.ov.b } : null; }, re.source);

    const labels = await page.evaluate(() => ovT().fields.map((f, i) => { const n = document.querySelector(`.ov-modal .ov-f[data-i="${i}"]`); return { ty: f.ty, lb: n.querySelector('.ov-lb').textContent, title: n.title, l: f.l }; }));
    const want = { text: 'TText', date: '\u{1F4C5}Date', signature: '✍Signature' };
    check('every box says its kind (Text, Date, Signature), not its name', labels.every((x) => want[x.ty] ? x.lb === want[x.ty] : true) && labels.some((x) => x.ty === 'date') && labels.some((x) => x.ty === 'signature'), JSON.stringify(labels.filter((x) => want[x.ty] && x.lb !== want[x.ty]).slice(0, 3)));
    check('...and its name shows on hover', labels.every((x) => x.title === x.l + ' · ' + ({ text: 'Text', date: 'Date', signature: 'Signature', number: 'Amount', 'long text': 'Paragraph', time: 'Time', check: 'Tick box' })[x.ty]), JSON.stringify(labels.slice(0, 2)));
    const bars = await page.evaluate(() => ({ add: [...document.querySelectorAll('.ov-tool')].map((b) => b.textContent.trim()), side: null }));
    check('Add a box offers Amount (Number is called Amount)', bars.add.some((t) => /Amount$/.test(t)) && !bars.add.some((t) => /Number/.test(t)), bars.add.join(', '));

    // rename, then Date straight away (Erica's report: the click was lost and the box stayed Text)
    await pick(/^Consumer$/);
    check('the side panel offers Amount too', await page.evaluate(() => [...document.querySelectorAll('#ovSide .ov-kinds button')].some((b) => /Amount$/.test(b.textContent.trim()))));
    await page.fill('#ovLabel', 'Consumer name'); await press(kindBtn('date'));
    let f = await fd(/^Consumer/);
    check('rename, then Date: the box becomes a date box and keeps its new name', f && f.ty === 'date' && f.l === 'Consumer name', JSON.stringify(f));
    check('...and the box on the page now says Date', await page.evaluate(() => { const i = ovT().fields.findIndex((x) => x.l === 'Consumer name'); return document.querySelector(`.ov-modal .ov-f[data-i="${i}"] .ov-lb`).textContent === '\u{1F4C5}Date'; }));
    // rename, then Amount: the label follows the kind
    await pick(/^Is a resident of$/); await page.fill('#ovLabel', 'Resident of'); await press(kindBtn('number'));
    f = await fd(/^Resident of$/);
    check('rename, then Amount: an amount box, named, that says Amount', f && f.ty === 'number' && await page.evaluate(() => { const i = ovT().fields.findIndex((x) => x.l === 'Resident of'); return document.querySelector(`.ov-modal .ov-f[data-i="${i}"] .ov-lb`).textContent === '#Amount'; }), JSON.stringify(f));
    // rename, then Bold on the format bar
    await pick(/^DOB$/); await page.fill('#ovLabel', 'Date of birth'); await press('#ovFmt button[title^="Bold"]');
    f = await fd(/^Date of birth$/);
    check('rename, then Bold: the name is kept and the box is bold', f && f.b, JSON.stringify(f));
    // rename, then Duplicate
    const n0 = await page.evaluate(() => ovT().fields.length);
    await pick(/^Dear Doctor$/); await page.fill('#ovLabel', 'Doctor'); await press('#ovSide .ov-side-acts button');
    check('rename, then Duplicate: two boxes, the first one renamed', await page.evaluate(() => ovT().fields.length) === n0 + 1 && !!(await fd(/^Doctor$/)) && !!(await fd(/^Doctor \(2\)$/)), JSON.stringify(await page.evaluate(() => ovT().fields.filter((x) => /Doctor/.test(x.l)).map((x) => x.l))));
    // rename, then Remove: the right box goes
    await pick(/^Your Patient$/); await page.fill('#ovLabel', 'Patient'); await press('#ovSide .ov-del');
    check('rename, then Remove: that box is removed, and the toast names it', !(await fd(/^Patient$/)) && !(await fd(/^Your Patient$/)) && /Removed “Patient”/.test(await toastText(page)), await toastText(page));
    // a name another box has is made unique, and the click still lands
    await pick(/^Is a resident of, line 2$/); await page.fill('#ovLabel', 'Resident of'); await press(kindBtn('long text'));
    f = await fd(/^Resident of \(2\)$/);
    check('a name taken by another box becomes "Resident of (2)", and Paragraph still applies', f && f.ty === 'long text', JSON.stringify(f));
    // the editor's own "Keep it in Templates"
    await page.evaluate(() => ovSelect(null)); await page.waitForTimeout(150);
    const meta = await page.evaluate(() => { const s = [...document.querySelectorAll('.ov-meta select')].find((x) => x.dataset.list === 'binder'); return { lab: s.closest('.field').querySelector('label').textContent, opts: [...s.options].map((o) => o.textContent), note: el('ovEdDestSay').textContent }; });
    check('the editor says "Keep it in Templates", with the client and staff file choices named as other templates', meta.lab === 'Keep it in Templates' && meta.opts.includes('Medical binder templates') && meta.opts.includes('Other templates, for a client’s file') && /^Signed copies are filed in Documents, in the Medical binder/.test(meta.note), JSON.stringify(meta));
    // tick box: a square with no word
    await page.evaluate(() => { const t = ovT(); const i = t.fields.findIndex((x) => /^Date$/.test(x.l)); ovSelect(i); }); await page.waitForTimeout(150);
    await press(kindBtn('check'));
    check('a tick box stays a small square with no word in it', await page.evaluate(() => { const i = ovT().fields.findIndex((x) => /^Date$/.test(x.l)); const n = document.querySelector(`.ov-modal .ov-f[data-i="${i}"]`); return ovT().fields[i].ty === 'check' && n.querySelector('.ov-lb').textContent === ''; }));
    // an Amount box takes 12.50 when filled in
    const tid = await page.evaluate(() => { const id = ovT().id; ovSave(); return id; }); await page.waitForTimeout(500);
    await page.evaluate((id) => { closeAll(); tplOpenDoc(id); }, tid); await page.waitForTimeout(800);
    const amt = await page.evaluate(() => { const n = [...document.querySelectorAll('#mdBody input.ov-in')].find((x) => x.title === 'Resident of'); if (!n) return null; n.value = '12.50'; return { type: n.type, step: n.getAttribute('step'), mode: n.inputMode, ok: n.validity.valid, v: n.value }; });
    check('filling it in, an Amount box takes 12.50', amt && amt.type === 'number' && amt.step === 'any' && amt.mode === 'decimal' && amt.ok && amt.v === '12.50', JSON.stringify(amt));
    await page.evaluate(() => { closeAll(); openTplEditor(); }); await page.waitForTimeout(300);
    const kinds = await page.evaluate(() => [...document.querySelectorAll('#tpeRibbon .fb-k')].map((b) => b.textContent.trim()));
    check('Create new template calls it Amount too', kinds.includes('Amount') && !kinds.includes('Number'), kinds.join(', '));
    await ctx.close();
  }

  // ---------------- 4b. a blank form kept in Agency binder templates, then filled in: every filled-in copy goes to Documents, never to Templates ----------------
  {
    const { ctx, page } = await demo();
    const NAME = 'Medication reason for use';
    const n0 = await page.evaluate(() => TEMPLATES5.length);
    await page.evaluate(() => { closeAll(); go('forms'); ovUploadStart(); }); await page.waitForTimeout(300);
    await page.selectOption('#ovDest', 'Agency');
    await page.setInputFiles('#ovFile', FORM); await page.fill('#ovName', NAME);
    await page.click('#ovGo');
    await page.waitForFunction(() => /Found \d+ places/.test((document.querySelector('.ov-intro') || {}).textContent || ''), null, { timeout: 120000 });
    await page.waitForTimeout(500);
    const tid = await page.evaluate(() => { const id = ovT().id; ovSave(); return id; }); await page.waitForTimeout(600);
    const inTemplates = () => page.evaluate((nm) => { closeAll(); go('forms'); const sec = document.querySelector('#view section[data-binder="Agency"]'); return sec ? sec.innerText.split(nm).length - 1 : -1; }, NAME);
    const inDocuments = () => page.evaluate((nm) => { closeAll(); state.docFocus = null; go('templates'); state.openBinder = 'Agency'; state.openSubs = subsOf('Agency').map((g) => subKey('Agency', g)).concat([subKey('Agency', '')]); render();
      return [...document.querySelectorAll('#view .comp-line')].filter((x) => x.textContent.includes(nm)).length; }, NAME);
    let s = await page.evaluate((id) => ({ n: TEMPLATES5.length, dest: tplById(id).dest }), tid);
    check('kept in Agency binder templates: one blank template, in Templates only', s.n === n0 + 1 && s.dest === 'Agency' && (await inTemplates()) === 1 && (await inDocuments()) === 0, JSON.stringify(s));
    const fillIn = async (drug) => {
      await page.evaluate((id) => { closeAll(); go('forms'); tplOpenDoc(id); }, tid); await page.waitForTimeout(1200);
      await page.evaluate((drug) => { const set = (lab, v) => { const n = [...document.querySelectorAll('#mdBody .ov-in')].find((x) => x.title === lab); if (n) { n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); } }; set('Consumer', '1234567'); set('Drug, row 1', drug); }, drug);
      return page.evaluate(() => { const b = [...document.querySelectorAll('#mdFoot button')].find((x) => /Sign and finalize/.test(x.textContent)); return (b ? b.getAttribute('onclick') : '').replace(/^docFinalise\('(.*)'\)$/, '$1'); });
    };
    const fileIt = async () => { await page.waitForTimeout(400); const pk = await page.evaluate(() => ({ t: el('mdTitle').textContent, b: el('fpBinder') && el('fpBinder').value })); await page.evaluate(() => fpGo()); await page.waitForTimeout(800); return pk; };
    const clean = () => page.evaluate((id) => !/Metformin|Lisinopril|Dr\. Feld/.test(JSON.stringify(tplById(id))), tid);
    // Save draft
    const d1 = await fillIn('Metformin');
    await page.evaluate((id) => docSave(id, true), d1);
    const pk1 = await fileIt();
    s = await page.evaluate((nm) => Object.values(FILED_DOCS).filter((f) => f.name === nm).map((f) => ({ st: f.status, refs: (f.refs || []).map((r) => r.cid || r.b), drug: (f.values || {})['Drug, row 1'] })), NAME);
    check('Save draft on a filled-in copy: the picker starts on the Agency binder, and the draft is filed in Documents', pk1.b === 'Agency' && s.some((f) => f.st === 'draft' && f.refs.includes('Agency') && f.drug === 'Metformin') && (await inDocuments()) === 1, JSON.stringify({ pk1, s }));
    { const st = { n: await page.evaluate(() => TEMPLATES5.length), shown: await inTemplates(), clean: await clean() }; check('...Templates still has the one blank template, with no answers in it', st.n === n0 + 1 && st.shown === 1 && st.clean, JSON.stringify(st)); }
    // Sign and finalize
    const d2 = await fillIn('Lisinopril');
    const sig = await page.evaluate(() => { const b = [...document.querySelectorAll('#mdBody .ov-sigbtn')].find((x) => /Physician/.test(x.dataset.label || '')); if (!b) return false; b.click(); return true; });
    await page.waitForTimeout(150);
    if (sig) { await page.evaluate(() => { const o = el('sigOv'); if (!o.classList.contains('typing')) sigOvMode(); }); await page.fill('#sigOv .sp-typed', 'Dr. Feld'); await page.evaluate(() => sigUse()); await page.waitForTimeout(200); }
    await page.evaluate((id) => docFinalise(id), d2); await page.waitForTimeout(300);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#mdFoot button')].find((x) => /Sign and finalize/.test(x.textContent)); if (b) b.click(); });
    const pk2 = await fileIt();
    s = await page.evaluate((nm) => Object.values(FILED_DOCS).filter((f) => f.name === nm).map((f) => ({ st: f.status, refs: (f.refs || []).map((r) => r.cid || r.b), drug: (f.values || {})['Drug, row 1'] })), NAME);
    check('Sign and finalize: signed, and filed in Documents in the Agency binder', sig && pk2.b === 'Agency' && s.some((f) => f.st === 'final' && f.refs.includes('Agency') && f.drug === 'Lisinopril') && (await inDocuments()) === 2, JSON.stringify({ sig, pk2, s }));
    { const st = { n: await page.evaluate(() => TEMPLATES5.length), shown: await inTemplates(), clean: await clean() }; check('...Templates still has the one blank template, with no answers or signature in it', st.n === n0 + 1 && st.shown === 1 && st.clean, JSON.stringify(st)); }
    await ctx.close();
  }

  // ---------------- 5. a phone ----------------
  {
    const { ctx, page } = await demo({ width: 390, height: 844 });
    await page.evaluate(() => ovUploadStart('Agency')); await page.waitForTimeout(300);
    const lay = await page.evaluate(() => { const o = [...document.querySelectorAll('.ov-what-o')].map((x) => x.getBoundingClientRect()); return { stacked: o[1].top >= o[0].bottom - 1, fit: o.every((r) => r.left >= 0 && r.right <= innerWidth), wide: document.scrollingElement.scrollWidth <= innerWidth + 1 }; });
    check('phone: the two choices stack and fit, no sideways scrolling', lay.stacked && lay.fit && lay.wide, JSON.stringify(lay));
    await ctx.close();
  }

  const real = errors.filter((e) => !/ResizeObserver/.test(e));
  check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
