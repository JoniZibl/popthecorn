/**
 * Bundles POPCORE into one self-contained HTML file.
 *
 * The multi-file version in this repo is the source of truth; this just inlines
 * the CSS and scripts (in load order) so the game can be dropped anywhere that
 * only takes a single page.
 *
 *   node build.js [output.html]
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = process.argv[2] || path.join(ROOT, 'dist', 'popcore.html');

const SCRIPTS = ['config', 'sim', 'fx', 'audio', 'render', 'ui', 'save', 'main']
  .map(name => path.join('js', name + '.js'));

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').trimEnd();

// The markup between <body> and the script tags, lifted from index.html so the
// two versions cannot drift.
const html = read('index.html');
const body = html.slice(html.indexOf('<div id="app">'), html.indexOf('<script'));

const page = `<title>POPCORE</title>
<style>
${read('css/style.css')}
</style>

${body.trim()}

${SCRIPTS.map(f => `<script>\n${read(f)}\n</script>`).join('\n\n')}
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page);
console.log(`wrote ${OUT} (${(page.length / 1024).toFixed(1)} kB)`);
