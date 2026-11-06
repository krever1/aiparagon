// QA regression suite for E-&-G-Home-Inc.html (#2, the care portal), v12.41.1, before the E & G Home pilot: forms and
// documents (Documents, Templates, the built-in templates, Create new template with every kind of field, Upload a
// form, filling in, a drawn signature, Sign and finalize, read-only, Copy as a new draft, printing, New from template),
// and communication (Messages, the bell, Ask Spectrum, the Change log, the Directory, search, Help and support), plus
// what leaves the portal. Part 1 runs in the demo view (sample data, nothing saved). Part 2 is a made-up signed-in
// team against the stand-in for the whole Supabase project (lib/portal-backend.js): a director and a staff member in
// their own browsers, every change read back after a reload.
// The checks for the Nov 5 pre-pilot QA findings (fixed in v12.42) fail on v12.41.1.
// Usage: node tests/portal-qa-docs.test.js [baseline.html]
const path = require('path');
const H = require('./lib/portal-harness');
const { makeBackend } = require('./lib/portal-backend');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + String(detail).slice(0, 400) : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + String(detail).slice(0, 400) + ']'));
}
const ERRS = [];
async function section(name, fn) {
  const n0 = ERRS.length;
  try { await fn(); } catch (e) { check(name + ' ran to the end', false, e.message.split('\n')[0]); }
  if (ERRS.length > n0) console.log('  (page errors during ' + name + ': ' + ERRS.slice(n0).join(' | ') + ')');
}
const today = new Date().toISOString().slice(0, 10);
const PDF = (t) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n% ${t}\ntrailer<</Root 1 0 R>>\n%%EOF`);
const NOPRINT = () => {                                                  // window.print and window.open are recorded, never run
  window.print = () => { window.__printedCount = (window.__printedCount || 0) + 1; };
  window.__opened = [];
  window.open = (u) => { window.__opened.push(String(u || '')); return { closed: false, document: { title: '', write() {}, close() {}, body: {} }, location: { replace: (x) => window.__opened.push(String(x)) }, close() {}, focus() {}, opener: null }; };
};
const flat = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// the made-up signed-in team
const ORG = 'org_birchqa';
const DIR = { email: 'dana@birch.test', pw: 'birch-pass-1', name: 'Dana Moss' };
const STF = { email: 'sam@birch.test', pw: 'sam-pass-123', name: 'Sam Rivera', sid: 'st-sam' };
const CLIENTS = [{ id: 'cl-1', uci: '7310452', name: 'Maria Gonzalez', init: 'MG', home: 'Elm House', dx: 'Supported living' },
  { id: 'cl-2', uci: '8840217', name: 'Client T.K.', init: 'T.K.', home: 'Elm House', dx: 'Supported living' },
  { id: 'cl-3', uci: '6123498', name: 'Client R.P.', init: 'R.P.', home: 'Oak House', dx: 'Day program' }];
// what must never leave the portal: every client's name, initials and UCI, any 7-digit number, a phone number
const SECRET = [/Maria/, /Gonzalez/, /\bMG\b/, /T\.K\./, /R\.P\./, /(?<!\d)\d{7}(?!\d)/, /555-?201-?7788/];

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = ERRS;

  // =============================== PART 1: the demo view ===============================
  const demoCtx = await H.newPage(env, { viewport: { width: 1440, height: 1000 }, bucket: errors });
  const p = demoCtx.page;
  await demoCtx.ctx.addInitScript(NOPRINT);
  p.on('dialog', (d) => d.accept());
  await p.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 20000 });
  await p.waitForTimeout(400);
  const printed = (pg) => pg.evaluate(() => (el('printArea') || {}).innerHTML || '');
  const menu = async (pg, row, item) => {                               // a row's ⋯ menu, then one of its items, by real clicks
    await row.locator('.rm-dot').first().click(); await pg.waitForTimeout(120);
    const it = pg.locator('#rmPop button', { hasText: item }).first();
    if (!(await it.count())) { const has = await pg.evaluate(() => [...document.querySelectorAll('#rmPop button')].map((b) => b.innerText.replace(/\s+/g, ' '))); await pg.evaluate(() => rmClose()); throw new Error('no "' + item + '" in the menu: ' + has.join(', ')); }
    await it.click(); await pg.waitForTimeout(300);
  };
  const goView = async (pg, v) => { await pg.evaluate((v) => { closeAll(); go(v); }, v); await pg.waitForTimeout(300); };

  // ---------------- 1. Templates: the built-in templates ----------------
  await section('built-in templates', async () => {
    await goView(p, 'forms');
    const secs = await p.evaluate(() => [...document.querySelectorAll('#view section.card .sec-head h2')].map((h) => h.textContent));
    check('Templates groups the blank forms as Agency, Medical and Daily Logs binder templates and Other templates', ['Agency binder templates', 'Medical binder templates', 'Daily Logs binder templates', 'Other templates'].every((s) => secs.includes(s)), secs.join(' | '));
    const row = p.locator('#view .tpl-line', { hasText: 'Face sheet' }).first();
    await row.locator('.rm-dot').click(); await p.waitForTimeout(120);
    const items = await p.evaluate(() => [...document.querySelectorAll('#rmPop button')].map((b) => b.innerText.replace(/^\W+/, '').trim()));
    check('a template row’s ⋯ has Fill it in, Open the template, Rename, Assign to staff, Print blank, Delete template (guide)', ['Fill it in', 'Open the template', 'Rename', 'Assign to staff', 'Print blank', 'Delete template'].every((x) => items.some((i) => i.includes(x))), items.join(', '));
    await p.locator('#rmPop button', { hasText: 'Fill it in' }).click(); await p.waitForTimeout(400);
    check('Fill it in opens “Fill in — Face sheet” with Save draft and Sign and finalize', await p.evaluate(() => el('mdTitle').innerText === 'Fill in — Face sheet' && /Save draft/.test(el('mdFoot').innerText) && /Sign and finalize/.test(el('mdFoot').innerText)));
    // every built-in template: a box for each field, and its answers on the printed copy
    const all = await p.evaluate(() => TEMPLATES5.map((t) => {
      closeAll(); tplOpenDoc(t.id);
      const d = docById('tpl-' + t.id); const miss = [];
      d.fields.forEach((fd, i) => {
        if (['signature', 'head', 'h1', 'para', 'divider'].includes(fd.ty)) return;
        if (fd.ty === 'table') { const c = el('dgtb' + i) && el('dgtb' + i).querySelector('input'); if (c) c.value = 'Cell ' + i; else miss.push(fd.l); return; }
        if (fd.ty === 'checklist') { if (!el('dgw' + i)) miss.push(fd.l); return; }
        const n = el('dg' + i); if (!n) { miss.push(fd.l); return; }
        if (n.type === 'hidden') n.value = 'Yes'; else if (n.type === 'date') n.value = '2026-11-01'; else if (n.type === 'time') n.value = '09:30'; else n.value = 'Answer ' + i;
      });
      const html = docFilledFromForm('tpl-' + t.id);
      return { id: t.id, name: t.name, open: el('modal').classList.contains('on'), miss, printed: /Answer \d|Cell \d|Yes/.test(html) };
    }));
    const bad = all.filter((x) => !x.open || x.miss.length || !x.printed);
    check(`all ${all.length} built-in templates open to fill in, with a box for every field, and print filled with the answers`, all.length >= 37 && !bad.length, JSON.stringify(bad));
    // Save draft from Templates: where does the copy go?
    await p.evaluate(() => { closeAll(); tplOpenDoc('tp20'); docSave('tpl-tp20', true); });
    const pk = await p.evaluate(() => ({ t: el('mdTitle').innerText, b: el('fpBinder').value, sb: el('fpSub').value }));
    check('Save draft asks where it belongs, starting in the template’s binder (Agency)', pk.t === 'Save this draft where it belongs' && pk.b === 'Agency', JSON.stringify(pk));
    check('Templates > Fill it in > Save draft starts in the template’s own tab (Face sheet → Face Sheet), so built-in templates file under a tab as the guide says', pk.sb === 'Face Sheet', JSON.stringify(pk));
    await p.evaluate(() => closeAll());
    const stray = await p.evaluate(() => TEMPLATES5.filter((t) => t.sub && !subsOf(normBinder(t.dest || 'Agency').b).includes(t.sub)).map((t) => `${t.name}: "${t.sub}" (${FOLDER_NAMES[normBinder(t.dest || 'Agency').b]})`));
    check('each built-in template’s tab is one of its binder’s tabs (else New from template makes a second tab beside the real one, e.g. Lab Work beside Lab Works)', !stray.length, stray.join('; '));
    // Print blank: the printable copy for wet signatures
    await goView(p, 'forms');
    await p.evaluate(() => { window.__printedCount = 0; });
    await menu(p, p.locator('#view .tpl-line', { hasText: 'Special incident report' }).first(), 'Print blank');
    const pb = flat(await printed(p));
    check('Print blank builds the blank form with every label, a line for each signature and its date, and prints it', /Special incident report/.test(pb) && /Description of incident/.test(pb) && /Reporting staff Date Administrator Date/.test(pb) && await p.evaluate(() => window.__printedCount === 1), pb.slice(-260));
  });

  // ---------------- 2. Documents: tabs, export, sign, move, delete ----------------
  await section('documents', async () => {
    await goView(p, 'templates');
    await p.locator('#view .page-h button', { hasText: 'Upload document' }).click(); await p.waitForTimeout(200);
    const secOpts = await p.evaluate(() => [...el('libSec').options].map((o) => o.textContent));
    check('Upload document: the Subfolder choice offers Blank forms (the Templates page), Resources & guidelines and the binder’s tabs (guide)', secOpts[0] === 'Blank forms (the Templates page)' && secOpts[1] === 'Resources & guidelines' && secOpts.length > 3, secOpts.join(' | '));
    await p.setInputFiles('#libFile', { name: 'cbc.pdf', mimeType: 'application/pdf', buffer: PDF('cbc') });
    check('choosing the file fills in the title', await p.evaluate(() => el('libTitle').value) === 'cbc');
    await p.selectOption('#libKey', 'Medical'); await p.waitForTimeout(100); await p.selectOption('#libSec', 'tab:Lab Works');
    check('...and it says a tab means a filed document', /A filed document: it goes in the Lab Works subfolder of Medical binder/.test(await p.evaluate(() => el('libWhere').textContent)));
    await p.locator('#libGo').click(); await p.waitForTimeout(700);
    const tabRow = (n) => p.locator('#view .tab-row', { hasText: n }).first();
    check('it is filed in Medical binder / Lab Works, opened on the page', (await p.evaluate(() => el('toastTxt').textContent)) === 'Uploaded and filed in Medical binder / Lab Works.' && /1 document/.test(await tabRow('Lab Works').innerText()));
    await menu(p, tabRow('Lab Works'), 'Export this tab');
    check('Export this tab prints the tab’s documents', /Medical binder \/ Lab Works 1 document.*cbc\.pdf/.test(flat(await printed(p))));
    await menu(p, tabRow('Lab Works'), 'Rename tab');
    await p.locator('.rn-inp').fill('Labs'); await p.locator('.rn-inp').press('Enter'); await p.waitForTimeout(300);
    check('Rename tab keeps its documents under the new name', /1 document/.test(await tabRow('Labs').innerText()) && !(await p.locator('#view .tab-row', { hasText: 'Lab Works' }).count()));
    if (!(await p.locator('#view .comp-line', { hasText: 'cbc' }).count())) { await tabRow('Labs').click(); await p.waitForTimeout(200); }
    const doc = () => p.locator('#view .comp-line', { hasText: 'cbc' }).first();
    await doc().locator('.rm-dot').click(); await p.waitForTimeout(120);
    const dm = await p.evaluate(() => [...document.querySelectorAll('#rmPop button')].map((b) => b.innerText.replace(/^\W+/, '').trim()));
    await p.evaluate(() => rmClose());
    check('a filed document’s ⋯ has Open, Rename, Move to another binder or tab, Export, Delete (guide)', ['Open', 'Rename', 'Move to another binder or tab', 'Export', 'Delete'].every((x) => dm.includes(x)), dm.join(', '));
    // Sign: a refused attempt, then a real one
    await doc().locator('button', { hasText: 'Sign' }).click(); await p.waitForTimeout(200);
    const act0 = await p.evaluate(() => JSON.stringify(DOC_ACT[0] || null));
    await p.locator('#modal button', { hasText: 'Sign document' }).click(); await p.waitForTimeout(200);
    const refused = await p.evaluate(() => ({ toast: el('toastTxt').textContent, open: el('modal').classList.contains('on') }));
    check('Sign with no name typed is refused and the window stays open', refused.toast === 'Type your full name to sign.' && refused.open, JSON.stringify(refused));
    const act1 = await p.evaluate(() => DOC_ACT.slice(0, 2).map((a) => a.k + ':' + a.n));
    check('a refused signature is not recorded as “signed” in Recent activity (and in the database’s activity log)', (await p.evaluate(() => JSON.stringify(DOC_ACT[0] || null))) === act0, JSON.stringify(act1));
    await p.fill('#sgName', 'Rosa Castillo'); await p.locator('#modal button', { hasText: 'Sign document' }).click(); await p.waitForTimeout(300);
    check('Sign with a name: the row shows ✓ Signed with who and when, and no Sign button', /✓ Signed — Rosa Castillo/.test(await doc().innerText()) && !(await doc().locator('button', { hasText: 'Sign' }).count()));
    await menu(p, doc(), 'Move to another binder or tab');
    const mv = await p.evaluate(() => ({ t: el('mdTitle').innerText, b: el('fpBinder').value, sb: el('fpSub').value }));
    check('Move starts at where it is now (Medical binder, Labs)', mv.t === 'Move document' && mv.b === 'Medical' && mv.sb === 'Labs', JSON.stringify(mv));
    await p.selectOption('#fpBinder', 'Daily'); await p.waitForTimeout(150); await p.selectOption('#fpSub', 'Vital Signs');
    await p.locator('#modal button', { hasText: 'Save to binder' }).click(); await p.waitForTimeout(300);
    const moved = await p.evaluate(() => ({ med: (COMPLETED.Medical || []).some((x) => x.n === 'cbc.pdf'), daily: (COMPLETED.Daily || []).find((x) => x.n === 'cbc.pdf'), sig: sigFor('cbc.pdf', 'Daily') }));
    check('...and it moves to Daily Logs / Vital Signs with its signature', !moved.med && moved.daily && moved.daily.sb === 'Vital Signs' && moved.sig && moved.sig.by === 'Rosa Castillo', JSON.stringify(moved));
    await p.evaluate(() => { state.openBinder = 'Daily'; state.openSubs = (state.openSubs || []).concat([subKey('Daily', 'Vital Signs')]); render(); }); await p.waitForTimeout(200);
    await menu(p, doc(), 'Export');
    check('Export prints a cover sheet with where it is filed and who signed', /cbc\.pdf Daily Logs binder \/ Vital Signs .* Signed by Rosa Castillo/.test(flat(await printed(p))), flat(await printed(p)).slice(0, 200));
    await menu(p, doc(), 'Delete');
    await p.evaluate(() => { const b = [...document.querySelectorAll('#mdFoot button')].reverse().find((x) => /delete|remove/i.test(x.textContent)); if (b) b.click(); }); await p.waitForTimeout(300);
    check('Delete takes it out of the binder', !(await p.evaluate(() => (COMPLETED.Daily || []).some((x) => x.n === 'cbc.pdf'))));
    const ra = await p.evaluate(() => DOC_ACT.map((a) => a.k + ':' + a.n));
    check('Recent activity records the signing, export, move and delete', ['signed:cbc.pdf', 'exported:cbc.pdf', 'moved:cbc.pdf', 'removed:cbc.pdf'].every((k) => ra.includes(k)), JSON.stringify(ra));
  });

  // ---------------- 3. search and help ----------------
  await section('search and help', async () => {
    await p.evaluate(() => closeAll());
    await p.click('body'); await p.keyboard.press('/');
    check('/ jumps to the search box', await p.evaluate(() => document.activeElement && document.activeElement.id === 'globalSearch'));
    const search = async (q) => { await p.evaluate(() => closeAll()); await p.fill('#globalSearch', ''); await p.type('#globalSearch', q); await p.waitForTimeout(600);
      return p.evaluate(() => el('drawer').classList.contains('on') ? el('drawer').innerText.replace(/\s+/g, ' ') : ''); };
    check('search finds a client by UCI', /Clients .*4023180/.test(await search('4023180')));
    check('search finds a staff member', /Staff .*Maria Reyes/.test(await search('Maria')));
    check('search finds an appointment', /Appointments .*Dentist/.test(await search('Dent')));
    await p.locator('#drawer .attn', { hasText: 'Dentist' }).first().click(); await p.waitForTimeout(300);
    check('...and a result opens it', await p.evaluate(() => el('drawer').classList.contains('on') || el('modal').classList.contains('on')) && !/Search results/.test(await p.evaluate(() => (el('drTitle') || {}).innerText || '')));
    const none = await search('zzqq');
    check('a search that finds nothing says so', /no(thing)? (match|found|results)/i.test(none) || /nothing/i.test(await p.evaluate(() => el('toastTxt').textContent + ' ' + (el('drawer').classList.contains('on') ? el('drawer').innerText : ''))), none || '(nothing shown)');
    await p.evaluate(() => closeAll());
    await p.locator('button[aria-label="Help and support"]').click(); await p.waitForTimeout(250);
    const help = await p.evaluate(() => ({ t: el('mdTitle').innerText, b: el('mdBody').innerText }));
    check('Help and support (the ? button) offers support@aiparagonconsulting.com by Gmail, mail app or copy', help.t === 'Help & support' && /support@aiparagonconsulting\.com/.test(help.b) && /Gmail/.test(help.b) && /Copy the address/.test(help.b), JSON.stringify(help));
    await p.locator('#modal button', { hasText: 'Gmail' }).click(); await p.waitForTimeout(150);
    check('...Gmail opens a message to support', await p.evaluate(() => window.__opened.some((u) => /mail\.google\.com.*to=support@aiparagonconsulting\.com/.test(u))));
    await p.locator('#sidebar a', { hasText: 'Help and support' }).click(); await p.waitForTimeout(200);
    check('the sidebar footer’s Help and support opens the same window', await p.evaluate(() => el('mdTitle').innerText === 'Help & support'));
    await p.evaluate(() => closeAll());
    // staff: a colleague in the search results
    await p.evaluate(() => signIn('staff')); await p.waitForTimeout(500);
    await search('Nell');
    await p.locator('#drawer .attn', { hasText: 'Nell Harding' }).first().click(); await p.waitForTimeout(300);
    const sv = await p.evaluate(() => ({ view: state.view, text: el('view').innerText.slice(0, 160).replace(/\s+/g, ' ') }));
    check('staff searching a colleague’s name do not get that colleague’s full staff file (a director page: certifications, Send reminder)', sv.view !== 'staffpage', JSON.stringify(sv));
    await p.evaluate(() => signIn('family')); await p.waitForTimeout(500);
    await goView(p, 'messages');
    const fam = await p.evaluate(() => visThreads().map((t) => t.role + ':' + threadView(t).title + ':' + t.sub));
    check('(demo view) a family member’s Messages shows only conversations with the family, not the staff and director talking about their client', fam.every((x) => /^Guardian:/.test(x)), fam.join(' | '));
    await p.locator('#view button', { hasText: 'New message' }).click(); await p.waitForTimeout(300);
    const famTo = await p.evaluate(() => [...el('nmTo').options].map((o) => o.textContent));
    check('(demo view) a family member cannot write to themselves or to every house’s team (Guardian on file, Cedar House team, Birch House team)', !famTo.some((x) => /Guardian on file|Cedar House team|Birch House team/.test(x)), famTo.join(' | '));
    await p.evaluate(() => { closeAll(); signIn('director'); }); await p.waitForTimeout(300);
  });
  await demoCtx.ctx.close();

  // =============================== PART 2: a signed-in team ===============================
  let lastAsk = null, askReply = () => 'Okay.';
  const B = makeBackend({ ask: async (pl) => { lastAsk = pl; const r = askReply(pl); return r && r.status ? r : { reply: r }; } });
  B.addUser(DIR.email, DIR.pw, ORG, 'director');
  B.addUser(STF.email, STF.pw, ORG, 'staff');
  B.orgs[ORG].name = 'Birch Care';
  const P = (key, value) => B.program.push({ org_id: ORG, key, value, updated_at: new Date().toISOString() });
  P('org', { name: 'Birch Care' }); P('email', { v: DIR.email }); P('hidesample', { v: true }); P('homes', { list: ['Elm House', 'Oak House'] });
  P('users', { map: { [DIR.email]: { name: DIR.name, role: 'director', title: 'Executive Director' }, [STF.email]: { name: STF.name, role: 'staff', title: 'Direct Support Professional', sid: STF.sid } } });
  P('pilot', { signatures: { ['u:' + DIR.email]: { by: DIR.name, at: 'Oct 1, 2026', role: 'Director' }, ['u:' + STF.email]: { by: STF.name, at: 'Oct 2, 2026', role: 'Staff' }, director: { by: DIR.name, at: 'Oct 1, 2026', role: 'Director' } } });
  P('access', { map: { [STF.sid]: ['cl-1', 'cl-2'] } });                // Sam may open two of the three clients
  CLIENTS.forEach((c) => B.rows('np_demo_clients').push(Object.assign({ org_id: ORG, created_at: new Date().toISOString(), guardian: 'None on file', alerts: [] }, c)));
  B.rows('np_demo_staff').push({ org_id: ORG, id: STF.sid, name: STF.name, init: 'S.R.', role: 'Direct Support Professional', home: 'Elm House', email: STF.email, hired: '2026-01-05' });
  B.rows('np_demo_staff').push({ org_id: ORG, id: 'st-tia', name: 'Tia Lane', init: 'T.L.', role: 'House Lead', home: 'Oak House', email: '', hired: '2026-02-01' });
  const VISIT_FIELDS = [{ l: 'Client ID (UCI)', ty: 'text' }, { l: 'Visit date', ty: 'date' }, { l: 'Notes', ty: 'long text' }, { l: 'Time seen', ty: 'time' }, { l: 'Amount paid', ty: 'number' },
      { l: 'Fasting', ty: 'checkbox' }, { l: 'Mood', ty: 'choice', opts: ['Calm', 'Upset'] }, { l: 'Meds', ty: 'table', cols: ['Drug', 'Dose'], rows: 2 }, { l: 'Steps', ty: 'checklist', items: ['Wash hands', 'Gloves'] },
      { l: 'Part B', ty: 'head' }, { l: 'Print as is.', ty: 'para' }, { l: 'Pain', ty: 'scale' }, { l: 'Staff on duty', ty: 'person' }, { l: 'Where', ty: 'place' }, { l: 'Contact email', ty: 'email' },
      { l: 'Contact phone', ty: 'phone' }, { l: 'Link', ty: 'url' }, { l: 'Photo', ty: 'file' }, { l: 'Big title', ty: 'h1' }, { l: 'Divider', ty: 'divider' }, { l: 'Staff signature', ty: 'signature' }];
  B.rows('np_demo_templates').push({ org_id: ORG, id: 'tpl-qavisit', name: 'QA visit form', dest: 'Medical', fields: VISIT_FIELDS, created_at: new Date().toISOString() });   // a form with one field of each kind
  B.rows('np_demo_documents').push({ org_id: ORG, id: 901, cid: 'st-tia', n: 'Tia written warning.pdf', cat: 'General', uploaded_by: 'D.M.', doc_date: '2026-11-01', size: '10 KB', created_at: new Date().toISOString() });
  const google = [];
  async function open() {
    const { ctx, page } = await H.newPage(env, { rest: B.rest, bucket: errors, viewport: { width: 1440, height: 1000 } });
    await B.route(ctx);
    await ctx.addInitScript(NOPRINT);
    await ctx.route(/^https:\/\/([a-z]+\.)?google(apis)?\.com\//, (r) => { google.push(r.request().url() + ' ' + (r.request().postData() || '')); return r.abort(); });   // recorded, never answered
    page.on('dialog', (d) => d.accept());
    return { ctx, page };
  }
  const booted = (pg) => pg.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 20000 });
  const inApp = (pg) => pg.waitForFunction(() => el('app').classList.contains('on') && typeof state !== 'undefined' && state.role && HYDRATED, null, { timeout: 25000 });
  const signInAs = async (pg, who) => { await pg.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(pg);
    if (!(await pg.evaluate(() => el('app').classList.contains('on')))) { await pg.fill('#liEmail', who.email); await pg.fill('#liPw', who.pw); await pg.click('#liGo'); }
    await inApp(pg); await pg.waitForTimeout(1200); };
  const reload = async (pg) => { await pg.reload({ waitUntil: 'load' }); await booted(pg); await inApp(pg); await pg.waitForTimeout(1200); };
  const until = async (fn, ms) => { const end = Date.now() + (ms || 6000); while (Date.now() < end) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); } return false; };
  const D = await open(), S = await open();
  const dp = D.page, sp = S.page;
  await signInAs(dp, DIR);
  await signInAs(sp, STF);
  check('the director and the staff member open Birch Care with no sample records shown', await dp.evaluate(() => state.role === 'director' && /Birch Care/.test(agencyName()) && state.hideSample) && await sp.evaluate(() => state.role === 'staff' && meSid() === 'st-sam'));

  // ---------------- 4. Documents, signed in: a binder and the three kinds of upload ----------------
  let binderKey = '';
  await section('signed-in documents', async () => {
    await goView(dp, 'templates');
    await dp.locator('#view .page-h button', { hasText: 'New binder' }).click(); await dp.waitForTimeout(200);
    await dp.fill('#nbN', 'Vehicle records'); await dp.fill('#nbS', 'Van insurance and logs'); await dp.fill('#nbSub', 'Insurance');
    await dp.locator('#nbSec').uncheck();
    await dp.locator('#modal button', { hasText: 'Create binder' }).click(); await dp.waitForTimeout(400);
    binderKey = await dp.evaluate(() => (CUSTOM_BINDERS.find((b) => b.name === 'Vehicle records') || {}).key);
    const up = async (file, sec, title) => {
      await dp.locator('#view .page-h button', { hasText: 'Upload document' }).click(); await dp.waitForTimeout(200);
      await dp.setInputFiles('#libFile', { name: file, mimeType: 'application/pdf', buffer: PDF(file) });
      if (title) await dp.fill('#libTitle', title);
      await dp.selectOption('#libKey', binderKey); await dp.waitForTimeout(100); await dp.selectOption('#libSec', sec);
      await dp.locator('#libGo').click(); await dp.waitForTimeout(1000);
    };
    await up('van-policy.pdf', 'tab:Insurance');
    await up('mileage-log.pdf', 'forms', 'Mileage log');
    await up('van-guide.pdf', 'res', 'Van guide');
    await until(() => B.rows('np_demo_library').length === 2);
    check('the three uploads are stored and recorded (a filed document, a blank form, a resource)', Object.keys(B.files).filter((k) => /van-policy|mileage-log|van-guide/.test(k)).length === 3 && B.rows('np_demo_library').length === 2 && B.rows('np_demo_documents').some((r) => r.cat === 'Completed — ' + binderKey && r.sub_binder === 'Insurance'), JSON.stringify(B.rows('np_demo_documents').map((r) => [r.n, r.cat])));
    await reload(dp); await goView(dp, 'templates');
    await dp.locator(`[data-binder-row="${binderKey}"]`).click(); await dp.waitForTimeout(300);
    const st = await dp.evaluate((k) => ({ name: FOLDER_NAMES[k], comp: (COMPLETED[k] || []).map((x) => x.n + '|' + x.sb), forms: ((USER_LIB[k] || {}).forms || []).map((x) => x.n), res: ((USER_LIB[k] || {}).res || []).map((x) => x.n), text: el('view').innerText }), binderKey);
    check('after a reload the binder, its tab, the filed document and the resource are there', st.name === 'Vehicle records' && st.comp.includes('van-policy.pdf|Insurance') && st.res.includes('Van guide') && /Van guide/.test(st.text), JSON.stringify({ comp: st.comp, res: st.res }));
    check('after a reload each uploaded blank form and resource shows once (the workspace is read twice at sign-in)', st.forms.length === 1 && st.res.length === 1 && (st.text.match(/Van guide/g) || []).length === 1, JSON.stringify({ forms: st.forms, res: st.res }));
    await goView(dp, 'forms');
    check('the blank form shows on the Templates page too', /Mileage log/.test(await dp.evaluate(() => el('view').innerText)));
  });

  // ---------------- 5. Create new template with every kind of field ----------------
  let tplId = '';
  await section('create new template', async () => {
    await goView(dp, 'forms');
    await dp.locator('#view button', { hasText: 'Create new template' }).click(); await dp.waitForTimeout(400);
    const bar = await dp.evaluate(() => ({ kinds: [...document.querySelectorAll('#tpeRibbon .fb-k')].map((b) => b.dataset.k), more: [...document.querySelectorAll('#tpeRibbon .fb-more option')].map((o) => o.value).filter(Boolean) }));
    for (const k of bar.kinds.concat(bar.more)) {
      if (bar.kinds.includes(k)) await dp.click(`#tpeRibbon .fb-k[data-k="${k}"]`); else await dp.selectOption('#tpeRibbon .fb-more', k);
      const n = await dp.evaluate(() => tpeT().fields.length);
      const gap = dp.locator(`#tpeBlocks .tpe-slot[data-at="${n}"]`);
      await gap.scrollIntoViewIfNeeded().catch(() => {}); await gap.click(); await dp.waitForTimeout(60);
    }
    const kinds = await dp.evaluate(() => [...new Set(tpeT().fields.map((f) => f.ty))]);
    const want = ['text', 'long text', 'date', 'time', 'number', 'checkbox', 'choice', 'table', 'checklist', 'head', 'para', 'signature', 'scale', 'person', 'place', 'email', 'phone', 'url', 'file', 'h1', 'divider'];
    check('the field bar and More… add every kind of field (21)', want.every((k) => kinds.includes(k)), kinds.join(','));
    await dp.locator('#mdFoot button', { hasText: 'Save template' }).click(); await dp.waitForTimeout(300);
    check('Save template with no name asks for one first', /Give the template a name first/.test(await dp.evaluate(() => el('toastTxt').textContent)) && await dp.evaluate(() => el('modal').classList.contains('on')));
    await dp.fill('#tpeName', 'QA every kind');
    const guide = require('fs').readFileSync(path.join(__dirname, '..', 'docs', 'np-portal-guide.md'), 'utf8');
    check('Create new template picks its section with “Files to”, and the guide says so (it said “Keep it in Templates”, the Upload a form label)', await dp.evaluate(() => /^Files to/.test(((document.querySelector('.tpe-dest') || {}).innerText || '').trim())) && /Create new template has "Files to"/.test(guide), await dp.evaluate(() => (document.querySelector('.tpe-dest') || {}).innerText || ''));
    await dp.selectOption('.tpe-dest select', 'Medical');
    await dp.locator('#mdFoot button', { hasText: 'Print preview' }).click(); await dp.waitForTimeout(300);
    check('Print preview prints the form being built', /QA every kind/.test(flat(await printed(dp))));
    if (!(await dp.evaluate(() => el('modal').classList.contains('on') && !!el('tpeName')))) await dp.evaluate(() => openTplEditor(window._tplEd));
    await dp.locator('#mdFoot button', { hasText: 'Save template' }).click(); await dp.waitForTimeout(800);
    await until(() => B.rows('np_demo_templates').some((r) => r.name === 'QA every kind'));
    await reload(dp);
    const t = await dp.evaluate(() => { const t = TEMPLATES5.find((x) => x.name === 'QA every kind'); return t && { id: t.id, kinds: [...new Set(t.fields.map((f) => f.ty))], n: t.fields.length }; });
    tplId = t && t.id;
    check('after a reload the new template is there with every kind of field', !!t && want.every((k) => t.kinds.includes(k)), JSON.stringify(t));
    await goView(dp, 'forms');
    check('...in the section picked: Medical binder templates', await dp.evaluate(() => /QA every kind/.test((document.querySelector('#view section[data-binder="Medical"]') || {}).innerText || '')));
    await menu(dp, dp.locator('#view .tpl-line', { hasText: 'QA every kind' }).first(), 'Rename');
    await dp.locator('.rn-inp').fill('QA every kind v2'); await dp.locator('.rn-inp').press('Enter'); await dp.waitForTimeout(500);
    await menu(dp, dp.locator('#view .tpl-line', { hasText: 'QA every kind v2' }).first(), 'Delete template');
    await dp.evaluate(() => { const b = [...document.querySelectorAll('#mdFoot button')].reverse().find((x) => /delete|remove/i.test(x.textContent)); if (b) b.click(); }); await dp.waitForTimeout(500);
    await reload(dp); await goView(dp, 'forms');
    check('Rename then Delete template: gone after a reload', !(await dp.evaluate(() => [...document.querySelectorAll('#view .tpl-line')].some((r) => /QA every kind/.test(r.innerText)))) && !B.rows('np_demo_templates').some((r) => /QA every kind/.test(r.name)), JSON.stringify(await dp.evaluate(() => TEMPLATES5.filter((t) => /QA every/.test(t.name)).map((t) => t.id + ':' + t.name))) + ' db: ' + JSON.stringify(B.rows('np_demo_templates').map((r) => r.id + ':' + r.name)));
  });

  // ---------------- 6. Filling in every kind, a drawn signature, Sign and finalize ----------------
  let filedName = '';
  await section('fill in and sign', async () => {
    await goView(dp, 'forms');
    await menu(dp, dp.locator('#view .tpl-line', { hasText: 'QA visit form' }).first(), 'Fill it in');
    const ix = (lab) => dp.evaluate((lab) => docById(window._docEdit).fields.findIndex((f) => f.l === lab), lab);
    await dp.fill(`#dg${await ix('Client ID (UCI)')}`, '7310452');
    await dp.fill(`#dg${await ix('Visit date')}`, '2026-11-04');
    await dp.fill(`#dg${await ix('Notes')}`, 'Seen for review.');
    await dp.fill(`#dg${await ix('Time seen')}`, '09:30');
    await dp.fill(`#dg${await ix('Amount paid')}`, '12.50');
    await dp.locator(`input[name="dgr${await ix('Fasting')}"][value="Yes"]`).check();
    await dp.locator(`input[name="dgr${await ix('Mood')}"][value="Calm"]`).check();
    await dp.locator(`#dgtb${await ix('Meds')} input`).first().fill('Aspirin');
    await dp.locator(`#dgw${await ix('Steps')} input[type=checkbox]`).first().check();
    await dp.locator(`input[name="dgr${await ix('Pain')}"][value="3"]`).check();
    await dp.selectOption(`#dg${await ix('Staff on duty')}`, 'Sam Rivera');
    await dp.fill(`#dg${await ix('Where')}`, 'Elm House');
    await dp.fill(`#dg${await ix('Contact email')}`, 'clinic@example.org');
    await dp.fill(`#dg${await ix('Contact phone')}`, '555-010-2000');
    await dp.fill(`#dg${await ix('Link')}`, 'https://example.org/a');
    await dp.setInputFiles(`#dgf${await ix('Photo')}`, { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
    await dp.waitForTimeout(800);
    const si = await ix('Staff signature');
    await dp.locator(`#mdBody [data-sig="dg${si}"] .sig-slot`).click(); await dp.waitForTimeout(300);
    const box = await dp.locator('#sigOv canvas').boundingBox();
    await dp.mouse.move(box.x + 30, box.y + 40); await dp.mouse.down(); await dp.mouse.move(box.x + 120, box.y + 70, { steps: 8 }); await dp.mouse.move(box.x + 200, box.y + 35, { steps: 8 }); await dp.mouse.up();
    await dp.locator('#sigOv button', { hasText: 'Use this signature' }).click(); await dp.waitForTimeout(200);
    check('a signature drawn with the mouse goes on the form', /^data:image\/png/.test(await dp.evaluate((i) => el('dg' + i).value, si)));
    await dp.locator('#mdFoot button', { hasText: 'Print filled' }).click(); await dp.waitForTimeout(400);
    const ph = await printed(dp);
    const want = ['7310452', 'Seen for review', '9:30', '12.50', 'Calm', 'Aspirin', 'Wash hands', 'Sam Rivera', 'Elm House', 'clinic@example.org', '555-010-2000', 'photo.png', 'data:image/png', 'Big title', 'Part B'];
    check('Print filled carries every answer and the drawn signature', want.every((s) => ph.includes(s)), want.filter((s) => !ph.includes(s)).join(', '));
    await dp.locator('#mdFoot button', { hasText: 'Sign and finalize' }).click(); await dp.waitForTimeout(300);
    check('Sign and finalize says plainly that the copy cannot be changed', /cannot be changed/.test(await dp.evaluate(() => el('mdBody').innerText)));
    await dp.locator('#mdFoot button', { hasText: 'Sign and finalize' }).click(); await dp.waitForTimeout(400);
    await dp.selectOption('#fpClient', 'cl-1');
    await dp.locator('#modal button', { hasText: 'Save to binder' }).click(); await dp.waitForTimeout(900);
    const f = await dp.evaluate(() => Object.values(FILED_DOCS).find((x) => x.name === 'QA visit form'));
    filedName = f && f.file;
    check('signed and filed in the Medical binder and the client’s file, as Dana, with the signature and the stored photo', f && f.status === 'final' && f.signedBy === DIR.name && f.refs.some((r) => r.b === 'Medical') && f.refs.some((r) => r.cid === 'cl-1') && /^data:image\/png/.test(f.values['Staff signature']) && Object.keys(B.files).some((k) => /photo\.png$/.test(k)), JSON.stringify(f && f.refs));
    check('the template keeps one row on Templates (the working copy is not a second form)', await dp.evaluate(() => { closeAll(); go('forms'); return [...document.querySelectorAll('#view .lrow')].filter((r) => /QA visit form/.test(r.innerText)).length === 1; }));
    await reload(dp);
    await dp.evaluate(() => { closeAll(); go('clients'); openClient('cl-1', 'documents'); }); await dp.waitForTimeout(300);
    await dp.evaluate((n) => { const d = DOCS.find((x) => x.cid === 'cl-1' && x.n === n); openStoredDoc(d.id, d.n); }, filedName); await dp.waitForTimeout(600);
    const ro = await dp.evaluate(() => ({ t: el('mdTitle').innerText, inputs: document.querySelectorAll('#mdBody input.inp, #mdBody textarea').length, foot: el('mdFoot').innerText, body: el('mdBody').innerText }));
    check('after a reload the signed copy opens read-only from the client’s Files, with Copy as a new draft', ro.inputs === 0 && /Copy as a new draft/.test(ro.foot) && /this copy is the record/.test(ro.body), JSON.stringify(ro).slice(0, 300));
    await dp.locator('#mdFoot button', { hasText: 'Copy as a new draft' }).click(); await dp.waitForTimeout(600);
    check('Copy as a new draft opens a draft with the same answers, the signed copy untouched', await dp.evaluate(() => { const fs = Object.values(FILED_DOCS).filter((x) => x.name === 'QA visit form'); return fs.length === 2 && fs.some((x) => x.status === 'final') && fs.some((x) => x.status === 'draft' && x.values.Notes === 'Seen for review.'); }) && /Draft — QA visit form/.test(await dp.evaluate(() => el('mdTitle').innerText)));
    await dp.evaluate(() => closeAll());
  });

  // ---------------- 7. New from template on a staff member's file ----------------
  await section('new from template for staff', async () => {
    await goView(dp, 'team');
    await dp.locator('#view :text("Tia Lane")').first().click(); await dp.waitForTimeout(400);
    await dp.locator('#sfDocs button', { hasText: 'New from template' }).click(); await dp.waitForTimeout(300);
    await dp.locator('#modal .tpk-r', { hasText: 'Face sheet' }).locator('button', { hasText: 'Start' }).click(); await dp.waitForTimeout(600);
    check('Start opens the form as a draft in Tia’s file', /Draft — Face sheet/.test(await dp.evaluate(() => el('mdTitle').innerText)));
    await dp.evaluate(() => closeAll());
    const d = await dp.evaluate(() => { const x = DOCS.find((y) => y.cid === 'st-tia' && /^Face sheet/.test(y.n)); const b = x && docBinderOf(x); return x && { n: x.n, cat: x.cat, b, sb: docSubOf(x, b) }; });
    check('...under the template’s binder and tab (Agency / Face Sheet), as a draft', d && d.cat === 'Draft' && d.b === 'Agency' && d.sb === 'Face Sheet', JSON.stringify(d));
    await reload(dp);
    check('...kept after a reload', await dp.evaluate(() => DOCS.some((y) => y.cid === 'st-tia' && /^Face sheet/.test(y.n) && y.fid && FILED_DOCS[y.fid] && FILED_DOCS[y.fid].status === 'draft')));
  });

  // ---------------- 8. Upload a form: a blank form becomes a template ----------------
  await section('upload a form', async () => {
    await goView(dp, 'forms');
    await dp.locator('#view .page-acts button', { hasText: 'Upload a form' }).click(); await dp.waitForTimeout(300);
    await dp.setInputFiles('#ovFile', path.join(H.FORMS, 'med-typed.pdf')); await dp.waitForTimeout(200);
    await dp.fill('#ovName', 'QA medication form'); await dp.selectOption('#ovDest', 'Medical');
    await dp.click('#ovGo');
    await dp.waitForFunction(() => /Found \d+ places/.test((document.querySelector('.ov-intro') || {}).textContent || ''), null, { timeout: 120000 });
    const n = await dp.evaluate(() => ovT().fields.length);
    check('the box finder finds the form’s boxes (more than 50)', n > 50, String(n));
    await dp.locator('#mdBody button:has-text("Find boxes"), #mdFoot button:has-text("Find boxes")').first().click(); await dp.waitForTimeout(2500);
    check('Find boxes again adds nothing twice', (await dp.evaluate(() => ovT().fields.length)) === n && /already has a box/.test(await dp.evaluate(() => el('toastTxt').textContent)));
    await dp.locator('#mdFoot button', { hasText: 'Save template' }).click(); await dp.waitForTimeout(1200);
    await until(() => B.rows('np_demo_templates').some((r) => r.name === 'QA medication form'));
    check('Save template stores the original form and the template', Object.keys(B.files).some((k) => /templates\/.+med-typed\.pdf$/.test(k)) && B.rows('np_demo_templates').some((r) => r.name === 'QA medication form' && (r.fields || []).length === n));
    await reload(dp); await goView(dp, 'forms');
    const row = dp.locator('#view .tpl-line', { hasText: 'QA medication form' }).first();
    check('after a reload it is on Templates as an original form with its boxes', new RegExp('Original form ' + n + ' boxes · files to Medical binder').test((await row.innerText()).replace(/\s+/g, ' ')));
    await menu(dp, row, 'Fill it in'); await dp.waitForTimeout(1200);
    const fo = await dp.evaluate(() => ({ t: el('mdTitle').innerText, pages: document.querySelectorAll('#mdBody canvas, #mdBody img').length, missing: !!document.querySelector('#mdBody .ov-missing') }));
    check('Fill it in opens the original page, loaded from storage', fo.t === 'Fill in — QA medication form' && fo.pages > 0 && !fo.missing, JSON.stringify(fo));
    await dp.evaluate(() => closeAll());
  });

  // ---------------- 9. Messages, the bell, unread counts both ways ----------------
  await section('messages', async () => {
    await dp.locator('button[aria-label="Messages"]').click(); await dp.waitForTimeout(400);
    await dp.locator('#view button', { hasText: 'New message' }).click(); await dp.waitForTimeout(300);
    const to = await dp.evaluate(() => [...el('nmTo').options].map((o) => o.textContent));
    check('New message offers each staff member and each house team as a group', to.some((x) => /^Sam Rivera/.test(x)) && to.some((x) => /^Tia Lane/.test(x)) && to.some((x) => /Elm House team · group/.test(x)), to.join(' | '));
    await dp.selectOption('#nmTo', 'staff:st-sam'); await dp.fill('#nmSub', 'Dental'); await dp.fill('#nmBody', 'Please book the dental follow-up.');
    await dp.locator('#modal button', { hasText: 'Send message' }).click(); await dp.waitForTimeout(500);
    await dp.locator('#view button', { hasText: 'New message' }).click(); await dp.waitForTimeout(300);
    await dp.selectOption('#nmTo', 'group:Elm House'); await dp.fill('#nmSub', 'House meeting'); await dp.fill('#nmBody', 'Team meeting Friday at 2pm.');
    await dp.locator('#modal button', { hasText: 'Send message' }).click(); await dp.waitForTimeout(800);
    await until(() => B.rows('np_demo_messages').length >= 2);
    const presence = await dp.evaluate(() => [...document.querySelectorAll('#msgTeam .team-i')].map((b) => b.innerText.replace(/\s+/g, ' ') + (b.querySelector('.pres-dot.on') ? ' [on]' : '')));
    check('the director’s Team list shows Sam online while his page is open', presence.some((x) => /Sam Rivera.*\[on\]/.test(x)), JSON.stringify(presence));
    // a task and a template assigned to Sam, for the bell
    await goView(dp, 'tasks');
    await dp.locator('#view button', { hasText: 'Assign task' }).click(); await dp.waitForTimeout(300);
    await dp.fill('#ntTitle', 'Check smoke alarms'); await dp.selectOption('#ntWho', STF.sid); await dp.fill('#ntDue', today);
    await dp.locator('#modal button', { hasText: 'Assign task' }).click(); await dp.waitForTimeout(500);
    await dp.evaluate(() => { closeAll(); go('forms'); tplAssign('tp20'); }); await dp.waitForTimeout(300);
    await dp.locator('#tpWho button', { hasText: 'Sam Rivera' }).click(); await dp.locator('#modal button', { hasText: 'Save assignment' }).click(); await dp.waitForTimeout(600);
    await reload(sp);
    const sv = await sp.evaluate(() => ({ badge: el('msgBadge').style.display !== 'none' ? el('msgBadge').textContent : '0', th: visThreads().map((t) => threadView(t).title + ':' + t.sub) }));
    check('Sam sees both conversations, the group one too, with 2 on the Messages button', sv.badge === '2' && sv.th.includes('Dana Moss:Dental') && sv.th.includes('Elm House team:House meeting'), JSON.stringify(sv));
    await goView(sp, 'home');
    const asg = sp.locator('#view .docrow', { hasText: 'Face sheet' }).first();
    check('My shift lists the form assigned to Sam under Documents assigned to you, with Acknowledge and Open & fill', /Documents assigned to you/.test(await sp.evaluate(() => el('view').innerText)) && await asg.locator('button', { hasText: 'Acknowledge' }).count() === 1 && await asg.locator('button', { hasText: 'Open & fill' }).count() === 1);
    await asg.locator('button', { hasText: 'Open & fill' }).click(); await sp.waitForTimeout(400);
    check('...Open & fill opens it to fill in', await sp.evaluate(() => el('mdTitle').innerText === 'Fill in — Face sheet'));
    await sp.evaluate(() => closeAll());
    await sp.locator('#view .docrow', { hasText: 'Face sheet' }).first().locator('button', { hasText: 'Acknowledge' }).click(); await sp.waitForTimeout(600);
    await reload(sp); await goView(sp, 'home');
    check('...Acknowledge is saved for the team (still acknowledged after a reload)', /Acknowledged/.test(await sp.locator('#view .docrow', { hasText: 'Face sheet' }).first().innerText()));
    await sp.locator('button[aria-label="Notifications"]').click(); await sp.waitForTimeout(400);
    const bell = await sp.evaluate(() => ({ sub: el('drawer').innerText, items: [...document.querySelectorAll('#drawer .attn')].map((a) => ({ t: (a.querySelector('b') || {}).innerText || '', click: !!a.getAttribute('onclick') })) }));
    check('the bell lists the new message, the task and the form assigned to him, and his 2 unread messages', /2 unread messages/.test(bell.sub) && ['New message', 'Task assigned to Sam Rivera', 'Document assigned to you'].every((x) => bell.items.some((i) => i.t.startsWith(x))), JSON.stringify(bell.items));
    const dead = bell.items.filter((i) => /^(Task assigned|Document assigned|New message)/.test(i.t) && !i.click).map((i) => i.t);
    check('each system notification in the bell opens its item when clicked (task, assigned form, message)', !dead.length, dead.join(' | '));
    await sp.locator('#drawer .attn', { hasText: 'Open →' }).filter({ hasText: 'Dental' }).first().click(); await sp.waitForTimeout(500);
    const op = await sp.evaluate(() => ({ view: state.view, th: (THREADS.find((t) => t.id === state.thread) || {}).sub, badge: el('msgBadge').style.display !== 'none' ? el('msgBadge').textContent : '0' }));
    check('clicking the message in the bell opens that conversation and marks it read', op.view === 'messages' && op.th === 'Dental' && op.badge === '1', JSON.stringify(op));
    await sp.locator('button[aria-label="Notifications"]').click(); await sp.waitForTimeout(400);
    await sp.locator('#drawer .attn', { hasText: 'Task assigned to Sam Rivera' }).first().click(); await sp.waitForTimeout(400);
    const tk = await sp.evaluate(() => ({ view: state.view, drawer: el('drawer').classList.contains('on') ? el('drTitle').innerText : '' }));
    check('the bell’s “Task assigned” notice opens that task on Tasks', tk.view === 'tasks' && /Check smoke alarms/.test(tk.drawer), JSON.stringify(tk));
    await sp.evaluate(() => closeAll()); await goView(sp, 'messages');
    await goView(dp, 'messages'); await dp.locator('#view .thread-i', { hasText: 'Dental' }).click(); await dp.waitForTimeout(300);   // the director was last on this conversation
    await sp.fill('#msgIn', 'Booked for Tuesday.'); await sp.locator('#view button[aria-label="Send message"]').click(); await sp.waitForTimeout(700);
    await until(() => B.rows('np_demo_messages').some((m) => m.body === 'Booked for Tuesday.'));
    await goView(dp, 'home');
    await dp.evaluate(() => msgPull()); await dp.waitForTimeout(400);
    check('the reply reaches the director without a reload, counted on the Messages button', await dp.evaluate(() => el('msgBadge').style.display !== 'none' && el('msgBadge').textContent === '1' && (THREADS.find((t) => t.sub === 'Dental') || { msgs: [] }).msgs.some((m) => m.t === 'Booked for Tuesday.')));
    await dp.locator('button[aria-label="Messages"]').click(); await dp.waitForTimeout(500);
    const dv = await dp.evaluate(() => ({ shown: (THREADS.find((t) => t.id === state.thread) || {}).sub, text: /Booked for Tuesday/.test(el('view').innerText), badge: el('msgBadge').style.display !== 'none' ? el('msgBadge').textContent : '0' }));
    check('the envelope opens Messages on the conversation the director was last on, the reply on screen, and marks it read', dv.shown === 'Dental' && dv.text && dv.badge === '0', JSON.stringify(dv));
    await dp.locator('#view .thread-i', { hasText: 'Dental' }).click(); await dp.waitForTimeout(400);
    check('clicking it in the list marks it read', await dp.evaluate(() => el('msgBadge').style.display === 'none'));
    await dp.locator('#view .thread-i', { hasText: 'House meeting' }).locator('span[title="Delete conversation"]').click(); await dp.waitForTimeout(300);
    await dp.evaluate(() => { const b = [...document.querySelectorAll('#mdFoot button')].reverse().find((x) => /delete/i.test(x.textContent)); if (b) b.click(); }); await dp.waitForTimeout(500);
    await reload(sp);
    check('a director deletes a conversation (✕): it is gone for the staff member too', !(await sp.evaluate(() => visThreads().some((t) => t.sub === 'House meeting'))) && !B.rows('np_demo_threads').some((t) => t.subject === 'House meeting'));
    await goView(dp, 'messages');
  });

  // ---------------- 10. attaching a document to a message ----------------
  await section('attachments', async () => {
    await dp.locator('#view .thread-i', { hasText: 'Dental' }).click(); await dp.waitForTimeout(300);
    await dp.fill('#msgIn', 'The form is attached.');
    await dp.locator('#view button[aria-label="Attach a document"]').click(); await dp.waitForTimeout(300);
    const opts = await dp.evaluate(() => [...el('msgDoc').options].map((o) => o.value + '=' + o.textContent));
    check('Attach a document offers the team’s own filed documents (the signed QA visit form, the uploaded van policy), not only the built-in blank forms and forms open in this browser', opts.some((o) => o.includes(filedName.replace(/\.pdf$/, ''))) && opts.some((o) => /van-policy/.test(o)), opts.join(' | '));
    await dp.selectOption('#msgDoc', 'ex-dental'); await dp.locator('#modal button', { hasText: 'Attach' }).click(); await dp.waitForTimeout(300);
    check('attaching keeps what was typed', (await dp.evaluate(() => el('msgIn').value)) === 'The form is attached.');
    await dp.locator('#view button[aria-label="Send message"]').click(); await dp.waitForTimeout(500);
    await dp.evaluate(() => { tplOpenDoc('tp20'); closeAll(); go('messages'); }); await dp.waitForTimeout(300);
    await dp.locator('#view .thread-i', { hasText: 'Dental' }).click(); await dp.waitForTimeout(300);
    await dp.locator('#view button[aria-label="Attach a document"]').click(); await dp.waitForTimeout(300);
    await dp.selectOption('#msgDoc', 'tpl-tp20'); await dp.locator('#modal button', { hasText: 'Attach' }).click(); await dp.waitForTimeout(300);
    await dp.fill('#msgIn', 'And the face sheet.'); await dp.locator('#view button[aria-label="Send message"]').click(); await dp.waitForTimeout(800);
    await until(() => B.rows('np_demo_messages').some((m) => m.body === 'And the face sheet.'));
    const fdId = await dp.evaluate(() => { const f = Object.values(FILED_DOCS).find((x) => x.name === 'QA visit form' && x.status === 'final'); return f ? 'fd:' + f.id : ''; });
    await dp.locator('#view button[aria-label="Attach a document"]').click(); await dp.waitForTimeout(300);
    await dp.selectOption('#msgDoc', fdId); await dp.locator('#modal button', { hasText: 'Attach' }).click(); await dp.waitForTimeout(300);
    await dp.fill('#msgIn', 'The signed visit form.'); await dp.locator('#view button[aria-label="Send message"]').click(); await dp.waitForTimeout(800);
    await until(() => B.rows('np_demo_messages').some((m) => m.body === 'The signed visit form.' && m.attach_doc === fdId));
    await reload(sp); await goView(sp, 'messages');
    await sp.locator('#view .thread-i', { hasText: 'Dental' }).click(); await sp.waitForTimeout(400);
    const btns = await sp.evaluate(() => [...document.querySelectorAll('#view .chat-log .msg')].map((m) => m.innerText.replace(/\s+/g, ' ')));
    check('Sam sees the attached blank form as a button', btns.some((b) => /The form is attached\. ◫ Dental Visit Documentation/.test(b)), JSON.stringify(btns));
    check('an attached form the director had open (Face sheet) reaches Sam too', btns.some((b) => /And the face sheet\. ◫ Face sheet/.test(b)), JSON.stringify(btns));
    await sp.locator('#view .chat-log button', { hasText: 'Dental Visit Documentation' }).click(); await sp.waitForTimeout(600);
    const sv = await sp.evaluate(() => ({ view: state.view, modal: el('modal').classList.contains('on') ? el('mdTitle').innerText : '' }));
    check('the attachment opens the form for Sam', /Dental Visit Documentation/.test(sv.modal), JSON.stringify(sv));
    await sp.evaluate(() => closeAll()); await sp.waitForTimeout(200);
    const leak = await sp.evaluate(() => ({ view: state.view, text: el('view').innerText }));
    check('opening an attachment does not put staff on the director-only Documents page, where every staff member’s file can be browsed (Tia’s written warning)', leak.view !== 'templates' && !/Staff binder/.test(leak.text), JSON.stringify({ view: leak.view }));
    await sp.evaluate(() => docFocusOpen('staff', 'st-tia')); await sp.waitForTimeout(300);
    check('staff cannot open another staff member’s binder from the Documents page', !/Tia written warning/.test(await sp.evaluate(() => el('view').innerText)));
    await goView(sp, 'messages'); await sp.locator('#view .thread-i', { hasText: 'Dental' }).click(); await sp.waitForTimeout(300);
    await sp.locator('#view .chat-log button', { hasText: 'Face sheet' }).first().click(); await sp.waitForTimeout(500);
    const fs1 = await sp.evaluate(() => ({ view: state.view, t: el('modal').classList.contains('on') ? el('mdTitle').innerText : '' }));
    check('Sam opens the attached Face sheet to fill in, and stays on Messages', fs1.t === 'Fill in — Face sheet' && fs1.view === 'messages', JSON.stringify(fs1));
    await sp.evaluate(() => closeAll()); await sp.waitForTimeout(200);
    const fdBtn = sp.locator('#view .chat-log button', { hasText: filedName.replace(/\.pdf$/, '') }).first();
    check('the signed visit form reaches Sam as an attachment', await fdBtn.count() === 1, JSON.stringify(await sp.evaluate(() => [...document.querySelectorAll('#view .chat-log .msg')].map((m) => m.innerText.replace(/\s+/g, ' ')).slice(-2))));
    if (await fdBtn.count()) { await fdBtn.click(); await sp.waitForTimeout(600); }
    const fs2 = await sp.evaluate(() => ({ view: state.view, t: el('modal').classList.contains('on') ? el('mdTitle').innerText : '', inputs: document.querySelectorAll('#mdBody input.inp, #mdBody textarea').length }));
    check('...and opens it read-only (a client he may open)', /QA visit form/.test(fs2.t) && fs2.inputs === 0 && fs2.view === 'messages', JSON.stringify(fs2));
    await sp.evaluate(() => closeAll());
    await reload(dp); await goView(dp, 'messages');
    const att = await dp.evaluate(() => (THREADS.find((t) => t.sub === 'Dental') || { msgs: [] }).msgs.filter((m) => /attached|face sheet/.test(m.t)).map((m) => m.t + ' → ' + (m.att ? m.att.name : 'none')));
    check('after a reload the director still sees the attached blank form', att.some((x) => /The form is attached\. → Dental Visit Documentation/.test(x)), JSON.stringify(att));
    check('after a reload the attached Face sheet is still on the director’s message', att.some((x) => /face sheet\. → Face sheet/.test(x)), JSON.stringify(att));
  });

  // ---------------- 11. Ask Spectrum ----------------
  await section('ask spectrum', async () => {
    askReply = (pl) => { const lab = (pl.question.match(/Client \d+/) || ['Client 1'])[0]; return `${lab} at Home A is settled. [go:documents]`; };
    await dp.evaluate(() => { closeAll(); toggleAsk(); askNew(); }); await dp.waitForTimeout(300);
    await dp.fill('#askInput', 'How is Maria Gonzalez (7310452) doing at Elm House? MG called 555-201-7788');
    await dp.locator('#askPanel .ask-in button[aria-label="Send"]').click();
    await dp.waitForFunction(() => !el('askWait'), null, { timeout: 15000 }).catch(() => {}); await dp.waitForTimeout(300);
    const q = (lastAsk || {}).question || '', ctx = (lastAsk || {}).context || '';
    check('Ask: the question leaves with labels and no name, initials, UCI, home or phone', /Client 1/.test(q) && /Home A/.test(q) && !SECRET.some((r) => r.test(q)) && !/Elm House/.test(q), q);
    check('Ask: the snapshot leaves with labels only', !SECRET.some((r) => r.test(ctx)) && !/Elm House|Oak House/.test(ctx), SECRET.filter((r) => r.test(ctx)).join(','));
    const ans = await dp.evaluate(() => { const m = [...document.querySelectorAll('#askLog .msg.bot')].pop(); return m ? m.innerText : ''; });
    check('Ask: the answer comes back with the portal’s own names and a Go to Documents button', /7310452/.test(ans) && /Elm House/.test(ans) && /Go to Documents/.test(ans), ans);
    const sample = ['Complete monthly supply count', 'Schedule INR blood draw', 'A. Osei', 'M. Reyes', 'G. Okonjo', 'H&S Weekly Checks'].filter((s) => ctx.includes(s));
    const ui = await dp.evaluate(() => ({ tasks: myTasks().filter((t) => !hid('task', t.id)).map((t) => t.title) }));
    check('a real team’s Ask snapshot holds only its own records, not the hidden sample tasks, fire drills, water temperatures, inspections and audit trail', !sample.length, 'sample in snapshot: ' + sample.join(', ') + ' · tasks the team has: ' + ui.tasks.join(', '));
    await dp.evaluate(() => toggleAsk());
    // staff: only the clients they may open
    await sp.evaluate(() => { closeAll(); toggleAsk(); askNew(); }); await sp.waitForTimeout(300);
    await sp.fill('#askInput', 'Which clients do I support?');
    await sp.locator('#askPanel .ask-in button[aria-label="Send"]').click();
    await sp.waitForFunction(() => !el('askWait'), null, { timeout: 15000 }).catch(() => {}); await sp.waitForTimeout(300);
    const sc = (lastAsk || {}).context || '';
    const cl = (sc.match(/## Clients\n([\s\S]*?)\n\n/) || ['', ''])[1].split('\n').filter(Boolean);
    check('Ask for staff carries only the two clients Sam may open', lastAsk.role === 'staff' && cl.length === 2, cl.join(' | '));
    const go = await sp.locator('#askLog .msg.bot button', { hasText: 'Go to Documents' }).last();
    if (await go.count()) { await go.click(); await sp.waitForTimeout(300); }
    check('Ask’s Go to Documents does not take staff to the director-only Documents page', await sp.evaluate(() => state.view !== 'templates'), await sp.evaluate(() => state.view));
    await sp.evaluate(() => { closeAll(); if (el('askPanel').classList.contains('on')) toggleAsk(); });
  });

  // ---------------- 12. Directory and the change log ----------------
  await section('directory and change log', async () => {
    await goView(dp, 'directory');
    await dp.locator('#view button', { hasText: 'Add entry' }).click(); await dp.waitForTimeout(300);
    await dp.selectOption('#drCat', '__add__');
    const box = dp.locator('#drCat ~ .inline-add input, .inline-add input').first(); await box.fill('Dentist'); await box.press('Enter'); await dp.waitForTimeout(200);
    await dp.fill('#drName', 'Dr. Ames'); await dp.fill('#drOrg', 'Bayside Dental'); await dp.fill('#drPhone', '555-010-3000');
    await dp.locator('#drWho button', { hasText: '7310452' }).click();
    await dp.locator('#modal button', { hasText: 'Add entry' }).click(); await dp.waitForTimeout(500);
    await reload(dp); await goView(dp, 'directory');
    check('Add entry is saved: there after a reload, ticked for one client', /Dr\. Ames · Bayside Dental/.test(await dp.evaluate(() => el('view').innerText)) && /1 client/.test(await dp.evaluate(() => el('view').innerText)));
    await dp.evaluate(() => { closeAll(); go('clients'); openClient('cl-1', 'directory'); }); await dp.waitForTimeout(300);
    check('...and it shows on that client’s Directory tab', /Dr\. Ames/.test(await dp.evaluate(() => el('view').innerText)));
    await dp.evaluate(() => { closeAll(); go('clients'); openClient('cl-2', 'directory'); }); await dp.waitForTimeout(300);
    check('...but not on another client’s', !/Dr\. Ames/.test(await dp.evaluate(() => el('view').innerText)));
    await goView(sp, 'directory');
    check('staff are told the Directory is the director’s', /limited to the director/.test(await sp.evaluate(() => el('view').innerText)));
    // change log
    await goView(dp, 'messages');
    await dp.locator('#view .thread-i', { hasText: 'Dental' }).click(); await dp.waitForTimeout(300);
    await dp.fill('#msgIn', 'Maria Gonzalez needs a ride. Maria refused lunch.'); await dp.locator('#view button[aria-label="Send message"]').click(); await dp.waitForTimeout(600);
    await until(() => B.rows('np_demo_audit_log').some((r) => /needs a ride/.test(r.obj || '')));
    const rows = B.rows('np_demo_audit_log').map((r) => r.act + ' · ' + r.obj);
    check('the change log records each change: templates, uploads, signing, assigning, messages, tasks, directory', ['Edited template', 'Uploaded document', 'Completed document', 'Assigned document', 'Sent message', 'Assigned task', 'Started message thread', 'Added directory entry'].every((a) => rows.some((r) => r.startsWith(a) || r.includes(a))), rows.slice(0, 40).join(' | '));
    const ride = rows.find((r) => /needs a ride/.test(r)) || '';
    check('a client’s full name in a change becomes their UCI in the log', /7310452 needs a ride/.test(ride) && !/Gonzalez/.test(ride), ride);
    check('a client’s first name on its own is taken out of the change log too (“Maria refused lunch”)', !/Maria/.test(ride), ride);
    const scr = await dp.evaluate(() => auditScrub('Maria refused lunch; M.G. ate; MG slept; took 500 MG; S.R. helped; Gonzalez family called'));
    check('the change log also swaps a client’s initials (M.G., MG) and last name for the UCI, but not “500 MG” or a staff member’s initials', scr === '7310452 refused lunch; 7310452 ate; 7310452 slept; took 500 MG; S.R. helped; 7310452 family called', scr);
    await goView(dp, 'changelog');
    await dp.locator('#view .tabs button', { hasText: 'Documents' }).click(); await dp.waitForTimeout(300);
    const docTab = await dp.evaluate(() => [...document.querySelectorAll('#view .docrow .dt')].map((r) => r.innerText.replace(/\s+/g, ' ')).filter((t) => /by /.test(t)));
    check('the change log’s Documents tab lists the document changes', docTab.some((r) => /Uploaded document/.test(r)) && docTab.some((r) => /Completed document/.test(r)), docTab.slice(0, 6).join(' | '));
    check('the change log’s Documents tab does not list messages (a message that says “form” or “report” landed there)', !docTab.some((r) => /Sent message|Started message thread/.test(r)), docTab.filter((r) => /message/.test(r)).join(' | '));
    await dp.locator('#view button', { hasText: 'Export / print' }).click(); await dp.waitForTimeout(300);
    check('Export / print prints the log', /Change log/i.test(flat(await printed(dp))) && await dp.evaluate(() => window.__printedCount >= 1));
  });

  // ---------------- 13. search, signed in ----------------
  await section('signed-in search', async () => {
    const search = async (pg, q) => { await pg.evaluate(() => closeAll()); await pg.fill('#globalSearch', ''); await pg.type('#globalSearch', q); await pg.waitForTimeout(600);
      return pg.evaluate(() => el('drawer').classList.contains('on') ? el('drawer').innerText.replace(/\s+/g, ' ') : ''); };
    check('the director finds a client and a staff member by name', /Clients .*T\.K\./.test(await search(dp, 'T.K.')) && /Staff .*Tia Lane/.test(await search(dp, 'Tia')));
    const byUci = [await search(dp, '7310452'), await search(dp, '8840217')];
    check('“Search clients by UCI” finds a client by UCI (7310452 and 8840217)', /Clients/.test(byUci[0]) && /Clients/.test(byUci[1]), JSON.stringify(byUci));
    check('staff never find a client they may not open (6123498)', !/Clients/.test(await search(sp, 'R.P.')) && !/6123498/.test(await search(sp, '6123498')));
    await dp.evaluate(() => closeAll()); await sp.evaluate(() => closeAll());
  });

  // ---------------- 14. an appointment: the bell's upcoming list and Google Calendar ----------------
  await section('appointment reminder', async () => {
    await goView(dp, 'calendar');
    await dp.locator('#view button', { hasText: 'Add item' }).first().click(); await dp.waitForTimeout(250);
    await dp.locator('.cx-menu button', { hasText: 'Appointment' }).first().click(); await dp.waitForTimeout(400);
    const soon = await dp.evaluate(() => { const d = new Date(Date.now() + 2 * 3600e3); return { date: d.toLocaleDateString('en-CA'), time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }; });
    await dp.selectOption('#apClient', 'cl-1');
    await dp.fill('#apTitle', 'Dentist for Maria Gonzalez (MG)'); await dp.fill('#apDate', soon.date); await dp.fill('#apTime', soon.time);
    await dp.fill('#apLoc', 'Bayside Dental, call 555-201-7788');
    check('“Also send to Google Calendar” is ticked to start with', await dp.isChecked('#apGcal'));
    await dp.evaluate(() => { window.__opened = []; });
    await dp.locator('#modal .md-foot button.navy, #modal button:has-text("Save")').last().click(); await dp.waitForTimeout(800);
    const opened = await dp.evaluate(() => window.__opened.slice());
    const gcal = opened.filter((u) => /calendar\.google\.com|google\.com\/calendar/.test(u));
    check('without a Google connection it opens Google Calendar filled in, with no client name, initials, UCI or phone in the event', gcal.length === 1 && !SECRET.some((re) => re.test(decodeURIComponent(gcal[0]))), gcal.map((u) => decodeURIComponent(u)).join(' | ') || JSON.stringify(opened));
    google.push(...gcal);
    await dp.evaluate(() => closeAll());
    await dp.locator('button[aria-label="Notifications"]').click(); await dp.waitForTimeout(400);
    const up = dp.locator('#drawer .attn', { hasText: 'Dentist' }).first();
    check('the bell lists it under Upcoming appointments', await up.count() === 1 && /Upcoming appointments/.test(await dp.evaluate(() => el('drawer').innerText)));
    await up.click(); await dp.waitForTimeout(400);
    check('...and a click opens the calendar', await dp.evaluate(() => state.view === 'calendar' && !el('drawer').classList.contains('on')));
  });

  // ---------------- 15. what left the portal during the whole run ----------------
  await section('privacy', async () => {
    const leaks = [];
    B.relay.forEach((r) => {
      const pl = JSON.parse(JSON.stringify(r.payload || {}));
      ['to', 'email', 'emails', 'user_email'].forEach((k) => { delete pl[k]; });   // who an email goes to is meant to leave
      const s = JSON.stringify(pl);
      const hit = SECRET.filter((re) => re.test(s)).concat(/[\w.+-]+@[\w-]+\.[\w.]+/.test(s) && r.action !== 'ask' ? ['an email address'] : []);
      if (hit.length) leaks.push(r.action + ': ' + hit.join(',') + ' in ' + s.slice(0, 160));
    });
    check(`nothing sent to the relay (${B.relay.length} requests: ${[...new Set(B.relay.map((r) => r.action))].join(', ')}) names a client or carries a 7-digit number or phone`, !leaks.length, leaks.join(' || '));
    const g = google.filter((u) => SECRET.some((re) => re.test(u)));
    check('nothing sent to Google names a client', !g.length, g.join(' | '));
  });

  await D.ctx.close(); await S.ctx.close();
  const real = errors.filter((e) => !/ResizeObserver/.test(e));
  check('no page errors', !real.length, real.slice(0, 3).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('\nFailures:\n  ' + failures.join('\n  ')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
