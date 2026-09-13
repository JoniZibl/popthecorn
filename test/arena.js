/* Sofort-Gefecht: Ist die Arena wirklich für jeden gleich?

   Geprüft wird nicht "sieht symmetrisch aus", sondern der harte Anspruch des
   Modus: Zu je zwei Spielern gibt es eine Deckabbildung des ganzen Bretts –
   eine Drehung oder Spiegelung um den Mittelpunkt –, die Gelände, Bäume und
   jede einzelne Figur samt Blickrichtung so verschiebt, dass aus dem einen
   Spieler der andere wird. Wo es die gibt (2, 3, 4 und 6 Spieler), kann kein
   Platz besser sein als ein anderer.

   Bei 5, 7 und 8 Spielern gibt es sie nicht – das Hexgitter hat keine fünf,
   sieben oder acht gleichwertigen Plätze. Dort wird festgehalten, wie weit es
   auseinandergeht: dass die nächsten Nachbarn bei allen gleich weit weg stehen
   und die Unterschiede erst bei den fernen Gegnern auftauchen.

   Aufruf: node test/arena.js */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Arena = require('../js/arena.js');
global.Game = require('../js/game.js');
var H = Hex, B = Board, M = Moves, G = Game, A = Arena, U = Units;

var fails = 0;
function check(name, got, want) {
  var a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log('  ok   ' + name);
  else { fails++; console.log('  FEHL ' + name + '\n       erwartet ' + b + '\n       erhalten ' + a); }
}

function partie(count, teams) {
  var namen = [];
  for (var i = 0; i < count; i++) namen.push('P' + (i + 1));
  return G.create(namen, [], teams, { mode: 'sofort', starter: 0 });
}

function zellen(state) {
  return state.board.keys.map(function (k) { return state.board.cells[k]; });
}

/* Alle zwölf Symmetrien des Hexgitters um den Mittelpunkt. */
function abbildungen() {
  var out = [];
  for (var k = 0; k < 6; k++) {
    var d = A.potenz(A.DREHUNG, k);
    out.push(d);
    out.push(A.mal(d, A.SPIEGEL));
  }
  return out;
}

function facingUnter(m, piece) {
  var def = U.DEFS[piece.type];
  if (!def.directional) return 0;
  return piece.type === 'springer' ? A.keil(m, piece.facing) : A.richtung(m, piece.facing);
}

/* Bildet `m` die ganze Stellung auf sich selbst ab? Wenn ja: welche Spieler
   werden dabei zu welchen? null heißt: keine Deckabbildung. */
function deckung(state, m) {
  var board = state.board, wird = {};
  for (var i = 0; i < board.keys.length; i++) {
    var c = board.cells[board.keys[i]];
    var ziel = A.an(m, c);
    var z = B.get(board, ziel.q, ziel.r);
    if (!z) return null;                                   // Brett fällt nicht auf sich
    if (z.terrain !== c.terrain) return null;              // Gelände passt nicht
    if (!!z.tree !== !!c.tree) return null;                // Bäume passen nicht
    if (!c.piece !== !z.piece) return null;                // hier Figur, dort keine
    if (!c.piece) continue;
    if (z.piece.type !== c.piece.type) return null;        // andere Figur
    if (z.piece.facing !== facingUnter(m, c.piece)) return null;  // andere Blickrichtung
    var vorher = wird[c.piece.owner];
    if (vorher !== undefined && vorher !== z.piece.owner) return null;  // uneinheitlich
    wird[c.piece.owner] = z.piece.owner;
  }
  return wird;
}

/* Gibt es zu jedem Spielerpaar eine Deckabbildung? */
function alleAufeinander(state) {
  var n = state.players.length;
  var deckungen = abbildungen().map(function (m) { return deckung(state, m); })
    .filter(function (d) { return !!d; });
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < n; j++) {
      var gefunden = deckungen.some(function (d) { return d[i] === j; });
      if (!gefunden) return false;
    }
  }
  return true;
}

function baeumeUm(state, cell, weite) {
  return zellen(state).filter(function (c) {
    return c.tree && H.distance(c, cell) <= weite;
  }).length;
}

