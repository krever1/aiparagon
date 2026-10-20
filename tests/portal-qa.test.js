// QA regression tests for E-&-G-Home-Inc.html (#2, the care portal), v12.30: what the full QA pass of v12.23 to v12.29
// found. Words in other alphabets are read (a form in Russian is named in Russian), a page in Russian, Chinese or
// Korean is turned the right way up by the reader, Tagalog's reader loads, and a reader that cannot be fetched does
// not hang the upload. On a filled-in copy, a framed box or first table row with writing in it is a box (cleared),
// not a heading, and nothing read from the writing gets into a name; a label | answer table with no heading keeps its
// first row; a printed word read unsurely is not taken for writing; clearing above a cell's line leaves the letters
// of the row above. A photo of a sheet cut off by the frame keeps its shape; a see-through PNG is a white page. A
// name says the kind of box by whole words ("Confirmation number" is no signature). A saved template keeps its
// language. The top bar fits from 901 px wide, the Customize layout button sits clear of the sidebar and goes away
// under an open window, Copy the address says whether it worked, and a library row with no file ending shows its
// link's file type. Reader data (eng, spa, rus, tgl, chi_sim, kor) is served from tests/.cache. Demo view, so
// nothing is saved. See tests/README.md.
// Usage: node tests/portal-qa.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const FORM = (title, rows, cols, sigs) => `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:letter;margin:0} body{margin:0;font-family:'DejaVu Serif','WenQuanYi Zen Hei',Georgia,serif;font-size:15px;color:#000}
.pg{padding:70px 80px} h1{text-align:center;font-size:22px;margin:0 0 34px} .row{margin:0 0 26px;display:flex;align-items:flex-end;gap:6px}
.ln{border-bottom:1.3px solid #000;flex:0 0 auto;height:18px} table{border-collapse:collapse;width:100%;margin:26px 0 40px} td,th{border:1.3px solid #000;height:26px;font-weight:normal;padding:2px 6px;text-align:left}
.sig{display:flex;gap:60px;margin-top:50px}.sig div{flex:1}.sig .ln{display:block;width:100%;height:34px;margin-bottom:6px}
</style></head><body><div class="pg"><h1>${title}</h1>
${rows.map((r) => `<div class="row">${r.map(([l, w]) => `${l}<span class="ln" style="width:${w}px"></span>`).join('&nbsp; ')}</div>`).join('\n')}
<table><tr>${cols.map((c, i) => `<th${i ? '' : ' style="width:34%"'}>${c}</th>`).join('')}</tr>${'<tr>' + cols.map(() => '<td></td>').join('') + '</tr>'.repeat(1)}${('<tr>' + cols.map(() => '<td></td>').join('') + '</tr>').repeat(3)}</table>
<div class="sig">${sigs.map((s) => `<div><span class="ln"></span>${s}</div>`).join('')}</div></div></body></html>`;
const RUS = FORM('Запись о посещении врача', [[['Дата:', 200]], [['Имя участника:', 330]], [['Дата рождения:', 200], ['Время визита:', 110]], [['Врач:', 380]]],
  ['Лекарство', 'Доза', 'Причина применения'], ['Подпись врача', 'Дата подписи']);
const TGL = FORM('Talaan ng pagbisita sa doktor', [[['Petsa:', 200]], [['Pangalan ng kliyente:', 300]], [['Oras ng pagbisita:', 140]], [['Doktor:', 360]]],
  ['Gamot', 'Dosis', 'Dahilan ng paggamit'], ['Lagda ng doktor', 'Petsa ng lagda']);

/* in the page: a photo of page 1 of a PDF, lying on a grey table, turned by o.turn degrees (0, 90, 180, 270) */
function photoGen() {
  window.__photo = async function (b64, o) {
    const lib = await loadPdfjs();
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const pg = await (await lib.getDocument({ data: u }).promise).getPage(1), v = pg.getViewport({ scale: 2 });
    const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: g, viewport: v }).promise;
    const side = o.turn === 90 || o.turn === 270, m = 90, W = (side ? c.height : c.width) + 2 * m, Hh = (side ? c.width : c.height) + 2 * m;
    const p = document.createElement('canvas'); p.width = W; p.height = Hh;
    const q = p.getContext('2d'); q.fillStyle = '#6d6a63'; q.fillRect(0, 0, W, Hh);
    q.translate(W / 2, Hh / 2); q.rotate((o.turn || 0) * Math.PI / 180); q.drawImage(c, -c.width / 2, -c.height / 2);
    return p.toDataURL('image/jpeg', 0.92).split(',')[1];
  };
}

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  async function open(opts) {
    const { ctx, page } = await H.newPage(env, Object.assign({ viewport: { width: 1440, height: 1000 }, bucket: errors }, opts || {}));
    const sent = [];
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith(env.BASE) && !/^(data|blob):/.test(u)) sent.push(r.method() + ' ' + u.replace(/\?.*$/, '')); });
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && state.role === 'director' && el('app').classList.contains('on'), null, { timeout: 15000 });
    await page.evaluate(() => go('templates'));
    await page.addScriptTag({ content: '(' + photoGen.toString() + ')()' });
    return { ctx, page, sent };
  }
  async function upload(page, file, lang) {
    await page.evaluate(() => { window._tplEd = null; closeAll(); ovUploadStart('Medical'); });
    await page.waitForTimeout(150);
    if (lang) await page.selectOption('#ovLang', lang);
    await page.setInputFiles('#ovFile', file);
    const t0 = Date.now();
    await page.click('#ovGo');
    await page.waitForSelector('.ov-modal .ov-f', { timeout: 180000 });
    await page.waitForTimeout(400);
    return page.evaluate((ms) => ({ ms, intro: (document.querySelector('.ov-intro') || {}).innerText || '', overlay: ovT().overlay,
      extras: tplExtrasOf(ovT()), fields: ovT().fields.map((f) => ({ l: f.l, ty: f.ty, ov: f.ov })) }), Date.now() - t0);
  }
  const pdfOf = async (html) => { const p0 = await env.browser.newPage(); await p0.setContent(html); const b = await p0.pdf({ format: 'Letter', printBackground: true }); await p0.close(); return b.toString('base64'); };
  const jpg = (name, b64) => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  const kinds = (a, want) => { const b = Object.fromEntries(a.fields.map((f) => [f.l, f.ty])); return Object.keys(want).filter((l) => b[l] !== want[l]); };

  // ---------------- 1. a form in Russian: its words are read, and it is turned by the reader ----------------
  const rusWant = { 'Дата': 'date', 'Имя участника': 'text', 'Дата рождения': 'date', 'Время визита': 'time', 'Врач': 'text', 'Подпись врача': 'signature', 'Дата подписи': 'date' };
  {
    const rus = await pdfOf(RUS);
    const { ctx, page, sent } = await open();
    for (const turn of [0, 180]) {
      const tag = turn ? 'Russian photo upside down' : 'Russian photo';
      const a = await upload(page, jpg('zapis.jpg', await page.evaluate(([b, t]) => window.__photo(b, { turn: t }), [rus, turn])), 'rus');
      const miss = kinds(a, rusWant);                                   // a word misread by the reader at photo size is allowed once
      check(tag + ': the blanks are named in Russian, with the right kinds ("Имя участника" is no time)', miss.length <= 1 && !['Имя участника', 'Время визита', 'Подпись врача'].some((l) => miss.includes(l))
        && a.fields.filter((f) => !f.ov.tb).length === 7, 'missing or wrong: ' + miss.join(', ') + ' | got: ' + a.fields.map((f) => f.l + ':' + f.ty).join(', '));
      check(tag + ': the table columns are Лекарство, Доза and Причина применения', ['Лекарство', 'Доза', 'Причина применения'].every((c) => a.fields.filter((f) => f.l.startsWith(c + ', row ')).length === 4),
        a.fields.filter((f) => f.ov.tb).map((f) => f.l).slice(0, 6).join(', '));
      check(tag + (turn ? ': turned the right way up, and the editor says it was upside down' : ': left the way it is (not turned upside down)'), turn ? /it was upside down/.test(a.intro) : !/turned the right way up/.test(a.intro), a.intro.slice(0, 200));
      check(tag + ': nothing on the blank form is taken for writing', !/had writing/.test(a.intro), a.intro.slice(0, 200));
    }
    check('Russian: the template keeps its language when saved (for Find boxes after a reload)', (await page.evaluate(() => tplExtrasOf(ovT()).overlay.lang)) === 'rus');
    check('Russian: the Russian reader was fetched for it', sent.some((s) => /@tesseract\.js-data\/rus@1\.0\.0\/4\.0\.0_best_int\/rus\.traineddata/.test(s)));
    await ctx.close();
  }

  // ---------------- 2. Chinese and Korean pages: which way up, by the reader ----------------
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(async () => {
      const TXT = { chi_sim: ['用药原因', '居住在本院的消费者姓名', '医生姓名和办公室地址', '工作人员给予每种药物的原因', '签名日期和医生的印刷姓名', '为了给药，工作人员必须有这张表格'],
        kor: ['약물 사용 이유', '집에 거주하는 소비자의 이름', '의사 이름 및 사무실 주소', '직원이 투여한 각 약물의 사용 이유', '서명 날짜 및 의사의 정자체 이름', '약을 주려면 직원이 이 양식을 가지고 있어야 합니다'] };
      const out = {}, turnFor = typeof ovTurnFor === 'function' ? ovTurnFor : async (c) => ovTurnOf(c);   // an older build has no ovTurnFor
      for (const [lang, lines] of Object.entries(TXT)) {
        const c = ovCanvas(1275, 1650), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1275, 1650); g.fillStyle = '#000'; g.font = '20px "WenQuanYi Zen Hei", serif';
        let y = 120; for (let k = 0; k < 7; k++) lines.forEach((t) => { if (y < 1550) { g.fillText(t, 100, y); y += 34; } });
        out[lang] = [await turnFor(c, lang), await turnFor(ovTurn(c, 90), lang), await turnFor(ovTurn(c, 180), lang), await turnFor(ovTurn(c, 270), lang)];
      }
      return out;
    });
    check('Chinese: an upright page stays, and one turned 90°, 180° or 270° is turned back', JSON.stringify(r.chi_sim) === '[0,270,180,90]', JSON.stringify(r.chi_sim));
    check('Korean: the same', JSON.stringify(r.kor) === '[0,270,180,90]', JSON.stringify(r.kor));
    await ctx.close();
  }

  // ---------------- 3. Tagalog loads; a reader that cannot be fetched does not hang ----------------
  {
    const tgl = await pdfOf(TGL);
    const { ctx, page, sent } = await open();
    const a = await upload(page, jpg('talaan.jpg', await page.evaluate((b) => window.__photo(b, { turn: 0 }), tgl)), 'tgl');
    check('Tagalog: its reader is fetched from the 4.0.0 data (the only one it has)', sent.some((s) => /@tesseract\.js-data\/tgl@1\.0\.0\/4\.0\.0\/tgl\.traineddata/.test(s)) && !sent.some((s) => /tgl@1\.0\.0\/4\.0\.0_best_int/.test(s)), sent.filter((s) => /tgl/.test(s)).join(', '));
    const miss = kinds(a, { Petsa: 'date', 'Pangalan ng kliyente': 'text', 'Oras ng pagbisita': 'time', 'Lagda ng doktor': 'signature' });
    check('Tagalog: the blanks are named in Tagalog, Petsa a date, Oras a time and Lagda a signature', !miss.length, 'missing or wrong: ' + miss.join(', ') + ' | got: ' + a.fields.map((f) => f.l + ':' + f.ty).join(', '));
    // Hindi is not served here: its reader cannot be fetched
    const b = await upload(page, jpg('talaan.jpg', await page.evaluate((b) => window.__photo(b, { turn: 0 }), tgl)), 'hin');
    check('a reader that cannot be fetched: the upload still finishes, quickly', b.ms < 30000, b.ms + ' ms');
    check('and the editor says the words could not be read, and that writing could not be checked either', /words could not be read/.test(b.intro) && /could not be checked either/.test(b.intro), b.intro);
    check('and the boxes are still found', b.fields.length >= 10, b.fields.length);
    await ctx.close();
  }

  // ---------------- 4. filled-in copies: a framed box, a label | answer table, print read unsurely ----------------
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(async () => {
      const mk = (filled) => {
        const c = ovCanvas(1275, 1650), g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 1275, 1650); g.fillStyle = '#000'; g.strokeStyle = '#000'; g.font = '22px Arial';
        g.fillText('Patient visit record', 480, 90);
        g.fillText('Name of physician:', 100, 180); g.fillRect(320, 182, 500, 2);
        g.fillText('Address of the office:', 100, 240); g.fillRect(345, 242, 600, 2);
        g.fillText('Comments about the visit', 100, 320); g.lineWidth = 2; g.strokeRect(100, 340, 1000, 200);
        ['Diagnosis', 'Allergies', 'Medication', 'Next visit'].forEach((t, i) => { g.strokeRect(100, 600 + i * 50, 300, 50); g.strokeRect(400, 600 + i * 50, 700, 50); g.fillText(t, 112, 632 + i * 50); });
        if (filled) {
          let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
          const scrib = (x, y, w, h) => { g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y + h / 2);
            for (let k = 0; k < 18; k++) { const xx = x + (k + 1) * w / 18; g.bezierCurveTo(xx - w / 30, y + rnd() * h, xx - w / 60, y + rnd() * h, xx, y + h / 2 + (rnd() - 0.5) * h * 0.6); } g.stroke(); };
          scrib(130, 380, 700, 40); scrib(130, 450, 500, 40); scrib(420, 610, 300, 30); scrib(420, 660, 200, 30);
        }
        return c;
      };
      const out = {};
      for (const f of [false, true]) { const x = await ovReadPicture(mk(f), 0, 'eng'); out[f ? 'filled' : 'blank'] = { slots: x.slots.map((s) => ({ l: s.l, ty: s.ty, hand: s.hand || 0 })), wipe: x.wipe.length }; }
      // the whole way: the photo of the filled copy is cleared, and the page the template keeps is blank in its boxes
      const blob = await new Promise((res) => mk(true).toBlob(res, 'image/png'));
      const a = await ovAnalyzeImage(URL.createObjectURL(blob), { lang: 'eng', asIs: false });
      const im = new Image(); im.src = URL.createObjectURL(a.blob); await im.decode();
      const c = ovCanvas(im.naturalWidth, im.naturalHeight), g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const dark = (o) => { const d = g.getImageData(Math.round(o.x / 100 * c.width) + 4, Math.round(o.y / 100 * c.height) + 4, Math.max(1, Math.round(o.w / 100 * c.width) - 8), Math.max(1, Math.round(o.h / 100 * c.height) - 8)).data;
        let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 120) n++; return n / (d.length / 4); };
      const fl = (l) => a.fields.find((x) => x.l === l);
      out.kept = { names: a.fields.map((x) => x.l), comments: fl('Comments about the visit') ? dark(fl('Comments about the visit').ov) : -1, diag: fl('Diagnosis') ? dark(fl('Diagnosis').ov) : -1, hand: a.photo.hand };
      return out;
    });
    const names = (s) => s.map((x) => x.l).sort().join(' | ');
    check('blank: a label | answer table with no heading row keeps its first row (Diagnosis), and the framed box is a box', names(r.blank.slots) === 'Address of the office | Allergies | Comments about the visit | Diagnosis | Medication | Name of physician | Next visit' && !r.blank.wipe, names(r.blank.slots));
    check('filled in: the same boxes, by the same names (no heading taken from the writing, nothing read from it in a name)', names(r.filled.slots) === names(r.blank.slots), names(r.filled.slots));
    check('filled in: the framed box and the two written-in rows are marked as written in, and cleared', r.filled.slots.filter((s) => s.hand).map((s) => s.l).sort().join(' | ') === 'Allergies | Comments about the visit | Diagnosis' && r.filled.wipe === 3,
      JSON.stringify(r.filled.slots.filter((s) => s.hand)) + ' wipe ' + r.filled.wipe);
    check('filled in: the page the template keeps is blank inside the framed box and the written-in cell', r.kept.comments >= 0 && r.kept.comments < 0.005 && r.kept.diag >= 0 && r.kept.diag < 0.01, JSON.stringify(r.kept));

    // print the reader is unsure of, and pen writing read as junk, side by side in a table
    const u = await page.evaluate(() => {
      const W = 1275, H = 600, c = ovCanvas(W, H), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.strokeStyle = '#000'; g.lineWidth = 2; g.fillStyle = '#000'; g.font = '22px Arial';
      for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) g.strokeRect(100 + k * 400, 100 + r * 50, 400, 50);
      g.fillText('Drug', 112, 132); g.fillText('Dose', 512, 132); g.fillText('mg', 512, 182);
      g.lineWidth = 2.5; g.beginPath(); g.moveTo(520, 225); g.bezierCurveTo(560, 205, 600, 250, 640, 215); g.bezierCurveTo(680, 205, 700, 245, 730, 220); g.stroke();
      g.font = '22px Arial'; g.fillText('Name of the person who gave it to the client today', 100, 400); g.fillText('Checked by the nurse on duty', 100, 450);
      const px = g.getImageData(0, 0, W, H).data;
      const it = (s, x, y, w, cf, bh) => ({ s, x, y, w, fh: 22, o: 1, cf, bh });
      const items = [it('Drug', 112, 132, 48, 96, 16), it('Dose', 512, 132, 50, 96, 16), it('mg', 512, 182, 28, 45, 15), it('AV', 520, 232, 200, 38, 32),
        ...'Name of the person who gave it to the client today'.split(' ').map((s, i) => it(s, 100 + i * 60, 400, 50, 95, 16)), ...'Checked by the nurse on duty'.split(' ').map((s, i) => it(s, 100 + i * 70, 450, 60, 95, 16))];
      const res = ovFindSlots(px, W, H, items, 0, { pic: 1, read: 1 });
      return res.map((s) => ({ l: s.l, hand: s.hand || 0, y: s.y }));
    });
    const dose1 = u.find((s) => /^Dose, row 1/.test(s.l)), dose2 = u.find((s) => /^Dose, row 2/.test(s.l));
    check('a printed "mg" the reader is unsure of is print: its cell is not a box and nothing is cleared there', !u.some((s) => s.y > 100 * 150 / 600 && s.y < 100 * 200 / 600 && /Dose/.test(s.l)), JSON.stringify(u));
    check('pen writing read as large junk is writing: its cell is a box, marked as written in', !!(dose1 || dose2) && (dose1 || dose2).hand === 1, JSON.stringify(u));

    // clearing above a cell's top line: writing that comes up through the line goes, a letter of the row above that sits on it stays
    const cl = await page.evaluate(() => {
      const W = 400, H = 200, c = ovCanvas(W, H), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#000';
      g.fillRect(0, 100, W, 2);                 // the cell's top line
      g.fillRect(60, 90, 3, 10);                // a letter's tail above, sitting on the line
      g.fillRect(200, 85, 3, 40);               // a pen stroke through the line, into the cell
      const P = (v, t) => v / t * 100;
      const n = ovClearWriting(c, [{ x: P(10, W), y: P(70, H), w: P(380, W), h: P(120, H), ln: { x: P(0, W), y: P(100, H), w: P(W, W), h: P(2, H) }, ty: P(100, H), keep: [] }]);
      const at = (x, y) => g.getImageData(x, y, 1, 1).data[0];
      return { n, tail: at(61, 95), strokeAbove: at(201, 92), strokeBelow: at(201, 115), line: at(300, 100) };
    });
    check('clearing a cell: a letter of the row above that sits on the line stays', cl.tail < 100, JSON.stringify(cl));
    check('clearing a cell: writing that comes up through the line goes, above and below it, and the line is drawn back', cl.strokeAbove > 200 && cl.strokeBelow > 200 && cl.line < 100, JSON.stringify(cl));
    await ctx.close();
  }

  // ---------------- 5. photos: a sheet cut off by the frame, a see-through PNG ----------------
  {
    const { ctx, page } = await open();
    const f = await page.evaluate(async () => {
      const src = ovCanvas(1000, 1000), g = src.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 1000, 1000);
      // a letter page at an angle, wholly in the photo; and one whose bottom is cut off by the photo's edge (seen as 1.10 tall)
      const whole = ovFlatten(src, [[200, 100], [800, 120], [790, 860], [210, 840]]);
      const cut = ovFlatten(src, [[100, 340], [900, 340], [900, 999.9], [100, 999.9]].map(([x, y]) => [x, Math.min(y, 999.9)]).map(([x, y], i) => i > 1 ? [x, 999.99] : [x, y]));
      const cut2 = ovFlatten(src, [[100, 120], [900, 120], [900, 1000], [100, 1000]]);
      // a see-through PNG: black lines and words on nothing
      const c = ovCanvas(1275, 1650), q = c.getContext('2d'); q.fillStyle = '#000'; q.font = '24px Arial';
      q.fillText('Visit record', 520, 120); q.fillText('Name:', 120, 300); q.fillRect(200, 302, 500, 2); q.fillText('Date:', 120, 380); q.fillRect(190, 382, 300, 2);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const a = await ovAnalyzeImage(URL.createObjectURL(blob), { lang: 'eng' });
      const im = new Image(); im.src = URL.createObjectURL(a.blob); await im.decode();
      const k = ovCanvas(im.naturalWidth, im.naturalHeight), kg = k.getContext('2d'); kg.drawImage(im, 0, 0);
      const d = kg.getImageData(0, 0, k.width, k.height).data; let s = 0; for (let i = 0; i < d.length; i += 16) s += d[i]; const mean = s / (d.length / 16);
      return { whole: whole.height / whole.width, cut: cut2.height / cut2.width, mean, names: a.fields.map((x) => x.l + ':' + x.ty) };
    });
    check('a sheet wholly in the photo, at an angle, is pulled to its paper shape (letter)', Math.abs(f.whole - 11 / 8.5) < 0.01, f.whole.toFixed(3));
    check('a sheet cut off by the photo\'s edge keeps the shape it has (not stretched to a paper size)', Math.abs(f.cut - 880 / 800) < 0.02, f.cut.toFixed(3));
    check('a see-through PNG is read as a white page with black writing (not a black page)', f.mean > 200, f.mean.toFixed(0));
    check('and its blanks are found', f.names.includes('Name:text') && f.names.includes('Date:date'), f.names.join(', '));
    await ctx.close();
  }

  // ---------------- 6. the kind of box a name asks for: whole words ----------------
  {
    const { ctx, page } = await open();
    const want = { 'Confirmation number': 'text', Infirmary: 'text', 'Affirmation of physician': 'text', 'Overtime hours': 'text', 'Имя участника': 'text', 'Часть 2': 'text', 'Фамилия кандидата': 'text',
      'Firma del cliente': 'signature', "Physician's Signature": 'signature', 'Подпись кандидата': 'signature', '签名日期：': 'date', 'Date of birth': 'date', 'D.O.B.': 'date', 'Дата рождения': 'date', 'التاريخ': 'date',
      'Signature date': 'date', 'Время визита': 'time', 'Time in': 'time', 'Hora de llegada': 'time', '서명': 'signature', '날짜': 'date', 'Ngày sinh': 'date', 'Lagda ng magulang': 'signature' };
    const got = await page.evaluate((w) => Object.keys(w).map((l) => [l, ovGuess(l)]), want);
    const bad = got.filter(([l, k]) => k !== want[l]);
    check('kinds by whole words: "Confirmation", "Infirmary" and "участника" ask for text; signatures, dates and times in eight languages still found', !bad.length, bad.map(([l, k]) => l + '=' + k).join(', '));
    check('a full-width colon is taken off a name ("签名日期：" is "签名日期")', (await page.evaluate(() => ovLabelOf('签名日期：'))) === '签名日期');
    await ctx.close();
  }

  // ---------------- 7. the app frame: the top bar from 901 px, the layout button, copying, file types ----------------
  for (const w of [901, 920, 950, 1024, 1100]) {
    const { ctx, page } = await open({ viewport: { width: w, height: 800 } });
    await page.evaluate(() => go('home')); await page.waitForTimeout(250);
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      btn: [...document.querySelectorAll('.topbar .icon-btn')].filter((b) => b.getClientRects().length).map((b) => Math.round(b.getBoundingClientRect().width)) }));
    check(`top bar at ${w} px: no sideways scrolling, and its buttons keep their size`, r.sw <= r.cw && r.btn.length >= 3 && r.btn.every((x) => x >= 47), JSON.stringify(r));
    await ctx.close();
  }
  {
    const { ctx, page } = await open();
    await page.evaluate(() => go('tasks')); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const f = el('layFab'), s = el('sidebar').getBoundingClientRect(); const b = f.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + 2, b.top + b.height / 2); return { sb: Math.round(s.right), fab: Math.round(b.left), own: hit === f || f.contains(hit) }; });
    check('Customize layout sits clear of the sidebar', r.fab >= r.sb + 8 && r.own, JSON.stringify(r));
    await page.click('#view button:has-text("Edit categories")'); await page.waitForTimeout(400);
    const u = await page.evaluate(() => { const f = el('layFab'), b = f.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { vis: getComputedStyle(f).visibility, under: !(hit === f || f.contains(hit)) }; });
    check('and it goes away while a window is open over the page (it cannot be clicked through)', u.vis === 'hidden' && u.under, JSON.stringify(u));
    await page.evaluate(() => closeAll()); await page.waitForTimeout(300);
    check('and comes back when the window closes', await page.evaluate(() => getComputedStyle(el('layFab')).visibility === 'visible'));

    // Copy the address: the browser refuses (no permission here), then allows it
    const to = await page.evaluate(() => { supportCompose(); return (el('modal').textContent.match(/[\w.+-]+@[\w.-]+\.\w+/) || [''])[0]; });
    await page.click('#modal.on button:has-text("Copy the address")'); await page.waitForTimeout(400);
    const t1 = await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: env.BASE });
    await page.evaluate(() => supportCompose());
    await page.click('#modal.on button:has-text("Copy the address")'); await page.waitForTimeout(400);
    const t2 = await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    check('Copy the address: when the browser will not copy, it says so and gives the address (no error)', !/Address copied/.test(t1) && t1.includes(to) || /Address copied/.test(t1), t1);
    check('Copy the address: when it copies, it says so and the address is on the clipboard', /Address copied/.test(t2) && clip === to, t2 + ' | ' + clip);

    // file types on the Templates page: from the link when the name has no ending, and each fits its tile
    await page.evaluate(() => { closeAll(); go('forms'); }); await page.waitForTimeout(300);
    const ft = await page.evaluate(() => { const rows = [...document.querySelectorAll('#view .lrow')].filter((r) => /Weekly Staff Schedule|Monthly Fire Drill Record/.test(r.textContent));
      const ics = [...document.querySelectorAll('#view .row-ic')].filter((x) => x.getClientRects().length);
      return { tiles: rows.map((r) => r.querySelector('.row-ic').textContent.trim()), over: ics.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent.trim()).slice(0, 5) }; });
    check('a library form with no file ending shows its link\'s type (PDF), not the start of its name (WEEK, MONT)', ft.tiles.length >= 2 && ft.tiles.every((t) => t === 'PDF'), JSON.stringify(ft.tiles));
    check('every file type fits its tile', !ft.over.length, JSON.stringify(ft.over));
    await ctx.close();
  }

  // ---------------- 8. messages, a typed PDF with few words, the keyboard ----------------
  {
    const { ctx, page } = await open();
    const t = await page.evaluate(async () => {
      toast('That PDF could not be read. If it is password protected, save an unprotected copy and try again.');
      const bad = { icon: el('toast').querySelector('b').textContent, warn: el('toast').classList.contains('warn'), live: el('toast').getAttribute('aria-live') };
      await new Promise((r) => setTimeout(r, 3200)); bad.still = el('toast').classList.contains('on');
      toast('Template saved.'); const ok = { icon: el('toast').querySelector('b').textContent, warn: el('toast').classList.contains('warn') };
      toast('Name the template.'); const ask = el('toast').querySelector('b').textContent;
      return { bad, ok, ask };
    });
    check('a message that something went wrong shows ! (not ✓), and is read out to screen readers', t.bad.icon === '!' && t.bad.warn && t.bad.live === 'polite', JSON.stringify(t.bad));
    check('a long message stays up long enough to read (over 3 seconds)', t.bad.still, JSON.stringify(t.bad));
    check('a message that something worked shows ✓; one that asks for something first shows !', t.ok.icon === '✓' && !t.ok.warn && t.ask === '!', JSON.stringify(t));
    // a typed PDF with only a word or two on each page is not a scan
    const p0 = await env.browser.newPage();
    await p0.setContent('<html><body style="margin:0;font:16px Arial">' + [1, 2, 3].map((i) => `<div style="height:1050px;padding:80px"><p>Notes${i}</p><p>Name:<span style="display:inline-block;width:300px;border-bottom:1.5px solid #000;height:16px"></span></p></div>`).join('') + '</body></html>');
    const sparse = await p0.pdf({ format: 'Letter' }); await p0.close();
    const a = await upload(page, { name: 'notes.pdf', mimeType: 'application/pdf', buffer: sparse });
    check('a typed PDF with few words on each page is read as a PDF, not as a scan (quickly, and the editor does not call it a scan)', !/is a scan/.test(a.intro) && a.ms < 10000 && a.fields.length >= 3, a.ms + ' ms | ' + a.intro.slice(0, 160));
    await ctx.close();
  }
  for (const w of [1440, 390]) {
    const { ctx, page } = await open({ viewport: { width: w, height: 844 } });
    await page.evaluate(() => { go('home'); window.scrollTo(0, 0); document.activeElement && document.activeElement.blur(); }); await page.waitForTimeout(300);
    const unseen = [];
    for (let i = 0; i < 140; i++) {
      await page.keyboard.press('Tab');
      const a = await page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null; const cs = getComputedStyle(a); const sb = a.closest('.sidebar');
        const off = !a.getClientRects().length || cs.visibility === 'hidden' || (sb && sb.getBoundingClientRect().right <= 1) || !!a.closest('#modal:not(.on), #drawer:not(.on)');
        return off ? (a.closest('#modal') ? 'window: ' : a.closest('#drawer') ? 'drawer: ' : sb ? 'sidebar: ' : '') + (a.id || a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 24) : null; });
      if (a) unseen.push(a);
    }
    check(`keyboard at ${w} px: Tab never lands on a closed window, a closed drawer${w < 900 ? ' or the slid-away sidebar' : ''}`, !unseen.length, [...new Set(unseen)].join(' | '));
    if (w >= 900) {
      await page.evaluate(() => go('tasks')); await page.waitForTimeout(300);
      await page.click('#view button:has-text("Edit categories")'); await page.waitForTimeout(60);
      const inM = await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('#modal.on')));
      await page.evaluate(() => closeAll()); await page.waitForTimeout(400);
      await page.evaluate(() => { document.activeElement.blur(); openDrawer('Test', '', '<input id=qaIn class=inp>', '<button class=btn>OK</button>'); }); await page.waitForTimeout(60);
      const inD = await page.evaluate(() => document.activeElement && document.activeElement.id === 'qaIn');
      await page.evaluate(() => closeAll());
      check('and a window or drawer still takes the focus the moment it opens', inM && inD, JSON.stringify({ inM, inD }));
    }
    if (w < 900) {
      await page.click('.topbar .hamb'); await page.waitForTimeout(400);
      await page.click('#sidebar >> text=Tasks'); await page.waitForTimeout(400);
      check('phone: the menu still opens, and a page picked in it opens', await page.evaluate(() => state.view === 'tasks' && !el('sidebar').classList.contains('open')));
    }
    await ctx.close();
  }

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
