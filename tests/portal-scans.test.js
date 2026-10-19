// Scan and photo tests for E-&-G-Home-Inc.html (#2, the care portal), v12.27: a photo of a paper form (on a
// table, turned a little, in uneven light) is cut down to the sheet, turned straight and evened out, then read on
// this computer: blank lines, table cells and tick boxes found, and named from the words on the page by an
// in-browser reader. A scanned PDF (a picture with no words in it) is read the same way, and its boxes are put
// back where the page leans. Without the reader the boxes are still found, unnamed. The made-up photos and scan
// in fixtures/forms come from the same forms as the PDF fixtures. The reader (tesseract.js and its English data)
// is served from tests/.cache. Runs in the demo view, so nothing is saved. See tests/README.md.
// Usage: node tests/portal-scans.test.js [baseline.html]
const path = require('path');
const fs = require('fs');
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const MED = { Date: 'date', Consumer: 'text', DOB: 'date', 'Dear Doctor': 'text', 'Your Patient': 'text', 'Is a resident of': 'text', "Physician's Signature": 'signature', 'Date Signed': 'date' };
const CELL = /^(Drug|Dose|Frequency Given|Reason for Use), row ([1-9]|1[0-5])$/;

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
    return { ctx, page, sent };
  }
  // upload a file through the real Upload a form window, noting what the button says on the way
  async function upload(page, file) {
    await page.evaluate(() => { window._tplEd = null; closeAll(); ovUploadStart('Medical'); });
    await page.waitForTimeout(150);
    await page.setInputFiles('#ovFile', file);
    await page.evaluate(() => { window._says = []; const b = el('ovGo'); new MutationObserver(() => { const t = b.textContent; if (window._says[window._says.length - 1] !== t) window._says.push(t); }).observe(b, { childList: true, characterData: true, subtree: true }); });
    await page.click('#ovGo');
    await page.waitForSelector('.ov-modal .ov-f', { timeout: 90000 });
    await page.waitForTimeout(400);
    return page.evaluate(() => ({ says: window._says, intro: (document.querySelector('.ov-intro') || {}).innerText || '', kind: ovDocOf(ovT()).kind, pages: ovDocOf(ovT()).pages,
      fields: ovT().fields.map((f) => ({ l: f.l, ty: f.ty, ov: f.ov })), src: TPL_SRC_URL[ovT().id] || '' }));
  }
  const by = (a) => Object.fromEntries(a.fields.map((f) => [f.l, f]));

  // ---------------- 1. a photo of the medication form ----------------
  {
    const { ctx, page, sent } = await open();
    sent.length = 0;                                                  // from here on: reading the photo
    const a = await upload(page, path.join(H.FORMS, 'med-photo.jpg'));
    check('photo: the button says what is happening (straightening, then reading the words)', a.says.some((t) => /Straightening the photo/.test(t)) && a.says.some((t) => /Reading the words/.test(t)), a.says.join(' | '));
    check('photo: it is read as a picture of a form', a.kind === 'image');
    check('photo: the editor says it was cut out, turned straight (2.4°) and evened out, and to check the names',
      /Read from a photo on this computer/.test(a.intro) && /the sheet was cut out/.test(a.intro) && /turned straight \((2\.[3-6])°\)/.test(a.intro) && /Check each name/.test(a.intro), a.intro);
    const b = by(a);
    const lines = Object.keys(MED).filter((l) => b[l] && b[l].ty === MED[l]);
    check('photo: every blank line is found and named from the words on the page (Date, Consumer, DOB, Dear Doctor, Your Patient, Is a resident of, the signature and Date Signed)', lines.length === 8, 'missing: ' + Object.keys(MED).filter((l) => !lines.includes(l)).join(', ') + ' | got: ' + a.fields.filter((f) => !CELL.test(f.l)).map((f) => f.l).join(', '));
    const cells = a.fields.filter((f) => CELL.test(f.l) && f.ov.tb);
    check('photo: every table cell is a box, named by its column heading and row (4 columns x 15 rows)', cells.length === 60, cells.length + ' | ' + a.fields.filter((f) => f.ov.tb && !CELL.test(f.l)).slice(0, 4).map((f) => f.l).join(', '));
    check('photo: nothing else is taken for a box (68 in all, no stray tick boxes)', a.fields.length === 68 && !a.fields.some((f) => f.ty === 'check'), a.fields.length + ' ' + a.fields.filter((f) => !CELL.test(f.l) && !MED[f.l]).map((f) => f.l).join(', '));
    // the page kept is the clean one: smaller than the photo (the table cut away), straight, and every line box sits on its line
    const kept = await page.evaluate(async () => {
      const t = ovT(), url = TPL_SRC_URL[t.id];
      const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = url; });
      const c = ovCanvas(img.naturalWidth, img.naturalHeight); c.getContext('2d').drawImage(img, 0, 0);
      const gr = ovGray(c), W = c.width, Hh = c.height, dk = ovDark(gr);
      const blob = await (await fetch(url)).blob();
      /* a line box's bottom edge: is there a ruled line within a few pixels, across most of the box? */
      const onLine = t.fields.filter((f) => !f.ov.tb && f.ty !== 'check').map((f) => {
        const x0 = Math.round(f.ov.x / 100 * W), x1 = Math.round((f.ov.x + f.ov.w) / 100 * W), yb = Math.round((f.ov.y + f.ov.h) / 100 * Hh);
        let best = 0; for (let y = yb - 8; y <= yb + 8; y++) { let n = 0; for (let x = x0; x < x1; x++) n += dk[y * W + x]; best = Math.max(best, n / Math.max(1, x1 - x0)); }
        return [f.l, Math.round(best * 100)];
      });
      return { w: W, h: Hh, type: blob.type, skew: ovSkew(dk, W, Hh), onLine };
    });
    check('photo: the template keeps the clean page, cut down to the sheet (narrower than the 1508 px photo), as a JPEG', kept.w < 1450 && kept.type === 'image/jpeg', JSON.stringify([kept.w, kept.h, kept.type]));
    check('photo: the kept page is straight (it leans less than 0.3°)', Math.abs(kept.skew) < 0.3, String(kept.skew));
    check('photo: each line box sits on its line on the kept page', kept.onLine.every(([, p]) => p >= 70), JSON.stringify(kept.onLine));
    // the boxes work like any other: the table, the format bar, filling in
    await page.evaluate(() => ovSelect(ovT().fields.findIndex((f) => f.l === 'Dose, row 3')));
    const side = await page.evaluate(() => el('ovSide').innerText.replace(/\s+/g, ' '));
    check('photo: a table cell shows its table (15 rows × 4 columns, the “Dose” column)', /Table · 15 rows × 4 columns/.test(side) && /“Dose” column/.test(side), side.slice(0, 300));
    check('photo: the format bar gives the box’s size in points as on a letter page (9 pt), not in pixels', await page.evaluate(() => document.querySelector('#ovFmt .fmt-size').value) === '9');
    // Find boxes reads the kept page again
    await page.evaluate(() => { ovSelect(null); ovSnap(); ovT().fields = ovT().fields.filter((f) => !f.ov.tb); ovPaint(); });
    await page.click('.ov-find');
    await page.waitForFunction(() => ovT().fields.length === 68, null, { timeout: 60000 }).catch(() => {});
    check('photo: Find boxes reads the kept page again and puts the table back, named', await page.evaluate(() => ovT().fields.length === 68 && ovT().fields.filter((f) => /^(Drug|Dose|Frequency Given|Reason for Use), row/.test(f.l)).length === 60), await page.evaluate(() => ovT().fields.length));
    await page.fill('#ovTplName', 'QA photo form');
    await page.evaluate(() => ovThen('fill'));
    await page.waitForSelector('.ov-doc.ov-fill input', { timeout: 15000 });
    check('photo: it fills in on the clean page like any uploaded form', await page.evaluate(() => document.querySelectorAll('.ov-doc.ov-fill .ov-f').length === 68 && !!document.querySelector('.ov-doc.ov-fill .ov-img[src]')));
    const out = sent.filter((r) => !/^GET https:\/\/cdn\.jsdelivr\.net\/npm\/(tesseract\.js|tesseract\.js-core|@tesseract\.js-data\/eng)@/.test(r) && !/^GET https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\//.test(r));
    check('photo: nothing is sent anywhere: the only requests out are for the reader itself', out.length === 0, out.slice(0, 5).join(' | '));
    await ctx.close();
  }

  // ---------------- 2. a photo with tick boxes, a table with named rows and a framed box ----------------
  {
    const { ctx, page } = await open();
    const a = await upload(page, path.join(H.FORMS, 'qpr-photo.jpg'));
    const b = by(a);
    check('qpr photo: Client ID and Time are found and named (Time as a time)', b['Client ID'] && b['Client ID'].ty === 'text' && b.Time && b.Time.ty === 'time', Object.keys(b).join(', '));
    check('qpr photo: each drawn tick box is found, named with its question (“Does the client attend day program: Yes”)',
      b['Does the client attend day program: Yes'] && b['Does the client attend day program: Yes'].ty === 'check' && b['Does the client attend day program: No'] && b['Does the client attend day program: No'].ty === 'check', Object.keys(b).join(', '));
    check('qpr photo: and nothing else is taken for a tick box (a letter D, say)', a.fields.filter((f) => f.ty === 'check').length === 2, a.fields.filter((f) => f.ty === 'check').map((f) => f.l).join(', '));
    check('qpr photo: the comment lines are one long answer', b.Comments && b.Comments.ty === 'long text');
    check('qpr photo: the table’s rows keep their names (“Goal 2: Initials”)', ['1', '2', '3'].every((n) => b['Goal ' + n + ': Progress this quarter'] && b['Goal ' + n + ': Initials']), Object.keys(b).join(', '));
    check('qpr photo: the framed box is a long answer named from the words above it', b['Notes for the planning team'] && b['Notes for the planning team'].ty === 'long text');
    check('qpr photo: 12 boxes, the same as from the PDF', a.fields.length === 12, a.fields.map((f) => f.l).join(', '));
    await ctx.close();
  }

  // ---------------- 3. a scanned PDF: a picture with no words in it ----------------
  {
    const { ctx, page } = await open();
    const ref = await page.evaluate(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const r = await ovAnalyzePdf(u.buffer); return r.fields.map((f) => ({ l: f.l, ov: f.ov })); }, H.formB64('med-typed.pdf'));
    const a = await upload(page, path.join(H.FORMS, 'med-scan.pdf'));
    const b = by(a);
    check('scan: it stays a PDF (the scan itself is the page)', a.kind === 'pdf');
    check('scan: the editor says the words were read from the picture', /This PDF is a scan, so its words were read from the picture/.test(a.intro), a.intro);
    const lines = Object.keys(MED).filter((l) => b[l] && b[l].ty === MED[l]);
    check('scan: every blank line is found and named', lines.length === 8, 'missing: ' + Object.keys(MED).filter((l) => !lines.includes(l)).join(', '));
    check('scan: every table cell is found and named (60)', a.fields.filter((f) => CELL.test(f.l) && f.ov.tb).length === 60 && a.fields.length === 68, a.fields.length + '');
    /* the scan leans 0.7°: its boxes are put back where the page leans, so they land where the typed form's are */
    const off = ref.filter((r) => b[r.l]).map((r) => { const s = b[r.l].ov; return [r.l, Math.round(Math.max(Math.abs(s.x - r.ov.x), Math.abs(s.y - r.ov.y)) * 100) / 100]; });
    const worst = off.reduce((m, x) => (x[1] > m[1] ? x : m), ['', 0]);
    check('scan: each box lands within 1% of the page of where it is on the typed original', off.length === 68 && worst[1] <= 1, off.length + ' matched, worst ' + worst.join(' '));
    await ctx.close();
  }

  // ---------------- 4. a picture that is already clean and straight ----------------
  {
    const { ctx, page } = await open();
    const png = await page.evaluate(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const lib = await loadPdfjs(), pdf = await lib.getDocument({ data: u }).promise, pg = await pdf.getPage(1), v = pg.getViewport({ scale: 2 });
      const c = ovCanvas(v.width, v.height), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: g, viewport: v }).promise;
      return c.toDataURL('image/png').split(',')[1]; }, H.formB64('qpr.pdf'));
    const a = await upload(page, { name: 'qpr-clean.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    check('clean picture: nothing to cut or turn, so the note says only that it was evened out', /Read from a photo on this computer: evened out/.test(a.intro) && !/cut out|turned straight/.test(a.intro), a.intro);
    check('clean picture: the same 12 boxes', a.fields.length === 12 && !!by(a)['Does the client attend day program: No'], a.fields.map((f) => f.l).join(', '));
    await ctx.close();
  }

  // ---------------- 5. without the word reader ----------------
  {
    const { ctx, page } = await open({ noOcr: true });
    const a = await upload(page, path.join(H.FORMS, 'med-photo.jpg'));
    check('no reader: the photo is still cleaned up and its boxes found', a.kind === 'image' && a.fields.length >= 60 && /turned straight/.test(a.intro), a.fields.length + '');
    check('no reader: the editor says the words could not be read, and what to do', /The words could not be read/.test(a.intro) && /Name them on the right, or press Find boxes once you are online/.test(a.intro), a.intro);
    check('no reader: the table cells are still named by place (“Column 2, row 3”)', a.fields.some((f) => /^Column \d, row \d+$/.test(f.l) && f.ov.tb), a.fields.slice(8, 11).map((f) => f.l).join(', '));
    await ctx.close();
  }

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
