/* Hexodus – Spielfeld aus zufällig angelegten 7er-Hexagon-Plättchen

   Wörtliche Übertragung von js/board.js.

   Ein Feld ist eine Klasse und kein Wertetyp: Das ganze Regelwerk hält
   Verweise darauf und schreibt hinein (Figur setzen, Baum fällen, Boot
   ablegen). Mit einem struct wäre jede Zuweisung eine Kopie, und die Hälfte
   der Züge liefe ins Leere. */
using System;
using System.Collections.Generic;

namespace Hexodus
{
    public enum Gelaende { Gras, Wasser }

    /// <summary>Eine Figur auf dem Brett. Gehört dem Feld, auf dem sie steht.</summary>
    public sealed class Figur
    {
        public Einheit Type;
        public int Owner;
        public int Facing;

        public Figur(Einheit type, int owner, int facing = 0)
        {
            Type = type; Owner = owner; Facing = facing;
        }

        public Figur Kopie() { return new Figur(Type, Owner, Facing); }
    }

    public sealed class Cell
    {
        public int Q;
        public int R;
        public Gelaende Terrain;
        public bool Tree;
        public bool Boat;
        public Figur Piece;
        public int Rim;                    // 0 = Plättchen, 1/2 = Wasserrand

        /* Spuren des Kampfes: Wo eine Figur fällt, bleibt etwas von ihr liegen –
           gespeichert wird nur, wem sie gehörte. Wo die Splitter liegen, rechnet
           die Anzeige aus den Koordinaten aus. */
        public List<int> Scars;

        public Cell(int q, int r, Gelaende terrain)
        {
            Q = q; R = r; Terrain = terrain;
        }

        public Axial Pos { get { return new Axial(Q, R); } }
        public string Key { get { return Hex.Key(Q, R); } }

        public static implicit operator Axial(Cell c) { return new Axial(c.Q, c.R); }
    }

    public sealed class Board
    {
        public Dictionary<string, Cell> Cells = new Dictionary<string, Cell>();
        public List<string> Keys = new List<string>();
        public List<int[]> Tiles = new List<int[]>();

        /* Mannschaften und Wetter hängen am Brett, nicht nur am Spielstand:
           Das Zugerzeugen bekommt nur das Brett zu sehen und muss trotzdem
           wissen, wer mit wem spielt und was gerade gilt. */
        public int[] Teams;
        public Wetterlage Wetter = Wetterlage.Neutral;

        public Cell Get(int q, int r)
        {
            Cell c;
            return Cells.TryGetValue(Hex.Key(q, r), out c) ? c : null;
        }

        public Cell At(Axial a) { return Get(a.Q, a.R); }

        public IEnumerable<Cell> Alle()
        {
            foreach (var k in Keys) yield return Cells[k];
        }

        public List<Cell> LandCells()
        {
            var aus = new List<Cell>();
            foreach (var c in Alle()) if (c.Terrain == Gelaende.Gras) aus.Add(c);
            return aus;
        }

        /// <summary>Freies Grasfeld: kein Baum, keine Figur.</summary>
        public static bool IsFree(Cell c)
        {
            return c != null && c.Terrain == Gelaende.Gras && !c.Tree && c.Piece == null;
        }

        // ---------------- Erzeugen ----------------

        /* Legt `tileCount` Plättchen kompakt aneinander. Jedes Plättchen ist
           eine "Blume" aus 7 Hexfeldern; die Mittelpunkte liegen auf einem
           eigenen Dreiecksgitter (Hex.TileDirs). */
        private static List<int[]> LayoutTiles(int tileCount)
        {
            var centers = new List<int[]> { new[] { 0, 0 } };
            var used = new HashSet<string> { "0,0" };

            while (centers.Count < tileCount)
            {
                var cands = new Dictionary<string, int>();
                foreach (var c in centers)
                {
                    foreach (var d in Hex.TileDirs)
                    {
                        var nq = c[0] + d[0];
                        var nr = c[1] + d[1];
                        var k = Hex.Key(nq, nr);
                        if (used.Contains(k)) continue;
                        cands[k] = cands.ContainsKey(k) ? cands[k] + 1 : 1;  // Nachbarzahl = Kompaktheit
                    }
                }
                if (cands.Count == 0) break;
                var best = 0;
                foreach (var v in cands.Values) if (v > best) best = v;
                var beste = new List<string>();
                foreach (var p in cands) if (p.Value == best) beste.Add(p.Key);
                var gewaehlt = Zufall.Waehle(beste);
                used.Add(gewaehlt);
                var a = Hex.ParseKey(gewaehlt);
                centers.Add(new[] { a.Q, a.R });
            }
            return centers;
        }

