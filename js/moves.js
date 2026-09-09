/* Hexodus – Regelwerk: legale Aktionen jeder Figur */
var Moves = (function () {
  'use strict';

  var H = (typeof Hex !== 'undefined') ? Hex : require('./hex.js');
  var B = (typeof Board !== 'undefined') ? Board : require('./board.js');

  function isWater(cell) { return !!cell && cell.terrain === 'water'; }

  function enterable(cell) {
    // Feld, auf dem eine Figur überhaupt stehen kann (Wasser nur mit Boot)
    return !!cell && !cell.tree && (cell.terrain === 'grass' || cell.terrain === 'water');
  }

  /* Was kostet der Schritt von `from` nach `to`? -1 heißt: nicht möglich.
     Wasser ist nur mit Boot begehbar: entweder fährt das Boot der Figur mit,
     oder es liegt schon eines da, oder es wird für 1 Holz gekauft. */
  function stepCost(from, to, wood) {
    if (!enterable(to)) return -1;
    if (to.terrain !== 'water') return 0;
    if (isWater(from)) return 0;
    if (to.boat) return 0;
    return wood >= 1 ? 1 : -1;
  }

  /* Richtung von `from` nach `to`, falls beide auf einer Geraden liegen. */
  function directionOf(from, to) {
    for (var d = 0; d < 6; d++) {
      var cur = { q: from.q, r: from.r };
      for (var k = 0; k < 24; k++) {
        cur = H.add(cur, H.DIRS[d]);
        if (cur.q === to.q && cur.r === to.r) return d;
      }
    }
    return -1;
  }

  /* Felder, die eine Figur auf ihrem Weg tatsächlich betritt. Nur Legionär und
     Zenturio laufen durch Zwischenfelder; alles andere springt oder tritt einmal. */
  function pathCells(board, piece, from, to) {
    if (piece.type !== 'legionaer' && piece.type !== 'zenturio') return [to];
    var d = directionOf(from, to);
    if (d < 0) return [to];
    var path = [], cur = { q: from.q, r: from.r };
    for (var k = 0; k < 24; k++) {
      cur = H.add(cur, H.DIRS[d]);
      var c = B.at(board, cur);
      if (!c) break;
      path.push(c);
      if (c.q === to.q && c.r === to.r) break;
    }
    return path.length ? path : [to];
  }

  /* Bootsbewegung eines ganzen Zuges: was kostet er, welche Boote werden
     aufgenommen, wo bleiben sie liegen? */
  function waterPlan(board, piece, from, to) {
    var path = pathCells(board, piece, from, to);
    var carrying = isWater(from), cost = 0, takes = [], drops = [], prev = from;
    for (var i = 0; i < path.length; i++) {
      var c = path[i];
      if (isWater(c)) {
        if (!carrying) {
          if (c.boat) takes.push(c); else cost++;
          carrying = true;
        }
      } else if (carrying) {
        drops.push(prev);            // Boot bleibt am letzten Wasserfeld zurück
        carrying = false;
      }
      prev = c;
    }
    return { cost: cost, takes: takes, drops: drops, endOnWater: carrying };
  }

  function act(kind, cell, extra) {
    var a = { kind: kind, q: cell.q, r: cell.r };
    if (extra) for (var k in extra) a[k] = extra[k];
    return a;
  }

  /* Gleitende Bewegung (Legionär, Zenturio): läuft, bis etwas im Weg ist.
     Wasser kostet ein Boot je Abschnitt, den die Figur von Land aus betritt. */
  function slide(board, from, dirs, owner, wood, out) {
    dirs.forEach(function (d) {
      var cur = { q: from.q, r: from.r };
      var carrying = isWater(from), cost = 0;
      for (;;) {
        cur = H.add(cur, H.DIRS[d]);
        var cell = B.at(board, cur);
        if (!cell || cell.tree) break;
        if (cell.terrain === 'water') {
          if (!carrying) {
            if (!cell.boat) {
              if (cost + 1 > wood) break;      // kein Holz mehr für ein Boot
              cost++;
            }
            carrying = true;
          }
        } else {
          carrying = false;                     // Boot bleibt zurück
        }
        if (cell.piece) {
          if (cell.piece.owner !== owner) out.push(act('capture', cell, cost ? { cost: cost } : null));
          break;
        }
        out.push(act('move', cell, cost ? { cost: cost } : null));
      }
    });
  }

  /* Kettensprünge des Tangolins: über Bäume, eigene Einheiten und gegnerische
     Figuren – nie über Wasser. Wer übersprungen wird, wird geschlagen, und
     danach darf weitergesprungen werden: Ein Zug kann so mehrere Figuren
     kosten, wie das Schlagen beim Damespiel.

     Damit hängt aber nicht mehr nur am Zielfeld, was geschlagen wurde, sondern
     am Weg dorthin – und ein Zielfeld ist oft über mehrere Wege erreichbar.
     Gemerkt wird deshalb je Zielfeld der Weg mit den meisten Schlägen; die
     geschlagenen Felder hängen als `captures` am Zug, damit das Regelwerk beim
     Ausführen nicht raten muss.

     Gesucht wird in die Tiefe. Zwei Dinge halten die Suche endlich: Eine schon
     geschlagene Figur ist vom Brett – sie kann nicht ein zweites Mal
     geschlagen werden, ihr Feld ist frei –, und ein Feld wird im selben Weg
     nicht zweimal betreten. Ohne diese zweite Regel liefe der Tangolin im
     Kreis, solange ein Baum in Reichweite steht. */
  function chainJumps(board, from, owner, out) {
    var best = {};                       // Zielfeld → beste gefundene Schlagfolge
    var pfad = {}, geschlagen = {};
    pfad[H.key(from.q, from.r)] = true;
    var knoten = 0;

    function suche(pos, beute) {
      if (++knoten > 4000) return;       // Notbremse gegen entartete Stellungen
      for (var d = 0; d < 6; d++) {
        var over = B.at(board, H.add(pos, H.DIRS[d]));
        if (!over || over.terrain !== 'grass') continue;   // nie über Wasser
        var overKey = H.key(over.q, over.r);
        var opfer = (over.piece && !geschlagen[overKey]) ? over.piece : null;
        if (!over.tree && !opfer) continue;                // nichts zum Überspringen

        var land = B.at(board, H.add(pos, H.scale(H.DIRS[d], 2)));
        if (!land || land.terrain !== 'grass' || land.tree) continue;
        var landKey = H.key(land.q, land.r);
        if (land.piece && !geschlagen[landKey]) continue;  // Landefeld muss frei sein
        if (pfad[landKey]) continue;

        var schlaegt = opfer && opfer.owner !== owner;
        var neu = schlaegt ? beute.concat([overKey]) : beute;
        if (!best[landKey] || neu.length > best[landKey].length) best[landKey] = neu;

        pfad[landKey] = true;
        if (schlaegt) geschlagen[overKey] = true;
        suche(land, neu);
        if (schlaegt) delete geschlagen[overKey];
        delete pfad[landKey];
      }
    }
    suche(from, []);

    for (var k in best) {
      out.push(act('jump', board.cells[k], best[k].length ? { captures: best[k] } : null));
    }
  }

  /* Sprung auf ein festes Zielfeld – Bäume, Wasser und Figuren dazwischen
     spielen keine Rolle (Samurai, Springer). Landen auf Wasser braucht ein Boot. */
  function leapTo(board, from, vec, owner, wood, out) {
    var target = B.at(board, H.add(from, vec));
    var c = stepCost(from, target, wood);
    if (c < 0) return;
    var extra = c ? { cost: c } : null;
    if (!target.piece) out.push(act('move', target, extra));
    else if (target.piece.owner !== owner) out.push(act('capture', target, extra));
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
          if (!target) continue;
          if (target.tree) { out.push(act('harvest', target)); continue; }
          var wc = stepCost(cell, target, wood);
          if (wc < 0) continue;
          var wx = wc ? { cost: wc } : null;
          if (!target.piece) out.push(act('move', target, wx));
          else if (target.piece.owner !== owner) out.push(act('capture', target, wx));
        }
        break;

      case 'samurai':
        // Die 6 Hex-Diagonalen: dadurch bleibt er auf einem Drittel des Bretts
        H.DIAGS.forEach(function (v) { leapTo(board, cell, v, owner, wood, out); });
        break;

      case 'springer':
        // Zwei benachbarte Richtungen, jeweils genau 2 oder 3 Felder weit
        H.wedgeDirs(piece.facing).forEach(function (dd) {
          [2, 3].forEach(function (n) {
            leapTo(board, cell, H.scale(H.DIRS[dd], n), owner, wood, out);
          });
        });
        break;

      case 'legionaer':
        slide(board, cell, [piece.facing, (piece.facing + 3) % 6], owner, wood, out);
        break;

      case 'zenturio':
        slide(board, cell, [0, 1, 2, 3, 4, 5], owner, wood, out);
        break;

      case 'archer':
        // Laufen: 1 Feld, ohne zu schlagen
        for (d = 0; d < 6; d++) {
          target = B.at(board, H.add(cell, H.DIRS[d]));
          var ac = stepCost(cell, target, wood);
          if (ac < 0 || target.piece) continue;
          out.push(act('move', target, ac ? { cost: ac } : null));
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
          var tc = stepCost(cell, target, wood);
          if (tc < 0) continue;
          var tx = tc ? { cost: tc } : null;
          if (!target.piece) out.push(act('move', target, tx));
          else if (target.piece.owner !== owner) out.push(act('capture', target, tx));
        }
        chainJumps(board, cell, owner, out);
        break;

      case 'king':
        if (wood >= 1) {
          for (d = 0; d < 6; d++) {
            target = B.at(board, H.add(cell, H.DIRS[d]));
            var kc = stepCost(cell, target, wood - 1);
            if (kc < 0) continue;
            var total = kc + 1;                 // 1 Holz für den Sprung, dazu das Boot
            if (total > wood) continue;
            if (!target.piece) out.push(act('move', target, { cost: total }));
            else if (target.piece.owner !== owner) out.push(act('capture', target, { cost: total }));
          }
        }
        break;
    }

    /* Doppelte Ziele entfernen (der Tangolin erreicht ein Feld oft mehrfach).
       Behalten wird, was mehr schlägt: Ein Kettensprung, der unterwegs Figuren
       mitnimmt, ist nie schlechter als derselbe Sprung ohne. */
    var seen = {}, uniq = [];
    out.forEach(function (a) {
      var k = a.kind + ':' + a.q + ',' + a.r;
      var alt = seen[k];
      if (alt) {
        if ((a.captures || []).length > (alt.captures || []).length) {
          uniq[uniq.indexOf(alt)] = a;
          seen[k] = a;
        }
        return;
      }
      seen[k] = a;
      uniq.push(a);
    });
    return uniq;
  }

  /* Versorgungskette: alle eigenen Einheiten, die über eine lückenlose Kette
     von Nachbarfeldern mit dem Königs-Turm verbunden sind – und die Verbindungen
     dazwischen. Nur an dieser Kette darf ausgebildet werden. */
  function supplyChain(board, owner) {
    var kingKey = null;
    for (var i = 0; i < board.keys.length; i++) {
      var c = board.cells[board.keys[i]];
      if (c.piece && c.piece.owner === owner && c.piece.type === 'king') { kingKey = board.keys[i]; break; }
    }
    if (!kingKey) return { cells: [], links: [], king: null };

    var cluster = {}, queue = [board.cells[kingKey]], cells = [], links = [];
    cluster[kingKey] = true;
    cells.push(board.cells[kingKey]);
    while (queue.length) {
      var cur = queue.shift();
      var curKey = H.key(cur.q, cur.r);
      H.neighbors(cur).forEach(function (nb) {
        var cell = B.at(board, nb);
        if (!cell || !cell.piece || cell.piece.owner !== owner) return;
        var k = H.key(cell.q, cell.r);
        if (!cluster[k]) { cluster[k] = true; cells.push(cell); queue.push(cell); }
        // Verbindung nur einmal aufnehmen
        if (curKey < k) links.push([cur, cell]);
      });
    }
    return { cells: cells, links: links, king: board.cells[kingKey] };
  }

  /* Felder, auf denen ein Spieler ausbilden darf:
     freie Felder neben dem König oder neben jeder mit ihm verbundenen eigenen Einheit. */
  function trainingSpots(board, owner) {
    var chain = supplyChain(board, owner);
    if (!chain.king) return [];
    var cluster = {};
    chain.cells.forEach(function (c) { cluster[H.key(c.q, c.r)] = true; });

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

  /* Welche Figurentypen dieses Spielers stehen gerade auf dem Feld? */
  function typesOnBoard(board, owner) {
    var types = {};
    board.keys.forEach(function (k) {
      var c = board.cells[k];
      if (c.piece && c.piece.owner === owner) types[c.piece.type] = true;
    });
    return types;
  }

  /* Warum eine Einheit gerade nicht ausgebildet werden kann – null heißt: sie geht.
     Von jeder Figur darf höchstens eine je Spieler auf dem Feld stehen; der Zenturio
     darf zusätzlich nur ein einziges Mal pro Spiel ausgebildet werden. */
  function trainBlocker(state, owner, id) {
    var def = Units.DEFS[id];
    var player = state.players[owner];
    if (!def || !def.trainable) return 'nicht ausbildbar';
    if (def.unique && player.trained[id]) return 'schon ausgebildet';
    if (typesOnBoard(state.board, owner)[id]) return 'steht im Spiel';
    if (def.cost > player.wood) return 'zu wenig Holz';
    return null;
  }

  /* Einheiten, die der Spieler gerade ausbilden darf. */
  function affordableUnits(state, owner) {
    return Units.TRAIN_ORDER.filter(function (id) {
      return trainBlocker(state, owner, id) === null;
    });
  }

  return {
    forPiece: forPiece, trainingSpots: trainingSpots, supplyChain: supplyChain,
    waterPlan: waterPlan, stepCost: stepCost, isWater: isWater, pathCells: pathCells,
    hasAnyAction: hasAnyAction, affordableUnits: affordableUnits,
    trainBlocker: trainBlocker, typesOnBoard: typesOnBoard, enterable: enterable
  };
})();

if (typeof module !== 'undefined') { module.exports = Moves; }
