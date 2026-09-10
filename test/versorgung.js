/* Der Zenturio trägt das Feldzeichen: An ihm und an allem, was über eine
   lückenlose Kette an ihm hängt, darf ausgebildet werden – auch wenn die
   Verbindung zum eigenen Königs-Turm längst gerissen ist.
   Geprüft werden beide Zuggeneratoren. Aufruf: node test/versorgung.js */
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

/* Rechteckiges Grasbrett, groß genug für zwei weit getrennte Lager */
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
function stelle(board, q, r, typ, spieler) {
  board.cells[H.key(q, r)].piece = { type: typ, owner: spieler, facing: 0 };
}
function zustand(board, holz) {
  var st = G.create(['Eins', 'Zwei'], [null, null]);
  st.board = board;
  st.phase = 'play';
  st.current = 0;
  st.players[0].wood = holz === undefined ? 5 : holz;
  return st;
}
function felder(st, p) {
  return M.trainingSpots(st.board, p).map(function (c) { return H.key(c.q, c.r); }).sort();
}
/* Dieselbe Frage an den kompakten Generator der KI */
function kiFelder(st, p) {
  var s = AI.snapshot(st), zent = -1;
  for (var i = 0; i < s.n; i++) if (s.po[i] === p && s.pt[i] === AI.T.zenturio) zent = i;
  return AI.clusterSpots(s, p, [], zent)
    .map(function (i) { return s.geo.keys[i]; }).sort();
}
function beideEinig(st, name) {
  var a = felder(st, 0).join(' '), b = kiFelder(st, 0).join(' ');
  ok(a === b, name + (a === b ? '' : '\n       Regelwerk ' + a + '\n       KI        ' + b));
}

/* Lager weit auseinander: Turm links bei (0,0), Zenturio rechts bei (8,0).
   Zwischen ihnen liegen leere Felder, die Kette ist also gerissen. */
console.log('Der Zenturio versorgt sein eigenes Lager');
var b1 = brett(12, 3);
stelle(b1, 0, 0, 'king', 0);
stelle(b1, 8, 0, 'zenturio', 0);
var st1 = zustand(b1);
var f1 = felder(st1, 0);
ok(f1.indexOf('9,0') >= 0, 'neben dem Zenturio darf ausgebildet werden');
ok(f1.indexOf('1,0') >= 0, 'neben dem Turm weiterhin auch');
ok(f1.indexOf('5,0') < 0, 'im Niemandsland dazwischen nicht');
beideEinig(st1, 'KI und Regelwerk nennen dieselben Felder');

console.log('\nWas am Zenturio hängt, ist mitversorgt');
var b2 = brett(12, 3);
stelle(b2, 0, 0, 'king', 0);
stelle(b2, 8, 0, 'zenturio', 0);
stelle(b2, 9, 0, 'samurai', 0);      // hängt am Zenturio
var st2 = zustand(b2);
var f2 = felder(st2, 0);
ok(f2.indexOf('10,0') >= 0, 'auch hinter der angehängten Figur');
beideEinig(st2, 'KI und Regelwerk nennen dieselben Felder');

console.log('\nOhne Zenturio bleibt das Feld unversorgt');
var b3 = brett(12, 3);
stelle(b3, 0, 0, 'king', 0);
stelle(b3, 8, 0, 'archer', 0);       // dieselbe Stelle, aber kein Feldzeichen
var st3 = zustand(b3);
var f3 = felder(st3, 0);
ok(f3.indexOf('9,0') < 0, 'neben der abgeschnittenen Figur darf nicht ausgebildet werden');
beideEinig(st3, 'KI und Regelwerk nennen dieselben Felder');

console.log('\nDer Zenturio des Gegners hilft nicht');
var b4 = brett(12, 3);
stelle(b4, 0, 0, 'king', 0);
stelle(b4, 8, 0, 'zenturio', 1);     // gehört dem Gegner
stelle(b4, 5, 3, 'king', 1);
var st4 = zustand(b4);
ok(felder(st4, 0).indexOf('9,0') < 0, 'fremdes Feldzeichen versorgt nicht');
beideEinig(st4, 'KI und Regelwerk nennen dieselben Felder');

console.log('\nAusbilden am Feldzeichen wird auch wirklich ausgeführt');
var st5 = zustand(brett(12, 3), 1);
stelle(st5.board, 0, 0, 'king', 0);
stelle(st5.board, 8, 0, 'zenturio', 0);
stelle(st5.board, 5, 3, 'king', 1);
ok(G.train(st5, 'worker', 9, 0), 'der Arbeiter darf am Zenturio entstehen');
var neu = st5.board.cells[H.key(9, 0)].piece;
ok(!!neu && neu.type === 'worker' && neu.owner === 0, 'er steht auf dem Feld');
ok(st5.players[0].wood === 0, 'und hat sein Holz gekostet');

console.log('\nFällt das Feldzeichen, ist der Nachschub weg');
var b6 = brett(12, 3);
stelle(b6, 0, 0, 'king', 0);
stelle(b6, 8, 0, 'zenturio', 0);
var st6 = zustand(b6);
ok(felder(st6, 0).indexOf('9,0') >= 0, 'mit Zenturio versorgt');
b6.cells[H.key(8, 0)].piece = null;          // geschlagen
ok(felder(st6, 0).indexOf('9,0') < 0, 'ohne ihn nicht mehr');

console.log(fehler ? '\n' + fehler + ' Prüfung(en) fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
