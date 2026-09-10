/* Der Tangolin springt über Bäume und über Figuren der eigenen Seite – nie über
   einen Gegner. Landen darf er dagegen auf dem Gegner: Der fällt dabei, und der
   Sprung geht weiter. Und er darf ins Wasser springen, wenn er sich dort ein
   Boot leistet – so oft, wie das Holz reicht.
   Geprüft werden Regelwerk (moves.js), Ausführung (game.js) und der eigene
   Zuggenerator der KI. Aufruf: node test/tangolin.js */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
global.AI = require('../js/ai.js');
var H = Hex, M = Moves, G = Game;

var fehler = 0;
function ok(bedingung, text) {
  console.log((bedingung ? '  ok   ' : '  FEHL ') + text);
  if (!bedingung) fehler++;
}
function gleich(name, got, want) {
  var a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log('  ok   ' + name);
  else { fehler++; console.log('  FEHL ' + name + '\n       erwartet ' + b + '\n       erhalten ' + a); }
}

/* Ein rechteckiges Testbrett aus Grasfeldern, groß genug für lange Ketten */
function brett(breite, hoehe) {
  var cells = {}, keys = [];
  for (var q = -1; q <= breite; q++) {
    for (var r = -1; r <= hoehe; r++) {
      var k = H.key(q, r);
      cells[k] = { q: q, r: r, terrain: 'grass', tree: false, boat: false, piece: null };
      keys.push(k);
    }
  }
  return { cells: cells, keys: keys };
}
function feld(board, q, r) { return board.cells[H.key(q, r)]; }
function stelle(board, q, r, typ, spieler) {
  feld(board, q, r).piece = { type: typ, owner: spieler, facing: 0 };
  return feld(board, q, r);
}
function wasser(board, q, r) { feld(board, q, r).terrain = 'water'; return feld(board, q, r); }
function sprung(acts, q, r) {
  return acts.filter(function (a) { return a.kind === 'jump' && a.q === q && a.r === r; })[0];
}
function schlag(acts, q, r) {
  return acts.filter(function (a) { return a.kind === 'capture' && a.q === q && a.r === r; })[0];
}
function partie(board, holz) {
  var st = G.create(['Eins', 'Zwei'], [null, null]);
  st.board = board;
  st.phase = 'play';
  st.current = 0;
  st.players[0].wood = holz === undefined ? 0 : holz;
  return st;
}

/* Richtung 0 ist Südost: (q+1, r). Zwei Schritte in dieselbe Richtung führen
   also von (0,0) über (1,0) nach (2,0). */

console.log('Über einen Gegner springt der Tangolin nicht');
var b1 = brett(6, 3);
var t1 = stelle(b1, 0, 0, 'tangolin', 0);
stelle(b1, 1, 0, 'samurai', 1);
var a1 = M.forPiece(b1, t1, 0);
ok(!sprung(a1, 2, 0), 'das Feld hinter dem Gegner ist nicht erreichbar');
ok(!!schlag(a1, 1, 0), 'den Gegner nebenan schlägt er aber');

console.log('\nEigene Figuren und Bäume sind Sprungbretter');
var b2 = brett(6, 3);
var t2 = stelle(b2, 0, 0, 'tangolin', 0);
stelle(b2, 1, 0, 'worker', 0);
feld(b2, 0, 1).tree = true;          // Richtung 5 (Süd): (q, r+1)
var a2 = M.forPiece(b2, t2, 0);
ok(!!sprung(a2, 2, 0), 'über die eigene Figur geht es weiter');
ok(!!sprung(a2, 0, 2), 'über den Baum ebenso');

console.log('\nAuf dem Gegner landet er – und schlägt ihn');
var b3 = brett(8, 4);
var t3 = stelle(b3, 0, 0, 'tangolin', 0);
stelle(b3, 1, 0, 'worker', 0);       // Sprungbrett
stelle(b3, 2, 0, 'archer', 1);       // Landefeld: Gegner
var s3 = sprung(M.forPiece(b3, t3, 0), 2, 0);
ok(!!s3, 'der Sprung auf den Gegner steht zur Wahl');
gleich('und nennt ihn als Beute', s3 && s3.captures, ['2,0']);

