/* Prüft das Fundament der Portierung gegen die JS-Fassung:
   Hex-Geometrie, Brett-Erzeugung, Einheiten und den Wetterstapel.

   Die Zahlen darin stammen nicht aus dem C#-Code, sondern aus dem Regelwerk
   und aus js/*.js – sonst prüfte sich die Portierung nur selbst. */
using System.Collections.Generic;

namespace Hexodus.Tests
{
    public static class GrundlagenTest
    {
        public static void Alles()
        {
            Geometrie();
            Einheiten();
            Brett();
            Wetterstapel();
        }

        private static void Geometrie()
        {
            Pruef.Titel("Hex-Geometrie");

            Pruef.Gleich("sechs Richtungen", Hex.Dirs.Length, 6);
            Pruef.Gleich("Richtung 0 ist Südost", Hex.Key(Hex.Dirs[0][0], Hex.Dirs[0][1]), "1,0");
            Pruef.Gleich("Richtung 2 ist Nord", Hex.Key(Hex.Dirs[2][0], Hex.Dirs[2][1]), "0,-1");

            var mitte = new Axial(0, 0);
            foreach (var nb in Hex.Neighbors(mitte))
            {
                Pruef.Ok(Hex.Distance(mitte, nb) == 1, "Nachbar " + nb + " hat Abstand 1");
            }
            Pruef.Gleich("Abstand über drei Felder", Hex.Distance(new Axial(0, 0), new Axial(3, 0)), 3);
            Pruef.Gleich("Abstand quer", Hex.Distance(new Axial(0, 0), new Axial(2, -1)), 2);

            /* Die Diagonalen des Samurai: Jede hat Abstand 2, und alle halten
               (q - r) mod 3 fest – daher erreicht er nur ein Drittel des Bretts. */
            var restStart = ((0 - 0) % 3 + 3) % 3;
            var alleDiagonalen = true;
            foreach (var d in Hex.Diags)
            {
                if (Hex.Distance(mitte, new Axial(d[0], d[1])) != 2) alleDiagonalen = false;
                var rest = ((d[0] - d[1]) % 3 + 3) % 3;
                if (rest != restStart) alleDiagonalen = false;
            }
            Pruef.Ok(alleDiagonalen, "alle 6 Diagonalen: Abstand 2 und dasselbe Drittel");

            // Der Keil des Springers umfasst zwei benachbarte Richtungen
            var keil = Hex.WedgeDirs(5);
            Pruef.Ok(keil[0] == 5 && keil[1] == 0, "der Keil läuft über die 0 hinweg");

            // Ein Plättchen ist eine Blume aus sieben Feldern
            var tile = Hex.TileCells(new[] { 0, 0 });
            Pruef.Gleich("ein Plättchen hat 7 Felder", tile.Count, 7);

            /* Die Plättchen-Mittelpunkte liegen im Abstand 3: So greifen die
               Blumen ineinander, ohne sich zu überlappen. */
            var abstaendeStimmen = true;
            foreach (var d in Hex.TileDirs)
            {
                if (Hex.Distance(mitte, new Axial(d[0], d[1])) != 3) abstaendeStimmen = false;
            }
            Pruef.Ok(abstaendeStimmen, "Plättchen-Mittelpunkte liegen im Abstand 3");
        }

        private static void Einheiten()
        {
            Pruef.Titel("Einheiten");

            Pruef.Gleich("der Arbeiter kostet 1 Holz", Units.Kosten(Einheit.Worker), 1);
            Pruef.Gleich("der Zenturio kostet 3 Holz", Units.Kosten(Einheit.Zenturio), 3);
            Pruef.Ok(Units.Def(Einheit.King).Cost == null, "der Königs-Turm ist eine Startfigur");
            Pruef.Ok(Units.Def(Einheit.Zenturio).Unique, "der Zenturio ist einmalig");
            Pruef.Ok(Units.Def(Einheit.Springer).Directional && Units.Def(Einheit.Legionaer).Directional,
                     "Springer und Legionär haben eine Blickrichtung");
            Pruef.Ok(!Units.Def(Einheit.Tangolin).Directional, "der Tangolin hat keine");
            Pruef.Gleich("sieben ausbildbare Figuren", Units.TrainOrder.Length, 7);

            var alleTexte = true;
            foreach (var e in Units.TrainOrder)
            {
                var d = Units.Def(e);
                if (string.IsNullOrEmpty(d.Name) || string.IsNullOrEmpty(d.Short) ||
                    string.IsNullOrEmpty(d.Text) || d.Bullets == null || d.Bullets.Length == 0)
                {
                    alleTexte = false;
                }
            }
            Pruef.Ok(alleTexte, "jede Figur bringt ihre Regelkarte mit");
        }

