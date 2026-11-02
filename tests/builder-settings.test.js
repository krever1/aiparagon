// Tests for the page settings tabs in site-builder.html (#5): SEO (the title in Google and the
// search description with their counts, the Google and link previews, the picture for shares, hiding
// from search engines, the checks, Write both with AI, and the tags the published page and the draft
// preview carry, put back on leaving), Domain (what counts as a domain, the records it will need, the
// live DNS check through Google then Cloudflare, only while the tab shows, a domain another page has,
// Remove, kept on the page record and on the dashboard card) and the Chatbot (off until switched on,
// its settings saved with the page, never on the editor canvas, on the draft preview at once and on
// the live page after Publish, the window from the keyboard, what each message sends, the contact form
// and its checks, the booking button, every error, the contacts list and its CSV, and a phone screen),
// and Custom code (the tracking IDs and why a wrong one is wrong, each service's tag, what pasted code
// holds and loads and what to fix in it, saved and published with the page, and none of it ever
// running or loading in the editor, on the preview or on the live page, or reaching the AI or the
// chatbot). Supabase sign-in, the two n8n webhooks and DNS over HTTPS are stubbed. The chatbot's answers are
// real ones from the Site Builder · Chatbot workflow. Offline otherwise.
// Usage: node tests/builder-settings.test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const KEY = 'apSiteBuilder.v1';
const AUTH = 'apSiteBuilder.auth';
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const AI_HOOK = 'https://n8n.aiparagonconsulting.com/webhook/site-builder-ai';
const CHAT_HOOK = 'https://n8n.aiparagonconsulting.com/webhook/site-builder-chat';
const EMAIL = 'tester@aiparagonconsulting.com';

