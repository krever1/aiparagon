// Pages live in one of two places, and each page says which in `where`:
// - 'team': signed in with an AI Paragon account, the team's pages, in the AI Paragon Sites
//   Supabase project (sites.js). Drafts save there as you edit, so the team sees the same pages on
//   any computer, and Publish puts a page on the web at the shared link (site/config.js) and at its
//   own domain. A copy is kept in this browser (TEAM_KEY), so edits made offline are not lost.
// - 'local': this browser (localStorage, KEY), as before: the signed-out demo with its two sample
//   pages, and anything made before signing in. Publish only makes the preview's live copy here.
// Own keys on purpose: #1 and #3 share paragonRD.v1 on this origin.
// A page keeps two copies of its Puck data: `draft` (what the editor saves as you go) and `live`
// (what Publish copied). Its status comes from those: Draft, Live, or Live with unpublished changes.
import { useSyncExternalStore } from 'react';
import { makeData } from './templates.js';
import { current, onAuth } from './auth.js';
import { rest, SitesError } from './sites.js';
import { sharedUrl } from './site/config.js';

export const KEY = 'apSiteBuilder.v1';
export const TEAM_KEY = 'apSiteBuilder.team.v1';

let state = null; // this browser's pages: { v: 1, pages }
let canSave = true;
// The team's pages. status: off (signed out), loading, ready, error (with the copy kept here, if any)
let team = { status: 'off', email: '', pages: [], error: '', loadedAt: 0 };
let snapshot = [];
let teamSnap = { status: 'off', email: '', error: '' };
const listeners = new Set();

/* ---------- This browser ---------- */

function readSaved() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && Array.isArray(v.pages) ? v : null;
  } catch (e) {
    return null;
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    canSave = true;
  } catch (e) {
    canSave = false;
  }
  return canSave;
}

function emit() {
  state = { ...state, pages: state.pages.slice() };
  snapshot = team.pages.concat(state.pages);
  teamSnap = { status: team.status, email: team.email, error: team.error };
  listeners.forEach((fn) => fn());
}

function uid(prefix) {
  const a = new Uint32Array(1);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return (prefix ? prefix + '-' : '') + a[0].toString(36).slice(0, 6);
}

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Addresses a page can't have on the shared link (the server's own paths)
const RESERVED = new Set(['api', 'site']);

// The address a new page would get: its own words, plus -2, -3... when another page in the same
// place has them (the team's pages on the server, or this browser's)
export function freeSlug(wanted, exceptId, where) {
  const place = where || (teamReady() ? 'team' : 'local');
  const base = slugify(wanted) || 'page';
  const pages = place === 'team' ? team.pages : state.pages;
  const taken = new Set();
  pages.filter((p) => p.id !== exceptId).forEach((p) => {
    taken.add(slugOf(p));
    if (p.liveSlug) taken.add(p.liveSlug);
  });
  RESERVED.forEach((r) => taken.add(r));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(base + '-' + i)) return base + '-' + i;
}

export function slugOf(page) {
  const props = (page && page.draft && page.draft.root && page.draft.root.props) || {};
  return slugify(props.slug) || 'page';
}

const slugOfData = (data) => slugify(data && data.root && data.root.props && data.root.props.slug) || 'page';

export function titleOf(page, which) {
  const data = which === 'live' ? page.live : page.draft;
  const props = (data && data.root && data.root.props) || {};
  return (typeof props.title === 'string' && props.title.trim()) || 'Untitled page';
}

// A team page's two copies are compared (its times come from the server's clock, a local edit's from
// this one); this browser's pages compare the times, as before
const sameCache = new WeakMap();
function draftIsLive(page) {
  const hit = sameCache.get(page);
  if (hit !== undefined) return hit;
  const same = JSON.stringify(page.draft) === JSON.stringify(page.live);
  sameCache.set(page, same);
  return same;
}

