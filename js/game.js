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

  function create(playerNames, kinds) {
    var count = playerNames.length;
    kinds = kinds || [];
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
        ai: kinds[i] || null,          // null = Mensch, sonst Spielstärke
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
      history: {},             // wie oft trat jede Stellung auf?
      sinceProgress: 0,        // Züge ohne Schlag, Ernte oder Ausbildung
      lastProgressBy: null,
      endReason: null,
      moveNo: 0,               // zählt Aktionen – die Oberfläche erkennt daran Neues
      lastMove: null,          // { fromKey, toKey, type, owner, kind }
      lastCapture: null,       // { key, type, owner, by }
      lastHarvest: null,       // { key, owner }
      lastTrain: null,         // { key, type, owner }
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

  var STALL_LIMIT = 50;      // Züge ohne Fortschritt, dann wird gewertet
  var REPEAT_LIMIT = 3;      // dieselbe Stellung dreimal, dann wird gewertet

  /* Eindeutige Kennung der Stellung: Figuren, Bäume, Holz und wer am Zug ist. */
  function positionKey(state) {
    var parts = [];
    for (var i = 0; i < state.board.keys.length; i++) {
      var k = state.board.keys[i], c = state.board.cells[k];
      // Boote gehören zur Stellung: sonst gelten zwei Lagen als gleich,
      // die sich nur durch ein verschobenes Boot unterscheiden
      if (c.piece) parts.push(k + '=' + c.piece.type + c.piece.owner + c.piece.facing + (c.boat ? 'B' : ''));
      else if (c.boat) parts.push(k + '=B');
      else if (c.tree) parts.push(k + '=T');
    }
    parts.push('h' + state.players.map(function (p) { return p.wood; }).join('.'));
    parts.push('z' + state.current);
    return parts.join('|');
  }

  /* Vermögen = Holzvorrat plus das Holz, das in den eigenen Figuren steckt. */
  function wealth(state, owner) {
    var sum = state.players[owner].wood;
    state.board.keys.forEach(function (k) {
      var c = state.board.cells[k];
      if (c.piece && c.piece.owner === owner) sum += U.DEFS[c.piece.type].cost || 0;
    });
    return sum;
  }

  /* Ereignisse für die Darstellung festhalten. */
  function noteEvent(state, what, data) {
    state.moveNo++;
    data.moveNo = state.moveNo;
    state[what] = data;
  }

  function clearEvents(state) {
    state.lastMove = null;
    state.lastCapture = null;
    state.lastHarvest = null;
    state.lastTrain = null;
  }

  function noteProgress(state) {
    state.sinceProgress = 0;
    state.lastProgressBy = state.current;
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
      var player = state.players[state.current];
      var cell = null;
      // Computergegner setzen ihre Bäume weiterhin nach eigenem Plan
      if (player.ai && typeof AI !== 'undefined') cell = AI.chooseTree(state, state.current);
      if (!cell) {
        var free = B.landCells(state.board).filter(B.isFree);
        if (!free.length) { state.phase = 'kings'; state.current = 0; break; }
        cell = free[Math.floor(Math.random() * free.length)];
      }
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
    noteEvent(state, 'lastCapture', {
      key: H.key(cell.q, cell.r), type: victim.type, owner: victim.owner, by: attacker
    });
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

  /* Wertung: Wenn sich nichts mehr bewegt, entscheidet der Spielstand.
     Die Kette bricht jeden Gleichstand auf – es gibt immer genau einen Sieger. */
  function adjudicate(state, reason) {
    var alive = alivePlayers(state);
    if (!alive.length) { state.phase = 'over'; state.winner = null; return true; }

    var best = null;
    alive.forEach(function (pl) {
      var cand = {
        index: pl.index,
        wealth: wealth(state, pl.index),
        pieces: pieceCount(state, pl.index),
        wood: pl.wood,
        last: state.lastProgressBy === pl.index ? 1 : 0
      };
      if (!best ||
          cand.wealth > best.wealth ||
          (cand.wealth === best.wealth && cand.pieces > best.pieces) ||
          (cand.wealth === best.wealth && cand.pieces === best.pieces && cand.wood > best.wood) ||
          (cand.wealth === best.wealth && cand.pieces === best.pieces &&
           cand.wood === best.wood && cand.last > best.last)) {
        best = cand;
      }
    });

    state.phase = 'over';
    state.winner = best.index;
    state.endReason = reason;
    state.pending = null;
    state.selected = null;
    log(state, reason + ' – es wird gewertet.');
    log(state, state.players[best.index].name + ' gewinnt mit ' + best.wealth +
        ' Holz in Vorrat und Figuren.', best.index);
    return true;
  }

  /* Nach jedem Zug prüfen, ob die Partie festgefahren ist. */
  function checkStalemate(state) {
    if (state.phase !== 'play') return false;
    state.sinceProgress++;
    var key = positionKey(state);
    state.history[key] = (state.history[key] || 0) + 1;
    if (state.history[key] >= REPEAT_LIMIT) {
      return adjudicate(state, 'Dieselbe Stellung zum ' + REPEAT_LIMIT + '. Mal');
    }
    if (state.sinceProgress >= STALL_LIMIT) {
      return adjudicate(state, STALL_LIMIT + ' Züge ohne Baum, Schlag oder Ausbildung');
    }
    return false;
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
      clearEvents(state);
      noteEvent(state, 'lastMove', {
        fromKey: H.key(fromCell.q, fromCell.r), toKey: H.key(target.q, target.r),
        type: piece.type, owner: state.current, kind: 'shoot'
      });
      log(state, player.name + ': Bogenschütze schießt.', state.current);
      capture(state, target, state.current);
      noteProgress(state);
      state.passes = 0;
      finishTurn(state, null);
      return true;
    }

    // Bootskosten und Königs-Sprung stecken beide in action.cost
    clearEvents(state);
    noteEvent(state, 'lastMove', {
      fromKey: H.key(fromCell.q, fromCell.r), toKey: H.key(target.q, target.r),
      type: piece.type, owner: state.current, kind: action.kind
    });
    var plan = M.waterPlan(state.board, piece, fromCell, target);
    if (action.cost) {
      if (player.wood < action.cost) return false;
      player.wood -= action.cost;
      if (piece.type === 'king' && action.cost > plan.cost) {
        log(state, player.name + ' zahlt 1 Holz für den Königs-Sprung.', state.current);
      }
      if (plan.cost > 0) {
        log(state, player.name + ' kauft ' + plan.cost + (plan.cost === 1 ? ' Boot' : ' Boote') +
            ' (-' + plan.cost + ' Holz).', state.current);
      }
    }

    if (action.kind === 'capture') { capture(state, target, state.current); noteProgress(state); }

    if (action.kind === 'harvest') {
      target.tree = false;
      player.wood += 1;
      noteEvent(state, 'lastHarvest', { key: H.key(target.q, target.r), owner: state.current });
      noteProgress(state);
      log(state, player.name + ': Arbeiter fällt einen Baum (+1 Holz).', state.current);
    }

    /* Boote umsetzen: aufgenommene Boote fahren mit, an jedem Übergang vom
       Wasser an Land bleibt eines liegen, und wer auf dem Wasser endet, sitzt
       in seinem Boot. */
    plan.takes.forEach(function (c) { c.boat = false; });
    plan.drops.forEach(function (c) { c.boat = true; });
    if (plan.endOnWater) target.boat = true;

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
    if (M.trainBlocker(state, state.current, type) !== null) return false;
    var player = state.players[state.current];
    var cell = B.get(state.board, q, r);
    if (!B.isFree(cell)) return false;
    var ok = M.trainingSpots(state.board, state.current).some(function (c) {
      return c.q === q && c.r === r;
    });
    if (!ok) return false;

    player.wood -= def.cost;
    player.trained[type] = (player.trained[type] || 0) + 1;
    cell.piece = { type: type, owner: state.current, facing: 0 };
    clearEvents(state);
    noteEvent(state, 'lastTrain', { key: H.key(q, r), type: type, owner: state.current });
    noteProgress(state);
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
      return adjudicate(state, 'Niemand kann mehr ziehen');
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
    checkStalemate(state);
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
    alivePlayers: alivePlayers, pieceCount: pieceCount, wealth: wealth,
    STALL_LIMIT: STALL_LIMIT, REPEAT_LIMIT: REPEAT_LIMIT
  };
})();

if (typeof module !== 'undefined') { module.exports = Game; }
