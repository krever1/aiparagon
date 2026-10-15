# AI Paragon internal dashboard

Project brief for Claude sessions in this repo. Last reviewed 2026-10-15.

## This repo
- The dashboard is `new-aiparagon-dashboard.html`. That's its name in GitHub: update it in place, don't add numbered copies here. Vercel serves the repo as static files.
- The other HTML files are separate builds: older dashboards (`ai-paragon-dashboard.html`, `ai-paragon-dashboard-v40.html`, `dashboard-v1.html`), the care portal and client pages, and marketing pages. Don't touch them for dashboard work.
- The repo is public. Keep secrets and security details out of commits and this file.

## What this is
AI Paragon Consulting Group's own lead gen and marketing system. Single-file HTML app at aiparagon.vercel.app, live on Supabase and n8n, with real Supabase Auth logins. Built by Kser (Kaeser Valencerina, technical builder). Erica Dresslar is founder/CEO and gives feedback by Loom, Slack and call transcripts. Current goal: make it user friendly, less clutter, less text.

It's built on the demo dashboard's shell (v152 design). The old v60 engine and workspace pages are ported in verbatim, CSS scoped under `.ap60`, and `apGo(view)` maps sidebar views onto v60's `state.engine/state.view` + `render()`. Don't hand-rewrite engine pages: that lost editors, run pickers, comments and the funnel package before.

## How the pieces fit
Dashboard (Vercel) → calls an n8n webhook → the n8n agent does the AI work (Claude, Tavily, SEC IAPD, Google) → writes results to Supabase → the dashboard reads Supabase and renders them. HubSpot and Slack hang off n8n.

