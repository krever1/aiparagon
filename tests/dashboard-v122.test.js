// v122 tests for new-aiparagon-dashboard.html (#1): the finished funnel's cards (the Funnel Builder's drawer,
// v113StepHtml). A list item that is an object reads in its own words: an agenda line as its time and part (it printed
// as a blank bullet), an email with when it goes and what it says, a question with its answers, a section with its
// title; labels read as words ("Who it is for", not "who"); an item with nothing to say is left out instead of
// printing a blank bullet; nothing prints [object Object]; and the bullets sit inside the card.
// Supabase answers from an in-memory store (lib/rest-stub.js) filled with synthetic data (lib/qa-fixtures.js) and
// n8n webhooks answer from stubs, so no real account, data or workflow is touched.
// Usage: node tests/dashboard-v122.test.js
const path = require('path');
const H = require('./lib/dashboard-harness');
const { makeStore } = require('./lib/rest-stub');
const FX = require('./lib/qa-fixtures');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) pass++; else { fail++; failures.push(label + (detail ? ' :: ' + detail : '')); }
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || !detail ? '' : '   [' + detail + ']'));
}
const id = (n) => '00000000-0000-4000-8000-0000000000e' + n;
const ad = { variants: [{ hook: 'Your AI policy is a PDF nobody reads', primary_text: 'Synthetic ad text for the test.', headline: 'Governed AI in 90 days', cta: 'Save my seat', image_direction: 'A desk with a checklist' }] };
function pkg(n, type, title, steps) {
  return { id: id(n), run_id: 'funnel_2026-10-21_1500_qa0' + n, run_date: '2026-10-21', funnel_type: type, status: 'pending_approval', requested_by: 'qa@aiparagonconsulting.com',
    created_at: '2026-10-21T15:0' + n + ':00Z', updated_at: '2026-10-21T15:0' + n + ':00Z', ad_variations: ad, steps, landing_page: steps[0].content, test_plan: null, notes: null, offer_id: null, creative_brief_id: null,
    setup: { title, objective: 'Sign-ups', cta: 'Save my seat' } };
}
// the shapes the Funnel Builder's prompt asks for, one funnel of each kind, plus a step of odd items
const WEB = pkg(1, 'webinar', 'Governed AI for RIAs', [
  { key: 'registration_page', title: 'Registration page', why: 'Turns the click into a sign-up.', content: { headline: 'Governed AI for RIAs: the first 90 days', bullets: ['Where AI touches client data', 'The three policies examiners ask for', 'A 90 day rollout'], who: 'Owners and COOs of RIAs', when: 'Thursday 6 November, 12pm Pacific', presenter: 'Erica Dresslar', cta: 'Save my seat', fields: ['Name', 'Work email'] } },
  { key: 'step_6', title: 'Two quick questions', content: { questions: [{ q: 'How many advisers are at your firm?', options: ['1 to 4', '5 to 15', '16 or more'] }, { q: 'Your role', options: ['Owner', 'COO'] }], routing: 'Firms with 5 or more advisers get the plan offer' } },
  { key: 'emails', title: 'Confirmation, reminder and follow-up emails', content: { emails: [{ when: 'Right after sign-up', subject: 'You are in: Governed AI for RIAs', preview: 'Your link', body: 'Here is your Zoom link.' }, { when: 'The day before', subject: 'Tomorrow at 12pm Pacific', body: 'Bring one AI tool your team uses.' }] } },
  { key: 'session_outline', title: 'Session outline', content: { agenda: [{ t: '0:00', part: 'Welcome and what you will leave with' }, { t: '0:05', part: 'Where AI touches client data today' }, { t: '0:35', part: 'Your 90 day rollout' }], offer: 'A 20 minute call to fit the plan to your firm' } }]);
const DOWN = pkg(2, 'download', 'The AI policy kit', [
  { key: 'optin_page', title: 'Opt-in page', content: { headline: 'Get the AI policy kit', who: 'RIA owners', bullets: ['Three policy templates', 'A rollout checklist'], cta: 'Send me the kit', fields: ['Name', 'Work email'] } },
  { key: 'resource_outline', title: 'Outline of the resource', content: { sections: ['Why a policy comes first', 'The three templates', 'Your first 30 days'] } },
  { key: 'odd', title: 'Odd items', content: { notes: [{}, '', { t: '', part: '' }, { foo: 'bar' }], emails: [{ subject: 'Nested', body: { text: 'deep text' } }], extra: { price: '$47', link: 'https://kit.example', empty: '' }, blank: [{}, ''], proof: [{ name: 'Hale Capital', claim: 'Prep went from 2 hours to 15 minutes' }] } }]);