// Real answers from the Site Builder · Chatbot workflow (pinned test runs, Nov 2) for the sample page
const REPLY = {
  what: { ok: true, reply: 'Kinetic Studio builds cinematic websites, where a scene moves as visitors scroll and every word stays real, searchable text. You can also edit the site yourself after it launches, and every page adapts to phones, tablets and desktops.', action: 'none' },
  price: { ok: true, reply: 'I’m not able to quote prices, but the team can walk you through costs for your project. You can leave your name and email here and they will get back to you.', action: 'contact' },
  book: { ok: true, reply: 'Happy to help you get started! You can book a call with the team using the button below, and they will reach out about your project.', action: 'link' },
};

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const REWRITES = cfg.rewrites.map((r) => ({
  re: new RegExp('^' + r.source.replace(/\/:path\*$/, '(?:/.*)?').replace(/\//g, '\\/') + '$'),
  dest: r.destination,
}));
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
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, accept', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const dnsAnswer = (answers) => ({ Status: 0, Answer: answers.map(([type, data, name]) => ({ name: name || 'x.', type: type === 'CNAME' ? 5 : 1, TTL: 300, data })) });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const pageErrors = [];

  // A page with the sign-in, both webhooks and DNS over HTTPS stubbed. st records what reached them.
  // st.chat and st.ai are what the webhooks answer (an object, or a function of the request body):
  // { body, status, wait, abort }. st.dns[name] is Google's answer for a name (an object, or
  // { status } for a failed request); st.cf the same for Cloudflare.
  async function open(url, opts) {
    const o = opts || {};
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 }, isMobile: !!o.mobile, hasTouch: !!o.mobile, acceptDownloads: true });
    const st = { chat: o.chat || { body: REPLY.what }, chatReqs: [], ai: o.ai || null, aiReqs: [], dns: o.dns || {}, cf: o.cf || {}, dnsHits: [], outside: [] };
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      st.outside.push(u);
      return route.abort();
    });
    await ctx.route(SB + '/**', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: '{}' });
    });
    const hook = (list, key) => async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      let body = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      st[list].push(body);
      const a = typeof st[key] === 'function' ? st[key](body) : st[key];
      if (a && a.wait) await new Promise((r) => setTimeout(r, a.wait));
      try {
        if (!a || a.abort) return await route.abort();
        return await route.fulfill({ status: a.status || 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(a.body) });
      } catch (e) {
        /* the page stopped waiting */
      }
    };
    await ctx.route(CHAT_HOOK, hook('chatReqs', 'chat'));
    await ctx.route(AI_HOOK, hook('aiReqs', 'ai'));
    const doh = (which) => async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const name = new URL(req.url()).searchParams.get('name');
      st.dnsHits.push(which + ':' + name);
      const a = st[which][name];
      if (a && a.status) return route.fulfill({ status: a.status, headers: CORS, body: 'error' });
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/dns-json', body: JSON.stringify(a || { Status: 0 }) });
    };
    await ctx.route('https://dns.google/**', doh('dns'));
    await ctx.route('https://cloudflare-dns.com/**', doh('cf'));
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
    await page.waitForTimeout(250);
    return { ctx, page, st };
  }

  const stored = (page, k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k || KEY);
  const pageOf = async (page, id) => ((await stored(page)) || { pages: [] }).pages.find((p) => p.id === id);
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
    if (name !== 'SEO') await visible(page, '.ap-set-nav button:text-is("' + name + '")').click();
    await waitFor(page, async () => (await visible(page, '.ap-set-nav button[aria-current="page"]').innerText()) === name);
    await page.waitForTimeout(100);
  }
  // A stored page's draft settings changed before the app reads them (seed, then reload)
  async function seedRoot(page, id, props, live) {
    await page.evaluate(({ key, id, props, live }) => {
      const s = JSON.parse(localStorage.getItem(key));
      const p = s.pages.find((x) => x.id === id);
      p.draft.root.props = { ...p.draft.root.props, ...props };
      if (live && p.live) p.live.root.props = { ...p.live.root.props, ...props };
      localStorage.setItem(key, JSON.stringify(s));
    }, { key: KEY, id, props, live: !!live });
  }
  const meta = (page, sel, attr) => page.evaluate(([s, a]) => { const el = document.head.querySelector(s); return el ? el.getAttribute(a || 'content') : null; }, [sel, attr]);
  const BOT = { on: true };

  /* ---------------- The checks and helpers, on their own ---------------- */
  {
    const { page } = await open(BASE + '/builder');
    const r = await page.evaluate(() => {
      const T = window.__SB_TEST__;
      const n = (s) => { const x = T.normalizeDomain(s); return x.host || 'ERR:' + x.error; };
      const home = T.makeData('cinematic', { title: 'Home', slug: 'home' });
      const biz = T.makeData('business', { title: 'Services', slug: 'services' });
      const hole = JSON.parse(JSON.stringify(home));
      hole.content[1].props.headline = 'We help [Who you help] in [City]';
      hole.content.push({ type: 'Hero', props: { id: 'Hero-2', headline: 'Again', background: 'image', imageUrl: 'https://img.example/a.jpg', imageAlt: '' } });
      hole.content.push({ type: 'Button', props: { id: 'Button-1', label: 'Click', href: '#' } });
      const noHero = { root: { props: { title: 'X' } }, content: [] };
      const map = (checks) => Object.fromEntries(checks.map((c) => [c.key, c.ok]));
      const text = T.pageTextFor(T.config, home);
      return {
        dom: [n('https://WWW.Example.com/about?x=1#y'), n('example.co.uk'), n('example.com.'), n('bücher.de'), n('shop.example.com:8080')],
        bad: [n(''), n('not a domain'), n('1.2.3.4'), n('me@example.com'), n('foo.vercel.app'), n('localhost'), n('exa_mple.com'), n('example.c0m'), n('example')],
        rec: [T.recordsFor('example.com'), T.recordsFor('www.example.com'), T.recordsFor('shop.example.com'), T.recordsFor('www.example.co.uk')].map((l) => l.map((x) => x.type + ' ' + x.name + ' ' + x.value).join('|')),
        pair: [T.pairOf('example.com'), T.pairOf('www.example.com'), T.pairOf('shop.example.com')],
        homeChecks: map(T.seoChecks(home)),
        bizChecks: map(T.seoChecks(biz)),
        holeChecks: T.seoChecks(hole),
        noHero: T.seoChecks(noHero).find((c) => c.key === 'headline'),
        seo: [T.seoOf({ root: { props: { title: 'Home', seoTitle: '  ' } } }).title, T.seoOf({ root: { props: { title: 'Home', socialImage: 'http://img.example/a.jpg' } } }).image, T.seoOf({ root: { props: { noindex: 'yes' } } }).noindex],
        bot: T.botOf({ chatbot: { on: true, tone: 'shouty', leads: 'all', link: 'javascript:alert(1)', starters: ['a', '', 'b', 'c', 'd'], side: 'middle' } }),
        botLinks: ['https://x.example/book', 'mailto:hi@x.example', 'tel:+1 555 010 1234', '#contact', 'ftp://x', 'x.example'].map((l) => T.botOf({ chatbot: { link: l } }).link),
        botLabel: [T.botOf({}).label, T.botOf({ chatbot: { label: '' } }).label],
        text,
        brand: [T.brandOf(home), T.brandOf({ root: { props: { title: 'Only a name' } }, content: [] })],
        starters: T.startersFor(T.botOf({}), home),
        catalog: T.catalog(),
        applied: T.applyAnswer(home, { summary: 's', root: { seoTitle: 'x'.repeat(90) }, sections: [] }, { ask: 'seo' }).data.root.props.seoTitle.length,
      };
    });
    check('domain: an address typed any way becomes the host', r.dom.join(',') === 'www.example.com,example.co.uk,example.com,xn--bcher-kva.de,shop.example.com', r.dom.join(','));
    check('domain: not a domain is refused, with why', r.bad.every((x) => x.startsWith('ERR:')) && /IP address/.test(r.bad[2]) && /email/.test(r.bad[3]) && /vercel\.app/.test(r.bad[4]) && /ending/.test(r.bad[7]) && /dot/.test(r.bad[8]), r.bad.join(' | '));
    check('domain: a bare domain needs two A records and www', r.rec[0] === 'A @ 216.198.79.1|A @ 64.29.17.1|CNAME www cname.vercel-dns.com', r.rec[0]);
    check('domain: www first for a www address, then the bare domain', r.rec[1] === 'CNAME www cname.vercel-dns.com|A @ 216.198.79.1|A @ 64.29.17.1', r.rec[1]);
    check('domain: another subdomain needs its own CNAME only', r.rec[2] === 'CNAME shop cname.vercel-dns.com' && r.rec[3].startsWith('CNAME www'), r.rec[2]);
    check('domain: www and the bare domain go together', r.pair.join(',') === 'www.example.com,example.com,', r.pair.join(','));
    check('seo: the sample pages pass the headline, link and placeholder checks', r.homeChecks.headline && r.homeChecks.links && r.homeChecks.placeholders && r.bizChecks.headline, JSON.stringify(r.homeChecks));
    check('seo: the page name alone is a short title, and no picture fails', r.homeChecks.title === false && r.homeChecks.image === false);
    const hc = Object.fromEntries(r.holeChecks.map((c) => [c.key, c]));
    check('seo: placeholders in [brackets] are counted', !hc.placeholders.ok && /^2 parts in \[brackets\]/.test(hc.placeholders.text), hc.placeholders.text);
    check('seo: two Heroes are one heading too many', !hc.headline.ok && /2 Heroes/.test(hc.headline.text));
    check('seo: a picture with no description is found', hc.pictures && !hc.pictures.ok && /1 picture has no description/.test(hc.pictures.text));
    check('seo: a button that goes nowhere is found', !hc.links.ok && /1 button or link goes nowhere/.test(hc.links.text), hc.links.text);
    check('seo: no Hero means no main headline', r.noHero && !r.noHero.ok && /Add a Hero/.test(r.noHero.text));
    check('seo: an empty title falls back to the page name, only https pictures, noindex only when true', r.seo[0] === 'Home' && r.seo[1] === '' && r.seo[2] === false);
    check('chatbot settings: unknown values fall back, an unsafe link is dropped, three questions at most', r.bot.tone === 'friendly' && r.bot.leads === 'email' && r.bot.link === '' && r.bot.starters.join(',') === 'a,b,c' && r.bot.side === 'right');
    check('chatbot settings: web, mail, phone and section links pass, others do not', r.botLinks.join('|') === 'https://x.example/book|mailto:hi@x.example|tel:+1 555 010 1234|#contact||', r.botLinks.join('|'));
    check('chatbot settings: the button says Chat with us unless cleared', r.botLabel[0] === 'Chat with us' && r.botLabel[1] === '');
    check('chatbot: reads the page by section, FAQ answers included', r.text.includes('[FAQ]') && r.text.includes('- Can I edit the site after it launches?: Yes.') && r.text.startsWith('Page: Home'));
    check('chatbot: never reads links, ids or picture addresses', !/#contact|#story|https?:|anchor|Hero-1/.test(r.text));
    check('chatbot: the brand from the menu bar, else the page name', r.brand.join(',') === 'Kinetic Studio,Only a name');
    check('chatbot: suggested questions from the page FAQ when none are set', r.starters.length === 3 && r.starters[0] === 'Can I edit the site after it launches?');
    check('AI: the block list offers the title in Google', r.catalog.includes('\n  seoTitle (Title in Google'));
    check('AI: a title in Google from the AI is cut to 70 characters', r.applied === 70, String(r.applied));
    await page.context().close();
  }

  /* ---------------- SEO tab ---------------- */
  {
    const { page, st } = await open(BASE + '/builder/edit/home');
    await canvas(page);
    const rail = await page.locator('[class*="NavItem-link"]').allInnerTexts();
    check('rail: SEO, Domain and Chatbot tabs after AI', ['SEO', 'Domain', 'Chatbot'].every((t) => rail.includes(t)) && rail.indexOf('SEO') > rail.indexOf('AI'), rail.join(','));
    await visible(page, 'button:has-text("Settings")').focus();
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'set-seo-h');
    check('Settings: the header button opens SEO from the keyboard, cursor on its heading', (await page.evaluate(() => document.activeElement.id)) === 'set-seo-h');
    const serp = async () => (await visible(page, '.ap-serp').innerText()).replace(/\s+/g, ' ');
    check('SEO: the page name stands in for the title in Google', (await serp()).includes('Home') && (await page.locator('#seo-title-hint').innerText()).includes('Empty, it uses the page name') && (await page.locator('#seo-title').getAttribute('placeholder')).startsWith('Home'));
    check('SEO: the preview shows where the page opens', (await serp()).includes('builder › view › home'), await serp());
    await page.fill('#seo-title', 'Cinematic websites that move with the scroll');
    await waitFor(page, async () => (await serp()).includes('Cinematic websites that move'));
    check('SEO: the title shows in the preview, with its count', (await page.locator('#seo-title-hint .ap-count').innerText()).replace(/\s/g, '') === '44/60' && (await serp()).includes('Cinematic websites that move with the scroll'));
    check('SEO: and passes the title check', (await visible(page, '.ap-checks li[data-ok="true"]').allInnerTexts()).some((t) => /good length \(44 characters\)/.test(t)));
    await page.fill('#seo-title', 'x'.repeat(75));
    await waitFor(page, async () => (await page.locator('#seo-title-hint .ap-count').getAttribute('data-off')) === 'true');
    check('SEO: a long title is marked and the preview cut off', (await serp()).includes('…') && (await visible(page, '.ap-checks li[data-ok="false"]').allInnerTexts()).some((t) => /long \(75 characters\)/.test(t)));
    await page.fill('#seo-title', 'Cinematic websites that move with the scroll');
    await page.fill('#seo-desc', 'Too short.');
    await waitFor(page, async () => (await visible(page, '.ap-checks li[data-ok="false"]').allInnerTexts()).some((t) => /description is short/.test(t)));
    check('SEO: a short description is marked', (await page.locator('#seo-desc-hint .ap-count').getAttribute('data-off')) === 'true');
    await page.fill('#seo-desc', 'Kinetic Studio builds cinematic websites: a scene that moves as visitors scroll, with every word kept as real, searchable text.');
    await page.fill('#seo-image', 'http://img.example/share.jpg');
    await waitFor(page, async () => (await page.locator('#seo-image').getAttribute('aria-invalid')) === 'true');
    check('SEO: a picture link that is not https is refused', (await page.locator('#seo-image-hint').innerText()).includes('https://') && (await visible(page, '.ap-share img').count()) === 0);
    await page.fill('#seo-image', 'https://img.example/share.jpg');
    await waitFor(page, async () => (await visible(page, '.ap-share img').count()) === 1);
    await page.waitForTimeout(500); // Puck makes edits within 300 ms one undo step
    check('SEO: an https picture shows in the share preview', (await visible(page, '.ap-share img').getAttribute('src')) === 'https://img.example/share.jpg');
    const counts = async () => {
      const head = await visible(page, '.ap-checks h3 span').innerText();
      const ok = await visible(page, '.ap-checks li[data-ok="true"]').count();
      const all = await visible(page, '.ap-checks li').count();
      return { head, ok, all };
    };
    const c = await counts();
    check('SEO: the count is the checks that pass', c.head === c.ok + ' of ' + c.all + ' pass' && c.ok === c.all, JSON.stringify(c));
    await visible(page, '.ap-check input[type="checkbox"]').check();
    await page.waitForTimeout(500);
    const saved = await waitFor(page, async () => {
      const p = await pageOf(page, 'home');
      const rp = p.draft.root.props;
      return rp.noindex === true && rp.seoTitle === 'Cinematic websites that move with the scroll' && rp.socialImage === 'https://img.example/share.jpg' ? rp : null;
    });
    check('SEO: the settings are saved with the draft', !!saved);
    check('SEO: and mark the page as changed until it is published', (await pageOf(page, 'home')).updatedAt > (await pageOf(page, 'home')).publishedAt);
    check('SEO: no AI or DNS calls on the way', st.aiReqs.length === 0 && st.dnsHits.length === 0);

    // Undo in the editor takes a settings change back like any other edit
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(600);
    const undone = await waitFor(page, async () => { const rp = (await pageOf(page, 'home')).draft.root.props; return rp.noindex !== true ? rp : null; });
    check('SEO: undo takes the last change back, and only that', !!undone && undone.seoTitle === 'Cinematic websites that move with the scroll', JSON.stringify(undone && { noindex: undone.noindex, seoTitle: undone.seoTitle }));

    // Publish, then the live page's tags
    await visible(page, 'button:has-text("Publish")').click();
    await waitFor(page, async () => (await pageOf(page, 'home')).live.root.props.seoTitle === 'Cinematic websites that move with the scroll');
    await page.goto(BASE + '/builder/view/home');
    await waitFor(page, async () => (await page.title()) === 'Cinematic websites that move with the scroll');
    check('live page: the title in Google is the tab title', (await page.title()) === 'Cinematic websites that move with the scroll');
    check('live page: description, Open Graph and X card tags', (await meta(page, 'meta[name="description"]')).startsWith('Kinetic Studio builds') && (await meta(page, 'meta[property="og:title"]')) === 'Cinematic websites that move with the scroll' && (await meta(page, 'meta[property="og:image"]')) === 'https://img.example/share.jpg' && (await meta(page, 'meta[name="twitter:card"]')) === 'summary_large_image' && (await meta(page, 'meta[property="og:type"]')) === 'website');
    check('live page: may be listed, with its own address as canonical', (await meta(page, 'meta[name="robots"]')) === 'index, follow' && (await meta(page, 'link[rel="canonical"]', 'href')) === BASE + '/builder/view/home');
    await page.goto(BASE + '/builder/view/home/draft');
    await page.waitForTimeout(300);
    check('draft preview: never listed, no canonical address', (await meta(page, 'meta[name="robots"]')) === 'noindex, nofollow' && (await meta(page, 'link[rel="canonical"]', 'href')) === null);
    await visible(page, '.ap-pill a:has-text("All pages")').click();
    await waitFor(page, async () => (await page.title()) === 'Pages · Site Builder · AI Paragon');
    check('leaving the page puts the builder’s own tags back', (await meta(page, 'meta[property="og:title"]')) === null && (await meta(page, 'meta[name="robots"]')) === null && (await meta(page, 'meta[name="description"]')).startsWith('Build a page with a visual editor'));
    await seedRoot(page, 'home', { noindex: true }, true);
    await page.goto(BASE + '/builder/view/home');
    await page.waitForTimeout(300);
    check('live page: hidden from search engines when the setting says so', (await meta(page, 'meta[name="robots"]')) === 'noindex, nofollow');
    await page.context().close();
  }

  // Write both with AI: only the two search settings come from the answer
  {
    const { page, st } = await open(BASE + '/builder/edit/home', {
      ai: (body) => ({ body: { ok: true, summary: 'Wrote them.', root: { seoTitle: 'Cinematic Websites That Move | Kinetic Studio', description: 'Kinetic Studio builds cinematic websites where a scene moves as visitors scroll and every word stays real text search engines can read.', theme: 'light' }, sections: body.page.sections.map((s) => (s.type === 'Hero' ? { edit: s.id, props: { headline: 'Changed by mistake' } } : { keep: s.id })) } }),
    });
    await canvas(page);
    await tab(page, 'SEO');
    const before = (await pageOf(page, 'home')).draft;
    await visible(page, '.ap-set-ai button').click();
    await waitFor(page, async () => (await page.inputValue('#seo-title')) === 'Cinematic Websites That Move | Kinetic Studio');
    check('SEO with AI: the title and description arrive in their boxes', (await page.inputValue('#seo-desc')).startsWith('Kinetic Studio builds cinematic websites where'));
    check('SEO with AI: the request asks for those two only', st.aiReqs.length === 1 && /seoTitle/.test(st.aiReqs[0].ask) && /Change nothing else/.test(st.aiReqs[0].ask) && st.aiReqs[0].auth === 'tok-A1');
    const after = await waitFor(page, async () => { const d = (await pageOf(page, 'home')).draft; return d.root.props.seoTitle ? d : null; });
    check('SEO with AI: nothing else on the page changes, even if the answer tries', !!after && JSON.stringify(after.content) === JSON.stringify(before.content) && after.root.props.theme === 'dark');
    check('SEO with AI: says what it did', (await visible(page, '.ap-set-ai [role="status"]').innerText()).includes('Wrote the title and description'));
    st.ai = { status: 500, body: { ok: false, code: 'model', message: 'The AI could not answer just now. Try again in a minute.' } };
    await visible(page, '.ap-set-ai button').click();
    await waitFor(page, async () => (await visible(page, '.ap-set-ai [role="alert"]').count()) === 1);
    check('SEO with AI: an error is said in words', (await visible(page, '.ap-set-ai [role="alert"]').innerText()).includes('could not answer'));
    await page.context().close();
  }
  {
    const { page } = await open(BASE + '/builder/edit/home', { signedOut: true });
    await canvas(page);
    await tab(page, 'SEO');
    check('SEO with AI, signed out: the button says to sign in', (await visible(page, '.ap-set-ai button').innerText()).includes('Sign in on the AI tab'));
    await visible(page, '.ap-set-ai button').click();
    await waitFor(page, async () => (await visible(page, '#ai-email').count()) === 1);
    check('SEO with AI, signed out: and opens the AI tab to sign in', (await visible(page, '#ai-email').count()) === 1);
    await page.context().close();
  }

  /* ---------------- Domain tab ---------------- */
  {
    const dns = {
      'www.deltaadvisory.com': dnsAnswer([['CNAME', 'ext-sq.squarespace.com.'], ['A', '198.185.159.144']]),
      'deltaadvisory.com': dnsAnswer([['A', '198.185.159.145']]),
    };
    const { page, st } = await open(BASE + '/builder/edit/home', { dns });
    await canvas(page);
    await page.waitForTimeout(400);
    check('Domain: nothing is looked up while the tab is not showing', st.dnsHits.length === 0);
    await tab(page, 'Domain');
    check('Domain: says where the live page opens now', (await visible(page, '.ap-set-now code').innerText()).endsWith('/builder/view/home'));
    for (const [typed, why] of [['', 'Type your domain'], ['not a domain', 'not a domain'], ['192.168.0.1', 'IP address'], ['kser@example.com', 'email']]) {
      await page.fill('#dom-name', typed);
      await visible(page, 'button:text-is("Save")').click();
      const msg = await visible(page, '#dom-err').innerText().catch(() => '');
      check('Domain: refuses “' + typed + '”, saying why', msg.includes(why) && (await page.locator('#dom-name').getAttribute('aria-invalid')) === 'true' && (await page.evaluate(() => document.activeElement.id)) === 'dom-name', msg);
    }
    await page.fill('#dom-name', 'https://WWW.DeltaAdvisory.com/about');
    await visible(page, 'button:text-is("Save")').click();
    await waitFor(page, async () => (await visible(page, '.ap-dns li').count()) === 2);
    check('Domain: saved as the host, not connected yet', (await visible(page, '.ap-dom-name').innerText()).includes('www.deltaadvisory.com') && (await visible(page, '.ap-dom-name').innerText()).includes('Not connected yet'));
    const lines = await visible(page, '.ap-dns li').allInnerTexts();
    check('Domain: the check reads both www and the bare domain', lines[0].includes('www.deltaadvisory.com') && lines[0].includes('ext-sq.squarespace.com') && lines[1].includes('198.185.159.145') && lines.every((l) => l.includes('your current website')), lines.join(' | '));
    check('Domain: through Google’s DNS over HTTPS', st.dnsHits.includes('dns:www.deltaadvisory.com') && st.dnsHits.includes('dns:deltaadvisory.com') && !st.dnsHits.some((h) => h.startsWith('cf:')));
    const rows = (await visible(page, '.ap-rec tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(/ Copy$/, '').trim());
    check('Domain: the records it will need', rows.join('|') === 'CNAME www cname.vercel-dns.com|A @ 216.198.79.1|A @ 64.29.17.1', rows.join('|'));
    check('Domain: with a warning not to add them yet', (await visible(page, '.ap-set-warn').innerText()).includes('Don’t add these yet'));
    const p1 = await pageOf(page, 'home');
    check('Domain: kept on the page record, the page not marked changed', p1.domain === 'www.deltaadvisory.com' && p1.updatedAt <= p1.publishedAt && !('domain' in p1.draft.root.props));
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await visible(page, '.ap-copy').first().click();
    await waitFor(page, async () => (await visible(page, '.ap-copy').first().innerText()) === 'Copied');
    check('Domain: Copy puts the value on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())) === 'cname.vercel-dns.com');

    // Pointing here, not found, Google failing (Cloudflare answers), both failing
    st.dns['www.deltaadvisory.com'] = dnsAnswer([['CNAME', '641ee76e9855236f.vercel-dns-017.com.'], ['A', '216.198.79.1']]);
    st.dns['deltaadvisory.com'] = { status: 500 };
    st.cf['deltaadvisory.com'] = dnsAnswer([['A', '76.76.21.21']]);
    await visible(page, '.ap-dns .ap-btn:text-is("Check again")').click();
    await waitFor(page, async () => (await visible(page, '.ap-dns li[data-state="here"]').count()) === 2);
    check('Domain: a domain already pointing at Vercel says so', (await visible(page, '.ap-dns li').first().innerText()).includes('Already points to Vercel'));
    check('Domain: Cloudflare answers when Google fails', st.dnsHits.includes('cf:deltaadvisory.com'));
    st.dns['deltaadvisory.com'] = { Status: 3 };
    st.dns['www.deltaadvisory.com'] = { status: 503 };
    st.cf['www.deltaadvisory.com'] = { status: 503 };
    await visible(page, '.ap-dns .ap-btn:text-is("Check again")').click();
    await waitFor(page, async () => (await visible(page, '.ap-dns li[data-state="missing"]').count()) === 1);
    const l2 = await visible(page, '.ap-dns li').allInnerTexts();
    check('Domain: not found and could not check, in words', l2[0].includes('Could not check just now') && l2[1].includes('Not found in DNS'), l2.join(' | '));

    // The same domain on another page, then Remove
    await page.goto(BASE + '/builder/edit/services');
    await canvas(page);
    await tab(page, 'Domain');
    await page.fill('#dom-name', 'www.deltaadvisory.com');
    await visible(page, 'button:text-is("Save")').click();
    check('Domain: one domain, one page', (await visible(page, '#dom-err').innerText()).includes('“Home” already uses www.deltaadvisory.com'));
    await page.goto(BASE + '/builder');
    await page.waitForTimeout(200);
    check('dashboard: the card shows the domain, not connected yet', (await page.locator('[data-page="home"] .ap-card-extra').innerText()).includes('www.deltaadvisory.com · not connected yet'));
    await page.goto(BASE + '/builder/edit/home');
    await canvas(page);
    await tab(page, 'Domain');
    check('Domain: still there after a reload', (await visible(page, '.ap-dom-name').innerText()).includes('www.deltaadvisory.com'));
    await visible(page, '.ap-dom .ap-btn:text-is("Remove")').click();
    await waitFor(page, async () => (await page.evaluate(() => document.activeElement.id)) === 'dom-name');
    check('Domain: Remove clears it and puts the cursor back in the box', (await page.inputValue('#dom-name')) === '' && !('domain' in (await pageOf(page, 'home'))));
    await page.context().close();
  }

  /* ---------------- Chatbot ---------------- */
  {
    const { page, st } = await open(BASE + '/builder/edit/home');
    await canvas(page);
    await tab(page, 'Chatbot');
    check('Chatbot: off at first, its settings hidden', !(await visible(page, '.ap-check-big input').isChecked()) && (await page.locator('#bot-name').count()) === 0);
    await page.goto(BASE + '/builder/view/home/draft');
    await page.waitForTimeout(300);
    check('Chatbot: no chat button on the page while it is off', (await page.locator('.sb-chat-launch').count()) === 0);
    await page.goto(BASE + '/builder/edit/home');
    await canvas(page);
    await tab(page, 'Chatbot');
    await visible(page, '.ap-check-big input').check();
    await waitFor(page, async () => (await page.locator('#bot-name').count()) === 1);
    check('Chatbot: switched on, the settings show with the page’s brand', (await page.locator('#bot-name').getAttribute('placeholder')) === 'Kinetic Studio assistant' && (await page.locator('#bot-greeting').getAttribute('placeholder')).includes('Kinetic Studio'));
    await page.fill('#bot-knows', 'Open Monday to Friday, 9 to 5 Pacific.');
    await page.fill('#bot-rules', 'Never quote prices.');
    await visible(page, '.ap-seg label:has-text("Professional") input').check();
    await page.fill('#bot-link', 'calendly.com/kinetic');
    await waitFor(page, async () => (await page.locator('#bot-link').getAttribute('aria-invalid')) === 'true');
    check('Chatbot: a link that is not a full one is refused', (await page.locator('#bot-link-hint').innerText()).includes('https://') && (await page.locator('#bot-link-label').count()) === 0);
    await page.fill('#bot-link', 'https://calendly.com/kinetic/intro');
    await waitFor(page, async () => (await page.locator('#bot-link-label').count()) === 1);
    await page.fill('#bot-link-label', 'Book a call');
    const saved = await waitFor(page, async () => {
      const b = (await pageOf(page, 'home')).draft.root.props.chatbot;
      return b && b.on && b.linkLabel === 'Book a call' && b.tone === 'professional' ? b : null;
    });
    check('Chatbot: its settings are saved with the draft', !!saved && saved.knows === 'Open Monday to Friday, 9 to 5 Pacific.' && saved.rules === 'Never quote prices.' && saved.link === 'https://calendly.com/kinetic/intro');
    const frame = await canvas(page);
    check('Chatbot: never on the editor canvas', (await frame.locator('.sb-chat').count()) === 0);

    // Try it, in the tab
    await page.locator('.ap-try .sb-chat-compose textarea').fill('What do you actually do?');
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await page.locator('.ap-try .sb-chat-bot:not(.sb-chat-typing)').count()) === 2);
    check('Chatbot tab: Try it answers in place', (await page.locator('.ap-try .sb-chat-bot').last().innerText()).includes('cinematic websites'));
    st.chat = { body: REPLY.price };
    await page.locator('.ap-try .sb-chat-compose textarea').fill('How much does a website cost?');
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await page.locator('.ap-try .sb-chat-lead').count()) === 1);
    const inner = await page.evaluate(() => {
      const panel = document.querySelector('.ap-try .sb-chat-panel').getBoundingClientRect();
      return [...document.querySelectorAll('.ap-try .sb-chat-lead, .ap-try .sb-chat-lead input, .ap-try .sb-chat-lead p')].every((el) => el.getBoundingClientRect().right <= panel.right + 0.5);
    });
    check('Chatbot tab: the contact form fits the narrow window', inner);
    await page.locator('.ap-try .sb-chat-lead button.sb-chat-link').click();
    st.chat = { body: REPLY.what };
    const req = st.chatReqs[0];
    check('Chatbot: the request carries the token, the settings and the page', req && req.auth === 'tok-A1' && req.bot.name === 'Kinetic Studio assistant' && req.bot.tone === 'professional' && req.bot.knows.startsWith('Open Monday') && req.bot.rules === 'Never quote prices.' && req.bot.leads === 'email' && req.bot.hasLink === true && req.page.brand === 'Kinetic Studio' && req.page.text.includes('[FAQ]'));
    check('Chatbot: the conversation goes oldest first, ending with the question', req.messages.length === 2 && req.messages[0].role === 'bot' && req.messages[1].role === 'visitor' && req.messages[1].text === 'What do you actually do?');
    check('Chatbot: never the renewal key or the booking address', !JSON.stringify(req).includes('ref-A1') && !JSON.stringify(req).includes('calendly'));

    // The live page shows it only once published
    await page.goto(BASE + '/builder/view/home');
    await page.waitForTimeout(300);
    check('Chatbot: not on the live page before Publish', (await page.locator('.sb-chat-launch').count()) === 0);
    await page.goto(BASE + '/builder/view/home/draft');
    await waitFor(page, async () => (await page.locator('.sb-chat-launch').count()) === 1);
    check('Chatbot: on the draft preview at once, in the right corner', (await page.locator('.sb-chat-launch').innerText()).includes('Chat with us') && (await page.locator('.sb-chat').getAttribute('data-side')) === 'right');
    await page.goto(BASE + '/builder');
    check('dashboard: the card says the chatbot is on', (await page.locator('[data-page="home"] .ap-card-extra').innerText()).includes('Chatbot on'));
    await page.goto(BASE + '/builder/edit/home');
    await canvas(page);
    await visible(page, 'button:has-text("Publish")').click();
    await waitFor(page, async () => !!((await pageOf(page, 'home')).live.root.props.chatbot || {}).on);
    await page.goto(BASE + '/builder/view/home');
    await waitFor(page, async () => (await page.locator('.sb-chat-launch').count()) === 1);
    check('Chatbot: on the live page after Publish', (await page.locator('.sb-chat-launch').count()) === 1);

    // The window from the keyboard
    await page.locator('.sb-chat-launch').focus();
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label'))) === 'Your message');
    check('window: opens with the cursor in the message box', (await page.locator('.sb-chat-launch').getAttribute('aria-expanded')) === 'true' && (await page.locator('.sb-chat-panel[role="dialog"]').getAttribute('aria-label')) === 'Kinetic Studio assistant');
    check('window: greets and suggests the page’s FAQ questions', (await page.locator('.sb-chat-bot').first().innerText()).includes('Hi! Ask me anything about Kinetic Studio.') && (await page.locator('.sb-chat-chip').count()) === 3);
    check('window: says it is automated', (await page.locator('.sb-chat-who small').innerText()) === 'Automated assistant' && (await page.locator('.sb-chat-foot').innerText()).includes('It can get things wrong'));
    await page.keyboard.press('Escape');
    await waitFor(page, async () => (await page.locator('.sb-chat-panel').count()) === 0);
    check('window: Esc closes it and the cursor goes back to the button', (await page.evaluate(() => document.activeElement.className)).includes('sb-chat-launch'));

    // A suggested question, then the contact form
    st.chat = { body: REPLY.price, wait: 300 };
    await page.locator('.sb-chat-launch').click();
    await page.locator('.sb-chat-chip').first().click();
    await waitFor(page, async () => (await page.locator('.sb-chat-typing').count()) === 1, 2000);
    check('window: shows it is typing while it waits', (await page.locator('.sb-chat-typing .sb-sr').innerText()).includes('is typing'));
    await waitFor(page, async () => (await page.locator('.sb-chat-lead').count()) === 1);
    check('window: a suggested question is sent as typed, and the chips go', st.chatReqs[st.chatReqs.length - 1].messages.slice(-1)[0].text === 'Can I edit the site after it launches?' && (await page.locator('.sb-chat-chip').count()) === 0);
    check('window: “contact” brings the form, name and email', (await page.locator('.sb-chat-lead input').count()) === 2);
    await page.locator('.sb-chat-lead button[type="submit"]').click();
    check('form: a name is needed', (await page.locator('.sb-chat-err').innerText()) === 'Add your name.' && (await page.evaluate(() => document.activeElement.autocomplete)) === 'name');
    await page.locator('.sb-chat-lead input[autocomplete="name"]').fill('=HYPERLINK("x") Jane');
    await page.locator('.sb-chat-lead input[type="email"]').fill('jane@');
    await page.locator('.sb-chat-lead button[type="submit"]').click();
    check('form: and an email that works', (await page.locator('.sb-chat-err').innerText()).includes('email address'));
    await page.locator('.sb-chat-lead input[type="email"]').fill('jane@example.com');
    await page.locator('.sb-chat-lead button[type="submit"]').click();
    await waitFor(page, async () => (await page.locator('.sb-chat-lead').count()) === 0);
    check('form: sent, with thanks by name', (await page.locator('.sb-chat-bot').last().innerText()).includes('Thanks, =HYPERLINK("x"). Kinetic Studio will get back to you by email.'));
    const lead = (await pageOf(page, 'home')).leads;
    check('form: the contact is kept on the page, with the question and where it came from', lead && lead.length === 1 && lead[0].email === 'jane@example.com' && lead[0].question === 'Can I edit the site after it launches?' && lead[0].via === 'live page' && lead[0].phone === '');

    // The booking button
    st.chat = { body: REPLY.book };
    await page.locator('.sb-chat-compose textarea').fill('Can I book a call to talk about my project?');
    await page.locator('.sb-chat-send').click();
    await waitFor(page, async () => (await page.locator('.sb-chat-card a.sb-btn').count()) === 1);
    const a = page.locator('.sb-chat-card a.sb-btn');
    check('window: “link” brings the booking button, in a new tab', (await a.innerText()) === 'Book a call' && (await a.getAttribute('href')) === 'https://calendly.com/kinetic/intro' && (await a.getAttribute('target')) === '_blank' && (await a.getAttribute('rel')).includes('noopener'));

    // Contacts in the tab, and the CSV
    await page.goto(BASE + '/builder/edit/home');
    await canvas(page);
    await tab(page, 'Chatbot');
    check('Chatbot tab: lists the contact', (await visible(page, '.ap-leads li').count()) === 1 && (await visible(page, '.ap-leads li').innerText()).includes('jane@example.com') && (await visible(page, '.ap-leads h3 span').innerText()) === '1');
    const [dl] = await Promise.all([page.waitForEvent('download'), visible(page, '.ap-leads .ap-btn:text-is("Download CSV")').click()]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    check('Chatbot tab: the CSV has a header and the contact, a formula made harmless', dl.suggestedFilename() === 'home-chat-contacts.csv' && csv.startsWith('When,Name,Email,Phone,Question,Where\r\n') && csv.includes('"\'=HYPERLINK(""x"") Jane",jane@example.com,,Can I edit the site after it launches?,live page'), csv);
    await visible(page, '.ap-leads .ap-btn:text-is("Clear")').click();
    await visible(page, '.ap-leads .ap-btn:text-is("Clear 1")').click();
    await waitFor(page, async () => !(await pageOf(page, 'home')).leads);
    check('Chatbot tab: Clear asks once more, then empties the list', (await visible(page, '.ap-leads li').count()) === 0);
    await page.context().close();
  }

  // Settings that change what the visitor sees, and every error
  {
    const { page, st } = await open(BASE + '/builder');
    await seedRoot(page, 'home', { chatbot: { on: true, leads: 'phone', side: 'left', label: '', greeting: 'Hello there.', starters: ['How fast is it?'] } });
    await page.goto(BASE + '/builder/view/home/draft');
    await waitFor(page, async () => (await page.locator('.sb-chat-launch').count()) === 1);
    const box = await page.locator('.sb-chat-launch').boundingBox();
    check('settings: the left corner, an icon-only button named for screen readers', (await page.locator('.sb-chat').getAttribute('data-side')) === 'left' && box.x < 100 && (await page.locator('.sb-chat-launch').getAttribute('aria-label')) === 'Chat with Kinetic Studio assistant');
    await page.locator('.sb-chat-launch').click();
    check('settings: the team’s greeting and question', (await page.locator('.sb-chat-bot').first().innerText()).includes('Hello there.') && (await page.locator('.sb-chat-chip').allInnerTexts()).join('|') === 'How fast is it?');
    st.chat = { body: REPLY.price };
    await page.locator('.sb-chat-chip').click();
    await waitFor(page, async () => (await page.locator('.sb-chat-lead').count()) === 1);
    check('settings: name, email and phone when asked for', (await page.locator('.sb-chat-lead input').count()) === 3);
    await page.locator('.sb-chat-lead input[autocomplete="name"]').fill('Sam Lee');
    await page.locator('.sb-chat-lead input[type="email"]').fill('sam@example.com');
    await page.locator('.sb-chat-lead button[type="submit"]').click();
    check('settings: and the phone is checked', (await page.locator('.sb-chat-err').innerText()) === 'Add a phone number.');
    await page.locator('.sb-chat-lead button.sb-chat-link').click();
    check('form: No thanks takes it away', (await page.locator('.sb-chat-lead').count()) === 0);

    // leads off: an answer asking for contact details brings no form
    await seedRoot(page, 'home', { chatbot: { on: true, leads: 'off' } });
    await page.goto(BASE + '/builder/view/home/draft');
    await page.locator('.sb-chat-launch').click();
    await page.locator('.sb-chat-compose textarea').fill('Call me?');
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await page.locator('.sb-chat-bot:not(.sb-chat-typing)').count()) === 2);
    check('settings: no form when the team said not to ask', (await page.locator('.sb-chat-lead').count()) === 0 && st.chatReqs[st.chatReqs.length - 1].bot.leads === 'off');
    check('settings: no booking button without a link', st.chatReqs[st.chatReqs.length - 1].bot.hasLink === false);

    // No connection, then Try again sends the same question once more
    st.chat = { abort: true };
    await page.locator('.sb-chat-compose textarea').fill('Are you open on Saturdays?');
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await page.locator('.sb-chat-note').count()) === 1);
    check('errors: no connection, in words', (await page.locator('.sb-chat-note').innerText()).includes('Could not reach the assistant'));
    st.chat = { body: { ok: true, reply: 'We are open Monday to Friday.', action: 'none' } };
    const n0 = st.chatReqs.length;
    await page.locator('.sb-chat-note button:has-text("Try again")').click();
    await waitFor(page, async () => (await page.locator('.sb-chat-note').count()) === 0 && (await page.locator('.sb-chat-bot').last().innerText()).includes('Monday to Friday'));
    const last = st.chatReqs[st.chatReqs.length - 1];
    check('errors: Try again asks once more, the question not doubled', st.chatReqs.length === n0 + 1 && last.messages.filter((m) => m.text === 'Are you open on Saturdays?').length === 1 && (await page.locator('.sb-chat-visitor:has-text("Are you open on Saturdays?")').count()) === 1);
    for (const [label, ans, words] of [
      ['the workflow’s own message', { status: 200, body: { ok: false, code: 'bad_request', message: 'Type a question first.' } }, 'Type a question first.'],
      ['a server error', { status: 500, body: { message: 'x' } }, 'could not answer just now'],
      ['a gateway timeout', { status: 504, body: {} }, 'took too long'],
      ['an empty answer', { status: 200, body: { ok: true, reply: '  ' } }, 'could not answer just now'],
    ]) {
      st.chat = ans;
      const notes = await page.locator('.sb-chat-note').count();
      await page.locator('.sb-chat-compose textarea').fill('One more question?');
      await page.keyboard.press('Enter');
      await waitFor(page, async () => (await page.locator('.sb-chat-note').count()) > notes);
      check('errors: ' + label, (await page.locator('.sb-chat-note').last().innerText()).includes(words), await page.locator('.sb-chat-note').last().innerText());
    }
    st.chat = { status: 401, body: { ok: false, code: 'unauthorized', message: 'Sign in with an AI Paragon account to try the chatbot.' } };
    await page.locator('.sb-chat-compose textarea').fill('Last one?');
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await page.locator('.sb-chat-note[data-code="signin"]').count()) === 1);
    check('errors: a refused sign-in is forgotten, with a way to sign in again', (await page.locator('.sb-chat-note[data-code="signin"] a').getAttribute('href')) === '/builder/edit/home' && (await stored(page, AUTH)) === null);
    check('window: the message box keeps to 1,000 characters', (await page.locator('.sb-chat-compose textarea').getAttribute('maxlength')) === '1000');
    await page.context().close();
  }
  {
    const { page, st } = await open(BASE + '/builder', { signedOut: true });
    await seedRoot(page, 'home', { chatbot: BOT });
    await page.goto(BASE + '/builder/view/home/draft');
    await page.locator('.sb-chat-launch').click();
    await page.locator('.sb-chat-compose textarea').fill('Hello?');
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await page.locator('.sb-chat-note').count()) === 1);
    check('signed out: the chat says it answers the team only, and nothing is sent', (await page.locator('.sb-chat-note').innerText()).includes('Sign in with your AI Paragon account') && st.chatReqs.length === 0 && (await page.locator('.sb-chat-note a').innerText()).includes('Sign in from the editor'));
    await page.goto(BASE + '/builder/edit/home');
    await canvas(page);
    await tab(page, 'Chatbot');
    check('signed out: the Chatbot tab offers its own sign-in form', (await visible(page, '#chat-email').count()) === 1 && (await visible(page, '#chat-pw').count()) === 1 && (await visible(page, '.ap-try .ap-ai-lede').innerText()).includes('Visitors chat on the live page without signing in'));
    await page.context().close();
  }

  /* ---------------- Custom code ---------------- */
  {
    const { page } = await open(BASE + '/builder');
    const r = await page.evaluate(() => {
      const T = window.__SB_TEST__;
      const tr = (k) => T.TRACKERS.find((x) => x.key === k);
      const home = T.makeData('cinematic', { title: 'Home', slug: 'home' });
      const coded = JSON.parse(JSON.stringify(home));
      coded.root.props.code = { head: '<script>window.__x = 1</script>', body: '<p>SECRET-BODY</p>' };
      coded.root.props.tracking = { ga4: 'G-ABC1234567' };
      return {
        err: [
          T.trackerError(tr('ga4'), ' g-abc1234567 '),
          T.trackerError(tr('ga4'), 'UA-1234-1'),
          T.trackerError(tr('ga4'), 'gtm-abc123'),
          T.trackerError(tr('gtm'), 'G-ABC123456'),
          T.trackerError(tr('meta'), '12345'),
          T.trackerError(tr('meta'), '1234567890123456'),
          T.trackerError(tr('linkedin'), 'abc'),
          T.trackerError(tr('hubspot'), '12 345 678'),
          T.trackerError(tr('ga4'), ''),
        ],
        out: T.pageCode({ tracking: { ga4: ' g-abc1234567 ', gtm: 'gtm-ab12cd', meta: '1234567890123456', linkedin: '1234567', hubspot: '7654321' }, code: { head: '<meta name="x" content="y">', body: '<script>go()</script>' } }),
        bad: T.pageCode({ tracking: { ga4: 'UA-1-1', meta: '123' } }),
        c1: T.checkCode({ code: { head: '<div>x</div><script>a()</script>', body: 'alert(1)' } }),
        c2: T.checkCode({ code: { head: '<script src="http://x.example/a.js">', body: '<style>p{}' } }),
        c3: T.checkCode({ tracking: { meta: '1234567890123456' }, code: { body: "<script>fbq('init', '1234567890123456');</script><script async src=\"https://static.hotjar.com/c/hotjar-1.js\"></script><iframe src=\"https://cal.example/x\"></iframe>" } }),
        c4: T.checkCode({}),
        ai: JSON.stringify(T.pageForAi(coded)),
        cat: T.catalog(),
        applied: T.applyAnswer(coded, { root: { code: { head: '<script>evil()</script>' }, tracking: { ga4: 'G-EVIL123456' } }, sections: [] }, { ask: 'x' }).data.root.props,
        text: T.pageTextFor(T.config, coded),
      };
    });
    check('code: a Google ID is tidied, a wrong one says why', r.err[0] === '' && /Universal Analytics/.test(r.err[1]) && /Tag Manager box/.test(r.err[2]) && /Google Analytics 4 box/.test(r.err[3]) && r.err[8] === '', r.err.slice(0, 4).join(' | '));
    check('code: number IDs are digits only', /digits only, 10 or more/.test(r.err[4]) && r.err[5] === '' && /digits only/.test(r.err[6]) && r.err[7] === '');
    check('code: each service’s own tag, with the ID', r.out.head.includes('gtag/js?id=G-ABC1234567') && r.out.head.includes("gtag('config', 'G-ABC1234567')") && r.out.head.includes("fbq('init', '1234567890123456')") && r.out.bodyEnd.includes('_linkedin_partner_id = "1234567"') && r.out.bodyEnd.includes('js.hs-scripts.com/7654321.js'));
    check('code: Tag Manager first in the head and right after the body opens', r.out.head.indexOf('gtm.js') < r.out.head.indexOf('gtag/js') && r.out.head.includes("'GTM-AB12CD'") && r.out.bodyStart.includes('ns.html?id=GTM-AB12CD'));
    check('code: the team’s own code in place (head after the tags, body before them)', r.out.head.endsWith('<meta name="x" content="y">') && r.out.bodyEnd.startsWith('<script>go()</script>'));
    check('code: an ID that is not one adds nothing', r.bad.head === '' && r.bad.bodyStart === '' && r.bad.bodyEnd === '');
    check('code: body tags in the head, and loose text, are flagged', r.c1.warnings.some((w) => /<div> cannot go in the head/.test(w)) && r.c1.warnings.some((w) => /body code is plain text/.test(w)), r.c1.warnings.join(' | '));
    check('code: an unclosed tag and an http link are flagged', r.c2.warnings.some((w) => /<script> tag in the head code is not closed/.test(w)) && r.c2.warnings.some((w) => /<style> tag in the body code is not closed/.test(w)) && r.c2.warnings.some((w) => /x\.example over http/.test(w)), r.c2.warnings.join(' | '));
    const f3 = r.c3.found.map((f) => f.label + ':' + f.from + ':' + f.id).join('|');
    check('code: services found in pasted code, with their IDs', f3.includes('Meta Pixel:field:1234567890123456') && f3.includes('Meta Pixel:code:1234567890123456') && f3.includes('Hotjar:code:'), f3);
    check('code: a service in its box and in the code counts twice, and says so', r.c3.warnings.some((w) => /Meta Pixel is in its box and in your code/.test(w)));
    check('code: what the code loads and holds', r.c3.hosts.join(',') === 'cal.example,static.hotjar.com' && r.c3.counts.scripts === 2 && r.c3.counts.external === 1 && r.c3.counts.frames === 1, JSON.stringify([r.c3.hosts, r.c3.counts]));
    check('code: nothing yet says so', r.c4.empty === true && r.c4.warnings.length === 0);
    check('code: never sent to the page AI, never offered to it, never taken from it', !/__x|SECRET-BODY|G-ABC1234567|tracking|"code"/.test(r.ai) && !/\b(tracking|code) \(/.test(r.cat) && JSON.stringify(r.applied.code) === JSON.stringify({ head: '<script>window.__x = 1</script>', body: '<p>SECRET-BODY</p>' }) && r.applied.tracking.ga4 === 'G-ABC1234567');
    check('code: never part of what the chatbot reads', !/__x|SECRET-BODY|G-ABC/.test(r.text));
    await page.context().close();
  }
  {
    const { page, st } = await open(BASE + '/builder/edit/home');
    await canvas(page);
    await tab(page, 'Code');
    check('Code tab: from the settings buttons, saying where code runs', (await visible(page, '#code-where').innerText()).includes('never runs in the editor or on these previews'));
    const order = await visible(page, '.ap-code-tags label').allInnerTexts();
    check('Code tab: Google Analytics first, then Tag Manager, Meta, LinkedIn and HubSpot', order.map((t) => t.split(/\s{2,}|\n/)[0].replace(/ (Measurement|Container|Pixel|Partner|Hub) ID$/, '')).join('|') === 'Google Analytics 4|Google Tag Manager|Meta Pixel|LinkedIn Insight Tag|HubSpot tracking', order.join('|'));
    await page.fill('#trk-ga4', 'UA-1234-1');
    check('Code tab: a wrong ID is marked and says why', (await page.locator('#trk-ga4').getAttribute('aria-invalid')) === 'true' && (await page.locator('#trk-ga4-hint').innerText()).includes('Universal Analytics'));
    await page.fill('#trk-ga4', 'g-abc1234567');
    await page.fill('#trk-linkedin', '1234567');
    await page.fill('#code-head', '<script>window.__headRan = 1</script>\n<script src="https://tracker.example/t.js"></script>\n<link rel="stylesheet" href="https://tracker.example/s.css">');
    await page.fill('#code-body', '<script>window.__bodyRan = 1</script>\n<img src="https://tracker.example/p.gif" alt="">');
    await waitFor(page, async () => (await visible(page, '.ap-code-found li').count()) === 2);
    check('Code tab: the right ID is taken, and listed with what the code loads', (await page.locator('#trk-ga4').getAttribute('aria-invalid')) === null && (await visible(page, '.ap-code-found').innerText()).includes('G-ABC1234567') && (await visible(page, '.ap-code-report').innerText()).includes('tracker.example'));
    check('Code tab: the length of each box', (await page.locator('#code-head-hint .ap-count').innerText()).endsWith('/ 20,000') && (await page.locator('#code-head').getAttribute('maxlength')) === '20000');
    await visible(page, '.ap-code-out summary').click();
    const shown = (await visible(page, '.ap-code-out').innerText()).replace(/\s+/g, ' ');
    check('Code tab: shows the code that goes on the page, tags and all', shown.includes('In the head') && shown.includes('gtag/js?id=G-ABC1234567') && shown.includes('window.__headRan = 1') && shown.includes('At the end of the body') && shown.includes('_linkedin_partner_id = "1234567"'));
    const saved = await waitFor(page, async () => {
      const rp = (await pageOf(page, 'home')).draft.root.props;
      return rp.tracking && rp.tracking.linkedin === '1234567' && rp.code && rp.code.body.includes('__bodyRan') ? rp : null;
    });
    check('Code tab: saved with the draft, as typed', !!saved && saved.tracking.ga4 === 'g-abc1234567');
    const frame = await canvas(page);
    check('editor: none of it runs, on the page or on the canvas', (await page.evaluate(() => [window.__headRan, window.__bodyRan].join(','))) === ',' && (await frame.evaluate(() => [window.__headRan, window.__bodyRan].join(','))) === ',');
    await visible(page, 'button:has-text("Publish")').click();
    await waitFor(page, async () => !!((await pageOf(page, 'home')).live.root.props.code || {}).head);
    check('Publish: the code goes live with the page', (await pageOf(page, 'home')).live.root.props.tracking.linkedin === '1234567');
    for (const [where, url] of [['live page', '/builder/view/home'], ['draft preview', '/builder/view/home/draft']]) {
      await page.goto(BASE + url);
      await page.waitForTimeout(500);
      const got = await page.evaluate(() => ({
        ran: [window.__headRan, window.__bodyRan].join(','),
        tags: [...document.querySelectorAll('script[src], link[href], img[src], iframe[src]')].filter((e) => /tracker\.example|googletagmanager|licdn|hs-scripts/.test(e.src || e.href)).length,
        dataLayer: typeof window.dataLayer,
      }));
      check(where + ': the code and tags never run here, and nothing loads', got.ran === ',' && got.tags === 0 && got.dataLayer === 'undefined' && !st.outside.some((u) => /tracker\.example|googletagmanager|licdn|hs-scripts/.test(u)), JSON.stringify(got));
    }
    await page.context().close();
  }

  // A phone screen
  {
    const { page } = await open(BASE + '/builder', { viewport: { width: 390, height: 844 }, mobile: true });
    await seedRoot(page, 'home', { chatbot: { on: true } });
    await page.goto(BASE + '/builder/view/home/draft');
    await waitFor(page, async () => (await page.locator('.sb-chat-launch').count()) === 1);
    const lb = await page.locator('.sb-chat-launch').boundingBox();
    const pill = await page.locator('.ap-pill').boundingBox();
    check('phone: the chat button sits above the preview bar', lb.y + lb.height <= pill.y, JSON.stringify([lb, pill]));
    await page.locator('.sb-chat-launch').click();
    const pb = await page.locator('.sb-chat-panel').boundingBox();
    check('phone: the window fits the screen', pb.x >= 0 && pb.x + pb.width <= 390 && pb.y >= 0, JSON.stringify(pb));
    check('phone: no sideways scroll', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    await page.context().close();
  }
  {
    const { page } = await open(BASE + '/builder/edit/home', { viewport: { width: 1280, height: 800 } });
    await canvas(page);
    for (const name of ['SEO', 'Domain', 'Code', 'Chatbot']) {
      await tab(page, name);
      if (name === 'Chatbot') await visible(page, '.ap-check-big input').check();
      await page.waitForTimeout(200);
      const over = await page.evaluate(() => [...document.querySelectorAll('.ap-set')].filter((el) => el.offsetParent).map((el) => el.scrollWidth - el.clientWidth));
      check('tabs: ' + name + ' fits the side panel', over.length === 1 && over[0] <= 0, JSON.stringify(over));
    }
    await page.locator('.ap-try .sb-chat-compose textarea').fill('What do you actually do?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const shifted = await page.evaluate(() => {
      let n = [...document.querySelectorAll('.ap-set')].find((x) => x.offsetParent);
      while (n && n !== document.body) {
        if (n.scrollLeft) return n.scrollLeft;
        n = n.parentElement;
      }
      return 0;
    });
    check('tabs: a chat answer never scrolls the side panel sideways', shifted === 0, String(shifted));
    await page.context().close();
  }

  check('no page errors anywhere', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) {
    console.log('\nFailures:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
