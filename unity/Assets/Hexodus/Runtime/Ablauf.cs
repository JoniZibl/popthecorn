/* Hexodus – der Ablauf einer Partie

   Zweiter Teil der Übertragung von js/game.js. Spielstand.cs sagt, was eine
   Partie *ist*; hier steht, was in ihr *geschieht*: Bäume pflanzen, Türme
   setzen, ziehen, schlagen, ausbilden, ausscheiden – und das Taktwerk der
   Wetterkarten.

   In der JS-Fassung ist das ein Modul, das auf einem Zustandsobjekt arbeitet
   (`G.perform(state, ...)`). Hier sind es Methoden derselben Klasse, also
   `st.Perform(...)`. Aus jedem `state.` wird ein `this.` – sonst steht Zeile
   für Zeile dasselbe da, damit beide Fassungen vergleichbar bleiben. */
using System;
using System.Collections.Generic;

namespace Hexodus
{
    public sealed partial class Spielstand
    {
        /* Wie viele volle Runden eine Karte gilt, wenn sie eingetreten ist. */
        public const int WetterRunden = 2;

        /* Züge ohne Fortschritt – nur noch ein Hinweis für die KI, keine Regel.
           Siehe CheckStalemate. */
        public const int StallLimit = 50;

        /* Wie viele Stellungen zurück die KI schauen kann, um Wiederholungen zu
           meiden. Seit Partien bis zum letzten Turm laufen, können sie lang
           werden – ohne Deckel wüchse die Liste mit jedem Zug, und sie wird bei
           jedem Zug des Computergegners in seinen Rechenfaden kopiert. Was älter
           ist, interessiert ohnehin niemanden: Wiederholungen, die man meiden
           will, liegen kurz zurück. */
        public const int HistoryMax = 200;

        /* Türme halten Abstand: Im Umkreis von drei Feldern um einen Königs-Turm
           darf kein zweiter stehen. Verboten ist damit jede Distanz unter 4. */
        public const int KingGap = 4;

        /* Spuren des Kampfes: Ein Feld fasst nur eine Handvoll. */
        private const int MaxSpuren = 8;

        /* Wie Computergegner ihre Bäume setzen. Solange die KI nicht portiert
           ist, bleibt der Haken leer und AutoPlaceTrees würfelt. */
        public static Func<Spielstand, int, Cell> BaumWahl;

        // ---------------- Wetter ----------------

        /* Steht dieser Figurentyp gerade auf dem Brett? */
        public bool HatTyp(int owner, Einheit type)
        {
            return Moves.TypesOnBoard(Board, owner).Contains(type);
        }

        /* Ein freies Feld an Turm oder Feldzeichen – dort rückt die Musterung
           ein. Genommen wird das Feld, das dem eigenen Turm am nächsten liegt. */
        public Cell NachschubFeld(int owner)
        {
            var spots = Moves.TrainingSpots(Board, owner);
            if (spots.Count == 0) return null;
            var chain = Moves.SupplyChain(Board, owner);
            Axial anker = chain.King != null ? (Axial)chain.King : (Axial)spots[0];
            var best = spots[0];
            var bd = Hex.Distance(anker, spots[0]);
            foreach (var c in spots)
            {
                var d = Hex.Distance(anker, c);
                if (d < bd) { bd = d; best = c; }
            }
            return best;
        }

        private WetterHilfe Hilfe()
        {
            return new WetterHilfe
            {
                HatTyp = (st, o, t) => st.HatTyp(o, t),
                NachschubFeld = (st, o) => st.NachschubFeld(o)
            };
        }

