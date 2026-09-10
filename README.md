# Hexodus

Das Hexagon-Strategiespiel als Website – für 2–4 Spieler im Hotseat-Modus an einem Gerät.
Reine HTML/CSS/JavaScript-Umsetzung ohne Build-Schritt und ohne Abhängigkeiten:
`index.html` im Browser öffnen und loslegen.

## Spielablauf

1. **Spielfeld** – Aus zufällig aneinandergelegten 7er-Hexagon-Plättchen entsteht das Brett
   (10 / 20 / 25 Plättchen bei 2 / 3 / 4 Spielern). Jedes Plättchen enthält Gras- und
   Wasserfelder. Ringsum legt sich ein **zwei Felder dicker Wasserrand**: Das Brett hört
   damit nicht an einer geraden Kante auf, sondern liegt als Insel im Meer.
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

### Beute

Wer eine Figur schlägt, erhält die **Hälfte ihrer Ausbildungskosten** als Holz zurück
(aufgerundet: 1 für die meisten Figuren, 2 für den Zenturio). Beim Königs-Turm wechselt
ohnehin der gesamte Vorrat den Besitzer. Kämpfen bleibt damit auch bei leerem Wald
wirtschaftlich sinnvoll – und wer zurückliegt, kann sich zurückkämpfen.

### Versorgungskette

Ausgebildet wird nur an Feldern rund um einen **Anker** und um alle Einheiten, die über eine
lückenlose Kette mit ihm verbunden sind. Diese Kette ist auf dem Brett als gepunktete Linie
in der Farbe des Spielers am Zug zu sehen. Wer seine Figuren zu weit auseinanderzieht,
verliert die Verbindung und kann vorn nichts mehr nachschieben.

Anker sind zwei: der **Königs-Turm** – und der **Zenturio**, der das Feldzeichen trägt. Wo
das Feldzeichen steht, ist Nachschub, auch wenn die Kette zum eigenen Turm längst gerissen
ist. Aus der teuersten Figur des Spiels wird damit ein vorgeschobener Stützpunkt: Sie
verlängert nicht deine Reichweite, sondern dein Hinterland. Und weil ein einzeln vorstehendes
Feldzeichen keine einzige Verbindungslinie hätte, bekommt der Zenturio einen gepunkteten Ring
um sein Feld – sonst sähe man ihm nicht an, was er kann.

Damit hängt an ihm mehr als eine schnelle Figur: Wer den Zenturio schlägt, kappt dem Gegner
die Versorgung an der Front. Für drei Holz und eine Ausbildung pro Partie ist das ein Preis,
über den sich nachdenken lässt.

### Eine Partie endet immer mit einem Sieger

Läuft die Partie fest, wird gewertet – ein Unentschieden gibt es nicht. Ausgelöst wird die
Wertung, wenn dieselbe Stellung zum **dritten Mal** auftritt, wenn **50 Züge** ohne
gefällten Baum, ohne Schlag und ohne Ausbildung vergehen, oder wenn niemand mehr ziehen kann.

Dann gewinnt, wer das größte **Vermögen** hat: Holzvorrat plus das Holz, das in den eigenen
Figuren steckt. Bei Gleichstand entscheiden nacheinander die Zahl der Figuren, der
Holzvorrat und wer zuletzt etwas bewegt hat – die Kette bricht jeden Gleichstand auf.

Die KI kennt diese Regel: Sie zählt die Züge ohne Fortschritt in der Suche mit und erkennt
an der Wurzel, welcher Zug die dritte Wiederholung auslösen würde. Wer bei einer Wertung
verlieren würde, sucht deshalb den Durchbruch, statt Figuren hin und her zu schieben.

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
| Tangolin | 2 Holz | Kettensprünge über Bäume und eigene Einheiten; schlägt beim 1-Feld-Zug |
| Zenturio | 3 Holz | beliebig weit in jede Richtung; trägt das Feldzeichen; nur einmal pro Spiel |
| Boot | 1 Holz | kein Figur, sondern ein neutrales Objekt – macht ein Wasserfeld begehbar |

### Woran man die Figuren erkennt

