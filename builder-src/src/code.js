// A page's custom code, like Webflow's: tracking tags made from an ID (Google Analytics 4, Google
// Tag Manager, Meta Pixel, LinkedIn Insight Tag, HubSpot) and the team's own code for the head and
// the end of the body, kept in the page's settings (root props `tracking` and `code`).
// None of it ever runs in the builder. The editor, the preview and the live page here share
// aiparagon.vercel.app with the team's own tools, so a script on them could read the team's
// sign-ins. It goes on the page once pages are hosted on their own domain; until then the Code tab
// checks it (checkCode, which parses it with DOMParser: nothing runs and nothing loads) and shows
// exactly what would go on the page (pageCode).

export const CODE_MAX = 20000;

// In the order the tags go on the page (Tag Manager first, as Google asks); the Code tab lists
// Google Analytics first (UI_ORDER), since most pages want that one
export const TRACKERS = [
  { key: 'gtm', label: 'Google Tag Manager', field: 'Container ID', placeholder: 'GTM-XXXXXXX', re: /^GTM-[A-Z0-9]{4,10}$/, upper: true, shape: 'A Container ID looks like GTM-XXXXXXX.', help: 'At the top of your Tag Manager workspace.' },
  { key: 'ga4', label: 'Google Analytics 4', field: 'Measurement ID', placeholder: 'G-XXXXXXXXXX', re: /^G-[A-Z0-9]{4,15}$/, upper: true, shape: 'A Measurement ID looks like G-XXXXXXXXXX.', help: 'In Google Analytics: Admin, Data streams, then your web stream.' },
  { key: 'meta', label: 'Meta Pixel', field: 'Pixel ID', placeholder: 'Digits only', re: /^\d{10,20}$/, shape: 'A Pixel ID is digits only, 10 or more.', help: 'In Meta Events Manager, under Data sources.' },
  { key: 'linkedin', label: 'LinkedIn Insight Tag', field: 'Partner ID', placeholder: 'Digits only', re: /^\d{4,10}$/, shape: 'A Partner ID is digits only.', help: 'In LinkedIn Campaign Manager, on the Insight Tag page.' },
  { key: 'hubspot', label: 'HubSpot tracking', field: 'Hub ID', placeholder: 'Digits only', re: /^\d{4,10}$/, shape: 'A Hub ID is digits only.', help: 'In HubSpot, under your account name at the top right.' },
];
export const UI_ORDER = ['ga4', 'gtm', 'meta', 'linkedin', 'hubspot'];

const str = (v) => (typeof v === 'string' ? v : '');

// The IDs as typed, tidied (spaces out, Google's in capitals)
export function trackingOf(rootProps) {
  const t = (rootProps && rootProps.tracking) || {};
  const out = {};
  TRACKERS.forEach((tr) => {
    let v = str(t[tr.key]).replace(/\s+/g, '');
    if (tr.upper) v = v.toUpperCase();
    out[tr.key] = v;
  });
  return out;
}

// Why an ID is not one, or '' when it is (or is empty)
export function trackerError(tr, value) {
  let v = str(value).replace(/\s+/g, '');
  if (!v) return '';
  if (tr.upper) v = v.toUpperCase();
  if (tr.re.test(v)) return '';
  if (tr.key === 'ga4' && /^UA-/i.test(v)) return 'That is an old Universal Analytics ID. Google Analytics 4 IDs start with G-.';
  if (tr.key === 'ga4' && /^GTM-/i.test(v)) return 'That is a Tag Manager ID. Put it in the Google Tag Manager box.';
  if (tr.key === 'gtm' && /^G-/i.test(v)) return 'That is a Google Analytics ID. Put it in the Google Analytics 4 box.';
  return tr.shape;
}

export function codeOf(rootProps) {
  const c = (rootProps && rootProps.code) || {};
  return { head: str(c.head).slice(0, CODE_MAX), body: str(c.body).slice(0, CODE_MAX) };
}

