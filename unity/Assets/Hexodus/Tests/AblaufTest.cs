/* Prüft den Ablauf (Ablauf.cs) gegen dieselben Abläufe wie die JS-Tests:
   die ausführenden Teile von test/boot.js, test/tangolin.js,
   test/versorgung.js und – der größte Brocken – das Taktwerk der
   Wetterkarten aus test/wetter.js.

   Das Taktwerk steht hier besonders ausführlich, weil es die Regel ist, die
   am Tisch ausgehandelt wurde und an keiner Karte abzulesen ist:

     klar → ein Schlag deckt auf → eine volle Runde ohne Wirkung
          → zwei volle Runden Wetter → klar

   Gezählt wird in Zügen, nicht in Rundennummern. Das ist kein Detail: Nach
   Rundennummern gerechnet träfe eine Karte, die der letzte Spieler der Reihe
   aufdeckt, seinen Nachbarn ohne jede Vorwarnung. */
using System.Collections.Generic;
using System.Linq;

namespace Hexodus.Tests
{
    public static class AblaufTest
    {
        public static void Alles()
        {
            Ausfuehren();
            Kettensprung();
            Ausbilden();
            WetterTakt();
            NurBeiKlaremWetter();
            Aufbruch();
            SofortBeimEintreten();
            Trockenheit();
            Stellungskennung();
            GanzePartien();
            StandardspielUnberuehrt();
        }

        // ---------------- Werkstatt ----------------

        private static Board Brett(int breite, int hoehe)
        {
            var b = new Board();
            for (var q = -1; q <= breite; q++)
            {
                for (var r = -1; r <= hoehe; r++)
                {
                    var c = new Cell(q, r, Gelaende.Gras);
                    b.Cells[c.Key] = c; b.Keys.Add(c.Key);
                }
            }
            return b;
        }

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

        private static Cell F(Board b, int q, int r) { return b.Cells[Hex.Key(q, r)]; }

        private static Cell Stelle(Board b, int q, int r, Einheit typ, int spieler = 0)
        {
            var c = F(b, q, r);
            c.Piece = new Figur(typ, spieler);
            return c;
        }

        private static void Baum(Board b, int q, int r) { F(b, q, r).Tree = true; }
        private static Cell Wasser(Board b, int q, int r)
        {
            var c = F(b, q, r); c.Terrain = Gelaende.Wasser; return c;
        }

        /// <summary>Eine laufende Partie auf einem vorgegebenen Brett.</summary>
        private static Spielstand Partie(Board board, int holz = 0, bool wetter = false)
        {
            var st = Spielstand.Create(new[] { "Eins", "Zwei" }, null, null, wetter);
            st.Board = board;
            board.Teams = (int[])st.Teams.Clone();
            st.Phase = Phase.Play;
            st.Current = 0;
            st.Players[0].Wood = holz;
            st.Players[1].Wood = holz;
            return st;
        }

        private static Aktion Suche(Spielstand st, Cell von, string kind, int q, int r)
        {
            return Moves.ForPiece(st.Board, von, st.Players[von.Piece.Owner].Wood)
                        .FirstOrDefault(a => a.Kind == kind && a.Q == q && a.R == r);
        }

        /// <summary>Zieht mit der Figur auf (q,r) die erste Aktion dieser Art.</summary>
        private static bool ZieheMit(Spielstand st, int q, int r, string art)
        {
            var c = F(st.Board, q, r);
            var a = Moves.ForPiece(st.Board, c, st.Players[c.Piece.Owner].Wood)
                         .FirstOrDefault(x => x.Kind == art);
            return st.Perform(c, a);
        }

        /* Irgendein harmloser Zug des Spielers am Zug – nur, um weiterzugeben.
           Entspricht gibAb() in test/wetter.js. */
        private static bool GibAb(Spielstand st)
        {
            for (var i = 0; i < st.Board.Keys.Count; i++)
            {
                var c = st.Board.Cells[st.Board.Keys[i]];
                if (c.Piece == null || c.Piece.Owner != st.Current) continue;
                var a = Moves.ForPiece(st.Board, c, st.Players[st.Current].Wood)
                             .FirstOrDefault(x => x.Kind == "move");
                if (a != null) return st.Perform(c, a);
            }
            return st.Pass();
        }