const NEWS = pkg(3, 'newsletter_signup', 'The Monday memo', [
  { key: 'signup_page', title: 'Sign-up page', content: { headline: 'The Monday memo', how_often: 'Every Monday', cta: 'Sign me up', fields: ['Work email'] } },
  { key: 'welcome_email', title: 'Welcome email', content: { subject: 'Welcome to the Monday memo', preview: 'What to expect', body: 'One short read every Monday.' } }]);
const LAND = pkg(4, 'landing', 'Book the diagnostic', [
  { key: 'landing_page', title: 'Landing page', content: { headline: 'Find the hours you lose', sections: [{ title: 'Where the hours go', body: 'Three workflows take most of the week.' }], faq: [{ q: 'Do I need to prepare anything?', a: 'No, just bring your questions.' }], proof: [], cta: 'Book the diagnostic' } }]);

(async () => {
  const server = H.makeServer(ROOT, null, '/dashboard/today');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;
  const browser = await H.chromium.launch();
  const errors = [];
  const t = FX.tables();
  t.funnel_packages.push(WEB, DOWN, NEWS, LAND);
  const store = makeStore(t);
  const { ctx, page } = await H.newPage(browser, BASE, { seed: true, rest: store, hooks: () => ({ body: { ok: true } }), bucket: errors, fixed: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/dashboard/marketing-generation', { waitUntil: 'load' });
  await H.settled(page, 'app');
  await page.waitForTimeout(1500);
  await page.evaluate(() => v113FunLoad(true));
  // what a funnel's drawer shows: each card, its labelled rows, the words and markup of each list item
  async function open(fid) {
    await page.evaluate((x) => { nwDrawerClose(); v113FunOpen(x); }, fid);
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const d = document.getElementById('v113FunD');
      if (!d) return null;
      const cards = [...d.querySelectorAll('.v113-card')].map((c) => ({ h: c.querySelector('.v113-card-h').textContent,
        rows: [...c.querySelectorAll('.v113-st-r')].map((r) => ({ l: r.querySelector('span').textContent, items: [...r.querySelectorAll('li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
          html: [...r.querySelectorAll('li')].map((li) => li.innerHTML), p: ((r.querySelector('p') || {}).textContent || '').trim() })) }));
      const ul = d.querySelector('.v113-st-r ul'), li = ul && ul.querySelector('li'), card = ul && ul.closest('.v113-card');
      return { cards, text: d.innerText, pad: ul ? getComputedStyle(ul).paddingLeft : '', inset: li ? li.getBoundingClientRect().left - card.getBoundingClientRect().left : 0 };
    });
  }
  const rowOf = (v, card, label) => { const c = v.cards.find((x) => x.h === card); return c && c.rows.find((r) => r.l === label); };
  const all = [];

  // 1. the webinar: the agenda, the emails, the questions and the labels
  {
    const v = await open(WEB.id); all.push(v);
    check('the webinar\'s drawer opens with its ad and its four steps', v && JSON.stringify(v.cards.map((c) => c.h)) === JSON.stringify(['Ad A', 'Registration page', 'Two quick questions', 'Confirmation, reminder and follow-up emails', 'Session outline']), v && JSON.stringify(v.cards.map((c) => c.h)));
    const ag = rowOf(v, 'Session outline', 'Agenda');
    check('the session outline\'s agenda reads each line as its time and part (it printed blank bullets)', ag && JSON.stringify(ag.items) === JSON.stringify(['0:00 Welcome and what you will leave with', '0:05 Where AI touches client data today', '0:35 Your 90 day rollout']), ag && JSON.stringify(ag.items));
    check('the times sit in their own column', ag && ag.html.every((h) => /^<span class="v122-t">\d:\d\d<\/span> /.test(h)), ag && ag.html[0]);
    check('the outline\'s offer has a label of its own', (rowOf(v, 'Session outline', 'The offer') || {}).p === 'A 20 minute call to fit the plan to your firm');
    const em = rowOf(v, 'Confirmation, reminder and follow-up emails', 'Emails');
    check('each email says what it is called, when it goes and what it says', em && em.items[0] === 'You are in: Governed AI for RIAs · Right after sign-up Here is your Zoom link.' && em.items[1] === 'Tomorrow at 12pm Pacific · The day before Bring one AI tool your team uses.', em && JSON.stringify(em.items));
    check('with the subject in ink and the message on its own line', em && /^<b>You are in: Governed AI for RIAs<\/b> <span class="nw-faint">· Right after sign-up<\/span><br>Here is your Zoom link\.$/.test(em.html[0]), em && em.html[0]);
    const q = rowOf(v, 'Two quick questions', 'Questions');
    check('a question reads with its answers: no colon after a question mark, one after a bare label', q && q.items[0] === 'How many advisers are at your firm? 1 to 4 / 5 to 15 / 16 or more' && q.items[1] === 'Your role: Owner / COO', q && JSON.stringify(q.items));
    const reg = (v.cards.find((c) => c.h === 'Registration page') || { rows: [] }).rows.map((r) => r.l);
    check('the registration page\'s details read as words: who it is for, when, the presenter', JSON.stringify(reg) === JSON.stringify(['Headline', 'Bullets', 'Who it is for', 'When', 'Presenter', 'Button', 'Form fields']), JSON.stringify(reg));
    check('lists of words stay as they were', JSON.stringify((rowOf(v, 'Registration page', 'Bullets') || {}).items) === JSON.stringify(['Where AI touches client data', 'The three policies examiners ask for', 'A 90 day rollout']));
    check('the ad card still shows its copy and Make the image', (rowOf(v, 'Ad A', 'Hook') || {}).p === 'Your AI policy is a PDF nobody reads' && !!(await page.$('#v113FunD .v113-card:first-child button:has-text("Make the image")')));
    check('the bullets sit inside the card', v.pad === '18px' && v.inset >= 28, JSON.stringify({ pad: v.pad, inset: v.inset }));
  }

  // 2. a download, with a step of odd items: nothing blank, nothing printed as [object Object]
  {
    const v = await open(DOWN.id); all.push(v);
    check('a resource outline of plain lines reads as before', JSON.stringify((rowOf(v, 'Outline of the resource', 'Sections') || {}).items) === JSON.stringify(['Why a policy comes first', 'The three templates', 'Your first 30 days']));
    const odd = (v.cards.find((c) => c.h === 'Odd items') || { rows: [] }).rows;
    check('items with nothing to say are left out, and an unknown object reads as its values', JSON.stringify((odd.find((r) => r.l === 'Notes') || {}).items) === JSON.stringify(['bar']), JSON.stringify(odd.find((r) => r.l === 'Notes')));
    check('a row whose items are all empty is left out, label and all', !odd.some((r) => r.l === 'Blank'), JSON.stringify(odd.map((r) => r.l)));
    check('a nested value reads as its words', JSON.stringify((odd.find((r) => r.l === 'Emails') || {}).items) === JSON.stringify(['Nested deep text']), JSON.stringify(odd.find((r) => r.l === 'Emails')));
    check('an object value reads as labelled words, without its empty parts', (odd.find((r) => r.l === 'Extra') || {}).p === 'Price: $47 · Link: https://kit.example', JSON.stringify(odd.find((r) => r.l === 'Extra')));
    check('an unknown key still reads as a word', odd.some((r) => r.l === 'Extra'));
    check('a proof item from the team\'s library reads as its name and its claim', JSON.stringify((odd.find((r) => r.l === 'Proof') || {}).items) === JSON.stringify(['Hale Capital Prep went from 2 hours to 15 minutes']), JSON.stringify(odd.find((r) => r.l === 'Proof')));
  }

  // 3. a newsletter and a landing page
  {
    const n = await open(NEWS.id); all.push(n);
    check('a sign-up page says how often it goes out', (rowOf(n, 'Sign-up page', 'How often') || {}).p === 'Every Monday', JSON.stringify((n.cards.find((c) => c.h === 'Sign-up page') || {}).rows));
    const l = await open(LAND.id); all.push(l);
    check('a landing page\'s sections read as title and text', JSON.stringify((rowOf(l, 'Landing page', 'Sections') || {}).items) === JSON.stringify(['Where the hours go Three workflows take most of the week.']), JSON.stringify(rowOf(l, 'Landing page', 'Sections')));
    check('and its questions with their answers', JSON.stringify((rowOf(l, 'Landing page', 'Questions') || {}).items) === JSON.stringify(['Do I need to prepare anything? No, just bring your questions.']), JSON.stringify(rowOf(l, 'Landing page', 'Questions')));
    check('an empty proof list is left out', !rowOf(l, 'Landing page', 'Proof'));
  }

  // 4. across every funnel: no blank bullet, no raw text, every label a word
  {
    const items = all.flatMap((v) => v.cards.flatMap((c) => c.rows.flatMap((r) => r.items)));
    check('no funnel card has a blank bullet', items.length > 20 && items.every((x) => x.length > 0), String(items.filter((x) => !x.length).length));
    check('nothing prints as [object Object] or undefined', all.every((v) => !/\[object Object\]|\bundefined\b/.test(v.text)));
    const labels = all.flatMap((v) => v.cards.flatMap((c) => c.rows.map((r) => r.l)));
    check('every label starts with a capital, so none reads as a raw key', labels.every((x) => /^[A-Z]/.test(x)), JSON.stringify(labels.filter((x) => !/^[A-Z]/.test(x))));
  }

  await ctx.close();
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) console.log('FAILURES:\n- ' + failures.join('\n- '));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