function koenig(state, owner) {
  return zellen(state).filter(function (c) {
    return c.piece && c.piece.type === 'king' && c.piece.owner === owner;
  })[0];
}

function aktionen(state, owner) {
  var merk = state.current;
  state.current = owner;
  var n = 0;
  zellen(state).forEach(function (c) {
    if (c.piece && c.piece.owner === owner) n += G.actionsFor(state, c).length;
  });
  state.current = merk;
  return n;
}

var EXAKT = [2, 3, 4, 6];

console.log('Jeder startet mit derselben Armee');
[2, 3, 4, 5, 6, 7, 8].forEach(function (count) {
  var st = partie(count);
  var armeen = st.players.map(function (p) {
    return zellen(st).filter(function (c) { return c.piece && c.piece.owner === p.index; })
      .map(function (c) { return c.piece.type; }).sort().join(',');
  });
  var soll = A.LAGER.map(function (e) { return e.type; }).sort().join(',');
  check(count + ' Spieler: alle haben dieselben acht Figuren',
        armeen.filter(function (a) { return a !== soll; }).length, 0);
  check(count + ' Spieler: gleiches Startholz',
        st.players.filter(function (p) { return p.wood !== A.START_HOLZ; }).length, 0);
  check(count + ' Spieler: gleich viele Bäume am Lager',
        st.players.map(function (p) { return baeumeUm(st, koenig(st, p.index), 2); })
          .filter(function (n) { return n !== A.HAIN.length; }).length, 0);
  check(count + ' Spieler: alle Lager gleich weit von der Mitte',
        st.players.map(function (p) { return H.distance(koenig(st, p.index), { q: 0, r: 0 }); })
          .filter(function (d) { return d !== st.arena.ring; }).length, 0);
  check(count + ' Spieler: Partie läuft sofort', st.phase, 'play');
  check(count + ' Spieler: nichts auszubilden, alles steht',
        M.affordableUnits(st, 0).length, 0);
  check(count + ' Spieler: der Zenturio ist verbraucht',
        st.players[0].trained.zenturio, 1);
});

console.log('\nJedes Lager blickt zur Mitte – und nicht aufs Meer hinaus');
[2, 3, 4, 5, 6, 7, 8].forEach(function (count) {
  var st = partie(count);
  var mitte = { q: 0, r: 0 }, falsch = 0, blind = 0;
  st.players.forEach(function (p) {
    var k = koenig(st, p.index), dKing = H.distance(k, mitte);
    zellen(st).forEach(function (c) {
      if (!c.piece || c.piece.owner !== p.index) return;
      var d = H.distance(c, mitte);
      /* Vorn der Legionär, hinten Arbeiter und Zenturio. Wo die Lager nicht
         genau auf einer Gitterachse stehen (5, 7 und 8 Spieler), zeigt "außen"
         zwischen zwei Richtungen; dann darf das Hinterland gleichauf mit dem
         Turm liegen, näher an der Mitte aber nie. */
      if (c.piece.type === 'legionaer' && d >= dKing) falsch++;
      if (c.piece.type === 'zenturio' && d < dKing) falsch++;
      if (c.piece.type === 'worker' && d < dKing) falsch++;
      // und die Richtungsfiguren blicken auch dorthin, wo der Gegner steht
      if (c.piece.type === 'legionaer' || c.piece.type === 'springer') {
        var keile = c.piece.type === 'springer'
          ? H.wedgeDirs(c.piece.facing) : [c.piece.facing];
        var hin = keile.some(function (dir) {
          return H.distance(H.add(c, H.DIRS[dir]), mitte) < d;
        });
        if (!hin) blind++;
      }
    });
  });
  check(count + ' Spieler: Front vorn, Wirtschaft hinten', falsch, 0);
  check(count + ' Spieler: Legionär und Springer zeigen nach innen', blind, 0);
});

console.log('\nDeckabbildung: jeder Spieler lässt sich auf jeden anderen legen');
[2, 3, 4, 5, 6, 7, 8].forEach(function (count) {
  var st = partie(count);
  var exakt = EXAKT.indexOf(count) >= 0;
  check(count + ' Spieler: ' + (exakt ? 'spiegelgleich' : 'nicht spiegelgleich (Gitter gibt es nicht her)'),
        alleAufeinander(st), exakt);
  check(count + ' Spieler: Arena weiß das selbst', st.arena.exakt, exakt);
});

