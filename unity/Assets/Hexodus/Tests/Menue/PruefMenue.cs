/* Ein Menüpunkt, der die Prüfungen laufen lässt – ohne Test Runner.

   Warum das neben der NUnit-Hülle steht: Der Test Runner braucht das Paket
   "Test Framework". Ist es nicht im Projekt, listet er gar nichts auf, und
   die Hülle in Tests/Editor übersetzt nicht einmal. Dieser Menüpunkt hängt
   an nichts davon – er braucht nur den Editor.

   Deshalb liegt er in einer eigenen Assembly: Fällt Tests/Editor wegen des
   fehlenden Pakets aus, funktioniert der Menüpunkt trotzdem. */
using UnityEditor;
using UnityEngine;
using Hexodus.Tests;

namespace Hexodus.Werkzeug
{
    public static class PruefMenue
    {
        [MenuItem("Hexodus/Prüfungen laufen lassen %#h")]
        public static void Alles()
        {
            Lauf("Fundament, Regelwerk und Ablauf", () =>
            {
                GrundlagenTest.Alles();
                RegelTest.Alles();
                AblaufTest.Alles();
            });
        }

        [MenuItem("Hexodus/Nur das Fundament")]
        public static void Fundament() { Lauf("Fundament", GrundlagenTest.Alles); }

        [MenuItem("Hexodus/Nur das Regelwerk")]
        public static void Regelwerk() { Lauf("Regelwerk", RegelTest.Alles); }

        [MenuItem("Hexodus/Nur den Ablauf")]
        public static void Ablauf() { Lauf("Ablauf", AblaufTest.Alles); }

        /* Die Prüfungen schreiben über Pruef.Ausgabe. Hier wird die abgeklemmt
           und das gesammelte Protokoll am Ende in *einer* Meldung abgesetzt:
           240 einzelne Log-Zeilen wären das Console-Fenster zu. Bei einem
           Fehlschlag als LogError, damit die Meldung nicht untergeht.

           Zusätzlich kommt das Ergebnis in die Statusleiste unten links – dort
           steht es auch dann, wenn das Console-Fenster gerade zu ist. */
        private static void Lauf(string was, System.Action pruefungen)
        {
            Pruef.Zuruecksetzen();
            var alt = Pruef.Ausgabe;
            Pruef.Ausgabe = null;
            try { pruefungen(); }
            finally { Pruef.Ausgabe = alt; }

            var bericht = "Hexodus – " + was + "\n" + Pruef.Gesammelt() + Pruef.Bericht();
            if (Pruef.Fehler > 0) Debug.LogError(bericht); else Debug.Log(bericht);

            var kurz = Pruef.Fehler > 0
                ? Pruef.Fehler + " von " + Pruef.Geprueft + " Prüfung(en) fehlgeschlagen – " +
                  "Einzelheiten im Console-Fenster"
                : "Alle " + Pruef.Geprueft + " Prüfungen bestanden (" + was + ")";
            EditorUtility.DisplayDialog("Hexodus", kurz, "Gut");
        }
    }
}
