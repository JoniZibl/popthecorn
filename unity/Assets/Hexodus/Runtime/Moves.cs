/* Hexodus – Regelwerk: legale Aktionen jeder Figur

   Wörtliche Übertragung von js/moves.js.

   Das Wetter hängt am Brett, genau wie die Mannschaften: Zugerzeugen bekommt
   nur das Brett zu sehen und muss trotzdem wissen, was gerade gilt. Im
   Standardspiel ist das die neutrale Wirkung – dann rechnet hier alles wie
   eh und je. */
using System;
using System.Collections.Generic;

namespace Hexodus
{
    /// <summary>Eine mögliche Aktion einer Figur. `Kind` wie in der JS-Fassung.</summary>
    public sealed class Aktion
    {
        public string Kind;                 // move | capture | harvest | shoot | jump
        public int Q, R;
        public int Cost;                    // Holz, das der Zug kostet (Boote, Königs-Sprung)
        public List<string> Path;           // Kettensprung: die Zwischenlandungen
        public List<string> Captures;       // Kettensprung: was dabei fällt

        public Aktion(string kind, Cell cell)
        {
            Kind = kind; Q = cell.Q; R = cell.R;
        }

        public string Key { get { return Hex.Key(Q, R); } }

        public override string ToString()
        {
            return Kind + ":" + Key + (Cost > 0 ? " (" + Cost + " Holz)" : "");
        }
    }

    /// <summary>Was ein Zug an Booten kostet, aufnimmt und zurücklässt.</summary>
    public sealed class Bootsplan
    {
        public int Cost;
        public List<Cell> Takes = new List<Cell>();
        public List<Cell> Drops = new List<Cell>();
        public bool EndOnWater;
    }

    /// <summary>Die Versorgungskette eines Spielers samt ihrer Anker.</summary>
    public sealed class Versorgung
    {
        public List<Cell> Cells = new List<Cell>();
        public List<Cell[]> Links = new List<Cell[]>();
        public Cell King;
        public Cell Zenturio;
    }

    public static class Moves
    {
        private static Wetterlage W(Board board) { return Wetter.Wirkung(board); }

        public static bool IsWater(Cell c) { return c != null && c.Terrain == Gelaende.Wasser; }

        /// <summary>Feld, auf dem eine Figur überhaupt stehen kann (Wasser nur mit Boot).</summary>
        public static bool Enterable(Cell c) { return c != null && !c.Tree; }

        /* Was kostet der Schritt von `from` nach `to`? -1 heißt: nicht möglich.
           Wasser ist nur mit Boot begehbar: entweder fährt das Boot der Figur
           mit, oder es liegt schon eines da, oder es wird gekauft. */
        public static int StepCost(Cell from, Cell to, int wood, Wetterlage w = null)
        {
            if (!Enterable(to)) return -1;
            if (to.Terrain != Gelaende.Wasser) return 0;
            if (IsWater(from)) return 0;
            if (to.Boat) return 0;
            var preis = w != null ? w.BootPreis : 1;     // Frost: das Wasser trägt umsonst
            return wood >= preis ? preis : -1;
        }

        /// <summary>Richtung von `from` nach `to`, falls beide auf einer Geraden liegen.</summary>
        public static int DirectionOf(Axial from, Axial to)
        {
            for (var d = 0; d < 6; d++)
            {
                var cur = from;
                for (var k = 0; k < 24; k++)
                {
                    cur = Hex.Add(cur, Hex.Dirs[d]);
                    if (cur.Q == to.Q && cur.R == to.R) return d;
                }
            }
            return -1;
        }

        /* Felder, die eine Figur auf ihrem Weg tatsächlich betritt. Nur Legionär
           und Zenturio laufen durch Zwischenfelder; alles andere springt oder
           tritt einmal. */
        public static List<Cell> PathCells(Board board, Figur piece, Cell from, Cell to)
        {
            var einzeln = new List<Cell> { to };
            if (piece.Type != Einheit.Legionaer && piece.Type != Einheit.Zenturio) return einzeln;
            var d = DirectionOf(from, to);
            if (d < 0) return einzeln;
            var path = new List<Cell>();
            var cur = (Axial)from;
            for (var k = 0; k < 24; k++)
            {
                cur = Hex.Add(cur, Hex.Dirs[d]);
                var c = board.At(cur);
                if (c == null) break;
                path.Add(c);
                if (c.Q == to.Q && c.R == to.R) break;
            }
            return path.Count > 0 ? path : einzeln;
        }