Jede Figur hat einen **eigenen Umriss**, nicht nur andere Zacken: Der Königs-Turm ist ein
Turm mit Zinnen, der Samurai eine schräge Klinge – als Einziger diagonal, wie sein Zug. Der
Springer ist der Pferdekopf aus dem Schach, der Legionär ein Scutum, der Tangolin eine Raute.
Der **Zenturio** ist ein Feldzeichen: ein hoher Schaft in der Spielerfarbe, gekreuzt von drei
dunklen Querbalken im oberen Drittel. Er ist die höchste Figur im Spiel und
steht wie der Königs-Turm auf einem größeren Sockel – die einzige Figur mit einem gestreiften
Umriss und damit aus jeder Kameraperspektive sofort als die stärkste Einheit zu erkennen.

**Arbeiter und Bogenschütze** behalten ihre ursprünglichen Formen: das schlichte Dreieck und
die Spitze mit den eingezogenen Flanken. Beide waren zwischenzeitlich als Axt und als Bogen
gezeichnet und sind auf Wunsch zurückgeholt, nur an die größeren Maße angepasst. Sie sind
damit die beiden Umrisse, die einander am nächsten kommen – zusammen mit der Raute des
Tangolins laufen alle drei nach oben spitz zu.

Das ist keine Spielerei: Auf dem Brett ist eine Figur am Handy gut zehn Bildpunkte hoch.
Was sich erst aus der Nähe unterscheidet, unterscheidet sich im Spiel gar nicht. Die kleinen
Symbole in Seitenleiste und Regelwerk zeichnen dieselben Umrisse – wer ein Symbol antippt,
soll die Figur auf dem Feld wiedererkennen.

### Der Kettensprung des Tangolins

Der Tangolin springt über **Bäume und eigene Einheiten**, so oft es weitergeht – ein Zug kann
ihn quer über das halbe Brett tragen, wenn genug Sprungbretter in einer Reihe stehen. Eine
**gegnerische Figur ist kein Sprungbrett, sondern eine Sperre**: Über sie geht es nicht
hinweg, und das Feld dahinter bleibt unerreichbar. Geschlagen wird nicht im Vorbeispringen,
sondern nur beim normalen Zug auf ein Nachbarfeld – dort schlägt er in jede Richtung.

Weil ein Sprung nichts am Brett ändert, zählt allein, welche Felder erreichbar sind: Gesucht
wird in die Breite, und jedes Feld wird genau einmal betreten. Ohne diese Regel liefe der
Tangolin im Kreis, solange ein Baum in Reichweite steht.

### Boote

Wasser betritt nur, wer ein **Boot** hat. Zieht eine Figur im regulären Zug von Land aufs
Wasser, kostet das **1 Holz**; das Boot liegt dann unter ihr. Auf dem Wasser bewegt sie sich
danach wie an Land. Verlässt sie das Wasser, bleibt das Boot auf dem letzten Wasserfeld
zurück – und darf später von **jedem** Spieler genutzt werden, auch vom Gegner. Für einen
neuen Einstieg an anderer Stelle braucht es ein neues Boot.

Wer in einem Zug über mehrere Wasserabschnitte läuft, zahlt für jeden Abschnitt ein Boot:
Ein Zenturio, der zwei durch Land getrennte Wasserstreifen quert, gibt 2 Holz aus und lässt
zwei Boote zurück. Die Kosten stehen als kleine Zahl am Zielfeld.

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
kommt auf Suchtiefe 2, *normal* 0,45 s und Tiefe 4, *stark* 2 s und Tiefe 7.

### Die Suche rechnet in einem eigenen Faden

Gerechnet wird in einem **Web Worker** (`js/aiworker.js`). Die Oberfläche läuft nebenher
weiter: Man kann das Brett drehen, kippen und schieben, während die KI nachdenkt.

Vorher lief die Suche im Faden der Oberfläche. Damit die Seite bedienbar blieb, rechnete sie
in Häppchen und verwarf eine angefangene Suchtiefe, sobald ein einzelner Suchast länger als
220 ms brauchte – ein einzelner tiefer Ast lässt sich nicht unterbrechen. Bei vier Spielern
waren das trotzdem rund **dreißig Blockaden von je 220 ms** pro Zug, und genau die sieht man
als Ruckeln. Gemessen mit vier starken Gegnern: vorher 33 Blockaden, zusammen 6,5 Sekunden;
jetzt **keine einzige**, und ein Neuaufbau der Szene beim Drehen kostet 10–15 ms, also ein
Bild.

Nebenbei wird die KI dadurch etwas stärker: Im eigenen Faden stört langes Rechnen niemanden,
die Suche braucht keine Notbremse mehr und verwirft keine angefangene Tiefe.