export function statusOf(page) {
  if (!page.live) return 'draft';
  if (page.where === 'team') return draftIsLive(page) ? 'live' : 'changes';
  return page.updatedAt > page.publishedAt ? 'changes' : 'live';
}

function seed() {
  const now = Date.now();
  const home = makeData('cinematic', { title: 'Home', slug: 'home' });
  const services = makeData('business', { title: 'Services', slug: 'services' });
  return {
    v: 1,
    pages: [
      { id: 'home', where: 'local', createdAt: now - 864e5 * 2, updatedAt: now - 36e5 * 3, publishedAt: now - 36e5 * 3, draft: home, live: home },
      { id: 'services', where: 'local', createdAt: now - 864e5, updatedAt: now - 6e5 * 4, publishedAt: 0, draft: services, live: null },
    ],
  };
}

export function init() {
  if (state) return;
  state = readSaved() || seed();
  state.pages.forEach((p) => {
    p.where = 'local';
  });
  persist();
  onAuth(followAuth);
  window.addEventListener('online', retryAll);
  followAuth();
  emit();
}

export function getPages() {
  return snapshot;
}

export function getPage(id) {
  return team.pages.find((p) => p.id === id) || state.pages.find((p) => p.id === id) || null;
}

export function savingWorks() {
  return canSave;
}

function localCreate({ title, slug, template }) {
  const page = {
    id: uid(slugify(title).slice(0, 18) || 'page'),
    where: 'local',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    publishedAt: 0,
    draft: makeData(template, { title: String(title).trim() || 'Untitled page', slug: freeSlug(slug || title, null, 'local') }),
    live: null,
  };
  state.pages.unshift(page);
  persist();
  emit();
  return page;
}

// A new page: on the server when the team's pages are open (a promise), else in this browser
export function createPage({ title, slug, template }) {
  if (teamReady()) return teamCreate({ title, slug, template });
  return localCreate({ title, slug, template });
}

// Called as the editor changes; ignores a call that changes nothing (the editor reports its data
// once on load), so opening a page never marks it as changed
export function saveDraft(id, data) {
  const page = getPage(id);
  if (!page) return false;
  if (JSON.stringify(page.draft) === JSON.stringify(data)) return page.where === 'team' ? true : canSave;
  if (page.where === 'team') return teamSaveDraft(page, data);
  page.draft = data;
  page.updatedAt = Date.now();
  const ok = persist();
  emit();
  return ok;
}

// This browser: returns true when it was kept. A team page: a promise of { ok, url } or { error }.
// text: the page's words as its chatbot reads them (chat.js pageTextFor), kept with the live copy
export function publish(id, data, text) {
  const page = getPage(id);
  if (!page) return false;
  if (page.where === 'team') return teamPublish(page, data, text);
  const now = Date.now();
  page.draft = data;
  page.live = JSON.parse(JSON.stringify(data));
  page.updatedAt = now;
  page.publishedAt = now;
  const ok = persist();
  emit();
  return ok;
}

export function unpublish(id) {
  const page = getPage(id);
  if (!page) return false;
  if (page.where === 'team') return teamUnpublish(page);
  page.live = null;
  page.publishedAt = 0;
  const ok = persist();
  emit();
  return ok;
}

// This browser: the copy. A team page: a promise of the copy (or { error })
export function duplicatePage(id) {
  const src = getPage(id);
  if (!src) return null;
  const draft = JSON.parse(JSON.stringify(src.draft));
  const title = titleOf(src) + ' (copy)';
  draft.root = draft.root || {};
  draft.root.props = { ...(draft.root.props || {}), title, slug: freeSlug(slugOf(src) + '-copy', null, src.where) };
  if (src.where === 'team') return teamInsert(draft, title);
  const page = { id: uid(slugify(title).slice(0, 18) || 'page'), where: 'local', createdAt: Date.now(), updatedAt: Date.now(), publishedAt: 0, draft, live: null };
  state.pages.splice(state.pages.indexOf(src) + 1, 0, page);
  persist();
  emit();
  return page;
}

