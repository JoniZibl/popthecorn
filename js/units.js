/* Hexodus – Einheiten-Definitionen (Kosten, Texte, Fähigkeiten) */
var Units = (function () {
  'use strict';

  var DEFS = {
    king: {
      id: 'king', name: 'Königs-Turm', cost: null, trainable: false, directional: false,
      short: 'Zentrale Figur. Fällt er, scheidet der Spieler aus.',
      text: 'Der Königs-Turm ist die zentrale und wichtigste Figur im Spiel. Wird der Königs-Turm ' +
            'geschlagen, scheidet der Spieler aus dem Spiel aus, und alle seine Figuren werden vom ' +
            'Spielfeld entfernt. Der Angreifer erhält zudem all sein Holz.',
      bullets: [
        'Der König darf für ein Holz ein Feld weit springen.',
        'Ist um den König kein Platz vorhanden, kann er kein Feld springen.',
        'Einheiten dürfen am Königs-Turm und an allen direkt verbundenen Einheiten ausgebildet werden.'
      ]
    },
    worker: {
      id: 'worker', name: 'Arbeiter', cost: 1, trainable: true, directional: false,
      short: 'Fällt Bäume und sammelt Holz. Zieht 1 Feld.',
      text: 'Der Arbeiter ist essenziell für das Spiel, da nur er Bäume fällen kann. Um einen Baum zu ' +
            'fällen, muss der Arbeiter das Feld betreten, auf dem der Baum steht, und erhält dann das ' +
            'Holz des Baumes. Der Arbeiter kann auch innerhalb seines Bewegungsradius angreifen.',
      bullets: [
        'Zieht ein Feld in jede Richtung.',
        'Betritt er ein Baumfeld, wird der Baum gefällt: +1 Holz.',
        'Halte dir immer ein Holz parat, um einen Arbeiter ausbilden zu können.'
      ]
    },
    samurai: {
      id: 'samurai', name: 'Samurai', cost: 1, trainable: true, directional: false,
      short: 'Springt auf eine der 6 Diagonalen – über alles hinweg.',
      text: 'Der Samurai ist eine taktische Figur, die niemals alle Felder auf dem Spielfeld berühren ' +
            'kann. Wähle seinen Startpunkt und seine Bewegungen sorgfältig, um seine Effektivität zu ' +
            'maximieren.',
      bullets: [
        'Springt auf eines der 6 diagonalen Felder – die Ecken um sein Feld herum.',
        'Der Samurai kann über Wasser und über Bäume springen.',
        'Auf den Diagonalen bleibt er sein Leben lang auf einem Drittel aller Felder.'
      ]
    },
    springer: {
      id: 'springer', name: 'Springer', cost: 2, trainable: true, directional: true,
      short: 'Springt 2 oder 3 Felder weit – in zwei benachbarte Richtungen.',
      text: 'Wenn der Springer ausgebildet wird, kannst du eine Richtung wählen. Der Springer kann ' +
            'ausschließlich in die gewählte Richtung springen. Er hat die Möglichkeit, sich zu Beginn ' +
            'seines Zuges zu springen und/oder zu drehen, um eine neue Richtung einzunehmen.',
      bullets: [
        'Seine Richtung umfasst zwei benachbarte Richtungen – in beiden springt er genau 2 oder 3 Felder weit.',
        'Der Springer kann über Bäume und über Wasser springen.',
        'Nachdem er sich bewegt hat, kann er in der darauffolgenden Runde in die neue, zuvor gewählte Richtung weiterlaufen.'
      ]
    },
    legionaer: {
      id: 'legionaer', name: 'Legionär', cost: 2, trainable: true, directional: true,
      short: 'Läuft beliebig weit auf seiner Achse – vor oder zurück.',
      text: 'Wenn der Legionär ausgebildet wird, kannst du eine Richtung wählen. Der Legionär kann sich ' +
            'ausschließlich in die gewählte Richtung geradeaus oder rückwärts bewegen. Er hat die ' +
            'Möglichkeit, sich zu Beginn seines Zuges zu laufen und/oder zu drehen, um eine neue ' +
            'Richtung einzunehmen. Diese Rotation zählt als ein Zug.',
      bullets: [
        'Läuft so weit es geht vor oder zurück auf seiner Achse.',
        'Der Legionär kann nicht über Bäume springen.',
        'Nachdem er sich bewegt hat, kann er in der darauffolgenden Runde in die neue Richtung weiterlaufen.'
      ]
    },
    archer: {
      id: 'archer', name: 'Bogenschütze', cost: 2, trainable: true, directional: false,
      short: 'Schießt auf Distanz 2 – oder läuft 1 Feld.',
      text: 'Der Bogenschütze ist die einzige Figur, die schießen oder laufen kann. Ein Schuss kostet ' +
            'einen Zug und ermöglicht es ihm, eine Figur aus der Ferne zu eliminieren, ohne sich zu bewegen.',
      bullets: [
        'Der Bogenschütze kann sich auch normal bewegen, schlägt dabei aber keine Einheiten.',
        'Der Bogenschütze kann über Bäume und über Wasser schießen.',
        'Getroffen wird auf Distanz 2 in einer der 6 geraden Richtungen.'
      ]
    },
    tangolin: {
      id: 'tangolin', name: 'Tangolin', cost: 2, trainable: true, directional: false,
      short: 'Kettensprünge über Bäume und eigene Einheiten.',
      text: 'Der Tangolin kann unbegrenzt über Bäume und eigene Einheiten springen. Seine ' +
            'Bewegungsreichweite wird erst dann eingeschränkt, wenn keine Bäume oder eigene Einheiten ' +
            'mehr zum Überspringen vorhanden sind.',
      bullets: [
        'Der Tangolin kann auch 1 Feld normal ziehen und in jede Richtung schlagen.',
        'Über gegnerische Figuren springt er nicht – sie sperren ihm den Weg.',
        'Er kann jedoch nicht über Wasser springen.',
        'Beim Kettensprung schlägt er keine Einheiten.'
      ]
    },
    boat: {
      id: 'boat', name: 'Boot', cost: 1, trainable: false, directional: false, object: true,
      short: 'Neutrales Boot – macht ein Wasserfeld begehbar.',
      text: 'Das Boot ist ein neutrales Objekt und kann von allen Spielern gleichermaßen ' +
            'genutzt werden. Jeder Spieler kann beliebig viele Boote kaufen. Um ein Boot zu ' +
            'setzen, muss die Figur während ihres regulären Spielzugs von Land auf das Wasser ' +
            'ziehen. Das kostet 1 Holz. Das Boot wird direkt unter die Figur gelegt und bleibt ' +
            'dort, solange sie sich auf dem Wasser befindet.',
      bullets: [
        'Mit Boot bewegt sich eine Figur auf dem Wasser genauso wie an Land.',
        'Verlässt die Figur das Wasser, bleibt das Boot auf dem letzten Wasserfeld zurück ' +
          'und darf später von jedem Spieler genutzt werden.',
        'Für einen neuen Einstieg an anderer Stelle muss ein neues Boot gekauft werden.',
        'Wer über mehrere Wasserabschnitte zieht, zahlt für jeden Abschnitt ein Boot.'
      ]
    },
    zenturio: {
      id: 'zenturio', name: 'Zenturio', cost: 3, trainable: true, directional: false, unique: true,
      short: 'Läuft beliebig weit in jede Richtung und trägt das Feldzeichen. Nur einmal pro Spiel.',
      text: 'Der Zenturio ist die stärkste Figur im Spiel. Er kostet drei Holz und kann in jede Richtung ' +
            'so weit es geht laufen. Er trägt außerdem das Feldzeichen: An ihm darf ausgebildet werden ' +
            'wie am Königs-Turm.',
      bullets: [
        'Der Zenturio kann nicht über Bäume springen, er darf allerdings in jede Richtung laufen.',
        'Er ist der zweite Anker deiner Versorgungskette: An ihm und an allen Einheiten, die über eine ' +
          'lückenlose Kette an ihm hängen, darf ausgebildet werden – auch wenn die Verbindung zum ' +
          'eigenen Turm gerissen ist.',
        'Damit ist er ein vorgeschobener Stützpunkt. Wer ihn schlägt, kappt dem Gegner den Nachschub.',
        'Beachte, dass jeder Spieler den Zenturio nur einmal pro Spiel ausbilden darf.'
      ]
    }
  };

  // Reihenfolge im Ausbildungs-Menü
  var TRAIN_ORDER = ['worker', 'samurai', 'springer', 'legionaer', 'archer', 'tangolin', 'zenturio'];

  return { DEFS: DEFS, TRAIN_ORDER: TRAIN_ORDER };
})();

if (typeof module !== 'undefined') { module.exports = Units; }
