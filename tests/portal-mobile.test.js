// Mobile and layout tests for E-&-G-Home-Inc.html (#2, the care portal), at phone, tablet and small-laptop widths:
// every page for director, staff and family, the tabs inside them, and the windows, drawers and menus their buttons
// open, in the demo view (sample data) and signed in to a made-up team on the stand-in backend (lib/portal-backend.js)
// whose records have long names (a 40-character staff name, a 70-character document title, long homes and programs),
// so text that does not fit shows. On each screen, in the page itself:
//   (a) nothing scrolls sideways, and nothing sticks out past the window outside a box that scrolls sideways;
//   (b) no text overflows its own button, pill, tab, label, select or box (cut off without an ellipsis, or spilling);
//   (c) every control, scrolled to its best place, is on screen and nothing that does not belong to it is drawn over
//       it (hit-tested with elementsFromPoint at its centre and inset corners), and no text runs over other text;
//   (d) no button or tab label wraps to three lines, or one word per line;
//   (e) tap targets of at least 32 x 32 px on a phone (reported, minor);
//   (f) fixed and sticky things (the top bar, the floating Ask button, the banners, toasts, window footers) cover
//       nothing at its best scroll place, the last field and button of a long page or window included;
//   (g) a window taller than the screen scrolls, and its buttons can be reached.
// Plus: text cut off by a box that clips it, sentences split into side-by-side flex columns, tick boxes stretched
// across their row, cards and lists wider than their box (only tab strips and real tables may scroll sideways), and
// window bodies that run on under their pinned footer. The sign-in screens, a new team's setup questions and the
// pilot agreement it opens on are checked at each width too.
// The faults the Nov 5 QA pass found (fixed in v12.42) each have a check of their own; any other fault fails the
// general checks. The app is zoomed 1.09; every measure is in the window's own pixels.
// Usage: node tests/portal-mobile.test.js [baseline.html]
//   default        the core screens at 320x568, 390x844, 844x390, 768x1024 and 1024x768 (about 7 to 8 minutes)
//   QA_FULL=1      every screen at every width (320, 360, 375, 390, 414, 430, 768, 1024, 844x390), plus a crawl that
//                  opens what each page's buttons open and audits every new window (QA_CRAWL=390,320,768 by default;
//                  about 40 minutes with all three, about 25 with QA_CRAWL=390)
//   QA_WIDTHS=320,land  QA_MODES=demo,team,login  QA_ROLES=director  narrow a run
//   QA_SHOTS=dir   a screenshot (scale 1) of each screen with a finding, the flagged parts outlined in red
//   QA_REVIEW=dir  every screen, top and scrolled to the bottom, for a person to look through
//   QA_JSON=file   every finding as JSON
//   QA_ONLY=re     only screens whose name matches
const H = require('./lib/portal-harness');
const { makeBackend } = require('./lib/portal-backend');
const fs = require('fs');
const path = require('path');

const FULL = !!process.env.QA_FULL;
const SHOTS = process.env.QA_SHOTS || '';
const JSON_OUT = process.env.QA_JSON || '';
const ONLY = process.env.QA_ONLY ? new RegExp(process.env.QA_ONLY) : null;
const MODES = (process.env.QA_MODES || 'demo,team,login').split(',');   // which parts to run
const ROLES = (process.env.QA_ROLES || 'director,staff,family').split(',');
const REVIEW = process.env.QA_REVIEW || '';                            // every screen, top and bottom, for a person to look at
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
if (REVIEW) fs.mkdirSync(REVIEW, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + String(detail).slice(0, 900) + ']'));
}

const SIZES = {
  320: { width: 320, height: 568, phone: true }, 360: { width: 360, height: 740, phone: true }, 375: { width: 375, height: 667, phone: true },
  390: { width: 390, height: 844, phone: true }, 414: { width: 414, height: 896, phone: true }, 430: { width: 430, height: 932, phone: true },
  768: { width: 768, height: 1024, phone: false, touch: true }, 1024: { width: 1024, height: 768, phone: false }, land: { width: 844, height: 390, phone: true },
};
const WIDTHS = process.env.QA_WIDTHS ? process.env.QA_WIDTHS.split(',') : FULL ? Object.keys(SIZES) : ['320', '390', 'land', '768', '1024'];
const sizeName = (k) => (k === 'land' ? '844x390' : SIZES[k].width + 'x' + SIZES[k].height);

