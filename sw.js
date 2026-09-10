/* Hexodus ohne Internet.

   Beim ersten Besuch legt dieser Service Worker eine vollständige Kopie des
   Spiels im Browser ab. Danach startet Hexodus aus dieser Kopie – im Flugzeug,
   im Keller, im Zug. Das Spiel selbst braucht ohnehin nie eine Verbindung:
   Es rechnet alles im Browser, vom Computergegner bis zur Darstellung.

   Ausgeliefert wird zuerst aus dem Vorrat, danach wird im Hintergrund nach
   einer neueren Fassung gesehen. Der Start bleibt dadurch sofort und
   netzunabhängig; eine neue Fassung ist beim übernächsten Start da. Umgekehrt
   – erst das Netz fragen, dann den Vorrat – hinge jeder Start an der
   Antwortzeit des Servers, und genau das soll hier nicht sein. */
var CACHE = 'hexodus-v1';

var SHELL = [
  './', './index.html', './css/style.css',
  './js/hex.js', './js/units.js', './js/board.js', './js/moves.js',
  './js/game.js', './js/ai.js', './js/scene.js', './js/render.js', './js/ui.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (namen) {
      return Promise.all(namen.map(function (n) {
        return n === CACHE ? null : caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (treffer) {
      /* Im Hintergrund nachsehen, ob es etwas Neueres gibt. Schlägt das fehl
         – kein Netz –, bleibt es beim Vorrat; deshalb der leere Fänger. */
      var frisch = fetch(req).then(function (antwort) {
        if (antwort && antwort.ok) {
          var kopie = antwort.clone();
          caches.open(CACHE).then(function (c) { c.put(req, kopie); });
        }
        return antwort;
      }).catch(function () { return null; });

      if (treffer) return treffer;
      return frisch.then(function (antwort) {
        if (antwort) return antwort;
        // Ohne Netz und ohne Vorrat: Für einen Seitenaufruf die Startseite
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
