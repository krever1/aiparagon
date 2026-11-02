// The chatbot on a live page, for visitors: the public "Site Builder · Visitor Chat" n8n workflow
// (POST /webhook/site-chat). The workflow reads the page's chatbot settings and words from the live
// copy itself, so a visitor only sends which page this is and the conversation; it also keeps the
// limits (per visitor, per page and in all) and saves the contacts visitors leave.
import { ChatError, WAIT_MS, turnsOf, actionOf } from './chat.js';

export const VISITOR_HOOK = 'https://n8n.aiparagonconsulting.com/webhook/site-chat';

const str = (v) => (typeof v === 'string' ? v : '');

const SAYS = {
  busy: 'The chat is busy just now. Try again in a little while.',
  off: 'The chat is not available on this page right now.',
  bad: 'That message could not be sent. Try a shorter one.',
  lead: 'Your details could not be sent just now. Try again in a minute.',
};

async function post(body, signal) {
  const stop = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    stop.abort();
  }, WAIT_MS);
  const onStop = () => stop.abort();
  if (signal) signal.addEventListener('abort', onStop);
  let res;
  let j = null;
  try {
    res = await fetch(VISITOR_HOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: stop.signal,
    });
    j = await res.json().catch(() => null);
  } catch (e) {
    if (signal && signal.aborted) throw new ChatError('stopped', 'Stopped.');
    if (timedOut) throw new ChatError('timeout', 'That took too long. Try again.');
    throw new ChatError('network', 'Could not reach the assistant. Check the connection and try again.');
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onStop);
  }
  if (signal && signal.aborted) throw new ChatError('stopped', 'Stopped.');
  if (res.status === 429) throw new ChatError('busy', SAYS.busy);
  if (res.status === 524 || res.status === 504) throw new ChatError('timeout', 'That took too long. Try again.');
  if (j && j.ok === false) {
    const code = SAYS[j.code] ? j.code : 'model';
    throw new ChatError(code, SAYS[code] || 'The assistant could not answer just now. Try again in a minute.');
  }
  if (!res.ok || !j || j.ok !== true) throw new ChatError('model', 'The assistant could not answer just now. Try again in a minute.');
  return j;
}

// The two things a visitor's chat does on page `pageId`
export function visitorChat(pageId) {
  return {
    ask: async ({ bot, messages, signal }) => {
      const j = await post({ page: pageId, messages: turnsOf(messages) }, signal);
      if (!str(j.reply).trim()) throw new ChatError('model', 'The assistant could not answer just now. Try again in a minute.');
      return { reply: str(j.reply).trim().slice(0, 1200), action: actionOf(j, bot) };
    },
    lead: async (lead) => {
      await post({
        page: pageId,
        lead: { name: str(lead.name), email: str(lead.email), phone: str(lead.phone), question: str(lead.question).slice(0, 1000) },
      });
    },
  };
}