        /* Ein Schlag deckt die oberste Karte auf – sie zieht auf, gilt aber noch
           nicht.

           Aufdecken kann nur, wer bei **klarem Wetter** schlägt. Solange eine
           Karte aufzieht oder gilt, dreht kein weiterer Schlag daran: Ein
           Kettensprung, der drei Figuren mitnimmt, deckt genauso eine Karte auf
           wie ein einzelner Schlag, und wer mitten im Sturm weiterkämpft,
           verlängert ihn nicht. Erst wenn es aufgeklart ist, kann der nächste
           Schlag wieder das Wetter drehen.

           So bleibt der Takt lesbar: klar – aufziehen – zwei Runden Wetter –
           klar. Ohne die Sperre liefe im Gefecht eine Karte in die nächste, und
           zwischen zwei Kämpfen wäre nie Ruhe. */
        public Karte KuendigeAn()
        {
            if (!WetterAn || Phase != Phase.Play) return null;
            if (Kommt != null || Karte != null) return null;
            if (Stapel.Count == 0)
            {
                Stapel = Wetter.Mischen(Ablage.Count > 0 ? Ablage : Wetter.Stapel());
                Ablage = new List<string>();
            }
            var id = Stapel[Stapel.Count - 1];
            Stapel.RemoveAt(Stapel.Count - 1);
            Kommt = id;
            KommtNr++;
            /* Eine volle Runde ohne Wirkung. Der laufende Zug – der, in dem
               geschlagen wurde – zählt nicht mit; deshalb ein Zug mehr als
               Spieler, denn am Ende genau dieses Zuges wird zum ersten Mal
               heruntergezählt. Danach hat jeder, auch der Schlagende, noch
               einmal ganz normal gezogen.

               Scheidet zwischendurch jemand aus, wird die Reihe kürzer und die
               Karte kommt einen Zug später als gedacht – das ist die Runde, in
               der ein Turm gefallen ist, da fällt es nicht ins Gewicht. */
            KommtZaehler = AlivePlayers().Count + 1;
            Log_(string.Format("Der Wind dreht: {0} zieht auf – eine Runde lang ohne " +
                               "Wirkung, danach gilt sie zwei Runden.", Wetter.Finde(id).Name));
            return Wetter.Finde(id);
        }

        /* Nach jedem abgegebenen Zug einen Schritt weiter. Was seine Runde hinter
           sich hat, klart auf; was aufgezogen ist, tritt ein. Beides geschieht
           zwischen zwei Zügen, nie mitten in einem. */
        public Karte WetterTakt()
        {
            if (!WetterAn || Phase != Phase.Play) return null;
            if (Karte != null && --KarteZaehler <= 0) KlareAuf();
            if (Kommt != null && --KommtZaehler <= 0) return TrittEin();
            return null;
        }

        public void KlareAuf()
        {
            Ablage.Add(Karte);
            Karte = null;
            KarteText = null;
            KarteFelder = null;
            KarteZaehler = 0;
            Board.Wetter = Wetterlage.Neutral;
            Extra = 0;
            Log_("Das Wetter klart auf.");
        }

        /* Die aufgezogene Karte tritt ein: Eine volle Runde ist ohne sie
           vergangen, jeder hat sie kommen sehen und konnte sich stellen. Von
           hier an gilt sie zwei volle Runden – so viele Züge, wie zwei
           Durchgänge der Reihe lang sind. */
        public Karte TrittEin()
        {
            if (Karte != null) KlareAuf();        // Platz für die neue Lage
            if (Kommt == null) return null;

            var id = Kommt;
            var k = Wetter.Finde(id);
            Kommt = null;
            KommtZaehler = 0;
            Karte = id;
            KarteNr++;
            KarteZaehler = WetterRunden * AlivePlayers().Count;   // je zwei Züge für jeden
            Board.Wetter = Wetter.WirkungVon(id);
            KarteText = k.Kurz;
            KarteFelder = null;

            /* Was die Karte einmalig am Brett verändert, geschieht jetzt – nicht
               beim Aufziehen. Der Sturm wirft die Bäume um, wenn er da ist. */
            if (k.Sofort != null)
            {
                var folge = k.Sofort(this, Hilfe());
                KarteText = folge.Text;
                KarteFelder = (folge.Felder != null && folge.Felder.Count > 0) ? folge.Felder : null;
            }
            // Aufbruch: Wer als Erster unter der neuen Lage zieht, zieht zweimal
            if (k.ExtraZug > 0) Extra = k.ExtraZug;

            Log_("Wetter: " + k.Name + " – " + KarteText);
            return k;
        }

        /* Bleibt derselbe Spieler am Zug? Zwei Karten sagen ja: Die Trockenheit
           macht das Fällen umsonst, der Aufbruch schenkt dem Eröffner einen
           zweiten Zug. Sonst wird weitergegeben wie immer. */
        public bool BehaeltZug(string kind)
        {
            if (kind == "harvest" && Wetter.Wirkung(Board).FaellenFrei) return true;
            if (Extra > 0) { Extra--; return true; }
            return false;
        }

