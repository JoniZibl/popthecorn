/* Startet die portierten Prüfungen auf der Kommandojeile:
   cd unity/Pruefstand && dotnet run
   Endet mit 1, sobald eine Prüfung fehlschlägt – damit taugt es auch für
   einen Anlauf, der automatisch läuft. */
using System;
using Hexodus.Tests;

namespace Hexodus.Pruefstand
{
    public static class Start
    {
        public static int Main(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            GrundlagenTest.Alles();
            RegelTest.Alles();
            AblaufTest.Alles();
            Console.WriteLine(Pruef.Bericht());
            return Pruef.Fehler > 0 ? 1 : 0;
        }
    }
}
