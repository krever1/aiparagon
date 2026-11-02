# Live pages (Vercel project aiparagon-sites)

The website builder's live pages (#5 in CLAUDE.md), at the shared link
sites.aiparagonconsulting.com/<page> and at each page's own domain. This folder is the project's
root directory; the aiparagon project never serves it (see ../.vercelignore).

- `api/page.mjs`: the one function every address goes to (vercel.json). It finds the live page in
  the AI Paragon Sites Supabase project and sends it as finished HTML. Built from
  builder-src/src/site/server.jsx.
- `_site/site.<hash>.js`: the browser script that takes over that HTML (motion, the chat). Built from
  builder-src/src/site/client.jsx, with `_site/LICENSES.txt`.
- `vercel.json` and `robots.txt` are written by hand.

Rebuild with `npm run build` in builder-src/; never edit the built files here by hand.
