/* Hexodus – Wetterkarten (eigene Spielweise)

   Das Standardspiel bleibt, wie es ist. Wer mit Wetter spielt, deckt eine Karte
   auf, sobald eine Figur fällt. Sie zieht erst einmal auf: Zunächst läuft eine
   **volle Runde ohne Wirkung** ab, in der jeder noch einmal ganz normal zieht.
   Danach gilt sie **zwei volle Runden** lang für **alle** gleichermaßen – jeder
   zieht also zweimal unter ihr. Wann gewechselt wird, steht damit im Spiel und
   nicht im Kalender, niemand wird überrascht, und zwei Runden reichen, um aus
   einer Karte auch etwas zu machen.

   Jede Karte verändert eine ganze Regel-Schicht – Gelände, Sicht, Wirtschaft,
   Nachschub, Bewegung –, nie nur eine einzelne Figur. Eine Karte, die genau
   einer Figur etwas verbietet, wäre eine Strafe und kein Wetter.

   Alles hier ist so gebaut, dass es auch auf einem Tisch aus Pappe
   funktioniert:

   * Eine Regel, kein Nachrechnen pro Figur. Die Karte liegt offen, man liest ab.
   * Keine Marker, die man am Rundenende wieder einsammeln muss.
   * Kein Vorrat, den es nicht gibt: Holz, Bäume und Figuren sind endlich –
     keine Karte verdoppelt Einkommen.
   * Prüfbar durch Hinsehen statt durch Erinnern.
   * Was eine Karte am Brett verändert, bleibt dauerhaft; nichts wird zurückgedreht.

   Technisch ist eine Karte zweierlei:

   * `effekt` – Zahlen und Schalter, die **beide** Zuggeneratoren lesen
     (js/moves.js für das Regelwerk, js/ai.js für die Suche des Computer-
     gegners). Die Wirkung hängt am Brett (`board.wetter`), genau wie die
     Mannschaften: Zugerzeugen bekommt nur das Brett zu sehen.
   * `sofort` – eine einmalige Änderung am Brett beim Aufdecken (Bäume fallen,
     Bäume wachsen, Arbeiter rücken ein). Sie geschieht einmal und bleibt. */
