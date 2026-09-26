/* Prüft das Regelwerk (Moves.cs) gegen dieselben Stellungen, die auch die
   JS-Fassung prüft: test/figuren.js, test/boot.js, test/tangolin.js,
   test/versorgung.js und die Regelteile von test/wetter.js.

   Die erwarteten Zielfelder stehen als Zahlen da – abgelesen von den
   Regelkarten, nicht aus dem C#-Code erzeugt. Nur so prüft die Portierung
   nicht bloß sich selbst.

   Was hier fehlt, sind die Prüfungen, die einen Zug *ausführen*
   (Holz bezahlen, Beute, Extra-Züge): die brauchen Game.cs und kommen
   mit ihm. */
using System.Collections.Generic;
using System.Linq;

namespace Hexodus.Tests
{
    public static class RegelTest
    {
        public static void Alles()
        {
            Samurai();
            Springer();
            Bogenschuetze();
            Boote();
            Tangolin();
            Nachschub();
            WetterRegeln();
            Bestandsgrenze();
        }

        // ---------------- Werkstatt ----------------

        /* Rechteckiges Grasbrett – dieselbe Werkstatt wie brett() in den
           JS-Tests: von (-1,-1) bis (breite, hoehe). */
        private static Board Brett(int breite, int hoehe)
        {
            var b = new Board();
            for (var q = -1; q <= breite; q++)
            {
                for (var r = -1; r <= hoehe; r++)
                {
                    var c = new Cell(q, r, Gelaende.Gras);
                    b.Cells[c.Key] = c;
                    b.Keys.Add(c.Key);
                }
            }
            return b;
        }

        /// <summary>Quadratisches Brett um (0,0) – wie emptyBoard() in test/figuren.js.</summary>
        private static Board Leer(int radius)
        {
            var b = new Board();
            for (var q = -radius; q <= radius; q++)
            {
                for (var r = -radius; r <= radius; r++)
                {
                    var c = new Cell(q, r, Gelaende.Gras);
                    b.Cells[c.Key] = c;
                    b.Keys.Add(c.Key);
                }
            }
            return b;
        }

        private static Cell F(Board b, int q, int r) { return b.Cells[Hex.Key(q, r)]; }

        private static Cell Stelle(Board b, int q, int r, Einheit typ, int spieler = 0, int facing = 0)
        {
            var c = F(b, q, r);
            c.Piece = new Figur(typ, spieler, facing);
            return c;
        }

        private static void Baum(Board b, int q, int r) { F(b, q, r).Tree = true; }
        private static Cell Wasser(Board b, int q, int r)
        {
            var c = F(b, q, r); c.Terrain = Gelaende.Wasser; return c;
        }

        /// <summary>Alle Ziele einer Figur als "q,r" – sortiert, damit der Vergleich stabil ist.</summary>
        private static string Ziele(Board b, Cell cell, int wood = 0)
        {
            var aus = Moves.ForPiece(b, cell, wood).Select(a => a.Key).ToList();
            aus.Sort();
            return string.Join(" ", aus);
        }

        /// <summary>Alle Aktionen als "art:q,r" – wie zuege() in test/wetter.js.</summary>
        private static List<string> Zuege(Board b, int q, int r, int wood = 5)
        {
            return Moves.ForPiece(b, F(b, q, r), wood)
                        .Select(a => a.Kind + ":" + a.Key).ToList();
        }

        private static string Sortiert(params string[] felder)
        {
            var l = felder.ToList(); l.Sort(); return string.Join(" ", l);
        }

        private static Aktion Suche(Board b, Cell von, int wood, string kind, int q, int r)
        {
            return Moves.ForPiece(b, von, wood)
                        .FirstOrDefault(a => a.Kind == kind && a.Q == q && a.R == r);
        }

        /// <summary>Ein Spielstand, der nur Brett, Holz und Wetter mitbringt.</summary>
        private static Spielstand Zustand(Board board, int holz = 5)
        {
            var st = Spielstand.Create(new[] { "Eins", "Zwei" }, null, null, true);
            st.Board = board;
            st.Phase = Phase.Play;
            st.Current = 0;
            st.Players[0].Wood = holz;
            st.Players[1].Wood = holz;
            return st;
        }

