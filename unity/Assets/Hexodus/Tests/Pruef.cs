/* Hexodus – kleines Prüfgerüst für die portierten Tests.

   Die Tests der JS-Fassung schreiben "ok(Bedingung, Text)" und zählen am Ende
   die Fehler. Genau das macht dieses Gerüst auch – Zeile für Zeile
   vergleichbar mit test/*.js, und ohne Abhängigkeit zu NUnit, damit dieselben
   Tests sowohl im Unity-Editor als auch auf der Kommandozeile laufen.

   Im Editor lässt sich jede Prüfklasse zusätzlich in einen NUnit-Test hängen:
   ein Einzeiler, der die Methode aufruft und am Schluss `Pruef.Fehler == 0`
   verlangt. Die Prüfungen selbst müssen dafür nicht angefasst werden.

   Wohin die Zeilen laufen, entscheidet `Ausgabe`. Auf der Kommandozeile ist
   das `Console.WriteLine`; in Unity zeigt das Console-Fenster davon nichts,
   also hängt die NUnit-Hülle dort `Debug.Log` ein. Deshalb steht hier ein
   Haken statt eines festen Aufrufs: Diese Datei darf UnityEngine nicht
   kennen – sie liegt in einer Assembly, die ohne Engine übersetzt wird. */
using System;
using System.Collections.Generic;

namespace Hexodus.Tests
{
    public static class Pruef
    {
        public static int Fehler;
        public static int Geprueft;

        /// <summary>Wohin die Prüfzeilen laufen. Unity hängt hier Debug.Log ein.</summary>
        public static Action<string> Ausgabe = Console.WriteLine;

        private static readonly List<string> Protokoll = new List<string>();

        /// <summary>Alles, was seit dem letzten Zurücksetzen geschrieben wurde – am Stück.</summary>
        public static string Gesammelt() { return string.Join("\n", Protokoll); }

        /* Zählwerk und Protokoll leeren. Der Test Runner ruft das vor jeder
           Prüfklasse: In Unity leben die Statics über den ganzen Lauf, sonst
           schleppte die zweite Prüfung die Zeilen der ersten mit sich. Die
           Kommandozeile lässt es bleiben und zählt alles zusammen. */
        public static void Zuruecksetzen()
        {
            Fehler = 0;
            Geprueft = 0;
            Protokoll.Clear();
        }

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
            if (Ausgabe != null) Ausgabe(s);
        }

        public static string Bericht()
        {
            return Fehler > 0
                ? "\n" + Fehler + " von " + Geprueft + " Prüfung(en) fehlgeschlagen."
                : "\nAlle " + Geprueft + " Prüfungen bestanden.";
        }
    }
}
