/* Hexodus – Spielzustand, Mannschaften und Farben

   Erster Teil der Übertragung von js/game.js: alles, was eine Partie *ist*.
   Der Ablauf – ziehen, schlagen, ausbilden, Wetter takten – steht in
   Game.cs und arbeitet auf diesen Feldern.

   Die Namen der Felder sind absichtlich dieselben wie in der JS-Fassung
   (nur groß geschrieben): Wer beide nebeneinanderlegt, soll Zeile für Zeile
   vergleichen können. Genau davon lebt eine Portierung, die 1:1 sein will. */
using System;
using System.Collections.Generic;

namespace Hexodus
{
    public enum Phase { Trees, Kings, Play, Over }

    public sealed class Spieler
    {
        public int Index;
        public string Ai;                  // null = Mensch, sonst Spielstärke
        public string Name;
        public int Team;
        public string Color;               // Farbe als #rrggbb – die Anzeige übersetzt sie
        public string ColorName;
        public int Wood;
        public int TreesLeft;
        public bool Eliminated;
        public Dictionary<Einheit, int> Trained = new Dictionary<Einheit, int>();

        public bool HatAusgebildet(Einheit e)
        {
            int n;
            return Trained.TryGetValue(e, out n) && n > 0;
        }
    }

    public sealed class Farbfamilie
    {
        public string Id;
        public string Name;
        public string[] Shades;
    }

    /// <summary>Was zuletzt geschah – die Anzeige erkennt daran Neues.</summary>
    public sealed class ZugEreignis
    {
        public string FromKey, ToKey;
        public Einheit Type;
        public int Owner;
        public string Kind;
        public List<string> Path;
        public int MoveNo;
    }

    public sealed class SchlagEreignis
    {
        public string Key;
        public Einheit Type;
        public int Owner;
        public int By;
        public int MoveNo;
    }

    public sealed class FeldEreignis
    {
        public string Key;
        public Einheit Type;
        public int Owner;
        public int MoveNo;
    }

    public sealed class LogZeile
    {
        public string Text;
        public int? Player;
        public LogZeile(string text, int? player) { Text = text; Player = player; }
    }

    public sealed class Aufbau
    {
        public int Tiles;
        public int Trees;
    }

    public sealed partial class Spielstand
    {
        // Spielmaterial nach Spielerzahl (siehe Spielaufbau)
        public static readonly Dictionary<int, Aufbau> Setup = new Dictionary<int, Aufbau>
        {
            [2] = new Aufbau { Tiles = 10, Trees = 30 },
            [3] = new Aufbau { Tiles = 20, Trees = 45 },
            [4] = new Aufbau { Tiles = 25, Trees = 60 },
            [5] = new Aufbau { Tiles = 30, Trees = 75 },
            [6] = new Aufbau { Tiles = 35, Trees = 90 },
            [7] = new Aufbau { Tiles = 40, Trees = 105 },
            [8] = new Aufbau { Tiles = 45, Trees = 120 }
        };

        public const int MaxPlayers = 8;

        /* Farben sind nach Mannschaften geordnet: Jede Mannschaft hat eine
           Familie, innerhalb der Familie unterscheiden sich die Spieler durch
           die Helligkeit. Wer zusammen spielt, ist auf einen Blick zusammen zu
           sehen, bleibt aber einzeln unterscheidbar. Grün fehlt mit Absicht –
           das ist die Wiese. */
        public static readonly Farbfamilie[] TeamColors =
        {
            new Farbfamilie { Id = "blau",    Name = "Blau",    Shades = new[] { "#3b82f6", "#93c5fd", "#1d4ed8", "#60a5fa" } },
            new Farbfamilie { Id = "pink",    Name = "Pink",    Shades = new[] { "#ec4899", "#fbcfe8", "#9d174d", "#f9a8d4" } },
            new Farbfamilie { Id = "gelb",    Name = "Gelb",    Shades = new[] { "#eab308", "#fde047", "#a16207", "#fbbf24" } },
            new Farbfamilie { Id = "orange",  Name = "Orange",  Shades = new[] { "#f97316", "#fdba74", "#9a3412", "#fb923c" } },
            new Farbfamilie { Id = "violett", Name = "Violett", Shades = new[] { "#a855f7", "#d8b4fe", "#6b21a8", "#c084fc" } },
            new Farbfamilie { Id = "tuerkis", Name = "Türkis",  Shades = new[] { "#06b6d4", "#a5f3fc", "#0e7490", "#22d3ee" } },
            new Farbfamilie { Id = "rot",     Name = "Rot",     Shades = new[] { "#ef4444", "#fecaca", "#991b1b", "#f87171" } },
            new Farbfamilie { Id = "grau",    Name = "Grau",    Shades = new[] { "#94a3b8", "#e2e8f0", "#475569", "#cbd5e1" } }
        };

        public static readonly string[] ShadeNames = { "", " hell", " dunkel", " blass" };

        // ---------------- Der Zustand selbst ----------------

        public Board Board;
        public List<Spieler> Players = new List<Spieler>();
        public int[] Teams;                    // Teams[i] = Mannschaft von Spieler i

        // Wetterkarten: eigene Spielweise
        public bool WetterAn;
        public List<string> Stapel = new List<string>();
        public List<string> Ablage = new List<string>();
        public string Karte;                   // was gerade gilt (null = klar)
        public string Kommt;                   // was aufzieht
        public int KarteNr;                    // zählt gültige Karten
        public int KommtNr;
        public int KarteZaehler;               // Züge, die die geltende Karte noch hat
        public int KommtZaehler;               // Züge, bis die aufziehende eintritt
        public string KarteText;
        public List<string> KarteFelder;
        public int Extra;                      // offene Extra-Züge (Aufbruch)
        public bool Nochmal;                   // bleibt derselbe Spieler am Zug?