        private static void SetzeWetter(Spielstand st, string id)
        {
            st.Board.Wetter = Wetter.WirkungVon(id);
            st.Karte = id;
        }

        private static string Felder(Board board, int p)
        {
            var aus = Moves.TrainingSpots(board, p).Select(c => c.Key).ToList();
            aus.Sort();
            return string.Join(" ", aus);
        }

        private static bool Hat(List<string> liste, string was) { return liste.Contains(was); }

        // ---------------- Samurai ----------------

        private static void Samurai()
        {
            Pruef.Titel("Samurai – die 6 Diagonalen");

            var b = Leer(6);
            var s = Stelle(b, 0, 0, Einheit.Samurai);
            var soll = Sortiert("2,-1", "1,-2", "-1,-1", "-2,1", "-1,2", "1,1");
            Pruef.Gleich("Zielfelder", Ziele(b, s), soll);

            var eineKlasse = Moves.ForPiece(b, s, 0)
                .All(a => ((a.Q - a.R) % 3 + 3) % 3 == 0);
            Pruef.Ok(eineKlasse, "bleibt auf einer Farbklasse");

            // Baum in Richtung Südost, Wasser in Richtung Nordost
            Baum(b, 1, 0);
            Wasser(b, 1, -1);
            Pruef.Gleich("springt über Baum und Wasser hinweg", Ziele(b, s), soll);
        }

        // ---------------- Springer ----------------

        private static void Springer()
        {
            Pruef.Titel("Springer – zwei benachbarte Richtungen, 2 und 3 Felder weit");

            var b = Leer(6);
            var s = Stelle(b, 0, 0, Einheit.Springer);
            Pruef.Gleich("Keil SO+NO", Ziele(b, s), Sortiert("2,0", "3,0", "2,-2", "3,-3"));

            s.Piece.Facing = 1;
            Pruef.Gleich("Keil NO+N", Ziele(b, s), Sortiert("2,-2", "3,-3", "0,-2", "0,-3"));

            s.Piece.Facing = 0;
            var weiten = Moves.ForPiece(b, s, 0)
                .Select(a => Hex.Distance(new Axial(0, 0), new Axial(a.Q, a.R))).ToList();
            weiten.Sort();
            Pruef.Gleich("nur Distanz 2 und 3", string.Join(",", weiten), "2,2,3,3");

            // Dazwischen eine fremde Figur, das Zwischenfeld Wasser
            Stelle(b, 1, 0, Einheit.Worker, 1);
            Wasser(b, 2, -1);
            Pruef.Gleich("springt über besetzte Felder hinweg", Ziele(b, s),
                         Sortiert("2,0", "3,0", "2,-2", "3,-3"));

            var b2 = Leer(6);
            var s2 = Stelle(b2, 0, 0, Einheit.Springer);
            Stelle(b2, 2, 0, Einheit.Worker, 0);
            Pruef.Gleich("eigene Figur blockiert nur das Zielfeld", Ziele(b2, s2),
                         Sortiert("3,0", "2,-2", "3,-3"));
        }

        // ---------------- Bogenschütze ----------------

        private static void Bogenschuetze()
        {
            Pruef.Titel("Bogenschütze – Schuss auf Distanz 2 in den 6 Geraden");

            var b = Leer(6);
            var a = Stelle(b, 0, 0, Einheit.Archer);
            foreach (var d in Hex.Dirs) Stelle(b, d[0] * 2, d[1] * 2, Einheit.Worker, 1);

            var schuesse = Moves.ForPiece(b, a, 0)
                .Where(x => x.Kind == "shoot").Select(x => x.Key).ToList();
            schuesse.Sort();
            Pruef.Gleich("Schussfelder", string.Join(" ", schuesse),
                         Sortiert("2,0", "2,-2", "0,-2", "-2,0", "-2,2", "0,2"));
        }

        // ---------------- Boote ----------------

        /// <summary>Land-Wasser-Bahn entlang Richtung 0 – wie bahn() in test/boot.js.</summary>
        private static Board Bahn(string muster)
        {
            var b = new Board();
            for (var i = 0; i < muster.Length; i++)
            {
                var c = new Cell(i, 0, muster[i] == 'W' ? Gelaende.Wasser : Gelaende.Gras);
                b.Cells[c.Key] = c; b.Keys.Add(c.Key);
            }
            for (var r = -1; r <= 1; r += 2)
            {
                for (var i = 0; i < muster.Length; i++)
                {
                    var c = new Cell(i, r, Gelaende.Gras);
                    b.Cells[c.Key] = c; b.Keys.Add(c.Key);
                }
            }
            return b;
        }

