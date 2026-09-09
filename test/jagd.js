/* Turm-Jagd: ein Gegner, der stur mit allem auf den Königs-Turm der KI zuläuft
   und ihn schlägt, sobald er kann. Genau so verliert eine KI, die den Angriff
   erst bemerkt, wenn er schon da ist.
   Aufruf: node test/jagd.js [Partien] [Stufe] */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
var AI = require('../js/ai.js');
var H = Hex, B = Board, M = Moves, G = Game;

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function kingCell(state, p) {
  var k = null;
  state.board.keys.forEach(function (key) {
    var c = state.board.cells[key];
    if (c.piece && c.piece.type === 'king' && c.piece.owner === p) k = c;
  });
  return k;
}

/* Jäger: schlägt den Turm, wenn möglich; sonst zieht er alles darauf zu. */
function hunterStep(state, me, victim) {
  if (state.pending) { G.endPending(state); return true; }
  var target = kingCell(state, victim);
  if (!target) { G.pass(state); return true; }

  var best = null, bestScore = 1e9;
  state.board.keys.forEach(function (key) {
    var c = state.board.cells[key];
    if (!c.piece || c.piece.owner !== me) return;
    G.actionsFor(state, c).forEach(function (a) {
      if ((a.kind === 'capture' || a.kind === 'shoot') && a.q === target.q && a.r === target.r) {
        best = { from: key, a: a }; bestScore = -1000;    // Turm schlagen!
        return;
      }
      if (bestScore === -1000) return;
      var d = H.distance({ q: a.q, r: a.r }, target);
      // Arbeiter bevorzugt, Ernten leicht belohnen (Holz für Nachschub)
      var score = d * 10 + (c.piece.type === 'worker' ? 0 : 4) - (a.kind === 'harvest' ? 3 : 0);
      if (score < bestScore) { bestScore = score; best = { from: key, a: a }; }
    });
  });

  // gelegentlich ausbilden, damit der Jäger nicht verhungert
  if (state.players[me].wood >= 1 && Math.random() < 0.25) {
    var spots = M.trainingSpots(state.board, me);
    var ids = M.affordableUnits(state, me);
    if (spots.length && ids.length) {
      var sp = spots.reduce(function (a, b) {
        return H.distance(b, target) < H.distance(a, target) ? b : a;
      });
      if (G.train(state, ids[ids.length - 1], sp.q, sp.r)) {
        if (state.pending) G.endPending(state);
        return true;
      }
    }
  }
  if (!best) { G.pass(state); return true; }
  G.perform(state, state.board.cells[best.from], best.a);
  if (state.pending) G.endPending(state);
  return true;
}

function randomSetup(state, p) {
  var cells = state.board.keys.map(function (k) { return state.board.cells[k]; });
  if (state.phase === 'trees') { var f = cells.filter(B.isFree); var c = pick(f); return G.placeTree(state, c.q, c.r); }
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

var games = +(process.argv[2] || 6);
var level = process.argv[3] || 'normal';
var aiLost = 0, hunterLost = 0, offen = 0;

for (var g = 0; g < games; g++) {
  var state = G.create(['KI', 'Jaeger'], [level, null]);
  var guard = 0;
  while (state.phase !== 'play' && guard++ < 400) {
    if (state.players[state.current].ai) { if (!AI.step(state, level)) randomSetup(state, state.current); }
    else if (!randomSetup(state, state.current)) break;
  }
  if (state.phase !== 'play') continue;
  var steps = 0, trace = [];
  while (state.phase === 'play' && steps++ < 400) {
    if (state.players[state.current].ai) {
      var d = AI.chooseMove(state, 0, level);
      if (d) {
        var kc = kingCell(state, 0);
        var foe = 99;
        state.board.keys.forEach(function (k) {
          var c = state.board.cells[k];
          if (c.piece && c.piece.owner === 1 && kc) foe = Math.min(foe, H.distance(c, kc));
        });
        trace.push('Wert ' + Math.round(d.score) + ' T' + d.depth +
                   ' | Holz ' + state.players[0].wood + ' | Feind ' + foe + ' Felder vom Turm' +
                   ' | ' + d.kind + ' ' + (d.action || d.type || ''));
        if (!AI.playMove(state, d)) G.pass(state);
      } else G.pass(state);
    } else hunterStep(state, 1, 0);
  }
  if (state.players[0].eliminated) {
    aiLost++;
    console.log('  Partie ' + (g + 1) + ': KI-Turm gefallen nach ' + steps + ' Zügen');
    trace.slice(-8).forEach(function (t) { console.log('      ' + t); });
  } else if (state.players[1].eliminated) hunterLost++;
  else offen++;
}
/* Ein einzelner Verlust kann an der Startstellung liegen: Stehen die Türme eng
   beieinander und die KI zieht als Zweite ohne Holz, ist die Partie nicht mehr
   zu halten. Erst eine Quote darüber ist ein echter Rückschritt – wer den Turm
   aus eigenem Zutun hergibt, fällt ohnehin in test/blunder.js auf.
   Für eine belastbare Aussage mindestens 12 Partien spielen. */
var quote = games ? aiLost / games : 0;
var grenze = 0.10;

console.log('\nStufe ' + level + ' gegen den Turm-Jäger, ' + games + ' Partien');
console.log('  KI verloren: ' + aiLost + ' (' + Math.round(quote * 100) + '%)' +
            ' | Jäger verloren: ' + hunterLost + ' | offen: ' + offen);
if (games < 12) console.log('  Hinweis: unter 12 Partien schwankt das Ergebnis stark.');
if (quote > grenze) {
  console.log('\nFEHLER: Die KI gibt ihren Königs-Turm zu oft her (über ' +
              Math.round(grenze * 100) + '%).');
  process.exit(1);
}
console.log('Der Turm hat gehalten.');
