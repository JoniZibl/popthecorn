/* Dieselben Prüfungen im Unity Test Runner.

   Die Prüfungen selbst stehen in Tests/ und kennen weder NUnit noch Unity –
   sie laufen genauso auf der Kommandozeile (unity/Pruefstand). Hier hängt
   nur eine dünne Hülle davor, damit der Editor sie im Test Runner auflistet.

   Absicht dahinter: Es gibt genau eine Fassung der Prüfungen. Zwei Fassungen
   – eine für die Konsole, eine für den Editor – laufen mit der Zeit
   auseinander, und dann prüft die eine etwas, das die andere längst nicht
   mehr tut. */
using NUnit.Framework;
using UnityEngine;

namespace Hexodus.Tests.Editor
{
    public class PortierungsPruefung
    {
        [Test]
        public void FundamentStimmtMitDerBrowserFassungUeberein()
        {
            Erwarte(GrundlagenTest.Alles);
        }

        [Test]
        public void RegelwerkStimmtMitDerBrowserFassungUeberein()
        {
            Erwarte(RegelTest.Alles);
        }

        [Test]
        public void AblaufStimmtMitDerBrowserFassungUeberein()
        {
            Erwarte(AblaufTest.Alles);
        }

        /* Die Prüfungen schreiben über Pruef.Ausgabe. Auf der Kommandozeile ist
           das Console.WriteLine – davon zeigt Unitys Console-Fenster nichts, das
           landet nur in der Editor.log. Also wird die Ausgabe hier abgeklemmt
           und das gesammelte Protokoll am Ende in *einer* Debug-Meldung
           abgesetzt: 151 einzelne Log-Zeilen wären das Console-Fenster zu.
           Bei einem Fehlschlag als LogError, damit die Meldung nicht in den
           übrigen Zeilen untergeht. */
        private static void Erwarte(System.Action pruefungen)
        {
            Pruef.Zuruecksetzen();
            var alt = Pruef.Ausgabe;
            Pruef.Ausgabe = null;              // jede Zeile einzeln zu loggen ist zu laut
            try { pruefungen(); }
            finally { Pruef.Ausgabe = alt; }

            var bericht = Pruef.Gesammelt() + Pruef.Bericht();
            if (Pruef.Fehler > 0) Debug.LogError(bericht); else Debug.Log(bericht);

            Assert.AreEqual(0, Pruef.Fehler,
                Pruef.Fehler + " Prüfung(en) fehlgeschlagen – die Zeilen mit FEHL stehen im Console-Fenster.");
        }
    }
}
