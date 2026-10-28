// Tests for the AI panel in site-builder.html (#5): the block list and page the builder sends, the
// checks on Claude's answer before it touches the page (blocks, fields, options, lengths, HTML,
// links, media, keep, edit and add, work done while the AI was busy), the sign-in (the builder's own
// session and its renewal, a dashboard sign-in borrowed read only), the panel (asking, Stop, the
// answer on the page, Undo, every error) and Describe it on New page.
// Supabase sign-in and the n8n webhook are stubbed. The two answers in tests/fixtures/builder-ai are
// real ones from the Site Builder · AI workflow. Offline otherwise.
// Usage: node tests/builder-ai.test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FILE = 'site-builder.html';
const KEY = 'apSiteBuilder.v1';
const AUTH = 'apSiteBuilder.auth';
const DASH = 'ap.session.v1';
const SB = 'https://lesyptuwllcgajdxzjje.supabase.co';
const HOOK = 'https://n8n.aiparagonconsulting.com/webhook/site-builder-ai';
const EMAIL = 'tester@aiparagonconsulting.com';
const PASSWORD = 'right-password';
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'builder-ai', n), 'utf8'));
const NEW_PAGE = fixture('new-page.json');
const CHANGE = fixture('change.json');
const LABELS = { Navbar: 'Menu bar', Hero: 'Hero', ScrollStory: 'Scroll story', Features: 'Feature cards', Steps: 'Steps', Split: 'Text and visual', Faq: 'FAQ', Cta: 'Call to action', Footer: 'Footer', Heading: 'Heading', Text: 'Text', Button: 'Button', Spacer: 'Spacer' };

// Same rewrites and redirects as vercel.json, read from the file itself
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

