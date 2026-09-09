# Hexodus

Das Hexagon-Strategiespiel als Website – für 2–4 Spieler im Hotseat-Modus an einem Gerät.
Reine HTML/CSS/JavaScript-Umsetzung ohne Build-Schritt und ohne Abhängigkeiten:
`index.html` im Browser öffnen und loslegen.

## Spielablauf

1. **Spielfeld** – Aus zufällig aneinandergelegten 7er-Hexagon-Plättchen entsteht das Brett
   (10 / 20 / 25 Plättchen bei 2 / 3 / 4 Spielern). Jedes Plättchen enthält Gras- und Wasserfelder.
2. **Bäume platzieren** – Alle Spieler setzen reihum je einen Baum, bis alle verteilt sind
   (30 / 45 / 60 Bäume, gleichmäßig aufgeteilt). Wer keine Lust auf 30 Klicks hat, nutzt
   *„Restliche Bäume zufällig setzen“*.
3. **Turm & Arbeiter** – Danach setzt jeder seinen Königs-Turm und daneben seinen Arbeiter.
   Der letzte Spieler, der seinen Turm setzt, beginnt.
4. **Partie** – Pro Zug **genau eine** Aktion: bewegen, schießen, drehen oder ausbilden.
   Wer den Königs-Turm eines Gegners schlägt, entfernt dessen komplette Armee vom Feld und
   erbeutet sein Holz. Wer als Letzter steht, gewinnt.

Holz kommt ausschließlich aus gefällten Bäumen und bezahlt jede neue Einheit.
Ausgebildet wird auf freien Feldern rund um den Königs-Turm und um alle Einheiten,
die über eine lückenlose Kette mit ihm verbunden sind.

Von **jeder Figur darf höchstens eine** je Spieler auf dem Feld stehen. Erst wenn sie
geschlagen wird, darf sie neu ausgebildet werden – der Zenturio bleibt davon ausgenommen
und ist auf eine Ausbildung pro Partie beschränkt. Eine Armee umfasst damit höchstens
Königs-Turm, je eine der sechs übrigen Figuren und den einmaligen Zenturio.

## Einheiten

| Einheit | Kosten | Bewegung |
|---|---|---|
| Königs-Turm | Startfigur | 1 Feld gegen 1 Holz; bildet Einheiten aus |
| Arbeiter | 1 Holz | 1 Feld; fällt Bäume (+1 Holz), schlägt im Bewegungsradius |
| Samurai | 1 Holz | auf eine der 6 Diagonalen, über Wasser und Bäume hinweg |
| Springer | 2 Holz | 2 oder 3 Felder in zwei benachbarte Richtungen, über alles hinweg |
| Legionär | 2 Holz | beliebig weit vor/zurück auf seiner Achse, nicht über Bäume |
| Bogenschütze | 2 Holz | 1 Feld ohne zu schlagen, oder Schuss auf Distanz 2 |
| Tangolin | 2 Holz | Kettensprünge über Bäume und eigene Einheiten, nie über Wasser |
| Zenturio | 3 Holz | beliebig weit in jede Richtung; nur einmal pro Spiel |

Verliert man den Arbeiter, lohnt sich ein Holzvorrat: Ohne Arbeiter und ohne Holz lassen
sich keine Bäume mehr fällen – und damit nichts mehr ausbilden.

## Computergegner

Im Startmenü lässt sich jeder Platz auf **Mensch** oder **KI** (leicht / normal / stark)
stellen – auch alle Plätze gleichzeitig, dann spielt der Computer gegen sich selbst.

Die KI ist keine Zugliste, sondern eine Suche mit Stellungsbewertung:

* **Suche** – Alpha-Beta mit iterativer Vertiefung und Ruhesuche (Schlagzüge werden über
  die nominelle Tiefe hinaus verfolgt, damit kein Abtausch übersehen wird). Bei mehr als
  zwei Spielern wird „paranoid“ gesucht: alle Gegner spielen so, als richteten sie sich
  ausschließlich gegen die KI. Gerechnet wird auf einer kompakten Brettdarstellung mit
  Zug-Anwenden und -Zurücknehmen, ohne das Brett zu kopieren.
