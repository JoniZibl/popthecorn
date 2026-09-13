/* Wetterkarten: Jede Karte einzeln gegen das Regelwerk geprüft.

   test/ki.js prüft, dass beide Zuggeneratoren unter jeder Karte dasselbe
   sagen. Hier steht die andere Hälfte: dass sie überhaupt das Richtige sagen.
   Aufruf: node test/wetter.js */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Wetter = require('../js/wetter.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
global.AI = require('../js/ai.js');
var H = Hex, M = Moves, G = Game, W = Wetter;

var fehler = 0, gruppe = '';
function ok(bedingung, text) {
  console.log((bedingung ? '  ok   ' : '  FEHL ') + text);
  if (!bedingung) fehler++;
}
function titel(t) { gruppe = t; console.log('\n' + t); }

/* Rechteckiges Grasbrett – dieselbe Werkstatt wie in test/versorgung.js */
function brett(breite, hoehe) {
  var cells = {}, keys = [];
  for (var q = -1; q <= breite; q++) {
    for (var r = -1; r <= hoehe; r++) {
      var k = H.key(q, r);
      cells[k] = { q: q, r: r, terrain: 'grass', tree: false, boat: false, piece: null };
      keys.push(k);
    }
  }
  return { cells: cells, keys: keys, teams: null, wetter: W.NEUTRAL };
}
function stelle(board, q, r, typ, spieler, facing) {
  board.cells[H.key(q, r)].piece = { type: typ, owner: spieler || 0, facing: facing || 0 };
}
function baum(board, q, r) { board.cells[H.key(q, r)].tree = true; }
function wasser(board, q, r) { board.cells[H.key(q, r)].terrain = 'water'; }

function zustand(board, holz) {
  var st = G.create(['Eins', 'Zwei'], [null, null], null, { wetter: true });
  st.board = board;
  st.phase = 'play';
  st.current = 0;
  st.players[0].wood = holz === undefined ? 5 : holz;
  st.players[1].wood = holz === undefined ? 5 : holz;
  return st;
}
function setzeWetter(st, id) { st.board.wetter = W.wirkungVon(id); st.karte = id; }

/* Aktionen einer Figur als Menge "art:feld" */
function zuege(st, q, r) {
  var cell = st.board.cells[H.key(q, r)];
  return M.forPiece(st.board, cell, st.players[cell.piece.owner].wood)
    .map(function (a) { return a.kind + ':' + a.q + ',' + a.r; });
}
function hat(liste, was) { return liste.indexOf(was) >= 0; }
function felder(st, p) {
  return M.trainingSpots(st.board, p).map(function (c) { return H.key(c.q, c.r); }).sort();
}

/* ---------------- Der Stapel ---------------- */

titel('Der Kartenstapel');
var alle = W.stapel();
ok(alle.length >= 18, 'der Stapel hat ' + alle.length + ' Karten');
ok(W.KARTEN.length === 16, '15 Wetterkarten und die Ruhe vor dem Sturm');
var vollstaendig = W.KARTEN.every(function (k) {
  return k.name && k.kurz && k.text && k.icon && k.farbe && k.menge > 0;
});
ok(vollstaendig, 'jede Karte hat Name, Kurztext, Regeltext, Zeichen und Farbe');
var neutral = W.KARTEN.filter(function (k) { return !k.effekt && !k.sofort && !k.extraZug; });
ok(neutral.length === 1 && neutral[0].id === 'ruhe', 'nur die Ruhe bewirkt nichts');
var unbekannt = W.KARTEN.filter(function (k) {
  return k.effekt && Object.keys(k.effekt).some(function (e) { return !(e in W.NEUTRAL); });
});
ok(!unbekannt.length, 'keine Karte dreht an einer Schraube, die es nicht gibt');

/* ---------------- Gelände ---------------- */

titel('Frost – das Wasser trägt umsonst');
var b1 = brett(8, 4);
stelle(b1, 2, 2, 'worker', 0);
wasser(b1, 3, 2);
var st1 = zustand(b1, 0);                      // kein Holz für ein Boot
ok(!hat(zuege(st1, 2, 2), 'move:3,2'), 'ohne Holz kommt der Arbeiter nicht aufs Wasser');
setzeWetter(st1, 'frost');
ok(hat(zuege(st1, 2, 2), 'move:3,2'), 'mit Frost schon');

titel('Windbruch – einzeln stehende Bäume fallen');
var b2 = brett(8, 4);
baum(b2, 1, 1); baum(b2, 2, 1);               // stehen beieinander
baum(b2, 5, 3);                               // steht allein
stelle(b2, 0, 0, 'king', 0);
var st2 = zustand(b2);
var folge2 = W.karte('windbruch').sofort(st2, {});
ok(!st2.board.cells[H.key(5, 3)].tree, 'der einzelne Baum ist weg');
ok(st2.board.cells[H.key(1, 1)].tree && st2.board.cells[H.key(2, 1)].tree,
   'die beiden im Windschatten stehen noch');
ok(folge2.felder.length === 1, 'die Anzeige erfährt, welches Feld sich geändert hat');
ok(st2.players[0].wood === 5, 'das Holz des gefallenen Baums bekommt niemand');

titel('Neuer Wuchs – zwischen zwei Bäumen wächst einer');
var b3 = brett(10, 5);
baum(b3, 2, 2); baum(b3, 3, 1);               // beide grenzen an (3,2)
var st3 = zustand(b3);
W.karte('wuchs').sofort(st3, {});
ok(st3.board.cells[H.key(3, 2)].tree, 'auf dem Feld dazwischen wächst ein Baum');
var b4 = brett(14, 8);
for (var q4 = 0; q4 < 12; q4 += 2) { baum(b4, q4, 2); baum(b4, q4, 4); baum(b4, q4, 6); }
var st4 = zustand(b4);
var vorher4 = 0, nachher4 = 0;
b4.keys.forEach(function (k) { if (b4.cells[k].tree) vorher4++; });
W.karte('wuchs').sofort(st4, {});
b4.keys.forEach(function (k) { if (b4.cells[k].tree) nachher4++; });
ok(nachher4 - vorher4 <= W.WUCHS_MAX, 'höchstens ' + W.WUCHS_MAX + ' Bäume je Karte (' +
   (nachher4 - vorher4) + ')');

/* ---------------- Sicht ---------------- */

titel('Nebel und Klare Sicht – die Schussweite');
var b5 = brett(10, 4);
stelle(b5, 2, 2, 'archer', 0);
stelle(b5, 3, 2, 'worker', 1);                 // Distanz 1
stelle(b5, 4, 2, 'samurai', 1);                // Distanz 2
stelle(b5, 5, 2, 'legionaer', 1);              // Distanz 3
var st5 = zustand(b5);
var z5 = zuege(st5, 2, 2);
ok(hat(z5, 'shoot:4,2') && !hat(z5, 'shoot:5,2'), 'normal trifft er auf Distanz 2');
setzeWetter(st5, 'nebel');
var z5n = zuege(st5, 2, 2);
ok(hat(z5n, 'shoot:3,2') && !hat(z5n, 'shoot:4,2'), 'im Nebel nur auf Distanz 1');
setzeWetter(st5, 'klar');
var z5k = zuege(st5, 2, 2);
ok(hat(z5k, 'shoot:5,2') && !hat(z5k, 'shoot:4,2'), 'bei klarer Sicht auf Distanz 3');

titel('Windstille – Springer und Legionär ziehen in jede Richtung');
var b6 = brett(10, 6);
stelle(b6, 4, 2, 'legionaer', 0, 0);           // Achse Südost/Nordwest
stelle(b6, 1, 4, 'springer', 0, 0);
var st6 = zustand(b6);
ok(!hat(zuege(st6, 4, 2), 'move:4,1'), 'der Legionär läuft sonst nur auf seiner Achse');
setzeWetter(st6, 'windstille');
ok(hat(zuege(st6, 4, 2), 'move:4,1'), 'bei Windstille auch quer dazu');
ok(zuege(st6, 1, 4).length >= 8, 'der Springer erreicht alle sechs Keile (' +
   zuege(st6, 1, 4).length + ' Ziele)');
ok(st6.board.cells[H.key(4, 2)].piece.facing === 0, 'gedreht wird dabei nichts');

/* ---------------- Wirtschaft ---------------- */

titel('Trockenheit – Fällen kostet keinen Zug');
var b7 = brett(8, 4);
stelle(b7, 0, 0, 'king', 0);
stelle(b7, 2, 2, 'worker', 0);
baum(b7, 3, 2);
stelle(b7, 6, 3, 'king', 1);
var st7 = zustand(b7, 0);
setzeWetter(st7, 'trockenheit');
var w7 = st7.board.cells[H.key(2, 2)];
var ernte = M.forPiece(st7.board, w7, 0).filter(function (a) { return a.kind === 'harvest'; })[0];
G.perform(st7, w7, ernte);
ok(st7.current === 0, 'derselbe Spieler ist noch am Zug');
ok(st7.nochmal === true, 'das Spiel weiß, dass er noch einmal darf');
ok(st7.players[0].wood === 1, 'ein Baum gibt weiterhin genau 1 Holz');
// Ohne die Karte wird weitergegeben
var st7b = zustand(brett(8, 4), 0);
stelle(st7b.board, 0, 0, 'king', 0); stelle(st7b.board, 6, 3, 'king', 1);
stelle(st7b.board, 2, 2, 'worker', 0); baum(st7b.board, 3, 2);
var w7b = st7b.board.cells[H.key(2, 2)];
G.perform(st7b, w7b, M.forPiece(st7b.board, w7b, 0).filter(function (a) {
  return a.kind === 'harvest';
})[0]);
ok(st7b.current === 1, 'ohne Trockenheit ist danach der Nächste dran');

titel('Fahrender Markt und Hungerwinter');
var b8 = brett(8, 4);
stelle(b8, 0, 0, 'king', 0);
stelle(b8, 5, 3, 'king', 1);
var st8 = zustand(b8, 2);
ok(M.trainBlocker(st8, 0, 'zenturio') === 'zu wenig Holz', 'der Zenturio kostet sonst 3 Holz');
setzeWetter(st8, 'markt');
ok(M.preis(st8.board, 'zenturio') === 2, 'auf dem Markt kostet er 2');
ok(M.trainBlocker(st8, 0, 'zenturio') === null, 'und ist mit 2 Holz bezahlbar');
ok(M.preis(st8.board, 'worker') === 1, 'unter 1 Holz fällt nichts');
ok(G.train(st8, 'zenturio', 1, 0), 'er wird auch wirklich ausgebildet');
ok(st8.players[0].wood === 0, 'und hat 2 Holz gekostet');
setzeWetter(st8, 'hunger');
ok(M.trainBlocker(st8, 0, 'worker') === 'Hungerwinter', 'im Hungerwinter bildet niemand aus');
ok(M.affordableUnits(st8, 0).length === 0, 'keine Einheit steht zur Wahl');

/* ---------------- Nachschub ---------------- */

titel('Feldlager – die Kette überspringt ein Feld');
var b9 = brett(10, 4);
stelle(b9, 0, 0, 'king', 0);
stelle(b9, 2, 0, 'samurai', 0);                // eine Lücke bei (1,0)
stelle(b9, 8, 3, 'king', 1);
var st9 = zustand(b9);
ok(felder(st9, 0).indexOf('3,0') < 0, 'die abgehängte Figur versorgt sonst nichts');
setzeWetter(st9, 'feldlager');
ok(felder(st9, 0).indexOf('3,0') >= 0, 'mit Feldlager schon');
var b9b = brett(10, 4);
stelle(b9b, 0, 0, 'king', 0);
stelle(b9b, 1, 0, 'worker', 1);                // ein Gegner in der Lücke
stelle(b9b, 2, 0, 'samurai', 0);
stelle(b9b, 8, 3, 'king', 1);
var st9b = zustand(b9b);
setzeWetter(st9b, 'feldlager');
ok(felder(st9b, 0).indexOf('3,0') < 0, 'eine fremde Figur in der Lücke reißt die Kette doch');

titel('Belagerung – Nachschub nur im Umkreis von 3');
var b10 = brett(12, 4);
stelle(b10, 0, 0, 'king', 0);
for (var i10 = 1; i10 <= 5; i10++) stelle(b10, i10, 0, ['worker', 'samurai', 'archer', 'legionaer', 'tangolin'][i10 - 1], 0);
stelle(b10, 10, 3, 'king', 1);
var st10 = zustand(b10);
ok(felder(st10, 0).indexOf('6,0') >= 0, 'die lange Kette versorgt sonst bis ganz vorn');
setzeWetter(st10, 'belagerung');
var f10 = felder(st10, 0);
ok(f10.indexOf('6,0') < 0, 'unter Belagerung nicht mehr');
ok(f10.indexOf('3,1') >= 0, 'nahe am Turm bleibt es dabei');
// Das Feldzeichen ist der zweite Anker – auch unter Belagerung
var b11 = brett(14, 4);
stelle(b11, 0, 0, 'king', 0);
stelle(b11, 10, 0, 'zenturio', 0);
stelle(b11, 12, 3, 'king', 1);
var st11 = zustand(b11);
setzeWetter(st11, 'belagerung');
ok(felder(st11, 0).indexOf('11,0') >= 0, 'am Feldzeichen wird weiter ausgebildet');

titel('Musterung – wer keinen Arbeiter hat, bekommt einen');
var b12 = brett(10, 5);
stelle(b12, 0, 0, 'king', 0);
stelle(b12, 6, 3, 'king', 1);
stelle(b12, 6, 4, 'worker', 1);                // Spieler 2 hat schon einen
var st12 = zustand(b12);
st12.karte = 'musterung';
var folge12 = W.karte('musterung').sofort(st12, {
  hatTyp: function (s, o, t) { return !!M.typesOnBoard(s.board, o)[t]; },
  nachschubFeld: function (s, o) { return M.trainingSpots(s.board, o)[0] || null; }
});
ok(!!M.typesOnBoard(b12, 0).worker, 'Spieler 1 bekommt einen Arbeiter gestellt');
ok(folge12.felder.length === 1, 'nur er – wer einen hat, bekommt nichts');

/* ---------------- Bewegung ---------------- */

titel('Schlamm – kein Zug führt weiter als 2 Felder');
var b13 = brett(16, 6);
stelle(b13, 1, 1, 'zenturio', 0);
stelle(b13, 6, 4, 'springer', 0, 0);
stelle(b13, 9, 1, 'tangolin', 0);
baum(b13, 10, 1); baum(b13, 12, 1);            // zwei Sprungbretter hintereinander
var st13 = zustand(b13);
ok(hat(zuege(st13, 1, 1), 'move:5,1'), 'der Zenturio läuft sonst weit');
ok(hat(zuege(st13, 9, 1), 'jump:13,1'), 'der Tangolin springt sonst weiter');
setzeWetter(st13, 'schlamm');
var z13 = zuege(st13, 1, 1);
ok(hat(z13, 'move:3,1') && !hat(z13, 'move:4,1'), 'im Schlamm endet er nach 2 Feldern');
var z13s = zuege(st13, 6, 4);
ok(z13s.length > 0 && z13s.every(function (x) {
  var p = x.split(':')[1].split(',');
  return H.distance({ q: 6, r: 4 }, { q: +p[0], r: +p[1] }) <= 2;
}), 'der Springer springt nur die kurze Weite');
ok(!hat(zuege(st13, 9, 1), 'jump:13,1'), 'der Tangolin kommt über einen Sprung nicht hinaus');
ok(hat(zuege(st13, 9, 1), 'jump:11,1'), 'der erste Sprung geht weiterhin');

titel('Marschbefehl – ein Feld weiter');
var b14 = brett(12, 6);
stelle(b14, 2, 2, 'worker', 0);
stelle(b14, 6, 4, 'springer', 0, 0);
stelle(b14, 9, 2, 'worker', 1);
baum(b14, 9, 3);
var st14 = zustand(b14);
ok(!hat(zuege(st14, 2, 2), 'move:4,2'), 'sonst geht der Arbeiter ein Feld');
setzeWetter(st14, 'marsch');
ok(hat(zuege(st14, 2, 2), 'move:4,2'), 'mit Marschbefehl zwei');
ok(!hat(zuege(st14, 9, 2), 'harvest:9,4'), 'gefällt wird weiter nur vom Nachbarfeld aus');
b14.cells[H.key(3, 2)].piece = { type: 'samurai', owner: 1, facing: 0 };
ok(!hat(zuege(st14, 2, 2), 'move:4,2'), 'eine Figur auf halbem Weg beendet den Marsch');
b14.cells[H.key(3, 2)].piece = null;
var z14 = zuege(st14, 6, 4);
ok(z14.some(function (x) {
  var p = x.split(':')[1].split(',');
  return H.distance({ q: 6, r: 4 }, { q: +p[0], r: +p[1] }) === 4;
}), 'der Springer springt bis zu 4 Felder');

titel('Aufbruch – zwei Züge für den, der aufdeckt');
var b15 = brett(10, 5);
stelle(b15, 0, 0, 'king', 0);
stelle(b15, 2, 2, 'samurai', 0);
stelle(b15, 8, 4, 'king', 1);
var st15 = zustand(b15, 0);
setzeWetter(st15, 'aufbruch');
st15.extra = 1;                                 // das macht sonst das Aufdecken
var s15 = st15.board.cells[H.key(2, 2)];
G.perform(st15, s15, M.forPiece(st15.board, s15, 0)[0]);
ok(st15.current === 0, 'nach dem ersten Zug ist er noch einmal dran');
var s15b = null;
b15.keys.forEach(function (k) {
  var c = b15.cells[k];
  if (c.piece && c.piece.type === 'samurai') s15b = c;
});
G.perform(st15, s15b, M.forPiece(st15.board, s15b, 0)[0]);
ok(st15.current === 1, 'nach dem zweiten gibt er ab');

/* ---------------- Ablauf einer Partie ---------------- */

titel('Aufdecken, ablegen, neu mischen');
var st16 = G.create(['A', 'B'], [null, null], null, { wetter: true });
G.autoPlaceTrees(st16);
var schutz = 0;
while (st16.phase === 'kings' && schutz++ < 400) {
  var frei = st16.board.keys.map(function (k) { return st16.board.cells[k]; });
  if (st16.awaitWorker) {
    var wf = frei.filter(function (c) {
      return Board.isFree(c) && H.neighbors(c).some(function (nb) {
        var x = Board.at(st16.board, nb);
        return x && x.piece && x.piece.type === 'king' && x.piece.owner === st16.current;
      });
    })[0];
    G.placeWorker(st16, wf.q, wf.r);
  } else {
    var kf = frei.filter(function (c) { return G.canPlaceKing(st16, c); })[0];
    G.placeKing(st16, kf.q, kf.r);
  }
}
ok(st16.phase === 'play', 'die Partie hat begonnen');
ok(!!st16.karte, 'zum Start liegt eine Karte offen: ' + (W.karte(st16.karte) || {}).name);
ok(st16.board.wetter.id === st16.karte, 'ihre Wirkung hängt am Brett');
var gesehen = {}, runde0 = st16.turn;
for (var z = 0; z < 240 && st16.phase === 'play'; z++) {
  gesehen[st16.karte] = (gesehen[st16.karte] || 0) + 1;
  if (st16.pending) { G.endPending(st16); continue; }
  var opts = [];
  st16.board.keys.forEach(function (key) {
    var c = st16.board.cells[key];
    if (!c.piece || c.piece.owner !== st16.current) return;
    G.actionsFor(st16, c).forEach(function (a) { opts.push({ c: c, a: a }); });
  });
  if (!opts.length) { G.pass(st16); continue; }
  var o = opts[Math.floor(Math.random() * opts.length)];
  G.perform(st16, o.c, o.a);
}
ok(Object.keys(gesehen).length >= 3, 'über die Partie kamen ' + Object.keys(gesehen).length +
   ' verschiedene Karten');
ok(st16.stapel.length + st16.ablage.length + 1 >= 18 || st16.phase !== 'play',
   'Stapel und Ablage bleiben zusammen vollständig');

titel('Das Standardspiel bleibt unberührt');
var st17 = G.create(['A', 'B'], [null, null]);
ok(st17.wetterAn === false, 'ohne Wahl wird ohne Wetter gespielt');
ok(st17.board.wetter === W.NEUTRAL, 'am Brett hängt die neutrale Wirkung');
G.autoPlaceTrees(st17);
ok(st17.karte === null, 'es wird keine Karte gezogen');
ok(G.ziehe(st17) === null, 'auch nicht auf Nachfrage');

console.log(fehler ? '\n' + fehler + ' Prüfung(en) fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
