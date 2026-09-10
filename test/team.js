/* Mannschaften: Wer zusammen spielt, schlägt einander nicht, versperrt einander
   den Weg wie eigene Figuren und gewinnt gemeinsam. Die Versorgungskette bleibt
   dagegen jedem selbst überlassen. Geprüft werden Regelwerk und KI-Generator.
   Aufruf: node test/team.js */
global.Hex = require('../js/hex.js');
global.Units = require('../js/units.js');
global.Board = require('../js/board.js');
global.Moves = require('../js/moves.js');
global.Game = require('../js/game.js');
global.AI = require('../js/ai.js');
var H = Hex, M = Moves, G = Game;

var fehler = 0;
function ok(bedingung, text) {
  console.log((bedingung ? '  ok   ' : '  FEHL ') + text);
  if (!bedingung) fehler++;
}
function gleich(name, got, want) {
  var a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log('  ok   ' + name);
  else { fehler++; console.log('  FEHL ' + name + '\n       erwartet ' + b + '\n       erhalten ' + a); }
}

function brett(breite, hoehe, teams) {
  var cells = {}, keys = [];
  for (var q = -1; q <= breite; q++) {
    for (var r = -1; r <= hoehe; r++) {
      var k = H.key(q, r);
      cells[k] = { q: q, r: r, terrain: 'grass', tree: false, boat: false, piece: null };
      keys.push(k);
    }
  }
  return { cells: cells, keys: keys, teams: teams };
}
function feld(board, q, r) { return board.cells[H.key(q, r)]; }
function stelle(board, q, r, typ, spieler) {
  feld(board, q, r).piece = { type: typ, owner: spieler, facing: 0 };
  return feld(board, q, r);
}
function arten(acts, q, r) {
  return acts.filter(function (a) { return a.q === q && a.r === r; })
    .map(function (a) { return a.kind; }).sort();
}
function zustand(board, teams, holz) {
  var st = G.create(['A', 'B', 'C', 'D'], [null, null, null, null], teams);
  st.board = board;
  board.teams = teams;
  st.phase = 'play';
  st.current = 0;
  st.players.forEach(function (p) { p.wood = holz === undefined ? 3 : holz; });
  return st;
}

var TEAMS = [0, 0, 1, 1];      // A+B gegen C+D

console.log('Verbündete schlägt man nicht');
var b1 = brett(6, 4, TEAMS);
var t1 = stelle(b1, 1, 1, 'tangolin', 0);
stelle(b1, 2, 1, 'samurai', 1);        // Verbündeter (Team 0)
stelle(b1, 1, 2, 'archer', 2);         // Gegner (Team 1)
var a1 = M.forPiece(b1, t1, 3);
gleich('auf dem Verbündeten gibt es keine Aktion', arten(a1, 2, 1), []);
gleich('auf dem Gegner steht der Schlag', arten(a1, 1, 2), ['capture']);

console.log('\nDer Bogenschütze schießt nicht auf die eigene Seite');
var b2 = brett(8, 4, TEAMS);
var bs = stelle(b2, 2, 1, 'archer', 0);
stelle(b2, 4, 1, 'legionaer', 1);      // Verbündeter auf Distanz 2
stelle(b2, 0, 1, 'springer', 2);       // Gegner auf Distanz 2
var a2 = M.forPiece(b2, bs, 3);
gleich('kein Schuss auf den Verbündeten', arten(a2, 4, 1), []);
gleich('Schuss auf den Gegner', arten(a2, 0, 1), ['shoot']);

console.log('\nDer Tangolin springt über Verbündete');
var b3 = brett(8, 4, TEAMS);
var t3 = stelle(b3, 0, 0, 'tangolin', 0);
stelle(b3, 1, 0, 'worker', 1);         // Verbündeter als Sprungbrett
var a3 = M.forPiece(b3, t3, 3);
gleich('über den Verbündeten hinweg', arten(a3, 2, 0), ['jump']);
var b3b = brett(8, 4, TEAMS);
var t3b = stelle(b3b, 0, 0, 'tangolin', 0);
stelle(b3b, 1, 0, 'worker', 2);        // Gegner sperrt
gleich('über den Gegner nicht', arten(M.forPiece(b3b, t3b, 3), 2, 0), []);

console.log('\nDie Versorgungskette bleibt jedem selbst überlassen');
var b4 = brett(10, 4, TEAMS);
stelle(b4, 0, 0, 'king', 0);
stelle(b4, 6, 0, 'king', 1);           // Turm des Verbündeten, weit weg
var st4 = zustand(b4, TEAMS);
var felder = M.trainingSpots(b4, 0).map(function (c) { return H.key(c.q, c.r); });
ok(felder.indexOf('1,0') >= 0, 'am eigenen Turm darf ausgebildet werden');
ok(felder.indexOf('7,0') < 0, 'am Turm des Verbündeten nicht');

