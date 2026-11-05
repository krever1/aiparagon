// v132 tests for new-aiparagon-dashboard.html (#1): the firm's own past documents for Catalyst, and the client proposal.
// Templates (Atlas) gets "Your past documents": a past proposal, the discovery call questions and a past assessment are
// read in the browser (Word, PDF or text), and the page shows the sections and the brand it found (logo, colors, fonts)
// before keeping the file (guide-files/sources and a catalyst_sources row). On a lead, the growth plan tab gets the client
// proposal: written by n8n from those documents, the call transcript and the lead's documents, shown as the client sees
// it (cover, logo, colors, fonts, every section and where it came from), edited in place, saved as a PDF, with What
// should change?. The question before a board run names the past documents its steps use, Deliverables lists the
// proposal, and AI settings says what reads what. Desktop and phone width.
// The sample files in tests/fixtures/catalyst are made up (Summit Business Advisors and its clients do not exist).
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js), storage
// and n8n webhooks answer from stubs, and pdf.js comes from a local copy, so no real account, file, data or workflow is
// touched. Fails on the build before v132.
// Usage: node tests/dashboard-v132.test.js
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const H = require('./lib/dashboard-harness');
const { makeStore } = require('./lib/rest-stub');
const FX = require('./lib/qa-fixtures');

const ROOT = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'catalyst');
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const PDFJS = '3.11.174';
const L1 = FX.L1, L2 = FX.L2;
const DOCX = ['Summit proposal template.docx', 'Summit discovery call questions.docx', 'Summit past assessment.docx'];
const LOGO_URL = SB + '/storage/v1/object/public/guide-files/sources/1793000000000-logo.png';
const BRAND = { colors: { primary: '#0E5A63', accent: '#D9902F', text: '#1E2A33' }, fonts: { heading: 'Montserrat', body: 'Source Serif 4' }, found: ['logo', 'colors', 'fonts'], logo_url: LOGO_URL };
const SECS = ['Executive summary', 'Where you are today', 'What we heard', 'Our recommendation', 'Scope of work', 'Timeline and investment', 'Next steps'];
const P = JSON.parse(fs.readFileSync(path.join(FIX, 'proposal.json'), 'utf8'));
const REASON = 'Put the investment before the scope of work, the way we present it.';
const CALL = { id: '9132', title: 'QA Firm · discovery consultation', start: '2026-10-22T17:00:00Z', end: '2026-10-22T17:32:00Z',
  recorded_by: { name: 'QA Tester', email: 'qa@aiparagonconsulting.com' }, invitees: [{ name: 'Pat QA', email: L1, external: true }] };
const TRANSCRIPT = [{ speaker: 'Pat QA', text: 'Every pricing call still comes to me.' }, { speaker: 'QA Tester', text: 'How long does a site manager wait?' }];

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

// pdf.js, the version the dashboard loads from cdnjs, kept in tests/.cache (fetched from npm once, like the portal suites)
function pdfjsBuild() {
  const dir = path.join(__dirname, '.cache', 'pdfjs-dist-' + PDFJS);
  const build = path.join(dir, 'package', 'build');
  if (!fs.existsSync(path.join(build, 'pdf.worker.min.js'))) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('npm', ['pack', 'pdfjs-dist@' + PDFJS], { cwd: dir, stdio: 'ignore' });
    execFileSync('tar', ['xzf', 'pdfjs-dist-' + PDFJS + '.tgz'], { cwd: dir });
  }
  return build;
}

// the sources and a proposal for Pat QA (L1), as the dashboard and n8n save them
function sourceRows() {
  return [
    { id: '00000000-0000-4000-8000-000000132001', kind: 'proposal_template', file_name: 'Summit proposal template.docx', file_type: 'docx', file_path: 'sources/1-a.docx', active: true,
      created_at: '2026-10-27T10:00:00Z', sections: SECS.map((t) => ({ title: t })), brand: BRAND, file_text: '# Proposal and Scope of Work' },
    { id: '00000000-0000-4000-8000-000000132002', kind: 'discovery_template', file_name: 'Summit discovery call questions.docx', file_type: 'docx', file_path: 'sources/1-b.docx', active: true,
      created_at: '2026-10-27T10:00:01Z', sections: [{ title: 'Open with' }], brand: BRAND, file_text: '# Discovery call questions' },
    { id: '00000000-0000-4000-8000-000000132003', kind: 'past_assessment', file_name: 'Summit past assessment.docx', file_type: 'docx', file_path: 'sources/1-c.docx', active: true,
      created_at: '2026-10-27T10:00:02Z', sections: [{ title: 'Summary' }], brand: BRAND, file_text: '# Operating model assessment' }];
}
function proposalRow(over) {
  const doc = { title: P.doc_title, kicker: P.kicker, subtitle: P.subtitle, client: P.client, prepared_for: P.prepared_for, prepared_by: P.prepared_by, date: P.date, note: P.note, sections: P.sections };
  return Object.assign({ id: '00000000-0000-4000-8000-0000000c1320', run_id: L1, agent: 'client_proposal', output_type: 'client_proposal', title: P.title, created_at: '2026-10-28T15:00:00Z',
    content_md: '# ' + P.doc_title, data: { doc, brand: BRAND, call: { id: CALL.id, title: CALL.title, date: CALL.start },
      sources: [{ key: 'template', label: 'your proposal template' }, { key: 'call', label: 'the call on Oct 22' }, { key: 'assessment', label: 'the assessment' }] } }, over || {});
}
function tables(fn) { const t = FX.tables(); if (fn) fn(t); return t; }

