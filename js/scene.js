/* Hexodus – Kamera: Projektion der Brettwelt auf den Bildschirm.

   Weltkoordinaten: x und y liegen in der Brettebene (genau wie Hex.toPixel sie
   liefert), z zeigt nach oben. Die Kamera schwebt über dem Brett, um `yaw`
   gedreht und um `pitch` über den Horizont geneigt:

     pitch = 90°  Draufsicht – exakt das alte, flache Brett
     pitch < 90°  das Brett kippt zum Betrachter, Figuren stehen sichtbar darauf

   Die Projektion ist eine echte Lochkamera: erst wird die Welt um yaw gedreht
   und um pitch gekippt, dann durch den Abstand zur Kamera geteilt. Dadurch
   erscheint der nahe Brettrand größer als der ferne – ohne diese Teilung
   entstünde eine Isometrie, die flach wirkt und genau das nicht liefert,
   worum es hier geht. */
var Scene = (function () {
  'use strict';

  var RAD = Math.PI / 180;
  var MIN_PITCH = 24;      // flacher wird das Brett zur Kante und unspielbar
  var MAX_PITCH = 90;      // Draufsicht
  var DIST = 2400;         // Augabstand in Weltmaßen: kleiner = stärkere Perspektive

  /* Sonne über dem Brett, fest in der Welt verankert (Nordwest). Beim Drehen
     wandert dadurch das Licht über die Kanten, statt mitzudrehen – erst das
     lässt die Platte wie ein Körper aussehen und nicht wie ein Bild. */
  var SUN = { x: -0.44, y: -0.90 };

  function clampPitch(p) { return Math.max(MIN_PITCH, Math.min(MAX_PITCH, p)); }

  function update(cam) {
    cam.pitch = clampPitch(cam.pitch);
    cam.yaw = ((cam.yaw % 360) + 360) % 360;
    var y = cam.yaw * RAD, p = cam.pitch * RAD;
    cam.cy = Math.cos(y); cam.sy = Math.sin(y);
    cam.cp = Math.cos(p); cam.sp = Math.sin(p);
    return cam;
  }

  function create(pitch, yaw) {
    return update({ yaw: yaw || 0, pitch: pitch === undefined ? MAX_PITCH : pitch, dist: DIST });
  }

  function set(cam, pitch, yaw) {
    if (pitch !== null && pitch !== undefined) cam.pitch = pitch;
    if (yaw !== null && yaw !== undefined) cam.yaw = yaw;
    return update(cam);
  }

  function turn(cam, dYaw, dPitch) {
    cam.yaw += dYaw || 0;
    cam.pitch += dPitch || 0;
    return update(cam);
  }

  /* Weltpunkt → Bildpunkt. `depth` ist der Abstand zur Kamera: je größer,
     desto weiter hinten – danach wird die Zeichenreihenfolge sortiert.
     `k` ist der Perspektivfaktor, mit dem aufrechte Dinge skaliert werden. */
  function project(cam, x, y, z) {
    z = z || 0;
    var rx = x * cam.cy - y * cam.sy;
    var ry = x * cam.sy + y * cam.cy;
    var depth = cam.dist - (ry * cam.cp + z * cam.sp);
    if (depth < cam.dist * 0.2) depth = cam.dist * 0.2;   // niemals hinter die Kamera
    var k = cam.dist / depth;
    return { x: rx * k, y: (ry * cam.sp - z * cam.cp) * k, k: k, depth: depth };
  }

  /* Abstand eines Bodenpunkts zur Kamera – für die Sortierung, ohne zu projizieren */
  function depthAt(cam, x, y, z) {
    return cam.dist - ((x * cam.sy + y * cam.cy) * cam.cp + (z || 0) * cam.sp);
  }

  /* Zeigt eine senkrechte Wand mit dieser Normalen zum Betrachter?
     Bei der Draufsicht (cp = 0) ist keine einzige Wand zu sehen – richtig so. */
  function frontFacing(cam, nx, ny) {
    return (nx * cam.sy + ny * cam.cy) * cam.cp > 0.002;
  }

  /* Helligkeit einer senkrechten Wand: Lambert gegen die feste Sonne,
     angehoben, damit auch abgewandte Kanten lesbar bleiben. */
  function light(nx, ny) {
    var d = nx * SUN.x + ny * SUN.y;
    return 0.62 + 0.38 * (d + 1) / 2;
  }

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(Math.min(255, ((n >> 16) & 255) * f));
    var g = Math.round(Math.min(255, ((n >> 8) & 255) * f));
    var b = Math.round(Math.min(255, (n & 255) * f));
    return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
  }

  return {
    create: create, set: set, turn: turn, update: update,
    project: project, depthAt: depthAt, frontFacing: frontFacing,
    light: light, shade: shade,
    MIN_PITCH: MIN_PITCH, MAX_PITCH: MAX_PITCH, DIST: DIST
  };
})();

if (typeof module !== 'undefined') { module.exports = Scene; }