        // ---------------- Ausführen ----------------

        private static void Ausfuehren()
        {
            Pruef.Titel("Ausführen: Boote landen an den richtigen Stellen");

            var b2 = Bahn("LWLWL");
            var st = Partie(b2, 5);
            var z = Stelle(b2, 0, 0, Einheit.Zenturio);
            var zug = Suche(st, z, "move", 4, 0);
            Pruef.Ok(zug != null, "der Weg über beide Wasserabschnitte steht zur Wahl");
            st.Perform(z, zug);
            Pruef.Ok(F(b2, 4, 0).Piece != null, "Zenturio steht am Ziel");
            Pruef.Gleich("Holz bezahlt (5 - 2)", st.Players[0].Wood, 3);
            Pruef.Ok(F(b2, 1, 0).Boat, "Boot auf dem 1. Wasserfeld");
            Pruef.Ok(F(b2, 3, 0).Boat, "Boot auf dem 2. Wasserfeld");

            Pruef.Titel("Auf dem Wasser bleibt das Boot unter der Figur");
            var b3 = Bahn("LWL");
            var st3 = Partie(b3, 2);
            var w = Stelle(b3, 0, 0, Einheit.Worker);
            st3.Perform(w, Suche(st3, w, "move", 1, 0));
            Pruef.Ok(F(b3, 1, 0).Piece != null, "Arbeiter steht auf dem Wasser");
            Pruef.Ok(F(b3, 1, 0).Boat, "Boot liegt unter ihm");
            Pruef.Gleich("1 Holz bezahlt", st3.Players[0].Wood, 1);

            // weiter an Land: das Boot bleibt auf dem Wasser zurück
            st3.Current = 0;
            var aufWasser = F(b3, 1, 0);
            var raus = Suche(st3, aufWasser, "move", 2, 0);
            Pruef.Ok(raus != null && raus.Cost == 0, "Rückweg an Land ist gratis");
            st3.Perform(aufWasser, raus);
            Pruef.Ok(F(b3, 1, 0).Boat, "Boot bleibt liegen");
            Pruef.Ok(F(b3, 2, 0).Piece != null, "Arbeiter ist an Land");
            Pruef.Gleich("kein Holz mehr gezahlt", st3.Players[0].Wood, 1);
        }

        // ---------------- Kettensprung ----------------

