// Builds ../site-builder.html, the website builder demo (#5 in CLAUDE.md), and the live pages'
// server and browser script in ../sites/ (the aiparagon-sites Vercel project).
// esbuild bundles src/main.jsx with React and Puck, then the script and styles are inlined into
// src/index.html so the app stays one static file, like the other apps in this repo.
// Run: npm install, then npm run build (from builder-src/). Never edit site-builder.html, or the
// files the build writes in sites/ (api/page.mjs, _site/), by hand.
import { build, transform } from 'esbuild';
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..', 'site-builder.html');

const result = await build({
  entryPoints: [path.join(here, 'src', 'main.jsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  outdir: path.join(here, 'out'),
  write: false,
  metafile: true,
  legalComments: 'none',
  logLevel: 'warning',
});

let js = '';
let css = '';
for (const f of result.outputFiles) {
  if (f.path.endsWith('.js')) js = f.text;
  else if (f.path.endsWith('.css')) css = f.text;
}
if (!js || !css) throw new Error('esbuild gave no script or no styles');

// Inline safely: nothing in the script or styles may close or confuse its tag
js = js.replace(/<\/script/gi, '<\\/script');
css = css.replace(/<\/style/gi, '<\\/style');
if (/<!--/.test(js)) throw new Error('the bundle contains "<!--", which is not safe to inline in a script tag');

// The licenses of every package in a bundle (MIT asks for its notice to travel with the code)
async function licensesOf(...metafiles) {
  const pkgs = new Set();
  for (const meta of metafiles) {
    for (const input of Object.keys(meta.inputs)) {
      const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
      if (m) pkgs.add(m[1]);
    }
  }
  const notices = [];
  for (const name of [...pkgs].sort()) {
    const dir = path.join(here, 'node_modules', name);
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE'].map((f) => path.join(dir, f)).find((f) => existsSync(f));
    const text = file ? (await readFile(file, 'utf8')).trim() : 'License: ' + (pkg.license || 'see package');
    notices.push(name + ' ' + pkg.version + '\n' + text);
  }
  return { count: pkgs.size, notices };
}
const { count: pkgCount, notices } = await licensesOf(result.metafile);
// Only these can end or confuse an HTML comment; the license text is otherwise kept as written
const commentSafe = (t) => t.replace(/<!--/g, '<! --').replace(/--!?>/g, (m) => m.replace('--', '- -'));
const legal = '<!--\nThird-party code bundled in this page:\n\n' + commentSafe(notices.join('\n\n====\n\n')) + '\n-->';

const tpl = await readFile(path.join(here, 'src', 'index.html'), 'utf8');
if (!tpl.includes('/*CSS*/') || !tpl.includes('/*JS*/') || !tpl.includes('<!--LICENSES-->')) throw new Error('index.html is missing a placeholder');
// Function replacements: the bundle is full of "$" sequences that a string replacement would expand
const html = tpl
  .replace('/*CSS*/', () => css)
  .replace('/*JS*/', () => js)
  .replace('<!--LICENSES-->', () => legal);

await writeFile(out, html);
console.log('wrote ' + path.relative(process.cwd(), out) + ' (' + Math.round(html.length / 1024) + ' KB, ' + pkgCount + ' packages)');

/* ---------- The live pages (sites/) ---------- */

const sites = path.resolve(here, '..', 'sites');
await mkdir(path.join(sites, '_site'), { recursive: true });
await mkdir(path.join(sites, 'api'), { recursive: true });

// The browser script: takes over the server's HTML (motion, the scroll story, the chat)
const client = await build({
  entryPoints: [path.join(here, 'src', 'site', 'client.jsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'empty' },
  write: false,
  metafile: true,
  legalComments: 'none',
  logLevel: 'warning',
});
const clientJs = '/*! Third-party licenses: /_site/LICENSES.txt */\n' + client.outputFiles[0].text;
const hash = createHash('sha256').update(clientJs).digest('hex').slice(0, 10);
const scriptName = 'site.' + hash + '.js';
for (const f of await readdir(path.join(sites, '_site'))) {
  if (/^site\.[0-9a-f]+\.js$/.test(f) && f !== scriptName) await unlink(path.join(sites, '_site', f));
}
await writeFile(path.join(sites, '_site', scriptName), clientJs);

// The page styles, inlined into every live page
const siteCss = (await transform(await readFile(path.join(here, 'src', 'blocks.css'), 'utf8'), { loader: 'css', minify: true })).code.trim();
if (/<\/style/i.test(siteCss)) throw new Error('blocks.css contains "</style"');

// The server: one Vercel Function for every address (sites/vercel.json sends them all to it)
const server = await build({
  entryPoints: [path.join(here, 'src', 'site', 'server.jsx')],
  bundle: true,
  minify: true,
  platform: 'node',
  format: 'esm',
  target: ['node20'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', __SITE_CSS__: JSON.stringify(siteCss), __SITE_JS__: JSON.stringify('/_site/' + scriptName) },
  loader: { '.css': 'empty' },
  // React's server code is CommonJS and asks for Node's own modules with require()
  banner: { js: "/*! Built from builder-src/src/site/server.jsx. Third-party licenses: /_site/LICENSES.txt */\nimport { createRequire as __sbRequire } from 'node:module';\nconst require = __sbRequire(import.meta.url);" },
  write: false,
  metafile: true,
  legalComments: 'none',
  logLevel: 'warning',
});
await writeFile(path.join(sites, 'api', 'page.mjs'), server.outputFiles[0].text);

const siteLegal = await licensesOf(client.metafile, server.metafile);
await writeFile(path.join(sites, '_site', 'LICENSES.txt'), 'Third-party code in the live pages\' script and server:\n\n' + siteLegal.notices.join('\n\n====\n\n') + '\n');
console.log('wrote sites/_site/' + scriptName + ' (' + Math.round(clientJs.length / 1024) + ' KB) and sites/api/page.mjs (' + Math.round(server.outputFiles[0].text.length / 1024) + ' KB, ' + siteLegal.count + ' packages)');
