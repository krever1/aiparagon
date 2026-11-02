// The chatbot in the builder (the Chatbot tab's Try it and the builder's own previews): the
// "Site Builder · Chatbot" n8n workflow (POST /webhook/site-builder-chat), with the team's sign-in.
// It sends the draft's settings and words, so the team tries what they are editing. Visitors on a
// live page use chat-visitor.js instead.
import { token, forget } from './auth.js';
import { ChatError, WAIT_MS, shownName, turnsOf, actionOf } from './chat.js';

export const CHAT_HOOK = 'https://n8n.aiparagonconsulting.com/webhook/site-builder-chat';

const str = (v) => (typeof v === 'string' ? v : '');

// One answer from the bot: { reply, action } where action is none, contact or link
export async function askBot({ bot, brand, title, pageText, messages, signal }) {
  const auth = await token();
  if (!auth) throw new ChatError('signin', 'Sign in with your AI Paragon account to try the chatbot.');
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
    res = await fetch(CHAT_HOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth,
        bot: { name: shownName(bot, brand), tone: bot.tone, knows: bot.knows, rules: bot.rules, leads: bot.leads, hasLink: !!bot.link },
        page: { brand, title, text: pageText },
        messages: turnsOf(messages),
      }),
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
  if (res.status === 401 || (j && j.code === 'unauthorized')) {
    forget();
    throw new ChatError('signin', 'Your sign-in has run out. Sign in again to try the chatbot.');
  }
  if (res.status === 524 || res.status === 504) throw new ChatError('timeout', 'That took too long. Try again.');
  if (j && j.ok === false) throw new ChatError(j.code || 'model', str(j.message) || 'The assistant could not answer just now. Try again in a minute.');
  if (!res.ok || !j || j.ok !== true || !str(j.reply).trim()) throw new ChatError('model', 'The assistant could not answer just now. Try again in a minute.');
  return { reply: str(j.reply).trim().slice(0, 1200), action: actionOf(j, bot) };
}
