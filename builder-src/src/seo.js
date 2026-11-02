// SEO for a page: the title and description search engines show, the picture link previews use,
// whether search engines may list it, and checks a person can act on. The values live in the page's
// settings (root props), so they go live with Publish like everything else. The live page's server
// writes the tags into the HTML it sends (headHtml); the builder's own previews write them into the
// page while they are open (applyMeta).

export const TITLE_RANGE = [30, 60];
export const DESC_RANGE = [70, 155];

const str = (v) => (typeof v === 'string' ? v : '');
const arr = (v) => (Array.isArray(v) ? v : []);

// What search engines and link previews read, with the page name standing in for an empty title
export function seoOf(data) {
  const rp = (data && data.root && data.root.props) || {};
  const own = str(rp.seoTitle).trim();
  const name = str(rp.title).trim();
  const image = str(rp.socialImage).trim();
  return {
    title: own || name || 'Untitled page',
    ownTitle: !!own,
    description: str(rp.description).trim(),
    image: /^https:\/\/\S+$/i.test(image) ? image : '',
    noindex: rp.noindex === true,
  };
}

// Every string on the page (settings and sections), for the placeholder check
function strings(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.keys(v).forEach((k) => k !== 'id' && strings(v[k], out));
  return out;
}

const LINKS = {
  Navbar: [['ctaLabel', 'ctaHref']],
  Hero: [['primaryLabel', 'primaryHref'], ['secondaryLabel', 'secondaryHref']],
  Split: [['buttonLabel', 'buttonHref']],
  Cta: [['buttonLabel', 'buttonHref']],
  Button: [['label', 'href']],
};

// Buttons and links with words on them that go nowhere (their link is # or empty)
function deadLinks(content) {
  let n = 0;
  const dead = (h) => {
    const s = str(h).trim();
    return !s || s === '#';
  };
  content.forEach((c) => {
    const p = c.props || {};
    (LINKS[c.type] || []).forEach(([label, href]) => {
      if (str(p[label]).trim() && dead(p[href])) n++;
    });
    if (c.type === 'Navbar' || c.type === 'Footer') arr(p.links).forEach((l) => l && str(l.label).trim() && dead(l.href) && n++);
  });
  return n;
}

// The checks, in the order the SEO tab lists them. Each is { key, ok, text }. A check that does not
// apply to the page (no pictures) is left out, so the count only counts what can be fixed.
export function seoChecks(data) {
  const s = seoOf(data);
  const content = arr(data && data.content);
  const out = [];

  const tl = s.title.length;
  out.push({
    key: 'title',
    ok: tl >= TITLE_RANGE[0] && tl <= TITLE_RANGE[1],
    text:
      tl < TITLE_RANGE[0]
        ? 'The title in Google is short (' + tl + ' characters). Aim for 30 to 60: what you do, then your name.'
        : tl > TITLE_RANGE[1]
          ? 'The title in Google is long (' + tl + ' characters). Google cuts it off after about 60.'
          : 'The title in Google is a good length (' + tl + ' characters).',
  });

  const dl = s.description.length;
  out.push({
    key: 'description',
    ok: dl >= DESC_RANGE[0] && dl <= DESC_RANGE[1],
    text: !dl
      ? 'No search description yet, so Google picks some text from the page.'
      : dl < DESC_RANGE[0]
        ? 'The search description is short (' + dl + ' characters). Aim for 70 to 155.'
        : dl > DESC_RANGE[1]
          ? 'The search description is long (' + dl + ' characters). Google cuts it off after about 155.'
          : 'The search description is a good length (' + dl + ' characters).',
  });

  const heroes = content.filter((c) => c.type === 'Hero');
  const headline = heroes.length ? str(heroes[0].props && heroes[0].props.headline).trim() : '';
  out.push({
    key: 'headline',
    ok: heroes.length === 1 && !!headline,
    text: !heroes.length
      ? 'No main headline. Add a Hero: its headline is the page’s main heading.'
      : heroes.length > 1
        ? 'There are ' + heroes.length + ' Heroes. Keep one, so the page has one main heading.'
        : !headline
          ? 'The Hero has no headline.'
          : 'One main headline: “' + (headline.length > 60 ? headline.slice(0, 57) + '…' : headline) + '”.',
  });

  let pics = 0;
  let bare = 0;
  content.forEach((c) => {
    const p = c.props || {};
    const shown = (c.type === 'Hero' && p.background === 'image') || (c.type === 'Split' && p.visual === 'image');
    if (shown && str(p.imageUrl).trim()) {
      pics++;
      if (!str(p.imageAlt).trim()) bare++;
    }
  });
  if (pics) {
    out.push({
      key: 'pictures',
      ok: !bare,
      text: bare
        ? bare + (bare === 1 ? ' picture has' : ' pictures have') + ' no description. Search engines and screen readers rely on it.'
        : (pics === 1 ? 'The picture has' : 'Every picture has') + ' a description.',
    });
  }

  const holes = strings({ root: (data && data.root && data.root.props) || {}, content: content.map((c) => c.props) }, []).reduce(
    (n, t) => n + (t.match(/\[[^\]\n]{1,120}\]/g) || []).length,
    0,
  );
  out.push({
    key: 'placeholders',
    ok: !holes,
    text: holes ? holes + (holes === 1 ? ' part in [brackets] is' : ' parts in [brackets] are') + ' still to fill in.' : 'No parts in [brackets] left to fill in.',
  });

  const dead = deadLinks(content);
  out.push({
    key: 'links',
    ok: !dead,
    text: dead ? dead + (dead === 1 ? ' button or link goes' : ' buttons or links go') + ' nowhere (the link is #).' : 'Every button and link goes somewhere.',
  });

  out.push({
    key: 'image',
    ok: !!s.image,
    text: s.image ? 'Link previews show your picture.' : 'No picture for link previews, so shares show a plain card.',
  });

  return out;
}

