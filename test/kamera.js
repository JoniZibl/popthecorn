/* Prüft die Kamera aus js/scene.js: Bleibt die Draufsicht exakt das alte,
   flache Brett? Stimmen Perspektive, Tiefensortierung und Sichtbarkeit der
   Seitenwände? Aufruf: node test/kamera.js */
var Scene = require('../js/scene.js');
var Hex = require('../js/hex.js');

var fehler = 0;
function ok(bedingung, text) {
  console.log((bedingung ? '  ok   ' : '  FEHL ') + text);
  if (!bedingung) fehler++;
}
function nah(a, b, text, eps) {
  ok(Math.abs(a - b) <= (eps || 1e-9), text + ' (' + a.toFixed(4) + ' ≈ ' + b.toFixed(4) + ')');
}

console.log('Draufsicht bleibt das flache Brett');
var oben = Scene.create(90, 0);
[[0, 0], [34, -51], [-120, 77]].forEach(function (p) {
  var q = Scene.project(oben, p[0], p[1], 0);
  nah(q.x, p[0], 'x unverändert');
  nah(q.y, p[1], 'y unverändert');
  nah(q.k, 1, 'kein Perspektivfaktor');
});
ok(!Scene.frontFacing(oben, 0, 1) && !Scene.frontFacing(oben, 0, -1),
   'von oben ist keine senkrechte Wand zu sehen');

console.log('\nDrehung');
var gedreht = Scene.create(90, 90);
var d = Scene.project(gedreht, 100, 0, 0);
nah(d.x, 0, 'gedreht: x wandert', 1e-6);
nah(d.y, 100, 'gedreht: y übernimmt', 1e-6);
ok(Scene.create(0, 359 + 5).yaw === 4, 'Gierwinkel läuft bei 360° um');

console.log('\nPerspektive in der Schrägsicht');
var schraeg = Scene.create(50, 0);
var nahPunkt = Scene.project(schraeg, 0, 300, 0);    // großes y = zur Kamera hin
var fernPunkt = Scene.project(schraeg, 0, -300, 0);
ok(nahPunkt.k > 1 && fernPunkt.k < 1, 'Nahes wird größer, Fernes kleiner');
ok(nahPunkt.depth < fernPunkt.depth, 'Tiefe wächst nach hinten');
ok(nahPunkt.y > fernPunkt.y, 'Fernes liegt höher im Bild');
var hoch = Scene.project(schraeg, 0, 0, 40);
ok(hoch.y < 0, 'Höhe hebt einen Punkt im Bild an');
ok(hoch.depth < Scene.project(schraeg, 0, 0, 0).depth, 'Höhe rückt näher an die Kamera');

console.log('\nTiefensortierung folgt der Brettebene');
var reihen = [-200, -100, 0, 100, 200].map(function (y) {
  return Scene.project(schraeg, 0, y, 0).depth;
});
var fallend = reihen.every(function (t, i) { return i === 0 || t < reihen[i - 1]; });
ok(fallend, 'Feld für Feld rückt die Reihe näher');

console.log('\nSichtbare Wände');
ok(Scene.frontFacing(schraeg, 0, 1), 'die dem Betrachter zugewandte Wand ist sichtbar');
ok(!Scene.frontFacing(schraeg, 0, -1), 'die abgewandte Wand nicht');
var halb = Scene.create(50, 180);
ok(Scene.frontFacing(halb, 0, -1) && !Scene.frontFacing(halb, 0, 1),
   'nach halber Drehung kehrt sich die Sichtbarkeit um');

console.log('\nKanten des Hexfelds passen zu den Richtungen');
/* render.js zeichnet eine Seitenwand nur dort, wo hinter der Kante kein
   Nachbar liegt. Dazu muss zu jeder Richtung die richtige Kante gehören:
   die zwischen Ecke e und e+1. Die Ecken laufen andersherum als Hex.DIRS,
   deshalb ist e = (6 − d) mod 6 – genau diese Tabelle steht in render.js. */
var EDGE_OF_DIR = [0, 5, 4, 3, 2, 1];
var ecken = Hex.corners(34);
for (var d = 0; d < 6; d++) {
  var e = EDGE_OF_DIR[d];
  var a = ecken[e], b = ecken[(e + 1) % 6];
  var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  var len = Math.hypot(mx, my);
  var dir = Hex.dirVector(d);
  nah(mx / len, dir.x, 'Kante ' + e + ' liegt am Nachbarn ' + Hex.DIR_SHORT[d] + ' (x)', 1e-9);
  nah(my / len, dir.y, 'Kante ' + e + ' liegt am Nachbarn ' + Hex.DIR_SHORT[d] + ' (y)', 1e-9);
}

console.log('\nNeigung und Licht');
ok(Scene.create(5, 0).pitch === Scene.MIN_PITCH, 'Neigung wird nach unten begrenzt');
ok(Scene.create(140, 0).pitch === Scene.MAX_PITCH, 'Neigung wird nach oben begrenzt');
var hell = Scene.light(-0.44, -0.90), dunkel = Scene.light(0.44, 0.90);
ok(hell > dunkel && dunkel > 0.5, 'zur Sonne gewandte Wände sind heller, keine ist schwarz');
ok(/^#[0-9a-f]{6}$/.test(Scene.shade('#6f5136', 1.2)), 'Aufhellen liefert eine Farbe');
ok(Scene.shade('#ffffff', 2) === '#ffffff', 'Aufhellen läuft nicht über');

console.log(fehler ? '\n' + fehler + ' Prüfung(en) fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
