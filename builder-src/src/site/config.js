// Where live pages are kept and served. The AI Paragon Sites Supabase project holds the team's
// pages (supabase/README.md); the aiparagon-sites Vercel project (sites/, built from here) serves
// them at the shared link, sites.aiparagonconsulting.com/<page>, and at each page's own domain.
export const SITES_URL = 'https://euzdaxouzvmvvukbuvwi.supabase.co';
// The project's publishable key: it names the project, nothing more (the tables let only the team in)
export const SITES_KEY = 'sb_publishable_g9NdlEGj5XqXYY44Km5V3A_qoxSenEj';
export const SHARED_HOST = 'sites.aiparagonconsulting.com';
// The sites project's own Vercel address, which serves the same pages
export const FALLBACK_HOST = 'aiparagon-sites.vercel.app';

// A host that serves every live page by its address (/<page>), rather than one page by its domain:
// the shared link, the project's Vercel addresses (its previews too) and a local test server
export function isSharedHost(host) {
  const h = String(host || '').toLowerCase();
  return h === SHARED_HOST || h === FALLBACK_HOST || /\.vercel\.app$/.test(h) || h === 'localhost' || /^127\.0\.0\.1$/.test(h);
}

// The address a page has on the shared link
export function sharedUrl(slug) {
  return 'https://' + SHARED_HOST + '/' + slug;
}