// This browser: true. A team page: a promise of { ok } or { error }
export function deletePage(id) {
  const tp = team.pages.find((p) => p.id === id);
  if (tp) return teamDelete(tp);
  const i = state.pages.findIndex((p) => p.id === id);
  if (i < 0) return false;
  state.pages.splice(i, 1);
  persist();
  emit();
  return true;
}

// A page's own domain and the contacts its chatbot took are kept on the page itself, outside the
// editor's data: they are not content, so they neither wait for Publish nor mark the page changed.
export function domainOf(page) {
  return (page && typeof page.domain === 'string' && page.domain) || '';
}

// host: a checked domain (domain.js), or '' to remove it. This browser: { ok } or { error }; a team
// page: a promise of the same (the server keeps one page per domain, with or without www)
export function setDomain(id, host) {
  const page = getPage(id);
  if (!page) return { error: 'This page is gone.' };
  if (page.where === 'team') return teamSetDomain(page, host);
  if (host) {
    const other = state.pages.find((p) => p.id !== id && domainOf(p) === host);
    if (other) return { error: '“' + titleOf(other) + '” already uses ' + host + '. Remove it there first.' };
  }
  if (host) page.domain = host;
  else delete page.domain;
  const ok = persist();
  emit();
  return ok ? { ok: true } : { error: 'This browser is not saving pages, so the domain lasts until the tab is closed.' };
}

const MAX_LEADS = 200;

// Contacts the chatbot took: for a team page, those visitors left on the live page (from the server)
// plus any left while trying the chat in the builder; for this browser's pages, all kept here
export function leadsOf(page) {
  if (!page) return [];
  const mine = Array.isArray(page.leads) ? page.leads : [];
  if (page.where !== 'team') return mine;
  const tries = Array.isArray(page.tries) ? page.tries : [];
  return mine.concat(tries).sort((a, b) => (b.at || 0) - (a.at || 0));
}

export function addLead(id, lead) {
  const page = getPage(id);
  if (!page) return false;
  const row = { ...lead, at: lead.at || Date.now() };
  if (page.where === 'team') {
    replaceTeam(id, { tries: [row].concat(page.tries || []).slice(0, MAX_LEADS) });
    return true;
  }
  page.leads = [row, ...leadsOf(page)].slice(0, MAX_LEADS);
  const ok = persist();
  emit();
  return ok;
}

// This browser: true. A team page: a promise of { ok } or { error }
export function clearLeads(id) {
  const page = getPage(id);
  if (!page) return false;
  if (page.where === 'team') return teamClearLeads(page);
  delete page.leads;
  const ok = persist();
  emit();
  return ok;
}

