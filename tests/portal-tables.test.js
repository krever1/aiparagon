// Table tests for E-&-G-Home-Inc.html (#2, the care portal), v12.25: tables on uploaded forms are changed as a
// whole. Picking a box in a table shows the table; a column's kind of box and its name change for every box in
// it; a row, a column or the whole table comes out in one go (and Undo or Find boxes brings it back, numbered
// in order); a framed box is not treated as a table; Tab steps through the boxes while setting up; filling it
// in, Enter goes down a column. Runs in the demo view on the made-up forms in fixtures/forms, so nothing is
// saved. See tests/README.md.
// Usage: node tests/portal-tables.test.js [baseline.html]
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
  await page.waitForTimeout(400);

  async function upload(file) {
    await page.evaluate(() => { window._tplEd = null; closeAll(); ovUploadStart('Medical'); });
    await page.waitForTimeout(200);
    await page.setInputFiles('#ovFile', path.join(H.FORMS, file));
    await page.click('#ovGo');
    await page.waitForSelector('.ov-modal .ov-f', { timeout: 20000 });
    await page.waitForTimeout(500);
  }
  const fields = () => page.evaluate(() => ovT().fields.map((f) => ({ l: f.l, ty: f.ty, ov: f.ov })));
  const byL = async () => Object.fromEntries((await fields()).map((f) => [f.l, f]));
  const side = () => page.evaluate(() => el('ovSide').innerText.replace(/\s+/g, ' '));
  // pick a box with a real click on the page
  async function pick(label) {
    const p = await page.evaluate((l) => { const i = ovT().fields.findIndex((f) => f.l === l); const n = document.querySelector(`.ov-modal .ov-f[data-i="${i}"]`);
      n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + Math.min(8, r.width / 2), y: r.top + r.height / 2 }; }, label);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(150);
    return page.evaluate(() => OV.sel != null && ovT().fields[OV.sel].l);
  }
  const tblBtn = (txt) => page.click(`.ov-tbl-p button:has-text("${txt}")`);

  // ---------------- 1. picking a box in a table ----------------
  await upload('med-drawn.pdf');
  check('picking a table cell picks that box', (await pick('Dose, row 3')) === 'Dose, row 3');
  let s = await side();
  check('the side panel shows its table: 15 rows by 4 columns', /Table · 15 rows × 4 columns/.test(s), s.slice(0, 200));
  check('and where the box sits: the “Dose” column, row 3', /in the “Dose” column, row 3/.test(s), s.slice(0, 300));
  check('the table comes before the box’s own settings, which say they are for this box only', await page.evaluate(() => { const p = document.querySelector('.ov-tbl-p'), k = [...document.querySelectorAll('#ovSide label')].find((l) => /this box only/.test(l.textContent)); return !!p && !!k && !!(p.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  const marks = await page.evaluate(() => ({ col: document.querySelectorAll('.ov-modal .ov-incol').length, row: document.querySelectorAll('.ov-modal .ov-inrow').length, frame: !!document.querySelector('.ov-modal .ov-tbl-frame') }));
  check('the rest of its column and row are marked on the page, and the table is outlined', marks.col === 14 && marks.row === 3 && marks.frame, JSON.stringify(marks));
  check('the box list shows the table as one line', await page.evaluate(() => { ovSelect(null); return /Table · 15 rows × 4 columns/.test(el('ovSide').textContent) && document.querySelectorAll('.ov-li').length === 9; }), await side());

  // ---------------- 2. a whole column at once ----------------
  await pick('Dose, row 3');
  await tblBtn('Amount');
  let f = await fields();
  check('“Every box in this column is Amount” turns all 15 Dose boxes into amounts', f.filter((x) => /^Dose, row/.test(x.l)).every((x) => x.ty === 'number') && f.filter((x) => /^Dose, row/.test(x.l)).length === 15);
  check('and leaves the other columns alone', f.filter((x) => /^(Drug|Frequency Given|Reason for Use), row/.test(x.l)).every((x) => x.ty === 'text'));
  check('the box’s own kind and the column’s kind both show Amount', await page.evaluate(() => [...document.querySelectorAll('#ovSide .ov-kinds button.on')].map((b) => b.textContent.trim()).join(',')) === '#Amount,#Amount');
  const before = (await byL())['Frequency Given, row 4'].ov;
  await pick('Frequency Given, row 4');
  await tblBtn('Tick box');
  let b = await byL();
  const fr = Object.values(b).filter((x) => /^Frequency Given, row/.test(x.l));
  check('a column of tick boxes: every box becomes a tick box', fr.length === 15 && fr.every((x) => x.ty === 'check'));
  const ck = b['Frequency Given, row 4'].ov;
  check('each tick box sits in the middle of its cell', Math.abs((ck.x + ck.w / 2) - (before.x + before.w / 2)) < 0.05 && Math.abs((ck.y + ck.h / 2) - (before.y + before.h / 2)) < 0.05 && ck.w < before.w && ck.h <= before.h, JSON.stringify([before, ck]));
  await tblBtn('Text');
  b = await byL();
  const back = b['Frequency Given, row 4'].ov;
  check('changing it back fills the cell again, exactly', back.x === before.x && back.y === before.y && back.w === before.w && back.h === before.h && !back.cell, JSON.stringify([before, back]));
  await page.fill('#ovColName', 'Reason');
  await page.press('#ovColName', 'Enter');
  await page.waitForTimeout(150);
  f = await fields();
  check('naming a column renames the boxes in it (“Frequency Given, row 4” becomes “Reason, row 4”)', f.filter((x) => /^Reason, row \d+$/.test(x.l)).length === 15 && !f.some((x) => /^Frequency Given/.test(x.l)), f.filter((x) => /^Reason/.test(x.l)).map((x) => x.l).slice(0, 3).join(', '));
  check('the other columns keep their names', f.filter((x) => /^(Drug|Dose|Reason for Use), row \d+$/.test(x.l)).length === 45);
  await page.fill('#ovColName', 'Drug');
  await page.press('#ovColName', 'Enter');
  await page.waitForTimeout(150);
  f = await fields();
  check('a column given a name another column has still leaves every box with its own name', new Set(f.map((x) => x.l.toLowerCase())).size === 68 && f.filter((x) => /^Drug, row \d+$/.test(x.l)).length === 15, f.filter((x) => /^Drug/.test(x.l)).slice(13, 17).map((x) => x.l).join(', '));
  await page.click('.ov-undo');
  await page.waitForTimeout(150);
  await page.click('.ov-undo');
  await page.waitForTimeout(150);
  check('Undo puts the column name back', (await fields()).filter((x) => /^Frequency Given, row \d+$/.test(x.l)).length === 15);

  // ---------------- 3. rows, columns and the whole table ----------------
  const row3y = (await byL())['Drug, row 3'].ov.y;
  await pick('Drug, row 2');
  await tblBtn('Remove this row');
  f = await fields();
  check('Remove this row takes out its 4 boxes', f.length === 64 && /Took out row 2 \(4 boxes\)/.test(await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '')), f.length);
  b = await byL();
  check('the rows below move up a number: the old row 3 is now “Drug, row 2”, and there is no row 15', b['Drug, row 2'] && b['Drug, row 2'].ov.y === row3y && !b['Drug, row 15'] && !!b['Drug, row 14'], b['Drug, row 2'] && b['Drug, row 2'].ov.y + ' vs ' + row3y);
  check('the box picked next is the same column, one row down', await page.evaluate(() => ovT().fields[OV.sel].l) === 'Drug, row 2');
  check('the table now says 14 rows', /14 rows × 4 columns/.test(await side()));
  // Find boxes puts the row back in its place
  await page.evaluate(() => ovSelect(null));
  await page.click('.ov-find');
  await page.waitForFunction(() => ovT().fields.length === 68, null, { timeout: 8000 }).catch(() => {});
  b = await byL();
  check('Find boxes puts the row back, numbered in order with the rest', Object.keys(b).length === 68 && b['Drug, row 3'] && b['Drug, row 3'].ov.y === row3y && !!b['Drug, row 15'] && !Object.keys(b).some((l) => /\(\d\)$/.test(l)), Object.keys(b).filter((l) => /^Drug/.test(l)).join(', '));
  await pick('Dose, row 1');
  await tblBtn('Remove this column');
  f = await fields();
  check('Remove this column takes out all 15 Dose boxes', f.length === 53 && !f.some((x) => /^Dose/.test(x.l)), f.length);
  check('the table now has 3 columns, and Drug and the rest keep their names', /15 rows × 3 columns/.test(await side()) && f.filter((x) => /^(Drug|Frequency Given|Reason for Use), row \d+$/.test(x.l)).length === 45);
  await tblBtn('Remove the whole table');
  f = await fields();
  check('Remove the whole table leaves just the 8 lines', f.length === 8 && !f.some((x) => x.ov.tb), f.map((x) => x.l).join(', '));
  await page.click('.ov-undo'); await page.waitForTimeout(100);
  await page.click('.ov-undo'); await page.waitForTimeout(100);
  check('two Undos bring the table and the column back', (await fields()).length === 68);

  // ---------------- 4. single boxes in a table ----------------
  await pick('Drug, row 5');
  await page.click('#ovSide button:has-text("Duplicate")');
  b = await byL();
  const dup = Object.values(b).find((x) => /^Drug, row 5 \(2\)$/.test(x.l));
  check('a copy of a table cell is a box of its own, not part of the table', dup && !dup.ov.tb && !dup.ov.r && !dup.ov.c, JSON.stringify(dup && dup.ov));
  await page.evaluate(() => ovDel());
  await pick('Reason for Use, row 6');
  await page.evaluate(() => ovDel());
  await page.click('.ov-tool:has-text("Text")');
  const pt = await page.evaluate(() => { const s = OV_SLOTS[ovT().id].find((x) => x.l === 'Reason for Use, row 6'); const pg = document.querySelector('.ov-modal .ov-page'); const r = pg.getBoundingClientRect();
    return { x: r.left + r.width * (s.x + s.w * 0.5) / 100, y: r.top + r.height * (s.y + s.h * 0.5) / 100, s }; });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(200);
  const placed = await page.evaluate(() => ovT().fields[OV.sel]);
  check('a box placed by hand in an empty cell joins the table, in that row and column', placed && placed.l === 'Reason for Use, row 6' && placed.ov.tb === pt.s.tb && placed.ov.r === 6 && placed.ov.c === 3, JSON.stringify(placed));
  check('so its table shows in the side panel straight away', /Table · 15 rows × 4 columns/.test(await side()));

  // ---------------- 5. Tab through the boxes ----------------
  await pick('Date');
  await page.keyboard.press('Tab');
  check('Tab picks the next box and puts the cursor in its name', await page.evaluate(() => ovT().fields[OV.sel].l === 'Consumer' && document.activeElement === el('ovLabel') && el('ovLabel').value === 'Consumer'));
  await page.keyboard.type('Consumer name');
  await page.keyboard.press('Tab');
  check('a name typed before Tab is kept, and Tab moves on', await page.evaluate(() => ovT().fields.some((x) => x.l === 'Consumer name') && ovT().fields[OV.sel].l === 'DOB'));
  await page.keyboard.press('Shift+Tab');
  check('Shift+Tab goes back', await page.evaluate(() => ovT().fields[OV.sel].l) === 'Consumer name');
  await page.keyboard.press('Escape');
  check('Esc lets go of the box, and Tab is ordinary again', await page.evaluate(() => OV.sel === null));

  // ---------------- 6. a table with named rows, and a framed box ----------------
  await page.evaluate(() => { ovDiscard(); closeAll(); });
  await upload('qpr.pdf');
  await pick('Goal 2: Initials');
  s = await side();
  check('rows with names: the “Initials” column, the “Goal 2” row, 3 rows by 2 columns', /3 rows × 2 columns/.test(s) && /in the “Initials” column, the “Goal 2” row/.test(s), s.slice(0, 260));
  await page.fill('#ovColName', 'Staff initials');
  await page.press('#ovColName', 'Enter');
  await page.waitForTimeout(150);
  b = await byL();
  check('renaming the column keeps the row names (“Goal 1: Staff initials”)', !!b['Goal 1: Staff initials'] && !!b['Goal 3: Staff initials'] && !!b['Goal 2: Progress this quarter'], Object.keys(b).join(', '));
  await tblBtn('Remove this row');
  b = await byL();
  check('taking out the Goal 2 row leaves Goal 1 and Goal 3 as they were (named rows are not renumbered)', !b['Goal 2: Progress this quarter'] && !!b['Goal 3: Progress this quarter'] && !!b['Goal 1: Progress this quarter'], Object.keys(b).join(', '));
  await pick('Notes for the planning team');
  check('a framed box is a box, not a one-cell table', !(await page.$('.ov-tbl-p')) && /Kind of box/.test(await side()) && !/this box only/.test(await side()));

  // ---------------- 7. filling it in: Enter goes down the column ----------------
  await page.evaluate(() => { ovDiscard(); closeAll(); });
  await upload('med-drawn.pdf');
  await page.fill('#ovTplName', 'QA tables');
  await page.evaluate(() => ovThen('fill'));
  await page.waitForSelector('.ov-doc.ov-fill input', { timeout: 15000 });
  await page.waitForTimeout(400);
  const id = (l) => page.evaluate((l) => { const d = docById(window._ovFillDoc); return 'dg' + d.fields.findIndex((x) => x.l === l); }, l);
  const at = () => page.evaluate(() => { const d = docById(window._ovFillDoc), a = document.activeElement; return a && /^dg\d+$/.test(a.id) ? d.fields[+a.id.slice(2)].l : ''; });
  await page.focus('#' + await id('Drug, row 1'));
  await page.keyboard.type('Aspirin');
  await page.keyboard.press('Enter');
  check('filling in: Enter in a table cell goes down the column', await at() === 'Drug, row 2', await at());
  await page.keyboard.press('Shift+Enter');
  check('Shift+Enter goes back up', await at() === 'Drug, row 1', await at());
  check('and what was typed stays', await page.inputValue('#' + await id('Drug, row 1')) === 'Aspirin');
  await page.keyboard.press('Tab');
  check('Tab still goes along the row', await at() === 'Dose, row 1', await at());
  await page.focus('#' + await id('Drug, row 15'));
  await page.keyboard.press('Enter');
  check('Enter at the bottom of a column goes on to the next box', await at() === 'Dose, row 15', await at());
  await page.focus('#' + await id('Consumer'));
  await page.keyboard.press('Enter');
  check('Enter in a box outside a table goes to the next box', await at() === 'DOB', await at());
  await page.evaluate(() => closeAll());

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await ctx.close();
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