console.log('\nEine Kette nimmt mehrere Gegner mit');
var b4 = brett(10, 4);
var t4 = stelle(b4, 0, 0, 'tangolin', 0);
feld(b4, 1, 0).tree = true;          // Sprung 1: (0,0) → (2,0)
stelle(b4, 2, 0, 'samurai', 1);      // dort steht der erste Gegner
stelle(b4, 3, 0, 'worker', 0);       // Sprung 2: (2,0) → (4,0)
stelle(b4, 4, 0, 'springer', 1);     // dort der zweite
var kette = sprung(M.forPiece(b4, t4, 0), 4, 0);
ok(!!kette, 'das Ende der Kette ist erreichbar');
gleich('beide Gegner fallen', kette && kette.captures.slice().sort(), ['2,0', '4,0']);
gleich('der Weg nennt beide Landungen', kette && kette.path, ['2,0', '4,0']);

console.log('\nAuf der eigenen Seite landet er nicht');
var b5 = brett(6, 3);
var t5 = stelle(b5, 0, 0, 'tangolin', 0);
stelle(b5, 1, 0, 'worker', 0);
stelle(b5, 2, 0, 'legionaer', 0);    // eigenes Landefeld
ok(!sprung(M.forPiece(b5, t5, 0), 2, 0), 'das eigene Landefeld ist belegt');

console.log('\nIns Wasser springt er, wenn er ein Boot bezahlt');
var b6 = brett(6, 3);
var t6 = stelle(b6, 0, 0, 'tangolin', 0);
feld(b6, 1, 0).tree = true;
wasser(b6, 2, 0);
ok(!sprung(M.forPiece(b6, t6, 0), 2, 0), 'ohne Holz geht es nicht');
var s6 = sprung(M.forPiece(b6, t6, 1), 2, 0);
ok(!!s6, 'mit einem Holz schon');
gleich('und kostet genau ein Boot', s6 && s6.cost, 1);

console.log('\nWo schon ein Boot liegt, kostet es nichts');
var b7 = brett(6, 3);
var t7 = stelle(b7, 0, 0, 'tangolin', 0);
feld(b7, 1, 0).tree = true;
wasser(b7, 2, 0).boat = true;
var s7 = sprung(M.forPiece(b7, t7, 0), 2, 0);
ok(!!s7, 'auch ohne Holz erreichbar');
ok(s7 && !s7.cost, 'und ohne Kosten');

console.log('\nZwei Wasserlandungen kosten zwei Boote');
var b8 = brett(8, 4);
var t8 = stelle(b8, 0, 0, 'tangolin', 0);
feld(b8, 1, 0).tree = true;
wasser(b8, 2, 0);
feld(b8, 3, 0).tree = true;
wasser(b8, 4, 0);
ok(!sprung(M.forPiece(b8, t8, 1), 4, 0), 'mit einem Holz reicht es nicht bis hinten');
var s8 = sprung(M.forPiece(b8, t8, 2), 4, 0);
ok(!!s8, 'mit zwei Holz schon');
gleich('zwei Boote', s8 && s8.cost, 2);

console.log('\nAusführen: Beute, Boote und Holz stimmen');
var b9 = brett(10, 4);
var st9 = partie(b9, 2);
var t9 = stelle(b9, 0, 0, 'tangolin', 0);
feld(b9, 1, 0).tree = true;
wasser(b9, 2, 0);                    // erste Landung: Wasser, kostet 1
stelle(b9, 3, 0, 'worker', 0);       // Sprungbrett
stelle(b9, 4, 0, 'archer', 1);       // zweite Landung: Gegner (Kosten 2 Holz → Beute 1)
stelle(b9, 0, 3, 'king', 1);
stelle(b9, 7, 3, 'king', 0);
var zug9 = sprung(M.forPiece(b9, t9, st9.players[0].wood), 4, 0);
ok(!!zug9, 'der Weg über Wasser auf den Gegner steht zur Wahl');
gleich('ein Boot', zug9 && zug9.cost, 1);
gleich('ein Schlag', zug9 && zug9.captures, ['4,0']);
G.perform(st9, t9, zug9);
ok(feld(b9, 2, 0).boat, 'auf der Wasserlandung liegt jetzt ein Boot');
ok(!feld(b9, 4, 0).piece || feld(b9, 4, 0).piece.type === 'tangolin',
   'der geschlagene Bogenschütze ist weg');
