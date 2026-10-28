// The AI panel's side of the "Site Builder · AI" n8n workflow (POST /webhook/site-builder-ai).
// The builder tells the AI which blocks exist (the catalog, written from the Puck config, so a new
// block or option reaches the AI with no change in n8n) and sends the page as it is now. Claude
// answers with the page's sections in order, each kept, edited or added:
//   { summary, root: {changed settings}, sections: [{keep: id} | {edit: id, props} | {add: type, props}] }
// Nothing from the answer reaches the page unchecked: only known blocks, fields and options, text
// lengths capped, HTML cut down to a few safe tags, and no link, email, phone or media address that
// is not in the request or already on the page (those become "#" or are left empty).
import { config } from './blocks.jsx';
import { token, forget } from './auth.js';
import { slugify } from './store.js';

export const AI_HOOK = 'https://n8n.aiparagonconsulting.com/webhook/site-builder-ai';
const WAIT_MS = 150 * 1000;

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- The catalog ---------- */

const ROOT_KEYS = ['title', 'description', 'theme', 'accent', 'font'];

const ABOUT = {
  Navbar: 'The bar across the top: the brand name, up to 6 menu links and one button. Put it first.',
  Hero: 'The big opening section: a headline, a supporting line, up to two buttons and a moving background.',
  ScrollStory:
    'A full-screen scene that stays in place while 1 to 6 short chapters scroll over it. The most cinematic block: use it at most once, after the Hero.',
  Features: 'A title and 2 to 8 cards, each with an icon, a title and a sentence or two. For services, benefits or what is included.',
  Steps: 'A title and 2 to 6 numbered steps. For how it works.',
  Split: 'A heading and a short paragraph beside a visual (a glowing orb, rings or an image), with an optional button.',
  Faq: 'Questions with short answers that open and close.',
  Cta: 'A closing call to action: a headline, one line and one button.',
  Footer: 'The bottom of the page: the brand, a short note, links and small print. Put it last.',
  Heading: 'A heading on its own, between other sections.',
  Text: 'A block of text, between other sections.',
  Button: 'A button on its own.',
  Spacer: 'Empty space between sections.',
};

const WHEN = {
  'Hero.videoUrl': 'only with background "video"',
  'Hero.imageUrl': 'only with background "image"',
  'Hero.imageAlt': 'only with background "image"',
  'ScrollStory.videoUrl': 'only with scene "video"',
  'Split.imageUrl': 'only with visual "image"',
  'Split.imageAlt': 'only with visual "image"',
};

const isLink = (name) => name === 'href' || /Href$/.test(name);
const isMedia = (name) => name === 'videoUrl' || name === 'imageUrl';

function kindOf(name, f) {
  if (f.type === 'select' || f.type === 'radio') {
    return 'one of ' + f.options.map((o) => JSON.stringify(String(o.value)) + (String(o.label).toLowerCase() !== String(o.value).toLowerCase() ? ' (' + o.label + ')' : '')).join(', ');
  }
  if (f.type === 'array') {
    const each = Object.entries(f.arrayFields || {}).map(([k, sf]) => k + ': ' + kindOf(k, sf).replace(/ \([^)]*\)/g, ''));
    return 'list of ' + (f.min ? f.min + ' to ' : 'up to ') + (f.max || 12) + ', each {' + each.join(', ') + '}';
  }
  if (f.type === 'richtext') return 'simple HTML: <p>, <strong>, <em>, <a href>, <ul>, <ol>, <li>';
  if (isLink(name)) return 'link';
  if (isMedia(name)) return 'web address';
  if (name === 'anchor') return 'short lowercase id that menu links point to, like faq';
  return f.type === 'textarea' ? 'text' : 'short text';
}

function fieldLines(type, fields) {
  return Object.entries(fields).map(([name, f]) => {
    const when = WHEN[type + '.' + name];
    return '  ' + name + ' (' + f.label + '): ' + kindOf(name, f) + (when ? ', ' + when : '');
  });
}