// The tags each service gives for a site, with the ID filled in (IDs are checked first, so they
// carry only letters, digits and a dash). The services' own <!-- --> label lines are left out: the
// build refuses that marker inside the page's inline script.
const TAGS = {
  gtm: (id) => ({
    head:
      "<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\nnew Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\nj=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n})(window,document,'script','dataLayer','" +
      id +
      "');</script>",
    bodyStart:
      '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=' +
      id +
      '"\nheight="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>',
  }),
  ga4: (id) => ({
    head:
      '<script async src="https://www.googletagmanager.com/gtag/js?id=' +
      id +
      "\"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n\n  gtag('config', '" +
      id +
      "');\n</script>",
  }),
  meta: (id) => ({
    head:
      "<script>\n!function(f,b,e,v,n,t,s)\n{if(f.fbq)return;n=f.fbq=function(){n.callMethod?\nn.callMethod.apply(n,arguments):n.queue.push(arguments)};\nif(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';\nn.queue=[];t=b.createElement(e);t.async=!0;\nt.src=v;s=b.getElementsByTagName(e)[0];\ns.parentNode.insertBefore(t,s)}(window, document,'script',\n'https://connect.facebook.net/en_US/fbevents.js');\nfbq('init', '" +
      id +
      "');\nfbq('track', 'PageView');\n</script>\n<noscript><img height=\"1\" width=\"1\" style=\"display:none\"\nsrc=\"https://www.facebook.com/tr?id=" +
      id +
      '&ev=PageView&noscript=1"\n/></noscript>',
  }),
  linkedin: (id) => ({
    bodyEnd:
      '<script type="text/javascript">\n_linkedin_partner_id = "' +
      id +
      '";\nwindow._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];\nwindow._linkedin_data_partner_ids.push(_linkedin_partner_id);\n</script><script type="text/javascript">\n(function(l) {\nif (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};\nwindow.lintrk.q=[]}\nvar s = document.getElementsByTagName("script")[0];\nvar b = document.createElement("script");\nb.type = "text/javascript";b.async = true;\nb.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";\ns.parentNode.insertBefore(b, s);})(window.lintrk);\n</script>\n<noscript>\n<img height="1" width="1" style="display:none;" alt="" src="https://px.ads.linkedin.com/collect/?pid=' +
      id +
      '&fmt=gif" />\n</noscript>',
  }),
  hubspot: (id) => ({
    bodyEnd: '<script type="text/javascript" id="hs-script-loader" async defer src="//js.hs-scripts.com/' + id + '.js"></script>',
  }),
};

// What would go on the page, in place: the tags (Tag Manager first, as Google asks) and the team's
// own code. Strings only: nothing here puts them in a document.
export function pageCode(rootProps) {
  const t = trackingOf(rootProps);
  const c = codeOf(rootProps);
  const parts = { head: [], bodyStart: [], bodyEnd: [] };
  TRACKERS.forEach((tr) => {
    const id = t[tr.key];
    if (!id || trackerError(tr, id)) return;
    const tags = TAGS[tr.key](id);
    Object.keys(tags).forEach((k) => parts[k].push(tags[k]));
  });
  if (c.head.trim()) parts.head.push(c.head.trim());
  if (c.body.trim()) parts.bodyEnd.unshift(c.body.trim());
  return { head: parts.head.join('\n\n'), bodyStart: parts.bodyStart.join('\n\n'), bodyEnd: parts.bodyEnd.join('\n\n') };
}

