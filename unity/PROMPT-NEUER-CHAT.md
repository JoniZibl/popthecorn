Ich baue mein Browser-Brettspiel **Hexodus** 1:1 nach Unity um. Der
Unity-Ordner ist in diesem Chat verknüpft. Bitte antworte auf Deutsch.

## Wo was liegt

* **Verknüpft ist das Unity-Projekt** (`Assets/Hexodus/...`). Dort wird
  gearbeitet.
* **Das Original ist das Browser-Spiel**, GitHub
  `JoniZibl/popthecorn`, Branch
  `claude/hexodus-3d-objects-perspectives-8j8kk7`. Darin:
  * `js/` – die JS-Fassung, die Vorlage für die Portierung
  * `test/` – die JS-Tests, die Vorlage für die Prüfungen
  * `unity/` – dieselben C#-Dateien wie lokal, plus `unity/Pruefstand`
    (ein dotnet-Konsolenprojekt, das alles ohne Unity übersetzt und prüft)

  **Hol dir das Repository, bevor du anfängst.** Ohne `js/ai.js` und
  `test/ki.js` lässt sich nichts 1:1 übertragen, und du sollst nicht aus dem
  Gedächtnis raten. Der Stand, den die verknüpften Dateien haben, ist Commit
  `f65e10f`.

## Was schon fertig ist

Das **ganze Regelwerk**, geprüft mit 240 Einzelprüfungen:

| Aus dem Browser-Spiel | Zeilen JS | C# | geprüft |
| --- | --- | --- | --- |
| `hex.js` | 117 | `Runtime/Hex.cs` | ja |
| `units.js` | 132 | `Runtime/Units.cs` | ja |
| `board.js` | 147 | `Runtime/Board.cs` | ja |
| `wetter.js` | 383 | `Runtime/Wetter.cs` | ja |
| `moves.js` | 528 | `Runtime/Moves.cs` | ja |
| `game.js` | 964 | `Runtime/Spielstand.cs` + `Runtime/Ablauf.cs` | ja |
| `ai.js` | 1624 | **offen – das ist die Aufgabe** | – |

Prüfungen: `Tests/GrundlagenTest.cs` (52), `Tests/RegelTest.cs` (99),
`Tests/AblaufTest.cs` (89). Starten in Unity über **Hexodus → Prüfungen
laufen lassen** oder im Test Runner (EditMode, drei Tests). Ohne Unity:
`cd unity/Pruefstand && dotnet run` (braucht .NET 8 SDK).

## Die Aufgabe

`js/ai.js` (1624 Zeilen) nach C# übertragen, als
`Assets/Hexodus/Runtime/KI.cs` (gern auf mehrere Dateien verteilt), und die
Prüfungen aus `test/ki.js`, `test/kispiel.js`, `test/blunder.js`,
`test/jagd.js`, `test/beute.js` und `test/entscheidung.js` mitportieren.

Der Aufbau von `ai.js`, als Wegweiser:

* `geometry()` / `snapshot()` – das Brett und der Spielstand in flachen
  Zahlenfeldern, einmal je Brett bzw. je Zug
* `mk/mvKind/mvFrom/mvTo/mvExtra` – ein Zug als eine bit-gepackte Zahl
* `genMoves()` – der **eigene Zuggenerator** der KI, schnell und kompakt
* `chainSearch()/chainPlanFor()` – Kettensprünge des Tangolins
* `make()/unmake()` – Zug ausführen und zurücknehmen
* `evaluate()` – Stellungsbewertung, `addAttacks()` die Angriffskarte
* `alphabeta()/quiesce()/orderMoves()` – die Suche
* `makeRootSearch()/chooseMoveSliced()` – die Suche in Scheiben, damit der
  Browser nicht einfriert (in Unity wahrscheinlich eher ein Task oder eine
  Coroutine – das darfst du entscheiden und begründen)
* `chooseTree()/chooseKing()/chooseWorker()` – die Aufbauphase

Der Haken `Spielstand.BaumWahl` in `Runtime/Ablauf.cs` wartet schon auf
`chooseTree`.

## Die Regeln, nach denen hier gearbeitet wird

Die sind wichtiger als Geschwindigkeit. Bitte halte sie ein:

1. **Zwei Zuggeneratoren, ein Ergebnis.** Das Regelwerk (`Moves.cs`) und der
   kompakte Generator der KI müssen für jede Stellung **dieselben Züge**
   nennen – auch unter **jeder** Wetterkarte. Genau das prüft `test/ki.js`
   Zug für Zug. Diese Prüfung ist die wichtigste der ganzen Portierung: Sie
   hat in der JS-Fassung einen echten Fehler gefunden (die KI hatte die
   Wetterkarte aus ihrer Stellungs-Kennung weggelassen und fand deshalb ihre
   eigenen Wiederholungen nicht). Portiere sie **zuerst**, nicht zuletzt.
