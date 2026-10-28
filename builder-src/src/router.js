// Page addresses. On Vercel the app lives at /builder (vercel.json sends /builder and /builder/* to
// site-builder.html), so each screen has a real path: /builder, /builder/edit/<id>, /builder/view/<id>
// and /builder/view/<id>/draft. A copy opened anywhere else (a local file, another host) uses
// #/edit/<id> and so on. Inside a frame the address is left alone.
import { useEffect, useState } from 'react';

export const BASE = '/builder';

const framed = (() => {
  try { return window.self !== window.top; } catch (e) { return true; }
})();

export const mode = framed
  ? 'memory'
  : location.pathname === BASE || location.pathname.startsWith(BASE + '/')
    ? 'path'
    : 'hash';

// Inside a frame the app opens the page its address names, then moves around in memory
const startWords = location.pathname === BASE || location.pathname.startsWith(BASE + '/') ? location.pathname.slice(BASE.length) : location.hash.replace(/^#\/?/, '');
let memory = mode === 'memory' ? startWords : '';
const listeners = new Set();

function decodeSafe(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

export function parse(str) {
  const parts = String(str || '').split('?')[0].split('/').filter(Boolean).map(decodeSafe);
  if (parts[0] === 'edit' && parts[1] && parts.length === 2) return { name: 'edit', id: parts[1] };
  if (parts[0] === 'view' && parts[1] && (parts.length === 2 || (parts.length === 3 && parts[2] === 'draft'))) {
    return { name: 'view', id: parts[1], draft: parts[2] === 'draft' };
  }
  return { name: 'dashboard', unknown: parts.length > 0 };
}

function toStr(route) {
  if (route.name === 'edit') return 'edit/' + encodeURIComponent(route.id);
  if (route.name === 'view') return 'view/' + encodeURIComponent(route.id) + (route.draft ? '/draft' : '');
  return '';
}

export function current() {
  if (mode === 'path') return parse(location.pathname.slice(BASE.length));
  if (mode === 'hash') return parse(location.hash.replace(/^#\/?/, ''));
  return parse(memory);
}

export function hrefFor(route) {
  const s = toStr(route);
  if (mode === 'path') return BASE + (s ? '/' + s : '');
  return '#/' + s;
}

export function go(route, opts) {
  const replace = !!(opts && opts.replace);
  const s = toStr(route);
  if (mode === 'path') {
    const url = BASE + (s ? '/' + s : '');
    if (url !== location.pathname || location.search || location.hash) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  } else if (mode === 'hash') {
    const h = '#/' + s;
    if (location.hash !== h) {
      if (replace) history.replaceState(null, '', location.pathname + location.search + h);
      else history.pushState(null, '', location.pathname + location.search + h);
    }
  } else {
    memory = s;
  }
  listeners.forEach((fn) => fn());
}

// Puts the address in its plain form (a trailing slash, an unknown word) without adding history
export function canonicalize() {
  const route = current();
  if (mode === 'path') {
    const want = hrefFor(route);
    if (location.pathname !== want) history.replaceState(null, '', want + location.search + location.hash);
  } else if (mode === 'hash' && route.unknown) {
    history.replaceState(null, '', location.pathname + location.search + '#/');
  }
  return route;
}

export function useRoute() {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const update = () => setRoute(current());
    listeners.add(update);
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, []);
  return route;
}

// A link that moves inside the app without reloading (a modified click still opens a new tab)
export function linkProps(route) {
  return {
    href: hrefFor(route),
    onClick: (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      go(route);
    },
  };
}
