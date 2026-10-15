// Synthetic Engine 3 data for the briefs, Ad Strategist and content suites. Shaped like what the
// Intel Tracker and the Ad Strategist store (an organic brief keeps its data and snapshot as JSON
// strings; ads briefs keep their lists as JSON strings), with made-up firms, people and links.
const RUN = 'agent1_2026-10-14_1300';
const PREV = 'agent1_2026-10-13_1300';
const ADRUN = 'agent2_2026-10-10_0900';
const P = (n) => 'https://www.linkedin.com/posts/qa-author-' + n + '_activity-77' + n;
const AD = (n) => 'https://www.facebook.com/ads/library/?id=99' + n;

const MD = [
  '# Competitor Intelligence Brief · 2026-10-14',
  '**Prepared by:** Agent 1 · Competitor Intelligence Tracker',
  '**Window:** 2026-10-13 13:00 UTC → 2026-10-14 13:00 UTC   ·   **Run ID:** ' + RUN,
  '',
  '---',
  '',
  '## 1. TL;DR',
  '',
  '- **[Governance is the buying question](' + P(1) + ')**: Several voices say firms cannot explain AI decisions to regulators, and that gap is now urgent.',
  '- **[Readiness is a valuation question](' + P(2) + ')**: Firms with measured workflow results are priced as assets.',
  '- **Trust gates adoption**: Buyers do not trust AI output without a way to check it.',
  '',
  '---',
  '',
  '## 2. Signal snapshot',
  '',
  '| Metric | Detail |',
  '|---|---|',
  '| Items by platform | linkedin (6) |',
  '',
  '---',
  '',
  '## 3. Emerging angles & sophistication shifts',
  '',
  '**Shift: From cutting costs to better advice**',
  '- Cost savings are table stakes; buyers want AI that improves the advice itself.',
  '- **Evidence:** [Avery Quill](' + P(3) + '): Argues the cost debate misses the chance to improve advice quality.',
  '- **For our ads:** Lead with better advice, not cheaper advice → hand to Agent 3',
  '',
  '**Shift: From pilots to governed rollout**',
  '- Fragmented pilots no longer count; enterprise governance is the bar.',
  '- **Evidence:** [Blake Rowan](' + P(4) + '): A summit poll found leaders ready to hand routine tasks to AI with oversight.',
  '- **For our ads:** Position the offer as the bridge out of pilot purgatory → hand to Agent 3',
  '',
  '**Shift: Proof before investors ask**',
  '- Buyers are judged on AI readiness in due diligence.',
  '- **Evidence:** [Casey Lark](' + P(2) + '): Firms with measured outcomes are assets; unused seats are costs.',
  '- **For our ads:** Frame the work as investor-ready proof → hand to Agent 3',
  '',
  '---',
  '',
  '## 4. Notable developments',
  '',
  '### Thought leadership',
  '',
  '**Fluency is not verification** · [Dana Fenn](' + P(5) + '): AI answers sound equally sure when right or wrong. *Why it matters:* Names the core buyer fear.',
  '',
  '**Accountability stays with the firm** · [Northwind Advisory](' + P(1) + '): Trust needs scope, sources and guardrails. *Why it matters:* Resonant language for risk-aware buyers.',
  '',
  '### News',
  '',
  '**Regional rules set a 2027 deadline** · [Emery Stone](' + P(6) + '): A regulator gave firms until 2027 to inventory their AI. *Why it matters:* A concrete reason to act now.',
  '',
  '### Offers',
  '',
  'No discrete offers or gated content detected this period.',
  '',
  '---',
  '',
  '## 5. Topic watch · Security · Governance',
  '',
  '**Governance**',
  '',
  '[Northwind Advisory](' + P(1) + '): Accountability never shifts to the technology.',
  '',
  '[Emery Stone](' + P(6) + '): Firms must inventory AI systems by 2027.',
  '',
].join('\n');