Zwei Wege in den Faden: Liegt das Spiel als Dateisammlung, wird `js/aiworker.js` geladen. Ist
es die Einzeldatei, gibt es diese Datei nicht – dann wird der Faden aus den eingebetteten
Bausteinen zusammengesetzt, die `build.js` mit `data-modul` gekennzeichnet hat. Wo beides
scheitert, rechnet die Suche wie früher in Häppchen weiter; unter jedem Weg steht derselbe
Rückfallweg, damit ein Browser ohne Worker das Spiel nicht verliert, sondern nur die
Flüssigkeit.

Der Zustand geht als Kopie hinüber – ohne den Geometrie-Zwischenspeicher, den die KI ans
Brett hängt: Er ist groß, wird drüben ohnehin neu gebaut, und mitzuschicken hieße, ihn bei
jedem Zug zu kopieren. Jede Frage trägt eine Kennung; wer eine neue Partie beginnt, während
noch gerechnet wird, bekommt die alte Antwort nicht untergeschoben. Der Faden wird bei einer
neuen Partie beendet, sonst müsste ihr erster Zug warten, bis die alte Frage fertig gekaut
ist.

Zwischen Zugbeginn und ausgeführtem Zug vergeht **mindestens eine Sekunde**, damit die KI
wie ein nachdenkender Mitspieler wirkt. Rechnet sie ohnehin länger – *stark* nimmt sich bis
zu zwei Sekunden – wird nicht zusätzlich gewartet. Die Aufbauphase bleibt zügig; dreißig
Bäume mit je einer Sekunde wären eine halbe Minute Zuschauen.

*leicht* spielt zusätzlich **angriffslustig**: Druck auf den gegnerischen Turm zählt doppelt,
Figuren werden fürs Vorrücken belohnt, und unter gleichwertigen Zügen wählt sie bevorzugt
einen, der die Partie voranbringt. Das macht sie nicht stärker – sie überdehnt sich eher –,
aber ihre Partien enden entschieden statt im Stillstand: Zwei leichte KIs schlagen sich in
vier von fünf Partien gegenseitig den Turm ab, vorher endete etwa die Hälfte per Wertung.
Steht der eigene Turm unter Druck, tritt der Angriffsdrang zurück; ohne diese Bremse hat sie
gegen einen gezielten Angriff ihren eigenen Turm verloren. Gemessen in
kompletten Partien schlägt *stark* die Stufe *normal* mit 7:0 und *normal* die Stufe
*leicht* deutlich. *normal*
und *stark* spielen immer den besten gefundenen Zug. Wo überhaupt gewürfelt wird, werden
die Wurzelzüge mit vollem Suchfenster bewertet – Alpha-Beta liefert sonst nur obere
Schranken, und ein scheinbar harmloser Zug könnte in Wahrheit den Turm kosten. Die Zeit
ist ein hartes Limit – auf einem langsamen Gerät sucht die KI einfach weniger tief,
statt die Oberfläche zu blockieren.

Gespielt wird ausschließlich über `game.js`: Die KI schlägt einen Zug vor, ausgeführt wird
er vom Regelwerk. So kann kein KI-Zug an den Regeln vorbei.

## Sichtbare Rückmeldung

Damit nachvollziehbar bleibt, was gerade passiert ist – gerade gegen die KI:

* **Figuren gleiten** von ihrem alten Feld heran, statt zu springen.
* Der **letzte Zug bleibt markiert**: gestrichelt das Startfeld, weiß das Zielfeld.
* Eine **geschlagene Figur** vergeht mit einem roten Ring **an ihrem Todesfeld**.
* Beim **Baumfällen** steigt ein „+1 🌲" **genau über dem gefällten Baum** auf, der Holzstand
  in der Leiste hebt sich kurz hervor.
* Eine **neu ausgebildete Einheit** wächst aus dem Boden.
* Mögliche Züge stehen **still**. Sie haben einmal geatmet, damit sie ins Auge fallen –
  dabei sah man aber nie genau, wo der Punkt sitzt, auf den man zielen soll. Auffallen
  sollen sie durch Farbe und Rand, nicht durch Bewegung.

Alle Effekte sitzen in einer äußeren Gruppe, die nur die Position trägt; animiert wird eine
innere Gruppe. Ohne diese Trennung überschreibt die CSS-Transformation der Animation das
`transform`-Attribut und der Effekt springt auf den Brett-Ursprung, statt dort zu erscheinen,
wo er hingehört.