## Tools and their roles
| Tool | Role here |
|---|---|
| Vercel | Hosts the HTML as a static file. No server code. |
| Supabase (lesyptuwllcgajdxzjje) | Logins, data and files. Auth = real accounts (`ap_profiles` made by a signup trigger, `ap_prefs` stores each user's workspace state so another machine resumes, `ap_allowed_emails`). Postgres holds all engine data. Storage holds lead files, HubSpot-synced files (`hubspot/` path) and avatars. The page reads/writes through PostgREST with the signed-in user's token. Shared with the care portal (np_* tables). |
| n8n (n8n.aiparagonconsulting.com) | Runs every AI agent. The dashboard starts them by webhook, schedules run the syncs, and each workflow writes its output back to Supabase (agent outputs as markdown in `agent_outputs.content_md`). Self-hosted on DigitalOcean, AWS move in progress. Erica's n8n project: 70lGqIuDvXVysHIc (her copies end in "(Erica)" and call her own workflow IDs). |
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
Target layout. The current sidebar differs; see Where it stands.
- Workspace: Home, Files, HubSpot contacts, Tasks, Company profile
- Engine 1, Client delivery (Pre-Call Intelligence): Overview, Lead pipeline (New → Researched → Interview → Assessment → Discovery call → Growth plan)
- Engine 2: placeholder
- Engine 3, "Lead Generation & Marketing": Intel Tracker (Agent 1), Ad Strategist (Agent 2), Market Intelligence Briefs, Marketing Generation (the Low-Ticket Agent), Ad Testing, Uploads & runs history
- System: Knowledge base, Notion, Audit log, one Integrations page

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
| Engine 3 · Intel Tracker (scheduled + custom) | Zc1iXclbFKq0XJOA | Schedule set in the dashboard (weekly, Mon 6am Pacific by default) or custom run. Writes the organic brief. |
| Engine 3 · Ad Strategist | yA7H9YicyQxNt7GK | Meta Ad Library pull after the Intel Tracker. Writes the ads brief. |
| Engine 3 · Content from Source | S9LPQaySOnXVquoQ | /webhook/e3-content-run. Content request → draft. |
| Engine 3 · Read a Link | eWz8zCjBmJG9ktu7 | /webhook/e3-read-link. Article text or YouTube captions. |
| Engine 3 · Transcribe | Hr7AjlepxJC4fNxI | /webhook/e3-transcribe. Whisper. |
| Engine 3 · Learn Voice | pdiaXeNC3Fw7GXEM | Suggests the brand voice from the team's writing. |
| Engine 3 · Auto-fill | ZLp63MNgtr7vqrdZ | Fills the Make new forms from the newest briefs. |
| Engine 3 · Strategy Insights | XwQFbgDcMGTS9mvs | /webhook/e3-strategy-insights |
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

## Supabase tables
e1_leads, agent_outputs, competitors, lead_files, guide_files, hubspot_contacts, company_profile, runs, intel_items, winner_creatives (a view), engagement_drafts, test_results, funnel_packages, offers, creative_briefs, ad_records, ap_profiles, ap_prefs, ap_allowed_emails.

## Where it stands (as of 2026-10-15)
- Latest file: `new-aiparagon-dashboard.html` in this repo. Its patch markers go up to v110.
- Next build: User 2's own-content path (content upload, extraction, its own workflow). Most of the intake already exists: Content from Source, Read a Link, Transcribe, Learn Voice, Doc Reader, Auto-fill, plus mammoth.js in the page. The new piece is mainly the run: own content + organic brief → organic posts + ad funnel. Check what Content from Source already covers before building a new workflow.
- Agreed redesign: merge Content Transformation into Marketing Generation; Client profile becomes its own page like the shared mockup. An `e3client` view already exists (not in the sidebar); check it against the mockup first.
- Sidebar today vs Navigation above: Engine 3 has 8 items (Overview, Create content, Intelligence briefs, Competitor Intel Tracker, Ad Strategist, Content Generation, Ad Testing, Uploads & runs). Marketing Generation goes by three names: sidebar "Content Generation", breadcrumb "Content Generation Agent", in-page "Marketing Generation". Integrations isn't in the sidebar. The browser tab still says "AI Paragon · Demo".
- Low-Ticket webhook node: checked, in place. POST `e3-low-ticket-run`, published. It checks the caller is an AI Paragon user, then "Respond Started" replies and hands off to Run Context.
- Asana: the Integrations · Asana Proxy workflow is unpublished, so Asana on the Tasks page fails. Publish it or hide Asana.
- Open decision: access control on the shared Supabase project (the care portal shares it). Either scope access inside the shared project, or move the care portal to its own Supabase project and restore the signup restriction. Before tightening RLS either way, switch the ported v60 Supabase helpers (`sb`, `sbPost`, `sbPatch`, `sbInsert`, and the file upload/delete functions) to send the signed-in user's token (`apToken()`), like the shell code does.
- Older loose ends: real meta_page_id values (The Bandwidth Method etc.); maybe key HubSpot sync on hs_id instead of email.

## Working with Kser
- Casual, direct, short replies. No em dashes, no AI buzzwords, no made-up metrics.
- He uploads the latest file and points at specific issues; make targeted fixes, not long discussion.
- For a big feedback batch (Loom, screenshots), confirm understanding before building.
- Patch with Python scripts that replace unique string anchors, assert on a missing anchor, write to a temp file then swap. Ship each round as a new numbered file. In GitHub the file is always `new-aiparagon-dashboard.html`: update that one in place.
- Full QA pass before shipping. "Quick changelog" = short list by category, no mention of Loom or feedback.
- Never use Supabase-tesserafy or Tesserafy branding here.

## Gotchas
- n8n update_workflow doesn't activate; always publish_workflow after.
- Workflow description max 255 characters, fails silently past it.
- HTTP Request nodes lose credentials on SDK rebuild; re-assign after every republish.
- Supabase upsert: `Prefer: resolution=merge-duplicates`. Required columns need defaults or inserts fail silently. Use `return=representation` to see errors.
- The dashboard runs Engine 1 on Erica's copies (full run → Lead AI Research Agent (Erica), custom run → Engine 1 Custom Run (Erica)). The non-Erica chain (Lead AI Research Agent `iDde4Qs3Yay4qtgQ`) is started by `assessment-v3.html`. Two live chains: a fix in one doesn't reach the other.
- Later rounds wrap earlier functions (e.g. `v97LibRender`, `v97ReqLogAdd`), and three `window.fetch` wrappers add fields to the ask-bot and Low-Ticket request bodies. Check for wrappers before changing a function.
- Old v60 login code is still in the file (`tryUnlock`, and `openThemeModal` with its Update password button, both reading `dashboard_users`). Nothing calls them. Login is Supabase Auth (`AP_AUTH`).

## Finding things in the file
Search by name; line numbers move every round.
- `AP_VIEWS`: view registry. Later rounds add to it with `Object.assign(AP_VIEWS, ...)` and `AP_VIEWS.<view> = ...`.
- `apGo`, `apNavSync`: routing and sidebar state.
- `AP_N8N`, `AP_HOOKS`: n8n webhook URLs.
- `apSb`: shell Supabase helper. Later rounds wrap it (search `apSb=`) so calls go out with the user's token, with a refresh and one retry on 401. `apToken()` returns the session token.
- `sb`, `sbPost`, `sbPatch`, `sbInsert`: v60 Supabase helpers. Not wrapped like `apSb` (see the open decision).
- `AP_AUTH`: Supabase Auth endpoints.
