/* Beute: Wer eine Figur schlägt, erhält die Hälfte ihrer Ausbildungskosten
   als Holz zurück. Aufruf: node test/beute.js */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
var AI = require('../js/ai.js');
var H = Hex, B = Board, M = Moves, G = Game;

var fails = 0;
function check(name, got, want) {
  if (String(got) === String(want)) console.log('  ok   ' + name);
  else { fails++; console.log('  FEHL ' + name + ': erwartet ' + want + ', erhalten ' + got); }
}

console.log('Beutewerte');
check('Arbeiter (1 Holz) bringt 1', G.plunder('worker'), 1);
check('Samurai (1 Holz) bringt 1', G.plunder('samurai'), 1);
check('Springer (2 Holz) bringt 1', G.plunder('springer'), 1);
check('Zenturio (3 Holz) bringt 2', G.plunder('zenturio'), 2);
check('Königs-Turm bringt keine Beute (dafür allen Vorrat)', G.plunder('king'), 0);

/* Im echten Spielablauf */
function stellung() {
  for (var v = 0; v < 40; v++) {
    var st = G.create(['A', 'B']);
    while (st.phase !== 'play') AI.step(st, 'leicht');
    if (st.phase !== 'play') continue;
    var eigen = null, frei = null;
    st.board.keys.forEach(function (k) {
      var c = st.board.cells[k];
      if (frei || !c.piece || c.piece.owner !== st.current || c.piece.type === 'king') return;
      var f = H.neighbors(c).map(function (n) { return B.at(st.board, n); })
        .filter(function (x) { return x && x.terrain === 'grass' && !x.tree && !x.piece; })[0];
      if (f) { eigen = c; frei = f; }
    });
    if (frei) return { st: st, eigen: eigen, frei: frei };
  }
  return null;
}

console.log('\nIm Spielablauf');
var a = stellung();
check('Teststellung gefunden', !!a, true);
if (a) {
  a.frei.piece = { type: 'zenturio', owner: a.st.current === 0 ? 1 : 0, facing: 0 };
  var wer = a.st.current, vorher = a.st.players[wer].wood;
  var schlag = M.forPiece(a.st.board, a.eigen, vorher)
    .filter(function (x) { return x.kind === 'capture'; })[0];
  check('Schlagzug vorhanden', !!schlag, true);
  G.perform(a.st, a.eigen, schlag);
  check('Zenturio geschlagen bringt 2 Holz', a.st.players[wer].wood - vorher, 2);
  check('Beute steht im Verlauf',
        a.st.log.some(function (e) { return /erbeutet 2 Holz/.test(e.text); }), true);
}

/* Die KI muss die Beute in ihrer Suche mitrechnen */
console.log('\nKI rechnet die Beute mit');
var b = stellung();
if (b) {
  b.frei.piece = { type: 'zenturio', owner: b.st.current === 0 ? 1 : 0, facing: 0 };
  var s = AI.snapshot(b.st);
  var me = b.st.current;
  var vor = s.wood[me];
  var moves = []; AI.genMoves(s, me, moves, false);
  var schlagZug = moves.filter(function (mv) { return AI.mvKind(mv) === AI.KIND_CAPTURE; })[0];
  check('KI kennt den Schlagzug', !!schlagZug, true);
  if (schlagZug) {
    var u = AI.make(s, schlagZug, me);
    check('Holz nach dem Schlag gestiegen', s.wood[me] > vor, true);
    AI.unmake(s, u);
    check('Zurücknehmen stellt das Holz wieder her', s.wood[me], vor);
  }
}

console.log(fails ? '\n' + fails + ' Fehler' : '\nBeute verhält sich wie gedacht.');
process.exit(fails ? 1 : 0);