(async () => {
  const build = pdfjsBuild();
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];

  // opts.hook: how the proposal webhook answers; opts.tx: false when the transcript cannot be read
  async function open(width, store, url, opts) {
    opts = opts || {};
    const sent = [], storage = [];
    const hooks = (u, m, b) => {
      let body = {}; try { body = JSON.parse(b || '{}'); } catch (e) {}
      sent.push({ u, body });
      if (/fathom-proxy$/.test(u)) {
        if (body.action === 'list') return { body: { ok: true, items: opts.calls === false ? [] : [CALL] } };
        if (body.action === 'transcript') return opts.tx === false ? { body: { ok: false, message: 'Fathom did not answer' } } : { body: { ok: true, transcript: TRANSCRIPT } };
      }
      if (/catalyst-proposal$/.test(u)) return opts.hook || { body: { ok: true, started: true } };
      return { body: { ok: true } };
    };
    const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks, bucket: errors, fixed: false });
    await ctx.route(/pdf\.js\/3\.11\.174\/(pdf(?:\.worker)?\.min\.js)$/, (route) => {
      const m = route.request().url().match(/(pdf(?:\.worker)?\.min\.js)$/);
      route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(build, m[1])) });
    });
    await ctx.route(SB + '/storage/**', (route) => {
      const r = route.request(), at = r.url().split('/storage/v1/object/')[1] || '';
      storage.push({ method: r.method(), at, type: r.headers()['content-type'] || '' });
      if (r.method() === 'GET') return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(FIX, 'summit-logo.png')) });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"Key":"guide-files/' + at + '"}' });
    });
    await page.setViewportSize({ width, height: 900 });
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + (url || '/dashboard/templates'), { waitUntil: 'load' });
    await H.settled(page, 'app');
    await page.waitForTimeout(1500);
    return { ctx, page, sent, storage };
  }
  const rows = (page) => page.$$eval('#v132Src .v132-row', (els) => els.map((e) => ({
    name: (e.querySelector('.nm') || {}).textContent || '', busy: !!e.querySelector('.v132-busy'),
    kind: (e.closest('.v137-st') && typeof V137_TPL !== 'undefined' ? (V137_TPL[e.closest('.v137-st').dataset.s] || {}).kind : (e.querySelector('select') || {}).value) || '',   /* v137: the stage card is the kind */
    err: (e.querySelector('.v132-err') || {}).textContent || '', inUse: !!e.querySelector('.v132-use'), useBtn: !![...e.querySelectorAll('button')].find((b) => b.textContent === 'Use this one'),
    lines: [...e.querySelectorAll('.v132-l')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()),
    chips: [...e.querySelectorAll('.v132-chip')].map((c) => c.textContent), sw: [...e.querySelectorAll('.v132-sw')].map((s) => s.title),
    logo: (e.querySelector('.v132-logo') || {}).src || '', fonts: (e.querySelector('.v132-ff') || {}).textContent || '', what: (e.querySelector('.v132-what') || {}).textContent || '',
    opts: [...e.querySelectorAll('select option')].map((o) => o.textContent) })));
  const settledRows = (page, n) => page.waitForFunction((k) => document.querySelectorAll('#v132Src .v132-row').length === k && !document.querySelector('#v132Src .v132-busy'), n, { timeout: 30000 });
  const writes = (store, table, method) => store.writes.filter((w) => w.table === table && (!method || w.method === method));
  async function lead(page, email, stage) {
    await page.evaluate((a) => openE1LeadStage(a[0], a[1]), [email, stage == null ? 4 : stage]);
    await page.waitForFunction(() => document.querySelectorAll('#main section.block').length >= 5, null, { timeout: 15000 });
    await page.waitForTimeout(1500);
  }
  const card = (page) => page.$eval('.v132-pc', (c) => ({ title: (c.querySelector('.ap-doc-t b') || {}).textContent || '', sub: (c.querySelector('.ap-doc-t small') || {}).textContent || '',
    btns: [...c.querySelectorAll('.statline button')].filter((b) => b.getClientRects().length).map((b) => b.textContent.trim()), run: (c.querySelector('.v132-run') || {}).innerText || '',
    visible: !!c.getClientRects().length })).catch(() => null);

  // 1. Templates: the three Word files, read in the browser, kept with what was found
  {
    const store = makeStore(tables());
    const { ctx, page, storage } = await open(1440, store);
    const top = await page.evaluate(() => ({ card: !!document.getElementById('v132Src'), h: (document.querySelector('#v132Src h3') || {}).textContent, k: (document.querySelector('#v132Src .k') || {}).textContent,
      sub: (document.querySelector('#rd-templates .rd-head p') || {}).textContent, ctpl: (document.querySelector('.v132-ctpl h3') || {}).textContent,
      order: [...document.querySelectorAll('#rd-templates > *')].map((e) => e.id || e.className.split(' ')[0]).slice(0, 4),
      fixed: [...document.querySelectorAll('#rd-templates .rd-card .rd-blank')].map((b) => b.textContent).find((t) => /n8n workflows/.test(t)) || '',
      head: document.querySelector('.page.on h1') && document.querySelector('.page.on h1').textContent }));
    check('Templates has its Catalyst card (v137: one card per meeting stage)', top.card && top.h === 'Meeting stages' && top.k === 'Catalyst', JSON.stringify(top));
    check('it comes first, then the content templates under their own heading', JSON.stringify(top.order) === '["rd-head","v132Src","v132-ctpl","ap-fhead-acts"]' && top.ctpl === 'Content templates', JSON.stringify(top.order));
    check('the page says what it holds now', top.sub === 'The prep Catalyst writes for each meeting stage, and the structures Content Transformation drafts follow.', top.sub);   /* v137 */
    check('the fixed formats note names the client proposal and still covers the other Catalyst documents', /^The Catalyst documents .*Pipeline briefs/.test(top.fixed) && /The client proposal, the onboarding plan and the client review brief take the sections of your template/.test(top.fixed), top.fixed);
    check('the product header stays Templates', top.head === 'Templates', top.head);
    // every row that shows the reading state is noted as it appears (three small files can be read in well under
    // the 150 ms a single look waited, so that look sometimes came after the reading was done)
    await page.evaluate(() => {
      window.__v132Seen = {};
      const root = document.getElementById('rd-templates') || document.body;
      window.__v132Mo = new MutationObserver(() => root.querySelectorAll('#v132Src .v132-row').forEach((e) => {
        if (e.querySelector('.v132-busy')) { const n = (e.querySelector('.nm') || {}).textContent || ''; window.__v132Seen[n] = 1; }
      }));
      window.__v132Mo.observe(root, { childList: true, subtree: true, characterData: true });
    });
    /* v137: each file goes to its meeting stage's drop zone */
    await page.setInputFiles('#v137File_proposal', [path.join(FIX, DOCX[0])]);
    await page.setInputFiles('#v137File_consultation', [path.join(FIX, DOCX[1])]);
    await page.setInputFiles('#v137File_assessment', [path.join(FIX, DOCX[2])]);
    await page.waitForTimeout(150);
    const busy = await rows(page);
    check('the three files show at once', busy.length === 3, JSON.stringify(busy.map((r) => [r.name, r.busy])));
    await settledRows(page, 3);
    const seen = await page.evaluate(() => { if (window.__v132Mo) window.__v132Mo.disconnect(); return window.__v132Seen || {}; });
    check('each file shows while it is read', DOCX.every((f) => seen[f]), JSON.stringify(seen));
    const r = await rows(page);
    const by = (n) => r.find((x) => x.name === n) || {};
    const pt = by(DOCX[0]), dq = by(DOCX[1]), pa = by(DOCX[2]);
    check('each is kept as its stage\'s kind', pt.kind === 'proposal_template' && dq.kind === 'discovery_template' && pa.kind === 'past_assessment', JSON.stringify(r.map((x) => [x.name, x.kind])));
    check('the proposal template: 7 sections, by name and in order', /^✓ Structure detected: 7 sections/.test(pt.lines[0] || '') && JSON.stringify(pt.chips) === JSON.stringify(SECS), JSON.stringify([pt.lines[0], pt.chips]));
    check('the discovery call questions: 6 sections', /Structure detected: 6 sections/.test(dq.lines[0] || '') && dq.chips[0] === 'Before the call' && dq.chips[5] === 'Close with', JSON.stringify(dq.chips));
    check('the past assessment: 5 sections', /Structure detected: 5 sections/.test(pa.lines[0] || '') && JSON.stringify(pa.chips) === '["Summary","What we found","What it costs","Recommendations","Readiness"]', JSON.stringify(pa.chips));
    check('the brand: logo, colors and fonts, on each', r.every((x) => /^✓ Brand detected: logo, colors, fonts/.test(x.lines[1] || '')), JSON.stringify(r.map((x) => x.lines[1])));
    check('the colors are the brand\'s own (no greys)', JSON.stringify(pt.sw) === '["#0E5A63","#D9902F","#1E2A33"]', JSON.stringify(pt.sw));
    check('the fonts are named', pt.fonts === 'Montserrat · Source Serif 4', pt.fonts);
    check('the logo from the page header is shown', /guide-files\/sources\/\d+-logo\.png$/.test(pt.logo), pt.logo);
    check('each says what Catalyst does with it', /client proposal follows its sections, wording and branding/.test(pt.what) && /consultation guide asks questions the way it does/.test(dq.what) && /assessment follows its order and tone/.test(pa.what), JSON.stringify(r.map((x) => x.what)));
    check('each is the one in use', r.every((x) => x.inUse && !x.useBtn), JSON.stringify(r.map((x) => [x.inUse, x.useBtn])));
    check('a stage\'s files have no kind picker (the stage is the kind)', r.every((x) => x.opts.length === 0), JSON.stringify(r[0].opts));
    const saved = store.db.catalyst_sources || [];
    const sp = saved.find((x) => x.file_name === DOCX[0]) || {};
    check('three rows are saved, one per file', saved.length === 3 && writes(store, 'catalyst_sources', 'POST').length === 3, String(saved.length));
    check('with the sections, the brand and the text (headings kept as ## lines)', JSON.stringify((sp.sections || []).map((s) => s.title)) === JSON.stringify(SECS) && sp.brand && sp.brand.colors.primary === '#0E5A63' &&
      sp.brand.fonts.heading === 'Montserrat' && /^# Proposal and Scope of Work/.test(sp.file_text || '') && /\n## Executive summary\n/.test(sp.file_text || '') && /\n- \[Who else needs to be part of the decision\]/.test(sp.file_text || ''), JSON.stringify(sp).slice(0, 400));
    check('and who added it', sp.uploaded_by === H.USER.email && sp.active === true && sp.file_type === 'docx' && sp.file_size > 1000, JSON.stringify([sp.uploaded_by, sp.active, sp.file_type, sp.file_size]));
    const up = storage.filter((s) => s.method === 'POST');
    check('the files and their logos go to guide-files/sources', up.length === 6 && up.filter((s) => /\.docx$/.test(s.at)).length === 3 && up.filter((s) => /-logo\.png$/.test(s.at) && s.type === 'image/png').length === 3 &&
      up.every((s) => /^guide-files\/sources\/\d+-/.test(s.at)), JSON.stringify(up));
    check('the file and its logo are linked from the row', /^https:\/\/lesyptuwllcgajdxzjje\.supabase\.co\/storage\/v1\/object\/public\/guide-files\/sources\/\d+-Summit_proposal_template\.docx$/.test(sp.file_url || '') && /-logo\.png$/.test(sp.brand.logo_url || ''), sp.file_url + ' ' + sp.brand.logo_url);

    // a newer proposal template takes over; Use this one gives it back
    await page.setInputFiles('#v137File_proposal', [{ name: 'Summit proposal 2025.md', mimeType: 'text/markdown', buffer: Buffer.from('# Proposal\n\n## Summary\nWhat we propose.\n\n## Scope\nThe work, in phases.\n\n## Fee\nThe fee and terms.\n') }]);
    await settledRows(page, 4);
    let r2 = await rows(page);
    const md = r2.find((x) => x.name === 'Summit proposal 2025.md') || {}, old = r2.find((x) => x.name === DOCX[0]) || {};
    check('a markdown file reads its ## headings (the # line is its title)', /Structure detected: 3 sections/.test(md.lines[0] || '') && JSON.stringify(md.chips) === '["Summary","Scope","Fee"]', JSON.stringify(md));
    check('with no brand in it, it says so', /No logo, colors or fonts found/.test(md.lines[1] || ''), md.lines[1]);
    check('the newest proposal template is the one in use, the older offers Use this one', md.inUse && !old.inUse && old.useBtn, JSON.stringify([md.inUse, old.inUse, old.useBtn]));
    const w0 = store.writes.length;
    await page.locator('#v132Src .v132-row', { hasText: DOCX[0] }).locator('button', { hasText: 'Use this one' }).click();
    await page.waitForTimeout(800);
    r2 = await rows(page);
    const pw = store.writes.slice(w0).filter((w) => w.table === 'catalyst_sources' && w.method === 'PATCH');
    check('Use this one turns the newer one off and keeps the older', pw.length === 1 && pw[0].body.active === false && (store.db.catalyst_sources.find((x) => x.file_name === 'Summit proposal 2025.md') || {}).active === false &&
      (r2.find((x) => x.name === DOCX[0]) || {}).inUse && !(r2.find((x) => x.name === 'Summit proposal 2025.md') || {}).inUse, JSON.stringify(pw.map((w) => w.body)));
    // a file removed (its stored file too); v137: there is no kind to change, the stage it was dropped on is its kind
    await page.locator('#v132Src .v132-row', { hasText: 'Summit proposal 2025.md' }).locator('.v132-x').click();
    await page.waitForTimeout(800);
    r2 = await rows(page);
    check('removing a file deletes its row and its stored file', !r2.some((x) => x.name === 'Summit proposal 2025.md') && writes(store, 'catalyst_sources', 'DELETE').length === 1 &&
      storage.some((s) => s.method === 'DELETE' && /sources\/\d+-Summit_proposal_2025\.md$/.test(s.at)) && store.db.catalyst_sources.length === 3, JSON.stringify(storage.filter((s) => s.method === 'DELETE')));

    // files it cannot use say why, and nothing is kept
    const before = store.db.catalyst_sources.length, upBefore = storage.filter((s) => s.method === 'POST').length;
    await page.setInputFiles('#v137File_proposal', [
      { name: 'Old proposal.doc', mimeType: 'application/msword', buffer: Buffer.from('not a docx') },
      { name: 'Broken proposal.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('PK this is not really a zip file at all') },
      { name: 'Empty notes.txt', mimeType: 'text/plain', buffer: Buffer.from('   \n  ') },
      { name: 'Slides.pptx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') }]);
    await page.waitForFunction(() => document.querySelectorAll('#v132Src .v132-err').length === 4, null, { timeout: 15000 }).catch(() => {});
    const errs = (await rows(page)).filter((x) => x.err).map((x) => [x.name, x.err]);
    const e = (n) => (errs.find((x) => x[0] === n) || [])[1] || '';
    check('an old .doc file asks for a .docx', /Save it as a \.docx first/.test(e('Old proposal.doc')), JSON.stringify(errs));
    check('a damaged Word file says so', /looks damaged/.test(e('Broken proposal.docx')), e('Broken proposal.docx'));
    check('an empty file says no text could be read', /No text could be read/.test(e('Empty notes.txt')), e('Empty notes.txt'));
    check('another kind of file says what works', /Use a Word file \(\.docx\), a PDF or a text file/.test(e('Slides.pptx')), e('Slides.pptx'));
    check('none of them is uploaded or saved', store.db.catalyst_sources.length === before && storage.filter((s) => s.method === 'POST').length === upBefore, String(store.db.catalyst_sources.length));
    await page.locator('#v132Src .v132-row', { hasText: 'Slides.pptx' }).locator('.v132-x').click();
    check('an error can be dismissed', (await rows(page)).filter((x) => x.err).length === 3, '');

    // a PDF: its headings by size, its fonts by name, its colors from the drawn page
    await page.setInputFiles('#v137File_proposal', [path.join(FIX, 'Summit past proposal.pdf')]);
    await page.waitForFunction(() => { const r = [...document.querySelectorAll('#v132Src .v132-row')].find((e) => /Summit past proposal\.pdf/.test(e.textContent)); return r && !r.querySelector('.v132-busy'); }, null, { timeout: 30000 }).catch(() => {});
    const pdf = (await rows(page)).find((x) => x.name === 'Summit past proposal.pdf') || {};
    check('a PDF is read: the proposal kind, 7 sections by heading size', pdf.kind === 'proposal_template' && /Structure detected: 7 sections/.test(pdf.lines[0] || '') && JSON.stringify(pdf.chips) === JSON.stringify(SECS), JSON.stringify(pdf).slice(0, 400));
    check('its colors and fonts are found (no logo in a PDF)', /^✓ Brand detected: colors, fonts/.test(pdf.lines[1] || '') && pdf.sw.length >= 1 && pdf.fonts === 'Montserrat · Source Serif 4', JSON.stringify([pdf.lines[1], pdf.sw, pdf.fonts]));
    const sp2 = store.db.catalyst_sources.find((x) => x.file_name === 'Summit past proposal.pdf') || {};
    const hue = (h) => { const n = parseInt(String(h).slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return { r, g, b }; };
    const c1 = hue((sp2.brand && sp2.brand.colors.primary) || '#000000');
    check('the PDF\'s main color is its teal', c1.g > c1.r + 40 && c1.b > c1.r + 40, sp2.brand && sp2.brand.colors.primary);
    check('its text keeps the headings as ## lines', /^# Proposal and Scope of Work/m.test(sp2.file_text || '') && /\n## Scope of work\n/.test(sp2.file_text || ''), (sp2.file_text || '').slice(0, 200));
    await ctx.close();

    // after a reload the rows are read back from the table
    const again = await open(1440, store);
    const r3 = await rows(again.page);
    check('after a reload every kept file is listed again, with what was found', r3.length === 4 && r3.filter((x) => x.inUse).length === 3 && (r3.find((x) => x.name === DOCX[0]) || {}).chips.length === 7, JSON.stringify(r3.map((x) => [x.name, x.inUse])));
    await again.ctx.close();
  }

  // 2. Templates on a phone
  {
    const store = makeStore(tables((t) => { t.catalyst_sources = sourceRows(); }));
    const { ctx, page } = await open(390, store);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, drop: !!document.getElementById('v137Drop_proposal').getClientRects().length, n: document.querySelectorAll('#v132Src .v132-row').length }));
    check('on a phone the card fits and lists the files', w.sw <= w.iw + 1 && w.drop && w.n === 3, JSON.stringify(w));
    await ctx.close();
  }

  // 3. a lead with no proposal yet: the card offers to write one, and the run says what it is built from
  {
    const store = makeStore(tables((t) => { t.catalyst_sources = sourceRows(); }));
    const { ctx, page, sent } = await open(1440, store, '/dashboard/lead-pipeline');
    await lead(page, L1);
    let c = await card(page);
    check('the growth plan tab has the client proposal card', !!c && c.visible && c.title === 'Client proposal' && JSON.stringify(c.btns) === '["Write the client proposal"]', JSON.stringify(c));
    check('it says what it is written from, and in whose sections and branding', /from the call and the assessment, in the sections and branding of Summit proposal template\.docx\. It is written after the proposal presentation\./.test(c.sub), c.sub);
    check('it sits under the growth plan\'s own document, which keeps its buttons', await page.evaluate(() => {
      const s = [...document.querySelectorAll('#main section.block')].find((x) => /^\s*5\./.test(x.querySelector('h2').textContent));
      const kids = [...s.children]; const g = s.querySelector('.ap-docc'), p = s.querySelector('.v132-pc');
      return !!g && !!p && kids.indexOf(g) < kids.indexOf(p) && !p.classList.contains('ap-docc') && !!g.querySelector('.v125-btn');
    }), '');
    await page.locator('.v132-write').click();
    await page.waitForSelector('#v132M', { timeout: 10000 });
    await page.waitForTimeout(300);
    const m = await page.$eval('#v132M', (x) => ({ h: x.querySelector('h2').textContent, k: x.querySelector('.nw-kicker').textContent, t: (x.querySelector('.v132-uses .t') || {}).textContent,
      u: [...x.querySelectorAll('.v132-uses .u')].map((u) => [u.className.replace(/^u\s*/, ''), u.lastElementChild.textContent.trim()]) }));
    check('it asks before writing, for this lead', m.h === 'Write the client proposal for Pat QA?' && m.k === 'Catalyst · Pat QA', JSON.stringify(m));
    check('the run says what it uses: 3 past documents and the call transcript', m.t === 'Using 3 past documents and the call transcript', m.t);
    check('each past document by name, then the call, the assessment and the research', JSON.stringify(m.u.map((x) => x[1])) === JSON.stringify([
      'Proposal template: Summit proposal template.docx (7 sections, your branding)', 'Discovery call questions: Summit discovery call questions.docx', 'Past assessment: Summit past assessment.docx',
      'The call on Oct 22: QA Firm · discovery consultation (transcript)', 'The assessment of Oct 3', 'The prospect brief']), JSON.stringify(m.u));
    await page.click('#v132Go');
    await page.waitForTimeout(1500);
    const hk = sent.filter((s) => /catalyst-proposal$/.test(s.u));
    check('Write it sends the lead, the call and its transcript, signed in', hk.length === 1 && hk[0].body.leadEmail === L1 && hk[0].body.call && hk[0].body.call.id === CALL.id &&
      hk[0].body.call.transcript === 'Pat QA: Every pricing call still comes to me.\nQA Tester: How long does a site manager wait?' && hk[0].body.call.date === CALL.start && !!hk[0].body.auth, JSON.stringify(hk.map((x) => x.body)));
    c = await card(page);
    check('the card shows it is being written, with what it uses, and no second Write button', /Writing the client proposal…/.test(c.run) && /Using 3 past documents and the call transcript/.test(c.run) && /Nothing goes to the client: you review it first/.test(c.run) && !c.btns.length, JSON.stringify(c));
    // n8n saves the proposal; the card picks it up and opens it
    store.db.agent_outputs.push(proposalRow({ created_at: new Date().toISOString() }));
    await page.waitForSelector('.v132-pc .v132-doc', { timeout: 15000 }).catch(() => {});
    c = await card(page);
    check('when it is saved the card shows it, open', c.title === P.title && /^Written .* · from your proposal template, the call on Oct 22, the assessment$/.test(c.sub) && !!(await page.$('.v132-pc .v132-doc')) &&
      JSON.stringify(c.btns) === '["Hide ▴","Save as PDF","What should change?","Write it again"]', JSON.stringify(c));
    await ctx.close();
  }

  // 4. a lead before its assessment has no card; n8n refusing, and a transcript that cannot be read
  {
    const store = makeStore(tables((t) => { t.catalyst_sources = sourceRows(); }));
    const a = await open(1440, store, '/dashboard/lead-pipeline', { hook: { body: { ok: false, message: 'The proposal workflow is paused.' } } });
    await lead(a.page, L2, 0);
    check('a lead without an assessment has no client proposal card', !(await a.page.$('.v132-pc')), '');
    await lead(a.page, L1);
    await a.page.locator('.v132-write').click();
    await a.page.waitForSelector('#v132M', { timeout: 10000 });
    await a.page.click('#v132Go');
    await a.page.waitForTimeout(1500);
    const msg = await a.page.$eval('#v132Msg', (x) => ({ t: x.textContent, err: x.classList.contains('err') }));
    check('when n8n does not start it, the dialog says why and stays', /^Could not start it: The proposal workflow is paused\.$/.test(msg.t) && msg.err && !!(await a.page.$('#v132M')), JSON.stringify(msg));
    check('and the button works again', await a.page.$eval('#v132Go', (b) => !b.disabled), '');
    check('nothing shows as running', !/Writing/.test((await card(a.page)).run), '');
    await a.ctx.close();
    const b = await open(1440, store, '/dashboard/lead-pipeline', { tx: false });
    await lead(b.page, L1);
    await b.page.locator('.v132-write').click();
    await b.page.waitForSelector('#v132M', { timeout: 10000 });
    await b.page.click('#v132Go');
    await b.page.waitForTimeout(1500);
    const hk = b.sent.filter((s) => /catalyst-proposal$/.test(s.u));
    const c = await card(b.page);
    check('a transcript that cannot be read is not sent, and the run says it works from the documents', hk.length === 1 && hk[0].body.call && hk[0].body.call.transcript === '' &&
      /The call on Oct 22: its transcript could not be read, so the documents on file\./.test(c.run) && /^Writing the client proposal…\s*Using 3 past documents\n/.test(c.run), JSON.stringify([hk.map((x) => x.body.call), c.run]));
    await b.ctx.close();
    const n = await open(1440, makeStore(tables()), '/dashboard/lead-pipeline', { calls: false });
    await lead(n.page, L1);
    const nc = await card(n.page);
    check('with no proposal template yet, the card says to add one', /Add a past proposal in Templates and it follows its sections and branding\./.test(nc.sub), nc.sub);
    await n.page.locator('.v132-write').click();
    await n.page.waitForSelector('#v132M', { timeout: 10000 });
    const u = await n.page.$$eval('#v132M .v132-uses .u', (els) => els.map((e) => e.lastElementChild.textContent.trim()));
    check('and the run says it uses a standard layout and the documents on file', (await n.page.textContent('#v132M .v132-uses .t')) === 'Built from' &&
      u[0] === 'No proposal template yet, so a standard layout. Add one in Templates.' && u[1] === 'No recorded call with this lead, so the documents on file.', JSON.stringify(u));
    await n.ctx.close();
  }

  // 5. the proposal as the client sees it: cover, branding, every section and where it came from
  {
    const store = makeStore(tables((t) => { t.catalyst_sources = sourceRows(); t.agent_outputs.push(proposalRow()); }));
    const { ctx, page } = await open(1440, store, '/dashboard/lead-pipeline');
    await lead(page, L1);
    await page.locator('.v132-read').click();
    await page.waitForSelector('.v132-doc', { timeout: 5000 });
    const d = await page.evaluate(() => {
      const doc = document.querySelector('.v132-doc'), cs = (sel, p) => { const e = doc.querySelector(sel); return e ? getComputedStyle(e)[p] : ''; };
      return { logo: (doc.querySelector('.v132-cover .lg') || {}).src || '', kick: doc.querySelector('.kick').textContent, h1: doc.querySelector('.cv-t').textContent, sub: doc.querySelector('.cv-s').textContent,
        meta: [...doc.querySelector('.meta').children].map((x) => x.textContent).join(' '), foot: doc.querySelector('.v132-cover .foot').textContent,
        secs: [...doc.querySelectorAll('.v132-sec')].map((s) => [s.querySelector('.no').textContent, s.querySelector('.t').textContent, [...s.querySelectorAll('.src span')].map((x) => x.textContent)]),
        h2: cs('.v132-sec h2', 'color'), h2f: cs('.v132-sec h2', 'fontFamily'), body: cs('.v132-sec .bd p', 'fontFamily'), kc: cs('.kick', 'color'),
        fills: [...doc.querySelectorAll('.v132-fill')].map((f) => f.textContent), bold: [...doc.querySelectorAll('.v132-sec[data-i="2"] strong')].map((b) => b.textContent),
        lis: doc.querySelectorAll('.v132-sec[data-i="4"] li').length, pfoot: doc.querySelector('.v132-pfoot').innerText.replace(/\s+/g, ' '),
        fonts: [...document.querySelectorAll('link[id^="v132f-"]')].map((l) => l.id), sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    check('the cover has the firm\'s logo, the kind of document, the title and the subtitle', d.logo === LOGO_URL && d.kick === 'Proposal and Scope of Work' && d.h1 === P.doc_title && d.sub === P.subtitle, JSON.stringify([d.logo, d.kick, d.h1, d.sub]));
    check('who it is for, from whom and when, and a confidential line', d.meta === 'Prepared for Marcus Hale, COO, Corbell Logistics Prepared by Summit Business Advisors Date October 28, 2026' && d.foot === 'Confidential. Prepared for Corbell Logistics.', d.meta + ' | ' + d.foot);
    check('every section of the template, numbered, in its order', JSON.stringify(d.secs.map((s) => s[0] + ' ' + s[1])) === JSON.stringify(SECS.map((t, i) => '0' + (i + 1) + ' ' + t)), JSON.stringify(d.secs));
    check('each section says where it came from', JSON.stringify(d.secs[0][2]) === '["Structure from your template","From the call on Oct 22","From the assessment"]' &&
      JSON.stringify(d.secs[1][2]) === '["From the prospect brief","From the assessment","Written like your past assessment"]' && JSON.stringify(d.secs[2][2]) === '["From the call on Oct 22","Sorted by your discovery call questions"]', JSON.stringify(d.secs.map((s) => s[2])));
    check('the headings are in the brand\'s color and heading font, the text in its body font', d.h2 === 'rgb(14, 90, 99)' && /^"?Montserrat/.test(d.h2f) && /^"?Source Serif 4/.test(d.body) && d.kc === 'rgb(217, 144, 47)', JSON.stringify([d.h2, d.h2f, d.body, d.kc]));
    check('the brand\'s fonts are asked for (Google Fonts)', JSON.stringify(d.fonts) === '["v132f-montserrat","v132f-source-serif-4"]', JSON.stringify(d.fonts));
    check('what still needs filling in stands out', d.fills.length === 4 && d.fills[1] === '[FILL IN: fee]', JSON.stringify(d.fills));
    check('lists and bold labels are kept', d.lis === 4 && JSON.stringify(d.bold) === '["How decisions get made.","What it costs today.","What good looks like.","Who needs to be in the room."]', JSON.stringify([d.lis, d.bold]));
    check('each page ends with the firm and the document', d.pfoot === 'Summit Business Advisors Proposal and Scope of Work · Corbell Logistics', d.pfoot);
    // a line break inside a paragraph is kept on screen and through an edit (the agent writes Fee, Payment and Start on lines of their own)
    const br = await page.evaluate(() => { const md = 'The engagement runs 12 weeks.\n\n**Fee:** [FILL IN: fee]\n**Start:** [TO CONFIRM: start date]';
      const el = document.createElement('div'); el.innerHTML = v132Md(md); return { html: el.innerHTML, back: v132ToMd(el), same: v132ToMd(el) === md }; });
    check('a line break inside a paragraph is kept on screen and when it is saved again', /<p><strong>Fee:<\/strong> <span class="v132-fill">\[FILL IN: fee\]<\/span><br><strong>Start:<\/strong>/.test(br.html) && br.same, JSON.stringify(br));
    check('it fits the page', d.sw <= d.iw + 1, String(d.sw));
    // reading to the end: the toolbar stays under the top bar, with Edit and Save as PDF
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.v132-pfoot').getBoundingClientRect().top + scrollY - 300));
    await page.waitForTimeout(300);
    const bar = await page.$eval('.v132-dbar', (b) => ({ top: Math.round(b.getBoundingClientRect().top), btns: [...b.querySelectorAll('button')].map((x) => x.textContent), z: getComputedStyle(b).position }));
    check('at the end of the document the toolbar is still on screen, with Edit and Save as PDF', bar.z === 'sticky' && bar.top >= 60 && bar.top <= 80 && JSON.stringify(bar.btns) === '["✎ Edit","Save as PDF"]', JSON.stringify(bar));
    await page.evaluate(() => window.scrollTo(0, 0));
    const cov = await page.$eval('.v132-cover', (e) => e.getBoundingClientRect().height);
    check('the cover fits on the screen', cov <= 900 - 100 && cov >= 600, String(cov));

    // edit in place
    await page.locator('.v132-edit').click();
    const ed = await page.evaluate(() => ({ n: document.querySelectorAll('.v132-doc [contenteditable="true"]').length, edit: document.querySelector('.v132-doc').classList.contains('edit'),
      bar: [...document.querySelectorAll('.v132-dbar button')].map((b) => b.textContent) }));
    check('Edit makes the title, the subtitle and every heading and section editable', ed.n === 2 + SECS.length * 2 && ed.edit && JSON.stringify(ed.bar) === '["Save changes","Cancel"]', JSON.stringify(ed));
    await page.locator('.v132-dbar .pri').click();
    await page.waitForTimeout(500);
    check('saving with nothing changed saves nothing', writes(store, 'agent_outputs', 'PATCH').length === 0 && !(await page.$('.v132-doc.edit')), '');
    await page.locator('.v132-edit').click();
    await page.evaluate(() => {
      document.querySelector('.cv-t').textContent = 'Decisions that keep up with every site';
      const p = document.querySelector('.v132-sec[data-i="6"] .bd p'); p.textContent = p.textContent + ' We can start the week of November 16.';
      document.querySelector('.v132-sec[data-i="5"] .t').textContent = 'Timeline and fees';
    });
    await page.locator('.v132-dbar .pri').click();
    await page.waitForTimeout(1000);
    const pw = writes(store, 'agent_outputs', 'PATCH');
    const b = pw.length ? pw[0].body : {}, nd = (b.data || {}).doc || {};
    check('Save changes saves the edited document once', pw.length === 1 && /^id=eq\./.test(pw[0].filters.map((f) => f.join('=')).join('&')), JSON.stringify(pw.map((w) => w.filters)));
    check('with the new title, the new heading and the added sentence, the rest as it was', nd.title === 'Decisions that keep up with every site' && nd.sections[5].title === 'Timeline and fees' &&
      /Nina\. We can start the week of November 16\.$/.test(nd.sections[6].body) && nd.sections[0].body === P.sections[0].body && nd.sections[4].body === P.sections[4].body, JSON.stringify(nd).slice(0, 300));
    check('lists, bold and placeholders survive the round trip', nd.sections[2].body === P.sections[2].body && nd.sections[5].body === P.sections[5].body, JSON.stringify([nd.sections[2].body, nd.sections[5].body]));
    check('it records who edited it, keeps the first version, and the text follows', b.edited_by_human === true && b.data.edited.by === H.USER.email && b.snapshot && b.snapshot.doc.title === P.doc_title &&
      /^# Decisions that keep up with every site\n/.test(b.content_md) && /\n## Timeline and fees\n/.test(b.content_md) && b.data.brand.logo_url === LOGO_URL, JSON.stringify([b.edited_by_human, b.data && b.data.edited, !!b.snapshot]).slice(0, 300));
    const after = await page.evaluate(() => ({ h1: document.querySelector('.cv-t').textContent, note: document.querySelector('.v132-dbar .note').textContent, sub: document.querySelector('.v132-pc .ap-doc-t small').textContent }));
    check('the document shows the change and says who edited it', after.h1 === 'Decisions that keep up with every site' && /^Edited .* by qa\. Save as PDF prints this version\.$/.test(after.note) && / · edited /.test(after.sub), JSON.stringify(after));
    // Cancel leaves it as it was
    await page.locator('.v132-edit').click();
    await page.evaluate(() => { document.querySelector('.cv-t').textContent = 'Not kept'; });
    await page.locator('.v132-dbar button', { hasText: 'Cancel' }).click();
    await page.waitForTimeout(300);
    check('Cancel puts it back and saves nothing', (await page.textContent('.cv-t')) === 'Decisions that keep up with every site' && writes(store, 'agent_outputs', 'PATCH').length === 1, await page.textContent('.cv-t'));

    // Save as PDF: the document alone, in a window that prints it
    await page.evaluate(() => { V132.printer = function (w) { window.__printed = (window.__printed || 0) + 1; window.__printedTitle = w.document.title; }; });
    const [pop] = await Promise.all([ctx.waitForEvent('page'), page.locator('.v132-pc .statline .v132-pdf').click()]);
    await pop.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(1500);
    await page.waitForTimeout(3000);
    const pd = await pop.evaluate(() => ({ title: document.title, h1: (document.querySelector('.cv-t') || {}).textContent, n: document.querySelectorAll('.v132-sec').length,
      bar: !!document.querySelector('.v132-dbar'), scripts: document.querySelectorAll('script').length, css: !!document.querySelector('style') && /\.v132-cover/.test(document.querySelector('style').textContent),
      fonts: [...document.querySelectorAll('link[rel="stylesheet"]')].length }));
    check('Save as PDF opens the document alone, with its styles and fonts and no script', pd.title === 'Proposal and Scope of Work · Corbell Logistics' && pd.h1 === 'Decisions that keep up with every site' && pd.n === 7 && !pd.bar && !pd.scripts && pd.css && pd.fonts === 4, JSON.stringify(pd));
    check('and prints it, once', (await page.evaluate(() => window.__printed)) === 1 && (await page.evaluate(() => window.__printedTitle)) === 'Proposal and Scope of Work · Corbell Logistics', String(await page.evaluate(() => window.__printed)));
    await pop.close();

    // What should change? on the proposal, into AI settings
    await page.locator('.v132-ask').click();
    await page.waitForSelector('#v132C', { timeout: 5000 });
    check('What should change? asks about the client proposal', (await page.textContent('#v132C h2')) === 'What should change in the client proposal?' && (await page.evaluate(() => document.activeElement.id)) === 'v132Ta', await page.textContent('#v132C h2'));
    await page.fill('#v132Ta', 'too short');
    await page.click('#v132CGo');
    await page.waitForTimeout(300);
    check('a few words are not saved', writes(store, 'agent_feedback', 'POST').length === 0 && /Write a sentence or two/.test(await page.textContent('#v132CMsg')), await page.textContent('#v132CMsg'));
    await page.fill('#v132Ta', REASON);
    await page.click('#v132CGo');
    await page.waitForTimeout(1500);
    const fp = writes(store, 'agent_feedback', 'POST');
    check('the reason is saved with the client proposal and the lead', fp.length === 1 && fp[0].body.agent === 'client_proposal' && fp[0].body.target_type === 'e1_document' &&
      fp[0].body.target_id === L1 + ':client_proposal' && fp[0].body.action === 'changes' && fp[0].body.feedback === REASON, JSON.stringify(fp.map((x) => x.body)));
    const c = await card(page);
    check('the card counts it', c.btns.indexOf('1 change asked') >= 0, JSON.stringify(c.btns));
    await page.locator('.v132-pc .v132-n').click();
    await page.waitForSelector('#apFbList', { timeout: 10000 });
    await page.waitForTimeout(800);
    const fb = (await page.$$eval('#apFbList .ap-fb', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))).find((t) => t.indexOf(REASON) >= 0) || '';
    check('AI settings lists it as asked for changes on the Client Proposal', /Client Proposal · asked for changes · qa/.test(fb), fb);
    await page.locator('#apFbList .ap-fb', { hasText: REASON }).locator('button', { hasText: 'Make it a rule' }).click();
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => [...document.querySelectorAll('.ap-rule-opts input')].filter((i) => i.checked).map((i) => i.value));
    check('Make it a rule scopes it to the Catalyst agents', JSON.stringify(box) === '["engine1"]', JSON.stringify(box));
    const where = await page.$$eval('.ap-ais .ap-where > div', (els) => els.map((el) => [(el.querySelector('b') || {}).textContent || '', (el.querySelector('small') || {}).textContent || '', ((el.querySelector('.d') || {}).className || '').replace(/\bd\b/, '').trim()]));
    const ci = where.findIndex((w) => /^Catalyst agents/.test(w[0]));
    check('Where these apply: the Catalyst agents also follow your past documents', ci >= 0 && where[ci][1] === 'Rules, on every run. Each meeting stage also follows its template from Templates and reads what its setup there says: the call transcripts, the CRM record, your discovery call questions' && where[ci][2] === 'live', JSON.stringify(where[ci]));   /* v137 */
    check('and the client proposal has its own line, right after', JSON.stringify(where[ci + 1]) === JSON.stringify(['Client proposal', 'Rules, your past documents from Templates, the call transcript and the lead\'s documents', 'live']), JSON.stringify(where[ci + 1]));
    await ctx.close();
  }

  // 6. the board's run question names the past document its stage follows (v136: only that stage runs)
  {
    const store = makeStore(tables((t) => { t.catalyst_sources = sourceRows(); }));
    const { ctx, page } = await open(1440, store, '/dashboard/lead-pipeline');
    const ask = async (k) => {
      await page.evaluate((a) => v136Ask(a[0], a[1]), [L1, k]);
      await page.waitForSelector('#v120M', { timeout: 10000 });
      await page.waitForTimeout(500);
      const u = await page.$$eval('#v120M .v132-uses .u', (els) => els.map((e) => e.lastElementChild.textContent.trim()));
      const t = await page.$eval('#v120M .v132-uses .t', (e) => e.textContent).catch(() => '');
      await page.evaluate(() => nwModalClose());
      return { t, u };
    };
    const k1 = await ask('consultation'), k2 = await ask('assessment'), k4 = await ask('proposal');
    /* v137: the question lists everything the stage reads, its own template first */
    const tpl = (k) => k.u.filter((x) => /^Template: /.test(x));
    check('the consultation guide: the discovery call questions, as its template', k1.t === 'Reads' && JSON.stringify(tpl(k1)) === '["Template: Summit discovery call questions.docx"]' && k1.u[0] === tpl(k1)[0], JSON.stringify(k1));
    check('the assessment: only the past assessment', JSON.stringify(tpl(k2)) === '["Template: Summit past assessment.docx"]' && !k2.u.some((x) => /discovery call questions:/i.test(x)), JSON.stringify(k2));
    check('the proposal: only the proposal template', JSON.stringify(tpl(k4)) === '["Template: Summit proposal template.docx"]', JSON.stringify(k4));
    await ctx.close();
    const none = await open(1440, makeStore(tables()), '/dashboard/lead-pipeline');
    await none.page.evaluate((e) => v136Ask(e, 'consultation'), L1);
    await none.page.waitForSelector('#v120M', { timeout: 10000 });
    await none.page.waitForTimeout(500);
    const first = await none.page.$eval('#v120M .v137-reads .u', (e) => e.lastElementChild.textContent.trim()).catch(() => '');
    check('with no past documents the question says there is no template yet', first === 'No template for this stage yet, so the usual sections. Add one on Templates.', first);   /* v137 */
    await none.ctx.close();
  }

  // 7. Deliverables lists the proposal, and Open shows it on its lead
  {
    const store = makeStore(tables((t) => { t.catalyst_sources = sourceRows(); t.agent_outputs.push(proposalRow()); }));
    const { ctx, page } = await open(1440, store, '/dashboard/deliverables');
    await page.waitForTimeout(1500);
    const rowsDl = await page.evaluate(() => ((typeof V115 !== "undefined" && V115.dl && V115.dl.rows) || []).filter((r) => /client_proposal$/.test(r.key)).map((r) => [r.title, r.kind, r.who, r.open]));
    check('Deliverables has the client proposal, under Catalyst, for its lead', rowsDl.length === 1 && rowsDl[0][0] === 'Client proposal' && rowsDl[0][1] === 'Catalyst · Proposal for the client' && rowsDl[0][2] === 'Pat QA', JSON.stringify(rowsDl));
    const shown = await page.evaluate(() => /Client proposal/.test(document.getElementById('main').innerText));
    check('and shows it', shown, '');
    await page.evaluate((o) => eval(o), rowsDl[0] ? rowsDl[0][3] : '');
    await page.waitForSelector('.v132-pc .v132-doc', { timeout: 15000 }).catch(() => {});
    const at = await page.evaluate(() => ({ path: location.pathname, doc: !!document.querySelector('.v132-pc .v132-doc'), vis: !!(document.querySelector('.v132-pc') || { getClientRects: () => [] }).getClientRects().length }));
    check('Open goes to the lead\'s growth plan tab with the proposal open', at.path === '/dashboard/lead-pipeline' && at.doc && at.vis, JSON.stringify(at));
    await ctx.close();
  }

  // 8. what n8n writes is shown as text, never run: markup in a section, a logo that is not https, a bad font name
  {
    const bad = proposalRow();
    bad.data = JSON.parse(JSON.stringify(bad.data));
    bad.data.doc.sections[0].body = 'Hello <img src=x onerror="window.__xss=1"> and <script>window.__xss=2</script> **bold** [link](javascript:alert(1))';
    bad.data.doc.title = '<b>Title</b>';
    bad.data.brand = { colors: { primary: 'red;background:url(x)', accent: '#D9902F' }, fonts: { heading: 'Evil"); } body{display:none} .x{font-family:("', body: 'Source Serif 4' }, logo_url: 'javascript:alert(1)', found: [] };
    const store = makeStore(tables((t) => { t.catalyst_sources = sourceRows(); t.agent_outputs.push(bad); }));
    const { ctx, page } = await open(1440, store, '/dashboard/lead-pipeline');
    await lead(page, L1);
    await page.locator('.v132-read').click();
    await page.waitForSelector('.v132-doc', { timeout: 5000 });
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ xss: window.__xss || 0, imgs: [...document.querySelectorAll('.v132-doc img')].map((i) => i.getAttribute('src')), scripts: document.querySelectorAll('.v132-doc script').length,
      h1: document.querySelector('.cv-t').textContent, text: document.querySelector('.v132-sec .bd').textContent, style: document.querySelector('.v132-doc').getAttribute('style'),
      links: document.querySelectorAll('.v132-doc a').length, firm: (document.querySelector('.v132-cover .firm') || {}).textContent || '' }));
    check('markup in the text is shown as text and never runs', s.xss === 0 && s.scripts === 0 && s.links === 0 && /Hello <img src=x onerror=/.test(s.text) && s.h1 === '<b>Title</b>', JSON.stringify(s));
    check('a logo that is not an https address is not shown (the firm\'s name instead)', s.imgs.length === 0 && s.firm === 'Summit Business Advisors', JSON.stringify(s.imgs));
    check('a color that is not a color, or a font name with code in it, does not reach the styles', !/url\(|red;|display:none|\{/.test(s.style) && /--b1:#1C2647/.test(s.style), s.style);
    await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