Die Felder sind flach gefärbt, aber nicht einheitlich: Jede Zelle bekommt einen von vier
ähnlichen Grün- beziehungsweise Blautönen. Welchen, ergibt sich fest aus ihren Koordinaten –
der Untergrund wirkt dadurch gewachsen statt gestempelt und bleibt über Neuzeichnungen
stabil. Dieselbe Streuung bestimmt Größe und Neigung der Bäume.

Wer im Betriebssystem „Bewegung reduzieren" eingestellt hat, bekommt ein ruhiges Brett:
Alle Animationen entfallen, die Markierung des letzten Zuges bleibt.

## Die Insel

Nach dem Legen der Plättchen bekommt das Brett ringsum **zwei Reihen Wasser**. Gespielt wird
darauf wie auf jedem Wasser – ohne Boot betritt es niemand, und zu holen gibt es dort nichts;
es rahmt das Spielfeld und macht aus dem Brett eine Insel.

Beim Erzeugen wird erst die ganze Reihe gesammelt und dann gesetzt. Wer die neuen Felder
sofort einträgt, findet sie im selben Durchlauf als Nachbarn wieder und wächst statt einer
Reihe gleich ins Uferlose.

Der Rand kostet Platz und Rechenzeit, beides ist eingepreist:

* **Eingepasst** wird die Insel samt **innerem** Wasserring. Der äußere läuft über den
  Bildrand hinaus – bis zur letzten Welle eingepasst bliebe vom Land am Handy wenig übrig,
  und Wasser ist rundum trotzdem zu sehen.
* Die **Bewertung der KI** läuft an jedem Blatt einmal übers Brett. Seit dem Rand ist gut die
  Hälfte aller Felder Wasser, und auf Wasser steht nie ein Baum und nie eine Figur – die
  Suche geht deshalb über eine vorgemerkte Liste der Landfelder statt über alle. Die
  Suchtiefe bleibt dadurch, wo sie war (4,8 bei *stark*).
* **Beweglichkeit** zählt nur noch Landfelder. Aufs Wasser kommt nur, wer ein Boot kauft –
  sonst bekäme jede Figur an der Küste einen Bonus dafür, dass neben ihr das Meer liegt. Die
  Angriffskarte schließt Wasser weiter ein: Dort kann eine Figur im Boot stehen, und die ist
  schlagbar.

## Das Brett in drei Dimensionen

Das Spielfeld ist kein Bild, sondern eine **Platte mit Dicke**: Die Felder liegen oben, das
Wasser ein Stück tiefer, an den Außenkanten steht die Erde an. Bäume und Figuren stehen als
Aufsteller darauf und werfen einen Schatten auf ihr Feld. Das Brett lässt sich **drehen und
kippen** – vom flachen Blick über die Landschaft bis zur klassischen Draufsicht.

Gerechnet wird das ohne WebGL und ohne Bibliothek: `js/scene.js` ist eine Lochkamera aus
zwanzig Zeilen. Jeder Weltpunkt wird um den Gierwinkel gedreht, um den Neigungswinkel
gekippt und durch seinen Kameraabstand geteilt – der nahe Brettrand wird dadurch größer
als der ferne. Eine bloße Isometrie ohne diese Teilung sähe wieder flach aus.

Gezeichnet wird weiter in SVG, in zwei Sorten Geometrie:

* **Am Boden Liegendes** – Felder, Seitenwände, Zugmarkierungen, Richtungspfeile und
  Schatten – wird Punkt für Punkt projiziert. Ein Richtungspfeil zeigt deshalb aus jedem
  Blickwinkel auf das Nachbarfeld, das er meint, und aus Kreisen werden beim Kippen
  Ellipsen von selbst.
* **Aufrechtes** – Bäume, Figuren, aufsteigende Texte – steht als Aufsteller im Bild: an
  seinen projizierten Standpunkt gesetzt und mit dem Perspektivfaktor skaliert. Eine echte
  perspektivische Verkürzung ließe die Figuren in der Draufsicht auf null zusammenfallen;
  ein Brettspiel schaut man aber auch von oben an und will seine Figuren dabei sehen.