var Wetter = (function () {
  'use strict';

  var H = (typeof Hex !== 'undefined') ? Hex : require('./hex.js');
  var B = (typeof Board !== 'undefined') ? Board : require('./board.js');

  /* Die Wirkung „kein Wetter“. Jede Karte beschreibt nur, was sie daran
     ändert – so steht an einer Stelle, was es überhaupt für Stellschrauben
     gibt, und eine neue Karte kann nichts vergessen. */
  var NEUTRAL = {
    id: null,
    bootPreis: 1,          // was ein Boot kostet (Frost: 0)
    schuss: 2,             // Schussweite des Bogenschützen (Nebel 1, Klare Sicht 3)
    nahSchlag: false,      // Nebel: Legionär und Zenturio schlagen nur direkt vor sich
    weitSprung: false,     // Klare Sicht: der Springer springt 2, 3 oder 4 Felder
    maxWeite: 0,           // 0 = unbegrenzt; Schlamm: kein Zug weiter als 2 Felder
    extraFeld: false,      // Marschbefehl: Schrittfiguren gehen ein Feld weiter
    freieRichtung: false,  // Windstille: Springer und Legionär ziehen in jede Richtung
    kosten: 0,             // Markt: -1 auf jede Ausbildung
    keineAusbildung: false,// Hungerwinter
    luecke: false,         // Feldlager: die Versorgungskette überspringt ein Feld
    radius: 0,            // Belagerung: Nachschub nur so weit um Turm und Feldzeichen
    faellenFrei: false     // Trockenheit: Fällen kostet den Zug nicht
  };

  /* Wirkung, die gerade am Brett hängt. Ohne Wetter (Standardspiel, alte
     Spielstände) ist das die neutrale – dann rechnet alles wie bisher. */
  function wirkung(board) {
    return (board && board.wetter) || NEUTRAL;
  }

  function mische(effekt) {
    var w = {};
    for (var k in NEUTRAL) w[k] = NEUTRAL[k];
    for (var e in (effekt || {})) w[e] = effekt[e];
    return w;
  }

  /* ---------------- Einmalige Änderungen am Brett ---------------- */

  /* Windbruch: Jeder Baum, der allein steht, fällt – und sein Holz bekommt
     niemand. Ein Baum, der Nachbarn hat, steht im Windschatten. Der Wald wird
     dadurch lichter und klumpiger: Kettensprünge werden seltener, Sichtachsen
     länger. */
  function windbruch(state) {
    var board = state.board, weg = [];
    board.keys.forEach(function (k) {
      var c = board.cells[k];
      if (!c.tree) return;
      var nachbar = H.neighbors(c).some(function (nb) {
        var n = B.at(board, nb);
        return n && n.tree;
      });
      if (!nachbar) weg.push(c);
    });
    weg.forEach(function (c) { c.tree = false; });
    return {
      text: weg.length
        ? weg.length + (weg.length === 1 ? ' einzelner Baum fällt.' : ' einzeln stehende Bäume fallen.')
        : 'Kein Baum steht allein – es bleibt alles stehen.',
      felder: weg.map(function (c) { return H.key(c.q, c.r); })
    };
  }

  /* Neuer Wuchs: Wo zwei Bäume nebeneinanderstehen, wächst dazwischen ein
     dritter. Das ist das Gegenstück zum Windbruch und der einzige Weg, auf dem
     neues Holz ins Spiel kommt – ohne dass eine Karte Einkommen verdoppelt.
     Gedeckelt, weil auch am Tisch nur eine Handvoll Bäume im Vorrat liegt. */
  var WUCHS_MAX = 8;

  function neuerWuchs(state) {
    var board = state.board, neu = [];
    board.keys.forEach(function (k) {
      if (neu.length >= WUCHS_MAX) return;
      var c = board.cells[k];
      if (c.terrain !== 'grass' || c.tree || c.piece || c.boat) return;
      var n = 0;
      H.neighbors(c).forEach(function (nb) {
        var x = B.at(board, nb);
        if (x && x.tree) n++;
      });
      if (n >= 2) neu.push(c);
    });
    neu.forEach(function (c) { c.tree = true; });
    return {
      text: neu.length
        ? neu.length + (neu.length === 1 ? ' Baum wächst nach.' : ' Bäume wachsen nach.')
        : 'Nirgends stehen zwei Bäume beieinander – nichts wächst.',
      felder: neu.map(function (c) { return H.key(c.q, c.r); })
    };
  }

  /* Musterung: Wer keinen Arbeiter mehr hat, bekommt einen gestellt. Der
     Arbeiter ist die einzige Quelle für Holz – ohne ihn ist eine Partie
     gelaufen, auch wenn der Turm noch steht. Die Karte ist also kein Geschenk
     an den Führenden, sondern eine Hand für den, dem sie ausgegangen ist.
     Gestellt wird nur, wer noch eine Figur im Vorrat hat: Von jeder Figur darf
     ohnehin nur eine im Spiel sein. */
  function musterung(state, hilfe) {
    var geholfen = [], felder = [];
    state.players.forEach(function (pl) {
      if (pl.eliminated) return;
      if (hilfe.hatTyp(state, pl.index, 'worker')) return;
      var feld = hilfe.nachschubFeld(state, pl.index);
      if (!feld) return;
      feld.piece = { type: 'worker', owner: pl.index, facing: 0 };
      geholfen.push(pl.index);
      felder.push(H.key(feld.q, feld.r));
    });
    return {
      text: geholfen.length
        ? geholfen.map(function (i) { return state.players[i].name; }).join(', ') +
          (geholfen.length === 1 ? ' bekommt einen Arbeiter gestellt.'
                                 : ' bekommen einen Arbeiter gestellt.')
        : 'Alle haben ihren Arbeiter – niemand rückt nach.',
      felder: felder
    };
  }

  /* ---------------- Die Karten ---------------- */

  /* `menge` ist die Zahl der Karten im Stapel. Die starken Schwünge liegen
     einmal darin, die ruhigen Zahlenkarten zweimal, und dreimal „Ruhe vor dem
     Sturm“ sorgt dafür, dass nicht jede Runde das Brett umkippt. */
  var KARTEN = [
    /* --- Gelände --- */
    {
      id: 'frost', name: 'Frost', icon: '❄️', farbe: '#7dd3fc', gruppe: 'Gelände', menge: 1,
      kurz: 'Das Wasser trägt: Boote kosten nichts.',
      text: 'Über Nacht ist das Wasser hart geworden. Wer aufs Wasser zieht, solange die Karte ' +
            'liegt, bekommt sein Boot umsonst – für jedes Feld, so oft er will. Inseln, Buchten und ' +
            'ganze Küstenlinien stehen plötzlich offen; wer sich hinter dem Wasser sicher ' +
            'wähnte, ist es nicht mehr.',
      effekt: { bootPreis: 0 }
    },
    {
      id: 'windbruch', name: 'Windbruch', icon: '🍃', farbe: '#a8a29e', gruppe: 'Gelände', menge: 1,
      kurz: 'Jeder Baum ohne Nachbarbaum fällt – ohne Holz für irgendwen.',
      text: 'Ein Sturm geht über die Insel. Jeder Baum, der allein steht, wird umgeworfen; ' +
            'sein Holz bekommt niemand – es liegt zersplittert im Unterholz. Bäume mit ' +
            'Nachbarn stehen im Windschatten und bleiben. Der Wald wird lichter und ' +
            'klumpiger: weniger Sprungbretter für den Tangolin, längere Sichtachsen.',
      effekt: null, sofort: windbruch
    },
    {
      id: 'wuchs', name: 'Neuer Wuchs', icon: '🌱', farbe: '#86efac', gruppe: 'Gelände', menge: 1,
      kurz: 'Zwischen zwei Bäumen wächst ein neuer – höchstens acht.',
      text: 'Regen und Sonne zur rechten Zeit. Auf jedem freien Grasfeld, das an mindestens ' +
            'zwei Bäume grenzt, wächst ein neuer Baum – bis der Vorrat von acht erschöpft ist. ' +
            'Das Gegenstück zum Windbruch und der einzige Weg, auf dem neues Holz ins Spiel ' +
            'kommt. Neue Bäume versperren allerdings auch Wege und Ausbildungsfelder.',
      effekt: null, sofort: neuerWuchs
    },

    /* --- Sicht --- */
    {
      id: 'nebel', name: 'Nebel', icon: '🌫️', farbe: '#cbd5e1', gruppe: 'Sicht', menge: 2,
      kurz: 'Auf Distanz trifft niemand: Schuss nur 1 Feld, Läufer nur direkt vor sich.',
      text: 'Milchige Schwaden liegen über der Insel, und was weiter weg steht, ist nur noch ' +
            'ein Schatten. Der Bogenschütze trifft nur auf Distanz 1. Legionär und Zenturio ' +
            'laufen zwar so weit wie immer, schlagen aber nur, was direkt vor ihnen steht – ' +
            'eine Figur am Ende der Bahn verschwindet im Dunst. Wer sich sonst außerhalb der ' +
            'Reichweite hält, darf heranrücken; wer eine lange Bahn hütet, verliert sie.',
      effekt: { schuss: 1, nahSchlag: true }
    },
    {
      id: 'klar', name: 'Klare Sicht', icon: '☀️', farbe: '#fde047', gruppe: 'Sicht', menge: 1,
      kurz: 'Jeder sieht weiter: Schuss 3 Felder, der Springer springt bis 4.',
      text: 'Ein Tag ohne Dunst, die Luft steht still und klar. Der Bogenschütze trifft auf ' +
            'Distanz 3 statt 2 – über Bäume und Wasser hinweg wie immer –, und der Springer ' +
            'sieht so weit, dass er 2, 3 oder 4 Felder springt. Jede Stellung, die gestern ' +
            'noch außer Reichweite lag, liegt heute darin.',
      effekt: { schuss: 3, weitSprung: true }
    },
    {
      id: 'windstille', name: 'Windstille', icon: '🪶', farbe: '#fcd34d', gruppe: 'Sicht', menge: 1,
      kurz: 'Springer und Legionär ziehen in jede Richtung.',
      text: 'Keine Fahne rührt sich, kein Wimpel zeigt irgendwohin. Springer und Legionär sind ' +
            'nicht an ihre Blickrichtung gebunden und ziehen in jede der sechs ' +
            'Richtungen. Ihre Pfeile bleiben, wo sie stehen – gedreht wird nichts, es ist nur ' +
            'einmal gleich, wohin sie zeigen.',
      effekt: { freieRichtung: true }
    },

    /* --- Wirtschaft --- */
    {
      id: 'trockenheit', name: 'Trockenheit', icon: '🌾', farbe: '#fbbf24', gruppe: 'Wirtschaft', menge: 2,
      kurz: 'Bäume fällen kostet keinen Zug.',
      text: 'Das Holz ist staubtrocken und fällt fast von selbst. Der Arbeiter fällt einen Baum ' +
            'und ist danach noch am Zug – so oft, wie Bäume neben ihm stehen, und das zwei ' +
            'Runden lang. Es entsteht kein Holz aus dem Nichts: Jeder Baum gibt genau ein Holz ' +
            'wie immer, es geht nur schneller.',
      effekt: { faellenFrei: true }
    },
    {
      id: 'markt', name: 'Fahrender Markt', icon: '🛒', farbe: '#f59e0b', gruppe: 'Wirtschaft', menge: 1,
      kurz: 'Jede Ausbildung kostet 1 Holz weniger (mindestens 1).',
      text: 'Händler sind auf der Insel gelandet und verkaufen unter Preis. Jede Einheit kostet ' +
            'ein Holz weniger, mindestens aber eines. Der Zenturio für zwei Holz ' +
            'statt drei ist die Gelegenheit, auf die man ein paar Runden gewartet hat.',
      effekt: { kosten: -1 }
    },
    {
      id: 'hunger', name: 'Hungerwinter', icon: '🌨️', farbe: '#94a3b8', gruppe: 'Wirtschaft', menge: 1,
      kurz: 'Solange sie gilt, bildet niemand aus.',
      text: 'Die Vorräte sind knapp, in den Lagern wird nicht ausgebildet. Solange die Karte ' +
            'liegt, entsteht keine einzige neue Einheit – bei niemandem. Gefällt, gezogen und ' +
            'geschlagen wird weiter; wer Holz sammelt, sammelt es für danach.',
      effekt: { keineAusbildung: true }
    },

    /* --- Nachschub --- */
    {
      id: 'feldlager', name: 'Feldlager', icon: '⛺', farbe: '#fb923c', gruppe: 'Nachschub', menge: 1,
      kurz: 'Die Kette überspringt ein Feld ohne Figur.',
      text: 'Läufer tragen den Nachschub über die Lücke. Die Versorgungskette darf ' +
            'ein Feld überspringen: Zwei eigene Figuren mit genau einem Feld ohne Figur ' +
            'dazwischen gelten als verbunden – ob dort Gras, ein Baum oder Wasser liegt, ist ' +
            'gleich. Steht eine fremde Figur in der Lücke, reißt die Kette doch. Wer seine ' +
            'Reihe verloren hat, kann vorn wieder ausbilden – solange die Karte liegt.',
      effekt: { luecke: true }
    },
    {
      id: 'belagerung', name: 'Belagerung', icon: '🛡️', farbe: '#ef4444', gruppe: 'Nachschub', menge: 1,
      kurz: 'Nachschub nur im Umkreis von 3 Feldern um Turm und Feldzeichen.',
      text: 'Die Wege sind abgeschnitten. Ausgebildet wird nur noch an Feldern, die ' +
            'höchstens drei Felder von einem eigenen Königs-Turm oder Feldzeichen entfernt ' +
            'liegen – wie lang die Kette auch sein mag. Lange Ketten quer über die Insel nützen ' +
            'nichts; wer vorn nachschieben will, braucht den Zenturio dort.',
      effekt: { radius: 3 }
    },
    {
      id: 'musterung', name: 'Musterung', icon: '🪓', farbe: '#a78bfa', gruppe: 'Nachschub', menge: 1,
      kurz: 'Wer keinen Arbeiter mehr hat, bekommt einen gestellt.',
      text: 'Es wird gemustert: Jeder Spieler ohne Arbeiter bekommt einen an seinen Turm oder an ' +
            'sein Feldzeichen gestellt – umsonst. Der Arbeiter ist die einzige Quelle für Holz; ' +
            'wem er ausgegangen ist, dem ist die Partie sonst gelaufen, auch wenn sein Turm noch ' +
            'steht. Wer seinen Arbeiter hat, bekommt nichts.',
      effekt: null, sofort: musterung
    },

    /* --- Bewegung und Tempo --- */
    {
      id: 'schlamm', name: 'Schlamm', icon: '🌧️', farbe: '#a16207', gruppe: 'Bewegung', menge: 2,
      kurz: 'Kein Zug führt weiter als 2 Felder.',
      text: 'Regen hat den Boden aufgeweicht. Kein Zug führt weiter als zwei Felder ' +
            'vom Startfeld weg: Legionär und Zenturio bleiben nach zwei Feldern stecken, der ' +
            'Springer springt nur die kurze Weite, und der Tangolin kommt über einen einzigen ' +
            'Sprung nicht hinaus. Schritte über ein Feld merken den Schlamm nicht.',
      effekt: { maxWeite: 2 }
    },
    {
      id: 'marsch', name: 'Marschbefehl', icon: '🥁', farbe: '#60a5fa', gruppe: 'Bewegung', menge: 2,
      kurz: 'Arbeiter, Bogenschütze, Tangolin und Turm ziehen 2 Felder.',
      text: 'Die Trommel gibt den Takt vor. Arbeiter, Bogenschütze, Tangolin und Königs-Turm ' +
            'ziehen zwei Felder geradeaus statt eines – das Feld dazwischen muss frei sein, ' +
            'marschiert wird, nicht gesprungen. Gefällt wird weiter nur vom Nachbarfeld aus. ' +
            'Legionär, Zenturio und Samurai sind ohnehin weit unterwegs, und der Springer ' +
            'springt weiter, wenn er weit sieht – das ist die klare Sicht, nicht die Trommel.',
      effekt: { extraFeld: true }
    },
    {
      id: 'aufbruch', name: 'Aufbruch', icon: '📯', farbe: '#fcd34d', gruppe: 'Bewegung', menge: 1,
      kurz: 'Wer als Erster unter der Karte zieht, hat zwei Züge.',
      text: 'Das Horn ruft zum Aufbruch. Wer als Erster unter dieser Karte zieht – also der, ' +
            'der sie aufgedeckt hat, sobald er wieder an der Reihe ist –, führt zwei Aktionen ' +
            'nacheinander aus statt einer. Alle anderen ziehen wie immer. Die einzige Karte, ' +
            'die nicht für alle gleich gilt; dafür sieht man sie kommen, und sie liegt nur ' +
            'einmal im Stapel.',
      effekt: null, sofort: null, extraZug: 1
    },

    /* --- Füllkarte --- */
    {
      id: 'ruhe', name: 'Ruhe vor dem Sturm', icon: '🌙', farbe: '#64748b', gruppe: 'Ruhe', menge: 2,
      kurz: 'Der Sturm bleibt aus. Es wird gespielt wie immer.',
      text: 'Es hat sich zusammengebraut – und dann doch nichts. Keine Regel ändert sich, es ' +
            'wird gespielt wie im Standardspiel. Zwei dieser Karten liegen im Stapel: ' +
            'Nicht jeder Schlag soll das Brett umkippen, und eine Karte, die man kommen sieht ' +
            'und die dann ausbleibt, ist ihre eigene kleine Spannung.'
    }
  ];

  /* Klares Wetter: keine Karte, sondern der Zustand dazwischen. Er liegt nicht
     im Stapel und wird nie gezogen – die Anzeige braucht ihn nur, um zeigen zu
     können, dass gerade nichts gilt und was das Wetter drehen würde. */
  var KLAR = {
    id: 'kein', name: 'Klares Wetter', icon: '🌤️', farbe: '#7f8c9b', gruppe: 'Wetter', menge: 0,
    kurz: 'Keine Karte gilt. Fällt jetzt eine Figur, dreht der Wind.',
    text: 'Zwischen zwei Karten ist das Wetter klar, und es wird nach den Grundregeln gespielt. ' +
          'Nur jetzt lässt sich das Wetter drehen: Wer als Nächster eine Figur schlägt, deckt ' +
          'die oberste Karte des Stapels auf. Sie zieht auf, lässt eine volle Runde ohne ' +
          'Wirkung verstreichen und gilt dann zwei volle Runden lang. Solange sie aufzieht oder ' +
          'gilt, ändert kein weiterer Schlag etwas – danach klart es wieder auf, und der ' +
          'nächste Schlag zählt wieder.'
  };

  var NACH_ID = {};
  KARTEN.forEach(function (k) { NACH_ID[k.id] = k; });

  function karte(id) {
    if (id === KLAR.id) return KLAR;
    return NACH_ID[id] || null;
  }

  /* Der Stapel: jede Karte so oft, wie ihre Menge sagt. */
  function stapel() {
    var out = [];
    KARTEN.forEach(function (k) {
      for (var i = 0; i < k.menge; i++) out.push(k.id);
    });
    return out;
  }

  function mischen(liste, zufall) {
    var r = zufall || Math.random;
    for (var i = liste.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = liste[i]; liste[i] = liste[j]; liste[j] = t;
    }
    return liste;
  }

  /* Wirkung einer Karte – das, was ans Brett gehängt wird. */
  function wirkungVon(id) {
    var k = karte(id);
    if (!k) return NEUTRAL;
    var w = mische(k.effekt);
    w.id = id;
    return w;
  }

  /* ---------------- Kleine Regelhelfer ----------------
     Sie stehen hier, damit Regelwerk und Computergegner dieselbe Rechnung
     benutzen – und nicht zwei Stellen dasselbe leicht verschieden auslegen. */

  /* Was eine Einheit gerade kostet. Unter 1 fällt keine Karte: Umsonst gibt es
     auch auf dem fahrenden Markt nichts. */
  function kosten(grund, w) {
    if (!grund) return grund;
    return Math.max(1, grund + ((w && w.kosten) || 0));
  }

  return {
    NEUTRAL: NEUTRAL, KARTEN: KARTEN, KLAR: KLAR, WUCHS_MAX: WUCHS_MAX,
    wirkung: wirkung, wirkungVon: wirkungVon, karte: karte,
    stapel: stapel, mischen: mischen, kosten: kosten
  };
})();

if (typeof module !== 'undefined') { module.exports = Wetter; }
