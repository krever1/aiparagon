// Photo and real-form tests for E-&-G-Home-Inc.html (#2, the care portal), v12.28. Erica's real form (Alta's
// "Medication Reason for Use", fixtures/forms/alta-medication-reason-for-use.pdf, a public blank form) is read as
// a PDF, then photographed in the browser: on its side, upside down, at a strong angle, and filled in with pen
// writing. Each photo must give the same boxes and names as the PDF. A filled-in copy's writing is cleared from
// the page the template keeps. A form in Spanish is read with the Spanish word reader, picked when uploading. A
// one-page scan on its side becomes a straightened picture; a longer scan says which pages are on their side.
// The reader (tesseract.js, its engine, English and Spanish data) is served from tests/.cache. Demo view, so
// nothing is saved. See tests/README.md.
// Usage: node tests/portal-photos.test.js [baseline.html]
const path = require('path');
const fs = require('fs');
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const REAL = 'alta-medication-reason-for-use.pdf';
const NAMES = { Date: 'date', Consumer: 'text', DOB: 'date', 'Dear Doctor': 'text', 'Your Patient': 'text', 'Is a resident of': 'text',
  'Is a resident of, line 2': 'text', "Physician's Signature": 'signature', 'Date Signed': 'date' };
const COLS = ['Drug', 'Dose', 'Frequency Given', 'Reason for Use'];
const norm = (s) => String(s).replace(/[‘’]/g, "'");
// pen writing on the form, as [x%, baseline y%, width%, height%]: in the blanks, two table rows and on the signature lines
const WRITE = [[20.5, 15.9, 18, 1.6], [21, 19.4, 24, 1.6], [16.8, 22.9, 14, 1.6], [22, 28.1, 20, 1.6], [22.5, 31.6, 22, 1.6], [71.5, 31.6, 12, 1.6],
  [13, 47.6, 9, 1.1], [27.5, 47.6, 6, 1.1], [39, 47.6, 8, 1.1], [13, 49.4, 10, 1.1], [27.5, 49.4, 6, 1.1], [39, 49.4, 9, 1.1], [13, 79.9, 26, 2.2], [60, 79.9, 14, 1.6]];

/* in the page: a photo of page 1 of a PDF. o.turn turns the sheet on the table (degrees clockwise to bring it
   upright again), o.quad puts its corners in the photo (fractions), o.write writes on it in pen loops. */
