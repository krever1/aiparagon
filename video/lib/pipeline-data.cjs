// Made-up Pipeline demo world (Summit Business Advisors, a business advisory firm) on the repo's QA fixture tables,
// for the Pipeline demo video. Rebuilt Nov 17 after a container reset. Every firm, person, link and number here is
// invented; nothing is real CRM or client data. "Now" in the video is Mon 26 Oct 2026, 09:40 Pacific.
const ROOT = process.env.AP_ROOT || require('path').join(__dirname, '..', '..');
const QA = require(ROOT + '/tests/lib/qa-fixtures');
const iso = (s) => new Date(s).toISOString();
const RUN = 'agent1_2026-10-26_1300', PREV = 'agent1_2026-10-19_1300', ADRUN = 'agent2_2026-10-26_1400', LTRUN = 'lt_2026-10-26_1600';
const P = (n) => 'https://www.linkedin.com/posts/summit-demo-' + n + '_activity-77' + n;
const AD = (n) => 'https://www.facebook.com/ads/library/?id=88' + n;
const IMG = (f) => 'https://lesyptuwllcgajdxzjje.supabase.co/storage/v1/object/public/creatives/' + f;

// ---------- the Intel Tracker: what the market posts and engages with ----------
const POSTS = [
  { n: 1, who: 'Corvin Group', fmt: 'Opinion post', head: 'Most scaling problems are decisions nobody wrote down', eng: 1002, th: ['decisions', 'scaling'], q: 'Who decides when the founder is out?', sum: 'Argues that teams stall when decisions live in people\'s heads, and asks readers which decision they would write down first.', score: 92 },
  { n: 2, who: 'Maya Lindqvist', fmt: 'Story', head: 'We hired three managers before we wrote down one decision', eng: 640, th: ['hiring', 'decisions'], q: '', sum: 'A founder on what broke when new managers had nothing written to work from.', score: 88 },
  { n: 3, who: 'Dana Reyes', fmt: 'Opinion post', head: 'You are not short of people. You are short of decisions.', eng: 410, th: ['hiring', 'decisions'], q: 'What would you stop hiring for?', sum: 'A misconception opening that drew a long comment thread of owners naming the decision they keep making themselves.', score: 84 },
  { n: 4, who: 'Ellis Park Partners', fmt: 'Framework', head: 'The four handoffs every 30-person firm gets wrong', eng: 320, th: ['scaling', 'operations'], q: '', sum: 'A named framework post that readers saved and shared.', score: 79 },
  { n: 5, who: 'Priya Sandoval', fmt: 'Case study', head: 'What a missed delivery window really cost us', eng: 260, th: ['operations'], q: 'How do you price the cost of waiting?', sum: 'A cost-of-waiting story told without a single number, and it landed.', score: 74 },
  { n: 6, who: 'Corvin Group', fmt: 'Carousel', head: 'Five decisions to write down before your next hire', eng: 230, th: ['hiring', 'decisions'], q: '', sum: 'A checklist carousel; the comments became a list of questions owners ask.', score: 71 },
  { n: 7, who: 'Tom Ashby', fmt: 'Job post', head: 'Hiring an operations lead', eng: 14, th: ['hiring'], q: '', sum: 'A job post.', score: 22 },
  { n: 8, who: 'Lena Hart', fmt: 'Podcast', head: 'Episode on running a firm past 40 people', eng: 60, th: ['scaling'], q: '', sum: 'A podcast episode.', score: 31 },
];
const MD = [
  '# Competitor Intelligence Brief · 2026-10-26',
  '**Prepared by:** Agent 1 · Competitor Intelligence Tracker',
  '**Window:** 2026-10-19 13:00 UTC → 2026-10-26 13:00 UTC   ·   **Run ID:** ' + RUN,
  '', '---', '',
  '## 1. TL;DR', '',
  '- **[Undocumented decisions are the theme that lands](' + P(1) + ')**: Posts that name the decision nobody wrote down draw the most comments from owners.',
  '- **[Misconception openings beat offer-led ones](' + P(3) + ')**: "You are not short of people" outperformed every post that opened on a service.',
  '- **Named frameworks travel further**: Checklists and named frameworks get saved and shared.',
  '', '---', '',
  '## 2. Signal snapshot', '', '| Metric | Detail |', '|---|---|', '| Items by platform | linkedin (8) |',
  '', '---', '',
  '## 3. Emerging angles & sophistication shifts', '',
  '**Shift: From "we need more people" to "we need decisions written down"**',
  '- Owners are tired of hiring their way out of bottlenecks.',
  '- **Evidence:** [Maya Lindqvist](' + P(2) + '): Three managers hired before one decision was written down.',
  '- **For our posts:** Lead with the decision, not the headcount',
  '',
  '**Shift: Stories over numbers**',
  '- Cost-of-waiting stories land without a single figure.',
  '- **Evidence:** [Priya Sandoval](' + P(5) + '): A missed delivery window, told as a story.',
  '- **For our posts:** Tell the cost of waiting as a story',
  '', '---', '',
  '## 4. Notable developments', '', '### Thought leadership', '',
  '**Decisions, not headcount** · [Dana Reyes](' + P(3) + '): A misconception opening with a long comment thread. *Why it matters:* Names the owner\'s real problem.',
  '',
  '**A named framework for handoffs** · [Ellis Park Partners](' + P(4) + '): Four handoffs, named. *Why it matters:* Frameworks get saved.',
  '', '### Offers', '', 'No discrete offers or gated content detected this period.',
  '', '---', '',
  '## 5. Topic watch · Scaling · Hiring', '', '**Scaling**', '',
  '[Corvin Group](' + P(1) + '): Decisions nobody wrote down stall growth.', '',
].join('\n');
const itemOf = (x) => ({ url: P(x.n), type: 'thought_leadership', format: x.fmt, signal: 'Owners respond to ' + x.head.toLowerCase() + '.', themes: x.th, summary: x.sum,
  working: 'What works here: ' + x.head.toLowerCase() + '.', headline: x.head, platform: 'linkedin', competitor: x.who, ad_context_value: 'high', engagement_total: x.eng });
