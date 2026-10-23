# Browser tests

Tests for the three apps Vercel serves from this repo. They check the page addresses, sign-in, Back and Forward, and that every page still opens without errors. Run them before merging a change to one of these files. `.vercelignore` keeps this folder off the live site.

| Suite | File | What it covers |
|---|---|---|
| `dashboard-routes.test.js` | `new-aiparagon-dashboard.html` (#1) | /dashboard/<page> addresses, /dashboard/login, the saved-workspace resume, sign-in and sign-out, engine switching, leads, the old-address forward. Supabase is stubbed (`lib/dashboard-harness.js`), so no real account, data or workflow is touched. |
| `dashboard-e3.test.js` | `new-aiparagon-dashboard.html` (#1) | Engine 3: editing a brief (Request changes) and putting the agent's version back, the brief layout (Structure), categories and brief insights on Marketing Generation and Content Transformation and what the requests carry, the Ad Strategist's Following tab (ads only, or ads and posts), suggested industries, the follow step after an upload, and the Intel Tracker leaving out the accounts followed for ads only. Supabase answers from an in-memory store (`lib/rest-stub.js`) filled with made-up data (`lib/e3-fixtures.js`); n8n webhooks answer from stubs. |
| `advisory-routes.test.js` | `mhwp-dashboard.html` (#3) | /advisory/<page> addresses, the demo sign-in and onboarding, capabilities, detail pages, modals, the old-address forward. |
| `advisory-smoke.test.js` | `mhwp-dashboard.html` (#3) | Signs in and opens every sidebar page at three dates; fails on any JS error. |
| `voice-routes.test.js` | `voice-agent-client.html` (#4) | /voice/<page> addresses, deep links, the customer drawer, the old-address forward, and the calendar staying in Pacific time for viewers in other time zones. |

Each routes suite also checks local copies (#/<page>), other hosts, frames and odd addresses.

## Running

Needs Node and Playwright with Chromium. Claude Code cloud sessions already have both. Locally: `npm i -g playwright` then `npx playwright install chromium`.

```
bash tests/run.sh                                   # every suite
bash tests/run.sh dashboard                         # one app: dashboard, advisory or voice
bash tests/run.sh dashboard --against origin/main   # also compare every page with main
```

`--against` takes any git ref and checks that every page reads the same as that version of the file, so you can see which pages a change touched. Without it the comparison is skipped and any page error fails the run. A single suite runs directly too: `node tests/dashboard-routes.test.js [baseline.html]` (set `NODE_PATH="$(npm root -g)"` if Playwright is installed globally).

The dashboard harness takes two options for suites that need data: `rest` (a store from `lib/rest-stub.js`: it reads the table and simple filters, keeps writes and logs them in `store.writes`) and `hooks` (a function that answers n8n webhook calls). Without them every REST read returns an empty list, as before.

## Keeping them current

The suites click the real sidebar, menus and buttons. When a change adds, renames or moves a page, update the suite in the same PR. For page addresses that means `ROUTE_SLUG` in the app file and `SLUG` (or `PAGES` / `KEYS`) in its suite.
