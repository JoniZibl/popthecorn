/* Jede Partie muss enden – und zwar mit genau einem Sieger.
   Prüft auf Endlosschleifen, Stellungswiederholung und die Wertung.
   Aufruf: node test/entscheidung.js [Partien] [SeiteA] [SeiteB] */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
var AI = require('../js/ai.js');
var H = Hex, B = Board, M = Moves, G = Game;

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function randomStep(state) {
  var p = state.current;
  var cells = state.board.keys.map(function (k) { return state.board.cells[k]; });
  if (state.phase === 'trees') {
    var f = cells.filter(B.isFree);
    if (!f.length) return false;
    var c = pick(f); return G.placeTree(state, c.q, c.r);
  }
  if (state.phase === 'kings') {
    if (state.awaitWorker) {
      var w = cells.filter(function (c) {
        return B.isFree(c) && H.neighbors(c).some(function (n) {
          var x = B.at(state.board, n);
          return x && x.piece && x.piece.type === 'king' && x.piece.owner === p;
        });
      });
      if (!w.length) return false;
      var wc = pick(w); return G.placeWorker(state, wc.q, wc.r);
    }
    var ks = cells.filter(function (c) { return G.canPlaceKing(state, c); });
    if (!ks.length) return false;
    var kc = pick(ks); return G.placeKing(state, kc.q, kc.r);
  }
  if (state.pending) { G.endPending(state); return true; }
  var opts = [];
  state.board.keys.forEach(function (key) {
    var c = state.board.cells[key];
    if (!c.piece || c.piece.owner !== p) return;
    G.actionsFor(state, c).forEach(function (a) { opts.push({ c: c, a: a }); });
  });
  M.trainingSpots(state.board, p).forEach(function (sp) {
    M.affordableUnits(state, p).forEach(function (id) { opts.push({ train: id, sp: sp }); });
  });
  if (!opts.length) { G.pass(state); return true; }
  var o = pick(opts);
  if (o.train) G.train(state, o.train, o.sp.q, o.sp.r);
  else G.perform(state, o.c, o.a);
  return true;
}

var games = +(process.argv[2] || 8);
var A = process.argv[3] || 'normal';
var Bx = process.argv[4] || 'normal';
var kinds = [A === 'zufall' ? null : A, Bx === 'zufall' ? null : Bx];

var offen = 0, sieger = 0, ohneSieger = 0, gruende = {}, laengen = [];
var HARTE_GRENZE = 3000;   // weit jenseits jeder regulaeren Partie

for (var g = 0; g < games; g++) {
  var state = G.create(['A', 'B'], kinds);
  var steps = 0;
  while (state.phase !== 'over' && steps++ < HARTE_GRENZE) {
    var lvl = state.players[state.current].ai;
    if (lvl) { if (!AI.step(state, lvl)) randomStep(state); }
    else if (!randomStep(state)) break;
  }
  laengen.push(steps);
  if (state.phase !== 'over') {
    offen++;
    console.log('  Partie ' + (g + 1) + ': nach ' + steps + ' Zügen NICHT beendet!');
  } else if (state.winner === null) {
    ohneSieger++;
    console.log('  Partie ' + (g + 1) + ': beendet, aber ohne Sieger!');
  } else {
    sieger++;
    var grund = state.endReason || 'Königs-Turm geschlagen';
    gruende[grund] = (gruende[grund] || 0) + 1;
  }
}

laengen.sort(function (a, b) { return a - b; });
console.log('\n' + A + ' gegen ' + Bx + ', ' + games + ' Partien');
console.log('  mit Sieger beendet: ' + sieger + ' | ohne Sieger: ' + ohneSieger +
            ' | nicht beendet: ' + offen);
console.log('  Zuglänge: kürzeste ' + laengen[0] + ', mittlere ' +
            laengen[Math.floor(laengen.length / 2)] + ', längste ' + laengen[laengen.length - 1]);
Object.keys(gruende).forEach(function (k) { console.log('  Ende durch: ' + k + ' (' + gruende[k] + '×)'); });

if (offen || ohneSieger) {
  console.log('\nFEHLER: Es muss immer genau einen Sieger geben.');
  process.exit(1);
}
console.log('Jede Partie hatte genau einen Sieger.');
