/* Prüft die Rodungs-Uhr: Fällt die KI den letzten Baum nur, wenn sie die
   Wertung gewinnt? Aufruf: node test/rodung.js [Stufe] */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
var AI = require('../js/ai.js');
var H = Hex, B = Board, M = Moves, G = Game;

var level = process.argv[2] || 'normal';
var fails = 0;
function check(name, got, want) {
  if (String(got) === String(want)) console.log('  ok   ' + name);
  else { fails++; console.log('  FEHL ' + name + ': erwartet ' + want + ', erhalten ' + got); }
}

/* Stellung bauen: genau ein Baum übrig, Arbeiter daneben. */
function letzterBaum(vorsprungFuerKI) {
  for (var v = 0; v < 60; v++) {
    var st = G.create(['KI', 'Gegner'], [level, null]);
    while (st.phase !== 'play') AI.step(st, level);
    if (st.phase !== 'play') continue;

    // alle Bäume bis auf einen entfernen, der neben dem KI-Arbeiter liegt
    var arbeiter = null;
    st.board.keys.forEach(function (k) {
      var c = st.board.cells[k];
      if (c.piece && c.piece.type === 'worker' && c.piece.owner === 0) arbeiter = c;
    });
    if (!arbeiter) continue;
    var ziel = H.neighbors(arbeiter).map(function (n) { return B.at(st.board, n); })
      .filter(function (c) { return c && c.terrain === 'grass' && !c.piece; })[0];
    if (!ziel) continue;
    st.board.keys.forEach(function (k) { st.board.cells[k].tree = false; });
    ziel.tree = true;
    st.forest = 1;
    st.current = 0;
    st.sinceProgress = 0;

    // Vermögen gezielt setzen
    // maßvoller Unterschied: sonst ist die Partie schon vorher entschieden
    st.players[0].wood = vorsprungFuerKI ? 4 : 1;
    st.players[1].wood = vorsprungFuerKI ? 1 : 4;
    return { state: st, baum: H.key(ziel.q, ziel.r) };
  }
  return null;
}

/* null, wenn die Stellung ohnehin entschieden ist – dort stellt sich die Frage
   nach dem letzten Baum gar nicht. */
function faelltDenBaum(auf) {
  var d = AI.chooseMove(auf.state, 0, level);
  if (!d) return null;
  if (Math.abs(d.score) > 100000) return null;      // erzwungener Sieg oder Verlust
  return d.kind === 'act' && d.action === 'harvest' && d.toKey === auf.baum;
}

console.log('Rodungs-Uhr, Stufe ' + level);

// Führt die KI, sollte sie den letzten Baum fällen und die Wertung einleiten
var vorn = 0, vornGefaellt = 0;
for (var i = 0; i < 14; i++) {
  var a = letzterBaum(true);
  if (!a) continue;
  var r = faelltDenBaum(a);
  if (r === null) continue;                          // Stellung schon entschieden
  vorn++;
  if (r) vornGefaellt++;
}
// Liegt sie zurück, sollte sie den Baum stehen lassen
var hinten = 0, hintenGefaellt = 0;
for (var j = 0; j < 14; j++) {
  var b = letzterBaum(false);
  if (!b) continue;
  var r2 = faelltDenBaum(b);
  if (r2 === null) continue;
  hinten++;
  if (r2) hintenGefaellt++;
}

console.log('  mit Vorsprung: fällt den letzten Baum in ' + vornGefaellt + '/' + vorn + ' Stellungen');
console.log('  im Rückstand:  fällt den letzten Baum in ' + hintenGefaellt + '/' + hinten + ' Stellungen');

check('führend fällt sie eher', vornGefaellt >= hintenGefaellt, true);

/* Die Uhr selbst: läuft sie ab und wird gewertet? */
var st2 = G.create(['A', 'B']);
while (st2.phase !== 'play') AI.step(st2, 'leicht');
st2.board.keys.forEach(function (k) { st2.board.cells[k].tree = false; });
st2.forest = 0;
st2.players[0].wood = 5;
st2.players[1].wood = 1;
var runden = 0;
while (st2.phase === 'play' && runden++ < 40) {
  st2.history = {};        // sonst greift die Wiederholungsregel vor der Uhr
  G.finishTurn(st2);
}
check('Uhr beendet die Partie', st2.phase, 'over');
check('Grund ist die Rodung', /gerodet/.test(st2.endReason || ''), true);
check('es gewinnt das größere Vermögen', st2.winner, 0);
check('Schlussrunde dauert ' + G.FINAL_TURNS + ' Züge', runden <= G.FINAL_TURNS + 2, true);

/* Beute */
console.log('\nBeute beim Schlagen');
check('Arbeiter bringt 1 Holz', G.plunder('worker'), 1);
check('Zenturio bringt 2 Holz', G.plunder('zenturio'), 2);

var st3 = G.create(['A', 'B']);
while (st3.phase !== 'play') AI.step(st3, 'leicht');
var eigen = null, nachbar = null;
st3.board.keys.forEach(function (k) {
  var c = st3.board.cells[k];
  if (nachbar || !c.piece || c.piece.owner !== st3.current || c.piece.type === 'king') return;
  var frei = H.neighbors(c).map(function (n) { return B.at(st3.board, n); })
    .filter(function (x) { return x && x.terrain === 'grass' && !x.tree && !x.piece; })[0];
  if (frei) { eigen = c; nachbar = frei; }
});
check('Testaufbau gefunden', !!nachbar, true);
nachbar.piece = { type: 'zenturio', owner: st3.current === 0 ? 1 : 0, facing: 0 };
var holzVorher = st3.players[st3.current].wood;
var wer = st3.current;
var schlag = M.forPiece(st3.board, eigen, holzVorher).filter(function (a) { return a.kind === 'capture'; })[0];
G.perform(st3, eigen, schlag);
check('Zenturio geschlagen bringt 2 Holz', st3.players[wer].wood - holzVorher, 2);

console.log(fails ? '\n' + fails + ' Fehler' : '\nRodungs-Uhr und Beute verhalten sich wie gedacht.');
process.exit(fails ? 1 : 0);