        private static void Kettensprung()
        {
            Pruef.Titel("Kettensprung: Beute, Boote und Holz stimmen");

            var b9 = Brett(10, 4);
            var st9 = Partie(b9, 2);
            var t9 = Stelle(b9, 0, 0, Einheit.Tangolin);
            Baum(b9, 1, 0);
            Wasser(b9, 2, 0);                      // erste Landung: Wasser, kostet 1
            Stelle(b9, 3, 0, Einheit.Worker, 0);   // Sprungbrett
            Stelle(b9, 4, 0, Einheit.Archer, 1);   // zweite Landung: Gegner (Kosten 2 → Beute 1)
            Stelle(b9, 0, 3, Einheit.King, 1);
            Stelle(b9, 7, 3, Einheit.King, 0);
            var zug9 = Suche(st9, t9, "jump", 4, 0);
            Pruef.Ok(zug9 != null, "der Weg über Wasser auf den Gegner steht zur Wahl");
            Pruef.Gleich("ein Boot", zug9 == null ? -1 : zug9.Cost, 1);
            Pruef.Gleich("ein Schlag", zug9 == null ? "" : string.Join(" ", zug9.Captures), "4,0");
            st9.Perform(t9, zug9);
            Pruef.Ok(F(b9, 2, 0).Boat, "auf der Wasserlandung liegt jetzt ein Boot");
            Pruef.Ok(F(b9, 4, 0).Piece != null && F(b9, 4, 0).Piece.Type == Einheit.Tangolin,
                     "der Tangolin steht am Ende der Kette, der Bogenschütze ist weg");
            Pruef.Gleich("2 Holz minus 1 Boot plus 1 Beute", st9.Players[0].Wood, 2);

            Pruef.Titel("Fällt ein Turm mitten in der Kette, scheidet sein Spieler aus");
            var b11 = Brett(10, 4);
            var st11 = Partie(b11, 0);
            st11.Players[1].Wood = 4;
            var t11 = Stelle(b11, 0, 0, Einheit.Tangolin);
            Baum(b11, 1, 0);
            Stelle(b11, 2, 0, Einheit.King, 1);      // erste Landung schlägt den Turm
            Stelle(b11, 3, 0, Einheit.Worker, 0);
            Stelle(b11, 4, 0, Einheit.Samurai, 1);   // stünde als Nächstes an
            Stelle(b11, 7, 3, Einheit.King, 0);
            var zug11 = Suche(st11, t11, "jump", 4, 0);
            Pruef.Ok(zug11 != null, "die Kette über Turm und Samurai steht zur Wahl");
            st11.Perform(t11, zug11);
            Pruef.Ok(st11.Players[1].Eliminated, "Spieler Zwei ist ausgeschieden");
            Pruef.Ok(F(b11, 4, 0).Piece == null || F(b11, 4, 0).Piece.Type == Einheit.Tangolin,
                     "seine übrigen Figuren sind mit vom Brett");
            Pruef.Ok(st11.Players[0].Wood >= 4,
                     "sein Holz ist erbeutet (" + st11.Players[0].Wood + ")");

            Pruef.Titel("Geschlagen wird auch beim Zug auf das Nachbarfeld");
            var b13 = Brett(8, 4);
            var st13 = Partie(b13, 0);
            var t13 = Stelle(b13, 0, 0, Einheit.Tangolin);
            Stelle(b13, 1, 0, Einheit.Zenturio, 1);   // Kosten 3 → Beute 2
            Stelle(b13, 0, 3, Einheit.King, 1);
            Stelle(b13, 5, 3, Einheit.King, 0);
            var hieb = Suche(st13, t13, "capture", 1, 0);
            Pruef.Ok(hieb != null, "der Schlag auf das Nachbarfeld steht zur Wahl");
            st13.Perform(t13, hieb);
            Pruef.Gleich("Beute: 2 Holz", st13.Players[0].Wood, 2);
            Pruef.Gleich("die halben Kosten, aufgerundet", Spielstand.Plunder(Einheit.Zenturio), 2);
            Pruef.Gleich("beim Samurai ist das 1", Spielstand.Plunder(Einheit.Samurai), 1);
        }

        // ---------------- Ausbilden ----------------

        private static void Ausbilden()
        {
            Pruef.Titel("Ausbilden am Feldzeichen wird auch ausgeführt");

            var b = Brett(12, 3);
            var st = Partie(b, 1);
            Stelle(b, 0, 0, Einheit.King);
            Stelle(b, 8, 0, Einheit.Zenturio);
            Stelle(b, 5, 3, Einheit.King, 1);
            Pruef.Ok(st.Train(Einheit.Worker, 9, 0), "der Arbeiter darf am Zenturio entstehen");
            var neu = F(b, 9, 0).Piece;
            Pruef.Ok(neu != null && neu.Type == Einheit.Worker && neu.Owner == 0,
                     "er steht auf dem Feld");
            Pruef.Gleich("und hat sein Holz gekostet", st.Players[0].Wood, 0);

            Pruef.Titel("Fahrender Markt: der Zenturio kostet 2 statt 3");
            var b8 = Brett(8, 4);
            var st8 = Partie(b8, 2, true);
            Stelle(b8, 0, 0, Einheit.King);
            Stelle(b8, 5, 3, Einheit.King, 1);
            st8.Board.Wetter = Wetter.WirkungVon("markt");
            st8.Karte = "markt";
            Pruef.Ok(st8.Train(Einheit.Zenturio, 1, 0), "er wird auch wirklich ausgebildet");
            Pruef.Gleich("und hat 2 Holz gekostet", st8.Players[0].Wood, 0);
        }