let catalogText = '';
export function catalog() {
  if (catalogText) return catalogText;
  const rootFields = {};
  ROOT_KEYS.forEach((k) => {
    rootFields[k] = config.root.fields[k];
  });
  const lines = ['Page settings, in "root":', ...fieldLines('root', rootFields), '', 'Blocks (the first word of each is its type, for "add"):'];
  Object.entries(config.components).forEach(([type, c]) => {
    lines.push(type + ' (' + c.label + '): ' + (ABOUT[type] || ''));
    lines.push(...fieldLines(type, c.fields));
  });
  catalogText = lines.join('\n');
  return catalogText;
}

// The page as the AI reads it: its settings, then each section's id, block type and fields
export function pageForAi(data) {
  const rp = (data && data.root && data.root.props) || {};
  const root = {};
  ROOT_KEYS.forEach((k) => {
    if (rp[k] != null) root[k] = rp[k];
  });
  const sections = ((data && data.content) || []).map((c) => {
    const { id, ...props } = c.props || {};
    return { id, type: c.type, props };
  });
  return { root, sections };
}

/* ---------- Asking ---------- */

export async function askAi({ ask, data, signal }) {
  const auth = await token();
  if (!auth) throw new AiError('signin', 'Sign in to use the AI.');
  const stop = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    stop.abort();
  }, WAIT_MS);
  const onStop = () => stop.abort();
  if (signal) signal.addEventListener('abort', onStop);
  let res;
  let j = null;
  try {
    res = await fetch(AI_HOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth, ask, page: pageForAi(data), catalog: catalog() }),
      signal: stop.signal,
    });
    j = await res.json().catch(() => null);
  } catch (e) {
    if (signal && signal.aborted) throw new AiError('stopped', 'Stopped.');
    if (timedOut) throw new AiError('timeout', 'The AI took too long. Try again, or ask for a smaller change.');
    throw new AiError('network', 'Could not reach the AI. Check the connection and try again.');
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onStop);
  }
  // Stopped while the answer was being read
  if (signal && signal.aborted) throw new AiError('stopped', 'Stopped.');
  if (res.status === 401 || (j && j.code === 'unauthorized')) {
    forget();
    throw new AiError('signin', 'Your sign-in has run out. Sign in again to use the AI.');
  }
  if (res.status === 524 || res.status === 504) throw new AiError('timeout', 'The AI took too long. Try again, or ask for a smaller change.');
  if (j && j.ok === false) throw new AiError(j.code || 'model', String(j.message || 'The AI could not answer just now. Try again in a minute.'));
  if (!res.ok || !j || j.ok !== true) throw new AiError('model', 'The AI could not answer just now. Try again in a minute.');
  return j;
}

/* ---------- Checking the answer ---------- */

const MAX = { text: 200, textarea: 800, richtext: 6000, title: 80, description: 300 };

// Plain words: no tags or entities, dashes as the team writes them (an en dash in a range becomes
// a hyphen, an em dash a comma)
function tidy(s) {
  return String(s)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s*–\s*/g, '-')
    .replace(/\s*—\s*/g, ', ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function phoneRuns(text) {
  return (String(text).match(/\+?\d[\d\s().-]{5,}\d/g) || []).map((r) => r.replace(/\D/g, ''));
}

// A link the AI wrote: on-page and site links pass; a web address, email or phone number only when
// the person gave it or it is already on the page
function safeLink(v, known) {
  const s = String(v || '').trim();
  if (!s || s === '#') return '#';
  if (s.startsWith('#')) return '#' + slugify(s.slice(1));
  if (/^\/(?!\/)/.test(s)) return s.replace(/\s/g, '');
  const low = known.toLowerCase();
  if (/^mailto:/i.test(s)) {
    const addr = s.slice(7).split('?')[0].trim().toLowerCase();
    return addr && low.includes(addr) ? 'mailto:' + addr : '#';
  }
  if (/^tel:/i.test(s)) {
    const d = s.replace(/\D/g, '');
    return d.length >= 7 && phoneRuns(known).some((r) => r.includes(d) || (d.length >= 10 && d.endsWith(r) && r.length >= 10)) ? 'tel:' + s.slice(4).replace(/[^\d+]/g, '') : '#';
  }
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      return host && low.includes(host) ? u.href : '#';
    } catch (e) {
      return '#';
    }
  }
  return '#';
}

