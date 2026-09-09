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
      KIND_TRAIN = 4, KIND_ROTATE = 5;
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
    board.__geo = { n: n, keys: keys, idx: idx, nb: nb, diag: diag,
                    far2: far2, far3: far3, dist: dist, qs: qs, rs: rs };
    return board.__geo;
  }

  /* ---------------- Momentaufnahme des Spielstands ---------------- */

  function snapshot(state) {
    var geo = geometry(state.board), n = geo.n, np = state.players.length;
    var s = {
      geo: geo, n: n, np: np,
      terrain: new Uint8Array(n), tree: new Uint8Array(n),
      pt: new Int8Array(n), po: new Int8Array(n), pf: new Int8Array(n),
      wood: new Int32Array(np), alive: new Uint8Array(np), zent: new Uint8Array(np),
      kingAt: new Int16Array(np)
    };
    s.pt.fill(-1); s.po.fill(-1); s.kingAt.fill(-1);
    for (var i = 0; i < n; i++) {
      var c = state.board.cells[geo.keys[i]];
      s.terrain[i] = c.terrain === 'water' ? 1 : 0;
      s.tree[i] = c.tree ? 1 : 0;
      if (c.piece) {
        s.pt[i] = T[c.piece.type];
        s.po[i] = c.piece.owner;
        s.pf[i] = c.piece.facing | 0;
        if (c.piece.type === 'king') s.kingAt[c.piece.owner] = i;
      }
    }
    for (var p = 0; p < np; p++) {
      s.wood[p] = state.players[p].wood;
      s.alive[p] = state.players[p].eliminated ? 0 : 1;
      s.zent[p] = state.players[p].trained.zenturio ? 1 : 0;
    }
    return s;
  }

  function landable(s, i) { return i >= 0 && s.terrain[i] === 0 && s.tree[i] === 0; }

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

  var visitStamp = null, visitMark = 0, genSpots = [];

  function ensureScratch(n) {
    if (!visitStamp || visitStamp.length < n) visitStamp = new Int32Array(n);
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
    ensureScratch(n);

    // Kontext: nächstes Feindziel (für sinnvolle Blickrichtungen)
    var ctx = { enemyKing: -1, enemyPiece: -1, fbuf: [] };
    var bestK = 1e9, bestP = 1e9, myKing = s.kingAt[p];
    var have = 0;                                   // Bitmaske der eigenen Figurentypen
    for (i = 0; i < n; i++) {
      if (s.po[i] < 0) continue;
      if (s.po[i] === p) { have |= (1 << s.pt[i]); continue; }
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
          if (j < 0 || s.terrain[j] === 1) continue;
          if (s.tree[j]) { if (!capturesOnly) out.push(mk(KIND_HARVEST, i, j, KEEP)); continue; }
          if (s.pt[j] < 0) { if (!capturesOnly) out.push(mk(KIND_MOVE, i, j, KEEP)); }
          else if (s.po[j] !== p) out.push(mk(KIND_CAPTURE, i, j, KEEP));
        }

      } else if (type === T.samurai) {
        for (d = 0; d < 6; d++) {
          j = geo.diag[i * 6 + d];
          if (!landable(s, j)) continue;
          if (s.pt[j] < 0) { if (!capturesOnly) out.push(mk(KIND_MOVE, i, j, KEEP)); }
          else if (s.po[j] !== p) out.push(mk(KIND_CAPTURE, i, j, KEEP));
        }

      } else if (type === T.springer) {
        var fac = capturesOnly ? null : facingOptions(s, i, ctx);
        var w = s.pf[i] % 6;
        for (var a = 0; a < 2; a++) {
          var dd2 = (w + a) % 6;
          for (var b = 0; b < 2; b++) {
            j = (b === 0) ? geo.far2[i * 6 + dd2] : geo.far3[i * 6 + dd2];
            if (!landable(s, j)) continue;
            if (s.pt[j] < 0) {
              if (!capturesOnly) pushFacings(out, KIND_MOVE, i, j, fac);
            } else if (s.po[j] !== p) {
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
          for (;;) {
            cur = nb[cur * 6 + dir];
            if (cur < 0 || s.terrain[cur] === 1 || s.tree[cur]) break;
            if (s.pt[cur] >= 0) {
              if (s.po[cur] !== p) {
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
          if (j >= 0 && s.pt[j] >= 0 && s.po[j] !== p) out.push(mk(KIND_SHOOT, i, j, KEEP));
        }
        if (!capturesOnly) for (d = 0; d < 6; d++) {    // Laufen ohne zu schlagen
          j = nb[i * 6 + d];
          if (landable(s, j) && s.pt[j] < 0) out.push(mk(KIND_MOVE, i, j, KEEP));
        }

      } else if (type === T.tangolin) {
        for (d = 0; d < 6; d++) {
          j = nb[i * 6 + d];
          if (!landable(s, j)) continue;
          if (s.pt[j] < 0) { if (!capturesOnly) out.push(mk(KIND_MOVE, i, j, KEEP)); }
          else if (s.po[j] !== p) out.push(mk(KIND_CAPTURE, i, j, KEEP));
        }
        if (!capturesOnly) {                            // Kettensprünge
          visitMark++;
          var stack = [i]; visitStamp[i] = visitMark;
          while (stack.length) {
            var pos = stack.pop();
            for (d = 0; d < 6; d++) {
              var over = nb[pos * 6 + d];
              if (over < 0 || s.terrain[over] === 1) continue;
              var jumpable = s.tree[over] || (s.pt[over] >= 0 && s.po[over] === p);
              if (!jumpable) continue;
              var land = nb[over * 6 + d];
              if (!landable(s, land) || s.pt[land] >= 0) continue;
              if (visitStamp[land] === visitMark) continue;
              visitStamp[land] = visitMark;
              stack.push(land);
              out.push(mk(KIND_MOVE, i, land, KEEP));
            }
          }
        }

      } else if (type === T.king) {
        if (s.wood[p] >= 1) {
          for (d = 0; d < 6; d++) {
            j = nb[i * 6 + d];
            if (!landable(s, j)) continue;
            if (s.pt[j] < 0) { if (!capturesOnly) out.push(mk(KIND_MOVE, i, j, KEEP)); }
            else if (s.po[j] !== p) out.push(mk(KIND_CAPTURE, i, j, KEEP));
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
    var spots = clusterSpots(s, p, genSpots);
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

  /* Freie Felder rund um die mit dem Königs-Turm verbundene Einheitenkette */
  function clusterSpots(s, p, spots) {
    spots = spots || [];
    spots.length = 0;
    var king = s.kingAt[p];
    if (king < 0) return spots;
    var nb = s.geo.nb, seen = {}, stack = [king], seenSpot = {};
    seen[king] = 1;
    while (stack.length) {
      var cur = stack.pop();
      for (var d = 0; d < 6; d++) {
        var j = nb[cur * 6 + d];
        if (j < 0) continue;
        if (s.po[j] === p) { if (!seen[j]) { seen[j] = 1; stack.push(j); } continue; }
        if (s.pt[j] < 0 && s.terrain[j] === 0 && s.tree[j] === 0 && !seenSpot[j]) {
          seenSpot[j] = 1; spots.push(j);
        }
      }
    }
    return spots;
  }

  /* ---------------- Zug ausführen und zurücknehmen ---------------- */

  function make(s, mv, p) {
    var kind = mvKind(mv), from = mvFrom(mv), to = mvTo(mv), extra = mvExtra(mv);
    var u = { mv: mv, p: p, capT: -1, capO: -1, capF: 0, hadTree: 0,
              spend: 0, oldF: -1, removed: null, steal: 0, elim: -1, zentBefore: 0 };

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
    if (kind === KIND_CAPTURE || kind === KIND_SHOOT) {
      u.capT = s.pt[to]; u.capO = s.po[to]; u.capF = s.pf[to];
      s.pt[to] = -1; s.po[to] = -1; s.pf[to] = 0;
      if (u.capT === T.king) {
        u.elim = u.capO;
        u.removed = [];
        for (var i = 0; i < s.n; i++) {
          if (s.po[i] === u.capO) {
            u.removed.push(i, s.pt[i], s.pf[i]);
            s.pt[i] = -1; s.po[i] = -1; s.pf[i] = 0;
          }
        }
        u.steal = s.wood[u.capO];
        s.wood[p] += u.steal;
        s.wood[u.capO] = 0;
        s.alive[u.capO] = 0;
        s.kingAt[u.capO] = -1;
      }
    }

    if (kind === KIND_SHOOT) return u;                 // Bogenschütze bleibt stehen

    if (kind === KIND_HARVEST) { u.hadTree = 1; s.tree[to] = 0; s.wood[p] += 1; }
    if (s.pt[from] === T.king) { u.spend = 1; s.wood[p] -= 1; }

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
      var mt = s.pt[to], mf = s.pf[to];
      s.pt[to] = -1; s.po[to] = -1; s.pf[to] = 0;
      s.pt[from] = mt; s.po[from] = p; s.pf[from] = u.oldF;
      if (mt === T.king) s.kingAt[p] = from;
      if (u.hadTree) { s.tree[to] = 1; s.wood[p] -= 1; }
      if (u.spend && s.pt[from] === T.king) s.wood[p] += u.spend;
    }

    if (u.elim >= 0) {
      s.wood[p] -= u.steal;
      s.wood[u.elim] = u.steal;
      s.alive[u.elim] = 1;
      for (var k = 0; k < u.removed.length; k += 3) {
        var idx = u.removed[k];
        s.pt[idx] = u.removed[k + 1];
        s.po[idx] = u.elim;
        s.pf[idx] = u.removed[k + 2];
        if (s.pt[idx] === T.king) s.kingAt[u.elim] = idx;
      }
    }
    if (u.capT >= 0) {
      s.pt[to] = u.capT; s.po[to] = u.capO; s.pf[to] = u.capF;
      // Der geschlagene Turm stand nicht in u.removed – seine Position fehlt sonst
      if (u.capT === T.king) s.kingAt[u.capO] = to;
    }
  }


  /* ---------------- Angriffskarte ----------------
     Für jeden Spieler: auf welchen Feldern könnte er schlagen? Felder mit eigenen
     Figuren zählen mit – so ergibt sich zugleich, wer wen deckt. */

  function addAttacks(s, i, atk, base, mob, p) {
    var type = s.pt[i], geo = s.geo, nb = geo.nb, d, j, cur, count = 0;

    if (type === T.worker || type === T.tangolin) {
      for (d = 0; d < 6; d++) { j = nb[i * 6 + d]; if (landable(s, j)) { atk[base + j]++; count++; } }

    } else if (type === T.samurai) {
      for (d = 0; d < 6; d++) { j = geo.diag[i * 6 + d]; if (landable(s, j)) { atk[base + j]++; count++; } }

    } else if (type === T.springer) {
      var w = s.pf[i] % 6;
      for (var a = 0; a < 2; a++) {
        var dd = (w + a) % 6;
        j = geo.far2[i * 6 + dd]; if (landable(s, j)) { atk[base + j]++; count++; }
        j = geo.far3[i * 6 + dd]; if (landable(s, j)) { atk[base + j]++; count++; }
      }

    } else if (type === T.legionaer || type === T.zenturio) {
      var dirs = (type === T.zenturio) ? 6 : 2;
      for (var q = 0; q < dirs; q++) {
        var dir = (type === T.zenturio) ? q : ((s.pf[i] + q * 3) % 6);
        cur = i;
        for (;;) {
          cur = nb[cur * 6 + dir];
          if (cur < 0 || s.terrain[cur] === 1 || s.tree[cur]) break;
          atk[base + cur]++; count++;
          if (s.pt[cur] >= 0) break;
        }
      }

    } else if (type === T.archer) {
      for (d = 0; d < 6; d++) { j = geo.far2[i * 6 + d]; if (j >= 0) { atk[base + j]++; count++; } }

    } else if (type === T.king) {
      if (s.wood[p] >= 1) {
        for (d = 0; d < 6; d++) { j = nb[i * 6 + d]; if (landable(s, j)) { atk[base + j]++; count++; } }
      }
    }
    mob[p] += count;
  }

  /* ---------------- Stellungsbewertung ---------------- */

  var evalSpots = [];

  function evaluate(s, me, ctx) {
    var n = s.n, np = s.np, geo = s.geo, dist = geo.dist, i, k, p;

    if (!s.alive[me] || s.kingAt[me] < 0) return -WIN;
    var others = 0;
    for (p = 0; p < np; p++) if (p !== me && s.alive[p]) others++;
    if (others === 0) return WIN;

    var atk = ctx.atk, mob = ctx.mob, sc = ctx.sc;
    var occ = ctx.occ, trees = ctx.trees, workerAt = ctx.workerAt;
    atk.fill(0); mob.fill(0); sc.fill(0); workerAt.fill(-1);

    // Nur für die Analyse: Anteile der einzelnen Terme mitschreiben
    var parts = ctx.explain ? (ctx.parts = []) : null;
    function part(pl, name, v) { if (parts && v) parts.push({ p: pl, name: name, v: Math.round(v) }); }

    // Ein einziger Durchlauf über das Brett – danach nur noch kurze Listen
    var nocc = 0, ntree = 0;
    for (i = 0; i < n; i++) {
      if (s.tree[i]) trees[ntree++] = i;
      var o = s.po[i];
      if (o >= 0 && s.alive[o]) {
        occ[nocc++] = i;
        if (s.pt[i] === T.worker) workerAt[o] = i;
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
      for (p = 0; p < np; p++) if (p !== own && s.alive[p]) att += atk[p * n + i];
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

      // Kann überhaupt ausgebildet werden?
      clusterSpots(s, p, evalSpots);
      var tr = evalSpots.length ? 20 + (evalSpots.length < 4 ? evalSpots.length : 4) * 7 : -90;
      sc[p] += tr;
      part(p, 'Ausbildungsfelder', tr);
    }

    var bestOther = -INF;
    for (p = 0; p < np; p++) if (p !== me && s.alive[p] && sc[p] > bestOther) bestOther = sc[p];
    return sc[me] - bestOther;
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

  function timeUp(ctx) {
    if ((++ctx.nodes & 255) === 0 && Date.now() - ctx.start > ctx.limit) ctx.stop = true;
    return ctx.stop;
  }

  function quiesce(s, player, alpha, beta, ctx, qd) {
    if (timeUp(ctx)) return 0;
    var me = ctx.me;
    if (!s.alive[me] || s.kingAt[me] < 0) return -WIN + qd;
    var others = 0;
    for (var p = 0; p < s.np; p++) if (p !== me && s.alive[p]) others++;
    if (!others) return WIN - qd;

    var stand = evaluate(s, me, ctx);
    var isMe = (player === me);
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

  function alphabeta(s, player, depth, alpha, beta, ctx, ply) {
    if (timeUp(ctx)) return 0;
    var me = ctx.me, p;
    if (!s.alive[me] || s.kingAt[me] < 0) return -WIN + ply;
    var others = 0;
    for (p = 0; p < s.np; p++) if (p !== me && s.alive[p]) others++;
    if (!others) return WIN - ply;
    if (depth <= 0) return quiesce(s, player, alpha, beta, ctx, 0);

    var moves = ctx.pool[ply] || (ctx.pool[ply] = []);
    genMoves(s, player, moves, false);
    if (!moves.length) {                                  // aussetzen
      var nx = nextAlive(s, player);
      if (nx === player) return evaluate(s, me, ctx);
      return alphabeta(s, nx, depth - 1, alpha, beta, ctx, ply + 1);
    }
    orderMoves(s, moves, ctx, 0);

    var isMe = (player === me);
    var best = isMe ? -INF : INF;
    for (var i = 0; i < moves.length; i++) {
      var mv = moves[i];
      var u = make(s, mv, player);
      var val = alphabeta(s, nextAlive(s, player), depth - 1, alpha, beta, ctx, ply + 1);
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

  function makeContext(s, me, limit) {
    return {
      me: me, n: s.n, start: Date.now(), limit: limit, nodes: 0, stop: false,
      atk: new Int8Array(s.n * s.np), mob: new Int32Array(s.np),
      sc: new Float64Array(s.np), workerAt: new Int32Array(s.np),
      occ: new Int32Array(s.n), trees: new Int32Array(s.n),
      history: new Int32Array(s.n * s.n), pool: [], qpool: []
    };
  }

  /* slack: wie viel schlechter ein Zug sein darf, damit die KI ihn noch in
     Betracht zieht (nur für die leichte Stufe, damit sie nicht immer gleich
     spielt). Sobald slack gesetzt ist, wird die Wurzel mit vollem Fenster
     durchsucht – sonst wären die Werte nur obere Schranken und ein scheinbar
     harmloser Zug könnte in Wahrheit den Turm kosten. */
  var LEVELS = {
    leicht: { limit: 150, maxDepth: 2, slack: 260 },
    normal: { limit: 450, maxDepth: 4, slack: 0 },
    stark:  { limit: 2000, maxDepth: 14, slack: 0 }
  };

  /* Besten Zug suchen. Liefert eine Beschreibung, die die Oberfläche
     in echte Spielzüge übersetzt – oder null, wenn nichts möglich ist. */
  function chooseMove(state, me, level) {
    var cfg = LEVELS[level] || LEVELS.normal;
    var s = snapshot(state);
    var ctx = makeContext(s, me, cfg.limit);
    var rootMoves = [];
    genMoves(s, me, rootMoves, false);
    if (!rootMoves.length) return null;

    var best = rootMoves[0], bestScore = -INF, reached = 0, scored = null;

    for (var depth = 1; depth <= cfg.maxDepth; depth++) {
      orderMoves(s, rootMoves, ctx, best);
      var localBest = -INF, localMove = rootMoves[0], vals = [];
      for (var i = 0; i < rootMoves.length; i++) {
        var u = make(s, rootMoves[i], me);
        // Mit slack brauchen alle Wurzelzüge echte Werte, nicht nur Schranken
        var alpha = (cfg.slack || localBest === -INF) ? -INF : localBest;
        var val = alphabeta(s, nextAlive(s, me), depth - 1, alpha, INF, ctx, 1);
        unmake(s, u);
        if (ctx.stop) break;
        vals.push({ mv: rootMoves[i], val: val });
        if (val > localBest) { localBest = val; localMove = rootMoves[i]; }
      }
      if (ctx.stop && vals.length < 2) break;
      if (vals.length) {
        best = localMove; bestScore = localBest; reached = depth; scored = vals;
      }
      if (ctx.stop || bestScore >= WIN - 1000 || bestScore <= -WIN + 1000) break;
    }

    // Auf niedriger Stufe darf es auch mal ein fast so guter Zug sein – aber
    // niemals einer, der den eigenen Turm verschenkt.
    if (cfg.slack && scored && scored.length > 1) {
      var floor = bestScore - cfg.slack;
      if (floor < -WIN + 100000) floor = -WIN + 100000;
      var pool = scored.filter(function (e) { return e.val >= floor; });
      if (pool.length) best = pool[Math.floor(Math.random() * pool.length)].mv;
    }

    var out = describe(s, best);
    out.score = bestScore;
    out.depth = reached;
    out.nodes = ctx.nodes;
    return out;
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
      action: ['move', 'capture', 'harvest', 'shoot'][kind],
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

    var taken = [];
    state.players.forEach(function (o) {
      if (o.__home !== undefined && o.__home !== null) taken.push(o.__home);
    });

    var space = new Int32Array(n), i, j;
    for (i = 0; i < n; i++) {
      if (state.board.cells[keys[i]].terrain !== 'grass') continue;
      for (j = 0; j < n; j++) {
        if (geo.dist[i * n + j] <= 2 && state.board.cells[keys[j]].terrain === 'grass') space[i]++;
      }
    }
    var best = -1, bestScore = -1e9;
    for (i = 0; i < n; i++) {
      if (state.board.cells[keys[i]].terrain !== 'grass') continue;
      var far = 99;
      for (var t = 0; t < taken.length; t++) far = Math.min(far, geo.dist[i * n + taken[t]]);
      if (far === 99) far = 10;
      var score = space[i] * 5 + Math.min(far, 9) * 14 + Math.random() * 10;
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
      var trees = 0, freeN = 0, foe = 99, j;
      for (j = 0; j < n; j++) {
        var d = geo.dist[i * n + j], o = state.board.cells[keys[j]];
        if (o.tree && d <= 3) trees += (4 - d);
        if (d === 1 && o.terrain === 'grass' && !o.tree && !o.piece) freeN++;
        if (o.piece && o.piece.type === 'king') foe = Math.min(foe, d);
      }
      if (foe === 99) foe = 12;
      var score = trees * 9 + freeN * 20 + Math.min(foe, 9) * 10
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
           KIND_ROTATE: KIND_ROTATE, KEEP: KEEP, INF: INF, WIN: WIN,
           mk: mk, mvKind: mvKind, mvFrom: mvFrom, mvTo: mvTo, mvExtra: mvExtra,
           geometry: geometry, snapshot: snapshot, landable: landable,
           nextAlive: nextAlive, hasType: hasType,
           genMoves: genMoves, make: make, unmake: unmake, clusterSpots: clusterSpots,
           evaluate: evaluate, chooseMove: chooseMove, makeContext: makeContext,
           playMove: playMove, step: step, chooseTree: chooseTree,
           chooseKing: chooseKing, chooseWorker: chooseWorker, LEVELS: LEVELS };
})();

if (typeof module !== 'undefined') { module.exports = AI; }
