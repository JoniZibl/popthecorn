/* Hexodus – Sofort-Gefecht: die ausgerechnete Arena

   In der normalen Partie baut jeder erst auf: Bäume setzen, Turm stellen,
   Arbeiter daneben, dann Holz sammeln und Figur für Figur ausbilden. Bis die
   erste Klinge fällt, vergeht eine halbe Stunde.

   Das Sofort-Gefecht lässt diesen Aufbau weg. Jeder Spieler hat vom ersten Zug
   an seine **komplette Armee** auf dem Brett – wie im Schach – und ein paar
   Bäume, die noch zu holen sind. Gespielt wird sofort gegeneinander.

   Damit das gerecht bleibt, wird die Stellung nicht gewürfelt, sondern
   ausgerechnet: Das Brett ist eine runde Insel, alle Lager sind ein und
   dieselbe Aufstellung – nur gedreht (und, wo nötig, gespiegelt) –, und die
   Lagerplätze sind eine Bahn (Orbit) einer Symmetriegruppe des Hexgitters.
   Wo es eine solche Gruppe gibt, die jeden Spieler auf jeden anderen abbildet
   – bei 2, 3, 4 und 6 Spielern –, ist die Stellung damit **exakt spiegelgleich**:
   Es gibt zu je zwei Spielern eine Deckabbildung des ganzen Bretts, die den
   einen in den anderen überführt. Dann kann kein Platz besser sein als ein
   anderer.

   Bei 5, 7 und 8 Spielern gibt es eine solche Gruppe nicht: Die Drehgruppe des
   Hexgitters hat die Ordnung 12, und eine Bahn hat immer eine Länge, die 12
   teilt (1, 2, 3, 4, 6, 12). Fünf, sieben und acht gleichwertige Plätze liegen
   auf diesem Gitter schlicht nicht. Dort wird stattdessen gesucht: gleicher
   Abstand zur Mitte für alle, und die Lager so auf den Ring verteilt, dass die
   Abstandsprofile der Spieler so wenig wie möglich auseinanderliegen.
   `bericht()` sagt für jede Spielerzahl, was herauskommt, `test/arena.js`
   hält es fest. */
