/* Boot-Regeln gegen die Regelkarte prüfen.
   Enthält das Beispiel der Karte: ein Zenturio quert zwei Wasserabschnitte für 2 Holz.
   Aufruf: node test/boot.js */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
var H = Hex, B = Board, M = Moves, G = Game;

/* Testbrett: eine Reihe Land-Wasser-Land entlang der Richtung 0 (Südost) */
function bahn(muster) {
  var cells = {}, keys = [];
  for (var i = 0; i < muster.length; i++) {
    var k = H.key(i, 0);
    cells[k] = { q: i, r: 0, terrain: muster[i] === 'W' ? 'water' : 'grass',
                 tree: false, boat: false, piece: null };
    keys.push(k);
  }
  // Nachbarreihen, damit die Geometrie stimmt
  for (var r = -1; r <= 1; r += 2) {
    for (var i2 = 0; i2 < muster.length; i2++) {
      var k2 = H.key(i2, r);
      cells[k2] = { q: i2, r: r, terrain: 'grass', tree: false, boat: false, piece: null };
      keys.push(k2);
    }
  }
  return { cells: cells, keys: keys };
}

var fails = 0;
function check(name, got, want) {
  var a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log('  ok   ' + name);
  else { fails++; console.log('  FEHL ' + name + '\n       erwartet ' + b + '\n       erhalten ' + a); }
}

/* --- 1. Arbeiter: Land -> Wasser kostet ein Boot --- */
var board = bahn('LWL');
var start = board.cells[H.key(0, 0)];
start.piece = { type: 'worker', owner: 0, facing: 0 };
var acts = M.forPiece(board, start, 3);
var aufsWasser = acts.filter(function (a) { return a.q === 1 && a.r === 0; })[0];
check('Arbeiter darf aufs Wasser', !!aufsWasser, true);
check('und zahlt 1 Holz dafür', aufsWasser && aufsWasser.cost, 1);

/* ohne Holz geht es nicht */
var ohne = M.forPiece(board, start, 0).filter(function (a) { return a.q === 1 && a.r === 0; });
check('ohne Holz kein Wasser', ohne.length, 0);

/* liegt schon ein Boot da, ist es frei */
board.cells[H.key(1, 0)].boat = true;
var mitBoot = M.forPiece(board, start, 0).filter(function (a) { return a.q === 1 && a.r === 0; })[0];
check('vorhandenes Boot ist gratis', mitBoot && (mitBoot.cost || 0), 0);

/* --- 2. Zenturio quert zwei Wasserabschnitte: 2 Holz (wie auf der Karte) --- */
var b2 = bahn('LWLWL');
var z = b2.cells[H.key(0, 0)];
z.piece = { type: 'zenturio', owner: 0, facing: 0 };
var zActs = M.forPiece(b2, z, 5);
function kosten(list, q) {
  var a = list.filter(function (x) { return x.q === q && x.r === 0; })[0];
  return a ? (a.cost || 0) : null;
}
check('Zenturio: 1. Wasserfeld kostet 1', kosten(zActs, 1), 1);
check('Zenturio: Land dahinter kostet 1', kosten(zActs, 2), 1);
check('Zenturio: 2. Wasserabschnitt kostet 2', kosten(zActs, 3), 2);
check('Zenturio: Ziel dahinter kostet 2', kosten(zActs, 4), 2);

/* mit nur 1 Holz kommt er nicht über den zweiten Abschnitt */
var zArm = M.forPiece(b2, z, 1);
check('mit 1 Holz nur bis zum ersten Abschnitt', kosten(zArm, 3), null);

/* --- 3. Ausführen: Boote landen an den richtigen Stellen --- */
var st = G.create(['A', 'B']);
st.board = b2;
st.phase = 'play';
st.current = 0;
st.players[0].wood = 5;
var ziel = b2.cells[H.key(4, 0)];
var zug = M.forPiece(b2, z, 5).filter(function (a) { return a.q === 4 && a.r === 0; })[0];
G.perform(st, z, zug);
check('Zenturio steht am Ziel', !!ziel.piece, true);
check('Holz bezahlt (5 - 2)', st.players[0].wood, 3);
check('Boot auf dem 1. Wasserfeld', b2.cells[H.key(1, 0)].boat, true);
check('Boot auf dem 2. Wasserfeld', b2.cells[H.key(3, 0)].boat, true);

/* --- 4. Auf dem Wasser stehen bleiben: Boot liegt unter der Figur --- */
var b3 = bahn('LWL');
var w = b3.cells[H.key(0, 0)];
w.piece = { type: 'worker', owner: 0, facing: 0 };
var st3 = G.create(['A', 'B']);
st3.board = b3; st3.phase = 'play'; st3.current = 0; st3.players[0].wood = 2;
var rein = M.forPiece(b3, w, 2).filter(function (a) { return a.q === 1 && a.r === 0; })[0];
G.perform(st3, w, rein);
check('Arbeiter steht auf dem Wasser', !!b3.cells[H.key(1, 0)].piece, true);
check('Boot liegt unter ihm', b3.cells[H.key(1, 0)].boat, true);
check('1 Holz bezahlt', st3.players[0].wood, 1);

/* weiter an Land: Boot bleibt auf dem Wasser zurück */
var aufWasser = b3.cells[H.key(1, 0)];
var raus = M.forPiece(b3, aufWasser, 1).filter(function (a) { return a.q === 2 && a.r === 0; })[0];
check('Rückweg an Land ist gratis', raus && (raus.cost || 0), 0);
st3.current = 0;
G.perform(st3, aufWasser, raus);
check('Boot bleibt liegen', b3.cells[H.key(1, 0)].boat, true);
check('Arbeiter ist an Land', !!b3.cells[H.key(2, 0)].piece, true);
check('kein Holz mehr gezahlt', st3.players[0].wood, 1);

console.log(fails ? '\n' + fails + ' Fehler' : '\nBoot-Regeln stimmen mit der Karte überein.');
process.exit(fails ? 1 : 0);
