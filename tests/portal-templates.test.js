// Template tests for E-&-G-Home-Inc.html (#2, the care portal), v12.23: the box finder on uploaded forms (blank
// lines drawn or typed, captions under signature lines, table cells named by column and row, tick boxes, a framed
// box, stacked comment lines), Find boxes, a box placed by hand snapping onto its line, and the builder fixes
// (no "Upload the original form", a Template name box, new questions above the signatures, "filled in on each
// copy", no "Try it"). Runs in the demo view (nothing is saved anywhere) with pdf.js served locally.
// The forms in tests/fixtures/forms are made-up copies of the layouts in the feedback. See tests/README.md.
// Usage: node tests/portal-templates.test.js [baseline.html]
const path = require('path');
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
  const { ctx, page } = await H.newPage(env, { viewport: { width: 1440, height: 1000 }, bucket: errors });
  page.on('dialog', (d) => d.accept());
  await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof state !== 'undefined' && state.role === 'director' && el('app').classList.contains('on'), null, { timeout: 15000 });
  await page.evaluate(() => go('templates'));
  await page.waitForTimeout(500);

  // ---------------- 1. the box finder, on each made-up form ----------------
  const analyze = (name) => page.evaluate(async (b64) => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const a = await ovAnalyzePdf(u.buffer);
    return a && { fields: a.fields.map((f) => ({ l: f.l, ty: f.ty, ov: f.ov })), slots: (a.slots || []).length };
  }, H.formB64(name));
  const MED = { Date: 'date', Consumer: 'text', DOB: 'date', 'Dear Doctor': 'text', 'Your Patient': 'text', 'Is a resident of': 'text', "Physician's Signature": 'signature', 'Date Signed': 'date' };
  for (const name of ['med-drawn.pdf', 'med-typed.pdf', 'med-reportlab.pdf']) {
    const a = await analyze(name);
    const by = Object.fromEntries((a ? a.fields : []).map((f) => [f.l, f]));
    const lines = Object.keys(MED).filter((l) => by[l] && by[l].ty === MED[l]);
    check(name + ': every blank line is found, named and typed (Date, DOB as dates, the signature line as a signature)', lines.length === 8, 'missing: ' + Object.keys(MED).filter((l) => !lines.includes(l)).join(', '));
    const cells = (a ? a.fields : []).filter((f) => /^(Drug|Dose|Frequency Given|Reason for Use), row \d+$/.test(f.l));
    check(name + ': every table cell is a box, named by its column and row (4 columns x 15 rows)', cells.length === 60 && !!by['Reason for Use, row 15'] && !!by['Drug, row 1'], cells.length + ' cells');
    check(name + ': nothing else is boxed (68 in all: no box on the title, the paragraph or the headings)', a && a.fields.length === 68, a && a.fields.length);
    const sig = by["Physician's Signature"], dt = by['Date Signed'], dob = by.DOB;
    check(name + ': the signature box is taller than a text box', sig && dob && sig.ov.h > dob.ov.h * 1.3, sig && dob && (sig.ov.h + ' vs ' + dob.ov.h));
    check(name + ': boxes are in reading order (Date first, then down the page)', !!(a && a.fields.length > 2) && a.fields[0].l === 'Date' && a.fields[1].l === 'Consumer' && a.fields.findIndex((f) => f.l === 'Drug, row 1') < a.fields.findIndex((f) => f.l === 'Drug, row 2'), a && a.fields.slice(0, 3).map((f) => f.l).join(', '));
    check(name + ': the table cells remember their table, row and column', by['Dose, row 3'] && by['Dose, row 3'].ov.tb && by['Dose, row 3'].ov.r === 3 && by['Dose, row 3'].ov.c === 1, JSON.stringify(by['Dose, row 3'] && by['Dose, row 3'].ov));
  }
  {
    const a = await analyze('qpr.pdf');
    const by = Object.fromEntries(a.fields.map((f) => [f.l, f]));
    check('qpr: blank lines named from the words before them (Client ID, Time)', by['Client ID'] && by['Client ID'].ty === 'text' && by.Time && by.Time.ty === 'time', Object.keys(by).join(', '));
    check('qpr: tick boxes are named from their question and word', by['Does the client attend day program: Yes'] && by['Does the client attend day program: No'] && by['Does the client attend day program: Yes'].ty === 'check', Object.keys(by).join(', '));
    check('qpr: three stacked comment lines are one paragraph box', by.Comments && by.Comments.ty === 'long text' && by.Comments.ov.h > 5, JSON.stringify(by.Comments && by.Comments.ov));
    check('qpr: a framed empty box is named from its heading', by['Notes for the planning team'] && by['Notes for the planning team'].ty === 'long text', Object.keys(by).join(', '));
    check('qpr: a table with row names gives "Goal 1: Progress this quarter"', by['Goal 1: Progress this quarter'] && by['Goal 3: Initials'], Object.keys(by).join(', '));
    check('qpr: the divider rules and the underlined heading get no box (12 boxes in all)', a.fields.length === 12, a.fields.map((f) => f.l).join(', '));
  }

  // ---------------- 2. uploading a form ----------------
  await page.evaluate(() => ovUploadStart('Medical'));
  await page.waitForTimeout(300);
  const upLabel = await page.evaluate(() => [...document.querySelectorAll('#mdBody label')].map((l) => l.textContent.trim()).join(' | '));
  check('upload: says where filled-in copies are saved, in plain words', /Filled-in copies are saved to/.test(upLabel) && !/Completed copies file to/.test(upLabel), upLabel);
  await page.setInputFiles('#ovFile', path.join(H.FORMS, 'med-drawn.pdf'));
  await page.click('#ovGo');
  await page.waitForSelector('.ov-modal .ov-f', { timeout: 20000 });
  await page.waitForTimeout(600);
  const ed = await page.evaluate(() => ({ n: ovT().fields.length, intro: (document.querySelector('.ov-intro') || {}).textContent || '', tryIt: !!document.querySelector('.ov-try'),
    find: !!document.querySelector('.ov-find'), saveTo: [...document.querySelectorAll('#mdBody label')].some((l) => /Filled-in copies are saved to/.test(l.textContent)), boxes: document.querySelectorAll('.ov-modal .ov-f').length }));
  check('upload: Found 68 places to fill in, each drawn on the page', ed.n === 68 && /Found 68 places/.test(ed.intro) && ed.boxes === 68, ed.n + ' / ' + ed.boxes + ' / ' + ed.intro.slice(0, 60));
  check('upload editor: no "Try it" switch', !ed.tryIt);
  check('upload editor: a Find boxes button, and the plain "saved to" label', ed.find && ed.saveTo);

  // Find boxes puts back what was taken away, and does not double up
  await page.evaluate(() => { ovSnap(); ovT().fields = ovT().fields.filter((f) => !/row/.test(f.l)); ovPaint(); });
  await page.click('.ov-find');
  await page.waitForFunction(() => ovT().fields.length === 68, null, { timeout: 8000 }).catch(() => {});
  check('Find boxes adds a box on every blank that has none', await page.evaluate(() => ovT().fields.length) === 68, await page.evaluate(() => ovT().fields.length));
  await page.click('.ov-find');
  await page.waitForTimeout(500);
  check('pressing it again adds nothing', await page.evaluate(() => ovT().fields.length) === 68);
  await page.click('.ov-undo');
  await page.waitForTimeout(200);
  check('Undo takes the found boxes away again', await page.evaluate(() => ovT().fields.length) === 8, await page.evaluate(() => ovT().fields.length));

  // a box placed by hand snaps onto the line under the click and takes its name
  await page.evaluate(() => { ovSnap(); ovT().fields = []; ovPaint(); });
  await page.click('.ov-tool:has-text("Date")');
  const pt = await page.evaluate(() => { const s = OV_SLOTS[ovT().id].find((x) => x.l === 'DOB'); const r = document.querySelector('.ov-modal .ov-page').getBoundingClientRect();
    return { x: r.left + r.width * (s.x + s.w * 0.4) / 100, y: r.top + r.height * (s.y + s.h * 1.2) / 100, s }; });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
  const placed = await page.evaluate(() => ovT().fields[0]);
  check('a box placed by hand snaps onto the DOB line, the line’s full width, named DOB', placed && placed.l === 'DOB' && placed.ty === 'date' && placed.ov.x === pt.s.x && placed.ov.w === pt.s.w && placed.ov.y === pt.s.y, JSON.stringify(placed));
  await page.click('.ov-tool:has-text("Signature")');
  const pt2 = await page.evaluate(() => { const s = OV_SLOTS[ovT().id].find((x) => x.l === 'Drug, row 2'); const r = document.querySelector('.ov-modal .ov-page').getBoundingClientRect();
    return { x: r.left + r.width * (s.x + s.w * 0.5) / 100, y: r.top + r.height * (s.y + s.h * 0.5) / 100, s }; });
  await page.mouse.click(pt2.x, pt2.y);
  await page.waitForTimeout(300);
  const placed2 = await page.evaluate(() => ovT().fields[1]);
  check('a box placed in a table cell fits the cell and takes the cell’s name', placed2 && placed2.l === 'Drug, row 2' && placed2.ov.x === pt2.s.x && placed2.ov.w === pt2.s.w, JSON.stringify(placed2));
  await page.click('.ov-tool:has-text("Text")');
  const pt3 = await page.evaluate(() => { const pg = document.querySelector('.ov-modal .ov-page'); pg.scrollIntoView({ block: 'start' });
    el('modal').scrollTop -= document.querySelector('.ov-bar').getBoundingClientRect().height + 12;   // the top of the page, just below the toolbar that stays at the top
    const r = pg.getBoundingClientRect(); return { x: r.left + r.width * 0.9, y: r.top + r.height * 0.05 }; });
  await page.mouse.click(pt3.x, pt3.y);
  await page.waitForTimeout(300);
  const free = await page.evaluate(() => ovT().fields[2]);
  check('a box placed away from any line still goes where it was clicked', free && free.l === 'Text' && free.ov.w < 40, JSON.stringify(free));
  await page.evaluate(() => ovDiscard ? ovDiscard() : closeAll());
  await page.waitForTimeout(300);
  await page.evaluate(() => closeAll());

  // a saved uploaded template with no boxes says so when it opens
  await page.evaluate(() => { TEMPLATES5.push({ id: 'tp-qa-empty', name: 'QA empty', dest: 'Agency', fields: [], overlay: { kind: 'pdf', pages: [{ w: 612, h: 792 }], file: 'qa.pdf' }, source: { file: 'qa.pdf' } }); ovEdit('tp-qa-empty'); });
  await page.waitForTimeout(300);
  const note = await page.evaluate(() => (document.querySelector('.ov-intro') || {}).textContent || '');
  check('an uploaded template with no boxes opens with "no fill-in boxes yet" and points at Find boxes', /no fill-in boxes yet/.test(note) && /Find boxes/.test(note), note);
  await page.evaluate(() => { window._tplEd = null; closeAll(); });

  // ---------------- 3. Create new template ----------------
  await page.evaluate(() => openTplEditor());
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => ({ upl: /Upload the original form/.test(el('mdBody').textContent), name: !!el('tpeName'),
    blank: [...document.querySelectorAll('#mdBody .tpe-blank')].map((x) => x.textContent), fields: tpeT().fields.map((f) => f.ty) }));
  check('builder: no "Upload the original form" (that is Upload a form’s job)', !b.upl);
  check('builder: a Template name box at the top', b.name);
  check('builder: answer cells say "filled in on each copy"', b.blank.length > 0 && b.blank.every((t) => t === 'filled in on each copy'), b.blank.join(', '));
  await page.fill('#tpeName', 'QA medication log');
  check('typing the name puts it on the page title too', await page.evaluate(() => tpeT().name === 'QA medication log' && document.querySelector('#mdBody .tpe-title .tpe-ce').textContent === 'QA medication log'));
  await page.evaluate(() => { const s = document.querySelector('#mdBody .tpe-title .tpe-ce'); s.textContent = 'QA med log'; s.dispatchEvent(new Event('input', { bubbles: true })); });
  check('and renaming the title fills the box', (await page.inputValue('#tpeName')) === 'QA med log');
  await page.click('.tpe-add button:has-text("Short answer")');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => tpeT().fields.map((f) => f.l + ':' + f.ty));
  check('Add puts a new question at the end of the questions, above the signature', after.length === 5 && /^New question:text$/.test(after[3]) && /:signature$/.test(after[4]), after.join(' | '));
  const grid = await page.evaluate(() => { const rows = [...document.querySelectorAll('#tpeBlocks .tpe-b')]; return rows.map((r) => r.className.match(/tpe-k-[\w-]+/)[0]).join(','); });
  check('so it joins the grid instead of starting a new one under the signature', /tpe-k-long-text,tpe-k-text,tpe-k-signature$/.test(grid), grid);
  await page.click('.tpe-add button:has-text("Signature")');
  await page.waitForTimeout(200);
  check('a new signature still goes to the very end', await page.evaluate(() => { const f = tpeT().fields; return f[f.length - 1].ty === 'signature' && f[f.length - 2].ty === 'signature'; }));
  await page.click('#mdBody .tpe-val');
  check('clicking an answer cell explains it is filled in on each copy', /filled in on each copy/.test(await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '')));
  await page.fill('#tpeName', '');
  await page.click('.md-f button:has-text("Save template")');
  await page.waitForTimeout(200);
  check('saving with no name marks the name box and says so', await page.evaluate(() => el('tpeName').classList.contains('err') && document.activeElement === el('tpeName') && /name first/.test(document.querySelector('.toast').textContent)));
  await page.fill('#tpeName', 'QA med log');
  check('typing a name clears the mark', await page.evaluate(() => !el('tpeName').classList.contains('err')));
  await page.click('.md-f button:has-text("Save template")');
  await page.waitForTimeout(400);
  check('it saves, and the new template is listed by name', await page.evaluate(() => TEMPLATES5.some((t) => t.name === 'QA med log') && !el('modal').classList.contains('on')));

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await ctx.close();
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