const briefItems = POSTS.slice(0, 6).map(itemOf);
const DATA = {
  date: '2026-10-26', run_id: RUN, industry: 'Business advisory', window_start: '2026-10-19 13:00 UTC', window_end: '2026-10-26 13:00 UTC', run_type: 'scheduled',
  n_items: 8, n_high_value: 6, n_engagement_drafts: 2, n_irrelevant_filtered: 4, n_low_engagement_filtered: 11,
  items: briefItems, high_value_items: briefItems,
  top_themes: [{ theme: 'decisions', count: 9 }, { theme: 'hiring', count: 6 }],
  topic_watch: { scaling: [{ url: P(1), competitor: 'Corvin Group', summary: 'Decisions nobody wrote down stall growth.' }] },
  sophistication_shifts: [{ url: P(2), note: 'From more people to decisions written down', summary: 'Owners are tired of hiring their way out of bottlenecks.' }],
};
const SNAP = { for: 'thought leadership', items: [
  { text: 'Misconception openings beat offer-led ones', why: '"You are not short of people" drew more comments than any post that opened on a service', tag: 'Messaging' },
  { text: 'Undocumented decisions is the theme that lands', why: 'Posts naming the decision nobody wrote down drew the most owner comments', tag: 'Positioning' },
  { text: 'Named frameworks travel further', why: 'Checklists and named frameworks were saved and shared the most', tag: 'Format' },
  { text: 'The comments are the question list', why: 'Owners asked the same five questions under every post on decisions', tag: 'Engagement' },
  { text: 'Cost-of-waiting stories land without numbers', why: 'A missed delivery window told as a story outperformed number-led posts', tag: 'Story' },
] };
const intelRow = (id, run, created, md, data, snap) => ({ id, run_id: run, agent: 'intel_tracker', output_type: 'intel_brief', title: 'Competitor Intelligence Brief', created_at: created,
  content_md: md, data: JSON.stringify(data), snapshot: snap ? JSON.stringify(snap) : null, edited_by_human: false });

