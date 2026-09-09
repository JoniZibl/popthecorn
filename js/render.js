/* Hexodus – SVG-Darstellung des Spielfelds */
var Render = (function () {
  'use strict';

  var H = Hex, B = Board;
  var SIZE = 34;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Silhouetten der Figuren (dunkler Kopf, farbiger Schaft)
  var HEADS = {
    king:      'M-9,-4 L-9,-15 L-4.5,-10 L0,-18 L4.5,-10 L9,-15 L9,-4 Z',
    worker:    'M0,-18 L8,-4 L-8,-4 Z',
    samurai:   'M-8,-4 L-8,-10 L-2,-15 L3,-11 L9,-18 L6,-9 L8,-4 Z',
    springer:  'M-7,-4 L-6,-11 L-1,-16 L8,-13 L3,-9 L6,-4 Z',
    legionaer: 'M-5,-4 L-6,-13 L0,-17 L6,-13 L5,-4 Z',
    archer:    'M-8,-4 L-6,-9 L-7,-13 L0,-18 L7,-13 L6,-9 L8,-4 Z',
    tangolin:  'M0,-18 L7,-11 L0,-4 L-7,-11 Z',
    zenturio:  'M-4,-18 L4,-18 L9,-13 L9,-8 L4,-3.5 L-4,-3.5 L-9,-8 L-9,-13 Z'
  };

  function el(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function create(container) {
    var svg = el('svg', { class: 'board-svg' });
    var root = el('g', { class: 'board-root' });
    var layers = {};
    ['terrain', 'overlay', 'trees', 'pieces', 'markers'].forEach(function (n) {
      layers[n] = el('g', { class: 'layer-' + n });
      root.appendChild(layers[n]);
    });
    svg.appendChild(root);
    container.appendChild(svg);
    return {
      svg: svg, root: root, layers: layers, container: container,
      view: { x: 0, y: 0, scale: 1 }
    };
  }

  function clear(view) {
    for (var k in view.layers) {
      while (view.layers[k].firstChild) view.layers[k].removeChild(view.layers[k].firstChild);
    }
  }

  function applyView(view) {
    view.root.setAttribute('transform',
      'translate(' + view.view.x + ',' + view.view.y + ') scale(' + view.view.scale + ')');
  }

  /* Spielfeld mittig und vollständig einpassen */
  function fit(view, board) {
    var rect = view.container.getBoundingClientRect();
    var w = rect.width || 800, h = rect.height || 600;
    var b = B.bounds(board, SIZE);
    var bw = b.maxX - b.minX, bh = b.maxY - b.minY;
    var scale = Math.min(w / bw, h / bh) * 0.94;
    scale = Math.max(0.25, Math.min(scale, 1.6));
    view.view.scale = scale;
    view.view.x = w / 2 - (b.minX + bw / 2) * scale;
    view.view.y = h / 2 - (b.minY + bh / 2) * scale;
    applyView(view);
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

  function treeGlyph(g) {
    g.appendChild(el('circle', { class: 'tree-bg', cx: 0, cy: 0, r: SIZE * 0.5 }));
    g.appendChild(el('path', { class: 'tree-top', d: 'M0,-15 L9,7 L-9,7 Z' }));
    g.appendChild(el('path', { class: 'tree-top2', d: 'M0,-15 L9,7 L0,7 Z' }));
  }

  function pieceGlyph(g, piece, color) {
    g.appendChild(el('ellipse', { class: 'piece-shadow', cx: 0, cy: 12, rx: 12, ry: 4.5 }));
    g.appendChild(el('path', { class: 'piece-base', d: 'M-10,11 L-7,4 L7,4 L10,11 Z' }));
    g.appendChild(el('rect', { class: 'piece-stem', x: -3.6, y: -6, width: 7.2, height: 11, rx: 1.6, fill: color }));
    g.appendChild(el('path', { class: 'piece-head', d: HEADS[piece.type], stroke: color }));
  }

  /* Blickrichtung als Pfeil am Feldrand – immer sichtbar, auch bei den Gegnern.
     Der Legionär bekommt zwei Spitzen, weil er auf seiner Achse vor und zurück läuft. */
  function arrowHead(g, vec, angle, color, style) {
    var wedge = (style === 'wedge');
    var reach = SIZE * (wedge ? 0.50 : 0.48);
    g.appendChild(el('path', {
      class: 'facing',
      d: wedge ? 'M0,-9.5 L15,0 L0,9.5 L4.5,0 Z' : 'M0,-7.5 L13,0 L0,7.5 L3.5,0 Z',
      fill: color,
      transform: 'translate(' + (vec.x * reach).toFixed(2) + ',' + (vec.y * reach).toFixed(2) +
                 ') rotate(' + angle.toFixed(1) + ')'
    }));
  }

  function facingArrow(g, piece, color) {
    if (piece.type === 'springer') {
      // ein breiter Pfeil zwischen die beiden Sprungrichtungen – so bleibt er
      // vom Achsenpfeil des Legionärs unterscheidbar
      arrowHead(g, H.wedgeVector(piece.facing), H.wedgeAngle(piece.facing), color, 'wedge');
      return;
    }
    arrowHead(g, H.dirVector(piece.facing), H.dirAngle(piece.facing), color, false);
    if (piece.type === 'legionaer') {
      var back = (piece.facing + 3) % 6;
      arrowHead(g, H.dirVector(back), H.dirAngle(back), color, false);
    }
  }

  var MARKER_CLASS = {
    move: 'mk-move', capture: 'mk-capture', harvest: 'mk-harvest',
    jump: 'mk-jump', shoot: 'mk-shoot', train: 'mk-train', place: 'mk-place'
  };

  function draw(view, state, ctx) {
    clear(view);
    var board = state.board;
    var hexPts = H.cornerPoints(SIZE, 0.97);

    board.keys.forEach(function (k) {
      var cell = board.cells[k];
      var p = H.toPixel(cell, SIZE);
      var placeable = ctx.placeable && ctx.placeable[k] ? ' is-placeable' : '';
      var g = el('g', {
        class: 'hex hex-' + cell.terrain + placeable,
        transform: 'translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')',
        'data-key': k
      });
      g.appendChild(el('polygon', { class: 'hex-shape', points: hexPts }));
      view.layers.terrain.appendChild(g);

      if (cell.tree) {
        var tg = el('g', { class: 'tree', transform: 'translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')' });
        treeGlyph(tg);
        view.layers.trees.appendChild(tg);
      }

      if (cell.piece) {
        var owner = state.players[cell.piece.owner];
        var pg = el('g', {
          class: 'piece piece-' + cell.piece.type + (state.selected === k ? ' is-selected' : ''),
          transform: 'translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')'
        });
        if (Units.DEFS[cell.piece.type].directional) facingArrow(pg, cell.piece, owner.color);
        pieceGlyph(pg, cell.piece, owner.color);
        var title = el('title');
        title.textContent = Units.DEFS[cell.piece.type].name + ' – ' + owner.name;
        pg.appendChild(title);
        view.layers.pieces.appendChild(pg);
      }
    });

    // Ausgewähltes Feld hervorheben
    if (state.selected && board.cells[state.selected]) {
      var sp = H.toPixel(board.cells[state.selected], SIZE);
      view.layers.overlay.appendChild(el('polygon', {
        class: 'hex-selected', points: hexPts,
        transform: 'translate(' + sp.x.toFixed(2) + ',' + sp.y.toFixed(2) + ')'
      }));
    }

    // Markierungen für mögliche Aktionen
    (ctx.markers || []).forEach(function (m) {
      var cell = board.cells[H.key(m.q, m.r)];
      if (!cell) return;
      var p = H.toPixel(cell, SIZE);
      var g = el('g', {
        class: 'marker ' + (MARKER_CLASS[m.kind] || 'mk-move'),
        transform: 'translate(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')',
        'data-key': H.key(m.q, m.r)
      });
      g.appendChild(el('polygon', { class: 'marker-hex', points: hexPts }));
      if (m.kind === 'shoot') {
        g.appendChild(el('path', { class: 'marker-icon', d: 'M-9,-9 L9,9 M9,-9 L-9,9' }));
      } else if (m.kind === 'capture') {
        g.appendChild(el('circle', { class: 'marker-ring', cx: 0, cy: 0, r: SIZE * 0.62 }));
      } else if (m.kind === 'harvest') {
        g.appendChild(el('path', { class: 'marker-icon', d: 'M-8,6 L0,-8 L8,6 Z' }));
      } else {
        g.appendChild(el('circle', { class: 'marker-dot', cx: 0, cy: 0, r: m.kind === 'jump' ? 9 : 7 }));
      }
      view.layers.markers.appendChild(g);
    });

    applyView(view);
  }

  /* Figuren-Symbol als HTML-String – für Regelkarten und Startbildschirm */
  function pieceIcon(type, color) {
    var pts = H.cornerPoints(22, 1);
    return '<svg class="piece-icon" viewBox="-26 -26 52 52" aria-hidden="true">' +
      '<polygon class="icon-hex" points="' + pts + '"/>' +
      '<ellipse class="piece-shadow" cx="0" cy="12" rx="10" ry="3.5"/>' +
      '<path class="piece-base" d="M-10,11 L-7,4 L7,4 L10,11 Z"/>' +
      '<rect class="piece-stem" x="-3.6" y="-6" width="7.2" height="11" rx="1.6" fill="' + color + '"/>' +
      '<path class="piece-head" d="' + HEADS[type] + '" stroke="' + color + '"/>' +
      '</svg>';
  }

  return { create: create, draw: draw, fit: fit, zoomBy: zoomBy, applyView: applyView,
           pieceIcon: pieceIcon, SIZE: SIZE };
})();
