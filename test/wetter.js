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

/* Keine Karte darf an genau einer Figur hängen, die nicht jeder hat: Wer
   gerade keinen Bogenschützen im Spiel hat, spielte sonst eine Runde lang
   unter einer Karte, die für ihn nichts bedeutet – das ist eine Strafe für
   den Besitzer und kein Wetter.

   Die Ausnahmen sind Turm und Arbeiter: Die hat jeder Spieler von der ersten
   Runde an, und wer seinen Arbeiter verliert, bekommt ihn per Musterung
   wieder. Eine Karte, die am Arbeiter hängt, ist eine Wirtschaftskarte und
   trifft jeden. */
var ALLE = '*';                               // betrifft jede Figur
var IMMER_DA = { king: true, worker: true };  // die hat jeder Spieler
var FIGUREN_JE_SCHRAUBE = {
  bootPreis: [ALLE],            // jede Figur, die aufs Wasser zieht
  schuss: ['archer'],
  nahSchlag: ['legionaer', 'zenturio'],
  weitSprung: ['springer'],
  maxWeite: ['legionaer', 'zenturio', 'springer', 'tangolin'],
  extraFeld: ['worker', 'archer', 'tangolin', 'king'],
  freieRichtung: ['springer', 'legionaer'],
  kosten: [ALLE], keineAusbildung: [ALLE],    // jede Ausbildung
  luecke: [ALLE], radius: [ALLE],             // der Nachschub aller
  faellenFrei: ['worker']
};
var zuEng = W.KARTEN.filter(function (k) {
  if (!k.effekt) return false;                // Sofortkarten treffen das Brett, nicht eine Figur
  var betroffen = {};
  Object.keys(k.effekt).forEach(function (e) {
    (FIGUREN_JE_SCHRAUBE[e] || []).forEach(function (f) { betroffen[f] = true; });
  });
  var namen = Object.keys(betroffen);
  if (betroffen[ALLE] || namen.length >= 2) return false;
  return !namen.some(function (f) { return IMMER_DA[f]; });
});
ok(!zuEng.length, 'keine Karte hängt an einer einzigen Figur' +
   (zuEng.length ? ' (' + zuEng.map(function (k) { return k.name; }).join(', ') + ')' : ''));

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

titel('Nebel – auf Distanz trifft niemand');
var b5 = brett(10, 4);
stelle(b5, 2, 2, 'archer', 0);
stelle(b5, 3, 2, 'worker', 1);                 // Distanz 1
stelle(b5, 4, 2, 'samurai', 1);                // Distanz 2
stelle(b5, 5, 2, 'legionaer', 1);              // Distanz 3
var st5 = zustand(b5);
var z5 = zuege(st5, 2, 2);
ok(hat(z5, 'shoot:4,2') && !hat(z5, 'shoot:5,2'), 'normal trifft der Bogenschütze auf Distanz 2');
setzeWetter(st5, 'nebel');
var z5n = zuege(st5, 2, 2);
ok(hat(z5n, 'shoot:3,2') && !hat(z5n, 'shoot:4,2'), 'im Nebel nur auf Distanz 1');

/* Und der zweite Teil der Karte: Die Läufer schlagen nur direkt vor sich. */
var b5b = brett(12, 5);
stelle(b5b, 1, 1, 'zenturio', 0);
stelle(b5b, 5, 1, 'worker', 1);                // vier Felder voraus
var st5b = zustand(b5b);
ok(hat(zuege(st5b, 1, 1), 'capture:5,1'), 'sonst schlägt der Zenturio ans Ende seiner Bahn');
setzeWetter(st5b, 'nebel');
var z5b = zuege(st5b, 1, 1);
ok(!hat(z5b, 'capture:5,1'), 'im Nebel nicht mehr');
ok(hat(z5b, 'move:4,1') && !hat(z5b, 'move:5,1'), 'die Figur steht ihm trotzdem im Weg');
b5b.cells[H.key(5, 1)].piece = null;
b5b.cells[H.key(2, 1)].piece = { type: 'worker', owner: 1, facing: 0 };
ok(hat(zuege(st5b, 1, 1), 'capture:2,1'), 'was direkt vor ihm steht, schlägt er weiter');