        // ---------------- Buchhaltung ----------------

        /* Beute: Wer eine Figur schlägt, bekommt die Hälfte ihrer
           Ausbildungskosten als Holz zurück (aufgerundet). Beim Königs-Turm
           wechselt ohnehin der ganze Vorrat den Besitzer. */
        public static int Plunder(Einheit type)
        {
            var cost = Units.Kosten(type);
            return (cost + 1) / 2;
        }

        /* Eindeutige Kennung der Stellung: Figuren, Bäume, Holz und wer am Zug
           ist. Muss zeichengleich mit js/game.js sein – die KI vergleicht
           Stellungen darüber. */
        public string PositionKey()
        {
            var parts = new List<string>();
            for (var i = 0; i < Board.Keys.Count; i++)
            {
                var k = Board.Keys[i];
                var c = Board.Cells[k];
                /* Boote gehören zur Stellung: sonst gelten zwei Lagen als
                   gleich, die sich nur durch ein verschobenes Boot
                   unterscheiden. */
                if (c.Piece != null)
                {
                    parts.Add(k + "=" + Units.Kennung(c.Piece.Type) + c.Piece.Owner +
                              c.Piece.Facing + (c.Boat ? "B" : ""));
                }
                else if (c.Boat) parts.Add(k + "=B");
                else if (c.Tree) parts.Add(k + "=T");
            }
            var holz = new List<string>();
            foreach (var p in Players) holz.Add(p.Wood.ToString());
            parts.Add("h" + string.Join(".", holz));
            parts.Add("z" + Current);
            /* Unter Wetter gehört die offene Karte dazu: Dieselbe Stellung
               spielt sich im Nebel anders als im Frost, also ist sie nicht
               dieselbe Lage. */
            if (WetterAn && Karte != null) parts.Add("w" + Karte);
            return string.Join("|", parts);
        }

        /* Vermögen = Holzvorrat plus das Holz, das in den eigenen Figuren
           steckt. */
        public int Wealth(int owner)
        {
            var sum = Players[owner].Wood;
            foreach (var c in Board.Alle())
            {
                if (c.Piece != null && c.Piece.Owner == owner) sum += Units.Kosten(c.Piece.Type);
            }
            return sum;
        }

        public int PieceCount(int owner)
        {
            var n = 0;
            foreach (var c in Board.Alle())
            {
                if (c.Piece != null && c.Piece.Owner == owner) n++;
            }
            return n;
        }

        // ---------------- Ereignisse und Protokoll ----------------

        private void ClearEvents()
        {
            LastMove = null;
            LastCapture = null;
            LastCaptures = new List<SchlagEreignis>();
            LastHarvest = null;
            LastTrain = null;
        }

        private void NoteProgress()
        {
            SinceProgress = 0;
            LastProgressBy = Current;
        }

        /* Heißt in der JS-Fassung `log`. Der Unterstrich steht hier nur, weil
           `Log` schon das Feld mit den Zeilen ist. */
        public void Log_(string text, int? playerIndex = null)
        {
            Log.Insert(0, new LogZeile(text, playerIndex));
            if (Log.Count > 80) Log.RemoveAt(Log.Count - 1);
        }

        public int NextPlayer()
        {
            var n = Players.Count;
            for (var i = 1; i <= n; i++)
            {
                var idx = (Current + i) % n;
                if (!Players[idx].Eliminated) return idx;
            }
            return Current;
        }

        // ---------------- Aufbauphase ----------------

        public bool PlaceTree(int q, int r)
        {
            if (Phase != Phase.Trees) return false;
            var cell = Board.Get(q, r);
            if (!Board.IsFree(cell)) return false;
            cell.Tree = true;
            Players[Current].TreesLeft--;
            Log_(Players[Current].Name + " pflanzt einen Baum.", Current);
            AdvanceTreeTurn();
            return true;
        }

        private void AdvanceTreeTurn()
        {
            var remaining = false;
            foreach (var p in Players) if (p.TreesLeft > 0) remaining = true;
            if (!remaining)
            {
                Phase = Phase.Kings;
                Current = 0;
                AwaitWorker = false;
                Log_("Alle Bäume stehen. Jetzt werden die Königs-Türme gesetzt.");
                return;
            }
            var n = Players.Count;
            for (var i = 1; i <= n; i++)
            {
                var idx = (Current + i) % n;
                if (Players[idx].TreesLeft > 0) { Current = idx; return; }
            }
        }