        // ---------------- Das Taktwerk ----------------

        /* Zwei Spieler, zwei Arbeiter nebeneinander: Spieler 1 kann schlagen.
           Entspricht schlagStellung() in test/wetter.js. */
        private static Spielstand SchlagStellung(params string[] karten)
        {
            var b = Brett(10, 5);
            Stelle(b, 0, 0, Einheit.King, 0);
            Stelle(b, 8, 4, Einheit.King, 1);
            Stelle(b, 3, 2, Einheit.Worker, 0);
            Stelle(b, 4, 2, Einheit.Worker, 1);
            Stelle(b, 6, 0, Einheit.Samurai, 1);     // damit Spieler 2 auch ziehen kann
            var st = Partie(b, 0, true);
            st.Stapel = karten.ToList();
            return st;
        }

        private static void WetterTakt()
        {
            Pruef.Titel("Wann das Wetter dreht");
            Pruef.Gleich("eine Karte gilt zwei volle Runden", Spielstand.WetterRunden, 2);

            var st = SchlagStellung("nebel");
            Pruef.Ok(st.Karte == null && st.Kommt == null, "zu Beginn gilt kein Wetter");
            ZieheMit(st, 3, 2, "capture");            // Spieler 1 schlägt
            Pruef.Gleich("der Schlag lässt eine Karte aufziehen", st.Kommt, "nebel");
            Pruef.Ok(st.Karte == null, "sie gilt aber noch nicht");
            Pruef.Gleich("am Brett hängt weiter das alte Wetter", st.Board.Wetter.Schuss, 2);
            Pruef.Gleich("Spieler 2 ist am Zug", st.Current, 1);
            Pruef.Gleich("noch eine volle Runde ohne Wirkung", st.KommtZaehler, 2);

            GibAb(st);                                 // Spieler 2 zieht ohne Wirkung
            Pruef.Ok(st.Karte == null, "auch danach gilt sie noch nicht");
            Pruef.Gleich("jetzt zieht der Schlagende noch einmal ohne Wirkung", st.Current, 0);
            GibAb(st);                                 // die Runde ist abgelaufen
            Pruef.Gleich("nach der vollen Runde tritt sie ein", st.Karte, "nebel");
            Pruef.Gleich("und wirkt am Brett", st.Board.Wetter.Schuss, 1);
            Pruef.Ok(st.Kommt == null, "am Horizont steht nichts mehr");

            // Zwei volle Runden – je zwei Züge für jeden – dann klart es auf
            Pruef.Gleich("sie hat vier Züge: zwei Runden mal zwei Spieler", st.KarteZaehler, 4);
            GibAb(st); GibAb(st);
            Pruef.Gleich("nach der ersten Runde gilt sie noch", st.Karte, "nebel");
            Pruef.Gleich("noch eine Runde", st.KarteZaehler, 2);
            GibAb(st);
            Pruef.Gleich("und auch mitten in der zweiten", st.Karte, "nebel");
            GibAb(st);
            Pruef.Ok(st.Karte == null, "nachdem beide zweimal darunter gezogen haben, klart es auf");
            Pruef.Gleich("am Brett gilt wieder die Grundregel", st.Board.Wetter.Schuss, 2);
            Pruef.Ok(st.Ablage.Contains("nebel"), "die Karte liegt auf der Ablage");

            /* Und derselbe Ablauf, wenn der letzte Spieler der Reihe schlägt:
               Auch dann bekommt jeder seine Runde Vorwarnung – nach der
               Rundennummer gerechnet hätte es seinen Nachbarn ohne jede
               Vorwarnung getroffen. */
            Pruef.Titel("Auch der letzte Spieler der Reihe gibt eine Runde Vorlauf");
            var stb = SchlagStellung("frost");
            stb.Current = 1;
            F(stb.Board, 4, 2).Piece = new Figur(Einheit.Worker, 1);
            F(stb.Board, 3, 2).Piece = new Figur(Einheit.Worker, 0);
            ZieheMit(stb, 4, 2, "capture");           // der Letzte in der Reihe schlägt
            Pruef.Ok(stb.Kommt == "frost" && stb.Karte == null,
                     "auch beim letzten Spieler zieht sie erst auf");
            Pruef.Gleich("und auch er gibt eine volle Runde Vorlauf", stb.KommtZaehler, 2);
            GibAb(stb);
            Pruef.Ok(stb.Karte == null, "nach einem Zug noch nicht");
            GibAb(stb);
            Pruef.Gleich("nach der vollen Runde schon", stb.Karte, "frost");
        }

