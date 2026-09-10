/* Prüft die 3D-Darstellung aus js/render.js ohne Browser: ein winziges
   DOM-Gerüst nimmt die erzeugten SVG-Knoten entgegen, geprüft wird das
   Ergebnis. Aufruf: node test/ansicht.js

   Die Darstellung hat keine Regeln, aber drei Eigenschaften, auf die sich die
   Bedienung verlässt: jedes Feld bleibt anklickbar, jede Zahl bleibt endlich,
   und gemalt wird von hinten nach vorn. Genau das steht hier. */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fehler = 0;
function ok(bedingung, text) {
  console.log((bedingung ? '  ok   ' : '  FEHL ') + text);
  if (!bedingung) fehler++;
}

/* ---------------- Ein DOM, das gerade genug kann ---------------- */

function knoten(name) {
  return {
    nodeName: name, attrs: {}, children: [], parentNode: null, textContent: '',
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return this.attrs.hasOwnProperty(k) ? this.attrs[k] : null; },
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) {
      var i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    get firstChild() { return this.children[0] || null; },
    querySelector: function () { return null; }
  };
}

var behaelter = knoten('div');
behaelter.getBoundingClientRect = function () { return { width: 960, height: 640 }; };

var umgebung = {
  console: console,
  document: { createElementNS: function (ns, name) { return knoten(name); } }
};
vm.createContext(umgebung);
['hex', 'units', 'board', 'moves', 'game', 'scene', 'render'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'),
                  umgebung, { filename: f + '.js' });
});
var Render = umgebung.Render, Game = umgebung.Game, Hex = umgebung.Hex,
    Board = umgebung.Board, Scene = umgebung.Scene;

/* ---------------- Eine Stellung mit allem, was gezeichnet wird ---------------- */

var state = Game.create(['Eins', 'Zwei'], [null, null]);
Game.autoPlaceTrees(state);
// Türme und Arbeiter setzen, bis die Partie läuft
var schutz = 0;
while (state.phase === 'kings' && schutz++ < 400) {
  var frei = state.board.keys.filter(function (k) {
    var c = state.board.cells[k];
    return state.awaitWorker
      ? Board.isFree(c) && Hex.neighbors(c).some(function (nb) {
          var n = Board.at(state.board, nb);
          return n && n.piece && n.piece.type === 'king' && n.piece.owner === state.current;
        })
      : Game.canPlaceKing(state, c);
  });
  if (!frei.length) break;
  var ziel = state.board.cells[frei[0]];
  if (state.awaitWorker) Game.placeWorker(state, ziel.q, ziel.r);
  else Game.placeKing(state, ziel.q, ziel.r);
}
ok(state.phase === 'play', 'Aufbau abgeschlossen, Partie läuft');

/* Richtungsfiguren dazustellen: Springer und Legionär tragen ihre Blickrichtung
   als Pfeil auf dem Boden – ohne sie bliebe dieser Teil der Darstellung ungeprüft. */
var landfrei = state.board.keys.filter(function (k) { return Board.isFree(state.board.cells[k]); });
[['springer', 2], ['legionaer', 5]].forEach(function (paar, i) {
  var c = state.board.cells[landfrei[i]];
  if (c) c.piece = { type: paar[0], owner: 0, facing: paar[1] };
});

/* Spuren gefallener Figuren: Wo jemand gestorben ist, liegen Splitter in seiner
   Farbe – dauerhaft und immer an derselben Stelle. */
var spurFeld = state.board.cells[landfrei[3]];
if (spurFeld) spurFeld.scars = [0, 1, 0];

/* Der Zenturio gehört dem Spieler am Zug: Gezeichnet wird die Versorgungskette
   von ihm, und nur dessen Feldzeichen bekommt seinen Ring. */
var zentFeld = state.board.cells[landfrei[2]];
if (zentFeld) zentFeld.piece = { type: 'zenturio', owner: state.current, facing: 0 };

// ein Boot ins Wasser legen, damit auch das gezeichnet wird
var wasser = state.board.keys.filter(function (k) { return state.board.cells[k].terrain === 'water'; });
if (wasser.length) state.board.cells[wasser[0]].boat = true;

var koenig = state.board.keys.filter(function (k) {
  var c = state.board.cells[k];
  return c.piece && c.piece.type === 'king';
})[0];
state.selected = koenig;

// eine Markierung mit Holzkosten (Bootsfahrt) erzwingen, damit auch das
// Kostenschild gezeichnet wird
var markierungen = Game.actionsFor(state, state.board.cells[koenig]);
if (markierungen.length) markierungen[0].cost = 1;

