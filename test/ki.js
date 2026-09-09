/* Prüft die KI-Innereien gegen das Regelwerk:
   1. erzeugt die Suche exakt dieselben Züge wie moves.js?
   2. stellt unmake() die Stellung bitgenau wieder her? */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
var AI = require('../js/ai.js');
var H = Hex, B = Board, M = Moves, G = Game, U = Units;

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function randomPosition(playerCount, turns) {
  var names = []; for (var i = 0; i < playerCount; i++) names.push('P' + i);
  var st = G.create(names);
  G.autoPlaceTrees(st);
  var guard = 0;
  while (st.phase === 'kings' && guard++ < 300) {
    var cells = st.board.keys.map(function (k) { return st.board.cells[k]; });
    if (st.awaitWorker) {
      var w = cells.filter(function (c) {
        return B.isFree(c) && H.neighbors(c).some(function (n) {
          var x = B.at(st.board, n);
          return x && x.piece && x.piece.type === 'king' && x.piece.owner === st.current;
        });
      });
      if (!w.length) return null;
      var wc = pick(w); G.placeWorker(st, wc.q, wc.r);
    } else {
      var k = cells.filter(function (c) { return G.canPlaceKing(st, c); });
      if (!k.length) return null;
      var kc = pick(k); G.placeKing(st, kc.q, kc.r);
    }
  }
  if (st.phase !== 'play') return null;

  // ein paar Zufallszüge, damit Stellungen entstehen
  for (var t = 0; t < turns && st.phase === 'play'; t++) {
    if (st.pending) { G.endPending(st); continue; }
    var opts = [];
    st.board.keys.forEach(function (key) {
      var c = st.board.cells[key];
      if (!c.piece || c.piece.owner !== st.current) return;
      G.actionsFor(st, c).forEach(function (a) { opts.push({ c: c, a: a }); });
    });
    var spots = M.trainingSpots(st.board, st.current);
    M.affordableUnits(st, st.current).forEach(function (id) {
      spots.forEach(function (sp) { opts.push({ train: id, sp: sp }); });
    });
    if (!opts.length) { G.pass(st); continue; }
    var o = pick(opts);
    if (o.train) G.train(st, o.train, o.sp.q, o.sp.r);
    else G.perform(st, o.c, o.a);
  }
  return st.phase === 'play' ? st : null;
}

/* Züge des Regelwerks als vergleichbare Zeichenketten */
function rulesMoves(st, p) {
  var set = {};
  st.board.keys.forEach(function (key) {
    var c = st.board.cells[key];
    if (!c.piece || c.piece.owner !== p) return;
    var from = key;
    M.forPiece(st.board, c, st.players[p].wood).forEach(function (a) {
      var kind = (a.kind === 'jump') ? 'move' : a.kind;
      set[kind + '|' + from + '|' + a.q + ',' + a.r] = true;
    });
    if (U.DEFS[c.piece.type].directional) {
      for (var d = 0; d < 6; d++) if (d !== c.piece.facing) set['rotate|' + from + '|' + d] = true;
    }
  });
  M.trainingSpots(st.board, p).forEach(function (sp) {
    M.affordableUnits(st, p).forEach(function (id) {
      set['train|' + id + '|' + sp.q + ',' + sp.r] = true;
    });
  });
  return set;
}

function aiMoves(st, p) {
  var s = AI.snapshot(st), geo = s.geo, out = [];
  AI.genMoves(s, p, out, false);
  var set = {};
  out.forEach(function (mv) {
    var kind = AI.mvKind(mv), from = AI.mvFrom(mv), to = AI.mvTo(mv), extra = AI.mvExtra(mv);
    var toKey = geo.keys[to];
    if (kind === AI.KIND_TRAIN) {
      set['train|' + AI.TYPES[from & 15] + '|' + toKey] = true;
    } else if (kind === AI.KIND_ROTATE) {
      set['rotate|' + geo.keys[from] + '|' + extra] = true;
    } else {
      var names = ['move', 'capture', 'harvest', 'shoot'];
      set[names[kind] + '|' + geo.keys[from] + '|' + toKey] = true;
    }
  });
  return set;
}

function diff(a, b) {
  return Object.keys(a).filter(function (k) { return !b[k]; });
}

var fails = 0, checked = 0, positions = 0;
for (var round = 0; round < 60; round++) {
  var st = randomPosition(2 + (round % 3), 4 + (round % 25));
  if (!st) continue;
  positions++;
  for (var p = 0; p < st.players.length; p++) {
    if (st.players[p].eliminated) continue;
    var want = rulesMoves(st, p), got = aiMoves(st, p);
    var missing = diff(want, got), extra = diff(got, want);
    checked++;
    if (missing.length || extra.length) {
      fails++;
      console.log('Abweichung (Spieler ' + p + '):');
      if (missing.length) console.log('  KI fehlt:   ' + missing.slice(0, 6).join('  '));
      if (extra.length) console.log('  KI zuviel:  ' + extra.slice(0, 6).join('  '));
      if (fails > 3) break;
    }
  }
  if (fails > 3) break;
}
console.log('Zuggenerierung: ' + checked + ' Stellungen/Spieler aus ' + positions +
            ' Partien geprüft, ' + fails + ' Abweichungen');

/* --- make/unmake muss die Stellung exakt wiederherstellen --- */
function fingerprint(s) {
  return [s.pt.join(','), s.po.join(','), s.pf.join(','), s.tree.join(','),
          s.boat.join(','), String(s.treeCount), s.wood.join(','), s.alive.join(','),
          s.zent.join(','), s.kingAt.join(',')].join('#');
}

var undoFails = 0, undoChecked = 0;
for (var r2 = 0; r2 < 40; r2++) {
  var st2 = randomPosition(2 + (r2 % 3), 6 + (r2 % 30));
  if (!st2) continue;
  var s2 = AI.snapshot(st2);
  for (var p2 = 0; p2 < st2.players.length; p2++) {
    if (!s2.alive[p2]) continue;
    var moves = []; AI.genMoves(s2, p2, moves, false);
    for (var m = 0; m < moves.length; m++) {
      var before = fingerprint(s2);
      var u = AI.make(s2, moves[m], p2);
      AI.unmake(s2, u);
      undoChecked++;
      if (fingerprint(s2) !== before) {
        undoFails++;
        if (undoFails <= 3) {
          console.log('unmake stellt nicht wieder her: Zugart ' + AI.mvKind(moves[m]));
        }
      }
    }
  }
}
console.log('make/unmake: ' + undoChecked + ' Züge geprüft, ' + undoFails + ' Fehler');

var bad = fails + undoFails;
console.log(bad ? '\n' + bad + ' Problem(e)' : '\nKI-Zuggenerierung deckt sich mit dem Regelwerk.');
process.exit(bad ? 1 : 0);
