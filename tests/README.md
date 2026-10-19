# Browser tests

Tests for the apps in this repo: the three Vercel serves and the care portal (deployed to DigitalOcean from main). They check the page addresses, sign-in, Back and Forward, and that every page still opens without errors. Run them before merging a change to one of these files. `.vercelignore` keeps this folder off the live site.

| Suite | File | What it covers |
|---|---|---|
| `dashboard-routes.test.js` | `new-aiparagon-dashboard.html` (#1) | /dashboard/<page> addresses, /dashboard/login, the saved-workspace resume, sign-in and sign-out, engine switching, leads, the old-address forward. Supabase is stubbed (`lib/dashboard-harness.js`), so no real account, data or workflow is touched. |
| `dashboard-e3.test.js` | `new-aiparagon-dashboard.html` (#1) | Engine 3: editing a brief (Request changes) and putting the agent's version back, the brief layout (Structure), categories and brief insights on Marketing Generation and Content Transformation and what the requests carry, the Ad Strategist's Following tab (ads only, or ads and posts), suggested industries, the follow step after an upload, and the Intel Tracker leaving out the accounts followed for ads only. Supabase answers from an in-memory store (`lib/rest-stub.js`) filled with made-up data (`lib/e3-fixtures.js`); n8n webhooks answer from stubs. |
| `dashboard-qa.test.js` | `new-aiparagon-dashboard.html` (#1) | The QA round's fixes: the Intel Tracker opens on the newest live run (not a built-in sample run), a lead opens from Files, the knowledge base and HubSpot, the stat tiles on Integrations, Knowledge base and Templates filter or open their page, a lead file uploaded on Files is also sent to Lead File → HubSpot Sync, and the assistant greets whoever is signed in. Same in-memory Supabase as the Engine 3 suite, with Engine 1 leads, files, templates and calls added (`lib/qa-fixtures.js`). |
| `advisory-routes.test.js` | `mhwp-dashboard.html` (#3) | /advisory/<page> addresses, the demo sign-in and onboarding, capabilities, detail pages, modals, the old-address forward. |
| `advisory-smoke.test.js` | `mhwp-dashboard.html` (#3) | Signs in and opens every sidebar page at three dates; fails on any JS error. |
| `voice-routes.test.js` | `voice-agent-client.html` (#4) | /voice/<page> addresses, deep links, the customer drawer, the old-address forward. |
| `portal-login.test.js` | `E-&-G-Home-Inc.html` (#2) | The split-screen sign-in page at desktop, tablet and phone width with real clicks (nothing drawn over the button or fields, no sideways scrolling), the new-agency, invite, forgot-password and choose-a-view screens, the show-password eye and "Remember my email". Supabase is stubbed (`lib/portal-harness.js`), including an invite. |
| `portal-templates.test.js` | `E-&-G-Home-Inc.html` (#2) | The box finder on made-up forms in `fixtures/forms` (drawn lines, typed ____ lines, a Word-style export, a form with tick boxes, a framed box, stacked comment lines and a table with row names), uploading a form, Find boxes, a box placed by hand snapping onto its line, and the template builder. Runs in the demo view, so nothing is saved. pdf.js (the version the portal loads) is fetched from npm into `tests/.cache` the first time. |
| `portal-home.test.js` | `E-&-G-Home-Inc.html` (#2) | The home page: both looks, today's schedule as a list, timeline and month at a fixed time (what is on now, next and done), the numbers, Next up, sections, Customize your home page (live preview, Cancel, Save, your own sections), the tour, staff and family, phone width, and an empty agency. A stub sign-in (the harness's `session` option: one account whose settings rows live in memory) checks that a layout is saved to the account, comes back on another device, and that a director's agency default reaches staff who have not set up their own. |

Each routes suite also checks local copies (#/<page>), other hosts, frames and odd addresses.

## Running

Needs Node and Playwright with Chromium. Claude Code cloud sessions already have both. Locally: `npm i -g playwright` then `npx playwright install chromium`.

```
bash tests/run.sh                                   # every suite
bash tests/run.sh dashboard                         # one app: dashboard, advisory, voice or portal
bash tests/run.sh dashboard --against origin/main   # also compare every page with main
```

`--against` takes any git ref and checks that every page reads the same as that version of the file, so you can see which pages a change touched. Without it the comparison is skipped and any page error fails the run. A single suite runs directly too: `node tests/dashboard-routes.test.js [baseline.html]` (set `NODE_PATH="$(npm root -g)"` if Playwright is installed globally).

The dashboard harness takes two options for suites that need data: `rest` (a store from `lib/rest-stub.js`: it reads the table and simple filters, keeps writes and logs them in `store.writes`) and `hooks` (a function that answers n8n webhook calls). Without them every REST read returns an empty list, as before.

## Keeping them current

The suites click the real sidebar, menus and buttons. When a change adds, renames or moves a page, update the suite in the same PR. For page addresses that means `ROUTE_SLUG` in the app file and `SLUG` (or `PAGES` / `KEYS`) in its suite.
