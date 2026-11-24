// Records the Pipeline click-through, third cut: only what the dashboard really does. No drawn menus, no typing, no
// made-up results. Same session as record.cjs up to the campaign, then approve, campaign types, Ad Testing, and how it
// learns: Atlas > Company profile (the brand voice) and Settings > AI settings (templates, the knowledge base, house
// rules, and a reason given on an approval made into a rule). Made-up Summit data (lib/pipeline-data.cjs plus
// lib/learn-data.cjs), n8n answered locally. Each screen state is saved at 3x with the box of everything the cursor
// points at or clicks, and the mouse position while it was saved.
// v4: the last section is Content Transformation: What should change? on a LinkedIn post draft, and the next draft's
// side pane saying what it avoids (AI settings keeps only the strip: templates and the knowledge base).
// p5: a 1200x675 window with the sidebar collapsed to its icons; the boxes the zooms frame are measured from the page.
// p6: the two tracks. The organic brief (its title in frame, the five things) and the LinkedIn post written from it in
// Marketing Generation's Library, then the ads brief with its title in frame. Rebuilt Nov 17 after a container reset.
// p7 (Nov 18): the two capabilities side by side: the Intel Tracker and both briefs, then Content Transformation's
// form (every kind of organic piece and its categories) and a draft, then Marketing Generation's form (the ad campaign
// types) and a campaign, approve, Ad Testing, voice, templates, and What should change?.
// p8 (Nov 19, Erica's notes on v7.1): the Intel Tracker's run holds 213 posts (the real run of Oct 19 read 213; these
// are made-up sample posts) and the list of all of them scrolls past; both briefs scroll slowly at full width; Paid ad
// is left off the organic choices; Content Transformation shows its two starts (Your material, What the briefs found).
// p9 (Nov 23, Erica's notes on v8): a 1440x810 window, so every page shows more of itself and nothing has to be cut
// off; each brief zoomed out (headers, tables and sections on screen at once) with one short pass down it, instead of
// reading it slowly at full width.
// p10 (Nov 24, Erica's notes on v9): the list of posts as one still shot (its two 213 counts marked for the composer to
// light up) instead of scrolling; each brief zoomed out a little, with two jumps from its own "In this brief" list;
// Content Transformation and Marketing Generation zoomed out slightly (ZC), and four examples each.
// Usage: node record-p10.cjs   -> rec-p10/*.png and rec-p10/manifest.json   (LOOK=1 -> look/, at 1x; STOP=n ends after section n)
const fs = require('fs'), path = require('path');
const V = require('../lib/vharness.cjs');
const { makeStore } = require(V.ROOT + '/tests/lib/rest-stub');
const D = require('../lib/pipeline-data.cjs');
const LOOK = !!process.env.LOOK, STOP = +(process.env.STOP || 99);
const OUT = path.join(__dirname, LOOK ? 'look10' : 'rec-p10');
const DSF = LOOK ? 1 : 3;
const VW = +(process.env.VW || 1440), VH = +(process.env.VH || 810);
const ZB = +(process.env.ZB || 0.75);  // how far the briefs are zoomed out
const ZC = +(process.env.ZC || 0.85);  // Content Transformation and Marketing Generation, zoomed out slightly
const zoom = async (z) => { await page.evaluate((z) => { document.body.style.zoom = z ? String(z) : ''; scrollTo(0, 0); }, z); await wait(900); };
const X = (x) => Math.round(x * VW / 1440), Y = (y) => Math.round(y * VH / 810);
const BLUR = ['#nwNav > :not(.is-cur)', '#nwSide > :not(.nw-brand):not(#nwNav)', '.sb-user', '.sb-lic'];
const ADS = path.join(__dirname, '..', 'ads');
const ADIMG = (u) => { const m = /creatives\/(summit-[abc]\.png)/.exec(u); return m ? { status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(ADS, m[1])) } : null; };
const CAL = 'https://calendly.com/summit-advisors/scaling-review';
const calls = [];
const hooks = (u, m, body) => { calls.push(u.replace(/^https:\/\/[^/]+/, '')); return /e3-calendly/.test(u) ? { body: { ok: true, connected: true, user: { name: 'Summit' }, types: [{ name: 'Scaling Review', url: CAL, duration: 20 }] } } : { body: { ok: true } }; };
const R = { dsf: DSF, w: VW, h: VH, snaps: {}, seqs: {}, targets: {} };
let page, mouse = [VW - 5, VH - 5];
const wait = (ms) => page.waitForTimeout(ms);
const sy = () => page.evaluate(() => Math.round(scrollY));
async function shoot(label) {
  const f = label + '.png';
  await page.screenshot({ path: path.join(OUT, f) });
  R.snaps[label] = { img: f, scrollY: await sy(), mouse: mouse.slice() };
  console.log('  snap', label);
  return label;
}
async function moveTo(x, y, steps) { await page.mouse.move(x, y, { steps: steps || 4 }); mouse = [x, y]; }
async function tgt(label, loc, at) {
  await loc.waitFor({ state: 'visible', timeout: 8000 });
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box for ' + label);
  const p = at ? at(b) : [b.x + b.width / 2, b.y + b.height / 2];
  R.targets[label] = { box: [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10), at: p.map((v) => Math.round(v * 10) / 10) };
  return R.targets[label].at;
}
async function hover(label, loc, at) { const p = await tgt(label, loc, at); await moveTo(p[0], p[1]); await wait(350); await shoot(label + '_h'); return p; }
async function press(ms) { await page.mouse.down(); await wait(60); await page.mouse.up(); await wait(ms || 1200); }
async function click(label, loc, at, ms) { const p = await tgt(label, loc, at); await moveTo(p[0], p[1]); await wait(120); await press(ms); return p; }
async function scrollSeq(label, toY, n, mx, my) {
  if (mx != null) { await moveTo(mx, my, 3); await wait(200); }
  const from = await sy(); const files = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(from + (toY - from) * e));
    await wait(40);
    const f = label + '_' + String(i).padStart(2, '0') + '.png'; await page.screenshot({ path: path.join(OUT, f) }); files.push(f);
  }
  R.seqs[label] = { imgs: files, from, to: await sy(), mouse: mouse.slice() };
  console.log('  scroll', label, from, '->', R.seqs[label].to, 'mouse', mouse);
}
const nav = (t) => page.locator('#nwNav button.nw-item', { hasText: t }).first();
const parent = (t) => page.locator('#nwNav button.nw-parent', { hasText: t }).first();
// in the collapsed rail a product's click goes to its first page; here it shows its pages' icons instead, as the wide
// sidebar shows its list, and the story clicks the page it wants
const PROD = { Atlas: 'atlas', Pipeline: 'pipe' };
async function openProd(label, t, ms) {
  const p = await tgt(label, parent(t)); await moveTo(p[0], p[1]); await wait(120);
  await page.mouse.down(); await wait(60);
  await page.evaluate((k) => { if (k === 'set') { V115.open = ''; V107.set = true; } else { V115.open = k; V107.set = false; } nwNavPaint(); }, PROD[t] || 'set');
  await page.mouse.up(); await wait(ms || 1200);
}
// the top of the first visible element whose own text is t (exactly), in page coordinates
const topOfText = (re) => page.evaluate(([src, fl]) => { const r = new RegExp(src, fl);
  const e = [...document.querySelectorAll('#view-app *')].filter((x) => x.offsetParent && r.test((x.innerText || '').replace(/\s+/g, ' ').trim())).sort((a, b) => a.innerText.length - b.innerText.length)[0];
  return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; }, [re.source, re.flags]);
