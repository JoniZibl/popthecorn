/* Baut aus index.html eine einzelne, in sich geschlossene HTML-Datei.
   Verwendung: node build.js  →  dist/hexodus.html
   Die Datei enthält CSS und JavaScript inline und läuft ohne Server. */
var fs = require('fs');
var path = require('path');

var root = __dirname;

// Reihenfolge wie in index.html – der Rechenfaden braucht sie genauso
var WORKER_MODULE = ['js/hex.js', 'js/units.js', 'js/board.js',
                     'js/moves.js', 'js/game.js', 'js/ai.js'];
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function guard(js) { return js.replace(/<\/script/gi, '<\\/script'); }

// Stylesheet einsammeln
var cssFiles = [];
html = html.replace(/[ \t]*<link rel="stylesheet" href="([^"]+)">\n?/g, function (m, href) {
  cssFiles.push(href);
  return '';
});

/* Was nur die gehostete Fassung braucht, fliegt raus: Die Einzeldatei trägt
   alles in sich und wird meist von der Festplatte geöffnet – ein Manifest oder
   ein Service Worker wären dort tote Verweise. */
html = html.replace(/[ \t]*<link [^>]*data-online-only[^>]*>\n?/g, '');
html = html.replace(/[ \t]*<script data-online-only>[\s\S]*?<\/script>\n?/g, '');

// Skripte einsammeln
var jsFiles = [];
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\n?/g, function (m, src) {
  jsFiles.push(src);
  return '';
});

// Rumpf zwischen <body> und </body> herauslösen
var body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')).trim();

/* Der Kopf wandert vollständig mit – bis auf das, was oben schon entfernt
   wurde (Stylesheet, Manifest, Service Worker). Zwei Angaben darin sind für
   eine Datei, die von der Festplatte geöffnet wird, entscheidend:

   `charset`, sonst rät der Browser die Zeichenkodierung und aus "Königs-Turm"
   wird Buchstabensalat – ein Server schickt die Kodierung mit, eine Datei
   nicht.

   `viewport`, sonst legt ein Handy die Seite in knapp tausend Punkten Breite
   aus. Die Regeln für schmale Bildschirme greifen dann nicht, und statt der
   Handy-Ansicht bekommt man die geschrumpfte Rechner-Ansicht – Knöpfe so
   klein, dass man sie nicht trifft. */
var head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>')).trim();

var out = head + '\n' +
  '<style>\n' + cssFiles.map(read).join('\n') + '\n</style>\n\n' +
  body + '\n\n' +
  jsFiles.map(function (f) {
    /* Die Bausteine, die der Computergegner braucht, bekommen ein Merkmal.
       In der Einzeldatei gibt es keine js/aiworker.js zum Laden – der
       Rechenfaden wird dort aus genau diesen eingebetteten Quelltexten
       zusammengesetzt. */
    var merkmal = WORKER_MODULE.indexOf(f) >= 0
      ? ' data-modul="' + f.replace(/^js\//, '').replace(/\.js$/, '') + '"' : '';
    return '<script' + merkmal + '>\n/* ' + f + ' */\n' + guard(read(f)) + '\n</script>';
  }).join('\n');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'hexodus.html'), out);
console.log('dist/hexodus.html geschrieben –',
  (Buffer.byteLength(out) / 1024).toFixed(1), 'KB,',
  cssFiles.length, 'CSS +', jsFiles.length, 'JS eingebettet');

// Ohne diese beiden ist die Datei am Handy unbrauchbar – lieber laut scheitern
['charset', 'viewport'].forEach(function (pflicht) {
  if (out.indexOf(pflicht) < 0) {
    console.error('FEHLT im Kopf: ' + pflicht + ' – die Einzeldatei wäre am Handy unbrauchbar.');
    process.exitCode = 1;
  }
});