        private static void Boote()
        {
            Pruef.Titel("Boote – Wasser kostet Holz (Beispiel der Regelkarte)");

            var b = Bahn("LWL");
            var start = Stelle(b, 0, 0, Einheit.Worker);
            var aufsWasser = Suche(b, start, 3, "move", 1, 0);
            Pruef.Ok(aufsWasser != null, "Arbeiter darf aufs Wasser");
            Pruef.Gleich("und zahlt 1 Holz dafür", aufsWasser == null ? -1 : aufsWasser.Cost, 1);
            Pruef.Ok(Suche(b, start, 0, "move", 1, 0) == null, "ohne Holz kein Wasser");

            F(b, 1, 0).Boat = true;
            var mitBoot = Suche(b, start, 0, "move", 1, 0);
            Pruef.Ok(mitBoot != null && mitBoot.Cost == 0, "vorhandenes Boot ist gratis");

            // Zenturio quert zwei Wasserabschnitte: 2 Holz (Beispiel der Karte)
            var b2 = Bahn("LWLWL");
            var z = Stelle(b2, 0, 0, Einheit.Zenturio);
            Pruef.Gleich("Zenturio: 1. Wasserfeld kostet 1", Kosten(b2, z, 5, 1), 1);
            Pruef.Gleich("Zenturio: Land dahinter kostet 1", Kosten(b2, z, 5, 2), 1);
            Pruef.Gleich("Zenturio: 2. Wasserabschnitt kostet 2", Kosten(b2, z, 5, 3), 2);
            Pruef.Gleich("Zenturio: Ziel dahinter kostet 2", Kosten(b2, z, 5, 4), 2);
            Pruef.Gleich("mit 1 Holz nur bis zum ersten Abschnitt", Kosten(b2, z, 1, 3), -1);

            /* Der Bootsplan sagt, wo die Boote liegen bleiben – Game.cs setzt
               sie später danach. Die Zahlen sind dieselben wie in test/boot.js. */
            var ziel = Suche(b2, z, 5, "move", 4, 0);
            var plan = Moves.WaterPlan(b2, z.Piece, z, F(b2, 4, 0));
            Pruef.Ok(ziel != null, "der Weg bis ans andere Ende steht zur Wahl");
            Pruef.Gleich("der Plan kostet 2 Boote", plan.Cost, 2);
            Pruef.Gleich("und legt sie auf die zwei Wasserfelder",
                         string.Join(" ", plan.Drops.Select(c => c.Key)), "1,0 3,0");
            Pruef.Ok(!plan.EndOnWater, "am Ziel steht er an Land");

            // Auf dem Wasser stehen bleiben: das Boot liegt unter der Figur
            var b3 = Bahn("LWL");
            var w = Stelle(b3, 0, 0, Einheit.Worker);
            var rein = Moves.WaterPlan(b3, w.Piece, w, F(b3, 1, 0));
            Pruef.Ok(rein.EndOnWater, "das Zielfeld auf dem Wasser braucht ein Boot");
            Pruef.Gleich("es kostet 1 Holz", rein.Cost, 1);

            // Rückweg an Land ist gratis, das Boot bleibt liegen
            var aufWasser = F(b3, 1, 0);
            aufWasser.Boat = true;
            aufWasser.Piece = w.Piece;
            w.Piece = null;
            var raus = Suche(b3, aufWasser, 0, "move", 2, 0);
            Pruef.Ok(raus != null && raus.Cost == 0, "Rückweg an Land ist gratis");
        }

        private static int Kosten(Board b, Cell von, int wood, int q)
        {
            var a = Suche(b, von, wood, "move", q, 0);
            return a == null ? -1 : a.Cost;
        }

        // ---------------- Tangolin ----------------

