// The SEO, Domain, Chatbot and Code tabs in the editor's left rail. SEO, Chatbot and Code change the
// page's settings (root props) the way Puck's own page fields do, so they autosave, go live with
// Publish and undo like any edit. The domain and the contacts the chatbot took are kept on the page record
// (store.js), since they are not content. A team page's domain is connected through Vercel
// (domains.js) and its contacts come from the server; a page in this browser keeps both here.
// Puck's rail items are divs a keyboard cannot reach, so the header's Settings button opens these
// tabs and each tab has buttons for the others.
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createUsePuck, useGetPuck } from '@puckeditor/core';
import { EditorCtx } from './context.js';
import * as store from './store.js';
import { config, ACCENTS, FONTS } from './blocks.jsx';
import { hrefFor } from './router.js';
import { seoOf, seoChecks, TITLE_RANGE, DESC_RANGE } from './seo.js';
import { normalizeDomain, recordsFor, checkDns, apexOf } from './domain.js';
import { botOf, brandOf, startersFor, pageTextFor, shownName, shownGreeting, safeBotLink, TONES, LEADS, LIMITS } from './chat.js';
import { ChatWidget } from './ChatWidget.jsx';
import { askBot } from './chat-team.js';
import { SignIn } from './AiPanel.jsx';
import { useAuth } from './auth.js';
import { askAi, applyAnswer, AiError } from './ai.js';
import { TRACKERS, UI_ORDER, CODE_MAX, trackerError, codeOf, checkCode, pageCode } from './code.js';
import { domainCall } from './domains.js';
import { SHARED_HOST } from './site/config.js';

const usePuck = createUsePuck();

export const SETTINGS_TABS = [
  { name: 'seo', label: 'SEO' },
  { name: 'domain', label: 'Domain' },
  { name: 'chat', label: 'Chatbot' },
  { name: 'code', label: 'Code' },
];

// Opens a settings tab and moves the cursor to its heading
export function openSettings(getPuck, name) {
  getPuck().dispatch({ type: 'setUi', ui: { plugin: { current: name }, leftSideBarVisible: true } });
  setTimeout(() => {
    const h = document.getElementById('set-' + name + '-h');
    if (h) h.focus();
  }, 60);
}

// The page's settings and a way to change some of them (an object, or a function of the settings)
function useRoot() {
  const getPuck = useGetPuck();
  const root = usePuck((s) => s.appState.data.root);
  const patch = (changes) => {
    const { appState, dispatch } = getPuck();
    const r = appState.data.root || { props: {} };
    const props = r.props || {};
    const add = typeof changes === 'function' ? changes(props) : changes;
    dispatch({ type: 'replaceRoot', root: { ...r, props: { ...props, ...add } }, recordHistory: true });
  };
  return [(root && root.props) || {}, patch];
}

