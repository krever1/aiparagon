// Care portal v12.47 (Erica's note of Nov 11 on the Templates page, with Kser's picks: subfolders are the
// binder's tabs; the layout buttons move to the header on every page). Templates: each binder's forms in
// collapsible subfolders (its tabs), a file-type badge on every row (FORM, PDF, DOC, JPG...) and no "Editable
// in-app"; Move to... on every row (a template's signed copies follow it, a library PDF is listed where it is
// moved, saved for the team and read back after a reload); in edit mode a drag handle beside the badge, dragging
// onto a subfolder, a binder's heading or another row, reordering two templates as before, + Subfolder adding a
// tab to the binder; the builder's Subfolder next to its binder. Every editable page: Done editing and Reset
// layout in the header, no floating pair while editing, Customize layout kept. Signed in to a stub team with the
// sample records shown, then the demo view for staff, and a phone.
// See tests/README.md. Usage: node tests/portal-templates-org.test.js [baseline.html]
const H = require('./lib/portal-harness');

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const NOW = new Date(2026, 10, 11, 9, 0, 0);

(async () => {
  const env = await H.start(process.argv[2]);
  const errors = [];
  const dir = 'dana@maple.test';
  const S = { email: dir, password: 'qa-pass-1234', role: 'director',
    program: [{ key: 'users', value: { map: { [dir]: { name: 'Dana Director', role: 'director', title: 'Executive Director' } } } },
      { key: 'org', value: { name: 'Maple Care' } },
      { key: 'pilot', value: { signatures: { ['u:' + dir]: { by: 'Dana Director', at: 'Oct 1, 2026', role: 'Director' } } } }] };
  const row = (k) => { const r = S.program.find((x) => x.key === k); return r ? r.value : undefined; };
  const TPLW = [];                                                     // what the page saves to np_demo_templates
  const rest = async ({ method, path, body }) => {
    if (path.startsWith('/auth/v1/token?grant_type=refresh_token')) return { status: 200, body: { access_token: 'qa-access-token', refresh_token: 'qa-refresh-token', expires_in: 3600, token_type: 'bearer', user: { id: 'qa-user', email: dir } } };
    if (path.startsWith('/auth/v1/user')) return { status: 200, body: { id: 'qa-user', email: dir } };
    if (path.startsWith('/functions/v1/np-gcal')) return { status: 200, body: { ready: true, connected: false, accounts: [] } };
    if (path.startsWith('/rest/v1/np_demo_templates') && method === 'POST') { try { let b = JSON.parse(body || '[]'); (Array.isArray(b) ? b : [b]).forEach((x) => TPLW.push(x)); } catch (e) {} return { status: 201, body: [] }; }
    return null;
  };
  const booted = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 15000 });
  const signedIn = async (viewport) => {
    const { ctx, page } = await H.newPage(env, { session: S, bucket: errors, rest, viewport: viewport || { width: 1440, height: 1000 } });
    await page.clock.setFixedTime(NOW);
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    await page.fill('#liEmail', S.email); await page.fill('#liPw', S.password); await page.click('#liGo');
    await page.waitForFunction(() => typeof realSession === 'function' && realSession() && el('app').classList.contains('on'), null, { timeout: 20000 });
    await page.evaluate(() => { closeAll(); go('forms'); }); await page.waitForTimeout(400);
    return { ctx, page };
  };
  const card = (page, bk) => page.evaluate((b) => { const c = document.querySelector(`#view section.card[data-binder="${b}"]`); if (!c) return null;
    const rowOf = (r) => ({ n: r.querySelector('strong').textContent.trim(), b: (r.querySelector('.v1247-b') || {}).textContent || '', line: (r.querySelector('.row-copy > span') || {}).textContent || '' });
    return { note: (c.querySelector('.sec-head p') || {}).textContent || '', top: [...c.querySelectorAll(':scope .card-b > .lrow')].map(rowOf),
      sf: [...c.querySelectorAll('.v1247-sf')].map((s) => ({ n: s.querySelector('.v1247-sfh b').textContent, c: +s.querySelector('.v1247-n').textContent, open: s.querySelector('.v1247-sfh').getAttribute('aria-expanded') === 'true', rows: [...s.querySelectorAll('.lrow')].map(rowOf) })) }; }, bk);
  const sfToggle = async (page, bk, sub) => { await page.click(`#view section.card[data-binder="${bk}"] .v1247-sf[data-tsf="${bk}::${sub}"] .v1247-sfh`); await page.waitForTimeout(250); };
  const rowMenu = async (page, name, item) => {
    const ok = await page.evaluate((n) => { const r = [...document.querySelectorAll('#view .lrow')].find((x) => x.querySelector('strong') && x.querySelector('strong').textContent.trim() === n);
      if (!r) return [...document.querySelectorAll('#view .lrow strong')].map((x) => x.textContent.trim()).join(' | '); r.scrollIntoView({ block: 'center' }); r.querySelector('.rm-dot').click(); return true; }, name);
    if (ok !== true) throw new Error('no row ' + name + ' :: ' + ok);
    await page.waitForTimeout(150); await page.click(`#rmPop button:has-text("${item}")`); await page.waitForTimeout(250); };
  const rowSel = async (page, name) => { const k = await page.evaluate((n) => { const r = [...document.querySelectorAll('#view .lrow[data-trow]')].find((x) => x.querySelector('strong').textContent.trim() === n); if (r) r.scrollIntoView({ block: 'center' }); return r ? r.getAttribute('data-trow') : null; }, name);
    if (!k) throw new Error('no draggable row ' + name); return page.locator(`#view .lrow[data-trow="${k.replace(/"/g, '\\"')}"]`); };
  // a drag the way the browser sends it (dragstart, dragover, drop, dragend), for targets far down the page:
  // a real mouse drag that has to scroll on the way loses the drop in headless Chromium (the short one below is real)
  const dnd = (page, srcSel, dstSel) => page.evaluate(([a, b]) => { const s = document.querySelector(a), d = document.querySelector(b); if (!s || !d) return false; const dt = new DataTransfer();
    s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); if (s.isConnected) s.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); return true; }, [srcSel, dstSel]);
  const rowKey = (page, name) => page.evaluate((n) => { const r = [...document.querySelectorAll('#view .lrow[data-trow]')].find((x) => x.querySelector('strong').textContent.trim() === n); return r ? r.getAttribute('data-trow') : null; }, name);
  const md = (page) => page.evaluate(() => ({ t: el('mdTitle').textContent.trim(), b: el('mdBody').innerText, open: el('modal').classList.contains('on') }));
  const lastToast = (page) => page.evaluate(() => (window.__toasts || []).slice(-1)[0] || '');
  const watchToasts = (page) => page.evaluate(() => { window.__toasts = []; const o = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return o.apply(this, arguments); }; });

  // ======================= 1. subfolders and badges =======================
  let { ctx, page } = await signedIn();
  await watchToasts(page);
  let A = await card(page, 'Agency'), M = await card(page, 'Medical'), D = await card(page, 'Daily');
  check('each binder lists its forms in its own tabs as subfolders, after the forms in no subfolder', A && A.top.length > 0 && A.sf.length > 0 && M.sf.some((s) => s.n === 'Lab Works') && D.sf.some((s) => s.n === 'Fire Drills & Safety'), JSON.stringify({ a: A && A.sf.map((s) => s.n), m: M && M.sf.map((s) => s.n) }));
  check('subfolders are closed with a count until opened; the heading says how many there are', A.sf.every((s) => !s.open && s.c > 0 && !s.rows.length) && /^\d+ subfolders?$/.test(A.note), JSON.stringify(A.sf.slice(0, 3)) + ' ' + A.note);
  check('the subfolders follow the binder’s tab order', (() => { const tabs = ['Face Sheet', 'Emergency Information', 'Insurance']; const got = A.sf.map((s) => s.n).filter((n) => tabs.includes(n)); return got.join() === tabs.filter((t) => got.includes(t)).join(); })());
  await sfToggle(page, 'Medical', 'Lab Works');
  M = await card(page, 'Medical');
  const lab = M.sf.find((s) => s.n === 'Lab Works');
  check('clicking a subfolder opens it (caret, aria-expanded) and shows its forms', lab.open && lab.rows.length === lab.c && lab.rows.some((r) => /Lab work/.test(r.n)), JSON.stringify(lab));
  check('an open subfolder stays open on this device', await page.evaluate(() => /Medical::Lab Works/.test(localStorage.getItem(LSK('np_tplsf')) || '')));
  const all = await page.evaluate(() => [...document.querySelectorAll('#view .lrow')].map((r) => ({ n: r.querySelector('strong').textContent.trim(), b: (r.querySelector('.v1247-b') || {}).textContent || '' })));
  check('every row has a file-type badge (FORM, PDF, DOC, JPG and the like)', all.length > 10 && all.every((r) => /^(FORM|PDF|DOCX?|JPG|PNG|HEIC|FILE|RTF|ODT)$/.test(r.b)), JSON.stringify(all.filter((r) => !/^(FORM|PDF|DOCX?|JPG|PNG|FILE)$/.test(r.b)).slice(0, 5)));
  check('ACRC forms that fill in on screen say FORM; the plain files say PDF', A.top.some((r) => r.n === 'Personnel Table of Contents' && r.b === 'FORM') && A.top.some((r) => r.n === 'Weekly Staff Schedule' && r.b === 'PDF'), JSON.stringify(A.top.slice(0, 6)));
  check('no "Editable in-app" anywhere on the page', !/editable in.?app/i.test(await page.evaluate(() => el('view').innerText)));
  check('a template made in the portal says FORM', lab.rows.every((r) => r.b === 'FORM'), JSON.stringify(lab.rows));
  await page.evaluate(() => { TEMPLATES5.push({ id: 'qa-ov', name: 'Scanned intake', fields: [{ l: 'Name', ty: 'text', ov: { p: 0, x: 1, y: 1, w: 10, h: 3 } }], dest: 'Medical', sub: 'Lab Works', overlay: { kind: 'photo', file: 'intake-photo.jpg', pages: [{ w: 800, h: 1000 }] } }); render(); });
  await page.waitForTimeout(250);
  M = await card(page, 'Medical');
  check('an uploaded form shows the type of the file it was made from (a photo: JPG)', M.sf.find((s) => s.n === 'Lab Works').rows.some((r) => r.n === 'Scanned intake' && r.b === 'JPG'), JSON.stringify(M.sf.find((s) => s.n === 'Lab Works').rows));
  await page.evaluate(() => { const i = TEMPLATES5.findIndex((t) => t.id === 'qa-ov'); TEMPLATES5.splice(i, 1); render(); });

  // ======================= 2. Move to... =======================
  await rowMenu(page, 'Lab work', 'Move to');
  let m = await md(page);
  check('Move to… on a template: a window with the binder and its subfolder, picked where it is now', /^Move to/.test(m.t) && await page.evaluate(() => el('fpBinder').value === 'Medical' && el('fpSub').value === 'Lab Works') && /signed copies will file where you move it/.test(m.b), m.t + ' ' + m.b.slice(0, 120));
  await page.selectOption('#fpBinder', 'Daily'); await page.waitForTimeout(150);
  check('changing the binder lists that binder’s tabs', await page.evaluate(() => [...el('fpSub').options].some((o) => o.value === 'Vital Signs') && ![...el('fpSub').options].some((o) => o.value === 'Lab Works')));
  await page.selectOption('#fpSub', 'Vital Signs'); await page.click('#mdFoot button:has-text("Move")'); await page.waitForTimeout(400);
  D = await card(page, 'Daily'); M = await card(page, 'Medical');
  const vs = D.sf.find((s) => s.n === 'Vital Signs');
  check('the template moves: listed in the Daily binder’s Vital Signs subfolder (opened), gone from Medical / Lab Works', vs && vs.open && vs.rows.some((r) => r.n === 'Lab work' && /files to Daily Logs binder \/ Vital Signs|files to .* \/ Vital Signs/.test(r.line)) && !((M.sf.find((s) => s.n === 'Lab Works') || { rows: [] }).rows.some((r) => r.n === 'Lab work')), JSON.stringify(vs));
  check('…saved with its new binder and tab (where its signed copies file)', TPLW.some((w) => w.name === 'Lab work' && w.dest === 'Daily' && w.sub === 'Vital Signs'), JSON.stringify(TPLW.slice(-2)));
  check('…and says where it went', /^Moved to .*Vital Signs\.$/.test(await lastToast(page)), await lastToast(page));
  await rowMenu(page, 'Weekly Staff Schedule', 'Move to');
  check('Move to… on a library PDF too', /^Move to/.test((await md(page)).t) && await page.evaluate(() => el('fpBinder').value === 'Agency' && el('fpSub').value === ''));
  await page.selectOption('#fpBinder', 'Medical'); await page.waitForTimeout(150); await page.selectOption('#fpSub', 'Dental'); await page.click('#mdFoot button:has-text("Move")'); await page.waitForTimeout(400);
  A = await card(page, 'Agency'); M = await card(page, 'Medical');
  check('the PDF is listed in Medical / Dental and no longer in the Agency binder', M.sf.find((s) => s.n === 'Dental').rows.some((r) => r.n === 'Weekly Staff Schedule' && r.b === 'PDF') && !A.top.some((r) => r.n === 'Weekly Staff Schedule'), JSON.stringify(M.sf.find((s) => s.n === 'Dental')));
  const pl = row('tplplace');
  check('where a library form sits is saved for the team', pl && pl.map && pl.map['libs:Weekly Staff Schedule'] && pl.map['libs:Weekly Staff Schedule'].b === 'Medical' && pl.map['libs:Weekly Staff Schedule'].sub === 'Dental', JSON.stringify(pl));

  // ======================= 3. edit mode: handle, drag, + Subfolder, reorder =======================
  await page.evaluate(() => pageEdit(true)); await page.waitForTimeout(400);
  const ed = await page.evaluate(() => { const r = document.querySelector('#view .lrow[data-trow]'); return { n: document.querySelectorAll('#view .lrow[data-trow][draggable="true"]').length, all: document.querySelectorAll('#view .lrow').length,
    order: r ? [...r.children].slice(0, 2).map((c) => c.className) : [] }; });
  check('edit mode: every row can be dragged, its ⠿ handle beside the badge (the badge stays)', ed.n === ed.all && ed.n > 10 && /v1247-h/.test(ed.order[0]) && /v1247-b/.test(ed.order[1]), JSON.stringify(ed));
  A = await card(page, 'Agency');
  check('edit mode shows every tab of the binder, empty ones too, to drop into', A.sf.length === (await page.evaluate(() => subsOf('Agency').length)), A.sf.length + '');
  page.once('dialog', (d) => d.accept('Intake forms'));
  await page.click('#view section.card[data-binder="Agency"] button:has-text("Subfolder")'); await page.waitForTimeout(350);
  A = await card(page, 'Agency');
  const sb = row('subbinders');
  check('+ Subfolder adds a tab to the binder (the same tabs Documents uses), open and empty', A.sf.some((s) => s.n === 'Intake forms' && s.open && s.c === 0) && sb && sb.map && (sb.map.Agency || []).includes('Intake forms') && await page.evaluate(() => subsOf('Agency').includes('Intake forms')), JSON.stringify(A.sf.find((s) => s.n === 'Intake forms')));
  check('an empty subfolder says to drag a form there', /Nothing in this subfolder yet\. Drag a form here\./.test(await page.evaluate(() => document.querySelector('#view .v1247-sf[data-tsf="Agency::Intake forms"]').innerText)));
  check('the drag starts on the row', await dnd(page, `#view .lrow[data-trow="${await rowKey(page, 'Personnel Table of Contents')}"]`, '#view .v1247-sf[data-tsf="Agency::Intake forms"] .v1247-sfh')); await page.waitForTimeout(400);
  A = await card(page, 'Agency');
  check('dragging a form onto a subfolder moves it there', A.sf.find((s) => s.n === 'Intake forms').rows.some((r) => r.n === 'Personnel Table of Contents') && !A.top.some((r) => r.n === 'Personnel Table of Contents'), JSON.stringify(A.sf.find((s) => s.n === 'Intake forms')));
  await dnd(page, `#view .lrow[data-trow="${await rowKey(page, 'Weekly Staff Schedule')}"]`, '#view section.card[data-binder="Agency"] .sec-head h2'); await page.waitForTimeout(400);
  A = await card(page, 'Agency');
  check('dragging onto a binder’s heading moves it to that binder, outside any subfolder', A.top.some((r) => r.n === 'Weekly Staff Schedule'), JSON.stringify(A.top.map((r) => r.n)));
  check('back where it came from, nothing is kept for it', !((row('tplplace') || {}).map || {})['libs:Weekly Staff Schedule'], JSON.stringify(row('tplplace')));
  // a template dropped on a row elsewhere takes that row's place; two templates in one place reorder
  await page.evaluate(() => { TEMPLATES5.push({ id: 'qa-t1', name: 'QA first', fields: [{ l: 'A', ty: 'text' }], dest: 'Agency', sub: 'Intake forms' }, { id: 'qa-t2', name: 'QA second', fields: [{ l: 'B', ty: 'text' }], dest: 'Agency', sub: 'Intake forms' }); render(); });
  await page.waitForTimeout(250);
  const before = await page.evaluate(() => TEMPLATES5.filter((t) => /^qa-t/.test(t.id)).map((t) => t.id).join());
  await page.locator('#view .lrow[data-trow="t:qa-t2"]').dragTo(page.locator('#view .lrow[data-trow="t:qa-t1"]')); await page.waitForTimeout(350);
  const after = await page.evaluate(() => TEMPLATES5.filter((t) => /^qa-t/.test(t.id)).map((t) => t.id).join());
  check('two templates in the same subfolder: dropping one on the other reorders them, as before', before === 'qa-t1,qa-t2' && after === 'qa-t2,qa-t1' && row('tplorder'), before + ' → ' + after);
  await dnd(page, '#view .lrow[data-trow="t:qa-t1"]', `#view .lrow[data-trow="${await rowKey(page, 'Monthly Fire Drill Record')}"] .row-copy`); await page.waitForTimeout(350);
  check('a template dropped on a form somewhere else moves to that form’s binder and subfolder', await page.evaluate(() => { const t = tplById('qa-t1'); return t.dest === 'Agency' && !t.sub; }), JSON.stringify(await page.evaluate(() => tplById('qa-t1'))));

  // ======================= 4. header buttons in edit mode, on every editable page =======================
  const head = async (view) => { await page.evaluate((v) => { pageEdit(false); go(v); }, view); await page.waitForTimeout(250); await page.evaluate(() => pageEdit(true)); await page.waitForTimeout(300);
    return page.evaluate(() => ({ fab: !!el('layFab'), fab2: !!el('layFab2'), b: [...document.querySelectorAll('#view .page-hd button, #view .page-h button')].filter((x) => x.offsetParent).map((x) => x.textContent.trim()).filter((t) => /Done editing|Reset layout/.test(t)) })); };
  for (const v of ['forms', 'templates', 'tasks', 'safety', 'trainhub', 'acct', 'clients', 'team']) {
    const h = await head(v);
    check(`${v}: editing shows Done editing and Reset layout in the header, and no floating buttons`, !h.fab && !h.fab2 && h.b.join('|') === '✓ Done editing|↺ Reset layout', JSON.stringify(h));
  }
  await page.evaluate(() => { pageEdit(false); go('team'); }); await page.waitForTimeout(250);
  await page.evaluate(() => { let s = visibleStaff()[0]; if (!s) { STAFF.push({ id: 'qa-s9', name: 'Jo Rivera', init: 'JR', role: 'Direct support professional', home: '', hired: '2026-01-05', phone: '', email: '' }); s = STAFF[STAFF.length - 1]; } openStaffPage(s.id); }); await page.waitForTimeout(300);
  await page.evaluate(() => pageEdit(true)); await page.waitForTimeout(300);
  const sp = await page.evaluate(() => ({ fab: !!el('layFab2'), b: [...document.querySelectorAll('#view .page-h button, #view .page-hd button')].map((x) => x.textContent.trim()).filter((t) => /Done editing|Reset layout/.test(t)) }));
  check('the staff page too', !sp.fab && sp.b.includes('↺ Reset layout') && sp.b.some((t) => /Done editing/.test(t)), JSON.stringify(sp));
  await page.click('#view button:has-text("Reset layout")'); await page.waitForTimeout(250);
  check('Reset layout puts the page back (as the floating button did)', /Layout back to the default/.test(await lastToast(page)), await lastToast(page));
  await page.click('#view button:has-text("Done editing")'); await page.waitForTimeout(300);
  const done = await page.evaluate(() => ({ ed: state.layoutEdit, fab: el('layFab') && el('layFab').textContent.trim(), hd: !!document.querySelector('#view [data-layhd]') }));
  check('Done editing ends editing, says the layout is saved, and Customize layout is back at the bottom', !done.ed && /Customize layout/.test(done.fab || '') && !done.hd && /Saved to your account/.test(await lastToast(page)), JSON.stringify(done) + ' ' + await lastToast(page));

  // ======================= 5. the builder: Subfolder next to its binder =======================
  const tp = await page.evaluate(() => { go('forms'); const t = TEMPLATES5.find((x) => !ovIs(x) && x.sub && normBinder(x.dest || '').b === 'Medical'); if (!t) return { none: TEMPLATES5.map((x) => x.id + ':' + x.dest + '/' + x.sub).join(', ') }; openTplEditor(t.id); return { id: t.id, sub: t.sub }; }); await page.waitForTimeout(500);
  const bsel = await page.evaluate(() => { const s = el('tpeSub'); return s ? { v: s.value, opts: [...s.options].map((o) => o.value) } : null; });
  check('Create/edit template: a Subfolder picker next to Files to, showing the template’s tab', bsel && bsel.v === tp.sub && bsel.opts.includes('Lab Works'), JSON.stringify({ bsel, tp }));
  await page.evaluate(() => { const b = document.querySelector('.tpe-dest select[data-list="binder"]'); b.value = 'Daily'; b.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(150);
  const bsel2 = await page.evaluate(() => ({ opts: [...el('tpeSub').options].map((o) => o.value), sub: tpeT().sub, dest: tpeT().dest }));
  check('changing its binder lists that binder’s tabs and clears the old tab', bsel2.opts.includes('Vital Signs') && !bsel2.opts.includes('Dental') && bsel2.sub === '' && bsel2.dest === 'Daily', JSON.stringify(bsel2));
  await page.selectOption('#tpeSub', 'MAR');
  check('picking a subfolder sets it on the template', await page.evaluate(() => tpeT().sub === 'MAR'));
  await page.evaluate(() => closeAll());
  await ctx.close();

  // ======================= 6. after a reload: the moves are read back =======================
  ({ ctx, page } = await signedIn());
  await page.evaluate(() => { const a = TPL_PLACE; window.__pl = JSON.stringify(a); });
  A = await card(page, 'Agency');
  check('after a reload a library form stays where it was moved (Personnel Table of Contents in Intake forms)', A.sf.some((s) => s.n === 'Intake forms' && s.c >= 1) && !A.top.some((r) => r.n === 'Personnel Table of Contents'), await page.evaluate(() => window.__pl));
  await ctx.close();

  // ======================= 7. staff, family and a phone =======================
  async function demo(role, viewport) {
    const { ctx, page } = await H.newPage(env, { viewport: viewport || { width: 1440, height: 900 }, bucket: errors });
    await page.clock.setFixedTime(NOW);
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    await page.evaluate((r) => signIn(r), role); await page.waitForFunction((r) => state.role === r, role);
    return { ctx, page };
  }
  ({ ctx, page } = await demo('staff'));
  await page.evaluate(() => go('forms')); await page.waitForTimeout(300);
  check('staff: Templates stays a director page, as before', await page.evaluate(() => state.view !== 'forms' && !document.querySelector('#view .v1247-sf')));
  await page.evaluate(() => go('tasks')); await page.waitForTimeout(300);
  await page.click('#layFab'); await page.waitForTimeout(300);
  const st2 = await page.evaluate(() => ({ ed: state.layoutEdit, fab: !!el('layFab'), b: [...document.querySelectorAll('#view .page-h button, #view .page-hd button')].map((x) => x.textContent.trim()).filter((t) => /Done editing|Reset layout/.test(t)) }));
  check('staff: Customize layout starts editing; the header then has Done editing and Reset layout', st2.ed && !st2.fab && st2.b.join('|') === '✓ Done editing|↺ Reset layout', JSON.stringify(st2));
  await page.click('#view button:has-text("Done editing")'); await page.waitForTimeout(250);
  check('staff: Done editing ends it', await page.evaluate(() => !state.layoutEdit && !!el('layFab')));
  await ctx.close();
  ({ ctx, page } = await demo('director', { width: 390, height: 844 }));
  await page.evaluate(() => go('forms')); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = document.querySelector('#view .v1247-sfh'); if (b) b.click(); }); await page.waitForTimeout(250);
  const ph = await page.evaluate(() => ({ wide: document.scrollingElement.scrollWidth <= innerWidth + 1, sf: [...document.querySelectorAll('#view .v1247-sfh')].every((b) => b.getBoundingClientRect().right <= innerWidth + 1), badge: [...document.querySelectorAll('#view .v1247-b')].every((b) => b.scrollWidth <= b.clientWidth + 1) }));
  check('390px: subfolders and badges fit, nothing sideways', ph.wide && ph.sf && ph.badge, JSON.stringify(ph));
  await page.evaluate(() => pageEdit(true)); await page.waitForTimeout(300);
  const ph2 = await page.evaluate(() => ({ wide: document.scrollingElement.scrollWidth <= innerWidth + 1, b: [...document.querySelectorAll('#view .page-hd button')].filter((x) => /Done editing|Reset layout/.test(x.textContent)).map((x) => { const r = x.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.height >= 30; }) }));
  check('390px: in edit mode the header buttons fit and can be tapped', ph2.wide && ph2.b.length === 2 && ph2.b.every(Boolean), JSON.stringify(ph2));
  await ctx.close();

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await env.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
