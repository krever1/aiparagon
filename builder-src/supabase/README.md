# AI Paragon Sites (Supabase project euzdaxouzvmvvukbuvwi)

The website builder's own backend (#5 in CLAUDE.md, Hosting): the team's pages (drafts and live
copies), the contacts the page chatbots take, and the visitor chat's limits. Kept here for the
record; the project itself is changed through Supabase (migrations applied with the Supabase tools,
the function deployed the same way), then copied here.

- `migrations/sites_v1.sql`: tables `pages`, `leads`, `chat_hits` and their policies (team members
  only, through `app_metadata.team`), `site_page()` (what a live page shows, public),
  `chat_start()` and `chat_allow()` (the visitor chat's first step and its limits, service role
  only), and `pages.live_text` (applied as sites_v1 and sites_v1_chat_start).
- `functions/site-session/`: swaps a team member's AI Paragon sign-in for a session here.
- pg_net is installed on the project (migration pg_net_for_checks) so checks can call the project's
  own function from SQL; nothing in the app uses it.