        private static void Tangolin()
        {
            Pruef.Titel("Tangolin – Sprungbretter, Ketten und Boote");

            // Über einen Gegner springt er nicht
            var b1 = Brett(6, 3);
            var t1 = Stelle(b1, 0, 0, Einheit.Tangolin);
            Stelle(b1, 1, 0, Einheit.Samurai, 1);
            Pruef.Ok(Suche(b1, t1, 0, "jump", 2, 0) == null,
                     "das Feld hinter dem Gegner ist nicht erreichbar");
            Pruef.Ok(Suche(b1, t1, 0, "capture", 1, 0) != null,
                     "den Gegner nebenan schlägt er aber");

            // Eigene Figuren und Bäume sind Sprungbretter
            var b2 = Brett(6, 3);
            var t2 = Stelle(b2, 0, 0, Einheit.Tangolin);
            Stelle(b2, 1, 0, Einheit.Worker, 0);
            Baum(b2, 0, 1);
            Pruef.Ok(Suche(b2, t2, 0, "jump", 2, 0) != null, "über die eigene Figur geht es weiter");
            Pruef.Ok(Suche(b2, t2, 0, "jump", 0, 2) != null, "über den Baum ebenso");

            // Auf dem Gegner landet er – und schlägt ihn
            var b3 = Brett(8, 4);
            var t3 = Stelle(b3, 0, 0, Einheit.Tangolin);
            Stelle(b3, 1, 0, Einheit.Worker, 0);
            Stelle(b3, 2, 0, Einheit.Archer, 1);
            var s3 = Suche(b3, t3, 0, "jump", 2, 0);
            Pruef.Ok(s3 != null, "der Sprung auf den Gegner steht zur Wahl");
            Pruef.Gleich("und nennt ihn als Beute",
                         s3 == null ? "" : string.Join(" ", s3.Captures), "2,0");

            // Eine Kette nimmt mehrere Gegner mit
            var b4 = Brett(10, 4);
            var t4 = Stelle(b4, 0, 0, Einheit.Tangolin);
            Baum(b4, 1, 0);
            Stelle(b4, 2, 0, Einheit.Samurai, 1);
            Stelle(b4, 3, 0, Einheit.Worker, 0);
            Stelle(b4, 4, 0, Einheit.Springer, 1);
            var kette = Suche(b4, t4, 0, "jump", 4, 0);
            Pruef.Ok(kette != null, "das Ende der Kette ist erreichbar");
            if (kette != null)
            {
                var beute = kette.Captures.ToList(); beute.Sort();
                Pruef.Gleich("beide Gegner fallen", string.Join(" ", beute), "2,0 4,0");
                Pruef.Gleich("der Weg nennt beide Landungen",
                             string.Join(" ", kette.Path), "2,0 4,0");
            }

            // Auf der eigenen Seite landet er nicht
            var b5 = Brett(6, 3);
            var t5 = Stelle(b5, 0, 0, Einheit.Tangolin);
            Stelle(b5, 1, 0, Einheit.Worker, 0);
            Stelle(b5, 2, 0, Einheit.Legionaer, 0);
            Pruef.Ok(Suche(b5, t5, 0, "jump", 2, 0) == null, "das eigene Landefeld ist belegt");

            // Ins Wasser springt er, wenn er ein Boot bezahlt
            var b6 = Brett(6, 3);
            var t6 = Stelle(b6, 0, 0, Einheit.Tangolin);
            Baum(b6, 1, 0);
            Wasser(b6, 2, 0);
            Pruef.Ok(Suche(b6, t6, 0, "jump", 2, 0) == null, "ohne Holz geht es nicht");
            var s6 = Suche(b6, t6, 1, "jump", 2, 0);
            Pruef.Ok(s6 != null, "mit einem Holz schon");
            Pruef.Gleich("und kostet genau ein Boot", s6 == null ? -1 : s6.Cost, 1);

            // Wo schon ein Boot liegt, kostet es nichts
            var b7 = Brett(6, 3);
            var t7 = Stelle(b7, 0, 0, Einheit.Tangolin);
            Baum(b7, 1, 0);
            Wasser(b7, 2, 0).Boat = true;
            var s7 = Suche(b7, t7, 0, "jump", 2, 0);
            Pruef.Ok(s7 != null, "auch ohne Holz erreichbar");
            Pruef.Ok(s7 != null && s7.Cost == 0, "und ohne Kosten");

            // Zwei Wasserlandungen kosten zwei Boote
            var b8 = Brett(8, 4);
            var t8 = Stelle(b8, 0, 0, Einheit.Tangolin);
            Baum(b8, 1, 0); Wasser(b8, 2, 0);
            Baum(b8, 3, 0); Wasser(b8, 4, 0);
            Pruef.Ok(Suche(b8, t8, 1, "jump", 4, 0) == null, "mit einem Holz reicht es nicht bis hinten");
            var s8 = Suche(b8, t8, 2, "jump", 4, 0);
            Pruef.Ok(s8 != null, "mit zwei Holz schon");
            Pruef.Gleich("zwei Boote", s8 == null ? -1 : s8.Cost, 2);

            // Ein Sprung über einen Verbündeten im Boot ist erlaubt
            var b10 = Brett(6, 3);
            b10.Teams = new[] { 0, 0 };
            var t10 = Stelle(b10, 0, 0, Einheit.Tangolin);
            Wasser(b10, 1, 0).Boat = true;
            Stelle(b10, 1, 0, Einheit.Samurai, 1);
            Pruef.Ok(Suche(b10, t10, 0, "jump", 2, 0) != null, "über einen Verbündeten im Boot hinweg");
        }

