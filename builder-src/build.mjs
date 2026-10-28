// Builds ../site-builder.html, the website builder demo (#5 in CLAUDE.md).
// esbuild bundles src/main.jsx with React and Puck, then the script and styles are inlined into
// src/index.html so the app stays one static file, like the other apps in this repo.
// Run: npm install, then npm run build (from builder-src/). Never edit site-builder.html by hand.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

// The licenses of every package in the bundle (MIT asks for its notice to travel with the code)
const pkgs = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  if (m) pkgs.add(m[1]);
}
const notices = [];
for (const name of [...pkgs].sort()) {
  const dir = path.join(here, 'node_modules', name);
  const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE'].map((f) => path.join(dir, f)).find((f) => existsSync(f));
  const text = file ? (await readFile(file, 'utf8')).trim() : 'License: ' + (pkg.license || 'see package');
  notices.push(name + ' ' + pkg.version + '\n' + text);
}
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
console.log('wrote ' + path.relative(process.cwd(), out) + ' (' + Math.round(html.length / 1024) + ' KB, ' + pkgs.size + ' packages)');