ok(feld(b9, 4, 0).piece && feld(b9, 4, 0).piece.type === 'tangolin',
   'der Tangolin steht am Ende der Kette');
gleich('2 Holz minus 1 Boot plus 1 Beute', st9.players[0].wood, 2);

console.log('\nEin Sprung über einen Verbündeten im Boot ist erlaubt');
var b10 = brett(6, 3);
b10.teams = [0, 0];
var t10 = stelle(b10, 0, 0, 'tangolin', 0);
wasser(b10, 1, 0).boat = true;
stelle(b10, 1, 0, 'samurai', 1);     // Verbündeter im Boot als Sprungbrett
ok(!!sprung(M.forPiece(b10, t10, 0), 2, 0), 'über ihn hinweg an Land');

console.log('\nFällt ein Königs-Turm mitten in der Kette, scheidet sein Spieler aus');
var b11 = brett(10, 4);
var st11 = partie(b11, 0);
st11.players[1].wood = 4;
var t11 = stelle(b11, 0, 0, 'tangolin', 0);
feld(b11, 1, 0).tree = true;
stelle(b11, 2, 0, 'king', 1);        // erste Landung schlägt den Turm
stelle(b11, 3, 0, 'worker', 0);
stelle(b11, 4, 0, 'samurai', 1);     // stünde als Nächstes an
stelle(b11, 7, 3, 'king', 0);
var zug11 = sprung(M.forPiece(b11, t11, 0), 4, 0);
ok(!!zug11, 'die Kette über Turm und Samurai steht zur Wahl');
G.perform(st11, t11, zug11);
ok(st11.players[1].eliminated, 'Spieler Zwei ist ausgeschieden');
ok(!feld(b11, 4, 0).piece || feld(b11, 4, 0).piece.type === 'tangolin',
   'seine übrigen Figuren sind mit vom Brett');
ok(st11.players[0].wood >= 4, 'sein Holz ist erbeutet (' + st11.players[0].wood + ')');

console.log('\nDie KI erzeugt denselben Weg wie das Regelwerk');
var b12 = brett(10, 4);
var st12 = partie(b12, 3);
var t12 = stelle(b12, 0, 0, 'tangolin', 0);
feld(b12, 1, 0).tree = true;
wasser(b12, 2, 0);
stelle(b12, 3, 0, 'worker', 0);
stelle(b12, 4, 0, 'archer', 1);
stelle(b12, 0, 3, 'king', 1);
stelle(b12, 7, 3, 'king', 0);
var regel = M.forPiece(b12, t12, 3).filter(function (a) { return a.kind === 'jump'; })
  .map(function (a) {
    return a.q + ',' + a.r + '|' + ((a.captures || []).slice().sort().join('+')) + '|' + (a.cost || 0);
  }).sort();
var s12 = AI.snapshot(st12), out12 = [];
AI.genMoves(s12, 0, out12, false);
var ki = out12.filter(function (mv) { return AI.mvKind(mv) === AI.KIND_CHAIN; })
  .map(function (mv) {
    var von = AI.mvFrom(mv), nach = AI.mvTo(mv);
    var plan = AI.chainPlanFor(s12, von, nach, 0);
    return s12.geo.keys[nach] + '|' +
      plan.caps.map(function (i) { return s12.geo.keys[i]; }).sort().join('+') + '|' + plan.cost;
  }).sort();
gleich('gleiche Ziele, gleiche Beute, gleiche Kosten', ki, regel);

console.log('\nGeschlagen wird auch weiter beim Zug auf das Nachbarfeld');
var b13 = brett(8, 4);
var st13 = partie(b13, 0);
var t13 = stelle(b13, 0, 0, 'tangolin', 0);
stelle(b13, 1, 0, 'zenturio', 1);    // Kosten 3 → Beute 2
stelle(b13, 0, 3, 'king', 1);
stelle(b13, 5, 3, 'king', 0);
var hieb = schlag(M.forPiece(b13, t13, 0), 1, 0);
ok(!!hieb, 'der Schlag auf das Nachbarfeld steht zur Wahl');
G.perform(st13, t13, hieb);
gleich('Beute: 2 Holz', st13.players[0].wood, 2);

console.log(fehler ? '\n' + fehler + ' Prüfung(en) fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
