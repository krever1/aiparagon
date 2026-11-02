// Site builder demo: a dashboard of pages, a Puck editor to build each page from sections, and a
// preview of the published page. Signed in, pages are the team's (saved on the server, live on the
// web after Publish); signed out, they are kept in this browser (see store.js).
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { Puck, Render, Button, useGetPuck } from '@puckeditor/core';
import '@puckeditor/core/no-external.css';
import './app.css';
import './blocks.css';
import { config, ACCENTS, FONTS } from './blocks.jsx';
import { TEMPLATE_LIST, makeData } from './templates.js';
import * as store from './store.js';
import { canonicalize, go, hrefFor, linkProps, useRoute } from './router.js';
import { EditorCtx, PageCtx } from './context.js';
import { AiPanel, SparkIcon, SignIn, useAiSession } from './AiPanel.jsx';
import { useAuth, signOut } from './auth.js';
import { SHARED_HOST } from './site/config.js';
import { setPending, takePending, catalog, pageForAi, applyAnswer } from './ai.js';
import { SeoPanel, DomainPanel, ChatPanel, CodePanel, openSettings } from './SettingsPanels.jsx';
import { ChatIcon } from './ChatWidget.jsx';
import { applyMeta, seoChecks, seoOf } from './seo.js';
import { normalizeDomain, recordsFor, pairOf } from './domain.js';
import { botOf, brandOf, pageTextFor, startersFor } from './chat.js';
import { askBot } from './chat-team.js';
import { trackingOf, trackerError, checkCode, pageCode, TRACKERS } from './code.js';

// "Describe it" makes a blank page and hands the description to the AI panel
const START_LIST = [...TEMPLATE_LIST, { key: 'describe', label: 'Describe it', blurb: 'Say what the page is for and the AI writes a first draft.' }];

const VIEWPORTS = [
  { width: 390, height: 'auto', label: 'Phone', icon: 'Smartphone' },
  { width: 768, height: 'auto', label: 'Tablet', icon: 'Tablet' },
  { width: 1280, height: 'auto', label: 'Desktop', icon: 'Monitor' },
];

const STATUS_LABEL = { draft: 'Draft', live: 'Live', changes: 'Unpublished changes' };

function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return 'on ' + new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function plain(v) {
  return typeof v === 'string' ? v : '';
}

/* ---------- Shared bits ---------- */

function Modal({ id, title, onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    const focusables = () => [...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled);
    if (!el.contains(document.activeElement)) (focusables()[0] || el).focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev && prev.focus && document.contains(prev)) prev.focus();
    };
  }, []);
  // On the page itself: inside the header (Sign in, Sign out) its blur would hold the dialog to the header
  return createPortal(
    <div className="ap-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
      <div className="ap-modal" role="dialog" aria-modal="true" aria-labelledby={id + '-title'} ref={ref} tabIndex={-1}>
        <h2 id={id + '-title'}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onDone, toast.ms || 6000);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  if (!toast) return null;
  return (
    <div className="ap-toast" role="status" aria-live="polite">
      <span>{toast.text}</span>
      {toast.link ? <a {...linkProps(toast.link.route)}>{toast.link.label}</a> : null}
      {toast.href ? (
        <a href={toast.href} target="_blank" rel="noopener noreferrer">
          {toast.hrefLabel || 'Open'}
        </a>
      ) : null}
      <button type="button" className="ap-toast-x" onClick={onDone} aria-label="Dismiss">×</button>
    </div>
  );
}

function Thumb({ data }) {
  const root = (data && data.root && data.root.props) || {};
  const hero = ((data && data.content) || []).find((b) => b.type === 'Hero');
  const headline = plain(hero && hero.props.headline) || plain(root.title) || 'Untitled page';
  const a = ACCENTS[root.accent] || ACCENTS.cyan;
  const dark = root.theme !== 'light';
  const f = FONTS[root.font] || FONTS.grotesk;
  return (
    <div className="ap-thumb" data-theme={dark ? 'dark' : 'light'} style={{ '--t-acc': dark ? a.dark : a.light, '--t-font': f.head }} aria-hidden="true">
      <div className="ap-thumb-nav"><i /><b /><b /><b /></div>
      <div className="ap-thumb-glow" />
      <p className="ap-thumb-h">{headline}</p>
      <div className="ap-thumb-cards"><i /><i /><i /></div>
    </div>
  );
}

