/* Hexodus – Hex-Geometrie (axiale Koordinaten q,r – flat-top Layout) */
var Hex = (function () {
  'use strict';

  // Reihenfolge der 6 Richtungen (flat-top): 0=SO 1=NO 2=N 3=NW 4=SW 5=S
  var DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  var DIR_NAMES = ['Südost', 'Nordost', 'Nord', 'Nordwest', 'Südwest', 'Süd'];
  var DIR_SHORT = ['SO', 'NO', 'N', 'NW', 'SW', 'S'];

  // Gitter der 7er-Plättchen ("Blumen"): Mittelpunkte im Abstand 3
  var TILE_DIRS = [[1, 2], [3, -1], [2, -3], [-1, -2], [-3, 1], [-2, 3]];

  function key(q, r) { return q + ',' + r; }
  function parseKey(k) { var p = k.split(','); return { q: +p[0], r: +p[1] }; }
  function add(a, d) { return { q: a.q + d[0], r: a.r + d[1] }; }
  function scale(d, n) { return [d[0] * n, d[1] * n]; }
  function equals(a, b) { return a.q === b.q && a.r === b.r; }

  function distance(a, b) {
    var dq = a.q - b.q, dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  function neighbors(a) {
    return DIRS.map(function (d) { return add(a, d); });
  }

  // Pixelposition des Hex-Mittelpunkts (flat-top)
  var SQRT3 = Math.sqrt(3);
  function toPixel(a, size) {
    return {
      x: size * 1.5 * a.q,
      y: size * SQRT3 * (a.r + a.q / 2)
    };
  }

  // Eckpunkte eines flat-top Hexagons
  function corners(size) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var ang = Math.PI / 180 * (60 * i);
      pts.push([size * Math.cos(ang), size * Math.sin(ang)]);
    }
    return pts;
  }

  function cornerPoints(size, shrink) {
    return corners(size * (shrink || 1)).map(function (p) {
      return p[0].toFixed(2) + ',' + p[1].toFixed(2);
    }).join(' ');
  }

  // Einheitsvektor einer Richtung im Pixelraum (für Blickrichtungs-Pfeile)
  function dirVector(d) {
    var p = toPixel({ q: DIRS[d][0], r: DIRS[d][1] }, 1);
    var len = Math.sqrt(p.x * p.x + p.y * p.y);
    return { x: p.x / len, y: p.y / len };
  }

  function dirAngle(d) {
    var v = dirVector(d);
    return Math.atan2(v.y, v.x) * 180 / Math.PI;
  }

  /* Die 6 Hex-Diagonalen: Summe zweier benachbarter Richtungen.
     Ein Zug entlang einer Diagonale hält (q - r) mod 3 konstant – wer sich nur so
     bewegt, erreicht nur ein Drittel aller Felder (Samurai). */
  var DIAGS = DIRS.map(function (d, i) {
    var n = DIRS[(i + 1) % 6];
    return [d[0] + n[0], d[1] + n[1]];
  });

  /* Keil aus zwei benachbarten Richtungen (Springer): Richtung d und d+1.
     Der Pfeil zeigt auf die Winkelhalbierende zwischen beiden. */
  function wedgeDirs(d) { return [d % 6, (d + 1) % 6]; }

  function wedgeVector(d) {
    var a = dirVector(d % 6), b = dirVector((d + 1) % 6);
    var x = a.x + b.x, y = a.y + b.y;
    var len = Math.sqrt(x * x + y * y) || 1;
    return { x: x / len, y: y / len };
  }

  function wedgeAngle(d) {
    var v = wedgeVector(d);
    return Math.atan2(v.y, v.x) * 180 / Math.PI;
  }

  function wedgeName(d) {
    return DIR_NAMES[d % 6] + ' + ' + DIR_NAMES[(d + 1) % 6];
  }

  function wedgeShort(d) {
    return DIR_SHORT[d % 6] + '+' + DIR_SHORT[(d + 1) % 6];
  }

  // Zellen eines 7er-Plättchens um ein Zentrum
  function tileCells(center) {
    var cells = [{ q: center[0], r: center[1] }];
    for (var i = 0; i < 6; i++) {
      cells.push({ q: center[0] + DIRS[i][0], r: center[1] + DIRS[i][1] });
    }
    return cells;
  }

  return {
    DIRS: DIRS, DIAGS: DIAGS, DIR_NAMES: DIR_NAMES, DIR_SHORT: DIR_SHORT, TILE_DIRS: TILE_DIRS,
    wedgeDirs: wedgeDirs, wedgeVector: wedgeVector, wedgeAngle: wedgeAngle,
    wedgeName: wedgeName, wedgeShort: wedgeShort,
    key: key, parseKey: parseKey, add: add, scale: scale, equals: equals,
    distance: distance, neighbors: neighbors, toPixel: toPixel,
    corners: corners, cornerPoints: cornerPoints, dirVector: dirVector,
    dirAngle: dirAngle, tileCells: tileCells
  };
})();

if (typeof module !== 'undefined') { module.exports = Hex; }
