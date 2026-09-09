/* Hexodus – Regelwerk: legale Aktionen jeder Figur */
var Moves = (function () {
  'use strict';

  var H = (typeof Hex !== 'undefined') ? Hex : require('./hex.js');
  var B = (typeof Board !== 'undefined') ? Board : require('./board.js');

  function enterable(cell) {
    // Feld, auf dem eine Figur überhaupt stehen kann
    return !!cell && cell.terrain === 'grass' && !cell.tree;
  }

  function act(kind, cell, extra) {
    var a = { kind: kind, q: cell.q, r: cell.r };
    if (extra) for (var k in extra) a[k] = extra[k];
    return a;
  }

  /* Gleitende Bewegung (Legionär, Zenturio): läuft, bis etwas im Weg ist. */
  function slide(board, from, dirs, owner, out) {
    dirs.forEach(function (d) {
      var cur = { q: from.q, r: from.r };
      for (;;) {
        cur = H.add(cur, H.DIRS[d]);
        var cell = B.at(board, cur);
        if (!cell || cell.terrain === 'water' || cell.tree) break;
        if (cell.piece) {
          if (cell.piece.owner !== owner) out.push(act('capture', cell));
          break;
        }
        out.push(act('move', cell));
      }
    });
  }

  /* Kettensprünge des Tangolins: über Bäume und eigene Einheiten, nie über Wasser. */
  function chainJumps(board, from, owner, out) {
    var seen = {};
    seen[H.key(from.q, from.r)] = true;
    var queue = [{ q: from.q, r: from.r }];
    while (queue.length) {
      var pos = queue.shift();
      for (var d = 0; d < 6; d++) {
        var over = B.at(board, H.add(pos, H.DIRS[d]));
        if (!over) continue;
        // Übersprungen werden dürfen nur Bäume und eigene Einheiten
        var jumpable = (over.terrain === 'grass') &&
          (over.tree || (over.piece && over.piece.owner === owner));
        if (!jumpable) continue;
        var land = B.at(board, H.add(pos, H.scale(H.DIRS[d], 2)));
        if (!enterable(land) || land.piece) continue;
        var k = H.key(land.q, land.r);
        if (seen[k]) continue;
        seen[k] = true;
        queue.push({ q: land.q, r: land.r });
        out.push(act('jump', land));
      }
    }
  }

  /* Sprung auf ein festes Zielfeld – Bäume, Wasser und Figuren dazwischen
     spielen keine Rolle (Samurai, Springer). */
  function leapTo(board, from, vec, owner, out) {
    var target = B.at(board, H.add(from, vec));
    if (!enterable(target)) return;
    if (!target.piece) out.push(act('move', target));
    else if (target.piece.owner !== owner) out.push(act('capture', target));
  }

  /* Alle legalen Aktionen der Figur auf `cell`. `wood` = Holzvorrat des Besitzers. */
  function forPiece(board, cell, wood) {
    var piece = cell.piece;
    var out = [];
    if (!piece) return out;
    var owner = piece.owner;
    var d, target, n;

    switch (piece.type) {
      case 'worker':
        for (d = 0; d < 6; d++) {
          target = B.at(board, H.add(cell, H.DIRS[d]));
          if (!target || target.terrain === 'water') continue;
          if (target.tree) { out.push(act('harvest', target)); continue; }
          if (!target.piece) out.push(act('move', target));
          else if (target.piece.owner !== owner) out.push(act('capture', target));
        }
        break;

      case 'samurai':
        // Die 6 Hex-Diagonalen: dadurch bleibt er auf einem Drittel des Bretts
        H.DIAGS.forEach(function (v) { leapTo(board, cell, v, owner, out); });
        break;

      case 'springer':
        // Zwei benachbarte Richtungen, jeweils genau 2 oder 3 Felder weit
        H.wedgeDirs(piece.facing).forEach(function (d) {
          [2, 3].forEach(function (n) {
            leapTo(board, cell, H.scale(H.DIRS[d], n), owner, out);
          });
        });
        break;

      case 'legionaer':
        slide(board, cell, [piece.facing, (piece.facing + 3) % 6], owner, out);
        break;

      case 'zenturio':
        slide(board, cell, [0, 1, 2, 3, 4, 5], owner, out);
        break;

      case 'archer':
        // Laufen: 1 Feld, ohne zu schlagen
        for (d = 0; d < 6; d++) {
          target = B.at(board, H.add(cell, H.DIRS[d]));
          if (enterable(target) && !target.piece) out.push(act('move', target));
        }
        // Schießen: Distanz 2 auf einer der 6 Geraden, über Bäume und Wasser hinweg
        for (d = 0; d < 6; d++) {
          target = B.at(board, H.add(cell, H.scale(H.DIRS[d], 2)));
          if (target && target.piece && target.piece.owner !== owner) {
            out.push(act('shoot', target));
          }
        }
        break;

      case 'tangolin':
        for (d = 0; d < 6; d++) {
          target = B.at(board, H.add(cell, H.DIRS[d]));
          if (!enterable(target)) continue;
          if (!target.piece) out.push(act('move', target));
          else if (target.piece.owner !== owner) out.push(act('capture', target));
        }
        chainJumps(board, cell, owner, out);
        break;

      case 'king':
        if (wood >= 1) {
          for (d = 0; d < 6; d++) {
            target = B.at(board, H.add(cell, H.DIRS[d]));
            if (!enterable(target)) continue;
            if (!target.piece) out.push(act('move', target, { cost: 1 }));
            else if (target.piece.owner !== owner) out.push(act('capture', target, { cost: 1 }));
          }
        }
        break;
    }

    // Doppelte Ziele entfernen (Tangolin kann ein Feld mehrfach erreichen)
    var seen = {}, uniq = [];
    out.forEach(function (a) {
      var k = a.kind + ':' + a.q + ',' + a.r;
      if (seen[k]) return;
      seen[k] = true;
      uniq.push(a);
    });
    return uniq;
  }

  /* Felder, auf denen ein Spieler ausbilden darf:
     freie Felder neben dem König oder neben jeder mit ihm verbundenen eigenen Einheit. */
  function trainingSpots(board, owner) {
    var kingKey = null;
    for (var i = 0; i < board.keys.length; i++) {
      var c = board.cells[board.keys[i]];
      if (c.piece && c.piece.owner === owner && c.piece.type === 'king') { kingKey = board.keys[i]; break; }
    }
    if (!kingKey) return [];

    // Zusammenhängende Traube eigener Einheiten ab dem König
    var cluster = {}, queue = [board.cells[kingKey]];
    cluster[kingKey] = true;
    while (queue.length) {
      var cur = queue.shift();
      H.neighbors(cur).forEach(function (nb) {
        var cell = B.at(board, nb);
        if (!cell || !cell.piece || cell.piece.owner !== owner) return;
        var k = H.key(cell.q, cell.r);
        if (cluster[k]) return;
        cluster[k] = true;
        queue.push(cell);
      });
    }

    var spots = {}, list = [];
    Object.keys(cluster).forEach(function (k) {
      H.neighbors(board.cells[k]).forEach(function (nb) {
        var cell = B.at(board, nb);
        if (!B.isFree(cell)) return;
        var sk = H.key(cell.q, cell.r);
        if (spots[sk]) return;
        spots[sk] = true;
        list.push(cell);
      });
    });
    return list;
  }

  /* Kann der Spieler überhaupt noch etwas tun? */
  function hasAnyAction(state, owner) {
    var board = state.board;
    var player = state.players[owner];
    if (player.eliminated) return false;
    for (var i = 0; i < board.keys.length; i++) {
      var cell = board.cells[board.keys[i]];
      if (!cell.piece || cell.piece.owner !== owner) continue;
      if (forPiece(board, cell, player.wood).length) return true;
      if (cell.piece.type !== 'king' && Units.DEFS[cell.piece.type].directional) return true; // drehen
    }
    return affordableUnits(state, owner).length > 0 && trainingSpots(board, owner).length > 0;
  }

  /* Einheiten, die sich der Spieler gerade leisten darf. */
  function affordableUnits(state, owner) {
    var player = state.players[owner];
    return Units.TRAIN_ORDER.filter(function (id) {
      var def = Units.DEFS[id];
      if (def.cost > player.wood) return false;
      if (def.unique && player.trained[id]) return false;
      return true;
    });
  }

  return {
    forPiece: forPiece, trainingSpots: trainingSpots,
    hasAnyAction: hasAnyAction, affordableUnits: affordableUnits, enterable: enterable
  };
})();

if (typeof module !== 'undefined') { module.exports = Moves; }
