// Sign-in for the AI panel. The AI runs in n8n and answers only the AI Paragon team, so the builder
// signs in with the team's accounts (the dashboard's Supabase project) and sends the session's token
// with each request, like the dashboard does. Pages themselves still live in this browser only.
// The builder keeps its own session under its own key and renews it one tab at a time (a renewal key
// can be used once). A dashboard sign-in in this browser is borrowed while it lasts, read only: the
// builder never renews the dashboard's session, so the two never race for the same key.
import { useSyncExternalStore } from 'react';

export const SB_URL = 'https://lesyptuwllcgajdxzjje.supabase.co';
// The project's public anon key (the dashboard ships the same one): it names the project, nothing more
export const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxlc3lwdHV3bGxjZ2FqZHh6amplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDAzMDEsImV4cCI6MjA5ODQxNjMwMX0.81-nHOWy8w48weqcL8Yrvv5RGHFlfeSDAo3BZf90DSs';
export const AUTH_KEY = 'apSiteBuilder.auth';
export const DASH_KEY = 'ap.session.v1';
export const DOMAIN = 'aiparagonconsulting.com';

const RENEW_AHEAD = 5 * 60 * 1000;

export class AuthError extends Error {}

function read(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch (e) {
    return null;
  }
}
function write(key, v) {
  try {
    if (v) window.localStorage.setItem(key, JSON.stringify(v));
    else window.localStorage.removeItem(key);
  } catch (e) {
    /* storage blocked: the session lasts until the tab closes */
    memory = v;
  }
}
let memory = null;

let version = 0;
const listeners = new Set();
function emit() {
  version++;
  listeners.forEach((fn) => fn());
}
window.addEventListener('storage', (e) => {
  if (e.key === AUTH_KEY || e.key === DASH_KEY || e.key === null) emit();
});

const isTeam = (email) => String(email || '').toLowerCase().endsWith('@' + DOMAIN);

function own() {
  const s = read(AUTH_KEY) || memory;
  return s && s.access_token && s.refresh_token ? s : null;
}

function borrowed() {
  const mine = read(AUTH_KEY) || memory;
  if (mine && mine.noDashboard) return null;
  const s = read(DASH_KEY);
  const email = s && s.user && s.user.email;
  if (!s || !s.access_token || !isTeam(email) || !(Number(s.expires_at) - Date.now() > 60 * 1000)) return null;
  return { access_token: s.access_token, email: String(email) };
}

// Who the AI will answer: { email, from: 'builder' | 'dashboard' } or null
export function current() {
  const s = own();
  if (s) return { email: s.email || '', from: 'builder' };
  const d = borrowed();
  return d ? { email: d.email, from: 'dashboard' } : null;
}

export function useAuth() {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
  );
  return current();
}

function keep(j) {
  const s = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    email: (j.user && j.user.email) || '',
  };
  write(AUTH_KEY, s);
  return s;
}

async function authPost(path, body, bearer) {
  const res = await fetch(SB_URL + '/auth/v1' + path, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + (bearer || SB_KEY), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => null);
  return { res, j };
}

export async function signIn(email, password) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !password) throw new AuthError('Enter your email and password.');
  if (!isTeam(e)) throw new AuthError('Use your AI Paragon email (name@' + DOMAIN + ').');
  let out;
  try {
    out = await authPost('/token?grant_type=password', { email: e, password });
  } catch (err) {
    throw new AuthError('Could not reach the sign-in service. Check the connection and try again.');
  }
  const { res, j } = out;
  if (!res.ok || !j || !j.access_token) {
    const why = String((j && (j.error_description || j.msg || j.message || j.error)) || '');
    if (/confirm/i.test(why)) throw new AuthError('Confirm your email first: open the link the sign-up email sent you.');
    if (res.status === 400 || res.status === 401) throw new AuthError('That email and password do not match.');
    throw new AuthError('Sign-in did not work just now. Try again in a minute.');
  }
  const s = keep(j);
  if (!s.email) s.email = e;
  write(AUTH_KEY, s);
  emit();
  return current();
}

// Signs the builder out on this device. A borrowed dashboard sign-in is left alone: the builder
// just stops using it until someone signs in here.
export async function signOut() {
  const s = own();
  write(AUTH_KEY, { noDashboard: true });
  emit();
  if (s) {
    try {
      await authPost('/logout?scope=local', null, s.access_token);
    } catch (e) {
      /* offline: the session is gone from this browser anyway */
    }
  }
}

// After the AI turned a token away: drop it so the panel asks to sign in again
export function forget() {
  if (own()) write(AUTH_KEY, null);
  else write(AUTH_KEY, { noDashboard: true });
  emit();
}

async function renew() {
  const run = async () => {
    const s = own(); // another tab may have renewed it while this one waited
    if (!s) return null;
    if (s.expires_at - Date.now() > RENEW_AHEAD) return s;
    try {
      const { res, j } = await authPost('/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      if (res.ok && j && j.access_token) {
        const n = keep(j);
        if (!n.email) {
          n.email = s.email;
          write(AUTH_KEY, n);
        }
        emit();
        return n;
      }
      if (res.status === 400 || res.status === 401) {
        write(AUTH_KEY, null);
        emit();
        return null;
      }
    } catch (e) {
      /* offline or a hiccup: the old token works while it lasts */
    }
    return s.expires_at > Date.now() ? s : null;
  };
  try {
    if (navigator.locks && navigator.locks.request) return await navigator.locks.request(AUTH_KEY, run);
  } catch (e) {
    /* no locks here (an old browser, a sandboxed frame) */
  }
  return run();
}

// A token for the next AI request, renewed first when it has under five minutes left
export async function token() {
  const s = own();
  if (s) {
    if (s.expires_at - Date.now() > RENEW_AHEAD) return s.access_token;
    const n = await renew();
    return n ? n.access_token : null;
  }
  const d = borrowed();
  return d ? d.access_token : null;
}