function SignInModal({ onClose }) {
  const who = useAuth();
  useEffect(() => {
    if (who) onClose();
  }, [who]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal id="si" title="Sign in" onClose={onClose}>
      <SignIn prefix="si" lede="Sign in with your AI Paragon account (the dashboard’s) to open the team’s pages, put pages on the web and use the AI." />
      <div className="ap-modal-actions">
        <button type="button" className="ap-btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function doSignOut() {
  store.forgetTeam();
  signOut();
}

function SignOutModal({ n, onClose }) {
  return (
    <Modal id="so" title="Sign out?" onClose={onClose}>
      <p className="ap-modal-lede">{(n === 1 ? 'One page has' : n + ' pages have') + ' changes that have not reached the team’s pages yet. Signing out now loses them.'}</p>
      <div className="ap-modal-actions">
        <button type="button" className="ap-btn" onClick={onClose}>Stay signed in</button>
        <button type="button" className="ap-btn ap-btn-danger" onClick={() => { doSignOut(); onClose(); }}>Sign out anyway</button>
      </div>
    </Modal>
  );
}

// Who is signed in, with Sign out; or Sign in
function Account() {
  const who = useAuth();
  store.usePages();
  const [modal, setModal] = useState('');
  if (who) {
    const out = () => (store.unsavedCount() ? setModal('out') : doSignOut());
    return (
      <span className="ap-who">
        <span className="ap-who-email" title={who.email}>{who.email}</span>
        <button type="button" className="ap-btn ap-btn-quiet" onClick={out}>Sign out</button>
        {modal === 'out' ? <SignOutModal n={store.unsavedCount()} onClose={() => setModal('')} /> : null}
      </span>
    );
  }
  return (
    <>
      <button type="button" className="ap-btn" onClick={() => setModal('in')}>Sign in</button>
      {modal === 'in' ? <SignInModal onClose={() => setModal('')} /> : null}
    </>
  );
}

function TopBar({ onNew }) {
  return (
    <header className="ap-top">
      <div className="ap-top-in">
        <a className="ap-logo" {...linkProps({ name: 'dashboard' })}>
          <span className="ap-logo-mark" aria-hidden="true">P</span>
          <span className="ap-logo-name">AI Paragon</span>
          <span className="ap-logo-sub">Site Builder</span>
        </a>
        <span className="ap-chip">Demo</span>
        <span className="ap-top-gap" />
        <Account />
        {onNew ? (
          <button type="button" className="ap-btn ap-btn-primary" onClick={onNew}>
            <span aria-hidden="true">+</span> New page
          </button>
        ) : null}
      </div>
    </header>
  );
}

/* ---------- Dashboard ---------- */

function NewPageModal({ onClose }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [template, setTemplate] = useState('cinematic');
  const [about, setAbout] = useState('');
  const [error, setError] = useState('');
  const [aboutError, setAboutError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const shownSlug = slugEdited ? slug : store.slugify(name);
  const finalSlug = store.freeSlug(shownSlug || name || 'page');
  const describe = template === 'describe';
  const forTeam = store.teamReady();
  const submit = async (e) => {
    e.preventDefault();
    const noName = !name.trim();
    const noAbout = describe && !about.trim();
    setError(noName ? 'Give the page a name.' : '');
    setAboutError(noAbout ? 'Say what the page is for.' : '');
    if (noName || noAbout) {
      const first = document.getElementById(noName ? 'np-name' : 'np-about');
      if (first) first.focus();
      return;
    }
    if (busy) return;
    setBusy(true);
    setFailed('');
    const page = await Promise.resolve(store.createPage({ title: name.trim(), slug: shownSlug || name, template: describe ? 'blank' : template }));
    if (!page || page.error) {
      setFailed((page && page.error) || 'Could not make the page just now. Try again.');
      setBusy(false);
      return;
    }
    if (describe) setPending(page.id, about.trim());
    go({ name: 'edit', id: page.id });
  };
  return (
    <Modal id="np" title="New page" onClose={onClose}>
      <p className="ap-modal-lede">{forTeam ? 'Pick a starting point. The page is saved with the team’s pages; Publish puts it on the web.' : 'Pick a starting point. You can change everything in the editor.'}</p>
      <form onSubmit={submit} noValidate>
        <div className="ap-field">
          <label htmlFor="np-name">Page name</label>
          <input
            id="np-name"
            className="ap-input"
            value={name}
            maxLength={80}
            autoFocus
            autoComplete="off"
            placeholder="e.g. Spring launch"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'np-err' : undefined}
            onChange={(e) => { setName(e.target.value); setError(''); }}
          />
          {error ? <p id="np-err" className="ap-error">{error}</p> : null}
        </div>
        <div className="ap-field">
          <label htmlFor="np-slug">Page address</label>
          <div className="ap-slug">
            <span aria-hidden="true">/</span>
            <input id="np-slug" className="ap-input" value={shownSlug} maxLength={60} autoComplete="off" aria-describedby="np-slug-hint" onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} />
          </div>
          <p id="np-slug-hint" className="ap-hint">{forTeam ? 'Once published, the page will be at ' + SHARED_HOST + '/' + finalSlug : 'The page will be at /' + finalSlug}</p>
        </div>
        <fieldset className="ap-field ap-fieldset">
          <legend>Start from</legend>
          <div className="ap-choices">
            {START_LIST.map((t) => (
              <label key={t.key} className="ap-choice" data-kind={t.key}>
                <input type="radio" name="np-template" value={t.key} checked={template === t.key} onChange={() => setTemplate(t.key)} />
                <span className="ap-choice-art" aria-hidden="true">{t.key === 'describe' ? <SparkIcon /> : null}<i /><i /><i /></span>
                <b>{t.label}</b>
                <small>{t.blurb}</small>
              </label>
            ))}
          </div>
        </fieldset>
        {describe ? (
          <div className="ap-field">
            <label htmlFor="np-about">What is the page for?</label>
            <textarea
              id="np-about"
              className="ap-input ap-textarea"
              rows={4}
              maxLength={2000}
              value={about}
              placeholder="Who it is for, what you offer, and what visitors should do. For example: a page for Bright Paws, a dog grooming studio, with services, how booking works and a booking button."
              aria-invalid={aboutError ? 'true' : undefined}
              aria-describedby={aboutError ? 'np-about-err' : 'np-about-hint'}
              onChange={(e) => { setAbout(e.target.value); setAboutError(''); }}
            />
            {aboutError ? <p id="np-about-err" className="ap-error">{aboutError}</p> : <p id="np-about-hint" className="ap-hint">The editor opens with the AI panel and sends this. The AI needs an AI Paragon sign-in.</p>}
          </div>
        ) : null}
        {failed ? <p className="ap-error" role="alert">{failed}</p> : null}
        <div className="ap-modal-actions">
          <button type="button" className="ap-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ap-btn ap-btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create page'}</button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteModal({ page, onClose }) {
  const title = store.titleOf(page);
  const team = page.where === 'team';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    if (!team) {
      store.deletePage(page.id);
      onClose();
      return;
    }
    setBusy(true);
    const r = await store.deletePage(page.id);
    if (r && r.error) {
      setError(r.error);
      setBusy(false);
    } else onClose();
  };
  return (
    <Modal id="del" title={'Delete “' + title + '”?'} onClose={onClose}>
      <p className="ap-modal-lede">
        {team
          ? 'The page is removed from the team’s pages for everyone' + (page.live ? ', and its live page stops working' : '') + '. This cannot be undone.'
          : 'The page' + (page.live ? ' and its published version' : '') + ' will be removed from this browser. This cannot be undone.'}
      </p>
      {error ? <p className="ap-error" role="alert">{error}</p> : null}
      <div className="ap-modal-actions">
        <button type="button" className="ap-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ap-btn ap-btn-danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete page'}</button>
      </div>
    </Modal>
  );
}