        /// <summary>Bootsbewegung eines ganzen Zuges.</summary>
        public static Bootsplan WaterPlan(Board board, Figur piece, Cell from, Cell to)
        {
            var path = PathCells(board, piece, from, to);
            var preis = W(board).BootPreis;
            var plan = new Bootsplan();
            var carrying = IsWater(from);
            var prev = from;
            foreach (var c in path)
            {
                if (IsWater(c))
                {
                    if (!carrying)
                    {
                        if (c.Boat) plan.Takes.Add(c); else plan.Cost += preis;
                        carrying = true;
                    }
                }
                else if (carrying)
                {
                    plan.Drops.Add(prev);          // Boot bleibt am letzten Wasserfeld zurück
                    carrying = false;
                }
                prev = c;
            }
            plan.EndOnWater = carrying;
            return plan;
        }

        /* Bootsplan eines Kettensprungs: Auf jedem Wasserfeld des Weges, auf dem
           noch keines liegt, wird ein Boot gekauft und bleibt dort liegen – auch
           auf den Zwischenlandungen, denn der Tangolin lässt es zurück, wenn er
           weiterspringt. */
        public static Bootsplan JumpPlan(Board board, Aktion action)
        {
            var plan = new Bootsplan();
            var preis = W(board).BootPreis;
            if (action.Path == null) return plan;
            foreach (var k in action.Path)
            {
                Cell c;
                if (!board.Cells.TryGetValue(k, out c)) continue;
                if (c.Terrain != Gelaende.Wasser || c.Boat) continue;
                plan.Cost += preis;
                plan.Drops.Add(c);
            }
            return plan;
        }

        /* Spielen zwei Spieler zusammen? Verbündete schlägt man nicht, und sie
           versperren einander den Weg wie eigene Figuren. Die Versorgungskette
           bleibt davon unberührt: Ausgebildet wird nur an eigenen Einheiten. */
        public static bool Allied(Board board, int a, int b)
        {
            if (a == b) return true;
            var t = board != null ? board.Teams : null;
            return t != null && t[a] == t[b];
        }

        /* Gleitende Bewegung (Legionär, Zenturio): läuft, bis etwas im Weg ist.
           Wasser kostet ein Boot je Abschnitt, den die Figur von Land aus betritt. */
        private static void Slide(Board board, Cell from, int[] dirs, int owner, int wood,
                                  List<Aktion> aus)
        {
            var w = W(board);
            foreach (var d in dirs)
            {
                var cur = (Axial)from;
                var carrying = IsWater(from);
                int cost = 0, schritte = 0;
                while (true)
                {
                    // Schlamm: nach zwei Feldern bleibt auch der Zenturio stecken
                    if (w.MaxWeite > 0 && schritte >= w.MaxWeite) break;
                    schritte++;
                    cur = Hex.Add(cur, Hex.Dirs[d]);
                    var cell = board.At(cur);
                    if (cell == null || cell.Tree) break;
                    if (cell.Terrain == Gelaende.Wasser)
                    {
                        if (!carrying)
                        {
                            if (!cell.Boat)
                            {
                                if (cost + w.BootPreis > wood) break;   // kein Holz mehr fürs Boot
                                cost += w.BootPreis;
                            }
                            carrying = true;
                        }
                    }
                    else
                    {
                        carrying = false;                 // Boot bleibt zurück
                    }
                    if (cell.Piece != null)
                    {
                        /* Im Nebel schlagen Legionär und Zenturio nur, was direkt
                           vor ihnen steht – weiter hinten sehen sie nichts. Im Weg
                           steht die Figur trotzdem, die Bahn endet hier so oder so. */
                        if (!Allied(board, cell.Piece.Owner, owner) &&
                            (!w.NahSchlag || schritte == 1))
                        {
                            aus.Add(new Aktion("capture", cell) { Cost = cost });
                        }
                        break;
                    }
                    aus.Add(new Aktion("move", cell) { Cost = cost });
                }
            }
        }

        /* Kettensprünge des Tangolins.

           Übersprungen wird nur ein Sprungbrett: ein Baum oder eine Figur der
           eigenen Seite. Eine gegnerische Figur ist kein Sprungbrett, sondern
           eine Sperre. Gelandet wird dagegen auch auf dem Gegner: Der fällt
           dabei, und der Sprung darf von dort weitergehen.

           Gesucht wird in die Tiefe, denn am Weg hängt mehr als das Ziel: was er
           unterwegs schlägt und was er dabei ausgibt. Je Zielfeld wird der beste
           Weg gemerkt – erst nach Schlägen, dann nach Kosten, dann nach Länge.
           Ein Feld wird im selben Weg nicht zweimal betreten; sonst liefe der
           Tangolin im Kreis, solange ein Baum in Reichweite steht. */
        private sealed class Kandidat
        {
            public List<string> Path;
            public List<string> Captures;
            public int Cost;
        }

