// The page's chatbot: its settings (root props `chatbot`), the page text it answers from, and its
// side of the "Site Builder · Chatbot" n8n workflow (POST /webhook/site-builder-chat). Claude answers
// from the page text and the facts the team gives it, and says when to show the contact form or
// the booking button. Until pages are hosted the workflow answers signed-in AI Paragon accounts
// only, so on the published page the chat works for the team, as a preview.
import { token, forget } from './auth.js';

export const CHAT_HOOK = 'https://n8n.aiparagonconsulting.com/webhook/site-builder-chat';
const WAIT_MS = 45 * 1000;
const KEEP_TURNS = 12;

export const TONES = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'brief', label: 'Brief' },
];
export const LEADS = [
  { value: 'email', label: 'Name and email' },
  { value: 'phone', label: 'Name, email and phone' },
  { value: 'off', label: 'Don’t ask' },
];

export const BOT_DEFAULTS = {
  on: false,
  name: '',
  greeting: '',
  knows: '',
  rules: '',
  tone: 'friendly',
  starters: [],
  leads: 'email',
  link: '',
  linkLabel: '',
  label: 'Chat with us',
  side: 'right',
};

export const LIMITS = { name: 40, greeting: 200, knows: 4000, rules: 1500, starter: 80, link: 300, linkLabel: 30, label: 24, message: 1000 };

const str = (v) => (typeof v === 'string' ? v : '');
const arr = (v) => (Array.isArray(v) ? v : []);
const one = (list, v, fallback) => (list.some((o) => o.value === v) ? v : fallback);

export class ChatError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// A link the bot can offer: web, mail, phone or a section of the page
export function safeBotLink(v) {
  const s = str(v).trim();
  if (/^https?:\/\/\S+$/i.test(s) || /^mailto:\S+@\S+$/i.test(s) || /^tel:\+?[\d\s().-]{5,}$/i.test(s) || /^#[a-z0-9-]+$/i.test(s)) return s;
  return '';
}

// The settings in force: the saved ones over the defaults, each checked
export function botOf(rootProps) {
  const b = (rootProps && rootProps.chatbot) || {};
  return {
    on: b.on === true,
    name: str(b.name).trim().slice(0, LIMITS.name),
    greeting: str(b.greeting).trim().slice(0, LIMITS.greeting),
    knows: str(b.knows).slice(0, LIMITS.knows),
    rules: str(b.rules).slice(0, LIMITS.rules),
    tone: one(TONES, b.tone, 'friendly'),
    starters: arr(b.starters).map((q) => str(q).trim().slice(0, LIMITS.starter)).filter(Boolean).slice(0, 3),
    leads: one(LEADS, b.leads, 'email'),
    link: safeBotLink(b.link),
    linkLabel: str(b.linkLabel).trim().slice(0, LIMITS.linkLabel),
    label: str(b.label == null ? BOT_DEFAULTS.label : b.label).trim().slice(0, LIMITS.label),
    side: b.side === 'left' ? 'left' : 'right',
  };
}

export function brandOf(data) {
  const content = arr(data && data.content);
  const nav = content.find((c) => c.type === 'Navbar' && str(c.props && c.props.brand).trim());
  const foot = content.find((c) => c.type === 'Footer' && str(c.props && c.props.brand).trim());
  const rp = (data && data.root && data.root.props) || {};
  return str((nav || foot || { props: {} }).props.brand).trim() || str(rp.title).trim() || 'this business';
}

// What the bot is called and how it opens when the team left those empty
export function shownName(bot, brand) {
  return bot.name || (brand && brand !== 'this business' ? brand + ' assistant' : 'Assistant');
}
export function shownGreeting(bot, brand) {
  return bot.greeting || 'Hi! Ask me anything about ' + (brand || 'us') + '.';
}

// Suggested first questions: the team's own, or the first three from the page's FAQ
export function startersFor(bot, data) {
  if (bot.starters.length) return bot.starters;
  const faq = arr(data && data.content).find((c) => c.type === 'Faq');
  return arr(faq && faq.props && faq.props.items)
    .map((it) => str(it && it.question).trim())
    .filter(Boolean)
    .slice(0, 3);
}

const SKIP = (name) => name === 'anchor' || name === 'href' || /Href$/.test(name) || /Url$/.test(name) || name === 'imageAlt' || name === 'icon';
const plainText = (s) =>
  String(s)
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

// The page as the bot reads it: each section's words in order, under the section's name
export function pageTextFor(config, data) {
  const rp = (data && data.root && data.root.props) || {};
  const lines = [];
  if (str(rp.title).trim()) lines.push('Page: ' + str(rp.title).trim());
  if (str(rp.description).trim()) lines.push(str(rp.description).trim());
  arr(data && data.content).forEach((c) => {
    const comp = config.components[c.type];
    if (!comp) return;
    const p = c.props || {};
    const out = [];
    Object.entries(comp.fields || {}).forEach(([name, f]) => {
      if (SKIP(name) || f.type === 'select' || f.type === 'radio') return;
      const v = p[name];
      if (f.type === 'array') {
        arr(v).forEach((item) => {
          const bits = Object.entries(f.arrayFields || {})
            .filter(([k, sf]) => !SKIP(k) && sf.type !== 'select' && sf.type !== 'radio')
            .map(([k]) => plainText(str(item && item[k])))
            .filter(Boolean);
          if (bits.length) out.push('- ' + bits.join(': '));
        });
      } else if (str(v).trim()) {
        out.push(plainText(v));
      }
    });
    if (out.length) lines.push('', '[' + comp.label + ']', ...out);
  });
  return lines.join('\n').slice(0, 12000);
}

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
  const turns = arr(messages)
    .filter((m) => m && (m.role === 'visitor' || m.role === 'bot') && str(m.text).trim())
    .slice(-KEEP_TURNS)
    .map((m) => ({ role: m.role, text: str(m.text).slice(0, LIMITS.message) }));
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
        messages: turns,
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
  const action = j.action === 'contact' && bot.leads !== 'off' ? 'contact' : j.action === 'link' && bot.link ? 'link' : 'none';
  return { reply: str(j.reply).trim().slice(0, 1200), action };
}

// A contact left in the chat, checked: { lead } or { error, field }
export function checkLead({ name, email, phone }, leads) {
  const n = str(name).trim().slice(0, 80);
  const e = str(email).trim().slice(0, 120);
  const p = str(phone).trim().slice(0, 40);
  if (!n) return { error: 'Add your name.', field: 'name' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { error: 'Add an email address we can reply to.', field: 'email' };
  if (leads === 'phone' && p.replace(/\D/g, '').length < 7) return { error: 'Add a phone number.', field: 'phone' };
  return { lead: { name: n, email: e, phone: leads === 'phone' ? p : '' } };
}
