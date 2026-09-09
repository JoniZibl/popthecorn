/* Spielstärke messen: KI gegen Zufall und KI gegen KI, komplette Partien
   über die echte Spiel-API. Aufruf: node test/kispiel.js [Partien] */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
var AI = require('../js/ai.js');
var H = Hex, B = Board, M = Moves, G = Game;

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

/* Zufallsspieler: gültige Züge, aber ohne Plan */
function randomStep(state) {
  var p = state.current;
  if (state.phase === 'trees') {
    var free = B.landCells(state.board).filter(B.isFree);
    if (!free.length) return false;
    var c = pick(free); return G.placeTree(state, c.q, c.r);
  }
  if (state.phase === 'kings') {
    var cells = state.board.keys.map(function (k) { return state.board.cells[k]; });
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
  var spots = M.trainingSpots(state.board, p);
  M.affordableUnits(state, p).forEach(function (id) {
    spots.forEach(function (sp) { opts.push({ train: id, sp: sp }); });
  });
  if (!opts.length) { G.pass(state); return true; }
  var o = pick(opts);
  if (o.train) G.train(state, o.train, o.sp.q, o.sp.r);
  else G.perform(state, o.c, o.a);
  return true;
}

function play(kinds, maxSteps) {
  var names = kinds.map(function (k, i) { return (k.ai ? 'KI-' + k.ai : 'Zufall') + (i + 1); });
  var state = G.create(names);
  var steps = 0, thinkMs = 0, thinkCount = 0, depthSum = 0;
  while (state.phase !== 'over' && steps++ < maxSteps) {
    var k = kinds[state.current];
    var before = state.current, phase = state.phase;
    if (k.ai) {
      if (phase === 'play' && !state.pending) {
        var t0 = Date.now();
        var desc = AI.chooseMove(state, state.current, k.ai);
        thinkMs += Date.now() - t0; thinkCount++;
        if (desc) { depthSum += desc.depth; if (!AI.playMove(state, desc)) G.pass(state); }
        else G.pass(state);
      } else if (!AI.step(state, k.ai)) { randomStep(state); }
    } else if (!randomStep(state)) break;
    if (state.current === before && state.phase === phase && state.phase === 'play' && !state.pending) {
      // kein Fortschritt -> Partie abbrechen
      break;
    }
  }
  return {
    winner: state.winner, phase: state.phase, steps: steps,
    avgThink: thinkCount ? Math.round(thinkMs / thinkCount) : 0,
    avgDepth: thinkCount ? (depthSum / thinkCount).toFixed(1) : 0,
    wood: state.players.map(function (p) { return p.wood; }),
    pieces: state.players.map(function (p) { return G.pieceCount(state, p.index); })
  };
}

function series(label, kinds, games, maxSteps) {
  var wins = kinds.map(function () { return 0; }), draws = 0, think = 0, depth = 0, steps = 0;
  for (var g = 0; g < games; g++) {
    // Startspieler wechseln: Reihenfolge der Rollen tauschen
    var order = kinds.slice();
    if (g % 2) order.reverse();
    var r = play(order, maxSteps);
    think += r.avgThink; depth += parseFloat(r.avgDepth); steps += r.steps;
    if (r.winner === null) draws++;
    else {
      var role = order[r.winner];
      wins[kinds.indexOf(role)]++;
    }
  }
  console.log(label);
  kinds.forEach(function (k, i) {
    console.log('  ' + (k.ai ? 'KI ' + k.ai : 'Zufall') + ': ' + wins[i] + '/' + games + ' Siege');
  });
  console.log('  unentschieden/abgebrochen: ' + draws +
              ' | Ø Denkzeit ' + Math.round(think / games) + ' ms' +
              ' | Ø Suchtiefe ' + (depth / games).toFixed(1) +
              ' | Ø Züge ' + Math.round(steps / games));
  return wins;
}

/* Aufruf: node test/kispiel.js [Partien] [SeiteA] [SeiteB]
   Seiten: leicht | normal | stark | zufall   (ohne Angabe: Standardpaarungen) */
var games = +(process.argv[2] || 10);
var A = process.argv[3], Bx = process.argv[4];

function side(name) { return (!name || name === 'zufall') ? {} : { ai: name }; }

if (A && Bx) {
  console.log('Spielstärke-Messung, ' + games + ' Partien\n');
  series('KI ' + A + ' gegen ' + Bx, [side(A), side(Bx)], games, 1500);
} else {
  console.log('Spielstärke-Messung, ' + games + ' Partien je Paarung\n');
  series('KI (normal) gegen Zufallsspieler', [{ ai: 'normal' }, {}], games, 1500);
  console.log();
  series('KI (stark) gegen KI (leicht)', [{ ai: 'stark' }, { ai: 'leicht' }],
         Math.max(4, games / 2 | 0), 1500);
}
