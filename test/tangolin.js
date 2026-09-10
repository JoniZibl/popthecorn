/* Der Tangolin springt über Bäume und eigene Einheiten – nie über einen
   Gegner. Geschlagen wird nur beim normalen Zug auf ein Nachbarfeld.
   Geprüft wird das Regelwerk aus moves.js samt Ausführung in game.js.
   Aufruf: node test/tangolin.js */
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
function schlag(acts, q, r) {
  return acts.filter(function (a) { return a.kind === 'capture' && a.q === q && a.r === r; })[0];
}

/* Richtung 0 ist Südost: (q+1, r). Zwei Schritte in dieselbe Richtung führen
   also von (0,0) über (1,0) nach (2,0). */

console.log('Über einen Gegner springt der Tangolin nicht');
var b1 = brett(6, 3);
var tang = stelle(b1, 0, 0, 'tangolin', 0);
stelle(b1, 1, 0, 'samurai', 1);
var a1 = M.forPiece(b1, tang, 0);
ok(!sprung(a1, 2, 0), 'das Feld hinter dem Gegner ist nicht erreichbar');
ok(!!schlag(a1, 1, 0), 'den Gegner nebenan schlägt er aber');

console.log('\nEigene Figuren und Bäume sind Sprungbretter');
var b2 = brett(6, 3);
var t2 = stelle(b2, 0, 0, 'tangolin', 0);
stelle(b2, 1, 0, 'worker', 0);
feld(b2, 0, 1).tree = true;          // Richtung 5 (Süd): (q, r+1)
var a2 = M.forPiece(b2, t2, 0);
var eigener = sprung(a2, 2, 0), baum = sprung(a2, 0, 2);
ok(!!eigener, 'über die eigene Figur geht es weiter');
ok(!!baum, 'über den Baum ebenso');
ok(!eigener.captures && !baum.captures, 'ein Sprung schlägt nie etwas');

console.log('\nEine Kette aus eigenen Figuren trägt beliebig weit');
var b3 = brett(8, 4);
var t3 = stelle(b3, 0, 0, 'tangolin', 0);
stelle(b3, 1, 0, 'samurai', 0);      // erster Sprung: (0,0) → (2,0)
stelle(b3, 3, 0, 'archer', 0);       // zweiter Sprung: (2,0) → (4,0)
feld(b3, 5, 0).tree = true;          // dritter Sprung: (4,0) → (6,0)
var a3 = M.forPiece(b3, t3, 0);
ok(!!sprung(a3, 6, 0), 'das Ende der Kette ist erreichbar');

console.log('\nEin Gegner mitten in der Kette sperrt sie ab');
var b4 = brett(8, 4);
var t4 = stelle(b4, 0, 0, 'tangolin', 0);
stelle(b4, 1, 0, 'samurai', 0);      // erster Sprung: (0,0) → (2,0)
stelle(b4, 3, 0, 'archer', 1);       // Gegner – hier ist Schluss
feld(b4, 5, 0).tree = true;
var a4 = M.forPiece(b4, t4, 0);
ok(!!sprung(a4, 2, 0), 'bis vor den Gegner kommt er');
ok(!sprung(a4, 4, 0), 'über den Gegner hinweg nicht');
ok(!sprung(a4, 6, 0), 'und dahinter erst recht nicht');

console.log('\nBesetzte Felder sind keine Landeplätze');
var b5 = brett(6, 3);
var t5 = stelle(b5, 0, 0, 'tangolin', 0);
stelle(b5, 1, 0, 'worker', 0);
stelle(b5, 2, 0, 'legionaer', 1);    // Landefeld belegt
var a5 = M.forPiece(b5, t5, 0);
ok(!sprung(a5, 2, 0), 'auf einer gegnerischen Figur landet er nicht');

console.log('\nWasser bleibt unüberwindlich');
var b6 = brett(6, 3);
var t6 = stelle(b6, 0, 0, 'tangolin', 0);
feld(b6, 1, 0).terrain = 'water';
feld(b6, 1, 0).tree = false;
stelle(b6, 1, 0, 'samurai', 0);      // eigene Figur im Boot auf dem Wasser
var a6 = M.forPiece(b6, t6, 0);
ok(!sprung(a6, 2, 0), 'über Wasser springt er auch nicht mit Sprungbrett');

console.log('\nAusführen: der Sprung setzt um, ohne jemanden zu schlagen');
var state = G.create(['Eins', 'Zwei'], [null, null]);
state.board = brett(8, 4);
state.phase = 'play';
state.current = 0;
state.players[0].wood = 0;
var tg = stelle(state.board, 0, 0, 'tangolin', 0);
stelle(state.board, 1, 0, 'worker', 0);
stelle(state.board, 3, 0, 'samurai', 1);   // steht neben dem Landefeld
stelle(state.board, 0, 3, 'king', 1);
stelle(state.board, 5, 3, 'king', 0);
var zug = sprung(M.forPiece(state.board, tg, 0), 2, 0);
ok(!!zug, 'der Sprung über den eigenen Arbeiter steht zur Wahl');
G.perform(state, tg, zug);
ok(!!feld(state.board, 1, 0).piece, 'der übersprungene Arbeiter steht noch');
ok(!!feld(state.board, 3, 0).piece, 'der Gegner in der Nähe ebenso');
ok(!!feld(state.board, 2, 0).piece && feld(state.board, 2, 0).piece.type === 'tangolin',
   'der Tangolin steht auf dem Zielfeld');
gleich('kein Holz aus dem Sprung', state.players[0].wood, 0);
ok(!state.lastCapture, 'kein Schlag vermerkt');

console.log('\nGeschlagen wird beim Zug auf das Nachbarfeld');
var st2 = G.create(['Eins', 'Zwei'], [null, null]);
st2.board = brett(8, 4);
st2.phase = 'play';
st2.current = 0;
st2.players[0].wood = 0;
var tg2 = stelle(st2.board, 0, 0, 'tangolin', 0);
stelle(st2.board, 1, 0, 'zenturio', 1);    // Kosten 3 → Beute 2
stelle(st2.board, 0, 3, 'king', 1);
stelle(st2.board, 5, 3, 'king', 0);
var hieb = schlag(M.forPiece(st2.board, tg2, 0), 1, 0);
ok(!!hieb, 'der Schlag auf das Nachbarfeld steht zur Wahl');
G.perform(st2, tg2, hieb);
ok(feld(st2.board, 1, 0).piece.type === 'tangolin', 'er steht auf dem Feld des Geschlagenen');
gleich('Beute: 2 Holz', st2.players[0].wood, 2);

console.log(fehler ? '\n' + fehler + ' Prüfung(en) fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