const session = (msLeft) => ({ access_token: 'tok-A1', refresh_token: 'ref-A1', expires_at: Date.now() + msLeft, email: EMAIL });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const pageErrors = [];

  // A page with Supabase sign-in and the AI webhook stubbed. st records what reached them;
  // st.answer is what the webhook answers (an object, or a function of the request body):
  // { body, status, type, wait, abort }, or null for a 500 with an HTML page.
  async function open(url, opts) {
    const o = opts || {};
    const ctx = await browser.newContext({ viewport: o.viewport || { width: 1440, height: 900 }, isMobile: !!o.mobile, hasTouch: !!o.mobile });
    const st = { hook: [], logins: [], refreshes: [], logouts: 0, answer: o.answer === undefined ? { body: CHANGE.answer } : o.answer, refresh: 'ok' };
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
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
      if (u.includes('grant_type=refresh_token')) {
        st.refreshes.push(body);
        if (st.refresh === 'refuse') return json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' });
        return json(200, { access_token: 'tok-A2', refresh_token: 'ref-A2', expires_in: 3600, user: { email: EMAIL } });
      }
      if (u.includes('/logout')) {
        st.logouts++;
        return route.fulfill({ status: 204, headers: CORS });
      }
      return json(404, {});
    });
    await ctx.route(HOOK, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      let body = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      st.hook.push(body);
      const a = typeof st.answer === 'function' ? st.answer(body) : st.answer;
      if (a && a.wait) await new Promise((r) => setTimeout(r, a.wait));
      try {
        if (!a) return await route.fulfill({ status: 500, headers: CORS, contentType: 'text/html', body: '<h1>Internal error</h1>' });
        if (a.abort) return await route.abort();
        return await route.fulfill({ status: a.status || 200, headers: CORS, contentType: a.type || 'application/json', body: typeof a.body === 'string' ? a.body : JSON.stringify(a.body) });
      } catch (e) {
        /* the page stopped waiting */
      }
    });
    await ctx.addInitScript((s) => {
      window.__SB_TEST__ = true;
      try {
        if (!sessionStorage.getItem('seeded')) {
          sessionStorage.setItem('seeded', '1');
          if (s.session) localStorage.setItem('apSiteBuilder.auth', JSON.stringify(s.session));
          if (s.dash) localStorage.setItem('ap.session.v1', JSON.stringify(s.dash));
        }
      } catch (e) {}
    }, { session: o.session || null, dash: o.dash || null });
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
  const draftOf = async (page, id) => ((await stored(page)) || { pages: [] }).pages.find((p) => p.id === id).draft;
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
  const panel = (page) => visible(page, '.ap-ai');
  async function openAi(page) {
    await visible(page, 'button:has-text("Ask AI")').click();
    await waitFor(page, async () => (await panel(page).count()) === 1);
    await page.waitForTimeout(150);
  }
  async function signInHere(page) {
    await page.fill('#ai-email', EMAIL);
    await page.fill('#ai-pw', PASSWORD);
    await page.click('.ap-ai-signin button[type="submit"]');
    await waitFor(page, async () => (await page.locator('#ai-ask').count()) === 1);
  }
  async function send(page, words) {
    await page.fill('#ai-ask', words);
    await visible(page, '.ap-ai-body .ap-btn-primary').click();
  }
  const resultText = async (page) => {
    await waitFor(page, async () => (await page.locator('.ap-ai-result').count()) === 1 && !(await page.locator('.ap-ai-working').count()), 8000);
    return (await page.locator('.ap-ai-result').innerText()).replace(/\s+/g, ' ').trim();
  };
  const types = (data) => data.content.map((c) => c.type).join(',');

  /* ---------------- What the AI is told ---------------- */
  let T0 = null;
  {
    const { page } = await open(BASE + '/builder');
    T0 = page;
    const cat = await page.evaluate(() => window.__SB_TEST__.catalog());
    const blocks = {};
    let cur = null;
    cat.split('\n').forEach((line) => {
      const m = line.match(/^([A-Z][A-Za-z]+) \(([^)]+(?:\([^)]*\))?)\): /);
      if (m && !line.startsWith(' ') && LABELS[m[1]]) { cur = m[1]; blocks[cur] = { label: m[2], lines: [] }; }
      else if (cur && line.startsWith('  ')) blocks[cur].lines.push(line.trim());
    });
    const missing = Object.keys(LABELS).filter((t) => !blocks[t] || blocks[t].label !== LABELS[t]);
    check('catalog: every block, by type and the name the editor shows', missing.length === 0 && Object.keys(blocks).length === Object.keys(LABELS).length, missing.join(', ') || Object.keys(blocks).join(','));
    const gaps = await page.evaluate((b) => {
      const out = [];
      Object.entries(window.__SB_TEST__.config.components).forEach(([type, c]) => {
        Object.entries(c.fields).forEach(([name, f]) => {
          const line = ((b[type] || {}).lines || []).find((l) => l.startsWith(name + ' ('));
          if (!line) out.push(type + '.' + name + ' missing');
          else if ((f.type === 'select' || f.type === 'radio') && f.options.some((o) => !line.includes('"' + o.value + '"'))) out.push(type + '.' + name + ' options');
          else if (f.type === 'array' && Object.keys(f.arrayFields).some((k) => !line.includes(k + ':'))) out.push(type + '.' + name + ' item fields');
        });
      });
      return out;
    }, blocks);
    check('catalog: every field of every block, with its options and list items', gaps.length === 0, gaps.join(', '));
    check('catalog: the page settings the AI may change, and not the page address', /^Page settings, in "root":/.test(cat) && ['title', 'description', 'theme', 'accent', 'font'].every((k) => cat.includes('\n  ' + k + ' (')) && !/\bslug\b/.test(cat));
    check('catalog: says when a field only counts with a choice', (blocks.Hero.lines.find((l) => l.startsWith('videoUrl')) || '').includes('only with background "video"') && (blocks.Split.lines.find((l) => l.startsWith('imageUrl')) || '').includes('only with visual "image"'));
    check('catalog: links, addresses and section ids are named as such', (blocks.Cta.lines.find((l) => l.startsWith('buttonHref')) || '').endsWith(': link') && (blocks.Hero.lines.find((l) => l.startsWith('imageUrl')) || '').includes('web address') && (blocks.Faq.lines.find((l) => l.startsWith('anchor')) || '').includes('menu links'));
    check('catalog: fits what the workflow takes (under 30,000 characters)', cat.length < 30000, cat.length);
    const pg = await page.evaluate(() => window.__SB_TEST__.pageForAi(window.__SB_TEST__.makeData('cinematic', { title: 'Home', slug: 'home' })));
    check('page sent: settings without the address', JSON.stringify(Object.keys(pg.root)) === JSON.stringify(['title', 'description', 'theme', 'accent', 'font']), JSON.stringify(Object.keys(pg.root)));
    check('page sent: each section with its id, block type and fields', pg.sections.length === 9 && pg.sections.every((s) => /^[A-Za-z]+-\d+$/.test(s.id) && LABELS[s.type] && s.props && !('id' in s.props)) && pg.sections[1].props.headline === 'Your story, told at the speed of scroll');
    check('page sent: well under what the workflow takes', JSON.stringify(pg).length < 90000, JSON.stringify(pg).length);
  }

  /* ---------------- Checking the answer ---------------- */
  {
    const page = T0;
    // Runs applyAnswer in the page: data is a template (cinematic by default) unless given
    const apply = (answer, opts) => page.evaluate(([a, o]) => {
      const T = window.__SB_TEST__;
      const data = o.data || T.makeData(o.template || 'cinematic', { title: o.title || 'Home', slug: 'home' });
      try {
        const r = T.applyAnswer(data, a, { ask: o.ask || '', before: o.before });
        return { ok: true, data: r.data, changed: r.changed, line: r.line, was: data };
      } catch (e) {
        return { ok: false, message: e.message, code: e.code };
      }
    }, [answer, opts || {}]);
    const sec = (r, id) => r.data.content.find((c) => c.props.id === id);
    const was = (r, id) => r.was.content.find((c) => c.props.id === id);

    let r = await apply({ summary: 's', root: {}, sections: [{ keep: 'Navbar-1' }, { edit: 'Hero-1', props: { headline: 'A new headline', background: 'aurora' } }, { add: 'Faq', props: { title: 'More questions', items: [{ question: 'Is it quick?', answer: 'Yes.' }] } }, { keep: 'Footer-1' }] });
    check('answer: keep, edit and add build the page in the order given', r.ok && types(r.data) === 'Navbar,Hero,Faq,Footer', r.ok ? types(r.data) : r.message);
    check('answer: a kept section is untouched', JSON.stringify(sec(r, 'Navbar-1')) === JSON.stringify(was(r, 'Navbar-1')) && JSON.stringify(sec(r, 'Footer-1')) === JSON.stringify(was(r, 'Footer-1')));
    check('answer: an edit changes only the fields given', sec(r, 'Hero-1').props.headline === 'A new headline' && sec(r, 'Hero-1').props.background === 'aurora' && sec(r, 'Hero-1').props.subhead === was(r, 'Hero-1').props.subhead && sec(r, 'Hero-1').props.primaryHref === '#contact');
    const faq = r.data.content[2];
    check('answer: an added section gets a new id and the block defaults for what it left out', /^Faq-[0-9a-f]+$/.test(faq.props.id) && faq.props.id !== 'Faq-1' && faq.props.title === 'More questions' && faq.props.anchor === 'faq');
    check('answer: sections left out are removed, and the panel line counts it all', r.line === 'Added 1 section, changed 1 section, removed 6 sections.', r.line);

    r = await apply({ sections: [{ keep: 'Footer-1' }, { keep: 'Navbar-1' }, { keep: 'Hero-1' }, { keep: 'ScrollStory-1' }, { keep: 'Features-1' }, { keep: 'Steps-1' }, { keep: 'Split-1' }, { keep: 'Faq-1' }, { keep: 'Cta-1' }] });
    check('answer: sections can move', r.ok && r.data.content[0].type === 'Footer' && r.line === 'Moved sections.', r.line);

    r = await apply({ sections: [{ keep: 'Nope-1' }, { add: 'Carousel', props: {} }, 'junk', [1], { edit: 'Hero-1', props: { headline: 'X', glitter: true, background: 'lava', id: 'Hijack-1' } }, { keep: 'Hero-1' }] });
    check('answer: unknown sections, blocks and junk are left out', r.ok && types(r.data) === 'Hero', r.ok ? types(r.data) : r.message);
    check('answer: unknown fields and options are ignored, the id stays', sec(r, 'Hero-1') && sec(r, 'Hero-1').props.headline === 'X' && !('glitter' in sec(r, 'Hero-1').props) && sec(r, 'Hero-1').props.background === 'particles');
    check('answer: a section named twice is used once', r.data.content.length === 1);

    r = await apply({ sections: [
      { edit: 'Navbar-1', props: { links: [
        { label: 'Book', href: 'https://cal.example/acme' },
        { label: 'Mail', href: 'mailto:hello@example.com' },
        { label: 'Made up', href: 'mailto:invented@studio.example' },
        { label: 'Call', href: 'tel:+1 (555) 010-1234' },
        { label: 'Bad', href: 'javascript:alert(1)' },
        { label: 'Section', href: '#Book Now' },
      ] } },
      { edit: 'Cta-1', props: { buttonHref: 'https://made-up.example/start' } },
      { edit: 'Split-1', props: { buttonHref: '/services' } },
    ] }, { ask: 'Link the menu to cal.example/acme and add our number 555-010-1234' });
    const links = sec(r, 'Navbar-1').props.links.map((l) => l.href);
    check('links: a web address the person gave is kept', links[0] === 'https://cal.example/acme', links[0]);
    check('links: an email already on the page is kept, a made-up one is not', links[1] === 'mailto:hello@example.com' && links[2] === '#', links.slice(1, 3).join(' '));
    check('links: a phone number the person gave is kept (any formatting)', links[3] === 'tel:+15550101234', links[3]);
    check('links: other schemes become #, section links are tidied', links[4] === '#' && links[5] === '#book-now', links.slice(4).join(' '));
    check('links: a made-up web address becomes #, a page on the site is kept', sec(r, 'Cta-1').props.buttonHref === '#' && sec(r, 'Split-1').props.buttonHref === '/services');

    r = await apply({ sections: [{ edit: 'Hero-1', props: { background: 'image', imageUrl: 'https://img.example/dog.jpg' } }] });
    check('media: a picture address the person did not give is dropped, and the background stays', sec(r, 'Hero-1').props.imageUrl === '' && sec(r, 'Hero-1').props.background === 'particles');
    r = await apply({ sections: [{ edit: 'Hero-1', props: { background: 'image', imageUrl: 'https://img.example/dog.jpg', imageAlt: 'A dog after a groom' } }] }, { ask: 'Use https://img.example/dog.jpg behind the headline' });
    check('media: one the person gave is used', sec(r, 'Hero-1').props.imageUrl === 'https://img.example/dog.jpg' && sec(r, 'Hero-1').props.background === 'image');
    r = await apply({ sections: [{ edit: 'Hero-1', props: { background: 'image', imageUrl: 'http://img.example/dog.jpg' } }] }, { ask: 'Use http://img.example/dog.jpg' });
    check('media: only https', sec(r, 'Hero-1').props.imageUrl === '' && sec(r, 'Hero-1').props.background === 'particles');
    r = await apply({ sections: [{ edit: 'ScrollStory-1', props: { scene: 'video' } }, { add: 'Split', props: { heading: 'H', visual: 'image' } }] });
    check('media: a video scene or picture with no address falls back to a built-in look', sec(r, 'ScrollStory-1').props.scene === 'space' && r.data.content[1].props.visual === 'orb');

    r = await apply({ sections: [{ edit: 'Hero-1', props: { headline: '<b>Bold</b> move — fast &amp; calm', eyebrow: 'Mon – Fri', subhead: 'x'.repeat(900), primaryLabel: 'y'.repeat(300), secondaryLabel: 42 } }] });
    const hp = sec(r, 'Hero-1').props;
    check('text: tags and entities come out, an em dash becomes a comma, an en dash a hyphen', hp.headline === 'Bold move, fast & calm' && hp.eyebrow === 'Mon-Fri', hp.headline + ' | ' + hp.eyebrow);
    check('text: lengths are capped', hp.subhead.length === 800 && hp.primaryLabel.length === 200, hp.subhead.length + ' ' + hp.primaryLabel.length);
    check('text: a number is written as text', hp.secondaryLabel === '42');

    r = await apply({ sections: [{ add: 'Text', props: { text: '<p>Hi <script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(2)" onclick="x()">link</a> <strong>bold</strong> <span style="color:red">plain</span></p><style>p{}</style><iframe src="https://x.example"></iframe>' } }, { add: 'Text', props: { text: 'First line.\n\nSecond — line.' } }] });
    const t1 = r.data.content[0].props.text;
    const t2 = r.data.content[1].props.text;
    check('rich text: scripts, styles, frames, pictures and attributes are removed', !/script|onerror|onclick|style|iframe|<img|alert\(1\)/.test(t1), t1);
    check('rich text: paragraphs, bold and checked links stay', t1 === '<p>Hi <a href="#">link</a> <strong>bold</strong> plain</p>', t1);
    check('rich text: plain text becomes paragraphs', t2 === '<p>First line.</p><p>Second, line.</p>', t2);

    const many = Array.from({ length: 10 }, (_, i) => (i === 1 ? 'junk' : { icon: i === 0 ? 'unicorn' : 'bolt', title: 'Card ' + i }));
    r = await apply({ sections: [{ edit: 'Features-1', props: { items: many } }, { edit: 'ScrollStory-1', props: { chapters: [] } }] });
    const items = sec(r, 'Features-1').props.items;
    check('lists: capped at the block maximum, junk left out', items.length === 8 && items.every((it) => it.title.startsWith('Card ')), items.length);
    check('lists: a missing or unknown value takes the default', items[0].icon === 'spark' && items[0].text === 'A sentence about this.' && items[1].icon === 'bolt');
    check('lists: too few items keeps what was there', JSON.stringify(sec(r, 'ScrollStory-1').props.chapters) === JSON.stringify(was(r, 'ScrollStory-1').props.chapters));

    r = await apply({ root: { title: '', theme: 'light', slug: 'hijack', accent: 'purple', description: 'd'.repeat(400), font: 'editorial' }, sections: [] });
    const rp = r.data.root.props;
    check('settings: theme and font change, an empty title, an unknown color and the address do not', rp.title === 'Home' && rp.theme === 'light' && rp.font === 'editorial' && rp.accent === 'cyan' && rp.slug === 'home');
    check('settings: the search description is capped', rp.description.length === 300);
    check('settings: an empty section list leaves the sections alone', r.data.content.length === 9 && r.line === 'Updated the page settings.', r.line);

    r = await apply({ sections: [{ keep: 'Nope-1' }, { edit: 'Gone-2', props: { title: 'x' } }] });
    check('answer: one that fits nothing on the page changes nothing and says so', !r.ok && /did not fit this page/.test(r.message), r.message);
    r = await apply({ summary: 'Nothing to do.', root: {}, sections: ['Navbar-1', 'Hero-1', 'ScrollStory-1', 'Features-1', 'Steps-1', 'Split-1', 'Faq-1', 'Cta-1', 'Footer-1'].map((id) => ({ keep: id })) });
    check('answer: keeping everything is no change', r.ok && r.changed === false && r.line === 'Nothing on the page changed.', r.line);

    // Work done on the page while the AI was busy is kept
    r = await page.evaluate(() => {
      const T = window.__SB_TEST__;
      const before = T.makeData('cinematic', { title: 'Home', slug: 'home' });
      const now = JSON.parse(JSON.stringify(before));
      now.content.push({ type: 'Spacer', props: { id: 'Spacer-mine', size: 'l' } });
      const res = T.applyAnswer(now, { sections: [{ keep: 'Hero-1' }, { keep: 'Navbar-1' }] }, { ask: '', before });
      return { ids: res.data.content.map((c) => c.props.id), line: res.line };
    });
    check('answer: a section added while the AI worked stays, at the end', r.ids.join(',') === 'Hero-1,Navbar-1,Spacer-mine' && r.line === 'Removed 7 sections.', r.ids.join(',') + ' / ' + r.line);

    // The two real answers
    r = await apply(NEW_PAGE.answer, { template: 'blank', title: 'Bright Paws', ask: NEW_PAGE.ask });
    check('real answer, new page: eight sections in order, the scroll story after the hero', r.ok && types(r.data) === 'Navbar,Hero,ScrollStory,Features,Steps,Faq,Cta,Footer', r.ok ? types(r.data) : r.message);
    check('real answer, new page: the booking link it was given is kept everywhere', r.data.content[0].props.ctaHref === 'https://brightpaws.example/book' && r.data.content[6].props.buttonHref === 'https://brightpaws.example/book' && r.data.content[1].props.primaryHref === 'https://brightpaws.example/book');
    check('real answer, new page: menu links match section ids', r.data.content[0].props.links.every((l) => r.data.content.some((c) => '#' + c.props.anchor === l.href)));
    check('real answer, new page: the title stays, a search description is written', r.data.root.props.title === 'Bright Paws' && r.data.root.props.description.startsWith('Bright Paws is a dog grooming studio'));
    check('real answer, new page: every id is new and different', new Set(r.data.content.map((c) => c.props.id)).size === 8 && r.data.content.every((c) => /^[A-Za-z]+-[0-9a-f]+$/.test(c.props.id)));
    check('real answer, new page: the panel line', r.line === 'Added 8 sections, updated the page settings.', r.line);
    check('real answer, new page: no dashes in the copy', !/[–—]/.test(JSON.stringify(r.data)));
    r = await apply(CHANGE.answer, { ask: CHANGE.ask });
    check('real answer, change: the Steps section is gone', r.ok && types(r.data) === 'Navbar,Hero,ScrollStory,Features,Split,Faq,Cta,Footer', r.ok ? types(r.data) : r.message);
    check('real answer, change: the pricing question is added and the menu loses its Process link', sec(r, 'Faq-1').props.items.length === 4 && sec(r, 'Faq-1').props.items[3].question === 'How much does a site cost?' && sec(r, 'Navbar-1').props.links.map((l) => l.label).join(',') === 'Story,Services,FAQ');
    check('real answer, change: light theme, amber accent', r.data.root.props.theme === 'light' && r.data.root.props.accent === 'amber');
    check('real answer, change: every other section is exactly as it was', ['Hero-1', 'ScrollStory-1', 'Features-1', 'Split-1', 'Cta-1', 'Footer-1'].every((id) => JSON.stringify(sec(r, id)) === JSON.stringify(was(r, id))));
    check('real answer, change: the panel line', r.line === 'Changed 2 sections, removed 1 section, updated the page settings.', r.line);
  }

  /* ---------------- The panel: signing in ---------------- */
  {
    const { page, st } = await open(BASE + '/builder/edit/home');
    await canvas(page);
    check('editor: the AI has a tab in the left rail', (await page.locator('[class*="NavItem-link"]', { hasText: 'AI' }).count()) === 1);
    const askBtn = visible(page, 'button:has-text("Ask AI")');
    check('editor: and a real Ask AI button in the header', (await askBtn.count()) === 1 && (await askBtn.evaluate((b) => b.tagName)) === 'BUTTON');
    await askBtn.focus();
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await panel(page).count()) === 1);
    await page.waitForTimeout(150);
    check('panel: Ask AI opens it from the keyboard and puts the cursor in it', (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'ai-email');
    check('panel: signed out, it asks for the AI Paragon sign-in', (await panel(page).innerText()).includes('Sign in with your AI Paragon account') && (await page.locator('#ai-ask').count()) === 0);
    await page.fill('#ai-email', 'someone@gmail.com');
    await page.fill('#ai-pw', 'whatever');
    await page.click('.ap-ai-signin button[type="submit"]');
    await waitFor(page, async () => (await page.locator('.ap-ai .ap-error').count()) === 1);
    check('panel: another email domain is turned away before asking Supabase', (await page.locator('.ap-ai .ap-error').innerText()).startsWith('Use your AI Paragon email') && st.logins.length === 0);
    await page.fill('#ai-email', EMAIL);
    await page.fill('#ai-pw', 'wrong');
    await page.click('.ap-ai-signin button[type="submit"]');
    await waitFor(page, async () => st.logins.length === 1 && (await page.locator('.ap-ai .ap-error').innerText()).includes('do not match'));
    check('panel: a wrong password says so', (await page.locator('.ap-ai .ap-error').innerText()) === 'That email and password do not match.');
    await page.fill('#ai-pw', PASSWORD);
    await page.click('.ap-ai-signin button[type="submit"]');
    await waitFor(page, async () => (await page.locator('#ai-ask').count()) === 1);
    check('panel: signed in, it names the account', (await page.locator('.ap-ai-who').innerText()).includes('Signed in as ' + EMAIL));
    const auth = await stored(page, AUTH);
    check('sign-in: kept under the builder\'s own key, the dashboard\'s untouched', auth && auth.access_token === 'tok-A1' && auth.refresh_token === 'ref-A1' && (await stored(page, DASH)) === null);
    await page.reload({ waitUntil: 'load' });
    await canvas(page);
    await openAi(page);
    check('sign-in: still signed in after a reload', (await page.locator('#ai-ask').count()) === 1);
    await page.locator('.ap-ai-who button', { hasText: 'Sign out' }).click();
    await waitFor(page, async () => (await page.locator('#ai-email').count()) === 1);
    check('sign-out: back to the sign-in form, and Supabase is told', st.logouts === 1 && JSON.stringify(await stored(page, AUTH)) === '{"noDashboard":true}');
  }

  /* ---------------- The panel: a change ---------------- */
  {
    const { page, st } = await open(BASE + '/builder/edit/home', { session: session(3600e3), answer: { wait: 1500, body: CHANGE.answer } });
    const f = await canvas(page);
    const original = await draftOf(page, 'home');
    await openAi(page);
    check('panel: signed in, the cursor goes to the request box', (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'ai-ask');
    await visible(page, '.ap-ai-body .ap-btn-primary').click();
    check('panel: an empty request asks for words and sends nothing', (await page.locator('#ai-ask-hint').innerText()) === 'Say what the page should be, or what to change.' && st.hook.length === 0);
    await page.locator('.ap-ai-chip', { hasText: 'Add an FAQ' }).click();
    check('panel: an idea fills the box', (await page.inputValue('#ai-ask')) === 'Add an FAQ');
    await page.fill('#ai-ask', CHANGE.ask);
    await page.focus('#ai-ask');
    await page.keyboard.press('Control+Enter');
    await waitFor(page, async () => (await page.locator('.ap-ai-working').count()) === 1);
    check('panel: Ctrl+Enter sends; it says it is working, with Stop', (await page.locator('.ap-ai-working').innerText()).includes('Working on it') && (await page.locator('.ap-ai-stop').count()) === 1 && (await page.locator('#ai-ask').isDisabled()));
    const text = await resultText(page);
    const req = st.hook[0];
    check('request: the token, the words, the block list and the page', req && req.auth === 'tok-A1' && req.ask === CHANGE.ask && req.catalog.startsWith('Page settings') && req.page.sections.map((s) => s.id).join(',') === original.content.map((c) => c.props.id).join(','));
    check('request: never the renewal key, never the page address', !JSON.stringify(req).includes('ref-A1') && !('slug' in req.page.root));
    check('panel: shows what the AI says and what changed', text.includes('I removed the Steps section') && text.includes('Changed 2 sections, removed 1 section, updated the page settings.'), text);
    await waitFor(page, async () => (await f.locator('.sb-steps').count()) === 0);
    check('page: the change is on the canvas', (await f.locator('.sb-steps').count()) === 0 && (await f.locator('.sb-site').getAttribute('data-theme')) === 'light' && (await f.locator('.sb-qa').count()) === 4);
    const saved = await waitFor(page, async () => {
      const d = await draftOf(page, 'home');
      return d.content.length === 8 && d.root.props.theme === 'light' ? d : null;
    });
    check('page: and saved, like any edit', !!saved && (await page.locator('.ap-save').innerText()) === 'Saved');
    check('page: Puck\'s own undo can take it back too', !(await page.locator('button[title="undo"], [aria-label="undo"]').first().isDisabled().catch(() => true)));
    await page.locator('.ap-ai-undo').click();
    await waitFor(page, async () => (await f.locator('.sb-steps').count()) === 1);
    check('undo: puts the page back on the canvas', (await f.locator('.sb-steps').count()) === 1 && (await f.locator('.sb-site').getAttribute('data-theme')) === 'dark');
    const back = await waitFor(page, async () => {
      const d = await draftOf(page, 'home');
      return JSON.stringify(d.content) === JSON.stringify(original.content) && d.root.props.theme === 'dark' ? d : null;
    });
    check('undo: and saved as it was', !!back);
    check('undo: the button goes and the panel says so', (await page.locator('.ap-ai-undo').count()) === 0 && (await page.locator('.ap-ai-result').innerText()).includes('Put the page back as it was'));

    // Undo only while the page is as the AI left it
    st.answer = { body: CHANGE.answer };
    await send(page, CHANGE.ask);
    await resultText(page);
    check('undo: offered after a change', (await page.locator('.ap-ai-undo').count()) === 1);
    await f.click('.sb-hero-sub');
    const headline = visible(page, 'textarea[name="headline"]');
    await headline.waitFor({ timeout: 4000 });
    await headline.fill('Changed by hand');
    await waitFor(page, async () => (await page.locator('.ap-ai-undo').count()) === 0);
    check('undo: not offered once the page was changed by hand', (await page.locator('.ap-ai-undo').count()) === 0);
    st.answer = (body) => ({ body: { ok: true, summary: 'Calmer.', root: {}, sections: body.page.sections.map((s) => (s.type === 'Hero' ? { edit: s.id, props: { headline: 'A calmer headline' } } : { keep: s.id })) } });
    await send(page, 'Make the hero calmer');
    await resultText(page);
    check('undo: offered again after the next change', (await page.locator('.ap-ai-undo').count()) === 1);
    st.answer = { body: { ok: false, code: 'model', message: 'The AI could not answer just now. Try again in a minute.' } };
    await send(page, 'Make it shorter');
    await resultText(page);
    check('undo: a failed request after a change shows no Undo (it belongs to the change)', (await page.locator('.ap-ai-result.ap-ai-error').count()) === 1 && (await page.locator('.ap-ai-undo').count()) === 0);

    // Typing in the box never deletes the selected section (counted once the autosave has run)
    const settled = async () => {
      await page.waitForTimeout(450);
      await waitFor(page, async () => (await page.locator('.ap-save').innerText()) === 'Saved');
      return (await draftOf(page, 'home')).content.length;
    };
    const n = await settled();
    await page.fill('#ai-ask', '');
    await f.click('.sb-hero-sub');
    await page.click('#ai-ask');
    await page.keyboard.type('abc');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    const n2 = await settled();
    const left = await page.inputValue('#ai-ask');
    check('panel: Backspace and Delete in the box leave the selected section alone', n2 === n && left === 'a', n + ' -> ' + n2 + ', box "' + left + '"');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Delete');
    const n3 = await settled();
    check('panel: (the section was selected: Delete outside the box removes it)', n3 === n - 1, n + ' -> ' + n3);
  }

  /* ---------------- The panel: when it goes wrong ---------------- */
  {
    const { page, st } = await open(BASE + '/builder/edit/home', { session: session(3600e3) });
    await canvas(page);
    await openAi(page);
    const original = JSON.stringify(await draftOf(page, 'home'));
    const cases = [
      ['the workflow says it could not answer', { body: { ok: false, code: 'model', message: 'The AI could not answer just now. Try again in a minute.' } }, 'The AI could not answer just now. Try again in a minute.'],
      ['a server error page', null, 'The AI could not answer just now. Try again in a minute.'],
      ['no connection', { abort: true }, 'Could not reach the AI. Check the connection and try again.'],
      ['a gateway timeout', { status: 524, type: 'text/html', body: 'A timeout occurred' }, 'The AI took too long. Try again, or ask for a smaller change.'],
      ['an answer that fits nothing', { body: { ok: true, summary: 'Done.', root: {}, sections: [{ keep: 'Nope-1' }] } }, 'The AI’s answer did not fit this page. Try again, or say it another way.'],
      ['a request the workflow turns down', { status: 400, body: { ok: false, code: 'bad_request', message: 'That is a long request. Keep it under 2,000 characters.' } }, 'That is a long request. Keep it under 2,000 characters.'],
    ];
    for (const [label, answer, words] of cases) {
      st.answer = answer;
      await send(page, 'Make it shorter');
      const t = await resultText(page);
      check('errors: ' + label + ' says so plainly', t === words && (await page.locator('.ap-ai-result.ap-ai-error').count()) === 1, t);
    }
    check('errors: and the page is untouched', JSON.stringify(await draftOf(page, 'home')) === original);
    check('errors: the words stay in the box to try again', (await page.inputValue('#ai-ask')) === 'Make it shorter');

    // Stop
    st.answer = { wait: 2500, body: CHANGE.answer };
    await send(page, CHANGE.ask);
    await waitFor(page, async () => (await page.locator('.ap-ai-stop').count()) === 1);
    await page.waitForTimeout(300);
    await page.locator('.ap-ai-stop').click();
    const t = await resultText(page);
    await page.waitForTimeout(2800);
    check('stop: stops waiting and says the page is as it was', t === 'Stopped. The page is as it was.', t);
    check('stop: an answer that comes later is not applied', JSON.stringify(await draftOf(page, 'home')) === original);

    // The sign-in ran out on the server
    st.answer = { status: 401, body: { ok: false, code: 'unauthorized', message: 'Sign in with an AI Paragon account to use the AI.' } };
    await send(page, 'Make it shorter');
    await waitFor(page, async () => (await page.locator('#ai-email').count()) === 1);
    check('errors: a refused sign-in asks to sign in again', (await page.locator('.ap-ai-result').innerText()).includes('Your sign-in has run out. Sign in again to use the AI.') && (await page.locator('#ai-email').count()) === 1);
    check('errors: and forgets the session', (await stored(page, AUTH)) === null);
    st.answer = { body: CHANGE.answer };
    await signInHere(page);
    check('errors: signing in again brings the box back', (await page.locator('#ai-ask').count()) === 1);
  }

  /* ---------------- Renewing the sign-in ---------------- */
  {
    const { page, st } = await open(BASE + '/builder/edit/home', { session: session(60e3) });
    await canvas(page);
    await openAi(page);
    await send(page, CHANGE.ask);
    await resultText(page);
    check('renewal: a session with under five minutes left is renewed first', st.refreshes.length === 1 && st.refreshes[0].refresh_token === 'ref-A1' && st.hook[0].auth === 'tok-A2');
    const a = await stored(page, AUTH);
    check('renewal: the new session is kept', a.access_token === 'tok-A2' && a.refresh_token === 'ref-A2' && a.email === EMAIL && a.expires_at > Date.now() + 50 * 60e3);
  }
  {
    const { page, st } = await open(BASE + '/builder/edit/home', { session: session(60e3) });
    st.refresh = 'refuse';
    await canvas(page);
    await openAi(page);
    await send(page, CHANGE.ask);
    await waitFor(page, async () => (await page.locator('#ai-email').count()) === 1);
    check('renewal: a refused renewal asks to sign in, and nothing is sent to the AI', st.refreshes.length === 1 && st.hook.length === 0 && (await page.locator('.ap-ai-result').innerText()).includes('Sign in to use the AI.'));
    check('renewal: the dead session is dropped', (await stored(page, AUTH)) === null);
  }

  /* ---------------- A dashboard sign-in in the same browser ---------------- */
  {
    const dash = { access_token: 'dash-tok', refresh_token: 'dash-ref', expires_at: Date.now() + 30 * 60e3, user: { email: 'teammate@aiparagonconsulting.com' } };
    const { page, st } = await open(BASE + '/builder/edit/home', { dash });
    await canvas(page);
    await openAi(page);
    check('dashboard sign-in: used while it lasts, and named', (await page.locator('.ap-ai-who').innerText()).includes('Using your dashboard sign-in, teammate@aiparagonconsulting.com'));
    await send(page, CHANGE.ask);
    await resultText(page);
    check('dashboard sign-in: its token goes with the request', st.hook[0].auth === 'dash-tok');
    check('dashboard sign-in: read only, never renewed or changed', st.refreshes.length === 0 && JSON.stringify(await stored(page, DASH)) === JSON.stringify(dash));
    await page.locator('.ap-ai-who button', { hasText: 'Use another account' }).click();
    await waitFor(page, async () => (await page.locator('#ai-email').count()) === 1);
    check('dashboard sign-in: Use another account shows the form and leaves the dashboard signed in', JSON.stringify(await stored(page, DASH)) === JSON.stringify(dash) && st.logouts === 0);
  }
  {
    const { page } = await open(BASE + '/builder/edit/home', { dash: { access_token: 'dash-tok', refresh_token: 'r', expires_at: Date.now() + 30e3, user: { email: 'teammate@aiparagonconsulting.com' } } });
    await canvas(page);
    await openAi(page);
    check('dashboard sign-in: not used in its last minute', (await page.locator('#ai-email').count()) === 1);
  }
  {
    const { page } = await open(BASE + '/builder/edit/home', { dash: { access_token: 'dash-tok', refresh_token: 'r', expires_at: Date.now() + 30 * 60e3, user: { email: 'someone@gmail.com' } } });
    await canvas(page);
    await openAi(page);
    check('dashboard sign-in: not used for an account outside the team', (await page.locator('#ai-email').count()) === 1);
  }

  /* ---------------- Describe it ---------------- */
  {
    const { page, st } = await open(BASE + '/builder', { session: session(3600e3), answer: { wait: 1500, body: NEW_PAGE.answer } });
    await page.click('button:has-text("New page")');
    check('describe: a fourth starting point on New page', (await page.locator('.ap-choice').count()) === 4 && (await page.locator('.ap-choice[data-kind="describe"]').innerText()).includes('Describe it'));
    await page.locator('.ap-choice[data-kind="describe"]').click();
    check('describe: it asks what the page is for', (await page.locator('#np-about').count()) === 1);
    await page.fill('#np-name', 'Bright Paws');
    await page.click('button:has-text("Create page")');
    check('describe: the description is needed', (await page.locator('#np-about-err').innerText()) === 'Say what the page is for.' && (await page.evaluate(() => document.activeElement.id)) === 'np-about');
    await page.fill('#np-about', NEW_PAGE.ask);
    await page.click('button:has-text("Create page")');
    const f = await canvas(page);
    const id = new URL(page.url()).pathname.split('/').pop();
    await waitFor(page, async () => st.hook.length === 1);
    check('describe: the editor opens on the AI tab and sends the description', (await panel(page).count()) === 1 && st.hook.length === 1 && st.hook[0].ask === NEW_PAGE.ask);
    check('describe: the AI starts from an empty page with the name given', st.hook[0].page.sections.length === 0 && st.hook[0].page.root.title === 'Bright Paws');
    check('describe: the panel says it is writing the page', (await page.locator('.ap-ai-working').innerText()).includes('Writing the page'));
    const t = await resultText(page);
    check('describe: the page is written', t.includes('Added 8 sections') && (await f.locator('.sb-hero-h').innerText()) === 'Clean, happy dogs, every visit' && (await f.locator('.sb-story').count()) === 1);
    // Puck builds its sidebar twice as the editor opens: the description still goes once
    check('describe: the description goes to the AI once', st.hook.length === 1, st.hook.length);
    const d = await waitFor(page, async () => {
      const x = await draftOf(page, id);
      return x.content.length === 8 ? x : null;
    });
    check('describe: and saved with its own title', !!d && d.root.props.title === 'Bright Paws' && d.root.props.slug === 'bright-paws');
    await visible(page, 'a:has-text("All pages")').click();
    await page.waitForTimeout(300);
    check('describe: the dashboard card shows the written page', (await page.locator('[data-page="' + id + '"] .ap-card-meta').innerText()).includes('8 sections') && (await page.locator('[data-page="' + id + '"] .ap-thumb-h').innerText()) === 'Clean, happy dogs, every visit');
    await page.locator('[data-page="' + id + '"] a', { hasText: 'Edit' }).first().click();
    await canvas(page);
    await page.waitForTimeout(400);
    check('describe: opening the page again sends nothing', st.hook.length === 1);
  }
  {
    const { page, st } = await open(BASE + '/builder', { answer: { body: NEW_PAGE.answer } });
    await page.click('button:has-text("New page")');
    await page.locator('.ap-choice[data-kind="describe"]').click();
    await page.fill('#np-name', 'Bright Paws');
    await page.fill('#np-about', NEW_PAGE.ask);
    await page.click('button:has-text("Create page")');
    await canvas(page);
    await waitFor(page, async () => (await panel(page).count()) === 1);
    check('describe, signed out: the description waits while it asks to sign in', (await page.locator('.ap-ai-note').innerText()).includes('Your description is kept') && st.hook.length === 0);
    await signInHere(page);
    await waitFor(page, async () => st.hook.length === 1);
    check('describe, signed out: signing in sends it', st.hook.length === 1 && st.hook[0].ask === NEW_PAGE.ask);
    check('describe, signed out: and the page is written', (await resultText(page)).includes('Added 8 sections'));
  }

  /* ---------------- On a phone ---------------- */
  {
    const { page, st } = await open(BASE + '/builder/edit/home', { session: session(3600e3), viewport: { width: 390, height: 844 }, mobile: true });
    await canvas(page);
    await page.locator('[class*="NavItem-link"]', { hasText: 'AI' }).click();
    await waitFor(page, async () => (await page.locator('#ai-ask >> visible=true').count()) === 1);
    const box = await page.locator('#ai-ask').boundingBox();
    check('phone: the AI tab opens the panel, inside the screen', !!box && box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
    await send(page, CHANGE.ask);
    check('phone: and it works', (await resultText(page)).includes('Changed 2 sections') && st.hook.length === 1);
    check('phone: no sideways scroll', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
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