// Back to the two sample pages, for the next demo. Only this browser's pages: the team's stay.
export function resetDemo() {
  state = seed();
  persist();
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePages() {
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function useTeam() {
  return useSyncExternalStore(subscribe, () => teamSnap);
}

/* ---------- The team's pages ---------- */

export function teamReady() {
  return team.status === 'ready';
}

export function teamState() {
  return teamSnap;
}

// Whether a page may still turn up: the team's pages are on their way
export function teamBusy() {
  return team.status === 'loading';
}

// Saved, saving, error (will try again), conflict (someone else saved first) or gone
export function syncOf(page) {
  if (!page) return 'saved';
  if (page.where !== 'team') return canSave ? 'saved' : 'error';
  return page.sync || 'saved';
}

// Where a live team page is on the web: its shared link, and its own domain when that is connected
export function linksOf(page) {
  if (!page || page.where !== 'team' || !page.live || !page.liveSlug) return null;
  const d = page.domainState || {};
  return { shared: sharedUrl(page.liveSlug), domain: page.domain && d.connected ? 'https://' + page.domain + '/' : '' };
}

const enc = encodeURIComponent;

function fromRow(r) {
  return {
    id: r.id,
    where: 'team',
    draft: r.draft,
    live: r.live || null,
    liveSlug: r.live_slug || '',
    domain: r.domain || '',
    domainState: r.domain_state || null,
    version: r.version,
    createdAt: Date.parse(r.created_at) || Date.now(),
    updatedAt: Date.parse(r.updated_at) || Date.now(),
    publishedAt: r.published_at ? Date.parse(r.published_at) : 0,
    updatedBy: r.updated_by || '',
    sync: 'saved',
    rev: 0,
  };
}

function readCache(email) {
  try {
    const v = JSON.parse(window.localStorage.getItem(TEAM_KEY) || 'null');
    if (v && v.email === email && Array.isArray(v.pages)) return v.pages.map((p) => ({ ...p, where: 'team', sync: p.dirty ? 'saving' : p.sync === 'conflict' ? 'conflict' : 'saved' }));
  } catch (e) {
    /* nothing kept */
  }
  return [];
}

function saveCache() {
  if (!team.email) return;
  try {
    const pages = team.pages.map((p) => {
      const { theirs, tries, ...keep } = p; // eslint-disable-line no-unused-vars
      return keep;
    });
    window.localStorage.setItem(TEAM_KEY, JSON.stringify({ email: team.email, pages }));
  } catch (e) {
    /* storage full or blocked: the server has everything that was saved */
  }
}

// Signing out on purpose: the copy of the team's pages kept in this browser goes too
export function forgetTeam() {
  try {
    window.localStorage.removeItem(TEAM_KEY);
  } catch (e) {
    /* nothing to drop */
  }
}

// Unsaved edits to the team's pages, which signing out now would lose
export function unsavedCount() {
  return team.pages.filter((p) => p.dirty).length;
}

function teamPage(id) {
  return team.pages.find((p) => p.id === id) || null;
}

function replaceTeam(id, changes) {
  team.pages = team.pages.map((p) => (p.id === id ? { ...p, ...changes } : p));
  emit();
}

// Sign-in changes: open the team's pages for whoever signed in, close them on sign-out
let lastEmail = '';
function followAuth() {
  const who = current();
  const email = who ? String(who.email || '').toLowerCase() : '';
  if (email === lastEmail) return;
  lastEmail = email;
  if (!email) {
    // The copy kept here stays (a sign-in that ran out comes back to its unsaved edits); signing
    // out on purpose drops it (forgetTeam)
    team = { status: 'off', email: '', pages: [], error: '', loadedAt: 0 };
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    if (state) emit();
    return;
  }
  team = { status: 'loading', email, pages: readCache(email), error: '', loadedAt: 0 };
  if (state) emit();
  loadTeam();
}

// Reads the team's pages again (the dashboard asks on open and when the window comes back)
let loading = null;
export function refreshTeam(minGap) {
  if (!team.email || loading) return loading;
  if (minGap && Date.now() - team.loadedAt < minGap) return null;
  return loadTeam();
}

function loadTeam() {
  const email = team.email;
  loading = (async () => {
    try {
      const rows = await rest('pages?select=*&order=updated_at.desc');
      if (team.email !== email) return;
      merge((rows || []).map(fromRow));
      team.status = 'ready';
      team.error = '';
      team.loadedAt = Date.now();
      loadTries = 0;
    } catch (e) {
      if (team.email !== email) return;
      team.status = 'error';
      team.error = e instanceof SitesError ? e.message : 'Could not open the team’s pages just now.';
      team.code = e instanceof SitesError ? e.code : 'retry';
      // A connection that comes back is tried again on its own (browsers don't always say so)
      if (team.code !== 'signin' && team.code !== 'team') loadLater(email);
    } finally {
      loading = null;
    }
    saveCache();
    emit();
  })();
  return loading;
}

let loadTries = 0;
let loadTimer = 0;
function loadLater(email) {
  clearTimeout(loadTimer);
  loadTries++;
  loadTimer = setTimeout(() => {
    if (team.email === email && team.status === 'error' && !loading) loadTeam();
  }, [5000, 15000, 30000][loadTries - 1] || 60000);
}

// The server's pages, with this browser's unsaved edits kept on top: an edit made on the version the
// server still has is sent again; one made on an older version waits for a person to choose
function merge(fresh) {
  const mine = new Map(team.pages.map((p) => [p.id, p]));
  team.pages = fresh.map((sp) => {
    const p = mine.get(sp.id);
    if (!p) return sp;
    const keep = { tries: p.tries, leads: p.leads, rev: p.rev || 0 };
    if (p.dirty) {
      if (p.version === sp.version) {
        schedulePush(sp.id, 0);
        return { ...sp, ...keep, draft: p.draft, dirty: true, sync: 'saving' };
      }
      return { ...p, ...keep, sync: 'conflict', theirs: sp };
    }
    if (p.sync === 'conflict' && p.theirs) return { ...p, ...keep, theirs: sp };
    // Someone else saved since this copy was kept: the editor shows theirs (rev reopens it)
    const changed = p.version !== sp.version && JSON.stringify(p.draft) !== JSON.stringify(sp.draft);
    return { ...sp, ...keep, rev: changed ? keep.rev + 1 : keep.rev };
  });
}

// Every write to one page goes through its own queue, so a save and a publish never race
const chains = new Map();
function queue(id, fn) {
  const prev = chains.get(id) || Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(
    id,
    next.catch(() => {}),
  );
  return next;
}

const timers = new Map();
const tries = new Map();
function schedulePush(id, ms) {
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      queue(id, () => push(id));
    }, ms),
  );
}

