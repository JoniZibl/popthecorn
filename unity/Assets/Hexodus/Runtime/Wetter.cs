/* Hexodus – Wetterkarten (eigene Spielweise)

   Wörtliche Übertragung von js/wetter.js.

   Das Standardspiel bleibt, wie es ist. Wer mit Wetter spielt, deckt eine
   Karte auf, sobald eine Figur fällt. Sie zieht erst einmal auf: Zunächst
   läuft eine volle Runde ohne Wirkung ab, danach gilt sie zwei volle Runden
   lang für alle gleichermaßen.

   Jede Karte verändert eine ganze Regel-Schicht – Gelände, Sicht, Wirtschaft,
   Nachschub, Bewegung –, nie nur eine einzelne Figur.

   Technisch ist eine Karte zweierlei:
   * `Effekt` – Zahlen und Schalter, die beide Zuggeneratoren lesen (Moves.cs
     für das Regelwerk, Ai.cs für die Suche). Die Wirkung hängt am Brett.
   * `Sofort` – eine einmalige Änderung am Brett beim Eintreten (Bäume fallen,
     Bäume wachsen, Arbeiter rücken ein). Sie geschieht einmal und bleibt. */
using System;
using System.Collections.Generic;

namespace Hexodus
{
    /// <summary>Was eine Karte am Regelwerk dreht. Alle Stellschrauben an einer Stelle.</summary>
    public sealed class Wetterlage
    {
        public string Id;
        public int BootPreis = 1;          // was ein Boot kostet (Frost: 0)
        public int Schuss = 2;             // Schussweite (Nebel 1, Klare Sicht 3)
        public bool NahSchlag;             // Nebel: Läufer schlagen nur direkt vor sich
        public bool WeitSprung;            // Klare Sicht: Springer 2, 3 oder 4 Felder
        public int MaxWeite;               // 0 = unbegrenzt; Schlamm: höchstens 2 Felder
        public bool ExtraFeld;             // Marschbefehl: Schrittfiguren ein Feld weiter
        public bool FreieRichtung;         // Windstille: Springer und Legionär in jede Richtung
        public int Kosten;                 // Markt: -1 auf jede Ausbildung
        public bool KeineAusbildung;       // Hungerwinter
        public bool Luecke;                // Feldlager: die Kette überspringt ein Feld
        public int Radius;                 // Belagerung: Nachschub nur so weit um die Anker
        public bool FaellenFrei;           // Trockenheit: Fällen kostet den Zug nicht

        public static readonly Wetterlage Neutral = new Wetterlage();

        public Wetterlage Kopie()
        {
            return (Wetterlage)MemberwiseClone();
        }
    }

    /// <summary>Was eine einmalige Kartenwirkung am Brett angerichtet hat.</summary>
    public sealed class SofortFolge
    {
        public string Text;
        public List<string> Felder = new List<string>();
    }

    /// <summary>Was die Sofortkarten vom Spielstand brauchen, ohne ihn zu kennen.</summary>
    public sealed class WetterHilfe
    {
        public Func<Spielstand, int, Einheit, bool> HatTyp;
        public Func<Spielstand, int, Cell> NachschubFeld;
    }

    public delegate SofortFolge SofortWirkung(Spielstand st, WetterHilfe hilfe);

    public sealed class Karte
    {
        public string Id, Name, Icon, Farbe, Gruppe, Kurz, Text;
        public int Menge = 1;
        public Action<Wetterlage> Effekt;
        public SofortWirkung Sofort;
        public int ExtraZug;
    }

    public static class Wetter
    {
        /// <summary>Wirkung, die gerade am Brett hängt. Ohne Wetter die neutrale.</summary>
        public static Wetterlage Wirkung(Board board)
        {
            return (board != null && board.Wetter != null) ? board.Wetter : Wetterlage.Neutral;
        }

        // ---------------- Einmalige Änderungen am Brett ----------------