// A picture or video address: only one the person gave or the page already has, and only https
function safeMedia(v, known) {
  const s = String(v || '').trim();
  if (!s) return '';
  return /^https:\/\//i.test(s) && known.includes(s) ? s : '';
}

const ALLOWED = { P: 'p', BR: 'br', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', A: 'a', UL: 'ul', OL: 'ol', LI: 'li' };
const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TITLE', 'HEAD']);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Rich text from the AI, cut down to paragraphs, bold, italics, lists and checked links
function safeHtml(html, known) {
  const src = String(html || '');
  if (!/<[a-z]/i.test(src)) {
    return src
      .split(/\n\s*\n/)
      .map((p) => tidy(p))
      .filter(Boolean)
      .map((p) => '<p>' + esc(p) + '</p>')
      .join('');
  }
  const doc = new DOMParser().parseFromString('<body>' + src + '</body>', 'text/html');
  const walk = (node) => {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        out += esc(n.nodeValue.replace(/\s*–\s*/g, '-').replace(/\s*—\s*/g, ', '));
        return;
      }
      if (n.nodeType !== 1 || DROP.has(n.tagName)) return;
      const tag = ALLOWED[n.tagName];
      const inner = walk(n);
      if (!tag) out += inner;
      else if (tag === 'br') out += '<br>';
      else if (tag === 'a') out += '<a href="' + esc(safeLink(n.getAttribute('href'), known)) + '">' + inner + '</a>';
      else out += '<' + tag + '>' + inner + '</' + tag + '>';
    });
    return out;
  };
  let out = walk(doc.body).trim();
  if (out && !/^<(p|ul|ol)>/.test(out)) out = '<p>' + out + '</p>';
  return out.slice(0, MAX.richtext);
}

// One field's value from the AI, checked against the field; undefined means "leave it as it is"
function cleanValue(f, v, name, known, itemIndex) {
  if (!f) return undefined;
  if (f.type === 'select' || f.type === 'radio') {
    const hit = f.options.find((o) => String(o.value) === String(v));
    return hit ? hit.value : undefined;
  }
  if (f.type === 'array') {
    if (!Array.isArray(v)) return undefined;
    const items = v
      .filter(isObj)
      .slice(0, f.max || 12)
      .map((item, i) => {
        const base = typeof f.defaultItemProps === 'function' ? f.defaultItemProps(i) : clone(f.defaultItemProps || {});
        const out = {};
        Object.entries(f.arrayFields || {}).forEach(([k, sf]) => {
          const cv = cleanValue(sf, item[k], k, known, i);
          out[k] = cv !== undefined ? cv : base[k] !== undefined ? base[k] : '';
        });
        return out;
      });
    if (f.min && items.length < f.min) return undefined;
    return items;
  }
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return undefined;
  if (f.type === 'richtext') return safeHtml(v, known);
  if (isLink(name)) return safeLink(v, known);
  if (isMedia(name)) return safeMedia(v, known);
  if (name === 'anchor') return slugify(v).slice(0, 40);
  return tidy(v).slice(0, f.type === 'textarea' ? MAX.textarea : MAX.text);
}

// A choice that needs an address falls back to a built-in look when the address was left out
function fixMedia(section, before) {
  const p = section.props;
  const was = (before && before.props) || {};
  if (section.type === 'Hero') {
    if (p.background === 'video' && !p.videoUrl) p.background = was.background && was.background !== 'video' ? was.background : 'aurora';
    if (p.background === 'image' && !p.imageUrl) p.background = was.background && was.background !== 'image' ? was.background : 'aurora';
  } else if (section.type === 'ScrollStory') {
    if (p.scene === 'video' && !p.videoUrl) p.scene = was.scene && was.scene !== 'video' ? was.scene : 'city';
  } else if (section.type === 'Split') {
    if (p.visual === 'image' && !p.imageUrl) p.visual = was.visual && was.visual !== 'image' ? was.visual : 'orb';
  }
}

function newId(type) {
  const a = new Uint32Array(2);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return type + '-' + a[0].toString(16) + a[1].toString(16).slice(0, 4);
}

function plural(n, one) {
  return n + ' ' + one + (n === 1 ? '' : 's');
}