        public void AutoPlaceTrees()
        {
            var guard = 0;
            while (Phase == Phase.Trees && guard++ < 5000)
            {
                var player = Players[Current];
                Cell cell = null;
                // Computergegner setzen ihre Bäume nach eigenem Plan
                if (player.Ai != null && BaumWahl != null) cell = BaumWahl(this, Current);
                if (cell == null)
                {
                    var free = new List<Cell>();
                    foreach (var c in Board.LandCells()) if (Board.IsFree(c)) free.Add(c);
                    if (free.Count == 0) { Phase = Phase.Kings; Current = 0; break; }
                    cell = Zufall.Waehle(free);
                }
                PlaceTree(cell.Q, cell.R);
            }
        }

        /* Königs-Turm braucht ein freies Nachbarfeld für den Arbeiter und hält
           drei Felder Abstand zu bereits gesetzten Türmen. */
        public bool CanPlaceKing(Cell cell)
        {
            if (!Board.IsFree(cell)) return false;
            if (!HatFreienNachbarn(cell)) return false;
            return !KingTooClose(cell);
        }

        private bool HatFreienNachbarn(Cell cell)
        {
            foreach (var nb in Hex.Neighbors(cell))
            {
                if (Board.IsFree(Board.At(nb))) return true;
            }
            return false;
        }

        public List<Cell> KingsOnBoard()
        {
            var aus = new List<Cell>();
            for (var i = 0; i < Board.Keys.Count; i++)
            {
                var c = Board.Cells[Board.Keys[i]];
                if (c.Piece != null && c.Piece.Type == Einheit.King) aus.Add(c);
            }
            return aus;
        }

        private static bool FarEnough(List<Cell> kings, Cell cell, int minDist)
        {
            foreach (var k in kings)
            {
                if (Hex.Distance(k, cell) < minDist) return false;
            }
            return true;
        }

        private int _gapCount = -1;
        private int _gap;

        /* Welchen Abstand dieses Brett hergibt. Gefordert sind drei Felder; ist
           das Brett dafür zu eng oder zu zugewachsen – acht Türme und 120 Bäume
           auf einer Insel –, rückt die Forderung so weit herunter, bis überhaupt
           ein Feld übrig bleibt. Ohne dieses Nachgeben stünde der nächste
           Spieler vor einem Brett ohne einen einzigen erlaubten Platz und käme
           nicht weiter.

           Gerechnet wird einmal je Turm, nicht je Feld: Die Oberfläche fragt für
           jedes Feld einzeln nach, ob es belegt werden darf. */
        public int KingGapJetzt()
        {
            var kings = KingsOnBoard();
            if (_gapCount == kings.Count && _gap > 0) return _gap;
            var gap = 1;
            for (var d = KingGap; d > 1; d--)
            {
                var passt = false;
                for (var i = 0; i < Board.Keys.Count && !passt; i++)
                {
                    var c = Board.Cells[Board.Keys[i]];
                    if (!Board.IsFree(c)) continue;
                    if (!HatFreienNachbarn(c)) continue;
                    if (FarEnough(kings, c, d)) passt = true;
                }
                if (passt) { gap = d; break; }
            }
            _gapCount = kings.Count;
            _gap = gap;
            return gap;
        }

        public bool KingTooClose(Cell cell)
        {
            return !FarEnough(KingsOnBoard(), cell, KingGapJetzt());
        }

        public bool PlaceKing(int q, int r)
        {
            if (Phase != Phase.Kings || AwaitWorker) return false;
            var cell = Board.Get(q, r);
            if (cell == null || !CanPlaceKing(cell)) return false;
            cell.Piece = new Figur(Einheit.King, Current);
            AwaitWorker = true;
            Log_(Players[Current].Name + " setzt den Königs-Turm.", Current);
            return true;
        }

