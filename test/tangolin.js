/* Der Tangolin schlägt beim Überspringen – und darf danach weiterspringen,
   wie beim Schlagen im Damespiel. Geprüft wird das Regelwerk aus moves.js
   samt Ausführung in game.js. Aufruf: node test/tangolin.js */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
var H = Hex, B = Board, M = Moves, G = Game;

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
function sprung(acts, q, r) {
  return acts.filter(function (a) { return a.kind === 'jump' && a.q === q && a.r === r; })[0];
}

/* Richtung 0 ist Südost: (q+1, r). Zwei Schritte in dieselbe Richtung führen
   also von (0,0) über (1,0) nach (2,0). */

console.log('Ein Gegner wird übersprungen und dabei geschlagen');
var b1 = brett(6, 3);
var tang = stelle(b1, 0, 0, 'tangolin', 0);
stelle(b1, 1, 0, 'samurai', 1);
var a1 = M.forPiece(b1, tang, 0);
var s1 = sprung(a1, 2, 0);
ok(!!s1, 'der Sprung über den Gegner steht zur Wahl');
gleich('und nennt die geschlagene Figur', s1 && s1.captures, ['1,0']);

console.log('\nEigene Figuren und Bäume werden übersprungen, aber nicht geschlagen');
var b2 = brett(6, 3);
var t2 = stelle(b2, 0, 0, 'tangolin', 0);
stelle(b2, 1, 0, 'worker', 0);
feld(b2, 0, 1).tree = true;          // Richtung 5 (Süd): (q, r+1)
var a2 = M.forPiece(b2, t2, 0);
var eigener = sprung(a2, 2, 0), baum = sprung(a2, 0, 2);
ok(eigener && !eigener.captures, 'über die eigene Figur: kein Schlag');
ok(baum && !baum.captures, 'über den Baum: kein Schlag');

console.log('\nEine Kette nimmt mehrere Gegner mit');
var b3 = brett(8, 4);
var t3 = stelle(b3, 0, 0, 'tangolin', 0);
stelle(b3, 1, 0, 'samurai', 1);      // erster Sprung: (0,0) → (2,0)
stelle(b3, 3, 0, 'archer', 1);       // zweiter Sprung: (2,0) → (4,0)
stelle(b3, 5, 0, 'springer', 1);     // dritter Sprung: (4,0) → (6,0)
var a3 = M.forPiece(b3, t3, 0);
var kette = sprung(a3, 6, 0);
ok(!!kette, 'das Ende der Kette ist erreichbar');
gleich('alle drei Gegner werden geschlagen', kette && kette.captures.slice().sort(),
       ['1,0', '3,0', '5,0']);

console.log('\nEine geschlagene Figur wird nicht zweimal geschlagen');
ok(kette && kette.captures.length === new Set(kette.captures).size, 'keine Doppelung in der Liste');

console.log('\nBei mehreren Wegen zählt der mit den meisten Schlägen');
/* Ziel (2,2) ist zweimal erreichbar: über den Baum bei (1,1) – ohne Schlag –
   oder über die Gegner bei (1,0) und (2,1). */
var b4 = brett(6, 5);
var t4 = stelle(b4, 0, 0, 'tangolin', 0);
feld(b4, 1, 1).tree = true;
stelle(b4, 1, 0, 'samurai', 1);
stelle(b4, 2, 1, 'archer', 1);
var a4 = M.forPiece(b4, t4, 0);
var weg = sprung(a4, 2, 2);
ok(!!weg, 'das Ziel ist erreichbar');
ok(weg && weg.captures && weg.captures.length === 2,
   'gewählt wird der Weg mit zwei Schlägen (' + (weg && weg.captures ? weg.captures.length : 0) + ')');

console.log('\nWasser bleibt unüberwindlich');
var b5 = brett(6, 3);
var t5 = stelle(b5, 0, 0, 'tangolin', 0);
feld(b5, 1, 0).terrain = 'water';
stelle(b5, 1, 0, 'samurai', 1);      // Gegner im Boot auf dem Wasser
var a5 = M.forPiece(b5, t5, 0);
ok(!sprung(a5, 2, 0), 'über einen Gegner auf dem Wasser springt er nicht');

console.log('\nAusführen: Figuren verschwinden, Beute wird gutgeschrieben');
var state = G.create(['Eins', 'Zwei'], [null, null]);
state.board = brett(8, 4);
state.phase = 'play';
state.current = 0;
state.players[0].wood = 0;
var tg = stelle(state.board, 0, 0, 'tangolin', 0);
stelle(state.board, 1, 0, 'samurai', 1);     // Kosten 1 → Beute 1
stelle(state.board, 3, 0, 'zenturio', 1);    // Kosten 3 → Beute 2
stelle(state.board, 0, 3, 'king', 1);        // Turm abseits, damit niemand ausscheidet
stelle(state.board, 5, 3, 'king', 0);
var zug = sprung(M.forPiece(state.board, tg, 0), 4, 0);
ok(!!zug && zug.captures.length === 2, 'Kettensprung über beide Gegner gefunden');
G.perform(state, tg, zug);
ok(!feld(state.board, 1, 0).piece && !feld(state.board, 3, 0).piece,
   'beide geschlagenen Figuren sind vom Brett');
ok(!!feld(state.board, 4, 0).piece && feld(state.board, 4, 0).piece.type === 'tangolin',
   'der Tangolin steht am Ende der Kette');
gleich('Beute: 1 + 2 Holz', state.players[0].wood, 3);
ok(state.lastCaptures.length === 2, 'beide Schläge sind für die Anzeige vermerkt');

console.log('\nFällt ein Königs-Turm mitten in der Kette, scheidet sein Spieler aus');
var st2 = G.create(['Eins', 'Zwei'], [null, null]);
st2.board = brett(8, 4);
st2.phase = 'play';
st2.current = 0;
st2.players[1].wood = 5;
var tg2 = stelle(st2.board, 0, 0, 'tangolin', 0);
stelle(st2.board, 1, 0, 'king', 1);          // erster Sprung schlägt den Turm
stelle(st2.board, 3, 0, 'samurai', 1);       // stünde als Nächstes an
stelle(st2.board, 5, 3, 'king', 0);
var zug2 = sprung(M.forPiece(st2.board, tg2, 0), 4, 0);
ok(!!zug2, 'die Kette über Turm und Samurai steht zur Wahl');
G.perform(st2, tg2, zug2);
ok(st2.players[1].eliminated, 'Spieler Zwei ist ausgeschieden');
ok(!feld(st2.board, 3, 0).piece, 'seine übrigen Figuren sind mit vom Brett');
ok(st2.players[0].wood >= 5, 'sein Holz ist erbeutet (' + st2.players[0].wood + ')');

console.log(fehler ? '\n' + fehler + ' Prüfung(en) fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
