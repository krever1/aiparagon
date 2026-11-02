// The chatbot on a page: a button in the corner that opens a small chat window. It shows on the
// draft preview and the published page (never on the editor canvas, where clicks pick sections),
// and the Chatbot tab shows the same window inline so the team can try it while setting it up.
// The window is not modal: the page stays usable, Esc closes it and focus goes back to the button.
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { botOf, ChatError, checkLead, shownGreeting, shownName, startersFor, LIMITS } from './chat.js';
import { PageCtx } from './context.js';

export function ChatIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 21 12z" />
    </svg>
  );
}

let seq = 0;
const nextId = () => 'm' + ++seq;

function LeadForm({ leads, onSend, onSkip }) {
  const [v, setV] = useState({ name: '', email: '', phone: '' });
  const [err, setErr] = useState(null);
  const [sending, setSending] = useState(false);
  const base = useId();
  const refs = { name: useRef(null), email: useRef(null), phone: useRef(null) };
  const submit = (e) => {
    e.preventDefault();
    const r = checkLead(v, leads);
    if (r.error) {
      setErr(r);
      const el = refs[r.field] && refs[r.field].current;
      if (el) el.focus();
      return;
    }
    setSending(true);
    Promise.resolve(onSend(r.lead))
      .catch((e) => setErr({ error: (e && e.message) || 'Could not send that just now. Try again.' }))
      .finally(() => setSending(false));
  };
  const field = (key, label, type, auto) => (
    <label className="sb-chat-f" htmlFor={base + key}>
      <span>{label}</span>
      <input
        id={base + key}
        ref={refs[key]}
        type={type}
        autoComplete={auto}
        value={v[key]}
        maxLength={key === 'email' ? 120 : 80}
        aria-invalid={err && err.field === key ? 'true' : undefined}
        onChange={(e) => {
          setV({ ...v, [key]: e.target.value });
          if (err) setErr(null);
        }}
      />
    </label>
  );
  return (
    <form className="sb-chat-card sb-chat-lead" onSubmit={submit} noValidate>
      <p>Leave your details and the team will get back to you.</p>
      {field('name', 'Name', 'text', 'name')}
      {field('email', 'Email', 'email', 'email')}
      {leads === 'phone' ? field('phone', 'Phone', 'tel', 'tel') : null}
      {err ? <p className="sb-chat-err" role="alert">{err.error}</p> : null}
      <div className="sb-chat-row">
        <button type="submit" className="sb-btn sb-btn-sm" disabled={sending}>{sending ? 'Sending…' : 'Send'}</button>
        <button type="button" className="sb-chat-link" onClick={onSkip}>No thanks</button>
      </div>
    </form>
  );
}