titel('Klare Sicht – jeder sieht weiter');
setzeWetter(st5, 'klar');
var z5k = zuege(st5, 2, 2);
ok(hat(z5k, 'shoot:5,2') && !hat(z5k, 'shoot:4,2'), 'der Bogenschütze trifft auf Distanz 3');
var b5c = brett(12, 8);
stelle(b5c, 4, 4, 'springer', 0, 0);
var st5c = zustand(b5c);
function weiten5(st) {
  return zuege(st, 4, 4).map(function (x) {
    var p = x.split(':')[1].split(',');
    return H.distance({ q: 4, r: 4 }, { q: +p[0], r: +p[1] });
  });
}
ok(weiten5(st5c).indexOf(4) < 0, 'sonst springt der Springer höchstens 3 Felder');
setzeWetter(st5c, 'klar');
ok(weiten5(st5c).indexOf(4) >= 0, 'bei klarer Sicht 4 Felder weit');
setzeWetter(st5c, 'marsch');
ok(weiten5(st5c).indexOf(4) < 0, 'der Marschbefehl gilt ihm nicht – er marschiert nicht');

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
ok(!z14.some(function (x) {
  var p = x.split(':')[1].split(',');
  return H.distance({ q: 6, r: 4 }, { q: +p[0], r: +p[1] }) === 4;
}), 'der Springer marschiert nicht mit – 4 Felder gibt es nur bei klarer Sicht');

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

titel('Wann das Wetter dreht');
ok(G.WETTER_RUNDEN === 2, 'eine Karte gilt zwei volle Runden');
/* Zwei Spieler, zwei Arbeiter nebeneinander: Spieler 1 kann schlagen. */
function schlagStellung(karten) {
  var b = brett(10, 5);
  stelle(b, 0, 0, 'king', 0);
  stelle(b, 8, 4, 'king', 1);
  stelle(b, 3, 2, 'worker', 0);
  stelle(b, 4, 2, 'worker', 1);
  stelle(b, 6, 0, 'samurai', 1);          // damit Spieler 2 auch ziehen kann
  var st = zustand(b, 0);
  st.stapel = karten.slice();
  return st;
}
/* Irgendein harmloser Zug des Spielers am Zug – nur, um weiterzugeben */
function gibAb(st) {
  for (var i = 0; i < st.board.keys.length; i++) {
    var c = st.board.cells[st.board.keys[i]];
    if (!c.piece || c.piece.owner !== st.current) continue;
    var a = M.forPiece(st.board, c, st.players[st.current].wood)
      .filter(function (x) { return x.kind === 'move'; })[0];
    if (a) return G.perform(st, c, a);
  }
  return G.pass(st);
}
function zieheMit(st, q, r, art) {
  var c = st.board.cells[H.key(q, r)];
  var a = M.forPiece(st.board, c, st.players[c.piece.owner].wood)
    .filter(function (x) { return x.kind === art; })[0];
  return G.perform(st, c, a);
}

var st16 = schlagStellung(['nebel']);
ok(st16.karte === null && st16.kommt === null, 'zu Beginn gilt kein Wetter');
zieheMit(st16, 3, 2, 'capture');           // Spieler 1 schlägt
ok(st16.kommt === 'nebel', 'der Schlag lässt eine Karte aufziehen');
ok(st16.karte === null, 'sie gilt aber noch nicht');
ok(st16.board.wetter.schuss === 2, 'am Brett hängt weiter das alte Wetter');
ok(st16.current === 1, 'Spieler 2 ist am Zug');
ok(st16.kommtZaehler === 2, 'noch eine volle Runde ohne Wirkung');
gibAb(st16);                               // Spieler 2 zieht ohne Wirkung
ok(st16.karte === null, 'auch danach gilt sie noch nicht');
ok(st16.current === 0, 'jetzt zieht der Schlagende noch einmal ohne Wirkung');
gibAb(st16);                               // die Runde ist ohne Wirkung abgelaufen
ok(st16.karte === 'nebel', 'nach der vollen Runde tritt sie ein');
ok(st16.board.wetter.schuss === 1, 'und wirkt am Brett');
ok(st16.kommt === null, 'am Horizont steht nichts mehr');