// ---------- the Ad Strategist: what competitors keep paying to run ----------
const ADS = [
  { n: 1, adv: 'Brightpath Advisors', hook: 'You do not have a hiring problem.', cta: 'Book now', fmt: 'static_image', days: 68, offer: 'Free scaling assessment', price: null, sl: false, score: 83 },
  { n: 2, adv: 'Lattice Partners', hook: 'Before your next hire, write down these five decisions.', cta: 'Download', fmt: 'static_image', days: 54, offer: 'Decision checklist download', price: null, sl: false, score: 74 },
  { n: 3, adv: 'Northbeam Consulting', hook: 'The 40-person plateau: a 45-minute live workshop', cta: 'Sign up', fmt: 'static_image', days: 47, offer: '47 dollar live workshop', price: 47, sl: true, score: 65 },
  { n: 4, adv: 'Harbor & Vale', hook: 'Your operations hire is already nine months late.', cta: 'Learn more', fmt: 'static_image', days: 43, offer: 'Operations readiness quiz', price: null, sl: false, score: 56 },
  { n: 5, adv: 'Keystone Growth', hook: 'Grow without the growing pains', cta: 'Learn more', fmt: 'text', days: 12, offer: 'Free consultation', price: null, sl: false, score: 31 },
  { n: 6, adv: 'Brightpath Advisors', hook: 'Is your team waiting on you?', cta: 'Learn more', fmt: 'video', days: 9, offer: 'Free scaling assessment', price: null, sl: false, score: 27 },
];
const ADCOL = { 1: ['#f6d5e3', '#7a2c50'], 2: ['#ead6f2', '#4a2c63'], 3: ['#d4eef0', '#1f5c63'], 4: ['#eaf0d2', '#4c5a1d'], 5: ['#f1e8d8', '#5b4a2a'], 6: ['#f6d5e3', '#7a2c50'] };
const adImg = (a) => 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="' + ADCOL[a.n][0] + '"/>' +
  wrap(a.hook, 18).map((l, i, all) => '<text x="44" y="' + (300 - all.length * 30 + i * 62) + '" font-family="Georgia, serif" font-size="50" fill="' + ADCOL[a.n][1] + '">' + l.replace(/&/g, '&amp;') + '</text>').join('') + '</svg>');
function wrap(t, w) { const out = []; let cur = ''; t.split(' ').forEach((x) => { if ((cur + ' ' + x).trim().length > w && cur) { out.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); }); if (cur) out.push(cur); return out; }
const adRows = ADS.map((a) => ({ id: '00000000-0000-4000-8000-0000000000a' + a.n, run_id: ADRUN, advertiser_name: a.adv, hook: a.hook, body: a.hook + ' Most firms between 20 and 100 people hit the same wall. We find the decisions that hold it up.', cta: a.cta,
  format: a.fmt, days_running: a.days, destination_url: 'https://' + a.adv.toLowerCase().replace(/[^a-z]+/g, '') + '.example/', offer_inferred: a.offer, price_point_inferred: a.price, self_liquidating: a.sl, is_active: a.days > 20, stale_days: a.days > 20 ? 1 : 30,
  performance_score: a.score / 100, ad_library_url: AD(a.n), source: 'library_pull', copy_formula: 'misconception -> real problem -> named framework -> offer -> CTA', funnel_stage: 'tof', extracted_patterns: ['Misconception hook'],
  created_at: '2026-10-26T14:0' + a.n + ':00Z', image_url: a.fmt === 'text' ? '' : adImg(a), uploaded_by: null, iteration_group: null, in_brief: a.n <= 4, industry: 'Business advisory' }));