console.log('\nDie KI erzeugt dieselben Züge wie das Regelwerk');
var b5 = brett(8, 4, TEAMS);
stelle(b5, 1, 1, 'tangolin', 0);
stelle(b5, 2, 1, 'samurai', 1);
stelle(b5, 1, 2, 'archer', 2);
stelle(b5, 0, 0, 'king', 0);
stelle(b5, 6, 0, 'king', 1);
stelle(b5, 6, 3, 'king', 2);
stelle(b5, 0, 3, 'king', 3);
var st5 = zustand(b5, TEAMS, 0);
function regelZuege(st, p) {
  var set = {};
  st.board.keys.forEach(function (k) {
    var c = st.board.cells[k];
    if (!c.piece || c.piece.owner !== p) return;
    M.forPiece(st.board, c, st.players[p].wood).forEach(function (a) {
      set[a.kind + '|' + k + '|' + a.q + ',' + a.r] = true;
    });
  });
  return Object.keys(set).sort();
}
function kiZuege(st, p) {
  var s = AI.snapshot(st), out = [], set = {};
  AI.genMoves(s, p, out, false);
  out.forEach(function (mv) {
    var kind = AI.mvKind(mv), from = AI.mvFrom(mv), to = AI.mvTo(mv);
    if (kind === AI.KIND_TRAIN || kind === AI.KIND_ROTATE) return;
    var namen = ['move', 'capture', 'harvest', 'shoot', null, null, 'jump'];
    set[namen[kind] + '|' + s.geo.keys[from] + '|' + s.geo.keys[to]] = true;
  });
  return Object.keys(set).sort();
}
gleich('Spieler A: gleiche Zugliste', kiZuege(st5, 0), regelZuege(st5, 0));
var s5 = AI.snapshot(st5);
ok(s5.team[0] === s5.team[1] && s5.team[0] !== s5.team[2],
   'die KI kennt die Mannschaften');

console.log('\nGewonnen wird gemeinsam');
var b6 = brett(8, 4, TEAMS);
stelle(b6, 0, 0, 'king', 0);
stelle(b6, 2, 0, 'king', 1);
stelle(b6, 6, 0, 'king', 2);
var st6 = zustand(b6, TEAMS);
st6.players[3].eliminated = true;      // D ist schon draußen
ok(!G.checkVictory(st6), 'solange ein Gegner steht, läuft die Partie');
// C fällt: Team 1 ist damit vollständig ausgeschieden
feld(b6, 6, 0).piece = null;
st6.players[2].eliminated = true;
ok(G.checkVictory(st6), 'fällt der letzte Gegner, ist Schluss');
gleich('gewonnen hat Mannschaft 0', st6.winnerTeam, 0);
ok(/Team Blau/.test(st6.log[0].text), 'die Mannschaft wird beim Namen genannt: ' + st6.log[0].text);

console.log('\nEin Spieler darf fallen, ohne dass seine Mannschaft verliert');
var b7 = brett(8, 4, TEAMS);
stelle(b7, 0, 0, 'king', 0);
stelle(b7, 6, 0, 'king', 2);
var st7 = zustand(b7, TEAMS);
st7.players[1].eliminated = true;
st7.players[3].eliminated = true;
ok(!G.checkVictory(st7), 'A gegen C geht weiter');

console.log('\nGewertet wird nach Mannschaftsvermögen');
var b8 = brett(8, 4, TEAMS);
stelle(b8, 0, 0, 'king', 0);
stelle(b8, 1, 0, 'king', 1);
stelle(b8, 6, 0, 'king', 2);
stelle(b8, 7, 0, 'king', 3);
var st8 = zustand(b8, TEAMS, 0);
st8.players[0].wood = 3;               // Team 0: 3 + 2 = 5
st8.players[1].wood = 2;
st8.players[2].wood = 4;               // Team 1: 4 + 0 = 4
G.adjudicate(st8, 'Prüfung');
gleich('die reichere Mannschaft gewinnt', st8.winnerTeam, 0);

console.log('\nOhne Mannschaften bleibt alles beim Alten');
var b9 = brett(6, 4, null);
var t9 = stelle(b9, 1, 1, 'tangolin', 0);
stelle(b9, 2, 1, 'samurai', 1);
gleich('jeder ist jedem Gegner', arten(M.forPiece(b9, t9, 3), 2, 1), ['capture']);
var st9 = G.create(['A', 'B'], [null, null]);
gleich('jeder Spieler ist seine eigene Mannschaft', st9.teams, [0, 1]);

