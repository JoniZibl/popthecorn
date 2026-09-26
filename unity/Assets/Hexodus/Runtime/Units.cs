/* Hexodus – Einheiten-Definitionen (Kosten, Texte, Fähigkeiten)

   Wörtliche Übertragung von js/units.js. Die Texte sind das Regelwerk, das
   im Spiel angezeigt wird – sie gehören zur Einheit und nicht in die
   Oberfläche, damit Regel und Anzeige nicht auseinanderlaufen. */
using System.Collections.Generic;

namespace Hexodus
{
    /// <summary>Figurenarten. Die Reihenfolge ist die der Suche in Ai.cs.</summary>
    public enum Einheit
    {
        King = 0, Worker = 1, Samurai = 2, Springer = 3,
        Legionaer = 4, Archer = 5, Tangolin = 6, Zenturio = 7,
        Boat = 8
    }

    public sealed class UnitDef
    {
        public Einheit Id;
        public string Name;
        public int? Cost;              // null = Startfigur, nicht ausbildbar
        public bool Trainable;
        public bool Directional;       // hat eine Blickrichtung (Springer, Legionär)
        public bool Unique;            // nur einmal pro Partie (Zenturio)
        public bool Objekt;            // kein Spieler gehört dazu (Boot)
        public string Short;
        public string Text;
        public string[] Bullets;
    }

