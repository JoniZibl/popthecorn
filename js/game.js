/* Hexodus – Spielzustand, Aufbauphasen und Zugabwicklung */
var Game = (function () {
  'use strict';

  var H = (typeof Hex !== 'undefined') ? Hex : require('./hex.js');
  var B = (typeof Board !== 'undefined') ? Board : require('./board.js');
  var M = (typeof Moves !== 'undefined') ? Moves : require('./moves.js');
  var U = (typeof Units !== 'undefined') ? Units : require('./units.js');

  // Spielmaterial nach Spielerzahl (siehe Spielaufbau)
  var SETUP = {
    2: { tiles: 10, trees: 30 },
    3: { tiles: 20, trees: 45 },
    4: { tiles: 25, trees: 60 }
  };

  var COLORS = [
    { id: 'blue',   name: 'Blau',   hex: '#3b82f6' },
    { id: 'pink',   name: 'Pink',   hex: '#ec4899' },
    { id: 'yellow', name: 'Gelb',   hex: '#eab308' },
    { id: 'orange', name: 'Orange', hex: '#f97316' }
  ];

  function create(playerNames) {
    var count = playerNames.length;
    var cfg = SETUP[count];
    var board = B.generate(cfg.tiles);

    // Bäume gleichmäßig verteilen; pro Spieler bleiben mindestens 6 Felder frei,
    // damit Türme und Arbeiter noch Platz finden.
    var land = B.landCells(board).length;
    var maxTrees = land - count * 6;
    var total = Math.min(cfg.trees, Math.max(count * 4, maxTrees));
    var perPlayer = Math.floor(total / count);

    var players = playerNames.map(function (name, i) {
      return {
        index: i,
        name: name || ('Spieler ' + (i + 1)),
        color: COLORS[i].hex,
        colorName: COLORS[i].name,
        wood: 0,
        treesLeft: perPlayer,
        eliminated: false,
        trained: {}
      };
    });

    return {
      board: board,
      players: players,
      phase: 'trees',          // trees → kings → play → over
      current: 0,
      pending: null,           // {kind:'rotate'|'trainFacing', key}
      awaitWorker: false,      // König gesetzt, Arbeiter fehlt noch
      selected: null,
      turn: 1,
      passes: 0,
      winner: null,
      log: []
    };
  }

  function log(state, text, playerIndex) {
    state.log.unshift({ text: text, player: (playerIndex === undefined ? null : playerIndex) });
    if (state.log.length > 80) state.log.pop();
  }

  function alivePlayers(state) {
    return state.players.filter(function (p) { return !p.eliminated; });
  }

  function nextPlayer(state) {
    var n = state.players.length;
    for (var i = 1; i <= n; i++) {
      var idx = (state.current + i) % n;
      if (!state.players[idx].eliminated) return idx;
    }
    return state.current;
  }

  /* ---------------- Aufbauphase ---------------- */

  function placeTree(state, q, r) {
    if (state.phase !== 'trees') return false;
    var cell = B.get(state.board, q, r);
    if (!B.isFree(cell)) return false;
    cell.tree = true;
    state.players[state.current].treesLeft--;
    log(state, state.players[state.current].name + ' pflanzt einen Baum.', state.current);
    advanceTreeTurn(state);
    return true;
  }

  function advanceTreeTurn(state) {
    var remaining = state.players.some(function (p) { return p.treesLeft > 0; });
    if (!remaining) {
      state.phase = 'kings';
      state.current = 0;
      state.awaitWorker = false;
      log(state, 'Alle Bäume stehen. Jetzt werden die Königs-Türme gesetzt.');
      return;
    }
    var n = state.players.length;
    for (var i = 1; i <= n; i++) {
      var idx = (state.current + i) % n;
      if (state.players[idx].treesLeft > 0) { state.current = idx; return; }
    }
  }

  function autoPlaceTrees(state) {
    var guard = 0;
    while (state.phase === 'trees' && guard++ < 5000) {
      var free = B.landCells(state.board).filter(B.isFree);
      if (!free.length) { state.phase = 'kings'; state.current = 0; break; }
      var cell = free[Math.floor(Math.random() * free.length)];
      placeTree(state, cell.q, cell.r);
    }
  }

  /* Königs-Turm braucht ein freies Nachbarfeld für den Arbeiter und
     hält Abstand zu bereits gesetzten Türmen. */
  function canPlaceKing(state, cell) {
    if (!B.isFree(cell)) return false;
    var hasSpot = H.neighbors(cell).some(function (nb) { return B.isFree(B.at(state.board, nb)); });
    if (!hasSpot) return false;
    return !kingTooClose(state, cell);
  }

  function kingTooClose(state, cell) {
    var minDist = state.players.length > 2 ? 3 : 4;
    var board = state.board;
    for (var i = 0; i < board.keys.length; i++) {
      var c = board.cells[board.keys[i]];
      if (c.piece && c.piece.type === 'king' && H.distance(c, cell) < minDist) return true;
    }
    return false;
  }

  function placeKing(state, q, r) {
    if (state.phase !== 'kings' || state.awaitWorker) return false;
    var cell = B.get(state.board, q, r);
    if (!canPlaceKing(state, cell)) return false;
    cell.piece = { type: 'king', owner: state.current, facing: 0 };
    state.awaitWorker = true;
    log(state, state.players[state.current].name + ' setzt den Königs-Turm.', state.current);
    return true;
  }

  function placeWorker(state, q, r) {
    if (state.phase !== 'kings' || !state.awaitWorker) return false;
    var cell = B.get(state.board, q, r);
    if (!B.isFree(cell)) return false;
    var touchesKing = H.neighbors(cell).some(function (nb) {
      var c = B.at(state.board, nb);
      return c && c.piece && c.piece.type === 'king' && c.piece.owner === state.current;
    });
    if (!touchesKing) return false;
    cell.piece = { type: 'worker', owner: state.current, facing: 0 };
    state.awaitWorker = false;
    log(state, state.players[state.current].name + ' stellt den Arbeiter auf.', state.current);

    if (state.current === state.players.length - 1) {
      // Der letzte Spieler, der seinen Turm gesetzt hat, beginnt
      state.phase = 'play';
      state.current = state.players.length - 1;
      state.turn = 1;
      log(state, 'Das Spiel beginnt – ' + state.players[state.current].name + ' ist am Zug.', state.current);
    } else {
      state.current++;
    }
    return true;
  }

  /* ---------------- Spielzüge ---------------- */

  function actionsFor(state, cell) {
    if (state.phase !== 'play') return [];
    if (!cell || !cell.piece || cell.piece.owner !== state.current) return [];
    if (state.pending) return [];
    return M.forPiece(state.board, cell, state.players[state.current].wood);
  }

  function capture(state, cell, attacker) {
    var victim = cell.piece;
    cell.piece = null;
    var vName = U.DEFS[victim.type].name;
    log(state, U.DEFS[victim.type].name + ' von ' + state.players[victim.owner].name + ' geschlagen.', attacker);
    if (victim.type === 'king') eliminate(state, victim.owner, attacker);
    return vName;
  }

  function eliminate(state, victimIndex, attackerIndex) {
    var victim = state.players[victimIndex];
    victim.eliminated = true;
    var board = state.board;
    board.keys.forEach(function (k) {
      var c = board.cells[k];
      if (c.piece && c.piece.owner === victimIndex) c.piece = null;
    });
    if (attackerIndex !== null && attackerIndex !== undefined && victim.wood > 0) {
      state.players[attackerIndex].wood += victim.wood;
      log(state, state.players[attackerIndex].name + ' erbeutet ' + victim.wood + ' Holz.', attackerIndex);
    }
    victim.wood = 0;
    log(state, victim.name + ' scheidet aus dem Spiel aus!', victimIndex);
    checkVictory(state);
  }

  function checkVictory(state) {
    var alive = alivePlayers(state);
    if (alive.length <= 1) {
      state.phase = 'over';
      state.winner = alive.length ? alive[0].index : null;
      state.pending = null;
      state.selected = null;
      if (state.winner !== null) log(state, alive[0].name + ' gewinnt Hexodus!', state.winner);
      else log(state, 'Unentschieden – niemand bleibt übrig.');
      return true;
    }
    return false;
  }

  /* Führt eine der von actionsFor gelieferten Aktionen aus. */
  function perform(state, fromCell, action) {
    if (state.phase !== 'play' || state.pending) return false;
    var piece = fromCell.piece;
    if (!piece || piece.owner !== state.current) return false;
    var player = state.players[state.current];
    var target = B.get(state.board, action.q, action.r);
    if (!target) return false;
    var def = U.DEFS[piece.type];

    if (action.kind === 'shoot') {
      if (!target.piece) return false;
      log(state, player.name + ': Bogenschütze schießt.', state.current);
      capture(state, target, state.current);
      state.passes = 0;
      finishTurn(state, null);
      return true;
    }

    if (action.cost) {
      if (player.wood < action.cost) return false;
      player.wood -= action.cost;
      log(state, player.name + ' zahlt ' + action.cost + ' Holz für den Königs-Sprung.', state.current);
    }

    if (action.kind === 'capture') capture(state, target, state.current);

    if (action.kind === 'harvest') {
      target.tree = false;
      player.wood += 1;
      log(state, player.name + ': Arbeiter fällt einen Baum (+1 Holz).', state.current);
    }

    // Figur versetzen (falls sie das Spiel noch nicht beendet hat)
    if (state.phase === 'play') {
      fromCell.piece = null;
      target.piece = piece;
    } else {
      fromCell.piece = null;
      if (!target.piece) target.piece = piece;
      return true;
    }

    if (action.kind === 'move' && piece.type !== 'worker') {
      log(state, player.name + ': ' + def.name + ' zieht.', state.current);
    }

    state.passes = 0;
    // Richtungsfiguren dürfen nach dem Zug noch neu ausrichten
    if (def.directional) {
      state.pending = { kind: 'rotate', key: H.key(target.q, target.r) };
      state.selected = H.key(target.q, target.r);
      return true;
    }
    finishTurn(state, null);
    return true;
  }

  /* Drehen: entweder als Anschluss an einen Zug (gratis) oder als ganzer Zug. */
  function rotate(state, cellKey, dir) {
    if (state.phase !== 'play') return false;
    var cell = state.board.cells[cellKey];
    if (!cell || !cell.piece || cell.piece.owner !== state.current) return false;
    if (!U.DEFS[cell.piece.type].directional) return false;
    if (state.pending) {
      var pk = state.pending.kind;
      if ((pk !== 'rotate' && pk !== 'trainFacing') || state.pending.key !== cellKey) return false;
    }
    cell.piece.facing = dir;
    log(state, state.players[state.current].name + ': ' + U.DEFS[cell.piece.type].name +
      ' richtet sich nach ' +
      (cell.piece.type === 'springer' ? H.wedgeName(dir) : H.DIR_NAMES[dir]) + ' aus.', state.current);
    state.passes = 0;
    finishTurn(state, null);
    return true;
  }

  function train(state, type, q, r) {
    if (state.phase !== 'play' || state.pending) return false;
    var def = U.DEFS[type];
    if (!def || !def.trainable) return false;
    var player = state.players[state.current];
    if (player.wood < def.cost) return false;
    if (def.unique && player.trained[type]) return false;
    var cell = B.get(state.board, q, r);
    if (!B.isFree(cell)) return false;
    var ok = M.trainingSpots(state.board, state.current).some(function (c) {
      return c.q === q && c.r === r;
    });
    if (!ok) return false;

    player.wood -= def.cost;
    player.trained[type] = (player.trained[type] || 0) + 1;
    cell.piece = { type: type, owner: state.current, facing: 0 };
    log(state, player.name + ' bildet einen ' + def.name + ' aus (-' + def.cost + ' Holz).', state.current);
    state.passes = 0;

    if (def.directional) {
      state.pending = { kind: 'trainFacing', key: H.key(q, r) };
      state.selected = H.key(q, r);
      return true;
    }
    finishTurn(state, null);
    return true;
  }

  function pass(state) {
    if (state.phase !== 'play') return false;
    log(state, state.players[state.current].name + ' setzt aus.', state.current);
    state.passes++;
    if (state.passes >= alivePlayers(state).length) {
      state.phase = 'over';
      state.winner = null;
      log(state, 'Niemand kann mehr ziehen – das Spiel endet unentschieden.');
      return true;
    }
    finishTurn(state, null);
    return true;
  }

  /* Zug beenden: offene Drehung verwerfen und weitergeben. */
  function finishTurn(state) {
    state.pending = null;
    state.selected = null;
    if (state.phase !== 'play') return;
    if (checkVictory(state)) return;
    var next = nextPlayer(state);
    if (next <= state.current) state.turn++;
    state.current = next;
  }

  function endPending(state) {
    if (!state.pending) return false;
    state.pending = null;
    finishTurn(state, null);
    return true;
  }

  function pieceCount(state, owner) {
    var n = 0;
    state.board.keys.forEach(function (k) {
      var c = state.board.cells[k];
      if (c.piece && c.piece.owner === owner) n++;
    });
    return n;
  }

  return {
    SETUP: SETUP, COLORS: COLORS,
    create: create, log: log,
    placeTree: placeTree, autoPlaceTrees: autoPlaceTrees,
    canPlaceKing: canPlaceKing, placeKing: placeKing, placeWorker: placeWorker,
    actionsFor: actionsFor, perform: perform, rotate: rotate, train: train,
    pass: pass, endPending: endPending, finishTurn: finishTurn,
    alivePlayers: alivePlayers, pieceCount: pieceCount
  };
})();

if (typeof module !== 'undefined') { module.exports = Game; }