function retryLater(id) {
  const n = (tries.get(id) || 0) + 1;
  tries.set(id, n);
  schedulePush(id, [3000, 10000, 30000][n - 1] || 60000);
}

// The connection is back: open the team's pages again if they could not be, and send what waits
function retryAll() {
  if (team.email && team.status === 'error' && !loading) {
    loadTeam();
    return;
  }
  team.pages.filter((p) => p.dirty && p.sync !== 'conflict' && p.sync !== 'gone').forEach((p) => schedulePush(p.id, 0));
}

// The editor is closing: send what is waiting now
export function flush(id) {
  const p = teamPage(id);
  if (p && p.dirty && timers.has(id)) schedulePush(id, 0);
}

function teamSaveDraft(page, data) {
  replaceTeam(page.id, { draft: data, dirty: true, sync: page.sync === 'conflict' || page.sync === 'gone' ? page.sync : 'saving' });
  saveCache();
  if (page.sync !== 'conflict' && page.sync !== 'gone') schedulePush(page.id, 900);
  return true;
}

async function push(id) {
  const page = teamPage(id);
  if (!page || !page.dirty || page.sync === 'conflict' || page.sync === 'gone') return;
  const draft = page.draft;
  try {
    const rows = await rest('pages?id=eq.' + enc(id) + '&version=eq.' + page.version, { method: 'PATCH', body: { draft }, prefer: 'return=representation' });
    if (!rows || !rows.length) return await onConflict(id);
    const fresh = fromRow(rows[0]);
    const now = teamPage(id);
    if (!now) return;
    const again = now.draft !== draft; // edited again while this was on its way
    tries.delete(id);
    replaceTeam(id, { version: fresh.version, updatedAt: fresh.updatedAt, updatedBy: fresh.updatedBy, dirty: again, sync: again ? 'saving' : 'saved', error: '' });
    saveCache();
    if (again) schedulePush(id, 300);
  } catch (e) {
    if (!teamPage(id)) return;
    replaceTeam(id, { sync: 'error', error: e.message });
    saveCache();
    if (e.code !== 'signin' && e.code !== 'team') retryLater(id);
  }
}

// A save found the page on a newer version than this copy: keep both until a person chooses
async function onConflict(id) {
  let rows = null;
  try {
    rows = await rest('pages?id=eq.' + enc(id) + '&select=*');
  } catch (e) {
    replaceTeam(id, { sync: 'error', error: e.message });
    retryLater(id);
    return;
  }
  if (!rows || !rows.length) {
    replaceTeam(id, { sync: 'gone' });
  } else {
    replaceTeam(id, { sync: 'conflict', theirs: fromRow(rows[0]) });
  }
  saveCache();
}

