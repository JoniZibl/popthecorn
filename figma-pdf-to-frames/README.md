# PDF → Frames

Figma-Plugin, das PDF-Seiten als **offene, bearbeitbare Frames** importiert —
echte Vektorpfade und echte TextNodes statt eines flachen Bildes.

## Schnellstart

```bash
npm install
npm run build
```

Dann in der **Figma-Desktop-App**: `Plugins → Development → Import plugin from
manifest…` und die `manifest.json` aus diesem Ordner wählen. Beim Entwickeln
`npm run watch` laufen lassen und in Figma über `Plugins → Development → Hot
reload plugin` neu laden.

```bash
npm run typecheck   # tsc über beide Hälften
npm test            # Smoke-Test der UI-Hälfte in Chromium
```

## Die drei Modi

| Modus | Ergebnis | Wofür |
|---|---|---|
| **Vektor** | SVG-Import: Pfade, Gruppen, Text aus dem SVG | Schnellster Weg, gutes Ergebnis für die meisten PDFs |
| **Vektor + echter Text** | Text wird aus dem SVG entfernt und als saubere Figma-TextNodes neu gesetzt | Wenn der Text wirklich editierbar sein soll |
| **Bild** | Ein Bild-Fill pro Seite | Scans, oder wenn ein PDF den Vektorpfad sprengt |

## Wie es funktioniert

Figmas Plugin-Sandbox (QuickJS) hat **kein DOM, kein Canvas und kein `fetch`**.
Das gesamte PDF-Parsing läuft deshalb im UI-iframe — einem echten
Browser-Kontext — und schickt das Ergebnis per `postMessage` an die Sandbox,
die daraus die Nodes baut.

```
ui.html (iframe, DOM)                    code.js (Sandbox, figma API)
┌──────────────────────────┐             ┌──────────────────────────────┐
│ File-Input / Drop        │             │                              │
│ pdf.js: getOperatorList  │  pages[]    │ createNodeFromSvg()          │
│ SVGGraphics → SVG        │ ──────────► │ createText() + loadFontAsync │
│ getTextContent → Runs    │ postMessage │ createImage()                │
│ mergeRuns()              │             │ Gruppen auflösen             │
└──────────────────────────┘             └──────────────────────────────┘
```

| Datei | Aufgabe |
|---|---|
| `src/ui/main.ts` | PDF laden, SVG/PNG/Textläufe erzeugen |
| `src/shared/text.ts` | Text-Fragmente zu Zeilen zusammenfassen |
| `src/shared/svg.ts` | `svg:`-Präfixe entfernen, die Figma nicht mag |
| `src/plugin/code.ts` | Frames, TextNodes und Bild-Fills bauen |
| `src/plugin/fonts.ts` | PDF-Fontnamen auf installierte Figma-Schriften mappen |
| `src/plugin/cleanup.ts` | Einzelkind-Gruppen des SVG-Imports auflösen |
| `scripts/build.mjs` | esbuild + Inlining von pdf.js und Worker in eine `ui.html` |

### Details, die leicht schiefgehen

**Koordinaten.** PDF hat den Ursprung unten links (y nach oben), Figma oben
links (y nach unten). `pdfjsLib.Util.transform(viewport.transform, item.transform)`
erledigt den Flip; selbst rechnen ist die häufigste Fehlerquelle. Der Viewport
wird bewusst mit `scale: 1` erzeugt, damit `item.width` aus `getTextContent()`
zum SVG passt.

**Baseline vs. Oberkante.** PDF liefert die Baseline, Figma positioniert Text
an der Oberkante. `ASCENDER_RATIO = 0.8` in `code.ts` ist die Stellschraube,
falls Text systematisch zu hoch oder zu tief sitzt.

**Text-Fragmente.** pdf.js gibt Text als einzelne Runs aus, oft ein Fragment
pro Kerning-Sprung. Ohne `mergeRuns()` entstehen hunderte Ein-Zeichen-Layer.

**Fonts.** PDFs betten Font-*Subsets* ein, die Figma nicht installieren kann.
`fonts.ts` räumt den Subset-Präfix (`ABCDEF+Helvetica-Bold`) weg und mappt auf
eine installierte Familie; Schriften werden gebündelt vorab geladen, nicht pro
Node.

**pdf.js-Version.** Der SVG-Backend (`SVGGraphics`) wurde in **pdf.js v4
entfernt**. `pdfjs-dist` ist deshalb auf `3.11.174` gepinnt — ein Upgrade auf
v4+ nimmt dem Plugin den Vektorpfad.

**Bundling.** pdf.js wird *nicht* durch esbuild geschickt, sondern als fertige
Distribution in die `ui.html` inlined: der Build enthält ein `require("canvas")`
für Node, an dem sich Bundler verschlucken. Der Worker-Quelltext wird als String
injiziert und zur Laufzeit als Blob-URL gestartet, weil der Figma-iframe keinen
eigenen Origin hat. Dadurch ist `ui.html` ca. 1,5 MB groß.

**`networkAccess`.** Steht auf `["none"]`, weil alles lokal gebündelt ist. Wer
pdf.js stattdessen vom CDN lädt, muss die Domain im Manifest eintragen und
begründen — das verzögert das Review beim Publishing.

## Grenzen

- **Gescannte PDFs** enthalten keinen Text, nur Pixel. Dafür hilft nur der
  Bild-Modus oder OCR (z. B. Tesseract-WASM im iframe).
- **`createNodeFromSvg`** ignoriert SVG-Filter und unterstützt Clip-Paths und
  Blend-Modes nur teilweise. Gradients funktionieren.
- **Layout-Semantik gibt es im PDF nicht.** Auto-Layout, Constraints und
  Komponenten kann kein Importer erraten — das bleibt Handarbeit.
- Der **Smoke-Test deckt nur die UI-Hälfte ab.** Für `src/plugin` gibt es keine
  Laufzeit außerhalb von Figma; dieser Teil muss manuell geprüft werden.

## Vor dem Veröffentlichen

`manifest.json` enthält eine Platzhalter-`id`. Die echte ID vergibt Figma beim
Anlegen des Plugins im Community-Bereich — sie muss vor der Veröffentlichung
eingetragen werden.

## Ohne Plugin

Für Einzelfälle reicht `pdf2svg input.pdf out%d.svg` und Drag & Drop der SVGs
in Figma — dasselbe Ergebnis wie der Vektor-Modus, ohne eine Zeile Code.
