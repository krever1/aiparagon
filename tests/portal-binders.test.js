// Binders, folders and signing tests for E-&-G-Home-Inc.html (#2, the care portal), v12.38.1. Signed in to a made-up team
// whose Supabase is kept in memory (lib/portal-store.js), so every change is read back after a reload, the way the next
// day sees it. From the Oct 23 QA: an upload in a team binder kept its own record and stored file when renamed or deleted
// after a reload (the binder's copy, same name, stood in for it); a completed form filed straight into a binder was never
// matched; renaming a client's document left its team-binder copy under the old name; a new title from "Edit category and
// date" dropped the document out of its binder; a client's binder export showed the wrong binder; a linked document did
// not open; deleting a client's document left its file in storage; New from template put the draft outside any binder.
// Plus the signing path read back after reloads: a draft, Sign and finalize, read-only, Copy as a new draft.
// Usage: node tests/portal-binders.test.js [baseline.html]
const H = require('./lib/portal-harness');
const { makeStore } = require('./lib/portal-store');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + String(detail).slice(0, 500) + ']'));
}
const DIR = 'jordan@example.org';
const PDF = (t) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n% ${t}\ntrailer<</Root 1 0 R>>\n%%EOF`);

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const store = makeStore({
    np_demo_clients: [{ id: 'cl-a', uci: '1234567', init: 'A.B.', home: 'Maple House' }, { id: 'cl-b', uci: '7654321', init: 'C.D.', home: 'Cedar House' }],
    np_demo_staff: [{ id: 'st-a', name: 'Sam Rivera', init: 'S.R.', role: 'Direct Support Professional', email: 'sam@example.org' }] });
  const S = { email: DIR, password: 'qa-pass-1234', role: 'director', program: [
    { key: 'users', value: { map: { [DIR]: { name: 'Jordan Lee', role: 'director', title: 'Executive Director' } } } },
    { key: 'pilot', value: { signatures: { ['u:' + DIR]: { by: 'Jordan Lee', at: 'Oct 1, 2026', role: 'Director' } } } },
    { key: 'hidesample', value: { v: true } }] };
  const { ctx, page } = await H.newPage(env, { session: S, rest: store.rest, viewport: { width: 1440, height: 1000 }, bucket: errors });
  await store.route(ctx);
  const opened = [];
  await ctx.exposeFunction('__qaOpen', (u) => { opened.push(u); });
  await ctx.addInitScript(() => { window.open = (u) => { try { window.__qaOpen(String(u || '')); } catch (e) {} return { closed: false, document: { title: '', body: {} }, location: { replace: (x) => { try { window.__qaOpen(String(x)); } catch (e) {} } }, close() {}, opener: null }; }; });
  page.on('dialog', (d) => d.accept());
  const ready = async () => {
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on') && HYDRATED, null, { timeout: 20000 });
    await page.evaluate(() => { window.__printed = []; window.printSheet = (h) => window.__printed.push(String(h)); });
    await page.waitForTimeout(400);
  };
  await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  await page.fill('#liEmail', DIR); await page.fill('#liPw', S.password); await page.click('#liGo');
  await ready();
  const reload = async () => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 }); await ready(); };
  const run = async (fn, arg, ms) => { await page.evaluate(fn, arg); await page.waitForTimeout(ms == null ? 250 : ms); };
  const confirmDel = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('#mdFoot button')].reverse().find((x) => /delete|remove/i.test(x.textContent)); if (b) b.click(); }); await page.waitForTimeout(350); };
  const rows = (f) => store.rows('np_demo_documents').filter(f);
  const files = (re) => Object.keys(store.files).filter((k) => re.test(k));
  const sign = async (lab, name) => {
    await page.evaluate((lab) => { const d = docById(window.__did); const i = d.fields.findIndex((f) => f.l === lab); document.querySelector(`#mdBody [data-sig="dg${i}"] .sig-slot`).click(); }, lab);
    await page.waitForTimeout(150); await page.evaluate(() => { if (!el('sigOv').classList.contains('typing')) sigOvMode(); });
    await page.fill('#sigOv .sp-typed', name); await page.evaluate(() => sigUse()); await page.waitForTimeout(150);
  };
  const fill = (lab, v) => page.evaluate(([lab, v]) => { const d = docById(window.__did); const i = d.fields.findIndex((f) => f.l === lab); const n = el('dg' + i); n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); }, [lab, v]);

  // ---------------- 1. an upload in a team binder, renamed and deleted after a reload ----------------
  await run(() => { go('templates'); uploadDoc('', 'General', { b: 'Medical', sb: 'Lab Works' }); });
  await page.setInputFiles('#udFile', { name: 'lab-result.pdf', mimeType: 'application/pdf', buffer: PDF('lab') });
  await page.fill('#udTitle', 'Lab result');
  await run(() => uploadDocSave(''), null, 900);
  await reload();
  check('a binder upload is back after a reload with its file record (not the binder copy) in the document list', await page.evaluate(() => { const it = (COMPLETED.Medical || []).find((x) => x.n === 'Lab result.pdf'); const a = it && agencyFileOf('Medical', it); return !!a && a.cat === 'General' && !DOCS.some((d) => /^Completed — /.test(d.cat || '')); }));
  await run(() => renameFiledTo('Medical', 'Lab result.pdf', 'Lab result Oct'));
  await reload();
  check('renamed after a reload: no record keeps the old name', (await page.evaluate(() => (COMPLETED.Medical || []).some((x) => x.n === 'Lab result Oct.pdf'))) && !rows((r) => r.n === 'Lab result.pdf').length && rows((r) => r.n === 'Lab result Oct.pdf').length === 2,
    JSON.stringify(rows((r) => /Lab result/.test(r.n)).map((r) => [r.n, r.cat])));
  opened.length = 0;
  await run(() => compOpen((COMPLETED.Medical || []).find((x) => x.n === 'Lab result Oct.pdf')), null, 800);
  check('...and it still opens its file', opened.some((u) => /sign\/np-demo-docs\/.+token=qa/.test(u)), JSON.stringify(opened));
  await run(() => { const i = (COMPLETED.Medical || []).findIndex((x) => x.n === 'Lab result Oct.pdf'); completedRemove('Medical', i); }, null, 300);
  await confirmDel();
  await reload();
  check('deleted after a reload: its records and its stored file are gone', !(await page.evaluate(() => (COMPLETED.Medical || []).some((x) => /Lab result/.test(x.n)))) && !rows((r) => /Lab result/.test(r.n)).length && !files(/lab-result/).length,
    JSON.stringify(rows((r) => /Lab result/.test(r.n)).map((r) => [r.n, r.cat])) + ' ' + files(/lab-result/).join());

  // a completed form filed straight into a binder (v12.38)
  await run(() => { go('forms'); ovUploadStart('Medical', 'done'); });
  await page.setInputFiles('#ovFile', { name: 'consent.pdf', mimeType: 'application/pdf', buffer: PDF('consent') });
  await page.fill('#ovDoneTitle', 'Consent');
  await run(() => ovUploadGo(), null, 900);
  await reload();
  await run(() => renameFiledTo('Medical', 'Consent.pdf', 'Consent signed'));
  await reload();
  check('a completed form in a binder, renamed after a reload: its own record follows', !rows((r) => r.n === 'Consent.pdf').length && rows((r) => r.n === 'Consent signed.pdf' && r.cat === 'Completed form').length === 1, JSON.stringify(rows((r) => /Consent/.test(r.n)).map((r) => [r.n, r.cat])));
  await run(() => { const i = (COMPLETED.Medical || []).findIndex((x) => /Consent/.test(x.n)); completedRemove('Medical', i); }, null, 300);
  await confirmDel();
  await reload();
  check('...deleted: its records and stored file are gone', !rows((r) => /Consent/.test(r.n)).length && !files(/consent/).length, JSON.stringify(rows((r) => /Consent/.test(r.n)).map((r) => [r.n, r.cat])) + ' ' + files(/consent/).join());

  // ---------------- 2. a client's document ----------------
  await run(() => { go('clients'); openClient('cl-a', 'documents'); uploadDoc('cl-a', 'General', { b: 'Medical', sb: 'Lab Works', who: 'client' }); });
  await page.setInputFiles('#udFile', { name: 'cbc.pdf', mimeType: 'application/pdf', buffer: PDF('cbc') });
  await page.fill('#udTitle', 'CBC');
  await run(() => uploadDocSave('cl-a'), null, 900);
  await reload();
  await run(() => { const d = DOCS.find((x) => x.cid === 'cl-a' && x.n === 'CBC.pdf'); docRenameTo(d.id, 'cl-a', d.n, 'CBC Oct'); });
  await reload();
  check('a client’s document renamed: its team-binder copy is renamed too, in the database', (await page.evaluate(() => (COMPLETED.Medical || []).some((x) => x.n === 'CBC Oct.pdf'))) && !rows((r) => r.n === 'CBC.pdf').length, JSON.stringify(rows((r) => /CBC/.test(r.n)).map((r) => [r.n, r.cat, r.cid])));
  await run(() => editDocMeta('cl-a', 'CBC Oct.pdf'));
  await page.fill('#edN', 'CBC final');
  await run(() => saveDocMeta('cl-a', 'CBC Oct.pdf'), null, 400);
  await reload();
  const pl = await page.evaluate(() => { const d = DOCS.find((x) => x.cid === 'cl-a' && x.n === 'CBC final.pdf'); const b = d && docBinderOf(d); return d && { b, sb: docSubOf(d, b) }; });
  check('a new title from "Edit category and date" keeps it in Medical / Lab Works', pl && pl.b === 'Medical' && pl.sb === 'Lab Works', JSON.stringify(pl));
  await run(() => { window.__printed = []; exportClientBinder('cl-a'); });
  check('a client’s binder export lists it under Medical / Lab Works', await page.evaluate(() => /CBC final\.pdf<\/td><td>Medical binder<\/td><td>Lab Works<\/td>/.test(window.__printed.pop() || '')));
  // linked into another client's file, it opens
  await run(() => linkDocForm('cl-b'));
  await page.fill('#ldQ', 'CBC final'); await page.waitForTimeout(150);
  await run(() => linkDocGo(0), null, 400);
  await reload();
  opened.length = 0;
  await run(() => { const d = DOCS.find((x) => x.cid === 'cl-b' && x.n === 'CBC final.pdf'); openStoredDoc(d.id, d.n); }, null, 800);
  check('a document linked into another client’s file opens its file', opened.some((u) => /sign\/np-demo-docs\/.+token=qa/.test(u)), JSON.stringify(opened));
  // a client's own upload with no binder copy: deleting it deletes its file
  await run(() => { go('clients'); openClient('cl-b', 'documents'); uploadDoc('cl-b', 'General', { b: 'Agency', sb: '', who: 'client' }); });
  await page.setInputFiles('#udFile', { name: 'id-card.pdf', mimeType: 'application/pdf', buffer: PDF('id') });
  await page.fill('#udTitle', 'ID card'); await page.evaluate(() => { el('udBinder').checked = false; });
  await run(() => uploadDocSave('cl-b'), null, 900);
  check('(a client upload with no team-binder copy is stored)', files(/id-card/).length === 1);
  await run(() => delDoc('cl-b', 'ID card.pdf'), null, 300);
  await confirmDel();
  check('deleting it from the client’s file deletes its stored file too', !files(/id-card/).length && !rows((r) => r.n === 'ID card.pdf').length, files(/id-card/).join());
  check('...while a file the team binder still uses is kept', files(/cbc/).length === 1);

  // ---------------- 3. New from template, signed, after reloads ----------------
  await run(() => { go('clients'); openClient('cl-a', 'documents'); tplPickFor('client', 'cl-a'); });
  await run(() => tplStartFor('client', 'cl-a', 'tp20'), null, 600);
  await page.evaluate(() => { window.__did = Object.keys(USER_DOCS).find((k) => /^fx-/.test(k)); });
  const dr = await page.evaluate(() => { const d = DOCS.find((x) => x.cid === 'cl-a' && /^Face sheet/.test(x.n)); const b = d && docBinderOf(d); return d && { n: d.n, fid: d.fid, b, sb: docSubOf(d, b) }; });
  check('New from template: the draft sits under the template’s binder and tab (Agency / Face Sheet)', dr && dr.b === 'Agency' && dr.sb === 'Face Sheet', JSON.stringify(dr));
  await fill('Allergies', 'Penicillin');
  await run(() => docSave(window.__did, true), null, 500);
  await reload();
  check('...its draft answers are kept after a reload', await page.evaluate((fid) => FILED_DOCS[fid] && FILED_DOCS[fid].status === 'draft' && FILED_DOCS[fid].values.Allergies === 'Penicillin', dr.fid));
  await run(([n]) => { const d = DOCS.find((x) => x.cid === 'cl-a' && x.n === n); openStoredDoc(d.id, d.n); }, [dr.n], 600);
  await page.evaluate(() => { window.__did = Object.keys(USER_DOCS).find((k) => /^fx-/.test(k)); });
  await sign('Staff signature', 'Jordan Lee');
  await run(() => docFinalise(window.__did), null, 300);
  await run(() => { [...document.querySelectorAll('#mdFoot button')].find((b) => /Sign and finalize/.test(b.textContent)).click(); }, null, 700);
  await reload();
  const fin = await page.evaluate((fid) => { const f = FILED_DOCS[fid]; const d = DOCS.find((x) => x.fid === fid); return { st: f.status, sig: f.values['Staff signature'], cat: d && d.cat }; }, dr.fid);
  check('...signed and finalized: final after a reload, a completed form in the client’s file', fin.st === 'final' && fin.sig === 'Jordan Lee' && fin.cat === 'Completed form', JSON.stringify(fin));
  await run(([n]) => { const d = DOCS.find((x) => x.cid === 'cl-a' && x.n === n); openStoredDoc(d.id, d.n); }, [dr.n], 500);
  check('...it opens read-only, with Copy as a new draft', await page.evaluate(() => !document.querySelector('#mdBody input.inp') && [...document.querySelectorAll('#mdFoot button')].some((b) => /Copy as a new draft/.test(b.textContent))));
  await run(() => { [...document.querySelectorAll('#mdFoot button')].find((b) => /Copy as a new draft/.test(b.textContent)).click(); }, null, 600);
  await reload();
  check('...Copy as a new draft: a draft with its answers, the signed one unchanged', await page.evaluate(() => { const fs = Object.values(FILED_DOCS).filter((x) => x.name === 'Face sheet'); return fs.length === 2 && fs.some((x) => x.status === 'final') && fs.some((x) => x.status === 'draft' && x.values.Allergies === 'Penicillin'); }));

  const real = errors.filter((e) => !/ResizeObserver/.test(e));
  check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