const ADMD = ['# Creative Brief', '', '## 8. Evidence', '', ...ADS.slice(0, 4).map((a) => a.n + '. **' + a.adv + '** - ' + a.days + ' days, still running\n   "' + a.hook + '"\n   ' + AD(a.n)), ''].join('\n');
const CB = {
  id: '00000000-0000-4000-8000-0000000000c1', run_id: ADRUN, created_at: '2026-10-26T14:30:00Z', run_date: '2026-10-26', source_ad_ids: adRows.slice(0, 4).map((r) => r.id), source_intel_ids: [], source_intel_run: RUN,
  winning_hooks: JSON.stringify(['Open on the misconception: "You do not have a hiring problem"', 'Name the plateau by headcount', 'Tell them what to write down before the next hire', 'Say the hire is already late']),
  winning_offers: JSON.stringify([{ type: 'Free scaling assessment', price_point: null, self_liquidating: false, notes: 'The longest-running offer: 68 days.' }, { type: 'Low-ticket workshop', price_point: 47, self_liquidating: true, notes: 'One advertiser has run a 47 dollar workshop for 47 days.' }]),
  copy_formula: 'misconception -> real problem -> named framework -> offer -> CTA',
  core_pain_points: JSON.stringify(['Every decision waits on the founder', 'New managers have nothing written to work from', 'Hiring has not fixed the bottleneck']),
  objection_themes: JSON.stringify(['We are too busy to stop and write things down', 'We tried consultants before and nothing changed']),
  differentiation_angle: 'You have a named five-decision framework. Most of these advertisers have no framework at all.',
  cross_niche_sources: JSON.stringify(['Checklist downloads from HR software', 'Low-ticket workshops from coaching']),
  sophistication_level: '3', confidence: 0.74,
};
const AD_SNAP = { items: [
  { text: 'Misconception hooks run longest', why: 'The longest-running ad opens by telling buyers what they get wrong', tag: 'Hook' },
  { text: 'A named framework carries the offer', why: 'Checklist and framework ads kept running for weeks', tag: 'Offer' },
  { text: 'Workshops pay for the ad spend', why: 'One advertiser has run a 47 dollar workshop for 47 days', tag: 'Offer' },
], hook_sources: [] };

// ---------- Marketing Generation: the Scaling Review campaign (book a call) ----------
const HOOKS = ['You do not have a hiring problem.', 'Write down five decisions before your next hire.', 'The 40-person plateau has a fix.'];
const LT = { id: '00000000-0000-4000-8000-0000000f0101', run_id: LTRUN, agent: 'low_ticket_content', output_type: 'funnel_package', title: 'Campaign · Scaling Review · 2026-10-26', created_at: iso('2026-10-26T16:00:00Z'),
  content_md: '# Funnel Package\n\n## Ads\n\n' + HOOKS.map((h, i) => '**Variant ' + 'ABC'[i] + '**: ' + h).join('\n\n'), snapshot: null, edited_by_human: false,
  data: JSON.stringify({ offer_name: 'Scaling Review', funnel_mode: 'direct_to_call', status: 'pending_approval', source_brief_run: ADRUN, call_minutes: 20,
    ad_images: ['a', 'b', 'c'].map((v, i) => ({ variant: v.toUpperCase(), label: ['Misconception', 'Checklist', 'Plateau'][i], url: IMG('summit-' + v + '.png'), file: 'summit-' + v + '.png' })),
    setup: { booking: { name: 'Scaling Review', url: 'https://calendly.com/summit-advisors/scaling-review', duration: 20 } },
    assets: [{ title: 'Overview', content_md: '# Funnel Package' }, { title: 'Ads', content_md: '## Ads' }, { title: 'Qualification survey', content_md: '## Survey' }, { title: 'Landing page', content_md: '## Landing page' }, { title: 'Booking page', content_md: '## Booking page' }] }) };
const PKG = { id: '00000000-0000-4000-8000-0000000000b1', creative_brief_id: CB.id, offer_id: '00000000-0000-4000-8000-0000000000f1', run_id: LTRUN, run_date: '2026-10-26', status: 'pending_approval',
  created_at: iso('2026-10-26T15:59:00Z'), updated_at: iso('2026-10-26T15:59:00Z'), funnel_type: null, requested_by: 'jordan@summitadvisors.example',
  ad_variations: JSON.stringify({ stable_body: 'Growth stalls at the handoff, not the hire. In 20 minutes we will find the decisions slowing your team down.', hook_variations: HOOKS, cta: 'Book your Scaling Review' }),
  survey: JSON.stringify({ questions: [{ question: 'How many people are on your team?', type: 'qualify' }, { question: 'Which decisions still wait on you?', type: 'qualify' }, { question: 'What have you tried so far?', type: 'qualify' }, { question: 'When do you want this fixed?', type: 'qualify' }] }),
  landing_page: JSON.stringify({ vsl_state: 'image_led', headline: 'Find the decisions slowing your team down', subheadline: 'A free 20-minute Scaling Review', benefit_bullets: ['See which decisions wait on you', 'Leave with the five to write down first'], cta: 'Book your Scaling Review' }),
  booking_page: JSON.stringify({ headline: 'Pick a time for your Scaling Review', reassurance_subhead: '20 minutes, no pitch', what_happens_next: ['Pick a time', 'Answer four short questions', 'Get the map'], primary_action: 'Book it', confirmation_microcopy: 'See you then' }),
  test_plan: JSON.stringify({ phase_1: 'Weeks 1-2: test the three hooks', phase_2: 'Weeks 3-4: test the offer' }), variant_copy: {}, original_snapshot: null, notes: JSON.stringify({ through_line: 'Decisions, not headcount' }), source_brief_id: CB.id,
  setup: JSON.stringify({ booking: { name: 'Scaling Review', url: 'https://calendly.com/summit-advisors/scaling-review', duration: 20 }, cta: 'Book your Scaling Review', call_minutes: 20 }) };