        public bool PlaceWorker(int q, int r)
        {
            if (Phase != Phase.Kings || !AwaitWorker) return false;
            var cell = Board.Get(q, r);
            if (!Board.IsFree(cell)) return false;
            var touchesKing = false;
            foreach (var nb in Hex.Neighbors(cell))
            {
                var c = Board.At(nb);
                if (c != null && c.Piece != null && c.Piece.Type == Einheit.King &&
                    c.Piece.Owner == Current) touchesKing = true;
            }
            if (!touchesKing) return false;
            cell.Piece = new Figur(Einheit.Worker, Current);
            AwaitWorker = false;
            Log_(Players[Current].Name + " stellt den Arbeiter auf.", Current);

            if (Current == Players.Count - 1)
            {
                // Der letzte Spieler, der seinen Turm gesetzt hat, beginnt
                Phase = Phase.Play;
                Current = Players.Count - 1;
                Turn = 1;
                Log_("Das Spiel beginnt – " + Players[Current].Name + " ist am Zug.", Current);
                if (WetterAn) Log_("Klares Wetter. Fällt die erste Figur, dreht der Wind.");
            }
            else Current++;
            return true;
        }

        // ---------------- Spielzüge ----------------

        public List<Aktion> ActionsFor(Cell cell)
        {
            if (Phase != Phase.Play) return new List<Aktion>();
            if (cell == null || cell.Piece == null || cell.Piece.Owner != Current) return new List<Aktion>();
            if (Pending != null) return new List<Aktion>();
            return Moves.ForPiece(Board, cell, Players[Current].Wood);
        }

        public string Capture(Cell cell, int? attacker)
        {
            var victim = cell.Piece;
            MoveNo++;
            LastCapture = new SchlagEreignis
            {
                Key = cell.Key, Type = victim.Type, Owner = victim.Owner,
                By = attacker ?? -1, MoveNo = MoveNo
            };
            // Ein Kettensprung des Tangolins schlägt mehrere – gezeigt werden alle
            if (LastCaptures == null) LastCaptures = new List<SchlagEreignis>();
            LastCaptures.Add(LastCapture);
            MarkScar(cell, victim.Owner);
            cell.Piece = null;
            KuendigeAn();          // wo eine Figur fällt, dreht der Wind
            var vName = Units.Def(victim.Type).Name;
            Log_(vName + " von " + Players[victim.Owner].Name + " geschlagen.", attacker);
            if (victim.Type == Einheit.King)
            {
                Eliminate(victim.Owner, attacker);
            }
            else
            {
                var beute = Plunder(victim.Type);
                if (beute > 0 && attacker.HasValue)
                {
                    Players[attacker.Value].Wood += beute;
                    Log_(Players[attacker.Value].Name + " erbeutet " + beute + " Holz.", attacker);
                }
            }
            return vName;
        }

        /* Spuren des Kampfes: Wo eine Figur fällt, bleibt etwas von ihr liegen –
           in ihrer Farbe und dauerhaft. Über eine Partie hinweg zeichnet sich
           damit auf dem Brett ab, wo viel gekämpft wurde.

           Gespeichert wird nur, wem die gefallene Figur gehörte. Wie die
           Splitter auf dem Feld liegen, rechnet die Anzeige aus den Koordinaten
           aus – so springen sie beim Drehen der Kamera nicht umher und kosten
           nichts im Spielstand. Ein Feld fasst nur eine Handvoll; ist es voll,
           verschwindet die älteste Spur, damit die letzten Gefallenen immer zu
           sehen sind. */
        private static void MarkScar(Cell cell, int owner)
        {
            if (cell == null) return;
            if (cell.Scars == null) cell.Scars = new List<int>();
            cell.Scars.Add(owner);
            if (cell.Scars.Count > MaxSpuren) cell.Scars.RemoveAt(0);
        }

        public void Eliminate(int victimIndex, int? attackerIndex)
        {
            var victim = Players[victimIndex];
            victim.Eliminated = true;
            foreach (var c in Board.Alle())
            {
                if (c.Piece != null && c.Piece.Owner == victimIndex)
                {
                    MarkScar(c, victimIndex);      // auch die Armee bleibt als Spur liegen
                    c.Piece = null;
                }
            }
            if (attackerIndex.HasValue && victim.Wood > 0)
            {
                Players[attackerIndex.Value].Wood += victim.Wood;
                Log_(Players[attackerIndex.Value].Name + " erbeutet " + victim.Wood + " Holz.",
                     attackerIndex);
            }
            victim.Wood = 0;
            Log_(victim.Name + " scheidet aus dem Spiel aus!", victimIndex);
            CheckVictory();
        }

