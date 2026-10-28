// Tests for site-builder.html (#5, the website builder demo built on Puck): the dashboard, a new page
// from each starting point, the editor (side panel, typing on the page, drag and drop, page settings,
// fields that follow a choice, autosave, Publish), the published page (titles, the scroll story moving
// with the scroll and rewinding, reveals, reduced motion, phone width, unsafe links), duplicate and
// delete, a browser that will not save, /builder addresses with Back and Forward, a copy on another
// host or from a file (#/ addresses) and a framed copy. Offline: no fonts or other outside requests.
// Usage: node tests/builder-app.test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FILE = 'site-builder.html';
const KEY = 'apSiteBuilder.v1';
const COMPONENTS = ['Navbar', 'Footer', 'Hero', 'ScrollStory', 'Features', 'Steps', 'Split', 'Faq', 'Cta', 'Heading', 'Text', 'Button', 'Spacer'];

// Same rewrites and redirects as vercel.json, read from the file itself
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const REWRITES = cfg.rewrites.map((r) => ({
  re: new RegExp('^' + r.source.replace(/\/:path\*$/, '(?:/.*)?').replace(/\//g, '\\/') + '$'),
  dest: r.destination,
}));
const REDIRECTS = (cfg.redirects || []).map((r) => ({ source: r.source, dest: r.destination, code: r.permanent ? 308 : 307 }));

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch (e) {}
  const red = REDIRECTS.find((r) => r.source === p);
  if (red) { res.writeHead(red.code, { Location: red.dest }); return res.end(); }
  let file;
  let body = null;
  if (p === '/copy/' + FILE) file = path.join(ROOT, FILE);                  // the same file on a host without the rewrites
  else if (p === '/frame.html') body = '<!doctype html><title>frame</title><iframe id="f" src="/builder/edit/home" style="width:1280px;height:800px;border:0"></iframe>';
  else {
    const hit = REWRITES.find((r) => r.re.test(p));
    file = path.join(ROOT, hit ? hit.dest : p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  }
  if (body != null) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(body); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const pageErrors = [];
  const contexts = [];

  async function open(url, opts) {
    const o = opts || {};
    const ctx = await browser.newContext({
      viewport: o.viewport || { width: 1440, height: 900 },
      reducedMotion: o.reducedMotion || 'no-preference',
      isMobile: !!o.mobile,
      hasTouch: !!o.mobile,
    });
    contexts.push(ctx);
    // Offline on purpose: fonts and anything else outside the test server are refused
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(BASE) || u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    if (o.init) await ctx.addInitScript(o.init);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(url + ' :: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|fonts\.g/.test(m.text())) pageErrors.push(url + ' :: console: ' + m.text().slice(0, 300));
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    return { ctx, page };
  }
  const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
  async function waitFor(page, fn, ms) {
    const end = Date.now() + (ms || 4000);
    for (;;) {
      let v = null;
      try { v = await fn(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() > end) return v;
      await page.waitForTimeout(100);
    }
  }
  async function canvas(page) {
    const f = await waitFor(page, async () => {
      const fr = page.frames().find((x) => x.url() === 'about:srcdoc');
      return fr && (await fr.locator('.sb-site').count()) ? fr : null;
    }, 8000);
    if (!f) throw new Error('the editor canvas did not load');
    return f;
  }
  const visible = (page, sel) => page.locator(sel + ' >> visible=true');
  const pathOf = (page) => new URL(page.url()).pathname;

  /* ---------------- Dashboard and addresses ---------------- */
  {
    const { page } = await open(BASE + '/builder');
    check('dashboard: tab title', (await page.title()) === 'Pages · Site Builder · AI Paragon', await page.title());
    check('dashboard: two sample pages on first visit', (await page.locator('.ap-card').count()) === 2);
    check('dashboard: Home is live', (await page.locator('[data-page="home"] .ap-status').innerText()) === 'Live');
    check('dashboard: Services is a draft', (await page.locator('[data-page="services"] .ap-status').innerText()) === 'Draft');
    check('dashboard: section counts come from the page', (await page.locator('[data-page="home"] .ap-card-meta').innerText()).includes('9 sections'));
    const st = await stored(page);
    check('dashboard: pages saved in this browser under their own key', !!(st && st.pages.length === 2));
    check('dashboard: a live page links to its live view, a draft to its preview',
      (await page.locator('[data-page="home"] a', { hasText: 'View live' }).getAttribute('href')) === '/builder/view/home' &&
      (await page.locator('[data-page="services"] a', { hasText: 'Preview' }).getAttribute('href')) === '/builder/view/services/draft');
  }
  {
    const { page } = await open(BASE + '/builder/');
    check('address: /builder/ settles on /builder', pathOf(page) === '/builder', pathOf(page));
  }
  {
    const { page } = await open(BASE + '/builder/some/old/word');
    check('address: an unknown address shows the dashboard at /builder', pathOf(page) === '/builder' && (await page.locator('.ap-h1').innerText()) === 'Pages', pathOf(page));
  }
  {
    const { page } = await open(BASE + '/builder/edit/no-such-page');
    check('address: a missing page goes to the dashboard', pathOf(page) === '/builder', pathOf(page));
    check('address: and says the page is not in this browser', (await page.locator('.ap-banner').innerText()).includes('not in this browser'));
    await page.locator('.ap-banner button', { hasText: 'Dismiss' }).click();
    check('address: the notice can be dismissed', (await page.locator('.ap-banner').count()) === 0);
  }
  {
    const res = await fetch(BASE + '/site-builder.html', { redirect: 'manual' });
    check('address: the file address forwards to /builder', res.status === 307 && res.headers.get('location') === '/builder', res.status + ' ' + res.headers.get('location'));
  }

  /* ---------------- New page ---------------- */
  {
    const { page } = await open(BASE + '/builder');
    await page.click('button:has-text("New page")');
    check('new page: the dialog opens with the name field focused', await page.evaluate(() => document.activeElement && document.activeElement.id === 'np-name'));
    await page.click('button:has-text("Create page")');
    check('new page: a name is required', (await page.locator('#np-err').innerText()) === 'Give the page a name.' && (await page.locator('.ap-modal').count()) === 1);
    await page.keyboard.press('Escape');
    check('new page: Escape closes the dialog and focus goes back to New page',
      (await page.locator('.ap-modal').count()) === 0 && (await page.evaluate(() => document.activeElement && document.activeElement.textContent.includes('New page'))));
    await page.click('button:has-text("New page")');
    await page.fill('#np-name', 'Spring launch');
    check('new page: the address follows the name', (await page.inputValue('#np-slug')) === 'spring-launch' && (await page.locator('#np-slug-hint').innerText()) === 'The page will be at /spring-launch');
    await page.locator('.ap-choice[data-kind="business"]').click();
    await page.click('button:has-text("Create page")');
    await canvas(page);
    const id = pathOf(page).split('/').pop();
    check('new page: Create opens the editor at /builder/edit/<page>', /^\/builder\/edit\/spring-launch-[a-z0-9]+$/.test(pathOf(page)), pathOf(page));
    const st = await stored(page);
    const p = st.pages.find((x) => x.id === id);
    check('new page: saved with its name, address and the business layout',
      p && p.draft.root.props.title === 'Spring launch' && p.draft.root.props.slug === 'spring-launch' && p.draft.content.length === 8 && p.draft.root.props.theme === 'light' && !p.live,
      p && JSON.stringify(p.draft.root.props));
    check('new page: the editor header names the page', (await page.locator('header').first().innerText()).includes('Spring launch'));
    await visible(page, 'a:has-text("All pages")').click();
    await page.waitForTimeout(200);
    check('new page: listed first on the dashboard as a draft', (await page.locator('.ap-card').first().getAttribute('data-page')) === id && (await page.locator('.ap-card').first().locator('.ap-status').innerText()) === 'Draft');
    // The same address twice gets a number
    await page.click('button:has-text("New page")');
    await page.fill('#np-name', 'Home');
    check('new page: an address in use gets a number', (await page.locator('#np-slug-hint').innerText()) === 'The page will be at /home-2');
    await page.locator('.ap-choice[data-kind="blank"]').click();
    await page.click('button:has-text("Create page")');
    await canvas(page);
    const blank = (await stored(page)).pages.find((x) => x.id === pathOf(page).split('/').pop());
    check('new page: a blank page starts empty at /home-2', blank && blank.draft.content.length === 0 && blank.draft.root.props.slug === 'home-2');
    await page.reload({ waitUntil: 'load' });
    await canvas(page);
    check('new page: still there after a reload', (await stored(page)).pages.length === 4);
  }
  {
    const { page } = await open(BASE + '/builder');
    await page.click('button:has-text("New page")');
    await page.fill('#np-name', 'Showcase');
    await page.click('button:has-text("Create page")');
    const f = await canvas(page);
    check('new page: cinematic is the default starting point', (await f.locator('.sb-story').count()) === 1 && (await f.locator('.sb-hero-h').innerText()).includes('speed of scroll'));
  }

  /* ---------------- Editor ---------------- */
  {
    const { page } = await open(BASE + '/builder/edit/home');
    const f = await canvas(page);
    check('editor: tab title', (await page.title()) === 'Editing Home · Site Builder', await page.title());
    const missing = [];
    for (const c of COMPONENTS) if (!(await page.locator('[data-testid="drawer-item:' + c + '"]').count())) missing.push(c);
    check('editor: every section is in the Blocks list', missing.length === 0, missing.join(', '));
    check('editor: the canvas shows the page', (await f.locator('.sb-hero-h').innerText()) === 'Your story, told at the speed of scroll');
    check('editor: entrance motion is off while editing', (await f.locator('.sb-site').getAttribute('data-motion')) === 'off');
    check('editor: shows Saved before any change', (await page.locator('.ap-save').innerText()) === 'Saved');
    const before = await stored(page);
    check('editor: opening a page does not mark it changed', before.pages.find((p) => p.id === 'home').updatedAt === before.pages.find((p) => p.id === 'home').publishedAt);

    // Page settings: nothing selected shows them
    await page.getByRole('radio', { name: 'Light', exact: true }).check({ force: true });
    await waitFor(page, async () => (await f.locator('.sb-site').getAttribute('data-theme')) === 'light');
    check('editor: page settings change the canvas (theme)', (await f.locator('.sb-site').getAttribute('data-theme')) === 'light');
    await visible(page, '#root_select_accent').selectOption({ label: 'Lime' });
    await waitFor(page, async () => (await f.locator('.sb-site').getAttribute('style') || '').includes('#4A7A0C'));
    check('editor: accent color reaches the page', (await f.locator('.sb-site').getAttribute('style') || '').includes('#4A7A0C'));
    await page.getByRole('radio', { name: 'Dark', exact: true }).check({ force: true });

    // Side panel
    await f.click('.sb-hero-sub');
    const headline = visible(page, 'textarea[name="headline"]');
    await headline.waitFor({ timeout: 4000 });
    await headline.fill('Edited in the side panel');
    await waitFor(page, async () => (await f.locator('.sb-hero-h').innerText()) === 'Edited in the side panel');
    check('editor: a side-panel edit shows on the canvas', (await f.locator('.sb-hero-h').innerText()) === 'Edited in the side panel');
    const saved = await waitFor(page, async () => {
      const s = await stored(page);
      const hero = s.pages.find((p) => p.id === 'home').draft.content.find((b) => b.type === 'Hero');
      return hero.props.headline === 'Edited in the side panel' ? s : null;
    });
    check('editor: autosaved within a moment', !!saved);
    check('editor: the save status settles on Saved', (await waitFor(page, async () => (await page.locator('.ap-save').innerText()) === 'Saved')) === true);

    // Fields that follow a choice
    const bg = visible(page, 'select[id$="_select_background"]');
    check('editor: no video link field while the background is not a video', (await visible(page, 'input[name="videoUrl"]').count()) === 0);
    await bg.selectOption({ label: 'Video' });
    await waitFor(page, async () => (await visible(page, 'input[name="videoUrl"]').count()) === 1);
    check('editor: picking Video adds the video link field', (await visible(page, 'input[name="videoUrl"]').count()) === 1);
    await bg.selectOption({ label: 'Particles (follow the cursor)' });
    await waitFor(page, async () => (await visible(page, 'input[name="videoUrl"]').count()) === 0);
    check('editor: and it goes again for another background', (await visible(page, 'input[name="videoUrl"]').count()) === 0);
    check('editor: the particle background draws on a canvas hidden from screen readers', (await f.locator('.sb-hero canvas.sb-particles[aria-hidden="true"]').count()) === 1);

    // Typing on the page
    await f.click('.sb-hero-h');
    const ce = f.locator('.sb-hero-h [contenteditable]');
    await waitFor(page, async () => (await ce.getAttribute('contenteditable')) !== 'false');
    await ce.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Typed on the page');
    const typed = await waitFor(page, async () => {
      const s = await stored(page);
      return s.pages.find((p) => p.id === 'home').draft.content.find((b) => b.type === 'Hero').props.headline === 'Typed on the page';
    });
    check('editor: typing on the page saves', !!typed);
    check('editor: and the side panel follows', (await headline.inputValue()) === 'Typed on the page');

    // Drag a section in
    const n0 = (await stored(page)).pages.find((p) => p.id === 'home').draft.content.length;
    const item = page.locator('[data-testid="drawer-item:Faq"]');
    await item.scrollIntoViewIfNeeded();
    const ib = await item.boundingBox();
    const fb = await page.locator('iframe').boundingBox();
    await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
    await page.mouse.down();
    await page.mouse.move(ib.x + ib.width / 2 + 20, ib.y + ib.height / 2 + 5, { steps: 5 });
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height * 0.85, { steps: 20 });
    await page.waitForTimeout(250);
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height * 0.86, { steps: 5 });
    await page.mouse.up();
    const n1 = await waitFor(page, async () => {
      const n = (await stored(page)).pages.find((p) => p.id === 'home').draft.content.length;
      return n === n0 + 1 ? n : null;
    });
    check('editor: a section dragged in from the Blocks list is added and saved', n1 === n0 + 1, n0 + ' -> ' + n1);
    check('editor: and shows on the canvas', (await f.locator('.sb-faq').count()) === 2);

    // Publish is a real button
    const pub = visible(page, 'button:has-text("Publish")');
    check('editor: Publish is a real button', (await pub.count()) === 1 && (await pub.evaluate((b) => b.tagName)) === 'BUTTON');
    await pub.focus();
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await page.locator('.ap-toast').count()) === 1);
    check('editor: Publish confirms', (await page.locator('.ap-toast').innerText()).includes('Published.'));
    const pubd = (await stored(page)).pages.find((p) => p.id === 'home');
    check('editor: the live copy matches the editor', pubd.live && JSON.stringify(pubd.live) === JSON.stringify(pubd.draft) && pubd.publishedAt === pubd.updatedAt);
    await page.locator('.ap-toast a', { hasText: 'View live page' }).click();
    await page.waitForTimeout(300);
    check('editor: the toast opens the live page', pathOf(page) === '/builder/view/home' && (await page.locator('.sb-hero-h').innerText()) === 'Typed on the page', pathOf(page));
    await page.goBack();
    await canvas(page);
    check('back: returns to the editor', pathOf(page) === '/builder/edit/home');
    await visible(page, 'a:has-text("All pages")').click();
    await page.waitForTimeout(200);
    check('back: All pages opens the dashboard', pathOf(page) === '/builder' && (await page.locator('[data-page="home"] .ap-status').innerText()) === 'Live');
    await page.goBack();
    await canvas(page);
    check('back: and Back reopens the editor', pathOf(page) === '/builder/edit/home');
    await page.goForward();
    await page.waitForTimeout(200);
    check('forward: and Forward the dashboard', pathOf(page) === '/builder' && (await page.locator('.ap-card').count()) === 2);

    // A change after publishing
    await page.locator('[data-page="home"] a', { hasText: 'Edit' }).first().click();
    const f2 = await canvas(page);
    await f2.click('.sb-hero-sub');
    await visible(page, 'textarea[name="headline"]').fill('Not published yet');
    await waitFor(page, async () => (await stored(page)).pages.find((p) => p.id === 'home').draft.content.find((b) => b.type === 'Hero').props.headline === 'Not published yet');
    await visible(page, 'a:has-text("Preview")').click();
    await page.waitForTimeout(300);
    check('preview: Preview shows the draft', pathOf(page) === '/builder/view/home/draft' && (await page.locator('.sb-hero-h').innerText()) === 'Not published yet' && (await page.locator('.ap-pill span').innerText()) === 'Draft preview');
    await page.locator('.ap-pill a', { hasText: 'All pages' }).click();
    await page.waitForTimeout(200);
    check('dashboard: a page changed after publishing says so', (await page.locator('[data-page="home"] .ap-status').innerText()) === 'Unpublished changes');
    await page.locator('[data-page="home"] a', { hasText: 'View live' }).click();
    await page.waitForTimeout(300);
    check('preview: the live page keeps the published text', (await page.locator('.sb-hero-h').innerText()) === 'Typed on the page');
  }

  /* ---------------- The published page ---------------- */
  {
    const { page } = await open(BASE + '/builder/view/home');
    await page.waitForTimeout(400);
    check('live page: tab title is the page title', (await page.title()) === 'Home', await page.title());
    check('live page: the search description is set', ((await page.locator('meta[name="description"]').getAttribute('content')) || '').startsWith('Kinetic Studio builds cinematic websites'));
    check('live page: one h1', (await page.locator('h1').count()) === 1);
    check('live page: entrance motion is on', (await page.locator('.sb-site').getAttribute('data-motion')) === 'on');
    check('live page: preview controls say it is live', (await page.locator('.ap-pill span').innerText()) === 'Live page');
    const cardOpacity = () => page.evaluate(() => getComputedStyle(document.querySelector('.sb-features .sb-card')).opacity);
    check('live page: feature cards wait below the fold', Number(await cardOpacity()) < 0.5, await cardOpacity());
    const story = await page.evaluate(() => { const s = document.querySelector('.sb-story'); const r = s.getBoundingClientRect(); return { top: r.top + scrollY, h: r.height, vh: innerHeight }; });
    const pAt = async (frac) => {
      await page.evaluate((y) => scrollTo(0, y), Math.round(story.top + frac * (story.h - story.vh)));
      await page.waitForTimeout(250);
      return Number(await page.evaluate(() => getComputedStyle(document.querySelector('.sb-story')).getPropertyValue('--p')));
    };
    const p1 = await pAt(0.2);
    const p2 = await pAt(0.7);
    const p3 = await pAt(0.3);
    check('live page: the scroll story moves forward with the scroll', Math.abs(p1 - 0.2) < 0.03 && Math.abs(p2 - 0.7) < 0.03, p1 + ' ' + p2);
    check('live page: and rewinds when scrolling back', Math.abs(p3 - 0.3) < 0.03 && p3 < p2, String(p3));
    const vis = await page.evaluate(() => [...document.querySelectorAll('.sb-chapter-card')].map((c) => Number(getComputedStyle(c).getPropertyValue('--vis') || 1)));
    check('live page: the chapter in view is the one shown', vis.length === 3 && vis.indexOf(Math.max(...vis)) === 1, vis.join(','));
    await page.evaluate(() => document.querySelector('.sb-features').scrollIntoView());
    await page.waitForTimeout(1300);
    check('live page: feature cards fade in when reached', Number(await cardOpacity()) > 0.95, await cardOpacity());
    check('live page: no sideways scrolling at desktop width', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
    await page.locator('.ap-pill a', { hasText: 'Edit page' }).click();
    await canvas(page);
    check('live page: Edit page opens the editor', pathOf(page) === '/builder/edit/home');
  }
  {
    const { page } = await open(BASE + '/builder/view/home', { reducedMotion: 'reduce' });
    await page.waitForTimeout(300);
    check('reduced motion: the scroll story holds still', (await page.locator('.sb-story').getAttribute('data-still')) === '' && (await page.evaluate(() => getComputedStyle(document.querySelector('.sb-story')).getPropertyValue('--p').trim())) === '0.35');
    check('reduced motion: nothing waits to fade in', Number(await page.evaluate(() => getComputedStyle(document.querySelector('.sb-features .sb-card')).opacity)) === 1);
    check('reduced motion: no animations run', (await page.evaluate(() => getComputedStyle(document.querySelector('.sb-hero-h')).animationName)) === 'none');
  }
  {
    const { page } = await open(BASE + '/builder/view/services');
    check('live page: a page never published says so', (await page.locator('.ap-h1').innerText()) === 'Not published yet');
    await page.locator('a', { hasText: 'Preview the draft' }).click();
    await page.waitForTimeout(300);
    check('live page: and offers the draft', pathOf(page) === '/builder/view/services/draft' && (await page.locator('.sb-site[data-theme="light"]').count()) === 1);
  }
  {
    // Links typed into the editor cannot run script
    const { page } = await open(BASE + '/builder');
    await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k));
      const p = s.pages.find((x) => x.id === 'home');
      for (const d of [p.draft, p.live]) d.content.find((b) => b.type === 'Navbar').props.links[0].href = 'javascript:alert(1)';
      localStorage.setItem(k, JSON.stringify(s));
    }, KEY);
    await page.goto(BASE + '/builder/view/home', { waitUntil: 'load' });
    await page.waitForTimeout(200);
    check('live page: a javascript: link becomes "#"', (await page.locator('.sb-nav-links a').first().getAttribute('href')) === '#');
  }
  {
    const { page } = await open(BASE + '/builder/view/home', { viewport: { width: 390, height: 844 }, mobile: true });
    await page.waitForTimeout(400);
    check('phone: no sideways scrolling on the live page', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
    check('phone: menu links fold away, the button stays', !(await page.locator('.sb-nav-links').isVisible()) && (await page.locator('.sb-nav .sb-btn').isVisible()));
    await page.evaluate(() => document.querySelector('.sb-story').scrollIntoView());
    await page.evaluate(() => scrollBy(0, innerHeight));
    await page.waitForTimeout(300);
    check('phone: the scroll story still moves', Number(await page.evaluate(() => getComputedStyle(document.querySelector('.sb-story')).getPropertyValue('--p'))) > 0.2);
    await page.goto(BASE + '/builder', { waitUntil: 'load' });
    await page.waitForTimeout(200);
    check('phone: no sideways scrolling on the dashboard', (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
    await page.click('button:has-text("New page")');
    check('phone: the new page dialog fits', (await page.evaluate(() => { const r = document.querySelector('.ap-modal').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })));
    await page.keyboard.press('Escape');
    await page.goto(BASE + '/builder/edit/home', { waitUntil: 'load' });
    const f = await canvas(page);
    check('phone: the editor opens with the page', (await f.locator('.sb-hero-h').count()) === 1);
  }

  /* ---------------- Duplicate and delete ---------------- */
  {
    const { page } = await open(BASE + '/builder');
    await page.click('button[aria-label="Duplicate Services"]');
    await page.waitForTimeout(200);
    const cards = await page.locator('.ap-card').evaluateAll((els) => els.map((e) => e.querySelector('.ap-card-title').textContent + '|' + e.querySelector('.ap-card-slug').textContent + '|' + e.querySelector('.ap-status').textContent));
    check('duplicate: the copy sits after the original as a draft', cards[2] === 'Services (copy)|/services-copy|Draft', cards.join(' ; '));
    check('duplicate: the toast offers to edit the copy', (await page.locator('.ap-toast a').innerText()) === 'Edit the copy');
    await page.click('button[aria-label="Delete Services (copy)"]');
    check('delete: asks first', (await page.locator('.ap-modal h2').innerText()) === 'Delete “Services (copy)”?');
    await page.locator('.ap-modal button', { hasText: 'Cancel' }).click();
    check('delete: Cancel keeps the page', (await page.locator('.ap-card').count()) === 3);
    await page.click('button[aria-label="Delete Services (copy)"]');
    await page.locator('.ap-modal button', { hasText: 'Delete page' }).click();
    check('delete: Delete page removes it', (await page.locator('.ap-card').count()) === 2);
    await page.reload({ waitUntil: 'load' });
    check('delete: still gone after a reload', (await page.locator('.ap-card').count()) === 2 && (await stored(page)).pages.length === 2);
    // Reset the demo brings back the sample pages
    await page.click('button[aria-label="Delete Home"]');
    await page.locator('.ap-modal button', { hasText: 'Delete page' }).click();
    await page.click('button[aria-label="Delete Services"]');
    await page.locator('.ap-modal button', { hasText: 'Delete page' }).click();
    check('delete: with every page gone the dashboard offers New page', (await page.locator('.ap-empty h2').innerText()) === 'No pages yet');
    await page.reload({ waitUntil: 'load' });
    check('delete: an emptied dashboard stays empty after a reload (no sample pages forced back)', (await page.locator('.ap-card').count()) === 0);
    await page.click('button:has-text("Reset the demo")');
    check('reset: asks first', (await page.locator('.ap-modal h2').innerText()) === 'Reset the demo?');
    await page.locator('.ap-modal button', { hasText: 'Reset the demo' }).click();
    check('reset: the two sample pages come back', (await page.locator('.ap-card').count()) === 2 && (await page.locator('[data-page="home"] .ap-status').innerText()) === 'Live');
    await page.reload({ waitUntil: 'load' });
    check('reset: and stay after a reload', (await stored(page)).pages.map((p) => p.id).join(',') === 'home,services');
  }

  /* ---------------- A browser that will not save ---------------- */
  {
    const init = 'Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };';
    const { page } = await open(BASE + '/builder', { init });
    check('no storage: the app still opens with the sample pages', (await page.locator('.ap-card').count()) === 2);
    check('no storage: and says it is not saving', (await page.locator('.ap-banner').innerText()).includes('not saving pages'));
    await page.locator('[data-page="home"] a', { hasText: 'Edit' }).first().click();
    const f = await canvas(page);
    await f.click('.sb-hero-sub');
    await visible(page, 'textarea[name="headline"]').fill('Kept for this visit');
    check('no storage: the editor says Not saved', !!(await waitFor(page, async () => (await page.locator('.ap-save').innerText()) === 'Not saved')));
    await visible(page, 'a:has-text("All pages")').click();
    await page.waitForTimeout(200);
    check('no storage: changes last for the visit', (await page.locator('[data-page="home"] .ap-thumb-h').innerText()) === 'Kept for this visit');
  }

  /* ---------------- Other hosts, files and frames ---------------- */
  {
    const { page } = await open(BASE + '/copy/' + FILE);
    check('copy: on another host the dashboard opens at #/', (await page.locator('.ap-card').count()) === 2);
    check('copy: links use #/ addresses', (await page.locator('[data-page="home"] a', { hasText: 'Edit' }).first().getAttribute('href')) === '#/edit/home');
    await page.locator('[data-page="home"] a', { hasText: 'Edit' }).first().click();
    await canvas(page);
    check('copy: opening a page sets #/edit/home', new URL(page.url()).hash === '#/edit/home' && pathOf(page) === '/copy/' + FILE);
    await page.goBack();
    await page.waitForTimeout(300);
    check('copy: Back returns to the dashboard', (await page.locator('.ap-card').count()) === 2);
  }
  {
    const { page } = await open(BASE + '/copy/' + FILE + '#/view/home');
    check('copy: a #/view/<page> address opens the live page', (await page.locator('.sb-hero-h').count()) === 1);
  }
  {
    const { page } = await open('file://' + path.join(ROOT, FILE) + '#/view/home');
    check('file: a local copy opens #/view/home', (await page.locator('.sb-hero-h').count()) === 1);
  }
  {
    const { page } = await open(BASE + '/frame.html');
    const fr = await waitFor(page, async () => {
      const x = page.frames().find((y) => y.url().includes('/builder/edit/home'));
      return x && (await x.locator('.ap-editor').count()) ? x : null;
    }, 8000);
    check('frame: the editor opens inside a frame', !!fr);
    if (fr) {
      await fr.locator('a:has-text("All pages") >> visible=true').click();
      await page.waitForTimeout(300);
      check('frame: moving around leaves the frame address alone', (await fr.locator('.ap-card').count()) === 2 && (await fr.evaluate(() => location.pathname)) === '/builder/edit/home');
    }
  }

  check('no page errors anywhere', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));

  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('FAILURES:\n- ' + failures.join('\n- '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST RUN CRASHED:', e); server.close(); process.exit(2); });
