/* Hexodus – Regelwerks-Simulation ohne Browser.
   Spielt zufällige Partien und prüft die Invarianten des Spielzustands. */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
var H = Hex, B = Board, M = Moves, G = Game, U = Units;

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function invariants(state, where) {
  var kings = {}, byType = {};
  state.board.keys.forEach(function (k) {
    var c = state.board.cells[k];
    if (!c.piece) return;
    // Auf dem Wasser darf nur stehen, wer ein Boot unter sich hat
    if (c.terrain === 'water' && !c.boat) {
      throw new Error(where + ': Figur steht ohne Boot im Wasser (' + k + ')');
    }
    if (c.tree) throw new Error(where + ': Figur steht auf einem Baum (' + k + ')');
    if (state.players[c.piece.owner].eliminated) throw new Error(where + ': Figur eines ausgeschiedenen Spielers');
    if (c.piece.type === 'king') kings[c.piece.owner] = (kings[c.piece.owner] || 0) + 1;
    if (!U.DEFS[c.piece.type]) throw new Error(where + ': unbekannter Typ ' + c.piece.type);
    var tk = c.piece.owner + '/' + c.piece.type;
    byType[tk] = (byType[tk] || 0) + 1;
    if (byType[tk] > 1) throw new Error(where + ': ' + byType[tk] + '× ' + c.piece.type +
      ' bei ' + state.players[c.piece.owner].name + ' auf dem Feld');
  });
  // Boote gibt es nur auf dem Wasser
  state.board.keys.forEach(function (k) {
    var c = state.board.cells[k];
    if (c.boat && c.terrain !== 'water') {
      throw new Error(where + ': Boot auf Land (' + k + ')');
    }
  });
  state.players.forEach(function (p) {
    if (p.wood < 0) throw new Error(where + ': negatives Holz bei ' + p.name);
    if (!p.eliminated && state.phase === 'play' && kings[p.index] !== 1) {
      throw new Error(where + ': ' + p.name + ' hat ' + (kings[p.index] || 0) + ' Königs-Türme');
    }
  });
}

function setup(playerCount) {
  var names = [];
  for (var i = 0; i < playerCount; i++) names.push('P' + (i + 1));
  var state = G.create(names);
  G.autoPlaceTrees(state);
  if (state.phase !== 'kings') throw new Error('Baumphase nicht beendet');

  var guard = 0;
  while (state.phase === 'kings' && guard++ < 400) {
    if (state.awaitWorker) {
      var spots = state.board.keys.map(function (k) { return state.board.cells[k]; })
        .filter(function (c) {
          return B.isFree(c) && H.neighbors(c).some(function (nb) {
            var n = B.at(state.board, nb);
            return n && n.piece && n.piece.type === 'king' && n.piece.owner === state.current;
          });
        });
      if (!spots.length) throw new Error('kein Platz für den Arbeiter');
      var w = pick(spots);
      if (!G.placeWorker(state, w.q, w.r)) throw new Error('placeWorker abgelehnt');
    } else {
      var kingSpots = state.board.keys.map(function (k) { return state.board.cells[k]; })
        .filter(function (c) { return G.canPlaceKing(state, c); });
      if (!kingSpots.length) return null; // Brett zu eng – Partie verwerfen
      var kc = pick(kingSpots);
      if (!G.placeKing(state, kc.q, kc.r)) throw new Error('placeKing abgelehnt');
    }
  }
  if (state.phase !== 'play') throw new Error('Aufbau nicht beendet');
  invariants(state, 'Aufbau');
  return state;
}

function ownPieces(state, owner) {
  return state.board.keys.map(function (k) { return state.board.cells[k]; })
    .filter(function (c) { return c.piece && c.piece.owner === owner; });
}

function randomTurn(state) {
  if (state.pending) {
    if (Math.random() < 0.6) G.rotate(state, state.pending.key, Math.floor(Math.random() * 6));
    else G.endPending(state);
    return 'pending';
  }
  var owner = state.current;
  var options = [];
  ownPieces(state, owner).forEach(function (cell) {
    G.actionsFor(state, cell).forEach(function (a) {
      options.push({ type: 'act', cell: cell, action: a });
    });
    if (U.DEFS[cell.piece.type].directional) {
      options.push({ type: 'rot', key: H.key(cell.q, cell.r) });
    }
  });
  var spots = M.trainingSpots(state.board, owner);
  M.affordableUnits(state, owner).forEach(function (id) {
    spots.forEach(function (s) { options.push({ type: 'train', id: id, cell: s }); });
  });

  if (!options.length) {
    if (M.hasAnyAction(state, owner)) throw new Error('hasAnyAction widerspricht der Optionsliste');
    G.pass(state);
    return 'pass';
  }
  // Ausbilden und Schlagen bevorzugen, damit Partien nicht ewig laufen
  var aggressive = options.filter(function (o) {
    return (o.type === 'act' && (o.action.kind === 'capture' || o.action.kind === 'shoot' || o.action.kind === 'harvest')) ||
           o.type === 'train';
  });
  var choice = (aggressive.length && Math.random() < 0.75) ? pick(aggressive) : pick(options);

  var ok;
  if (choice.type === 'act') ok = G.perform(state, choice.cell, choice.action);
  else if (choice.type === 'rot') ok = G.rotate(state, choice.key, Math.floor(Math.random() * 6));
  else ok = G.train(state, choice.id, choice.cell.q, choice.cell.r);
  if (!ok) throw new Error('Aktion abgelehnt: ' + JSON.stringify(choice.type) + ' ' + JSON.stringify(choice.action || ''));
  return choice.type;
}

function playGame(playerCount, maxTurns) {
  var state = setup(playerCount);
  if (!state) return null;
  var steps = 0;
  while (state.phase === 'play' && steps++ < maxTurns) {
    var before = state.current;
    randomTurn(state);
    invariants(state, 'Zug ' + steps);
    if (state.phase === 'play' && !state.pending && state.current === before &&
        !G.alivePlayers(state).length === 1) {
      throw new Error('Spieler wechselt nicht');
    }
  }
  return { state: state, steps: steps };
}

var games = +(process.argv[2] || 60);
var stats = { finished: 0, timeout: 0, skipped: 0, steps: 0, elim: 0 };
for (var i = 0; i < games; i++) {
  var count = 2 + (i % 3);
  var res = playGame(count, 1200);
  if (!res) { stats.skipped++; continue; }
  stats.steps += res.steps;
  if (res.state.phase === 'over') stats.finished++; else stats.timeout++;
  stats.elim += res.state.players.filter(function (p) { return p.eliminated; }).length;
}
console.log('Partien:', games,
  '| beendet:', stats.finished,
  '| offen nach 1200 Zügen:', stats.timeout,
  '| verworfen:', stats.skipped,
  '| Ø Züge:', Math.round(stats.steps / Math.max(1, games - stats.skipped)),
  '| Ausscheidungen:', stats.elim);
console.log('Alle Invarianten eingehalten.');
