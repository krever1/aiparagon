// Tests for the website builder's live pages (#5 hosting, the aiparagon-sites Vercel project in
// sites/): the server function (sites/api/page.mjs) finding a page by its address on the shared link
// or by its own domain, the search and link-preview tags and the canonical, the custom code where
// the team put it, the data the browser script takes over, what it never sends, the redirects (one
// address per page, www and the bare domain to the saved one), the 404 and back-in-a-moment pages
// and the cache headers; then the browser script on top of that HTML (no hydration warnings, the
// motion, the chat for visitors and its contact form against a stand-in for the Site Builder ·
// Visitor Chat workflow, every chat error, and the page's own custom code running here, on its own
// address), on a computer and a phone. The database is a stand-in that answers site_page() from
// made-up rows. Offline otherwise.
// Usage: node tests/builder-sites.test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SITES = path.join(ROOT, 'sites');
const SB = 'https://euzdaxouzvmvvukbuvwi.supabase.co';
const VISITOR_HOOK = 'https://n8n.aiparagonconsulting.com/webhook/site-chat';
const TEAM_HOOKS = /site-builder-chat|site-builder-ai|site-builder-domain|functions\/v1\/site-session/;

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}

(async () => {
  const { GET, HEAD } = await import(path.join(SITES, 'api', 'page.mjs'));
  const browser = await chromium.launch();

  // The pages, made by the builder itself from its templates
  const maker = await browser.newPage();
  await maker.addInitScript(() => { window.__SB_TEST__ = true; });
  await maker.goto('file://' + path.join(ROOT, 'site-builder.html'));
  const data = await maker.evaluate(() => {
    const t = window.__SB_TEST__;
    const kinetic = t.makeData('cinematic', { title: 'Kinetic Studio', slug: 'kinetic-studio' });
    Object.assign(kinetic.root.props, {
      seoTitle: 'Kinetic Studio | Websites that move',
      description: 'Cinematic websites for brands that want visitors to remember them. Every word stays real, searchable text.',
      socialImage: 'https://img.example.com/share.png',
      chatbot: { on: true, name: 'Kit', greeting: 'Hi! Ask me about Kinetic.', leads: 'phone', link: 'https://cal.example.com/kinetic', linkLabel: 'Book a call', starters: ['What do you build?'] },
      tracking: { ga4: 'G-ABC1234567', meta: '1234567890123456' },
      code: { head: '<script>window.__headRan = (window.__headRan || 0) + 1</script><meta name="x-team" content="yes">', body: '<script>window.__bodyRan = (window.__bodyRan || 0) + 1</script>' },
    });
    const hero = kinetic.content.find((c) => c.type === 'Hero');
    hero.props.headline = 'Websites that </script><script>window.__pwned=1</script> move';
    const plain = t.makeData('business', { title: 'Plain Page', slug: 'plain' });
    Object.assign(plain.root.props, { theme: 'light', noindex: true });
    const acme = t.makeData('business', { title: 'Acme Roofing', slug: 'acme' });
    acme.root.props.chatbot = { on: true, leads: 'email' };
    return { kinetic, plain, acme };
  });
  await maker.close();

  const rows = {
    'kinetic-studio': { id: 'kinetic-ab12', slug: 'kinetic-studio', domain: null, published_at: '2026-11-02T10:00:00Z', live: data.kinetic },
    plain: { id: 'plain-cd34', slug: 'plain', domain: null, published_at: '2026-11-02T10:00:00Z', live: data.plain },
    acme: { id: 'acme-ef56', slug: 'acme', domain: 'acme.example.com', published_at: '2026-11-02T10:00:00Z', live: data.acme },
  };
  const db = { calls: [], down: false };
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    db.calls.push({ url, body, apikey: init.headers.apikey });
    if (db.down) return new Response('{"message":"down"}', { status: 503 });
    let row = null;
    if (body.p_slug) row = rows[body.p_slug] || null;
    if (body.p_host) {
      const bare = String(body.p_host).toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
      row = Object.values(rows).find((r) => r.domain && r.domain.replace(/^www\./, '') === bare) || null;
    }
    return new Response(JSON.stringify(row), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  // The page as drawn, without the styles and the data (which name classes and settings too)
  const rootOf = (text) => text.slice(text.indexOf('<div id="sb-root">'), text.indexOf('<script id="sb-data"'));
  const ask = async (url, host, method) => {
    const req = new Request(url, { method: method || 'GET', headers: { host: host || new URL(url).host } });
    const res = await (method === 'HEAD' ? HEAD : GET)(req, fetcher);
    return { res, text: method === 'HEAD' ? '' : await res.text() };
  };

  /* ---------------- The server, on its own ---------------- */
  {
    const { res, text } = await ask('https://sites.aiparagonconsulting.com/kinetic-studio');
    check('server: a live page on the shared link', res.status === 200 && res.headers.get('content-type') === 'text/html; charset=utf-8');
    check('server: asks the database by its address, with the public key only', db.calls[0].url === SB + '/rest/v1/rpc/site_page' && db.calls[0].body.p_slug === 'kinetic-studio' && /^sb_publishable_/.test(db.calls[0].apikey));
    check('server: short in the CDN, then refreshed', res.headers.get('cache-control') === 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
    check('server: the title in Google', text.includes('<title>Kinetic Studio | Websites that move</title>'));
    check('server: the search description and robots', text.includes('<meta name="description" content="Cinematic websites for brands') && text.includes('<meta name="robots" content="index, follow">'));
    check('server: link previews (Open Graph and X)', text.includes('<meta property="og:title" content="Kinetic Studio | Websites that move">') && text.includes('<meta property="og:image" content="https://img.example.com/share.png">') && text.includes('<meta name="twitter:card" content="summary_large_image">'));
    check('server: the canonical is the shared link', text.includes('<link rel="canonical" href="https://sites.aiparagonconsulting.com/kinetic-studio">') && text.includes('<meta property="og:url" content="https://sites.aiparagonconsulting.com/kinetic-studio">'));
    const head = text.slice(0, text.indexOf('</head>'));
    const body = text.slice(text.indexOf('<body>'));
    check('server: the tracking tags in the head', head.includes('googletagmanager.com/gtag/js?id=G-ABC1234567') && head.includes("fbq('init', '1234567890123456')"));
    check('server: the team’s head code after the tags, as written', head.indexOf('gtag/js') < head.indexOf('window.__headRan') && head.includes('<meta name="x-team" content="yes">'));
    check('server: the team’s body code at the end of the body', /window.__bodyRan = \(window.__bodyRan \|\| 0\) \+ 1<\/script>\n<\/body>/.test(text));
    const drawn = rootOf(text);
    check('server: the page itself is in the HTML (search engines read it as is)', drawn.includes('class="sb-site"') && drawn.includes('Kinetic') && drawn.length > 4000, String(drawn.length));
    check('server: the chat button is drawn, its window closed', drawn.includes('class="sb-chat-launch"') && !drawn.includes('What do you build?') && !drawn.includes('sb-chat-panel'));
    check('server: page words are escaped', body.includes('Websites that &lt;/script&gt;&lt;script&gt;window.__pwned=1&lt;/script&gt; move'));
    const json = /<script id="sb-data" type="application\/json">([^<]*)<\/script>/.exec(text);
    check('server: the data for the browser cannot end its script tag', !!json && !/<\/script/i.test(json[1]) && json[1].includes('\\u003c/script\\u003e'));
    const info = json ? JSON.parse(json[1]) : {};
    check('server: the data is the live page, its id and address, nothing else', JSON.stringify(Object.keys(info).sort()) === JSON.stringify(['id', 'live', 'slug']) && info.id === 'kinetic-ab12' && !('draft' in info));
    check('server: the browser script, with its own name', /<script src="\/_site\/site\.[0-9a-f]{10}\.js" defer><\/script>/.test(text) && fs.existsSync(path.join(SITES, '_site', /\/_site\/(site\.[0-9a-f]{10}\.js)/.exec(text)[1])));
    check('server: content that fades in still shows without scripts', text.includes('<noscript><style>.sb-site .sb-reveal{opacity:1!important;transform:none!important}</style></noscript>'));
    check('server: the dark theme behind the page', text.includes('<meta name="theme-color" content="#05070d">') && text.includes('body{background:#05070d}'));
    check('server: plain safety headers', res.headers.get('x-content-type-options') === 'nosniff' && res.headers.get('referrer-policy') === 'strict-origin-when-cross-origin');
  }
  {
    const { res, text } = await ask('https://sites.aiparagonconsulting.com/plain');
    check('server: a page hidden from search says so', res.status === 200 && text.includes('<meta name="robots" content="noindex, nofollow">'));
    check('server: no chat, tags or code when the page has none', !rootOf(text).includes('class="sb-chat-launch"') && !text.includes('gtag') && !text.slice(0, text.indexOf('</head>')).includes('<script'));
    check('server: the light theme behind the page', text.includes('body{background:#f6f7fb}') && text.includes('data-theme="light"'));
  }
  {
    let r = await ask('https://sites.aiparagonconsulting.com/Kinetic-Studio/?utm_source=x');
    check('server: one address per page (case and a trailing slash)', r.res.status === 301 && r.res.headers.get('location') === '/kinetic-studio?utm_source=x');
    r = await ask('https://sites.aiparagonconsulting.com/');
    check('server: the shared link on its own is a plain 404', r.res.status === 404 && r.text.includes('Nothing here yet') && r.text.includes('<meta name="robots" content="noindex">'));
    r = await ask('https://sites.aiparagonconsulting.com/nope');
    check('server: an address with nothing live', r.res.status === 404 && r.res.headers.get('cache-control') === 'public, max-age=0, s-maxage=10');
    r = await ask('https://sites.aiparagonconsulting.com/kinetic-studio/more');
    check('server: deeper addresses are not pages', r.res.status === 404);
    const before = db.calls.length;
    r = await ask('https://sites.aiparagonconsulting.com/%3Cscript%3E');
    check('server: a strange address never reaches the database', r.res.status === 404 && db.calls.length === before && !r.text.includes('<script>'));
    r = await ask('https://acme.example.com/');
    check('server: a page on its own domain', r.res.status === 200 && db.calls[db.calls.length - 1].body.p_host === 'acme.example.com' && r.text.includes('<link rel="canonical" href="https://acme.example.com/">'));
    r = await ask('https://www.acme.example.com/', 'WWW.Acme.Example.com');
    check('server: www goes to the saved domain', r.res.status === 308 && r.res.headers.get('location') === 'https://acme.example.com/');
    r = await ask('https://acme.example.com/about', 'acme.example.com');
    check('server: a domain shows its one page only', r.res.status === 404);
    r = await ask('https://sites.aiparagonconsulting.com/acme');
    check('server: a page with a domain still opens on the shared link, pointing search engines at its domain', r.res.status === 200 && r.text.includes('<link rel="canonical" href="https://acme.example.com/">'));
    r = await ask('https://other.example.com/', 'other.example.com');
    check('server: a domain no page has', r.res.status === 404 && r.text.includes('other.example.com'));
    r = await ask('https://aiparagon-sites-git-main-kaesers-projects.vercel.app/plain');
    check('server: the sites project’s own Vercel addresses work like the shared link', r.res.status === 200);
    r = await ask('https://sites.aiparagonconsulting.com/kinetic-studio', null, 'HEAD');
    check('server: HEAD answers like GET, with no body', r.res.status === 200);
    db.down = true;
    r = await ask('https://sites.aiparagonconsulting.com/kinetic-studio');
    db.down = false;
    check('server: the database down is a short “back in a moment”, never cached', r.res.status === 503 && r.res.headers.get('cache-control') === 'no-store' && r.text.includes('Back in a moment'));
  }
  {
    const cfg = JSON.parse(fs.readFileSync(path.join(SITES, 'vercel.json'), 'utf8'));
    const rw = new RegExp('^' + cfg.rewrites[0].source.replace(/\\\\/g, '\\') + '$');
    check('vercel.json: every address goes to the function, but its script, robots.txt and the function itself', ['/kinetic-studio', '/', '/a/b'].every((p) => rw.test(p)) && !rw.test('/_site/site.abc.js') && !rw.test('/robots.txt') && !rw.test('/api/page') && cfg.rewrites[0].destination === '/api/page');
    check('vercel.json: the script cached for a year (its name changes with it)', JSON.stringify(cfg.headers).includes('max-age=31536000, immutable'));
    check('robots.txt lets search engines in (each page says noindex itself)', fs.readFileSync(path.join(SITES, 'robots.txt'), 'utf8') === 'User-agent: *\nAllow: /\n');
    check('the main site never serves the sites project', /^\/sites$/m.test(fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8')));
  }

  /* ---------------- In a browser ---------------- */
  // A local server answers like the sites project: the script from sites/_site, everything else
  // from the function (127.0.0.1 counts as the shared link). Other hosts are routed in the browser.
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname.startsWith('/_site/')) {
      const f = path.join(SITES, u.pathname);
      if (!f.startsWith(path.join(SITES, '_site')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return fs.createReadStream(f).pipe(res);
    }
    const r = await GET(new Request('http://127.0.0.1' + req.url, { headers: { host: '127.0.0.1' } }), fetcher);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  // st.chat: what the Visitor Chat stand-in answers (an object, or a function of the request body)
  async function open(url, opts) {
    const o = opts || {};
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1280, height: 800 }, isMobile: !!o.mobile, hasTouch: !!o.mobile });
    const st = { chat: o.chat || { body: { ok: true, reply: 'We build cinematic websites.', action: 'none' } }, reqs: [], outside: [], team: [], logs: [] };
    await ctx.route('**/*', async (route) => {
      const req = route.request();
      const u = req.url();
      if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      if (u.startsWith(VISITOR_HOOK)) {
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' } });
        let body = null;
        try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
        st.reqs.push(body);
        const a = typeof st.chat === 'function' ? st.chat(body) : st.chat;
        if (a.abort) return route.abort();
        return route.fulfill({ status: a.status || 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(a.body) });
      }
      // A page on its own domain, served like the sites project would
      if (u.startsWith('https://acme.example.com/')) {
        const p = new URL(u).pathname;
        if (p.startsWith('/_site/')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(SITES, p)) });
        const r = await GET(new Request(u, { headers: { host: 'acme.example.com' } }), fetcher);
        return route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
      }
      if (TEAM_HOOKS.test(u)) st.team.push(u);
      st.outside.push(u);
      return route.abort();
    });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') st.logs.push(m.type() + ': ' + m.text().slice(0, 200)); });
    page.on('pageerror', (e) => st.logs.push('pageerror: ' + e.message.slice(0, 200)));
    await page.goto(url);
    await page.waitForTimeout(400);
    return { ctx, page, st };
  }
  const waitFor = async (page, fn, ms) => {
    const end = Date.now() + (ms || 5000);
    while (Date.now() < end) { if (await fn()) return true; await page.waitForTimeout(50); }
    return false;
  };
  const say = async (page, words) => {
    await page.fill('.sb-chat-compose textarea', words);
    await page.keyboard.press('Enter');
  };

  {
    const { ctx, page, st } = await open(BASE + '/kinetic-studio');
    // Real-looking warnings from the page's own code (blocked tracking scripts) are not hydration
    const hydration = st.logs.filter((l) => /hydrat|did not match|Minified React error/i.test(l));
    check('browser: the script takes over the server’s HTML with no warnings', hydration.length === 0, hydration.join(' | '));
    check('browser: the team’s code runs once each, on the page’s own address', (await page.evaluate(() => [window.__headRan, window.__bodyRan].join(','))) === '1,1');
    check('browser: and the tracking tags load their services', st.outside.some((u) => u.startsWith('https://www.googletagmanager.com/gtag/js?id=G-ABC1234567')) && st.outside.some((u) => /connect\.facebook\.net/.test(u)));
    check('browser: words on the page never run', (await page.evaluate(() => window.__pwned)) === undefined);
    check('browser: the hero comes in', await waitFor(page, async () => (await page.locator('.sb-hero').count()) > 0));
    for (let y = 0; y < 7000; y += 500) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(60);
    }
    check('browser: sections fade in as they scroll into view', await waitFor(page, async () => (await page.locator('.is-in').count()) >= 3), String(await page.locator('.is-in').count()));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.sb-chat-launch').click();
    check('browser: the chat opens with its first message and suggested question', (await page.locator('.sb-chat-panel').innerText()).includes('Hi! Ask me about Kinetic.') && (await page.locator('.sb-chat-chip').innerText()) === 'What do you build?');
    const answers = page.locator('.sb-chat-bot:not(.sb-chat-typing)');
    await say(page, 'What do you build?');
    await waitFor(page, async () => (await answers.count()) >= 2);
    check('browser: a visitor’s question gets an answer', (await answers.last().innerText()).includes('We build cinematic websites.'));
    const sent = st.reqs[0] || {};
    check('browser: it sends only the page and the conversation (the workflow reads the rest)', JSON.stringify(Object.keys(sent).sort()) === JSON.stringify(['messages', 'page']) && sent.page === 'kinetic-ab12' && sent.messages.length === 2 && sent.messages[0].role === 'bot' && sent.messages[1].text === 'What do you build?');
    check('browser: nothing goes to the team’s own services', st.team.length === 0, st.team.join(' '));
    st.chat = { body: { ok: true, reply: 'Happy to set that up.', action: 'link' } };
    await say(page, 'Can I book a call?');
    await waitFor(page, async () => (await page.locator('.sb-chat-card a.sb-btn').count()) === 1);
    const book = page.locator('.sb-chat-card a.sb-btn');
    check('browser: the booking button, opening in a new tab', (await book.innerText()) === 'Book a call' && (await book.getAttribute('href')) === 'https://cal.example.com/kinetic' && (await book.getAttribute('target')) === '_blank');
    st.chat = { body: { ok: true, reply: 'The team can quote that.', action: 'contact' } };
    await say(page, 'How much is a site?');
    await waitFor(page, async () => (await page.locator('.sb-chat-lead').count()) === 1);
    check('browser: the contact form asks for name, email and phone', (await page.locator('.sb-chat-lead input').count()) === 3);
    await page.locator('.sb-chat-lead input').nth(0).fill('Ana Lima');
    await page.locator('.sb-chat-lead input').nth(1).fill('ana@example.com');
    await page.locator('.sb-chat-lead input').nth(2).fill('+1 555 010 1234');
    st.chat = { status: 503, body: { ok: false, code: 'lead' } };
    await page.locator('.sb-chat-lead button[type="submit"]').click();
    await waitFor(page, async () => (await page.locator('.sb-chat-lead .sb-chat-err').count()) === 1);
    check('browser: a contact that could not be saved keeps the form and says so', (await page.locator('.sb-chat-lead .sb-chat-err').innerText()).includes('Your details could not be sent just now') && (await page.locator('.sb-chat-lead input').nth(0).inputValue()) === 'Ana Lima');
    st.chat = { body: { ok: true } };
    await page.locator('.sb-chat-lead button[type="submit"]').click();
    await waitFor(page, async () => (await page.locator('.sb-chat-lead').count()) === 0);
    const lead = st.reqs[st.reqs.length - 1] || {};
    check('browser: the contact goes to the workflow with the question it came from', lead.page === 'kinetic-ab12' && lead.lead && lead.lead.name === 'Ana Lima' && lead.lead.email === 'ana@example.com' && lead.lead.phone === '+1 555 010 1234' && lead.lead.question === 'How much is a site?' && !('messages' in lead));
    check('browser: then thanks by name', (await answers.last().innerText()).includes('Thanks, Ana.'));
    for (const [label, answer, words] of [
      ['busy (a limit)', { status: 429, body: { ok: false, code: 'busy' } }, 'The chat is busy just now'],
      ['off', { status: 404, body: { ok: false, code: 'off' } }, 'not available on this page'],
      ['the model failing', { body: { ok: false, code: 'model' } }, 'could not answer just now'],
      ['no connection', { abort: true }, 'Could not reach the assistant'],
    ]) {
      st.chat = answer;
      const n = await page.locator('.sb-chat-note').count();
      await say(page, 'Another question');
      await waitFor(page, async () => (await page.locator('.sb-chat-note').count()) > n);
      check('browser: chat error, ' + label, (await page.locator('.sb-chat-note').last().innerText()).includes(words));
    }
    check('browser: the hosted page never asks the database', !st.outside.some((u) => u.startsWith(SB)));
    check('browser: no page errors', !st.logs.some((l) => l.startsWith('pageerror')), st.logs.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, st } = await open('https://acme.example.com/');
    check('browser: a page on its own domain', (await page.title()) === 'Acme Roofing' && (await page.locator('.sb-chat-launch').count()) === 1);
    await page.locator('.sb-chat-launch').click();
    await say(page, 'Do you fix leaks?');
    await waitFor(page, async () => st.reqs.length === 1);
    check('browser: its chat says which page it is', st.reqs[0] && st.reqs[0].page === 'acme-ef56');
    check('browser: no hydration warnings there either', !st.logs.some((l) => /hydrat|did not match|Minified React error/i.test(l)), st.logs.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page, st } = await open(BASE + '/kinetic-studio', { viewport: { width: 390, height: 844 }, mobile: true });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('phone: no sideways scroll', wide <= 0, String(wide));
    await page.locator('.sb-chat-launch').click();
    const box = await page.locator('.sb-chat-panel').boundingBox();
    check('phone: the chat fits the screen', box && box.x >= 0 && box.x + box.width <= 390 + 1, JSON.stringify(box));
    check('phone: no page errors', !st.logs.some((l) => l.startsWith('pageerror')));
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    await ctx.route('**/*', (route) => (route.request().url().startsWith(BASE) ? route.continue() : route.abort()));
    const page = await ctx.newPage();
    await page.goto(BASE + '/kinetic-studio');
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.sb-reveal')].filter((el) => getComputedStyle(el).opacity === '0').length);
    check('no scripts: the page still reads, nothing stays hidden', (await page.locator('h1').count()) >= 1 && hidden === 0, String(hidden));
    await ctx.close();
  }

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