        /* Wertung: Wenn sich nichts mehr bewegt, entscheidet der Spielstand.
           Die Kette bricht jeden Gleichstand auf – es gibt immer genau einen
           Sieger. */
        public bool Adjudicate(string reason)
        {
            var alive = AlivePlayers();
            if (alive.Count == 0) { Phase = Phase.Over; Winner = null; return true; }

            /* Gewertet wird je Mannschaft: Was die Mitglieder besitzen, zählt
               zusammen. Spielt jeder für sich, ist jede Mannschaft ein Spieler –
               dann ist das dieselbe Rechnung wie zuvor. */
            Kandidat best = null;
            foreach (var t in TeamsAlive())
            {
                var mit = new List<Spieler>();
                foreach (var p in TeamMembers(t)) if (!p.Eliminated) mit.Add(p);
                var cand = new Kandidat { Team = t, Index = mit[0].Index };
                foreach (var pl in mit)
                {
                    cand.Wealth += Wealth(pl.Index);
                    cand.Pieces += PieceCount(pl.Index);
                    cand.Wood += pl.Wood;
                    if (LastProgressBy == pl.Index) cand.Last = 1;
                    // Sprecher der Mannschaft ist ihr vermögendstes Mitglied
                    if (Wealth(pl.Index) > Wealth(cand.Index)) cand.Index = pl.Index;
                }
                if (best == null ||
                    cand.Wealth > best.Wealth ||
                    (cand.Wealth == best.Wealth && cand.Pieces > best.Pieces) ||
                    (cand.Wealth == best.Wealth && cand.Pieces == best.Pieces && cand.Wood > best.Wood) ||
                    (cand.Wealth == best.Wealth && cand.Pieces == best.Pieces &&
                     cand.Wood == best.Wood && cand.Last > best.Last))
                {
                    best = cand;
                }
            }

            Phase = Phase.Over;
            Winner = best.Index;
            WinnerTeam = best.Team;
            EndReason = reason;
            Pending = null;
            Selected = null;
            Log_(reason + " – es wird gewertet.");
            Log_(TeamName(best.Team) + " gewinnt mit " + best.Wealth +
                 " Holz in Vorrat und Figuren.", best.Index);
            return true;
        }

        private sealed class Kandidat
        {
            public int Team, Index, Wealth, Pieces, Wood, Last;
        }

        /* Nach jedem Zug mitschreiben, wie festgefahren die Partie ist. Beendet
           wird dadurch nichts – die Zahlen sind nur Futter für die Suche der KI.

           Früher wurde vorher gewertet: dieselbe Stellung zum dritten Mal oder
           50 Züge ohne Baum, Schlag und Ausbildung. Beides beendete Partien, die
           noch lange nicht entschieden waren – zwei Türme standen, und plötzlich
           stand „gewinnt nach Wertung" auf dem Brett. Wer zwei Figuren vorsichtig
           hin und her zieht, hat noch nicht verloren; er sammelt Holz. */
        public bool CheckStalemate()
        {
            if (Phase != Phase.Play) return false;
            SinceProgress++;
            var key = PositionKey();
            int n;
            History[key] = (History.TryGetValue(key, out n) ? n : 0) + 1;
            HistOrder.Add(key);
            if (HistOrder.Count > HistoryMax)
            {
                var alt = HistOrder[0];
                HistOrder.RemoveAt(0);
                if (--History[alt] <= 0) History.Remove(alt);
            }
            return false;
        }

        /* Gewonnen hat, wer als letzte Mannschaft steht. Spielt jeder für sich,
           ist das genau der letzte übrige Spieler. */
        public bool CheckVictory()
        {
            var alive = AlivePlayers();
            var teams = TeamsAlive();
            if (teams.Count <= 1)
            {
                Phase = Phase.Over;
                WinnerTeam = teams.Count > 0 ? (int?)teams[0] : null;
                Winner = alive.Count > 0 ? (int?)alive[0].Index : null;
                Pending = null;
                Selected = null;
                if (WinnerTeam.HasValue)
                {
                    Log_(TeamName(WinnerTeam.Value) + " gewinnt Hexodus!", Winner);
                }
                else Log_("Unentschieden – niemand bleibt übrig.");
                return true;
            }
            return false;
        }

