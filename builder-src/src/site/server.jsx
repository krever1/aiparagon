// The live pages' server: a Vercel Function on the aiparagon-sites project (built to
// sites/api/page.mjs; sites/vercel.json sends every address here). It finds the live page for the
// address (the shared link's /<page>, or a page's own domain), and sends it as finished HTML: the
// search and link-preview tags, the page itself, its custom code where the team put it, and the data
// the browser script (sites/_site/) needs to take over. Never the draft, never the chatbot's notes.
import { renderToString } from 'react-dom/server';
import { PageTree } from './page.jsx';
import { headHtml } from '../seo.js';
import { pageCode } from '../code.js';
import { SITES_URL, SITES_KEY, isSharedHost } from './config.js';

/* global __SITE_CSS__, __SITE_JS__ */
const CSS = typeof __SITE_CSS__ === 'string' ? __SITE_CSS__ : '';
const SCRIPT = typeof __SITE_JS__ === 'string' ? __SITE_JS__ : '/_site/site.js';

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&family=Newsreader:opsz,wght@6..72,400..600&family=Space+Grotesk:wght@400..700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">';
// Content that fades in as it scrolls into view stays visible when scripts are off
const NOSCRIPT = '<noscript><style>.sb-site .sb-reveal{opacity:1!important;transform:none!important}</style></noscript>';
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BG = { dark: '#05070d', light: '#f6f7fb' };

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON inside a script tag: nothing in it may end the tag or start a comment
const jsonInScript = (v) =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

function hostOf(request, url) {
  const h = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host || '';
  return h.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function respond(html, status, cache) {
  return new Response(html, { status, headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache } });
}

// A plain page for an address with nothing live at it
function notFound(host) {
  const html =
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Page not found</title>\n<meta name="robots" content="noindex">\n' +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05070d;color:#eef1fa;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}h1{font-size:22px;margin:0 0 6px}p{margin:0;color:#a9b2c9}</style>\n</head>\n<body>\n<main>\n<h1>Nothing here yet</h1>\n<p>There is no live page at ' +
    esc(host || 'this address') +
    '.</p>\n</main>\n</body>\n</html>\n';
  return respond(html, 404, 'public, max-age=0, s-maxage=10');
}

function unavailable() {
  const html =
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Back in a moment</title>\n<meta name="robots" content="noindex">\n' +
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05070d;color:#eef1fa;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}h1{font-size:22px;margin:0 0 6px}p{margin:0;color:#a9b2c9}</style>\n</head>\n<body>\n<main>\n<h1>Back in a moment</h1>\n<p>This page could not load just now. Try again in a minute.</p>\n</main>\n</body>\n</html>\n';
  return new Response(html, { status: 503, headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '30' } });
}

// The live page at this address: { id, slug, domain, published_at, live } or null
export async function findPage({ host, slug }, fetcher = fetch) {
  const res = await fetcher(SITES_URL + '/rest/v1/rpc/site_page', {
    method: 'POST',
    headers: { apikey: SITES_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(host ? { p_host: host } : { p_slug: slug }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error('site_page ' + res.status);
  const row = await res.json();
  return row && typeof row === 'object' && row.live && typeof row.live === 'object' ? row : null;
}

// The whole page as HTML. url: the address asked for; canonical: the page's main address
export function pageHtml(row, { url, canonical }) {
  const data = row.live;
  const rp = (data.root && data.root.props) || {};
  const code = pageCode(rp);
  const info = { id: row.id, slug: row.slug, live: data };
  const body = renderToString(<PageTree info={info} />);
  const theme = rp.theme === 'light' ? 'light' : 'dark';
  return (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="theme-color" content="' + BG[theme] + '">\n' +
    headHtml(data, { url, canonical }) + '\n' +
    FONTS + '\n' +
    '<style>html,body{margin:0;padding:0}body{background:' + BG[theme] + '}' + CSS + '</style>\n' +
    NOSCRIPT + '\n' +
    (code.head ? code.head + '\n' : '') +
    '</head>\n<body>\n' +
    (code.bodyStart ? code.bodyStart + '\n' : '') +
    '<div id="sb-root">' + body + '</div>\n' +
    '<script id="sb-data" type="application/json">' + jsonInScript(info) + '</script>\n' +
    '<script src="' + SCRIPT + '" defer></script>\n' +
    (code.bodyEnd ? code.bodyEnd + '\n' : '') +
    '</body>\n</html>\n'
  );
}

// fetcher: for tests (Vercel's own second argument is not a function, so it is left alone)
export async function GET(request, fetcher) {
  const get = typeof fetcher === 'function' ? fetcher : fetch;
  const url = new URL(request.url);
  const host = hostOf(request, url);
  const shared = isSharedHost(host);
  const parts = url.pathname.split('/').filter(Boolean);
  let slug = '';
  if (shared) {
    if (parts.length !== 1) return notFound(host);
    slug = decodeURIComponent(parts[0]).toLowerCase();
    if (!SLUG.test(slug) || slug.length > 60) return notFound(host);
  } else if (parts.length && !(parts.length === 1 && parts[0] === 'index.html')) {
    return notFound(host);
  }

  let row;
  try {
    row = await findPage(shared ? { slug } : { host }, get);
  } catch (e) {
    return unavailable();
  }
  if (!row) return notFound(host);

  // One address per page on the shared link: /Kinetic-Studio and /kinetic-studio/ go to /kinetic-studio
  if (shared && url.pathname !== '/' + row.slug) {
    return new Response(null, { status: 301, headers: { ...HEADERS, Location: '/' + row.slug + url.search, 'Cache-Control': 'public, max-age=0, s-maxage=60' } });
  }
  // One host per domain: www and the bare domain go to the one the team saved
  if (!shared && row.domain && host !== row.domain) {
    return new Response(null, { status: 308, headers: { ...HEADERS, Location: 'https://' + row.domain + '/' + url.search, 'Cache-Control': 'public, max-age=0, s-maxage=300' } });
  }
  const self = 'https://' + host + (shared ? '/' + row.slug : '/');
  const canonical = row.domain ? 'https://' + row.domain + '/' : self;
  let html;
  try {
    html = pageHtml(row, { url: self, canonical });
  } catch (e) {
    return unavailable();
  }
  // Short in the CDN, so a new Publish shows within a minute; a visit after that refreshes it
  return respond(html, 200, 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
}

export function HEAD(request, fetcher) {
  return GET(request, fetcher).then((r) => new Response(null, { status: r.status, headers: r.headers }));
}