        private static bool Besser(Kandidat a, Kandidat b)
        {
            if (b == null) return true;
            if (a.Captures.Count != b.Captures.Count) return a.Captures.Count > b.Captures.Count;
            if (a.Cost != b.Cost) return a.Cost < b.Cost;
            return a.Path.Count < b.Path.Count;
        }

        private sealed class KettenSuche
        {
            public Board Board;
            public Wetterlage W;
            public int Owner;
            public int Wood;
            public HashSet<string> Pfad = new HashSet<string>();
            public Dictionary<string, Kandidat> Best = new Dictionary<string, Kandidat>();
            public List<string> Reihenfolge = new List<string>();   // wie in JS: Fundreihenfolge
            public int Knoten;

            public void Suche(Cell pos, List<string> weg, List<string> beute, int kosten)
            {
                if (++Knoten > 4000) return;      // Notbremse gegen entartete Stellungen
                for (var d = 0; d < 6; d++)
                {
                    var over = Board.At(Hex.Add(pos, Hex.Dirs[d]));
                    if (over == null) continue;
                    // Sprungbrett: ein Baum oder eine Figur der eigenen Seite
                    var sprungbrett = over.Tree ||
                        (over.Piece != null && Moves.Allied(Board, over.Piece.Owner, Owner));
                    if (!sprungbrett) continue;

                    var land = Board.At(Hex.Add(pos, Hex.Scale(Hex.Dirs[d], 2)));
                    if (land == null || land.Tree) continue;
                    var landKey = land.Key;
                    if (Pfad.Contains(landKey)) continue;   // kein Feld zweimal im selben Weg

                    string opfer = null;
                    if (land.Piece != null)
                    {
                        if (Moves.Allied(Board, land.Piece.Owner, Owner)) continue;  // eigene Seite sperrt
                        opfer = landKey;                                            // Gegner fällt
                    }
                    // Wasser betritt nur, wer dort ein Boot hat oder eines kauft
                    var preis = (land.Terrain == Gelaende.Wasser && !land.Boat) ? W.BootPreis : 0;
                    if (kosten + preis > Wood) continue;

                    var neuWeg = new List<string>(weg) { landKey };
                    var neuBeute = beute;
                    if (opfer != null) { neuBeute = new List<string>(beute) { opfer }; }
                    var kand = new Kandidat { Path = neuWeg, Captures = neuBeute, Cost = kosten + preis };

                    Kandidat alt;
                    if (!Best.TryGetValue(landKey, out alt)) Reihenfolge.Add(landKey);
                    if (Besser(kand, alt)) Best[landKey] = kand;

                    Pfad.Add(landKey);
                    // Schlamm: über einen einzigen Sprung kommt er nicht hinaus
                    if (W.MaxWeite == 0 || neuWeg.Count * 2 < W.MaxWeite)
                    {
                        Suche(land, neuWeg, neuBeute, kosten + preis);
                    }
                    Pfad.Remove(landKey);
                }
            }
        }

        private static void ChainJumps(Board board, Cell from, int owner, int wood, List<Aktion> aus)
        {
            var s = new KettenSuche { Board = board, W = W(board), Owner = owner, Wood = wood };
            s.Pfad.Add(from.Key);
            s.Suche(from, new List<string>(), new List<string>(), 0);

            foreach (var k in s.Reihenfolge)
            {
                var b = s.Best[k];
                var a = new Aktion("jump", board.Cells[k]) { Path = b.Path, Cost = b.Cost };
                if (b.Captures.Count > 0) a.Captures = b.Captures;
                aus.Add(a);
            }
        }

        /* Sprung auf ein festes Zielfeld – Bäume, Wasser und Figuren dazwischen
           spielen keine Rolle (Samurai, Springer). Landen auf Wasser braucht ein Boot. */
        private static void LeapTo(Board board, Cell from, int[] vec, int owner, int wood,
                                   List<Aktion> aus, Wetterlage w)
        {
            var target = board.At(Hex.Add(from, vec));
            var c = StepCost(from, target, wood, w);
            if (c < 0) return;
            if (target.Piece == null) aus.Add(new Aktion("move", target) { Cost = c });
            else if (!Allied(board, target.Piece.Owner, owner))
                aus.Add(new Aktion("capture", target) { Cost = c });
        }