const ITEMS = [
  { n: 1, who: 'Northwind Advisory', fmt: 'Opinion post', head: 'Accountability stays with the firm', eng: 410, th: ['governance', 'ai-adoption'], q: 'Who signs off when the model is wrong?' },
  { n: 2, who: 'Casey Lark', fmt: 'Case study', head: 'Measured outcomes make AI an asset', eng: 260, th: ['value-and-results'], q: '' },
  { n: 3, who: 'Avery Quill', fmt: 'Opinion post', head: 'Better advice, not cheaper advice', eng: 180, th: ['ai-adoption'], q: 'What if AI made advice better instead of cheaper?' },
  { n: 4, who: 'Blake Rowan', fmt: 'Event recap', head: 'Summit poll on delegating routine tasks', eng: 150, th: ['ai-adoption', 'governance'], q: '' },
  { n: 5, who: 'Dana Fenn', fmt: 'How-to guide', head: 'Check AI answers like board numbers', eng: 95, th: ['governance'], q: 'How do you check an answer that sounds certain?' },
  { n: 6, who: 'Emery Stone', fmt: 'News', head: 'Regulator sets a 2027 AI inventory deadline', eng: 120, th: ['regulation', 'governance'], q: '' },
  { n: 7, who: 'Finley Moss', fmt: 'Job post', head: 'Hiring an AI lead', eng: 12, th: ['hiring'], q: '' },
  { n: 8, who: 'Gray Hollis', fmt: 'Podcast', head: 'Episode on AI in client reviews', eng: 70, th: ['ai-adoption'], q: '' },
];
const briefItems = ITEMS.slice(0, 6).map((x) => ({ url: P(x.n), type: 'thought_leadership', format: x.fmt, signal: 'Useful framing for ' + x.head.toLowerCase() + '.', themes: x.th,
  summary: x.head + '. A synthetic summary for tests.', working: 'What works here: ' + x.head.toLowerCase() + '.', headline: x.head, platform: 'linkedin', competitor: x.who, ad_context_value: 'high', engagement_total: x.eng }));
const DATA = {
  date: '2026-10-14', run_id: RUN, industry: 'AI Strategy and Implementation Consulting', window_start: '2026-10-13 13:00 UTC', window_end: '2026-10-14 13:00 UTC', run_type: 'scheduled',
  n_items: 8, n_high_value: 6, n_engagement_drafts: 2, n_irrelevant_filtered: 3, n_low_engagement_filtered: 9,
  items: briefItems, high_value_items: briefItems,
  top_themes: [{ theme: 'ai-adoption', count: 9 }, { theme: 'governance', count: 7 }, { theme: 'regulation', count: 3 }],
  topic_watch: { governance: [{ url: P(1), competitor: 'Northwind Advisory', summary: 'Accountability never shifts to the technology.' }, { url: P(6), competitor: 'Emery Stone', summary: 'Inventory AI systems by 2027.' }] },
  sophistication_shifts: [{ url: P(3), note: 'From cutting costs to better advice', summary: 'Argues the cost debate misses advice quality.' }],
};
const SNAP = { for: 'thought leadership', items: [
  { text: 'Governance framing beats cost cutting', why: 'Posts on audit trails drew steady engagement from advisers', tag: 'Governance' },
  { text: 'Accountability language lands with careful buyers', why: 'A post on firm accountability mirrored buyer objections', tag: 'Messaging' },
  { text: 'Deadlines give buyers a reason to act', why: 'A regulator deadline drove several high-engagement posts', tag: 'Regulation' },
  { text: 'Measured results beat abstract promises', why: 'A before and after number drew the most comments', tag: 'Proof' },
  { text: 'Better advice is the stronger promise', why: 'Readers pushed back on cost-only framing', tag: 'Positioning' },
] };
const PREV_DATA = Object.assign({}, DATA, { run_id: PREV, date: '2026-10-13', top_themes: [{ theme: 'ai-adoption', count: 8 }, { theme: 'governance', count: 3 }, { theme: 'hiring', count: 4 }], review: undefined });

const intelRow = (id, run, created, md, data, snap) => ({ id, run_id: run, agent: 'intel_tracker', output_type: 'intel_brief', title: 'Competitor Intelligence Brief', created_at: created,
  content_md: md, data: JSON.stringify(data), snapshot: snap ? JSON.stringify(snap) : null, edited_by_human: false });

