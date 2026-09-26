/* Hexodus – kleines Prüfgerüst für die portierten Tests.

   Die Tests der JS-Fassung schreiben "ok(Bedingung, Text)" und zählen am Ende
   die Fehler. Genau das macht dieses Gerüst auch – Zeile für Zeile
   vergleichbar mit test/*.js, und ohne Abhängigkeit zu NUnit, damit dieselben
   Tests sowohl im Unity-Editor als auch auf der Kommandozeile laufen.

   Im Editor lässt sich jede Prüfklasse zusätzlich in einen NUnit-Test hängen:
   ein Einzeiler, der die Methode aufruft und am Schluss `Pruef.Fehler == 0`
   verlangt. Die Prüfungen selbst müssen dafür nicht angefasst werden. */
using System;
using System.Collections.Generic;

namespace Hexodus.Tests
{
    public static class Pruef
    {
        public static int Fehler;
        public static int Geprueft;
        private static readonly List<string> Protokoll = new List<string>();

        public static void Titel(string t)
        {
            Schreibe("");
            Schreibe(t);
        }

        public static void Ok(bool bedingung, string text)
        {
            Geprueft++;
            if (!bedingung) Fehler++;
            Schreibe((bedingung ? "  ok   " : "  FEHL ") + text);
        }

        public static void Gleich<T>(string text, T ist, T soll)
        {
            var g = EqualityComparer<T>.Default.Equals(ist, soll);
            Ok(g, text + (g ? "" : " (ist " + ist + ", soll " + soll + ")"));
        }

        private static void Schreibe(string s)
        {
            Protokoll.Add(s);
            Console.WriteLine(s);
        }

        public static string Bericht()
        {
            return Fehler > 0
                ? "\n" + Fehler + " von " + Geprueft + " Prüfung(en) fehlgeschlagen."
                : "\nAlle " + Geprueft + " Prüfungen bestanden.";
        }
    }
}