// Services the checker recognises in pasted code, with the ID when the code carries one
const KNOWN = [
  { key: 'gtm', label: 'Google Tag Manager', re: /gtm\.js\?id=(GTM-[A-Z0-9]+)|['"](GTM-[A-Z0-9]{4,10})['"]/i },
  { key: 'ga4', label: 'Google Analytics 4', re: /gtag\/js\?id=(G-[A-Z0-9]+)|gtag\(\s*['"]config['"]\s*,\s*['"](G-[A-Z0-9]+)/i },
  { key: 'meta', label: 'Meta Pixel', re: /fbq\(\s*['"]init['"]\s*,\s*['"]?(\d{6,20})|connect\.facebook\.net\/[^"']*fbevents\.js/i },
  { key: 'linkedin', label: 'LinkedIn Insight Tag', re: /_linkedin_partner_id\s*=\s*['"]?(\d{3,12})|snap\.licdn\.com/i },
  { key: 'hubspot', label: 'HubSpot tracking', re: /hs-scripts\.com\/(\d{3,12})\.js/i },
  { key: 'hotjar', label: 'Hotjar', re: /static\.hotjar\.com|hjid\s*:\s*\d+/i },
  { key: 'clarity', label: 'Microsoft Clarity', re: /clarity\.ms\/tag/i },
  { key: 'tiktok', label: 'TikTok Pixel', re: /analytics\.tiktok\.com/i },
  { key: 'calendly', label: 'Calendly', re: /assets\.calendly\.com/i },
  { key: 'intercom', label: 'Intercom', re: /widget\.intercom\.io|intercomSettings/i },
];

const HEAD_OK = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BASE', 'TITLE', 'TEMPLATE']);

function hostOf(url) {
  const s = str(url).trim();
  if (!s || !/^(https?:)?\/\//i.test(s)) return null;
  try {
    const u = new URL(s, 'https://page.invalid/');
    return { host: u.hostname.toLowerCase(), http: /^http:/i.test(s) };
  } catch (e) {
    return null;
  }
}

const tags = (doc, sel) => [...doc.querySelectorAll(sel)];
const textOutside = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());

// What the code holds and what to look at before it goes live. DOMParser documents never run
// scripts or fetch anything, so pasted code is only read here.
export function checkCode(rootProps) {
  const t = trackingOf(rootProps);
  const c = codeOf(rootProps);
  const found = [];
  const warnings = [];
  TRACKERS.forEach((tr) => {
    if (t[tr.key] && !trackerError(tr, t[tr.key])) found.push({ key: tr.key, label: tr.label, id: t[tr.key], from: 'field' });
  });
  const all = c.head + '\n' + c.body;
  KNOWN.forEach((k) => {
    const m = all.match(k.re);
    if (m) found.push({ key: k.key, label: k.label, id: m.slice(1).find(Boolean) || '', from: 'code' });
  });
  TRACKERS.forEach((tr) => {
    if (found.some((f) => f.key === tr.key && f.from === 'field') && found.some((f) => f.key === tr.key && f.from === 'code')) {
      warnings.push(tr.label + ' is in its box and in your code, so it would count every visit twice. Keep one.');
    }
  });

  const hosts = new Set();
  const http = new Set();
  const counts = { scripts: 0, external: 0, styles: 0, meta: 0, frames: 0 };
  const parser = new DOMParser();
  [['head', c.head], ['body', c.body]].forEach(([where, html]) => {
    if (!html.trim()) return;
    const name = where === 'head' ? 'head code' : 'body code';
    const opens = (html.match(/<script\b/gi) || []).length;
    const closes = (html.match(/<\/script\s*>/gi) || []).length;
    if (opens > closes) warnings.push('A <script> tag in the ' + name + ' is not closed, so everything after it would be read as script.');
    const sOpen = (html.match(/<style\b/gi) || []).length;
    const sClose = (html.match(/<\/style\s*>/gi) || []).length;
    if (sOpen > sClose) warnings.push('A <style> tag in the ' + name + ' is not closed.');
    const doc = parser.parseFromString('<!doctype html><html><head>' + (where === 'head' ? html : '') + '</head><body>' + (where === 'body' ? html : '') + '</body></html>', 'text/html');
    const root = where === 'head' ? doc.documentElement : doc.body;
    if (where === 'head') {
      const strays = [...new Set(tags(doc.body, '*').filter((el) => el.parentElement === doc.body && !HEAD_OK.has(el.tagName)).map((el) => '<' + el.tagName.toLowerCase() + '>'))];
      if (strays.length) warnings.push(strays.join(', ') + ' cannot go in the head. A browser moves it, and what follows, into the body: put it in the body box.');
      if (textOutside(doc.body) || textOutside(doc.head)) warnings.push('Some of the head code is plain text outside any tag. JavaScript needs to be inside <script> and </script>.');
    } else if (textOutside(doc.body)) {
      warnings.push('Some of the body code is plain text outside any tag, so it would show on the page. JavaScript needs to be inside <script> and </script>.');
    }
    tags(root, 'script').forEach((s) => {
      counts.scripts++;
      if (s.getAttribute('src')) counts.external++;
      (s.textContent.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) || []).forEach((u) => {
        const h = hostOf(u);
        if (h) hosts.add(h.host);
      });
    });
    counts.styles += tags(root, 'style, link[rel~="stylesheet" i]').length;
    counts.meta += tags(root, 'meta').length;
    counts.frames += tags(root, 'iframe').length;
    tags(root, 'script[src], link[href], iframe[src], img[src], source[src]').forEach((el) => {
      const h = hostOf(el.getAttribute('src') || el.getAttribute('href'));
      if (!h) return;
      hosts.add(h.host);
      if (h.http) http.add(h.host);
    });
  });
  if (http.size) warnings.push('Loads from ' + [...http].join(', ') + ' over http, which browsers block on an https page. Use https:// links.');
  return { found, hosts: [...hosts].sort(), counts, warnings, empty: !all.trim() && !found.length };
}