        /* Windbruch: Jeder Baum, der allein steht, fällt – und sein Holz bekommt
           niemand. Ein Baum mit Nachbarn steht im Windschatten. Der Wald wird
           lichter und klumpiger: weniger Sprungbretter, längere Sichtachsen. */
        private static SofortFolge Windbruch(Spielstand st, WetterHilfe hilfe)
        {
            var board = st.Board;
            var weg = new List<Cell>();
            foreach (var c in board.Alle())
            {
                if (!c.Tree) continue;
                var nachbar = false;
                foreach (var nb in Hex.Neighbors(c))
                {
                    var n = board.At(nb);
                    if (n != null && n.Tree) { nachbar = true; break; }
                }
                if (!nachbar) weg.Add(c);
            }
            foreach (var c in weg) c.Tree = false;

            var folge = new SofortFolge
            {
                Text = weg.Count > 0
                    ? weg.Count + (weg.Count == 1 ? " einzelner Baum fällt."
                                                  : " einzeln stehende Bäume fallen.")
                    : "Kein Baum steht allein – es bleibt alles stehen."
            };
            foreach (var c in weg) folge.Felder.Add(c.Key);
            return folge;
        }

        /* Neuer Wuchs: Wo zwei Bäume nebeneinanderstehen, wächst dazwischen ein
           dritter – das Gegenstück zum Windbruch und der einzige Weg, auf dem
           neues Holz ins Spiel kommt. Gedeckelt, weil auch am Tisch nur eine
           Handvoll Bäume im Vorrat liegt. */
        public const int WuchsMax = 8;

        private static SofortFolge NeuerWuchs(Spielstand st, WetterHilfe hilfe)
        {
            var board = st.Board;
            var neu = new List<Cell>();
            foreach (var c in board.Alle())
            {
                if (neu.Count >= WuchsMax) break;
                if (c.Terrain != Gelaende.Gras || c.Tree || c.Piece != null || c.Boat) continue;
                var n = 0;
                foreach (var nb in Hex.Neighbors(c))
                {
                    var x = board.At(nb);
                    if (x != null && x.Tree) n++;
                }
                if (n >= 2) neu.Add(c);
            }
            foreach (var c in neu) c.Tree = true;

            var folge = new SofortFolge
            {
                Text = neu.Count > 0
                    ? neu.Count + (neu.Count == 1 ? " Baum wächst nach." : " Bäume wachsen nach.")
                    : "Nirgends stehen zwei Bäume beieinander – nichts wächst."
            };
            foreach (var c in neu) folge.Felder.Add(c.Key);
            return folge;
        }

        /* Musterung: Wer keinen Arbeiter mehr hat, bekommt einen gestellt. Der
           Arbeiter ist die einzige Quelle für Holz – ohne ihn ist eine Partie
           gelaufen, auch wenn der Turm noch steht. Die Karte ist kein Geschenk
           an den Führenden, sondern eine Hand für den, dem er ausgegangen ist. */
        private static SofortFolge Musterung(Spielstand st, WetterHilfe hilfe)
        {
            var geholfen = new List<int>();
            var folge = new SofortFolge();
            foreach (var pl in st.Players)
            {
                if (pl.Eliminated) continue;
                if (hilfe.HatTyp(st, pl.Index, Einheit.Worker)) continue;
                var feld = hilfe.NachschubFeld(st, pl.Index);
                if (feld == null) continue;
                feld.Piece = new Figur(Einheit.Worker, pl.Index);
                geholfen.Add(pl.Index);
                folge.Felder.Add(feld.Key);
            }
            if (geholfen.Count == 0)
            {
                folge.Text = "Alle haben ihren Arbeiter – niemand rückt nach.";
                return folge;
            }
            var namen = new List<string>();
            foreach (var i in geholfen) namen.Add(st.Players[i].Name);
            folge.Text = string.Join(", ", namen) +
                (geholfen.Count == 1 ? " bekommt einen Arbeiter gestellt."
                                     : " bekommen einen Arbeiter gestellt.");
            return folge;
        }

        // ---------------- Die Karten ----------------