        /* Wie weit eine Schrittfigur in eine Richtung kommt: sonst genau ein Feld.
           Der Marschbefehl macht zwei daraus – geradeaus weiter, wenn das Feld
           dazwischen frei und trocken ist. Marschiert wird, nicht gesprungen: Ein
           Baum, eine Figur oder offenes Wasser auf halbem Weg beenden den Marsch. */
        private static List<Cell> Schritte(Board board, Cell cell, int d, Wetterlage w)
        {
            var erst = board.At(Hex.Add(cell, Hex.Dirs[d]));
            var aus = new List<Cell> { erst };
            if (!w.ExtraFeld || erst == null || erst.Tree || erst.Piece != null ||
                erst.Terrain == Gelaende.Wasser) return aus;
            aus.Add(board.At(Hex.Add(cell, Hex.Scale(Hex.Dirs[d], 2))));
            return aus;
        }

        /// <summary>Alle legalen Aktionen der Figur auf `cell`. `wood` = Holz des Besitzers.</summary>
        public static List<Aktion> ForPiece(Board board, Cell cell, int wood)
        {
            var aus = new List<Aktion>();
            var piece = cell != null ? cell.Piece : null;
            if (piece == null) return aus;
            var owner = piece.Owner;
            var w = W(board);

            switch (piece.Type)
            {
                case Einheit.Worker:
                    for (var d = 0; d < 6; d++)
                    {
                        var liste = Schritte(board, cell, d, w);
                        for (var i = 0; i < liste.Count; i++)
                        {
                            var target = liste[i];
                            if (target == null) continue;
                            // Gefällt wird nur vom Nachbarfeld aus – marschieren heißt nicht ernten
                            if (target.Tree)
                            {
                                if (i == 0) aus.Add(new Aktion("harvest", target));
                                continue;
                            }
                            var c = StepCost(cell, target, wood, w);
                            if (c < 0) continue;
                            if (target.Piece == null) aus.Add(new Aktion("move", target) { Cost = c });
                            else if (!Allied(board, target.Piece.Owner, owner))
                                aus.Add(new Aktion("capture", target) { Cost = c });
                        }
                    }
                    break;

                case Einheit.Samurai:
                    // Die 6 Hex-Diagonalen: dadurch bleibt er auf einem Drittel des Bretts
                    foreach (var v in Hex.Diags) LeapTo(board, cell, v, owner, wood, aus, w);
                    break;

                case Einheit.Springer:
                {
                    /* Zwei benachbarte Richtungen, jeweils genau 2 oder 3 Felder
                       weit. Windstille löst ihn von seiner Blickrichtung, Schlamm
                       nimmt ihm die weite Weite, klare Sicht legt eine dazu. */
                    var dirs = w.FreieRichtung ? new[] { 0, 1, 2, 3, 4, 5 } : Hex.WedgeDirs(piece.Facing);
                    var weiten = w.MaxWeite == 2 ? new[] { 2 }
                               : (w.WeitSprung ? new[] { 2, 3, 4 } : new[] { 2, 3 });
                    foreach (var dd in dirs)
                        foreach (var n in weiten)
                            LeapTo(board, cell, Hex.Scale(Hex.Dirs[dd], n), owner, wood, aus, w);
                    break;
                }

                case Einheit.Legionaer:
                    Slide(board, cell,
                          w.FreieRichtung ? new[] { 0, 1, 2, 3, 4, 5 }
                                          : new[] { piece.Facing % 6, (piece.Facing + 3) % 6 },
                          owner, wood, aus);
                    break;

                case Einheit.Zenturio:
                    Slide(board, cell, new[] { 0, 1, 2, 3, 4, 5 }, owner, wood, aus);
                    break;

                case Einheit.Archer:
                    // Laufen: 1 Feld, ohne zu schlagen (mit Marschbefehl zwei)
                    for (var d = 0; d < 6; d++)
                    {
                        foreach (var target in Schritte(board, cell, d, w))
                        {
                            var c = StepCost(cell, target, wood, w);
                            if (c < 0 || target.Piece != null) continue;
                            aus.Add(new Aktion("move", target) { Cost = c });
                        }
                    }
                    // Schießen: über Bäume und Wasser hinweg, so weit die Sicht reicht
                    for (var d = 0; d < 6; d++)
                    {
                        var ziel = board.At(Hex.Add(cell, Hex.Scale(Hex.Dirs[d], w.Schuss)));
                        if (ziel != null && ziel.Piece != null &&
                            !Allied(board, ziel.Piece.Owner, owner))
                        {
                            aus.Add(new Aktion("shoot", ziel));
                        }
                    }
                    break;

                case Einheit.Tangolin:
                    for (var d = 0; d < 6; d++)
                    {
                        foreach (var target in Schritte(board, cell, d, w))
                        {
                            var c = StepCost(cell, target, wood, w);
                            if (c < 0) continue;
                            if (target.Piece == null) aus.Add(new Aktion("move", target) { Cost = c });
                            else if (!Allied(board, target.Piece.Owner, owner))
                                aus.Add(new Aktion("capture", target) { Cost = c });
                        }
                    }
                    ChainJumps(board, cell, owner, wood, aus);
                    break;

                case Einheit.King:
                    if (wood >= 1)
                    {
                        for (var d = 0; d < 6; d++)
                        {
                            foreach (var target in Schritte(board, cell, d, w))
                            {
                                var c = StepCost(cell, target, wood - 1, w);
                                if (c < 0) continue;
                                var total = c + 1;        // 1 Holz für den Sprung, dazu das Boot
                                if (total > wood) continue;
                                if (target.Piece == null)
                                    aus.Add(new Aktion("move", target) { Cost = total });
                                else if (!Allied(board, target.Piece.Owner, owner))
                                    aus.Add(new Aktion("capture", target) { Cost = total });
                            }
                        }
                    }
                    break;
            }

            // Doppelte Ziele entfernen (der Tangolin kann ein Feld mehrfach erreichen)
            var gesehen = new HashSet<string>();
            var uniq = new List<Aktion>();
            foreach (var a in aus)
            {
                if (gesehen.Add(a.Kind + ":" + a.Key)) uniq.Add(a);
            }
            return uniq;
        }