/* Zwei volle Runden – je zwei Züge für jeden – dann klart es auf */
ok(st16.karteZaehler === 4, 'sie hat vier Züge: zwei Runden mal zwei Spieler');
gibAb(st16); gibAb(st16);
ok(st16.karte === 'nebel', 'nach der ersten Runde gilt sie noch');
ok(st16.karteZaehler === 2, 'noch eine Runde');
gibAb(st16);
ok(st16.karte === 'nebel', 'und auch mitten in der zweiten');
gibAb(st16);
ok(st16.karte === null, 'nachdem beide zweimal darunter gezogen haben, klart es auf');
ok(st16.board.wetter.schuss === 2, 'am Brett gilt wieder die Grundregel');
ok(st16.ablage.indexOf('nebel') >= 0, 'die Karte liegt auf der Ablage');

/* Und derselbe Ablauf, wenn der letzte Spieler der Reihe schlägt: Auch dann
   bekommt jeder seine Runde Vorwarnung – nach der Rundennummer gerechnet
   hätte es seinen Nachbarn ohne jede Vorwarnung getroffen. */
var st16b = schlagStellung(['frost']);
st16b.current = 1;
st16b.board.cells[H.key(4, 2)].piece = { type: 'worker', owner: 1, facing: 0 };
st16b.board.cells[H.key(3, 2)].piece = { type: 'worker', owner: 0, facing: 0 };
zieheMit(st16b, 4, 2, 'capture');          // der Letzte in der Reihe schlägt
ok(st16b.kommt === 'frost' && st16b.karte === null,
   'auch beim letzten Spieler der Reihe zieht sie erst auf');
ok(st16b.kommtZaehler === 2, 'und auch er gibt eine volle Runde Vorlauf');
gibAb(st16b);
ok(st16b.karte === null, 'nach einem Zug noch nicht');
gibAb(st16b);
ok(st16b.karte === 'frost', 'nach der vollen Runde schon');

titel('Nur bei klarem Wetter dreht ein Schlag etwas');
var st17 = schlagStellung(['frost', 'nebel']);
zieheMit(st17, 3, 2, 'capture');
var ersteKarte = st17.kommt;
ok(!!ersteKarte, 'die erste Karte zieht auf');
// Noch ein Schlag in derselben Runde: es bleibt bei einer
st17.board.cells[H.key(5, 2)].piece = { type: 'archer', owner: 1, facing: 0 };
st17.current = 0;
st17.board.cells[H.key(4, 2)].piece = { type: 'tangolin', owner: 0, facing: 0 };
zieheMit(st17, 4, 2, 'capture');
ok((st17.kommt || st17.karte) === ersteKarte, 'es bleibt bei der ersten Karte');
ok(st17.stapel.length === 1, 'ein zweiter Schlag nimmt keine zweite Karte vom Stapel');

/* Und dasselbe, während die Karte gilt: Wer mitten im Sturm weiterkämpft,
   verlängert ihn nicht und deckt auch nichts Neues auf. */
var st17b = schlagStellung(['frost', 'nebel']);
zieheMit(st17b, 3, 2, 'capture');
gibAb(st17b); gibAb(st17b);                // eine Runde Vorlauf
ok(!!st17b.karte, 'die Karte gilt: ' + st17b.karte);
var gilt = st17b.karte, restVorher = st17b.karteZaehler, stapelVorher = st17b.stapel.length;
// Noch ein Schlag, mitten im Wetter
st17b.current = 0;
st17b.board.cells[H.key(4, 2)].piece = { type: 'tangolin', owner: 0, facing: 0 };
st17b.board.cells[H.key(5, 2)].piece = { type: 'archer', owner: 1, facing: 0 };
zieheMit(st17b, 4, 2, 'capture');
ok(st17b.karte === gilt, 'es gilt weiter dieselbe Karte');
ok(st17b.kommt === null, 'es zieht nichts Neues auf');
ok(st17b.stapel.length === stapelVorher, 'der Stapel bleibt unangetastet');
ok(st17b.karteZaehler === restVorher - 1, 'und die Karte läuft normal weiter ab');