        public Phase Phase = Phase.Trees;
        public Dictionary<string, int> History = new Dictionary<string, int>();
        public List<string> HistOrder = new List<string>();
        public int SinceProgress;
        public int? LastProgressBy;
        public string EndReason;
        public int MoveNo;

        public ZugEreignis LastMove;
        public SchlagEreignis LastCapture;
        public List<SchlagEreignis> LastCaptures = new List<SchlagEreignis>();
        public FeldEreignis LastHarvest;
        public FeldEreignis LastTrain;

        public int Current;
        public Pending Pending;
        public bool AwaitWorker;
        public string Selected;
        public int Turn = 1;
        public int Passes;
        public int? Winner;
        public int? WinnerTeam;
        public List<LogZeile> Log = new List<LogZeile>();

        // ---------------- Mannschaften ----------------

        /* Farbe je Spieler: die Familie kommt von der Mannschaft, die Helligkeit
           von der Reihenfolge innerhalb der Mannschaft. */
        public static List<(string Hex, string Name)> ColorsFor(int[] teams)
        {
            var proTeam = new Dictionary<int, int>();
            var aus = new List<(string, string)>();
            foreach (var t in teams)
            {
                var fam = TeamColors[((t % TeamColors.Length) + TeamColors.Length) % TeamColors.Length];
                int k;
                k = proTeam.TryGetValue(t, out k) ? k + 1 : 0;
                proTeam[t] = k;
                aus.Add((fam.Shades[k % fam.Shades.Length],
                         fam.Name + ShadeNames[k % ShadeNames.Length]));
            }
            return aus;
        }

        public static int[] NormalizeTeams(int[] teams, int count)
        {
            var aus = new int[count];
            for (var i = 0; i < count; i++)
            {
                aus[i] = (teams != null && i < teams.Length && teams[i] >= 0) ? teams[i] : i;
            }
            return aus;
        }

        /// <summary>Spielen zwei Spieler zusammen? Mit sich selbst immer.</summary>
        public static bool Allied(int[] teams, int a, int b)
        {
            if (a == b) return true;
            if (teams == null) return false;
            return teams[a] == teams[b];
        }

        public bool Verbuendet(int a, int b) { return Allied(Teams, a, b); }

        public List<Spieler> TeamMembers(int team)
        {
            var aus = new List<Spieler>();
            foreach (var p in Players) if (Teams[p.Index] == team) aus.Add(p);
            return aus;
        }

        public List<int> TeamsAlive()
        {
            var seen = new HashSet<int>();
            var aus = new List<int>();
            foreach (var p in Players)
            {
                if (p.Eliminated) continue;
                var t = Teams[p.Index];
                if (seen.Add(t)) aus.Add(t);
            }
            return aus;
        }

        /* Wie heißt die Mannschaft? Bei "jeder für sich" ist das der
           Spielername, sonst die Farbfamilie, die sich alle Mitglieder teilen. */
        public string TeamName(int team)
        {
            var mit = TeamMembers(team);
            if (mit.Count <= 1) return mit.Count > 0 ? mit[0].Name : "Mannschaft " + (team + 1);
            return "Team " + TeamColors[team % TeamColors.Length].Name;
        }

        public List<Spieler> AlivePlayers()
        {
            var aus = new List<Spieler>();
            foreach (var p in Players) if (!p.Eliminated) aus.Add(p);
            return aus;
        }

        // ---------------- Neue Partie ----------------

        public static Spielstand Create(IList<string> playerNames, IList<string> kinds = null,
                                        int[] teams = null, bool wetter = false)
        {
            var count = playerNames.Count;
            var st = new Spielstand();
            st.Teams = NormalizeTeams(teams, count);
            var cfg = Setup[count];
            st.Board = Board.Generate(cfg.Tiles);
            st.Board.Teams = (int[])st.Teams.Clone();
            st.Board.Wetter = Wetterlage.Neutral;

            // Bäume gleichmäßig verteilen; pro Spieler bleiben mindestens 6
            // Felder frei, damit Türme und Arbeiter noch Platz finden.
            var land = st.Board.LandCells().Count;
            var maxTrees = land - count * 6;
            var total = Math.Min(cfg.Trees, Math.Max(count * 4, maxTrees));
            var perPlayer = total / count;

            var farben = ColorsFor(st.Teams);
            for (var i = 0; i < count; i++)
            {
                st.Players.Add(new Spieler
                {
                    Index = i,
                    Ai = (kinds != null && i < kinds.Count) ? kinds[i] : null,
                    Name = string.IsNullOrEmpty(playerNames[i]) ? "Spieler " + (i + 1) : playerNames[i],
                    Team = st.Teams[i],
                    Color = farben[i].Hex,
                    ColorName = farben[i].Name,
                    TreesLeft = perPlayer
                });
            }

            st.WetterAn = wetter;
            // Der Stapel liegt von Anfang an gemischt bereit, wie am Tisch
            if (wetter) st.Stapel = Wetter.Mischen(Wetter.Stapel());
            return st;
        }
    }

    public sealed class Pending
    {
        public string Kind;                // "rotate" | "trainFacing"
        public string Key;
        public Pending(string kind, string key) { Kind = kind; Key = key; }
    }
}
