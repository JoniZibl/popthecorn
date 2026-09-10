/* Hexodus – Darstellung des Spielfelds als 3D-Szene in SVG

   Das Brett ist eine Platte mit Dicke: Felder liegen oben, Wasser ein Stück
   tiefer, am Rand ist die Erde zu sehen. Bäume und Figuren stehen darauf und
   werfen einen Schatten auf den Boden. Gezeichnet wird ohne WebGL und ohne
   Bibliothek – die Kamera in scene.js rechnet jeden Punkt selbst aus.

   Zwei Sorten Geometrie:
   * Am Boden liegendes (Felder, Wände, Markierungen, Pfeile, Schatten) wird
     Punkt für Punkt projiziert und kippt beim Drehen korrekt mit.
   * Aufrechtes (Bäume, Figuren, Texte) steht als Aufsteller im Bild: an den
     projizierten Standpunkt gesetzt, mit dem Perspektivfaktor skaliert. Eine
     echte Verkürzung ließe die Figuren bei der Draufsicht auf null schrumpfen –
     ein Brettspiel schaut man aber auch von oben an und will seine Figuren sehen.

   Gemalt wird von hinten nach vorn (Maler-Algorithmus): Die Felder werden nach
   ihrem Kameraabstand sortiert, jedes trägt seinen eigenen Baum bzw. seine
   Figur. Näher liegende Felder überdecken damit, was hinter ihnen steht. */
