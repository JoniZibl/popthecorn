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

console.log('\nBestandsgrenze – höchstens eine Figur je Typ und Spieler');
global.Moves = M;
var G = require('../js/game.js');

function fieldGame() {
  var s = G.create(['A', 'B']);
  G.autoPlaceTrees(s);
  // Türme und Arbeiter setzen
  var guard = 0;
  while (s.phase === 'kings' && guard++ < 200) {
    var free = s.board.keys.map(function (k) { return s.board.cells[k]; });
    if (s.awaitWorker) {
      var w = free.filter(function (c) {
        return Board.isFree(c) && H.neighbors(c).some(function (n) {
          var x = Board.at(s.board, n);
          return x && x.piece && x.piece.type === 'king' && x.piece.owner === s.current;
        });
      })[0];
      G.placeWorker(s, w.q, w.r);
    } else {
      var k = free.filter(function (c) { return G.canPlaceKing(s, c); })[0];
      G.placeKing(s, k.q, k.r);
    }
  }
  return s;
}

var st = fieldGame();
var me = st.current;
st.players[me].wood = 20;
// Platz um den eigenen Turm schaffen, damit es Ausbildungsfelder gibt
var myKing = st.board.keys.map(function (k) { return st.board.cells[k]; })
  .filter(function (c) { return c.piece && c.piece.type === 'king' && c.piece.owner === me; })[0];
st.board.keys.forEach(function (k) {
  var c = st.board.cells[k];
  if (H.distance(c, myKing) <= 2) { c.tree = false; if (c.terrain === 'water') c.terrain = 'grass'; }
});
check('Ausbildungsfelder vorhanden',
      [String(M.trainingSpots(st.board, me).length > 0)], ['true']);

check('Arbeiter steht schon -> gesperrt',
      [String(M.trainBlocker(st, me, 'worker'))], ['steht im Spiel']);
check('Arbeiter fehlt in der Auswahl',
      [String(M.affordableUnits(st, me).indexOf('worker') === -1)], ['true']);
check('Samurai ist frei',
      [String(M.trainBlocker(st, me, 'samurai'))], ['null']);

// Samurai ausbilden, danach muss er gesperrt sein
var spot = M.trainingSpots(st.board, me)[0];
var ok = G.train(st, 'samurai', spot.q, spot.r);
check('Samurai ausgebildet', [String(ok)], ['true']);
check('zweiter Samurai gesperrt',
      [String(M.trainBlocker(st, me, 'samurai'))], ['steht im Spiel']);

// Ausbildung wird auch in der Zugabwicklung verweigert, nicht nur in der Anzeige
st.current = me;
st.pending = null;
var spot2 = M.trainingSpots(st.board, me)[0];
check('train() verweigert den zweiten Samurai',
      [String(G.train(st, 'samurai', spot2.q, spot2.r))], ['false']);

// Samurai vom Feld nehmen -> wieder ausbildbar
st.board.keys.forEach(function (k) {
  var c = st.board.cells[k];
  if (c.piece && c.piece.type === 'samurai' && c.piece.owner === me) c.piece = null;
});
check('nach Verlust wieder ausbildbar',
      [String(M.trainBlocker(st, me, 'samurai'))], ['null']);

// Zenturio bleibt einmalig pro Partie
st.players[me].trained.zenturio = 1;
check('Zenturio bleibt nach Verlust gesperrt',
      [String(M.trainBlocker(st, me, 'zenturio'))], ['schon ausgebildet']);

console.log(fails ? '\n' + fails + ' Prüfung(en) fehlgeschlagen' : '\nAlle Prüfungen bestanden.');
process.exit(fails ? 1 : 0);