// ---------- content drafts: one from the team's own material (Content Transformation), one from the organic brief ----------
const REQ_MINE = { id: '00000000-0000-4000-8000-0000000c0e01', title: 'Our handoff workshop notes', source_type: 'article', start_mode: 'material', format: 'thought_leadership', content_type: 'linkedin_post', status: 'done', created_at: iso('2026-10-26T15:20:00Z'), requested_by: 'jordan@summitadvisors.example', brief: {}, extraction: {}, setup: {} };
const REQ_BRIEF = { id: '00000000-0000-4000-8000-0000000c0e02', title: 'From the organic brief of 26 Oct', source_type: 'brief', start_mode: 'brief', format: 'thought_leadership', content_type: 'linkedin_post', status: 'done', created_at: iso('2026-10-26T15:40:00Z'), requested_by: 'jordan@summitadvisors.example', brief: {}, extraction: {}, setup: {} };
const DRAFT_MINE = { id: '00000000-0000-4000-8000-0000000d0e01', run_id: 'cf_2026-10-26_1521', agent: 'content_generation', output_type: 'content_draft', title: 'You do not have a hiring problem', created_at: iso('2026-10-26T15:21:00Z'),
  content_md: '', snapshot: null, edited_by_human: false,
  data: JSON.stringify({ format: 'thought_leadership', source_type: 'article', request_id: REQ_MINE.id, title: 'You do not have a hiring problem', brief: { primary_signal: 'intel_tracker' },
    hooks: [{ text: 'You do not have a hiring problem. You have a handoff problem.' }, { text: 'Most teams between 20 and 100 people hire their way into the same wall.' }],
    body: 'Most teams between 20 and 100 people think they are short of people.\n\nIn our work, growth stalls somewhere else: at the handoff. The founder still makes the call, the new manager waits, and the work sits.\n\nBefore your next hire, write down the five decisions that still wait on you. Then hand them over.',
    cta: 'What is the one decision you would write down first?', hashtags: [], review_flags: [], trace: { body: 'From your workshop notes', hooks: 'Inferred market patterns' } }) };
const DRAFT_BRIEF = { id: '00000000-0000-4000-8000-0000000d0e02', run_id: 'cf_2026-10-26_1541', agent: 'content_generation', output_type: 'content_draft', title: 'Your team is not slow. Your decisions are unwritten.', created_at: iso('2026-10-26T15:41:00Z'),
  content_md: '', snapshot: null, edited_by_human: false,
  data: JSON.stringify({ format: 'thought_leadership', source_type: 'brief', request_id: REQ_BRIEF.id, title: 'Your team is not slow. Your decisions are unwritten.', brief: { primary_signal: 'intel_tracker' },
    hooks: [{ text: 'Your team is not slow. Your decisions are unwritten.' }, { text: 'You are not short of people. You are short of decisions.' }, { text: 'Three managers, zero written decisions. Here is what broke.' }],
    body: 'Every owner we talk to says the same thing: the team waits on me.\n\nIt is rarely a people problem. It is five or six decisions that live in one head, so every one of them comes back to you.\n\nWrite them down. Who approves pricing. Who can say no to a client. What "done" means on a delivery. Then watch what moves without you.',
    cta: 'Which decision does your team still wait on you for?', hashtags: [], review_flags: [], trace: { body: 'From the organic brief of 26 Oct: undocumented decisions, misconception openings', hooks: 'The brief\'s five things working' } }) };