var Render = (function () {
  'use strict';

  var H = Hex, B = Board, S = Scene;
  var SIZE = 34;
  var SLAB = 20;         // Dicke der Brettplatte
  var WATER = 5;         // wie tief das Wasser in der Platte liegt
  var FLAT = 90;         // Draufsicht
  var TILT = 48;         // voreingestellte Schrägsicht
  var EARTH = '#6f5136'; // Erde an den Schnittkanten der Platte
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* Silhouetten der Figuren: dunkler Aufsatz auf farbigem Schaft, Füße auf y = 0.

     Jede Figur bekommt einen eigenen Umriss, nicht nur andere Zacken – auf dem
     Brett ist so ein Aufsatz gut zehn Bildpunkte hoch, und was sich erst aus
     der Nähe unterscheidet, unterscheidet sich im Spiel gar nicht. Deshalb:
     ein Turm mit Zinnen, eine schräge Klinge, ein Pferdekopf, ein Schild, eine
     Raute – und für den Zenturio ein Feldzeichen aus Schaft und Querbalken.

     Arbeiter und Bogenschütze behalten ihre ursprünglichen Formen: das
     schlichte Dreieck und die Spitze mit den eingezogenen Flanken. Beide
     wurden zwischenzeitlich als Axt und als Bogen gezeichnet und auf Wunsch
     zurückgeholt; sie sind nur an die größeren Maße angepasst.

     Wer eine Figur ändert, ändert sie auch in der Seitenleiste und im
     Regelwerk mit: Die kleinen Symbole zeichnen dieselben Pfade. */
  var HEADS = {
    // Königs-Turm: breiter Turm mit drei Zinnen – als einziger rechtwinklig
    king:      'M-9,-11 L-9,-26 L-5.5,-26 L-5.5,-22.5 L-2,-22.5 L-2,-26 ' +
               'L2,-26 L2,-22.5 L5.5,-22.5 L5.5,-26 L9,-26 L9,-11 Z',
    // Arbeiter: das schlichte Dreieck von Anfang an
    worker:    'M0,-27.8 L9.6,-11 L-9.6,-11 Z',
    // Samurai: schräge Klinge mit Stichblatt – als Einziger diagonal, wie sein Zug
    samurai:   'M-4.2,-11 L-6.8,-13.2 L5.6,-29 L8.2,-26.8 Z ' +
               'M-1.6,-12.4 L-6.6,-16.6 L-7.6,-15.4 L-2.6,-11.2 Z',
    // Springer: Pferdekopf mit Schnauze links und Mähne rechts, wie im Schach
    springer:  'M-8,-11 C-8,-15 -6,-16.5 -4,-18 L-8,-20.5 ' +
               'C-9,-21.5 -8,-23.5 -6,-24 L-1.5,-25.5 L-2.5,-30 L2,-27.2 ' +
               'C6,-27.6 8,-23.5 8,-19 L8,-11 Z',
    // Legionär: Scutum – breites, gewölbtes Rechteckschild mit geradem Abschluss.
    // Eine Spitze nach unten sähe zusammen mit dem Schaft aus wie ein Kelch.
    legionaer: 'M-8.5,-29 L8.5,-29 C9.7,-25 9.7,-16 8.5,-12 L-8.5,-12 ' +
               'C-9.7,-16 -9.7,-25 -8.5,-29 Z',
    // Bogenschütze: die eingezogene Spitze von Anfang an
    archer:    'M-9.6,-11 L-7.2,-17 L-8.4,-21.8 L0,-27.8 L8.4,-21.8 L7.2,-17 L9.6,-11 Z',
    // Tangolin: Raute – der einzige gleichmäßige Vierecker
    tangolin:  'M0,-30 L8.5,-20.5 L0,-11 L-8.5,-20.5 Z',
    /* Zenturio: ein Feldzeichen – Schaft in der Spielerfarbe, darauf drei
       Querbalken, oben der breiteste. Unterhalb des dritten läuft der Schaft
       frei bis zum Sockel. Als einzige Figur zeigt er die Farbe nicht nur
       unten, sondern über die ganze Höhe zwischen den Balken.
       Höher und breiter als alles andere auf dem Brett; das darf man der
       teuersten Figur ansehen, die es nur einmal pro Partie gibt. */
    zenturio:  'M-8.5,-34 L8.5,-34 L8.5,-27.2 L-8.5,-27.2 Z ' +
               'M-6.8,-23.5 L6.8,-23.5 L6.8,-17.5 L-6.8,-17.5 Z ' +
               'M-5.8,-14.5 L5.8,-14.5 L5.8,-9 L-5.8,-9 Z'
  };

  /* Königs-Turm und Zenturio stehen auf einem größeren Sockel: Die eine Figur
     entscheidet die Partie, die andere gibt es nur einmal – das darf man ihnen
     ansehen, ohne die Silhouette zu vergrößern. */
  var BASE_SCALE = { king: 1.14, zenturio: 1.14 };

  /* Der Schaft trägt bei den meisten Figuren nur den Aufsatz und bleibt kurz.
     Beim Zenturio läuft er als Stange durch bis unter den obersten Balken –
     sonst hingen seine Querbalken in der Luft. */
  var STEM_STD = { y: -14, h: 13 };
  var STEM = { zenturio: { y: -34, h: 33 } };

  function stemFor(type) { return STEM[type] || STEM_STD; }

  function stemNode(type, color) {
    var st = stemFor(type);
    return el('rect', {
      class: 'piece-stem', x: -4.2, y: st.y, width: 8.4, height: st.h, rx: 1.8, fill: color
    });
  }

  /* Etwas größer als das Feld es verlangt: Am Handy ist eine Figur nur noch
     gut zehn Bildpunkte hoch, und woran man sie erkennt, sind diese Punkte. */
  var PIECE_SCALE = 1.1;

  var CORNERS = H.corners(SIZE);

  /* Zu jeder der sechs Richtungen die Kante, hinter der dieser Nachbar liegt:
     die Kante zwischen Ecke e und e+1. Die Ecken laufen im Uhrzeigersinn,
     Hex.DIRS läuft andersherum – deshalb e = (6 − d) mod 6 und nicht d.
     Wer hier d einsetzt, lässt vier von sechs Wänden am falschen Nachbarn
     hängen; test/kamera.js hält die Zuordnung fest. */
  var EDGE_OF_DIR = [0, 5, 4, 3, 2, 1];
  var EDGE_N = [0, 1, 2, 3, 4, 5].map(function (d) {
    var v = H.dirVector(d);
    return [v.x, v.y];
  });

  function el(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  /* ---------------- Geometrie in der Brettebene ---------------- */

  /* Projiziert eine Punktliste [[x,y,z],…] und gibt sie relativ zum Ursprung
     `o` aus. Jede Szenengruppe sitzt per translate an ihrem eigenen Standpunkt;
     ihr Inhalt bleibt dadurch relativ und die Animationen aus ui.js greifen
     weiter, ohne von der Kamera zu wissen. */
  function pts(cam, list, o) {
    var s = '';
    for (var i = 0; i < list.length; i++) {
      var p = S.project(cam, list[i][0], list[i][1], list[i][2] || 0);
      s += (i ? ' ' : '') + (p.x - o.x).toFixed(2) + ',' + (p.y - o.y).toFixed(2);
    }
    return s;
  }

  function hexRing(cx, cy, z, shrink) {
    var f = shrink || 1;
    return CORNERS.map(function (c) { return [cx + c[0] * f, cy + c[1] * f, z]; });
  }

  function disc(cx, cy, z, radius, steps) {
    var out = [], n = steps || 14;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2;
      out.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, z]);
    }
    return out;
  }

  function surfaceZ(cell) { return cell.terrain === 'water' ? -WATER : 0; }

  /* ---------------- Grundgerüst ---------------- */

  function defs() {
    var d = el('defs');
    function grad(id, from, to) {
      var g = el('linearGradient', { id: id, x1: '0', y1: '0', x2: '0', y2: '1' });
      var a = el('stop', { offset: '0', 'stop-color': from });
      var b = el('stop', { offset: '1', 'stop-color': to });
      g.appendChild(a); g.appendChild(b);
      d.appendChild(g);
    }
    grad('headGrad', '#2b333b', '#111519');
    grad('treeGrad', '#3fb463', '#238044');
    return d;
  }

  function create(container) {
    var svg = el('svg', { class: 'board-svg' });
    svg.appendChild(defs());
    var root = el('g', { class: 'board-root' });
    var layers = {};
    // scene trägt Felder, Bäume und Figuren gemeinsam – nur zusammen lassen
    // sie sich nach Tiefe sortieren. Alles Weitere liegt darüber.
    ['scene', 'overlay', 'fxUnder', 'markers', 'effects'].forEach(function (n) {
      layers[n] = el('g', { class: 'layer-' + n });
      root.appendChild(layers[n]);
    });
    svg.appendChild(root);
    container.appendChild(svg);
    return {
      svg: svg, root: root, layers: layers, container: container,
      cam: S.create(TILT, 0), anchors: {}, last: null,
      view: { x: 0, y: 0, scale: 1 }
    };
  }

  function clear(view) {
    ['scene', 'overlay', 'markers'].forEach(function (k) {
      var l = view.layers[k];
      while (l.firstChild) l.removeChild(l.firstChild);
    });
  }

  function applyView(view) {
    view.root.setAttribute('transform',
      'translate(' + view.view.x + ',' + view.view.y + ') scale(' + view.view.scale + ')');
  }

  /* ---------------- Kamera und Ausschnitt ---------------- */

  /* Umriss des Bretts im Bild – die Ecken aller Felder, projiziert.
     Oben kommt Platz für die stehenden Figuren dazu.

     Der äußere Ring des Wasserrandes zählt nicht mit: Gespielt wird auf der
     Insel, und würde das Brett bis zur letzten Welle eingepasst, bliebe vom
     Land am Handy wenig übrig. Der innere Ring bleibt drin, damit rundum
     Wasser zu sehen ist; der äußere läuft über den Bildrand hinaus und ist
     beim Herauszoomen da. */
  function projectedBounds(view, board) {
    var cam = view.cam;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    board.keys.forEach(function (k) {
      var cell = board.cells[k];
      if (cell.rim > 1) return;
      var p = H.toPixel(cell, SIZE);
      for (var i = 0; i < 6; i++) {
        for (var s = 0; s < 2; s++) {
          var q = S.project(cam, p.x + CORNERS[i][0], p.y + CORNERS[i][1], s ? -SLAB : 0);
          if (q.x < minX) minX = q.x;
          if (q.y < minY) minY = q.y;
          if (q.x > maxX) maxX = q.x;
          if (q.y > maxY) maxY = q.y;
        }
      }
    });
    // oben Platz für die stehenden Bäume und Figuren, die über ihr Feld hinausragen
    return { minX: minX - 8, minY: minY - 44, maxX: maxX + 8, maxY: maxY + 8 };
  }

  function boxOf(view) {
    var rect = view.container.getBoundingClientRect();
    return { w: rect.width || 800, h: rect.height || 600 };
  }

  /* Passt das Brett in seiner jetzigen Vergrößerung noch ins Fenster? */
  function fitsIn(view, b) {
    var box = boxOf(view);
    return (b.maxX - b.minX) * view.view.scale <= box.w &&
           (b.maxY - b.minY) * view.view.scale <= box.h;
  }

  function fitTo(view, b) {
    var box = boxOf(view);
    var bw = b.maxX - b.minX, bh = b.maxY - b.minY;
    var scale = Math.min(box.w / bw, box.h / bh) * 0.94;
    scale = Math.max(0.25, Math.min(scale, 1.6));
    view.view.scale = scale;
    view.view.x = box.w / 2 - (b.minX + bw / 2) * scale;
    view.view.y = box.h / 2 - (b.minY + bh / 2) * scale;
    applyView(view);
  }

  /* Spielfeld mittig und vollständig einpassen */
  function fit(view, board) {
    fitTo(view, projectedBounds(view, board));
  }

  function zoomBy(view, factor, cx, cy) {
    var v = view.view;
    var next = Math.max(0.3, Math.min(2.4, v.scale * factor));
    var k = next / v.scale;
    v.x = cx - (cx - v.x) * k;
    v.y = cy - (cy - v.y) * k;
    v.scale = next;
    applyView(view);
  }

  function redraw(view) {
    if (view.last) draw(view, view.last.state, view.last.ctx);
  }

  /* Drehen und Neigen. Der Bildmittelpunkt des Bretts bleibt dabei stehen –
     sonst wandert es beim Drehen aus dem Fenster.

     Der Umriss ändert sich dabei: Ein längliches Brett wird beim Drehen höher,
     beim Aufrichten in die Draufsicht ebenfalls. War vorher alles zu sehen,
     wird deshalb neu eingepasst – wer hineingezoomt hat, behält seinen
     Ausschnitt, denn dann war ohnehin nicht das ganze Brett im Bild. */
  function orbit(view, dYaw, dPitch) {
    if (!view.last) { S.turn(view.cam, dYaw, dPitch); return; }
    var board = view.last.state.board;
    var before = projectedBounds(view, board);
    var passteVorher = fitsIn(view, before);
    S.turn(view.cam, dYaw, dPitch);
    var after = projectedBounds(view, board);
    view.view.x += ((before.minX + before.maxX) - (after.minX + after.maxX)) / 2 * view.view.scale;
    view.view.y += ((before.minY + before.maxY) - (after.minY + after.maxY)) / 2 * view.view.scale;
    if (passteVorher && !fitsIn(view, after)) fitTo(view, after);
    redraw(view);
  }

  function setPitch(view, pitch) {
    orbit(view, 0, pitch - view.cam.pitch);
  }

  /* Blickwinkel geradeheraus setzen – für die gespeicherte Ansicht beim
     Spielstart, wenn noch nichts gezeichnet ist, das man festhalten könnte. */
  function setCamera(view, pitch, yaw) {
    S.set(view.cam, pitch, yaw);
    if (view.last) redraw(view);
  }

  function isFlat(view) { return view.cam.pitch >= FLAT - 0.5; }

  /* ---------------- Bäume, Boote, Figuren ---------------- */

  /* Aus den Koordinaten abgeleitete Streuung: gleiche Zelle, gleicher Wert –
     der Wald wirkt gewachsen statt gestempelt und bleibt über Neuzeichnungen
     stabil. Dieselbe Streuung gibt den Feldern ihren Grünton. */
  function jitter(cell) {
    return ((cell.q * 73856093) ^ (cell.r * 19349663)) >>> 0;
  }

  /* Schatten auf dem Boden: ein projizierter Kreis, der beim Drehen zur
     richtigen Ellipse wird. Er verankert Baum und Figur auf dem Feld –
     ohne ihn schweben die Aufsteller über der Platte. */
  function groundShadow(g, cam, o, cx, cy, z, radius, cls) {
    g.appendChild(el('polygon', {
      class: cls || 'ground-shadow',
      points: pts(cam, disc(cx + radius * 0.18, cy + radius * 0.30, z + 0.2, radius, 12), o)
    }));
  }

  function treeGlyph(g, cam, o, cell, cx, cy, k) {
    var seed = jitter(cell);
    var scale = 0.92 + (seed % 22) / 100;
    var tilt = ((seed >> 5) % 9) - 4;
    groundShadow(g, cam, o, cx, cy, 0, 13 * scale, 'tree-shadow');
    // Aufsteller: Stamm und Krone stehen auf dem Standpunkt (y = 0)
    var stand = el('g', { transform: 'scale(' + k.toFixed(3) + ') rotate(' + tilt + ')' });
    var body = el('g', { transform: 'scale(' + scale.toFixed(2) + ')' });
    body.appendChild(el('rect', { class: 'tree-trunk', x: -3, y: -9, width: 6, height: 9.5, rx: 1.4 }));
    body.appendChild(el('path', { class: 'tree-top', d: 'M0,-35 L12.5,-5 L-12.5,-5 Z' }));
    body.appendChild(el('path', { class: 'tree-top2', d: 'M0,-35 L12.5,-5 L0,-5 Z' }));
    stand.appendChild(body);
    g.appendChild(stand);
  }

  /* Boot: ein braunes Sechseck auf dem Wasser, neutral für alle Spieler.
     Es liegt flach im Wasser, der Aufbau ein Stück darüber – dadurch bekommt
     es beim Kippen des Bretts sichtbar Höhe. */
  function boatGlyph(g, cam, o, cx, cy, z) {
    g.appendChild(el('polygon', {
      class: 'boat-hull', points: pts(cam, hexRing(cx, cy, z + 0.4, 0.46), o)
    }));
    g.appendChild(el('polygon', {
      class: 'boat-deck', points: pts(cam, hexRing(cx, cy, z + 4.5, 0.3), o)
    }));
  }

  /* Figur: Sockel am Boden, Silhouette aufrecht darauf – wie eine Spielfigur,
     die man aufs Brett stellt. */
  function pieceGlyph(g, cam, o, cx, cy, z, piece, color, k) {
    var b = BASE_SCALE[piece.type] || 1;
    groundShadow(g, cam, o, cx, cy, z, SIZE * 0.34 * b, 'piece-shadow');
    g.appendChild(el('polygon', {
      class: 'piece-base', points: pts(cam, disc(cx, cy, z + 0.6, SIZE * 0.30 * b, 12), o)
    }));
    g.appendChild(el('polygon', {
      class: 'piece-rim', points: pts(cam, disc(cx, cy, z + 3.2, SIZE * 0.24 * b, 12), o),
      fill: color
    }));
    var stand = el('g', {
      class: 'piece-stand', transform: 'scale(' + (k * PIECE_SCALE).toFixed(3) + ')'
    });
    stand.appendChild(stemNode(piece.type, color));
    stand.appendChild(el('path', { class: 'piece-head', d: HEADS[piece.type], stroke: color }));
    g.appendChild(stand);
  }

  /* Blickrichtung als Pfeil auf dem Boden – immer sichtbar, auch bei den
     Gegnern. Er liegt flach im Feld und dreht sich mit dem Brett mit; nur so
     zeigt er auch aus schräger Sicht noch auf das richtige Nachbarfeld.
     Der Legionär bekommt zwei Spitzen, weil er auf seiner Achse vor und
     zurück läuft. */
  function arrowShape(cx, cy, z, vec, wedge) {
    var px = -vec.y, py = vec.x;
    var tip = SIZE * (wedge ? 0.94 : 0.90);
    var base = SIZE * 0.52, notch = SIZE * 0.63, w = SIZE * (wedge ? 0.27 : 0.21);
    return [
      [cx + vec.x * tip, cy + vec.y * tip, z],
      [cx + vec.x * base + px * w, cy + vec.y * base + py * w, z],
      [cx + vec.x * notch, cy + vec.y * notch, z],
      [cx + vec.x * base - px * w, cy + vec.y * base - py * w, z]
    ];
  }

  function facingArrow(g, cam, o, cx, cy, z, piece, color) {
    function arrow(vec, wedge) {
      g.appendChild(el('polygon', {
        class: 'facing', fill: color,
        points: pts(cam, arrowShape(cx, cy, z + 0.5, vec, wedge), o)
      }));
    }
    if (piece.type === 'springer') {
      // ein breiter Pfeil zwischen die beiden Sprungrichtungen – so bleibt er
      // vom Achsenpfeil des Legionärs unterscheidbar
      arrow(H.wedgeVector(piece.facing), true);
      return;
    }
    arrow(H.dirVector(piece.facing), false);
    if (piece.type === 'legionaer') arrow(H.dirVector((piece.facing + 3) % 6), false);
  }

  /* ---------------- Das Brett ---------------- */

  var MARKER_CLASS = {
    move: 'mk-move', capture: 'mk-capture', harvest: 'mk-harvest',
    jump: 'mk-jump', shoot: 'mk-shoot', train: 'mk-train', place: 'mk-place'
  };

  /* Senkrechte Wände eines Feldes. Gezeichnet wird nur, was der Betrachter
     sehen kann: die Außenkanten der Platte und die Ufer zum tiefer liegenden
     Wasser. Innenwände zwischen zwei Landfeldern verdeckt ohnehin das nähere
     Feld – sie zu zeichnen kostete für jedes Feld drei Flächen mehr. */
  function walls(g, cam, o, board, cell, cx, cy) {
    for (var d = 0; d < 6; d++) {
      var n = EDGE_N[d];
      if (!S.frontFacing(cam, n[0], n[1])) continue;
      var nb = B.get(board, cell.q + H.DIRS[d][0], cell.r + H.DIRS[d][1]);
      if (nb && !(cell.terrain === 'grass' && nb.terrain === 'water')) continue;
      var e = EDGE_OF_DIR[d];
      var a = CORNERS[e], b = CORNERS[(e + 1) % 6];
      g.appendChild(el('polygon', {
        class: 'hex-side',
        fill: S.shade(EARTH, S.light(n[0], n[1])),
        points: pts(cam, [
          [cx + a[0], cy + a[1], 0], [cx + b[0], cy + b[1], 0],
          [cx + b[0], cy + b[1], -SLAB], [cx + a[0], cy + a[1], -SLAB]
        ], o)
      }));
    }
  }

  function drawCell(view, state, ctx, item) {
    var cam = view.cam, board = state.board, cell = item.c, o = item.a;
    var cx = item.x, cy = item.y, z = item.z;
    var placeable = ctx.placeable && ctx.placeable[item.k] ? ' is-placeable' : '';
    var g = el('g', {
      class: 'hex hex-' + cell.terrain + placeable,
      transform: 'translate(' + o.x.toFixed(2) + ',' + o.y.toFixed(2) + ')',
      'data-key': item.k
    });

    walls(g, cam, o, board, cell, cx, cy);

    // vier ähnliche Töne je Gelände – gibt dem Brett Leben ohne Farbverlauf
    var ton = jitter(cell) % 4;
    g.appendChild(el('polygon', {
      class: 'hex-shape ton-' + (cell.terrain === 'water' ? 'w' : 'g') + ton,
      points: pts(cam, hexRing(cx, cy, z), o)
    }));
    if (cell.terrain === 'water') {
      g.appendChild(el('polygon', {
        class: 'water-rim', points: pts(cam, hexRing(cx, cy, z + 0.3, 0.88), o)
      }));
    }

    // Bodenmarkierungen des Feldes: sie liegen unter den Figuren dieses Feldes
    if (state.selected === item.k) {
      g.appendChild(el('polygon', {
        class: 'hex-selected', points: pts(cam, hexRing(cx, cy, z + 0.6, 0.97), o)
      }));
    }
    if (ctx.lastMove) {
      var mark = ctx.lastMove.toKey === item.k ? 'to'
        : (ctx.lastMove.fromKey === item.k ? 'from' : null);
      if (mark) {
        g.appendChild(el('polygon', {
          class: 'last-move last-' + mark,
          points: pts(cam, hexRing(cx, cy, z + 0.5, 0.93), o)
        }));
      }
    }

    if (cell.tree) treeGlyph(g, cam, o, cell, cx, cy, o.k);
    if (cell.boat) {
      boatGlyph(g, cam, o, cx, cy, z);
      var bt = el('title'); bt.textContent = 'Boot – von allen Spielern nutzbar';
      g.appendChild(bt);
    }

    if (cell.piece) {
      var owner = state.players[cell.piece.owner];
      var pg = el('g', {
        class: 'piece piece-' + cell.piece.type + (state.selected === item.k ? ' is-selected' : ''),
        'data-key': item.k
      });
      // innere Gruppe: sie trägt die Animation, ohne das transform-Attribut zu stören
      var inner = el('g', { class: 'piece-anim' });
      // Steht der Richtungswähler um diese Figur, zeigt schon sein
      // hervorgehobener Pfeil, wohin sie blickt – zwei Pfeilsätze übereinander
      // wären nur Gewirr.
      var waehlt = ctx.facing && ctx.facing.key === item.k;
      if (Units.DEFS[cell.piece.type].directional && !waehlt) {
        facingArrow(inner, cam, o, cx, cy, z, cell.piece, owner.color);
      }
      pieceGlyph(inner, cam, o, cx, cy, z, cell.piece, owner.color, o.k);
      var title = el('title');
      title.textContent = Units.DEFS[cell.piece.type].name + ' – ' + owner.name;
      inner.appendChild(title);
      pg.appendChild(inner);
      g.appendChild(pg);
    }

    view.layers.scene.appendChild(g);
    return g;
  }

  function drawMarker(view, state, m) {
    var cam = view.cam, board = state.board;
    var key = H.key(m.q, m.r);
    var cell = board.cells[key];
    if (!cell) return;
    var p = H.toPixel(cell, SIZE), z = surfaceZ(cell) + 0.8;
    var o = view.anchors[key] || S.project(cam, p.x, p.y, z);
    var g = el('g', {
      class: 'marker ' + (MARKER_CLASS[m.kind] || 'mk-move'),
      transform: 'translate(' + o.x.toFixed(2) + ',' + o.y.toFixed(2) + ')',
      'data-key': key
    });
    g.appendChild(el('polygon', {
      class: 'marker-hex', points: pts(cam, hexRing(p.x, p.y, z, 0.97), o)
    }));
    if (m.kind === 'shoot') {
      [[[-9, -9], [9, 9]], [[9, -9], [-9, 9]]].forEach(function (seg) {
        var a = S.project(cam, p.x + seg[0][0], p.y + seg[0][1], z);
        var b = S.project(cam, p.x + seg[1][0], p.y + seg[1][1], z);
        g.appendChild(el('line', {
          class: 'marker-icon', x1: (a.x - o.x).toFixed(2), y1: (a.y - o.y).toFixed(2),
          x2: (b.x - o.x).toFixed(2), y2: (b.y - o.y).toFixed(2)
        }));
      });
    } else if (m.kind === 'capture') {
      g.appendChild(el('polygon', {
        class: 'marker-ring', points: pts(cam, disc(p.x, p.y, z, SIZE * 0.62, 16), o)
      }));
    } else if (m.kind === 'harvest') {
      g.appendChild(el('polygon', {
        class: 'marker-icon-fill',
        points: pts(cam, [[p.x - 8, p.y + 6, z], [p.x, p.y - 8, z], [p.x + 8, p.y + 6, z]], o)
      }));
    } else {
      g.appendChild(el('polygon', {
        class: 'marker-dot',
        points: pts(cam, disc(p.x, p.y, z, m.kind === 'jump' ? 9 : 7, 12), o)
      }));
    }
    if (m.cost) {                       // was der Zug an Holz kostet
      var badge = el('g', { class: 'cost-badge', transform: 'translate(0,-14)' });
      badge.appendChild(el('circle', { cx: 0, cy: 0, r: 9 }));
      var txt = el('text', { x: 0, y: 3.5, 'text-anchor': 'middle' });
      txt.textContent = '-' + m.cost;
      badge.appendChild(txt);
      g.appendChild(badge);
    }
    view.layers.markers.appendChild(g);
  }

  /* Richtungswähler: sechs Pfeile rund um die Figur, die gerade ausgerichtet
     wird. Sie liegen dort, wohin sie zeigen – wer die Figur nach Nordost
     drehen will, tippt nordöstlich neben sie. Gezeigt wird das nur, solange
     das Spiel ohnehin auf die Richtung wartet; dann gibt es keine Zugfelder,
     mit denen die Pfeile sich um die Klicks streiten könnten. */
  function facingPicker(view, state, ctx) {
    var f = ctx.facing;
    if (!f) return;
    var cell = state.board.cells[f.key];
    if (!cell) return;
    var cam = view.cam;
    var p = H.toPixel(cell, SIZE), z = surfaceZ(cell) + 1.2;
    var wedge = f.type === 'springer';
    /* Der Pfeil liegt dort, wohin er zeigt: mitten im Nachbarfeld (Abstand
       zweier Feldmitten = Größe · √3). Beim Springer zeigt die Richtung
       zwischen zwei Nachbarn hindurch; sein Pfeil liegt entsprechend auf der
       gemeinsamen Kante. Näher an der Figur überdeckte der nördliche Pfeil
       ihren Aufsteller – und ein Ziel, das man nicht sieht, tippt man nicht. */
    var R = SIZE * (wedge ? 1.5 : 1.732);

    for (var d = 0; d < 6; d++) {
      var v = wedge ? H.wedgeVector(d) : H.dirVector(d);
      var cx = p.x + v.x * R, cy = p.y + v.y * R;
      var o = S.project(cam, cx, cy, z);
      var g = el('g', {
        class: 'facing-pick' + (d === f.current ? ' is-current' : ''),
        transform: 'translate(' + o.x.toFixed(2) + ',' + o.y.toFixed(2) + ')',
        'data-facing': d
      });
      /* Großzügige Trefferfläche: Am Handy ist ein Feld bei eingepasstem Brett
         keine 40 Punkte breit, der Pfeil darin nur halb so groß. Getroffen
         werden soll aber der Pfeil, nicht das Pixel. */
      g.appendChild(el('polygon', {
        class: 'pick-hit', points: pts(cam, disc(cx, cy, z, SIZE * 0.8, 10), o)
      }));
      var px = -v.y, py = v.x, L = 16, W = 13, B = 7;
      g.appendChild(el('polygon', {
        class: 'pick-arrow', fill: f.color,
        points: pts(cam, [
          [cx + v.x * L, cy + v.y * L, z],
          [cx - v.x * B + px * W, cy - v.y * B + py * W, z],
          [cx - v.x * B * 0.2, cy - v.y * B * 0.2, z],
          [cx - v.x * B - px * W, cy - v.y * B - py * W, z]
        ], o)
      }));
      var t = el('title');
      t.textContent = (wedge ? H.wedgeName(d) : H.DIR_NAMES[d]) +
        (d === f.current ? ' (aktuell – antippen beendet den Zug)' : '');
      g.appendChild(t);
      view.layers.markers.appendChild(g);
    }
  }

  function draw(view, state, ctx) {
    // gemerkt, damit das Brett beim Drehen ohne Zutun der Oberfläche neu entsteht
    view.last = { state: state, ctx: ctx };
    clear(view);
    var cam = view.cam, board = state.board;
    view.anchors = {};

    /* Von hinten nach vorn: Felder nach Kameraabstand sortiert. Jedes Feld
       trägt seinen Baum und seine Figur – dadurch verdeckt ein nahes Feld
       alles, was dahinter steht, ohne Tiefenpuffer. */
    var order = board.keys.map(function (k) {
      var cell = board.cells[k];
      var p = H.toPixel(cell, SIZE);
      var z = surfaceZ(cell);
      var a = S.project(cam, p.x, p.y, z);
      view.anchors[k] = a;
      return { k: k, c: cell, x: p.x, y: p.y, z: z, a: a };
    }).sort(function (u, v) {
      return v.a.depth - u.a.depth || u.k.localeCompare(v.k);
    });

    order.forEach(function (item) { drawCell(view, state, ctx, item); });

    /* Versorgungskette des Spielers am Zug: Nur an dieser Kette darf ausgebildet
       werden. Sichtbar gemacht wird daraus eine Positionsfrage statt einer
       Überraschung, wenn plötzlich nichts mehr geht. */
    if (ctx.chain && ctx.chain.links) {
      ctx.chain.links.forEach(function (pair) {
        var pa = H.toPixel(pair[0], SIZE), pb = H.toPixel(pair[1], SIZE);
        var a = S.project(cam, pa.x, pa.y, 1), b = S.project(cam, pb.x, pb.y, 1);
        view.layers.overlay.appendChild(el('line', {
          class: 'supply-link', x1: a.x.toFixed(2), y1: a.y.toFixed(2),
          x2: b.x.toFixed(2), y2: b.y.toFixed(2), stroke: ctx.chainColor || '#fff'
        }));
      });
    }

    /* Der Zenturio trägt das Feldzeichen und ist selbst ein Anker der Kette.
       Steht er allein vorn, hat er keine einzige Linie – ohne diesen Ring sähe
       man ihm nicht an, dass hier Nachschub ist. */
    if (ctx.chain && ctx.chain.zenturio) {
      var zc = ctx.chain.zenturio;
      var zp = H.toPixel(zc, SIZE), zz = surfaceZ(zc) + 0.8;
      var zo = (view.anchors && view.anchors[H.key(zc.q, zc.r)]) || S.project(cam, zp.x, zp.y, zz);
      var zg = el('g', { transform: 'translate(' + zo.x.toFixed(2) + ',' + zo.y.toFixed(2) + ')' });
      zg.appendChild(el('polygon', {
        class: 'supply-anchor',
        points: pts(cam, disc(zp.x, zp.y, zz, SIZE * 0.8, 18), zo),
        stroke: ctx.chainColor || '#fff'
      }));
      view.layers.overlay.appendChild(zg);
    }

    (ctx.markers || []).forEach(function (m) { drawMarker(view, state, m); });
    facingPicker(view, state, ctx);

    applyView(view);
  }

  /* ---------------- Vergängliche Effekte ---------------- */

  function cellPixel(view, board, key) {
    if (view.anchors && view.anchors[key]) return view.anchors[key];
    var c = board.cells[key];
    if (!c) return null;
    var p = H.toPixel(c, SIZE);
    return S.project(view.cam, p.x, p.y, surfaceZ(c));
  }

  /* Alle Effekte sitzen in einer äußeren Gruppe, die nur die Position trägt.
     Animiert wird ausschließlich die innere Gruppe – eine CSS-Transformation
     würde sonst das transform-Attribut überschreiben und den Effekt auf den
     Brett-Ursprung werfen, statt ihn dort zu zeigen, wo er hingehört. */
  function effectAt(view, board, key, cls, unten) {
    var p = cellPixel(view, board, key);
    if (!p) return null;
    var outer = el('g', {
      class: cls,
      transform: 'translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')'
    });
    var inner = el('g', { class: 'fx-anim' });
    outer.appendChild(inner);
    // Die sterbende Figur gehört unter die lebenden, alles andere darüber
    (unten ? view.layers.fxUnder : view.layers.effects).appendChild(outer);
    return { outer: outer, inner: inner, k: p.k || 1 };
  }

  /* Geschlagene Figur ein letztes Mal am Ort ihres Todes zeigen. */
  function ghost(view, board, key, type, color) {
    if (!HEADS[type]) return null;
    var fx = effectAt(view, board, key, 'ghost', true);
    if (!fx) return null;
    // dieselben Maße wie auf dem Brett – sonst schrumpft die Figur im Sterben
    var stand = el('g', { transform: 'scale(' + (fx.k * PIECE_SCALE).toFixed(3) + ')' });
    stand.appendChild(stemNode(type, color));
    stand.appendChild(el('path', { class: 'piece-head', d: HEADS[type], stroke: color }));
    fx.inner.appendChild(stand);
    return fx;
  }

  /* Kurz aufsteigender Text, etwa "+1" genau am gefällten Baum. */
  function floatText(view, board, key, text, color) {
    var fx = effectAt(view, board, key, 'float-text');
    if (!fx) return null;
    var t = el('text', { x: 0, y: -30, 'text-anchor': 'middle', fill: color });
    t.textContent = text;
    fx.inner.appendChild(t);
    return fx;
  }

  /* Ring, der einmal aufblitzt – für Schüsse und geschlagene Figuren.
     Er liegt als projizierter Kreis auf dem Feld, kippt also mit dem Brett. */
  function pulse(view, board, key, cls) {
    var fx = effectAt(view, board, key, 'pulse-wrap');
    if (!fx) return null;
    var cell = board.cells[key];
    var p = H.toPixel(cell, SIZE), z = surfaceZ(cell) + 1;
    var o = cellPixel(view, board, key);
    fx.inner.appendChild(el('polygon', {
      class: 'pulse ' + (cls || ''),
      points: pts(view.cam, disc(p.x, p.y, z, SIZE * 0.5, 16), o)
    }));
    return fx;
  }

  function pieceAt(view, key) {
    return view.layers.scene.querySelector('.piece[data-key="' + key + '"] .piece-anim');
  }

  /* Figuren-Symbol als HTML-String – für Regelkarten und Startbildschirm.
     Gezeichnet wird dieselbe Figur wie auf dem Brett, nur flach und von der
     Seite: Wer das Symbol in der Seitenleiste antippt, muss die Figur auf dem
     Feld wiedererkennen. Ein zweiter Satz Silhouetten würde genau das
     irgendwann verfehlen. */
  function pieceIcon(type, color) {
    var hexPts = H.cornerPoints(24, 1);
    if (type === 'boat') {                    // Objekt, keine Figur: nur der Rumpf
      return '<svg class="piece-icon" viewBox="-26 -26 52 52" aria-hidden="true">' +
        '<polygon class="icon-hex" points="' + hexPts + '"/>' +
        '<polygon class="boat-hull" points="' + H.cornerPoints(12, 1) + '"/>' +
        '<polygon class="boat-deck" points="' + H.cornerPoints(7.5, 1) + '"/>' +
        '</svg>';
    }
    return '<svg class="piece-icon" viewBox="-26 -26 52 52" aria-hidden="true">' +
      '<polygon class="icon-hex" points="' + hexPts + '"/>' +
      '<g transform="translate(0,11) scale(0.66)">' +
      '<ellipse class="icon-shadow" cx="0" cy="0" rx="10" ry="3.4"/>' +
      '<rect class="piece-stem" x="-4.2" y="' + stemFor(type).y + '" width="8.4" height="' +
        stemFor(type).h + '" rx="1.8" fill="' + color + '"/>' +
      '<path class="piece-head" d="' + HEADS[type] + '" stroke="' + color + '"/>' +
      '</g></svg>';
  }

  return { create: create, draw: draw, redraw: redraw, fit: fit, zoomBy: zoomBy,
           applyView: applyView, orbit: orbit, setPitch: setPitch, setCamera: setCamera,
           isFlat: isFlat,
           pieceIcon: pieceIcon, ghost: ghost, floatText: floatText, pulse: pulse,
           pieceAt: pieceAt, cellPixel: cellPixel,
           SIZE: SIZE, FLAT: FLAT, TILT: TILT };
})();