        // ---------------- Nachschub ----------------

        private static void Nachschub()
        {
            Pruef.Titel("Der Zenturio versorgt sein eigenes Lager");

            var b1 = Brett(12, 3);
            Stelle(b1, 0, 0, Einheit.King);
            Stelle(b1, 8, 0, Einheit.Zenturio);
            var f1 = Felder(b1, 0).Split(' ');
            Pruef.Ok(f1.Contains("9,0"), "neben dem Zenturio darf ausgebildet werden");
            Pruef.Ok(f1.Contains("1,0"), "neben dem Turm weiterhin auch");
            Pruef.Ok(!f1.Contains("5,0"), "im Niemandsland dazwischen nicht");

            var b2 = Brett(12, 3);
            Stelle(b2, 0, 0, Einheit.King);
            Stelle(b2, 8, 0, Einheit.Zenturio);
            Stelle(b2, 9, 0, Einheit.Samurai);
            Pruef.Ok(Felder(b2, 0).Split(' ').Contains("10,0"),
                     "was am Zenturio hängt, ist mitversorgt");

            var b3 = Brett(12, 3);
            Stelle(b3, 0, 0, Einheit.King);
            Stelle(b3, 8, 0, Einheit.Archer);
            Pruef.Ok(!Felder(b3, 0).Split(' ').Contains("9,0"),
                     "ohne Feldzeichen bleibt das Feld unversorgt");

            var b4 = Brett(12, 3);
            Stelle(b4, 0, 0, Einheit.King);
            Stelle(b4, 8, 0, Einheit.Zenturio, 1);
            Stelle(b4, 5, 3, Einheit.King, 1);
            Pruef.Ok(!Felder(b4, 0).Split(' ').Contains("9,0"), "fremdes Feldzeichen versorgt nicht");

            // Fällt das Feldzeichen, ist der Nachschub weg
            var b6 = Brett(12, 3);
            Stelle(b6, 0, 0, Einheit.King);
            Stelle(b6, 8, 0, Einheit.Zenturio);
            Pruef.Ok(Felder(b6, 0).Split(' ').Contains("9,0"), "mit Zenturio versorgt");
            F(b6, 8, 0).Piece = null;
            Pruef.Ok(!Felder(b6, 0).Split(' ').Contains("9,0"), "ohne ihn nicht mehr");
        }

        // ---------------- Wetter im Regelwerk ----------------