// ---------- Ad Testing ----------
const R = (id, title, spend, leads, booked, extra) => Object.assign({ id, kind: 'ad', title, platform: 'facebook', spend, leads, qualified_leads: Math.round(leads * 0.6), booked_calls: booked, clients_won: null, revenue: null, impressions: spend * 95, clicks: Math.round(spend * 1.6),
  attribution: 'manual', posted_on: '2026-10-05', created_at: iso('2026-10-24T10:00:00Z'), created_by: 'jordan@summitadvisors.example' }, extra || {});
const RESULTS = [
  R('r1', 'P1031-A1 · You do not have a hiring problem', 420, 41, 9),
  R('r2', 'P1031-A2 · Write down five decisions before your next hire', 380, 33, 5),
  R('r3', 'P1028-A2 · Scaling past 50? Start here', 390, 18, 2, { posted_on: '2026-09-28' }),
  R('r4', 'P1031-A3 · The 40-person plateau has a fix', 380, 16, 2),
];
const READ = { id: '00000000-0000-4000-8000-0000000f0201', run_id: 'insights_2026-10-26', agent: 'strategy_insights', output_type: 'strategy_insights', title: 'Strategy read', created_at: iso('2026-10-26T14:20:00Z'), content_md: '', snapshot: null, edited_by_human: false,
  data: JSON.stringify({ focus: 'what to run next', requested_by: 'jordan@summitadvisors.example', counts: { posts: 8, ads: 4 }, review_flags: [],
    insights: { headline: 'Put the budget behind the handoff hook', summary: 'The misconception hook books calls for the least spend, and it matches what your market responds to.',
      vision_fit: { read: 'A short free call that leads to the operating model project, which is what the briefs say owners want.', gaps: [] }, missing: [],
      recommendations: [{ title: 'A fourth variant of "You do not have a hiring problem" for LinkedIn', priority: 'now', format: 'ad', start: 'marketing', why: 'It books calls at $46.67 each.', angle: 'The handoff, not the hire' },
        { title: 'A carousel: the five decisions to write down', priority: 'next', format: 'post', why: 'Named frameworks travel further.', angle: 'The five decisions' }],
      double_down: ['The misconception opening', 'The free 20-minute review'], change_or_stop: ['Number-led hooks'], content_mix: '' } }) };