const ADS = [
  { n: 1, adv: 'Ledgerline', hook: 'Still reconciling by hand at month end?', cta: 'Book now', fmt: 'static_image', days: 96, dest: 'https://ledgerline.example/book-a-demo', offer: 'Free month-end audit', price: null, sl: false },
  { n: 2, adv: 'Ledgerline', hook: 'Your close takes five days. It could take two.', cta: 'Learn more', fmt: 'text', days: 61, dest: 'https://ledgerline.example/guide', offer: 'Close checklist download', price: null, sl: false },
  { n: 3, adv: 'Brightpath Coaching', hook: 'The 47 dollar workshop advisers use to fill their calendar', cta: 'Sign up', fmt: 'static_image', days: 40, dest: 'https://brightpath.example/live-workshop', offer: '47 dollar live workshop', price: 47, sl: true },
  { n: 4, adv: 'Cobalt CRM', hook: 'Stop losing referrals in your inbox', cta: 'Get started', fmt: 'carousel', days: 22, dest: 'https://cobalt.example/pricing', offer: 'Free trial', price: 0, sl: false },
  { n: 5, adv: 'Scribewell', hook: 'Meeting notes that write themselves', cta: 'Learn more', fmt: 'text', days: 15, dest: 'https://scribewell.example/', offer: 'Free plan', price: null, sl: false },
  { n: 6, adv: 'Brightpath Coaching', hook: 'Take the 3 minute AI readiness quiz', cta: 'Learn more', fmt: 'static_image', days: 9, dest: 'https://brightpath.example/quiz', offer: 'AI readiness scorecard', price: null, sl: false },
];
const adRows = ADS.map((a) => ({ id: '00000000-0000-4000-8000-0000000000a' + a.n, run_id: ADRUN, advertiser_name: a.adv, hook: a.hook, body: a.hook + ' A synthetic ad body for tests.', cta: a.cta,
  format: a.fmt, days_running: a.days, destination_url: a.dest, offer_inferred: a.offer, price_point_inferred: a.price, self_liquidating: a.sl, is_active: a.days > 20, stale_days: a.days > 20 ? 2 : 30,
  performance_score: 90 - a.n * 8, ad_library_url: AD(a.n), source: 'library_pull', copy_formula: 'call-out -> pain -> proof -> offer -> CTA', funnel_stage: 'tof', extracted_patterns: ['ICP call-out'],
  created_at: '2026-10-10T09:0' + a.n + ':00Z', image_url: '', uploaded_by: null, iteration_group: null }));
const ADMD = ['# Creative Brief', '', '## 8. Evidence', '', ...ADS.map((a) => a.n + '. **' + a.adv + '** - ' + a.days + ' days, ' + (a.days > 20 ? 'still running' : 'stopped') + '\n   "' + a.hook + '"\n   ' + AD(a.n)), ''].join('\n');
const CB = {
  id: '00000000-0000-4000-8000-0000000000c1', run_id: ADRUN, created_at: '2026-10-10T09:30:00Z', run_date: '2026-10-10', source_ad_ids: [], source_intel_ids: [], source_intel_run: RUN,
  winning_hooks: JSON.stringify(['Open with the exact question the buyer is already asking', 'Name a costly problem in the first line', 'Lead with a specific before and after number', 'Call out the buyer by role']),
  winning_offers: JSON.stringify([{ type: 'Free assessment', price_point: null, self_liquidating: false, notes: 'Keeps running across advertisers.' }, { type: 'Low-ticket workshop', price_point: 47, self_liquidating: true, notes: 'Funds the ad spend.' }]),
  copy_formula: 'call-out -> pain point -> proof -> offer -> CTA',
  core_pain_points: JSON.stringify(['Month-end close takes too long', 'Referrals get lost', 'AI output cannot be trusted']),
  objection_themes: JSON.stringify(['We tried AI and it did not stick', 'Compliance will not sign off']),
  differentiation_angle: 'Everyone sells speed. Sell proof: show the before and after on one workflow the buyer recognises.',
  cross_niche_sources: JSON.stringify(['Quiz funnels from coaching', 'Calendar-fill workshops from real estate']),
  sophistication_level: '3', confidence: 0.72,
};
const AD_SNAP = { items: [
  { text: 'Questions the buyer already asks open best', why: 'The longest-running ads open on a question', tag: 'Hook' },
  { text: 'Before and after numbers carry the proof', why: 'Ads with a number kept running longest', tag: 'Proof' },
  { text: 'Low-ticket workshops fund the spend', why: 'One advertiser runs a 47 dollar workshop for weeks', tag: 'Offer' },
], hook_sources: [] };

