// Site builder demo: a dashboard of pages, a Puck editor to build each page from sections, and a
// preview of the published page. Everything is saved in this browser (see store.js).
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Puck, Render, Button, useGetPuck } from '@puckeditor/core';
import '@puckeditor/core/no-external.css';
import './app.css';
import './blocks.css';
import { config, ACCENTS, FONTS } from './blocks.jsx';
import { TEMPLATE_LIST, makeData } from './templates.js';
import * as store from './store.js';
import { canonicalize, go, hrefFor, linkProps, useRoute } from './router.js';
import { EditorCtx } from './context.js';
import { AiPanel, SparkIcon, useAiSession } from './AiPanel.jsx';
import { setPending, takePending, catalog, pageForAi, applyAnswer } from './ai.js';

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
  return (
    <div className="ap-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current(); }}>
      <div className="ap-modal" role="dialog" aria-modal="true" aria-labelledby={id + '-title'} ref={ref} tabIndex={-1}>
        <h2 id={id + '-title'}>{title}</h2>
        {children}
      </div>
    </div>
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
  const shownSlug = slugEdited ? slug : store.slugify(name);
  const finalSlug = store.freeSlug(shownSlug || name || 'page');
  const describe = template === 'describe';
  const submit = (e) => {
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
    const page = store.createPage({ title: name.trim(), slug: shownSlug || name, template: describe ? 'blank' : template });
    if (describe) setPending(page.id, about.trim());
    go({ name: 'edit', id: page.id });
  };
  return (
    <Modal id="np" title="New page" onClose={onClose}>
      <p className="ap-modal-lede">Pick a starting point. You can change everything in the editor.</p>
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
          <p id="np-slug-hint" className="ap-hint">The page will be at /{finalSlug}</p>
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
        <div className="ap-modal-actions">
          <button type="button" className="ap-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ap-btn ap-btn-primary">Create page</button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteModal({ page, onClose }) {
  const title = store.titleOf(page);
  return (
    <Modal id="del" title={'Delete “' + title + '”?'} onClose={onClose}>
      <p className="ap-modal-lede">The page{page.live ? ' and its published version' : ''} will be removed from this browser. This cannot be undone.</p>
      <div className="ap-modal-actions">
        <button type="button" className="ap-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ap-btn ap-btn-danger" onClick={() => { store.deletePage(page.id); onClose(); }}>Delete page</button>
      </div>
    </Modal>
  );
}

function ResetModal({ onClose }) {
  return (
    <Modal id="reset" title="Reset the demo?" onClose={onClose}>
      <p className="ap-modal-lede">Every page in this browser is removed and the two sample pages come back, as on a first visit.</p>
      <div className="ap-modal-actions">
        <button type="button" className="ap-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ap-btn ap-btn-danger" onClick={() => { store.resetDemo(); onClose(); }}>Reset the demo</button>
      </div>
    </Modal>
  );
}

function PageCard({ page, onDelete, onDuplicate }) {
  const st = store.statusOf(page);
  const title = store.titleOf(page);
  const n = ((page.draft && page.draft.content) || []).length;
  return (
    <li className="ap-card" data-page={page.id}>
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
        <p className="ap-card-time">Edited {ago(page.updatedAt)}{page.live ? ' · published ' + ago(page.publishedAt) : ''}</p>
      </div>
      <div className="ap-card-actions">
        <a className="ap-btn ap-btn-primary" {...linkProps({ name: 'edit', id: page.id })} aria-label={'Edit ' + title}>Edit</a>
        {page.live ? (
          <a className="ap-btn" {...linkProps({ name: 'view', id: page.id })} aria-label={'View the live ' + title + ' page'}>View live</a>
        ) : (
          <a className="ap-btn" {...linkProps({ name: 'view', id: page.id, draft: true })} aria-label={'Preview ' + title}>Preview</a>
        )}
        <button type="button" className="ap-btn" onClick={onDuplicate} aria-label={'Duplicate ' + title}>Duplicate</button>
        <button type="button" className="ap-btn ap-btn-quiet" onClick={onDelete} aria-label={'Delete ' + title}>Delete</button>
      </div>
    </li>
  );
}

function Dashboard({ notice, clearNotice }) {
  const pages = store.usePages();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState(null);
  const done = useCallback(() => setToast(null), []);
  const live = pages.filter((p) => p.live).length;
  return (
    <div className="ap-app">
      <TopBar onNew={() => setCreating(true)} />
      <main className="ap-main" id="main">
        <div className="ap-head">
          <h1 className="ap-h1">Pages</h1>
          <p className="ap-lede">
            {pages.length ? pages.length + (pages.length === 1 ? ' page, ' : ' pages, ') + live + ' live. ' : ''}
            Open a page to edit it on the page itself, then publish when it is ready.
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
        {pages.length ? (
          <ul className="ap-grid">
            {pages.map((p) => (
              <PageCard
                key={p.id}
                page={p}
                onDelete={() => setDeleting(p)}
                onDuplicate={() => {
                  const copy = store.duplicatePage(p.id);
                  if (copy) setToast({ text: 'Made a copy of “' + store.titleOf(p) + '”.', link: { label: 'Edit the copy', route: { name: 'edit', id: copy.id } } });
                }}
              />
            ))}
          </ul>
        ) : (
          <div className="ap-empty">
            <h2>No pages yet</h2>
            <p>Start one from a template or a blank page.</p>
            <button type="button" className="ap-btn ap-btn-primary" onClick={() => setCreating(true)}>New page</button>
          </div>
        )}
        <p className="ap-foot">
          Demo: pages are saved in this browser only. Built with Puck, an open-source visual editor.{' '}
          <button type="button" className="ap-linkbtn" onClick={() => setResetting(true)}>Reset the demo</button>
        </p>
      </main>
      {creating ? <NewPageModal onClose={() => setCreating(false)} /> : null}
      {deleting ? <DeleteModal page={deleting} onClose={() => setDeleting(null)} /> : null}
      {resetting ? <ResetModal onClose={() => setResetting(false)} /> : null}
      <Toast toast={toast} onDone={done} />
    </div>
  );
}

/* ---------- Editor ---------- */

// Puck's own Publish control is a <span>, which a keyboard cannot reach, so the header gets a real
// button that publishes the editor's current data
function HeaderActions() {
  const { id, status, flush, publish } = useContext(EditorCtx);
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
        {status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : 'Saved'}
      </span>
      <Button variant="secondary" href={hrefFor({ name: 'dashboard' })} onClick={leave({ name: 'dashboard' })}>All pages</Button>
      <Button variant="secondary" href={hrefFor({ name: 'view', id, draft: true })} onClick={leave({ name: 'view', id, draft: true })}>Preview</Button>
      <Button type="button" variant="secondary" icon={<SparkIcon />} onClick={openAi}>Ask AI</Button>
      <Button type="button" variant="primary" icon={<GlobeIcon />} onClick={() => publish(getPuck().appState.data)}>Publish</Button>
    </>
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
// The AI tab sits in the left rail after Blocks and Outline
const PLUGINS = [{ name: 'ai', label: 'AI', icon: <SparkIcon />, render: AiPanel }];

function EditorView({ page }) {
  const [initial] = useState(() => page.draft);
  const [pendingAsk] = useState(() => takePending(page.id));
  const [ui] = useState(() => (pendingAsk ? { plugin: { current: 'ai' }, leftSideBarVisible: true } : undefined));
  const ai = useAiSession(pendingAsk);
  const [status, setStatus] = useState(store.savingWorks() ? 'saved' : 'error');
  const [toast, setToast] = useState(null);
  const latest = useRef(null);
  const timer = useRef(0);
  const id = page.id;

  const flush = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = 0;
    if (latest.current) setStatus(store.saveDraft(id, latest.current) ? 'saved' : 'error');
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
    (data) => {
      clearTimeout(timer.current);
      timer.current = 0;
      latest.current = data;
      const ok = store.publish(id, data);
      setStatus(ok ? 'saved' : 'error');
      setToast(
        ok
          ? { text: 'Published. The live page now matches the editor.', link: { label: 'View live page', route: { name: 'view', id } } }
          : { text: 'Published for this visit only: this browser is not saving pages.' },
      );
    },
    [id],
  );

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  const ctx = useMemo(() => ({ id, status, flush, publish, ai }), [id, status, flush, publish, ai]);
  const done = useCallback(() => setToast(null), []);
  const current = store.getPage(id) || page;
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
      <Toast toast={toast} onDone={done} />
    </EditorCtx.Provider>
  );
}

/* ---------- Preview ---------- */

function PreviewView({ page, draft }) {
  const data = draft ? page.draft : page.live;
  useEffect(() => {
    const meta = document.querySelector('meta[name="description"]');
    const before = { title: document.title, desc: meta ? meta.getAttribute('content') : null };
    if (data) {
      const rp = (data.root && data.root.props) || {};
      document.title = plain(rp.title) || 'Untitled page';
      if (meta) meta.setAttribute('content', plain(rp.description));
    }
    return () => {
      document.title = before.title;
      if (meta && before.desc != null) meta.setAttribute('content', before.desc);
    };
  }, [data]);

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
        <Render config={config} data={data} />
      </div>
      <nav className="ap-pill" aria-label="Preview">
        <span>{draft ? 'Draft preview' : 'Live page'}</span>
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
  const page = route.name === 'dashboard' ? null : store.getPage(route.id);
  const missing = route.name !== 'dashboard' && !page;

  useEffect(() => {
    if (missing) {
      setNotice('That page is not in this browser. It may have been deleted.');
      go({ name: 'dashboard' }, { replace: true });
    }
  }, [missing]);

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
  if (route.name === 'edit') return <EditorView key={page.id} page={page} />;
  if (route.name === 'view') return <PreviewView key={key} page={page} draft={route.draft} />;
  return <Dashboard notice={notice} clearNotice={() => setNotice('')} />;
}

// Tests reach the AI's checks through window.__SB_TEST__, filled only when a test sets it to true
// before the page loads
if (window.__SB_TEST__ === true) window.__SB_TEST__ = { catalog, pageForAi, applyAnswer, makeData, config };

store.init();
canonicalize();
createRoot(document.getElementById('root')).render(<App />);
