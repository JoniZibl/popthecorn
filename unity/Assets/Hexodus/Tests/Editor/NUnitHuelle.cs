/* Dieselben Prüfungen im Unity Test Runner.

   Die Prüfungen selbst stehen in Tests/ und kennen weder NUnit noch Unity –
   sie laufen genauso auf der Kommandozeile (unity/Pruefstand). Hier hängt
   nur eine dünne Hülle davor, damit der Editor sie im Test Runner auflistet.

   Absicht dahinter: Es gibt genau eine Fassung der Prüfungen. Zwei Fassungen
   – eine für die Konsole, eine für den Editor – laufen mit der Zeit
   auseinander, und dann prüft die eine etwas, das die andere längst nicht
   mehr tut. */
using NUnit.Framework;

namespace Hexodus.Tests.Editor
{
    public class GrundlagenPruefung
    {
        [Test]
        public void FundamentStimmtMitDerBrowserFassungUeberein()
        {
            var vorher = Pruef.Fehler;
            GrundlagenTest.Alles();
            Assert.AreEqual(vorher, Pruef.Fehler,
                "Mindestens eine Prüfung ist fehlgeschlagen – die Ausgabe steht in der Konsole.");
        }
    }
}