        private static void WetterRegeln()
        {
            Pruef.Titel("Frost – das Wasser trägt umsonst");
            var b1 = Brett(8, 4);
            Stelle(b1, 2, 2, Einheit.Worker);
            Wasser(b1, 3, 2);
            Pruef.Ok(!Hat(Zuege(b1, 2, 2, 0), "move:3,2"), "ohne Holz kommt der Arbeiter nicht aufs Wasser");
            b1.Wetter = Wetter.WirkungVon("frost");
            Pruef.Ok(Hat(Zuege(b1, 2, 2, 0), "move:3,2"), "mit Frost schon");

            Pruef.Titel("Nebel – auf Distanz trifft niemand");
            var b5 = Brett(10, 4);
            Stelle(b5, 2, 2, Einheit.Archer);
            Stelle(b5, 3, 2, Einheit.Worker, 1);
            Stelle(b5, 4, 2, Einheit.Samurai, 1);
            Stelle(b5, 5, 2, Einheit.Legionaer, 1);
            var z5 = Zuege(b5, 2, 2);
            Pruef.Ok(Hat(z5, "shoot:4,2") && !Hat(z5, "shoot:5,2"),
                     "normal trifft der Bogenschütze auf Distanz 2");
            b5.Wetter = Wetter.WirkungVon("nebel");
            var z5n = Zuege(b5, 2, 2);
            Pruef.Ok(Hat(z5n, "shoot:3,2") && !Hat(z5n, "shoot:4,2"), "im Nebel nur auf Distanz 1");

            var b5b = Brett(12, 5);
            Stelle(b5b, 1, 1, Einheit.Zenturio);
            Stelle(b5b, 5, 1, Einheit.Worker, 1);
            Pruef.Ok(Hat(Zuege(b5b, 1, 1), "capture:5,1"),
                     "sonst schlägt der Zenturio ans Ende seiner Bahn");
            b5b.Wetter = Wetter.WirkungVon("nebel");
            var z5b = Zuege(b5b, 1, 1);
            Pruef.Ok(!Hat(z5b, "capture:5,1"), "im Nebel nicht mehr");
            Pruef.Ok(Hat(z5b, "move:4,1") && !Hat(z5b, "move:5,1"),
                     "die Figur steht ihm trotzdem im Weg");
            F(b5b, 5, 1).Piece = null;
            Stelle(b5b, 2, 1, Einheit.Worker, 1);
            Pruef.Ok(Hat(Zuege(b5b, 1, 1), "capture:2,1"),
                     "was direkt vor ihm steht, schlägt er weiter");

            Pruef.Titel("Klare Sicht – jeder sieht weiter");
            b5.Wetter = Wetter.WirkungVon("klar");
            var z5k = Zuege(b5, 2, 2);
            Pruef.Ok(Hat(z5k, "shoot:5,2") && !Hat(z5k, "shoot:4,2"),
                     "der Bogenschütze trifft auf Distanz 3");
            var b5c = Brett(12, 8);
            Stelle(b5c, 4, 4, Einheit.Springer);
            Pruef.Ok(!Weiten(b5c, 4, 4).Contains(4), "sonst springt der Springer höchstens 3 Felder");
            b5c.Wetter = Wetter.WirkungVon("klar");
            Pruef.Ok(Weiten(b5c, 4, 4).Contains(4), "bei klarer Sicht 4 Felder weit");
            b5c.Wetter = Wetter.WirkungVon("marsch");
            Pruef.Ok(!Weiten(b5c, 4, 4).Contains(4), "der Marschbefehl gilt ihm nicht");

            Pruef.Titel("Windstille – Springer und Legionär ziehen in jede Richtung");
            var b6 = Brett(10, 6);
            Stelle(b6, 4, 2, Einheit.Legionaer);
            Stelle(b6, 1, 4, Einheit.Springer);
            Pruef.Ok(!Hat(Zuege(b6, 4, 2), "move:4,1"), "der Legionär läuft sonst nur auf seiner Achse");
            b6.Wetter = Wetter.WirkungVon("windstille");
            Pruef.Ok(Hat(Zuege(b6, 4, 2), "move:4,1"), "bei Windstille auch quer dazu");
            Pruef.Ok(Zuege(b6, 1, 4).Count >= 8,
                     "der Springer erreicht alle sechs Keile (" + Zuege(b6, 1, 4).Count + " Ziele)");
            Pruef.Gleich("gedreht wird dabei nichts", F(b6, 4, 2).Piece.Facing, 0);

            Pruef.Titel("Fahrender Markt und Hungerwinter");
            var b8 = Brett(8, 4);
            Stelle(b8, 0, 0, Einheit.King);
            Stelle(b8, 5, 3, Einheit.King, 1);
            var st8 = Zustand(b8, 2);
            Pruef.Gleich("der Zenturio kostet sonst 3 Holz",
                         Moves.TrainBlocker(st8, 0, Einheit.Zenturio), "zu wenig Holz");
            SetzeWetter(st8, "markt");
            Pruef.Gleich("auf dem Markt kostet er 2", Moves.Preis(b8, Einheit.Zenturio), 2);
            Pruef.Ok(Moves.TrainBlocker(st8, 0, Einheit.Zenturio) == null,
                     "und ist mit 2 Holz bezahlbar");
            Pruef.Gleich("unter 1 Holz fällt nichts", Moves.Preis(b8, Einheit.Worker), 1);
            SetzeWetter(st8, "hunger");
            Pruef.Gleich("im Hungerwinter bildet niemand aus",
                         Moves.TrainBlocker(st8, 0, Einheit.Worker), "Hungerwinter");
            Pruef.Gleich("keine Einheit steht zur Wahl", Moves.AffordableUnits(st8, 0).Count, 0);

            Pruef.Titel("Feldlager – die Kette überspringt ein Feld");
            var b9 = Brett(10, 4);
            Stelle(b9, 0, 0, Einheit.King);
            Stelle(b9, 2, 0, Einheit.Samurai);
            Stelle(b9, 8, 3, Einheit.King, 1);
            Pruef.Ok(!Felder(b9, 0).Split(' ').Contains("3,0"),
                     "die abgehängte Figur versorgt sonst nichts");
            b9.Wetter = Wetter.WirkungVon("feldlager");
            Pruef.Ok(Felder(b9, 0).Split(' ').Contains("3,0"), "mit Feldlager schon");
            var b9b = Brett(10, 4);
            Stelle(b9b, 0, 0, Einheit.King);
            Stelle(b9b, 1, 0, Einheit.Worker, 1);
            Stelle(b9b, 2, 0, Einheit.Samurai);
            Stelle(b9b, 8, 3, Einheit.King, 1);
            b9b.Wetter = Wetter.WirkungVon("feldlager");
            Pruef.Ok(!Felder(b9b, 0).Split(' ').Contains("3,0"),
                     "eine fremde Figur in der Lücke reißt die Kette doch");

            Pruef.Titel("Belagerung – Nachschub nur im Umkreis von 3");
            var b10 = Brett(12, 4);
            Stelle(b10, 0, 0, Einheit.King);
            var reihe = new[] { Einheit.Worker, Einheit.Samurai, Einheit.Archer,
                                Einheit.Legionaer, Einheit.Tangolin };
            for (var i = 1; i <= 5; i++) Stelle(b10, i, 0, reihe[i - 1]);
            Stelle(b10, 10, 3, Einheit.King, 1);
            Pruef.Ok(Felder(b10, 0).Split(' ').Contains("6,0"),
                     "die lange Kette versorgt sonst bis ganz vorn");
            b10.Wetter = Wetter.WirkungVon("belagerung");
            var f10 = Felder(b10, 0).Split(' ');
            Pruef.Ok(!f10.Contains("6,0"), "unter Belagerung nicht mehr");
            Pruef.Ok(f10.Contains("3,1"), "nahe am Turm bleibt es dabei");
            var b11 = Brett(14, 4);
            Stelle(b11, 0, 0, Einheit.King);
            Stelle(b11, 10, 0, Einheit.Zenturio);
            Stelle(b11, 12, 3, Einheit.King, 1);
            b11.Wetter = Wetter.WirkungVon("belagerung");
            Pruef.Ok(Felder(b11, 0).Split(' ').Contains("11,0"),
                     "am Feldzeichen wird weiter ausgebildet");

            Pruef.Titel("Schlamm – kein Zug führt weiter als 2 Felder");
            var b13 = Brett(16, 6);
            Stelle(b13, 1, 1, Einheit.Zenturio);
            Stelle(b13, 6, 4, Einheit.Springer);
            Stelle(b13, 9, 1, Einheit.Tangolin);
            Baum(b13, 10, 1); Baum(b13, 12, 1);
            Pruef.Ok(Hat(Zuege(b13, 1, 1), "move:5,1"), "der Zenturio läuft sonst weit");
            Pruef.Ok(Hat(Zuege(b13, 9, 1), "jump:13,1"), "der Tangolin springt sonst weiter");
            b13.Wetter = Wetter.WirkungVon("schlamm");
            var z13 = Zuege(b13, 1, 1);
            Pruef.Ok(Hat(z13, "move:3,1") && !Hat(z13, "move:4,1"),
                     "im Schlamm endet er nach 2 Feldern");
            var nah = Moves.ForPiece(b13, F(b13, 6, 4), 5)
                .All(a => Hex.Distance(new Axial(6, 4), new Axial(a.Q, a.R)) <= 2);
            Pruef.Ok(Zuege(b13, 6, 4).Count > 0 && nah, "der Springer springt nur die kurze Weite");
            Pruef.Ok(!Hat(Zuege(b13, 9, 1), "jump:13,1"), "der Tangolin kommt über einen Sprung nicht hinaus");
            Pruef.Ok(Hat(Zuege(b13, 9, 1), "jump:11,1"), "der erste Sprung geht weiterhin");

            Pruef.Titel("Marschbefehl – ein Feld weiter");
            var b14 = Brett(12, 6);
            Stelle(b14, 2, 2, Einheit.Worker);
            Stelle(b14, 6, 4, Einheit.Springer);
            Stelle(b14, 9, 2, Einheit.Worker, 1);
            Baum(b14, 9, 3);
            Pruef.Ok(!Hat(Zuege(b14, 2, 2), "move:4,2"), "sonst geht der Arbeiter ein Feld");
            b14.Wetter = Wetter.WirkungVon("marsch");
            Pruef.Ok(Hat(Zuege(b14, 2, 2), "move:4,2"), "mit Marschbefehl zwei");
            Pruef.Ok(!Hat(Zuege(b14, 9, 2), "harvest:9,4"),
                     "gefällt wird weiter nur vom Nachbarfeld aus");
            Stelle(b14, 3, 2, Einheit.Samurai, 1);
            Pruef.Ok(!Hat(Zuege(b14, 2, 2), "move:4,2"), "eine Figur auf halbem Weg beendet den Marsch");
            F(b14, 3, 2).Piece = null;
            Pruef.Ok(!Weiten(b14, 6, 4).Contains(4), "der Springer marschiert nicht mit");
        }