        /* Versorgungskette: alle eigenen Einheiten, die über eine lückenlose
           Kette von Nachbarfeldern mit einem Anker verbunden sind – und die
           Verbindungen dazwischen. Nur an dieser Kette darf ausgebildet werden.

           Anker sind zwei: der Königs-Turm und der Zenturio. Der Zenturio trägt
           das Feldzeichen, und wo das steht, ist Nachschub – auch wenn die Kette
           zum eigenen Turm längst gerissen ist. Ohne Turm gibt es keine Kette:
           Wer seinen Turm verliert, ist ohnehin aus dem Spiel. */
        public static Versorgung SupplyChain(Board board, int owner)
        {
            string kingKey = null, zentKey = null;
            foreach (var k in board.Keys)
            {
                var c = board.Cells[k];
                if (c.Piece == null || c.Piece.Owner != owner) continue;
                if (c.Piece.Type == Einheit.King) kingKey = k;
                else if (c.Piece.Type == Einheit.Zenturio) zentKey = k;
            }
            var chain = new Versorgung();
            if (kingKey == null) return chain;

            var w = W(board);
            var cluster = new HashSet<string>();
            var queue = new Queue<Cell>();
            foreach (var k in new[] { kingKey, zentKey })
            {
                if (k == null || cluster.Contains(k)) continue;
                cluster.Add(k);
                chain.Cells.Add(board.Cells[k]);
                queue.Enqueue(board.Cells[k]);
            }

            Action<Cell, Cell> verbinde = (cur, cell) =>
            {
                var curKey = cur.Key;
                var k = cell.Key;
                if (!cluster.Contains(k))
                {
                    cluster.Add(k);
                    chain.Cells.Add(cell);
                    queue.Enqueue(cell);
                }
                // Verbindung nur einmal aufnehmen
                if (string.CompareOrdinal(curKey, k) < 0) chain.Links.Add(new[] { cur, cell });
            };

            while (queue.Count > 0)
            {
                var cur = queue.Dequeue();
                for (var d = 0; d < 6; d++)
                {
                    var mid = board.At(Hex.Add(cur, Hex.Dirs[d]));
                    if (mid != null && mid.Piece != null)
                    {
                        if (mid.Piece.Owner == owner) verbinde(cur, mid);
                        continue;                      // eine fremde Figur reißt die Kette
                    }
                    /* Feldlager: Läufer tragen den Nachschub über genau ein Feld
                       ohne Figur hinweg – was dahinter steht, hängt wieder dran. */
                    if (!w.Luecke || mid == null) continue;
                    var weit = board.At(Hex.Add(cur, Hex.Scale(Hex.Dirs[d], 2)));
                    if (weit != null && weit.Piece != null && weit.Piece.Owner == owner)
                        verbinde(cur, weit);
                }
            }

            chain.King = board.Cells[kingKey];
            chain.Zenturio = zentKey != null ? board.Cells[zentKey] : null;
            return chain;
        }

