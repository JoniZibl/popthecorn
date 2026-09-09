/* Prüft Samurai und Springer gegen die Zielfelder aus den Regelkarten.
   Die Abbildungen wurden pixelweise ausgemessen; hier stehen die daraus
   abgeleiteten Feldversätze in Hex-Koordinaten. */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
var H = Hex, M = require('../js/moves.js');

function emptyBoard(radius) {
  var cells = {}, keys = [];
  for (var q = -radius; q <= radius; q++) {
    for (var r = -radius; r <= radius; r++) {
      var k = H.key(q, r);
      cells[k] = { q: q, r: r, terrain: 'grass', tree: false, piece: null };
      keys.push(k);
    }
  }
  return { cells: cells, keys: keys };
}

function targetsOf(type, facing, mutate) {
  var board = emptyBoard(6);
  var cell = board.cells[H.key(0, 0)];
  cell.piece = { type: type, owner: 0, facing: facing };
  if (mutate) mutate(board);
  return M.forPiece(board, cell, 0)
    .map(function (a) { return a.q + ',' + a.r; }).sort();
}

var fails = 0;
function check(name, got, want) {
  var a = got.slice().sort().join(' '), b = want.slice().sort().join(' ');
  if (a === b) { console.log('  ok   ' + name); }
  else { fails++; console.log('  FEHL ' + name + '\n       erwartet: ' + b + '\n       erhalten: ' + a); }
}

console.log('Samurai – die 6 Diagonalen (Karte: "niemals alle Felder berühren")');
check('Zielfelder', targetsOf('samurai', 0),
      ['2,-1', '1,-2', '-1,-1', '-2,1', '-1,2', '1,1']);
check('bleibt auf einer Farbklasse',
      [String(targetsOf('samurai', 0).every(function (k) {
        var p = k.split(',');
        return ((+p[0] - +p[1]) % 3 + 3) % 3 === 0;
      }))], ['true']);
check('springt über Baum und Wasser hinweg',
      targetsOf('samurai', 0, function (b) {
        b.cells[H.key(1, 0)].tree = true;       // Richtung SO
        b.cells[H.key(1, -1)].terrain = 'water'; // Richtung NO
      }),
      ['2,-1', '1,-2', '-1,-1', '-2,1', '-1,2', '1,1']);

console.log('\nSpringer – zwei benachbarte Richtungen, 2 und 3 Felder weit');
// Keil SO+NO: gemessen als "Zug 1" der Karte (zwei Richtungen, je 2 und 3 Felder)
check('Keil SO+NO', targetsOf('springer', 0), ['2,0', '3,0', '2,-2', '3,-3']);
check('Keil NO+N',  targetsOf('springer', 1), ['2,-2', '3,-3', '0,-2', '0,-3']);
check('nur Distanz 2 und 3', [targetsOf('springer', 0).map(function (k) {
        var p = k.split(',');
        return H.distance({ q: +p[0], r: +p[1] }, { q: 0, r: 0 });
      }).sort().join(',')], ['2,2,3,3']);
check('springt über besetzte Felder hinweg',
      targetsOf('springer', 0, function (b) {
        b.cells[H.key(1, 0)].piece = { type: 'worker', owner: 1, facing: 0 };  // dazwischen
        b.cells[H.key(2, -1)].terrain = 'water';
      }),
      ['2,0', '3,0', '2,-2', '3,-3']);
check('eigene Figur blockiert nur das Zielfeld',
      targetsOf('springer', 0, function (b) {
        b.cells[H.key(2, 0)].piece = { type: 'worker', owner: 0, facing: 0 };
      }),
      ['3,0', '2,-2', '3,-3']);

console.log('\nBogenschütze – Schuss auf Distanz 2 in den 6 Geraden');
check('Schussfelder', targetsOf('archer', 0, function (b) {
        H.DIRS.forEach(function (d) {
          b.cells[H.key(d[0] * 2, d[1] * 2)].piece = { type: 'worker', owner: 1, facing: 0 };
        });
      }).filter(function (k) {
        return ['2,0', '2,-2', '0,-2', '-2,0', '-2,2', '0,2'].indexOf(k) >= 0;
      }), ['2,0', '2,-2', '0,-2', '-2,0', '-2,2', '0,2']);

console.log(fails ? '\n' + fails + ' Prüfung(en) fehlgeschlagen' : '\nAlle Prüfungen bestanden.');
process.exit(fails ? 1 : 0);