        /// <summary>Verteilt zusammenhängende Wasserfelder innerhalb eines Plättchens.</summary>
        private static List<Axial> WaterForTile(List<Axial> cells)
        {
            var menge = Zufall.Waehle(new[] { 0, 0, 1, 1, 2, 2, 2, 3 });
            var chosen = new List<Axial>();
            if (menge == 0) return chosen;
            chosen.Add(cells[Zufall.Naechste(cells.Count)]);
            while (chosen.Count < menge)
            {
                var options = new List<Axial>();
                foreach (var c in cells)
                {
                    var drin = false;
                    foreach (var x in chosen) if (Hex.Gleich(x, c)) { drin = true; break; }
                    if (drin) continue;
                    foreach (var x in chosen)
                    {
                        if (Hex.Distance(x, c) == 1) { options.Add(c); break; }
                    }
                }
                if (options.Count == 0) break;
                chosen.Add(Zufall.Waehle(options));
            }
            return chosen;
        }

        /* Wasserrand: Nach dem Legen der Plättchen bekommt das Brett ringsum
           zwei Reihen Wasser. Es hört damit nicht an einer geraden Kante auf,
           sondern liegt als Insel im Meer.

           Erst wird die ganze Reihe gesammelt und dann gesetzt: Wer die neuen
           Felder sofort einträgt, findet sie im selben Durchlauf wieder als
           Nachbarn und wächst statt einer Reihe gleich ins Uferlose. */
        private const int RandRinge = 2;

        private void AddWaterRim(int ringe)
        {
            for (var r = 0; r < ringe; r++)
            {
                var neu = new List<Axial>();
                foreach (var k in new List<string>(Cells.Keys))
                {
                    foreach (var nb in Hex.Neighbors(Cells[k]))
                    {
                        if (!Cells.ContainsKey(Hex.Key(nb))) neu.Add(nb);
                    }
                }
                foreach (var a in neu)
                {
                    var k = Hex.Key(a);
                    if (Cells.ContainsKey(k)) continue;
                    var c = new Cell(a.Q, a.R, Gelaende.Wasser) { Rim = r + 1 };
                    Cells[k] = c;
                }
            }
        }

        public static Board Generate(int tileCount)
        {
            var board = new Board();
            board.Tiles = LayoutTiles(tileCount);
            foreach (var c in board.Tiles)
            {
                var tile = Hex.TileCells(c);
                var water = WaterForTile(tile);
                foreach (var feld in tile)
                {
                    var istWasser = false;
                    foreach (var w in water) if (Hex.Gleich(w, feld)) { istWasser = true; break; }
                    board.Cells[Hex.Key(feld)] =
                        new Cell(feld.Q, feld.R, istWasser ? Gelaende.Wasser : Gelaende.Gras);
                }
            }
            board.AddWaterRim(RandRinge);
            board.Keys = new List<string>(board.Cells.Keys);
            return board;
        }
    }

    /* Zufall an einer Stelle. In js/board.js steckt Math.random direkt im Code;
       hier hängt er an einem Startwert, damit eine Prüfung dieselbe Insel
       zweimal erzeugen kann. Ohne gesetzten Startwert ist es echter Zufall
       wie zuvor. */
    public static class Zufall
    {
        private static Random _r = new Random();

        public static void Startwert(int seed) { _r = new Random(seed); }
        public static void Echt() { _r = new Random(); }

        public static int Naechste(int n) { return _r.Next(n); }
        public static double Bruch() { return _r.NextDouble(); }

        public static T Waehle<T>(IList<T> liste) { return liste[_r.Next(liste.Count)]; }

        public static void Mischen<T>(IList<T> liste)
        {
            for (var i = liste.Count - 1; i > 0; i--)
            {
                var j = _r.Next(i + 1);
                var t = liste[i]; liste[i] = liste[j]; liste[j] = t;
            }
        }
    }
}