// ------------------------------------------------------------------------------------------------------------------
// the audit, run in the page: page.evaluate(audit, {root, phone, inFixed}). Each element it flags gets data-qa="<n>".
function audit(opt) {
  opt = opt || {};
  const W = document.documentElement.clientWidth, H = innerHeight;
  const CS = new Map();
  const cs = (n) => { let c = CS.get(n); if (!c) { c = getComputedStyle(n); CS.set(n, c); } return c; };
  let qa = +(document.documentElement.dataset.qaN || 0);
  const tag = (n) => { if (!n.dataset.qa) n.dataset.qa = String(++qa); return n.dataset.qa; };
  const short = (n) => {
    if (!n || !n.tagName) return String(n);
    const s = n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    const t = (n.tagName === 'SELECT' ? '' : (n.innerText || n.value || n.getAttribute('aria-label') || n.title || n.placeholder || '')).replace(/\s+/g, ' ').trim();
    return s + (t ? ' "' + t.slice(0, 50) + '"' : '');
  };
  const roots = (opt.root ? [...document.querySelectorAll(opt.root)] : [document.body]).filter(Boolean);
  const inRoot = (n) => roots.some((r) => r === n || r.contains(n));
  const OPQ = new Map();
  const faded = (n) => { if (!n || n === document.documentElement) return false; if (OPQ.has(n)) return OPQ.get(n); const v = +cs(n).opacity < 0.05 || faded(n.parentElement); OPQ.set(n, v); return v; };
  const shown = (n) => { if (!n.getClientRects().length) return false; const c = cs(n); if (c.visibility !== 'visible' || c.display === 'contents') return false; const r = n.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; return !faded(n); };
  const clipOf = (n, self) => {
    let L = -1e9, T = -1e9, R = 1e9, B = 1e9;
    for (let p = self ? n : n.parentElement; p && p !== document.documentElement && p !== document.body; p = p.parentElement) {
      const c = cs(p);
      const cx = c.overflowX !== 'visible', cy = c.overflowY !== 'visible';
      if (cx || cy) { const r = p.getBoundingClientRect(); if (cx) { L = Math.max(L, r.left); R = Math.min(R, r.right); } if (cy) { T = Math.max(T, r.top); B = Math.min(B, r.bottom); } }
      if (c.position === 'fixed') break;
    }
    return { L, T, R, B };
  };
  const fixedOf = (n) => { for (let p = n; p && p !== document.documentElement; p = p.parentElement) { const c = cs(p).position; if (c === 'fixed' || c === 'sticky') return p; } return null; };
  const out = { sw: document.scrollingElement.scrollWidth, w: W, h: H, past: [], scrollers: [], textOver: [], covered: [], offscreen: [], wrap: [], small: [], textHit: [], selectCut: [], inputCut: [], split: [], bigCheck: [], clipText: [], cardScroll: [], sheetOverlap: [], checked: 0 };
  const sx = scrollX, sy = scrollY;
  const SKIP = /^(SCRIPT|STYLE|OPTION|OPTGROUP|BR|svg|path|g|circle|rect|line|polyline|polygon|use|defs|clipPath|linearGradient|stop|ellipse|text|tspan|mask|symbol|title)$/i;
  const all = roots.flatMap((r) => [r, ...r.querySelectorAll('*')]).filter((n) => !SKIP.test(n.tagName) && !(n.closest && n.closest('svg')));
  const vis = all.filter(shown);
  const visSet = new Set(vis);

  // (a) past the edges of the window
  const pastSet = new Set();
  for (const n of vis) {
    const r = n.getBoundingClientRect();
    if (r.right <= W + 1 && r.left >= -1) continue;
    if ((r.right <= 0 || r.left >= W) && (fixedOf(n) || cs(n).transform !== 'none')) continue;   // an off-canvas panel
    const k = clipOf(n);
    if (k.R <= W + 1 && k.L >= -1) continue;
    let dup = false; for (let p = n.parentElement; p; p = p.parentElement) if (pastSet.has(p)) { dup = true; break; }
    if (dup) continue;
    pastSet.add(n);
    out.past.push({ qa: tag(n), el: short(n), left: Math.round(r.left), right: Math.round(r.right), fixed: !!fixedOf(n) });
  }
  for (const n of vis) {
    const c = cs(n);
    if (!((c.overflowX === 'auto' || c.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1 && n !== document.body)) continue;
    out.scrollers.push({ qa: tag(n), el: short(n).slice(0, 80), sw: n.scrollWidth, cw: n.clientWidth });
    // a strip of tabs or filters may scroll sideways, and so may a real table of three or more columns; anything else
    // (a list, a card's rows, a two-column table, a message) that is wider than its card hides its right-hand part
    if (!inRoot(n) || n.matches('.tabs,.seg,[role=tablist],.cal-chips,.cx-tags,.hm-chips,.filters,.fb-row,.tpe-ribbon') || n.closest('.tabs,.seg')) continue;
    const tbl = [...n.querySelectorAll('table')].find((t) => shown(t) && Math.max(0, ...[...t.rows].map((r) => r.cells.length)) >= 3);
    if (tbl) continue;
    if (/^(nowrap|pre)$/.test(c.whiteSpace) && n.childElementCount <= 1) continue;
    out.cardScroll.push({ qa: tag(n), el: short(n).slice(0, 80), sw: n.scrollWidth, cw: n.clientWidth });
  }
  // a bottom sheet whose scrolling body runs on under its pinned footer: the last part of the form is hidden until the
  // sheet itself is scrolled too (a scroll inside a scroll)
  for (const b of roots.flatMap((r) => [...r.querySelectorAll('.md-b,.dr-b')])) {
    if (!visSet.has(b) || b.scrollHeight <= b.clientHeight + 2) continue;
    const f = b.parentElement && [...b.parentElement.children].find((x) => x.matches('.md-f,.dr-f') && visSet.has(x));
    if (!f) continue;
    const over = b.getBoundingClientRect().bottom - f.getBoundingClientRect().top;
    const outer = b.parentElement.closest('.modal,.drawer');
    if (over > 4) out.sheetOverlap.push({ qa: tag(b), el: short(b).slice(0, 50), under: Math.round(over), outerScroll: outer ? outer.scrollHeight - outer.clientHeight : 0 });
  }

  const CTRL = 'button,a[href],a[onclick],input:not([type=hidden]),select,textarea,[role=tab],[role=button],[role=menuitem],summary';
  const textLines = (n, skipInner) => {
    const rects = [];
    const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const pe = t.parentElement; if (!pe || (!visSet.has(pe) && !shown(pe)) || pe.closest('select,svg,option')) continue;
      let skip = false;
      for (let p = pe; p && p !== n; p = p.parentElement) { const c = cs(p); if (c.position === 'absolute' || c.position === 'fixed' || (skipInner && p.matches(CTRL))) { skip = true; break; } }
      if (skip) continue;
      const rg = document.createRange(); rg.selectNodeContents(t);
      const rs = [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      rs.forEach((r) => rects.push({ r, pe, t }));
    }
    return rects;
  };
  // an ellipsis is only drawn by a block box (not a flex or grid one) around inline text that does not wrap
  const ellipsisFor = (pe, stop) => {
    for (let p = pe; p; p = p.parentElement) {
      const c = cs(p);
      if (c.textOverflow === 'ellipsis' && c.overflowX !== 'visible' && !/flex|grid/.test(c.display)) return true;
      if (c.display !== 'inline' || p === stop) break;                 // the box that lays the text out: nothing above it can
    }
    return false;
  };


  // (b) text that does not fit its own box, and (d) labels that wrap badly
  const BOXES = 'button,.btn,a.btn,[class*="pill"],[class*="chip"],.badge,[class*="badge"],.tabs>*,[role=tab],label,.nav-item,.icon-btn,h1,h2,h3,th,[class*="tag"]';
  const LABELS = 'button,.btn,.tabs>*,[role=tab],[class*="pill"],[class*="chip"],.badge,.nav-item';
  for (const n of vis) {
    if (!n.matches(BOXES) || !inRoot(n)) continue;
    const r = n.getBoundingClientRect();
    const lines = textLines(n, true);
    if (!lines.length) continue;
    let L = 1e9, R = -1e9, T = 1e9, B = -1e9;
    lines.forEach(({ r: q }) => { L = Math.min(L, q.left); R = Math.max(R, q.right); T = Math.min(T, q.top); B = Math.max(B, q.bottom); });
    const c = cs(n);
    const cutX = Math.max(R - r.right, r.left - L), cutY = Math.max(B - r.bottom, r.top - T);
    if (cutX > 1.5 || (cutY > 3 && n.matches(LABELS))) {
      const ell = lines.some(({ pe }) => ellipsisFor(pe, n));
      const clipped = c.overflowX !== 'visible' || lines.some(({ pe }) => { for (let p = pe; p && p !== n; p = p.parentElement) if (cs(p).overflowX !== 'visible') return true; return false; });
      if (!ell) out.textOver.push({ qa: tag(n), el: short(n), w: Math.round(r.width), text: Math.round(R - L), by: Math.round(cutX), byY: Math.round(cutY), how: clipped ? 'cut off' : 'spills out' });
    }
    if (n.matches(LABELS)) {
      // a single run of text that wraps: 3+ lines, or one word on each line
      const big = r.height > 110 || (n.innerText || '').trim().split(/\s+/).length > 14;
      if (!big) {
        const byNode = new Map(); lines.forEach(({ r: q, t }) => { const a = byNode.get(t) || []; if (!a.some((x) => Math.abs(x - q.top) < 4)) a.push(q.top); byNode.set(t, a); });
        let worst = null;
        byNode.forEach((tops, t) => { const words = t.nodeValue.trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length; if ((tops.length >= 3 && words <= 5) || (tops.length >= 2 && words >= 2 && words <= tops.length)) if (!worst || tops.length > worst.lines) worst = { lines: tops.length, words, text: t.nodeValue.trim().slice(0, 40) }; });
        // a title in a block that fills its row (a list item's name) may wrap like any text; a label in a button, tab or pill may not,
        // unless it already takes its whole row of a box at least 200 px wide (a 40-character name in a chip: it cannot get wider)
        const pw = n.parentElement ? n.parentElement.getBoundingClientRect().width : 0;
        const blockRow = (c.display === 'block' && r.width > pw * 0.6) || (pw >= 200 && r.width >= pw * 0.9);
        if (worst && !blockRow) out.wrap.push({ qa: tag(n), el: short(n), lines: worst.lines, words: worst.words, run: worst.text, w: Math.round(r.width) });
      }
    }
  }
  // any text cut off by a box that clips it (not one that scrolls), with no ellipsis: words that simply are not shown
  {
    const seenPe = new Set(out.textOver.map((x) => x.qa));
    for (const root of roots) {
      const wk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
      for (let t = wk.nextNode(); t; t = wk.nextNode()) {
        const pe = t.parentElement; if (!pe || !visSet.has(pe) || pe.closest('select,svg,option,textarea') || seenPe.has(pe.dataset.qa)) continue;
        if (pe.getBoundingClientRect().width <= 2) continue;
        let clip = null;
        for (let p = pe; p && p !== document.body; p = p.parentElement) { const ox = cs(p).overflowX; if (ox === 'auto' || ox === 'scroll') { clip = null; break; } if (ox === 'hidden' || ox === 'clip') { clip = p; break; } }
        if (!clip) continue;
        const k = clip.getBoundingClientRect();
        const rg = document.createRange(); rg.selectNodeContents(t);
        let worst = 0;
        for (const q of rg.getClientRects()) { if (q.width < 1) continue; worst = Math.max(worst, q.right - k.right, k.left - q.left); }
        if (worst <= 2 || ellipsisFor(pe, clip)) continue;
        // a box that hides a label on purpose (a slide-away panel, a collapsed part) is out of sight altogether
        if (k.width < 4) continue;
        seenPe.add(tag(pe));
        out.clipText.push({ qa: pe.dataset.qa, el: short(pe), by: Math.round(worst), clip: short(clip).slice(0, 60), text: t.nodeValue.trim().slice(0, 50) });
        if (out.clipText.length > 30) break;
      }
    }
  }
  // text laid out as side-by-side columns: a row flexbox whose loose text wraps beside other text (a sentence in two columns)
  for (const n of vis) {
    if (!inRoot(n)) continue;
    const c = cs(n);
    if (!/flex/.test(c.display) || /column/.test(c.flexDirection) || c.flexWrap !== 'nowrap') continue;
    const kids = [...n.childNodes].filter((k) => (k.nodeType === 3 && k.nodeValue.trim()) || (k.nodeType === 1 && visSet.has(k) && (k.innerText || '').trim()));
    if (kids.length < 2) continue;
    // a phrase of its own beside it (three words or more): an icon, a chevron or a time beside a wrapping label is
    // an ordinary row, not two columns
    const words = (k) => ((k.nodeType === 3 ? k.nodeValue : k.innerText) || '').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    let wraps = null;
    for (const k of kids) if (k.nodeType === 3) {
      const rg = document.createRange(); rg.selectNodeContents(k); const tops = [];
      [...rg.getClientRects()].forEach((q) => { if (q.width > 0.5 && !tops.some((t) => Math.abs(t - q.top) < 4)) tops.push(q.top); });
      if (tops.length >= 2 && kids.some((o) => o !== k && words(o) >= 3)) { wraps = k.nodeValue.trim().slice(0, 40); break; }
    }
    if (wraps) out.split.push({ qa: tag(n), el: short(n), run: wraps, w: Math.round(n.getBoundingClientRect().width) });
  }
  // a tick box or round choice stretched across its row squeezes the words beside it
  for (const n of vis) if (inRoot(n) && n.matches('input[type=checkbox],input[type=radio]')) { const r = n.getBoundingClientRect(); if (r.width > 40) out.bigCheck.push({ qa: tag(n), el: short(n) + (n.id ? '' : ' in ' + short(n.parentElement).slice(0, 50)), w: Math.round(r.width) }); }
  // selects and inputs whose text is cut off
  const cv = document.createElement('canvas').getContext('2d');
  const tw = (s, c) => { cv.font = `${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`; return cv.measureText(s).width; };
  for (const n of vis) {
    if (!inRoot(n)) continue;
    if (n.tagName === 'SELECT' && !n.multiple && n.selectedIndex >= 0) {
      const c = cs(n); const txt = (n.options[n.selectedIndex] || {}).text || '';
      const avail = n.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) - (c.appearance === 'none' ? 0 : 20);
      const need = tw(txt, c);
      if (need > avail + 2 && c.textOverflow !== 'ellipsis') out.selectCut.push({ qa: tag(n), el: short(n), text: txt.slice(0, 60), need: Math.round(need), avail: Math.round(avail) });
    }
    if (n.tagName === 'INPUT' && /^(text|email|search|tel|url|number|password)$/.test(n.type) && !n.value && n.placeholder) {
      const c = cs(n);
      const avail = n.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
      const need = tw(n.placeholder, c);
      if (need > avail + 2 && c.textOverflow !== 'ellipsis') out.inputCut.push({ qa: tag(n), el: short(n), what: 'placeholder', text: n.placeholder.slice(0, 60), need: Math.round(need), avail: Math.round(avail) });
    }
    if (n.tagName === 'INPUT' && /^(date|time)$/.test(n.type)) {
      const c = cs(n); const sample = n.type === 'date' ? '00/00/0000' : '00:00 AM';
      const avail = n.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) - 22;
      const need = tw(sample, c);
      if (need > avail + 2) out.inputCut.push({ qa: tag(n), el: short(n), what: n.type, need: Math.round(need), avail: Math.round(avail) });
    }
  }

  // (c)(f)(g) every control at its best scroll place: on screen, and nothing unrelated over it
  const ctrls = vis.filter((n) => inRoot(n) && n.matches(CTRL + ',[onclick],label[for]') && cs(n).pointerEvents !== 'none' && !n.closest('[aria-hidden="true"]'));
  const scrolled = new Map();
  const remember = (n) => { for (let p = n.parentElement; p; p = p.parentElement) if (!scrolled.has(p) && (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth)) scrolled.set(p, [p.scrollLeft, p.scrollTop]); };
  const related = (a, b) => a === b || a.contains(b) || b.contains(a) || (a.labels && [...a.labels].some((l) => l === b || l.contains(b)));
  const badgeLike = (n) => { const r = n.getBoundingClientRect(); return r.width <= 26 && r.height <= 26 && (/badge|dot|count|cnt|pip/.test(typeof n.className === 'string' ? n.className : '') || /^\d+\+?$/.test((n.textContent || '').trim())); };
  for (const n of ctrls) {
    if (!n.isConnected || !shown(n)) continue;
    if (!opt.noScroll) { remember(n); try { n.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (e) {} }
    const r = n.getBoundingClientRect();
    const k = clipOf(n);
    const L = Math.max(r.left, k.L, 0), T = Math.max(r.top, k.T, 0), R = Math.min(r.right, k.R, W), B = Math.min(r.bottom, k.B, H);
    out.checked++;
    if (R - L < 2 || B - T < 2) {
      if (r.width && r.height && !opt.noScroll) out.offscreen.push({ qa: tag(n), el: short(n), r: [r.left, r.top, r.right, r.bottom].map(Math.round), vh: H });
      continue;
    }
    const part = ((R - L) * (B - T)) / (r.width * r.height);
    if (part < 0.5 && r.height < H * 0.8 && r.width < W * 0.9 && !opt.noScroll) out.offscreen.push({ qa: tag(n), el: short(n), part: Math.round(part * 100) / 100, r: [r.left, r.top, r.right, r.bottom].map(Math.round), vh: H });
    const cx = (L + R) / 2, cy = (T + B) / 2;
    const ix = Math.min(4, (R - L) / 4), iy = Math.min(4, (B - T) / 4);
    const pts = [[cx, cy, 'centre'], [L + ix, T + iy, 'top-left'], [R - ix, T + iy, 'top-right'], [L + ix, B - iy, 'bottom-left'], [R - ix, B - iy, 'bottom-right']];
    const hits = [];
    for (const [x, y, where] of pts) {
      const list = document.elementsFromPoint(x, y);
      const i = list.findIndex((e) => e === n || n.contains(e));
      if (i < 0) continue;                                             // outside its round shape
      const over = list.slice(0, i).filter((e) => !related(n, e));
      if (!over.length) continue;
      if (where !== 'centre' && badgeLike(over[0])) continue;
      hits.push({ where, by: over[0] });
    }
    if (hits.length) {
      const c0 = hits.find((h) => h.where === 'centre');
      const by = (c0 || hits[0]).by;
      out.covered.push({ qa: tag(n), el: short(n), at: hits.map((h) => h.where), by: short(by).slice(0, 90), byQa: tag(by), byFixed: fixedOf(by) ? short(fixedOf(by)).slice(0, 60) : '', centre: !!c0, y: Math.round(cy) });
    }
  }
  scrolled.forEach(([l, t], p) => { p.scrollLeft = l; p.scrollTop = t; });
  window.scrollTo(sx, sy);

  // (e) tap targets under 32 x 32 on a phone
  if (opt.phone) {
    for (const n of ctrls) {
      if (!shown(n)) continue;
      let t = n;
      if (n.matches('input[type=checkbox],input[type=radio]')) { const l = n.closest('label') || (n.id && document.querySelector('label[for="' + n.id + '"]')); if (l && shown(l)) t = l; }
      if (n.matches('label') && !n.querySelector('input[type=checkbox],input[type=radio]') && n.control) continue;
      if (n.matches('a') && cs(n).display === 'inline') { const pt = (n.parentElement.innerText || '').trim(); if (pt.length > (n.innerText || '').trim().length + 15) continue; }
      if (t !== n && ctrls.includes(t)) continue;
      const r = t.getBoundingClientRect();
      if (r.width < 32 || r.height < 32) out.small.push({ qa: tag(n), el: short(n).slice(0, 70), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  // (c) text over text, or text over a field it does not belong to
  const items = [];
  for (const root of roots) {
    for (const { r, pe } of textLines(root, false)) {
      if (fixedOf(pe) && !opt.inFixed) continue;
      if (r.right < 0 || r.left > W) continue;
      const k = clipOf(pe, true);
      const L = Math.max(r.left, k.L), T = Math.max(r.top, k.T), R = Math.min(r.right, k.R), B = Math.min(r.bottom, k.B);
      if (R - L < 2 || B - T < 2) continue;
      items.push({ L, T, R, B, n: pe, text: true, f: fixedOf(pe) });
    }
  }
  for (const n of ctrls) {
    if (!n.matches('input:not([type=checkbox]):not([type=radio]),select,textarea') || (fixedOf(n) && !opt.inFixed)) continue;
    const r = n.getBoundingClientRect(); const k = clipOf(n);
    items.push({ L: Math.max(r.left, k.L), T: Math.max(r.top, k.T), R: Math.min(r.right, k.R), B: Math.min(r.bottom, k.B), n, text: false, f: fixedOf(n) });
  }
  items.sort((a, b) => a.T - b.T);
  const seenPair = new Set();
  outer: for (let i = 0; i < items.length; i++) {
    const a = items[i];
    for (let j = i + 1; j < items.length && items[j].T < a.B; j++) {
      const b = items[j];
      if (a.n === b.n || related(a.n, b.n)) continue;
      if (a.f !== b.f) continue;                                       // a sticky header or footer over what scrolls under it
      const ox = Math.min(a.R, b.R) - Math.max(a.L, b.L), oy = Math.min(a.B, b.B) - Math.max(a.T, b.T);
      if (ox < 3 || oy < 3) continue;
      if (badgeLike(a.n) || badgeLike(b.n)) continue;
      if (a.text && b.text && oy < Math.min(a.B - a.T, b.B - b.T) * 0.3) continue;   // only the leading of two lines touches
      const key = tag(a.n) + '/' + tag(b.n); if (seenPair.has(key)) continue; seenPair.add(key);
      out.textHit.push({ a: short(a.n).slice(0, 70), b: short(b.n).slice(0, 70), qa: tag(a.n), qb: tag(b.n), ox: Math.round(ox), oy: Math.round(oy) });
      if (out.textHit.length > 40) break outer;
    }
  }
  document.documentElement.dataset.qaN = String(qa);
  return out;
}

// what is open on top: the root the audit looks at (null: the page)
function topLayer() {
  const on = (id) => { const n = document.getElementById(id); return n && n.classList.contains('on'); };
  if (document.getElementById('sigOv')) return { root: '#sigOv .sig-card', fixed: true };
  if (document.getElementById('tourCard')) return { root: '#tourCard', fixed: false, noScroll: true };
  if (document.getElementById('cxMenu')) return { root: '#cxMenu', fixed: true, noScroll: true };
  if (document.getElementById('rmPop')) return { root: '#rmPop', fixed: true, noScroll: true };
  if (on('modal')) return { root: '#modal', fixed: true };
  if (on('drawer')) return { root: '#drawer', fixed: true };
  for (const id of ['inspFull', 'tlFull', 'formFull']) if (document.getElementById(id)) return { root: '#' + id, fixed: true };
  if (on('askPanel')) return { root: '#askPanel', fixed: true };
  const sb = document.getElementById('sidebar'); if (sb && sb.classList.contains('open') && innerWidth <= 900) return { root: '#sidebar', fixed: true };
  return { root: null };
}
// back to a plain page between screens
function resetPage() {
  try { tourEnd(); } catch (e) {} try { cxMenuClose(); } catch (e) {} try { rmClose(); } catch (e) {} try { sigClose(); } catch (e) {}
  ['inspFull', 'tlFull', 'formFull', 'tourRing', 'tourCard'].forEach((i) => { const n = document.getElementById(i); if (n) n.remove(); });
  try { if (el('askPanel').classList.contains('on')) toggleAsk(); } catch (e) {}
  try { closeAll(); } catch (e) {}
  try { closeAll(); } catch (e) {}
  try { toggleNav(false); } catch (e) {}
  try { el('toast').classList.remove('on'); } catch (e) {}
  state.layoutEdit = false; state.client = null; state.staffPage = state.staffPage || null;
  if (!DEMO_VIEW && !state.hideSample && window.__qaWasHidden) { state.hideSample = true; try { modeBannerSync(); } catch (e) {} }
  if (!DEMO_VIEW && window.__qaWasHidden === undefined) window.__qaWasHidden = !!state.hideSample;
  document.querySelectorAll('[data-qa]').forEach((n) => n.removeAttribute('data-qa'));
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------------------------------------------------------
// the screens. open(page, ctx) leaves the screen showing; ctx = {role, team, phone, size}.
const ev = (fn, arg) => async (page) => { await page.evaluate(fn, arg); };
const goView = (v) => ev((v) => go(v), v);
const firstClient = () => (visibleClients()[0] || {}).id;
const firstStaff = () => ((typeof visibleStaff === 'function' ? visibleStaff() : STAFF)[0] || {}).id;
const D = ['director'], DS = ['director', 'staff'], DSF = ['director', 'staff', 'family'];
const SCREENS = [
  // ---- the pages in each menu
  ...['home', 'tasks', 'calendar', 'clients', 'team', 'trainhub', 'safety', 'acct', 'templates', 'forms', 'directory', 'changelog', 'messages', 'profile', 'docs'].map((v) => ({
    id: 'page:' + v, roles: v === 'docs' ? ['family'] : ['home', 'calendar', 'messages'].includes(v) ? DSF : ['tasks', 'clients', 'safety', 'acct', 'profile'].includes(v) ? DS : D,
    open: goView(v), core: true,
  })),
  // edit mode on the read-first pages (Edit, ✎ and ✕ buttons show)
  ...['tasks', 'clients', 'team', 'trainhub', 'safety', 'acct', 'templates', 'forms'].map((v) => ({ id: 'edit:' + v, roles: D, open: ev((v) => { go(v); state.layoutEdit = true; render(); el('toast').classList.remove('on'); }, v), core: ['clients', 'templates'].includes(v) })),
  // ---- a client's page, each tab, and edit mode
  ...['overview', 'care', 'appointments', 'documents', 'incidents', 'directory'].map((t) => ({ id: 'client:' + t, roles: DS, open: ev((t) => { go('clients'); const c = visibleClients()[0]; openClient(c.id, t); }, t), core: true })),
  { id: 'client:overview:edit', roles: D, open: ev(() => { go('clients'); openClient(visibleClients()[0].id, 'overview'); state.layoutEdit = true; render(); el('toast').classList.remove('on'); }), core: true },
  { id: 'client:documents:edit', roles: D, open: ev(() => { go('clients'); openClient(visibleClients()[0].id, 'documents'); state.layoutEdit = true; render(); el('toast').classList.remove('on'); }) },
  { id: 'newclient', roles: D, open: ev(() => openClientForm()), core: true },
  // ---- a staff member's page, and edit mode
  { id: 'staffpage', roles: D, open: ev(() => { openStaffPage(visibleStaff()[0].id); }), core: true },
  { id: 'staffpage:edit', roles: D, open: ev(() => { openStaffPage(visibleStaff()[0].id); state.layoutEdit = true; render(); el('toast').classList.remove('on'); }), core: true },
  // ---- the Profile's tabs
  { id: 'profile:onboard', roles: ['staff'], team: true, open: ev(() => { go('profile'); state.profTab = 'onboard'; render(); }), core: true },
  // ---- calendar views and the day plan
  ...['week', 'list'].map((v) => ({ id: 'calendar:' + v, roles: DSF, open: ev((v) => { go('calendar'); cxSetView('calendar', v); }, v), core: v === 'week' })),
  { id: 'acct:list', roles: DS, open: ev(() => { go('acct'); cxSetView('acct', 'list'); }) },
  // ---- Documents: a team binder open, a client's binders, the staff binder
  { id: 'templates:binder', roles: D, open: ev(() => { go('templates'); state.openBinder = 'Agency'; render(); }), core: true },
  // ---- Safety log: a log open, the history
  { id: 'safety:drills', roles: DS, open: ev(() => { go('safety'); logOpen('drills'); }), core: true },
  { id: 'safety:temps', roles: DS, open: ev(() => { go('safety'); logOpen('temps'); }) },
  // ---- Messages with a conversation open
  { id: 'messages:thread', roles: DSF, open: ev(() => { go('messages'); const t = visThreads()[0]; if (t) { state.thread = t.id; render(); const b = document.querySelector('#view .thread-i'); if (b) b.click(); } }), core: true },
  // ---- the menus
  { id: 'menu:additem', roles: DS, open: async (page) => { await page.evaluate(() => go('calendar')); await page.locator('#view .cx-add-b').first().click(); }, core: true },
  { id: 'menu:rm', roles: D, open: async (page) => { await page.evaluate(() => { go('templates'); state.openBinder = 'Agency'; render(); }); const b = page.locator('#view .rm-dot >> visible=true').first(); await b.scrollIntoViewIfNeeded(); await b.click(); }, core: true },
  { id: 'phone:sidebar', roles: DSF, open: async (page, c) => { if (c.size.width > 900) return 'skip'; await page.click('.topbar .hamb'); await page.waitForTimeout(400); }, core: true },
  // ---- the forms Add item opens, and the other windows
  ...['appt', 'event', 'meeting', 'shift', 'rem', 'where'].map((k) => ({ id: 'cx:' + k, roles: k === 'shift' ? D : DS, open: ev((k) => { go('calendar'); cxAdd(k, T, 'calendar'); }, k), core: ['appt', 'shift'].includes(k) })),
  { id: 'win:addstaff', roles: D, open: ev(() => { go('team'); openStaffForm(); }), core: true },
  { id: 'win:assign', roles: DS, open: ev(() => { go('tasks'); openAssign(); }), core: true },
  // a list row's View details window (phones only: list rows are cards there) and a name box that resets its own look
  ...[['clients', DS], ['tasks', D]].map(([v, roles]) => ({ id: 'win:rowdetails:' + v, roles, core: true, open: async (page) => {
    const has = await page.evaluate((v) => { go(v); const b = document.querySelector('#view .mc-go'); if (b) b.click(); return !!b; }, v);
    if (!has) return 'skip';
  } })),
  { id: 'win:newcategory', roles: D, open: ev(() => { go('directory'); dirCatNew(); }), core: true },
  { id: 'win:task', roles: DS, open: ev(() => { go('tasks'); const t = myTasks().find((x) => x.stage !== 'Done') || myTasks()[0]; openTask(t.id); }), core: true },
  { id: 'win:appt', roles: DSF, open: ev(() => { go('calendar'); const a = APPTS.filter((x) => !x.cancelled && visibleClients().some((c) => c.id === x.cid))[0]; openAppt(a.id); }), core: true },
  { id: 'win:incident', roles: DS, open: ev(() => { go('clients'); openIncidentForm(visibleClients()[0].id); }), core: true },
  { id: 'win:shift', roles: D, open: ev(() => { go('team'); openShiftForm(); }) },
  { id: 'win:upload:blank', roles: D, open: ev(() => { go('forms'); ovUploadStart('Agency'); }), core: true },
  { id: 'win:upload:done', roles: D, open: ev(() => { go('forms'); ovUploadStart('Agency', 'done'); }), core: true },
  { id: 'win:builder', roles: D, open: ev(() => { go('forms'); openTplEditor(); }), core: true },
  { id: 'win:fill', roles: D, open: ev(() => { go('forms'); const t = TEMPLATES5.find((x) => (x.fields || []).length > 4) || TEMPLATES5[0]; tplOpenDoc(t.id); }), core: true },
  { id: 'win:sign', roles: DS, open: ev(() => { sigOpen('qa', 'Signature of the staff member completing this form'); }), core: true },
  { id: 'win:alerts', roles: DSF, open: ev(() => openAlerts()), core: true },
  { id: 'win:ask', roles: DSF, open: ev(() => { go('home'); toggleAsk(); }), core: true },
  { id: 'win:ask:tasks', roles: DS, open: ev(() => { go('tasks'); toggleAsk(); }), core: true },
  { id: 'win:askhistory', roles: DS, open: ev(() => { toggleAsk(); askHistory(); }) },
  { id: 'win:homecustom', roles: DSF, open: ev(() => { go('home'); hmCustomize(); }), core: true },
  { id: 'win:tour', roles: DSF, open: ev(() => tourStart()), core: true },
  { id: 'win:pilot', roles: DSF, open: ev(() => openPilotAgreement()), core: true },
  { id: 'win:search', roles: DS, open: async (page) => { if (await page.locator('#globalSearch').isVisible()) { await page.fill('#globalSearch', 'Ma'); } else await page.evaluate(() => globalSearchGo('Ma')); await page.waitForTimeout(450); } },
  { id: 'win:help', roles: DSF, open: ev(() => supportCompose()), core: true },
  { id: 'win:settings', roles: DSF, open: ev(() => openSettings()), core: true },
  { id: 'win:pagesettings', roles: D, open: ev(() => { go('calendar'); settingsHub('display', 'calendar'); }) },
  { id: 'win:pagesettings:cal', roles: DS, open: ev(() => { go('calendar'); settingsHub('cal', 'calendar'); }) },
  { id: 'win:pagesettings:edit', roles: D, open: ev(() => { go('tasks'); settingsHub('edit', 'tasks'); }) },
  { id: 'win:notifsettings', roles: D, open: ev(() => notifSettings()), core: true },
  { id: 'win:labels', roles: D, open: ev(() => labelsForm()) },
  { id: 'win:access', roles: D, open: ev(() => { openStaffPage(visibleStaff()[0].id); accessForm(visibleStaff()[0].id); }) },
  { id: 'win:reminder', roles: D, open: ev(() => { openStaffPage(visibleStaff()[0].id); reminderForm(visibleStaff()[0].id); }) },
  { id: 'win:rolepicker', roles: D, demo: true, open: ev(() => showRolePicker()), root: '#login', core: true },
  { id: 'win:vitals', roles: DS, open: ev(() => { go('clients'); openClient(visibleClients()[0].id, 'care'); vitalForm(visibleClients()[0].id); }) },
  { id: 'win:adl', roles: DS, open: ev(() => { go('clients'); openClient(visibleClients()[0].id, 'care'); adlForm(visibleClients()[0].id); }) },
  { id: 'win:goal', roles: DS, open: ev(() => { go('clients'); openClient(visibleClients()[0].id); goalForm(visibleClients()[0].id); }) },
  { id: 'win:note', roles: DS, open: ev(() => { go('clients'); openClient(visibleClients()[0].id); openNoteForm(visibleClients()[0].id); }) },
  { id: 'win:uploaddoc', roles: D, open: ev(() => { go('templates'); uploadDoc(); }) },
  { id: 'win:binder', roles: D, open: ev(() => { go('templates'); binderForm(); }) },
  { id: 'win:dir', roles: D, open: ev(() => { go('directory'); dirForm(); }) },
  { id: 'win:chg', roles: D, open: ev(() => { go('changelog'); chgEntryForm(); }) },
  { id: 'win:training', roles: D, open: ev(() => { go('trainhub'); openTrainingForm(); }) },
  { id: 'win:guide', roles: D, open: ev(() => { go('trainhub'); guideForm(); }) },
  { id: 'win:checklist', roles: D, open: ev(() => { go('trainhub'); obListForm(); }) },
  { id: 'win:inspect', roles: DS, open: ev(() => { go('safety'); const t = INSP_TEMPLATES.filter((x) => x.kind !== 'drill')[0] || INSP_TEMPLATES[0]; startInspection(t.id); }), core: true },
  { id: 'win:drill', roles: DS, open: async (page) => { await page.evaluate(() => go('safety')); await page.locator('#view button:has-text("Log a drill")').first().click(); }, core: true },
  { id: 'win:newthread', roles: DS, open: ev(() => { go('messages'); openNewThread(); }) },
  { id: 'win:protocols', roles: D, open: ev(() => { go('forms'); protoHub(); }) },
  // a real team switched to Demo: the brown banner across the top of every page (with Switch to Development for a director)
  ...['home', 'tasks', 'calendar'].map((v) => ({ id: 'banner:' + v, roles: DS, team: true, core: v === 'home', open: ev((v) => { state.hideSample = false; go(v); modeBannerSync(); }, v) })),
];

// ------------------------------------------------------------------------------------------------------------------
// the faults the Nov 5 QA pass found, fixed in v12.42, each checked on its own. kinds: which audit findings;
// test(f): f has el, screen, role, mode, size, phone.
const KNOWN = [
  { id: 'hdrbtn', sev: 'major', kinds: ['textOver'], label: 'page header buttons show their whole label on a phone or tablet (Templates: "＋ Create new template", "Upload a form"; Documents "＋ Upload document" and Safety log "＋ New log or inspection" in edit mode)',
    test: (f) => /btn/.test(f.el) && !/cal-day|cx-wev|md-f|mdFoot/.test(f.el) && /^(page|edit):/.test(f.screen) },
  { id: 'headact', sev: 'major', kinds: ['wide', 'past'], label: 'above 900 px the Fire drill / Water temperature log toolbar (Select all … Close) wraps under its title instead of running out of its card and making the whole page scroll sideways',
    test: (f) => f.size === '1024x768' && (f.kind === 'wide' || /head-act/.test(f.el)) },
  { id: 'askfab', sev: 'major', kinds: ['covered'], label: 'with Ask Spectrum open, the Customize layout button never sits on its input (Tasks, Safety log, Accountability, Training, Documents, Templates, a staff page)',
    test: (f) => /askInput/.test(f.el) && /layFab/.test(f.by) },
  { id: 'gcalcheck', sev: 'major', kinds: ['bigCheck', 'covered'], label: 'tick boxes in windows keep their size up to 900 px wide ("Also send to Google Calendar" in Add appointment / event / meeting, "Make this editable in-app" in Upload a document), so the words beside them read normally',
    test: (f) => /apGcal|libEditable|np_/.test(f.el) || (f.kind === 'covered' && /checkrow/.test(f.el) && /Google Calendar/.test(f.el)) },
  { id: 'builderland', sev: 'major', kinds: ['covered', 'offscreen'], label: 'Create new template on a phone held sideways (844 x 390): the toolbars scroll away with the form, so the form can be seen and edited',
    test: (f) => f.screen === 'win:builder' && f.size === '844x390' },
  { id: 'weekstrip', sev: 'major', kinds: ['covered', 'textOver'], label: 'a client\'s Appointments tab: the arrows and the date button share one row and the seven days the next, so at every width the days have room and the › arrow can be tapped',
    test: (f) => f.screen === 'client:appointments' && /cal-nav|cal-day/.test(f.el) },
  { id: 'adlbtn', sev: 'minor', kinds: ['covered'], label: 'a client\'s Care tab at 1024 wide: "＋ Log an activity" stays inside its card',
    test: (f) => f.screen === 'client:care' && /Log an activity/.test(f.el) },
  { id: 'weekview', sev: 'minor', kinds: ['textOver', 'wrap', 'textHit'], label: 'the Calendar\'s Week view at 1024 wide: each event\'s time and title stay inside its box, one line each, cut short with an ellipsis',
    test: (f) => /cx-wev/.test(f.el || f.a + ' ' + f.b) },
  { id: 'staffsub', sev: 'minor', kinds: ['split'], label: 'a staff page\'s header line ("role · house · hired … · full staff file") wraps as a whole, never as two columns side by side',
    test: (f) => /^staffpage/.test(f.screen) && /div\.sub/.test(f.el) },
  { id: 'binderpills', sev: 'cosmetic', kinds: ['wrap', 'split'], label: 'an open Documents binder: the "Forms that file here" boxes wrap their words inside them, and "All templates" stays on one line',
    test: (f) => f.screen === 'templates:binder' && /pill|All templates/.test(f.el) },
  { id: 'onbpreview', sev: 'minor', kinds: ['cardScroll', 'clipText'], label: 'the setup questions at 1024 wide with a long team name: the workspace preview cuts the greeting short and the setup screen never scrolls sideways',
    test: (f) => /^onb:/.test(f.screen) },
  { id: 'staffcourse', sev: 'minor', kinds: ['clipText'], label: 'a staff page at 320 wide: a training row puts "Unassign" under the course instead of off the edge of the card',
    test: (f) => /^staffpage/.test(f.screen) && /Unassign/.test(f.el) },
  { id: 'cardscroll', sev: 'minor', kinds: ['cardScroll'], label: 'on a phone, two-column tables and list cards fit their card instead of scrolling sideways inside it (Profile: About, Preferences, credentials; a staff page\'s certifications; Tasks by staff member; the staff roster; a message with a long word)',
    test: () => true },
  { id: 'sheet', sev: 'minor', kinds: ['sheetOverlap'], label: 'a long window on a phone: only its body scrolls, between a header and a footer that stay put, so the last field is never under Save / Cancel',
    test: () => true },
  { id: 'profilehero', sev: 'minor', kinds: ['clipText', 'split'], label: 'the Profile page header on a phone: "⚙ Settings" drops under the name instead of off the edge of its card',
    test: (f) => /profile/.test(f.screen) },
  { id: 'select', sev: 'cosmetic', kinds: ['selectCut'], label: 'pick lists with a long choice end it in an ellipsis (staff "name — role" in Add a shift, New message To, Assign task, Send reminder; long house, program and team calendar names)',
    test: () => true },
  { id: 'placeholder', sev: 'cosmetic', kinds: ['inputCut'], label: 'placeholders that do not fit end in an ellipsis (the top bar search on every page, the client note box, IPP goal, Where were they, event title, vitals and others)',
    test: () => true },
  { id: 'wrap', sev: 'cosmetic', kinds: ['wrap', 'split'], label: 'button, tab and pill labels never break one word per line ("Last week", "Last month", "＋ Add item ▾", "November 2026 ▾", "Print preview"; the sidebar\'s This week counts, task status and date pills, "＋ Add website", "Training & onboarding")',
    test: () => true },
  { id: 'editfab', sev: 'minor', kinds: ['covered'], label: 'edit mode at 1024 wide: the "Add a section" tile at the bottom of the page scrolls clear of the floating Reset layout and Done buttons',
    test: (f) => /add-sec-tile/.test(f.el) && /layFab/.test(f.by) },
  { id: 'tap', sev: 'minor', kinds: ['small'], label: 'on a phone, tap targets are at least 32 x 32 px (the ✕ that closes a window, task tick boxes, the day plan\'s "Open" and "Staff" links, the calendar legend and type chips, checklist boxes, the top bar search field, the template builder\'s controls and more)',
    test: () => true },
];

// ------------------------------------------------------------------------------------------------------------------
// the made-up team: long names everywhere, so whatever does not fit shows
const LONG = {
  org: 'Westbrook Community Residential Supports Cooperative',
  dir: { email: 'ines@westbrook.test', pw: 'westbrook-pass-1', name: 'Inés Castellanos-Whitfield', title: 'Executive Director of Residential Programs' },
  stf: { email: 'max@westbrook.test', pw: 'westbrook-pass-2', name: 'Maximiliana Featherstonehaugh-Abernathy', title: 'Direct Support Professional' },   // 40 characters
  homes: ['Sycamore Ridge Residential Care Home (North Wing)', 'Lakeview Supported Living Apartments, Unit 12B'],
  programs: ['Intensive Supported Living Services with Behavioral Support', 'Adult Day Program'],
  doc: 'Individual Program Plan quarterly review, signed by guardian and case manager',          // 76 characters
  task: 'Schedule the annual physical, the dental cleaning and the vision check before the IPP',
  appt: 'Comprehensive neuropsychological re-evaluation with the regional center psychologist',
};
async function seedTeam(B, org, stfLoginEmail) {
  const iso = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const prog = (key, value) => { const i = B.program.findIndex((r) => r.org_id === org && r.key === key); const r = { org_id: org, key, value, updated_at: new Date().toISOString() }; if (i >= 0) B.program[i] = r; else B.program.push(r); };
  prog('homes', { list: LONG.homes });
  prog('clienttypes', { list: LONG.programs });
  const steps = [{ t: 'Complete the HIPAA privacy and confidentiality training module in the learning portal', link: 'https://example.org/hipaa', note: 'About 45 minutes; print the certificate and hand it to your house lead' }, { t: 'Shadow two overnight awake shifts', link: '', note: '' }, { t: 'Read the medication administration policy', link: '', note: '' }];
  prog('onboard', { master: steps, assign: { s1762300000200: steps.map((x, i) => Object.assign({ list: '', d: i === 1 ? 1 : 0 }, x)) } });
  const add = (t, row) => { B.rows(t).push(Object.assign({ org_id: org, created_at: new Date().toISOString() }, row)); return row; };
  const C = ['7350214', '7350215', '7350216'].map((uci, i) => add('np_demo_clients', { id: 'c176230000010' + i, uci, name: 'Client ' + uci, init: '#' + uci.slice(-2), home: LONG.homes[i % 2], age: 41, since: iso(-400), guardian: 'Public guardian, County Office of the Public Guardian and Conservator', tag: '', dx: LONG.programs[0], alerts: ['Severe latex allergy: no latex gloves or balloons', 'Seizure plan on file, call 911 after five minutes'], support: 'Likes a written plan for the day, posted on the fridge, with pictures.', goals: [{ t: 'Prepare a simple breakfast on their own three mornings a week', n: [] }] }));
  const S = [
    add('np_demo_staff', { id: 's1762300000200', name: LONG.stf.name, init: 'M.F.', role: 'Direct Support Professional, Overnight Awake Shift Lead', home: LONG.homes[0], hired: iso(-30), email: stfLoginEmail }),
    add('np_demo_staff', { id: 's1762300000201', name: 'Bartholomew Okonkwo-Vandenberghe Jr.', init: 'B.O.', role: 'Licensed Vocational Nurse', home: LONG.homes[1], hired: iso(-300), email: 'bart@westbrook.test' }),
  ];
  add('np_demo_tasks', { id: 't1762300000300', title: LONG.task, sid: 's1762300000200', cid: 'c1762300000100', due: iso(1), stage: 'In progress', pri: 'High', category: 'Health and medical appointments' });
  add('np_demo_tasks', { id: 't1762300000301', title: 'Restock the first-aid kit in the van and log the expiration dates', sid: 's1762300000201', cid: null, due: iso(-2), stage: 'Not started', pri: 'Medium', category: 'Agency' });
  add('np_demo_appointments', { id: 'a1762300000400', cid: 'c1762300000100', title: LONG.appt, type: 'Medical', appt_date: iso(0), appt_time: '14:30', dur: 90, provider: 'Dr. Alexandra Montgomery-Fitzgerald, PhD', loc: 'Regional Center Behavioral Health Clinic, 2200 Sycamore Ridge Parkway, Suite 410', flag: 'Bring the medication list and the last two quarterly reports', ride: 'Agency van' });
  add('np_demo_appointments', { id: 'a1762300000401', cid: 'c1762300000101', title: 'Dental cleaning and X-rays', type: 'Dental', appt_date: iso(2), appt_time: '09:00', dur: 60, provider: 'Bayside Family Dentistry', loc: 'Bayside Dental, Suite 200' });
  add('np_demo_incidents', { id: 'i1762300000500', cid: 'c1762300000100', type: 'Unplanned hospitalization or emergency room visit', inc_date: iso(-1), inc_time: '21:40', sev: 'High', status: 'Open', reported_by: LONG.stf.name, summary: 'Taken to the emergency room after a fall in the bathroom; stitches, back home the same night.', notified: [], recips: [], hours_left: 20 });
  add('np_demo_shifts', { staff_id: 's1762300000200', start_time: '00:00', end_time: '23:59', home: LONG.homes[0], shift_date: iso(0) });
  add('np_demo_shifts', { staff_id: 's1762300000201', start_time: '07:00', end_time: '15:30', home: LONG.homes[1], shift_date: iso(0) });
  add('np_demo_credentials', { sid: 's1762300000200', cred_name: 'Cardiopulmonary resuscitation and first aid (adult and pediatric)', expires_on: iso(20), label: '', status: '', doc: null });
  add('np_demo_documents', { cid: 'c1762300000100', n: LONG.doc, cat: 'Completed form', uploaded_by: 'I.C.', doc_date: iso(-3), size: '84 KB', sub_binder: null });
  add('np_demo_documents', { cid: null, n: 'Emergency evacuation plan and floor map for the Sycamore Ridge north wing', cat: 'Completed — Agency', uploaded_by: 'I.C.', doc_date: iso(-5), size: '1.2 MB', sub_binder: null });
  add('np_demo_client_notes', { cid: 'c1762300000100', note: 'Prefers the 3pm slot for appointments; anxious in waiting rooms, bring the noise-cancelling headphones.', noted_by: LONG.dir.name });
  const th = add('np_demo_threads', { id: 'th1762300000600', who: LONG.stf.name, subject: 'Question about the neuropsychological re-evaluation paperwork and the ride', role: 'Staff', last_msg: 'Can you confirm the van is booked?', unread: 1, from_email: stfLoginEmail, from_name: LONG.stf.name, to_kind: 'staff', to_ref: null });
  add('np_demo_messages', { thread_id: th.id, author: LONG.stf.name, author_email: stfLoginEmail, role: 'staff', body: 'Can you confirm the van is booked for the re-evaluation at 2:30, and who is bringing the medication list? Supercalifragilisticexpialidocious-length-word-with-no-spaces-at-all-to-break-on.', is_me: false });
  return { C, S };
}

// ------------------------------------------------------------------------------------------------------------------
(async () => {
  const env = await H.start(process.argv[2]);
  const t0 = Date.now();
  const errors = [];
  const results = [];                                                  // {screen, role, mode, size, r}
  const notes = [];
  const codeText = [];                                                 // screens showing code or broken text
  const rowLabels = [];                                                // the labels in a list row's View details window
  // text a person should never see: a code comment or a template placeholder that leaked into the page, or a value
  // that was never filled in
  const CODE_TEXT = /\/\*|\*\/|\$\{|\bundefined\b|\[object Object\]|\bNaN\b|\bnull\b/;
  const origCtx = env.browser.newContext.bind(env.browser);
  let ctxOpts = {};
  env.browser.newContext = (o) => origCtx(Object.assign({}, o, ctxOpts));
  const sizeOpts = (k) => { const s = SIZES[k]; return { viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1, isMobile: !!s.phone, hasTouch: !!(s.phone || s.touch) }; };
  const shot = async (page, file, qas) => {
    if (!SHOTS) return '';
    const f = path.join(SHOTS, file.replace(/[^\w.-]+/g, '_') + '.png');
    await page.evaluate((qas) => { const n = qas.length && document.querySelector('[data-qa="' + qas[0] + '"]'); if (n) n.scrollIntoView({ block: 'center', behavior: 'instant' });
      qas.forEach((q) => { const m = document.querySelector('[data-qa="' + q + '"]'); if (m) { m.dataset.qaOutline = m.style.outline; m.style.outline = '2px solid #f00'; m.style.outlineOffset = '-1px'; } }); }, qas).catch(() => {});
    await page.screenshot({ path: f }).catch(() => {});
    await page.evaluate(() => document.querySelectorAll('[data-qa-outline]').forEach((m) => { m.style.outline = m.dataset.qaOutline; m.removeAttribute('data-qa-outline'); })).catch(() => {});
    return f;
  };

  async function review(page, name, root) {
    const f = (x) => path.join(REVIEW, name.replace(/[^\w.-]+/g, '_') + '-' + x + '.png');
    await page.evaluate(() => document.querySelectorAll('[data-qa]').forEach((n) => n.removeAttribute('data-qa')));
    await page.screenshot({ path: f('a') }).catch(() => {});
    const more = await page.evaluate((root) => {
      const r = root ? document.querySelector(root) : document.body; let moved = false;
      [document.scrollingElement, ...(r && r !== document.body ? [r] : []), ...(r ? r.querySelectorAll('*') : [])].forEach((n) => { if (n.scrollHeight > n.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(n).overflowY) || n === document.scrollingElement && n.scrollHeight > innerHeight + 4) { n.scrollTop = 1e6; moved = true; } });
      return moved;
    }, root).catch(() => false);
    if (more) { await page.waitForTimeout(80); await page.screenshot({ path: f('b') }).catch(() => {}); }
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  }

  async function runScreens(page, mode, role, k) {
    const size = SIZES[k];
    for (const s of SCREENS) {
      if (!s.roles.includes(role)) continue;
      if (s.team && mode !== 'team') continue;
      if (s.demo && mode !== 'demo') continue;
      if (!FULL && !s.core) continue;
      if (ONLY && !ONLY.test(s.id)) continue;
      try {
        await page.evaluate(resetPage);
        const res = await s.open(page, { role, mode, size, phone: size.phone });
        if (res === 'skip') continue;
        await page.waitForTimeout(250);
      } catch (e) { notes.push(`${mode}/${role}/${sizeName(k)} ${s.id}: could not open (${String(e.message || e).split('\n')[0].slice(0, 160)})`); continue; }
      await auditNow(page, s.id, mode, role, k, s.root);
    }
  }
  // audits what is on screen now and keeps the result
  async function auditNow(page, screen, mode, role, k, root) {
    const size = SIZES[k];
    let r;
    try {
      // let windows and drawers finish sliding in (a drawer half way in is not a fault); never wait on endless animations
      await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1500))]));
      const top = root ? { root } : await page.evaluate(topLayer);
      r = await page.evaluate(audit, { root: top.root, phone: size.phone, inFixed: !!top.root, noScroll: !!top.noScroll });
      r.root = top.root;
    } catch (e) { notes.push(`${mode}/${role}/${sizeName(k)} ${screen}: could not audit (${String(e.message || e).split('\n')[0].slice(0, 160)})`); return null; }
    const item = { screen, role, mode, size: sizeName(k), k, r };
    results.push(item);
    const shown = await page.evaluate(([src, root]) => {
      const re = new RegExp(src);
      const box = (root && document.querySelector(root)) || document.body;
      const out = [];
      for (const line of (box.innerText || '').split('\n')) { if (re.test(line)) out.push(line.trim().slice(0, 90)); }
      for (const f of box.querySelectorAll('input:not([type=hidden]),textarea,select')) {
        const v = f.tagName === 'SELECT' ? ((f.selectedOptions[0] || {}).text || '') : (f.placeholder || '');
        if (f.getClientRects().length && re.test(v)) out.push((f.id || f.tagName) + ': ' + v.slice(0, 60));
      }
      return out.slice(0, 3);
    }, [CODE_TEXT.source, root || null]).catch(() => []);
    if (shown.length) codeText.push(`${mode}/${role}/${sizeName(k)} ${screen}: ${shown.join(' / ')}`);
    if (/^win:rowdetails/.test(screen)) rowLabels.push(...(await page.evaluate(() => [...document.querySelectorAll('#mdBody .mrow .mk')].map((m) => m.textContent.trim())).catch(() => [])).map((l) => ({ l, at: `${mode}/${role}/${sizeName(k)} ${screen}` })));
    if (REVIEW) await review(page, `${mode}-${role}-${sizeName(k)}-${screen}`, r.root);
    const flagged = [...r.past, ...r.textOver, ...r.covered, ...r.offscreen, ...r.wrap, ...r.textHit, ...r.selectCut, ...r.inputCut, ...r.split, ...r.bigCheck, ...r.clipText, ...r.cardScroll, ...r.sheetOverlap].map((x) => x.qa);
    if (flagged.length && SHOTS) item.shot = await shot(page, `${mode}-${role}-${sizeName(k)}-${screen}`, flagged);
    return item;
  }
  const booted = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('np-boot'), null, { timeout: 20000 });
  const inApp = (page) => page.waitForFunction(() => el('app').classList.contains('on') && typeof state !== 'undefined' && state.role, null, { timeout: 25000 });
  async function signPilot(page, who) {
    if (!(await page.locator('#pgAccept').count())) return false;
    if (await page.locator('#pgAgency').isVisible()) await page.fill('#pgAgency', who.org || '');
    await page.fill('#pgName', who.name); await page.fill('#pgTitle', who.title || 'Staff');
    await page.check('#pgAccept'); await page.locator('#modal button:has-text("Continue")').click();
    await page.waitForFunction(() => !window._gateLock && !el('modal').classList.contains('on'), null, { timeout: 10000 }).catch(() => {});
    return true;
  }
  async function signUp(page, who, k, audits) {
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    if (audits) await auditNow(page, 'login:signin', 'login', '-', k, '#login');
    await page.click('text=Get your team started');
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'regOrg');   // the form puts the cursor in Team name a moment after it opens
    if (audits) await auditNow(page, 'login:newteam', 'login', '-', k, '#login');
    await page.fill('#regOrg', who.org); await page.fill('#regName', who.name); await page.fill('#regRole', who.title);
    await page.fill('#liEmail', who.email); await page.fill('#liPw', who.pw);
    await page.click('#liGo');
    await page.waitForFunction(() => el('onbRoot') && el('onbRoot').classList.contains('on'), null, { timeout: 25000 });
    for (let i = 0; i < 8; i++) {
      if (!(await page.evaluate(() => el('onbRoot').classList.contains('on')))) break;
      await page.waitForTimeout(250);
      if (audits) await auditNow(page, 'onb:step' + (i + 1), 'login', '-', k, '#onbRoot');
      await page.locator('#onbRoot .opt >> visible=true').first().click().catch(() => {});
      await page.locator('#onbRoot #next').click(); await page.waitForTimeout(350);
    }
    await inApp(page); await page.waitForTimeout(1200);
    if (audits) await auditNow(page, 'gate:pilot', 'login', '-', k, '#modal');
    await signPilot(page, who);
  }
  async function signInAs(page, who) {
    await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
    if (!(await page.evaluate(() => el('app').classList.contains('on')))) {
      await page.fill('#liEmail', who.email); await page.fill('#liPw', who.pw); await page.click('#liGo');
      await inApp(page);
    }
    await page.waitForTimeout(1500);
    await signPilot(page, who);
  }

  // ---------------- the demo view, each role, each width ----------------
  for (const k of MODES.includes('demo') ? WIDTHS : []) {
    for (const role of ['director', 'staff', 'family'].filter((r) => ROLES.includes(r))) {
      ctxOpts = sizeOpts(k);
      const { ctx, page } = await H.newPage(env, { bucket: errors });
      page.on('dialog', (d) => d.dismiss().catch(() => {}));
      await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
      await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 20000 });
      if (role !== 'director') { await page.evaluate((r) => signIn(r), role); await page.waitForFunction((r) => state.role === r, role); }
      await page.waitForTimeout(300);
      await runScreens(page, 'demo', role, k);
      await ctx.close();
      console.log(`  demo ${role} ${sizeName(k)} done (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }

  // ---------------- QA_FULL: a crawl that opens what each page's buttons open, and audits every new window ----------------
  async function crawl(page, role, k) {
    const pages = await page.evaluate((role) => [...NAV[role].filter((n) => n.id).map((n) => n.id), 'messages', 'profile'], role);
    const targets = pages.map((v) => ({ id: v, v })).concat(role === 'family' ? [] : ['overview', 'care', 'appointments', 'documents', 'incidents', 'directory'].map((t) => ({ id: 'client:' + t, t }))).concat(role === 'director' ? [{ id: 'staffpage', sp: true }, { id: 'templates:binder', binder: true }] : []);
    const seen = new Set();
    const openTarget = (tg) => page.evaluate((tg) => { if (tg.v) go(tg.v); else if (tg.t) { go('clients'); openClient(visibleClients()[0].id, tg.t); } else if (tg.sp) openStaffPage(visibleStaff()[0].id); else if (tg.binder) { go('templates'); state.openBinder = 'Agency'; render(); } }, tg);
    const BAD = /delete|remove|erase|sign ?out|start over|restore|reset|clear|archive|print|export|disconnect|log out|unassign|cancel appointment|mark done|mark complete|sign off|acknowledge|re-open|complete/i;
    const BADFN = /del|remove|signOut|startFresh|erase|reset|print|export|exportOne|gcal|window\.open|location|go\(|navBack|openClient|openStaffPage|state\.tab|cxSetView|cxPick|cxStep|cxMon|cxToday|setStage|toggle|logPick|tblSort|filter|catPick|t_unread|state\.thread|signIn|pageEdit|sigUse|obToggle|wkToggle|courseToggle|calToggle/;
    for (const tg of targets) {
      await page.evaluate(resetPage); await openTarget(tg); await page.waitForTimeout(200);
      const list = await page.evaluate(([bad, badfn]) => [...document.querySelectorAll('#view button, #view [onclick]')].filter((b) => b.getClientRects().length && getComputedStyle(b).visibility === 'visible')
        .map((b, i) => ({ i, t: (b.innerText || b.title || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60), f: b.getAttribute('onclick') || '' }))
        .filter((b) => !new RegExp(bad, 'i').test(b.t) && !new RegExp(badfn).test(b.f) && b.t), [BAD.source, BADFN.source]);
      for (const b of list.slice(0, 60)) {
        const sig = tg.id + '|' + b.t;
        if (seen.has(sig)) continue; seen.add(sig);
        await page.evaluate(resetPage); await openTarget(tg); await page.waitForTimeout(120);
        const ok = await page.evaluate((b) => { const n = [...document.querySelectorAll('#view button, #view [onclick]')].filter((x) => x.getClientRects().length && getComputedStyle(x).visibility === 'visible')
          .find((x) => (x.innerText || x.title || x.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60) === b.t && (x.getAttribute('onclick') || '') === b.f); if (!n) return false; n.click(); return true; }, b).catch(() => false);
        if (!ok) continue;
        await page.waitForTimeout(300);
        const top = await page.evaluate(topLayer).catch(() => ({ root: null }));
        if (!top.root || top.root === '#sidebar') continue;
        const title = await page.evaluate((root) => { const n = document.querySelector(root); const h = n && n.querySelector('#mdTitle,#drTitle,h2,h3,b'); return (root + ' ' + (h ? h.textContent : '')).replace(/\s+/g, ' ').trim().slice(0, 80); }, top.root).catch(() => top.root);
        if (seen.has('w|' + title)) continue; seen.add('w|' + title);
        await auditNow(page, 'crawl:' + tg.id + ' > ' + b.t + ' [' + title + ']', 'demo', role, k);
      }
    }
  }
  if (FULL && MODES.includes('demo') && !ONLY) {
    for (const k of (process.env.QA_CRAWL || '390,320,768').split(',')) {
      for (const role of ['director', 'staff', 'family']) {
        ctxOpts = sizeOpts(k);
        const { ctx, page } = await H.newPage(env, { bucket: errors });
        page.on('dialog', (d) => d.dismiss().catch(() => {}));
        await page.goto(env.BASE + '/portal.html?demo=1', { waitUntil: 'load' });
        await page.waitForFunction(() => typeof state !== 'undefined' && el('app').classList.contains('on'), null, { timeout: 20000 });
        if (role !== 'director') { await page.evaluate((r) => signIn(r), role); await page.waitForFunction((r) => state.role === r, role); }
        await page.waitForTimeout(300);
        try { await crawl(page, role, k); } catch (e) { notes.push(`crawl/${role}/${sizeName(k)}: ${String(e.message || e).split('\n')[0].slice(0, 200)}`); }
        await ctx.close();
        console.log(`  crawl ${role} ${sizeName(k)} done (${Math.round((Date.now() - t0) / 1000)} s)`);
      }
    }
  }

  // ---------------- signed in to a team with long names: director and staff, each width; the sign-in screens ----------------
  const B = makeBackend({});
  ctxOpts = sizeOpts('1024');
  {
    const { ctx, page } = await H.newPage(env, { rest: B.rest, bucket: errors });
    await B.route(ctx); page.on('dialog', (d) => d.accept().catch(() => {}));
    await signUp(page, { org: LONG.org, name: LONG.dir.name, title: LONG.dir.title, email: LONG.dir.email, pw: LONG.dir.pw }, null, false);
    await ctx.close();
  }
  const org = B.myOrg(LONG.dir.email);
  B.addUser(LONG.stf.email, LONG.stf.pw, org, 'staff');
  await seedTeam(B, org, LONG.stf.email);
  B.rows('np_demo_invites').push({ org_id: org, token: 'qa-long-invite', email: 'new.hire@westbrook.test', name: 'Persephone Wolfeschlegelsteinhausen', sid: 's1762300000201', role_title: 'Overnight Awake Direct Support Professional', access: 'staff' });
  for (const k of WIDTHS) {
    for (const role of MODES.includes('team') ? ['director', 'staff'].filter((r) => ROLES.includes(r)) : []) {
      if (ONLY && !SCREENS.some((s) => ONLY.test(s.id))) break;
      ctxOpts = sizeOpts(k);
      const { ctx, page } = await H.newPage(env, { rest: B.rest, bucket: errors });
      await B.route(ctx); page.on('dialog', (d) => d.dismiss().catch(() => {}));
      try {
        await signInAs(page, role === 'director' ? { email: LONG.dir.email, pw: LONG.dir.pw, name: LONG.dir.name, title: LONG.dir.title, org: LONG.org } : { email: LONG.stf.email, pw: LONG.stf.pw, name: LONG.stf.name, title: LONG.stf.title });
        const who = await page.evaluate((t) => ({ role: state.role, clients: visibleClients().length, appt: APPTS.some((a) => a.title === t), seen: (typeof visAppts === 'function' ? visAppts() : APPTS).map((a) => a.title).length }), LONG.appt);
        if (who.role !== role || !who.clients || !who.appt) notes.push(`team/${role}/${sizeName(k)}: signed in as ${JSON.stringify(who)}`);
        await runScreens(page, 'team', role, k);
      } catch (e) { notes.push(`team/${role}/${sizeName(k)}: ${String(e.message || e).split('\n')[0].slice(0, 200)}`); }
      await ctx.close();
      console.log(`  team ${role} ${sizeName(k)} done (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
    // the sign-in screens, a new team's setup questions and the pilot agreement it opens on
    if (MODES.includes('login') && (!ONLY || ONLY.test('login'))) {
      ctxOpts = sizeOpts(k);
      const { ctx, page } = await H.newPage(env, { rest: B.rest, bucket: errors });
      await B.route(ctx); page.on('dialog', (d) => d.dismiss().catch(() => {}));
      try {
        await signUp(page, { org: 'Northfield Integrated Behavioral and Residential Services', name: 'Gwendolyn Abernathy-Okafor', title: 'Chief Executive Officer and Program Administrator', email: `new.${k}@northfield.test`, pw: 'northfield-pass-1' }, k, true);
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        await page.goto(env.BASE + '/portal.html?join=qa-long-invite', { waitUntil: 'load' }); await booted(page);
        await page.waitForFunction(() => /Join/.test((el('loginTitle') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
        await auditNow(page, 'login:join', 'login', '-', k, '#login');
        await page.goto(env.BASE + '/portal.html', { waitUntil: 'load' }); await booted(page);
        await page.click('#liForgotWrap'); await page.waitForTimeout(300);
        await auditNow(page, 'login:forgot', 'login', '-', k, '#login');
      } catch (e) { notes.push(`login/${sizeName(k)}: ${String(e.message || e).split('\n')[0].slice(0, 200)}`); }
      await ctx.close();
      console.log(`  login ${sizeName(k)} done (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }

  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ results, notes }, null, 1));

  // ---------------- the verdict: each fault the Nov 5 pass found under its own check, everything else under the general ones ----------------
  const all = [];
  for (const it of results) {
    const where = { screen: it.screen, role: it.role, mode: it.mode, size: it.size, k: it.k, phone: SIZES[it.k].phone };
    if (it.r.sw > it.r.w + 1) all.push(Object.assign({ kind: 'wide', el: 'page ' + it.r.sw + 'px wide in ' + it.r.w }, where));
    for (const kd of ['past', 'textOver', 'covered', 'offscreen', 'wrap', 'textHit', 'selectCut', 'inputCut', 'split', 'bigCheck', 'clipText', 'cardScroll', 'sheetOverlap', 'small']) for (const x of it.r[kd]) all.push(Object.assign({ kind: kd }, x, where));
  }
  const left = new Set(all);
  const at = (f) => `${f.mode}/${f.role}/${f.size} ${f.screen}`;
  const brief = (fs) => { const by = new Map(); fs.forEach((f) => { const k = f.el || f.a; const a = by.get(k) || []; a.push(f); by.set(k, a); }); return [...by].slice(0, 6).map(([k, a]) => `${k} (${a.length}x: ${[...new Set(a.map(at))].slice(0, 3).join('; ')})`).join(' || '); };
  for (const b of KNOWN) {
    const hit = all.filter((f) => left.has(f) && b.kinds.includes(f.kind) && b.test(f));
    hit.forEach((f) => left.delete(f));
    const looked = results.some((it) => !b.screens || b.screens.test(it.screen));
    check(b.label, looked && !hit.length, hit.length ? hit.length + ' found: ' + brief(hit) : looked ? '' : 'its screens were not checked in this run');
  }
  const KIND = { wide: 'no screen scrolls sideways', past: 'nothing sticks out past the edge of the window', textOver: 'no text overflows its own button, pill, tab, label or heading', covered: 'nothing is drawn over a control at its best scroll place (fixed bars, floating buttons, footers included)', offscreen: 'every control can be scrolled onto the screen', wrap: 'no button or tab label wraps to three lines or one word per line', textHit: 'no text runs over other text or a field', selectCut: 'no pick list cuts off the choice it shows', inputCut: 'no field cuts off its placeholder or its date and time', split: 'no sentence is split into side-by-side columns', bigCheck: 'no tick box is stretched across its row', clipText: 'no words are cut off by the box they sit in (with no ellipsis)', cardScroll: 'no card, list or message is wider than its box (only tab strips and real tables scroll sideways)', sheetOverlap: 'no window body runs on under its pinned footer' };
  for (const kd of Object.keys(KIND)) {
    const rest = all.filter((f) => left.has(f) && f.kind === kd);
    check(`every screen at every width: ${KIND[kd]}`, !rest.length, rest.length + ' found: ' + brief(rest));
  }
  const smallLeft = all.filter((f) => left.has(f) && f.kind === 'small');
  check('on a phone, tap targets are at least 32 x 32 px (anything the check above does not cover)', !smallLeft.length, smallLeft.length + ' found: ' + brief(smallLeft));
  const sc = new Map(); results.forEach((it) => it.r.scrollers.forEach((x) => { const k = it.screen + ': ' + x.el.replace(/"[^"]*"/, '').trim(); sc.set(k, (sc.get(k) || 0) + 1); }));
  console.log('\nScreens that rely on a box that scrolls sideways (fine, listed for the record):\n  ' + [...sc.keys()].slice(0, 80).join('\n  '));
  const scr = new Set(results.map((it) => it.mode + '/' + it.role + '/' + it.screen));
  console.log(`\nChecked ${results.length} screens x widths (${scr.size} screens across roles and modes, widths ${WIDTHS.map(sizeName).join(', ')}).`);
  check('every screen opened (none left out because it could not be opened)', !notes.length, notes.slice(0, 8).join(' | '));
  const badRow = rowLabels.filter((x) => !x.l || /[↕↑↓▲▼⇅]/.test(x.l));
  check('a list row\'s View details window names each line without the table\'s sort arrows, and has no line for the row\'s ›', rowLabels.length && !badRow.length, rowLabels.length ? badRow.slice(0, 4).map((x) => `${x.at}: "${x.l}"`).join(' | ') : 'the window was not opened (phone widths only)');
  check('no screen shows code or broken text (a code comment, ${…}, undefined, null, NaN, [object Object])', !codeText.length, codeText.length + ' found: ' + codeText.slice(0, 6).join(' | '));
  console.log('notes:\n  ' + notes.join('\n  '));
  check('no page errors in the whole run', !errors.length, errors.slice(0, 5).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed (${Math.round((Date.now() - t0) / 1000)} s)`);
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  await env.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
