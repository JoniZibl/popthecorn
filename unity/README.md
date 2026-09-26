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

1. Neues Projekt anlegen (3D, URP oder Built-in – die Logik ist es egal).
2. Den Ordner `Assets/Hexodus` in das Projekt kopieren.
3. Fertig. Die Tests lassen sich im Editor über eine dünne NUnit-Hülle laufen
   lassen; die Prüfungen selbst müssen dafür nicht angefasst werden
   (siehe `Tests/Pruef.cs`).

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
| `moves.js` | 447 | offen | – |
| `ai.js` | 1507 | offen | – |