var Arena = (function () {
  'use strict';

  var H = (typeof Hex !== 'undefined') ? Hex : require('./hex.js');
  var B = (typeof Board !== 'undefined') ? Board : require('./board.js');

  /* Startholz: Ohne Holz kann der Königs-Turm keinen Schritt tun (sein Sprung
     kostet 1) und niemand ein Boot kaufen. Zwei Holz halten beides offen,
     ohne dass sich davon etwas ausbilden ließe – ausgebildet wird ohnehin
     erst, wenn eine Figur gefallen ist. */
  var START_HOLZ = 2;

  /* Die Aufstellung eines Lagers, in Versätzen zum Königs-Turm. Das Lager ist
     im Grundbild nach Südost (Richtung 0) gedreht: Dort ist außen, die
     Brettmitte liegt nach Nordwest (Richtung 3).

       vorn (zur Mitte):  der Legionär auf seiner Achse, daneben Samurai und
                          Springer, beide nach innen gerichtet
       hinten:            der Bogenschütze – er schießt über die eigene Reihe
                          hinweg –, der Arbeiter in seinem Hain und dahinter
                          der Zenturio mit dem Feldzeichen

     Der Königs-Turm steht in der Mitte, seine sechs Nachbarfelder sind belegt.
     Weiter als zwei Felder reicht kein Lager – daran hängt, wie dicht die
     Lager im Rund stehen dürfen. */
  var LAGER = [
    { type: 'king',      at: [0, 0] },
    { type: 'legionaer', at: [-1, 0], facing: 3 },   // Achse zur Mitte
    { type: 'samurai',   at: [0, -1] },
    { type: 'springer',  at: [-1, 1], facing: 3 },   // Keil NW+SW, nach innen
    { type: 'tangolin',  at: [0, 1] },
    { type: 'worker',    at: [1, -1] },
    { type: 'archer',    at: [1, 0] },
    { type: 'zenturio',  at: [2, 0] }
  ];

  /* Der Hain am Arbeiter: drei Bäume, alle in seinem Zugradius. Damit hat jeder
     vom ersten Zug an dieselbe kleine Wirtschaft – das meiste Holz steht in der
     Mitte, und dorthin ist es für alle gleich weit. */
  var HAIN = [[2, -1], [2, -2], [1, -2]];

  /* Wie weit ein Lager reicht: zwei Felder in jede Richtung, Hain eingerechnet.
     Zwei Lager können sich damit ab fünf Feldern Abstand kein Feld mehr teilen.
     Dieselbe Zahl bestimmt, wie viel Land hinter den Lagern liegt. */
  var LAGER_WEITE = 2;
  var MIN_ABSTAND = 2 * LAGER_WEITE + 1;

  /* Lagerring und Brettradius je Spielerzahl. Der Ring ist der kleinste, auf
     dem die Lager einander nicht berühren (MIN_ABSTAND) und die Abstände so
     gleich ausfallen, wie das Gitter es hergibt – klein gewählt, weil das
     Gefecht sofort losgehen soll. Hinter jedem Lager bleibt ein Feld Luft bis
     zur Küste. */
  var PLAN = {
    2: { ring: 5 },
    3: { ring: 5 },
    4: { ring: 5 },
    5: { ring: 5 },
    6: { ring: 6 },
    7: { ring: 7 },
    8: { ring: 8 }
  };

  function radiusFuer(count) { return PLAN[count].ring + LAGER_WEITE + 1; }

  /* Der Wald in der Brettmitte: alle Felder bis zu diesem Abstand vom
     Mittelpunkt tragen einen Baum. Er ist unter jeder Drehung und jeder
     Spiegelung unverändert – deshalb liegt er in jedem Aufbau für alle gleich
     weit weg, und deshalb ist er das, worum gekämpft wird. Auf den größeren
     Brettern wächst er mit, sonst reichte er für acht Armeen nicht.

     Zwischen Wald und Lagern bleibt mindestens ein Feld Luft: Die vorderste
     Figur eines Lagers steht auf `ring - 1`, der Wald hört zwei Felder davor
     auf. Mehr als drei Ringe wird er nie – ein größerer Wald wäre keine Beute
     mehr, sondern eine Mauer quer durch die Arena. */
  function mitteRadius(count) {
    return Math.min(3, Math.max(1, PLAN[count].ring - 3));
  }

  /* ---------------- Symmetrien des Hexgitters ----------------

     Als 2×2-Matrizen auf den axialen Koordinaten (q,r). Beide Abbildungen
     lassen das Gitter und jeden Abstand unverändert:

       Drehung um 60°:  (q,r) → (−r, q+r)
       Spiegelung:      (q,r) → (−q, q+r)

     Zusammen erzeugen sie die volle Symmetriegruppe des Hexgitters um den
     Mittelpunkt – zwölf Abbildungen. */
  var EINS    = [1, 0, 0, 1];
  var DREHUNG = [0, -1, 1, 1];
  var SPIEGEL = [-1, 0, 1, 1];

  function mal(a, b) {
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
            a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];
  }

  function an(m, c) {
    return { q: m[0] * c.q + m[1] * c.r, r: m[2] * c.q + m[3] * c.r };
  }

  function potenz(m, n) {
    var out = EINS;
    for (var i = 0; i < n; i++) out = mal(m, out);
    return out;
  }

  /* Wohin eine Richtung unter der Abbildung zeigt. */
  function richtung(m, d) {
    var v = an(m, { q: H.DIRS[d][0], r: H.DIRS[d][1] });
    for (var i = 0; i < 6; i++) {
      if (H.DIRS[i][0] === v.q && H.DIRS[i][1] === v.r) return i;
    }
    return d;
  }

  /* Der Springer blickt nicht in eine Richtung, sondern in einen Keil aus zwei
     benachbarten. Eine Drehung verschiebt den Keil; eine Spiegelung dreht seine
     Reihenfolge um – dann ist nicht das Bild von d der neue Keil, sondern das
     Bild von d+1. Gesucht ist die Zahl f mit {f, f+1} = Bild des alten Keils. */
  function keil(m, d) {
    var a = richtung(m, d), b = richtung(m, (d + 1) % 6);
    return (b === (a + 1) % 6) ? a : b;
  }

  /* Die Gruppe, die für `count` Lager eine Bahn der Länge `count` hat. Ihre
     Elemente bilden jeden Spieler auf jeden anderen ab – daran hängt die
     ganze Gerechtigkeit des Modus. Für 5, 7 und 8 gibt es sie nicht. */
  function gruppe(count) {
    var d3 = potenz(DREHUNG, 3);
    if (count === 2) return [EINS, d3];
    if (count === 3) return [EINS, potenz(DREHUNG, 2), potenz(DREHUNG, 4)];
    if (count === 4) return [EINS, d3, SPIEGEL, mal(d3, SPIEGEL)];
    if (count === 6) {
      return [0, 1, 2, 3, 4, 5].map(function (k) { return potenz(DREHUNG, k); });
    }
    return null;
  }

  /* ---------------- Lagerplätze ---------------- */

  /* Alle Felder im Abstand `d` vom Mittelpunkt, einmal im Kreis herum. */
  function ring(d) {
    if (d <= 0) return [{ q: 0, r: 0 }];
    var out = [], cur = { q: H.DIRS[4][0] * d, r: H.DIRS[4][1] * d };
    for (var i = 0; i < 6; i++) {
      for (var j = 0; j < d; j++) { out.push({ q: cur.q, r: cur.r }); cur = H.add(cur, H.DIRS[i]); }
    }
    return out;
  }

  /* Die Drehung, die Richtung 0 auf Richtung `d` legt. Ausgesucht wird sie,
     statt sie auszurechnen: `DREHUNG` dreht die Richtungsnummern rückwärts
     (Richtung 0 wird zu 5), und wer das im Kopf umdreht, dreht am Ende das
     ganze Lager verkehrt herum ins Feld. */
  function drehungNach(d) {
    for (var j = 0; j < 6; j++) {
      var m = potenz(DREHUNG, j);
      if (richtung(m, 0) === d) return m;
    }
    return EINS;
  }

  /* In welche Richtung das Lager auf Feld `c` blickt: nach außen, auf den
     nächstgelegenen der sechs Gittersektoren gerundet. */
  function ausrichtung(c) {
    var p = H.toPixel(c, 1), best = 0, bestCos = -Infinity;
    var laenge = Math.sqrt(p.x * p.x + p.y * p.y) || 1;
    for (var d = 0; d < 6; d++) {
      var v = H.dirVector(d);
      var cos = (v.x * p.x + v.y * p.y) / laenge;
      if (cos > bestCos) { bestCos = cos; best = d; }
    }
    return best;
  }

  /* Das Abstandsprofil eines Lagers: die Abstände zu allen anderen, sortiert.
     Sind alle Profile gleich, steht kein Spieler anders im Feld als jeder
     andere – das ist das Maß, an dem dieser Modus gemessen wird. */
  function profile(centers) {
    return centers.map(function (a) {
      return centers.filter(function (b) { return b !== a; })
        .map(function (b) { return H.distance(a, b); })
        .sort(function (x, y) { return x - y; });
    });
  }

  /* Wie weit die Profile auseinanderliegen: 0 heißt, alle Spieler haben
     dieselben Abstände zu ihren Gegnern. */
  function abweichung(centers) {
    var prof = profile(centers), summe = 0;
    if (!prof.length) return 0;
    for (var i = 0; i < prof[0].length; i++) {
      var min = Infinity, max = -Infinity;
      for (var p = 0; p < prof.length; p++) {
        if (prof[p][i] < min) min = prof[p][i];
        if (prof[p][i] > max) max = prof[p][i];
      }
      summe += max - min;
    }
    return summe;
  }

  function minAbstand(centers) {
    var min = Infinity;
    for (var i = 0; i < centers.length; i++) {
      for (var j = i + 1; j < centers.length; j++) {
        var d = H.distance(centers[i], centers[j]);
        if (d < min) min = d;
      }
    }
    return centers.length > 1 ? min : Infinity;
  }

  /* Bewertung einer Platzverteilung, kleiner ist besser: erst darf kein Lager
     einem anderen zu nahe kommen, dann zählt die Gerechtigkeit, zuletzt der
     Platz. Verglichen wird der Reihe nach. */
  function note(centers) {
    return [Math.max(0, MIN_ABSTAND - minAbstand(centers)),
            abweichung(centers),
            -minAbstand(centers)];
  }

  function besser(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] < b[i];
    }
    return false;
  }

  /* Die exakte Lösung: eine Bahn der Gruppe. Gesucht wird das Grundlager, dessen
     Bahn die Lager am weitesten auseinanderlegt – alle Bahnen sind gleich
     gerecht, aber nicht gleich geräumig. */
  function bahnPlaetze(count, d) {
    var g = gruppe(count), kandidaten = ring(d), best = null;
    for (var i = 0; i < kandidaten.length; i++) {
      var centers = g.map(function (m) { return an(m, kandidaten[i]); });
      var schluessel = {}, doppelt = false;
      centers.forEach(function (c) {
        var k = H.key(c.q, c.r);
        if (schluessel[k]) doppelt = true;
        schluessel[k] = true;
      });
      if (doppelt) continue;
      var n = note(centers);
      if (!best || besser(n, best.note)) {
        best = { note: n, basis: kandidaten[i], centers: centers, formen: g };
      }
    }
    if (!best) return null;
    /* Das Grundlager blickt nach außen; alle anderen entstehen daraus durch die
       Gruppe und blicken damit ebenso nach außen. */
    var grund = drehungNach(ausrichtung(best.basis));
    return {
      centers: best.centers,
      formen: best.formen.map(function (m) { return mal(m, grund); }),
      exakt: true
    };
  }

  /* Der Notbehelf für 5, 7 und 8 Spieler: gleich weit von der Mitte, gleich
     verteilt auf dem Ring, danach so lange einzeln verschoben, wie es die
     Abstandsprofile angleicht. Deterministisch – dieselbe Spielerzahl ergibt
     immer dieselbe Arena. */
  function ringPlaetze(count, d) {
    var felder = ring(d), n = felder.length, best = null;

    for (var off = 0; off < n; off++) {
      var idx = [];
      for (var i = 0; i < count; i++) idx.push((off + Math.round(i * n / count)) % n);
      idx = feilen(felder, idx);
      var centers = idx.map(function (k) { return felder[k]; });
      var bew = note(centers);
      if (!best || besser(bew, best.note)) best = { note: bew, centers: centers };
    }
    return {
      centers: best.centers,
      formen: best.centers.map(function (c) { return drehungNach(ausrichtung(c)); }),
      exakt: false
    };
  }

  /* Jedes Lager einzeln um ein Feld verschieben, solange das die Bewertung
     verbessert. */
  function feilen(felder, idx) {
    var n = felder.length, guard = 0;
    function centersVon(list) { return list.map(function (k) { return felder[k]; }); }
    var aktuell = note(centersVon(idx));
    var weiter = true;
    while (weiter && guard++ < 50) {
      weiter = false;
      for (var i = 0; i < idx.length; i++) {
        for (var s = -1; s <= 1; s += 2) {
          var probe = idx.slice();
          probe[i] = ((probe[i] + s) % n + n) % n;
          if (probe.some(function (k, j) { return j !== i && k === probe[i]; })) continue;
          var bew = note(centersVon(probe));
          if (besser(bew, aktuell)) { idx = probe; aktuell = bew; weiter = true; }
        }
      }
    }
    return idx;
  }

  function plaetze(count) {
    var d = PLAN[count].ring;
    return gruppe(count) ? bahnPlaetze(count, d) : ringPlaetze(count, d);
  }

  /* ---------------- Brett und Aufbau ---------------- */

  /* Die Arena ist eine runde Insel aus lauter Gras, mit dem gewohnten zwei
     Felder dicken Wasserrand. Kein Feld ist besser als ein anderes, und das
     Rund ist unter jeder Drehung und Spiegelung dasselbe – anders ließe sich
     Spiegelgleichheit gar nicht behaupten. Wasser gibt es nur ringsum: Wer
     ein Boot kauft, kann außen herum flankieren, und der Weg ist für alle
     gleich lang. */
  function brett(count) {
    return B.generateDisc(radiusFuer(count));
  }

  /* Wer sitzt auf welchem Platz? Die Plätze liegen im Kreis; die Mannschaften
     werden reihum darauf verteilt, damit Verbündete nicht zufällig in einer
     Ecke zusammensitzen, sondern gleichmäßig im Rund. */
  function sitzordnung(centers, teams) {
    var reihenfolge = centers.map(function (c, i) { return i; }).sort(function (a, b) {
      var pa = H.toPixel(centers[a], 1), pb = H.toPixel(centers[b], 1);
      return Math.atan2(pa.y, pa.x) - Math.atan2(pb.y, pb.x);
    });
    // Spieler nach Mannschaften bündeln und dann reihum auf die Plätze setzen
    var nachTeam = {}, teamListe = [];
    teams.forEach(function (t, i) {
      if (!nachTeam[t]) { nachTeam[t] = []; teamListe.push(t); }
      nachTeam[t].push(i);
    });
    var folge = [], offen = true;
    while (offen) {
      offen = false;
      teamListe.forEach(function (t) {
        if (nachTeam[t].length) { folge.push(nachTeam[t].shift()); offen = true; }
      });
    }
    var platzVon = [];
    folge.forEach(function (spieler, k) { platzVon[spieler] = reihenfolge[k]; });
    return platzVon;
  }

  /* Stellt die komplette Partie auf: Lager, Armeen, Haine, Startholz. */
  function aufbau(state, options) {
    options = options || {};
    var count = state.players.length;
    var board = state.board;
    var plan = plaetze(count);
    var platzVon = sitzordnung(plan.centers, state.teams);

    state.arena = {
      ring: PLAN[count].ring,
      radius: radiusFuer(count),
      exakt: plan.exakt,
      abweichung: abweichung(plan.centers),
      abstand: minAbstand(plan.centers),
      lager: []
    };

    /* Zuerst der Wald in der Mitte, dann die Lager: So fällt sofort auf, wenn
       sich beide ins Gehege kämen – das Lagerfeld wäre belegt und der Aufbau
       bricht ab, statt still einen Baum wegzulassen und die Symmetrie zu
       verlieren. */
    var rad = mitteRadius(count);
    board.keys.forEach(function (k) {
      var c = board.cells[k];
      if (H.distance(c, { q: 0, r: 0 }) <= rad) c.tree = true;
    });

    state.players.forEach(function (p) {
      var platz = platzVon[p.index];
      var mitte = plan.centers[platz], form = plan.formen[platz];
      state.arena.lager[p.index] = { q: mitte.q, r: mitte.r };

      LAGER.forEach(function (eintrag) {
        var v = an(form, { q: eintrag.at[0], r: eintrag.at[1] });
        var cell = B.get(board, mitte.q + v.q, mitte.r + v.r);
        if (!B.isFree(cell)) throw new Error('Arena: Lagerfeld belegt (' + eintrag.type + ')');
        var facing = 0;
        if (eintrag.facing !== undefined) {
          facing = (eintrag.type === 'springer') ? keil(form, eintrag.facing)
                                                 : richtung(form, eintrag.facing);
        }
        cell.piece = { type: eintrag.type, owner: p.index, facing: facing };
      });

      HAIN.forEach(function (off) {
        var v = an(form, { q: off[0], r: off[1] });
        var cell = B.get(board, mitte.q + v.q, mitte.r + v.r);
        if (!B.isFree(cell)) throw new Error('Arena: Hainfeld belegt');
        cell.tree = true;
      });

      p.wood = START_HOLZ;
      p.treesLeft = 0;
      // Der Zenturio steht schon im Feld: seine eine Ausbildung ist verbraucht
      p.trained.zenturio = 1;
    });

    state.phase = 'play';
    state.turn = 1;
    state.current = (typeof options.starter === 'number')
      ? options.starter
      : Math.floor(Math.random() * count);
    return state;
  }

  /* Was der Modus für eine Spielerzahl rechnerisch hergibt – für die
     Oberfläche, das Regelwerk und den Test. */
  function bericht(count) {
    var plan = plaetze(count);
    return {
      spieler: count,
      ring: PLAN[count].ring,
      radius: radiusFuer(count),
      felder: 1 + 3 * radiusFuer(count) * (radiusFuer(count) + 1),
      baeume: count * HAIN.length + (1 + 3 * mitteRadius(count) * (mitteRadius(count) + 1)),
      exakt: plan.exakt,
      abweichung: abweichung(plan.centers),
      abstand: minAbstand(plan.centers),
      profil: profile(plan.centers)[0]
    };
  }

  return {
    START_HOLZ: START_HOLZ, LAGER: LAGER, HAIN: HAIN, PLAN: PLAN,
    MIN_ABSTAND: MIN_ABSTAND, LAGER_WEITE: LAGER_WEITE,
    mitteRadius: mitteRadius, radiusFuer: radiusFuer,
    gruppe: gruppe, an: an, mal: mal, potenz: potenz, richtung: richtung, keil: keil,
    DREHUNG: DREHUNG, SPIEGEL: SPIEGEL, EINS: EINS,
    ring: ring, plaetze: plaetze, drehungNach: drehungNach, ausrichtung: ausrichtung, profile: profile, abweichung: abweichung,
    minAbstand: minAbstand, sitzordnung: sitzordnung,
    brett: brett, aufbau: aufbau, bericht: bericht
  };
})();

if (typeof module !== 'undefined') { module.exports = Arena; }
