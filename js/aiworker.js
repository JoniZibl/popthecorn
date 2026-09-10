/* Der Computergegner in einem eigenen Faden.

   Im Faden der Oberfläche musste die Suche in Häppchen rechnen und eine
   angefangene Suchtiefe verwerfen, sobald ein einzelner Suchast zu lange
   brauchte – sonst hakte das Brett. Hier stört langes Rechnen niemanden:
   Die Oberfläche läuft nebenher weiter, und die Suche darf am Stück laufen,
   also auch tiefer.

   Geantwortet wird mit der Kennung der Frage. Wer eine neue Partie beginnt,
   während hier noch gerechnet wird, bekommt die alte Antwort nicht mehr
   untergeschoben – die Oberfläche wirft sie anhand der Kennung weg. */
importScripts('hex.js', 'units.js', 'board.js', 'moves.js', 'game.js', 'ai.js');

self.onmessage = function (e) {
  var d = e.data;
  try {
    self.postMessage({ id: d.id, desc: AI.chooseMove(d.state, d.me, d.level) });
  } catch (err) {
    self.postMessage({ id: d.id, fehler: String((err && err.message) || err) });
  }
};