function Nav({ current }) {
  const getPuck = useGetPuck();
  return (
    <nav className="ap-set-nav" aria-label="Page settings">
      {SETTINGS_TABS.map((t) => (
        <button key={t.name} type="button" aria-current={t.name === current ? 'page' : undefined} onClick={() => t.name !== current && openSettings(getPuck, t.name)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function Head({ name, title, children }) {
  return (
    <div className="ap-set-head">
      <h2 id={'set-' + name + '-h'} className="ap-set-h" tabIndex={-1}>{title}</h2>
      <p className="ap-set-lede">{children}</p>
    </div>
  );
}

function Count({ n, range }) {
  const off = n < range[0] || n > range[1];
  return (
    <span className="ap-count" data-off={off ? 'true' : undefined}>
      {n} / {range[1]}
    </span>
  );
}

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

// The page's own domain, if one is saved, and the address its live page opens at: a team page's
// shared link (once published), or the builder's own preview for a page in this browser
function useLiveAddress(id) {
  store.usePages();
  const page = store.getPage(id);
  const domain = store.domainOf(page);
  if (page && page.where === 'team') {
    const st = page.domainState || null;
    return { domain, now: SHARED_HOST + '/' + (page.liveSlug || store.slugOf(page)), team: true, live: !!page.live, state: st, connected: !!(st && st.connected), page };
  }
  const u = new URL(hrefFor({ name: 'view', id }), location.href);
  return { domain, now: (u.host + u.pathname + u.hash).replace(/\/$/, ''), team: false, live: !!(page && page.live), state: null, connected: false, page };
}

/* ---------- SEO ---------- */

const AI_ASK =
  'Write the title in Google (seoTitle, 50 to 60 characters, with the brand name at the end) and the search description (description, 120 to 155 characters) for this page, from what the page says. Change nothing else.';

export function SeoPanel() {
  const { id } = useContext(EditorCtx);
  const getPuck = useGetPuck();
  const data = usePuck((s) => s.appState.data);
  const [props, patch] = useRoot();
  const who = useAuth();
  const [ai, setAi] = useState(null); // { busy } | { line, tone }
  const ctrl = useRef(null);
  useEffect(() => () => ctrl.current && ctrl.current.abort(), []);
  const seo = seoOf(data);
  const checks = useMemo(() => seoChecks(data), [data]);
  const passed = checks.filter((c) => c.ok).length;
  const where = useLiveAddress(id);
  const { domain, now } = where;
  const host = domain || now.split('/')[0] || 'this page';
  const urlLine = domain ? domain : now.split(/[/#]+/).filter(Boolean).join(' › ');
  const image = String(props.socialImage || '').trim();
  const badImage = image && !seo.image;

  const write = async () => {
    if (!who) {
      getPuck().dispatch({ type: 'setUi', ui: { plugin: { current: 'ai' }, leftSideBarVisible: true } });
      return;
    }
    const ac = new AbortController();
    ctrl.current = ac;
    setAi({ busy: true });
    try {
      const before = getPuck().appState.data;
      const answer = await askAi({ ask: AI_ASK, data: before, signal: ac.signal });
      const res = applyAnswer(getPuck().appState.data, answer, { ask: AI_ASK, before });
      // Only the two search settings come from this answer, never sections
      const got = res.data.root.props || {};
      const cur = getPuck().appState.data.root.props || {};
      const add = {};
      if (typeof got.seoTitle === 'string' && got.seoTitle !== cur.seoTitle) add.seoTitle = got.seoTitle;
      if (typeof got.description === 'string' && got.description !== cur.description) add.description = got.description;
      if (Object.keys(add).length) patch(add);
      setAi({ line: Object.keys(add).length ? 'Wrote the title and description. Read them over above.' : 'The AI kept them as they are.', tone: 'ok' });
    } catch (e) {
      if (e instanceof AiError && e.code === 'stopped') setAi(null);
      else setAi({ line: e instanceof AiError ? e.message : 'Something went wrong. Try again.', tone: 'error' });
    } finally {
      if (ctrl.current === ac) ctrl.current = null;
    }
  };

  return (
    <div className="ap-set">
      <Nav current="seo" />
      <Head name="seo" title="SEO">How the page shows in Google and when someone shares its link.</Head>

      <div className="ap-serp" aria-label="How it could look in Google">
        <p className="ap-serp-site">
          <span className="ap-serp-fav" aria-hidden="true">{brandOf(data).slice(0, 1).toUpperCase()}</span>
          <span>{urlLine}</span>
        </p>
        <p className="ap-serp-title">{cut(seo.title, 62)}</p>
        <p className="ap-serp-desc">{seo.description ? cut(seo.description, 158) : 'No description yet, so Google shows some text from the page.'}</p>
      </div>

      <div className="ap-field">
        <label htmlFor="seo-title">Title in Google</label>
        <input
          id="seo-title"
          className="ap-input"
          value={props.seoTitle || ''}
          maxLength={120}
          placeholder={(props.title || '') + ' (the page name)'}
          aria-describedby="seo-title-hint"
          onChange={(e) => patch({ seoTitle: e.target.value })}
        />
        <p id="seo-title-hint" className="ap-hint ap-set-hint">
          <span>{seo.ownTitle ? 'What you do, then your name.' : 'Empty, it uses the page name.'}</span>
          <Count n={seo.title.length} range={TITLE_RANGE} />
        </p>
      </div>

      <div className="ap-field">
        <label htmlFor="seo-desc">Search description</label>
        <textarea
          id="seo-desc"
          className="ap-input ap-textarea"
          rows={3}
          maxLength={300}
          value={props.description || ''}
          aria-describedby="seo-desc-hint"
          onChange={(e) => patch({ description: e.target.value })}
        />
        <p id="seo-desc-hint" className="ap-hint ap-set-hint">
          <span>One or two sentences on who it is for and what to do next.</span>
          <Count n={seo.description.length} range={DESC_RANGE} />
        </p>
      </div>

      <div className="ap-set-ai">
        <button type="button" className="ap-btn ap-ai-wide" onClick={write} disabled={!!(ai && ai.busy)}>
          {ai && ai.busy ? 'Writing…' : who ? 'Write both with AI' : 'Sign in on the AI tab to write them with AI'}
        </button>
        {ai && ai.line ? (
          <p className={ai.tone === 'error' ? 'ap-error' : 'ap-hint'} role={ai.tone === 'error' ? 'alert' : 'status'}>
            {ai.line}
          </p>
        ) : null}
      </div>

      <div className="ap-field">
        <label htmlFor="seo-image">Picture for link previews</label>
        <input
          id="seo-image"
          className="ap-input"
          type="url"
          inputMode="url"
          value={props.socialImage || ''}
          placeholder="https://"
          aria-invalid={badImage ? 'true' : undefined}
          aria-describedby="seo-image-hint"
          onChange={(e) => patch({ socialImage: e.target.value })}
        />
        <p id="seo-image-hint" className={badImage ? 'ap-error' : 'ap-hint'}>
          {badImage ? 'Use a full https:// link to the picture.' : 'Shows when the link is shared on LinkedIn, Facebook or in a text. About 1200 by 630 pixels.'}
        </p>
      </div>

      <div className="ap-share" aria-label="How a shared link could look">
        {seo.image ? <img src={seo.image} alt="" /> : <span className="ap-share-none">No picture</span>}
        <span className="ap-share-text">
          <small>{host}</small>
          <b>{cut(seo.title, 70)}</b>
          {seo.description ? <span>{cut(seo.description, 110)}</span> : null}
        </span>
      </div>

      <label className="ap-check">
        <input type="checkbox" checked={props.noindex === true} onChange={(e) => patch({ noindex: e.target.checked })} />
        <span>
          <b>Hide this page from search engines</b>
          <small>For thank-you pages, tests and private offers.</small>
        </span>
      </label>

      <section className="ap-checks" aria-labelledby="seo-checks-h">
        <h3 id="seo-checks-h">
          Checks <span>{passed} of {checks.length} pass</span>
        </h3>
        <ul>
          {checks.map((c) => (
            <li key={c.key} data-ok={c.ok ? 'true' : 'false'}>
              <span className="ap-check-mark" aria-hidden="true">{c.ok ? '✓' : '!'}</span>
              <span>
                <span className="ap-sr">{c.ok ? 'Passes: ' : 'To fix: '}</span>
                {c.text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="ap-set-note">
        {!where.team
          ? 'This page is only in this browser, so search engines can’t find it. Sign in and publish it from the team’s pages to put it on the web; these settings go out with it.'
          : !where.live
            ? 'Search engines can find the page once it is published, at ' + now + (domain ? ' and at ' + domain + ' once that is connected' : '') + '.'
            : props.noindex === true
              ? 'The live page asks search engines to leave it out.'
              : 'Search engines can find the live page at ' + (where.connected ? domain : now) + '. A change here goes out with the next Publish.'}
      </p>
    </div>
  );
}

/* ---------- Domain ---------- */

function Copy({ text, label }) {
  const [done, setDone] = useState('');
  const go = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone('Copied');
    } catch (e) {
      setDone('Select it and copy');
    }
    setTimeout(() => setDone(''), 2500);
  };
  return (
    <button type="button" className="ap-copy" onClick={go} aria-label={'Copy ' + label}>
      {done || 'Copy'}
    </button>
  );
}

function pointsLine(r, team) {
  if (r.status === 'failed') return 'Could not check just now. Try again in a minute.';
  if (r.status === 'missing') return 'Not found in DNS. Check the spelling, and that the domain is registered.';
  if (r.status === 'empty') return 'Has no address records yet.';
  if (r.here) return team ? 'Points to Vercel.' : 'Already points to Vercel.';
  const to = r.cname.length ? r.cname[0] : r.a.join(', ');
  return 'Points to ' + to + ', most likely your current website.';
}

function Records({ records }) {
  return (
    <table className="ap-rec">
      <thead>
        <tr>
          <th scope="col">Type</th>
          <th scope="col">Name</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={r.type + r.name + r.value}>
            <td>{r.type}</td>
            <td>{r.name}</td>
            <td>
              <code>{r.value}</code>
              <Copy text={r.value} label={r.type + ' value for ' + (r.host || r.name)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Vercel's records name the host in full; DNS settings want the part before the domain (@ for it)
function asDnsName(name, apex) {
  const n = String(name || '').replace(/\.$/, '');
  if (!apex || n === apex) return '@';
  return n.endsWith('.' + apex) ? n.slice(0, -apex.length - 1) : n;
}

export function DomainPanel() {
  const { id } = useContext(EditorCtx);
  const where = useLiveAddress(id);
  const { domain, now, team } = where;
  // Puck keeps every tab's panel mounted, so DNS is only read while this tab is the one showing
  const shown = usePuck((s) => !!(s.appState.ui.plugin && s.appState.ui.plugin.current === 'domain' && s.appState.ui.leftSideBarVisible));
  const [text, setText] = useState(domain);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(!domain);
  const [dns, setDns] = useState(null); // { busy } | { results }
  const [busy, setBusy] = useState(''); // save | connect | check | remove
  const [said, setSaid] = useState(null); // { text, tone }
  const ctrl = useRef(null);

  const runCheck = async (host) => {
    if (ctrl.current) ctrl.current.abort();
    const ac = new AbortController();
    ctrl.current = ac;
    setDns({ busy: true });
    try {
      const results = await checkDns(host, ac.signal);
      if (!ac.signal.aborted) setDns({ results });
    } catch (e) {
      if (!ac.signal.aborted) setDns({ results: [{ host, status: 'failed', cname: [], a: [] }] });
    }
  };
  useEffect(() => {
    if (domain && shown) runCheck(domain);
    else if (!domain) setDns(null);
    return () => ctrl.current && ctrl.current.abort();
  }, [domain, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  // A team page's domain on Vercel: added (connect), looked at again (check) or taken off (remove)
  const vercel = async (action, host) => {
    setBusy(action);
    setSaid(null);
    try {
      const st = await domainCall(action, host);
      if (action !== 'remove') {
        await store.setDomainState(id, st);
        setSaid(st.connected ? { text: 'Connected. The page is live at ' + host + '.', tone: 'ok' } : null);
      }
      return true;
    } catch (e) {
      setSaid({ text: e.message, tone: e.code === 'off' ? 'info' : 'warn' });
      return e.code === 'off';
    } finally {
      setBusy('');
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const n = normalizeDomain(text);
    if (n.error) {
      setError(n.error);
      document.getElementById('dom-name').focus();
      return;
    }
    if (team) setBusy('save');
    const r = await Promise.resolve(store.setDomain(id, n.host));
    if (team) setBusy('');
    if (r.error) {
      setError(r.error);
      return;
    }
    setText(n.host);
    setError('');
    setEditing(false);
    if (team) vercel('connect', n.host);
  };
  const remove = async () => {
    if (team) {
      const ok = await vercel('remove', domain);
      if (!ok) return;
      setBusy('remove');
      const r = await store.setDomain(id, '');
      setBusy('');
      if (r.error) {
        setSaid({ text: r.error, tone: 'warn' });
        return;
      }
    } else {
      store.setDomain(id, '');
    }
    setText('');
    setSaid(null);
    setEditing(true);
    setTimeout(() => {
      const el = document.getElementById('dom-name');
      if (el) el.focus();
    }, 0);
  };
  const again = () => {
    runCheck(domain);
    if (team) vercel('check', domain);
  };

  const st = where.state;
  const apex = domain ? apexOf(domain) : '';
  const records = team && st && st.records && st.records.length ? st.verification.concat(st.records).map((r) => ({ ...r, name: asDnsName(r.name, apex) })) : domain ? recordsFor(domain) : [];
  const chip = !team ? 'Not connected yet' : where.connected ? 'Connected' : st ? 'Waiting for DNS' : 'Not connected yet';
  return (
    <div className="ap-set">
      <Nav current="domain" />
      <Head name="domain" title="Domain">Put the page on the business’s own address, like www.yourbusiness.com.</Head>

      <p className="ap-set-now">
        <span>{team ? (where.live ? 'Live at' : 'Once published') : 'Address now'}</span>
        <code>{now}</code>
        <small>{team ? 'The shared link works with or without a domain.' : 'This page is only in this browser.'}</small>
      </p>

      {editing ? (
        <form className="ap-field" onSubmit={save} noValidate>
          <label htmlFor="dom-name">Your domain</label>
          <div className="ap-set-row">
            <input
              id="dom-name"
              className="ap-input"
              value={text}
              placeholder="www.yourbusiness.com"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'dom-err' : undefined}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError('');
              }}
            />
            <button type="submit" className="ap-btn ap-btn-primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : team ? 'Connect' : 'Save'}</button>
          </div>
          {error ? <p id="dom-err" className="ap-error" role="alert">{error}</p> : null}
          {domain ? (
            <button type="button" className="ap-linkbtn ap-set-small" onClick={() => { setText(domain); setError(''); setEditing(false); }}>
              Keep {domain}
            </button>
          ) : null}
        </form>
      ) : (
        <div className="ap-dom">
          <p className="ap-dom-name">
            <b>{domain}</b>
            <span className={'ap-status ' + (where.connected ? 'ap-status-live' : 'ap-status-draft')}>{chip}</span>
          </p>
          <div className="ap-set-row">
            <button type="button" className="ap-btn" onClick={() => setEditing(true)} disabled={!!busy}>Change</button>
            <button type="button" className="ap-btn ap-btn-quiet" onClick={remove} disabled={!!busy}>{busy === 'remove' ? 'Removing…' : 'Remove'}</button>
          </div>
        </div>
      )}

      {busy === 'connect' || busy === 'check' ? (
        <p className="ap-hint" role="status">{busy === 'connect' ? 'Adding the domain on Vercel…' : 'Asking Vercel…'}</p>
      ) : said ? (
        <p className={said.tone === 'warn' ? 'ap-set-warn' : said.tone === 'ok' ? 'ap-set-ok' : 'ap-hint'} role={said.tone === 'warn' ? 'alert' : 'status'}>{said.text}</p>
      ) : null}

      {domain ? (
        <>
          <section className="ap-dns" aria-labelledby="dns-h" aria-busy={dns && dns.busy ? 'true' : undefined}>
            <h3 id="dns-h">Where it points now</h3>
            {dns && dns.results ? (
              <ul>
                {dns.results.map((r) => (
                  <li key={r.host} data-state={r.here ? 'here' : r.status}>
                    <b>{r.host}</b>
                    <span>{pointsLine(r, team)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ap-hint" role="status">Checking DNS…</p>
            )}
            <button type="button" className="ap-btn" onClick={again} disabled={!!(dns && dns.busy) || busy === 'check'}>
              {(dns && dns.busy) || busy === 'check' ? 'Checking…' : 'Check again'}
            </button>
          </section>

          {!where.connected ? (
            <section className="ap-dns" aria-labelledby="rec-h">
              <h3 id="rec-h">{team && st && st.records && st.records.length ? 'Records to add' : 'Records it will need'}</h3>
              {!team ? (
                <p className="ap-set-warn">Don’t add these yet. This page is only in this browser, so the domain would stop showing your current site.</p>
              ) : !where.live ? (
                <p className="ap-set-warn">Publish the page first. Adding these before then would stop the domain showing your current site.</p>
              ) : (
                <p className="ap-hint">Add these and the page shows at the domain once Vercel sees them, usually within minutes, sometimes up to a day.</p>
              )}
              <Records records={records} />
              <p className="ap-hint">Add them where the domain was bought (GoDaddy, Namecheap, Squarespace and the like), in its DNS settings.</p>
            </section>
          ) : null}
        </>
      ) : null}

      <p className="ap-set-note">
        {team
          ? 'Domains are added to the sites project on Vercel, with HTTPS set up for them on their own.'
          : 'A domain needs the page to be on the web: sign in and move the page to the team’s pages. The domain is saved here now, and the check reads its real DNS.'}
      </p>
    </div>
  );
}

/* ---------- Chatbot ---------- */

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // a spreadsheet must not read a contact's words as a formula
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

const when = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Leads({ id, shown }) {
  store.usePages();
  const page = store.getPage(id);
  const leads = store.leadsOf(page);
  const team = !!(page && page.where === 'team');
  const [sure, setSure] = useState(false);
  const [said, setSaid] = useState('');
  // Visitors' contacts are read while the tab shows (Puck keeps every tab mounted)
  useEffect(() => {
    if (!team || !shown) return;
    store.loadLeads(id).then((r) => setSaid(r && r.error ? 'Could not read the contacts just now: ' + r.error : ''));
  }, [team, shown, id]);
  const clear = async () => {
    const r = await Promise.resolve(store.clearLeads(id));
    setSure(false);
    setSaid(r && r.error ? r.error : '');
  };
  const csv = () => {
    const rows = [['When', 'Name', 'Email', 'Phone', 'Question', 'Where']].concat(
      leads.map((l) => [new Date(l.at).toISOString(), l.name, l.email, l.phone || '', l.question || '', l.via || '']),
    );
    download(store.slugOf(page) + '-chat-contacts.csv', rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
  };
  return (
    <section className="ap-leads" aria-labelledby="leads-h">
      <h3 id="leads-h">
        Contacts from the chat <span>{leads.length}</span>
      </h3>
      {leads.length ? (
        <>
          <ul>
            {leads.slice(0, 20).map((l) => (
              <li key={(l.id || l.at) + l.email}>
                <b>{l.name}</b>
                <span>{l.email}{l.phone ? ' · ' + l.phone : ''}</span>
                {l.question ? <span className="ap-leads-q">“{l.question}”</span> : null}
                <small>{when(l.at)}</small>
              </li>
            ))}
          </ul>
          {leads.length > 20 ? <p className="ap-hint">And {leads.length - 20} more in the download.</p> : null}
          <div className="ap-set-row">
            <button type="button" className="ap-btn" onClick={csv}>Download CSV</button>
            {sure ? (
              <>
                <button type="button" className="ap-btn ap-btn-danger" onClick={clear}>Clear {leads.length}</button>
                <button type="button" className="ap-btn ap-btn-quiet" onClick={() => setSure(false)}>Keep them</button>
              </>
            ) : (
              <button type="button" className="ap-btn ap-btn-quiet" onClick={() => setSure(true)}>Clear</button>
            )}
          </div>
        </>
      ) : (
        <p className="ap-hint">None yet. When someone leaves their details in the chat, they show here{team ? ', for the whole team' : ''}.</p>
      )}
      {said ? <p className="ap-set-warn" role="alert">{said}</p> : null}
    </section>
  );
}

function Field({ id, label, hint, children }) {
  return (
    <div className="ap-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <p id={id + '-hint'} className="ap-hint">{hint}</p> : null}
    </div>
  );
}

export function ChatPanel() {
  const { id } = useContext(EditorCtx);
  const data = usePuck((s) => s.appState.data);
  const shown = usePuck((s) => !!(s.appState.ui.plugin && s.appState.ui.plugin.current === 'chat' && s.appState.ui.leftSideBarVisible));
  const where = useLiveAddress(id);
  const [props, patch] = useRoot();
  const who = useAuth();
  const [round, setRound] = useState(0);
  const bot = botOf(props);
  const brand = brandOf(data);
  const pageText = useMemo(() => pageTextFor(config, data), [data]);
  const starters = startersFor(bot, data);
  const raw = props.chatbot || {};
  const setBot = (changes) => patch((p) => ({ chatbot: { ...(p.chatbot || {}), ...changes } }));
  const rawStarters = Array.isArray(raw.starters) ? raw.starters : [];
  const linkText = typeof raw.link === 'string' ? raw.link : '';
  const badLink = linkText.trim() && !safeBotLink(linkText);

  return (
    <div className="ap-set">
      <Nav current="chat" />
      <Head name="chat" title="Chatbot">A chat button on the page that answers visitors from the page and the facts you give it.</Head>

      <label className="ap-check ap-check-big">
        <input type="checkbox" checked={bot.on} onChange={(e) => setBot({ on: e.target.checked })} />
        <span>
          <b>Show the chatbot on this page</b>
          <small>It appears on the preview and the live page, in the {bot.side} corner.</small>
        </span>
      </label>

      {bot.on ? (
        <>
          <Field id="bot-name" label="Name">
            <input id="bot-name" className="ap-input" value={raw.name || ''} maxLength={LIMITS.name} placeholder={shownName({ name: '' }, brand)} onChange={(e) => setBot({ name: e.target.value })} />
          </Field>
          <Field id="bot-greeting" label="First message">
            <input id="bot-greeting" className="ap-input" value={raw.greeting || ''} maxLength={LIMITS.greeting} placeholder={shownGreeting({ greeting: '' }, brand)} onChange={(e) => setBot({ greeting: e.target.value })} />
          </Field>
          <Field id="bot-knows" label="What it should know" hint="Facts that are not on the page: hours, prices, the area you serve, policies. It reads the page itself too, and says so when it does not know.">
            <textarea id="bot-knows" className="ap-input ap-textarea" rows={5} maxLength={LIMITS.knows} value={raw.knows || ''} aria-describedby="bot-knows-hint" onChange={(e) => setBot({ knows: e.target.value })} />
          </Field>
          <Field id="bot-rules" label="Rules" hint="What it must not do or say.">
            <textarea id="bot-rules" className="ap-input ap-textarea" rows={3} maxLength={LIMITS.rules} value={raw.rules || ''} placeholder="For example: never quote prices; send billing questions to the team." aria-describedby="bot-rules-hint" onChange={(e) => setBot({ rules: e.target.value })} />
          </Field>
          <fieldset className="ap-field ap-fieldset">
            <legend>Tone</legend>
            <div className="ap-seg">
              {TONES.map((t) => (
                <label key={t.value}>
                  <input type="radio" name="bot-tone" value={t.value} checked={bot.tone === t.value} onChange={() => setBot({ tone: t.value })} />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="ap-field ap-fieldset">
            <legend>Suggested questions</legend>
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                className="ap-input ap-set-stack"
                aria-label={'Suggested question ' + (i + 1)}
                maxLength={LIMITS.starter}
                value={rawStarters[i] || ''}
                onChange={(e) => {
                  const next = [0, 1, 2].map((k) => (k === i ? e.target.value : rawStarters[k] || ''));
                  setBot({ starters: next });
                }}
              />
            ))}
            <p className="ap-hint">{bot.starters.length ? 'Shown before the first message.' : starters.length ? 'Empty, the first questions from the page’s FAQ show.' : 'Optional. Shown before the first message.'}</p>
          </fieldset>
          <Field id="bot-leads" label="Ask for contact details">
            <select id="bot-leads" className="ap-input" value={bot.leads} onChange={(e) => setBot({ leads: e.target.value })}>
              {LEADS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field id="bot-link" label="Booking or contact link">
            <input
              id="bot-link"
              className="ap-input"
              value={linkText}
              maxLength={LIMITS.link}
              placeholder="https://calendly.com/…"
              aria-invalid={badLink ? 'true' : undefined}
              aria-describedby="bot-link-hint"
              onChange={(e) => setBot({ link: e.target.value })}
            />
            <p id="bot-link-hint" className={badLink ? 'ap-error' : 'ap-hint'}>
              {badLink ? 'Use a full link (https://…), mailto:, tel: or a section like #contact.' : 'Offered as a button when someone wants to book or buy.'}
            </p>
          </Field>
          {bot.link ? (
            <Field id="bot-link-label" label="Button text for the link">
              <input id="bot-link-label" className="ap-input" value={raw.linkLabel || ''} maxLength={LIMITS.linkLabel} placeholder="Book a time" onChange={(e) => setBot({ linkLabel: e.target.value })} />
            </Field>
          ) : null}
          <div className="ap-set-pair">
            <Field id="bot-label" label="Chat button text">
              <input id="bot-label" className="ap-input" value={raw.label == null ? 'Chat with us' : raw.label} maxLength={LIMITS.label} onChange={(e) => setBot({ label: e.target.value })} />
            </Field>
            <fieldset className="ap-field ap-fieldset">
              <legend>Corner</legend>
              <div className="ap-seg">
                {['right', 'left'].map((s) => (
                  <label key={s}>
                    <input type="radio" name="bot-side" value={s} checked={bot.side === s} onChange={() => setBot({ side: s })} />
                    <span>{s === 'right' ? 'Right' : 'Left'}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <section className="ap-try" aria-labelledby="try-h">
            <h3 id="try-h">
              Try it
              {who ? (
                <button type="button" className="ap-linkbtn ap-set-small" onClick={() => setRound((r) => r + 1)}>Start over</button>
              ) : null}
            </h3>
            {who ? (
              <div
                className="sb-site sb-chat-host"
                data-theme={props.theme === 'light' ? 'light' : 'dark'}
                data-motion="off"
                style={{ '--acc-d': (ACCENTS[props.accent] || ACCENTS.cyan).dark, '--acc-l': (ACCENTS[props.accent] || ACCENTS.cyan).light, '--font-head': (FONTS[props.font] || FONTS.grotesk).head }}
              >
                <ChatWidget key={round} embedded bot={bot} brand={brand} title={props.title} pageText={pageText} starters={starters} ask={askBot} onLead={(lead) => store.addLead(id, { ...lead, via: 'editor' })} />
              </div>
            ) : (
              <SignIn prefix="chat" lede="Sign in with your AI Paragon account to try the chatbot here. Visitors chat on the live page without signing in." />
            )}
          </section>

          <Leads id={id} shown={shown} />
        </>
      ) : null}

      <p className="ap-set-note">
        {where.team
          ? 'Visitors chat on the live page (' + where.now + (where.connected ? ' and ' + where.domain : '') + ') once it is published, with limits per visitor and per page. Contacts they leave show here for the team. Try it here answers from this draft.'
          : 'This page is only in this browser, so only signed-in team members can try the chatbot, here and on the preview. Contacts are kept in this browser.'}
      </p>
    </div>
  );
}

/* ---------- Custom code ---------- */

const CODE_BOX = { className: 'ap-input ap-textarea ap-code', spellCheck: false, autoCapitalize: 'off', autoComplete: 'off', autoCorrect: 'off', wrap: 'off', maxLength: CODE_MAX };

export function CodePanel() {
  const { id } = useContext(EditorCtx);
  const where = useLiveAddress(id);
  const [props, patch] = useRoot();
  const raw = props.tracking || {};
  const code = codeOf(props);
  const report = useMemo(() => checkCode(props), [props.tracking, props.code]); // eslint-disable-line react-hooks/exhaustive-deps
  const out = useMemo(() => pageCode(props), [props.tracking, props.code]); // eslint-disable-line react-hooks/exhaustive-deps
  const setTag = (key, v) => patch((p) => ({ tracking: { ...(p.tracking || {}), [key]: v } }));
  const setCode = (key, v) => patch((p) => ({ code: { ...(p.code || {}), [key]: v } }));
  const n = (v) => v.length.toLocaleString('en-US');
  const blocks = [
    ['In the head', out.head],
    ['Right after <body>', out.bodyStart],
    ['At the end of the body', out.bodyEnd],
  ].filter(([, v]) => v);

  return (
    <div className="ap-set">
      <Nav current="code" />
      <Head name="code" title="Custom code">Tracking tags and your own code for this page, like custom code in Webflow.</Head>
      <p className="ap-set-warn" id="code-where">
        {where.team
          ? 'Code runs on the live page (' + where.now + (where.domain ? ' and ' + where.domain : '') + ') after Publish.'
          : 'Code runs only on pages on the web: sign in and publish the page from the team’s pages.'}{' '}
        It never runs in the editor or on these previews, which share their web address with AI Paragon’s own tools.
      </p>

      <section className="ap-code-tags" aria-labelledby="code-tags-h">
        <h3 id="code-tags-h">Tracking</h3>
        {UI_ORDER.map((key) => {
          const t = TRACKERS.find((x) => x.key === key);
          const v = typeof raw[key] === 'string' ? raw[key] : '';
          const err = trackerError(t, v);
          return (
            <div className="ap-field" key={key}>
              <label htmlFor={'trk-' + key}>
                {t.label} <span className="ap-field-sub">{t.field}</span>
              </label>
              <input
                id={'trk-' + key}
                className="ap-input ap-mono"
                value={v}
                placeholder={t.placeholder}
                maxLength={30}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                aria-invalid={err ? 'true' : undefined}
                aria-describedby={'trk-' + key + '-hint'}
                onChange={(e) => setTag(key, e.target.value)}
              />
              <p id={'trk-' + key + '-hint'} className={err ? 'ap-error' : 'ap-hint'}>{err || t.help}</p>
            </div>
          );
        })}
      </section>

      <div className="ap-field">
        <label htmlFor="code-head">Code in the head</label>
        <textarea id="code-head" {...CODE_BOX} rows={6} value={code.head} placeholder={'<meta name="…" content="…">'} aria-describedby="code-head-hint" onChange={(e) => setCode('head', e.target.value)} />
        <p id="code-head-hint" className="ap-hint ap-set-hint">
          <span>Verification and meta tags, styles, and scripts that must load first.</span>
          <span className="ap-count">{n(code.head)} / 20,000</span>
        </p>
      </div>
      <div className="ap-field">
        <label htmlFor="code-body">Code at the end of the body</label>
        <textarea id="code-body" {...CODE_BOX} rows={6} value={code.body} placeholder={'<script src="https://…"></script>'} aria-describedby="code-body-hint" onChange={(e) => setCode('body', e.target.value)} />
        <p id="code-body-hint" className="ap-hint ap-set-hint">
          <span>Chat widgets and other scripts.</span>
          <span className="ap-count">{n(code.body)} / 20,000</span>
        </p>
      </div>

      <section className="ap-checks ap-code-report" aria-labelledby="code-rep-h">
        <h3 id="code-rep-h">What it adds</h3>
        {report.empty ? (
          <p className="ap-hint">Nothing yet.</p>
        ) : (
          <>
            {report.found.length ? (
              <ul className="ap-code-found">
                {report.found.map((f) => (
                  <li key={f.key + f.from}>
                    <b>{f.label}</b>
                    {f.id ? <code>{f.id}</code> : null}
                    <small>{f.from === 'field' ? 'from its box' : 'in your code'}</small>
                  </li>
                ))}
              </ul>
            ) : null}
            {report.counts.scripts || report.counts.styles || report.counts.meta || report.counts.frames ? (
              <p className="ap-hint">
                {[
                  report.counts.scripts ? report.counts.scripts + (report.counts.scripts === 1 ? ' script' : ' scripts') + (report.counts.external ? ' (' + report.counts.external + ' loaded from another site)' : '') : '',
                  report.counts.styles ? report.counts.styles + (report.counts.styles === 1 ? ' style sheet' : ' style sheets') : '',
                  report.counts.meta ? report.counts.meta + (report.counts.meta === 1 ? ' meta tag' : ' meta tags') : '',
                  report.counts.frames ? report.counts.frames + (report.counts.frames === 1 ? ' frame' : ' frames') : '',
                ]
                  .filter(Boolean)
                  .join(', ')}{' '}
                in your code.
              </p>
            ) : null}
            {report.hosts.length ? <p className="ap-hint">Your code loads from {report.hosts.join(', ')}.</p> : null}
          </>
        )}
        {report.warnings.length ? (
          <ul className="ap-code-warn" aria-label="To look at">
            {report.warnings.map((w) => (
              <li key={w}>
                <span className="ap-check-mark" aria-hidden="true">!</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {blocks.length ? (
        <details className="ap-code-out">
          <summary>See the code that goes on the page</summary>
          {blocks.map(([where, text]) => (
            <div key={where}>
              <p>{where}</p>
              <pre tabIndex={0}>{text}</pre>
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}
