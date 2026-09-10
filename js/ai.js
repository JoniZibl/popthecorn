/* Hexodus – Computergegner
 *
 * Aufbau:
 *   1. Kompakte Brettdarstellung (typed arrays) statt der Objektstruktur des Spiels
 *   2. Zuggenerierung, die das Regelwerk aus moves.js spiegelt
 *   3. Stellungsbewertung: Material, Wirtschaft, Königssicherheit, Deckung, Drohungen
 *   4. Alpha-Beta-Suche mit iterativer Vertiefung und Ruhesuche
 *
 * Bei mehr als zwei Spielern wird "paranoid" gesucht: alle Gegner spielen so,
 * als wollten sie ausschließlich der KI schaden.
 */
var AI = (function () {
  'use strict';

  var H = (typeof Hex !== 'undefined') ? Hex : require('./hex.js');
  var U = (typeof Units !== 'undefined') ? Units : require('./units.js');

  var TYPES = ['king', 'worker', 'samurai', 'springer', 'legionaer', 'archer', 'tangolin', 'zenturio'];
  var T = {}; TYPES.forEach(function (t, i) { T[t] = i; });

  /* Figurenwerte in Hundertstel-Holz. Der Arbeiter ist teurer als sein Preis:
     ohne ihn versiegt die gesamte Wirtschaft. */
  var VALUE = [];
  VALUE[T.king] = 100000;
  VALUE[T.worker] = 340;
  VALUE[T.samurai] = 260;
  VALUE[T.springer] = 380;
  VALUE[T.legionaer] = 420;
  VALUE[T.archer] = 470;
  VALUE[T.tangolin] = 430;
  VALUE[T.zenturio] = 780;

  /* Wie gefährlich ist eine Figur für einen Königs-Turm, aus welcher Entfernung
     kann sie zuschlagen und wie viele Felder schafft sie pro Zug? */
  var DANGER = [], THREAT_RANGE = [], SPEED = [];
  DANGER[T.king] = 5;       THREAT_RANGE[T.king] = 1;       SPEED[T.king] = 1;
  DANGER[T.worker] = 11;    THREAT_RANGE[T.worker] = 1;     SPEED[T.worker] = 1;
  DANGER[T.samurai] = 13;   THREAT_RANGE[T.samurai] = 2;    SPEED[T.samurai] = 2;
  DANGER[T.springer] = 15;  THREAT_RANGE[T.springer] = 3;   SPEED[T.springer] = 3;
  DANGER[T.legionaer] = 17; THREAT_RANGE[T.legionaer] = 3;  SPEED[T.legionaer] = 4;
  DANGER[T.archer] = 17;    THREAT_RANGE[T.archer] = 2;     SPEED[T.archer] = 1;
  DANGER[T.tangolin] = 15;  THREAT_RANGE[T.tangolin] = 1;   SPEED[T.tangolin] = 2;
  DANGER[T.zenturio] = 26;  THREAT_RANGE[T.zenturio] = 4;   SPEED[T.zenturio] = 5;

  /* Holz ist genau das wert, was es einkauft: die Figuren kosten 1–3 Holz und
     sind 260–780 wert, also rund 210 je Holz. Ist Holz billiger bewertet, wirkt
     jedes Ausbilden wie geschenkter Wert – die Suche jagt dann am Horizont
     Ausbildungszüge statt echten Vorteilen nach. */
  var WOOD_VALUE = 210;
  var COST = [0, 1, 1, 2, 2, 2, 2, 3];
  var DIRECTIONAL = [false, false, false, true, true, false, false, false];

  var KIND_MOVE = 0, KIND_CAPTURE = 1, KIND_HARVEST = 2, KIND_SHOOT = 3,
      KIND_TRAIN = 4, KIND_ROTATE = 5, KIND_CHAIN = 6;
  var KEEP = 15;                // "Blickrichtung beibehalten"

  var INF = 1e9, WIN = 500000;

  function mk(kind, from, to, extra) {
    return kind | (from << 3) | (to << 15) | (extra << 27);
  }
  function mvKind(m) { return m & 7; }
  function mvFrom(m) { return (m >> 3) & 4095; }
  function mvTo(m) { return (m >> 15) & 4095; }
  function mvExtra(m) { return (m >> 27) & 15; }

  /* ---------------- Geometrie (einmal je Brett) ---------------- */

  function geometry(board) {
    if (board.__geo) return board.__geo;
    var keys = board.keys, n = keys.length, idx = {}, i, d;
    for (i = 0; i < n; i++) idx[keys[i]] = i;
    function at(q, r) { var k = H.key(q, r); return (k in idx) ? idx[k] : -1; }

    var nb = new Int16Array(n * 6), diag = new Int16Array(n * 6),
        far2 = new Int16Array(n * 6), far3 = new Int16Array(n * 6),
        qs = new Int16Array(n), rs = new Int16Array(n);

    for (i = 0; i < n; i++) {
      var c = board.cells[keys[i]];
      qs[i] = c.q; rs[i] = c.r;
      for (d = 0; d < 6; d++) {
        var v = H.DIRS[d], g = H.DIAGS[d];
        nb[i * 6 + d] = at(c.q + v[0], c.r + v[1]);
        far2[i * 6 + d] = at(c.q + 2 * v[0], c.r + 2 * v[1]);
        far3[i * 6 + d] = at(c.q + 3 * v[0], c.r + 3 * v[1]);
        diag[i * 6 + d] = at(c.q + g[0], c.r + g[1]);
      }
    }
    // Distanztabelle für Wirtschafts- und Sicherheitsterme
    var dist = new Uint8Array(n * n);
    for (i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      var dq = qs[i] - qs[j], dr = rs[i] - rs[j];
      dist[i * n + j] = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    }
    /* Nur die Landfelder, einmal vorgemerkt. Die Bewertung läuft an jedem Blatt
       einmal übers Brett, und auf Wasser steht nie ein Baum und nie eine Figur.
       Seit das Brett einen Wasserrand hat, ist gut die Hälfte aller Felder
       Wasser – sie jedes Mal mitzuzählen wäre die Hälfte der Arbeit umsonst. */
    var landList = [];
    for (i = 0; i < n; i++) {
      if (board.cells[keys[i]].terrain !== 'water') landList.push(i);
    }
    var land = new Int32Array(landList);

    board.__geo = { n: n, keys: keys, idx: idx, nb: nb, diag: diag, land: land,
                    far2: far2, far3: far3, dist: dist, qs: qs, rs: rs };
    return board.__geo;
  }

  /* ---------------- Momentaufnahme des Spielstands ---------------- */

  function snapshot(state) {
    var geo = geometry(state.board), n = geo.n, np = state.players.length;
    var s = {
      geo: geo, n: n, np: np,
      terrain: new Uint8Array(n), tree: new Uint8Array(n), boat: new Uint8Array(n),
      pt: new Int8Array(n), po: new Int8Array(n), pf: new Int8Array(n),
      wood: new Int32Array(np), alive: new Uint8Array(np), zent: new Uint8Array(np),
      kingAt: new Int16Array(np), team: new Int16Array(np)
    };
    s.pt.fill(-1); s.po.fill(-1); s.kingAt.fill(-1);
    for (var i = 0; i < n; i++) {
      var c = state.board.cells[geo.keys[i]];
      s.terrain[i] = c.terrain === 'water' ? 1 : 0;
      s.tree[i] = c.tree ? 1 : 0;
      s.boat[i] = c.boat ? 1 : 0;
      if (c.piece) {
        s.pt[i] = T[c.piece.type];
        s.po[i] = c.piece.owner;
        s.pf[i] = c.piece.facing | 0;
        if (c.piece.type === 'king') s.kingAt[c.piece.owner] = i;
      }
    }
    var teams = state.teams || (state.board && state.board.teams);
    for (var p = 0; p < np; p++) {
      s.wood[p] = state.players[p].wood;
      s.alive[p] = state.players[p].eliminated ? 0 : 1;
      s.zent[p] = state.players[p].trained.zenturio ? 1 : 0;
      // Ohne Mannschaften spielt jeder für sich: dann ist jeder seine eigene
      s.team[p] = teams ? teams[p] : p;
    }
    return s;
  }

  /* Feld, auf dem eine Figur stehen kann. Wasser gehört dazu – es kostet aber
     ein Boot, siehe stepCost. */
  function landable(s, i) { return i >= 0 && s.tree[i] === 0; }

  /* Land ohne Boot – für Kettensprünge und Ausbildungsfelder */
  function dryLand(s, i) { return i >= 0 && s.terrain[i] === 0 && s.tree[i] === 0; }

  /* Dieselbe Regel wie in moves.js: Verbündete schlägt man nicht, und für den
     Tangolin sind sie Sprungbretter wie eigene Figuren. */
  function allied(s, a, b) { return a === b || s.team[a] === s.team[b]; }

  /* Steht auf dem Feld eine Figur der Gegenseite? */
  function feindAuf(s, i, p) { return s.pt[i] >= 0 && !allied(s, s.po[i], p); }

  /* Lebt die eigene Seite noch? Verloren ist die Suche erst, wenn die ganze
     Mannschaft vom Brett ist – ein Spieler kann fallen und seine Seite trotzdem
     gewinnen. Spielt jeder für sich, ist das genau der Spieler selbst. */
  function seiteLebt(s, me) {
    for (var p = 0; p < s.np; p++) {
      if (s.alive[p] && s.kingAt[p] >= 0 && allied(s, p, me)) return true;
    }
    return false;
  }

  /* Steht überhaupt noch jemand auf der anderen Seite? */
  function gegnerLeben(s, me) {
    for (var p = 0; p < s.np; p++) if (s.alive[p] && !allied(s, p, me)) return true;
    return false;
  }

  /* Was kostet der Schritt von `from` nach `to`? -1 heißt: nicht möglich. */
  function stepCost(s, from, to, wood) {
    if (!landable(s, to)) return -1;
    if (s.terrain[to] === 0) return 0;
    if (from >= 0 && s.terrain[from] === 1) return 0;   // Boot fährt mit
    if (s.boat[to]) return 0;
    return wood >= 1 ? 1 : -1;
  }

  function nextAlive(s, p) {
    for (var k = 1; k <= s.np; k++) {
      var q = (p + k) % s.np;
      if (s.alive[q]) return q;
    }
    return p;
  }

  function hasType(s, owner, type) {
    for (var i = 0; i < s.n; i++) if (s.po[i] === owner && s.pt[i] === type) return true;
    return false;
  }


  /* ---------------- Richtungshilfen ---------------- */

  var DIRVEC = [], WEDGEVEC = [];
  for (var _d = 0; _d < 6; _d++) { DIRVEC.push(H.dirVector(_d)); WEDGEVEC.push(H.wedgeVector(_d)); }

  function towards(geo, from, to, vecs) {
    var dq = geo.qs[to] - geo.qs[from], dr = geo.rs[to] - geo.rs[from];
    var x = 1.5 * dq, y = 1.7320508 * (dr + dq / 2);
    var best = 0, bv = -1e9;
    for (var d = 0; d < 6; d++) {
      var val = x * vecs[d].x + y * vecs[d].y;
      if (val > bv) { bv = val; best = d; }
    }
    return best;
  }

  /* ---------------- Zuggenerierung ---------------- */

  var genSpots = [];

  /* ---------------- Kettensprünge des Tangolins ----------------
     Dieselbe Regel wie in moves.js: über Bäume und eigene Einheiten, nie über
     Wasser und nie über eine gegnerische Figur. Ein Sprung schlägt nichts und
     ändert nichts am Brett – gesucht wird deshalb in die Breite, und jedes Feld
     wird genau einmal betreten. Weicht das hier vom Regelwerk ab, spielt die KI
     Züge, die es gar nicht gibt – test/ki.js vergleicht beide Generatoren Zug
     für Zug. */
  var chainStamp = null, chainMark = 0, chainList = [], chainQueue = [];

  function chainSearch(s, from, p) {
    var n = s.n, nb = s.geo.nb;
    if (!chainStamp || chainStamp.length < n) chainStamp = new Int32Array(n);
    chainMark++;
    chainList.length = 0;
    chainQueue.length = 0;
    chainStamp[from] = chainMark;
    chainQueue.push(from);
    while (chainQueue.length) {
      var pos = chainQueue.pop();
      for (var d = 0; d < 6; d++) {
        var over = nb[pos * 6 + d];
        if (over < 0 || s.terrain[over] === 1) continue;      // nie über Wasser
        // Übersprungen werden dürfen nur Bäume und eigene Einheiten
        if (!s.tree[over] && !(s.pt[over] >= 0 && allied(s, s.po[over], p))) continue;
        var land = nb[over * 6 + d];
        if (!dryLand(s, land) || s.pt[land] >= 0) continue;
        if (chainStamp[land] === chainMark) continue;
        chainStamp[land] = chainMark;
        chainQueue.push(land);
        chainList.push(land);
      }
    }
    return chainList;
  }

  /* Blickrichtungen, die für eine Richtungsfigur in Frage kommen:
     die aktuelle, eine zum feindlichen Turm und eine zur nächsten Feindfigur.
     Mehr braucht die Suche nicht – alles andere deckt der reine Drehzug ab. */
  function facingOptions(s, i, ctx) {
    var cur = s.pf[i], type = s.pt[i];
    var vecs = (type === T.springer) ? WEDGEVEC : DIRVEC;
    var opts = ctx.fbuf; opts.length = 0;
    opts.push(cur);
    if (ctx.enemyKing >= 0) {
      var a = towards(s.geo, i, ctx.enemyKing, vecs);
      if (a !== cur) opts.push(a);
    }
    if (ctx.enemyPiece >= 0) {
      var b = towards(s.geo, i, ctx.enemyPiece, vecs);
      if (opts.indexOf(b) < 0) opts.push(b);
    }
    return opts;
  }

  function pushFacings(out, kind, from, to, facings) {
    for (var k = 0; k < facings.length; k++) out.push(mk(kind, from, to, facings[k]));
  }

  function genMoves(s, p, out, capturesOnly) {
    var geo = s.geo, n = s.n, nb = geo.nb, i, d, j;
    out.length = 0;

    // Kontext: nächstes Feindziel (für sinnvolle Blickrichtungen)
    var ctx = { enemyKing: -1, enemyPiece: -1, fbuf: [] };
    var bestK = 1e9, bestP = 1e9, myKing = s.kingAt[p];
    var have = 0;                                   // Bitmaske der eigenen Figurentypen
    var myZent = -1;                                // Feldzeichen: zweiter Anker der Kette
    for (i = 0; i < n; i++) {
      if (s.po[i] < 0) continue;
      if (s.po[i] === p) {
        have |= (1 << s.pt[i]);
        if (s.pt[i] === T.zenturio) myZent = i;
        continue;
      }
      if (allied(s, s.po[i], p)) continue;          // Verbündete sind kein Ziel
      if (myKing >= 0) {
        var dd = geo.dist[myKing * n + i];
        if (s.pt[i] === T.king && dd < bestK) { bestK = dd; ctx.enemyKing = i; }
        if (dd < bestP) { bestP = dd; ctx.enemyPiece = i; }
      }
    }

    for (i = 0; i < n; i++) {
      if (s.po[i] !== p) continue;
      var type = s.pt[i];

      if (type === T.worker) {
        for (d = 0; d < 6; d++) {
          j = nb[i * 6 + d];
          if (j < 0) continue;
          if (s.tree[j]) { if (!capturesOnly) out.push(mk(KIND_HARVEST, i, j, KEEP)); continue; }
          if (stepCost(s, i, j, s.wood[p]) < 0) continue;
          if (s.pt[j] < 0) { if (!capturesOnly) out.push(mk(KIND_MOVE, i, j, KEEP)); }
          else if (!allied(s, s.po[j], p)) out.push(mk(KIND_CAPTURE, i, j, KEEP));
        }

      } else if (type === T.samurai) {
        for (d = 0; d < 6; d++) {
          j = geo.diag[i * 6 + d];
          if (stepCost(s, i, j, s.wood[p]) < 0) continue;
          if (s.pt[j] < 0) { if (!capturesOnly) out.push(mk(KIND_MOVE, i, j, KEEP)); }
          else if (!allied(s, s.po[j], p)) out.push(mk(KIND_CAPTURE, i, j, KEEP));
        }

      } else if (type === T.springer) {
        var fac = capturesOnly ? null : facingOptions(s, i, ctx);
        var w = s.pf[i] % 6;
        for (var a = 0; a < 2; a++) {
          var dd2 = (w + a) % 6;
          for (var b = 0; b < 2; b++) {
            j = (b === 0) ? geo.far2[i * 6 + dd2] : geo.far3[i * 6 + dd2];
            if (stepCost(s, i, j, s.wood[p]) < 0) continue;
            if (s.pt[j] < 0) {
              if (!capturesOnly) pushFacings(out, KIND_MOVE, i, j, fac);
            } else if (!allied(s, s.po[j], p)) {
              if (capturesOnly) out.push(mk(KIND_CAPTURE, i, j, KEEP));
              else pushFacings(out, KIND_CAPTURE, i, j, fac);
            }
          }
        }

      } else if (type === T.legionaer || type === T.zenturio) {
        var fac2 = (capturesOnly || type === T.zenturio) ? null : facingOptions(s, i, ctx);
        var dirs = (type === T.zenturio) ? [0, 1, 2, 3, 4, 5]
                                         : [s.pf[i] % 6, (s.pf[i] + 3) % 6];
        for (var q = 0; q < dirs.length; q++) {
          var dir = dirs[q], cur = i;
          var carrying = s.terrain[i] === 1, cost = 0;
          for (;;) {
            cur = nb[cur * 6 + dir];
            if (cur < 0 || s.tree[cur]) break;
            if (s.terrain[cur] === 1) {
              if (!carrying) {
                if (!s.boat[cur]) { if (cost + 1 > s.wood[p]) break; cost++; }
                carrying = true;
              }
            } else {
              carrying = false;
            }
            if (s.pt[cur] >= 0) {
              if (!allied(s, s.po[cur], p)) {
                if (fac2) pushFacings(out, KIND_CAPTURE, i, cur, fac2);
                else out.push(mk(KIND_CAPTURE, i, cur, KEEP));
              }
              break;
            }
            if (!capturesOnly) {
              if (fac2) pushFacings(out, KIND_MOVE, i, cur, fac2);
              else out.push(mk(KIND_MOVE, i, cur, KEEP));
            }
          }
        }

      } else if (type === T.archer) {
        for (d = 0; d < 6; d++) {                       // Schuss auf Distanz 2
          j = geo.far2[i * 6 + d];
          if (j >= 0 && feindAuf(s, j, p)) out.push(mk(KIND_SHOOT, i, j, KEEP));
        }
        if (!capturesOnly) for (d = 0; d < 6; d++) {    // Laufen ohne zu schlagen
          j = nb[i * 6 + d];
          if (stepCost(s, i, j, s.wood[p]) >= 0 && s.pt[j] < 0) out.push(mk(KIND_MOVE, i, j, KEEP));
        }

      } else if (type === T.tangolin) {
        for (d = 0; d < 6; d++) {
          j = nb[i * 6 + d];
          if (stepCost(s, i, j, s.wood[p]) < 0) continue;
          if (s.pt[j] < 0) { if (!capturesOnly) out.push(mk(KIND_MOVE, i, j, KEEP)); }
          else if (!allied(s, s.po[j], p)) out.push(mk(KIND_CAPTURE, i, j, KEEP));
        }
        if (!capturesOnly) {                            // Kettensprünge schlagen nichts
          var ziele = chainSearch(s, i, p);
          for (var ci = 0; ci < ziele.length; ci++) out.push(mk(KIND_CHAIN, i, ziele[ci], KEEP));
        }

      } else if (type === T.king) {
        if (s.wood[p] >= 1) {
          for (d = 0; d < 6; d++) {
            j = nb[i * 6 + d];
            var kc = stepCost(s, i, j, s.wood[p] - 1);
            if (kc < 0 || kc + 1 > s.wood[p]) continue;
            if (s.pt[j] < 0) { if (!capturesOnly) out.push(mk(KIND_MOVE, i, j, KEEP)); }
            else if (!allied(s, s.po[j], p)) out.push(mk(KIND_CAPTURE, i, j, KEEP));
          }
        }
      }

      // Reine Drehung als vollwertiger Zug
      if (!capturesOnly && DIRECTIONAL[type]) {
        for (d = 0; d < 6; d++) if (d !== s.pf[i]) out.push(mk(KIND_ROTATE, i, i, d));
      }
    }

    if (capturesOnly || myKing < 0) return out;

    // Ausbilden: freie Felder an der mit dem Turm verbundenen Kette
    var spots = clusterSpots(s, p, genSpots, myZent);
    if (!spots.length) return out;
    for (var t = 1; t < 8; t++) {
      if (COST[t] > s.wood[p]) continue;
      if (have & (1 << t)) continue;                 // nur eine Figur je Typ
      if (t === T.zenturio && s.zent[p]) continue;   // Zenturio nur einmal pro Partie
      for (var sp = 0; sp < spots.length; sp++) {
        var cell = spots[sp];
        if (DIRECTIONAL[t]) {
          var fo = facingOptions(s, cell, ctx);
          for (var fi = 0; fi < fo.length; fi++) {
            out.push(mk(KIND_TRAIN, t | (fo[fi] << 4), cell, KEEP));
          }
        } else {
          out.push(mk(KIND_TRAIN, t, cell, KEEP));
        }
      }
    }
    return out;
  }

  /* Freie Felder rund um die Einheitenkette. Anker sind der Königs-Turm und –
     als Träger des Feldzeichens – der Zenturio; `zent` ist sein Feld oder -1.
     Beide Aufrufer kennen es aus einem Durchlauf, den sie ohnehin machen, damit
     hier nicht in jedem Knoten das ganze Brett abgesucht werden muss. */
  function clusterSpots(s, p, spots, zent) {
    spots = spots || [];
    spots.length = 0;
    var king = s.kingAt[p];
    if (king < 0) return spots;
    var nb = s.geo.nb, seen = {}, stack = [king], seenSpot = {};
    seen[king] = 1;
    if (zent >= 0 && zent !== king && s.po[zent] === p) { seen[zent] = 1; stack.push(zent); }
    while (stack.length) {
      var cur = stack.pop();
      for (var d = 0; d < 6; d++) {
        var j = nb[cur * 6 + d];
        if (j < 0) continue;
        if (s.po[j] === p) { if (!seen[j]) { seen[j] = 1; stack.push(j); } continue; }
        if (s.pt[j] < 0 && dryLand(s, j) && !seenSpot[j]) {
          seenSpot[j] = 1; spots.push(j);
        }
      }
    }
    return spots;
  }

  /* ---------------- Bootsbewegung ---------------- */

  /* Felder, die die Figur unterwegs tatsächlich betritt. */
  function pathIndices(s, type, from, to) {
    if (type !== T.legionaer && type !== T.zenturio) return [to];
    var nb = s.geo.nb;
    for (var d = 0; d < 6; d++) {
      var cur = from, path = [];
      for (var k = 0; k < 24; k++) {
        cur = nb[cur * 6 + d];
        if (cur < 0) break;
        path.push(cur);
        if (cur === to) return path;
      }
    }
    return [to];
  }

  /* Wie das Regelwerk: Kosten, aufgenommene und zurückgelassene Boote. */
  function planFor(s, type, from, to) {
    var path = pathIndices(s, type, from, to);
    var carrying = (from >= 0 && s.terrain[from] === 1), cost = 0;
    var takes = [], drops = [], prev = from;
    for (var i = 0; i < path.length; i++) {
      var c = path[i];
      if (s.terrain[c] === 1) {
        if (!carrying) { if (s.boat[c]) takes.push(c); else cost++; carrying = true; }
      } else if (carrying) { drops.push(prev); carrying = false; }
      prev = c;
    }
    return { cost: cost, takes: takes, drops: drops, endOnWater: carrying };
  }

  /* ---------------- Zug ausführen und zurücknehmen ---------------- */

  /* Eine Figur vom Brett nehmen – für den Schlag und für den Schuss. Alles
     Nötige zum Zurücknehmen landet in `u`.

     Fällt ein Königs-Turm, scheidet sein Spieler aus: seine ganze Armee kommt
     vom Brett und sein Holz wechselt den Besitzer. */
  function takeAt(s, idx, p, u) {
    var t = s.pt[idx], o = s.po[idx];
    if (!u.taken) u.taken = [];
    u.taken.push(idx, t, o, s.pf[idx]);
    s.pt[idx] = -1; s.po[idx] = -1; s.pf[idx] = 0;

    if (t !== T.king) {
      var beute = Math.ceil(COST[t] / 2);
      u.loot += beute;
      s.wood[p] += beute;
      return;
    }
    // Königs-Turm: Spieler scheidet aus
    var weg = [];
    for (var i = 0; i < s.n; i++) {
      if (s.po[i] === o) {
        weg.push(i, s.pt[i], s.pf[i]);
        s.pt[i] = -1; s.po[i] = -1; s.pf[i] = 0;
      }
    }
    if (!u.elims) u.elims = [];
    u.elims.push({ p: o, removed: weg, steal: s.wood[o] });
    s.wood[p] += s.wood[o];
    s.wood[o] = 0;
    s.alive[o] = 0;
    s.kingAt[o] = -1;
  }

  function make(s, mv, p) {
    var kind = mvKind(mv), from = mvFrom(mv), to = mvTo(mv), extra = mvExtra(mv);
    var u = { mv: mv, p: p, taken: null, elims: null, hadTree: 0,
              spend: 0, oldF: -1, zentBefore: 0,
              boatCost: 0, boatWas: null, loot: 0 };

    if (kind === KIND_ROTATE) { u.oldF = s.pf[from]; s.pf[from] = extra; return u; }

    if (kind === KIND_TRAIN) {
      var type = from & 15, facing = (from >> 4) & 15;
      u.spend = COST[type];
      s.wood[p] -= u.spend;
      s.pt[to] = type; s.po[to] = p; s.pf[to] = facing;
      if (type === T.zenturio) { u.zentBefore = s.zent[p]; s.zent[p] = 1; }
      return u;
    }

    // Geschlagene Figur einsammeln (Schuss und Schlag)
    if (kind === KIND_CAPTURE || kind === KIND_SHOOT) takeAt(s, to, p, u);

    if (kind === KIND_SHOOT) return u;                 // Bogenschütze bleibt stehen

    if (kind === KIND_HARVEST) { u.hadTree = 1; s.tree[to] = 0; s.wood[p] += 1; }
    if (s.pt[from] === T.king) { u.spend = 1; s.wood[p] -= 1; }

    // Boote: bezahlen, mitnehmen, zurücklassen
    var plan = planFor(s, s.pt[from], from, to);
    if (plan.cost || plan.takes.length || plan.drops.length || plan.endOnWater) {
      var was = [];
      function setBoat(idx, val) {
        if (s.boat[idx] === val) return;
        was.push(idx, s.boat[idx]);
        s.boat[idx] = val;
      }
      plan.takes.forEach(function (c) { setBoat(c, 0); });
      plan.drops.forEach(function (c) { setBoat(c, 1); });
      if (plan.endOnWater) setBoat(to, 1);
      u.boatWas = was.length ? was : null;
      u.boatCost = plan.cost;
      s.wood[p] -= plan.cost;
    }

    // Figur versetzen
    var mt = s.pt[from], mf = s.pf[from];
    u.oldF = mf;
    s.pt[from] = -1; s.po[from] = -1; s.pf[from] = 0;
    s.pt[to] = mt; s.po[to] = p; s.pf[to] = (extra === KEEP) ? mf : extra;
    if (mt === T.king) s.kingAt[p] = to;
    return u;
  }

  function unmake(s, u) {
    var mv = u.mv, kind = mvKind(mv), from = mvFrom(mv), to = mvTo(mv), p = u.p;

    if (kind === KIND_ROTATE) { s.pf[from] = u.oldF; return; }

    if (kind === KIND_TRAIN) {
      var type = from & 15;
      s.pt[to] = -1; s.po[to] = -1; s.pf[to] = 0;
      s.wood[p] += u.spend;
      if (type === T.zenturio) s.zent[p] = u.zentBefore;
      return;
    }

    if (kind !== KIND_SHOOT) {
      if (u.boatWas) {
        for (var b = u.boatWas.length - 2; b >= 0; b -= 2) s.boat[u.boatWas[b]] = u.boatWas[b + 1];
      }
      if (u.boatCost) s.wood[p] += u.boatCost;
      var mt = s.pt[to], mf = s.pf[to];
      s.pt[to] = -1; s.po[to] = -1; s.pf[to] = 0;
      s.pt[from] = mt; s.po[from] = p; s.pf[from] = u.oldF;
      if (mt === T.king) s.kingAt[p] = from;
      if (u.hadTree) { s.tree[to] = 1; s.wood[p] -= 1; }
      if (u.spend && s.pt[from] === T.king) s.wood[p] += u.spend;
    }

    /* Geschlagenes zurück aufs Brett – in umgekehrter Reihenfolge, damit ein
       ausgeschiedener Spieler seine Armee wiederbekommt, bevor die Figur
       zurückkehrt, die ihn gekostet hat. */
    if (u.elims) {
      for (var e = u.elims.length - 1; e >= 0; e--) {
        var el = u.elims[e];
        s.wood[p] -= el.steal;
        s.wood[el.p] = el.steal;
        s.alive[el.p] = 1;
        for (var k = 0; k < el.removed.length; k += 3) {
          var idx = el.removed[k];
          s.pt[idx] = el.removed[k + 1];
          s.po[idx] = el.p;
          s.pf[idx] = el.removed[k + 2];
          if (s.pt[idx] === T.king) s.kingAt[el.p] = idx;
        }
      }
    }
    if (u.loot) s.wood[p] -= u.loot;
    if (u.taken) {
      for (var t = u.taken.length - 4; t >= 0; t -= 4) {
        var ti = u.taken[t];
        s.pt[ti] = u.taken[t + 1]; s.po[ti] = u.taken[t + 2]; s.pf[ti] = u.taken[t + 3];
        // Der geschlagene Turm stand nicht in der Armee-Liste – seine Position fehlt sonst
        if (s.pt[ti] === T.king) s.kingAt[s.po[ti]] = ti;
      }
    }
  }


  /* ---------------- Angriffskarte ----------------
     Für jeden Spieler: auf welchen Feldern könnte er schlagen? Felder mit eigenen
     Figuren zählen mit – so ergibt sich zugleich, wer wen deckt. */

  /* Beweglichkeit zählt nur Landfelder: Aufs Wasser kommt nur, wer ein Boot
     kauft. Seit das Brett von einem Wasserrand umgeben ist, bekäme sonst jede
     Figur an der Küste einen Bonus dafür, dass neben ihr das Meer liegt.
     Die Angriffskarte selbst schließt Wasser weiter ein – dort kann eine Figur
     im Boot stehen, und die ist schlagbar. */
  function addAttacks(s, i, atk, base, mob, p) {
    var type = s.pt[i], geo = s.geo, nb = geo.nb, d, j, cur, count = 0;

    if (type === T.worker || type === T.tangolin) {
      for (d = 0; d < 6; d++) { j = nb[i * 6 + d]; if (landable(s, j)) { atk[base + j]++; if (s.terrain[j] === 0) count++; } }

    } else if (type === T.samurai) {
      for (d = 0; d < 6; d++) { j = geo.diag[i * 6 + d]; if (landable(s, j)) { atk[base + j]++; if (s.terrain[j] === 0) count++; } }

    } else if (type === T.springer) {
      var w = s.pf[i] % 6;
      for (var a = 0; a < 2; a++) {
        var dd = (w + a) % 6;
        j = geo.far2[i * 6 + dd]; if (landable(s, j)) { atk[base + j]++; if (s.terrain[j] === 0) count++; }
        j = geo.far3[i * 6 + dd]; if (landable(s, j)) { atk[base + j]++; if (s.terrain[j] === 0) count++; }
      }

    } else if (type === T.legionaer || type === T.zenturio) {
      var dirs = (type === T.zenturio) ? 6 : 2;
      for (var q = 0; q < dirs; q++) {
        var dir = (type === T.zenturio) ? q : ((s.pf[i] + q * 3) % 6);
        cur = i;
        for (;;) {
          cur = nb[cur * 6 + dir];
          if (cur < 0 || s.terrain[cur] === 1 || s.tree[cur]) break;
          atk[base + cur]++; if (s.terrain[cur] === 0) count++;
          if (s.pt[cur] >= 0) break;
        }
      }

    } else if (type === T.archer) {
      for (d = 0; d < 6; d++) { j = geo.far2[i * 6 + d]; if (j >= 0) { atk[base + j]++; if (s.terrain[j] === 0) count++; } }

    } else if (type === T.king) {
      if (s.wood[p] >= 1) {
        for (d = 0; d < 6; d++) { j = nb[i * 6 + d]; if (landable(s, j)) { atk[base + j]++; if (s.terrain[j] === 0) count++; } }
      }
    }
    mob[p] += count;
  }

  /* ---------------- Stellungsbewertung ---------------- */

  var evalSpots = [];

  function evaluate(s, me, ctx) {
    var n = s.n, np = s.np, geo = s.geo, dist = geo.dist, i, k, p;

    if (!seiteLebt(s, me)) return -WIN;
    if (!gegnerLeben(s, me)) return WIN;

    var atk = ctx.atk, mob = ctx.mob, sc = ctx.sc;
    var occ = ctx.occ, trees = ctx.trees, workerAt = ctx.workerAt, zentAt = ctx.zentAt;
    atk.fill(0); mob.fill(0); sc.fill(0); workerAt.fill(-1); zentAt.fill(-1);

    // Nur für die Analyse: Anteile der einzelnen Terme mitschreiben
    var parts = ctx.explain ? (ctx.parts = []) : null;
    function part(pl, name, v) { if (parts && v) parts.push({ p: pl, name: name, v: Math.round(v) }); }

    /* Ein einziger Durchlauf über die Landfelder – danach nur noch kurze Listen.
       Auf Wasser steht weder Baum noch Figur; der Wasserrand des Bretts bleibt
       hier also außen vor. */
    var landIdx = geo.land, nland = landIdx.length;
    var nocc = 0, ntree = 0;
    for (k = 0; k < nland; k++) {
      i = landIdx[k];
      if (s.tree[i]) trees[ntree++] = i;
      var o = s.po[i];
      if (o >= 0 && s.alive[o]) {
        occ[nocc++] = i;
        if (s.pt[i] === T.worker) workerAt[o] = i;
        else if (s.pt[i] === T.zenturio) zentAt[o] = i;
      }
    }

    for (k = 0; k < nocc; k++) {
      i = occ[k];
      addAttacks(s, i, atk, s.po[i] * n, mob, s.po[i]);
    }

    for (k = 0; k < nocc; k++) {
      i = occ[k];
      var own = s.po[i], t = s.pt[i];
      var att = 0;
      for (p = 0; p < np; p++) if (s.alive[p] && !allied(s, p, own)) att += atk[p * n + i];
      var def = atk[own * n + i];

      if (t === T.king) {
        if (att > 0) { sc[own] -= 9000; part(own, 'Turm angegriffen', -9000); }
      } else {
        sc[own] += VALUE[t];
        part(own, 'Material ' + TYPES[t], VALUE[t]);
        if (att > 0) {
          var pen = def === 0 ? VALUE[t] * 0.50 : (att > def ? VALUE[t] * 0.28 : VALUE[t] * 0.06);
          sc[own] -= pen;
          part(own, 'Deckung ' + TYPES[t], -pen);
        }
      }
    }

    for (p = 0; p < np; p++) {
      if (!s.alive[p]) continue;
      sc[p] += s.wood[p] * WOOD_VALUE + mob[p] * 3;
      part(p, 'Holz', s.wood[p] * WOOD_VALUE);
      part(p, 'Beweglichkeit', mob[p] * 3);

      // Wirtschaft: ohne Arbeiter und ohne Holz ist die Partie wirtschaftlich vorbei
      var wk = workerAt[p];
      if (wk < 0) {
        sc[p] -= (s.wood[p] === 0) ? 1500 : 260;
        part(p, 'kein Arbeiter', -((s.wood[p] === 0) ? 1500 : 260));
      } else if (ntree) {
        var bestTree = 99, near = 0, row = wk * n;
        for (k = 0; k < ntree; k++) {
          var dt = dist[row + trees[k]];
          if (dt < bestTree) bestTree = dt;
          if (dt <= 3) near++;
        }
        var eco = Math.max(0, 110 - 26 * bestTree) + (near < 6 ? near : 6) * 10;
        sc[p] += eco;
        part(p, 'Wirtschaft', eco);
      }

      var king = s.kingAt[p];
      if (king < 0) continue;

      // Ohne Holz kann der Turm nicht einen einzigen Schritt ausweichen
      var mobile = s.wood[p] >= 1;
      var escapes = 0, guards = atk[p * n + king], krow = king * n;
      for (var d = 0; d < 6; d++) {
        var j = geo.nb[king * 6 + d];
        if (j < 0 || !landable(s, j) || s.pt[j] >= 0) continue;
        var hostile = 0;
        for (var q2 = 0; q2 < np; q2++) if (q2 !== p && s.alive[q2]) hostile += atk[q2 * n + j];
        if (!hostile) escapes++;
      }

      /* Abgestufter Druck: Wie viele Züge braucht jede Feindfigur, bis sie den
         Turm schlagen kann? Je näher, desto steiler der Abzug – so weicht die KI
         schon aus, wenn der Gegner noch drei Felder entfernt ist. */
      var danger = 0, soonest = 99;
      for (k = 0; k < nocc; k++) {
        var fc = occ[k];
        if (s.po[fc] === p) continue;
        var ft = s.pt[fc];
        var need = dist[krow + fc] - THREAT_RANGE[ft];
        if (need < 0) need = 0;
        var turns = Math.ceil(need / SPEED[ft]);
        if (turns < 1) turns = 1;
        if (turns > 3) continue;
        if (turns < soonest) soonest = turns;
        var f = 4 - turns;
        danger += DANGER[ft] * f * f * 0.5;
      }
      if (!mobile) danger *= 2.5;
      else if (escapes === 0) danger *= 1.8;
      else if (escapes === 1) danger *= 1.3;
      // Angriffslustige Stufen bewerten Druck auf fremde Türme höher
      if (!allied(s, p, me) && ctx.aggression > 1) danger *= ctx.aggression;
      sc[p] -= danger;
      part(p, 'Turmdruck', -danger);

      if (!mobile) {
        // Ein bewegungsunfähiger Turm mit Feind im Anmarsch ist fast verloren –
        // das muss teurer sein als jede Figur, die man für das Holz bekäme.
        var imm = 140 + (soonest <= 2 ? 750 : 0) + (soonest <= 1 ? 950 : 0);
        sc[p] -= imm;
        part(p, 'Turm ohne Holz', -imm);
      } else {
        sc[p] += (escapes < 3 ? escapes : 3) * 26;
        part(p, 'Fluchtfelder', (escapes < 3 ? escapes : 3) * 26);
      }
      sc[p] += (guards < 3 ? guards : 3) * 18;
      part(p, 'Turmdeckung', (guards < 3 ? guards : 3) * 18);

      /* Vorrücken: Figuren, die dem nächsten Feindturm nahe kommen, zählen extra.
         Nur für angriffslustige Stufen – sonst ist der Zuschlag null. */
      if (ctx.aggression > 1) {
        var push = 0;
        for (k = 0; k < nocc; k++) {
          var mc = occ[k];
          if (s.po[mc] !== p || s.pt[mc] === T.king) continue;
          var nearest = 99;
          for (var op = 0; op < np; op++) {
            if (allied(s, op, p) || !s.alive[op] || s.kingAt[op] < 0) continue;
            var dk = dist[s.kingAt[op] * n + mc];
            if (dk < nearest) nearest = dk;
          }
          if (nearest < 9) push += (9 - nearest) * 6;
        }
        push *= (ctx.aggression - 1);
        // Erst das eigene Haus: steht der Feind schon am Turm, wird nicht gestürmt
        if (soonest <= 1) push *= 0.15;
        else if (soonest <= 2) push *= 0.4;
        sc[p] += push;
        part(p, 'Vorrücken', push);
      }

      // Kann überhaupt ausgebildet werden?
      clusterSpots(s, p, evalSpots, zentAt[p]);
      var tr = evalSpots.length ? 20 + (evalSpots.length < 4 ? evalSpots.length : 4) * 7 : -90;
      sc[p] += tr;
      part(p, 'Ausbildungsfelder', tr);
    }

    /* Gerechnet wird Mannschaft gegen Mannschaft: Was die Mitglieder erreichen,
       zählt zusammen, verglichen wird mit der stärksten gegnerischen Seite.
       Spielt jeder für sich, ist jede Mannschaft ein Spieler – dann ist das
       dieselbe Rechnung wie zuvor. */
    var teamSc = {}, meins = 0;
    for (p = 0; p < np; p++) {
      if (!s.alive[p]) continue;
      var t = s.team[p];
      teamSc[t] = (teamSc[t] || 0) + sc[p];
    }
    meins = teamSc[s.team[me]] || 0;
    var bestOther = -INF;
    for (var tk in teamSc) {
      if (+tk === s.team[me]) continue;
      if (teamSc[tk] > bestOther) bestOther = teamSc[tk];
    }
    if (bestOther === -INF) return WIN;
    return meins - bestOther;
  }

  /* ---------------- Wertung bei festgefahrener Partie ----------------
     Das Regelwerk beendet eine Partie, die 50 Züge lang keinen Fortschritt
     sieht, und entscheidet nach Vermögen. Die Suche muss das kennen, sonst
     schiebt sie Figuren hin und her, bis gewertet wird. */

  function stallLimit() {
    return (typeof Game !== 'undefined' && Game.STALL_LIMIT) || 50;
  }


  function wealthOf(s, p) {
    var sum = s.wood[p];
    for (var i = 0; i < s.n; i++) {
      if (s.po[i] === p && s.pt[i] !== T.king) sum += COST[s.pt[i]];
    }
    return sum;
  }

  function piecesOf(s, p) {
    var n = 0;
    for (var i = 0; i < s.n; i++) if (s.po[i] === p) n++;
    return n;
  }

  /* Gleiche Kette wie im Regelwerk: Vermögen, Figuren, Holz, Spielerreihenfolge. */
  function adjudicationScore(s, me) {
    /* Gewertet wird je Mannschaft, wie im Regelwerk: Vermögen, Figuren und
       Holz der Mitglieder zusammen. */
    var proTeam = {};
    for (var p = 0; p < s.np; p++) {
      if (!s.alive[p]) continue;
      var t = s.team[p];
      var e = proTeam[t] || (proTeam[t] = [0, 0, 0, -t]);
      e[0] += wealthOf(s, p);
      e[1] += piecesOf(s, p);
      e[2] += s.wood[p];
    }
    var mine = proTeam[s.team[me]] || [0, 0, 0, -s.team[me]];
    var best = null;
    for (var tk in proTeam) {
      if (+tk === s.team[me]) continue;
      if (!best || cmp(proTeam[tk], best) > 0) best = proTeam[tk];
    }
    if (!best) return WIN;
    var d = cmp(mine, best);
    // Klarer Sieg, aber weniger wert als ein wirklich geschlagener Turm
    if (d > 0) return WIN - 60000 + (mine[0] - best[0]) * 100;
    if (d < 0) return -WIN + 60000 + (mine[0] - best[0]) * 100;
    return 0;
  }

  function cmp(a, b) {
    for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; }
    return 0;
  }

  /* Stellungskennung wie in game.js – damit die KI erkennt, wann ein Zug die
     dritte Wiederholung und damit die Wertung auslöst. Wird nur an der Wurzel
     gebildet; im Suchbaum wäre der Aufbau der Zeichenkette zu teuer. */
  function positionKeyOf(s, current) {
    var parts = [], keys = s.geo.keys;
    for (var i = 0; i < s.n; i++) {
      if (s.pt[i] >= 0) {
        parts.push(keys[i] + '=' + TYPES[s.pt[i]] + s.po[i] + s.pf[i] + (s.boat[i] ? 'B' : ''));
      } else if (s.boat[i]) parts.push(keys[i] + '=B');
      else if (s.tree[i]) parts.push(keys[i] + '=T');
    }
    var wood = [];
    for (var p = 0; p < s.np; p++) wood.push(s.wood[p]);
    parts.push('h' + wood.join('.'));
    parts.push('z' + current);
    return parts.join('|');
  }

  /* Bringt der Zug die Partie voran? Nur das setzt den Zähler zurück. */
  function isProgress(mv) {
    var k = mvKind(mv);
    return k === KIND_CAPTURE || k === KIND_SHOOT || k === KIND_HARVEST || k === KIND_TRAIN;
  }

  /* ---------------- Zugsortierung ---------------- */

  function moveScore(s, mv, ctx) {
    var kind = mvKind(mv), from = mvFrom(mv), to = mvTo(mv);
    if (kind === KIND_CAPTURE) return 1000000 + VALUE[s.pt[to]] * 8 - VALUE[s.pt[from]];
    if (kind === KIND_SHOOT) return 1000000 + VALUE[s.pt[to]] * 8 + 300;
    if (kind === KIND_HARVEST) return 400000;
    if (kind === KIND_TRAIN) return 300000 + VALUE[from & 15];
    return ctx.history[from * ctx.n + to];
  }

  function orderMoves(s, moves, ctx, first) {
    var scores = [];
    for (var i = 0; i < moves.length; i++) {
      scores.push(moves[i] === first ? Infinity : moveScore(s, moves[i], ctx));
    }
    for (var a = 1; a < moves.length; a++) {          // Einfügesortierung, absteigend
      var mv = moves[a], sk = scores[a], b = a - 1;
      while (b >= 0 && scores[b] < sk) { moves[b + 1] = moves[b]; scores[b + 1] = scores[b]; b--; }
      moves[b + 1] = mv; scores[b + 1] = sk;
    }
  }

  /* ---------------- Suche ---------------- */

  /* Zeitgrenze: gezählt wird nur gerechnete Zeit. Wird die Suche in Häppchen
     ausgeführt, zählen die Pausen dazwischen nicht mit – sonst wäre die
     Spielstärke davon abhängig, wie oft der Browser dazwischenfunkt. */
  /* Zeitgrenzen. Zwei Stück:
     - limit: gesamte Rechenzeit der Suche (Pausen zwischen Häppchen zählen nicht)
     - blockLimit: wie lange am Stück gerechnet werden darf. Ein einzelner tiefer
       Suchast lässt sich nicht unterbrechen; dauert er zu lange, wird die
       angefangene Tiefe verworfen und das Ergebnis der letzten fertigen Tiefe
       genommen. So bleibt die Oberfläche bedienbar. */
  function timeUp(ctx) {
    if ((++ctx.nodes & 255) === 0) {
      var imBlock = Date.now() - ctx.sliceStart;
      if (ctx.spent + imBlock > ctx.limit) ctx.stop = true;
      else if (imBlock > ctx.blockLimit) ctx.stop = true;
    }
    return ctx.stop;
  }

  function quiesce(s, player, alpha, beta, ctx, qd) {
    if (timeUp(ctx)) return 0;
    var me = ctx.me;
    if (!seiteLebt(s, me)) return -WIN + qd;
    if (!gegnerLeben(s, me)) return WIN - qd;

    var stand = evaluate(s, me, ctx);
    // Verbündete ziehen für dieselbe Seite – sie maximieren mit
    var isMe = allied(s, player, me);
    if (qd >= 4) return stand;
    if (isMe) { if (stand >= beta) return stand; if (stand > alpha) alpha = stand; }
    else { if (stand <= alpha) return stand; if (stand < beta) beta = stand; }

    var moves = ctx.qpool[qd] || (ctx.qpool[qd] = []);
    genMoves(s, player, moves, true);
    if (!moves.length) return stand;
    orderMoves(s, moves, ctx, 0);

    var best = stand;
    for (var i = 0; i < moves.length; i++) {
      var u = make(s, moves[i], player);
      var val = quiesce(s, nextAlive(s, player), alpha, beta, ctx, qd + 1);
      unmake(s, u);
      if (ctx.stop) return best;
      if (isMe) {
        if (val > best) best = val;
        if (best > alpha) alpha = best;
      } else {
        if (val < best) best = val;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    return best;
  }

  function alphabeta(s, player, depth, alpha, beta, ctx, ply, stall) {
    if (timeUp(ctx)) return 0;
    var me = ctx.me, p;
    if (!seiteLebt(s, me)) return -WIN + ply;
    if (!gegnerLeben(s, me)) return WIN - ply;
    // Festgefahren: das Regelwerk wertet aus, danach ist die Partie vorbei
    if (stall >= ctx.stallLimit) return adjudicationScore(s, me);
    if (depth <= 0) return quiesce(s, player, alpha, beta, ctx, 0);

    var moves = ctx.pool[ply] || (ctx.pool[ply] = []);
    genMoves(s, player, moves, false);
    if (!moves.length) {                                  // aussetzen
      var nx = nextAlive(s, player);
      if (nx === player) return evaluate(s, me, ctx);
      return alphabeta(s, nx, depth - 1, alpha, beta, ctx, ply + 1, stall + 1);
    }
    orderMoves(s, moves, ctx, 0);

    var isMe = allied(s, player, me);   // die eigene Seite maximiert
    var best = isMe ? -INF : INF;
    for (var i = 0; i < moves.length; i++) {
      var mv = moves[i];
      var u = make(s, mv, player);
      var val = alphabeta(s, nextAlive(s, player), depth - 1, alpha, beta, ctx, ply + 1,
                          isProgress(mv) ? 0 : stall + 1);
      unmake(s, u);
      if (ctx.stop) return (best === INF || best === -INF) ? val : best;
      if (isMe) {
        if (val > best) best = val;
        if (best > alpha) alpha = best;
      } else {
        if (val < best) best = val;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) {
        if (mvKind(mv) === KIND_MOVE) ctx.history[mvFrom(mv) * ctx.n + mvTo(mv)] += depth * depth;
        break;
      }
    }
    return best;
  }

  function makeContext(s, me, limit, aggression) {
    return {
      me: me, n: s.n, start: Date.now(), sliceStart: Date.now(), spent: 0,
      limit: limit, blockLimit: 1e9, nodes: 0, stop: false,
      aggression: aggression || 1,
      atk: new Int8Array(s.n * s.np), mob: new Int32Array(s.np),
      sc: new Float64Array(s.np), workerAt: new Int32Array(s.np),
      zentAt: new Int32Array(s.np),
      occ: new Int32Array(s.n), trees: new Int32Array(s.n),
      history: new Int32Array(s.n * s.n), pool: [], qpool: []
    };
  }

  /* slack: wie viel schlechter ein Zug sein darf, damit die KI ihn noch in
     Betracht zieht (nur für die leichte Stufe, damit sie nicht immer gleich
     spielt). Sobald slack gesetzt ist, wird die Wurzel mit vollem Fenster
     durchsucht – sonst wären die Werte nur obere Schranken und ein scheinbar
     harmloser Zug könnte in Wahrheit den Turm kosten. */
  /* aggression: wie sehr die Stufe auf Angriff spielt. 1 = ausgewogen.
     Über 1 zählt der Druck auf den gegnerischen Turm mehr und Figuren werden
     fürs Vorrücken belohnt – die schwache Stufe sucht so die Entscheidung,
     statt Figuren hin und her zu schieben, bis gewertet wird. */
  var LEVELS = {
    leicht: { limit: 150, maxDepth: 2, slack: 260, aggression: 2.2 },
    normal: { limit: 450, maxDepth: 4, slack: 0, aggression: 1 },
    stark:  { limit: 2000, maxDepth: 14, slack: 0, aggression: 1 }
  };

  /* Wurzelsuche als Schrittmaschine: `tick` rechnet höchstens `sliceMs`
     Millisekunden und kehrt zurück. So kann die Oberfläche zwischendurch
     zeichnen und auf Eingaben reagieren, statt sekundenlang einzufrieren. */
  function makeRootSearch(state, me, level) {
    var cfg = LEVELS[level] || LEVELS.normal;
    var s = snapshot(state);
    var ctx = makeContext(s, me, cfg.limit, cfg.aggression);
    ctx.stallLimit = stallLimit();

    var stall0 = state.sinceProgress || 0;
    var history = state.history || {};
    var repeatLimit = (typeof Game !== 'undefined' && Game.REPEAT_LIMIT) || 3;

    var rootMoves = [];
    genMoves(s, me, rootMoves, false);

    var best = rootMoves[0], bestScore = -INF, reached = 0, scored = null;
    var depth = 1, i = 0, localBest = -INF, localMove = rootMoves[0], vals = [];
    var finished = !rootMoves.length;

    function beginDepth() {
      orderMoves(s, rootMoves, ctx, best);
      localBest = -INF; localMove = rootMoves[0]; vals = []; i = 0;
    }
    if (!finished) beginDepth();

    function endDepth() {
      if (ctx.stop && vals.length < 2) return true;
      if (vals.length) { best = localMove; bestScore = localBest; reached = depth; scored = vals; }
      if (ctx.stop || bestScore >= WIN - 1000 || bestScore <= -WIN + 1000) return true;
      depth++;
      if (depth > cfg.maxDepth) return true;
      beginDepth();
      return false;
    }

    function tick(sliceMs, blockMs) {
      if (finished) return true;
      ctx.sliceStart = Date.now();
      ctx.blockLimit = blockMs || 1e9;
      var sliceEnd = ctx.sliceStart + sliceMs;

      for (;;) {
        if (i >= rootMoves.length) {
          if (endDepth()) { finished = true; break; }
          continue;
        }
        var mv = rootMoves[i++];
        var u = make(s, mv, me);
        var nxt = nextAlive(s, me);
        var val;
        var repKey = positionKeyOf(s, nxt);
        if ((history[repKey] || 0) + 1 >= repeatLimit) {
          // Dieser Zug führt zur dritten Wiederholung: die Partie wird gewertet
          val = adjudicationScore(s, me);
        } else {
          var alpha = (cfg.slack || localBest === -INF) ? -INF : localBest;
          val = alphabeta(s, nxt, depth - 1, alpha, INF, ctx, 1,
                          isProgress(mv) ? 0 : stall0 + 1);
        }
        unmake(s, u);

        if (ctx.stop) { if (endDepth()) finished = true; break; }
        vals.push({ mv: mv, val: val });
        if (val > localBest) { localBest = val; localMove = mv; }
        if (Date.now() >= sliceEnd) break;
      }

      ctx.spent += Date.now() - ctx.sliceStart;
      return finished;
    }

    function result() {
      if (!rootMoves.length) return null;
      var chosen = best;
      // Auf niedriger Stufe darf es auch mal ein fast so guter Zug sein – aber
      // niemals einer, der den eigenen Turm verschenkt.
      if (cfg.slack && scored && scored.length > 1) {
        var floor = bestScore - cfg.slack;
        if (floor < -WIN + 100000) floor = -WIN + 100000;
        var pool = scored.filter(function (e) { return e.val >= floor; });
        var pushing = pool.filter(function (e) { return isProgress(e.mv); });
        if (pushing.length && Math.random() < 0.8) pool = pushing;
        if (pool.length) chosen = pool[Math.floor(Math.random() * pool.length)].mv;
      }
      var out = describe(s, chosen);
      out.score = bestScore;
      out.depth = reached;
      out.nodes = ctx.nodes;
      return out;
    }

    return { tick: tick, result: result, empty: !rootMoves.length };
  }

  /* Am Stück rechnen – für Tests und alles ohne Oberfläche. */
  function chooseMove(state, me, level) {
    var rs = makeRootSearch(state, me, level);
    if (rs.empty) return null;
    while (!rs.tick(1e9)) { /* läuft bis zum Ende */ }
    return rs.result();
  }

  /* In Häppchen rechnen und danach `done` aufrufen – hält die Oberfläche wach. */
  function chooseMoveSliced(state, me, level, done, sliceMs) {
    var rs = makeRootSearch(state, me, level);
    if (rs.empty) { done(null); return; }
    var slice = sliceMs || 25;
    function schritt() {
      var fertig;
      /* 220 ms am Stück: kurz genug, dass Tippen und Schieben flüssig bleiben,
         lang genug für eine Suchtiefe mehr. Darüber bringt mehr Zeit kaum noch
         Tiefe – gemessen an Mittelspielstellungen. */
      try { fertig = rs.tick(slice, 220); }
      catch (e) { done(null, e); return; }
      if (fertig) done(rs.result(), null);
      else setTimeout(schritt, 0);
    }
    setTimeout(schritt, 0);
  }

  function describe(s, mv) {
    var geo = s.geo, kind = mvKind(mv), from = mvFrom(mv), to = mvTo(mv), extra = mvExtra(mv);
    if (kind === KIND_TRAIN) {
      return { kind: 'train', type: TYPES[from & 15], toKey: geo.keys[to], facing: (from >> 4) & 15 };
    }
    if (kind === KIND_ROTATE) {
      return { kind: 'rotate', fromKey: geo.keys[from], facing: extra };
    }
    return {
      kind: 'act', fromKey: geo.keys[from], toKey: geo.keys[to],
      action: ['move', 'capture', 'harvest', 'shoot', null, null, 'jump'][kind],
      facing: (extra === KEEP) ? null : extra
    };
  }


  /* ---------------- Ausführen über die echte Spiel-API ----------------
     Die KI schlägt nur vor; gespielt wird ausschließlich über game.js,
     damit kein Zug am Regelwerk vorbeikommt. */

  function playMove(state, desc) {
    var G = (typeof Game !== 'undefined') ? Game : null;
    if (!G) return false;
    if (!desc) return G.pass(state);

    if (desc.kind === 'rotate') return G.rotate(state, desc.fromKey, desc.facing);

    if (desc.kind === 'train') {
      var tc = state.board.cells[desc.toKey];
      if (!tc || !G.train(state, desc.type, tc.q, tc.r)) return false;
      if (state.pending) {
        if (desc.facing !== null && desc.facing !== undefined) G.rotate(state, desc.toKey, desc.facing);
        else G.endPending(state);
      }
      return true;
    }

    var from = state.board.cells[desc.fromKey], target = state.board.cells[desc.toKey];
    if (!from || !target) return false;
    var actions = G.actionsFor(state, from), match = null;
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a.q !== target.q || a.r !== target.r) continue;
      // Der Kettensprung des Tangolins heißt im Regelwerk "jump"
      if (a.kind === desc.action || (desc.action === 'move' && a.kind === 'jump')) { match = a; break; }
    }
    if (!match || !G.perform(state, from, match)) return false;
    if (state.pending) {
      if (desc.facing !== null && desc.facing !== undefined) G.rotate(state, state.pending.key, desc.facing);
      else G.endPending(state);
    }
    return true;
  }

  /* ---------------- Aufbauphase ----------------
     Jede KI sucht sich ein Heimatgebiet, pflanzt ihre Bäume als Ring darum
     und stellt später ihren Turm mitten hinein. */

  function homeIndex(state, p) {
    var geo = geometry(state.board), n = geo.n, keys = geo.keys;
    var pl = state.players[p];
    if (pl.__home !== undefined && pl.__home !== null) return pl.__home;

    /* Gegner weit weg, Verbündete in Reichweite: In einer Mannschaft ist eine
       gemeinsame Ecke mehr wert als der eigene Platz. */
    var teams = state.teams;
    function verbuendet(a, b) { return a === b || (!!teams && teams[a] === teams[b]); }
    var taken = [], mates = [];
    state.players.forEach(function (o) {
      if (o.__home === undefined || o.__home === null) return;
      if (verbuendet(o.index, p)) mates.push(o.__home);
      else taken.push(o.__home);
    });

    /* Wie viel Land liegt um ein Feld herum? Das hängt nur am Brett, nicht am
       Spieler – bei acht Spielern wäre es sonst achtmal dieselbe Rechnung über
       alle Feldpaare. */
    var space = state.board.__space, i, j;
    if (!space || space.length !== n) {
      space = new Int32Array(n);
      for (i = 0; i < n; i++) {
        if (state.board.cells[keys[i]].terrain !== 'grass') continue;
        for (j = 0; j < n; j++) {
          if (geo.dist[i * n + j] <= 2 && state.board.cells[keys[j]].terrain === 'grass') space[i]++;
        }
      }
      state.board.__space = space;
    }
    var best = -1, bestScore = -1e9;
    for (i = 0; i < n; i++) {
      if (state.board.cells[keys[i]].terrain !== 'grass') continue;
      var far = 99, nah = 99, t;
      for (t = 0; t < taken.length; t++) far = Math.min(far, geo.dist[i * n + taken[t]]);
      for (t = 0; t < mates.length; t++) nah = Math.min(nah, geo.dist[i * n + mates[t]]);
      if (far === 99) far = 10;
      var zusammen = (nah === 99) ? 0 : -Math.abs(nah - 4) * 9;
      var score = space[i] * 5 + Math.min(far, 9) * 14 + zusammen + Math.random() * 10;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    pl.__home = best;
    return best;
  }

  function chooseTree(state, p) {
    var geo = geometry(state.board), n = geo.n, keys = geo.keys;
    var home = homeIndex(state, p), best = null, bestScore = -1e9;
    for (var i = 0; i < n; i++) {
      var c = state.board.cells[keys[i]];
      if (c.terrain !== 'grass' || c.tree || c.piece) continue;
      var d = geo.dist[home * n + i];
      // Ring im Abstand 2–3: nah genug zum Ernten, aber der Turm bleibt frei
      var score = -Math.abs(d - 2.6) * 16 + Math.random() * 7;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  function chooseKing(state, p) {
    var geo = geometry(state.board), n = geo.n, keys = geo.keys;
    var G = Game, B = Board;
    var home = homeIndex(state, p), best = null, bestScore = -1e9;
    for (var i = 0; i < n; i++) {
      var c = state.board.cells[keys[i]];
      if (!G.canPlaceKing(state, c)) continue;
      var trees = 0, freeN = 0, foe = 99, mate = 99, j;
      for (j = 0; j < n; j++) {
        var d = geo.dist[i * n + j], o = state.board.cells[keys[j]];
        if (o.tree && d <= 3) trees += (4 - d);
        if (d === 1 && o.terrain === 'grass' && !o.tree && !o.piece) freeN++;
        if (o.piece && o.piece.type === 'king') {
          // Vom Gegner weg, zum Verbündeten hin – aber nicht auf den Schoß
          if (G.allied(state.teams, o.piece.owner, p)) mate = Math.min(mate, d);
          else foe = Math.min(foe, d);
        }
      }
      if (foe === 99) foe = 12;
      var zusammen = (mate === 99) ? 0 : -Math.abs(mate - 4) * 7;
      var score = trees * 9 + freeN * 20 + Math.min(foe, 9) * 10 + zusammen
                - geo.dist[home * n + i] * 6 + Math.random() * 8;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  function chooseWorker(state, p) {
    var geo = geometry(state.board), n = geo.n, keys = geo.keys, B = Board;
    var king = null;
    state.board.keys.forEach(function (k) {
      var c = state.board.cells[k];
      if (c.piece && c.piece.type === 'king' && c.piece.owner === p) king = c;
    });
    if (!king) return null;
    var best = null, bestScore = -1e9;
    H.neighbors(king).forEach(function (nbc) {
      var c = B.at(state.board, nbc);
      if (!B.isFree(c)) return;
      var i = geo.idx[H.key(c.q, c.r)], nearest = 99, j;
      for (j = 0; j < n; j++) {
        if (state.board.cells[keys[j]].tree) nearest = Math.min(nearest, geo.dist[i * n + j]);
      }
      var score = -nearest * 12 + Math.random() * 5;
      if (score > bestScore) { bestScore = score; best = c; }
    });
    return best;
  }

  /* Ein kompletter KI-Schritt, passend zur aktuellen Spielphase. */
  function step(state, level) {
    var G = Game, p = state.current;
    if (state.phase === 'trees') {
      var t = chooseTree(state, p);
      return t ? G.placeTree(state, t.q, t.r) : false;
    }
    if (state.phase === 'kings') {
      if (state.awaitWorker) {
        var w = chooseWorker(state, p);
        return w ? G.placeWorker(state, w.q, w.r) : false;
      }
      var k = chooseKing(state, p);
      return k ? G.placeKing(state, k.q, k.r) : false;
    }
    if (state.phase !== 'play') return false;
    if (state.pending) { G.endPending(state); return true; }
    var desc = chooseMove(state, p, level);
    if (!desc) { G.pass(state); return true; }
    if (!playMove(state, desc)) { G.pass(state); return true; }
    return true;
  }

  return { TYPES: TYPES, T: T, VALUE: VALUE, WOOD_VALUE: WOOD_VALUE, COST: COST,
           DIRECTIONAL: DIRECTIONAL, KIND_MOVE: KIND_MOVE, KIND_CAPTURE: KIND_CAPTURE,
           KIND_HARVEST: KIND_HARVEST, KIND_SHOOT: KIND_SHOOT, KIND_TRAIN: KIND_TRAIN,
           KIND_ROTATE: KIND_ROTATE, KIND_CHAIN: KIND_CHAIN, KEEP: KEEP, INF: INF, WIN: WIN,
           mk: mk, mvKind: mvKind, mvFrom: mvFrom, mvTo: mvTo, mvExtra: mvExtra,
           geometry: geometry, snapshot: snapshot, landable: landable,
           nextAlive: nextAlive, hasType: hasType,
           genMoves: genMoves, make: make, unmake: unmake, clusterSpots: clusterSpots,
           evaluate: evaluate, chooseMove: chooseMove, chooseMoveSliced: chooseMoveSliced,
           makeRootSearch: makeRootSearch,
           makeContext: makeContext,
           wealthOf: wealthOf, adjudicationScore: adjudicationScore,
           playMove: playMove, step: step, chooseTree: chooseTree,
           chooseKing: chooseKing, chooseWorker: chooseWorker, LEVELS: LEVELS };
})();

if (typeof module !== 'undefined') { module.exports = AI; }
