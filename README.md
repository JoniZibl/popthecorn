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

## Einheiten

| Einheit | Kosten | Bewegung |
|---|---|---|
| Königs-Turm | Startfigur | 1 Feld gegen 1 Holz; bildet Einheiten aus |
| Arbeiter | 1 Holz | 1 Feld; fällt Bäume (+1 Holz), schlägt im Bewegungsradius |
| Samurai | 1 Holz | genau 2 Felder geradeaus, über Wasser und Bäume hinweg |
| Springer | 2 Holz | 2 Felder in die gewählte Richtung, über alles hinweg |
| Legionär | 2 Holz | beliebig weit vor/zurück auf seiner Achse, nicht über Bäume |
| Bogenschütze | 2 Holz | 1 Feld ohne zu schlagen, oder Schuss auf Distanz 2 |
| Tangolin | 2 Holz | Kettensprünge über Bäume und eigene Einheiten, nie über Wasser |
| Zenturio | 3 Holz | beliebig weit in jede Richtung; nur einmal pro Spiel |

## Bedienung

* **Figur anklicken** → mögliche Züge werden markiert (weiß = Zug, roter Ring = schlagen,
  orange = Baum fällen, rotes Kreuz = Schuss, rosa = Ausbildungsfeld).
* **Ausbilden** → Einheit in der Seitenleiste wählen, dann ein rosa markiertes Feld anklicken.
* **Richtungsfiguren** (Springer, Legionär) dürfen nach ihrem Zug kostenlos neu ausgerichtet
  werden; eine Drehung ohne Bewegung kostet den ganzen Zug.
* Brett verschieben durch Ziehen, Zoom per Mausrad, Zwei-Finger-Geste oder über die
  Schaltflächen rechts oben. Am Handy liegen die Aktionen direkt unter dem Brett.

## Auslegung der Regeln

Die Spielidee lässt einige Details offen; so sind sie hier umgesetzt:

* **Samurai** springt genau 2 Felder geradeaus. Dadurch erreicht er nur jedes vierte Feld –
  genau die im Regeltext beschriebene Eigenschaft, „niemals alle Felder berühren“ zu können.
* **Springer** springt 2 Felder ausschließlich in seine Blickrichtung.
* **Bogenschütze** trifft auf Distanz 2 entlang der 6 geraden Richtungen und schlägt beim
  Laufen nicht („beim Springen keine Einheiten schlagen“).
* **Tangolin** schlägt nur beim normalen 1-Feld-Zug, nicht beim Kettensprung.
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
js/render.js        SVG-Darstellung von Brett, Bäumen und Figuren
js/ui.js            Steuerung, Seitenleiste, Regelwerk
build.js            baut alles zu einer einzigen HTML-Datei zusammen
dist/hexodus.html   erzeugte Einzeldatei (CSS und JS eingebettet)
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
node test/simulate.js 100
```

Spielt zufällige Partien komplett durch – inklusive Aufbau, Ausbildung und Ausscheiden –
und prüft nach jedem Zug die Invarianten des Spielzustands (keine Figur im Wasser oder auf
einem Baum, kein negatives Holz, genau ein Königs-Turm je aktivem Spieler).