        public static readonly List<Karte> Karten = new List<Karte>
        {
            // --- Gelände ---
            new Karte
            {
                Id = "frost", Name = "Frost", Icon = "❄️", Farbe = "#7dd3fc",
                Gruppe = "Gelände", Menge = 1,
                Kurz = "Das Wasser trägt: Boote kosten nichts.",
                Text = "Über Nacht ist das Wasser hart geworden. Wer aufs Wasser zieht, solange die " +
                       "Karte liegt, bekommt sein Boot umsonst – für jedes Feld, so oft er will. " +
                       "Inseln, Buchten und ganze Küstenlinien stehen plötzlich offen; wer sich " +
                       "hinter dem Wasser sicher wähnte, ist es nicht mehr.",
                Effekt = w => w.BootPreis = 0
            },
            new Karte
            {
                Id = "windbruch", Name = "Windbruch", Icon = "🍃", Farbe = "#a8a29e",
                Gruppe = "Gelände", Menge = 1,
                Kurz = "Jeder Baum ohne Nachbarbaum fällt – ohne Holz für irgendwen.",
                Text = "Ein Sturm geht über die Insel. Jeder Baum, der allein steht, wird " +
                       "umgeworfen; sein Holz bekommt niemand – es liegt zersplittert im Unterholz. " +
                       "Bäume mit Nachbarn stehen im Windschatten und bleiben. Der Wald wird lichter " +
                       "und klumpiger: weniger Sprungbretter für den Tangolin, längere Sichtachsen.",
                Sofort = Windbruch
            },
            new Karte
            {
                Id = "wuchs", Name = "Neuer Wuchs", Icon = "🌱", Farbe = "#86efac",
                Gruppe = "Gelände", Menge = 1,
                Kurz = "Zwischen zwei Bäumen wächst ein neuer – höchstens acht.",
                Text = "Regen und Sonne zur rechten Zeit. Auf jedem freien Grasfeld, das an " +
                       "mindestens zwei Bäume grenzt, wächst ein neuer Baum – bis der Vorrat von " +
                       "acht erschöpft ist. Das Gegenstück zum Windbruch und der einzige Weg, auf " +
                       "dem neues Holz ins Spiel kommt. Neue Bäume versperren allerdings auch Wege " +
                       "und Ausbildungsfelder.",
                Sofort = NeuerWuchs
            },

            // --- Sicht ---
            new Karte
            {
                Id = "nebel", Name = "Nebel", Icon = "🌫️", Farbe = "#cbd5e1",
                Gruppe = "Sicht", Menge = 2,
                Kurz = "Auf Distanz trifft niemand: Schuss nur 1 Feld, Läufer nur direkt vor sich.",
                Text = "Milchige Schwaden liegen über der Insel, und was weiter weg steht, ist nur " +
                       "noch ein Schatten. Der Bogenschütze trifft nur auf Distanz 1. Legionär und " +
                       "Zenturio laufen zwar so weit wie immer, schlagen aber nur, was direkt vor " +
                       "ihnen steht – eine Figur am Ende der Bahn verschwindet im Dunst.",
                Effekt = w => { w.Schuss = 1; w.NahSchlag = true; }
            },
            new Karte
            {
                Id = "klar", Name = "Klare Sicht", Icon = "☀️", Farbe = "#fde047",
                Gruppe = "Sicht", Menge = 1,
                Kurz = "Jeder sieht weiter: Schuss 3 Felder, der Springer springt bis 4.",
                Text = "Ein Tag ohne Dunst, die Luft steht still und klar. Der Bogenschütze trifft " +
                       "auf Distanz 3 statt 2 – über Bäume und Wasser hinweg wie immer –, und der " +
                       "Springer sieht so weit, dass er 2, 3 oder 4 Felder springt.",
                Effekt = w => { w.Schuss = 3; w.WeitSprung = true; }
            },
            new Karte
            {
                Id = "windstille", Name = "Windstille", Icon = "🪶", Farbe = "#fcd34d",
                Gruppe = "Sicht", Menge = 1,
                Kurz = "Springer und Legionär ziehen in jede Richtung.",
                Text = "Keine Fahne rührt sich, kein Wimpel zeigt irgendwohin. Springer und Legionär " +
                       "sind nicht an ihre Blickrichtung gebunden und ziehen in jede der sechs " +
                       "Richtungen. Ihre Pfeile bleiben, wo sie stehen – gedreht wird nichts, es ist " +
                       "nur einmal gleich, wohin sie zeigen.",
                Effekt = w => w.FreieRichtung = true
            },

            // --- Wirtschaft ---
            new Karte
            {
                Id = "trockenheit", Name = "Trockenheit", Icon = "🌾", Farbe = "#fbbf24",
                Gruppe = "Wirtschaft", Menge = 2,
                Kurz = "Bäume fällen kostet keinen Zug.",
                Text = "Das Holz ist staubtrocken und fällt fast von selbst. Der Arbeiter fällt einen " +
                       "Baum und ist danach noch am Zug – so oft, wie Bäume neben ihm stehen, und das " +
                       "zwei Runden lang. Es entsteht kein Holz aus dem Nichts: Jeder Baum gibt genau " +
                       "ein Holz wie immer, es geht nur schneller.",
                Effekt = w => w.FaellenFrei = true
            },
            new Karte
            {
                Id = "markt", Name = "Fahrender Markt", Icon = "🛒", Farbe = "#f59e0b",
                Gruppe = "Wirtschaft", Menge = 1,
                Kurz = "Jede Ausbildung kostet 1 Holz weniger (mindestens 1).",
                Text = "Händler sind auf der Insel gelandet und verkaufen unter Preis. Jede Einheit " +
                       "kostet ein Holz weniger, mindestens aber eines. Der Zenturio für zwei Holz " +
                       "statt drei ist die Gelegenheit, auf die man ein paar Runden gewartet hat.",
                Effekt = w => w.Kosten = -1
            },
            new Karte
            {
                Id = "hunger", Name = "Hungerwinter", Icon = "🌨️", Farbe = "#94a3b8",
                Gruppe = "Wirtschaft", Menge = 1,
                Kurz = "Solange sie gilt, bildet niemand aus.",
                Text = "Die Vorräte sind knapp, in den Lagern wird nicht ausgebildet. Solange die " +
                       "Karte liegt, entsteht keine einzige neue Einheit – bei niemandem. Gefällt, " +
                       "gezogen und geschlagen wird weiter; wer Holz sammelt, sammelt es für danach.",
                Effekt = w => w.KeineAusbildung = true
            },

            // --- Nachschub ---
            new Karte
            {
                Id = "feldlager", Name = "Feldlager", Icon = "⛺", Farbe = "#fb923c",
                Gruppe = "Nachschub", Menge = 1,
                Kurz = "Die Kette überspringt ein Feld ohne Figur.",
                Text = "Läufer tragen den Nachschub über die Lücke. Die Versorgungskette darf ein " +
                       "Feld überspringen: Zwei eigene Figuren mit genau einem Feld ohne Figur " +
                       "dazwischen gelten als verbunden – ob dort Gras, ein Baum oder Wasser liegt, " +
                       "ist gleich. Steht eine fremde Figur in der Lücke, reißt die Kette doch.",
                Effekt = w => w.Luecke = true
            },
            new Karte
            {
                Id = "belagerung", Name = "Belagerung", Icon = "🛡️", Farbe = "#ef4444",
                Gruppe = "Nachschub", Menge = 1,
                Kurz = "Nachschub nur im Umkreis von 3 Feldern um Turm und Feldzeichen.",
                Text = "Die Wege sind abgeschnitten. Ausgebildet wird nur noch an Feldern, die " +
                       "höchstens drei Felder von einem eigenen Königs-Turm oder Feldzeichen " +
                       "entfernt liegen – wie lang die Kette auch sein mag. Lange Ketten quer über " +
                       "die Insel nützen nichts; wer vorn nachschieben will, braucht den Zenturio dort.",
                Effekt = w => w.Radius = 3
            },
            new Karte
            {
                Id = "musterung", Name = "Musterung", Icon = "🪓", Farbe = "#a78bfa",
                Gruppe = "Nachschub", Menge = 1,
                Kurz = "Wer keinen Arbeiter mehr hat, bekommt einen gestellt.",
                Text = "Es wird gemustert: Jeder Spieler ohne Arbeiter bekommt einen an seinen Turm " +
                       "oder an sein Feldzeichen gestellt – umsonst. Der Arbeiter ist die einzige " +
                       "Quelle für Holz; wem er ausgegangen ist, dem ist die Partie sonst gelaufen, " +
                       "auch wenn sein Turm noch steht. Wer seinen Arbeiter hat, bekommt nichts.",
                Sofort = Musterung
            },

            // --- Bewegung und Tempo ---
            new Karte
            {
                Id = "schlamm", Name = "Schlamm", Icon = "🌧️", Farbe = "#a16207",
                Gruppe = "Bewegung", Menge = 2,
                Kurz = "Kein Zug führt weiter als 2 Felder.",
                Text = "Regen hat den Boden aufgeweicht. Kein Zug führt weiter als zwei Felder vom " +
                       "Startfeld weg: Legionär und Zenturio bleiben nach zwei Feldern stecken, der " +
                       "Springer springt nur die kurze Weite, und der Tangolin kommt über einen " +
                       "einzigen Sprung nicht hinaus. Schritte über ein Feld merken den Schlamm nicht.",
                Effekt = w => w.MaxWeite = 2
            },
            new Karte
            {
                Id = "marsch", Name = "Marschbefehl", Icon = "🥁", Farbe = "#60a5fa",
                Gruppe = "Bewegung", Menge = 2,
                Kurz = "Arbeiter, Bogenschütze, Tangolin und Turm ziehen 2 Felder.",
                Text = "Die Trommel gibt den Takt vor. Arbeiter, Bogenschütze, Tangolin und " +
                       "Königs-Turm ziehen zwei Felder geradeaus statt eines – das Feld dazwischen " +
                       "muss frei sein, marschiert wird, nicht gesprungen. Gefällt wird weiter nur " +
                       "vom Nachbarfeld aus.",
                Effekt = w => w.ExtraFeld = true
            },
            new Karte
            {
                Id = "aufbruch", Name = "Aufbruch", Icon = "📯", Farbe = "#fcd34d",
                Gruppe = "Bewegung", Menge = 1,
                Kurz = "Wer als Erster unter der Karte zieht, hat zwei Züge.",
                Text = "Das Horn ruft zum Aufbruch. Wer als Erster unter dieser Karte zieht – also " +
                       "der, der sie aufgedeckt hat, sobald er wieder an der Reihe ist –, führt zwei " +
                       "Aktionen nacheinander aus statt einer. Alle anderen ziehen wie immer.",
                ExtraZug = 1
            },

            // --- Füllkarte ---
            new Karte
            {
                Id = "ruhe", Name = "Ruhe vor dem Sturm", Icon = "🌙", Farbe = "#64748b",
                Gruppe = "Ruhe", Menge = 2,
                Kurz = "Der Sturm bleibt aus. Es wird gespielt wie immer.",
                Text = "Es hat sich zusammengebraut – und dann doch nichts. Keine Regel ändert sich, " +
                       "es wird gespielt wie im Standardspiel. Zwei dieser Karten liegen im Stapel: " +
                       "Nicht jeder Schlag soll das Brett umkippen."
            }
        };