let markN = 0;
async function vis(css, re, last) {
  const id = 'v' + (++markN);
  const ok = await page.evaluate(([css, src, flags, last, id]) => {
    const r = src ? new RegExp(src, flags) : null;
    const all = [...document.querySelectorAll(css)].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 1 && b.height > 1 && b.bottom > 0 && b.top < innerHeight && b.left < innerWidth && getComputedStyle(e).visibility !== 'hidden' && (!r || r.test(e.tagName === 'SELECT' ? (e.options[0] && e.options[0].text) || '' : (e.innerText || '').replace(/\s+/g, ' ').trim())); });
    const e = last ? all[all.length - 1] : all[0]; if (!e) return false; e.setAttribute('data-demo', id); return true;
  }, [css, re ? re.source : null, re ? re.flags : '', !!last, id]);
  if (!ok) throw new Error('nothing visible for ' + css + ' ' + re);
  return page.locator('[data-demo="' + id + '"]');
}
async function mark(re, scope, within) {
  const id = 'm' + (++markN);
  const ok = await page.evaluate(([src, flags, scope, within, id]) => {
    const r = new RegExp(src, flags);
    let root = document.querySelector(scope || '#view-app') || document.body;
    if (within) { const w = new RegExp(within[0], within[1]); const c = [...root.querySelectorAll('*')].filter((e) => w.test((e.innerText || '').replace(/\s+/g, ' ').trim()) && e.offsetParent).sort((a, b) => a.innerText.length - b.innerText.length)[0]; if (!c) return false; root = c; }
    const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 1 && b.height > 1 && b.bottom > 0 && b.top < innerHeight && getComputedStyle(e).visibility !== 'hidden'; };
    const all = [...root.querySelectorAll('*')].filter((e) => r.test((e.innerText || '').replace(/\s+/g, ' ').trim()) && vis(e));
    if (!all.length) return false;
    all.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
    all[0].setAttribute('data-demo', id); return true;
  }, [re.source, re.flags, scope || null, within ? [within.source, within.flags] : null, id]);
  if (!ok) throw new Error('nothing matches ' + re + (within ? ' in ' + within : ''));
  return page.locator('[data-demo="' + id + '"]');
}
const app = (sel, t) => page.locator('#view-app ' + sel, t ? { hasText: t } : undefined).first();
const textY = (t) => page.evaluate((t) => { const w = document.createTreeWalker(document.getElementById('view-app'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.nodeValue.trim() === t && n.parentElement.offsetParent) return Math.round(n.parentElement.getBoundingClientRect().top + scrollY); } return null; }, t);
const topOf = (css, i) => page.evaluate(([css, i]) => { const e = [...document.querySelectorAll(css)].filter((x) => x.offsetParent)[i || 0]; return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; }, [css, i || 0]);

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const server = V.H.makeServer(V.ROOT, null, '/dashboard/today'); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await V.H.chromium.launch();
  const errors = [];
  const tables = D.tables();
  // the sample draft is a LinkedIn post, under the dashboard's own key for one
  tables.agent_outputs.forEach((o) => { if (o.output_type === 'content_draft') { const d = JSON.parse(o.data); d.format = 'thought_leadership'; o.data = JSON.stringify(d); } });
  tables.content_requests.forEach((r) => { if (r.format === 'linkedin_post') r.format = 'thought_leadership'; });
  // rows the page adds get a created_at, so "newest first" reads come back in order
  { let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; const pick = (a) => a[Math.floor(rnd() * a.length)];
    const WHO = ['Corvin Group', 'Brightpath Advisors', 'Maya Lindqvist', 'Dana Reyes', 'Ellis Park Partners', 'Northgate Consulting', 'Harbor Lane Advisory', 'Priya Nair', 'Tom Okafor', 'Sofia Brandt', 'Keel & Co.', 'Meridian Ops', 'Lena Hart', 'Owen Pike', 'Ridgeway Partners', 'Clara Voss', 'Fieldstone Group', 'Marcus Lee', 'Juniper Advisory', 'Ana Ruiz'];
    const OPEN = ['What we learned about', 'The real cost of', 'How we handled', 'Three mistakes with', 'A simple test for', 'Rethinking', 'Stop guessing on', 'Notes on', 'What owners get wrong about', 'A better way to handle'];
    const TOP = ['owner bottlenecks', 'decision rights at 40 people', 'the first ops hire', 'sales-to-delivery handoffs', 'pricing approvals', 'the founder vacation test', 'undocumented processes', 'manager spans past 30 people', 'weekly operating reviews', 'scaling past the founder', 'hiring before the process', 'the one-page operating model', 'client onboarding', 'margin leaks in delivery', 'owner KPIs', 'the 90-day plan', 'meetings that decide nothing', 'promoting your best doer', 'the sales playbook', 'cash flow at 50 people'];
    const TH = ['decisions', 'operating model', 'hiring', 'handoffs', 'pricing', 'leadership', 'process', 'growth'];
    const FMT = ['text', 'carousel', 'image', 'video', 'article', 'poll'];
    const RUN = tables.runs[0].run_id;
    for (let n = 9; n <= 213; n++) {
      const who = pick(WHO), top = pick(TOP), head = pick(OPEN) + ' ' + top, eng = Math.round(8 + 380 * Math.pow(rnd(), 2.2)), v = eng > 220 ? 'high' : eng > 70 ? 'medium' : 'low';
      const day = 19 + Math.floor(rnd() * 8), hr = 8 + Math.floor(rnd() * 10);
      tables.intel_items.push({ id: '00000000-0000-4000-8000-' + String(500000000000 + n), run_id: RUN, url: 'https://www.linkedin.com/feed/update/urn:li:activity:7' + String(1e10 + n * 7919), platform: rnd() < 0.82 ? 'linkedin' : 'facebook',
        author_name: who, headline: head.charAt(0).toUpperCase() + head.slice(1), summary: 'A post on ' + top + '.', working: '', signal: '', content_format: pick(FMT), themes: [pick(TH), pick(TH)].filter((x, i, a) => a.indexOf(x) === i),
        engagement_total: eng, engagement_score: eng, score: Math.max(12, Math.min(88, Math.round(eng / 4.5 + 10 + rnd() * 12))), ad_context_value: v, in_brief: false,
        published_at: '2026-10-' + day + 'T' + String(hr).padStart(2, '0') + ':' + String(Math.floor(rnd() * 60)).padStart(2, '0') + ':00Z', created_at: '2026-10-26T13:05:00Z', raw_text: head + '. A post on ' + top + '.' });
    }
    tables.runs[0].stats = { items: 213, high_value: tables.intel_items.filter((x) => x.run_id === RUN && x.ad_context_value === 'high').length };
  }
  const store0 = makeStore(tables); let stamp = 0;
  const store = { db: store0.db, writes: store0.writes, handle: (m, p, body, h) => {
    if (m === 'POST' && body) { try { const j = JSON.parse(body); const add = (r) => Object.assign({ created_at: new Date(Date.UTC(2026, 9, 26, 16, 41, 0) + 1000 * (++stamp)).toISOString() }, r); body = JSON.stringify(Array.isArray(j) ? j.map(add) : add(j)); } catch (e) {} }
    return store0.handle(m, p, body, h); } };
  ({ page } = await V.newPage(browser, BASE, { rest: store, time: '2026-10-26T09:40:00-07:00', errors, files: ADIMG, hooks, dsf: DSF, w: VW, h: VH }));
  await page.context().addInitScript(() => { try { localStorage.setItem('ap.nw.collapsed', '1'); } catch (e) {} });
  const t0 = Date.now();
  await page.goto(BASE + '/dashboard/engine-3', { waitUntil: 'load' }); await V.H.settled(page, 'app');
  await page.evaluate(() => document.fonts && document.fonts.ready); await wait(2400);
  await V.clean(page); await V.blur(page, BLUR, 6);
  await page.addStyleTag({ content: '.v113-ads-cn,.nw-connect-note{display:none!important} html body #view-app.nw-collapsed #nwNav button[title=Settings] + .nw-sub{display:grid!important;margin:2px 0 4px;padding:0;border-left:0;justify-items:center;gap:2px}' });
  await page.evaluate(() => {
    const set = (sel, v) => document.querySelectorAll(sel).forEach((e) => { if (e.textContent !== v) e.textContent = v; });
    // the sample client's own name, domain and offer on the ad previews (the dashboard's link card is fixed to AI Paragon's)
    const fix = () => { set('.feed-name', 'Summit Business Advisors'); set('.fl-domain', 'summitadvisors.example'); set('.fl-title', 'Book your free 20-minute Scaling Review');
      document.querySelectorAll('#view-app div, #view-app p').forEach((e) => { if (e.children.length < 4 && /^Connect Meta and LinkedIn on Integrations/.test((e.textContent || '').trim())) e.style.display = 'none'; }); };
    const noPaid = () => document.querySelectorAll('#view-app button.nw-tile').forEach((b) => { if (/^Paid ad/.test((b.innerText || '').trim()) && b.style.display !== 'none') b.style.display = 'none'; });
    fix(); noPaid(); new MutationObserver(() => { fix(); noPaid(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  // Settings' pages have no icons of their own; in the collapsed rail they get one each, as the products' pages have
  await page.evaluate(() => { const IC = { integrations: 'layers', learning: 'sparkle', audit: 'history' };
    const add = () => document.querySelectorAll('#nwNav button[title=Settings] + .nw-sub .nw-item').forEach((b) => { if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', nwIc(IC[b.dataset.view] || 'sliders', 19)); });
    add(); new MutationObserver(add).observe(document.getElementById('nwNav'), { childList: true, subtree: true }); });
  await moveTo(VW - 5, VH - 5); await wait(300);

  const stopHere = async (n) => { if (STOP !== n) return false; fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(R, null, 1)); console.log('stopped after', n, 'errors', errors.slice(0, 3)); await browser.close(); server.close(); return true; };
  console.log('1 Overview');
  await shoot('ov');
  await moveTo(X(420), Y(590), 3); await wait(250);
  await scrollSeq('ov_scroll', 150, 14);
  await shoot('ov2');
  await tgt('ov2_flow', app('button.nw-fstep', 'Intel Tracker').locator('xpath=..'));
  await hover('ov2_intel', app('button.nw-fstep', 'Intel Tracker'));

  console.log('2 Intel Tracker: the run, then all 213 posts it read');
  await press(1800);
  await shoot('intel');
  await hover('intel_reads', await mark(/^Reads \d+ accounts and \d+ topics weekly$/), (b) => [b.x + 120, b.y + b.height / 2]);
  await hover('intel_read_n', await mark(/^213 posts read$/));
  await click('intel_list', page.locator('#view-app .nw-view-toggle button[title=List]'), null, 1200);
  await page.evaluate(() => { V108.more = 400; nwRepaint(); }); await wait(1500);
  await shoot('intel_list');
  // one still shot of the list, zoomed out slightly so more posts show; its two counts get marked for the composer
  await zoom(ZC);
  await moveTo(X(1360), Y(760), 3); await wait(200);
  await shoot('intel_still');
  await tgt('intel_n1', await mark(/^213 posts read$/));
  await tgt('intel_n2', await vis('#view-app button, #view-app [role=tab]', /^Posts\s*213$/));
  await tgt('intel_n3', await vis('#view-app button', /^All\s*213$/));
  await zoom(0);

  console.log('3 The briefs, each zoomed out so its headers, tables and sections show at once');
  const zoomOut = async () => { await page.evaluate((z) => { document.body.style.zoom = String(z); scrollTo(0, 0); }, ZB); await wait(1000); };
  const zoomIn = async () => { await page.evaluate(() => { document.body.style.zoom = ''; scrollTo(0, 0); }); await wait(800); };
  // where the zoomed-out pass stops: the review at the end of the brief in view (page coordinates as the zoomed page reports them)
  const passStop = (re) => page.evaluate(([src, vh]) => { const r = new RegExp(src);
    const e = [...document.querySelectorAll('#view-app h2, #view-app h3, #view-app .nw-br-h')].find((x) => x.offsetParent && r.test(x.innerText.trim()));
    const end = e ? e.getBoundingClientRect().top + scrollY + 260 : document.documentElement.scrollHeight;
    return Math.max(0, Math.round(Math.min(end, document.documentElement.scrollHeight) - vh)); }, [re.source, VH]);
  // a click in "In this brief": the page's own jump is swapped for the recorder's slow scroll to the same place
  const jump = async (label, re) => {
    await page.evaluate(() => { window.__jy = null; window.nwBrJump = function (id) { const e = document.getElementById(id); if (e) window.__jy = Math.max(0, Math.round(e.getBoundingClientRect().top + scrollY - 64)); }; });
    await click(label, await vis('#view-app .nw-railnav button', re), null, 250);
    const y = await page.evaluate(() => window.__jy);
    if (y == null) throw new Error('no jump for ' + label);
    await scrollSeq(label + '_go', y, 22);
    await shoot(label + '_at');
  };
  await click('nav_briefs', nav('Market Intelligence Briefs'), null, 1800);
  await shoot('br_org');
  await tgt('br_org_title', await mark(/^Organic brief · \d+ \w+$/));
  await zoomOut();
  await shoot('br_org_zoom');
  await jump('br_org_j1', /^What changed$/);
  await jump('br_org_j2', /^Post evidence$/);
  await zoomIn();
  await shoot('br_org_top');
  await click('br_tab_ads', await mark(/^Ads$/, '#view-app'), null, 1500);
  await shoot('br_ads');
  await tgt('br_ads_title', await mark(/^Ads brief · \d+ \w+$/));
  await zoomOut();
  await shoot('br_ads_zoom');
  await jump('br_ads_j1', /^Creative structure$/);
  await jump('br_ads_j2', /^Test plan$/);
  await zoomIn();
  if (await stopHere(3)) return;

  console.log('4 Organic content: every kind of piece, its categories, then its two starts and a draft');
  await click('nav_ct', nav('Content Transformation'), null, 2400);
  await zoom(ZC);
  await shoot('ct_o');
  const tile = (t) => page.locator('#view-app button.nw-tile', { hasText: t }).first();
  for (const [k, t] of [['li', 'LinkedIn post'], ['news', 'Newsletter'], ['wp', 'White paper'], ['article', 'Article or news story']]) await hover('ct_t_' + k, tile(t));
  const catY = await page.evaluate(() => { const e = [...document.querySelectorAll('#view-app button.v111-cat')].filter((x) => x.offsetParent).pop(); return e ? Math.round(e.getBoundingClientRect().bottom + scrollY) : 0; });
  await scrollSeq('ct_o_down', Math.max(0, catY - VH + 40), 16);
  await shoot('ct_o2');
  await tgt('ct_cats', page.locator('#view-app button.v111-cat').first().locator('xpath=..'));
  await hover('ct_cat', page.locator('#view-app button.v111-cat', { hasText: 'Opinion and frameworks' }).first());
  // start 1: what you've already published (Your material)
  const matY = await page.evaluate(() => { const e = [...document.querySelectorAll('#view-app h3')].find((x) => /^Your material/.test(x.innerText.trim()) && x.offsetParent); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : 0; });
  await scrollSeq('ct_mat_down', Math.max(0, matY - 150), 22);
  await shoot('ct_mat');
  await tgt('ct_mat_box', page.locator('#view-app h3', { hasText: 'Your material' }).first().locator('xpath=ancestor::section[1]'));
  const mtabs = await page.evaluate(() => [...document.querySelectorAll('#view-app [role=tab]')].filter((x) => x.offsetParent && x.getBoundingClientRect().top > 0 && x.getBoundingClientRect().top < innerHeight).map((x) => x.innerText.trim()));
  console.log('  material tabs', JSON.stringify(mtabs));
  await hover('ct_mat_up', await vis('#view-app [role=tab]', /^Upload/));
  await hover('ct_mat_paste', await vis('#view-app [role=tab]', /^Paste/));
  // start 2: the insights in the organic brief (What the briefs found)
  const fY = await page.evaluate(() => { const e = [...document.querySelectorAll('#view-app h3')].find((x) => /^What the briefs found/.test(x.innerText.trim()) && x.offsetParent); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : 0; });
  await scrollSeq('ct_found_up', Math.max(0, fY - 60), 18);
  await shoot('ct_found');
  await tgt('ct_found_box', page.locator('#view-app h3', { hasText: 'What the briefs found' }).first().locator('xpath=ancestor::section[1]'));
  await hover('ct_found_use', await vis('#view-app button', /^Use$/));
  await scrollSeq('ct_o_up', 0, 18);
  await shoot('ct_o3');
  await hover('ct_tab_drafts', await vis('button', /^Drafts\s*\d*$/));
  await press(2200);
  await shoot('ct_drafts');
  await tgt('ct_draft_box', page.locator('.ap-cf-dm').first());
  await hover('ct_draft_title', await mark(/^You do not have a hiring problem$/), (b) => [b.x + Math.min(b.width, 260) / 2, b.y + b.height / 2]);

  console.log('5 Ads: Marketing Generation, the ad campaign types, then the campaign and approve');
  await click('nav_mg', nav('Marketing Generation'), null, 2400);
  await zoom(ZC);
  await shoot('mg_a');
    await hover('mg_t_ad', page.locator('#view-app button.nw-tile', { hasText: 'Ad campaign' }).first());
  const chipB = await page.evaluate(() => { const e = [...document.querySelectorAll('#view-app button.v111-cat')].filter((x) => x.offsetParent).pop(); return e ? Math.round(e.getBoundingClientRect().bottom + scrollY) : 0; });
  await scrollSeq('mg_a_down', Math.max(0, chipB - VH + 70), 12);
  await shoot('mg_a2');
  await tgt('mg_chips', page.locator('#view-app button.v111-cat').first().locator('xpath=..'));
  const chip = (t) => page.locator('#view-app button.v111-cat', { hasText: t }).first();
  for (const [k, t] of [['call', 'Book a call'], ['web', 'Webinar or masterclass'], ['dl', 'Resource download'], ['lp', 'Landing page']]) await hover('mg_c_' + k, chip(t));
  await scrollSeq('mg_a_up', 0, 10);
  await shoot('mg_a3');
  await click('mg_tab_camps', await mark(/^Campaigns ?1?$/), null, 1300);
  await shoot('mg_camps');
  await hover('mg_card', await mark(/^Scaling Review$/), (b) => [b.x + b.width / 2 + 30, b.y - 50]);
  await press(3800);
  await shoot('camp');
  const adY = await page.evaluate(() => { const b = document.querySelector('#adImgBlock'); return b ? Math.round(b.getBoundingClientRect().top + scrollY) : null; });
  await scrollSeq('camp_down', adY - 100, 14);
  await shoot('camp_ads');
  await hover('camp_a', page.locator('#adImgBlock .studio-canvas > .vcard').first(), (b) => [b.x + b.width * 0.5, b.y + 330]);
  await press(2200);
  await shoot('ed');
  await hover('ed_approve', await vis('button', /Approve$/));
  await press(1600);
  await shoot('ed_approved');
  await hover('ed_exit', await vis('button', /^Exit focus$/));
  await press(2000);
  await shoot('camp_after');
  await tgt('camp_count', await mark(/^\d of 3 ads approved$/));

  console.log('6 Ad Testing: the leaderboard, then the strategy read');
  await click('nav_at', nav('Ad Testing'), null, 1800);
  await zoom(0);
  await shoot('at_read');
  await click('at_tab_board', await mark(/^Leaderboard$/), null, 1500);
  await shoot('at_board');
  await scrollSeq('at_down', 260, 14);
  await shoot('at_board2');
  await hover('at_booked', await mark(/^Booked calls$/i));
  await scrollSeq('at_up', 0, 12);
  await shoot('at_board3');
  await click('at_tab_read', await mark(/^Strategy read$/), null, 1500);
  await shoot('at_read2');

  console.log('7 Voice, templates, knowledge base, and What should change?');
  await page.addStyleTag({ content: '#nwNav > *{pointer-events:auto!important}' });
  await openProd('nav_atlas', 'Atlas', 1300);
  await shoot('atlas_open');
  await click('nav_profile', nav('Company profile'), null, 2400);
  await shoot('profile');
  await tgt('profile_voice_box', page.locator('.e9-vl').first());
  await hover('profile_voice', page.locator('.e9-vl-h h3').first(), (b) => [b.x + 120, b.y + b.height / 2]);
  await page.evaluate(() => typeof apTplLoad === 'function' && apTplLoad());
  await openProd('nav_settings', 'Settings', 1300);
  await shoot('settings_open');
  await click('nav_ais', nav('AI settings'), null, 2600);
  await shoot('ais');
  await tgt('ais_strip', page.locator('.ap-ais .rd-strip').first());
  await tgt('ais_tpl_box', page.locator('.ap-ais .rd-strip button').nth(2));
  await tgt('ais_kb_box', page.locator('.ap-ais .rd-strip button').nth(3));
  await hover('ais_tpl', page.locator('.ap-ais .rd-strip button').nth(2));
  await hover('ais_kb', page.locator('.ap-ais .rd-strip button').nth(3));
  if (!(await nav('Content Transformation').isVisible())) { await openProd('nav_pipe', 'Pipeline', 1300); await shoot('pipe_open'); }
  await click('nav_ct2', nav('Content Transformation'), null, 2400);
  await shoot('ct2');
  await hover('ct_tab_drafts2', await vis('button', /^Drafts\s*\d*$/));
  await press(2200);
  await shoot('ct_drafts2');
  const askB = await page.evaluate(() => { const b = document.querySelector('.ap-cf-rev .v126-btn'); return b ? Math.round(b.getBoundingClientRect().bottom + scrollY) : 0; });
  await scrollSeq('ct_dn', Math.max(0, askB - VH + 110), 8);
  await shoot('ct_drafts3');
  await hover('ct_ask', page.locator('.ap-cf-rev .v126-btn').first());
  await press(900);
  await shoot('ct_dlg');
  await tgt('ct_dlg_box', page.locator('#v126M').first());
  for (const [k, t] of [['long', 'Too long'], ['salesy', 'Too salesy']]) {
    await hover('ct_why_' + k, page.locator('#v126M .v103-why button', { hasText: t }).first());
    await press(500);
    await shoot('ct_why_' + k + '_on');
  }
  await page.evaluate((v) => { const t = document.getElementById('v126Ta'); t.value = v; t.blur(); }, 'Cut the intro. Lead with the five decisions.');
  await shoot('ct_dlg_text');
  await hover('ct_save', page.locator('#v126Go'));
  await page.evaluate(() => document.querySelectorAll('style').forEach((x) => { if (/^#toast,#nwToast/.test(x.textContent)) x.disabled = true; }));
  await press(1300);
  await shoot('ct_saved');

  R.calls = calls.filter((c) => !/fathom|calendly/.test(c));
  R.errors = errors.slice(0, 10);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(R, null, 1));
  console.log('done in', Math.round((Date.now() - t0) / 1000), 's; snaps', Object.keys(R.snaps).length, 'seq frames', Object.values(R.seqs).reduce((a, s) => a + s.imgs.length, 0), 'errors', errors.slice(0, 3));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