Statt eines Tiefenpuffers sortiert ein **Maler-Algorithmus**: Die Felder werden nach ihrem
Kameraabstand geordnet und von hinten nach vorn gezeichnet, jedes mit seinem eigenen Baum
und seiner eigenen Figur. Ein nahes Feld überdeckt damit alles, was hinter ihm steht.
Senkrechte Wände werden nur dort gezeichnet, wo man sie sehen kann: an den Außenkanten der
Platte und an den Ufern zum tiefer liegenden Wasser – innen verdeckt sie ohnehin das nähere
Feld. Beleuchtet werden sie von einer **fest in der Welt stehenden Sonne**; beim Drehen
wandert das Licht über die Kanten, statt mitzudrehen, und erst dadurch sieht die Platte aus
wie ein Körper.

Angeklickt wird nach wie vor das Feld selbst: Die projizierte Deckfläche ist die
Schaltfläche. Auch Baum und Figur nehmen den Klick für ihr Feld entgegen – sonst fiele er
in der Schrägsicht durch die Figur hindurch auf das Feld dahinter, über das sie hinausragt.

Die **Draufsicht ist exakt das alte, flache Brett**: Bei 90° Neigung ist die Projektion die
Identität, Feld für Feld auf dem Pixel, auf dem es vorher lag (`test/kamera.js` prüft das).
Wer die Schrägsicht nicht mag, verliert also nichts.

Wie das Brett steht, entscheidet der Spieler und nicht die Partie: Der eingestellte Winkel
wird gespeichert und gilt auch für das nächste Spiel und den nächsten Besuch. Der
`2D`/`3D`-Knopf kehrt deshalb nicht zu einer festen Voreinstellung zurück, sondern zu der
Neigung, die zuletzt selbst eingestellt wurde.

Am Handy müssen sich drei Gesten zwei Finger teilen. Auseinandergezogen wird gezoomt,
gegeneinander verdreht wird gedreht – bei beidem bleibt die Mitte zwischen den Fingern
stehen. Wandern dagegen **beide Finger gemeinsam** nach oben oder unten, kippt das Brett.
Gemessen wird das daran, wie weit jeder Finger seit Beginn der Geste gelaufen ist, nicht
seit dem letzten Ereignis: Jeder Finger meldet sich einzeln, in einem einzelnen Ereignis
bewegt sich also immer nur einer. Beide müssen mindestens zwölf Pixel in dieselbe Richtung
gelaufen sein – sonst kippte das Brett schon, wenn beim Aufziehen die Mitte ein wenig
mitwandert, oder wenn ein Finger liegen bleibt und nur der andere wegzieht.

## Bedienung

* **Figur anklicken** → mögliche Züge werden markiert (weiß = Zug, roter Ring = schlagen,
  orange = Baum fällen, rotes Kreuz = Schuss, rosa = Ausbildungsfeld).
* **Ausbilden** → Einheit in der Seitenleiste wählen, dann ein rosa markiertes Feld anklicken.
* **Richtungsfiguren** (Springer, Legionär) dürfen nach ihrem Zug kostenlos neu ausgerichtet
  werden; eine Drehung ohne Bewegung kostet den ganzen Zug.
* **Die Richtung wählst du am Brett.** Wartet das Spiel darauf – nach dem Zug einer
  Richtungsfigur oder nach ihrer Ausbildung –, liegen sechs Pfeile rund um die Figur: jeder
  dort, wohin er zeigt, beim Springer auf der Kante zwischen den beiden Feldern seines Keils.
  Ein Tipp genügt. Der hervorgehobene Pfeil ist die jetzige Richtung; ihn anzutippen beendet
  den Zug, ohne zu drehen – so braucht „so lassen“ keinen eigenen Knopf. Die Liste in der
  Seitenleiste bleibt für die Drehung, die als ganzer Zug zählt: Dort liegen auf denselben
  Nachbarfeldern die Zugfelder, und Pfeile darüber würden sich mit ihnen um jeden Klick
  streiten.
* **Richtungspfeile** stehen dauerhaft an allen Figuren – auch an denen der Gegner. Der
  Springer trägt einen breiten Pfeil zwischen seinen beiden Sprungrichtungen, der Legionär
  zwei Pfeile für seine Achse nach vorn und zurück.
* Brett verschieben durch Ziehen, Zoom per Mausrad, Zwei-Finger-Geste oder über die
  Schaltflächen rechts oben.
