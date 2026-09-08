/* Baut aus index.html eine einzelne, in sich geschlossene HTML-Datei.
   Verwendung: node build.js  →  dist/hexodus.html
   Die Datei enthält CSS und JavaScript inline und läuft ohne Server. */
var fs = require('fs');
var path = require('path');

var root = __dirname;
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function guard(js) { return js.replace(/<\/script/gi, '<\\/script'); }

// Stylesheet einsammeln
var cssFiles = [];
html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">\n?/g, function (m, href) {
  cssFiles.push(href);
  return '';
});

// Skripte einsammeln
var jsFiles = [];
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, function (m, src) {
  jsFiles.push(src);
  return '';
});

// Rumpf zwischen <body> und </body> herauslösen
var body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')).trim();

var head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
var title = (/<title>([^<]*)<\/title>/.exec(head) || [, 'Hexodus'])[1];
var desc = (/<meta name="description" content="([^"]*)"/.exec(head) || [, ''])[1];

var out = '<title>' + title + '</title>\n' +
  (desc ? '<meta name="description" content="' + desc + '">\n' : '') +
  '<style>\n' + cssFiles.map(read).join('\n') + '\n</style>\n\n' +
  body + '\n\n' +
  jsFiles.map(function (f) {
    return '<script>\n/* ' + f + ' */\n' + guard(read(f)) + '\n</script>';
  }).join('\n');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'hexodus.html'), out);
console.log('dist/hexodus.html geschrieben –',
  (Buffer.byteLength(out) / 1024).toFixed(1), 'KB,',
  cssFiles.length, 'CSS +', jsFiles.length, 'JS eingebettet');
