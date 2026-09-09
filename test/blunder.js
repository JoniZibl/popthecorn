/* Sucht Patzer: Lässt die KI ihren Königs-Turm im Schlagbereich stehen,
   obwohl sie ihn hätte retten können?
   Aufruf: node test/blunder.js [Partien] [Stufe] */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
var AI = require('../js/ai.js');
var H = Hex, B = Board, M = Moves, G = Game;

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

/* Kann ein Gegner den Turm von Spieler p sofort schlagen? */
function kingAttacked(state, p) {
  var king = null;
  state.board.keys.forEach(function (k) {
    var c = state.board.cells[k];
    if (c.piece && c.piece.type === 'king' && c.piece.owner === p) king = c;
  });
  if (!king) return null;
  var hit = null;
  state.board.keys.forEach(function (k) {
    if (hit) return;
    var c = state.board.cells[k];
    if (!c.piece || c.piece.owner === p || state.players[c.piece.owner].eliminated) return;
    M.forPiece(state.board, c, state.players[c.piece.owner].wood).forEach(function (a) {
      if ((a.kind === 'capture' || a.kind === 'shoot') && a.q === king.q && a.r === king.r) {
        hit = { by: c.piece.type, owner: c.piece.owner };
      }
    });
  });
  return hit;
}

/* Alle Züge des Spielers als ausführbare Beschreibungen */
function allMoves(state, p) {
  var list = [];
  state.board.keys.forEach(function (key) {
    var c = state.board.cells[key];
    if (!c.piece || c.piece.owner !== p) return;
    G.actionsFor(state, c).forEach(function (a) { list.push({ from: key, a: a }); });
  });
  M.trainingSpots(state.board, p).forEach(function (sp) {
    M.affordableUnits(state, p).forEach(function (id) { list.push({ train: id, sp: sp }); });
  });
  return list;
}

/* Gab es einen Zug, nach dem der Turm nicht mehr geschlagen werden kann? */
function safeMoveExisted(snapshotState, p) {
  var moves = allMoves(snapshotState, p);
  for (var i = 0; i < moves.length; i++) {
    var clone = JSON.parse(JSON.stringify({
      cells: snapshotState.board.cells, players: snapshotState.players,
      current: snapshotState.current, phase: snapshotState.phase
    }));
    // Zustand nachbauen
    var st = snapshotState;
    var backupCells = JSON.parse(JSON.stringify(st.board.cells));
    var backupPlayers = JSON.parse(JSON.stringify(st.players));
    var backupPhase = st.phase, backupCurrent = st.current, backupPending = st.pending;
    var ok;
    if (moves[i].train) ok = G.train(st, moves[i].train, moves[i].sp.q, moves[i].sp.r);
    else ok = G.perform(st, st.board.cells[moves[i].from], moves[i].a);
    var attacked = ok ? kingAttacked(st, p) : true;
    // zurücksetzen
    st.board.keys.forEach(function (k) { st.board.cells[k] = backupCells[k]; });
    st.players.forEach(function (pl, idx) {
      pl.wood = backupPlayers[idx].wood;
      pl.eliminated = backupPlayers[idx].eliminated;
      pl.trained = backupPlayers[idx].trained;
    });
    st.phase = backupPhase; st.current = backupCurrent; st.pending = backupPending;
    if (ok && !attacked) return true;
  }
  return false;
}

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
  var opts = allMoves(state, p);
  if (!opts.length) { G.pass(state); return true; }
  var o = pick(opts);
  if (o.train) G.train(state, o.train, o.sp.q, o.sp.r);
  else G.perform(state, state.board.cells[o.from], o.a);
  return true;
}

var games = +(process.argv[2] || 6);
var level = process.argv[3] || 'normal';
var blunders = 0, aiMoves = 0, lost = 0, checkedGames = 0;

for (var g = 0; g < games; g++) {
  var state = G.create(['KI', 'Zufall'], [level, null]);
  var guard = 0;
  while (state.phase !== 'play' && guard++ < 400) {
    if (state.players[state.current].ai) { if (!AI.step(state, level)) randomStep(state); }
    else if (!randomStep(state)) break;
  }
  if (state.phase !== 'play') continue;
  checkedGames++;
  var steps = 0;
  while (state.phase === 'play' && steps++ < 400) {
    if (state.players[state.current].ai) {
      var wasAttacked = !!kingAttacked(state, 0);
      AI.step(state, level);
      aiMoves++;
      var nowAttacked = kingAttacked(state, 0);
      if (nowAttacked && state.phase === 'play') {
        // Patzer nur, wenn es einen sicheren Zug gegeben hätte
        blunders++;
        console.log('  Turm im Schlagbereich nach KI-Zug (durch ' + nowAttacked.by +
                    ')' + (wasAttacked ? ' – stand vorher schon' : ''));
      }
    } else if (!randomStep(state)) break;
  }
  if (state.players[0].eliminated) lost++;
}

console.log('\nStufe ' + level + ': ' + checkedGames + ' Partien, ' + aiMoves + ' KI-Züge');
console.log('Turm nach eigenem Zug schlagbar: ' + blunders + '×');
console.log('Partien verloren: ' + lost + '/' + checkedGames);
