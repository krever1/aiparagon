// Pages live in this browser (localStorage), so the demo needs no account or backend.
// Own key on purpose: #1 and #3 share paragonRD.v1 on this origin.
// A page keeps two copies of its Puck data: `draft` (what the editor saves as you go) and `live`
// (what Publish copied). Its status comes from those: Draft, Live, or Live with unpublished changes.
import { useSyncExternalStore } from 'react';
import { makeData } from './templates.js';

export const KEY = 'apSiteBuilder.v1';

let state = null;
let canSave = true;
const listeners = new Set();

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

// The address a new page would get: its own words, plus -2, -3... when another page has them
export function freeSlug(wanted, exceptId) {
  const base = slugify(wanted) || 'page';
  const taken = new Set(state.pages.filter((p) => p.id !== exceptId).map((p) => slugOf(p)));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(base + '-' + i)) return base + '-' + i;
}

export function slugOf(page) {
  const props = (page && page.draft && page.draft.root && page.draft.root.props) || {};
  return slugify(props.slug) || 'page';
}

export function titleOf(page, which) {
  const data = which === 'live' ? page.live : page.draft;
  const props = (data && data.root && data.root.props) || {};
  return (typeof props.title === 'string' && props.title.trim()) || 'Untitled page';
}

export function statusOf(page) {
  if (!page.live) return 'draft';
  return page.updatedAt > page.publishedAt ? 'changes' : 'live';
}

function seed() {
  const now = Date.now();
  const home = makeData('cinematic', { title: 'Home', slug: 'home' });
  const services = makeData('business', { title: 'Services', slug: 'services' });
  return {
    v: 1,
    pages: [
      { id: 'home', createdAt: now - 864e5 * 2, updatedAt: now - 36e5 * 3, publishedAt: now - 36e5 * 3, draft: home, live: home },
      { id: 'services', createdAt: now - 864e5, updatedAt: now - 6e5 * 4, publishedAt: 0, draft: services, live: null },
    ],
  };
}

export function init() {
  if (state) return;
  state = readSaved() || seed();
  persist();
}

export function getPages() {
  return state.pages;
}

export function getPage(id) {
  return state.pages.find((p) => p.id === id) || null;
}

export function savingWorks() {
  return canSave;
}

export function createPage({ title, slug, template }) {
  const page = {
    id: uid(slugify(title).slice(0, 18) || 'page'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    publishedAt: 0,
    draft: makeData(template, { title: String(title).trim() || 'Untitled page', slug: freeSlug(slug || title) }),
    live: null,
  };
  state.pages.unshift(page);
  persist();
  emit();
  return page;
}

// Called as the editor changes; ignores a call that changes nothing (the editor reports its data
// once on load), so opening a page never marks it as changed
export function saveDraft(id, data) {
  const page = getPage(id);
  if (!page) return false;
  if (JSON.stringify(page.draft) === JSON.stringify(data)) return canSave;
  page.draft = data;
  page.updatedAt = Date.now();
  const ok = persist();
  emit();
  return ok;
}

export function publish(id, data) {
  const page = getPage(id);
  if (!page) return false;
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
  page.live = null;
  page.publishedAt = 0;
  const ok = persist();
  emit();
  return ok;
}

export function duplicatePage(id) {
  const src = getPage(id);
  if (!src) return null;
  const draft = JSON.parse(JSON.stringify(src.draft));
  const title = titleOf(src) + ' (copy)';
  draft.root = draft.root || {};
  draft.root.props = { ...(draft.root.props || {}), title, slug: freeSlug(slugOf(src) + '-copy') };
  const page = { id: uid(slugify(title).slice(0, 18) || 'page'), createdAt: Date.now(), updatedAt: Date.now(), publishedAt: 0, draft, live: null };
  state.pages.splice(state.pages.indexOf(src) + 1, 0, page);
  persist();
  emit();
  return page;
}

export function deletePage(id) {
  const i = state.pages.findIndex((p) => p.id === id);
  if (i < 0) return false;
  state.pages.splice(i, 1);
  persist();
  emit();
  return true;
}

// Back to the two sample pages, for the next demo
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
  return useSyncExternalStore(subscribe, () => state.pages);
}
