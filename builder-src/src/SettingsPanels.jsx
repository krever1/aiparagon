// The SEO, Domain and Chatbot tabs in the editor's left rail. SEO and Chatbot change the page's
// settings (root props) the way Puck's own page fields do, so they autosave, go live with Publish
// and undo like any edit. The domain and the contacts the chatbot took are kept on the page record
// (store.js), since they are not content. Puck's rail items are divs a keyboard cannot reach, so
// the header's Settings button opens these tabs and each tab has buttons for the other two.
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createUsePuck, useGetPuck } from '@puckeditor/core';
import { EditorCtx } from './context.js';
import * as store from './store.js';
import { config, ACCENTS, FONTS } from './blocks.jsx';
import { hrefFor } from './router.js';
import { seoOf, seoChecks, TITLE_RANGE, DESC_RANGE } from './seo.js';
import { normalizeDomain, recordsFor, checkDns } from './domain.js';
import { botOf, brandOf, startersFor, pageTextFor, shownName, shownGreeting, safeBotLink, TONES, LEADS, LIMITS } from './chat.js';
import { ChatWidget } from './ChatWidget.jsx';
import { SignIn } from './AiPanel.jsx';
import { useAuth } from './auth.js';
import { askAi, applyAnswer, AiError } from './ai.js';

const usePuck = createUsePuck();

export const SETTINGS_TABS = [
  { name: 'seo', label: 'SEO' },
  { name: 'domain', label: 'Domain' },
  { name: 'chat', label: 'Chatbot' },
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

// The page's own domain, if one is saved, and the address its live page opens at today
function useLiveAddress(id) {
  store.usePages();
  const domain = store.domainOf(store.getPage(id));
  const u = new URL(hrefFor({ name: 'view', id }), location.href);
  return { domain, now: (u.host + u.pathname + u.hash).replace(/\/$/, '') };
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
  const { domain, now } = useLiveAddress(id);
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

      <p className="ap-set-note">Pages are saved in this browser for now, so search engines can’t find them yet. These settings go out with the page once pages are hosted.</p>
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

function pointsLine(r) {
  if (r.status === 'failed') return 'Could not check just now. Try again in a minute.';
  if (r.status === 'missing') return 'Not found in DNS. Check the spelling, and that the domain is registered.';
  if (r.status === 'empty') return 'Has no address records yet.';
  if (r.here) return 'Already points to Vercel. The page shows there once pages are hosted.';
  const to = r.cname.length ? r.cname[0] : r.a.join(', ');
  return 'Points to ' + to + ', most likely your current website.';
}

export function DomainPanel() {
  const { id } = useContext(EditorCtx);
  const { domain, now } = useLiveAddress(id);
  // Puck keeps every tab's panel mounted, so DNS is only read while this tab is the one showing
  const shown = usePuck((s) => !!(s.appState.ui.plugin && s.appState.ui.plugin.current === 'domain' && s.appState.ui.leftSideBarVisible));
  const [text, setText] = useState(domain);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(!domain);
  const [dns, setDns] = useState(null); // { busy } | { results }
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

  const save = (e) => {
    e.preventDefault();
    const n = normalizeDomain(text);
    if (n.error) {
      setError(n.error);
      document.getElementById('dom-name').focus();
      return;
    }
    const r = store.setDomain(id, n.host);
    if (r.error) {
      setError(r.error);
      return;
    }
    setText(n.host);
    setError('');
    setEditing(false);
  };
  const remove = () => {
    store.setDomain(id, '');
    setText('');
    setEditing(true);
    setTimeout(() => {
      const el = document.getElementById('dom-name');
      if (el) el.focus();
    }, 0);
  };

  const records = domain ? recordsFor(domain) : [];
  return (
    <div className="ap-set">
      <Nav current="domain" />
      <Head name="domain" title="Domain">Put the page on the business’s own address, like www.yourbusiness.com.</Head>

      <p className="ap-set-now">
        <span>Address now</span>
        <code>{now}</code>
        <small>Live pages are saved in this browser for now.</small>
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
            <button type="submit" className="ap-btn ap-btn-primary">Save</button>
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
            <span className="ap-status ap-status-draft">Not connected yet</span>
          </p>
          <div className="ap-set-row">
            <button type="button" className="ap-btn" onClick={() => setEditing(true)}>Change</button>
            <button type="button" className="ap-btn ap-btn-quiet" onClick={remove}>Remove</button>
          </div>
        </div>
      )}

      {domain ? (
        <>
          <section className="ap-dns" aria-labelledby="dns-h" aria-busy={dns && dns.busy ? 'true' : undefined}>
            <h3 id="dns-h">Where it points now</h3>
            {dns && dns.results ? (
              <ul>
                {dns.results.map((r) => (
                  <li key={r.host} data-state={r.here ? 'here' : r.status}>
                    <b>{r.host}</b>
                    <span>{pointsLine(r)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ap-hint" role="status">Checking DNS…</p>
            )}
            <button type="button" className="ap-btn" onClick={() => runCheck(domain)} disabled={!!(dns && dns.busy)}>
              {dns && dns.busy ? 'Checking…' : 'Check again'}
            </button>
          </section>

          <section className="ap-dns" aria-labelledby="rec-h">
            <h3 id="rec-h">Records it will need</h3>
            <p className="ap-set-warn">Don’t add these yet. Until pages are hosted, the domain would stop showing your current site.</p>
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
                      <Copy text={r.value} label={r.type + ' value for ' + r.host} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ap-hint">Add them where the domain was bought (GoDaddy, Namecheap, Squarespace and the like), in its DNS settings.</p>
          </section>
        </>
      ) : null}

      <p className="ap-set-note">Connecting a domain needs pages to be hosted for everyone. The domain is saved now, and the check reads its real DNS.</p>
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

function Leads({ id }) {
  store.usePages();
  const page = store.getPage(id);
  const leads = store.leadsOf(page);
  const [sure, setSure] = useState(false);
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
              <li key={l.at + l.email}>
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
                <button type="button" className="ap-btn ap-btn-danger" onClick={() => { store.clearLeads(id); setSure(false); }}>Clear {leads.length}</button>
                <button type="button" className="ap-btn ap-btn-quiet" onClick={() => setSure(false)}>Keep them</button>
              </>
            ) : (
              <button type="button" className="ap-btn ap-btn-quiet" onClick={() => setSure(true)}>Clear</button>
            )}
          </div>
        </>
      ) : (
        <p className="ap-hint">None yet. When someone leaves their details in the chat, they show here.</p>
      )}
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
                <ChatWidget key={round} embedded bot={bot} brand={brand} title={props.title} pageText={pageText} starters={starters} onLead={(lead) => store.addLead(id, { ...lead, via: 'editor' })} />
              </div>
            ) : (
              <SignIn prefix="chat" lede="Sign in with your AI Paragon account to try the chatbot. Until pages are hosted it answers the team only." />
            )}
          </section>

          <Leads id={id} />
        </>
      ) : null}

      <p className="ap-set-note">Until pages are hosted, the chatbot answers signed-in AI Paragon accounts only, so visitors can’t use it yet. Contacts are kept in this browser.</p>
    </div>
  );
}