// After a conflict: keep this copy (it replaces theirs on the next save), or take theirs
export function keepMine(id) {
  const p = teamPage(id);
  if (!p || !p.theirs) return;
  replaceTeam(id, { version: p.theirs.version, theirs: null, sync: 'saving', dirty: true });
  saveCache();
  schedulePush(id, 0);
}

export function takeTheirs(id) {
  const p = teamPage(id);
  if (!p || !p.theirs) return;
  replaceTeam(id, { ...p.theirs, tries: p.tries, leads: p.leads, rev: (p.rev || 0) + 1, theirs: null, dirty: false, sync: 'saved' });
  saveCache();
}

// A page the server no longer has (someone deleted it): put this browser's copy back as a new page
export function restoreGone(id) {
  const p = teamPage(id);
  if (!p) return null;
  team.pages = team.pages.filter((x) => x.id !== id);
  emit();
  return teamInsert(p.draft, titleOf(p));
}

function teamCreate({ title, slug, template }) {
  const draft = makeData(template, { title: String(title).trim() || 'Untitled page', slug: freeSlug(slug || title, null, 'team') });
  return teamInsert(draft, title);
}

async function teamInsert(draft, title) {
  const id = uid(slugify(title).slice(0, 18) || 'page');
  try {
    const rows = await rest('pages', { method: 'POST', body: { id, draft }, prefer: 'return=representation' });
    const page = fromRow(rows[0]);
    team.pages = [page].concat(team.pages.filter((p) => p.id !== id));
    saveCache();
    emit();
    return page;
  } catch (e) {
    return { error: e instanceof SitesError ? e.message : 'Could not save the page just now. Try again.' };
  }
}

function teamPublish(page, data, text) {
  clearTimeout(timers.get(page.id));
  timers.delete(page.id);
  replaceTeam(page.id, { draft: data, dirty: true, sync: page.sync === 'conflict' ? 'conflict' : 'saving' });
  saveCache();
  return queue(page.id, async () => {
    const p = teamPage(page.id);
    if (!p) return { error: 'This page is gone.' };
    if (p.sync === 'conflict') return { error: 'Someone else changed this page. Choose which version to keep, then publish.' };
    const slug = slugOfData(data);
    if (RESERVED.has(slug)) return { error: 'The address /' + slug + ' is kept for the site itself. Change the page address in Page settings.' };
    try {
      const live_text = typeof text === 'string' ? text.slice(0, 12000) : null;
      const rows = await rest('pages?id=eq.' + enc(p.id) + '&version=eq.' + p.version, { method: 'PATCH', body: { draft: data, live: data, live_slug: slug, live_text }, prefer: 'return=representation' });
      if (!rows || !rows.length) {
        await onConflict(p.id);
        return { error: 'Someone else changed this page. Choose which version to keep, then publish.' };
      }
      const fresh = fromRow(rows[0]);
      const now = teamPage(p.id);
      const again = now && now.draft !== data;
      replaceTeam(p.id, { ...fresh, draft: again ? now.draft : fresh.draft, tries: now && now.tries, leads: now && now.leads, rev: (now && now.rev) || 0, dirty: !!again, sync: again ? 'saving' : 'saved' });
      saveCache();
      if (again) schedulePush(p.id, 300);
      return { ok: true, url: sharedUrl(fresh.liveSlug) };
    } catch (e) {
      replaceTeam(p.id, { sync: 'error', error: e.message });
      saveCache();
      if (e.code === 'taken') return { error: 'Another page is already live at /' + slug + '. Change this page’s address in Page settings, then publish.' };
      retryLater(p.id);
      return { error: e instanceof SitesError ? e.message : 'Could not publish just now. Try again.' };
    }
  });
}