function photoGen() {
  window.__photoGen = async function (b64, o) {
    const lib = await loadPdfjs();
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const pdf = await lib.getDocument({ data: u }).promise, pg = await pdf.getPage(1);
    const v = pg.getViewport({ scale: o.scale || 2 });
    let c1 = document.createElement('canvas'); c1.width = v.width; c1.height = v.height;
    const g1 = c1.getContext('2d'); g1.fillStyle = '#fff'; g1.fillRect(0, 0, c1.width, c1.height);
    await pg.render({ canvasContext: g1, viewport: v }).promise;
    let seed = o.seed || 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    (o.write || []).forEach(([x, y, w, h]) => {
      const W = c1.width, Hh = c1.height, x0 = x / 100 * W, base = y / 100 * Hh, len = w / 100 * W, hh = h / 100 * Hh;
      g1.strokeStyle = '#1b2f7a'; g1.lineWidth = Math.max(1.6, W / 600); g1.lineJoin = g1.lineCap = 'round';
      g1.beginPath(); g1.moveTo(x0, base);
      const n = Math.max(3, Math.round(len / (hh * 0.55)));
      for (let k = 0; k < n; k++) {
        const lw = len / n, tall = rnd() < 0.3 ? 1.8 : 1, low = rnd() < 0.15;
        for (let s = 0; s <= 1.0001; s += 0.08) g1.lineTo(x0 + (k + s) * lw - Math.sin(2 * Math.PI * s) * lw * 0.35,
          base - hh * tall * (0.5 - 0.5 * Math.cos(2 * Math.PI * s)) + (low ? hh * 0.6 * Math.sin(Math.PI * s) : 0) + (rnd() - 0.5) * hh * 0.08);
      }
      g1.stroke();
    });
    if (o.turn) {
      const q = o.turn === 180, r = document.createElement('canvas'); r.width = q ? c1.width : c1.height; r.height = q ? c1.height : c1.width;
      const g = r.getContext('2d'); g.translate(r.width / 2, r.height / 2); g.rotate(-o.turn * Math.PI / 180); g.drawImage(c1, -c1.width / 2, -c1.height / 2); c1 = r;
    }
    const PW = Math.round(c1.width * (o.pad || 1.25)), PH = Math.round(c1.height * (o.pad || 1.25));
    const quad = (o.quad || [[0.08, 0.06], [0.92, 0.06], [0.92, 0.94], [0.08, 0.94]]).map(([a, b]) => [a * PW, b * PH]);
    const A = [], bb = [], to = [[0, 0], [c1.width, 0], [c1.width, c1.height], [0, c1.height]];
    for (let i = 0; i < 4; i++) { const [x, y] = quad[i], [uu, vv] = to[i]; A.push([x, y, 1, 0, 0, 0, -uu * x, -uu * y]); bb.push(uu); A.push([0, 0, 0, x, y, 1, -vv * x, -vv * y]); bb.push(vv); }
    for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [bb[c], bb[p]] = [bb[p], bb[c]];
      for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; bb[r] -= f * bb[c]; } }
    const Hm = bb.map((x, i) => x / A[i][i]); Hm.push(1);
    const sd = c1.getContext('2d').getImageData(0, 0, c1.width, c1.height).data, SW = c1.width, SH = c1.height;
    const out = document.createElement('canvas'); out.width = PW; out.height = PH;
    const og = out.getContext('2d'), im = og.createImageData(PW, PH), d = im.data, bg = [74, 59, 44];
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const z = Hm[6] * x + Hm[7] * y + 1, fx = (Hm[0] * x + Hm[1] * y + Hm[2]) / z, fy = (Hm[3] * x + Hm[4] * y + Hm[5]) / z, k = (y * PW + x) * 4;
      if (fx < 0 || fy < 0 || fx >= SW - 1 || fy >= SH - 1) { d[k] = bg[0]; d[k + 1] = bg[1]; d[k + 2] = bg[2]; d[k + 3] = 255; continue; }
      const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, i0 = (y0 * SW + x0) * 4, i1 = i0 + SW * 4;
      for (let c = 0; c < 3; c++) d[k + c] = (sd[i0 + c] * (1 - tx) + sd[i0 + 4 + c] * tx) * (1 - ty) + (sd[i1 + c] * (1 - tx) + sd[i1 + 4 + c] * tx) * ty;
      d[k + 3] = 255;
    }
    og.putImageData(im, 0, 0);
    const gr = og.createLinearGradient(0, 0, PW, PH); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,30,10,0.3)'); og.fillStyle = gr; og.fillRect(0, 0, PW, PH);
    const dd = og.getImageData(0, 0, PW, PH); for (let i = 0; i < dd.data.length; i += 4) { const nz = (rnd() - 0.5) * 16; dd.data[i] += nz; dd.data[i + 1] += nz; dd.data[i + 2] += nz; } og.putImageData(dd, 0, 0);
    return (o.png ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.85)).split(',')[1];
  };
}
// a PDF whose pages are only pictures (a scan): one JPEG per page
function scanPdf(pages) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [' + pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>'];
  pages.forEach((p, i) => {
    const [pw, ph] = p.w > p.h ? [792, 612] : [612, 792], n = 3 + i * 3, content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`);
    objs.push(p); objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const parts = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary')], offs = []; let len = parts[0].length;
  objs.forEach((o, i) => {
    offs.push(len);
    const b = typeof o === 'string' ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`)
      : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${o.w} /Height ${o.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${o.jpg.length} >>\nstream\n`), o.jpg, Buffer.from('\nendstream\nendobj\n')]);
    parts.push(b); len += b.length;
  });
  parts.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`));
  return Buffer.concat(parts);
}
const SPANISH = `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:letter;margin:0} body{margin:0;font-family:'DejaVu Serif',Georgia,serif;font-size:15px;color:#000}
.pg{padding:70px 80px} h1{text-align:center;font-size:22px;margin:0 0 34px} .row{margin:0 0 26px;display:flex;align-items:flex-end;gap:6px}
.ln{border-bottom:1.3px solid #000;flex:0 0 auto;height:18px} table{border-collapse:collapse;width:100%;margin:26px 0 40px} td,th{border:1.3px solid #000;height:26px;font-weight:normal;padding:2px 6px;text-align:left}
.sig{display:flex;gap:60px;margin-top:50px}.sig div{flex:1}.sig .ln{display:block;width:100%;height:34px;margin-bottom:6px}
</style></head><body><div class="pg"><h1>Registro de visita médica</h1>
<div class="row">Fecha:<span class="ln" style="width:200px"></span></div>
<div class="row">Nombre del consumidor:<span class="ln" style="width:330px"></span></div>
<div class="row">Fecha de nacimiento:<span class="ln" style="width:200px"></span>&nbsp; Hora de la cita:<span class="ln" style="width:110px"></span></div>
<div class="row">Médico:<span class="ln" style="width:380px"></span></div>
<table><tr><th style="width:30%">Medicamento</th><th style="width:15%">Dosis</th><th>Motivo del uso</th></tr>
<tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></table>
<div class="sig"><div><span class="ln"></span>Firma del médico</div><div><span class="ln"></span>Fecha de la firma</div></div></div></body></html>`;

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
  // upload through the real Upload a form window (lang: the language picked there)
  async function upload(page, file, lang) {
    await page.evaluate(() => { window._tplEd = null; closeAll(); ovUploadStart('Medical'); });
    await page.waitForTimeout(150);
    if (lang) await page.selectOption('#ovLang', lang);
    await page.setInputFiles('#ovFile', file);
    await page.click('#ovGo');
    await page.waitForSelector('.ov-modal .ov-f', { timeout: 120000 });
    await page.waitForTimeout(400);
    return page.evaluate(() => ({ intro: (document.querySelector('.ov-intro') || {}).innerText || '', kind: ovDocOf(ovT()).kind, overlay: ovT().overlay,
      fields: ovT().fields.map((f) => ({ l: f.l, ty: f.ty, ov: f.ov })), src: TPL_SRC_URL[ovT().id] || '' }));
  }
  const by = (a) => Object.fromEntries(a.fields.map((f) => [norm(f.l), f]));
  const photo = (page, b64, o) => page.evaluate(([b, o]) => window.__photoGen(b, o), [b64, o]);
  const jpgFile = (name, b64) => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  // the same boxes as the PDF: every named blank, and the table's 16 rows of 4 columns
  function same(a, tag, min) {
    const b = by(a);
    const miss = Object.keys(NAMES).filter((l) => !b[l] || b[l].ty !== NAMES[l]);
    check(tag + ': the blanks are found and named as on the PDF', miss.length <= (min ? 1 : 0), 'missing or wrong: ' + miss.join(', ') + ' | got: ' + a.fields.filter((f) => !f.ov.tb).map((f) => f.l + ':' + f.ty).join(', '));
    const cells = a.fields.filter((f) => f.ov.tb), rows = new Set(cells.map((f) => f.ov.r));
    check(tag + ': the table is 16 rows of Drug, Dose, Frequency Given and Reason for Use', rows.size === 16 && COLS.every((c) => cells.filter((f) => f.l.startsWith(c + ', row ')).length === 16),
      rows.size + ' rows; ' + COLS.map((c) => c + ' ' + cells.filter((f) => f.l.startsWith(c + ', row ')).length).join(', '));
  }

  const realB64 = H.formB64(REAL);
  // ---------------- 1. Erica's real form, as a PDF ----------------
  {
    const { ctx, page, sent } = await open();
    sent.length = 0;
    const a = await upload(page, path.join(H.FORMS, REAL));
    check('real form: read as a PDF, 73 places to fill in', a.kind === 'pdf' && a.fields.length === 73, a.kind + ' ' + a.fields.length);
    same(a, 'real form');
    check('real form: the blank that runs on to the next line is "Is a resident of, line 2", a box of its own under the line above',
      !!by(a)['Is a resident of, line 2'] && by(a)['Is a resident of, line 2'].ov.y > by(a)['Is a resident of'].ov.y && by(a)['Is a resident of, line 2'].ov.x < 20);
    check('real form: nothing about it is sent anywhere (only pdf.js is fetched, to read it)', sent.every((s) => /^GET https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\//.test(s)), sent.join(', '));
    await ctx.close();
  }

  // ---------------- 2. photos of it: on its side, upside down, at an angle ----------------
  {
    const { ctx, page, sent } = await open();
    const shots = [
      ['on its side (turned 90°)', { turn: 90, quad: [[0.08, 0.1], [0.92, 0.09], [0.93, 0.9], [0.07, 0.91]] }, /turned the right way up \(it was on its side\)/],
      ['upside down', { turn: 180, quad: [[0.1, 0.08], [0.9, 0.09], [0.91, 0.92], [0.09, 0.91]] }, /turned the right way up \(it was upside down\)/],
      ['on its other side (turned 270°)', { turn: 270, quad: [[0.07, 0.09], [0.93, 0.1], [0.92, 0.92], [0.08, 0.9]] }, /turned the right way up \(it was on its side\)/],
      ['at a strong angle', { quad: [[0.14, 0.04], [0.92, 0.18], [0.88, 0.84], [0.1, 0.96]] }, /pulled flat from its four corners/],
      ['on its side and at an angle', { turn: 90, quad: [[0.1, 0.18], [0.94, 0.05], [0.9, 0.95], [0.06, 0.82]] }, /turned the right way up.*pulled flat from its four corners/],
    ];
    sent.length = 0;
    for (const [tag, o, says] of shots) {
      const a = await upload(page, jpgFile('medication photo.jpg', await photo(page, realB64, Object.assign({ scale: 2 }, o))));
      check('photo ' + tag + ': read as a picture', a.kind === 'image');
      same(a, 'photo ' + tag, /angle/.test(tag));
      check('photo ' + tag + ': the editor says what was done', says.test(a.intro) && /evened out/.test(a.intro), a.intro);
      if (o.turn) {
        const dims = await page.evaluate(() => ovDocOf(ovT()).pages[0]);
        check('photo ' + tag + ': the kept page stands upright (taller than wide)', dims.h > dims.w * 1.2, JSON.stringify(dims));
      }
    }
    check('photos: nothing about them is sent anywhere (only the reader and pdf.js are fetched)', sent.every((s) => /^GET https:\/\/(cdn\.jsdelivr\.net\/npm\/(tesseract|@tesseract)|cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/)/.test(s)), sent.filter((s) => !/^GET https:\/\/(cdn\.jsdelivr|cdnjs)/.test(s)).join(', '));
    await ctx.close();
  }

  // ---------------- 3. a filled-in copy: the writing is cleared, the boxes stay ----------------
  {
    const { ctx, page } = await open();
    const b64 = await photo(page, realB64, { scale: 2, write: WRITE, quad: [[0.06, 0.05], [0.94, 0.06], [0.95, 0.95], [0.05, 0.94]] });
    const a = await upload(page, jpgFile('filled copy.jpg', b64));
    same(a, 'filled-in copy');
    const n = (a.intro.match(/(\d+) boxes had writing in them/) || [])[1];
    check('filled-in copy: the editor says how many boxes had writing, that handwriting is not read, and that it was cleared', +n >= 12 && /Handwriting is not read/.test(a.intro) && /cleared from the page/.test(a.intro), a.intro);
    // the kept page: where the writing was is blank now, and the printed words and lines are still there
    const ink = await page.evaluate(async (fields) => {
      const img = new Image(); img.src = TPL_SRC_URL[ovT().id]; await img.decode();
      const c = ovCanvas(img.naturalWidth, img.naturalHeight), g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const dark = (x, y, w, h) => { const d = g.getImageData(Math.round(x / 100 * c.width), Math.round(y / 100 * c.height), Math.max(1, Math.round(w / 100 * c.width)), Math.max(1, Math.round(h / 100 * c.height))).data;
        let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 120) n++; return n / (d.length / 4); };
      const f = (l) => fields.find((x) => x.l.replace(/[‘’]/g, "'") === l);
      const box = (l) => { const o = f(l).ov; return dark(o.x + 0.5, o.y - o.h * 0.6, o.w - 1, o.h * 1.3); };
      const line = (l) => { const o = f(l).ov; return dark(o.x + 1, o.y + o.h - 0.25, o.w - 2, 0.5); };
      const cell = (l) => { const o = f(l).ov; return dark(o.x + 0.3, o.y + 0.2, o.w - 0.6, o.h - 0.4); };
      return { blanks: ['Date', 'Consumer', 'DOB', 'Dear Doctor', 'Your Patient'].map(box), lines: ['Date', 'Consumer', 'DOB'].map(line),
        cells: ['Drug, row 1', 'Dose, row 1', 'Drug, row 2'].map(cell), name: dark(f('Consumer').ov.x - 9, f('Consumer').ov.y - 0.4, 8, 2) };
    }, a.fields);
    check('filled-in copy: the kept page is blank where the blanks were written in', ink.blanks.every((v) => v < 0.01), ink.blanks.map((v) => v.toFixed(3)).join(', '));
    check('filled-in copy: and in the written-in table cells', ink.cells.every((v) => v < 0.01), ink.cells.map((v) => v.toFixed(3)).join(', '));
    check('filled-in copy: the blank lines are drawn back', ink.lines.every((v) => v > 0.2), ink.lines.map((v) => v.toFixed(2)).join(', '));
    check('filled-in copy: the printed names beside them are still there', ink.name > 0.05, ink.name.toFixed(3));
    await ctx.close();
  }

  // ---------------- 4. a form in Spanish, read in Spanish ----------------
  {
    const p0 = await env.browser.newPage(); await p0.setContent(SPANISH); const pdf = await p0.pdf({ format: 'Letter', printBackground: true }); await p0.close();
    const { ctx, page, sent } = await open();
    const ui = await page.evaluate(() => { ovUploadStart('Medical'); const s = el('ovLang'); const r = { has: !!s, value: s && s.value, n: s ? s.options.length : 0, opts: s ? [...s.options].map((o) => o.textContent) : [] }; closeAll(); return r; });
    check('upload: the window asks what language the words on the form are in, English to start with', ui.has && ui.value === 'eng' && ui.n >= 10 && ui.opts.some((t) => /Spanish \(Español\)/.test(t)) && ui.opts.some((t) => /Chinese/.test(t)) && ui.opts.some((t) => /Vietnamese/.test(t)), JSON.stringify(ui));
    sent.length = 0;
    const b64 = await photo(page, pdf.toString('base64'), { scale: 2, quad: [[0.12, 0.08], [0.9, 0.11], [0.93, 0.92], [0.07, 0.9]] });
    const a = await upload(page, jpgFile('registro.jpg', b64), 'spa');
    const b = by(a);
    const want = { Fecha: 'date', 'Nombre del consumidor': 'text', 'Fecha de nacimiento': 'date', 'Hora de la cita': 'time', 'Médico': 'text', 'Firma del médico': 'signature', 'Fecha de la firma': 'date' };
    const miss = Object.keys(want).filter((l) => !b[l] || b[l].ty !== want[l]);
    check('Spanish: the blanks are named in Spanish, and Fecha, Hora and Firma give dates, a time and a signature', !miss.length, 'missing or wrong: ' + miss.join(', ') + ' | got: ' + a.fields.map((f) => f.l + ':' + f.ty).join(', '));
    check('Spanish: the table columns are Medicamento, Dosis and Motivo del uso', ['Medicamento', 'Dosis', 'Motivo del uso'].every((c) => a.fields.filter((f) => f.l.startsWith(c + ', row ')).length === 4));
    check('Spanish: the Spanish word reader was fetched for it', sent.some((s) => /@tesseract\.js-data\/spa@1\.0\.0\/4\.0\.0_best_int\/spa\.traineddata/.test(s)), sent.join(', '));
    check('Spanish: the editor says the words were read in Spanish', /Words read in Spanish/.test(a.intro), a.intro);
    check('Spanish: the template keeps its language (for Find boxes later), and the choice is remembered on this device',
      a.overlay.lang === 'spa' && await page.evaluate(() => localStorage.getItem('np.ocrLang') === 'spa' && OV_LANG === 'spa'), JSON.stringify(a.overlay.lang));
    const again = await page.evaluate(async () => { const t = ovT(); delete OV_SLOTS[t.id]; const orig = window.ocrWorker; let asked = null;
      window.ocrWorker = (l) => { asked = l; return orig(l); }; const s = await ovSlotsLoad(t); window.ocrWorker = orig; return { asked, n: s ? s.length : 0 }; });
    check('Spanish: Find boxes reads the saved picture in Spanish too', again.asked === 'spa' && again.n >= 19, JSON.stringify(again));
    await page.evaluate(() => { ovLangSet('eng'); });
    await ctx.close();
  }

  // ---------------- 5. scans on their side ----------------
  {
    const { ctx, page } = await open();
    const shoot = async (o) => { const b = await photo(page, realB64, Object.assign({ scale: 150 / 72, pad: 1, quad: [[0, 0], [1, 0], [1, 1], [0, 1]] }, o));   // a scan: the sheet only, at 150 dpi
      const jpg = Buffer.from(b, 'base64'); const d = await page.evaluate((b) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = 'data:image/jpeg;base64,' + b; }), b);
      return { jpg, w: d[0], h: d[1] }; };
    // v12.31: which turned pages keep their full-size picture (only a one-page scan uses it)
    await page.evaluate(() => { window.__kept = []; const o = ovReadScannedPage; window.ovReadScannedPage = async function () { const r = await o.apply(this, arguments); if (r && r.scan && r.scan.turn) window.__kept.push(r.scan.cv ? r.scan.cv.width : 0); return r; }; });
    const one = scanPdf([await shoot({ turn: 180 })]);
    const a = await upload(page, { name: 'scan upside down.pdf', mimeType: 'application/pdf', buffer: one });
    const keptOne = await page.evaluate(() => window.__kept.splice(0));
    check('one-page scan upside down: turned and kept as a clean picture, like a photo', a.kind === 'image', a.kind);
    same(a, 'one-page scan upside down', true);
    check('one-page scan upside down: the editor says it was a scan, turned the right way up', /This PDF is a scan/.test(a.intro) && /turned the right way up \(it was upside down\)/.test(a.intro), a.intro);
    const two = scanPdf([await shoot({}), await shoot({ turn: 90 })]);
    const b = await upload(page, { name: 'two pages.pdf', mimeType: 'application/pdf', buffer: two });
    check('two-page scan, page 2 on its side: kept as the PDF, page 1 boxed, page 2 left alone', b.kind === 'pdf' && b.fields.some((f) => f.ov.p === 0) && !b.fields.some((f) => f.ov.p === 1), b.kind + ' ' + b.fields.length);
    check('two-page scan: the editor says page 2 is on its side and to turn it in the scanner app', /Page 2 of this scan is on its side or upside down/.test(b.intro) && /scanner app/.test(b.intro), b.intro);
    const keptTwo = await page.evaluate(() => window.__kept.splice(0));
    check('scans on their side: a one-page scan keeps its page to make the picture, a longer one lets go of it at once (no 20 MB page held per turned page)', keptOne.length === 1 && keptOne[0] > 0 && keptTwo.length === 1 && keptTwo[0] === 0, JSON.stringify({ keptOne, keptTwo }));
    await ctx.close();
  }

  // ---------------- 6. without the word reader, a photo on its side is still turned and boxed ----------------
  {
    const { ctx, page } = await open({ noOcr: true });
    const a = await upload(page, jpgFile('side.jpg', await photo(page, realB64, { scale: 2, turn: 90, quad: [[0.08, 0.1], [0.92, 0.09], [0.93, 0.9], [0.07, 0.91]] })));
    const dims = await page.evaluate(() => ovDocOf(ovT()).pages[0]);
    check('no reader: a photo on its side is still turned upright and its boxes found', a.kind === 'image' && dims.h > dims.w * 1.2 && a.fields.length >= 70 && /on its side/.test(a.intro), a.fields.length + ' ' + JSON.stringify(dims));
    await ctx.close();
  }

  // ---------------- 7. the kind of box from a name, in other languages too ----------------
  {
    const { ctx, page } = await open();
    const g = await page.evaluate(() => ['Date of signature', 'Signature date', 'Physician’s Signature', 'Date Signed', 'Fecha de la firma', 'Firma del médico', 'Hora', 'Fecha de nacimiento',
      'Chữ ký', 'Ngày sinh', 'Подпись', 'Дата', '签名', '日期', '서명', 'Petsa', 'Lagda'].map((l) => l + '=' + ovGuess(l)));
    const want = ['date', 'date', 'signature', 'date', 'date', 'signature', 'time', 'date', 'signature', 'date', 'signature', 'date', 'signature', 'date', 'signature', 'date', 'signature'];
    check('kinds: a date named with a signature is a date; Spanish, Vietnamese, Russian, Chinese, Korean and Tagalog names give the right kind', g.every((x, i) => x.endsWith('=' + want[i])), g.join(', '));
    await ctx.close();
  }

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