* **Bewertung** – Materialwerte, Holz als Währung, und darüber hinaus:
  * **Wirtschaft:** Nähe des Arbeiters zu Bäumen; wer weder Arbeiter noch Holz besitzt,
    bekommt einen schweren Abzug – seine Partie ist wirtschaftlich vorbei. Holz zählt
    genau so viel, wie es einkauft (rund 210 je Holz). Das ist wichtiger, als es klingt:
    War Holz billiger bewertet, sprang die Bewertung bei jedem Ausbildungszug um mehrere
    hundert Punkte nach oben, und die Suche jagte am Horizont diesem geschenkten Wert
    nach, statt echte Vorteile zu finden – tiefere Suche brachte dadurch gar nichts mehr.
  * **Königssicherheit:** Für jede Feindfigur wird geschätzt, in wie vielen Zügen sie den
    Turm erreichen kann – aus Entfernung, Schlagweite und Tempo der Figur. Der Abzug wächst
    steil, je näher der Angriff rückt, damit die KI ausweicht, solange der Gegner noch drei
    Felder entfernt ist. Wer **kein Holz** hat, kann seinen Turm nicht einen Schritt bewegen;
    das kostet bei herannahendem Gegner mehr als jede Figur, die man für das Holz bekäme.
  * **Deckung wie im Schach:** Für jede Figur werden Angreifer und Verteidiger gezählt.
    Eine ungedeckt angegriffene Figur kostet die Hälfte ihres Wertes, eine überzählig
    angegriffene knapp ein Drittel. Dadurch stellt die KI Figuren gegenseitig in Deckung
    und greift bevorzugt an, was der Gegner nicht halten kann.
  * **Handlungsfähigkeit:** Beweglichkeit und freie Ausbildungsfelder an der Turmkette.
* **Aufbauphase** – Jede KI wählt ein Heimatgebiet, pflanzt ihre Bäume als Ring darum und
  stellt später ihren Turm mitten hinein, mit Abstand zu den Gegnern und Platz zum Ausbilden.

Die Stufen unterscheiden sich in Rechenzeit und Suchtiefe: *leicht* rechnet 0,15 s und
kommt auf Suchtiefe 2, *normal* 0,45 s und Tiefe 4, *stark* 2 s und Tiefe 7. Gemessen in
kompletten Partien schlägt *stark* die Stufe *normal* mit 7:0 und *normal* die Stufe
*leicht* deutlich. *normal*
und *stark* spielen immer den besten gefundenen Zug. Wo überhaupt gewürfelt wird, werden
die Wurzelzüge mit vollem Suchfenster bewertet – Alpha-Beta liefert sonst nur obere
Schranken, und ein scheinbar harmloser Zug könnte in Wahrheit den Turm kosten. Die Zeit
ist ein hartes Limit – auf einem langsamen Gerät sucht die KI einfach weniger tief,
statt die Oberfläche zu blockieren.

Gespielt wird ausschließlich über `game.js`: Die KI schlägt einen Zug vor, ausgeführt wird
er vom Regelwerk. So kann kein KI-Zug an den Regeln vorbei.

## Bedienung

* **Figur anklicken** → mögliche Züge werden markiert (weiß = Zug, roter Ring = schlagen,
  orange = Baum fällen, rotes Kreuz = Schuss, rosa = Ausbildungsfeld).
* **Ausbilden** → Einheit in der Seitenleiste wählen, dann ein rosa markiertes Feld anklicken.
* **Richtungsfiguren** (Springer, Legionär) dürfen nach ihrem Zug kostenlos neu ausgerichtet
  werden; eine Drehung ohne Bewegung kostet den ganzen Zug.
* **Richtungspfeile** stehen dauerhaft an allen Figuren – auch an denen der Gegner. Der
  Springer trägt einen breiten Pfeil zwischen seinen beiden Sprungrichtungen, der Legionär
  zwei Pfeile für seine Achse nach vorn und zurück.
* Brett verschieben durch Ziehen, Zoom per Mausrad, Zwei-Finger-Geste oder über die
  Schaltflächen rechts oben. Am Handy liegen die Aktionen direkt unter dem Brett.

## Auslegung der Regeln

Samurai, Springer, Bogenschütze, Legionär und Zenturio sind aus den Abbildungen der
Regelkarten abgeleitet: Die Zielfelder der Karten wurden ausgemessen und in Hex-Koordinaten
zurückgerechnet (`test/figuren.js` hält das Ergebnis fest). Wo die Abbildungen nichts
hergeben, gilt der Kartentext:

* **Samurai** springt auf eine der 6 Hex-Diagonalen, also auf die „Ecken“ um sein Feld
  herum. Diese Züge lassen `(q − r) mod 3` unverändert – er bleibt sein Leben lang auf
  einem Drittel des Bretts und kann damit tatsächlich „niemals alle Felder berühren“.
* **Springer** hat als Richtung einen Keil aus zwei benachbarten Richtungen und springt
  darin genau 2 oder 3 Felder weit – vier Zielfelder je Ausrichtung.