* **Blickwinkel** stellst du selbst ein: `⟲` `⟳` drehen, die beiden Pfeilknöpfe kippen –
  jeder Druck um sechs Grad, von der Draufsicht bis fast auf Augenhöhe mit dem Brett.
  `2D`/`3D` springt zwischen der Draufsicht und **genau dem Winkel, den du eingestellt
  hast**. Stufenlos geht es mit gedrückter **Umschalt-** oder **rechter Maustaste**
  (seitwärts dreht, nach unten kippt), mit den **Pfeiltasten** – und am Handy, indem du
  zwei Finger gegeneinander **verdrehst** (dreht) oder **gemeinsam nach oben und unten
  ziehst** (kippt). Eine kleine Anzeige nennt dabei kurz Neigung und Drehung.
* Der eingestellte Blickwinkel **bleibt**: über den Wechsel in die Draufsicht, über die
  nächste Partie und über das Neuladen der Seite hinweg. War vorher das ganze Brett zu
  sehen, passt es sich nach dem Drehen selbst wieder ein; wer hineingezoomt hat, behält
  seinen Ausschnitt.

## Am Handy

Auf schmalen Bildschirmen gehört der Bildschirm dem Brett. Sichtbar bleibt nur, was man
zum Spielen wirklich braucht:

* **Oben** eine Zeile aus Farbpunkt und Holzstand je Spieler – der Spieler am Zug ist
  umrandet – und darunter der Hinweis, was gerade zu tun ist.
* **Das Brett** dazwischen, über die ganze Fläche.
* **Unten zwei Knöpfe**: die *Schublade* mit allen Aktionen und die *Ansicht* mit der
  Kamerasteuerung. Beide sind eingeklappt, bis man sie braucht.

Die Kopfzeile mit Schriftzug entfällt im Spiel; Regelwerk und „Neues Spiel“ stehen unten in
der Schublade. Der Verlauf entfällt ganz – was zuletzt geschah, steht auf dem Brett:
gestrichelt das Start-, weiß das Zielfeld des letzten Zuges.

Die Schublade zieht sich **von selbst auf**, wenn das Spiel eine Entscheidung verlangt: eine
Richtung nach dem Zug einer Richtungsfigur, ein Zug, der ausgesetzt werden muss, das
Spielende. Ist die Entscheidung getroffen, räumt sie sich wieder weg – von Hand Geöffnetes
bleibt dagegen stehen. Wer eine Einheit zum Ausbilden wählt, bekommt sie ebenfalls aus dem
Weg geräumt, denn der nächste Schritt ist ein Fingertipp aufs Brett. Und wer das Brett
anfasst, schließt damit Schublade und Kamerasteuerung – wer das Brett anfasst, meint das
Brett.

Das Brett bekommt genau die freie Fläche zwischen Kopfzeile und Bedienleiste zugewiesen,
nicht den ganzen Bildschirm. Sonst läge die Hälfte des Spielfelds unter den Einblendungen –
und das Einpassen rechnete mit Platz, den es gar nicht gibt. Dreht man das Gerät, wird neu
eingepasst; kleine Änderungen der Fenstergröße lassen den gewählten Ausschnitt in Ruhe,
damit eine ein- und ausfahrende Adressleiste nicht dauernd den Zoom verstellt.

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
* **Tangolin:** Er springt über Bäume und eigene Einheiten, so weit es weitergeht. Über
  gegnerische Figuren springt er nicht – sie sperren ihm den Weg. Geschlagen wird nur beim
  normalen 1-Feld-Zug, dort in jede Richtung.
* **Boote und Kettensprünge:** Der Tangolin landet beim Kettensprung nur an Land – die Karte
  sagt ausdrücklich, dass er nicht über Wasser springt. Sein normaler 1-Feld-Zug darf dagegen
  ein Boot nutzen.
* **Boote und Sprünge:** Samurai und Springer dürfen auf einem Wasserfeld landen, wenn sie ein
  Boot kaufen oder dort schon eines liegt. Springen sie nur darüber hinweg, kostet es nichts.