2. **Sollwerte kommen aus der JS-Fassung, nie aus dem C#-Code.** Sonst prüft
   sich die Portierung nur selbst. Wo eine Zahl oder Zeichenkette gleich sein
   muss, lass beide Fassungen laufen und vergleiche die Ausgabe – und schreib
   den JS-Wert als Sollwert in den Test.
3. **Prüfungen müssen beißen.** Nach jedem Stück: bau absichtlich einen
   Fehler ein und sieh nach, ob Prüfungen umfallen. Wenn keine umfällt,
   prüft der Test nichts. Sag mir jeweils, welche Mutationen du probiert hast
   und wie viele Prüfungen sie erkannt haben.
4. **`Runtime/` kennt kein UnityEngine.** `Hexodus.Runtime.asmdef` steht auf
   `noEngineReferences: true`, und das soll so bleiben – Regeln und
   Computergegner sind Rechnerei, kein Szenengraph. Braucht die KI etwas vom
   Editor oder von der Engine, kommt ein Haken (`Action`/`Func`) hinein, den
   die Außenseite füllt. So macht es `Pruef.Ausgabe` und
   `Spielstand.BaumWahl` schon.
5. **Eine Fassung der Prüfungen, zwei Startknöpfe.** Die Prüfungen in
   `Tests/` kennen weder NUnit noch Unity. `Tests/Editor/NUnitHuelle.cs` und
   `Tests/Menue/PruefMenue.cs` hängen nur davor. Neue Prüfklassen dort
   eintragen, nicht doppelt schreiben.
6. **Feste Startwerte.** Wo gewürfelt wird, `Zufall.Startwert(...)` setzen.
   Eine Prüfung, die bei jedem Lauf etwas anderes spielt, ist keine Prüfung.
7. **Deutsche Bezeichner und deutsche Kommentare**, wie im vorhandenen Code.
   Kommentare erklären *warum*, nicht *was*. Feldnamen bleiben so dicht an
   der JS-Fassung wie möglich (nur groß geschrieben), damit man beide
   nebeneinanderlegen kann.

## Spielregeln, die man leicht falsch portiert

* **Das Wetter-Taktwerk.** Die Regel steht auf keiner Karte:

  ```
  klar → ein Schlag deckt eine Karte auf → eine volle Runde ohne Wirkung
       → zwei volle Runden Wetter → klar
  ```

  Gezählt wird in **Zügen**, nicht in Rundennummern: Nach Rundennummern
  gerechnet träfe eine Karte, die der letzte Spieler der Reihe aufdeckt,
  seinen Nachbarn ohne jede Vorwarnung. Solange eine Karte aufzieht oder
  gilt, dreht **kein** weiterer Schlag daran.
* **Eine Partie endet nur, wenn alle Königs-Türme außer einem gefallen
  sind.** Kein Ende durch Wiederholung oder Zugzahl. Die einzige Ausnahme:
  reihum hat niemand mehr einen Zug. `sinceProgress` und `history` gibt es
  weiterhin, aber **nur** als Hinweis für die Suche der KI, damit sie in
  festgefahrenen Stellungen den Durchbruch sucht statt Figuren zu schieben.
* **Die Stellungs-Kennung muss zeichengleich mit `js/game.js` bleiben.**
  `Spielstand.PositionKey()` ist schon so, und `AI.positionKeyOf()` muss
  dazu passen – inklusive der offenen Wetterkarte am Ende.
* **Das Standardspiel bleibt unberührt.** Die Wetterkarten sind ein eigener
  Spielmodus. Ohne ihn darf sich nichts anders verhalten.

## Was ich nicht will

* **`js/scene.js`, `js/render.js` und `js/ui.js` nicht übertragen.** Das sind
  eine handgebaute Lochkamera, ein Maler-Algorithmus und die
  Browser-Bedienung – Unity hat das eingebaut. Übernommen wird später die
  **Anmutung** (Plattendicke, Erdkanten, tieferliegendes Wasser,
  Figurenformen, Kampfspuren), nicht die Mathematik dahinter.
* **Die Idee „Nachschub teilen" nicht einbauen.** Sie ist vorgemerkt, aber
  bewusst nicht umgesetzt. Bitte nur erinnern, nichts dazu schreiben.
* **Nichts öffentlich hosten.**

## Wie ich arbeiten möchte

Fang mit dem Fundament der KI an – Momentaufnahme, Zugpackung,
Zuggenerierung – und portiere sofort `test/ki.js` dazu, damit der
Gleichschritt mit `Moves.cs` von der ersten Zeile an belegt ist. Erst danach
Bewertung und Suche.

Sag mir nach jedem Stück: was portiert ist, wie viele Prüfungen laufen,
welche Mutationen du probiert hast und was sie erkannt haben. Wenn etwas
nicht stimmt, schreib es hin statt es abzurunden.
