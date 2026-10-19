// Field bar and format bar tests for E-&-G-Home-Inc.html (#2, the care portal), v12.26. Create new template has
// a bar of fields at the top: click one, then click where it goes (a gap between blocks, or a block to put it
// underneath), or drag it there. Both template editors have a format bar like Word's (size, bold, italic,
// underline, colour, alignment) for the picked block or box, and the look carries through to filling in and to
// paper. Runs in the demo view with real clicks and drags, so nothing is saved. See tests/README.md.
// Usage: node tests/portal-format.test.js [baseline.html]
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
  await page.waitForTimeout(300);

  const kinds = () => page.evaluate(() => tpeT().fields.map((f) => f.ty));
  const labs = () => page.evaluate(() => tpeT().fields.map((f) => f.l));
  const modalOn = () => page.evaluate(() => el('modal').classList.contains('on'));
  const cs = (sel, props) => page.evaluate(([sel, props]) => { const n = document.querySelector(sel); if (!n) return null; const c = getComputedStyle(n); return Object.fromEntries(props.map((p) => [p, c[p]])); }, [sel, props]);

  // ---------------- 1. the field bar in Create new template ----------------
  await page.evaluate(() => openTplEditor());
  await page.waitForTimeout(300);
  const bar = await page.evaluate(() => ({ kinds: [...document.querySelectorAll('#tpeRibbon .fb-k')].map((b) => b.textContent.trim()), more: !!document.querySelector('#tpeRibbon .fb-more'),
    top: document.querySelector('#tpeRibbon').getBoundingClientRect().top < document.querySelector('#tpeBlocks').getBoundingClientRect().top }));
  check('the field bar is at the top, above the form', bar.top && bar.kinds.length === 12 && bar.more, JSON.stringify(bar));
  check('it has the everyday fields: short and long answers, date, time, number, yes / no, multiple choice, table, checklist, heading, paragraph, signature',
    ['Short answer', 'Long answer', 'Date', 'Time', 'Number', 'Yes / no', 'Multiple choice', 'Table', 'Checklist', 'Section heading', 'Paragraph', 'Signature'].every((k) => bar.kinds.includes(k)), bar.kinds.join(', '));
  const start = await kinds();
  await page.click('#tpeRibbon .fb-k[data-k="date"]');
  const placing = await page.evaluate(() => ({ on: document.querySelector('#tpeRibbon .fb-k[data-k="date"]').classList.contains('on'), hint: el('tpeHint').textContent,
    slot: document.querySelector('#tpeBlocks .tpe-slot[data-at="1"]').getBoundingClientRect().height }));
  check('clicking a field picks it, says what to do next, and opens the gaps between blocks', placing.on && /Click where the Date goes/.test(placing.hint) && placing.slot > 10, JSON.stringify(placing));
  await page.click('#tpeBlocks .tpe-slot[data-at="1"]');
  let k = await kinds();
  check('clicking a gap puts the field there (between the first and second block)', k.length === start.length + 1 && k[1] === 'date' && JSON.stringify(k.slice(2)) === JSON.stringify(start.slice(1)), k.join(','));
  check('a second Date gets a name of its own (“Date 2”), so the two keep separate answers', (await labs())[1] === 'Date 2' && (await labs()).includes('Date'), (await labs()).join(', '));
  check('and the bar lets go of it', await page.evaluate(() => !document.querySelector('#tpeRibbon .fb-k.on') && !document.querySelector('.tpe-paper.placing') && !el('tpeHint').textContent));
  await page.click('#tpeRibbon .fb-k[data-k="checkbox"]');
  await page.click('#tpeBlocks .tpe-b[data-i="0"] .tpe-lab');
  k = await kinds();
  check('clicking a block instead puts the field underneath it', k[1] === 'checkbox' && k[2] === 'date', k.join(','));
  await page.click('#tpeRibbon .fb-k[data-k="time"]');
  await page.keyboard.press('Escape');
  check('Esc stops placing, and leaves the window open', await modalOn() && await page.evaluate(() => !document.querySelector('.tpe-paper.placing')) && (await kinds()).length === k.length);
  await page.selectOption('#tpeRibbon .fb-more', 'scale');
  check('More… holds the rest (a Rating here), placed the same way', await page.evaluate(() => /Click where the Rating goes/.test(el('tpeHint').textContent)));
  await page.click('#tpeBlocks .tpe-slot[data-at="0"]');
  check('a Rating at the very top', (await kinds())[0] === 'scale');
  // dragging a field from the bar onto the form
  const n0 = (await kinds()).length;
  // a real drag, step by step: the gaps open once the drag starts, then the field goes to one
  const src = await page.evaluate(() => { const b = document.querySelector('#tpeRibbon .fb-k[data-k="table"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.move(src.x, src.y);
  await page.mouse.down();
  await page.mouse.move(src.x + 20, src.y + 30, { steps: 4 });
  const gap = await page.evaluate(() => { const g = document.querySelector('#tpeBlocks .tpe-slot[data-at="2"]'); g.scrollIntoView({ block: 'center' }); const b = g.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, h: b.height }; });
  check('dragging a field from the bar opens the gaps between blocks', gap.h > 10, JSON.stringify(gap));
  await page.mouse.move(gap.x, gap.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  k = await kinds();
  check('dragging a field from the bar onto a gap drops it there', k.length === n0 + 1 && k[2] === 'table', k.join(','));
  check('and the gaps close again after the drop', await page.evaluate(() => !document.querySelector('.tpe-paper.dragnew') && document.querySelector('#tpeBlocks .tpe-slot').getBoundingClientRect().height === 0));
  await page.click('.tpe-undo');
  check('Undo takes the dropped table out again', (await kinds()).length === n0);

  // ---------------- 2. the format bar in Create new template ----------------
  await page.evaluate(() => { window._tpeAct = null; tpeDraw(); });
  check('with no block picked, the format bar waits and says why', await page.evaluate(() => [...document.querySelectorAll('#tpeFmt button, #tpeFmt select')].every((b) => b.disabled) && /Click a block on the form to format it/.test(el('tpeFmt').textContent)));
  const di = (await labs()).indexOf('Date');
  await page.click(`#tpeBlocks .tpe-b[data-i="${di}"] .tpe-lab`);
  check('picking a block wakes the format bar up', await page.evaluate(() => !document.querySelector('#tpeFmt .fmt-size').disabled));
  check('a label starts bold, and the bar shows it', await page.evaluate(() => document.querySelector('#tpeFmt button[title^="Bold"]').classList.contains('on')));
  await page.selectOption('#tpeFmt .fmt-size', '16');
  await page.click('#tpeFmt .fmt-sw[title="Red"]');
  await page.click('#tpeFmt button[title^="Italic"]');
  await page.click('#tpeFmt button[title="Center"]');
  let fd = await page.evaluate((i) => tpeT().fields[i].fmt, di);
  check('size, colour, italic and centring are kept with the block', fd && fd.pt === 16 && fd.c === '#A3261B' && fd.i === true && fd.al === 'center', JSON.stringify(fd));
  let st = await cs(`#tpeBlocks .tpe-b[data-i="${di}"] .tpe-lab`, ['fontSize', 'color', 'fontStyle', 'textAlign']);
  check('and show on the label straight away (16 pt, red, italic, centred)', st && st.fontSize === '21.3333px' && st.color === 'rgb(163, 38, 27)' && st.fontStyle === 'italic' && st.textAlign === 'center', JSON.stringify(st));
  await page.click('#tpeFmt button[title^="Bold"]');
  check('Bold on a bold label turns it off', await page.evaluate((i) => tpeT().fields[i].fmt.b === false, di) && (await cs(`#tpeBlocks .tpe-b[data-i="${di}"] .tpe-lab`, ['fontWeight'])).fontWeight === '400');
  await page.click(`#tpeBlocks .tpe-b[data-i="${di}"] .tpe-lab .tpe-ce`);
  await page.keyboard.press('Control+b');
  check('Ctrl+B while typing in the label turns bold back on, without the browser’s own bold getting into the name',
    await page.evaluate((i) => tpeT().fields[i].fmt.b === undefined && !document.querySelector(`#tpeBlocks .tpe-b[data-i="${i}"] .tpe-lab b, #tpeBlocks .tpe-b[data-i="${i}"] .tpe-lab strong`) && tpeT().fields[i].l === 'Date', di));
  await page.click('.tpe-undo');
  check('Undo steps back through the formatting', await page.evaluate((i) => tpeT().fields[i].fmt.b === false, di));
  // a paragraph starts plain
  await page.click('#tpeRibbon .fb-k[data-k="para"]');
  await page.click(`#tpeBlocks .tpe-slot[data-at="${(await kinds()).length}"]`);
  const pi = (await kinds()).lastIndexOf('para');
  check('a new paragraph is picked, and its Bold is off', await page.evaluate((i) => window._tpeAct === i && !document.querySelector('#tpeFmt button[title^="Bold"]').classList.contains('on'), pi));
  await page.click('#tpeFmt button[title^="Bold"]');
  check('Bold on a paragraph makes it bold', await page.evaluate((i) => tpeT().fields[i].fmt.b === true, pi));
  await page.click('#tpeFmt .fmt-clear');
  check('Clear formatting puts it back to the standard look', await page.evaluate((i) => !tpeT().fields[i].fmt, pi));
  await page.evaluate((i) => { tpeT().fields[i].l = 'Read this first.'; }, pi);
  await page.click(`#tpeBlocks .tpe-b[data-i="${pi}"]`);
  await page.click('#tpeFmt .fmt-sw[title="Blue"]');
  // ---------------- 3. the look carries to filling in and to paper ----------------
  await page.fill('#tpeName', 'QA formatted form');
  const tid = await page.evaluate(() => window._tplEd);
  const blank = await page.evaluate((id) => tplPrintHtml(id, 1), tid);
  check('the blank form prints the label in its look', /font-size:16pt[^"]*color:#A3261B/.test(blank) || /color:#A3261B[^"]*>Date</.test(blank), blank.slice(blank.indexOf('Date') - 200, blank.indexOf('Date') + 10));
  await page.evaluate(() => tpeThen('fill'));
  await page.waitForSelector('.fill-paper', { timeout: 10000 });
  await page.waitForTimeout(300);
  const fi = await page.evaluate(() => { const d = docById(window._docEdit); return d.fields.findIndex((f) => f.l === 'Date'); });
  const lab = await page.evaluate((i) => { const row = el('dg' + i).closest('.fp-row'); const l = getComputedStyle(row.querySelector('.fp-lab')), v = getComputedStyle(el('dg' + i));
    return { lsize: l.fontSize, lcol: l.color, lit: l.fontStyle, vsize: v.fontSize, vcol: v.color, vit: v.fontStyle, val: v.textAlign }; }, fi);
  check('filling it in: the label has the look', lab.lsize === '21.3333px' && lab.lcol === 'rgb(163, 38, 27)' && lab.lit === 'italic', JSON.stringify(lab));
  check('and so does the answer typed into it', lab.vsize === '21.3333px' && lab.vcol === 'rgb(163, 38, 27)' && lab.vit === 'italic' && lab.val === 'center', JSON.stringify(lab));
  await page.fill('#dg' + fi, '2026-10-20');
  const filled = await page.evaluate(() => docFilledFromForm(window._docEdit));
  const at = filled.indexOf('10/20/2026');
  check('the filled-in copy prints the answer in the same look', at > 0 && /color:#A3261B[^"]*">10\/20\/2026/.test(filled.slice(at - 200, at + 10)), filled.slice(at - 200, at + 12));
  check('a paragraph’s colour prints too', /color:#2D5F93[^"]*">Read this first\./.test(filled));
  await page.evaluate(() => closeAll());

  // ---------------- 4. the format bar on an uploaded form ----------------
  await page.evaluate(() => { window._tplEd = null; closeAll(); ovUploadStart('Medical'); });
  await page.waitForTimeout(200);
  await page.setInputFiles('#ovFile', path.join(H.FORMS, 'med-drawn.pdf'));
  await page.click('#ovGo');
  await page.waitForSelector('.ov-modal .ov-f', { timeout: 20000 });
  await page.waitForTimeout(400);
  check('the upload editor has the format bar under its tools', await page.evaluate(() => !!document.querySelector('.ov-bar #ovFmt') && /Pick a box to format/.test(el('ovFmt').textContent) && [...document.querySelectorAll('#ovFmt button, #ovFmt select')].every((b) => b.disabled)));
  check('the side panel no longer has its own Text size buttons (the bar has the size)', !(await page.evaluate(() => /Text size/.test(el('ovSide').textContent))));
  const sel = (l) => page.evaluate((l) => ovSelect(ovT().fields.findIndex((f) => f.l === l)), l);
  await sel("Physician's Signature");
  check('a signature box has no text to format, and the bar says so', await page.evaluate(() => /A signature has no text to format/.test(el('ovFmt').textContent) && document.querySelector('#ovFmt .fmt-size').disabled));
  await sel('Consumer');
  check('a text box’s size shows in points (9 pt)', await page.evaluate(() => document.querySelector('#ovFmt .fmt-size').value) === '9');
  await page.selectOption('#ovFmt .fmt-size', '12');
  await page.click('#ovFmt button[title^="Italic"]');
  await page.click('#ovFmt .fmt-sw[title="Green"]');
  await page.click('#ovFmt button[title="Align right"]');
  let ov = await page.evaluate(() => ovT().fields.find((f) => f.l === 'Consumer').ov);
  check('size, italic, colour and alignment are kept on the box', Math.abs(ov.fs - 12 / 612 * 100) < 0.01 && ov.it === true && ov.col === '#1F6B52' && ov.al === 'right', JSON.stringify(ov));
  await page.keyboard.press('Control+b');
  check('Ctrl+B with the box picked makes it bold', await page.evaluate(() => ovT().fields.find((f) => f.l === 'Consumer').ov.b === true));
  await page.click('#ovFmt .fmt-clear');
  ov = await page.evaluate(() => ovT().fields.find((f) => f.l === 'Consumer').ov);
  check('Clear formatting takes off the style but keeps the size', !ov.b && !ov.it && !ov.col && !ov.al && Math.abs(ov.fs - 12 / 612 * 100) < 0.01, JSON.stringify(ov));
  await page.click('.ov-undo');
  await page.click('.ov-undo');
  ov = await page.evaluate(() => ovT().fields.find((f) => f.l === 'Consumer').ov);
  check('two Undos bring the style back', ov.it && ov.col === '#1F6B52' && ov.al === 'right' && !ov.b, JSON.stringify(ov));
  // a table column takes one box's look
  await sel('Dose, row 1');
  await page.click('#ovFmt button[title^="Bold"]');
  await page.click('.ov-tbl-p button:has-text("Format the whole column like this box")');
  check('“Format the whole column like this box” gives every Dose box the same look', await page.evaluate(() => ovT().fields.filter((f) => /^Dose, row/.test(f.l)).every((f) => f.ov.b === true) && ovT().fields.filter((f) => /^Drug, row/.test(f.l)).every((f) => !f.ov.b)));
  // filling it in and printing
  await page.fill('#ovTplName', 'QA formatted upload');
  await page.evaluate(() => ovThen('fill'));
  await page.waitForSelector('.ov-doc.ov-fill input', { timeout: 15000 });
  await page.waitForTimeout(300);
  const cid = await page.evaluate(() => { const d = docById(window._ovFillDoc); return 'dg' + d.fields.findIndex((f) => f.l === 'Consumer'); });
  const inp = await cs('#' + cid, ['fontStyle', 'color', 'textAlign']);
  check('filling it in: the answer is italic, green and on the right', inp && inp.fontStyle === 'italic' && inp.color === 'rgb(31, 107, 82)' && inp.textAlign === 'right', JSON.stringify(inp));
  await page.fill('#' + cid, '4023180');
  const sheet = await page.evaluate(() => docFilledFromForm(window._ovFillDoc));
  const c0 = sheet.indexOf('>4023180<');
  check('and the printed answer sits on the right of its line, in the same look', c0 > 0 && /font-style:italic;color:#1F6B52;text-align:right;justify-content:flex-end">4023180</.test(sheet.slice(c0 - 160, c0 + 9)), sheet.slice(c0 - 160, c0 + 9));
  await page.evaluate(() => closeAll());

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await ctx.close();
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