* **Ausgebildet** wird ausschließlich auf Landfeldern.
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
js/board.js         Spielfeld-Erzeugung aus 7er-Plättchen samt Wasserrand
js/moves.js         Regelwerk: legale Züge, Schüsse, Ausbildungsfelder
js/game.js          Spielzustand, Aufbauphasen, Zugabwicklung, Ausscheiden
js/ai.js            Computergegner: Suche, Bewertung, Aufbaustrategie
js/aiworker.js      lässt den Computergegner in einem eigenen Faden rechnen
js/scene.js         Kamera: Drehung, Neigung, Perspektive, Licht
js/render.js        3D-Darstellung von Brett, Bäumen und Figuren in SVG
js/ui.js            Steuerung, Seitenleiste, Regelwerk
build.js            baut alles zu einer einzigen HTML-Datei zusammen
dist/hexodus.html   erzeugte Einzeldatei (CSS und JS eingebettet)
sw.js               legt das Spiel im Browser ab – Hexodus ohne Internet
manifest.webmanifest  macht Hexodus auf dem Handy installierbar
icon.svg, icon-*.png  App-Symbole für den Startbildschirm
test/figuren.js     Zielfelder der Figuren gegen die Regelkarten
test/boot.js        Boot-Regeln inklusive des Beispiels von der Regelkarte
test/beute.js       Beute beim Schlagen
test/tangolin.js    Kettensprung: Sprungbretter, Sperren, Landeplätze
test/versorgung.js  Feldzeichen: der Zenturio als zweiter Anker der Kette
test/ki.js          KI-Zuggenerierung gegen das Regelwerk, make/unmake
test/kispiel.js     Spielstärke: komplette Partien KI gegen KI/Zufall
test/jagd.js        KI gegen einen Gegner, der gezielt den Turm jagt
test/blunder.js     lässt die KI ihren Turm im Schlagbereich stehen?
test/entscheidung.js  endet jede Partie mit genau einem Sieger?
test/kamera.js      Kamera: Draufsicht, Perspektive, Tiefensortierung
test/ansicht.js     die gezeichnete Szene, ohne Browser
test/simulate.js    Regelwerks-Simulation (Node, ohne Browser)
```

## Ohne Internet spielen

Hexodus braucht nie eine Verbindung: Es rechnet alles im Browser, vom
Computergegner bis zur Darstellung, und lädt nichts nach – keine Schrift, keine
Bibliothek, kein Bild. Zwei Wege, das auch zu nutzen:

**Die Einzeldatei mitnehmen.** `dist/hexodus.html` enthält Spiel, Optik und
Computergegner in einer Datei. Speichern, doppelklicken, spielen – auf dem
Rechner, dem Stick, dem Handy. Sie hat keinen einzigen Verweis nach außen; im
Flugmodus geöffnet lädt sie nichts nach, weil es nichts nachzuladen gibt.

**Als App aufs Handy.** Liegt Hexodus auf einer Adresse (GitHub Pages genügt),
macht `manifest.webmanifest` es installierbar und `sw.js` netzunabhängig: Beim
ersten Besuch legt der Service Worker eine vollständige Kopie im Browser ab.
Danach genügt *Zum Startbildschirm hinzufügen* – Hexodus startet als eigene App,
im Flugzeug wie im Keller.

Ausgeliefert wird dabei **zuerst aus dem Vorrat**, danach sieht der Service
Worker im Hintergrund nach einer neueren Fassung. Der Start bleibt dadurch
sofort und netzunabhängig; eine neue Fassung ist beim übernächsten Start da.
Umgekehrt – erst das Netz fragen, dann den Vorrat – hinge jeder Start an der
Antwortzeit des Servers, und genau das soll hier nicht sein. Wer eine Fassung
sofort ausrollen will, erhöht die Zahl in `CACHE` (`hexodus-v1`) in `sw.js`;
dann wird beim nächsten Besuch alles neu geholt.

Manifest, Service Worker und App-Symbole gehören nur zur gehosteten Fassung.
`build.js` lässt sie beim Bauen der Einzeldatei weg – sie wird meist von der
Festplatte geöffnet, und dort wären es tote Verweise. Erkennbar sind sie im
Quelltext am Merkmal `data-online-only`.

## Einzeldatei erzeugen

```
node build.js
```

Schreibt `dist/hexodus.html` mit eingebettetem CSS und JavaScript – praktisch zum
Verschicken, Hochladen oder Öffnen ohne lokalen Server.

Der **Kopf der Seite wandert mit**. Zwei Angaben darin entscheiden darüber, ob die Datei von
der Festplatte aus etwas taugt: `charset`, sonst rät der Browser die Zeichenkodierung und aus
„Königs-Turm“ wird Buchstabensalat – ein Server schickt die Kodierung mit, eine Datei nicht.
Und `viewport`, sonst legt ein Handy die Seite in knapp tausend Punkten Breite aus: Die Regeln
für schmale Bildschirme greifen nicht, und statt der Handy-Ansicht bekommt man die
geschrumpfte Rechner-Ansicht mit Knöpfen, die man nicht trifft. `build.js` bricht ab, wenn
eine der beiden fehlt.

## Tests

```
node test/figuren.js            # Zielfelder der Figuren gegen die Regelkarten
node test/kamera.js             # Kamera: Draufsicht, Perspektive, sichtbare Wände
node test/ansicht.js            # die gezeichnete Szene, ohne Browser
node test/boot.js               # Boot-Regeln gegen die Regelkarte
node test/beute.js              # Beute beim Schlagen
node test/tangolin.js           # Sprungregeln des Tangolins
node test/versorgung.js         # Feldzeichen des Zenturios als zweiter Anker
node test/ki.js                 # KI-Zuggenerierung gegen das Regelwerk
node test/simulate.js 100       # komplette Zufallspartien
node test/kispiel.js 10         # Spielstärke der KI
node test/kispiel.js 8 stark normal   # eigene Paarung
node test/jagd.js 10 normal     # hält der Turm einem gezielten Angriff stand?
node test/blunder.js 6 normal   # stellt die KI ihren Turm ins Schlagfeld?
node test/entscheidung.js 10 normal normal   # endet jede Partie mit einem Sieger?
```

`test/entscheidung.js` spielt komplette Partien bis zum Ende und schlägt fehl, sobald eine
Partie nicht endet oder ohne Sieger ausgeht. Es meldet außerdem, wodurch die Partien
entschieden wurden – so sieht man, ob die Wertung nur die Notbremse ist oder ob die KI
zu oft ins Festfahren läuft.

`test/jagd.js` ist der schärfste Test der KI: Der Gegner läuft stur mit allem auf ihren
Königs-Turm zu und schlägt ihn, sobald er kann. Genau daran scheitert eine KI, die den
Angriff erst bemerkt, wenn er schon vor der Tür steht. Der Test schlägt fehl, sobald die
KI auch nur eine Partie durch einen verlorenen Turm abgibt.

`test/kamera.js` prüft die Kamera rechnerisch: dass die Draufsicht die Identität bleibt,
dass Nahes größer und Fernes kleiner wird, dass die Tiefensortierung der Brettebene folgt und
dass zu jeder Richtung die richtige Hexkante gehört – die Ecken laufen andersherum als die
Richtungen, und wer das verwechselt, hängt vier von sechs Seitenwänden an den falschen
Nachbarn.

`test/ansicht.js` lässt `render.js` in einem winzigen DOM-Gerüst zeichnen – ohne Browser –
und prüft das Ergebnis aus vier Blickwinkeln: jedes Feld wird gezeichnet und bleibt
anklickbar, keine Koordinate ist `NaN`, gemalt wird von hinten nach vorn, aus der Draufsicht
ist keine Seitenwand zu sehen und aus der Schrägsicht schon. Geprüft wird außerdem der
Richtungswähler: sechs Pfeile, jede Richtung genau einmal, die jetzige hervorgehoben, jeder
mit Trefferfläche – und die Figur, um die sie liegen, lässt ihren eigenen Pfeil weg.

`test/ki.js` vergleicht jeden von der KI erzeugten Zug mit `moves.js` – in beide
Richtungen, damit die Suche weder Züge erfindet noch übersieht – und prüft, dass das
Zurücknehmen eines Zuges die Stellung bitgenau wiederherstellt. Der Kettensprung zählt dabei
als eigene Zugart: Die KI hat für ihn eine eigene Suche, und weicht die vom Regelwerk ab,
spielt sie Züge, die es nicht gibt.

`test/tangolin.js` prüft die Sprungregeln gegen die Regelkarte: Über Bäume und eigene
Einheiten geht es weiter, ein Gegner sperrt die Kette ab, besetzte Felder sind keine
Landeplätze, Wasser bleibt unüberwindlich, ein Sprung schlägt nichts – und der Schlag auf das
Nachbarfeld bringt die Beute.

`test/figuren.js` prüft die ausgemessenen Zielfelder von Samurai, Springer und
Bogenschütze – inklusive der Eigenschaft des Samurai, auf einer Farbklasse zu bleiben –
sowie die Bestandsgrenze von einer Figur je Typ samt Neuausbildung nach einem Verlust.

`test/simulate.js` spielt zufällige Partien komplett durch – inklusive Aufbau, Ausbildung und Ausscheiden –
und prüft nach jedem Zug die Invarianten des Spielzustands (keine Figur im Wasser oder auf
einem Baum, kein negatives Holz, genau ein Königs-Turm je aktivem Spieler, höchstens eine
Figur je Typ und Spieler).