function tables() {
  return {
    agent_outputs: [
      intelRow('00000000-0000-4000-8000-000000000001', RUN, '2026-10-14T13:09:00Z', MD, DATA, SNAP),
      intelRow('00000000-0000-4000-8000-000000000002', RUN, '2026-10-14T13:07:00Z', MD, DATA, SNAP),
      intelRow('00000000-0000-4000-8000-000000000003', PREV, '2026-10-13T13:09:00Z', MD.replace(RUN, PREV), PREV_DATA, SNAP),
      { id: '00000000-0000-4000-8000-0000000000d1', run_id: ADRUN, agent: 'ad_strategist', output_type: 'creative_brief', title: 'Creative Brief', created_at: '2026-10-10T09:31:00Z',
        content_md: ADMD, data: JSON.stringify({ run_id: ADRUN }), snapshot: AD_SNAP, edited_by_human: false },
    ],
    creative_briefs: [CB],
    intel_items: ITEMS.map((x) => ({ id: '00000000-0000-4000-8000-0000000001' + String(x.n).padStart(2, '0'), run_id: RUN, url: P(x.n), platform: 'linkedin', author_name: x.who, headline: x.head,
      summary: x.head + '. A synthetic summary for tests.', working: 'What works here: ' + x.head.toLowerCase() + '.', signal: 'Signal for ' + x.head.toLowerCase(), content_format: x.fmt, themes: x.th,
      engagement_total: x.eng, engagement_score: x.eng, score: 60 + x.n, ad_context_value: x.n <= 6 ? 'high' : 'low', published_at: '2026-10-14T0' + x.n + ':00:00Z', created_at: '2026-10-14T13:0' + x.n + ':00Z',
      raw_text: x.head + '. ' + (x.q ? x.q + ' ' : '') + 'More synthetic text.' })),
    winner_creatives: adRows,
    ad_records: adRows,
    runs: [{ run_id: RUN, agent: 'intel_tracker', status: 'success', run_date: '2026-10-14', started_at: '2026-10-14T13:00:00Z', finished_at: '2026-10-14T13:09:00Z', stats: { items: 8, high_value: 6 } },
      { run_id: PREV, agent: 'intel_tracker', status: 'success', run_date: '2026-10-13', started_at: '2026-10-13T13:00:00Z', finished_at: '2026-10-13T13:09:00Z', stats: { items: 8 } },
      { run_id: ADRUN, agent: 'ad_strategist', status: 'success', run_date: '2026-10-10', started_at: '2026-10-10T09:00:00Z', finished_at: '2026-10-10T09:31:00Z', stats: {} }],
    agent_feedback: [],
    ai_settings: [],
    competitors: [
      { id: '00000000-0000-4000-8000-0000000000e1', name: 'Northwind Advisory', handle_linkedin: 'company/northwind-qa', meta_page_id: null, status: 'approved', source: 'manual', follow_kind: 'company', follow_for: 'both', created_at: '2026-09-01T00:00:00Z' },
      { id: '00000000-0000-4000-8000-0000000000e2', name: 'Ledgerline', handle_linkedin: null, meta_page_id: '1000001', status: 'approved', source: 'manual', follow_kind: 'company', follow_for: 'both', created_at: '2026-09-02T00:00:00Z' },
      // followed for ads only: the Intel Tracker leaves them out
      { id: '00000000-0000-4000-8000-0000000000e3', name: 'Harbor Funnels', handle_linkedin: null, meta_page_id: 'harborfunnels', status: 'approved', source: 'manual', follow_kind: 'company', follow_for: 'ads', created_at: '2026-09-03T00:00:00Z' },
      { id: '00000000-0000-4000-8000-0000000000e5', name: 'Pine Street Media', handle_linkedin: null, meta_page_id: 'pinestreetmedia', status: 'approved', source: 'manual', follow_kind: 'company', follow_for: 'ads', created_at: '2026-09-05T00:00:00Z' },
      // followed for posts only: a page on file, but the Ad Strategist leaves their ads out
      { id: '00000000-0000-4000-8000-0000000000e4', name: 'Quill Partners', handle_linkedin: 'in/quill-qa', meta_page_id: 'quillpartners', status: 'approved', source: 'manual', follow_kind: 'person', follow_for: 'posts', created_at: '2026-09-04T00:00:00Z' },
    ],
    content_requests: [],
    idea_notes: [],
    company_profile: [{ business_name: 'QA Consulting', industry: 'AI Strategy and Implementation Consulting', target_market: 'Wealth managers and advisers' }],
  };
}

module.exports = { RUN, PREV, ADRUN, P, AD, tables };
