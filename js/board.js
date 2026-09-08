/* Hexodus – Spielfeld-Erzeugung aus zufällig angelegten 7er-Hexagon-Plättchen */
var Board = (function () {
  'use strict';

  var H = (typeof Hex !== 'undefined') ? Hex : require('./hex.js');

  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rnd(arr.length)]; }

  /* Legt `tileCount` Plättchen kompakt aneinander. Jedes Plättchen ist eine
     "Blume" aus 7 Hexfeldern; die Mittelpunkte liegen auf einem eigenen
     Dreiecksgitter (Hex.TILE_DIRS). */
  function layoutTiles(tileCount) {
    var centers = [[0, 0]];
    var used = {}; used['0,0'] = true;

    while (centers.length < tileCount) {
      var cands = {};
      for (var i = 0; i < centers.length; i++) {
        for (var d = 0; d < H.TILE_DIRS.length; d++) {
          var nq = centers[i][0] + H.TILE_DIRS[d][0];
          var nr = centers[i][1] + H.TILE_DIRS[d][1];
          var k = nq + ',' + nr;
          if (used[k]) continue;
          cands[k] = (cands[k] || 0) + 1; // Nachbarzahl = Kompaktheit
        }
      }
      var keys = Object.keys(cands);
      if (!keys.length) break;
      var best = 0;
      keys.forEach(function (k) { if (cands[k] > best) best = cands[k]; });
      var bestKeys = keys.filter(function (k) { return cands[k] === best; });
      var chosen = pick(bestKeys).split(',');
      used[chosen.join(',')] = true;
      centers.push([+chosen[0], +chosen[1]]);
    }
    return centers;
  }

  /* Verteilt zusammenhängende Wasserfelder innerhalb eines Plättchens. */
  function waterForTile(cells) {
    var amount = pick([0, 0, 1, 1, 2, 2, 2, 3]);
    if (!amount) return [];
    var chosen = [cells[rnd(cells.length)]];
    while (chosen.length < amount) {
      var options = [];
      cells.forEach(function (c) {
        if (chosen.some(function (x) { return H.equals(x, c); })) return;
        var touches = chosen.some(function (x) { return H.distance(x, c) === 1; });
        if (touches) options.push(c);
      });
      if (!options.length) break;
      chosen.push(pick(options));
    }
    return chosen;
  }

  function createCell(q, r, terrain) {
    return { q: q, r: r, terrain: terrain, tree: false, piece: null };
  }

  function generate(tileCount) {
    var centers = layoutTiles(tileCount);
    var cells = {};
    centers.forEach(function (c) {
      var tile = H.tileCells(c);
      var water = waterForTile(tile);
      tile.forEach(function (cell) {
        var isWater = water.some(function (w) { return H.equals(w, cell); });
        cells[H.key(cell.q, cell.r)] = createCell(cell.q, cell.r, isWater ? 'water' : 'grass');
      });
    });
    return {
      cells: cells,
      tiles: centers,
      keys: Object.keys(cells)
    };
  }

  function get(board, q, r) { return board.cells[H.key(q, r)] || null; }
  function at(board, c) { return c ? (board.cells[H.key(c.q, c.r)] || null) : null; }

  function forEach(board, fn) {
    board.keys.forEach(function (k) { fn(board.cells[k], k); });
  }

  function landCells(board) {
    return board.keys.map(function (k) { return board.cells[k]; })
      .filter(function (c) { return c.terrain === 'grass'; });
  }

  /* Freies Grasfeld: kein Baum, keine Figur. */
  function isFree(cell) {
    return !!cell && cell.terrain === 'grass' && !cell.tree && !cell.piece;
  }

  function bounds(board, size) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    board.keys.forEach(function (k) {
      var c = board.cells[k];
      var p = H.toPixel(c, size);
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
    return { minX: minX - size, minY: minY - size, maxX: maxX + size, maxY: maxY + size };
  }

  return {
    generate: generate, get: get, at: at, forEach: forEach,
    landCells: landCells, isFree: isFree, bounds: bounds
  };
})();

if (typeof module !== 'undefined') { module.exports = Board; }