/* Erst wenn es aufgeklart ist, dreht der nächste Schlag wieder etwas. */
var schutz17 = 0;
while (st17b.karte && schutz17++ < 20) gibAb(st17b);
ok(st17b.karte === null && st17b.kommt === null, 'das Wetter ist wieder klar');
st17b.current = 0;
var tang = null;
st17b.board.keys.forEach(function (k) {
  var c = st17b.board.cells[k];
  if (c.piece && c.piece.type === 'tangolin' && c.piece.owner === 0) tang = c;
});
var opfer = H.neighbors(tang).map(function (nb) { return Board.at(st17b.board, nb); })
  .filter(function (c) { return c && !c.piece && !c.tree && c.terrain === 'grass'; })[0];
opfer.piece = { type: 'samurai', owner: 1, facing: 0 };
zieheMit(st17b, tang.q, tang.r, 'capture');
ok(!!st17b.kommt, 'jetzt zieht wieder eine Karte auf: ' + st17b.kommt);

titel('Der Aufbruch gehört dem, der als Erster darunter zieht');
var st18 = schlagStellung(['aufbruch']);
zieheMit(st18, 3, 2, 'capture');           // Spieler 1 schlägt, Aufbruch zieht auf
ok(st18.extra === 0, 'solange sie aufzieht, hat niemand einen Extra-Zug');
gibAb(st18); gibAb(st18);                  // eine Runde ohne Wirkung, dann tritt sie ein
ok(st18.karte === 'aufbruch' && st18.extra === 1,
   'wer als Erster darunter zieht, bekommt den zweiten Zug');
ok(st18.current === 1, 'das ist der Nächste in der Reihe');
var wer = st18.current;
gibAb(st18);
ok(st18.current === wer && st18.nochmal === true, 'er ist gleich noch einmal dran');

titel('Einmalige Änderungen geschehen beim Eintreten, nicht beim Aufziehen');
var st19 = schlagStellung(['windbruch']);
baum(st19.board, 2, 4);                    // steht allein
zieheMit(st19, 3, 2, 'capture');
gibAb(st19);
ok(st19.board.cells[H.key(2, 4)].tree, 'während sie aufzieht, steht der Baum noch');
gibAb(st19);
ok(!st19.board.cells[H.key(2, 4)].tree, 'mit dem Sturm fällt er');

titel('Ganze Partien');
/* Eine einzelne Zufallspartie sagt wenig: Sie kann nach fünfzehn Zügen vorbei
   sein, weil ein Turm fällt. Gezählt wird deshalb über mehrere Partien. */