function teamUnpublish(page) {
  return queue(page.id, async () => {
    try {
      const rows = await rest('pages?id=eq.' + enc(page.id), { method: 'PATCH', body: { live: null, live_slug: null, live_text: null }, prefer: 'return=representation' });
      if (!rows || !rows.length) return { error: 'This page is gone.' };
      const fresh = fromRow(rows[0]);
      const now = teamPage(page.id);
      replaceTeam(page.id, { live: null, liveSlug: '', publishedAt: 0, version: fresh.version, sync: now && now.dirty ? now.sync : 'saved' });
      saveCache();
      return { ok: true };
    } catch (e) {
      return { error: e instanceof SitesError ? e.message : 'Could not take the page down just now. Try again.' };
    }
  });
}

function teamDelete(page) {
  return queue(page.id, async () => {
    try {
      await rest('pages?id=eq.' + enc(page.id), { method: 'DELETE' });
      clearTimeout(timers.get(page.id));
      timers.delete(page.id);
      team.pages = team.pages.filter((p) => p.id !== page.id);
      saveCache();
      emit();
      return { ok: true };
    } catch (e) {
      return { error: e instanceof SitesError ? e.message : 'Could not delete the page just now. Try again.' };
    }
  });
}

function teamSetDomain(page, host) {
  return queue(page.id, async () => {
    try {
      const rows = await rest('pages?id=eq.' + enc(page.id), { method: 'PATCH', body: { domain: host || null, domain_state: null }, prefer: 'return=representation' });
      if (!rows || !rows.length) return { error: 'This page is gone.' };
      replaceTeam(page.id, { domain: host || '', domainState: null });
      saveCache();
      return { ok: true };
    } catch (e) {
      if (e.code === 'taken') return { error: 'Another of the team’s pages already uses ' + host + '. Remove it there first.' };
      if (e.code === 'invalid') return { error: 'That domain can’t be used. Check the spelling.' };
      return { error: e instanceof SitesError ? e.message : 'Could not save the domain just now. Try again.' };
    }
  });
}

// What Vercel said about the page's domain last (domains.js), kept with the page for the team
export function setDomainState(id, domainState) {
  const page = teamPage(id);
  if (!page) return Promise.resolve({ error: 'This page is gone.' });
  replaceTeam(id, { domainState });
  saveCache();
  return queue(id, async () => {
    try {
      await rest('pages?id=eq.' + enc(id), { method: 'PATCH', body: { domain_state: domainState } });
      return { ok: true };
    } catch (e) {
      return { error: e.message };
    }
  });
}

// Moves one of this browser's pages to the team's pages (a new page there, the copy here removed)
export async function moveToTeam(id) {
  const local = state.pages.find((p) => p.id === id);
  if (!local || !teamReady()) return { error: 'Sign in to add pages to the team’s pages.' };
  const draft = JSON.parse(JSON.stringify(local.draft));
  draft.root = draft.root || {};
  draft.root.props = { ...(draft.root.props || {}), slug: freeSlug(slugOf(local), null, 'team') };
  const made = await teamInsert(draft, titleOf(local));
  if (made && made.error) return made;
  state.pages = state.pages.filter((p) => p.id !== id);
  persist();
  emit();
  return made;
}

export async function loadLeads(id) {
  const page = teamPage(id);
  if (!page) return { ok: true };
  try {
    const rows = await rest('leads?page_id=eq.' + enc(id) + '&select=id,name,email,phone,note,created_at&order=created_at.desc&limit=' + MAX_LEADS);
    const leads = (rows || []).map((r) => ({ id: r.id, name: r.name || '', email: r.email || '', phone: r.phone || '', question: r.note || '', at: Date.parse(r.created_at) || 0, via: 'live page' }));
    if (teamPage(id)) replaceTeam(id, { leads });
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function teamClearLeads(page) {
  try {
    await rest('leads?page_id=eq.' + enc(page.id), { method: 'DELETE' });
    replaceTeam(page.id, { leads: [], tries: [] });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof SitesError ? e.message : 'Could not clear the contacts just now. Try again.' };
  }
}