        /* Führt eine der von ActionsFor gelieferten Aktionen aus. */
        public bool Perform(Cell fromCell, Aktion action)
        {
            if (Phase != Phase.Play || Pending != null) return false;
            if (action == null) return false;
            var piece = fromCell.Piece;
            if (piece == null || piece.Owner != Current) return false;
            var player = Players[Current];
            var target = Board.Get(action.Q, action.R);
            if (target == null) return false;
            var def = Units.Def(piece.Type);

            if (action.Kind == "shoot")
            {
                if (target.Piece == null) return false;
                ClearEvents();
                MoveNo++;
                LastMove = new ZugEreignis
                {
                    FromKey = fromCell.Key, ToKey = target.Key,
                    Type = piece.Type, Owner = Current, Kind = "shoot", MoveNo = MoveNo
                };
                Log_(player.Name + ": Bogenschütze schießt.", Current);
                Capture(target, Current);
                NoteProgress();
                Passes = 0;
                FinishTurn("shoot");
                return true;
            }

            // Bootskosten und Königs-Sprung stecken beide in action.Cost
            ClearEvents();
            MoveNo++;
            LastMove = new ZugEreignis
            {
                FromKey = fromCell.Key, ToKey = target.Key,
                Type = piece.Type, Owner = Current, Kind = action.Kind,
                // Kettensprung: die Zwischenlandungen, damit die Anzeige sie einzeln abspringt
                Path = action.Path,
                MoveNo = MoveNo
            };
            /* Der Kettensprung bringt seinen eigenen Bootsplan mit: Er kauft auf
               jeder Wasserlandung ein Boot, nicht nur am Ziel. */
            var plan = (action.Kind == "jump" && action.Path != null)
                ? Moves.JumpPlan(Board, action)
                : Moves.WaterPlan(Board, piece, fromCell, target);
            if (action.Cost > 0)
            {
                if (player.Wood < action.Cost) return false;
                player.Wood -= action.Cost;
                if (piece.Type == Einheit.King && action.Cost > plan.Cost)
                {
                    Log_(player.Name + " zahlt 1 Holz für den Königs-Sprung.", Current);
                }
                if (plan.Cost > 0)
                {
                    Log_(player.Name + " kauft " + plan.Cost + (plan.Cost == 1 ? " Boot" : " Boote") +
                         " (-" + plan.Cost + " Holz).", Current);
                }
            }

            if (action.Kind == "capture") { Capture(target, Current); NoteProgress(); }

            /* Kettensprung: Wen er unterwegs oder am Ziel überspringt und trifft,
               den schlägt er. Erst wird geschlagen, dann gezogen – sonst stünde
               am Ziel noch die Figur, die gerade fällt. Fällt dabei ein
               Königs-Turm, nimmt er die ganze Armee seines Spielers mit; dann
               steht auf einem späteren Feld der Kette womöglich schon nichts
               mehr. */
            if (action.Kind == "jump" && action.Captures != null && action.Captures.Count > 0)
            {
                foreach (var k in action.Captures)
                {
                    Cell opfer;
                    if (Board.Cells.TryGetValue(k, out opfer) && opfer.Piece != null)
                    {
                        Capture(opfer, Current);
                    }
                }
                NoteProgress();
            }

            if (action.Kind == "harvest")
            {
                target.Tree = false;
                player.Wood += 1;
                MoveNo++;
                LastHarvest = new FeldEreignis { Key = target.Key, Owner = Current, MoveNo = MoveNo };
                NoteProgress();
                Log_(player.Name + ": Arbeiter fällt einen Baum (+1 Holz).", Current);
            }

            /* Boote umsetzen: aufgenommene Boote fahren mit, an jedem Übergang
               vom Wasser an Land bleibt eines liegen, und wer auf dem Wasser
               endet, sitzt in seinem Boot. */
            foreach (var c in plan.Takes) c.Boat = false;
            foreach (var c in plan.Drops) c.Boat = true;
            if (plan.EndOnWater) target.Boat = true;

            // Figur versetzen (falls sie das Spiel noch nicht beendet hat)
            if (Phase == Phase.Play)
            {
                fromCell.Piece = null;
                target.Piece = piece;
            }
            else
            {
                fromCell.Piece = null;
                if (target.Piece == null) target.Piece = piece;
                return true;
            }

            if (action.Kind == "move" && piece.Type != Einheit.Worker)
            {
                Log_(player.Name + ": " + def.Name + " zieht.", Current);
            }

            Passes = 0;
            // Richtungsfiguren dürfen nach dem Zug noch neu ausrichten
            if (def.Directional)
            {
                Pending = new Pending("rotate", target.Key);
                Selected = target.Key;
                return true;
            }
            FinishTurn(action.Kind);
            return true;
        }

