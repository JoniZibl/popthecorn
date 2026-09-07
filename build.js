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

const GAMES = {
  popcore: {
    dir: '.',
    title: 'POPCORE',
    scripts: ['config', 'cards', 'meta', 'sim', 'fx', 'audio', 'render', 'ui', 'save', 'main']
  },
  lastkeep: {
    dir: 'siege',
    title: 'LAST KEEP',
    scripts: ['content', 'meta', 'sim', 'fx', 'audio', 'render', 'ui', 'save', 'main']
  }
};

const which = process.argv[2] || 'popcore';
const out = process.argv[3] || path.join(ROOT, 'dist', which + '.html');
const game = GAMES[which];

if (!game) {
  console.error(`unknown game "${which}" — expected one of ${Object.keys(GAMES).join(', ')}`);
  process.exit(1);
}

const read = rel => fs.readFileSync(path.join(ROOT, game.dir, rel), 'utf8').trimEnd();

// The markup between <body> and the script tags, lifted from index.html so the
// bundled and multi-file versions cannot drift.
const html = read('index.html');
const body = html.slice(html.indexOf('<div id="app">'), html.indexOf('<script'));

const page = `<title>${game.title}</title>
<style>
${read('css/style.css')}
</style>

${body.trim()}

${game.scripts.map(n => `<script>\n${read(path.join('js', n + '.js'))}\n</script>`).join('\n\n')}
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(1)} kB)`);