        private static void NurBeiKlaremWetter()
        {
            Pruef.Titel("Nur bei klarem Wetter dreht ein Schlag etwas");

            var st = SchlagStellung("frost", "nebel");
            ZieheMit(st, 3, 2, "capture");
            var ersteKarte = st.Kommt;
            Pruef.Ok(ersteKarte != null, "die erste Karte zieht auf");
            // Noch ein Schlag, während sie aufzieht: es bleibt bei einer
            F(st.Board, 5, 2).Piece = new Figur(Einheit.Archer, 1);
            st.Current = 0;
            F(st.Board, 4, 2).Piece = new Figur(Einheit.Tangolin, 0);
            ZieheMit(st, 4, 2, "capture");
            Pruef.Gleich("es bleibt bei der ersten Karte", st.Kommt ?? st.Karte, ersteKarte);
            Pruef.Gleich("ein zweiter Schlag nimmt keine zweite Karte vom Stapel",
                         st.Stapel.Count, 1);

            /* Und dasselbe, während die Karte gilt: Wer mitten im Sturm
               weiterkämpft, verlängert ihn nicht und deckt auch nichts Neues
               auf. */
            var stb = SchlagStellung("frost", "nebel");
            ZieheMit(stb, 3, 2, "capture");
            GibAb(stb); GibAb(stb);                   // eine Runde Vorlauf
            Pruef.Ok(stb.Karte != null, "die Karte gilt: " + stb.Karte);
            var gilt = stb.Karte;
            var restVorher = stb.KarteZaehler;
            var stapelVorher = stb.Stapel.Count;
            stb.Current = 0;
            F(stb.Board, 4, 2).Piece = new Figur(Einheit.Tangolin, 0);
            F(stb.Board, 5, 2).Piece = new Figur(Einheit.Archer, 1);
            ZieheMit(stb, 4, 2, "capture");
            Pruef.Gleich("es gilt weiter dieselbe Karte", stb.Karte, gilt);
            Pruef.Ok(stb.Kommt == null, "es zieht nichts Neues auf");
            Pruef.Gleich("der Stapel bleibt unangetastet", stb.Stapel.Count, stapelVorher);
            Pruef.Gleich("und die Karte läuft normal weiter ab", stb.KarteZaehler, restVorher - 1);

            // Erst wenn es aufgeklart ist, dreht der nächste Schlag wieder etwas
            var schutz = 0;
            while (stb.Karte != null && schutz++ < 20) GibAb(stb);
            Pruef.Ok(stb.Karte == null && stb.Kommt == null, "das Wetter ist wieder klar");
            stb.Current = 0;
            Cell tang = null;
            foreach (var c in stb.Board.Alle())
            {
                if (c.Piece != null && c.Piece.Type == Einheit.Tangolin && c.Piece.Owner == 0) tang = c;
            }
            Cell opfer = null;
            foreach (var nb in Hex.Neighbors(tang))
            {
                var c = stb.Board.At(nb);
                if (c != null && c.Piece == null && !c.Tree && c.Terrain == Gelaende.Gras)
                {
                    opfer = c; break;
                }
            }
            opfer.Piece = new Figur(Einheit.Samurai, 1);
            ZieheMit(stb, tang.Q, tang.R, "capture");
            Pruef.Ok(stb.Kommt != null, "jetzt zieht wieder eine Karte auf: " + stb.Kommt);
        }