    public static class Units
    {
        public static readonly Dictionary<Einheit, UnitDef> Defs = new Dictionary<Einheit, UnitDef>
        {
            [Einheit.King] = new UnitDef
            {
                Id = Einheit.King, Name = "Königs-Turm", Cost = null,
                Trainable = false, Directional = false,
                Short = "Zentrale Figur. Fällt er, scheidet der Spieler aus.",
                Text = "Der Königs-Turm ist die zentrale und wichtigste Figur im Spiel. Wird der " +
                       "Königs-Turm geschlagen, scheidet der Spieler aus dem Spiel aus, und alle " +
                       "seine Figuren werden vom Spielfeld entfernt. Der Angreifer erhält zudem " +
                       "all sein Holz.",
                Bullets = new[]
                {
                    "Der König darf für ein Holz ein Feld weit springen.",
                    "Ist um den König kein Platz vorhanden, kann er kein Feld springen.",
                    "Einheiten dürfen am Königs-Turm und an allen direkt verbundenen Einheiten ausgebildet werden."
                }
            },
            [Einheit.Worker] = new UnitDef
            {
                Id = Einheit.Worker, Name = "Arbeiter", Cost = 1,
                Trainable = true, Directional = false,
                Short = "Fällt Bäume und sammelt Holz. Zieht 1 Feld.",
                Text = "Der Arbeiter ist essenziell für das Spiel, da nur er Bäume fällen kann. Um " +
                       "einen Baum zu fällen, muss der Arbeiter das Feld betreten, auf dem der Baum " +
                       "steht, und erhält dann das Holz des Baumes. Der Arbeiter kann auch innerhalb " +
                       "seines Bewegungsradius angreifen.",
                Bullets = new[]
                {
                    "Zieht ein Feld in jede Richtung.",
                    "Betritt er ein Baumfeld, wird der Baum gefällt: +1 Holz.",
                    "Halte dir immer ein Holz parat, um einen Arbeiter ausbilden zu können."
                }
            },
            [Einheit.Samurai] = new UnitDef
            {
                Id = Einheit.Samurai, Name = "Samurai", Cost = 1,
                Trainable = true, Directional = false,
                Short = "Springt auf eine der 6 Diagonalen – über alles hinweg.",
                Text = "Der Samurai ist eine taktische Figur, die niemals alle Felder auf dem " +
                       "Spielfeld berühren kann. Wähle seinen Startpunkt und seine Bewegungen " +
                       "sorgfältig, um seine Effektivität zu maximieren.",
                Bullets = new[]
                {
                    "Springt auf eines der 6 diagonalen Felder – die Ecken um sein Feld herum.",
                    "Der Samurai kann über Wasser und über Bäume springen.",
                    "Auf den Diagonalen bleibt er sein Leben lang auf einem Drittel aller Felder."
                }
            },
            [Einheit.Springer] = new UnitDef
            {
                Id = Einheit.Springer, Name = "Springer", Cost = 2,
                Trainable = true, Directional = true,
                Short = "Springt 2 oder 3 Felder weit – in zwei benachbarte Richtungen.",
                Text = "Wenn der Springer ausgebildet wird, kannst du eine Richtung wählen. Der " +
                       "Springer kann ausschließlich in die gewählte Richtung springen. Er hat die " +
                       "Möglichkeit, sich zu Beginn seines Zuges zu springen und/oder zu drehen, um " +
                       "eine neue Richtung einzunehmen.",
                Bullets = new[]
                {
                    "Seine Richtung umfasst zwei benachbarte Richtungen – in beiden springt er genau 2 oder 3 Felder weit.",
                    "Der Springer kann über Bäume und über Wasser springen.",
                    "Nachdem er sich bewegt hat, kann er in der darauffolgenden Runde in die neue, zuvor gewählte Richtung weiterlaufen."
                }
            },
            [Einheit.Legionaer] = new UnitDef
            {
                Id = Einheit.Legionaer, Name = "Legionär", Cost = 2,
                Trainable = true, Directional = true,
                Short = "Läuft beliebig weit auf seiner Achse – vor oder zurück.",
                Text = "Wenn der Legionär ausgebildet wird, kannst du eine Richtung wählen. Der " +
                       "Legionär kann sich ausschließlich in die gewählte Richtung geradeaus oder " +
                       "rückwärts bewegen. Er hat die Möglichkeit, sich zu Beginn seines Zuges zu " +
                       "laufen und/oder zu drehen, um eine neue Richtung einzunehmen. Diese Rotation " +
                       "zählt als ein Zug.",
                Bullets = new[]
                {
                    "Läuft so weit es geht vor oder zurück auf seiner Achse.",
                    "Der Legionär kann nicht über Bäume springen.",
                    "Nachdem er sich bewegt hat, kann er in der darauffolgenden Runde in die neue Richtung weiterlaufen."
                }
            },
            [Einheit.Archer] = new UnitDef
            {
                Id = Einheit.Archer, Name = "Bogenschütze", Cost = 2,
                Trainable = true, Directional = false,
                Short = "Schießt auf Distanz 2 – oder läuft 1 Feld.",
                Text = "Der Bogenschütze ist die einzige Figur, die schießen oder laufen kann. Ein " +
                       "Schuss kostet einen Zug und ermöglicht es ihm, eine Figur aus der Ferne zu " +
                       "eliminieren, ohne sich zu bewegen.",
                Bullets = new[]
                {
                    "Der Bogenschütze kann sich auch normal bewegen, schlägt dabei aber keine Einheiten.",
                    "Der Bogenschütze kann über Bäume und über Wasser schießen.",
                    "Getroffen wird auf Distanz 2 in einer der 6 geraden Richtungen."
                }
            },
            [Einheit.Tangolin] = new UnitDef
            {
                Id = Einheit.Tangolin, Name = "Tangolin", Cost = 2,
                Trainable = true, Directional = false,
                Short = "Kettensprünge über Bäume und die eigene Seite – wer im Landefeld steht, fällt.",
                Text = "Der Tangolin kann unbegrenzt über Bäume und über Figuren der eigenen Seite " +
                       "springen. Übersprungen wird nur ein Sprungbrett; gelandet wird auch auf dem " +
                       "Gegner, und der fällt dabei. Danach darf der Sprung weitergehen – ein Zug " +
                       "kann so mehrere Figuren kosten.",
                Bullets = new[]
                {
                    "Sprungbrett ist ein Baum oder eine Figur der eigenen Seite. Über gegnerische " +
                    "Figuren springt er nicht – sie sperren ihm den Weg.",
                    "Steht auf dem Landefeld ein Gegner, schlägt er ihn und springt von dort weiter.",
                    "Er darf ins Wasser springen, wenn er sich dort ein Boot leistet: 1 Holz je " +
                    "Wasserfeld, auf dem noch keines liegt – so oft, wie das Holz reicht.",
                    "Der Tangolin kann auch 1 Feld normal ziehen und dabei in jede Richtung schlagen."
                }
            },
            [Einheit.Zenturio] = new UnitDef
            {
                Id = Einheit.Zenturio, Name = "Zenturio", Cost = 3,
                Trainable = true, Directional = false, Unique = true,
                Short = "Läuft beliebig weit in jede Richtung und trägt das Feldzeichen. Nur einmal pro Spiel.",
                Text = "Der Zenturio ist die stärkste Figur im Spiel. Er kostet drei Holz und kann in " +
                       "jede Richtung so weit es geht laufen. Er trägt außerdem das Feldzeichen: An " +
                       "ihm darf ausgebildet werden wie am Königs-Turm.",
                Bullets = new[]
                {
                    "Der Zenturio kann nicht über Bäume springen, er darf allerdings in jede Richtung laufen.",
                    "Er ist der zweite Anker deiner Versorgungskette: An ihm und an allen Einheiten, " +
                    "die über eine lückenlose Kette an ihm hängen, darf ausgebildet werden – auch " +
                    "wenn die Verbindung zum eigenen Turm gerissen ist.",
                    "Damit ist er ein vorgeschobener Stützpunkt. Wer ihn schlägt, kappt dem Gegner den Nachschub.",
                    "Beachte, dass jeder Spieler den Zenturio nur einmal pro Spiel ausbilden darf."
                }
            },
            [Einheit.Boat] = new UnitDef
            {
                Id = Einheit.Boat, Name = "Boot", Cost = 1,
                Trainable = false, Directional = false, Objekt = true,
                Short = "Neutrales Boot – macht ein Wasserfeld begehbar.",
                Text = "Das Boot ist ein neutrales Objekt und kann von allen Spielern gleichermaßen " +
                       "genutzt werden. Jeder Spieler kann beliebig viele Boote kaufen. Um ein Boot " +
                       "zu setzen, muss die Figur während ihres regulären Spielzugs von Land auf das " +
                       "Wasser ziehen. Das kostet 1 Holz. Das Boot wird direkt unter die Figur gelegt " +
                       "und bleibt dort, solange sie sich auf dem Wasser befindet.",
                Bullets = new[]
                {
                    "Mit Boot bewegt sich eine Figur auf dem Wasser genauso wie an Land.",
                    "Verlässt die Figur das Wasser, bleibt das Boot auf dem letzten Wasserfeld " +
                    "zurück und darf später von jedem Spieler genutzt werden.",
                    "Für einen neuen Einstieg an anderer Stelle muss ein neues Boot gekauft werden.",
                    "Wer über mehrere Wasserabschnitte zieht, zahlt für jeden Abschnitt ein Boot."
                }
            }
        };

