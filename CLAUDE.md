# AI Paragon Consulting Group: project repo

Briefs for Claude sessions in this repo. Last reviewed 2026-10-20. Four projects live here, each as one single-file HTML app. Read the shared sections, then the section for the project you're working on.

## Projects and files
| # | Project | File in GitHub | Live at |
|---|---|---|---|
| 1 | AI Paragon internal dashboard | `new-aiparagon-dashboard.html` | aiparagon.vercel.app/dashboard (pages at /dashboard/<page>; the old file URL forwards there) |
| 2 | Spectrum Care Advisory OS (care portal, np-demo) | `E-&-G-Home-Inc.html` | np.aiparagonconsulting.com (DigitalOcean) |
| 3 | Paragon Advisory OS demo dashboard (Delta Advisory) | `mhwp-dashboard.html` | static deploy; this repo's copy is at aiparagon.vercel.app/advisory/touchpoint (pages at /advisory/<page>; the old file URL forwards there) |
| 4 | Voice agent Command Center (Vapi, Arrington Roofing) | `voice-agent-client.html` | aiparagon.vercel.app/voice/overview (pages at /voice/<page>; the old file URL forwards there) |

- Those are the GitHub names: update each file in place, don't add numbered copies to the repo. Kser's own deliveries use numbered names (see each project).
- Everything else in the repo is an older build or a marketing page: older dashboards (`ai-paragon-dashboard.html`, `ai-paragon-dashboard-v40.html`, `dashboard-v1.html`), older portal builds (`np-demo-*.html`, `Demo-portal.html`, `Spectrum-Care-Advisory-OS.html`), and the solution, landing and motion pages. Don't touch them for project work.
- Vercel project "aiparagon" serves this repo as static files, no build step. Every file in the repo is public at aiparagon.vercel.app/<file>. Vercel is becoming the dev environment: each pushed branch gets a preview deployment.
- `vercel.json` gives apps their own path prefix on the one domain: /dashboard and /dashboard/* serve the internal dashboard (#1), /voice and /voice/* serve the Command Center (#4), /advisory and /advisory/* serve the Advisory OS demo (#3), /go and /go/* serve `go.html` (the landing pages #1 puts live), and each old file address forwards to its app (/new-aiparagon-dashboard.html to /dashboard, /voice-agent-client.html to /voice/overview, /mhwp-dashboard.html to /advisory/touchpoint; temporary 307s for now). Other apps can follow the same pattern (one prefix each, one rewrite pair each, plus a forward from the old file address).
- Browser tests for #1, #2, #3 and #4 live in `tests/` (kept off the live site by `.vercelignore`). Run `bash tests/run.sh` before merging a change to those files, and update a suite in the same PR when a page is added, renamed or moved; tests/README.md has the details.
- The repo is public. Keep secrets and security details out of commits and this file.

## Shared services
- Supabase project lesyptuwllcgajdxzjje is shared by #1 (engine tables and ap_*), #2 (np_*) and #4 (vc_*). #3 has no backend. The mhwp_* tables belong to the old Meridian Harbor demo (see #3).
- n8n at n8n.aiparagonconsulting.com runs every workflow. Self-hosted on DigitalOcean, AWS move in progress. Erica's n8n project: 70lGqIuDvXVysHIc (her copies end in "(Erica)"; three of her Engine 1 steps call the non-Erica copies, see #1's Gotchas).
- People: Kser (Kaeser Valencerina) builds everything. Erica Dresslar is founder/CEO; she demos to prospects and gives feedback by Loom, Slack and call transcripts.
- Never use Supabase-tesserafy or Tesserafy branding in any project.
- Open decision: access control on the shared Supabase project (details kept out of this public file). Plan: move the care portal to its own Supabase project on a paid tier.

## Working with Kser (all projects)
- Casual, direct, short replies. No em dashes, no AI buzzwords, no made-up metrics.
- He uploads the latest file (or quotes a call transcript) and points at specific issues; make targeted fixes, not long discussion.
- For a big feedback batch (Loom, screenshots, transcript), confirm understanding before building.
- Patch with Python scripts that replace unique string anchors, assert on a missing anchor, write to a temp file then swap.
- Full QA pass before shipping. Write and run tests, including regression ones, before saying something's done. Re-check earlier fixes every delivery: feedback items have regressed between rounds before.
- "Quick changelog" = short list by category, no mention of Loom or feedback.

## Shared gotchas
- n8n update_workflow doesn't activate; always publish_workflow after.
- n8n workflow description max 255 characters, fails silently past it.
- n8n update_workflow keeps the credential of a node that keeps its name (checked Oct 15 on Supabase and Claude nodes). get_workflow_details never shows credentials and HTTP Request nodes are skipped by auto-assign; earlier rebuilds lost theirs, so check HTTP Request credentials in the editor before publishing.
- To rebuild a workflow without retyping it: export it with get_workflow_details, turn it into SDK code with `generateWorkflowCode` from @n8n/workflow-sdk, change it, and parse it back with `parseWorkflowCode` to diff before update_workflow. Non-trigger nodes lose their webhookId (n8n gives them new ones).
- n8n resource locator needs mode "list" + cachedResultName to publish.
- An n8n run can show "success" while a step inside failed (nodes set to continue on error). Check the saved result, not the run status.
- Supabase upsert: `Prefer: resolution=merge-duplicates`. Required columns need defaults or inserts fail silently. Use `return=representation` to see errors.

---

# 1. AI Paragon internal dashboard

## What this is
AI Paragon Consulting Group's own lead gen and marketing system. Single-file HTML app (`new-aiparagon-dashboard.html`), live on Supabase and n8n, with real Supabase Auth logins. Current goal: make it user friendly, less clutter, less text.

It's built on the demo dashboard's shell (#3, v152 design). The old v60 engine and workspace pages are ported in verbatim, CSS scoped under `.ap60`, and `apGo(view)` maps sidebar views onto v60's `state.engine/state.view` + `render()`. Don't hand-rewrite engine pages: that lost editors, run pickers, comments and the funnel package before.

## How the pieces fit
Dashboard (Vercel) → calls an n8n webhook → the n8n agent does the AI work (Claude, Tavily, SEC IAPD, Google) → writes results to Supabase → the dashboard reads Supabase and renders them. HubSpot and Slack hang off n8n. Landing pages put live from the dashboard are public: `go.html` reads a live page from Supabase and posts its sign-up form to an n8n webhook.

## Tools and their roles
| Tool | Role here |
|---|---|
| Vercel | Hosts the HTML as a static file, and the landing pages (`go.html` at /go/<page>). No server code. |
| Supabase | Logins, data and files. Auth = real accounts (`ap_profiles` made by a signup trigger, `ap_prefs` stores each user's workspace state so another machine resumes, `ap_allowed_emails`). Postgres holds all engine data. Storage holds lead files, HubSpot-synced files (`hubspot/` path) and avatars. Shell code reads/writes through PostgREST with the signed-in user's token. |
| n8n | Runs every AI agent. The dashboard starts them by webhook, schedules run the syncs, and each workflow writes its output back to Supabase (agent outputs as markdown in `agent_outputs.content_md`). |
| Claude (Anthropic API) | The model inside the agents and the Ask bot. Claude vision reads uploaded competitor ad screenshots. |
| OpenAI | Inside the Low-Ticket Ads Content Agent next to an image upload node, for ad creatives. Edit that workflow by hand: rebuilding it through the n8n connector strips those credentials. |
| Tavily, SEC IAPD | Web and regulator research for Lead Research. |
| Google Workspace | Docs/Drive for research inputs and outputs. The Prequalification Call Guide must read the Google Doc research first. |
| PDFbolt | Renders the Growth Plan presenter script and Gamma slide notes as PDFs. |
| HubSpot | CRM of record. Contacts sync into `hubspot_contacts` every 6h. Files sync both ways (dashboard upload → HubSpot file + note; HubSpot note attachments → Supabase Storage + `lead_files`) with loop prevention. |
| Slack | #daily-digest (C0BE4DTPFQD), #funnel-review (C0BH39KGS9F). Reviewers get a queue from Slack, no ping. |
| Fathom | Call transcripts for skip runs (Integrations page). |
| Notion, Asana | Notion connect on the Integrations page; Asana on the Tasks page. |
| mammoth.js | Client-side .docx text extraction before upload. |

## Navigation
The sidebar is by product (v115), named after the Intelligence Workspace (#3's shell, which this dashboard is built on). All five stay on screen; the one you click opens its pages, a closed one adds up the badges inside it, and the product of the page you are on opens when you get there. The top bar says where you are (product, then page).
- Touchpoint (home and tasks): Today, Approvals, Tasks
- Catalyst (clients and meetings, Engine 1): Overview, Lead pipeline (New → Researched → Interview → Assessment → Discovery call → Growth plan), Contacts (HubSpot), Calls
- Canvas (client deliverables): Deliverables
- Pipeline (content and ads, Engine 3): Overview, Intel Tracker (Agent 1), Ad Strategist (Agent 2), Market Intelligence Briefs, Content Transformation, Marketing Generation, Landing pages, Ad Testing, Runs & uploads
- Atlas (knowledge and files): Knowledge base, Files, Company profile, Templates
- Settings: Integrations, AI settings, Audit log. The account menu has Your account, Company profile, AI settings and Sign out.
- Agreed next, in order (Oct 20): the lead pipeline as a board (drag a lead to a step, confirm, it runs; needs Discovery and Growth plan start points in Engine 1 Custom Run, which today starts only at Interview or the anonymizer), then Meeting prep in Catalyst (pre-meeting briefs, discovery questions, a voice AI questionnaire) and Make a deliverable in Canvas from a lead, call, inquiry or meeting, then Client 360 and Today on live data, and a calendar once Google Calendar is connected. Engine 2 is dropped. Erica may send mockups of the layout.

## Page addresses
- On Vercel each page has its own address under /dashboard. Touchpoint: /dashboard/today (Home), /approvals, /tasks. Catalyst: /dashboard/engine-1 (its Overview), /lead-pipeline, /hubspot, /calls. Canvas: /deliverables. Pipeline: /dashboard/engine-3 (its Overview), /intel-tracker, /ad-strategist, /briefs, /content-transformation, /marketing-generation, /landing-pages, /ad-testing, /runs. Atlas: /knowledge-base, /files, /company-profile, /templates. Settings and account: /integrations, /ai-settings, /audit-log, /account, /notion. A product's name works as an address word too (/dashboard/pipeline opens the Pipeline Overview, /dashboard/canvas Deliverables). /dashboard/home opens Today; /dashboard/overview opens the Overview of the product you are in (Today outside Catalyst and Pipeline).
- `vercel.json` sends /dashboard and /dashboard/* to `new-aiparagon-dashboard.html`. The old /new-aiparagon-dashboard.html address forwards to a bare /dashboard (a temporary 307 for now), so old links and bookmarks still resume the saved workspace.
- The sign-in screen is /dashboard/login (#/login elsewhere). A bare /dashboard resumes the saved workspace (`ap_prefs`) as before, and opens Today when nothing is saved. A page asked for while signed out is kept in memory while the sign-in screen shows and opens after sign-in (a reload of the sign-in screen forgets it), then the address follows every page change, including the engines' own (a lead keeps /dashboard/lead-pipeline). Sign out goes to /dashboard/login, so whoever signs in next resumes their own workspace.
- A copy opened anywhere else (a local file) uses #/<page>. Inside a frame it leaves the address alone.
- In the file: the PAGE ADDRESSES script is the last block. `ROUTE_SLUG` maps `AP_VIEWS` keys to address words (a new view only needs a line there). It wraps `apNavSync()`, `apAfterLogin()`, `apEnsureSession()` (the boot's session check, which puts up the sign-in address) and `apSignOut()`, so keep it the last script: later rounds go above it. The file uses CRLF line endings: patch scripts must read and write with `newline=''`, or every line shows as changed. Not routed yet: a lead's own page, drawers and modals.

## Engine 1
Five agents in sequence: sector-adaptive Lead Research (RIA / other company / nonprofit), Prequalification Call Guide, Discovery Call Framework, Strategic AI Growth Plan (split into two agents to avoid timeouts). An anonymization sub-workflow swaps prospect PII for fake firm names before any external call. Agents use [ASSUMED:] and [FILL IN before call:] instead of pausing for missing data. A full prospect package went from about 2 hours of manual prep to about 15 minutes.

## Engine 3 product model (agreed)
- User 1, no own content: Intel Tracker → Ad Strategist → Marketing Generation, from the ads brief.
- User 2, has published content: uploads it → Intel Tracker → Marketing Generation (Ad Strategist skipped), from the organic/thought leadership brief plus their content. Produces organic posts and the ad funnel from the start.
- Key takeaways = two panels tied to the two briefs, each sourced and clickable.

## n8n workflows
| Workflow | ID | Trigger |
|---|---|---|
| Engine 3 · Ad Upload Analyzer | WMmtBBNkxSOhujhB | /ad-upload |
| Engine 3 · Custom Ad Strategy | LrgqanQworSEbpmB | /ad-brief (saves an agent2_custom_ run) |
| Dashboard Ask Bot | SqkPTU6AkaXXRvZ1 | /webhook/ask-bot |
| Profile Enrichment + Competitor Scout | wkAeoPGY4j6LVt9g | /webhook/profile-enrich |
| HubSpot Contact Sync | gdxNQjx5Q5gEuaIO | every 6h |
| Lead File Text Ingest | bhHHlPRqTJixv7TC | /webhook/file-ingest |
| Low-Ticket Ads Content Agent | xdsadklZ0DXdjW5X | manual + webhook e3-low-ticket-run |
| Engine 3 · Advertiser Industries | 8OabFoF9l3DOWqCs | /webhook/e3-ad-industries. Names each advertiser's industry for the Ad Strategist; the dashboard saves it. |

The Low-Ticket Agent always builds from the newest creative brief.

Other live workflows the dashboard uses. The dashboard's webhook URLs are in `AP_N8N` / `AP_HOOKS` in the dashboard file.

| Workflow | ID | Notes |
|---|---|---|
| Lead AI Research Agent (Erica) | YLwRwuCZTFWuEdf1 | Dashboard full run (`AP_HOOKS.e1_full`). First step of Erica's Engine 1 chain. |
| Engine 1 Custom Run (Erica) | 4kcpRRh0T0okije7 | /webhook/e1-custom-run-erica. Writes a source Google Doc, then starts Interview (Erica) or the anonymizer (Erica). |
| Interview Script Agent (Erica) | U5ArSMj5Kxr9MZbq | Engine 1 chain |
| Assessment Generator + Anonymizing Agent (Erica) | neYLlfPW87L59DZM | Engine 1 chain |
| Discovery Call Script Agent (Erica) | Tvv7bcWKc7c9t5FE | Engine 1 chain |
| Growth Plan Proposal Agent (Erica) | 9qmPrdN0Hot90tFN | Engine 1 chain |
| Engine 3 · Intel Tracker (scheduled + custom) | Zc1iXclbFKq0XJOA | Schedule set in the dashboard (weekly, Mon 6am Pacific by default) or custom run. Writes the organic brief. Skips accounts followed for ads only, unless a custom run names them. An account goes to the X, LinkedIn and Facebook fetches only with that handle, and the LinkedIn and Facebook fetches start one account at a time (Apify plan limits). |
| Engine 3 · Ad Strategist | yA7H9YicyQxNt7GK | Meta Ad Library pull after the Intel Tracker. Writes the ads brief. Reads the dashboard's Following tab (`ads_follow`): accounts not set to posts only, each keyword and industry as a search, ad types and running now ("Keep Chosen Ad Types"), country for the searches. The team's uploads go in first however old and outside the per-advertiser cap; an ad switched off for the brief (`ad_records.in_brief` false) never goes in. The model also reads what the team follows. A known ad that comes back in a pull gets a fresh image link unless its image is already in Storage. |
| Engine 3 · Content from Source | S9LPQaySOnXVquoQ | /webhook/e3-content-run. Content request → draft. Uses the newest brief whose latest decision is an approval, else the newest one; an edit sends a brief back to review. Also writes reports, white papers, articles, how-to guides, event materials, decks, webinar decks, video scripts and short clips (`content_requests.content_type`), following the team's answers, notes and audience (`setup`). |
| Engine 3 · Read a Link | eWz8zCjBmJG9ktu7 | /webhook/e3-read-link. Article text or YouTube captions. |
| Engine 3 · Transcribe | Hr7AjlepxJC4fNxI | /webhook/e3-transcribe. Whisper. |
| Engine 3 · Learn Voice | pdiaXeNC3Fw7GXEM | Suggests the brand voice from the team's writing. |
| Engine 3 · Auto-fill | ZLp63MNgtr7vqrdZ | Fills the Make new forms from the newest briefs. |
| Engine 3 · Strategy Insights | XwQFbgDcMGTS9mvs | /webhook/e3-strategy-insights, plus a daily read at 07:20 Pacific that skips when nothing it reads has changed since the last read (`data.input_sig`; the daily one has `data.daily`). Advice only: nothing changes an ad on its own. |
| Engine 3 · Funnel Builder | oKzp5tCd0jRMVw3o | /webhook/e3-funnel-run. Webinar, download, newsletter sign-up and landing page funnels: 3 ads plus every step, saved to `funnel_packages` (funnel_type, steps, setup) waiting for review. A failed run is a failed `runs` row. Book a call and low-ticket stay on the Low-Ticket Agent. |
| Engine 3 · Profile Drafts | u9dV4lD7v5PWbgw4 | /webhook/e3-profile-drafts, plus a manual seed run. Drafts personas, proof and the brand voice from the profile, offers, briefs, website and knowledge base, marked as drafts (`ai_draft`, voice source ai_draft; proof stays pending). State in `ai_settings.profile_drafts`. |
| Engine 3 · Ad Results Sync | 5Wd0RSTJM18UicoH | /webhook/e3-ad-results (status, connect, disconnect, sync) and every morning at 06:10 Pacific. Meta (Facebook, Instagram) and LinkedIn ad numbers for the last 30 full days into `content_results` (attribution api, source, external_id, account_id). Each sync replaces that platform's synced rows (one account per platform), so their ids change daily. Reads only, never changes an ad. |
| Engine 3 · Keep Ad Images | 27rKygfi9PSIuWrw | Every 6h. Calls the `e3-ad-images` Edge Function, which copies Meta's short-lived image links on `ad_records` into Storage (`creatives/library/`). A link that already expired can't be saved; it gets saved after the ad comes back in a pull. |
| Integrations · Calendly Proxy | 8Vf9p4A6U6b3ks9N | /webhook/e3-calendly. Connects a Calendly token and lists the event types for booking links. |
| Ad Image Regenerator | amR0wDFrnxCLdmft | Redoes one ad image from reviewer notes. |
| Dashboard · Doc Reader | XyV8qziETUEiQiaF | Google Doc or Drive PDF → text. |
| Dashboard · Fathom Proxy | u1pNyguOWyPQ9jYM | Meetings and transcripts. |
| Dashboard · Notion Proxy | FB4ycowRXvOfU1Of | Notion page. |
| Integrations · Slack Proxy | IWsZe7OThrKcIkhn | Channel list, posts call summaries and tasks. |
| Integrations · Asana Proxy | 5z3i5FQaZAJNgnVE | Asana on the Tasks page. Unpublished. |
| Meetings · Call to HubSpot | Exl6bewzAscnfuuZ | |
| Meetings · Post-call Actions | pHY71k2js6uJyiIP | |
| HubSpot → Dashboard File Sync | gvtTcoTNceWj8Etm | Every 6h. HubSpot note attachments → Storage + `lead_files`. |
| Lead File → HubSpot Sync | RRsnr3H4Vo8fTPaU | Dashboard upload → HubSpot file + note. |
| Landing Page · Sign-up | 1Y2lufUQPWUIhbrl | /webhook/lp-signup, from the form on `go.html`. Public on purpose (visitors are not signed in), so it checks the request itself (bots, a page that is not live, too many from one place). Saves the sign-up (`lp_signups`) and answers, then adds the contact to HubSpot and, when the page says so, a New lead (`e1_leads`, lead source "Landing page · <page>"). Successful runs are not kept in n8n's history. |

The Calendly, Meta and LinkedIn tokens, like Fathom's, stay in n8n (the `dashboard_integrations` data table), never in the browser or Supabase: the Integrations page sends one once, on Connect.

## Supabase tables
- `competitors.follow_for` says who reads an account: both (default), ads (the Ad Strategist only) or posts (the Intel Tracker only).
- v113 (migrations v113_engine3_feedback_round, v113_profile_drafts, v113_runs_agents): `ad_records.in_brief` (also in the winner_creatives view); `content_results` source, external_id and account_id, with one row per platform, ad and period start (a unique index; synced rows have attribution api); `funnel_packages` funnel_type, steps, setup and requested_by (Send back sets status draft); `client_personas.ai_draft` and `client_proof.ai_draft`; `runs.agent` also takes funnel_builder, profile_drafts and ad_results. The new content formats ride in `content_requests.content_type` and `setup`.
- v115 (migration v115_landing_pages): `landing_pages` (slug, status draft, live or paused, kind book_call, webinar, download, newsletter_signup or landing, `content` the public page shows, `ads` with each ad's code, `add_to_pipeline`, the funnel package it came from, `published_at`), `lp_signups` (one row per sign-up: the page, contact fields, `answers`, `utm`, `ad_code`, HubSpot id or error, `lead_added`), `lp_views` (visits by page, day and ad code). `go.html` reads a live page and counts the visit through the `lp_public()` function; sign-ups are written by the workflow only. A page that has been live can be paused but not deleted.
e1_leads, agent_outputs, competitors, lead_files, guide_files, hubspot_contacts, company_profile, runs, intel_items, winner_creatives (a view), engagement_drafts, test_results, funnel_packages, offers, creative_briefs, ad_records, ap_profiles, ap_prefs, ap_allowed_emails, ai_settings (team settings by key, among them brief_structure, ads_follow, ad_industries and ad_industries_ai), idea_notes, call_outputs and call_meta (Calls), landing_pages, lp_signups, lp_views.

## Where it stands (as of 2026-10-20)
- Latest file: `new-aiparagon-dashboard.html` in this repo. Its patch markers go up to v115.
- v111 (Oct 15, Erica's feedback round): Request changes opens an editor on the organic and ads briefs (edit or remove sections, findings and posts or ads; the edited brief is what drafts read; the agent's version is kept in the brief's data and can be put back; an `edited` row in agent_feedback sends it back to Needs review). The Structure tab is a layout editor per brief kind (on or off, order, counts, added sections counted from the posts or ads), saved as `brief_structure`. Marketing Generation and Content Transformation have categories (the Intel Tracker's organic categories, the two campaign kinds, four ad types) and a "What the briefs found" step: use, drop or save for later (idea_notes), and the picks ride in the request. The Ad Strategist has a Following tab (accounts followed for ads only or for ads and posts, searches and filters saved as `ads_follow`), industries suggested by the Advertiser Industries workflow (`ad_industries_ai`; one typed by hand in `ad_industries` wins), a follow step after an upload, and Swipe file is now Uploads (Notion swipe-file ads say From Notion).
- v111 follow-ups (Oct 15, same block): each account on the Ad Strategist's Following tab is Ads only or Ads and posts (`follow_for`); stopping its ads keeps the page and sets it to posts only. The Intel Tracker's Following tab and counts leave ads-only accounts out, with "Read their posts too". `V111_ADS_LIVE` is on. In n8n, Content from Source (the approval fix), the Ad Strategist and the Intel Tracker updates are published (Oct 15). Their first real runs are the check that the HTTP Request credentials carried over: posts read in the organic brief, new rows in `ad_records`.
- v112 (Oct 16, full QA round): every page, button, popup and upload clicked with stubbed data (about 1,400 clicks), plus the upload paths end to end (Files: pdf, docx, txt, md, csv; ad images; Content Transformation: docx, pdf, txt, audio and video with transcription; the results CSV import), the Ask bot, search, the Engine 1 custom run and the ad image redo. Fixed: the Intel Tracker opened on a built-in sample run and showed "No posts in this run" (it now takes live runs only); a lead link on Files, Knowledge base or HubSpot crashed (it now opens the lead through the shell); stat tiles that did nothing (Integrations: HubSpot, Slack; Knowledge base: Readable, Waiting to be read; all four on Templates); a lead file uploaded on Files wasn't sent to HubSpot like the lead page upload is; the Ask panel always greeted "Hi Kaeser"; the older code credited comments, feedback and uploads to "Team" since the Supabase sign-in (`whoAmI()` now returns the signed-in name). Regression tests: `tests/dashboard-qa.test.js`.
- v113 (Oct 19, Erica's Oct 18 Loom round and roadmap). Ad Strategist: key takeaways first on every ad, a fit score against the Following tab, "use in the next ads brief" per ad (`in_brief`, asked on every upload, on by default) and which briefs used an ad, "Utilize this ad copy", honest Live, days and score labels (nothing stored is not zero), an overview of the uploads, Meta image links kept in Storage. Content Transformation: reports, white papers, articles, how-to guides, event materials, decks, webinar decks, video scripts and short clips, what the material is, questions per format, a notes box, written cards for decks and video with a placeholder for real files. Marketing Generation: six campaign types (book a call and low-ticket on the Low-Ticket Agent; webinar, download, newsletter sign-up and landing page on the Funnel Builder), who it is for (persona, job titles, company size, the market from the profile), funnel details, Calendly booking links, a goal and next step for posts, newsletters and emails, newsletter topics; funnels open as cards (each ad, then each step) with Make the image, Approve and Send back. Ad Testing: daily numbers from Meta (Facebook, Instagram) and LinkedIn once connected on Integrations, counted apart from hand-entered rows, and what is working and what is not; the strategy read turns them into advice and a daily read runs on its own. Company profile: Draft for me on personas, proof and the brand voice, marked Draft until someone keeps, approves or edits it. Plus the tab title names the page, step numbers, wording fixes, Educational counted from the format, and the briefs note says which brief isn't approved. Regression tests: `tests/dashboard-v113.test.js`.
- n8n on Oct 19: Funnel Builder, Profile Drafts, Ad Results Sync, Keep Ad Images and Calendly Proxy are new and published; Content from Source writes the new formats (checked with a real how-to guide run); the Ad Strategist puts uploads first and refreshes image links; Strategy Insights has the daily read. Profile Drafts seeded AI Paragon's profile: 3 personas, 5 proof cards (pending) and a voice, all drafts.
- Oct 19 runs: the Intel Tracker's first scheduled slot (13:00 UTC) worked: 213 posts found, 3 kept, from Meta (20 read) and LinkedIn (30); no X posts. It chained the Ad Strategist, which failed at Merge Ad Sources ("Could not get parameter", fixed the same morning with mode append). The 16:00 UTC fallback then wrote the first ads brief since Jul 30 (12 ads from 5 advertisers; 52 new ads, 38 refreshed). Keep Ad Images has saved 79 ad images so far; 74 older links had already expired and get saved when their ads come back in a pull. The tracker runs on the dashboard's schedule (`ai_settings.agent_runs`, not saved yet, so weekly Mon 06:00 Pacific), chains the Ad Strategist, and the Ad Strategist has its own fallback 2 to 3 hours after the slot. In that run most of the per-account fetches failed: accounts with no LinkedIn handle or Facebook page broke the LinkedIn body or asked Apify for facebook.com/null, and Apify's plan limits (5 actor runs at once, 16 GB of memory with 4 GB per Facebook run) rejected most of the rest, so Grant Cardone's were the only Facebook posts. X is out of credits and Tavily rejects its key, so both still return nothing.
- Oct 19 follow-ups: the Intel Tracker sends an account to a fetch only when it has that handle (blank, "null" or missing are skipped), and the LinkedIn and Facebook fetches start one account at a time (every 12 and 40 seconds, Facebook timeout 150 seconds), so a full run takes 10 to 15 minutes; checked with pinned test runs on the real account list, not a live run yet. The dashboard now says a custom run takes 5 to 15 minutes and calls scheduled runs scheduled, not daily. Jeremy Miner's Facebook page id comes back "not available". Engine 1: Erica's chain stays on Erica's copies end to end (see Gotchas).
- v114 (Oct 19, closing the open webhooks): every n8n call from the dashboard carries the signed-in user's token in `auth`. The `v114js` fetch wrapper adds it to any JSON POST to an n8n webhook that has none, tries a 401 once more with a refreshed token, and refreshes a token with under 20 minutes left before it goes out, so a run that hands it on still holds a good one. The webhook workflows that checked nobody (Ask Bot, Ad Image Regenerator, Lead File Text Ingest, Lead File → HubSpot Sync, Profile Enrichment, Custom Ad Strategy, Ad Upload Analyzer, Content from Source, Engine 1 Custom Run (Erica), Lead AI Research Agent (Erica)) now check it first, and Learn Voice checks it before it reads anything. Regression tests: `tests/dashboard-v114.test.js`.
- v115 (Oct 20, Erica and Kser's call: one dashboard by product, ads tied to their landing pages). The sidebar is by product (see Navigation) and the engine switcher is gone. Today (Touchpoint's home): what needs you, quick starts, the five products with their pages, recent runs, latest sign-ups. Deliverables (Canvas): every Engine 1 document for each lead and every call write-up, newest first, each opening where it lives. Landing pages (Pipeline): a funnel's main page (the Funnel Builder's registration, opt-in, sign-up or landing page; a book-a-call campaign's landing page, qualifying questions and booking page) becomes a page at aiparagon.vercel.app/go/<page> with a sign-up form. It is edited in a drawer and goes live with Put it live, which waits until the placeholders are filled, the review flags ticked and the after-sign-up link is https; it can be paused, and a draft that never went live deleted. Each ad gets a code (PXXXX-A1) and a Meta, LinkedIn and post link with utm tracking; starting the ad's name with its code in Ads Manager lets Ad Testing match the synced spend. Ad Testing's Results tab shows visits, sign-ups, sign-up rate, spend and cost per sign-up per ad. The Funnel Builder drawer has Put the page live. Sign-ups have a list with search and CSV export. Regression tests: `tests/dashboard-v115.test.js`; the route suite walks the products.
- Oct 20 n8n and Supabase: Landing Page · Sign-up is new and published, and was checked live once end to end (saved, HubSpot contact created, so the app token can write contacts; New lead added; the same person again within the hour kept one row). Pages stay on aiparagon.vercel.app/go for now (agreed Oct 20). Not built: a Slack post per sign-up, one page per ad variant.
- Waiting on the team: connect Meta (a system user token with ads_read, plus the ad account ID), LinkedIn (a token with r_ads and r_ads_reporting; LinkedIn tokens last 60 days) and Calendly on Integrations. The sync calls Graph API v23.0 and LinkedIn-Version 202606: bump them in Ad Results Sync when either is retired (the card then says so).
- Next build: User 2's own-content path (content upload, extraction, its own workflow). Most of the intake already exists: Content from Source, Read a Link, Transcribe, Learn Voice, Doc Reader, Auto-fill, plus mammoth.js in the page. The new piece is mainly the run: own content + organic brief → organic posts + ad funnel. Check what Content from Source already covers before building a new workflow.
- Content Transformation and Marketing Generation stay two pages (decided Oct 19). Still open: Client profile as its own page like the shared mockup; the `e3client` view (Atlas, "Company profile") exists, so check it against the mockup first.
- The sidebar is built at runtime by the v107 shell (`nwShell`; the older sidebar markup is still in the file but replaced), and v115 draws it by product (see Navigation). Home is Today. The browser tab names the page ("Ad Testing · AI Paragon").
- Low-Ticket webhook node: checked, in place. POST `e3-low-ticket-run`, published. It checks the caller is an AI Paragon user, then "Respond Started" replies and hands off to Run Context.
- Asana: the Integrations · Asana Proxy workflow was never published, so there is no team-wide Asana connection. A personal Asana token pasted on the Tasks page works in that browser (it talks to Asana directly).
- Before tightening RLS (see the shared open decision), switch the ported v60 Supabase helpers (`sb`, `sbPost`, `sbPatch`, `sbInsert`, and the file upload/delete functions) to send the signed-in user's token (`apToken()`), like the shell code does.
- Older loose ends: real meta_page_id values (The Bandwidth Method etc.); maybe key HubSpot sync on hs_id instead of email.

## Shipping
Ship each round as a new numbered file. In GitHub the file is always `new-aiparagon-dashboard.html`: update that one in place.

## Gotchas
- The dashboard runs Engine 1 on Erica's copies (full run → Lead AI Research Agent (Erica), custom run → Engine 1 Custom Run (Erica)), and since Oct 19 the chain stays on them: Interview Script (Erica) → Assessment (Erica) → Discovery (Erica) → Growth Plan (Erica). Until then the hand-offs crossed to the originals, so Discovery (Erica) and Growth Plan (Erica) were never reached. The non-Erica chain (Lead AI Research Agent `iDde4Qs3Yay4qtgQ`) is started by `assessment-v3.html` and runs on the originals (Assessment `7yL8od8Ood13dc1F`, Discovery `ymCle3rpXSvPfW48`, Growth Plan `PNIYrzC3SgB3jVTh`); each of those three has an unpublished draft that adds `content_md`, which Erica's copies have published. Two live chains: a fix in one doesn't reach the other.
- The built-in sample data the page shows before the live tables load (`AP_LEADS`, `AP_CONTACTS`, `AP_COMMENTS`, `AP_FILES`, `AP_RUNS`) uses made-up people at example.com. Never paste real CRM rows into the file: it is public.
- Later rounds wrap earlier functions (e.g. `v97LibRender`, `v97ReqLogAdd`). Six `window.fetch` wrappers: five add fields to the ask-bot and Low-Ticket request bodies, and the v114 one (installed last, so it runs first) adds the sign-in token to every n8n call. Check for wrappers before changing a function.
- Every dashboard webhook checks the caller. A new one copies the entry from any of them: Check Dashboard User (Supabase /auth/v1/user with the body's `auth`) → AI Paragon User? → Pass Request On (the request without `auth`) → the workflow, with Respond Denied (401) on the false side. A webhook that used to answer at once gets Respond Started with the same reply. Workflows called through `apProxy` / `apX` answer 200 with code unauthorized instead, which those helpers retry. Two callers have no user of their own: HubSpot → Dashboard File Sync calls File Ingest, which lets through a file the sync has just saved, and an Intel Tracker custom run passes its token on to the Custom Ad Strategy (which passes it to the Low-Ticket Agent). The one public webhook is Landing Page · Sign-up (`lp-signup`): its form is on public pages, so it checks the request instead of a user.
- The old dashboard builds (`ai-paragon-dashboard.html`, `ai-paragon-dashboard-v40.html`) have no Supabase sign-in, so the checked webhooks turn their AI buttons away.
- Old v60 login code is still in the file (`tryUnlock`, and `openThemeModal` with its Update password button, both reading `dashboard_users`). Nothing calls them. Login is Supabase Auth (`AP_AUTH`).
- #1 and #3 use the same localStorage key (`paragonRD.v1`) and are served from the same origin, so their saved state can collide in one browser.

## Finding things in the file
Search by name; line numbers move every round.
- `AP_VIEWS`: view registry. Later rounds add to it with `Object.assign(AP_VIEWS, ...)` and `AP_VIEWS.<view> = ...`.
- `apGo`, `apNavSync`: routing and sidebar state.
- `AP_N8N`, `AP_HOOKS`: n8n webhook URLs.
- `apSb`: shell Supabase helper. Later rounds wrap it (search `apSb=`) so calls go out with the user's token, with a refresh and one retry on 401. `apToken()` returns the session token.
- `sb`, `sbPost`, `sbPatch`, `sbInsert`: v60 Supabase helpers. Not wrapped like `apSb`.
- `AP_AUTH`: Supabase Auth endpoints.
- v111 is the `v111js` script just above PAGE ADDRESSES: `V111_SECS` / `V111_ADD` (brief sections and the ones a layout can add), `v111EdStart` (the brief editor), `v111St` (the layout in force), `V111_CATS` and `v111InsAll` (categories and insights), `v111FolHtml` (Following), `v111For` / `v111FolFor` (who reads an account), `v111IntelFolTidy` (the Intel Tracker's Following tab), `v111IndSuggest` (industries).
- v112 is the `v112js` script just above PAGE ADDRESSES: `v112IntCard` (an Integrations tile opens its card), `v112TplShow` / `v112TplTile` (the Templates tiles filter, `V112.tpl`), `v112HsMirror` (a lead file from Files goes to HubSpot), the `apAfterLogin` / `apSignOut` wrappers that keep `whoAmI()` on the signed-in name, and the assistant greeting. The smaller fixes are in place: `openE1Lead`, `nwIntelRuns` / `nwIntelRun`, the Knowledge base tiles (`AP_FV.read`).
- v113 is the `v113js` script just above PAGE ADDRESSES (`V113`, webhooks in `V113_HOOK`). Ad Strategist: `v113AdKeyHtml` (takeaways), `v113Fit` / `v113FitHtml` (fit score), `v113InBrief` / `v113BriefNote`, `v113UseCopy`, `v113Live` / `v113AdState` (labels), `v113UpOverview`, `v113ImgKeep`. Content Transformation: `V113_CT_NEW` (formats), `V113_CTQ` (questions), `V113_SRCTY` (what the material is), `v113CtTiles`. Marketing Generation: `v113MgA`, `v113MgBlockHtml`, `v113CalLoad`, `v113FunStart` / `v113FunPoll` / `v113FunOpen` (the Funnel Builder). Ad Testing and Integrations: `v113AdsLoad`, `v113Working`, `V113_INT`, `v113IntSave`. Company profile: `v113Draft`, `v113DraftPoll`, `v113DraftKeep`. `v113Title` sets the tab title, and a `v98ReadHtml` wrapper labels the daily read.
- v114 is the `v114js` script just above PAGE ADDRESSES: `V114_HOOK`, `V114_LEFT` (20 minutes), `v114Tok` and the `window.fetch` wrapper that adds `auth`.
- v115 is the `v115js` script just above PAGE ADDRESSES. Sidebar: `V115_PROD` (the products and their pages), `v115ProdHtml` / `v115Prod`, `v115Crumb` (the top bar), `v115Home` / `v115Overview` (what home and overview open), the `nwHead` wrapper and the `NW_HEADS` / `NW_PAGE_HEADS` labels, `v113Title` (redefined). Today: `v115TodayHtml`, `v115OvQuick`, `v115OvProducts`, `v115OvSignups`. Deliverables: `v115DlLoad`, `v115DlHtml`. Landing pages: `V115.lp`, `v115LpLoad`, `v115LpFrom` (a funnel package as page content), `v115LpNew` / `v115LpFromPkg` (the picker), `v115LpEdit` / `v115LpSave` (the editor and its going-live checks), `v115LpAds` / `v115AdUrl` (codes and links), `v115SuTable` / `v115SuCsv` (sign-ups), `v115AdTestHtml` (the Ad Testing table). In PAGE ADDRESSES: `ROUTE_ALIAS` (product names as words). The public page is `go.html`, its own file.

---

# 2. Spectrum Care Advisory OS (care portal, np-demo)

## What this is
Single-file HTML portal for care agencies (`E-&-G-Home-Inc.html` in GitHub). Renamed from Meridian Care Portal at v7.5; backend names kept the np_demo prefix. Live at np.aiparagonconsulting.com. Deliveries are named np-demo-pilot-vX-Y-beta.html. Erica demos it to prospects. Pilot client is Ezra, nonprofit exec director, agency E & G Home under Alta California Regional Center. More agencies want to beta.

## How the pieces fit
The portal talks to Supabase directly for all data, logins and files, scoped per agency by RLS. Anything that leaves the portal (email, calendar, alerts, chatbot) goes portal → `np-relay` Edge Function → n8n webhook → Gmail / Google Calendar / Slack / AI model, with a no-PHI layer on outbound messages. The relay checks the signed-in user, takes the agency from the database, rate-limits each action and adds a server-side secret the n8n webhooks require.

## Tools and their roles
| Tool | Role here |
|---|---|
| DigitalOcean | Hosts the portal HTML at np.aiparagonconsulting.com (earlier on Vercel as Demo-portal.html). n8n also runs on a DO droplet today. |
| Supabase | Everything stateful. Auth: each signup gets its own empty agency. Postgres: np_demo_* tables with per-agency RLS, invite RPCs, settings, audit log. Storage: private bucket np-demo-docs, one folder per org (uploads, certificates, signed docs). Config sits in a window.NP_CONFIG block. Refresh-based sync, no Realtime. |
| Edge Functions | `np-relay` (the only route from the portal to n8n), `np-gcal` (keeps each person's Google Calendar connected; refresh token kept in Vault), `np-password`. |
| n8n | Everything outbound: notifications, email, calendar sync, reminders, digests, escalations, support routing and the Ask chatbot. Credentials: "Supabase account", "Gmail account", "Google Calendar account". |
| Gmail (via n8n) | Sends invites, notifications, digests and SIR escalations to the workspace's registered address. |
| Google Calendar | Per-person connection through `np-gcal`; the page reads events live. The older n8n two-way sync (portal → Google adds ACL-listed staff as attendees; Google → portal every 10 min, portal-created events only, matched by gcal_id) is pinned to the removed E and G org; see Where it stands. |
| Slack (via n8n) | Support inbox → Slack, built but not active (needs Gmail + Slack creds). |
| AI model (Ask workflow) | Ask Spectrum chatbot (Claude via n8n); answers carry [open:] / [go:] tokens that link to docs and pages. |
| Not wired yet | SMS provider (Twilio or similar), DocuSign (skipped for now). |

## Features
Role-based logins (director, staff, family); morning-first home with a timeline board; calendar with Google sync, multi-calendar and per-calendar access; incidents and SIR (ACRC 552x) on each client's Incidents tab; binders mirroring Ezra's physical binders (Agency, Medical, Daily) plus a Directory binder per client, staff folders separate; Templates (about 45 docs, AcroForm import, form builder, e-sign, printable wet-signature forms; blank ACRC/Alta forms live here, binders hold completed docs only); tasks with steps; messaging; training/onboarding; weekly checklists; configurable drill/temp logs; notification rules; per-user layouts; invites via one-time ?join= link; demo view ?demo=1. Directors can rename nav items and binders (Ezra calls Agency "Alta").

## Compliance rules (non-negotiable)
- No PHI on external channels: extNotify sends generic text only, extScrub is the last defence.
- Clients identified by UCI only (J-402318 format). "No names" applies to clients, not staff.
- Audit entries name-scrubbed (auditScrub). Medication data removed; MAR survives as a printable blank.

Known gaps (2026-10-15):
- `extScrub` isn't called anywhere, and its UCI pattern needs a letter and dash (J-402318) while its own comment and the sample clients use 7 digits (4023180). The Portal alerts workflow uses the same pattern.
- A UCI is a unique identifier under HIPAA, so "UCI only" isn't de-identified. These paths still send it out: Google Calendar event titles (initials + UCI), the SIR escalation email (UCI, type, home, severity) and the Ask snapshot (initials, UCIs, incidents, forms, messages). Decide per path: strip identifiers, or cover the vendor with a BAA.
- n8n saves each successful run with its data, including the hourly reminder run that reads client records.
- Per-person visibility from v12.13 is enforced in the UI; the database policies are agency-wide. Tighten before staff join. Joining only ever makes a director or staff, so there is no family role in the database yet.

## Design
Erica's onboarding design system: paper background, deep green, Inter Tight + IBM Plex Mono. Welcome, onboarding and dashboard in one file. Version text from one APP_VERSION constant. Placeholder agency "Delta Day Program". Support: support@aiparagonconsulting.com.

## Supabase details
- Multi-tenancy: np_orgs + np_org_members; SECURITY DEFINER np_my_orgs() / np_my_org(); np_join_org(token) moves an invitee into the inviting agency; np_invite_peek(token) feeds the join page. All np_demo_* policies: org_id IN (select np_my_orgs()), authenticated only, anon revoked; org_id NOT NULL default np_my_org(). Invites are director-only, single-use, matched to the invited email and expire after 14 days.
- v12.13: each signed-in person sees only themselves (own name, role, agreement, conversations); invites are director-only. SQL: np-v12-13-people-and-director-invites.sql (already run).
- Audit table is np_demo_audit_log (NOT np_demo_audit).
- Agency settings are keyed rows in np_demo_program (org, email, pilot, users, usersettings, deleted, hidesample, guides, notifrules, binders, homes, taskcats, apptcats, calaccess, certremind, labels, and more). Erase/reset keeps org, email, pilot, users, usersettings.
- Column contracts: np_demo_credentials {sid, cred_name, expires_on, label, status, doc}; np_demo_messages {id, thread_id, author, author_email, role, body, is_me, attach_doc, created_at}; tasks push "category" (local field is cat) + done_at; appointments carry gcal_id, cal, owner, acl.

## n8n workflows
| Workflow | ID | Notes |
|---|---|---|
| Incident → notifications | XyIQ06V5KqmyGTWn | /np-demo-incident. Saves an in-app notification only. |
| Ask chatbot | fSmt57tawkngKH1Q | /np-demo-ask. Still named "Ask Meridian" in n8n. |
| Portal alerts | nVJzqaI5b262DILr | /np-demo-reminders. Saves alert preferences and logs generic alerts in-app; sends nothing out. |
| Reminders and daily summary | iy5BBekR3rxSstLM | Hourly. Appointment, message and daily-log reminders plus the digest, from Notification settings. Emails carry times and counts only. |
| Send email | kRRMhff8UtQnojLj | /np-demo-email |
| Calendar portal → Google | t6WgaEjBLWVfORvd | /np-demo-calendar. Pinned to the removed E and G org. |
| Calendar Google → portal | OxALRtaTLX0UagHQ | Every 10 min. Pinned to the removed E and G org. |
| Healthcheck | OHgiI89EoySUy6Wv | Off. |
| Overdue digest | FWaKiWkb3Jkz9OR7 | |
| SIR escalation | XcAqh4VJi18eRiDm | Every 2h. |
| Cert-expiry draft | t4DRMNJ6116IuuyN | Off. |
| Support inbox → Slack | kGikS8h5rGt8G10c | Off. |

## Beta bar (Kser's words)
Each user sees only their own agency's data and actions; a new agency gets a blank dashboard tied to nothing else; nobody using it as intended sees Ezra's or anyone else's data. Holding at v12.13 on that basis.

## Where it stands (as of 2026-10-19)
- DigitalOcean deploys `E-&-G-Home-Inc.html` from `main` on every push, so a merge to main is a release: work on a branch, run `bash tests/run.sh portal`, then merge. Checked live on Oct 19: np.aiparagonconsulting.com served main's v12.27 byte for byte, apart from Cloudflare rewriting the Support email link (`/cdn-cgi/l/email-protection`).
- v12.23 (Oct 19, Erica's Loom on the login page and templates): the sign-in page is her split-screen design (Option A, Hanken Grotesk, her colours) with softer, general wording; every sign-in screen (new agency, invite, forgot/reset password, choose a view) uses it. "Remember my email on this device" works (unticked, the email is not offered again and is dropped on sign-out; device key `noremember`). Footer links: Support only (no Privacy or Terms pages exist yet). Templates: the box finder looks at each page as a picture (`ovScanPage` / `ovFindSlots`), so blank lines drawn or typed, captions under signature lines, table cells ("Drug, row 1"), framed boxes and stacked comment lines are found; tick boxes are named from their question. "Find boxes" re-runs it on a saved template; a box placed by hand snaps onto the line or cell under the click (`OV_SLOTS`). Builder: no "Upload the original form", a Template name box, new questions land above the signature lines, cells say "filled in on each copy". "Try it" is gone. Tests: `tests/portal-login.test.js`, `tests/portal-templates.test.js` (fixture forms in `tests/fixtures/forms`). Erica's real form is a fixture since v12.28.
- v12.24 (Oct 19, Erica's Home A/B files): the home page comes in her two looks, Clear agenda (A: light header, number tiles, today as a list beside the sections) and Bold overview (B: green header holding the numbers and Next up, today full width, sections in a grid). Today's schedule shows as a list (with a Now line and "In 30 min"), a timeline (one lane each for appointments, shifts, meetings and events, reminders; bars that would overlap drop to a second line) or the month. Shifts are grouped as Day, Evening and Overnight shift. It redraws itself each minute. Customize your home page (the cog, or Edit this page on home) picks the look, the schedule view, up to four numbers, Next up on or off, and which sections show in what order, including the person's own sections; it saves per person and per role in `usersettings` (`home`). A director also sets the agency default for directors, staff and families (`np_demo_program` key `homedefault`), which anyone without their own layout gets. The old page editor is off the home page. In the file: `HM`, `hmCfgFor` / `hmCfg` (the layout in force), `hmData` (today's items), `hmTile`, `hmSchedList` / `hmSchedGlance` / `hmSchedMonth`, `hmSec*`, `hmCustomize` / `hmCustDraw` / `hmCustSave`, `hmTick`; `weekRows()` feeds both the sidebar's This week and the progress card. Tests: `tests/portal-home.test.js` (fixed clock; a stub sign-in checks saving, another device and the agency default).
- v12.25 (Oct 19, tables on uploaded forms): picking a box the finder put in a table shows its table (rows and columns, the box's column and row marked on the page, the table outlined) above the box's own settings. A column's kind of box and its name change for every box in it (a tick box sits in the middle of its cell and fills the cell again when changed back); a row, a column or the whole table comes out in one go. Rows named by number ("Drug, row 3") are renumbered when one goes; `ov.r` itself never changes, so Find boxes puts a row back in its place. A framed box (a one-cell table) is treated as a plain box, a duplicated cell leaves the table, and a box placed by hand in an empty cell joins it. Tab and Shift+Tab step through the boxes while setting up; filling in on the form, Enter goes down a table column. In the file: the `v12.25: TABLES ON UPLOADED FORMS` block (`ovTblInfo`, `ovTblColName`, `ovTblKind`, `ovTblRename`, `ovTblDel`, `ovTblRenumber`, `ovKindTo`, `ovTblPanel`, `ovStep`). Tests: `tests/portal-tables.test.js`.
- v12.26 (Oct 19, field bar and format bar): Create new template has a field bar at the top (12 everyday kinds plus More): click a kind, then click a gap between blocks or a block (it goes underneath), or drag the kind onto a gap; Esc stops. A new field gets a name of its own ("Date 2"), since answers are kept by name. Both editors have a format bar like Word's: size in points, bold, italic, underline, seven colours, alignment, Clear formatting; Ctrl+B / I / U work on the picked block or box. A builder block keeps its look in `fd.fmt` ({pt, b, i, u, c, al}; labels start bold, paragraphs plain) and it shows on screen, on the fill-in form (label and answer) and on paper (`docSheet`, `tplPrintHtml`). A box on an uploaded form keeps it on `fd.ov` (fs, b, it, u, col, al), shown on the answers written on the original; the side panel's Small / Medium / Large went to the bar, and a table cell can pass its look to its whole column. In the file: the `v12.26: FIELD BAR AND FORMAT BAR` block (`fmtCss`, `fmtFill`, `fmtBarHtml`, `fmtApply`, `tpeRibbonHtml`, `tpePlace` / `tpePut` / `tpeSlot`, `tpeFmt`, `ovFmt`, `ovTblFmtCol`). Tests: `tests/portal-format.test.js`.
- v12.27 (Oct 19, scans and photos): a photo or scan of a paper form is read on the user's computer; nothing about it is sent anywhere. A photo is cut down to the sheet (`ovPaperBox`), turned straight (`ovSkew`, up to 6°) and evened out (`ovEven`), and that clean JPEG is what the template keeps (so its boxes sit on it). The words are read by tesseract.js 5.1.1 in the browser (`ocrWorker` / `ocrWords`; engine and English data from jsDelivr, about 7 MB the first time, then cached), on a copy with the ruled lines painted out, since the reader garbles words that touch a line. The box finder runs on the clean page (`ovReadPicture`; in picture mode broken lines are joined and letters standing on a line trimmed off it), and tick boxes are found from their drawn squares (`ovFindTicks`: four drawn sides, square corners, empty inside, standing clear of the next letter). A scanned PDF (a page with no words in it) is read the same way (`ovReadScannedPage`) and its boxes are turned back to where the page leans. Without the reader the boxes are still found, unnamed, and the editor says so. Find boxes works on photo templates. On the made-up fixtures (`tests/fixtures/forms/*-photo.jpg`, `med-scan.pdf`) the results match the PDF ones exactly. Tests: `tests/portal-scans.test.js` (the harness serves the reader from `tests/.cache`; `noOcr` blocks it).
- v12.28 (Oct 19, the open items): Erica's real form (Alta's "Medication Reason for Use", a public blank PDF: `tests/fixtures/forms/alta-medication-reason-for-use.pdf`) reads as 73 boxes: every blank, the 16-row table, the signature and the date; a blank that runs on to the next line is named "Is a resident of, line 2". Photos: the sheet's four corners are found (`ovPaperQuad`) and a sheet that leans or was shot at an angle is pulled flat from them (`ovFlatten`); a page on its side or upside down is turned (`ovTurnOf`: the way the letters run says sideways, ascenders against descenders say which way up). A filled-in copy: a blank or cell with pen writing in it (ink that is not a printed word) keeps its box, the writing is cleared from the kept page with the printed names and lines left (`ovClearWriting`), and the clean page is read again; a scanned PDF keeps its writing and the editor says to scan a blank form. A one-page scan on its side becomes a straightened picture; a longer one names the pages to turn. The word reader reads 16 languages (`OCR_LANGS`, picked in Upload a form, remembered on the device, kept on the template for Find boxes; each fetched from jsDelivr the first time). Names in Spanish, Vietnamese, Tagalog, Russian, Chinese, Korean and others give the kind of box, and a name that starts or ends with a date word is a date ("Date of signature", "Fecha de la firma"). Handwriting itself is not read. Tests: `tests/portal-photos.test.js` (photos made in the browser from the real form, a filled-in copy, a Spanish form, scans on their side).
- v12.29 (Oct 19, the app frame from her Home A file): the sidebar is white and the full height of the window, and stays put while the page scrolls: the agency's name on a deep green tile with "Spectrum Care Advisory OS" under it, the menu in Today / Care / Records / Setup, counts in grey pills (open incidents in red on Safety log, the home page's number), your card with Sign out on it, then the build, Pilot agreement and Help and support. The top bar has no band of its own: a white search box, white Help, Messages and Notifications buttons, and Ask Spectrum (the floating Ask button shows only on a phone or tablet, where the sidebar still slides in from the menu button). This week stays in the sidebar on every page but home. The app keeps its 1.09 zoom, so the sidebar's height is 100vh / 1.09. In the file: the `v12.29: THE APP FRAME` CSS block (last in the style sheet), `.tb-ask`, `.su-out`, `#brandSub`. Tests: `tests/portal-frame.test.js`.
- E and G's original workspace (org_mtgiv1ao_9fwoky) was removed in an Oct 5 cleanup. Its rows are kept in a backup table in the np_private schema. Open: restore them into the new agency, or purge. The backup still holds med data.
- As of 2026-10-15 the live agencies hold settings only: no client, staff, document or incident records. One non-AI Paragon agency was created Oct 7; check whether it's Ezra's.
- Both n8n calendar workflows are hard-coded to the removed org, so the n8n Google sync does nothing for current agencies. The per-person `np-gcal` connection is built and the page uses it (waiting on the Google OAuth origin and test users).
- Leftover Meridian naming: the Ask workflow name in n8n and the onboarding placeholder "e.g. Meridian Care".

## Open items
- Kser's lean: Ezra signs up himself as a new agency "E & G" to go through onboarding, rather than being invited into the existing workspace.
- Recommendation: move the portal to its own Supabase project on a paid tier.
- Waiting on others: Alta (John Decker) verdict on drawn vs DocuSign signatures; Ezra's staff-binder photos and view-testing notes; real ACRC/Alta template layouts; an SMS provider; Google OAuth origin + test users; a dev environment for Ezra; Erica call items (reports vs documents, dual pilot/dashboard view, changelog retention, template subcategories, form sections, training links, domain name).
- Parked: binder cover form content, PWA/native app, duplicate np_demo_shifts rows cleanup.

## Shipping
Ship each round as a new numbered file (np-demo-pilot-vX-Y-beta.html) with its regression suite. In GitHub the file is `E-&-G-Home-Inc.html`: update it in place. A merge to `main` deploys it to np.aiparagonconsulting.com.

## Gotchas
- Seeded records aren't DB rows, so deletes are tombstones.
- Route key is 'calendar', not 'cal'.
- Table wipes use id=not.is.null (id=gt.0 fails on text ids).
- Postgres returns "14:00:00" where the app uses "14:00".
- Portal webhooks post text/plain, so n8n needs a Normalize node first.
- QA must check getComputedStyle and fire real clicks (a CSS overlay once killed the deployed login).

---

# 3. Paragon Advisory OS (demo dashboard)

## What this is
A front-end-only, single-file HTML demo that Erica uses with wealth advisory prospects (`mhwp-dashboard.html` in GitHub, title "Delta Advisory · Demo"). Resume file: paragon-demo-dashboard-v152.html (about 1.7MB). Mock world: Delta Advisory, 12 clients (Ellison, Whitfield, Raman, Boone, Hollis and others). Demo logins Kaeser / Erica (Mark also works), display name Mark; the password is in `CREDS` in the file.

The pitch is "how is this different from a CRM?": AI marks on every AI control, a two-way HubSpot story, everything traceable to named sources, nothing posts without approval.

## How the pieces fit
There is no backend on purpose (checked: no fetch or XHR calls in the file). Everything runs in the browser from data hard-coded in the file. Integrations are shown, not connected. The internal AI Paragon dashboard (#1) reuses this shell, so design changes here may be worth carrying over.

## Tools and their roles
| Tool | Role here |
|---|---|
| Browser only | All data lives in the HTML. Front-end edits (stage moves, custom stages, dismissed notifications, done tasks, deliverable status) persist in localStorage, key paragonRD.v1. The demo world follows the real date, anchored to Sep 1 and shifted by days elapsed (RD_SHIFT, runs once). |
| Static hosting | Deployed as a static file. Erica reviews the deployed copy, so redeploy after every ship (she's given feedback on old deploys before). |
| HubSpot, Calendly, email, Slack, LinkedIn/Meta | Mocked only: sync badges, record tables, previews. Real wiring is phase 2. |
| Supabase | Not used. Only considered for hosting the Ep 42 clip (one-line swap noted at CLIP42_SRC); the clip is inlined as a data URI. |
| Unsplash | Login tile images by URL. |
| Dev tooling | Python patch scripts, Node + jsdom smoke suites, Playwright Chromium (screenshots, click audit, real drag test; localStorage needs a local http server), ffmpeg for clip compression. |

## Navigation (confirmed)
Touchpoint (Home and calendar) / Catalyst (Clients and meetings) / Canvas (Client deliverables, with a Stages tab) / Pipeline (Content and publishing) / Atlas (Firm knowledge base). System = Templates + Audit log. Every sidebar row the same size with a 2 to 3 word descriptor, no indented sub-items.

## Standing rules
- Named counts everywhere; every metric clickable; all counts reconcile across pages.
- No dead buttons. AI mark (blue circle + gold star) on every AI-run control so "Where's the AI?" rings them.
- Approve always opens a review popup first (template, version, stage, sources, open comments, next best action); Approve and send disabled while comments are open.
- Stages, same names and distinct colours everywhere: AI draft ready (first stage for new builds), Gathering information, Advisor review, Client ready, Needs attention.
- Naming: "Stage" in Canvas, "Status" only for review/approve items, "What to do next" on Touchpoint, "What to prepare next" on Catalyst meetings.
- Catalyst = meeting prep ("Prepares you for the conversation"); Canvas = documents in progress ("Produces and moves the work"). Erica wants the difference obvious.
- One state model drives everything: any approve, comment, stage move or upload refreshes every page, badge and count.
- Gold header band on table cards; serif display headings stay.

## How it's built
The redesign is an overlay: rd.css and rd.js appended last on top of the legacy build; legacy pages wrapped in .rd-legacy with new #rd-<page> containers. CSS cascade order matters: the newest block goes right before </style>. `</body>` appears 3 times in the file (twice inside Word-export JS strings), so anchor patches on `</style>\n</body>\n</html>`. Use \U0001F399-style escapes, never surrogate pairs. When replacing the last property of an object literal, keep the closing `},`.

## Page addresses
- On Vercel each page has its own address: /advisory/touchpoint, /advisory/catalyst, /advisory/canvas, /advisory/pipeline, /advisory/atlas, /advisory/templates, /advisory/audit, plus the profile menu pages /advisory/company, /advisory/brand-voice, /advisory/ai-settings and /advisory/integrations. `vercel.json` sends /advisory and /advisory/* to `mhwp-dashboard.html`. The old /mhwp-dashboard.html address forwards to /advisory/touchpoint (a temporary 307 for now; switch `permanent` to true once it's settled), and a #/<page> carried through the forward still opens that page.
- Sign-in and onboarding come first. The address is remembered and that page opens when onboarding finishes. If its capability was switched off in onboarding, Touchpoint opens instead.
- Client pages, the document editor, episodes and the campaign keep their parent's address (not routed yet). Back and Forward close open modals.
- A copy opened anywhere else (a local file, the separate static deploy) keeps its address and uses #/<page>. Inside a frame (the landing page embed) it leaves the address alone.
- In the file: the PAGE ADDRESSES script is the last block. `ROUTE_SLUG` maps page names to address words (a new page only needs a line there). It wraps `nav()` and `finishOb()`, so it must stay after every other round. If a newer build replaces the file (v152 lives outside this repo), carry that block over.

## Landing page (Sep 9 workstream)
Standalone sales page: Cluely-style hero with the demo embedded below. Free roam, front-end only, no lead capture, nothing saved from a visitor's session, all-new sample data (Ep 42 and its real clip excluded), design follows the dashboard. Shipped paragon-landing-v1.html + paragon-demo-embed-v1.html (must sit in the same folder) and a one-file standalone; those files aren't in this repo. The embed boots straight into the app, rdSave/rdLoad are no-ops, hash routes #brief / #build / #content / #ask, firm renamed to placeholder Northlake Advisory (glyph N). Two-file version recommended for the live site so the demo lazy-loads.
Gotchas: the HTML tokenizer turns U+0000 into U+FFFD, so never use a null-byte sentinel; a srcdoc iframe has no useful location.hash, so the boot reads window.__FLOW.

## Where it stands (as of 2026-10-15)
- The GitHub copy has no v145 to v152 markers (only "v117 integration" comments). Confirm it's v152 before building on it.
- Date: `rdSyncToToday` caps RD_SHIFT at 21 days and only shifts in 2026, so from Sep 22 the demo stays on Sep 22, and from 2027 it falls back to Sep 1.
- Naming gaps in this copy: Touchpoint's queue says "What to prepare next" ("What to do next" isn't in the file); the Canvas filter tab for Advisor review says "Awaiting review"; meeting "Prep stage" chips say "Draft under review" and "Prep needed".
- Seeded audit log entries stop at Aug 7 and don't shift with the date. Source files ("pulled Aug 7") don't either.
- Touchpoint's queue truncates most names and documents at 1440px wide.
- Headless smoke run (log in, all 7 sidebar pages, at three dates): no JS errors.
- The file is named after the old Meridian Harbor Wealth Partners demo, which had a backend: "mhwp" n8n workflows (19 active) and mhwp_* tables. Nothing in this repo uses them. Open decision: retire them.

## Open items
- Next for the landing page: the new world spec (firm name, 12 clients, flagship document, knowledge base set, a content example to replace Ep 42). Client copy is still the old world's.
- Open question with Kser: rename Catalyst's own Clients / Pipeline view toggle to Stages, or leave it.
- Expect more from Erica on making Catalyst and Canvas feel like different products.
- v145 to v152 were built in another chat; check the file itself for those changes.

## Shipping
- Ship each round as paragon-demo-dashboard-vNNN.html. In GitHub the file is `mhwp-dashboard.html`: update it in place, keeping the PAGE ADDRESSES block (see Page addresses).
- Before every ship: parse check, the smoke suites, the full demo-path walkthrough (qa.js, also runs with a simulated date) and audit.js clicking every control.

---

# 4. Voice agent via Vapi (Command Center)

## What this is
A voice AI phone agent for AI Paragon client demos, built with Erica. Positioning: the call is the trigger, and the post-call agent work is the demo. Demo business: Arrington Roofing. Dashboard: `voice-agent-client.html` in GitHub (title "Customer Conversation and Conversion Command Center"; built as paragon-command-center.html), based on Erica's "Customer Conversation and Conversion Command Center" mockup and the Capture / Convert / Connect tier capability matrix. Sections: Overview, Conversations, Texts, Opportunities, Appointments, Quality, Agent training, Knowledge, Analytics, Portal, Tiers, Settings. Signed out it runs on demo data; signed in it shows live data.

## How the pieces fit
Caller (or the dashboard's "Call the agent" button) → Vapi runs the live call → during the call Vapi hits the n8n tool server for answers and bookings → when the call ends Vapi sends the end-of-call report to n8n → n8n saves the call to Supabase and runs the post-call mission (End of Call calls the Post-Call Mission workflow once per step: read, research, draft) → the Command Center reads it all from Supabase. Knowledge and training edits in the dashboard land in Supabase, and the tool server reads from there, so an edit changes what the agent says on the next call.

## Tools and their roles
| Tool | Role here |
|---|---|
| Vapi | The live call: speech in, turn-taking, voice out, tool calls, private call recordings, end-of-call report. Assistant "Arrington Roofing Intake", ID 1acd9667-542c-4e5e-a777-0309b7780703 (Clara voice, gpt-4.1 per Vapi Configure, Deepgram nova-3, 10 minute cap). Private key = server side only. Public key + assistant ID = the dashboard's browser calls (editable under Settings, Data source). |
| n8n | Three jobs. (1) Tool server during the call: no model call inside so it answers in milliseconds. (2) End-of-call mission: acks Vapi at once, saves the call, then runs read → research → draft and saves a review packet. Approval gate: nothing is sent or written to a CRM automatically. (3) Helpers: caller lookup, recording links, configure, training/publish. Tool and end-of-call webhooks require the x-vapi-secret header. |
| Supabase | vc_* tables: vc_calls (saved before the mission so a call shows even if the mission fails; structured._timeline keeps each turn and tool step so the dashboard can show what every tool returned), vc_missions (deliverables for review), vc_tool_events, plus knowledge, training rules and versions, customers/bookings, team alerts and text records. Auth for staff sign-in; recording links are staff only. |
| OpenAI | The post-call mission steps (Responses API with web search, gpt-4o, in the Post-Call Mission workflow). A credential Base URL problem made these 404, leaving missions partial. |
| Hosting | The dashboard must be served over https for the mic (Vercel is fine). The Vapi web SDK loads from jsDelivr with no pinned version (esm.sh fallback); pin one. |
| Twilio (planned) | Business phone number imported into Vapi; A2P 10DLC registration for US texting. The Send Text node is disabled until then. |
| Pushover (planned) | Push alerts to staff phones. The Push to Phones node is disabled until then. |

## Page addresses
- On Vercel each page has its own address: /voice/overview, /voice/conversations, /voice/messages, /voice/opportunities, /voice/calendar (the appointments page), /voice/quality, /voice/training, /voice/knowledge, /voice/library, /voice/analytics, /voice/portal, /voice/tiers, /voice/settings. `vercel.json` sends /voice and /voice/* to `voice-agent-client.html`.
- The old /voice-agent-client.html address forwards to /voice/overview (a temporary 307 for now; switch `permanent` to true in `vercel.json` once it's settled). Browsers keep a #/<page> through the forward, so an old link like voice-agent-client.html#/calendar still opens Calendar: on /voice a #/<page> wins over the path and is then dropped from the address.
- A copy opened anywhere else (a local file, a host without `vercel.json`) keeps its address and uses #/<page> instead, so local testing still works without the rewrite.
- In the file: `SECTIONS` and `go(name)` switch pages; `ROUTE_SLUG` maps a page to its address word where they differ; `routeWrite`, `routeSync` and `routeStart` keep the address bar and the page in step (Back and Forward close the customer drawer). A new page only needs adding to `SECTIONS`, plus `ROUTE_SLUG` if its address word differs. Unknown or old words settle on a real page, so a bad link never shows a blank screen.
- Not routed yet: the customer drawer, conversation detail and modals.

## Agent tools (all served by the n8n tool server)
check_availability, book_appointment, lookup_knowledge, escalate_to_human, plus reschedule_appointment and add_case_details for returning callers. If lookup_knowledge says a topic belongs to a person, the agent says what it's told and escalates. If it says to ask questions first, the agent asks only the ones it still needs, one at a time.

## n8n workflows
| Workflow | ID | Notes |
|---|---|---|
| Vapi Tools (Roofing Intake) | HpytLO880aSvj9wK | /webhook/vapi-tools |
| Vapi End of Call, Post-Call Mission | TFlQD19SKF9CAEtI | /webhook/vapi-end-of-call |
| Post-Call Mission | hpQO6ymk4yBEa3VI | The OpenAI step engine (read, research, draft), called by End of Call. |
| Vapi Recording Link | McFBGxQ6EtGUeNdi | Short-lived presigned playback link, staff only. |
| Vapi Train, Publish to Agent | JJ9MY0TQ6JrQoD8L | /webhook/vapi-train-publish. Writes the TEAM RULES block into the live prompt and logs vc_agent_versions. |
| Vapi Caller Lookup (Roofing Intake) | xfGS6QuGQ2h2IF76 | /webhook/vapi-caller. Answers Vapi's assistant-request for inbound phone calls (returning callers). Needs the business number's Server URL. |
| Vapi Configure (Roofing Intake) | U4jWATDlKAPk91i9 | Unpublished on purpose, run by hand. Patches the assistant and its 6 tools in place, then re-applies team rules. |
| Vapi test workflow | PArDwhawz1IWSETk | Empty, ignore. |

The older "Voice Agent Demo" and "Voice Agent Realtime Session" workflows are inactive (cleanup).

## What's built
- Returning callers matched on US 10-digit phone, greeted by name, can move a booking or add case details. The agent doesn't raise the previous call unless the caller does; a bare phone number is never used as a name.
- Agent training: coach any transcript line into a Rule, Restriction, Approved answer or Note. Answers apply on the next call; rules wait for Publish (versioned). Requires vc-training.sql in Supabase.
- Knowledge page: "Test a question" shows exactly what the agent would say and warns when trigger words would catch everyday calls (e.g. bare "panel" matching solar questions).
- Turn-taking tuned: stops fast when interrupted, ignores "yeah / okay / mm-hm", always stops on "wait / hold on / stop / actually". The greeting plays in full (it carries the recording notice).
- Test a callback: sample customer when signed out, real data when signed in; test calls never touch real bookings or send texts.
- Texting gated by a "Send confirmations" System Authority setting (allowed / needs approval / prohibited).
- Conversations grouped by day with review status, search across names, phones and transcripts (Ctrl K).

## Where it stands (as of 2026-10-15)
- 3 calls saved so far, all browser test calls (Oct 1, 2 and 10), none reviewed; no booking saved yet.
- Every post-call mission so far failed all three steps. n8n shows those runs as success because the OpenAI node continues on error; check vc_missions.status instead. No real call since Oct 10, so the credential fix is unconfirmed: one test call will tell.
- The Oct 2 "ejected" bug is fixed in the page: the SDK's "ejected" error is treated as a normal end, the timer stops, the header says Call ended and End call becomes Close.
- Slot parser: the "October 15th at 10:30am" regression passes. Abbreviated or numeric dates ("Oct 20th at 10:30am", "Tue, Oct 20 at 10:30 AM", "10/20 at 10:30") find no slot; add them to the regression set.
- Key rotation scope: the Vapi private key is inline in Configure, Train Publish and Recording Link; the server secret is in Tools, End of Call, Configure, Train Publish and Caller Lookup. Rotate all of them and never paste keys into chat.

## Open items
- Business number not bought yet. Plan: a free Vapi number now so it's demoable, a paid Twilio number + A2P 10DLC (2 to 4 weeks) in parallel. A2P needs the client's legal business name, EIN, address and website. Costs and steps are in the "Callbacks, Phone and Texting Setup" doc.
- Last known blockers on real calls: phone number area code and the OpenAI credential. Confirm whether fixed.
- Plans: per-industry knowledge bases (roofing done, property management drafted), US confirmation texts and push notifications.
- Cleanup: archive the inactive "Voice Agent Demo" and "Realtime Session" workflows. Keep `voice-agent-client.html`: it's the Command Center now.

## Working with Kser (this project)
- He tests by placing real calls and quotes the transcript back; fix exactly what he quotes.
- Review before building, write and run tests (including adversarial and regression ones) before saying something's done, and keep demo data intact across refreshes.

## Gotchas
- Slot parsing: "October 15th at 10:30am" was once read as hour 15; keep the regression test.
- Sample/demo callback data must stay isolated from real alerts and texts.