        private static void Aufbruch()
        {
            Pruef.Titel("Der Aufbruch gehört dem, der als Erster darunter zieht");

            var st = SchlagStellung("aufbruch");
            ZieheMit(st, 3, 2, "capture");            // Spieler 1 schlägt
            Pruef.Gleich("solange sie aufzieht, hat niemand einen Extra-Zug", st.Extra, 0);
            GibAb(st); GibAb(st);                     // eine Runde ohne Wirkung
            Pruef.Ok(st.Karte == "aufbruch" && st.Extra == 1,
                     "wer als Erster darunter zieht, bekommt den zweiten Zug");
            Pruef.Gleich("das ist der Nächste in der Reihe", st.Current, 1);
            var wer = st.Current;
            GibAb(st);
            Pruef.Ok(st.Current == wer && st.Nochmal, "er ist gleich noch einmal dran");
        }

        private static void SofortBeimEintreten()
        {
            Pruef.Titel("Einmalige Änderungen geschehen beim Eintreten, nicht beim Aufziehen");

            var st = SchlagStellung("windbruch");
            Baum(st.Board, 2, 4);                     // steht allein
            ZieheMit(st, 3, 2, "capture");
            GibAb(st);
            Pruef.Ok(F(st.Board, 2, 4).Tree, "während sie aufzieht, steht der Baum noch");
            GibAb(st);
            Pruef.Ok(!F(st.Board, 2, 4).Tree, "mit dem Sturm fällt er");
        }

        private static void Trockenheit()
        {
            Pruef.Titel("Trockenheit – Fällen kostet keinen Zug");

            var b = Brett(8, 4);
            var st = Partie(b, 0, true);
            Stelle(b, 0, 0, Einheit.King);
            Stelle(b, 2, 2, Einheit.Worker);
            Baum(b, 3, 2);
            Stelle(b, 6, 3, Einheit.King, 1);
            st.Board.Wetter = Wetter.WirkungVon("trockenheit");
            st.Karte = "trockenheit";
            ZieheMit(st, 2, 2, "harvest");
            Pruef.Gleich("derselbe Spieler ist noch am Zug", st.Current, 0);
            Pruef.Ok(st.Nochmal, "das Spiel weiß, dass er noch einmal darf");
            Pruef.Gleich("ein Baum gibt weiterhin genau 1 Holz", st.Players[0].Wood, 1);

            // Ohne die Karte wird weitergegeben
            var b2 = Brett(8, 4);
            var st2 = Partie(b2, 0, true);
            Stelle(b2, 0, 0, Einheit.King);
            Stelle(b2, 6, 3, Einheit.King, 1);
            Stelle(b2, 2, 2, Einheit.Worker);
            Baum(b2, 3, 2);
            ZieheMit(st2, 2, 2, "harvest");
            Pruef.Gleich("ohne Trockenheit ist danach der Nächste dran", st2.Current, 1);
        }

        // ---------------- Stellungs-Kennung ----------------