var kontext = {
  markers: markierungen,
  placeable: null,
  lastMove: { fromKey: koenig, toKey: koenig },
  chain: umgebung.Moves.supplyChain(state.board, state.current),
  chainColor: '#3b82f6'
};

/* ---------------- Prüfungen ---------------- */

function alleKnoten(n, aus) {
  aus = aus || [];
  aus.push(n);
  n.children.forEach(function (c) { alleKnoten(c, aus); });
  return aus;
}

function zahlenPruefen(view, wo) {
  var schlecht = 0;
  alleKnoten(view.root).forEach(function (n) {
    ['points', 'transform', 'x1', 'y1', 'x2', 'y2', 'd'].forEach(function (a) {
      var v = n.attrs[a];
      if (v && /NaN|Infinity|undefined/.test(v)) schlecht++;
    });
  });
  ok(schlecht === 0, wo + ': keine ungültige Koordinate (' + schlecht + ' gefunden)');
}

var view = Render.create(behaelter);
ok(view.cam.pitch === Render.TILT, 'das Brett startet in der Schrägsicht');

[[Render.FLAT, 0], [Render.TILT, 0], [Render.TILT, 137], [Scene.MIN_PITCH, 300]]
  .forEach(function (winkel) {
    var name = 'Neigung ' + winkel[0] + '°, Drehung ' + winkel[1] + '°';
    console.log('\n' + name);
    Scene.set(view.cam, winkel[0], winkel[1]);
    Render.fit(view, state.board);
    Render.draw(view, state, kontext);

    var felder = view.layers.scene.children;
    ok(felder.length === state.board.keys.length,
       'jedes Feld wird gezeichnet (' + felder.length + ')');
    var mitSchluessel = felder.filter(function (g) { return g.getAttribute('data-key'); });
    ok(mitSchluessel.length === felder.length, 'jedes Feld bleibt anklickbar');

    // von hinten nach vorn: der Kameraabstand darf nie wieder wachsen
    var tiefen = felder.map(function (g) {
      return view.anchors[g.getAttribute('data-key')].depth;
    });
    var sortiert = tiefen.every(function (t, i) { return i === 0 || t <= tiefen[i - 1] + 1e-9; });
    ok(sortiert, 'gezeichnet wird von hinten nach vorn');

    zahlenPruefen(view, name);

    var baeume = 0, figuren = 0, boote = 0, waende = 0;
    alleKnoten(view.layers.scene).forEach(function (n) {
      var cls = n.attrs['class'] || '';
      if (cls.indexOf('tree-top') === 0) baeume++;
      if (cls.indexOf('piece piece-') === 0) figuren++;
      if (cls === 'boat-hull') boote++;
      if (cls === 'hex-side') waende++;
    });
    ok(figuren === 7, 'alle Figuren stehen auf dem Brett (' + figuren + ')');

    // Spuren gefallener Figuren liegen auf ihrem Feld
    var splitter = alleKnoten(view.layers.scene).filter(function (n) {
      return (n.attrs['class'] || '') === 'scar';
    });
    ok(splitter.length === 3, 'drei Splitter liegen auf dem Kampffeld (' + splitter.length + ')');
    ok(splitter.every(function (n) { return /^#/.test(n.attrs.fill || ''); }),
       'jeder trägt die Farbe seines Spielers');

    // Das Feldzeichen des Zenturios ist der zweite Anker der Versorgungskette
    var ringe = alleKnoten(view.layers.overlay).filter(function (n) {
      return (n.attrs['class'] || '') === 'supply-anchor';
    });
    ok(ringe.length === 1, 'der Zenturio trägt den Ring des Feldzeichens (' + ringe.length + ')');

    var pfeile = 0, schilder = 0;
    alleKnoten(view.layers.scene).forEach(function (n) {
      if ((n.attrs['class'] || '') === 'facing') pfeile++;
    });
    alleKnoten(view.layers.markers).forEach(function (n) {
      if ((n.attrs['class'] || '') === 'cost-badge') schilder++;
    });
    // Springer: ein Keilpfeil, Legionär: zwei Pfeile für seine Achse
    ok(pfeile === 3, 'Richtungspfeile liegen auf dem Boden (' + pfeile + ')');
    ok(schilder === (markierungen.length ? 1 : 0), 'Kosten stehen am Zielfeld');
    ok(baeume > 0, 'Bäume stehen im Wald');
    ok(boote === (wasser.length ? 1 : 0), 'das Boot liegt im Wasser');
    if (winkel[0] === Render.FLAT) {
      ok(waende === 0, 'aus der Draufsicht ist keine Seitenwand zu sehen');
    } else {
      ok(waende > 0, 'die Platte zeigt ihre Kanten (' + waende + ' Wände)');
    }
    ok(view.layers.markers.children.length === kontext.markers.length,
       'alle Zugmarkierungen liegen auf dem Brett');
  });

console.log('\nDraufsicht deckt sich mit dem flachen Brett');
Scene.set(view.cam, Render.FLAT, 0);
Render.draw(view, state, kontext);
var abweichung = 0;
state.board.keys.forEach(function (k) {
  var c = state.board.cells[k];
  var soll = Hex.toPixel(c, Render.SIZE);
  var ist = view.anchors[k];
  // nur Landfelder: Wasser liegt tiefer in der Platte und rückt dadurch
  // auch von oben ein wenig näher an die Kamera
  if (c.terrain !== 'grass') return;
  if (Math.hypot(ist.x - soll.x, ist.y - soll.y) > 1e-9) abweichung++;
});
ok(abweichung === 0, 'von oben liegt jedes Landfeld exakt auf seinem alten Platz');

console.log('\nRichtungswähler rund um die Figur');
/* Wartet das Spiel auf eine Richtung, liegen sechs Pfeile auf dem Brett –
   einer je Richtung, der aktuelle hervorgehoben. Sie tragen ihre Richtung im
   Knoten, denn daran hängt die Oberfläche den Klick auf. */
var richtungsFeld = landfrei[0];
Scene.set(view.cam, Render.TILT, 25);
Render.draw(view, state, {
  markers: [], placeable: null, lastMove: null, chain: null,
  facing: { key: richtungsFeld, type: 'springer', current: 4, color: '#3b82f6' }
});
var picks = view.layers.markers.children.filter(function (g) {
  return (g.attrs['class'] || '').indexOf('facing-pick') === 0;
});
ok(picks.length === 6, 'sechs Pfeile, einer je Richtung (' + picks.length + ')');
var kennungen = picks.map(function (g) { return g.getAttribute('data-facing'); }).sort();
ok(kennungen.join(',') === '0,1,2,3,4,5', 'jede Richtung genau einmal');
var hervorgehoben = picks.filter(function (g) {
  return (g.attrs['class'] || '').indexOf('is-current') > 0;
});
ok(hervorgehoben.length === 1 && hervorgehoben[0].getAttribute('data-facing') === '4',
   'die jetzige Richtung ist hervorgehoben');
var trefferflaechen = 0;
picks.forEach(function (g) {
  g.children.forEach(function (c) { if (c.attrs['class'] === 'pick-hit') trefferflaechen++; });
});
ok(trefferflaechen === 6, 'jeder Pfeil hat eine Trefferfläche');
zahlenPruefen(view, 'Richtungswähler');

// Die Figur selbst zeigt ihren eigenen Pfeil nicht mehr, solange gewählt wird
var eigene = 0;
alleKnoten(view.layers.scene).forEach(function (n) {
  if ((n.attrs['class'] || '') === 'facing') eigene++;
});
ok(eigene === 2, 'nur die Figuren ohne Wähler tragen ihren eigenen Pfeil (' + eigene + ')');

console.log('\nEffekte finden ihr Feld');
Scene.set(view.cam, Render.TILT, 40);
Render.draw(view, state, kontext);
var ziel = state.board.keys[0];
ok(!!Render.floatText(view, state.board, ziel, '+1', '#fff'), 'Text steigt über dem Feld auf');
ok(!!Render.pulse(view, state.board, ziel, 'pulse-train'), 'Ring liegt auf dem Feld');
ok(!!Render.ghost(view, state.board, ziel, 'worker', '#fff'), 'geschlagene Figur wird gezeigt');
zahlenPruefen(view, 'Effekte');
var wieder = Render.cellPixel(view, state.board, ziel);
ok(wieder && isFinite(wieder.x) && isFinite(wieder.y), 'cellPixel liefert den Standpunkt');

console.log('\nSymbole für Seitenleiste und Regelwerk');
var symbol = Render.pieceIcon('king', '#3b82f6');
ok(symbol.indexOf('<svg') === 0 && symbol.indexOf('NaN') < 0, 'Figuren-Symbol entsteht');
ok(Render.pieceIcon('boat', '#3b82f6').indexOf('boat-hull') > 0, 'Boot-Symbol entsteht');

console.log(fehler ? '\n' + fehler + ' Prüfung(en) fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