        private static void Brett()
        {
            Pruef.Titel("Brett-Erzeugung");

            Zufall.Startwert(4711);
            var board = Board.Generate(10);

            Pruef.Gleich("zehn Plättchen gelegt", board.Tiles.Count, 10);
            Pruef.Ok(board.Keys.Count > 70, "das Brett hat " + board.Keys.Count +
                     " Felder (70 aus Plättchen plus Wasserrand)");

            var gras = 0; var wasser = 0; var rand = 0;
            foreach (var c in board.Alle())
            {
                if (c.Terrain == Gelaende.Gras) gras++; else wasser++;
                if (c.Rim > 0) rand++;
            }
            Pruef.Ok(gras > 0 && wasser > 0, "es gibt Gras (" + gras + ") und Wasser (" + wasser + ")");
            Pruef.Ok(rand > 0, "der Wasserrand liegt an (" + rand + " Felder)");

            /* Jedes Randfeld ist Wasser – die Insel hört nicht an einer Kante auf. */
            var randNurWasser = true;
            foreach (var c in board.Alle())
            {
                if (c.Rim > 0 && c.Terrain != Gelaende.Wasser) randNurWasser = false;
            }
            Pruef.Ok(randNurWasser, "der Rand besteht nur aus Wasser");

            /* Das Brett ist zusammenhängend: Von einem Feld aus sind alle
               erreichbar. Ein zerfallenes Brett wäre unspielbar. */
            var gesehen = new HashSet<string>();
            var stapel = new Stack<Cell>();
            var start = board.Cells[board.Keys[0]];
            stapel.Push(start);
            gesehen.Add(start.Key);
            while (stapel.Count > 0)
            {
                var cur = stapel.Pop();
                foreach (var nb in Hex.Neighbors(cur))
                {
                    var c = board.At(nb);
                    if (c == null || gesehen.Contains(c.Key)) continue;
                    gesehen.Add(c.Key);
                    stapel.Push(c);
                }
            }
            Pruef.Gleich("das Brett hängt zusammen", gesehen.Count, board.Keys.Count);

            // Derselbe Startwert muss dieselbe Insel ergeben
            Zufall.Startwert(4711);
            var zweites = Board.Generate(10);
            Pruef.Gleich("derselbe Startwert, dieselbe Insel", zweites.Keys.Count, board.Keys.Count);

            // Ein freies Grasfeld ist frei von Baum und Figur
            var frei = board.LandCells()[0];
            Pruef.Ok(Board.IsFree(frei), "ein leeres Grasfeld gilt als frei");
            frei.Tree = true;
            Pruef.Ok(!Board.IsFree(frei), "mit Baum nicht mehr");
            frei.Tree = false;
            frei.Piece = new Figur(Einheit.Worker, 0);
            Pruef.Ok(!Board.IsFree(frei), "mit Figur auch nicht");
        }

        private static void Wetterstapel()
        {
            Pruef.Titel("Wetterkarten");

            Pruef.Gleich("15 Wetterkarten und die Ruhe vor dem Sturm", Wetter.Karten.Count, 16);
            Pruef.Gleich("21 Karten im Stapel", Wetter.Stapel().Count, 21);

            var vollstaendig = true;
            foreach (var k in Wetter.Karten)
            {
                if (string.IsNullOrEmpty(k.Name) || string.IsNullOrEmpty(k.Kurz) ||
                    string.IsNullOrEmpty(k.Text) || string.IsNullOrEmpty(k.Icon) ||
                    string.IsNullOrEmpty(k.Farbe) || k.Menge <= 0) vollstaendig = false;
            }
            Pruef.Ok(vollstaendig, "jede Karte hat Name, Kurztext, Regeltext, Zeichen und Farbe");

            var leer = 0;
            foreach (var k in Wetter.Karten)
            {
                if (k.Effekt == null && k.Sofort == null && k.ExtraZug == 0) leer++;
            }
            Pruef.Gleich("nur eine Karte bewirkt nichts (die Ruhe)", leer, 1);

            // Die Wirkungen selbst – dieselben Zahlen wie in js/wetter.js
            Pruef.Gleich("Frost: Boote kosten nichts", Wetter.WirkungVon("frost").BootPreis, 0);
            Pruef.Gleich("Nebel: Schussweite 1", Wetter.WirkungVon("nebel").Schuss, 1);
            Pruef.Ok(Wetter.WirkungVon("nebel").NahSchlag, "Nebel: Läufer schlagen nur nebenan");
            Pruef.Gleich("Klare Sicht: Schussweite 3", Wetter.WirkungVon("klar").Schuss, 3);
            Pruef.Ok(Wetter.WirkungVon("klar").WeitSprung, "Klare Sicht: der Springer springt weiter");
            Pruef.Ok(!Wetter.WirkungVon("marsch").WeitSprung, "der Marschbefehl gilt dem Springer nicht");
            Pruef.Gleich("Schlamm: höchstens 2 Felder", Wetter.WirkungVon("schlamm").MaxWeite, 2);
            Pruef.Gleich("Belagerung: Umkreis 3", Wetter.WirkungVon("belagerung").Radius, 3);
            Pruef.Ok(Wetter.WirkungVon("hunger").KeineAusbildung, "Hungerwinter: niemand bildet aus");
            Pruef.Gleich("Markt: ein Holz billiger", Wetter.Kosten(3, Wetter.WirkungVon("markt")), 2);
            Pruef.Gleich("unter 1 Holz fällt nichts", Wetter.Kosten(1, Wetter.WirkungVon("markt")), 1);
            Pruef.Gleich("ohne Karte gilt der Grundpreis", Wetter.Kosten(3, Wetterlage.Neutral), 3);

            /* Eine Wirkung darf die neutrale Lage nicht verändern: Sie ist die
               gemeinsame Vorlage aller Karten. */
            Wetter.WirkungVon("frost");
            Pruef.Gleich("die neutrale Lage bleibt unberührt", Wetterlage.Neutral.BootPreis, 1);

            // Klares Wetter ist ein Zustand, keine Karte im Stapel
            Pruef.Ok(!Wetter.Stapel().Contains("kein"), "klares Wetter liegt nicht im Stapel");
            Pruef.Ok(Wetter.Finde("kein") != null, "die Anzeige findet es trotzdem");
        }
    }
}