        /* Die Stellungs-Kennung muss *zeichengleich* mit js/game.js sein, nicht
           bloß gleichwertig: Der Computergegner erkennt eigene Wiederholungen
           daran, und die Weboberfläche und der Rechenfaden tauschen sie aus.
           Eine Kennung, die sich auch nur in der Schreibweise eines
           Figurennamens unterschied, ließe beide Fassungen aneinander
           vorbeireden.

           Der Sollwert unten stammt nicht aus dem C#-Code: Er ist die Ausgabe
           von G.positionKey() der JS-Fassung für genau diese Stellung,
           abgeschrieben. */
        private static void Stellungskennung()
        {
            Pruef.Titel("Stellungs-Kennung, Zeichen für Zeichen wie in js/game.js");

            var b = Brett(6, 3);
            var st = Partie(b, 0, true);
            st.Board.Teams = new[] { 0, 1 };
            Stelle(b, 0, 0, Einheit.King, 0);
            Stelle(b, 1, 0, Einheit.Worker, 0);
            F(b, 2, 1).Piece = new Figur(Einheit.Springer, 0, 3);
            Stelle(b, 4, 2, Einheit.Zenturio, 1);
            Stelle(b, 5, 0, Einheit.Tangolin, 1);
            F(b, 3, 3).Piece = new Figur(Einheit.Legionaer, 1, 5);
            Baum(b, 2, 2);
            F(b, 3, 0).Boat = true;
            Wasser(b, 4, 0).Boat = true;
            Stelle(b, 4, 0, Einheit.Archer, 0);       // Figur im Boot
            st.Players[0].Wood = 7;
            st.Players[1].Wood = 3;
            st.Current = 1;

            const string soll = "0,0=king00|1,0=worker00|2,1=springer03|2,2=T|3,0=B|" +
                                "3,3=legionaer15|4,0=archer00B|4,2=zenturio10|5,0=tangolin10|h7.3|z1";
            Pruef.Gleich("ohne Wetter", st.PositionKey(), soll);
            st.Karte = "nebel";
            Pruef.Gleich("unter einer Karte gehört sie dazu", st.PositionKey(), soll + "|wnebel");
        }

        // ---------------- Ganze Partien ----------------

        private sealed class Zahl
        {
            public HashSet<string> Karten = new HashSet<string>();
            public int Mit, Ohne, Schlaege;
            public bool StartKlar;
            public Spielstand State;
        }

        /* Eine Zufallspartie: greift lieber zu, wenn etwas zu holen ist, sonst
           zieht sie irgendwohin. Eine einzelne sagt wenig – eine kann nach
           fünfzehn Zügen vorbei sein, weil ein Turm fällt. Gezählt wird
           deshalb über mehrere. */
        private static Zahl Zufallspartie(int spieler, int maxZuege)
        {
            var namen = new[] { "A", "B", "C", "D" }.Take(spieler).ToArray();
            var st = Spielstand.Create(namen, null, null, true);
            st.AutoPlaceTrees();
            var schutz = 0;
            while (st.Phase == Phase.Kings && schutz++ < 500)
            {
                if (st.AwaitWorker)
                {
                    Cell wf = null;
                    foreach (var c in st.Board.Alle())
                    {
                        if (!Board.IsFree(c)) continue;
                        foreach (var nb in Hex.Neighbors(c))
                        {
                            var x = st.Board.At(nb);
                            if (x != null && x.Piece != null && x.Piece.Type == Einheit.King &&
                                x.Piece.Owner == st.Current) { wf = c; break; }
                        }
                        if (wf != null) break;
                    }
                    if (wf == null) return null;
                    st.PlaceWorker(wf.Q, wf.R);
                }
                else
                {
                    Cell kf = null;
                    foreach (var c in st.Board.Alle()) if (st.CanPlaceKing(c)) { kf = c; break; }
                    if (kf == null) return null;
                    st.PlaceKing(kf.Q, kf.R);
                }
            }
            if (st.Phase != Phase.Play) return null;

            var zahl = new Zahl { StartKlar = st.Karte == null };
            for (var z = 0; z < maxZuege && st.Phase == Phase.Play; z++)
            {
                if (st.Karte != null) { zahl.Karten.Add(st.Karte); zahl.Mit++; } else zahl.Ohne++;
                if (st.Pending != null) { st.EndPending(); continue; }

                var zuege = new List<(Cell C, Aktion A)>();
                foreach (var key in st.Board.Keys)
                {
                    var c = st.Board.Cells[key];
                    if (c.Piece == null || c.Piece.Owner != st.Current) continue;
                    foreach (var a in st.ActionsFor(c)) zuege.Add((c, a));
                }
                var spots = Moves.TrainingSpots(st.Board, st.Current);
                var ausbildung = new List<(Einheit E, Cell Sp)>();
                foreach (var id in Moves.AffordableUnits(st, st.Current))
                {
                    foreach (var sp in spots) ausbildung.Add((id, sp));
                }
                if (zuege.Count == 0 && ausbildung.Count == 0) { st.Pass(); continue; }

                // 70 % der Züge greifen zu, wenn es etwas zu holen gibt
                var scharf = zuege.Where(x => x.A.Kind == "capture" || x.A.Kind == "shoot" ||
                                              x.A.Kind == "harvest").ToList();
                var scharfZahl = scharf.Count + ausbildung.Count;
                if (scharfZahl > 0 && Zufall.Bruch() < 0.7)
                {
                    var i = Zufall.Naechste(scharfZahl);
                    if (i < scharf.Count) st.Perform(scharf[i].C, scharf[i].A);
                    else
                    {
                        var t = ausbildung[i - scharf.Count];
                        st.Train(t.E, t.Sp.Q, t.Sp.R);
                    }
                }
                else if (zuege.Count > 0)
                {
                    var o = zuege[Zufall.Naechste(zuege.Count)];
                    st.Perform(o.C, o.A);
                }
                else
                {
                    var t = ausbildung[Zufall.Naechste(ausbildung.Count)];
                    st.Train(t.E, t.Sp.Q, t.Sp.R);
                }
                if (st.LastCaptures != null && st.LastCaptures.Count > 0) zahl.Schlaege++;
            }
            zahl.State = st;
            return zahl;
        }