// Puts the AI's answer on the page as it is now. `before` is the page the AI read: sections added
// to the page while the AI worked are kept at the end, so nothing the person did meanwhile is lost.
// Returns { data, changed, line } or throws when nothing in the answer fits the page.
export function applyAnswer(data, answer, { ask, before } = {}) {
  const content = (data && data.content) || [];
  const read = before || data;
  const known = String(ask || '') + '\n' + JSON.stringify(read || {}) + '\n' + JSON.stringify(data || {});
  const byId = new Map(content.map((c) => [c.props && c.props.id, c]));
  const readIds = new Set(((read && read.content) || []).map((c) => c.props && c.props.id));
  const st = { added: 0, changed: 0, removed: 0, skipped: 0 };

  let next = content.map((c) => clone(c));
  const items = Array.isArray(answer && answer.sections) ? answer.sections.slice(0, 30) : null;
  if (items && items.length) {
    const used = new Set();
    const out = [];
    items.forEach((it) => {
      if (!isObj(it)) {
        st.skipped++;
        return;
      }
      const id = typeof it.keep === 'string' ? it.keep : typeof it.edit === 'string' ? it.edit : null;
      if (id !== null) {
        const cur = byId.get(id);
        if (!cur || used.has(id)) {
          st.skipped++;
          return;
        }
        used.add(id);
        const sec = clone(cur);
        if (typeof it.keep !== 'string' && isObj(it.props)) {
          const fields = (config.components[sec.type] || {}).fields || {};
          let changed = false;
          Object.entries(it.props).forEach(([k, v]) => {
            if (k === 'id') return;
            const cv = cleanValue(fields[k], v, k, known);
            if (cv !== undefined && !same(sec.props[k], cv)) {
              sec.props[k] = cv;
              changed = true;
            }
          });
          fixMedia(sec, cur);
          if (changed) st.changed++;
        }
        out.push(sec);
        return;
      }
      const type = typeof it.add === 'string' ? it.add : '';
      const comp = config.components[type];
      if (!comp) {
        st.skipped++;
        return;
      }
      const props = clone(comp.defaultProps || {});
      const src = isObj(it.props) ? it.props : {};
      Object.entries(src).forEach(([k, v]) => {
        if (k === 'id') return;
        const cv = cleanValue(comp.fields[k], v, k, known);
        if (cv !== undefined) props[k] = cv;
      });
      props.id = newId(type);
      const sec = { type, props };
      fixMedia(sec, null);
      out.push(sec);
      st.added++;
    });
    content.forEach((c) => {
      const id = c.props && c.props.id;
      if (used.has(id)) return;
      if (readIds.has(id)) st.removed++;
      else out.push(clone(c)); // added while the AI worked
    });
    if (!out.length && content.length) throw new AiError('model', 'The AI’s answer did not fit this page. Try again, or say it another way.');
    next = out;
  }

  const root = clone((data && data.root) || { props: {} });
  root.props = root.props || {};
  let settings = 0;
  if (isObj(answer && answer.root)) {
    ROOT_KEYS.forEach((k) => {
      if (!(k in answer.root)) return;
      const f = config.root.fields[k];
      let v = cleanValue(f, answer.root[k], k, known);
      if (typeof v === 'string' && (k === 'title' || k === 'description')) v = v.slice(0, MAX[k]);
      if (k === 'title' && !v) return;
      if (v !== undefined && !same(root.props[k], v)) {
        root.props[k] = v;
        settings++;
      }
    });
  }

  const out = { ...data, root, content: next };
  const changed = !same(out.content, content) || settings > 0;
  const parts = [];
  if (st.added) parts.push('added ' + plural(st.added, 'section'));
  if (st.changed) parts.push('changed ' + plural(st.changed, 'section'));
  if (st.removed) parts.push('removed ' + plural(st.removed, 'section'));
  if (!st.added && !st.changed && !st.removed && !same(out.content, content)) parts.push('moved sections');
  if (settings) parts.push('updated the page settings');
  const line = parts.length ? parts.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.' : 'Nothing on the page changed.';
  return { data: out, changed, line };
}

/* ---------- A description from New page, waiting for the editor ---------- */

const pending = new Map();
export function setPending(id, text) {
  pending.set(id, text);
}
export function takePending(id) {
  const t = pending.get(id) || '';
  pending.delete(id);
  return t;
}