        /// <summary>Felder, auf denen ein Spieler ausbilden darf.</summary>
        public static List<Cell> TrainingSpots(Board board, int owner)
        {
            var w = W(board);
            var chain = SupplyChain(board, owner);
            var list = new List<Cell>();
            if (chain.King == null) return list;

            var anker = new List<Cell> { chain.King };
            if (chain.Zenturio != null) anker.Add(chain.Zenturio);

            var cluster = new List<Cell>();
            foreach (var c in chain.Cells)
            {
                /* Belagerung: Die Wege sind abgeschnitten. Versorgt ist nur, was
                   nah genug an einem eigenen Turm oder Feldzeichen steht – wie
                   lang die Kette dahinter auch sein mag. */
                if (w.Radius > 0)
                {
                    var nah = false;
                    foreach (var a in anker) if (Hex.Distance(a, c) <= w.Radius) { nah = true; break; }
                    if (!nah) continue;
                }
                cluster.Add(c);
            }

            var spots = new HashSet<string>();
            foreach (var c in cluster)
            {
                foreach (var nb in Hex.Neighbors(c))
                {
                    var cell = board.At(nb);
                    if (!Board.IsFree(cell)) continue;
                    if (spots.Add(cell.Key)) list.Add(cell);
                }
            }
            return list;
        }

        /// <summary>Welche Figurentypen dieses Spielers stehen gerade auf dem Feld?</summary>
        public static HashSet<Einheit> TypesOnBoard(Board board, int owner)
        {
            var aus = new HashSet<Einheit>();
            foreach (var c in board.Alle())
            {
                if (c.Piece != null && c.Piece.Owner == owner) aus.Add(c.Piece.Type);
            }
            return aus;
        }

        /* Warum eine Einheit gerade nicht ausgebildet werden kann – null heißt:
           sie geht. Von jeder Figur darf höchstens eine je Spieler auf dem Feld
           stehen; der Zenturio zusätzlich nur ein einziges Mal pro Spiel. */
        public static string TrainBlocker(Spielstand state, int owner, Einheit id)
        {
            var def = Units.Def(id);
            var player = state.Players[owner];
            if (def == null || !def.Trainable) return "nicht ausbildbar";
            // Hungerwinter: diese Runde entsteht bei niemandem eine neue Einheit
            if (W(state.Board).KeineAusbildung) return "Hungerwinter";
            if (def.Unique && player.HatAusgebildet(id)) return "schon ausgebildet";
            if (TypesOnBoard(state.Board, owner).Contains(id)) return "steht im Spiel";
            if (Preis(state.Board, id) > player.Wood) return "zu wenig Holz";
            return null;
        }

        /* Was eine Einheit gerade kostet – der fahrende Markt macht sie billiger.
           Regelwerk, Oberfläche und Computergegner rechnen mit derselben Zahl. */
        public static int Preis(Board board, Einheit id)
        {
            return Wetter.Kosten(Units.Kosten(id), W(board));
        }

        /// <summary>Einheiten, die der Spieler gerade ausbilden darf.</summary>
        public static List<Einheit> AffordableUnits(Spielstand state, int owner)
        {
            var aus = new List<Einheit>();
            foreach (var id in Units.TrainOrder)
            {
                if (TrainBlocker(state, owner, id) == null) aus.Add(id);
            }
            return aus;
        }

        /// <summary>Kann der Spieler überhaupt noch etwas tun?</summary>
        public static bool HasAnyAction(Spielstand state, int owner)
        {
            var board = state.Board;
            var player = state.Players[owner];
            if (player.Eliminated) return false;
            foreach (var cell in board.Alle())
            {
                if (cell.Piece == null || cell.Piece.Owner != owner) continue;
                if (ForPiece(board, cell, player.Wood).Count > 0) return true;
                // Drehen ist ein vollwertiger Zug
                if (cell.Piece.Type != Einheit.King && Units.Def(cell.Piece.Type).Directional) return true;
            }
            return AffordableUnits(state, owner).Count > 0 && TrainingSpots(board, owner).Count > 0;
        }
    }
}