        private static List<int> Weiten(Board b, int q, int r)
        {
            return Moves.ForPiece(b, F(b, q, r), 5)
                .Select(a => Hex.Distance(new Axial(q, r), new Axial(a.Q, a.R))).ToList();
        }

        // ---------------- Bestandsgrenze ----------------

        private static void Bestandsgrenze()
        {
            Pruef.Titel("Bestandsgrenze – höchstens eine Figur je Typ und Spieler");

            var b = Brett(12, 4);
            Stelle(b, 0, 0, Einheit.King);
            Stelle(b, 1, 0, Einheit.Worker);
            Stelle(b, 10, 3, Einheit.King, 1);
            var st = Zustand(b, 20);

            Pruef.Ok(Moves.TrainingSpots(b, 0).Count > 0, "Ausbildungsfelder vorhanden");
            Pruef.Gleich("Arbeiter steht schon -> gesperrt",
                         Moves.TrainBlocker(st, 0, Einheit.Worker), "steht im Spiel");
            Pruef.Ok(!Moves.AffordableUnits(st, 0).Contains(Einheit.Worker),
                     "Arbeiter fehlt in der Auswahl");
            Pruef.Ok(Moves.TrainBlocker(st, 0, Einheit.Samurai) == null, "der Samurai ist frei");

            Stelle(b, 2, 0, Einheit.Samurai);
            Pruef.Gleich("zweiter Samurai gesperrt",
                         Moves.TrainBlocker(st, 0, Einheit.Samurai), "steht im Spiel");
            F(b, 2, 0).Piece = null;
            Pruef.Ok(Moves.TrainBlocker(st, 0, Einheit.Samurai) == null,
                     "nach Verlust wieder ausbildbar");

            // Der Zenturio bleibt einmalig pro Partie
            st.Players[0].Trained[Einheit.Zenturio] = 1;
            Pruef.Gleich("Zenturio bleibt nach Verlust gesperrt",
                         Moves.TrainBlocker(st, 0, Einheit.Zenturio), "schon ausgebildet");
        }
    }
}
