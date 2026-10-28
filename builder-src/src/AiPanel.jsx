// The AI tab in the editor's left rail: describe the page, or say what to change, and Claude's
// answer goes straight onto the page (checked first, see ai.js). Undo puts the page back as it was.
// Signing in with an AI Paragon account comes first, since the AI answers only the team.
// Puck builds its sidebar twice as the editor opens, so the panel keeps nothing of its own: the
// request, the answer, Undo and a description waiting from New page live in the editor view
// (useAiSession), and the panel only shows them and lends the session its Puck handle.
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createUsePuck, useGetPuck } from '@puckeditor/core';
import { EditorCtx } from './context.js';
import { useAuth, signIn, signOut, AuthError } from './auth.js';
import { askAi, applyAnswer, AiError } from './ai.js';

const usePuck = createUsePuck();

const FIRST_ASKS = [
  'A page for a dog grooming studio: services, how booking works, questions and a booking button.',
  'A launch page for a new coffee subscription, with a waitlist button.',
  'A page for a free 30-minute consultation with a small accounting firm.',
];
const CHANGE_ASKS = ['Rewrite it friendlier', 'Make the copy shorter', 'Add an FAQ', 'Switch to a light theme'];

export function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
    </svg>
  );
}

// The AI's side of one open editor. pendingAsk is a description from New page, sent once someone
// is signed in and the panel has lent its Puck handle.
export function useAiSession(pendingAsk) {
  const puckRef = useRef(null);
  const who = useAuth();
  const [ask, setAsk] = useState(pendingAsk || '');
  const [work, setWork] = useState(null); // { started } while waiting
  const [result, setResult] = useState(null); // { summary, line, tone }
  const [undo, setUndo] = useState(null); // { before, afterJson }
  const [hint, setHint] = useState('');
  const ctrl = useRef(null);
  const auto = useRef(!!pendingAsk);

  // Leaving the editor stops waiting
  useEffect(() => () => ctrl.current && ctrl.current.abort(), []);

  const send = useCallback(async (text) => {
    const words = String(text || '').trim();
    const getPuck = puckRef.current;
    if (!getPuck) return;
    if (!words) {
      setHint('Say what the page should be, or what to change.');
      return;
    }
    setHint('');
    setResult(null);
    setUndo(null); // Undo belongs to the change it undoes; Puck's own undo still goes further back
    const before = getPuck().appState.data;
    const ac = new AbortController();
    ctrl.current = ac;
    setWork({ started: Date.now() });
    try {
      const answer = await askAi({ ask: words, data: before, signal: ac.signal });
      const { appState, dispatch } = puckRef.current();
      const res = applyAnswer(appState.data, answer, { ask: words, before });
      if (res.changed) {
        const was = appState.data;
        dispatch({ type: 'setUi', ui: { itemSelector: null } });
        dispatch({ type: 'setData', data: res.data, recordHistory: true });
        setUndo({ before: was, afterJson: JSON.stringify(puckRef.current().appState.data) });
        setAsk('');
      } else {
        setUndo(null);
      }
      setResult({ summary: String(answer.summary || ''), line: res.line, tone: res.changed ? 'ok' : 'quiet' });
    } catch (e) {
      if (e instanceof AiError && e.code === 'stopped') setResult({ summary: '', line: 'Stopped. The page is as it was.', tone: 'quiet' });
      else setResult({ summary: '', line: e instanceof AiError ? e.message : 'Something went wrong. Try again.', tone: 'error' });
    } finally {
      if (ctrl.current === ac) ctrl.current = null;
      setWork(null);
    }
  }, []);

  const stop = useCallback(() => {
    if (ctrl.current) ctrl.current.abort();
  }, []);

  const undoChange = useCallback(() => {
    if (!undo || !puckRef.current) return;
    const { dispatch } = puckRef.current();
    dispatch({ type: 'setUi', ui: { itemSelector: null } });
    dispatch({ type: 'setData', data: undo.before, recordHistory: true });
    setUndo(null);
    setResult({ summary: '', line: 'Put the page back as it was before that change.', tone: 'quiet' });
  }, [undo]);

  // Runs after every render: sends the waiting description once, as soon as it can
  useEffect(() => {
    if (auto.current && who && !work && puckRef.current) {
      auto.current = false;
      send(ask);
    }
  });

  return { puckRef, who, ask, setAsk, work, result, undo, hint, setHint, send, stop, undoChange, waiting: auto.current };
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Sign-in did not work just now. Try again in a minute.');
      setBusy(false);
    }
  };
  return (
    <form className="ap-ai-signin" onSubmit={submit} noValidate>
      <p className="ap-ai-lede">Sign in with your AI Paragon account to use the AI. It is the same account as the dashboard.</p>
      <div className="ap-field">
        <label htmlFor="ai-email">Email</label>
        <input id="ai-email" className="ap-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@aiparagonconsulting.com" />
      </div>
      <div className="ap-field">
        <label htmlFor="ai-pw">Password</label>
        <input id="ai-pw" className="ap-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error ? (
        <p className="ap-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="ap-btn ap-btn-primary ap-ai-wide" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export function AiPanel() {
  const ed = useContext(EditorCtx);
  const ai = ed.ai;
  const getPuck = useGetPuck();
  const data = usePuck((s) => s.appState.data);
  const [now, setNow] = useState(Date.now());
  const boxRef = useRef(null);

  // Lend the session this Puck's handle (the newest panel's, after Puck rebuilds the sidebar)
  useEffect(() => {
    ai.puckRef.current = getPuck;
  }, [ai.puckRef, getPuck]);

  useEffect(() => {
    if (!ai.work) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ai.work]);

  const { who, ask, work, result, hint } = ai;
  const empty = !(data && data.content && data.content.length);
  const asks = empty ? FIRST_ASKS : CHANGE_ASKS;
  const waited = work ? Math.max(0, Math.floor((now - work.started) / 1000)) : 0;
  const canUndo = !!(ai.undo && !work && JSON.stringify(data) === ai.undo.afterJson);
  const send = () => {
    if (!ask.trim() && boxRef.current) boxRef.current.focus();
    ai.send(ask);
  };

  return (
    <div className="ap-ai" data-state={work ? 'working' : who ? 'ready' : 'signin'}>
      <div className="ap-ai-head">
        <h2 className="ap-ai-h">
          <SparkIcon /> Ask AI
        </h2>
        {who ? (
          <p className="ap-ai-who">
            {who.from === 'dashboard' ? 'Using your dashboard sign-in, ' : 'Signed in as '}
            <span>{who.email}</span>.{' '}
            <button type="button" className="ap-linkbtn" onClick={() => signOut()} disabled={!!work}>
              {who.from === 'dashboard' ? 'Use another account' : 'Sign out'}
            </button>
          </p>
        ) : null}
      </div>

      {!who ? (
        <>
          {ai.waiting && ask ? <p className="ap-ai-note">Your description is kept. Sign in and the AI writes the page.</p> : null}
          <SignIn />
        </>
      ) : (
        <div className="ap-ai-body">
          <label htmlFor="ai-ask" className="ap-ai-label">
            {empty ? 'Describe the page' : 'What should change?'}
          </label>
          <textarea
            id="ai-ask"
            ref={boxRef}
            className="ap-input ap-ai-box"
            rows={empty ? 6 : 4}
            maxLength={2000}
            value={ask}
            disabled={!!work}
            placeholder={empty ? 'Who it is for, what you offer, and what visitors should do.' : 'For example: make the hero calmer and add a pricing note.'}
            onChange={(e) => {
              ai.setAsk(e.target.value);
              if (hint) ai.setHint('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            aria-describedby="ai-ask-hint"
          />
          <p id="ai-ask-hint" className={hint ? 'ap-error' : 'ap-hint'}>
            {hint || 'Ctrl+Enter (⌘+Enter on a Mac) sends. Nothing goes live until you publish.'}
          </p>
          {!work ? (
            <div className="ap-ai-asks" aria-label="Ideas">
              {asks.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="ap-ai-chip"
                  onClick={() => {
                    ai.setAsk(a);
                    if (boxRef.current) boxRef.current.focus();
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          ) : null}
          {work ? (
            <div className="ap-ai-working">
              <span className="ap-ai-dot" aria-hidden="true" />
              <span>
                <span role="status">{empty ? 'Writing the page' : 'Working on it'}…</span>{' '}
                <span aria-hidden="true">{waited} s{waited >= 20 ? '. A whole page can take a minute.' : ''}</span>
              </span>
              <button type="button" className="ap-btn ap-ai-stop" onClick={ai.stop}>
                Stop
              </button>
            </div>
          ) : (
            <button type="button" className="ap-btn ap-btn-primary ap-ai-wide" onClick={send}>
              <SparkIcon /> {empty ? 'Write the page' : 'Make the change'}
            </button>
          )}
        </div>
      )}

      {result ? (
        <div className={'ap-ai-result ap-ai-' + result.tone} role={result.tone === 'error' ? 'alert' : 'status'}>
          {result.summary ? <p className="ap-ai-summary">{result.summary}</p> : null}
          <p className="ap-ai-line">{result.line}</p>
          {canUndo ? (
            <button type="button" className="ap-btn ap-ai-undo" onClick={ai.undoChange}>
              Undo this change
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="ap-ai-foot">The AI writes with the blocks in this builder. It leaves placeholders in [brackets] for facts it does not have, and it never adds links or contact details you did not give it.</p>
    </div>
  );
}