function tables() {
  const t = QA.tables();
  t.agent_outputs = t.agent_outputs.filter((o) => !['intel_tracker', 'ad_strategist', 'low_ticket_content', 'strategy_insights'].includes(o.agent));
  t.agent_outputs.push(
    intelRow('00000000-0000-4000-8000-000000000001', RUN, '2026-10-26T13:11:00Z', MD, DATA, SNAP),
    intelRow('00000000-0000-4000-8000-000000000003', PREV, '2026-10-19T13:09:00Z', MD.replace(RUN, PREV).replace('2026-10-26', '2026-10-19'), Object.assign({}, DATA, { run_id: PREV, date: '2026-10-19' }), SNAP),
    { id: '00000000-0000-4000-8000-0000000000d1', run_id: ADRUN, agent: 'ad_strategist', output_type: 'creative_brief', title: 'Creative Brief', created_at: '2026-10-26T14:31:00Z', content_md: ADMD, data: JSON.stringify({ run_id: ADRUN }), snapshot: JSON.stringify(AD_SNAP), edited_by_human: false },
    LT, READ, DRAFT_MINE, DRAFT_BRIEF);
  t.creative_briefs = [CB];
  t.intel_items = POSTS.map((x) => ({ id: '00000000-0000-4000-8000-0000000001' + String(x.n).padStart(2, '0'), run_id: RUN, url: P(x.n), platform: 'linkedin', author_name: x.who, headline: x.head, summary: x.sum,
    working: 'What works here: ' + x.head.toLowerCase() + '.', signal: 'Owners respond to ' + x.head.toLowerCase(), content_format: x.fmt, themes: x.th, engagement_total: x.eng, engagement_score: x.eng, score: x.score,
    ad_context_value: x.n <= 6 ? 'high' : 'low', in_brief: x.n <= 6, published_at: '2026-10-2' + (x.n % 5) + 'T1' + x.n + ':00:00Z', created_at: '2026-10-26T13:0' + x.n + ':00Z', raw_text: x.head + '. ' + (x.q ? x.q + ' ' : '') + x.sum }));
  t.winner_creatives = adRows; t.ad_records = adRows;
  t.runs = [{ run_id: RUN, agent: 'intel_tracker', status: 'success', run_date: '2026-10-26', started_at: '2026-10-26T13:00:00Z', finished_at: '2026-10-26T13:11:00Z', stats: { items: 8, high_value: 6 } },
    { run_id: PREV, agent: 'intel_tracker', status: 'success', run_date: '2026-10-19', started_at: '2026-10-19T13:00:00Z', finished_at: '2026-10-19T13:09:00Z', stats: { items: 7 } },
    { run_id: ADRUN, agent: 'ad_strategist', status: 'success', run_date: '2026-10-26', started_at: '2026-10-26T14:00:00Z', finished_at: '2026-10-26T14:31:00Z', stats: {} }];
  t.competitors = [
    { id: '00000000-0000-4000-8000-0000000000e1', name: 'Corvin Group', handle_linkedin: 'company/corvin-demo', meta_page_id: null, status: 'approved', source: 'manual', follow_kind: 'company', follow_for: 'both', created_at: '2026-09-01T00:00:00Z' },
    { id: '00000000-0000-4000-8000-0000000000e2', name: 'Brightpath Advisors', handle_linkedin: null, meta_page_id: '2000001', status: 'approved', source: 'manual', follow_kind: 'company', follow_for: 'both', created_at: '2026-09-02T00:00:00Z' },
    { id: '00000000-0000-4000-8000-0000000000e3', name: 'Lattice Partners', handle_linkedin: null, meta_page_id: '2000002', status: 'approved', source: 'manual', follow_kind: 'company', follow_for: 'ads', created_at: '2026-09-03T00:00:00Z' },
    { id: '00000000-0000-4000-8000-0000000000e4', name: 'Maya Lindqvist', handle_linkedin: 'in/maya-demo', meta_page_id: null, status: 'approved', source: 'manual', follow_kind: 'person', follow_for: 'posts', created_at: '2026-09-04T00:00:00Z' },
    { id: '00000000-0000-4000-8000-0000000000e5', name: 'Dana Reyes', handle_linkedin: 'in/dana-demo', meta_page_id: null, status: 'approved', source: 'manual', follow_kind: 'person', follow_for: 'posts', created_at: '2026-09-05T00:00:00Z' },
  ];
  t.engagement_drafts = [
    { id: '00000000-0000-4000-8000-00000000d001', run_id: RUN, intel_item_id: '00000000-0000-4000-8000-000000000101', competitor_name: 'Corvin Group', platform: 'linkedin', action: 'comment', source_url: P(1), draft: 'Pricing approval is the one we see most. Who signs off when the founder is out?', status: 'pending', created_at: iso('2026-10-26T13:11:00Z') },
    { id: '00000000-0000-4000-8000-00000000d002', run_id: RUN, intel_item_id: '00000000-0000-4000-8000-000000000103', competitor_name: 'Dana Reyes', platform: 'linkedin', action: 'comment', source_url: P(3), draft: 'Short of decisions is exactly it.', status: 'pending', created_at: iso('2026-10-26T13:11:00Z') },
  ];
  t.funnel_packages = [PKG];
  t.offers = [Object.assign({}, t.offers[0], { name: 'Scaling Review', type: 'call', price: 0, whats_included: 'A free 20-minute Scaling Review', price_label: 'Free', action: 'Book a call' })];
  t.agent_feedback = [
    { id: 'fb-r1', agent: 'low_ticket_content', target_type: 'ad_copy', target_id: 'lt_2026-10-19_1600:A', action: 'rejected', feedback: 'Too salesy. Lead with the problem, not the offer.', author: 'jordan@summitadvisors.example', created_at: iso('2026-10-20T10:00:00Z') },
    { id: 'fb-r2', agent: 'intel_tracker', target_type: 'engagement_draft', target_id: 'old-reply-1', action: 'rejected', feedback: 'Reply: too generic. Say which decision.', author: 'jordan@summitadvisors.example', created_at: iso('2026-10-21T10:00:00Z') },
    { id: 'fb-b', agent: 'low_ticket_content', target_type: 'ad_image_variant', target_id: 'summit-b.png', action: 'approved', author: 'jordan@summitadvisors.example', created_at: iso('2026-10-26T16:10:00Z') }];
  t.content_requests = [REQ_MINE, REQ_BRIEF];
  t.content_results = RESULTS;
  t.company_profile = [Object.assign({}, t.company_profile[0], { business_name: 'Summit Business Advisors', contact_name: 'Jordan Reyes', website: 'https://summitadvisors.example', industry: 'Business advisory',
    description: 'We help owner-led firms between 20 and 100 people scale past the founder', services: 'Scaling reviews, operating model design', target_market: 'Owner-led firms, 20 to 100 people', brand_voice: 'Plain, practical, calm' })];
  t.brand_voice = [Object.assign({}, t.brand_voice[0], { created_at: iso('2026-09-30T17:00:00Z'), created_by: 'Jordan Reyes', about: 'We help owner-led firms scale past the founder', audience: 'Founders and COOs of 20 to 100 person firms',
    tone: ['plain', 'practical', 'calm'], phrases: 'Decisions, not headcount', avoid: 'Hype, guarantees', compiled: 'Plain, practical and calm.', values_text: 'Clarity over volume', mission: 'Help owners stop being the bottleneck' })];
  t.client_personas = [Object.assign({}, t.client_personas[0], { name: 'Stretched founder', role: 'Founder', firm: 'Owner-led firm', size: '20-100', pain: 'Every decision waits on them' })];
  t.client_proof = [Object.assign({}, t.client_proof[0], { name: 'Hillcrest Logistics', claim: 'Pricing calls no longer wait on the founder' })];
  t.ai_rules = [
    { id: 'rule-1', rule: 'Never promise a number of hours saved', category: 'claims', applies_to: ['all'], active: true, source: 'manual', created_by: 'Jordan Reyes', created_at: iso('2026-10-01T00:00:00Z'), updated_at: iso('2026-10-01T00:00:00Z') },
    { id: 'rule-2', rule: 'Say "owner-led firm", not "SMB"', category: 'voice', applies_to: ['all'], active: true, source: 'manual', created_by: 'Jordan Reyes', created_at: iso('2026-10-02T00:00:00Z'), updated_at: iso('2026-10-02T00:00:00Z') },
    { id: 'rule-3', rule: 'No hashtags on LinkedIn posts', category: 'format', applies_to: ['content_generation'], active: true, source: 'manual', created_by: 'Jordan Reyes', created_at: iso('2026-10-03T00:00:00Z'), updated_at: iso('2026-10-03T00:00:00Z') },
  ];
  t.doc_templates = [Object.assign({}, t.doc_templates[0], { name: 'LinkedIn post', rules: 'No hashtags' }),
    Object.assign({}, t.doc_templates[0], { id: '00000000-0000-4000-8000-0000000a0002', name: 'Newsletter', format: 'newsletter' }),
    Object.assign({}, t.doc_templates[0], { id: '00000000-0000-4000-8000-0000000a0003', name: 'Case study', format: 'case_study' })];
  t.guide_files = [Object.assign({}, t.guide_files[0], { file_name: 'Summit five-decision framework.docx' })];
  t.ai_settings = t.ai_settings.filter((x) => x.key !== 'ad_industries').concat([{ key: 'ad_industries', value: { 'brightpath advisors': 'Business advisory', 'lattice partners': 'Business advisory', 'northbeam consulting': 'Management consulting', 'harbor & vale': 'Operations consulting', 'keystone growth': 'Business coaching' }, updated_at: iso('2026-10-20T10:00:00Z') }]);
  t.e1_leads = []; t.hubspot_contacts = []; t.lead_files = []; t.call_outputs = []; t.dashboard_comments = []; t.lp_signups = []; t.landing_pages = [];
  return t;
}
module.exports = { tables, RUN, ADRUN, LTRUN, IMG, HOOKS };