        private static void GanzePartien()
        {
            Pruef.Titel("Ganze Partien");

            /* Fester Startwert: Eine Prüfung, die bei jedem Lauf etwas anderes
               spielt, ist keine Prüfung – sie ist ein Würfelbecher. */
            Zufall.Startwert(20260926);

            int partien = 0, klarStart = 0, schlaege = 0, mit = 0, ohne = 0, voll = 0;
            var karten = new HashSet<string>();
            for (var g = 0; g < 8; g++)
            {
                var r = Zufallspartie(3 + (g % 2), 400);
                if (r == null) continue;
                partien++;
                if (r.StartKlar) klarStart++;
                mit += r.Mit; ohne += r.Ohne; schlaege += r.Schlaege;
                foreach (var k in r.Karten) karten.Add(k);
                var imUmlauf = r.State.Stapel.Count + r.State.Ablage.Count +
                               (r.State.Karte != null ? 1 : 0) + (r.State.Kommt != null ? 1 : 0);
                if (imUmlauf == Wetter.Stapel().Count) voll++;
            }
            Pruef.Ok(partien >= 6, partien + " Partien gespielt");
            Pruef.Gleich("jede Partie beginnt bei klarem Wetter", klarStart, partien);
            Pruef.Ok(schlaege > 0, "es fielen Figuren (" + schlaege + " Schläge)");
            Pruef.Ok(karten.Count >= 3, "dabei galten " + karten.Count + " verschiedene Karten");
            Pruef.Ok(ohne > 0, "zwischen den Karten war das Wetter klar (" + ohne +
                     " von " + (ohne + mit) + " Zügen)");
            Pruef.Ok(mit > 0, "aber auch nicht nie (" + mit + " Züge unter einer Karte)");
            Pruef.Gleich("keine Partie verliert eine Karte aus dem Umlauf", voll, partien);
        }

        private static void StandardspielUnberuehrt()
        {
            Pruef.Titel("Das Standardspiel bleibt unberührt");

            Zufall.Startwert(4711);
            var st = Spielstand.Create(new[] { "A", "B" });
            Pruef.Ok(!st.WetterAn, "ohne Wahl wird ohne Wetter gespielt");
            Pruef.Ok(st.Board.Wetter == Wetterlage.Neutral, "am Brett hängt die neutrale Wirkung");
            st.AutoPlaceTrees();
            Pruef.Ok(st.Karte == null, "es wird keine Karte gezogen");
            Pruef.Ok(st.KuendigeAn() == null, "ein Schlag lässt dort nichts aufziehen");
            Pruef.Ok(st.WetterTakt() == null, "und der Takt deckt nichts auf");
            Pruef.Gleich("der Stapel bleibt leer", st.Stapel.Count, 0);
        }
    }
}