// bot: from botOf(). ask({ bot, brand, title, pageText, messages, signal }) gets one answer (the
// team's transport in the builder, the visitor chat on a live page). onLead(lead) keeps a contact
// left in the chat, and may return a promise: the form stays, with the reason, if it fails.
// embedded: shown open, in place (the Chatbot tab), instead of a button in the page corner.
export function ChatWidget({ bot, brand, title, pageText, starters, ask, onLead, signInHref, embedded, sendLabel }) {
  const name = shownName(bot, brand);
  const greeting = shownGreeting(bot, brand);
  const [open, setOpen] = useState(!!embedded);
  const [log, setLog] = useState(() => [{ id: nextId(), role: 'bot', text: greeting }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const panelId = useId();
  const launcher = useRef(null);
  const box = useRef(null);
  const logRef = useRef(null);
  const ctrl = useRef(null);
  const asked = log.some((m) => m.role === 'visitor');

  // A new greeting in the settings starts the conversation over
  useEffect(() => {
    setLog((l) => (l.some((m) => m.role === 'visitor') ? l : [{ id: nextId(), role: 'bot', text: greeting }]));
  }, [greeting]);
  useEffect(() => () => ctrl.current && ctrl.current.abort(), []);
  // The newest message in view, scrolling the conversation only (never the page or the editor)
  useEffect(() => {
    const el = logRef.current;
    if (open && el) el.scrollTop = el.scrollHeight;
  }, [log, busy, open]);
  useEffect(() => {
    if (open && !embedded && box.current) box.current.focus();
  }, [open, embedded]);

  // The cursor goes back to the chat button before the window goes, so it is never lost
  const close = () => {
    if (launcher.current) launcher.current.focus();
    setOpen(false);
  };

  // retryOf: the note of a failed try, whose question is already in the conversation
  const send = async (raw, retryOf) => {
    const words = String(raw || '').trim().slice(0, LIMITS.message);
    if (!words || busy) return;
    // An open contact form belongs to the last answer
    let kept = log.filter((m) => m.role !== 'lead' && m.id !== retryOf);
    if (!retryOf) kept = kept.concat({ id: nextId(), role: 'visitor', text: words });
    setLog(kept);
    setText('');
    setBusy(true);
    const ac = new AbortController();
    ctrl.current = ac;
    try {
      const turns = kept.filter((m) => m.role === 'visitor' || m.role === 'bot');
      if (!ask) throw new ChatError('off', 'The chat is not available here.');
      const got = await ask({ bot, brand, title, pageText, messages: turns, signal: ac.signal });
      const add = [{ id: nextId(), role: 'bot', text: got.reply }];
      if (got.action === 'contact') add.push({ id: nextId(), role: 'lead', question: words });
      if (got.action === 'link') add.push({ id: nextId(), role: 'offer' });
      setLog((l) => l.concat(add));
    } catch (e) {
      if (e instanceof ChatError && e.code === 'stopped') return;
      setLog((l) => l.concat({ id: nextId(), role: 'note', code: e instanceof ChatError ? e.code : 'model', text: e instanceof ChatError ? e.message : 'Something went wrong. Try again.', retry: words }));
    } finally {
      if (ctrl.current === ac) ctrl.current = null;
      setBusy(false);
    }
  };

  const leadSent = (id, question) => async (lead) => {
    if (onLead) await onLead({ ...lead, question, at: Date.now() });
    const first = lead.name.split(/\s+/)[0];
    setLog((l) =>
      l
        .filter((m) => m.id !== id)
        .concat({ id: nextId(), role: 'bot', text: 'Thanks, ' + first + '. ' + (brand && brand !== 'this business' ? brand : 'The team') + ' will get back to you' + (lead.phone ? ' by email or phone.' : ' by email.') }),
    );
  };

  const isWeb = /^https?:/i.test(bot.link);
  const windowEl = (
    <div
      id={panelId}
      className="sb-chat-panel"
      role={embedded ? 'region' : 'dialog'}
      aria-label={name}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !embedded) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="sb-chat-head">
        <span className="sb-chat-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
        <span className="sb-chat-who">
          <b>{name}</b>
          <small>Automated assistant</small>
        </span>
        {!embedded ? (
          <button type="button" className="sb-chat-x" onClick={close} aria-label="Close the chat">×</button>
        ) : null}
      </div>
      <div className="sb-chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
        {log.map((m) => {
          if (m.role === 'lead') return <LeadForm key={m.id} leads={bot.leads} onSend={leadSent(m.id, m.question)} onSkip={() => setLog((l) => l.filter((x) => x.id !== m.id))} />;
          if (m.role === 'offer') {
            return (
              <div key={m.id} className="sb-chat-card">
                <a className="sb-btn sb-btn-sm" href={bot.link} {...(isWeb ? { target: '_blank', rel: 'noopener noreferrer' } : {})} onClick={!isWeb && !embedded ? () => setOpen(false) : undefined}>
                  {bot.linkLabel || 'Book a time'}
                </a>
              </div>
            );
          }
          if (m.role === 'note') {
            return (
              <div key={m.id} className="sb-chat-note" data-code={m.code}>
                <p>{m.text}</p>
                {m.code === 'signin' && signInHref ? (
                  <a className="sb-chat-link" href={signInHref}>Sign in from the editor’s AI tab</a>
                ) : m.code !== 'signin' && m.retry ? (
                  <button type="button" className="sb-chat-link" disabled={busy} onClick={() => send(m.retry, m.id)}>
                    Try again
                  </button>
                ) : null}
              </div>
            );
          }
          return (
            <p key={m.id} className={'sb-chat-msg sb-chat-' + m.role}>
              <span className="sb-sr">{m.role === 'visitor' ? 'You: ' : name + ': '}</span>
              {m.text}
            </p>
          );
        })}
        {busy ? (
          <p className="sb-chat-msg sb-chat-bot sb-chat-typing">
            <span className="sb-sr">{name} is typing</span>
            <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
          </p>
        ) : null}
        {!asked && starters && starters.length ? (
          <div className="sb-chat-starters" aria-label="Suggested questions">
            {starters.map((q) => (
              <button key={q} type="button" className="sb-chat-chip" disabled={busy} onClick={() => send(q)}>{q}</button>
            ))}
          </div>
        ) : null}
      </div>
      <form
        className="sb-chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          ref={box}
          rows={1}
          value={text}
          maxLength={LIMITS.message}
          placeholder="Type your question"
          aria-label="Your message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        <button type="submit" className="sb-chat-send" disabled={busy || !text.trim()} aria-label={sendLabel || 'Send'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
      <p className="sb-chat-foot">Automated assistant. It can get things wrong.</p>
    </div>
  );

  if (embedded) return <div className="sb-chat sb-chat-embedded">{windowEl}</div>;
  return (
    <div className="sb-chat" data-side={bot.side} data-open={open ? 'true' : 'false'}>
      {open ? windowEl : null}
      <button
        ref={launcher}
        type="button"
        className="sb-chat-launch"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? 'Close the chat' : bot.label ? undefined : 'Chat with ' + name}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <ChatIcon size={22} />
        {bot.label && !open ? <span>{bot.label}</span> : null}
      </button>
    </div>
  );
}

// The chatbot as the page renders it (blocks.jsx puts this in the page root): only on the preview
// and the live page, which say through PageCtx which page this is and how its chat answers
export function ChatMount({ chatbot }) {
  const ctx = useContext(PageCtx);
  const bot = botOf({ chatbot });
  if (!ctx || !bot.on) return null;
  return <ChatWidget bot={bot} brand={ctx.brand} title={ctx.title} pageText={ctx.pageText} starters={startersFor(bot, ctx.data)} ask={ctx.ask} onLead={ctx.onLead} signInHref={ctx.signInHref} />;
}
