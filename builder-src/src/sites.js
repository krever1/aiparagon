// The team's pages in the AI Paragon Sites Supabase project (site/config.js). Whoever is signed in
// with an AI Paragon account gets a session there: the site-session function swaps the team sign-in
// (auth.js) for one, marked as team, which is what the tables let in. The session is kept per
// browser, renewed one tab at a time (a renewal key can be used once), and dropped when the
// sign-in changes. rest() is what the store calls.
import { current, token as teamToken, onAuth } from './auth.js';
import { SITES_URL, SITES_KEY } from './site/config.js';

export const SESSION_HOOK = SITES_URL + '/functions/v1/site-session';
export const SITES_AUTH = 'apSiteBuilder.sites';
const AHEAD = 2 * 60 * 1000;

export class SitesError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status || 0;
  }
}

let memory = null;
function read() {
  try {
    return JSON.parse(window.localStorage.getItem(SITES_AUTH) || 'null');
  } catch (e) {
    return memory;
  }
}
function write(v) {
  memory = v;
  try {
    if (v) window.localStorage.setItem(SITES_AUTH, JSON.stringify(v));
    else window.localStorage.removeItem(SITES_AUTH);
  } catch (e) {
    /* storage blocked: the session lasts until the tab closes */
  }
}

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// The kept session, if it belongs to whoever is signed in now
function kept() {
  const who = current();
  const s = read();
  if (!who || !s || !s.access_token || !same(s.email, who.email)) return null;
  return s;
}

// A new sign-in (or a sign-out) drops the session for the old one
onAuth(() => {
  const who = current();
  const s = read();
  if (s && (!who || !same(s.email, who.email))) write(null);
});

async function swap() {
  const auth = await teamToken();
  if (!auth) throw new SitesError('signin', 'Sign in with your AI Paragon account to open the team’s pages.');
  let res;
  let j = null;
  try {
    res = await fetch(SESSION_HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auth }) });
    j = await res.json().catch(() => null);
  } catch (e) {
    throw new SitesError('network', 'Could not reach the team’s pages. Check the connection and try again.');
  }
  const said = j && typeof j.error === 'string' ? j.error : '';
  if (res.status === 401) throw new SitesError('signin', said || 'Your sign-in has run out. Sign in again.', 401);
  if (res.status === 403) throw new SitesError('team', said || 'Team pages are for AI Paragon accounts.', 403);
  if (!res.ok || !j || !j.access_token) throw new SitesError('retry', said || 'Could not open the team’s pages just now. Try again in a minute.', res.status);
  const who = current();
  const s = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    email: j.email || (who && who.email) || '',
  };
  write(s);
  return s;
}

async function renew(s) {
  try {
    const res = await fetch(SITES_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: SITES_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    const j = await res.json().catch(() => null);
    if (res.ok && j && j.access_token) {
      const n = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000, email: s.email };
      write(n);
      return n;
    }
  } catch (e) {
    /* offline or a hiccup: a fresh swap is tried next */
  }
  return null;
}

// A token for the next request: the kept one while it lasts, else renewed, else a fresh swap of the
// team sign-in. fresh: the kept one was just turned away.
export async function sitesToken(fresh) {
  const run = async () => {
    const s = kept();
    if (s && !fresh && s.expires_at - Date.now() > AHEAD) return s.access_token;
    if (s && s.refresh_token && !fresh) {
      const n = await renew(s);
      if (n) return n.access_token;
    }
    return (await swap()).access_token;
  };
  if (navigator.locks && navigator.locks.request) {
    let viaLock = false;
    try {
      return await navigator.locks.request(SITES_AUTH, () => {
        viaLock = true;
        return run();
      });
    } catch (e) {
      if (viaLock) throw e;
      /* no locks here (a sandboxed frame): run without one */
    }
  }
  return run();
}

export function forgetSites() {
  write(null);
}

const MESSAGES = {
  '23505': 'taken',
  '23514': 'invalid',
  '42501': 'denied',
};

// One call to the project's REST API, as the signed-in team member. A token turned away gets one
// fresh swap. Returns the parsed answer (null for none); throws SitesError with a code:
// network, signin, team, taken (a unique address or domain), invalid, denied, retry.
export async function rest(path, { method = 'GET', body, prefer, signal } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const tok = await sitesToken(attempt > 0);
    let res;
    try {
      res = await fetch(SITES_URL + '/rest/v1/' + path, {
        method,
        headers: { apikey: SITES_KEY, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal && signal.aborted) throw new SitesError('stopped', 'Stopped.');
      throw new SitesError('network', 'Could not reach the team’s pages. Check the connection and try again.');
    }
    if (res.status === 401 && attempt === 0) continue;
    const text = await res.text().catch(() => '');
    let j = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch (e) {
      j = null;
    }
    if (res.ok) return j;
    if (res.status === 401) throw new SitesError('signin', 'Your sign-in has run out. Sign in again.', 401);
    const code = (j && MESSAGES[j.code]) || 'retry';
    throw new SitesError(code, code === 'retry' ? 'The team’s pages did not answer just now. Try again in a minute.' : String((j && j.message) || code), res.status);
  }
  throw new SitesError('signin', 'Your sign-in has run out. Sign in again.', 401);
}
