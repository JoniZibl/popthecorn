# Hexodus in Unity

Die Übertragung des Browser-Spiels nach C#. Der Stand: **die Spiel-Logik wird
hier portiert und geprüft, bevor sie je einen Editor sieht.**

## Was hier liegt

```
Assets/Hexodus/Runtime/     die Spiel-Logik als reines C#
Assets/Hexodus/Tests/       die portierten Prüfungen
Pruefstand/                 übersetzt und prüft beides ohne Unity
```

`Runtime/` hat **keine Abhängigkeit zu UnityEngine**. Das ist Absicht: Regeln
und Computergegner sind Rechnerei, kein Szenengraph. Dadurch lässt sich alles
auf der Kommandozeile übersetzen und prüfen – und im Editor liegt später nur
noch das, was wirklich Unity braucht: Szene, Prefabs, Kamera, Eingabe.

## Prüfen, ohne Unity zu öffnen

```bash
cd unity/Pruefstand
dotnet run
```

Endet mit Rückgabewert 1, sobald eine Prüfung fehlschlägt.

## In Unity aufmachen

Dieser Ordner **ist** das Unity-Projekt, sobald `ProjectSettings/` und
`Packages/` daneben liegen. Wer schon ein leeres Projekt angelegt hat,
kopiert von dort genau diese zwei Ordner hierher – sie enthalten die
Unity-Version und die Paketliste, also das, was Unity selbst erzeugt hat.
Danach in Unity Hub *Add project from disk* auf diesen Ordner zeigen.

Von da an reicht ein `git pull`, um neuen Code zu bekommen – nichts muss
mehr von Hand kopiert werden.

### Die drei Assemblies

| Assembly | Wo | Was |
| --- | --- | --- |
| `Hexodus.Runtime` | `Assets/Hexodus/Runtime` | Regeln und Computergegner |
| `Hexodus.Tests` | `Assets/Hexodus/Tests` | die Prüfungen, nur im Editor |
| `Hexodus.Tests.Editor` | `Assets/Hexodus/Tests/Editor` | die NUnit-Hülle für den Test Runner |

`Hexodus.Runtime` steht auf `noEngineReferences: true`. Das ist keine Kosmetik:
Unity weigert sich damit zu übersetzen, sobald jemand `using UnityEngine` in
die Logik schreibt. Die Trennung, von der die ganze Portierung lebt, wird so
vom Editor bewacht statt von der Disziplin.

Die Prüfungen laufen in beiden Welten aus **einer** Quelle: im Test Runner
über die Hülle in `Tests/Editor`, auf der Kommandozeile über `Pruefstand`.
Zwei Fassungen liefen mit der Zeit auseinander.

## Was aus dem Browser-Spiel *nicht* übernommen wird

`js/scene.js` und `js/render.js` – 991 Zeilen, die eine Lochkamera, einen
Maler-Algorithmus und Aufsteller von Hand nachbauen. Unity hat das eingebaut.
Übernommen wird die **Anmutung** (Plattendicke, Erdkanten, tieferliegendes
Wasser, die Figurenformen, die Kampfspuren), nicht die Mathematik dahinter.

Ebenso `js/ui.js` – die Bedienung wird in Unity neu gebaut.

## Stand der Portierung

| Aus dem Browser-Spiel | Zeilen JS | C# | Geprüft |
| --- | --- | --- | --- |
| `hex.js` | 117 | `Hex.cs` | ja |
| `units.js` | 132 | `Units.cs` | ja |
| `board.js` | 147 | `Board.cs` | ja |
| `wetter.js` | 349 | `Wetter.cs` | ja |
| `game.js` (Zustand, Mannschaften) | ~200 | `Spielstand.cs` | teilweise |
| `game.js` (Ablauf) | ~540 | offen | – |
| `moves.js` | 447 | `Moves.cs` | ja |
| `ai.js` | 1507 | offen | – |
