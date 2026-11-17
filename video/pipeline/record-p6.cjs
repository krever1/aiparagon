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
// Usage: node record-p6.cjs   -> rec-p6/*.png and rec-p6/manifest.json   (LOOK=1 -> look/, at 1x; STOP=n ends after section n)
const fs = require('fs'), path = require('path');
const V = require('../lib/vharness.cjs');
const { makeStore } = require(V.ROOT + '/tests/lib/rest-stub');
const D = require('../lib/pipeline-data.cjs');
const LOOK = !!process.env.LOOK, STOP = +(process.env.STOP || 99);
const OUT = path.join(__dirname, LOOK ? 'look' : 'rec-p6');
const DSF = LOOK ? 1 : 3;
const VW = +(process.env.VW || 1200), VH = +(process.env.VH || 675);
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
    fix(); new MutationObserver(fix).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  // Settings' pages have no icons of their own; in the collapsed rail they get one each, as the products' pages have
  await page.evaluate(() => { const IC = { integrations: 'layers', learning: 'sparkle', audit: 'history' };
    const add = () => document.querySelectorAll('#nwNav button[title=Settings] + .nw-sub .nw-item').forEach((b) => { if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', nwIc(IC[b.dataset.view] || 'sliders', 19)); });
    add(); new MutationObserver(add).observe(document.getElementById('nwNav'), { childList: true, subtree: true }); });
  await moveTo(VW - 5, VH - 5); await wait(300);

  console.log('1 Overview: three agents');
  await shoot('ov');
  await hover('ov_pipeline', parent('Pipeline'));
  await moveTo(X(420), Y(590), 3); await wait(250);
  await scrollSeq('ov_scroll', 150, 14);
  await shoot('ov2');
  await tgt('ov2_flow', app('button.nw-fstep', 'Intel Tracker').locator('xpath=..'));
  for (const [k, t] of [['intel', 'Intel Tracker'], ['adstrat', 'Ad Strategist'], ['mg', 'Marketing Generation']]) await hover('ov2_' + k, app('button.nw-fstep', t));

  console.log('2 Intel Tracker: weekly, then the posts it keeps; the Ad Strategist ranks the ads');
  await moveTo(R.targets.ov2_intel.at[0], R.targets.ov2_intel.at[1], 4); await wait(200);
  await press(1800);
  await shoot('intel');
  await tgt('intel_head', await mark(/^Weekly · last ran /));
  await hover('intel_week', await mark(/^Weekly · last ran /), (b) => [b.x + 70, b.y + b.height / 2]);
  await hover('intel_reads', await mark(/^Reads \d+ accounts and \d+ topics weekly$/), (b) => [b.x + 120, b.y + b.height / 2]);
  await hover('intel_92', app('button.nw-ring-btn'));
  await hover('intel_title', app('button.nw-pc-title'), (b) => [b.x + 120, b.y + b.height / 2]);
  await click('nav_adstrat', nav('Ad Strategist'), null, 1800);
  await shoot('as');
  // the shorter window needs a short scroll to the cards' days running and scores
  const asB = await page.evaluate(() => { const e = [...document.querySelectorAll('#view-app *')].find((x) => /^83$/.test((x.innerText || '').trim()) && x.offsetParent); return e ? Math.round(e.getBoundingClientRect().bottom + scrollY) : 0; });
  await scrollSeq('as_down', Math.max(0, asB - VH + 48), 10);
  await shoot('as2');
  await hover('as_68', await mark(/^68 days running$/));
  await hover('as_score', await mark(/^83$/));

  const stopHere = async (n) => { if (STOP !== n) return false; fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(R, null, 1)); console.log('stopped after', n, 'errors', errors.slice(0, 3)); await browser.close(); server.close(); return true; };

  console.log('3a Thought leadership: the organic brief (its title in frame), then a post written from it');
  await click('nav_briefs', nav('Market Intelligence Briefs'), null, 1800);
  await shoot('br_org');
  const orgT = await topOfText(/^Organic brief · \d+ \w+$/);
  console.log('  organic brief title at', orgT);
  await scrollSeq('br_org_down', Math.max(0, (orgT || 0) - 74), 14);
  await shoot('br_org2');
  await tgt('br_org_title', await mark(/^Organic brief · \d+ \w+$/));
  await tgt('br_org_five', await mark(/^Five things working$/));
  await hover('br_org_c1', await mark(/^Misconception openings beat offer-led ones$/));
  await hover('br_org_c2', await mark(/^Undocumented decisions is the theme that lands$/));
  await click('nav_mg0', nav('Marketing Generation'), null, 1800);
  await shoot('mg_new0');
  await click('mg_tab_lib', page.locator('#view-app button[role=tab][data-tab=library]').first(), null, 1800);
  await shoot('mg_lib');
  await tgt('mg_post_head', page.locator('.ap-cf-draft h2').first());
  const papT = await page.evaluate(() => { const e = document.querySelector('.ap-cf-draft .ap-cf-paper'); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : 0; });
  await scrollSeq('mg_post_down', Math.max(0, papT - 260), 12, X(1180), Y(470));
  await shoot('mg_post');
  await tgt('mg_post_box', page.locator('.ap-cf-draft').first());
  await tgt('mg_post_paper', page.locator('.ap-cf-draft .ap-cf-paper').first());
  await tgt('mg_post_title', page.locator('.ap-cf-draft h2').first());
  if (await stopHere(3)) return;

  console.log('3b The ads brief, its title in frame: the evidence table, a source');
  await click('nav_briefs2', nav('Market Intelligence Briefs'), null, 1800);
  await shoot('br_org3');
  await click('br_tab_ads', await mark(/^Ads$/, '#view-app'), null, 1500);
  await shoot('br_ads');
  const adsT = await topOfText(/^Ads brief · \d+ \w+$/);
  console.log('  ads brief title at', adsT);
  await scrollSeq('br_ads_down', Math.max(0, (adsT || 0) - 74), 12);
  await shoot('br_ads2');
  await tgt('br_ads_title', await mark(/^Ads brief · \d+ \w+$/));
  const ey = await textY('Ads behind these patterns');
  await scrollSeq('br_down', ey - 110, 26);
  await shoot('br_ev');
  await hover('br_cta', await mark(/^Call to action$/i));
  await hover('br_five', await mark(/^Five things$/));
  await scrollSeq('br_up', Math.max(0, (adsT || 0) - 74), 22);
  await shoot('br_cards');
  await tgt('br_ads_title2', await mark(/^Ads brief · \d+ \w+$/));
  await hover('br_src', await mark(/^1 source/, '#view-app', /^3 Offer Workshops pay/), (b) => [b.x + Math.min(b.width, 64) / 2 + 2, b.y + b.height / 2]);
  await press(1100);
  await shoot('br_drawer');
  await tgt('br_drawer_box', page.locator('aside.nw-drawer.is-on').first());
  await hover('br_close', page.locator('aside.nw-drawer.is-on button.nw-d-close').first());

  console.log('4 Marketing Generation: the campaign and its ads');
  await press(700);
  await click('nav_mg', nav('Marketing Generation'), null, 1800);
  await shoot('mg_new');
  await click('mg_tab_camps', await mark(/^Campaigns ?1?$/), null, 1300);
  await shoot('mg_camps');
  await hover('mg_card', await mark(/^Scaling Review$/), (b) => [b.x + b.width / 2 + 30, b.y - 50]);
  await press(3800);
  await shoot('camp');
  const adY = await page.evaluate(() => { const b = document.querySelector('#adImgBlock'); return b ? Math.round(b.getBoundingClientRect().top + scrollY) : null; });
  await scrollSeq('camp_down', adY - 100, 14);
  await shoot('camp_ads');
  await tgt('camp_block', page.locator('#adImgBlock').first());
  await hover('camp_a', page.locator('#adImgBlock .studio-canvas > .vcard').first(), (b) => [b.x + b.width * 0.5, b.y + 330]);

  console.log('5 Approve it: nothing goes live until then');
  await press(2200);
  await shoot('ed');
  await hover('ed_approve', await vis('button', /Approve$/));
  await press(1600);
  await shoot('ed_approved');
  await hover('ed_exit', await vis('button', /^Exit focus$/));
  await press(2000);
  await shoot('camp_after');
  console.log('  after approve', await page.evaluate(() => (document.getElementById('view-app').innerText.match(/\d of 3 ads approved/) || ['?'])[0]), JSON.stringify(store.writes.filter((w) => w.table === 'agent_feedback').map((w) => w.body && w.body.action)));
  await tgt('camp_count', await mark(/^\d of 3 ads approved$/));
  await hover('camp_back', await mark(/^Campaigns$/), (b) => [b.x + b.width / 2 - 6, b.y + b.height / 2]);
  await press(1500);
  await shoot('mg_camps2');

  console.log('6 Campaign types');
  await hover('mg_tab_new', await mark(/^Make new$/));
  await press(1500);
  await shoot('mg2');
  // down to the campaign types (they wrap to two lines in the narrower page)
  const chipB = await page.evaluate(() => { const e = [...document.querySelectorAll('#view-app button, #view-app [role="radio"], #view-app span')].filter((x) => /^Newsletter sign-up/.test((x.innerText || '').trim()) && x.getBoundingClientRect().width > 0).pop(); return e ? Math.round(e.getBoundingClientRect().bottom + scrollY) : 0; });
  await scrollSeq('mg2_down', Math.max(0, chipB - VH + 140), 8);
  await shoot('mg2b');
  for (const [k, t] of [['call', 'Book a call'], ['web', 'Webinar or masterclass'], ['dl', 'Resource download'], ['news', 'Newsletter sign-up']]) {
    await click('mg2_' + k, await mark(new RegExp('^' + t + '( \\d)?$')), null, 1200);
    await shoot('mg2_' + k);
  }

  console.log('7 Ad Testing: the leaderboard, then the strategy read');
  await click('nav_at', nav('Ad Testing'), null, 1800);
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
  await hover('at_create', await mark(/^Create\b/));

  console.log('8 Atlas > Company profile: the brand voice');
  // the sidebar groups are blurred in these videos; let the real clicks reach them
  await page.addStyleTag({ content: '#nwNav > *{pointer-events:auto!important}' });
  await openProd('nav_atlas', 'Atlas', 1300);
  await shoot('atlas_open');
  await click('nav_profile', nav('Company profile'), null, 2400);
  await shoot('profile');
  await tgt('profile_voice_box', page.locator('.e9-vl').first());
  await hover('profile_voice', page.locator('.e9-vl-h h3').first(), (b) => [b.x + 120, b.y + b.height / 2]);

  console.log('8b Settings > AI settings: templates and the knowledge base');
  await page.evaluate(() => typeof apTplLoad === 'function' && apTplLoad());   // the templates the Templates page and Create content load
  await openProd('nav_settings', 'Settings', 1300);
  await shoot('settings_open');
  await click('nav_ais', nav('AI settings'), null, 2600);
  await shoot('ais');
  await tgt('ais_strip', page.locator('.ap-ais .rd-strip').first());
  console.log('  strip', await page.evaluate(() => [...document.querySelectorAll('.ap-ais .rd-strip button')].map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim()).join(' | ')));
  await hover('ais_tpl', page.locator('.ap-ais .rd-strip button').nth(2));
  await hover('ais_kb', page.locator('.ap-ais .rd-strip button').nth(3));
  console.log('9 It learns: what should change in a post, and the next draft avoids it');
  // the Pipeline group is still open in the sidebar from the earlier pages; open it only if it is not
  console.log('  Content Transformation in view:', await nav('Content Transformation').isVisible());
  if (!(await nav('Content Transformation').isVisible())) { await openProd('nav_pipe', 'Pipeline', 1300); await shoot('pipe_open'); }
  await click('nav_ct', nav('Content Transformation'), null, 2400);
  await shoot('ct');
  await hover('ct_tab_drafts', await vis('button', /^Drafts\s*\d*$/));
  await press(2200);
  await shoot('ct_drafts');
  await tgt('ct_draft_box', page.locator('.ap-cf-dm').first());
  // down to What should change? (below the fold in the shorter window)
  const askB = await page.evaluate(() => { const b = document.querySelector('.ap-cf-rev .v126-btn'); return b ? Math.round(b.getBoundingClientRect().bottom + scrollY) : 0; });
  await scrollSeq('ct_dn', Math.max(0, askB - VH + 110), 8);
  await shoot('ct_drafts2');
  await tgt('ct_rev_box', page.locator('.ap-cf-rev').first());
  await hover('ct_ask', page.locator('.ap-cf-rev .v126-btn').first());
  await press(900);
  await shoot('ct_dlg');
  await tgt('ct_dlg_box', page.locator('#v126M').first());
  for (const [k, t] of [['long', 'Too long'], ['salesy', 'Too salesy']]) {
    await hover('ct_why_' + k, page.locator('#v126M .v103-why button', { hasText: t }).first());
    await press(500);
    await shoot('ct_why_' + k + '_on');
  }
  // the note is already written (the typing is not shown)
  await page.evaluate((v) => { const t = document.getElementById('v126Ta'); t.value = v; t.blur(); }, 'Cut the intro. Lead with the five decisions.');
  await shoot('ct_dlg_text');
  await hover('ct_save', page.locator('#v126Go'));
  // the toast says what happens next: shown for this one state, the others keep it hidden
  await page.evaluate(() => document.querySelectorAll('style').forEach((x) => { if (/^#toast,#nwToast/.test(x.textContent)) x.disabled = true; }));
  await press(1300);
  await shoot('ct_saved');
  await page.evaluate(() => document.querySelectorAll('style').forEach((x) => { if (/^#toast,#nwToast/.test(x.textContent)) x.disabled = false; }));
  console.log('  saved:', JSON.stringify(store.writes.filter((w) => w.table === 'agent_feedback').map((w) => w.body)));
  // a little way down: the count under the button
  const cntB = await page.evaluate(() => { const b = document.querySelector('.ap-cf-rev .v126-n'); return b ? Math.round(b.getBoundingClientRect().bottom + scrollY) : 0; });
  await scrollSeq('ct_down', Math.max(await sy(), cntB - VH + 120), 12, X(1180), Y(470));
  await shoot('ct_count');
  await tgt('ct_count_box', page.locator('.ap-cf-rev .v126-n').first());
  await hover('ct_count', page.locator('.ap-cf-rev .v126-n').first(), (b) => [b.x + b.width + 16, b.y + b.height / 2]);
  console.log('  count:', JSON.stringify(await page.evaluate(() => (document.querySelector('.ap-cf-rev .v126-n') || {}).textContent)));
  // the next draft: its side pane says what it will avoid
  await scrollSeq('ct_up', 0, 10, X(1180), Y(470));
  await hover('ct_tab_new', await vis('button', /^New draft$/));
  await press(1600);
  await shoot('ct_new');
  const useY = await topOf('#nwCtSideB .v126-use');
  await scrollSeq('ct_down2', Math.max(0, useY - Y(420)), 16, X(1180), Y(470));
  await shoot('ct_use');
  await tgt('ct_use_box', page.locator('#nwCtSideB .v126-use').first());
  await tgt('ct_side_box', page.locator('#nwCtSideB').first());
  await hover('ct_use', page.locator('#nwCtSideB .v126-use').first(), (b) => [b.x + b.width - 30, b.y + b.height / 2]);
  console.log('  side pane:', JSON.stringify(await page.evaluate(() => (document.querySelector('#nwCtSideB .v126-use') || {}).innerText)));

  R.calls = calls.filter((c) => !/fathom|calendly/.test(c));
  R.errors = errors.slice(0, 10);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(R, null, 1));
  console.log('done in', Math.round((Date.now() - t0) / 1000), 's; snaps', Object.keys(R.snaps).length, 'seq frames', Object.values(R.seqs).reduce((a, s) => a + s.imgs.length, 0), 'n8n calls', R.calls, 'errors', errors.slice(0, 3));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
