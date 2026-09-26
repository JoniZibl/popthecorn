/* Hexodus – Hex-Geometrie (axiale Koordinaten q,r – flat-top Layout)

   Wörtliche Übertragung von js/hex.js. Die Reihenfolge der Richtungen ist
   Teil des Regelwerks und darf sich nicht ändern: Blickrichtungen von
   Springer und Legionär, die Keile des Springers und die Diagonalen des
   Samurai hängen alle an ihr. Wer hier umsortiert, dreht jede Figur im Spiel.

   Kein `using UnityEngine` – diese Schicht ist reines C# und lässt sich
   deshalb auch außerhalb des Editors übersetzen und prüfen. */
using System;
using System.Collections.Generic;

namespace Hexodus
{
    /// <summary>Ein Feld in axialen Koordinaten. Nur Lage, kein Inhalt.</summary>
    public readonly struct Axial : IEquatable<Axial>
    {
        public readonly int Q;
        public readonly int R;

        public Axial(int q, int r) { Q = q; R = r; }

        public bool Equals(Axial a) { return Q == a.Q && R == a.R; }
        public override bool Equals(object o) { return o is Axial a && Equals(a); }
        public override int GetHashCode() { return (Q * 73856093) ^ (R * 19349663); }
        public override string ToString() { return Q + "," + R; }
    }

    /// <summary>Ein Punkt in der Ebene – für Pixelmaße und Richtungsvektoren.</summary>
    public readonly struct Punkt
    {
        public readonly double X;
        public readonly double Y;
        public Punkt(double x, double y) { X = x; Y = y; }
    }

    public static class Hex
    {
        // Reihenfolge der 6 Richtungen (flat-top): 0=SO 1=NO 2=N 3=NW 4=SW 5=S
        public static readonly int[][] Dirs =
        {
            new[] {  1,  0 }, new[] {  1, -1 }, new[] {  0, -1 },
            new[] { -1,  0 }, new[] { -1,  1 }, new[] {  0,  1 }
        };

        public static readonly string[] DirNames =
            { "Südost", "Nordost", "Nord", "Nordwest", "Südwest", "Süd" };
        public static readonly string[] DirShort = { "SO", "NO", "N", "NW", "SW", "S" };

        // Gitter der 7er-Plättchen ("Blumen"): Mittelpunkte im Abstand 3
        public static readonly int[][] TileDirs =
        {
            new[] {  1,  2 }, new[] {  3, -1 }, new[] {  2, -3 },
            new[] { -1, -2 }, new[] { -3,  1 }, new[] { -2,  3 }
        };

        /* Die 6 Hex-Diagonalen: Summe zweier benachbarter Richtungen. Ein Zug
           entlang einer Diagonale hält (q - r) mod 3 konstant – wer sich nur so
           bewegt, erreicht nur ein Drittel aller Felder (Samurai). */
        public static readonly int[][] Diags = BaueDiagonalen();

        private static int[][] BaueDiagonalen()
        {
            var aus = new int[6][];
            for (var i = 0; i < 6; i++)
            {
                var d = Dirs[i];
                var n = Dirs[(i + 1) % 6];
                aus[i] = new[] { d[0] + n[0], d[1] + n[1] };
            }
            return aus;
        }

        public static string Key(int q, int r) { return q + "," + r; }
        public static string Key(Axial a) { return a.Q + "," + a.R; }

        public static Axial ParseKey(string k)
        {
            var i = k.IndexOf(',');
            return new Axial(int.Parse(k.Substring(0, i)), int.Parse(k.Substring(i + 1)));
        }

        public static Axial Add(Axial a, int[] d) { return new Axial(a.Q + d[0], a.R + d[1]); }
        public static int[] Scale(int[] d, int n) { return new[] { d[0] * n, d[1] * n }; }
        public static bool Gleich(Axial a, Axial b) { return a.Q == b.Q && a.R == b.R; }

        public static int Distance(Axial a, Axial b)
        {
            var dq = a.Q - b.Q;
            var dr = a.R - b.R;
            return (Math.Abs(dq) + Math.Abs(dr) + Math.Abs(dq + dr)) / 2;
        }

        public static Axial[] Neighbors(Axial a)
        {
            var aus = new Axial[6];
            for (var d = 0; d < 6; d++) aus[d] = Add(a, Dirs[d]);
            return aus;
        }

        // Pixelposition des Hex-Mittelpunkts (flat-top)
        private const double Sqrt3 = 1.7320508075688772;

        public static Punkt ToPixel(Axial a, double size)
        {
            return new Punkt(size * 1.5 * a.Q, size * Sqrt3 * (a.R + a.Q / 2.0));
        }

        /// <summary>Einheitsvektor einer Richtung im Pixelraum.</summary>
        public static Punkt DirVector(int d)
        {
            var p = ToPixel(new Axial(Dirs[d][0], Dirs[d][1]), 1);
            var len = Math.Sqrt(p.X * p.X + p.Y * p.Y);
            return new Punkt(p.X / len, p.Y / len);
        }

        public static double DirAngle(int d)
        {
            var v = DirVector(d);
            return Math.Atan2(v.Y, v.X) * 180 / Math.PI;
        }

        /* Keil aus zwei benachbarten Richtungen (Springer): Richtung d und d+1. */
        public static int[] WedgeDirs(int d) { return new[] { d % 6, (d + 1) % 6 }; }

        public static Punkt WedgeVector(int d)
        {
            var a = DirVector(d % 6);
            var b = DirVector((d + 1) % 6);
            double x = a.X + b.X, y = a.Y + b.Y;
            var len = Math.Sqrt(x * x + y * y);
            if (len == 0) len = 1;
            return new Punkt(x / len, y / len);
        }

        public static double WedgeAngle(int d)
        {
            var v = WedgeVector(d);
            return Math.Atan2(v.Y, v.X) * 180 / Math.PI;
        }

        public static string WedgeName(int d)
        {
            return DirNames[d % 6] + " + " + DirNames[(d + 1) % 6];
        }

        public static string WedgeShort(int d)
        {
            return DirShort[d % 6] + "+" + DirShort[(d + 1) % 6];
        }

        /// <summary>Die 7 Felder eines Plättchens um einen Mittelpunkt.</summary>
        public static List<Axial> TileCells(int[] center)
        {
            var aus = new List<Axial> { new Axial(center[0], center[1]) };
            for (var i = 0; i < 6; i++)
            {
                aus.Add(new Axial(center[0] + Dirs[i][0], center[1] + Dirs[i][1]));
            }
            return aus;
        }
    }
}