// Writes the page's tags into the document head and returns a function that puts them back as they
// were. A draft preview is never listed by search engines, whatever the setting.
export function applyMeta(data, { url, draft } = {}) {
  const s = seoOf(data);
  const head = document.head;
  const undo = [];
  const put = (selector, make, attr, value) => {
    let el = head.querySelector(selector);
    if (!value) {
      if (el) {
        const was = el.getAttribute(attr);
        el.remove();
        undo.push(() => {
          el.setAttribute(attr, was);
          head.appendChild(el);
        });
      }
      return;
    }
    if (el) {
      const was = el.getAttribute(attr);
      el.setAttribute(attr, value);
      undo.push(() => el.setAttribute(attr, was));
    } else {
      el = make();
      el.setAttribute(attr, value);
      el.setAttribute('data-sb-meta', '');
      head.appendChild(el);
      undo.push(() => el.remove());
    }
  };
  const meta = (key, name) => () => {
    const m = document.createElement('meta');
    m.setAttribute(key, name);
    return m;
  };
  const named = (name, value) => put('meta[name="' + name + '"]', meta('name', name), 'content', value);
  const prop = (name, value) => put('meta[property="' + name + '"]', meta('property', name), 'content', value);

  const was = document.title;
  document.title = s.title;
  undo.push(() => {
    document.title = was;
  });
  named('description', s.description);
  named('robots', draft || s.noindex ? 'noindex, nofollow' : 'index, follow');
  prop('og:type', 'website');
  prop('og:title', s.title);
  prop('og:description', s.description);
  prop('og:url', url || '');
  prop('og:image', s.image);
  named('twitter:card', s.image ? 'summary_large_image' : 'summary');
  named('twitter:title', s.title);
  named('twitter:description', s.description);
  named('twitter:image', s.image);
  put(
    'link[rel="canonical"]',
    () => {
      const l = document.createElement('link');
      l.setAttribute('rel', 'canonical');
      return l;
    },
    'href',
    draft ? '' : url || '',
  );
  return () => undo.reverse().forEach((fn) => fn());
}

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The same tags as HTML, for the live page's server. url: the address this copy was asked for;
// canonical: the page's main address (its own domain when it has one), which link previews and
// search engines are pointed to.
export function headHtml(data, { url, canonical } = {}) {
  const s = seoOf(data);
  const main = canonical || url || '';
  const out = ['<title>' + esc(s.title) + '</title>'];
  const tag = (attr, name, value) => {
    if (value) out.push('<meta ' + attr + '="' + name + '" content="' + esc(value) + '">');
  };
  tag('name', 'description', s.description);
  tag('name', 'robots', s.noindex ? 'noindex, nofollow' : 'index, follow');
  tag('property', 'og:type', 'website');
  tag('property', 'og:title', s.title);
  tag('property', 'og:description', s.description);
  tag('property', 'og:url', main);
  tag('property', 'og:image', s.image);
  tag('name', 'twitter:card', s.image ? 'summary_large_image' : 'summary');
  tag('name', 'twitter:title', s.title);
  tag('name', 'twitter:description', s.description);
  tag('name', 'twitter:image', s.image);
  if (main) out.push('<link rel="canonical" href="' + esc(main) + '">');
  return out.join('\n');
}