        /* Drehen: entweder als Anschluss an einen Zug (gratis) oder als ganzer
           Zug. */
        public bool Rotate(string cellKey, int dir)
        {
            if (Phase != Phase.Play) return false;
            Cell cell;
            if (!Board.Cells.TryGetValue(cellKey, out cell)) return false;
            if (cell.Piece == null || cell.Piece.Owner != Current) return false;
            if (!Units.Def(cell.Piece.Type).Directional) return false;
            if (Pending != null)
            {
                var pk = Pending.Kind;
                if ((pk != "rotate" && pk != "trainFacing") || Pending.Key != cellKey) return false;
            }
            cell.Piece.Facing = dir;
            Log_(Players[Current].Name + ": " + Units.Def(cell.Piece.Type).Name +
                 " richtet sich nach " +
                 (cell.Piece.Type == Einheit.Springer ? Hex.WedgeName(dir) : Hex.DirNames[dir]) +
                 " aus.", Current);
            Passes = 0;
            FinishTurn(null);
            return true;
        }

        public bool Train(Einheit type, int q, int r)
        {
            if (Phase != Phase.Play || Pending != null) return false;
            var def = Units.Def(type);
            if (Moves.TrainBlocker(this, Current, type) != null) return false;
            var player = Players[Current];
            var cell = Board.Get(q, r);
            if (!Board.IsFree(cell)) return false;
            var ok = false;
            foreach (var c in Moves.TrainingSpots(Board, Current))
            {
                if (c.Q == q && c.R == r) ok = true;
            }
            if (!ok) return false;

            var preis = Moves.Preis(Board, type);
            player.Wood -= preis;
            int n;
            player.Trained[type] = (player.Trained.TryGetValue(type, out n) ? n : 0) + 1;
            cell.Piece = new Figur(type, Current);
            ClearEvents();
            MoveNo++;
            LastTrain = new FeldEreignis { Key = cell.Key, Type = type, Owner = Current, MoveNo = MoveNo };
            NoteProgress();
            Log_(player.Name + " bildet einen " + def.Name + " aus (-" + preis + " Holz).", Current);
            Passes = 0;

            if (def.Directional)
            {
                Pending = new Pending("trainFacing", cell.Key);
                Selected = cell.Key;
                return true;
            }
            FinishTurn(null);
            return true;
        }

        public bool Pass()
        {
            if (Phase != Phase.Play) return false;
            Log_(Players[Current].Name + " setzt aus.", Current);
            Extra = 0;            // wer aussetzt, verschenkt auch seinen Extra-Zug
            Passes++;
            /* Der einzige Fall, in dem eine Partie ohne gefallenen Turm endet:
               Reihum hat niemand mehr einen Zug. Dann geht es wirklich nicht
               weiter, und der Spielstand entscheidet. */
            if (Passes >= AlivePlayers().Count)
            {
                return Adjudicate("Niemand kann mehr ziehen");
            }
            FinishTurn(null);
            return true;
        }

        /* Zug beenden: offene Drehung verwerfen und weitergeben. `kind` ist die
           Aktion, die gerade gespielt wurde – die Trockenheit fragt danach. */
        public void FinishTurn(string kind)
        {
            Pending = null;
            Selected = null;
            Nochmal = false;
            if (Phase != Phase.Play) return;
            if (CheckVictory()) return;
            if (BehaeltZug(kind))
            {
                // Derselbe Spieler noch einmal – die Runde läuft weiter
                Nochmal = true;
                return;
            }
            var next = NextPlayer();
            if (next <= Current) Turn++;
            Current = next;
            WetterTakt();        // ein Zug weiter: was fällig ist, tritt ein oder klart auf
            CheckStalemate();
        }

        public bool EndPending()
        {
            if (Pending == null) return false;
            Pending = null;
            FinishTurn(null);
            return true;
        }
    }
}