console.log('\nGleich viele Züge zur Auswahl – der schärfste Test der Gleichheit');
EXAKT.forEach(function (count) {
  var st = partie(count);
  var zahlen = st.players.map(function (p) { return aktionen(st, p.index); });
  check(count + ' Spieler: gleich viele mögliche Aktionen',
        zahlen.filter(function (z) { return z !== zahlen[0]; }).length, 0);
});

console.log('\nWo es nicht exakt geht: 5, 7 und 8 Spieler');
[5, 7, 8].forEach(function (count) {
  var st = partie(count);
  var prof = A.profile(A.plaetze(count).centers);
  // Die beiden nächsten Gegner stehen bei allen gleich weit weg
  var nah = prof.map(function (p) { return p.slice(0, 2).join('/'); });
  check(count + ' Spieler: die zwei nächsten Gegner stehen bei allen gleich',
        nah.filter(function (x) { return x !== nah[0]; }).length, 0);
  check(count + ' Spieler: Abweichung über alle Abstände bleibt klein',
        st.arena.abweichung <= 4, true);
});

console.log('\nDie Lager stehen frei und stören einander nicht');
[2, 3, 4, 5, 6, 7, 8].forEach(function (count) {
  var st = partie(count);
  check(count + ' Spieler: Lager weit genug auseinander',
        st.arena.abstand >= A.MIN_ABSTAND, true);
  var fehler = 0;
  zellen(st).forEach(function (c) {
    if (c.piece && (c.terrain !== 'grass' || c.tree)) fehler++;
  });
  check(count + ' Spieler: keine Figur im Wasser oder auf einem Baum', fehler, 0);
  var koenige = zellen(st).filter(function (c) { return c.piece && c.piece.type === 'king'; });
  check(count + ' Spieler: ein Königs-Turm je Spieler', koenige.length, count);
});

console.log('\nDas Brett selbst ist rund und damit für jede Drehung dasselbe');
[2, 5, 8].forEach(function (count) {
  var st = partie(count);
  var rand = zellen(st).filter(function (c) { return c.terrain === 'grass'; })
    .map(function (c) { return H.distance(c, { q: 0, r: 0 }); });
  check(count + ' Spieler: Land reicht genau bis zum Radius',
        Math.max.apply(null, rand), A.radiusFuer(count));
  var fehlend = 0;
  zellen(st).forEach(function (c) {
    if (c.terrain !== 'grass') return;
    var g = A.an(A.DREHUNG, c), z = B.get(st.board, g.q, g.r);
    if (!z || z.terrain !== 'grass') fehlend++;
  });
  check(count + ' Spieler: gedreht bleibt jedes Landfeld Land', fehlend, 0);
});

console.log('\nMannschaften sitzen verteilt, nicht als Block');
var vier = partie(4, [0, 0, 1, 1]);
var winkel = vier.players.map(function (p) {
  var k = koenig(vier, p.index), px = H.toPixel(k, 1);
  return { team: vier.teams[p.index], winkel: Math.atan2(px.y, px.x) };
}).sort(function (a, b) { return a.winkel - b.winkel; }).map(function (x) { return x.team; });
check('2 gegen 2: im Rund wechseln sich die Mannschaften ab',
      winkel.filter(function (t, i) { return t === winkel[(i + 1) % 4]; }).length, 0);

console.log('\nDie Aufbau-Partie bleibt, wie sie war');
var alt = G.create(['A', 'B'], []);
check('ohne Spielart beginnt die Baumphase', alt.phase, 'trees');
check('und das Brett kommt weiter aus Plättchen', alt.board.tiles.length, G.SETUP[2].tiles);
check('Holz beginnt bei 0', alt.players[0].wood, 0);

console.log(fails ? '\n' + fails + ' Fehler' : '\nDie Arena ist für jeden dieselbe.');
process.exit(fails ? 1 : 0);
