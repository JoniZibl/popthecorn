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
    4: { tiles: 25, trees: 60 },
    5: { tiles: 30, trees: 75 },
    6: { tiles: 35, trees: 90 },
    7: { tiles: 40, trees: 105 },
    8: { tiles: 45, trees: 120 }
  };
  var MAX_PLAYERS = 8;

  /* Farben sind nach Mannschaften geordnet: Jede Mannschaft hat eine Familie,
     innerhalb der Familie unterscheiden sich die Spieler durch die Helligkeit.
     Wer zusammen spielt, ist damit auf einen Blick zusammen zu sehen, bleibt
     aber einzeln unterscheidbar. Grün fehlt mit Absicht – das ist die Wiese. */
  var TEAM_COLORS = [
    { id: 'blau',    name: 'Blau',    shades: ['#3b82f6', '#93c5fd', '#1d4ed8', '#60a5fa'] },
    { id: 'pink',    name: 'Pink',    shades: ['#ec4899', '#fbcfe8', '#9d174d', '#f9a8d4'] },
    { id: 'gelb',    name: 'Gelb',    shades: ['#eab308', '#fde047', '#a16207', '#fbbf24'] },
    { id: 'orange',  name: 'Orange',  shades: ['#f97316', '#fdba74', '#9a3412', '#fb923c'] },
    { id: 'violett', name: 'Violett', shades: ['#a855f7', '#d8b4fe', '#6b21a8', '#c084fc'] },
    { id: 'tuerkis', name: 'Türkis',  shades: ['#06b6d4', '#a5f3fc', '#0e7490', '#22d3ee'] },
    { id: 'rot',     name: 'Rot',     shades: ['#ef4444', '#fecaca', '#991b1b', '#f87171'] },
    { id: 'grau',    name: 'Grau',    shades: ['#94a3b8', '#e2e8f0', '#475569', '#cbd5e1'] }
  ];
  var SHADE_NAMES = ['', ' hell', ' dunkel', ' blass'];

  // Bisherige Aufrufer erwarten eine flache Farbliste – eine Farbe je Mannschaft
  var COLORS = TEAM_COLORS.map(function (t) {
    return { id: t.id, name: t.name, hex: t.shades[0] };
  });

  /* Mannschaften: `teams[i]` ist die Mannschaftsnummer von Spieler i. Ohne
     Angabe spielt jeder für sich – dann ist jeder seine eigene Mannschaft, und
     alles Weitere verhält sich wie bisher. */
  /* Farbe je Spieler: die Familie kommt von der Mannschaft, die Helligkeit von
     der Reihenfolge innerhalb der Mannschaft. Das Startmenü rechnet damit
     dieselben Farben aus wie das Spiel selbst. */
  function colorsFor(teams) {
    var proTeam = {};
    return teams.map(function (t) {
      var fam = TEAM_COLORS[t % TEAM_COLORS.length];
      var k = (proTeam[t] = (proTeam[t] === undefined ? 0 : proTeam[t] + 1));
      return {
        hex: fam.shades[k % fam.shades.length],
        name: fam.name + (SHADE_NAMES[k % SHADE_NAMES.length] || '')
      };
    });
  }

  function normalizeTeams(teams, count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var t = teams && teams[i];
      out.push((typeof t === 'number' && t >= 0) ? t : i);
    }
    return out;
  }

  /* Spielen zwei Spieler zusammen? Ein Spieler ist immer mit sich selbst
     verbündet. `teams` fehlt in alten Spielständen – dann zählt nur der Index. */
  function allied(teams, a, b) {
    if (a === b) return true;
    if (!teams) return false;
    return teams[a] === teams[b];
  }

  function teamMembers(state, team) {
    return state.players.filter(function (p) { return state.teams[p.index] === team; });
  }

  function teamsAlive(state) {
    var seen = {}, out = [];
    state.players.forEach(function (p) {
      if (p.eliminated) return;
      var t = state.teams[p.index];
      if (seen[t]) return;
      seen[t] = true;
      out.push(t);
    });
    return out;
  }

  /* Wie heißt die Mannschaft? Bei "jeder für sich" ist das der Spielername,
     sonst die Farbfamilie, die sich alle Mitglieder teilen. */
  function teamName(state, team) {
    var mit = teamMembers(state, team);
    if (mit.length <= 1) return mit.length ? mit[0].name : ('Mannschaft ' + (team + 1));
    return 'Team ' + (TEAM_COLORS[team % TEAM_COLORS.length].name);
  }

  function create(playerNames, kinds, teams) {
    var count = playerNames.length;
    kinds = kinds || [];
    teams = normalizeTeams(teams, count);
    var cfg = SETUP[count];
    var board = B.generate(cfg.tiles);
    /* Die Mannschaften hängen am Brett, nicht nur am Spielzustand: moves.js
       bekommt beim Zugerzeugen nur das Brett zu sehen und muss trotzdem
       wissen, wer mit wem spielt. */
    board.teams = teams.slice();

    // Bäume gleichmäßig verteilen; pro Spieler bleiben mindestens 6 Felder frei,
    // damit Türme und Arbeiter noch Platz finden.
    var land = B.landCells(board).length;
    var maxTrees = land - count * 6;
    var total = Math.min(cfg.trees, Math.max(count * 4, maxTrees));
    var perPlayer = Math.floor(total / count);

    var farben = colorsFor(teams);

    var players = playerNames.map(function (name, i) {
      return {
        index: i,
        ai: kinds[i] || null,          // null = Mensch, sonst Spielstärke
        name: name || ('Spieler ' + (i + 1)),
        team: teams[i],
        color: farben[i].hex,
        colorName: farben[i].name,
        wood: 0,
        treesLeft: perPlayer,
        eliminated: false,
        trained: {}
      };
    });

    return {
      board: board,
      players: players,
      teams: teams,            // teams[i] = Mannschaft von Spieler i
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
      winnerTeam: null,        // gewonnen hat immer eine Mannschaft
      log: []
    };
  }

  var STALL_LIMIT = 50;      // Züge ohne Fortschritt, dann wird gewertet
  var REPEAT_LIMIT = 3;      // dieselbe Stellung dreimal, dann wird gewertet
  /* Beute: Wer eine Figur schlägt, bekommt die Hälfte ihrer Ausbildungskosten
     als Holz zurück (aufgerundet). Beim Königs-Turm wechselt ohnehin der ganze
     Vorrat den Besitzer. */
  function plunder(type) {
    var cost = U.DEFS[type].cost || 0;
    return Math.ceil(cost / 2);
  }

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
    log(state, vName + ' von ' + state.players[victim.owner].name + ' geschlagen.', attacker);
    if (victim.type === 'king') {
      eliminate(state, victim.owner, attacker);
    } else {
      var beute = plunder(victim.type);
      if (beute > 0 && attacker !== null && attacker !== undefined) {
        state.players[attacker].wood += beute;
        log(state, state.players[attacker].name + ' erbeutet ' + beute + ' Holz.', attacker);
      }
    }
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

    /* Gewertet wird je Mannschaft: Was die Mitglieder besitzen, zählt zusammen.
       Spielt jeder für sich, ist jede Mannschaft ein Spieler – dann ist das
       dieselbe Rechnung wie zuvor. */
    var best = null;
    teamsAlive(state).forEach(function (t) {
      var mit = teamMembers(state, t).filter(function (p) { return !p.eliminated; });
      var cand = { team: t, index: mit[0].index, wealth: 0, pieces: 0, wood: 0, last: 0 };
      mit.forEach(function (pl) {
        cand.wealth += wealth(state, pl.index);
        cand.pieces += pieceCount(state, pl.index);
        cand.wood += pl.wood;
        if (state.lastProgressBy === pl.index) cand.last = 1;
        // Sprecher der Mannschaft ist ihr vermögendstes Mitglied
        if (wealth(state, pl.index) > wealth(state, cand.index)) cand.index = pl.index;
      });
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
    state.winnerTeam = best.team;
    state.endReason = reason;
    state.pending = null;
    state.selected = null;
    log(state, reason + ' – es wird gewertet.');
    log(state, teamName(state, best.team) + ' gewinnt mit ' + best.wealth +
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

  /* Gewonnen hat, wer als letzte Mannschaft steht. Spielt jeder für sich, ist
     das genau der letzte übrige Spieler – dann bleibt alles wie bisher. */
  function checkVictory(state) {
    var alive = alivePlayers(state);
    var teams = teamsAlive(state);
    if (teams.length <= 1) {
      state.phase = 'over';
      state.winnerTeam = teams.length ? teams[0] : null;
      state.winner = alive.length ? alive[0].index : null;
      state.pending = null;
      state.selected = null;
      if (state.winnerTeam !== null) {
        log(state, teamName(state, state.winnerTeam) + ' gewinnt Hexodus!', state.winner);
      } else {
        log(state, 'Unentschieden – niemand bleibt übrig.');
      }
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
      type: piece.type, owner: state.current, kind: action.kind,
      // Kettensprung: die Zwischenlandungen, damit die Anzeige sie einzeln abspringt
      path: action.path || null
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
    SETUP: SETUP, COLORS: COLORS, TEAM_COLORS: TEAM_COLORS, MAX_PLAYERS: MAX_PLAYERS,
    allied: allied, teamsAlive: teamsAlive, teamMembers: teamMembers, teamName: teamName,
    colorsFor: colorsFor, normalizeTeams: normalizeTeams,
    create: create, log: log,
    placeTree: placeTree, autoPlaceTrees: autoPlaceTrees,
    canPlaceKing: canPlaceKing, placeKing: placeKing, placeWorker: placeWorker,
    actionsFor: actionsFor, perform: perform, rotate: rotate, train: train,
    pass: pass, endPending: endPending, finishTurn: finishTurn,
    alivePlayers: alivePlayers, pieceCount: pieceCount, wealth: wealth,
    checkVictory: checkVictory, adjudicate: adjudicate,
    plunder: plunder,
    STALL_LIMIT: STALL_LIMIT, REPEAT_LIMIT: REPEAT_LIMIT
  };
})();

if (typeof module !== 'undefined') { module.exports = Game; }
