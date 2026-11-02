// A page's own domain. For now the builder only keeps the name, shows the records the domain will
// need and reads where it points today: pages are kept in this browser, so nothing can be served on
// the domain yet. The check asks public DNS over HTTPS (Google, then Cloudflare), so it needs no
// server and reads the same answers anyone on the internet gets.

// Vercel's values (Nov 2026, from its domain config for this team): two A records for a bare domain,
// and its general CNAME target for a subdomain (the project-specific one is only known once the
// domain is added to a hosting project)
export const VERCEL_A = ['216.198.79.1', '64.29.17.1'];
const VERCEL_A_OLDER = ['76.76.21.21'];
export const VERCEL_CNAME = 'cname.vercel-dns.com';
const VERCEL_CNAME_RE = /(^|\.)vercel-dns(-\d+)?\.com\.?$/i;

const DOH = [
  (name) => 'https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=A',
  (name) => 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(name) + '&type=A',
];

// Second-level endings where the bare domain has three parts (example.co.uk)
const TWO_PART = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.za', 'com.br', 'com.mx', 'co.jp', 'co.in', 'com.sg', 'com.ph', 'net.ph', 'org.ph', 'com.hk', 'co.kr', 'com.tr']);

// What a person typed, as a host name ("https://WWW.Example.com/about" is www.example.com), or why
// it is not one
export function normalizeDomain(input) {
  let s = String(input == null ? '' : input).trim().toLowerCase();
  if (!s) return { error: 'Type your domain, like www.yourbusiness.com.' };
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (s.includes('@')) return { error: 'Type the domain only, not an email address.' };
  let host = '';
  try {
    host = new URL('http://' + s).hostname;
  } catch (e) {
    host = '';
  }
  if (!host || /\s/.test(s)) return { error: 'That is not a domain. Type it like www.yourbusiness.com.' };
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return { error: 'Type a domain name, not an IP address.' };
  const labels = host.split('.');
  if (labels.length < 2) return { error: 'A domain has a dot in it, like yourbusiness.com.' };
  if (host.length > 253 || !labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return { error: 'That is not a domain. Type it like www.yourbusiness.com.' };
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1])) return { error: 'That ending is not a real domain ending. Check the spelling.' };
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'vercel.app' || host.endsWith('.vercel.app')) return { error: 'Use a domain you own, not a vercel.app or local address.' };
  return { host };
}

export function apexOf(host) {
  const labels = String(host).split('.');
  const two = labels.slice(-2).join('.');
  return labels.slice(TWO_PART.has(two) ? -3 : -2).join('.');
}

// The records the domain needs, in the order to add them. A bare domain also gets www (and the
// other way round), so both addresses work.
export function recordsFor(host) {
  const apex = apexOf(host);
  const a = VERCEL_A.map((v) => ({ type: 'A', name: '@', host: apex, value: v }));
  const cname = (sub) => ({ type: 'CNAME', name: sub, host: sub + '.' + apex, value: VERCEL_CNAME });
  if (host === apex) return [...a, cname('www')];
  const sub = host.slice(0, -(apex.length + 1));
  if (sub === 'www') return [cname('www'), ...a];
  return [cname(sub)];
}

// The other address that goes with this one (www and the bare domain), or null
export function pairOf(host) {
  const apex = apexOf(host);
  if (host === apex) return 'www.' + apex;
  if (host === 'www.' + apex) return apex;
  return null;
}

function readAnswer(j) {
  if (!j || typeof j.Status !== 'number') return null;
  if (j.Status === 3) return { status: 'missing', cname: [], a: [] };
  if (j.Status !== 0) return null;
  const ans = Array.isArray(j.Answer) ? j.Answer : [];
  const clean = (d) => String(d || '').replace(/\.$/, '').toLowerCase();
  const cname = ans.filter((r) => r && r.type === 5).map((r) => clean(r.data));
  const a = ans.filter((r) => r && r.type === 1).map((r) => clean(r.data));
  return { status: cname.length || a.length ? 'found' : 'empty', cname, a };
}

// Where one name points today: { status: 'found' | 'empty' | 'missing' | 'failed', cname, a }
export async function lookup(name, signal) {
  for (const url of DOH) {
    try {
      const res = await fetch(url(name), { headers: { accept: 'application/dns-json' }, signal });
      if (!res.ok) continue;
      const got = readAnswer(await res.json());
      if (got) return got;
    } catch (e) {
      if (signal && signal.aborted) throw e;
    }
  }
  return { status: 'failed', cname: [], a: [] };
}

export function pointsHere(r) {
  return !!r && (r.cname.some((c) => VERCEL_CNAME_RE.test(c)) || r.a.some((ip) => VERCEL_A.includes(ip) || VERCEL_A_OLDER.includes(ip)));
}

// The domain and its pair, each with where it points today
export async function checkDns(host, signal) {
  const names = [host, pairOf(host)].filter(Boolean);
  const found = await Promise.all(names.map((n) => lookup(n, signal)));
  return names.map((n, i) => ({ host: n, ...found[i], here: pointsHere(found[i]) }));
}
