// Connecting a team page's own domain: the "Site Builder · Domains" n8n workflow (POST
// /webhook/site-builder-domain) adds the domain (and its www or bare pair) to the aiparagon-sites
// Vercel project through Vercel's API, with the team's Vercel token kept in n8n, and says what
// Vercel needs: the DNS records, and whether they are in place yet. The builder keeps that answer on
// the page (store.setDomainState) for the whole team.
import { token } from './auth.js';

export const DOMAINS_HOOK = 'https://n8n.aiparagonconsulting.com/webhook/site-builder-domain';

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const str = (v) => (typeof v === 'string' ? v : '');
const arr = (v) => (Array.isArray(v) ? v : []);

// The workflow's answer, checked: { connected, verified, misconfigured, records, verification, checkedAt }
export function stateOf(j) {
  const records = arr(j && j.records)
    .filter((r) => r && /^(A|AAAA|CNAME|TXT)$/.test(str(r.type)) && str(r.name) && str(r.value))
    .map((r) => ({ type: r.type, name: str(r.name).slice(0, 253), value: str(r.value).slice(0, 500), host: str(r.host).slice(0, 253) }))
    .slice(0, 8);
  const verification = arr(j && j.verification)
    .filter((v) => v && str(v.type) === 'TXT' && str(v.domain) && str(v.value))
    .map((v) => ({ type: 'TXT', name: str(v.domain).slice(0, 253), value: str(v.value).slice(0, 500), host: str(v.domain).slice(0, 253) }))
    .slice(0, 4);
  return {
    connected: j && j.verified === true && j.misconfigured === false,
    verified: !!(j && j.verified),
    misconfigured: !(j && j.misconfigured === false),
    records,
    verification,
    checkedAt: Date.now(),
  };
}

// action: connect, check or remove
export async function domainCall(action, domain, signal) {
  const auth = await token();
  if (!auth) throw new DomainError('signin', 'Sign in with your AI Paragon account to connect a domain.');
  let res;
  let j = null;
  try {
    res = await fetch(DOMAINS_HOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth, action, domain }),
      signal,
    });
    j = await res.json().catch(() => null);
  } catch (e) {
    if (signal && signal.aborted) throw new DomainError('stopped', 'Stopped.');
    throw new DomainError('network', 'Could not reach the domain service. Check the connection and try again.');
  }
  // n8n answers 404 for a webhook that is not switched on
  if (res.status === 404) throw new DomainError('off', 'Connecting domains is not switched on yet. The domain is saved with the page.');
  if (res.status === 401 || (j && j.code === 'unauthorized')) throw new DomainError('signin', 'Your sign-in has run out. Sign in again.');
  if (j && j.ok === false) throw new DomainError(str(j.code) || 'vercel', str(j.message) || 'Vercel did not take the domain just now. Try again in a minute.');
  if (!res.ok || !j || j.ok !== true) throw new DomainError('vercel', 'The domain service did not answer just now. Try again in a minute.');
  return action === 'remove' ? { removed: true } : stateOf(j);
}