console.log('\nBis zu acht Spieler');
for (var z = 2; z <= 8; z++) {
  var stz = G.create('ABCDEFGH'.slice(0, z).split(''), [], null);
  var farben = {};
  stz.players.forEach(function (p) { farben[p.color] = true; });
  ok(Object.keys(farben).length === z, z + ' Spieler bekommen ' + z + ' Farben');
}
var st8er = G.create('ABCDEFGH'.split(''), [], [0, 0, 0, 0, 1, 1, 1, 1]);
var team0 = st8er.players.slice(0, 4).map(function (p) { return p.colorName; });
ok(team0.every(function (n) { return n.indexOf('Blau') === 0; }),
   '4 gegen 4: eine Farbfamilie je Mannschaft (' + team0.join(', ') + ')');
var alle = {};
st8er.players.forEach(function (p) { alle[p.color] = true; });
ok(Object.keys(alle).length === 8, 'trotzdem acht unterscheidbare Farben');

console.log('\nDie KI haelt Verbuendete nicht fuer Gegner');
/* Die Stellungsbewertung fuehrt ihre Posten einzeln mit. Geprueft wird genau
   das, was in einer Mannschaftspartie schieflaufen kann: Steht die eigene Seite
   um meinen Turm herum, darf daraus kein Druck entstehen, sie soll ihn decken,
   und die Felder, die sie bestreicht, bleiben Fluchtfelder. Sonst weicht der
   Turm vor den eigenen Leuten aus und die echten Gefahren gehen im Rauschen
   unter. */
var bt = brett(16, 8, TEAMS);
stelle(bt, 2, 2, 'king', 0);            // mein Turm
stelle(bt, 3, 2, 'worker', 1);          // Verbuendeter direkt daneben
stelle(bt, 2, 3, 'samurai', 1);
stelle(bt, 4, 3, 'legionaer', 1);
stelle(bt, 14, 7, 'king', 2);           // Gegner ausser Reichweite
stelle(bt, 13, 7, 'worker', 2);
stelle(bt, 15, 5, 'king', 3);
stelle(bt, 1, 0, 'king', 1);
var stt = zustand(bt, TEAMS, 2);
var st_s = AI.snapshot(stt);
var ctxT = AI.makeContext(st_s, 0, 100, 1);
ctxT.explain = true;
AI.evaluate(st_s, 0, ctxT);
function posten(name) {
  var e = ctxT.parts.filter(function (x) { return x.p === 0 && x.name === name; })[0];
  return e ? e.v : 0;
}
gleich('kein Turmdruck durch die eigene Seite', posten('Turmdruck'), 0);
ok(posten('Turmdeckung') > 0, 'der Verbuendete deckt den Turm (' + posten('Turmdeckung') + ')');
ok(posten('Fluchtfelder') >= 78,
   'Felder, die der Verbuendete bestreicht, bleiben Fluchtfelder (' + posten('Fluchtfelder') + ')');

console.log('\nEine ganze Partie 2 gegen 2 mit Computergegnern');
var partie = G.create(['A', 'B', 'C', 'D'], ['leicht', 'leicht', 'leicht', 'leicht'], [0, 0, 1, 1]);
var schutz = 0;
while (partie.phase !== 'over' && schutz++ < 3000) { if (!AI.step(partie, 'leicht')) G.pass(partie); }
ok(partie.phase === 'over', 'die Partie kommt zu einem Ende (nach ' + schutz + ' Schritten)');
ok(partie.winnerTeam === 0 || partie.winnerTeam === 1, 'eine Mannschaft gewinnt (' + partie.winnerTeam + ')');
var uebrig = partie.players.filter(function (pl) { return !pl.eliminated; });
if (partie.endReason) {
  // Nach einer Wertung stehen die Verlierer noch auf dem Brett
  ok(uebrig.some(function (pl) { return partie.teams[pl.index] === partie.winnerTeam; }),
     'nach der Wertung (' + partie.endReason + ') steht die Siegermannschaft noch');
} else {
  ok(uebrig.every(function (pl) { return partie.teams[pl.index] === partie.winnerTeam; }),
     'nach dem letzten Turmverlust steht nur noch die Siegermannschaft');
}
ok(partie.players.some(function (pl) { return pl.eliminated; }) || !!partie.endReason,
   'gewonnen wurde durch Turmverlust oder Wertung');

console.log(fehler ? '\n' + fehler + ' Prüfung(en) fehlgeschlagen.' : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