function zufallsPartie(spieler, maxZuege) {
  var st = G.create(['A', 'B', 'C', 'D'].slice(0, spieler),
                    [null, null, null, null].slice(0, spieler), null, { wetter: true });
  G.autoPlaceTrees(st);
  var schutz = 0;
  while (st.phase === 'kings' && schutz++ < 500) {
    var frei = st.board.keys.map(function (k) { return st.board.cells[k]; });
    if (st.awaitWorker) {
      var wf = frei.filter(function (c) {
        return Board.isFree(c) && H.neighbors(c).some(function (nb) {
          var x = Board.at(st.board, nb);
          return x && x.piece && x.piece.type === 'king' && x.piece.owner === st.current;
        });
      })[0];
      if (!wf) return null;
      G.placeWorker(st, wf.q, wf.r);
    } else {
      var kf = frei.filter(function (c) { return G.canPlaceKing(st, c); })[0];
      if (!kf) return null;
      G.placeKing(st, kf.q, kf.r);
    }
  }
  if (st.phase !== 'play') return null;
  var zahl = { karten: {}, mit: 0, ohne: 0, schlaege: 0, start: st.karte, zieht: 0 };
  for (var z = 0; z < maxZuege && st.phase === 'play'; z++) {
    if (st.karte) { zahl.karten[st.karte] = true; zahl.mit++; } else { zahl.ohne++; }
    if (st.kommt) zahl.zieht++;
    if (st.pending) { G.endPending(st); continue; }
    var opts = [];
    st.board.keys.forEach(function (key) {
      var c = st.board.cells[key];
      if (!c.piece || c.piece.owner !== st.current) return;
      G.actionsFor(st, c).forEach(function (a) { opts.push({ c: c, a: a }); });
    });
    var spots = M.trainingSpots(st.board, st.current);
    M.affordableUnits(st, st.current).forEach(function (id) {
      spots.forEach(function (sp) { opts.push({ train: id, sp: sp }); });
    });
    if (!opts.length) { G.pass(st); continue; }
    var scharf = opts.filter(function (x) {
      return x.train || x.a.kind === 'capture' || x.a.kind === 'shoot' || x.a.kind === 'harvest';
    });
    var o = (scharf.length && Math.random() < 0.7)
      ? scharf[Math.floor(Math.random() * scharf.length)]
      : opts[Math.floor(Math.random() * opts.length)];
    if (o.train) G.train(st, o.train, o.sp.q, o.sp.r);
    else G.perform(st, o.c, o.a);
    if (st.lastCaptures && st.lastCaptures.length) zahl.schlaege++;
  }
  zahl.state = st;
  return zahl;
}

var summe = { karten: {}, mit: 0, ohne: 0, schlaege: 0, partien: 0, klarStart: 0, voll: 0 };
for (var g = 0; g < 8; g++) {
  var r = zufallsPartie(3 + (g % 2), 400);
  if (!r) continue;
  summe.partien++;
  if (r.start === null) summe.klarStart++;
  summe.mit += r.mit; summe.ohne += r.ohne; summe.schlaege += r.schlaege;
  Object.keys(r.karten).forEach(function (k) { summe.karten[k] = true; });
  var imUmlauf = r.state.stapel.length + r.state.ablage.length +
                 (r.state.karte ? 1 : 0) + (r.state.kommt ? 1 : 0);
  if (imUmlauf === W.stapel().length) summe.voll++;
}
ok(summe.partien >= 6, summe.partien + ' Partien gespielt');
ok(summe.klarStart === summe.partien, 'jede Partie beginnt bei klarem Wetter');
ok(summe.schlaege > 0, 'es fielen Figuren (' + summe.schlaege + ' Schläge)');
ok(Object.keys(summe.karten).length >= 3, 'dabei galten ' +
   Object.keys(summe.karten).length + ' verschiedene Karten');
ok(summe.ohne > 0, 'zwischen den Karten war das Wetter klar (' + summe.ohne +
   ' von ' + (summe.ohne + summe.mit) + ' Zügen)');
ok(summe.mit < summe.ohne + summe.mit, 'es gilt nicht in jedem Zug eine Karte');
ok(summe.mit > 0, 'aber auch nicht nie (' + summe.mit + ' Züge unter einer Karte)');
ok(summe.voll === summe.partien, 'keine Partie verliert eine Karte aus dem Umlauf');

titel('Das Standardspiel bleibt unberührt');
var st21 = G.create(['A', 'B'], [null, null]);
ok(st21.wetterAn === false, 'ohne Wahl wird ohne Wetter gespielt');
ok(st21.board.wetter === W.NEUTRAL, 'am Brett hängt die neutrale Wirkung');
G.autoPlaceTrees(st21);
ok(st21.karte === null, 'es wird keine Karte gezogen');
ok(G.kuendigeAn(st21) === null, 'ein Schlag lässt dort nichts aufziehen');
ok(G.wetterTakt(st21) === null, 'und der Takt deckt nichts auf');

console.log(fehler ? '\n' + fehler + ' Prüfung(en) fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