        /* Klares Wetter: keine Karte, sondern der Zustand dazwischen. Er liegt
           nicht im Stapel und wird nie gezogen – die Anzeige braucht ihn nur,
           um zeigen zu können, dass gerade nichts gilt. */
        public static readonly Karte Klar = new Karte
        {
            Id = "kein", Name = "Klares Wetter", Icon = "🌤️", Farbe = "#7f8c9b",
            Gruppe = "Wetter", Menge = 0,
            Kurz = "Keine Karte gilt. Fällt jetzt eine Figur, dreht der Wind.",
            Text = "Zwischen zwei Karten ist das Wetter klar, und es wird nach den Grundregeln " +
                   "gespielt. Nur jetzt lässt sich das Wetter drehen: Wer als Nächster eine Figur " +
                   "schlägt, deckt die oberste Karte des Stapels auf."
        };

        private static readonly Dictionary<string, Karte> NachId = BaueIndex();

        private static Dictionary<string, Karte> BaueIndex()
        {
            var d = new Dictionary<string, Karte>();
            foreach (var k in Karten) d[k.Id] = k;
            return d;
        }

        public static Karte Finde(string id)
        {
            if (id == Klar.Id) return Klar;
            Karte k;
            return NachId.TryGetValue(id, out k) ? k : null;
        }

        /// <summary>Der Stapel: jede Karte so oft, wie ihre Menge sagt.</summary>
        public static List<string> Stapel()
        {
            var aus = new List<string>();
            foreach (var k in Karten)
            {
                for (var i = 0; i < k.Menge; i++) aus.Add(k.Id);
            }
            return aus;
        }

        public static List<string> Mischen(List<string> liste)
        {
            Zufall.Mischen(liste);
            return liste;
        }

        /// <summary>Wirkung einer Karte – das, was ans Brett gehängt wird.</summary>
        public static Wetterlage WirkungVon(string id)
        {
            var k = Finde(id);
            if (k == null) return Wetterlage.Neutral;
            var w = Wetterlage.Neutral.Kopie();
            w.Id = id;
            if (k.Effekt != null) k.Effekt(w);
            return w;
        }

        /* Was eine Einheit gerade kostet. Unter 1 fällt keine Karte: Umsonst
           gibt es auch auf dem fahrenden Markt nichts. */
        public static int Kosten(int grund, Wetterlage w)
        {
            if (grund <= 0) return grund;
            return Math.Max(1, grund + (w != null ? w.Kosten : 0));
        }
    }
}