* **Bogenschütze** trifft auf Distanz 2 entlang der 6 geraden Richtungen und schlägt beim
  Laufen nicht („beim Springen keine Einheiten schlagen“).
* **Tangolin** schlägt nur beim normalen 1-Feld-Zug, nicht beim Kettensprung. Seine
  Abbildung zeigt nur die Nachbarfelder, daher folgt der Kettensprung dem Kartentext.
* **Drehen** gilt als Zug, darf aber im Anschluss an eine Bewegung kostenlos erfolgen –
  so ergibt „laufen und/oder drehen“ aus dem Regeltext einen sinnvollen Zug.
* **Wasser** kann nie betreten werden; Samurai, Springer und Schüsse überqueren es.
* Ein Spieler, der keine einzige Aktion mehr hat, setzt aus. Setzen alle nacheinander aus,
  endet die Partie unentschieden.
* Königs-Türme starten mit Mindestabstand zueinander, damit niemand sofort erschlagen wird.

## Projektstruktur

```
index.html          Startbildschirm, Spielbildschirm, Regelwerk-Overlay
css/style.css       gesamtes Layout und die Optik des Bretts
js/hex.js           Hex-Geometrie (axiale Koordinaten, flat-top Layout)
js/units.js         Einheiten-Definitionen samt Regeltexten
js/board.js         Spielfeld-Erzeugung aus 7er-Plättchen
js/moves.js         Regelwerk: legale Züge, Schüsse, Ausbildungsfelder
js/game.js          Spielzustand, Aufbauphasen, Zugabwicklung, Ausscheiden
js/ai.js            Computergegner: Suche, Bewertung, Aufbaustrategie
js/render.js        SVG-Darstellung von Brett, Bäumen und Figuren
js/ui.js            Steuerung, Seitenleiste, Regelwerk
build.js            baut alles zu einer einzigen HTML-Datei zusammen
dist/hexodus.html   erzeugte Einzeldatei (CSS und JS eingebettet)
test/figuren.js     Zielfelder der Figuren gegen die Regelkarten
test/ki.js          KI-Zuggenerierung gegen das Regelwerk, make/unmake
test/kispiel.js     Spielstärke: komplette Partien KI gegen KI/Zufall
test/jagd.js        KI gegen einen Gegner, der gezielt den Turm jagt
test/blunder.js     lässt die KI ihren Turm im Schlagbereich stehen?
test/simulate.js    Regelwerks-Simulation (Node, ohne Browser)
```

## Einzeldatei erzeugen

```
node build.js
```

Schreibt `dist/hexodus.html` mit eingebettetem CSS und JavaScript – praktisch zum
Verschicken, Hochladen oder Öffnen ohne lokalen Server.

## Tests

```
node test/figuren.js            # Zielfelder der Figuren gegen die Regelkarten
node test/ki.js                 # KI-Zuggenerierung gegen das Regelwerk
node test/simulate.js 100       # komplette Zufallspartien
node test/kispiel.js 10         # Spielstärke der KI
node test/kispiel.js 8 stark normal   # eigene Paarung
node test/jagd.js 10 normal     # hält der Turm einem gezielten Angriff stand?
node test/blunder.js 6 normal   # stellt die KI ihren Turm ins Schlagfeld?
```

`test/jagd.js` ist der schärfste Test der KI: Der Gegner läuft stur mit allem auf ihren
Königs-Turm zu und schlägt ihn, sobald er kann. Genau daran scheitert eine KI, die den
Angriff erst bemerkt, wenn er schon vor der Tür steht. Der Test schlägt fehl, sobald die
KI auch nur eine Partie durch einen verlorenen Turm abgibt.

`test/ki.js` vergleicht jeden von der KI erzeugten Zug mit `moves.js` – in beide
Richtungen, damit die Suche weder Züge erfindet noch übersieht – und prüft, dass das
Zurücknehmen eines Zuges die Stellung bitgenau wiederherstellt.

`test/figuren.js` prüft die ausgemessenen Zielfelder von Samurai, Springer und
Bogenschütze – inklusive der Eigenschaft des Samurai, auf einer Farbklasse zu bleiben –
sowie die Bestandsgrenze von einer Figur je Typ samt Neuausbildung nach einem Verlust.

`test/simulate.js` spielt zufällige Partien komplett durch – inklusive Aufbau, Ausbildung und Ausscheiden –
und prüft nach jedem Zug die Invarianten des Spielzustands (keine Figur im Wasser oder auf
einem Baum, kein negatives Holz, genau ein Königs-Turm je aktivem Spieler, höchstens eine
Figur je Typ und Spieler).
