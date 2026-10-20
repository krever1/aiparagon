// App frame tests for E-&-G-Home-Inc.html (#2, the care portal), v12.29: the sidebar and top bar in Erica's
// Home A style (her HomeA.dc.html). Desktop: a white sidebar the full height of the window that stays put while
// the page scrolls, the agency's name on a deep green tile with the product under it, the menu in groups, badges,
// the person signed in with Sign out, the build and links at the bottom; a top bar with no band of its own: white
// search, white Help, Messages and Notifications buttons, and Ask Spectrum (the floating Ask button only on a
// phone). Checked with computed styles and real clicks, for director, staff and family, on every page, and at
// tablet and phone width (the sidebar slides in from the menu button; nothing scrolls sideways). Demo view,
// nothing is saved. See tests/README.md.
// Usage: node tests/portal-frame.test.js [baseline.html]
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
  async function open(viewport, role) {
    const { ctx, page } = await H.newPage(env, { viewport, bucket: errors });
    await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 15000 });
    if (role) { await page.evaluate((r) => signIn(r), role); await page.waitForFunction((r) => state.role === r, role); }
    await page.waitForTimeout(300);
    return { ctx, page };
  }
  const css = (page, sel, props) => page.evaluate(([sel, props]) => { const n = document.querySelector(sel); if (!n) return null; const c = getComputedStyle(n); return Object.fromEntries(props.map((p) => [p, c[p]])); }, [sel, props]);
  // what is at the middle of an element: the element itself (or inside it), so nothing is drawn over it
  // the app is zoomed 1.09, so a 44px box can measure 43.99px
  const px = (v, n) => Math.abs(parseFloat(v) - n) < 0.1;
  const onTop = (page, sel) => page.evaluate((sel) => { const n = document.querySelector(sel); if (!n) return false; const r = n.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === n || n.contains(t)); }, sel);

  // ---------------- 1. desktop: the sidebar ----------------
  {
    const { ctx, page } = await open({ width: 1440, height: 1000 });
    const sb = await css(page, '.app.on>.sidebar', ['backgroundColor', 'borderRightWidth', 'borderRightColor', 'width', 'position', 'fontFamily']);
    check('sidebar: white, a 1px line on its right, 248px wide, in Hanken Grotesk', sb.backgroundColor === 'rgb(255, 255, 255)' && parseFloat(sb.borderRightWidth) > 0.8 && sb.borderRightColor === 'rgb(228, 230, 224)' && px(sb.width, 248) && /Hanken Grotesk/.test(sb.fontFamily), JSON.stringify(sb));
    const card = await css(page, '.app.on>.sidebar .side-inner', ['backgroundColor', 'borderTopWidth', 'boxShadow', 'borderRadius']);
    check('sidebar: not a floating card any more (no border, shadow or rounded corners of its own)', card.backgroundColor === 'rgba(0, 0, 0, 0)' && card.borderTopWidth === '0px' && card.boxShadow === 'none' && card.borderRadius === '0px', JSON.stringify(card));
    const tall = await page.evaluate(() => { const r = el('sidebar').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
    check('sidebar: the full height of the window', Math.abs(tall.top) < 1 && Math.abs(tall.bottom - tall.vh) < 3, JSON.stringify(tall));
    await page.evaluate(() => { go('clients'); const t = document.createElement('div'); t.id = 'tallQA'; t.style.height = '3000px'; el('view').appendChild(t); window.scrollTo(0, 900); }); await page.waitForTimeout(150);
    const stuck = await page.evaluate(() => ({ y: scrollY, top: el('sidebar').getBoundingClientRect().top }));
    check('sidebar: stays put while the page scrolls', stuck.y > 600 && Math.abs(stuck.top) < 1, JSON.stringify(stuck));
    await page.evaluate(() => { el('tallQA').remove(); window.scrollTo(0, 0); go('home'); });
    const tile = await css(page, '.app.on>.sidebar .brand .dot', ['backgroundColor', 'width', 'borderRadius']);
    check('brand: a 36px deep green tile', tile.backgroundColor === 'rgb(28, 66, 54)' && px(tile.width, 36) && tile.borderRadius === '10px', JSON.stringify(tile));
    const named = await page.evaluate(() => { const was = ONB.org; ONB.org = 'Maple Care'; renderNav(); const r = [el('brandName').textContent, el('brandSub').textContent, getComputedStyle(el('brandSub')).display];
      ONB.org = 'Spectrum'; renderNav(); r.push(el('brandName').textContent, getComputedStyle(el('brandSub')).display); ONB.org = was; renderNav(); return r; });
    check('brand: the agency’s name, with "Spectrum Care Advisory OS" under it; just the product when there is no agency name',
      named[0] === 'Maple Care' && named[1] === 'Spectrum Care Advisory OS' && named[2] !== 'none' && named[3] === 'Spectrum Care Advisory OS' && named[4] === 'none', JSON.stringify(named));
    const lab = await css(page, '.app.on>.sidebar .nav-label', ['fontSize', 'fontWeight', 'textTransform', 'color', 'letterSpacing']);
    check('menu: group names small, upper case, grey', lab.fontSize === '12px' && lab.fontWeight === '600' && lab.textTransform === 'uppercase' && lab.color === 'rgb(102, 116, 109)', JSON.stringify(lab));
    const groups = await page.evaluate(() => [...document.querySelectorAll('#nav .nav-label')].map((n) => n.textContent));
    check('menu: in the design’s groups (Today, Care, Records, Setup)', ['TODAY', 'CARE', 'RECORDS', 'SETUP'].every((g) => groups.map((x) => x.toUpperCase()).includes(g)), groups.join(', '));
    const it = await css(page, '.app.on>.sidebar .nav-item:not(.active)', ['fontSize', 'color', 'minHeight', 'borderRadius', 'backgroundColor']);
    const act = await css(page, '.app.on>.sidebar .nav-item.active', ['backgroundColor', 'color', 'fontWeight']);
    const actIco = await css(page, '.app.on>.sidebar .nav-item.active .ni', ['color']);
    check('menu: 15px items at least 42px tall, rounded', it.fontSize === '15px' && it.minHeight === '42px' && it.borderRadius === '10px' && it.color === 'rgb(38, 51, 45)', JSON.stringify(it));
    check('menu: the page you are on is pale green, its name bold and its icon green', act.backgroundColor === 'rgb(229, 239, 234)' && act.color === 'rgb(20, 51, 42)' && act.fontWeight === '600' && actIco.color === 'rgb(31, 107, 82)', JSON.stringify([act, actIco]));
    const badges = await page.evaluate(() => [...document.querySelectorAll('#nav .nav-item .badge')].map((b) => ({ alert: b.classList.contains('alert'), bg: getComputedStyle(b).backgroundColor, c: getComputedStyle(b).color, h: getComputedStyle(b).height, page: b.closest('.nav-item').getAttribute('onclick') })));
    const tb = badges.find((b) => /tasks/.test(b.page)), ib = badges.find((b) => /safety/.test(b.page));
    const openN = await page.evaluate(() => visIncidents().filter((i) => i.status !== 'Closed').length);
    check('menu: counts in grey pills; the Safety log’s open incidents in red, the same number as the home page', tb && tb.bg === 'rgb(238, 240, 235)' && px(tb.h, 22) && ib && ib.alert && ib.bg === 'rgb(251, 233, 230)' && ib.c === 'rgb(163, 38, 27)' && openN > 0
      && await page.evaluate((n) => document.querySelector('#nav .nav-item[onclick*="safety"] .badge').textContent === String(n), openN), JSON.stringify(badges));
    // a real click on a menu item opens its page and marks it
    await page.click('.app.on>.sidebar .nav-item[onclick*="\'templates\'"]'); await page.waitForTimeout(250);
    check('menu: a real click opens the page and marks it', await page.evaluate(() => state.view === 'templates' && /templates/.test(document.querySelector('#nav .nav-item.active').getAttribute('onclick'))));
    const prog = await page.evaluate(() => ({ other: !!document.querySelector('#sideProg .sprog'), home: (go('home'), !!document.querySelector('#sideProg .sprog')) }));
    check('This week: in the sidebar on other pages, not on home (home shows it in its own card)', prog.other && !prog.home, JSON.stringify(prog));
    const who = await css(page, '.app.on>.sidebar .side-user', ['backgroundColor', 'borderRadius']);
    const av = await css(page, '.app.on>.sidebar .side-user .av', ['backgroundColor', 'color', 'width', 'borderRadius']);
    check('you: on a soft grey card, with your initials on a round deep green badge', who.backgroundColor === 'rgb(244, 243, 238)' && who.borderRadius === '12px' && av.backgroundColor === 'rgb(28, 66, 54)' && av.color === 'rgb(255, 255, 255)' && px(av.width, 38), JSON.stringify([who, av]));
    await page.evaluate(() => { window._out = 0; window._signOutWas = window.signOut; window.signOut = () => { window._out++; }; });
    await page.click('.app.on>.sidebar .su-out'); await page.waitForTimeout(150);
    const out = await page.evaluate(() => ({ out: window._out, view: state.view }));
    check('you: Sign out is on your card, and a real click signs out (without opening your profile)', out.out === 1 && out.view === 'home', JSON.stringify(out));
    await page.evaluate(() => { window.signOut = window._signOutWas; });
    await page.click('.app.on>.sidebar .side-user .su-t'); await page.waitForTimeout(200);
    check('you: clicking your name still opens your profile', await page.evaluate(() => state.view === 'profile'));
    await page.evaluate(() => go('home'));
    const foot = await page.evaluate(() => ({ t: document.querySelector('.side-foot').innerText, link: getComputedStyle(el('pilotLink')).color }));
    check('bottom: "Spectrum Care Advisory OS · v12.29 beta", "Built by AI Paragon Consulting", then Pilot agreement and Help and support in green',
      /Spectrum Care Advisory OS · v12\.(29|[3-9]\d) beta/.test(foot.t) && /Built by AI Paragon Consulting/.test(foot.t) && /Pilot agreement/.test(foot.t) && /Help and support/.test(foot.t) && foot.link === 'rgb(31, 107, 82)', JSON.stringify(foot));
    const reach = await page.evaluate(() => { const s = document.querySelector('.app.on>.sidebar .side-inner'); s.scrollTop = 1e6; const f = document.querySelector('.side-foot').getBoundingClientRect(); const r = el('sidebar').getBoundingClientRect(); s.scrollTop = 0; return { fb: f.bottom, sb: r.bottom }; });
    check('bottom: reachable, the sidebar scrolls on its own when the window is short', reach.fb <= reach.sb + 1, JSON.stringify(reach));

    // ---------------- 2. desktop: the top bar ----------------
    const bar = await css(page, '.app.on .topbar', ['backgroundColor', 'boxShadow']);
    check('top bar: no band of its own', bar.backgroundColor === 'rgba(0, 0, 0, 0)' && bar.boxShadow === 'none', JSON.stringify(bar));
    const se = await css(page, '.app.on .topbar .search', ['backgroundColor', 'borderTopColor', 'height', 'borderRadius', 'maxWidth']);
    check('top bar: a white search box, 44px tall, rounded, up to 560px wide', se.backgroundColor === 'rgb(255, 255, 255)' && se.borderTopColor === 'rgb(224, 227, 221)' && px(se.height, 44) && se.borderRadius === '12px' && se.maxWidth === '560px', JSON.stringify(se));
    check('top bar: it asks for clients by UCI, staff and appointments', await page.evaluate(() => el('globalSearch').placeholder) === 'Search clients by UCI, staff, appointments');
    const btns = await page.evaluate(() => [...document.querySelectorAll('.app.on .topbar .icon-btn')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => ({ t: b.title, bg: getComputedStyle(b).backgroundColor, w: getComputedStyle(b).width, b: getComputedStyle(b).borderTopColor })));
    check('top bar: Help and support, Messages and Notifications, as white 44px buttons', btns.map((b) => b.t).join(',') === 'Help and support,Messages,Notifications' && btns.every((b) => b.bg === 'rgb(255, 255, 255)' && px(b.w, 44) && b.b === 'rgb(224, 227, 221)'), JSON.stringify(btns));
    const ask = await css(page, '.tb-ask', ['backgroundColor', 'color', 'height', 'fontWeight', 'display']);
    check('top bar: Ask Spectrum, deep green, last in the bar', ask.backgroundColor === 'rgb(28, 66, 54)' && ask.color === 'rgb(255, 255, 255)' && px(ask.height, 44) && ask.fontWeight === '600' && await page.evaluate(() => document.querySelector('.topbar').lastElementChild.classList.contains('tb-ask') && /Ask Spectrum/.test(document.querySelector('.tb-ask').textContent)), JSON.stringify(ask));
    check('top bar: nothing is drawn over Ask Spectrum, search or the buttons', await onTop(page, '.tb-ask') && await onTop(page, '#globalSearch') && await onTop(page, '.topbar .icon-btn[title="Notifications"]'));
    check('top bar: no Sign out button in it any more (it is on your card)', await page.evaluate(() => !document.querySelector('.topbar [title="Sign out"]')));
    check('floating Ask button: hidden on a computer (Ask Spectrum is in the top bar)', (await css(page, '#askFab', ['display'])).display === 'none');
    await page.click('.tb-ask'); await page.waitForTimeout(250);
    const opened = await page.evaluate(() => ({ on: el('askPanel').classList.contains('on'), fab: getComputedStyle(el('askFab')).display }));
    await page.click('.tb-ask'); await page.waitForTimeout(200);
    const closed = await page.evaluate(() => ({ on: el('askPanel').classList.contains('on'), fab: getComputedStyle(el('askFab')).display }));
    check('Ask Spectrum: a real click opens the Ask panel, and again closes it; the floating button stays hidden', opened.on && !closed.on && opened.fab === 'none' && closed.fab === 'none', JSON.stringify([opened, closed]));
    await page.click('.topbar .icon-btn[title="Messages"]'); await page.waitForTimeout(200);
    check('Messages: a real click opens Messages', await page.evaluate(() => state.view === 'messages'));
    await page.click('.topbar .icon-btn[title="Notifications"]'); await page.waitForTimeout(250);
    check('Notifications: a real click opens them', await page.evaluate(() => el('drawer').classList.contains('on') || el('modal').classList.contains('on') || !!document.querySelector('.alerts-pop,.notif-pop,.al-pop')));
    await page.evaluate(() => closeAll());
    await page.click('.topbar .icon-btn[title="Help and support"]'); await page.waitForTimeout(250);
    check('Help and support: a real click opens it', await page.evaluate(() => el('modal').classList.contains('on') || el('drawer').classList.contains('on')));
    await page.evaluate(() => { closeAll(); go('home'); });
    // the tour points at Ask Spectrum in the top bar
    const tour = await page.evaluate(async () => { const steps = TOURS[state.role]; const i = steps.findIndex((s) => /Ask/i.test(s.t) || /ask/i.test(s.sel)); return { sel: i >= 0 ? steps[i].sel : null }; });
    check('tour: its Ask step points at Ask Spectrum in the top bar', tour.sel === '.tb-ask', JSON.stringify(tour));
    await ctx.close();
  }

  // ---------------- 3. every page, for each role ----------------
  for (const role of ['director', 'staff', 'family']) {
    const { ctx, page } = await open({ width: 1280, height: 900 }, role);
    const res = await page.evaluate(() => {
      const out = [];
      NAV[state.role].filter((n) => n.id).forEach((n) => { go(n.id);
        const a = document.querySelector('#nav .nav-item.active'), sb = getComputedStyle(el('sidebar')), tb = document.querySelector('.topbar');
        out.push({ id: n.id, active: !!a && a.getAttribute('onclick').includes("'" + n.id + "'"), white: sb.backgroundColor === 'rgb(255, 255, 255)', ask: !!tb.querySelector('.tb-ask'), wide: document.documentElement.scrollWidth > innerWidth + 1, view: !!el('view').firstElementChild }); });
      go('home'); return out;
    });
    const bad = res.filter((r) => !r.active || !r.white || !r.ask || r.wide || !r.view);
    check(role + ': every page opens in the new frame, marked in the menu, nothing wider than the window', res.length >= 3 && !bad.length, bad.map((b) => JSON.stringify(b)).join(' ') || res.length + ' pages');
    await ctx.close();
  }

  // ---------------- 4. phone and tablet ----------------
  for (const [tag, vp] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 768, height: 1024 }]]) {
    const { ctx, page } = await open(vp);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    check(tag + ': nothing scrolls sideways', w.sw <= w.cw, JSON.stringify(w));
    const hidden = await page.evaluate(() => { const r = el('sidebar').getBoundingClientRect(); return r.right <= 1; });
    check(tag + ': the sidebar is tucked away until the menu button', hidden);
    const askI = await page.evaluate(() => { const b = document.querySelector('.tb-ask'), l = b.querySelector('.tb-ask-l'); return { w: getComputedStyle(b).width, label: getComputedStyle(l).display, fab: getComputedStyle(el('askFab')).display }; });
    check(tag + ': Ask Spectrum is a 44px button in the top bar, and the floating Ask button is there for your thumb', px(askI.w, 44) && askI.label === 'none' && askI.fab !== 'none', JSON.stringify(askI));
    check(tag + ': nothing is drawn over the menu button', await onTop(page, '.topbar .hamb'));
    await page.click('.topbar .hamb'); await page.waitForTimeout(450);
    const op = await page.evaluate(() => { const r = el('sidebar').getBoundingClientRect(); return { open: el('sidebar').classList.contains('open'), left: r.left, white: getComputedStyle(el('sidebar')).backgroundColor }; });
    check(tag + ': a real click on the menu button slides the sidebar in', op.open && Math.abs(op.left) < 2 && op.white === 'rgb(255, 255, 255)', JSON.stringify(op));
    const bottom = await page.evaluate(() => { const sc = [el('sidebar'), document.querySelector('.app.on>.sidebar .side-inner')]; sc.forEach((s) => { s.scrollTop = 1e6; });
      const f = document.querySelector('.side-foot').getBoundingClientRect(); return { fb: f.bottom, vh: innerHeight }; });
    check(tag + ': the bottom of the sidebar (your card, the build, the links) can be scrolled to', bottom.fb <= bottom.vh + 1, JSON.stringify(bottom));
    await page.click('.app.on>.sidebar .nav-item[onclick*="\'calendar\'"]'); await page.waitForTimeout(450);
    const after = await page.evaluate(() => ({ view: state.view, open: el('sidebar').classList.contains('open') }));
    check(tag + ': picking a page opens it and tucks the sidebar away again', after.view === 'calendar' && !after.open, JSON.stringify(after));
    await ctx.close();
  }

  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