        /// <summary>Reihenfolge im Ausbildungs-Menü.</summary>
        public static readonly Einheit[] TrainOrder =
        {
            Einheit.Worker, Einheit.Samurai, Einheit.Springer, Einheit.Legionaer,
            Einheit.Archer, Einheit.Tangolin, Einheit.Zenturio
        };

        public static UnitDef Def(Einheit e) { return Defs[e]; }

        /// <summary>Grundkosten einer Einheit (ohne Wetter). 0 = Startfigur.</summary>
        public static int Kosten(Einheit e)
        {
            var c = Defs[e].Cost;
            return c ?? 0;
        }

        /* Die Kennung, die die JS-Fassung als Typ benutzt: "king", "worker",
           "samurai", ... Das ist der Name des Aufzählungswerts in
           Kleinbuchstaben – die Namen sind genau dafür so gewählt.

           Gebraucht wird das für die Stellungs-Kennung (Spielstand.PositionKey).
           Die muss zeichengleich mit js/game.js sein, weil der Computergegner
           Stellungen darüber vergleicht: Eine Kennung, die sich unterscheidet,
           ließe ihn eigene Wiederholungen nicht mehr erkennen. */
        public static string Kennung(Einheit e)
        {
            return e.ToString().ToLowerInvariant();
        }
    }
}
