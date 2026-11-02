// Tests for the team's pages in site-builder.html (#5 hosting): signed in with an AI Paragon account,
// pages live in the AI Paragon Sites project (tests/lib/sites-backend.js stands in for it, with the
// database's own rules) and drafts save there as you edit. Covered: the sign-in swap (one session,
// renewed or swapped again when turned away), the dashboard (team pages, this browser's pages, Move
// to team pages, Sign in and Sign out, a team that can't be opened), New page, autosave with the
// version check, Publish to the shared link with the page's words for the chatbot, the live link on
// the card and in the preview, a newer version saved by someone else (load theirs or keep mine), a
// page someone deleted, saving offline and after a reload, Duplicate and Delete, the Domain tab
// through the Domains workflow (connect, the records Vercel wants, check, connected, remove, not
// switched on yet), the chatbot's contacts from the server, and the notes on each tab. The team
// sign-in, the Domains workflow and DNS over HTTPS are stubbed. Offline otherwise.
// Usage: node tests/builder-hosting.test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { makeSites, SITES } = require('./lib/sites-backend.js');

const ROOT = path.resolve(__dirname, '..');
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const DOMAINS_HOOK = 'https://n8n.aiparagonconsulting.com/webhook/site-builder-domain';
const EMAIL = 'tester@aiparagonconsulting.com';
const PASSWORD = 'correct horse';
const KEY = 'apSiteBuilder.v1';
const TEAM_KEY = 'apSiteBuilder.team.v1';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, accept, prefer', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' };

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const REWRITES = cfg.rewrites.map((r) => ({ re: new RegExp('^' + r.source.replace(/\/:path\*$/, '(?:/.*)?').replace(/\//g, '\\/') + '$'), dest: r.destination }));
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch (e) {}
  const hit = REWRITES.find((r) => r.re.test(p));
  const file = path.join(ROOT, hit ? hit.dest : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

const session = () => ({ access_token: 'tok-A1', refresh_token: 'ref-A1', expires_at: Date.now() + 3600e3, email: EMAIL });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const pageErrors = [];

  // A browser with the team sign-in, the sites project (sites.db), the Domains workflow (st.dom:
  // an answer or a function of the request) and DNS stubbed. One sites project can be shared by
  // several browsers (opts.sites), as two teammates share one.
  async function open(url, opts) {
    const o = opts || {};
    const sites = o.sites || makeSites();
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 } });
    const st = { sites, db: sites.db, dom: o.dom || null, domReqs: [], logins: [], outside: [] };
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      st.outside.push(u);
      return route.abort();
    });
    await ctx.route(SB + '/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      const json = (status, j) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(j) });
      const u = req.url();
      if (u.includes('grant_type=password')) {
        st.logins.push(body);
        if (body.email === EMAIL && body.password === PASSWORD) return json(200, { access_token: 'tok-A1', refresh_token: 'ref-A1', expires_in: 3600, user: { email: EMAIL } });
        return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      }
      if (u.includes('grant_type=refresh_token')) return json(200, { access_token: 'tok-A2', refresh_token: 'ref-A2', expires_in: 3600, user: { email: EMAIL } });
      if (u.includes('/logout')) return route.fulfill({ status: 204, headers: CORS });
      return json(404, {});
    });
    await ctx.route(SITES + '/**', sites.handle);
    await ctx.route(DOMAINS_HOOK, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      let body = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      st.domReqs.push(body);
      const a = typeof st.dom === 'function' ? st.dom(body) : st.dom;
      if (!a) return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 404, message: 'The requested webhook "POST site-builder-domain" is not registered.' }) });
      return route.fulfill({ status: a.status || 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(a.body) });
    });
    const doh = async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/dns-json', body: JSON.stringify({ Status: 0, Answer: [{ name: 'x.', type: 1, TTL: 300, data: '192.0.2.10' }] }) });
    };
    await ctx.route('https://dns.google/**', doh);
    await ctx.route('https://cloudflare-dns.com/**', doh);
    await ctx.addInitScript((s) => {
      window.__SB_TEST__ = true;
      try {
        if (!sessionStorage.getItem('seeded')) {
          sessionStorage.setItem('seeded', '1');
          if (s.session) localStorage.setItem('apSiteBuilder.auth', JSON.stringify(s.session));
          if (s.state) localStorage.setItem('apSiteBuilder.v1', JSON.stringify(s.state));
        }
      } catch (e) {}
    }, { session: o.signedOut ? null : session(), state: o.state || null });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(url + ' :: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|fonts\.g/.test(m.text())) pageErrors.push(url + ' :: console: ' + m.text().slice(0, 300));
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    return { ctx, page, st };
  }

  async function waitFor(page, fn, ms) {
    const end = Date.now() + (ms || 5000);
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
  async function tab(page, name) {
    if (!(await visible(page, '.ap-set-nav').count())) {
      await visible(page, 'button:has-text("Settings")').click();
      await waitFor(page, async () => (await visible(page, '.ap-set-nav').count()) === 1);
    }
    const now = await visible(page, '.ap-set-nav button[aria-current="page"]').innerText().catch(() => '');
    if (now !== name) await visible(page, '.ap-set-nav button:text-is("' + name + '")').click();
    await waitFor(page, async () => (await visible(page, '.ap-set-nav button[aria-current="page"]').innerText()) === name);
    await page.waitForTimeout(100);
  }
  const stored = (page, k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);
  const writes = (db, method) => db.calls.filter((c) => c.method === method && c.path.startsWith('pages'));
  const saveState = (page) => page.locator('.ap-save').innerText();
  const blank = (title, slug, extra) => ({ root: { props: { title, slug, theme: 'dark', accent: 'cyan', font: 'grotesk', description: 'A page.', ...(extra || {}) } }, content: [{ type: 'Hero', props: { id: 'Hero-1', headline: title + ' headline', subhead: 'Sub', background: 'particles' } }] });

  /* ---------------- Signed out: this browser, as before, and a way in ---------------- */
  {
    const { page, st } = await open(BASE + '/builder', { signedOut: true });
    check('signed out: no team section, this browser’s pages as before', (await page.locator('#team-h').count()) === 0 && (await page.locator('.ap-card').count()) === 2 && (await page.locator('.ap-card[data-where="local"]').count()) === 2);
    check('signed out: a note says what signing in does', (await page.locator('.ap-signin-note').innerText()).includes('save pages for the team and put them on the web'));
    check('signed out: nothing reaches the sites project', st.db.swaps.length === 0 && st.db.calls.length === 0);
    await page.locator('header button:has-text("Sign in")').click();
    await waitFor(page, async () => (await page.locator('#si-email').count()) === 1);
    check('signed out: Sign in opens the sign-in form', (await page.locator('[role="dialog"] h2').innerText()) === 'Sign in' && (await page.locator('#si-pw').count()) === 1);
    const dbox = await page.locator('[role="dialog"]').boundingBox();
    check('signed out: the sign-in dialog sits in the window, not held to the header', dbox && dbox.y >= 0 && dbox.y + dbox.height <= 900 && dbox.height > 300, JSON.stringify(dbox));
    await page.fill('#si-email', EMAIL);
    await page.fill('#si-pw', PASSWORD);
    await page.click('[role="dialog"] button[type="submit"]');
    await waitFor(page, async () => (await page.locator('#team-h').count()) === 1);
    check('sign in: the dialog closes and the team’s pages open', (await page.locator('[role="dialog"]').count()) === 0 && (await page.locator('#team-h').innerText()) === 'Team pages');
    // The heading shows at once; the swap and the read follow
    await waitFor(page, async () => (await page.locator('.ap-empty h3').count()) === 1);
    check('sign in: the team sign-in is swapped once for a session on the sites project', st.db.swaps.length === 1 && st.db.swaps[0].auth === 'tok-A1', JSON.stringify(st.db.swaps));
    check('sign in: no team pages yet, and this browser’s pages below', (await page.locator('.ap-empty h3').innerText()) === 'No team pages yet' && (await page.locator('#local-h').innerText()) === 'On this browser only' && (await page.locator('.ap-card[data-where="local"] button:has-text("Move to team pages")').count()) === 2);
    check('sign in: who is signed in, with Sign out', (await page.locator('.ap-who-email').innerText()) === EMAIL && (await page.locator('header button:has-text("Sign out")').count()) === 1);
  }

  /* ---------------- A phone's top bar: everything fits, nothing overlaps ---------------- */
  for (const signedOut of [false, true]) {
    const { page } = await open(BASE + '/builder', { viewport: { width: 390, height: 844 }, signedOut });
    await page.waitForTimeout(300);
    const boxes = await page.evaluate(() => [...document.querySelectorAll('.ap-top-in > a, .ap-top-in > button, .ap-top-in .ap-who > button, .ap-top-in > .ap-chip')].filter((el) => el.offsetParent).map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }));
    const overlap = boxes.some((a, i) => boxes.some((b, j) => j > i && a[0] < b[1] - 1 && b[0] < a[1] - 1));
    check('phone top bar (' + (signedOut ? 'signed out' : 'signed in') + '): everything fits and nothing overlaps', boxes.length >= 3 && !overlap && boxes.every((b) => b[0] >= 0 && b[1] <= 390), JSON.stringify(boxes));
  }

  /* ---------------- A team page: made, saved as you go, published ---------------- */
  const sites = makeSites();
  let pid = '';
  {
    const { page, st } = await open(BASE + '/builder', { sites });
    await waitFor(page, async () => (await page.locator('.ap-empty h3').count()) === 1);
    await page.locator('header button:has-text("New page")').click();
    await page.fill('#np-name', 'Kinetic Studio');
    check('new page: says it is for the team and where it will be', (await page.locator('.ap-modal-lede').innerText()).includes('saved with the team’s pages') && (await page.locator('#np-slug-hint').innerText()) === 'Once published, the page will be at sites.aiparagonconsulting.com/kinetic-studio');
    await page.click('[role="dialog"] button[type="submit"]');
    await waitFor(page, async () => /\/builder\/edit\//.test(page.url()));
    pid = decodeURIComponent(page.url().split('/builder/edit/')[1]);
    const made = st.db.pages.get(pid);
    check('new page: made on the server, by who made it', !!made && made.version === 1 && made.created_by === EMAIL && made.draft.root.props.slug === 'kinetic-studio' && !made.live);
    await canvas(page);
    check('new page: the editor says saved', (await saveState(page)) === 'Saved');
    await tab(page, 'SEO');
    await visible(page, '#seo-title').fill('Kinetic Studio | Websites that move');
    check('autosave: saving as you type', /Saving/.test(await saveState(page)));
    await waitFor(page, async () => st.db.pages.get(pid).version === 2, 6000);
    const patch = writes(st.db, 'PATCH')[0];
    check('autosave: one save, on the version it was made from', !!patch && patch.path === 'pages?id=eq.' + encodeURIComponent(pid) + '&version=eq.1' && JSON.stringify(Object.keys(patch.body)) === '["draft"]');
    check('autosave: the server has the change', st.db.pages.get(pid).draft.root.props.seoTitle === 'Kinetic Studio | Websites that move');
    await waitFor(page, async () => (await saveState(page)) === 'Saved');
    check('autosave: then saved', (await saveState(page)) === 'Saved');
    const n = st.db.calls.length;
    await page.waitForTimeout(1500);
    check('autosave: nothing more goes out while nothing changes', st.db.calls.length === n);

    await tab(page, 'Code');
    check('code tab: says where the code runs', (await visible(page, '#code-where').innerText()).includes('Code runs on the live page (sites.aiparagonconsulting.com/kinetic-studio)') && (await visible(page, '#code-where').innerText()).includes('never runs in the editor'));
    await tab(page, 'SEO');
    check('seo tab: the page is not on the web until it is published', (await visible(page, '.ap-set-note').innerText()).includes('once it is published, at sites.aiparagonconsulting.com/kinetic-studio'));

    await visible(page, 'button:has-text("Publish")').click();
    await waitFor(page, async () => (await page.locator('.ap-toast').count()) === 1, 6000);
    check('publish: says where it is live, with a link that opens it', (await page.locator('.ap-toast').innerText()).includes('It is live at sites.aiparagonconsulting.com/kinetic-studio') && (await page.locator('.ap-toast a[target="_blank"]').getAttribute('href')) === 'https://sites.aiparagonconsulting.com/kinetic-studio');
    const row = st.db.pages.get(pid);
    const pub = writes(st.db, 'PATCH').pop();
    check('publish: the live copy, its address and its words for the chatbot', !!row.live && row.live_slug === 'kinetic-studio' && JSON.stringify(row.live) === JSON.stringify(row.draft) && typeof pub.body.live_text === 'string' && pub.body.live_text.includes('Page: Kinetic Studio') && /&version=eq\.2$/.test(pub.path));
    await tab(page, 'SEO');
    check('seo tab: now on the web', (await visible(page, '.ap-set-note').innerText()).includes('Search engines can find the live page at sites.aiparagonconsulting.com/kinetic-studio'));

    await visible(page, '#seo-title').fill('Kinetic Studio | Cinematic websites');
    await waitFor(page, async () => st.db.pages.get(pid).draft.root.props.seoTitle === 'Kinetic Studio | Cinematic websites', 6000);
    await page.waitForTimeout(300);
    await visible(page, 'a:has-text("All pages")').click();
    await waitFor(page, async () => (await page.locator('.ap-card[data-where="team"]').count()) === 1);
    const card = page.locator('.ap-card[data-where="team"]');
    check('dashboard: the team page, live with unpublished changes', (await card.locator('.ap-status').innerText()) === 'Unpublished changes' && (await card.locator('.ap-card-live a').getAttribute('href')) === 'https://sites.aiparagonconsulting.com/kinetic-studio');
    check('dashboard: who edited it', (await card.locator('.ap-card-time').innerText()).includes('by tester'));
    check('dashboard: the team pages counted', (await page.locator('.ap-lede').innerText()).includes('Team pages: 1 page, 1 live.'));
    await card.locator('a:has-text("View live")').click();
    await waitFor(page, async () => (await page.locator('.ap-pill').count()) === 1);
    check('preview: the live page says where it is on the web', (await page.locator('.ap-pill a[target="_blank"]').innerText()) === 'On the web: sites.aiparagonconsulting.com/kinetic-studio');
  }

  /* ---------------- Another computer: the same pages, and a newer version from someone else ---------------- */
  {
    const { page, st } = await open(BASE + '/builder/edit/' + encodeURIComponent(pid), { sites });
    await canvas(page);
    await tab(page, 'SEO');
    check('another browser: the team page opens from the server', (await visible(page, '#seo-title').inputValue()) === 'Kinetic Studio | Cinematic websites');
    // A teammate saves while this editor is open
    const theirs = JSON.parse(JSON.stringify(st.db.pages.get(pid).draft));
    theirs.root.props.seoTitle = 'Their title';
    st.db.edit(pid, { draft: theirs }, 'erica@aiparagonconsulting.com');
    await visible(page, '#seo-title').fill('My title');
    await waitFor(page, async () => (await page.locator('.ap-syncbar').count()) === 1, 6000);
    check('conflict: the save finds a newer version and asks', (await page.locator('.ap-syncbar').innerText()).includes('erica saved a newer version of this page') && (await saveState(page)) === 'Someone else changed this page');
    check('conflict: nothing was overwritten', st.db.pages.get(pid).draft.root.props.seoTitle === 'Their title');
    await page.locator('.ap-syncbar button:has-text("Load their version")').click();
    await canvas(page);
    await tab(page, 'SEO');
    check('conflict: their version loads in the editor', (await visible(page, '#seo-title').inputValue()) === 'Their title' && (await page.locator('.ap-syncbar').count()) === 0 && (await saveState(page)) === 'Saved');
    const theirs2 = JSON.parse(JSON.stringify(st.db.pages.get(pid).draft));
    theirs2.root.props.seoTitle = 'Their second title';
    st.db.edit(pid, { draft: theirs2 }, 'erica@aiparagonconsulting.com');
    await visible(page, '#seo-title').fill('Mine wins');
    await waitFor(page, async () => (await page.locator('.ap-syncbar').count()) === 1, 6000);
    await page.locator('.ap-syncbar button:has-text("Keep mine")').click();
    await waitFor(page, async () => st.db.pages.get(pid).draft.root.props.seoTitle === 'Mine wins', 6000);
    check('conflict: keep mine saves over theirs, on their version', st.db.pages.get(pid).draft.root.props.seoTitle === 'Mine wins' && (await page.locator('.ap-syncbar').count()) === 0);
    await waitFor(page, async () => (await saveState(page)) === 'Saved');

    // Offline: the edit waits in this browser and goes out when the connection is back, after a reload too
    st.db.down = true;
    await visible(page, '#seo-title').fill('Written offline');
    await waitFor(page, async () => (await saveState(page)) === 'Not saved yet, trying again', 6000);
    check('offline: the editor says it will try again', (await saveState(page)) === 'Not saved yet, trying again');
    const kept = await stored(page, TEAM_KEY);
    const mine = kept && kept.pages.find((p) => p.id === pid);
    check('offline: the edit is kept in this browser', !!mine && mine.dirty === true && mine.draft.root.props.seoTitle === 'Written offline' && kept.email === EMAIL);
    await page.reload({ waitUntil: 'load' });
    await canvas(page);
    await tab(page, 'SEO');
    check('offline: after a reload the edit is still there', (await visible(page, '#seo-title').inputValue()) === 'Written offline');
    st.db.down = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await waitFor(page, async () => st.db.pages.get(pid).draft.root.props.seoTitle === 'Written offline', 12000);
    check('offline: sent once the connection is back', st.db.pages.get(pid).draft.root.props.seoTitle === 'Written offline');
    await waitFor(page, async () => (await saveState(page)) === 'Saved', 6000);

    // The session on the sites project turned away: swapped again, and the save goes through
    const swaps = st.db.swaps.length;
    st.db.revokeAll();
    await visible(page, '#seo-title').fill('After a new session');
    await waitFor(page, async () => st.db.pages.get(pid).draft.root.props.seoTitle === 'After a new session', 6000);
    check('session: a session turned away is swapped again, and the save goes through', st.db.swaps.length === swaps + 1 && (await saveState(page)) === 'Saved');
  }

  /* ---------------- Duplicate, delete, a page someone deleted, move from this browser ---------------- */
  {
    const { page, st } = await open(BASE + '/builder', { sites });
    await waitFor(page, async () => (await page.locator('.ap-card[data-where="team"]').count()) === 1);
    await page.locator('.ap-card[data-where="team"] button:has-text("Duplicate")').click();
    await waitFor(page, async () => (await page.locator('.ap-card[data-where="team"]').count()) === 2);
    const copy = [...st.db.pages.values()].find((r) => r.id !== pid);
    check('duplicate: a new team page on the server, with its own address', !!copy && copy.draft.root.props.slug === 'kinetic-studio-copy' && !copy.live && (await page.locator('.ap-toast').innerText()).includes('Made a copy'));
    await page.locator('.ap-card[data-page="' + copy.id + '"] button:has-text("Delete")').click();
    check('delete: says it goes for everyone', (await page.locator('[role="dialog"] .ap-modal-lede').innerText()).includes('removed from the team’s pages for everyone'));
    await page.locator('[role="dialog"] button:has-text("Delete page")').click();
    await waitFor(page, async () => (await page.locator('.ap-card[data-where="team"]').count()) === 1);
    check('delete: gone from the server', !st.db.pages.has(copy.id));
    await page.locator('.ap-card[data-page="' + pid + '"] button:has-text("Delete")').click();
    check('delete: a live page’s link stops working, and it says so', (await page.locator('[role="dialog"] .ap-modal-lede').innerText()).includes('its live page stops working'));
    await page.locator('[role="dialog"] button:has-text("Cancel")').click();

    await page.locator('.ap-card[data-where="local"][data-page="services"] button:has-text("Move to team pages")').click();
    await waitFor(page, async () => (await page.locator('.ap-card[data-where="team"]').count()) === 2);
    const moved = [...st.db.pages.values()].find((r) => r.draft.root.props.title === 'Services');
    check('move: a page from this browser becomes a team page, and leaves this browser', !!moved && (await page.locator('.ap-card[data-where="local"][data-page="services"]').count()) === 0 && (await stored(page, KEY)).pages.every((p) => p.id !== 'services'));

    // Someone deletes the moved page while it is open here
    await page.goto(BASE + '/builder/edit/' + encodeURIComponent(moved.id));
    await canvas(page);
    st.db.pages.delete(moved.id);
    await tab(page, 'SEO');
    await visible(page, '#seo-title').fill('Still mine');
    await waitFor(page, async () => (await page.locator('.ap-syncbar').count()) === 1, 6000);
    check('gone: someone deleted the page, and the editor says so', (await page.locator('.ap-syncbar').innerText()).includes('Someone deleted this page'));
    await page.locator('.ap-syncbar button:has-text("Save it as a new page")').click();
    await waitFor(page, async () => !page.url().includes(encodeURIComponent(moved.id)) && /\/builder\/edit\//.test(page.url()), 6000);
    const back = [...st.db.pages.values()].find((r) => r.draft.root.props.seoTitle === 'Still mine');
    check('gone: saved again as a new page, with the edit', !!back && back.id !== moved.id && page.url().includes(encodeURIComponent(back.id)));
  }

  /* ---------------- The Domain tab, through the Domains workflow ---------------- */
  {
    const dom = (body) => {
      if (body.action === 'remove') return { body: { ok: true } };
      const connected = body.action === 'check';
      return { body: { ok: true, verified: true, misconfigured: !connected, records: [
        { type: 'A', name: 'kinetic.example', host: 'kinetic.example', value: '216.198.79.1' },
        { type: 'CNAME', name: 'www.kinetic.example', host: 'www.kinetic.example', value: 'abc.vercel-dns-017.com' },
      ], verification: [] } };
    };
    const { page, st } = await open(BASE + '/builder/edit/' + encodeURIComponent(pid), { sites, dom });
    await canvas(page);
    await tab(page, 'Domain');
    check('domain tab: the shared link, live', (await visible(page, '.ap-set-now').innerText()).includes('Live at') && (await visible(page, '.ap-set-now code').innerText()) === 'sites.aiparagonconsulting.com/kinetic-studio');
    await visible(page, '#dom-name').fill('Kinetic.Example');
    await visible(page, '.ap-set button[type="submit"]:has-text("Connect")').click();
    await waitFor(page, async () => st.domReqs.length === 1 && (await visible(page, '.ap-rec').count()) === 1, 6000);
    check('domain: saved with the page on the server', st.db.pages.get(pid).domain === 'kinetic.example');
    check('domain: the workflow is asked to connect it, with the team sign-in', st.domReqs[0].action === 'connect' && st.domReqs[0].domain === 'kinetic.example' && st.domReqs[0].auth === 'tok-A1');
    const recs = await visible(page, '.ap-rec tbody tr').allInnerTexts();
    check('domain: the records Vercel wants, named the way DNS settings name them', recs.length === 2 && /^A\s+@\s+216\.198\.79\.1/.test(recs[0]) && /^CNAME\s+www\s+abc\.vercel-dns-017\.com/.test(recs[1]), recs.join(' | '));
    check('domain: waiting for DNS', (await visible(page, '.ap-dom-name .ap-status').innerText()) === 'Waiting for DNS');
    await waitFor(page, async () => !!(st.db.pages.get(pid).domain_state));
    check('domain: what Vercel said is kept for the team', st.db.pages.get(pid).domain_state.misconfigured === true && st.db.pages.get(pid).domain_state.records.length === 2);
    await visible(page, 'button:has-text("Check again")').click();
    await waitFor(page, async () => (await visible(page, '.ap-dom-name .ap-status').innerText()) === 'Connected', 6000);
    check('domain: connected once Vercel sees the records, and the records go', (await visible(page, '.ap-rec').count()) === 0 && (await visible(page, '.ap-set-ok').innerText()).includes('Connected. The page is live at kinetic.example.'));
    await tab(page, 'Code');
    check('code tab: names the domain too', (await visible(page, '#code-where').innerText()).includes('and kinetic.example'));
    await visible(page, 'a:has-text("All pages")').click();
    await waitFor(page, async () => (await page.locator('.ap-card[data-page="' + pid + '"]').count()) === 1);
    check('dashboard: the card links to the domain once connected', (await page.locator('.ap-card[data-page="' + pid + '"] .ap-card-live a').getAttribute('href')) === 'https://kinetic.example/');
    await page.goto(BASE + '/builder/edit/' + encodeURIComponent(pid));
    await canvas(page);
    await tab(page, 'Domain');
    await visible(page, '.ap-dom button:has-text("Remove")').click();
    await waitFor(page, async () => st.db.pages.get(pid).domain === null, 6000);
    check('domain: Remove takes it off Vercel and the page', st.domReqs.some((r) => r.action === 'remove' && r.domain === 'kinetic.example') && (await visible(page, '#dom-name').count()) === 1);
    st.dom = null; // the workflow not switched on yet (n8n answers 404)
    await visible(page, '#dom-name').fill('acme.example');
    await visible(page, '.ap-set button[type="submit"]').click();
    await waitFor(page, async () => (await visible(page, '.ap-dom').count()) === 1 && (await visible(page, 'p.ap-hint[role="status"]').count()) >= 0, 6000);
    await page.waitForTimeout(400);
    check('domain: before the workflow is on, the domain is saved and it says so', st.db.pages.get(pid).domain === 'acme.example' && (await visible(page, '.ap-set').innerText()).includes('Connecting domains is not switched on yet'));
    check('domain: and the general records show (two A records and the www CNAME)', (await visible(page, '.ap-rec tbody tr').count()) === 3);
  }

  /* ---------------- The chatbot's contacts, from the server ---------------- */
  {
    const draft = blank('Acme Roofing', 'acme-roofing', { chatbot: { on: true, leads: 'email' } });
    sites.db.put({ id: 'acme-roof1', draft, live: draft, live_slug: 'acme-roofing' });
    sites.db.leads.push({ id: 'l1', page_id: 'acme-roof1', name: 'Ana Lima', email: 'ana@example.com', phone: '', note: 'Do you fix leaks?', created_at: '2026-11-02T09:00:00Z' });
    sites.db.leads.push({ id: 'l2', page_id: 'acme-roof1', name: 'Bo Chen', email: 'bo@example.com', phone: '555 0101', note: '', created_at: '2026-11-02T09:30:00Z' });
    const { page, st } = await open(BASE + '/builder/edit/acme-roof1', { sites });
    await canvas(page);
    await tab(page, 'Chatbot');
    await waitFor(page, async () => (await visible(page, '#leads-h span').innerText()) === '2', 6000);
    const items = await visible(page, '.ap-leads li').allInnerTexts();
    check('contacts: visitors’ contacts from the server, newest first', items.length === 2 && items[0].includes('Bo Chen') && items[1].includes('Ana Lima') && items[1].includes('Do you fix leaks?'));
    check('chatbot tab: says visitors chat on the live page', (await visible(page, '.ap-set-note').innerText()).includes('Visitors chat on the live page (sites.aiparagonconsulting.com/acme-roofing)'));
    await visible(page, '.ap-leads button:text-is("Clear")').click();
    await visible(page, '.ap-leads button:has-text("Clear 2")').click();
    await waitFor(page, async () => (await visible(page, '#leads-h span').innerText()) === '0', 6000);
    check('contacts: Clear removes them from the server', st.db.leads.length === 0 && st.db.calls.some((c) => c.method === 'DELETE' && c.path === 'leads?page_id=eq.acme-roof1'));
  }

  /* ---------------- Signing out, and a team that can't be opened ---------------- */
  {
    const { page, st } = await open(BASE + '/builder/edit/acme-roof1', { sites });
    await canvas(page);
    st.db.down = true;
    await tab(page, 'SEO');
    await visible(page, '#seo-title').fill('Unsaved before signing out');
    await waitFor(page, async () => (await saveState(page)) === 'Not saved yet, trying again', 6000);
    await visible(page, 'a:has-text("All pages")').click();
    await waitFor(page, async () => (await page.locator('header button:has-text("Sign out")').count()) === 1);
    await page.locator('header button:has-text("Sign out")').click();
    check('sign out: unsaved team changes are named before they are lost', (await page.locator('[role="dialog"] .ap-modal-lede').innerText()).includes('One page has changes that have not reached the team’s pages yet'));
    await page.locator('[role="dialog"] button:has-text("Sign out anyway")').click();
    await waitFor(page, async () => (await page.locator('.ap-signin-note').count()) === 1);
    check('sign out: the team’s pages and their copy here are gone from this browser', (await page.locator('#team-h').count()) === 0 && (await stored(page, TEAM_KEY)) === null && (await stored(page, 'apSiteBuilder.sites')) === null);
    st.db.down = false;
  }
  {
    const s2 = makeSites();
    s2.db.swapAnswer = { status: 403, body: { error: 'Team pages are for AI Paragon accounts.', code: 'team' } };
    const { page } = await open(BASE + '/builder', { sites: s2 });
    await waitFor(page, async () => (await page.locator('.ap-banner-warn').count()) === 1, 6000);
    check('team closed: the dashboard says why, and this browser’s pages still work', (await page.locator('.ap-banner-warn').innerText()).includes('Team pages are for AI Paragon accounts.') && (await page.locator('.ap-card[data-where="local"]').count()) === 2);
    await page.locator('header button:has-text("New page")').click();
    check('team closed: New page makes a page in this browser', (await page.locator('#np-slug-hint').innerText()).startsWith('The page will be at /'));
    await page.fill('#np-name', 'Local One');
    await page.click('[role="dialog"] button[type="submit"]');
    await waitFor(page, async () => /\/builder\/edit\//.test(page.url()));
    check('team closed: and nothing went to the server', s2.db.pages.size === 0 && (await stored(page, KEY)).pages.some((p) => p.draft.root.props.title === 'Local One'));
  }
  {
    // A link to a team page while signed out
    const { page } = await open(BASE + '/builder/edit/' + encodeURIComponent(pid), { sites, signedOut: true });
    await waitFor(page, async () => (await page.locator('.ap-banner').count()) >= 1);
    check('signed out: a team page’s link says to sign in', (await page.locator('.ap-banner').first().innerText()).includes('If it is one of the team’s pages, sign in to open it.'));
  }

  check('no page errors anywhere', pageErrors.length === 0, pageErrors.slice(0, 5).join(' || '));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) {
    console.log('Failures:\n - ' + failures.join('\n - '));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