function ResetModal({ onClose }) {
  return (
    <Modal id="reset" title="Reset the demo?" onClose={onClose}>
      <p className="ap-modal-lede">Every page in this browser is removed and the two sample pages come back, as on a first visit.{store.teamState().status !== 'off' ? ' The team’s pages are not touched.' : ''}</p>
      <div className="ap-modal-actions">
        <button type="button" className="ap-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ap-btn ap-btn-danger" onClick={() => { store.resetDemo(); onClose(); }}>Reset the demo</button>
      </div>
    </Modal>
  );
}

const SYNC_LABEL = { saving: 'Saving…', error: 'Not saved yet, trying again', conflict: 'Changed by someone else: open it to choose', gone: 'Deleted by someone else' };
const short = (url) => url.replace(/^https:\/\//, '').replace(/\/$/, '');
const who = (email) => String(email || '').split('@')[0];

function PageCard({ page, onDelete, onDuplicate, onMove }) {
  const st = store.statusOf(page);
  const title = store.titleOf(page);
  const n = ((page.draft && page.draft.content) || []).length;
  const domain = store.domainOf(page);
  const bot = botOf((page.draft && page.draft.root && page.draft.root.props) || {}).on;
  const team = page.where === 'team';
  const links = store.linksOf(page);
  const sync = store.syncOf(page);
  const connected = !!(team && page.domainState && page.domainState.connected);
  return (
    <li className="ap-card" data-page={page.id} data-where={page.where}>
      <a className="ap-thumb-link" {...linkProps({ name: 'edit', id: page.id })} tabIndex={-1} aria-hidden="true">
        <Thumb data={page.draft} />
      </a>
      <div className="ap-card-body">
        <h2 className="ap-card-title">{title}</h2>
        <div className="ap-card-meta">
          <span className={'ap-status ap-status-' + st}>{STATUS_LABEL[st]}</span>
          <span className="ap-card-slug">/{store.slugOf(page)}</span>
          <span>{n} section{n === 1 ? '' : 's'}</span>
        </div>
        {links ? (
          <p className="ap-card-live">
            <a href={links.domain || links.shared} target="_blank" rel="noopener noreferrer" aria-label={'Open the live ' + title + ' page'}>{short(links.domain || links.shared)}</a>
          </p>
        ) : null}
        {domain || bot ? (
          <p className="ap-card-extra">
            {domain && !connected ? <span>{domain} · not connected yet</span> : null}
            {bot ? <span>Chatbot on</span> : null}
          </p>
        ) : null}
        {team && sync !== 'saved' ? (
          <p className="ap-card-sync" data-sync={sync} role="status">{SYNC_LABEL[sync]}</p>
        ) : null}
        <p className="ap-card-time">
          Edited {ago(page.updatedAt)}
          {team && page.updatedBy ? ' by ' + who(page.updatedBy) : ''}
          {page.live ? ' · published ' + ago(page.publishedAt) : ''}
        </p>
      </div>
      <div className="ap-card-actions">
        <a className="ap-btn ap-btn-primary" {...linkProps({ name: 'edit', id: page.id })} aria-label={'Edit ' + title}>Edit</a>
        {page.live ? (
          <a className="ap-btn" {...linkProps({ name: 'view', id: page.id })} aria-label={'View the live ' + title + ' page'}>View live</a>
        ) : (
          <a className="ap-btn" {...linkProps({ name: 'view', id: page.id, draft: true })} aria-label={'Preview ' + title}>Preview</a>
        )}
        {onMove ? (
          <button type="button" className="ap-btn" onClick={onMove} aria-label={'Move ' + title + ' to the team’s pages'}>Move to team pages</button>
        ) : null}
        <button type="button" className="ap-btn" onClick={onDuplicate} aria-label={'Duplicate ' + title}>Duplicate</button>
        <button type="button" className="ap-btn ap-btn-quiet" onClick={onDelete} aria-label={'Delete ' + title}>Delete</button>
      </div>
    </li>
  );
}

const counts = (list) => {
  const live = list.filter((p) => p.live).length;
  return list.length + (list.length === 1 ? ' page, ' : ' pages, ') + live + ' live.';
};

function Dashboard({ notice, clearNotice }) {
  const pages = store.usePages();
  const team = store.useTeam();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [toast, setToast] = useState(null);
  const done = useCallback(() => setToast(null), []);
  // The team's pages are read again on opening and when the window comes back
  useEffect(() => {
    if (team.status === 'off') return undefined;
    store.refreshTeam(5000);
    const again = () => store.refreshTeam(15000);
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, [team.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const signedIn = team.status !== 'off';
  const teamPages = pages.filter((p) => p.where === 'team');
  const localPages = pages.filter((p) => p.where !== 'team');
  const canMove = team.status === 'ready';

  const duplicate = async (p) => {
    const copy = await Promise.resolve(store.duplicatePage(p.id));
    if (copy && !copy.error) setToast({ text: 'Made a copy of “' + store.titleOf(p) + '”.', link: { label: 'Edit the copy', route: { name: 'edit', id: copy.id } } });
    else if (copy && copy.error) setToast({ text: copy.error });
  };
  const move = async (p) => {
    const made = await store.moveToTeam(p.id);
    if (made && !made.error) setToast({ text: '“' + store.titleOf(made) + '” is now one of the team’s pages.', link: { label: 'Edit it', route: { name: 'edit', id: made.id } } });
    else setToast({ text: (made && made.error) || 'Could not move the page just now. Try again.' });
  };
  const grid = (list) => (
    <ul className="ap-grid">
      {list.map((p) => (
        <PageCard key={p.id} page={p} onDelete={() => setDeleting(p)} onDuplicate={() => duplicate(p)} onMove={signedIn && canMove && p.where !== 'team' ? () => move(p) : null} />
      ))}
    </ul>
  );

  return (
    <div className="ap-app">
      <TopBar onNew={() => setCreating(true)} />
      <main className="ap-main" id="main">
        <div className="ap-head">
          <h1 className="ap-h1">Pages</h1>
          <p className="ap-lede">
            {signedIn
              ? (teamPages.length ? 'Team pages: ' + counts(teamPages) + ' ' : '') + 'Saved for the whole team as you edit. Publish puts a page on the web.'
              : (pages.length ? counts(pages) + ' ' : '') + 'Open a page to edit it on the page itself, then publish when it is ready.'}
          </p>
        </div>
        {!store.savingWorks() ? (
          <p className="ap-banner" role="status">This browser is not saving pages (storage is blocked or full). Changes last until the tab is closed.</p>
        ) : null}
        {notice ? (
          <p className="ap-banner" role="status">
            {notice}{' '}
            <button type="button" className="ap-linkbtn" onClick={clearNotice}>Dismiss</button>
          </p>
        ) : null}
        {team.status === 'error' ? (
          <p className="ap-banner ap-banner-warn" role="alert">
            {team.error}
            {teamPages.length ? ' Showing the copy kept in this browser; changes save when the connection is back.' : ''}{' '}
            <button type="button" className="ap-linkbtn" onClick={() => store.refreshTeam()}>Try again</button>
          </p>
        ) : null}

        {signedIn ? (
          <section className="ap-section" aria-labelledby="team-h">
            <h2 id="team-h" className="ap-h2">Team pages</h2>
            {teamPages.length ? (
              grid(teamPages)
            ) : team.status === 'loading' ? (
              <p className="ap-hint" role="status">Opening the team’s pages…</p>
            ) : team.status === 'ready' ? (
              <div className="ap-empty">
                <h3>No team pages yet</h3>
                <p>Start one with New page{localPages.length ? ', or move a page from this browser' : ''}.</p>
                <button type="button" className="ap-btn ap-btn-primary" onClick={() => setCreating(true)}>New page</button>
              </div>
            ) : null}
          </section>
        ) : null}

        {signedIn ? (
          localPages.length ? (
            <section className="ap-section" aria-labelledby="local-h">
              <h2 id="local-h" className="ap-h2">On this browser only</h2>
              <p className="ap-hint">Made while signed out, or before signing in. Move one to the team’s pages to put it on the web.</p>
              {grid(localPages)}
            </section>
          ) : null
        ) : pages.length ? (
          grid(pages)
        ) : (
          <div className="ap-empty">
            <h2>No pages yet</h2>
            <p>Start one from a template or a blank page.</p>
            <button type="button" className="ap-btn ap-btn-primary" onClick={() => setCreating(true)}>New page</button>
          </div>
        )}

        {!signedIn ? (
          <p className="ap-signin-note">
            Sign in with your AI Paragon account to save pages for the team and put them on the web.{' '}
            <button type="button" className="ap-linkbtn" onClick={() => setSigningIn(true)}>Sign in</button>
          </p>
        ) : null}
        <p className="ap-foot">
          {signedIn ? 'Team pages are saved for everyone on the team; pages on this browser stay here.' : 'Demo: pages are saved in this browser only.'} Built with Puck, an open-source visual editor.{' '}
          <button type="button" className="ap-linkbtn" onClick={() => setResetting(true)}>Reset the demo</button>
        </p>
      </main>
      {creating ? <NewPageModal onClose={() => setCreating(false)} /> : null}
      {deleting ? <DeleteModal page={deleting} onClose={() => setDeleting(null)} /> : null}
      {resetting ? <ResetModal onClose={() => setResetting(false)} /> : null}
      {signingIn ? <SignInModal onClose={() => setSigningIn(false)} /> : null}
      <Toast toast={toast} onDone={done} />
    </div>
  );
}

/* ---------- Editor ---------- */

// Puck's own Publish control is a <span>, which a keyboard cannot reach, so the header gets a real
// button that publishes the editor's current data
const SAVE_LABEL = { saving: 'Saving…', error: 'Not saved', retry: 'Not saved yet, trying again', conflict: 'Someone else changed this page', gone: 'Deleted by someone else', saved: 'Saved' };

function HeaderActions() {
  const { id, status, flush, publish, publishing } = useContext(EditorCtx);
  const getPuck = useGetPuck();
  const leave = (route) => (e) => {
    if (e && e.preventDefault) e.preventDefault();
    flush();
    go(route);
  };
  // Puck's rail items are plain divs a keyboard cannot reach, so the AI also has a header button,
  // which opens its tab and puts the cursor in it
  const openAi = () => {
    getPuck().dispatch({ type: 'setUi', ui: { plugin: { current: 'ai' }, leftSideBarVisible: true } });
    setTimeout(() => {
      const el = document.querySelector('#ai-ask:not([disabled]), #ai-email, .ap-ai-stop');
      if (el) el.focus();
    }, 60);
  };
  return (
    <>
      <span className="ap-save" role="status" aria-live="polite" data-status={status}>
        {SAVE_LABEL[status] || 'Saved'}
      </span>
      <Button variant="secondary" href={hrefFor({ name: 'dashboard' })} onClick={leave({ name: 'dashboard' })}>All pages</Button>
      <Button variant="secondary" href={hrefFor({ name: 'view', id, draft: true })} onClick={leave({ name: 'view', id, draft: true })}>Preview</Button>
      <Button type="button" variant="secondary" onClick={() => openSettings(getPuck, 'seo')}>Settings</Button>
      <Button type="button" variant="secondary" icon={<SparkIcon />} onClick={openAi}>Ask AI</Button>
      <Button type="button" variant="primary" icon={<GlobeIcon />} disabled={publishing} onClick={() => publish(getPuck().appState.data)}>
        {publishing ? 'Publishing…' : 'Publish'}
      </Button>
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

const OVERRIDES = { headerActions: HeaderActions };
// The canvas shows as soon as the page's own (inline) styles are in; web fonts swap in when they load
const IFRAME = { waitForStyles: false };
// The AI tab sits in the left rail after Blocks and Outline, then the page's settings
const PLUGINS = [
  { name: 'ai', label: 'AI', icon: <SparkIcon />, render: AiPanel },
  { name: 'seo', label: 'SEO', icon: <SearchIcon />, render: SeoPanel },
  { name: 'domain', label: 'Domain', icon: <LinkIcon />, render: DomainPanel },
  { name: 'chat', label: 'Chatbot', icon: <ChatIcon size={18} />, render: ChatPanel },
  { name: 'code', label: 'Code', icon: <CodeIcon />, render: CodePanel },
];

function EditorView({ page }) {
  const [initial] = useState(() => page.draft);
  const [pendingAsk] = useState(() => takePending(page.id));
  const [ui] = useState(() => (pendingAsk ? { plugin: { current: 'ai' }, leftSideBarVisible: true } : undefined));
  const ai = useAiSession(pendingAsk);
  const [status, setStatus] = useState(store.savingWorks() ? 'saved' : 'error');
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState(null);
  const latest = useRef(null);
  const timer = useRef(0);
  const id = page.id;
  const team = page.where === 'team';

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = 0;
      if (latest.current) setStatus(store.saveDraft(id, latest.current) ? 'saved' : 'error');
    }
    store.flush(id);
  }, [id]);

  const onChange = useCallback(
    (data) => {
      latest.current = data;
      clearTimeout(timer.current);
      setStatus('saving');
      timer.current = setTimeout(() => {
        timer.current = 0;
        setStatus(store.saveDraft(id, data) ? 'saved' : 'error');
      }, 350);
    },
    [id],
  );

  const publish = useCallback(
    async (data) => {
      clearTimeout(timer.current);
      timer.current = 0;
      latest.current = data;
      if (!team) {
        const ok = store.publish(id, data);
        setStatus(ok ? 'saved' : 'error');
        const signedIn = store.teamState().status !== 'off';
        setToast(
          !ok
            ? { text: 'Published for this visit only: this browser is not saving pages.' }
            : signedIn
              ? { text: 'Published in this browser only. Move the page to the team’s pages (All pages) to put it on the web.', link: { label: 'View live page', route: { name: 'view', id } } }
              : { text: 'Published. The live page now matches the editor.', link: { label: 'View live page', route: { name: 'view', id } } },
        );
        return;
      }
      setPublishing(true);
      setStatus('saved');
      const r = await store.publish(id, data, pageTextFor(config, data));
      setPublishing(false);
      if (r && r.ok) setToast({ text: 'Published. It is live at ' + short(r.url) + '.', href: r.url, hrefLabel: 'Open the live page', ms: 9000 });
      else setToast({ text: (r && r.error) || 'Could not publish just now. Try again.', ms: 9000 });
    },
    [id, team],
  );

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  store.usePages();
  const current = store.getPage(id) || page;
  const sync = store.syncOf(current);
  // A team page's state is the store's (saving to the server, trying again, someone else's newer
  // version); the editor's own pause before saving still shows as saving
  const shown = status === 'saving' ? 'saving' : team ? (sync === 'error' ? 'retry' : sync) : status;
  const ctx = useMemo(() => ({ id, status: shown, flush, publish, publishing, ai }), [id, shown, flush, publish, publishing, ai]);
  const done = useCallback(() => setToast(null), []);
  const title = store.titleOf(current);
  useEffect(() => {
    document.title = 'Editing ' + title + ' \u00b7 Site Builder';
  }, [title]);

  return (
    <EditorCtx.Provider value={ctx}>
      <div className="ap-editor">
        <Puck
          config={config}
          data={initial}
          onChange={onChange}
          headerTitle={title}
          headerPath={'/' + store.slugOf(current)}
          viewports={VIEWPORTS}
          overrides={OVERRIDES}
          plugins={PLUGINS}
          ui={ui}
          iframe={IFRAME}
          height="100%"
        />
      </div>
      {team && (sync === 'conflict' || sync === 'gone') ? <SyncBar page={current} /> : null}
      <Toast toast={toast} onDone={done} />
    </EditorCtx.Provider>
  );
}

// When someone else saved this team page first (or deleted it), the person editing chooses
function SyncBar({ page }) {
  const sync = store.syncOf(page);
  const [busy, setBusy] = useState(false);
  const theirs = page.theirs;
  if (sync === 'gone') {
    return (
      <div className="ap-syncbar" role="alert">
        <span>Someone deleted this page from the team’s pages. Your copy is still here.</span>
        <button
          type="button"
          className="ap-btn ap-btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const made = await store.restoreGone(page.id);
            if (made && !made.error) go({ name: 'edit', id: made.id }, { replace: true });
            else setBusy(false);
          }}
        >
          Save it as a new page
        </button>
      </div>
    );
  }
  return (
    <div className="ap-syncbar" role="alert">
      <span>{(theirs && theirs.updatedBy ? who(theirs.updatedBy) : 'Someone else') + ' saved a newer version of this page' + (theirs && theirs.updatedAt ? ' ' + ago(theirs.updatedAt) : '') + '. Which one do you want to keep?'}</span>
      <button type="button" className="ap-btn" onClick={() => store.takeTheirs(page.id)}>Load their version</button>
      <button type="button" className="ap-btn ap-btn-primary" onClick={() => store.keepMine(page.id)}>Keep mine</button>
    </div>
  );
}

/* ---------- Preview ---------- */

function PreviewView({ page, draft }) {
  const data = draft ? page.draft : page.live;
  // The page's own search and link-preview tags while it is open; a draft is never listed
  useEffect(() => (data ? applyMeta(data, { url: location.href.split('?')[0], draft }) : undefined), [data, draft]);
  const id = page.id;
  const pageInfo = useMemo(
    () =>
      data
        ? {
            pageId: id,
            data,
            brand: brandOf(data),
            title: plain(data.root && data.root.props && data.root.props.title),
            pageText: pageTextFor(config, data),
            ask: askBot,
            onLead: (lead) => store.addLead(id, { ...lead, via: draft ? 'preview' : 'live page' }),
            signInHref: hrefFor({ name: 'edit', id }),
          }
        : null,
    [data, id, draft],
  );

  if (!data) {
    return (
      <div className="ap-app">
        <TopBar />
        <main className="ap-main ap-narrow" id="main">
          <h1 className="ap-h1">Not published yet</h1>
          <p className="ap-lede">{'“' + store.titleOf(page) + '” has no live version. Preview the draft or publish it from the editor.'}</p>
          <div className="ap-row">
            <a className="ap-btn ap-btn-primary" {...linkProps({ name: 'view', id: page.id, draft: true })}>Preview the draft</a>
            <a className="ap-btn" {...linkProps({ name: 'edit', id: page.id })}>Open the editor</a>
          </div>
        </main>
      </div>
    );
  }
  return (
    <>
      <div className="ap-preview">
        <PageCtx.Provider value={pageInfo}>
          <Render config={config} data={data} />
        </PageCtx.Provider>
      </div>
      <nav className="ap-pill" aria-label="Preview">
        <span>{draft ? 'Draft preview' : 'Live page'}</span>
        {!draft && store.linksOf(page) ? (
          <a href={store.linksOf(page).domain || store.linksOf(page).shared} target="_blank" rel="noopener noreferrer">
            {'On the web: ' + short(store.linksOf(page).domain || store.linksOf(page).shared)}
          </a>
        ) : null}
        <a {...linkProps({ name: 'edit', id: page.id })}>Edit page</a>
        <a {...linkProps({ name: 'dashboard' })}>All pages</a>
      </nav>
    </>
  );
}

/* ---------- App ---------- */

function App() {
  const route = useRoute();
  store.usePages();
  const [notice, setNotice] = useState('');
  const team = store.useTeam();
  const page = route.name === 'dashboard' ? null : store.getPage(route.id);
  const waiting = route.name !== 'dashboard' && !page && store.teamBusy();
  const missing = route.name !== 'dashboard' && !page && !waiting;

  useEffect(() => {
    if (missing) {
      setNotice(team.status === 'off' ? 'That page is not in this browser. If it is one of the team’s pages, sign in to open it.' : 'That page is not in the team’s pages or this browser. It may have been deleted.');
      go({ name: 'dashboard' }, { replace: true });
    }
  }, [missing]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = route.name + ':' + (route.id || '') + ':' + (route.draft ? 'd' : '');
  useEffect(() => {
    document.body.classList.toggle('ap-editing', route.name === 'edit');
    if (route.name === 'dashboard') document.title = 'Pages · Site Builder · AI Paragon';
    else if (route.name === 'edit' && page) document.title = 'Editing ' + store.titleOf(page) + ' · Site Builder';
    window.scrollTo(0, 0);
    // Opening a real page clears an old notice; the redirect away from a missing one keeps it
    if (route.name !== 'dashboard' && page) setNotice('');
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) return null;
  if (waiting) {
    return (
      <div className="ap-app">
        <TopBar />
        <main className="ap-main ap-narrow" id="main">
          <p className="ap-lede" role="status">Opening the team’s pages…</p>
        </main>
      </div>
    );
  }
  if (route.name === 'edit') return <EditorView key={page.id + ':' + (page.rev || 0)} page={page} />;
  if (route.name === 'view') return <PreviewView key={key} page={page} draft={route.draft} />;
  return <Dashboard notice={notice} clearNotice={() => setNotice('')} />;
}

// Tests reach the checks (the AI's answer, SEO, domains, the chatbot's settings and page text) through
// window.__SB_TEST__, filled only when a test sets it to true before the page loads
if (window.__SB_TEST__ === true) {
  window.__SB_TEST__ = { catalog, pageForAi, applyAnswer, makeData, config, seoOf, seoChecks, normalizeDomain, recordsFor, pairOf, botOf, brandOf, pageTextFor, startersFor, trackingOf, trackerError, checkCode, pageCode, TRACKERS };
}

store.init();
canonicalize();
createRoot(document.getElementById('root')).render(<App />);
