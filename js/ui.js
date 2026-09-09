/* Hexodus – Oberfläche und Steuerung */
(function () {
  'use strict';

  var H = Hex, B = Board, U = Units, M = Moves, G = Game;
  function dirArrow(angle) {
    return '<svg class="dir-arrow" viewBox="-11 -11 22 22" aria-hidden="true">' +
      '<path d="M-7,-5 L7,0 L-7,5 L-4,0 Z" transform="rotate(' + angle.toFixed(1) + ')"/></svg>';
  }

  var state = null;
  var view = null;
  var ui = { mode: 'idle', trainType: null, markers: [], placeable: null, facing: null,
             thinking: false, shownEvent: 0, woodShown: null,
             sheetOpen: false, sheetAuto: false, sheetMove: null };

  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- Startmenü ---------------- */

  function buildMenu() {
    var wrap = $('#player-fields');
    function render() {
      var count = +$('#player-count').value;
      var cfg = G.SETUP[count];
      var previous = [];
      for (var q = 0; q < 4; q++) {
        var sel = document.getElementById('pkind' + q);
        previous[q] = sel ? sel.value : (q === 0 ? 'mensch' : 'normal');
      }
      wrap.innerHTML = '';
      for (var i = 0; i < count; i++) {
        var c = G.COLORS[i];
        var row = document.createElement('label');
        row.className = 'player-field';
        row.innerHTML = '<span class="swatch" style="background:' + c.hex + '"></span>' +
          '<input type="text" id="pname' + i + '" value="Spieler ' + (i + 1) + '" maxlength="16">' +
          '<select id="pkind' + i + '" class="kind-select">' +
            '<option value="mensch">Mensch</option>' +
            '<option value="leicht">KI leicht</option>' +
            '<option value="normal">KI normal</option>' +
            '<option value="stark">KI stark</option>' +
          '</select>';
        wrap.appendChild(row);
        document.getElementById('pkind' + i).value = previous[i];
      }
      $('#setup-info').textContent =
        cfg.tiles + ' Plättchen (' + (cfg.tiles * 7) + ' Felder) · ' + cfg.trees + ' Bäume gesamt';
    }
    $('#player-count').addEventListener('change', render);
    render();

    $('#start-game').addEventListener('click', function () {
      var count = +$('#player-count').value;
      var names = [], kinds = [];
      for (var i = 0; i < count; i++) {
        names.push($('#pname' + i).value.trim() || ('Spieler ' + (i + 1)));
        var kind = $('#pkind' + i).value;
        kinds.push(kind === 'mensch' ? null : kind);
      }
      startGame(names, kinds);
    });
  }

  function startGame(names, kinds) {
    state = G.create(names, kinds);
    ui = { mode: 'idle', trainType: null, markers: [], placeable: null, facing: null,
           thinking: false, shownEvent: 0, woodShown: null,
           sheetOpen: false, sheetAuto: false, sheetMove: null };
    $('#screen-menu').classList.add('hidden');
    $('#screen-game').classList.remove('hidden');
    // am Handy blendet das die Kopfzeile aus – der Bildschirm gehört dem Brett
    document.body.classList.add('in-game');
    if (!view) {
      view = Render.create($('#board'));
      ladeAnsicht();
      attachBoardEvents();
    }
    // Der Blickwinkel gehört dem Spieler: Jede Partie beginnt so, wie er das
    // Brett zuletzt hingestellt hat.
    Render.setCamera(view, ansicht.pitch, ansicht.yaw);
    Render.fit(view, state.board);
    var r = $('#board').getBoundingClientRect();
    brettGroesse = { w: r.width, h: r.height };
    updateTiltButton();
    refresh();
  }

  /* ---------------- Kamera: drehen und neigen ----------------
     Das Brett ist eine Platte im Raum; gedreht und gekippt wird die Kamera,
     nicht das Spiel. Jede Änderung lässt render.js die Szene neu aufbauen –
     die Zellen müssen für den Maler-Algorithmus neu sortiert werden. */

  var camAnim = null;
  var brettGroesse = null;      // zuletzt gesehene Größe der Brettfläche

  /* Der eingestellte Blickwinkel gehört dem Spieler, nicht der Partie: Er
     überlebt das Umschalten in die Draufsicht, ein neues Spiel und das
     Neuladen der Seite. `schraeg` ist die Neigung, zu der der 2D/3D-Knopf
     zurückkehrt – also die zuletzt selbst eingestellte. */
  var ANSICHT_KEY = 'hexodus.ansicht';
  var ansicht = { yaw: 0, pitch: Render.TILT, schraeg: Render.TILT };
  var sicherungTimer = null;

  function ladeAnsicht() {
    try {
      var roh = window.localStorage.getItem(ANSICHT_KEY);
      if (!roh) return;
      var a = JSON.parse(roh);
      ['yaw', 'pitch', 'schraeg'].forEach(function (feld) {
        if (typeof a[feld] === 'number' && isFinite(a[feld])) ansicht[feld] = a[feld];
      });
    } catch (e) { /* privater Modus oder kaputter Eintrag: dann eben die Voreinstellung */ }
  }

  /* Nicht bei jedem Bild schreiben: Beim Ziehen fielen sonst Dutzende
     Speichervorgänge je Sekunde an. */
  function sichereAnsicht() {
    if (sicherungTimer) clearTimeout(sicherungTimer);
    sicherungTimer = setTimeout(function () {
      sicherungTimer = null;
      try {
        window.localStorage.setItem(ANSICHT_KEY, JSON.stringify({
          yaw: Math.round(ansicht.yaw * 10) / 10,
          pitch: Math.round(ansicht.pitch * 10) / 10,
          schraeg: Math.round(ansicht.schraeg * 10) / 10
        }));
      } catch (e) { /* nicht schlimm – dann merkt sich die Ansicht eben nichts */ }
    }, 500);
  }

  var readoutTimer = null;

  /* Kurze Rückmeldung beim Einstellen: Wer die Kamera selbst dreht, soll
     sehen, wo er gelandet ist – und die Anzeige danach wieder loswerden. */
  function showReadout() {
    var el = $('#cam-readout');
    if (!el || !view) return;
    // 359,6° auf 360 gerundet sähe aus wie eine siebte Umdrehung – 0 ist gemeint
    el.textContent = 'Neigung ' + Math.round(view.cam.pitch) + '° · ' +
                     'Drehung ' + (Math.round(view.cam.yaw) % 360) + '°';
    el.classList.add('is-visible');
    if (readoutTimer) clearTimeout(readoutTimer);
    readoutTimer = setTimeout(function () { el.classList.remove('is-visible'); }, 1400);
  }

  function updateTiltButton() {
    var btn = $('#view-tilt');
    if (!btn || !view) return;
    var flat = Render.isFlat(view);
    // Der Knopf zeigt, wohin er führt, nicht wo man ist
    btn.textContent = flat ? '3D' : '2D';
    btn.title = flat ? 'Brett schräg stellen' : 'Von oben auf das Brett schauen';
  }

  function orbitNow(dYaw, dPitch) {
    if (!view) return;
    Render.orbit(view, dYaw, dPitch);
    merkeAnsicht();
    updateTiltButton();
    showReadout();
  }

  /* Nach jeder selbst ausgelösten Änderung: Winkel merken. Die Draufsicht
     zählt dabei nicht als Schrägsicht – sonst hätte der 2D/3D-Knopf nach dem
     Umschalten kein Ziel mehr, zu dem er zurückkehren könnte. */
  function merkeAnsicht() {
    ansicht.yaw = view.cam.yaw;
    ansicht.pitch = view.cam.pitch;
    if (!Render.isFlat(view)) ansicht.schraeg = view.cam.pitch;
    sichereAnsicht();
  }

  /* Weich zu einem Blickwinkel fahren. Der Zwischenschritt wird immer aus dem
     zuletzt angesteuerten Wert berechnet, nicht aus der Kamera selbst – deren
     Gierwinkel springt bei 360° auf 0 zurück und risse die Fahrt auseinander. */
  function camTo(yaw, pitch, ms) {
    if (!view) return;
    if (camAnim) { cancelAnimationFrame(camAnim); camAnim = null; }
    var y0 = view.cam.yaw, p0 = view.cam.pitch;
    var dy = yaw - y0, dp = pitch - p0;
    if (reducedMotion() || (!dy && !dp)) { return orbitNow(dy, dp); }
    var t0 = null, yPrev = y0, pPrev = p0;
    camAnim = requestAnimationFrame(function step(ts) {
      if (t0 === null) t0 = ts;
      var t = Math.min(1, (ts - t0) / (ms || 420));
      var e = 1 - Math.pow(1 - t, 3);
      var yNow = y0 + dy * e, pNow = p0 + dp * e;
      Render.orbit(view, yNow - yPrev, pNow - pPrev);
      yPrev = yNow; pPrev = pNow;
      camAnim = t < 1 ? requestAnimationFrame(step) : null;
      if (!camAnim) { merkeAnsicht(); updateTiltButton(); showReadout(); }
    });
  }

  /* Beim Ziehen mit der Maus oder zwei Fingern fällt pro Bild höchstens eine
     Drehung an – ohne diese Bremse würde die Szene mehrfach je Bild neu
     aufgebaut und das Drehen ruckelt. */
  var orbitTarget = null, orbitFrame = 0;

  /* Die Zwei-Finger-Drehung liefert Schritte, keine Zielwerte. Sie müssen sich
     auf einen schon wartenden Schritt aufaddieren – sonst geht jede Bewegung
     verloren, die im selben Bild noch vor dem Neuzeichnen eintrifft. */
  function queueOrbitBy(dYaw, dPitch) {
    var basis = orbitTarget || { yaw: view.cam.yaw, pitch: view.cam.pitch };
    queueOrbit(basis.yaw + (dYaw || 0), basis.pitch + (dPitch || 0));
  }

  function queueOrbit(yaw, pitch) {
    orbitTarget = { yaw: yaw, pitch: Math.max(Scene.MIN_PITCH, Math.min(Scene.MAX_PITCH, pitch)) };
    if (orbitFrame) return;
    orbitFrame = requestAnimationFrame(function () {
      orbitFrame = 0;
      var t = orbitTarget;
      orbitTarget = null;
      if (t && view) orbitNow(t.yaw - view.cam.yaw, t.pitch - view.cam.pitch);
    });
  }

  /* ---------------- Interaktion mit dem Brett ---------------- */

  function attachBoardEvents() {
    var svg = view.svg;
    var pointers = {};      // aktive Finger/Zeiger
    var drag = null;        // Verschieben mit einem Zeiger
    var pinch = null;       // Zoomen mit zwei Fingern
    var moved = false;

    function count() { return Object.keys(pointers).length; }

    function centerOf() {
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
               dist: Math.hypot(a.x - b.x, a.y - b.y),
               angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }

    svg.addEventListener('pointerdown', function (e) {
      // Wer das Brett anfasst, will das Brett: Schublade und Kamerasteuerung
      // machen Platz. Verlangt die Stellung eine Entscheidung, zieht das
      // nächste Neuzeichnen die Schublade ohnehin wieder auf.
      schliesseUeberlagerungen();
      // Zielfeld schon hier merken: durch das Pointer-Capture landet das
      // pointerup-Event sonst auf dem SVG statt auf dem Hexfeld.
      var node = e.target.closest ? e.target.closest('[data-key],[data-facing]') : null;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId);

      if (count() === 1) {
        // Umschalttaste, rechte oder mittlere Maustaste: drehen statt schieben
        var turning = e.shiftKey || e.button === 1 || e.button === 2;
        var ziel = (node && !turning) ? node : null;
        drag = {
          id: e.pointerId, x: e.clientX, y: e.clientY,
          vx: view.view.x, vy: view.view.y, turn: turning,
          yaw: view.cam.yaw, pitch: view.cam.pitch,
          key: ziel ? ziel.getAttribute('data-key') : null,
          facing: ziel ? ziel.getAttribute('data-facing') : null
        };
        moved = false;
      } else if (count() === 2) {
        // zweiter Finger: Verschieben abbrechen, Zoom und Drehung beginnen
        drag = null;
        moved = true;
        var c = centerOf();
        pinch = { dist: c.dist || 1, angle: c.angle, y: c.y, kippt: false, start: {} };
        Object.keys(pointers).forEach(function (id) { pinch.start[id] = pointers[id].y; });
      }
    });

    svg.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId].x = e.clientX;
      pointers[e.pointerId].y = e.clientY;

      if (pinch && count() === 2) {
        var c = centerOf();
        if (!c.dist) return;
        var rect = svg.getBoundingClientRect();
        Render.zoomBy(view, c.dist / pinch.dist, c.x - rect.left, c.y - rect.top);
        // Verdrehen der beiden Finger dreht das Brett wie eine Scheibe
        var da = c.angle - pinch.angle;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;

        /* Ziehen beide Finger gemeinsam nach oben oder unten, kippt das Brett.
           Erkannt wird das daran, wie weit jeder Finger seit Beginn der Geste
           gewandert ist – nicht daran, wie er sich seit dem letzten Ereignis
           bewegt hat: Jeder Finger meldet sich einzeln, in einem einzelnen
           Ereignis bewegt sich also immer nur einer.

           Beide müssen mindestens 12 Pixel in dieselbe Richtung gelaufen sein.
           Beim Aufziehen und beim Verdrehen laufen sie gegeneinander, und wer
           einen Finger liegen lässt und nur den anderen wegzieht, verschiebt
           zwar die Mitte, meint aber den Zoom und keine Neigung. Ist die Geste
           einmal als Kippen erkannt, bleibt sie es bis zum Loslassen. */
        var ids = Object.keys(pointers);
        var wegA = pointers[ids[0]].y - pinch.start[ids[0]];
        var wegB = pointers[ids[1]].y - pinch.start[ids[1]];
        if (!pinch.kippt && Math.min(Math.abs(wegA), Math.abs(wegB)) > 12 && wegA * wegB > 0) {
          pinch.kippt = true;
        }
        var dPitch = pinch.kippt ? -(c.y - pinch.y) * 0.3 : 0;

        if (Math.abs(da) > 0.005 || dPitch) queueOrbitBy(da * 180 / Math.PI, dPitch);
        pinch.dist = c.dist;
        pinch.angle = c.angle;
        pinch.y = c.y;
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (drag.turn) {
        // nach unten ziehen legt das Brett flach zum Betrachter
        queueOrbit(drag.yaw + dx * 0.35, drag.pitch - dy * 0.3);
        return;
      }
      view.view.x = drag.vx + dx;
      view.view.y = drag.vy + dy;
      Render.applyView(view);
    });

    function release(e) {
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      delete pointers[e.pointerId];
      if (count() < 2) pinch = null;

      var wasDrag = drag && drag.id === e.pointerId;
      var hit = wasDrag ? drag.key : null;
      var richtung = wasDrag ? drag.facing : null;
      if (wasDrag) drag = null;
      if (count() > 0 || !wasDrag || moved) return;
      if (richtung !== null && richtung !== undefined) handleFacingClick(+richtung);
      else if (hit) handleCellClick(hit);
      else deselect();
    }
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', function (e) {
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      delete pointers[e.pointerId];
      if (count() < 2) pinch = null;
      if (drag && drag.id === e.pointerId) drag = null;
    });

    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = svg.getBoundingClientRect();
      Render.zoomBy(view, e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    // Rechtsklick dreht das Brett – das Kontextmenü stört dabei nur
    svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    $('#zoom-in').addEventListener('click', function () { centreZoom(1.2); });
    $('#zoom-out').addEventListener('click', function () { centreZoom(1 / 1.2); });
    $('#zoom-fit').addEventListener('click', function () { Render.fit(view, state.board); });
    $('#rot-left').addEventListener('click', function () { camTo(view.cam.yaw - 30, view.cam.pitch, 320); });
    $('#rot-right').addEventListener('click', function () { camTo(view.cam.yaw + 30, view.cam.pitch, 320); });
    // Kippen in Schritten – ohne Animation, damit mehrfaches Tippen sofort wirkt
    $('#tilt-up').addEventListener('click', function () { orbitNow(0, 6); });
    $('#tilt-down').addEventListener('click', function () { orbitNow(0, -6); });
    $('#view-tilt').addEventListener('click', function () {
      // zurück geht es zu dem Winkel, den der Spieler sich selbst eingestellt hat
      camTo(view.cam.yaw, Render.isFlat(view) ? ansicht.schraeg : Render.FLAT, 500);
    });

    document.addEventListener('keydown', cameraKeys);
  }

  /* Pfeiltasten drehen und neigen das Brett – ohne Animation, damit die
     Tastenwiederholung selbst die weiche Bewegung ergibt. */
  function cameraKeys(e) {
    if (!view || !state) return;
    if (!$('#screen-game') || $('#screen-game').classList.contains('hidden')) return;
    if (!$('#rules').classList.contains('hidden')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    var yaw = 0, pitch = 0;
    if (e.key === 'ArrowLeft') yaw = -12;
    else if (e.key === 'ArrowRight') yaw = 12;
    else if (e.key === 'ArrowUp') pitch = 5;
    else if (e.key === 'ArrowDown') pitch = -5;
    else return;
    e.preventDefault();
    orbitNow(yaw, pitch);
  }

  function centreZoom(f) {
    var rect = view.svg.getBoundingClientRect();
    Render.zoomBy(view, f, rect.width / 2, rect.height / 2);
  }

  function handleCellClick(key) {
    if (ui.thinking || aiLevel()) return;      // die KI ist am Zug
    var cell = state.board.cells[key];
    if (!cell) return;

    if (state.phase === 'trees') {
      G.placeTree(state, cell.q, cell.r);
      return refresh();
    }
    if (state.phase === 'kings') {
      if (state.awaitWorker) G.placeWorker(state, cell.q, cell.r);
      else G.placeKing(state, cell.q, cell.r);
      return refresh();
    }
    if (state.phase !== 'play') return;
    if (state.pending) return; // erst Richtung bestätigen

    if (ui.mode === 'train') {
      if (G.train(state, ui.trainType, cell.q, cell.r)) {
        ui.mode = 'idle'; ui.trainType = null;
      }
      return refresh();
    }

    // Aktion auf einem markierten Feld ausführen
    if (state.selected) {
      var hit = ui.markers.filter(function (m) { return H.key(m.q, m.r) === key; });
      if (hit.length) {
        var action = hit[0];
        var from = state.board.cells[state.selected];
        G.perform(state, from, action);
        return refresh();
      }
    }

    if (cell.piece && cell.piece.owner === state.current) {
      state.selected = key;
      ui.mode = 'idle';
      return refresh();
    }
    deselect();
  }

  /* Ein Tipp auf einen der Pfeile richtet die Figur aus und beendet den Zug –
     auch der Pfeil, in den sie ohnehin schon blickt: Dann bleibt sie stehen,
     wie sie steht. So braucht es für „so lassen“ keinen eigenen Knopf. */
  function handleFacingClick(dir) {
    if (ui.thinking || aiLevel()) return;
    if (!state || !state.pending || !state.selected) return;
    G.rotate(state, state.selected, dir);
    refresh();
  }

  function deselect() {
    if (state && !state.pending) {
      state.selected = null;
      ui.mode = 'idle';
      ui.trainType = null;
      refresh();
    }
  }

  /* ---------------- Handy: Schublade und Ansicht ----------------
     Am Handy gehört der Bildschirm dem Brett. Die Aktionen warten in einer
     Schublade, die Kamerasteuerung ist eingeklappt. Von selbst aufgezogen wird
     die Schublade nur, wenn das Spiel eine Entscheidung verlangt – und wieder
     geschlossen, sobald man ein Feld antippen soll. */

  function schmal() {
    return !window.matchMedia || window.matchMedia('(max-width: 900px)').matches;
  }

  // Verlangt die Stellung eine Eingabe, die nur die Schublade bietet?
  function brauchtSchublade() {
    if (!state) return false;
    if (state.phase === 'over') return true;
    // Die Richtung wird am Brett gewählt; nur ohne Pfeile braucht es die Liste
    if (state.pending) return !ui.facing;
    if (state.phase !== 'play') return false;
    var p = state.players[state.current];
    return !p.ai && !p.eliminated && !M.hasAnyAction(state, state.current);
  }

  function schubladenTitel() {
    if (!state) return 'Aktionen';
    if (state.phase === 'over') return 'Spielende';
    if (state.pending) return 'Richtung wählen';
    if (state.phase === 'trees') return 'Bäume';
    if (state.phase === 'kings') return 'Aufstellen';
    if (state.players[state.current].ai) return 'Aktionen';
    return brauchtSchublade() ? 'Zug aussetzen' : 'Ausbilden';
  }

  function setSchublade(offen) {
    ui.sheetOpen = !!offen;
    var sheet = $('#sheet'), knopf = $('#sheet-toggle');
    if (sheet) sheet.classList.toggle('is-open', ui.sheetOpen);
    if (knopf) knopf.setAttribute('aria-expanded', ui.sheetOpen ? 'true' : 'false');
  }

  function updateSchublade() {
    var knopf = $('#sheet-toggle');
    var noetig = brauchtSchublade();
    if (knopf) {
      knopf.textContent = schubladenTitel();
      knopf.classList.toggle('is-urgent', noetig);
    }
    if (!schmal()) return setSchublade(false);
    // Ein neuer Zug – oder ein Phasenwechsel – räumt die Schublade wieder weg,
    // damit das Brett frei liegt
    var marke = state.phase + '#' + state.moveNo;
    if (ui.sheetMove !== marke) {
      ui.sheetMove = marke;
      if (!noetig) setSchublade(false);
    }
    // Von selbst Aufgezogenes wird auch von selbst wieder weggeräumt, sobald
    // die Entscheidung getroffen ist – von Hand Geöffnetes bleibt stehen.
    if (noetig) { ui.sheetAuto = true; return setSchublade(true); }
    if (ui.sheetAuto) { ui.sheetAuto = false; return setSchublade(false); }
    if (ui.trainType) return setSchublade(false);   // jetzt wird ein Feld angetippt
    setSchublade(ui.sheetOpen);
  }

  function schliesseUeberlagerungen() {
    if (!schmal()) return;
    if (ui.sheetOpen) setSchublade(false);
    var hud = $('.board-hud'), knopf = $('#hud-toggle');
    if (hud && hud.classList.contains('is-open')) {
      hud.classList.remove('is-open');
      if (knopf) knopf.setAttribute('aria-expanded', 'false');
    }
  }

  function bindMobileBar() {
    $('#sheet-toggle').addEventListener('click', function () { setSchublade(!ui.sheetOpen); });
    $('#hud-toggle').addEventListener('click', function () {
      var hud = $('.board-hud');
      var offen = !hud.classList.contains('is-open');
      hud.classList.toggle('is-open', offen);
      this.setAttribute('aria-expanded', offen ? 'true' : 'false');
    });
    $('#sheet-rules').addEventListener('click', function () { $('#rules').classList.remove('hidden'); });
    $('#sheet-menu').addEventListener('click', backToMenu);
  }

  /* ---------------- Markierungen ---------------- */

  function computeMarkers() {
    ui.markers = [];
    ui.placeable = null;
    ui.facing = null;

    /* Wartet das Spiel auf eine Richtung, wird sie direkt am Brett gewählt:
       sechs Pfeile rund um die Figur. Zugfelder gibt es in diesem Zustand
       keine, die Pfeile stehen also allein. */
    if (state.pending && state.selected) {
      var pc = state.board.cells[state.selected];
      if (pc && pc.piece && U.DEFS[pc.piece.type].directional) {
        ui.facing = { key: state.selected, type: pc.piece.type,
                      current: pc.piece.facing, color: state.players[state.current].color };
      }
    }

    if (state.phase === 'trees') {
      ui.placeable = {};
      state.board.keys.forEach(function (k) {
        if (B.isFree(state.board.cells[k])) ui.placeable[k] = true;
      });
      return;
    }
    if (state.phase === 'kings') {
      ui.placeable = {};
      state.board.keys.forEach(function (k) {
        var cell = state.board.cells[k];
        if (state.awaitWorker) {
          if (!B.isFree(cell)) return;
          var next = H.neighbors(cell).some(function (nb) {
            var c = B.at(state.board, nb);
            return c && c.piece && c.piece.type === 'king' && c.piece.owner === state.current;
          });
          if (next) ui.placeable[k] = true;
        } else if (G.canPlaceKing(state, cell)) {
          ui.placeable[k] = true;
        }
      });
      return;
    }
    if (state.phase !== 'play') return;

    if (ui.mode === 'train' && ui.trainType) {
      M.trainingSpots(state.board, state.current).forEach(function (c) {
        ui.markers.push({ kind: 'train', q: c.q, r: c.r });
      });
      return;
    }
    if (state.selected && !state.pending) {
      var cell = state.board.cells[state.selected];
      ui.markers = G.actionsFor(state, cell);
    }
  }

  /* ---------------- Seitenleiste ---------------- */

  function renderPlayers() {
    var vorher = ui.woodShown || {};
    ui.woodShown = {};
    state.players.forEach(function (p) { ui.woodShown[p.index] = p.wood; });
    var html = state.players.map(function (p) {
      var cls = 'player-card' + (p.index === state.current && state.phase !== 'over' ? ' is-current' : '') +
        (p.eliminated ? ' is-out' : '');
      var extra;
      if (state.phase === 'trees') extra = p.treesLeft + ' Bäume übrig';
      else if (p.eliminated) extra = 'ausgeschieden';
      else extra = G.pieceCount(state, p.index) + ' Figuren';
      var tag = p.ai ? ' <span class="ai-tag">KI ' + p.ai + '</span>' : '';
      return '<div class="' + cls + '" style="--pc:' + p.color + '">' +
        '<span class="swatch"></span>' +
        '<span class="pname">' + esc(p.name) + tag + '</span>' +
        '<span class="wood' + (vorher[p.index] !== undefined && vorher[p.index] !== p.wood
          ? ' just-changed' : '') + '" title="Holz">\u{1F332} ' + p.wood + '</span>' +
        '<span class="meta">' + extra + '</span>' +
        '</div>';
    }).join('');
    $('#players').innerHTML = html;
  }

  // Kurztext auf dem Knopf: warum geht die Einheit gerade nicht?
  var BLOCK_TEXT = {
    'steht im Spiel': 'steht schon im Spiel',
    'schon ausgebildet': 'nur einmal pro Spiel',
    'zu wenig Holz': null   // Kosten bleiben sichtbar
  };

  function trainMenuHtml() {
    var spots = M.trainingSpots(state.board, state.current).length;
    var rows = U.TRAIN_ORDER.map(function (id) {
      var def = U.DEFS[id];
      var blocker = M.trainBlocker(state, state.current, id);
      var label = (blocker && BLOCK_TEXT[blocker]) || (def.cost + '× \u{1F332}');
      var disabled = blocker !== null || !spots;
      return '<button class="train-btn' + (ui.trainType === id ? ' is-active' : '') +
        (blocker === 'steht im Spiel' ? ' is-fielded' : '') + '"' +
        (disabled ? ' disabled' : '') + ' data-train="' + id + '" title="' + esc(def.short) + '">' +
        '<span class="tn">' + def.name + '</span>' +
        '<span class="tc">' + label + '</span>' +
        '</button>';
    }).join('');
    var note = !spots ? '<p class="hint warn">Kein freies Feld an deiner Einheiten-Kette.</p>' : '';
    return '<h3>Ausbilden</h3>' + note + '<div class="train-grid">' + rows + '</div>' +
      '<p class="hint small">Von jeder Figur darf nur eine im Spiel sein. Wird sie geschlagen, ' +
      'kannst du sie neu ausbilden – den Zenturio jedoch nur einmal pro Partie.</p>';
  }

  function selectedHtml() {
    if (!state.selected) return '';
    var cell = state.board.cells[state.selected];
    if (!cell || !cell.piece) return '';
    var def = U.DEFS[cell.piece.type];
    var html = '<h3>' + def.name + '</h3><p class="hint">' + esc(def.short) + '</p>';
    var wedge = cell.piece.type === 'springer';
    if (def.directional) {
      html += '<p class="hint">Richtung: <strong>' +
        (wedge ? H.wedgeName(cell.piece.facing) : H.DIR_NAMES[cell.piece.facing]) +
        '</strong></p>';
    }
    if (state.pending) {
      html += '<p class="hint accent">' + (state.pending.kind === 'trainFacing'
        ? 'Tippe am Brett den Pfeil an, in dessen Richtung die neue Einheit blicken soll.'
        : 'Tippe am Brett einen Pfeil an. Der hervorgehobene ist die jetzige Richtung – ' +
          'ihn anzutippen beendet den Zug, ohne zu drehen.') + '</p>';
    } else if (def.directional) {
      html += '<p class="hint">Drehen kostet einen ganzen Zug.</p>';
    }
    if (def.directional) {
      html += '<div class="dir-grid' + (wedge ? ' is-wedge' : '') + '">' +
        [0, 1, 2, 3, 4, 5].map(function (d) {
          return '<button class="dir-btn' + (cell.piece.facing === d ? ' is-active' : '') +
            '" data-dir="' + d + '" title="' + (wedge ? H.wedgeName(d) : H.DIR_NAMES[d]) + '">' +
            dirArrow(wedge ? H.wedgeAngle(d) : H.dirAngle(d)) +
            '<span>' + (wedge ? H.wedgeShort(d) : H.DIR_SHORT[d]) + '</span></button>';
        }).join('') + '</div>';
    }
    if (state.pending) {
      html += '<button class="wide-btn" id="end-pending">Zug beenden</button>';
    }
    return html;
  }

  function renderPanel() {
    var panel = $('#action-panel');
    var banner = $('#phase-banner');
    var p = state.players[state.current];

    if (state.phase === 'trees') {
      banner.innerHTML = '<strong style="color:' + p.color + '">' + esc(p.name) + '</strong>' +
        ' setzt einen Baum · noch ' + p.treesLeft + ' übrig';
      if (p.ai) { panel.innerHTML = '<h3>Bäume platzieren</h3>' +
        '<p class="hint">' + esc(p.name) + ' (KI) verteilt seine Bäume.</p>'; return; }
      panel.innerHTML = '<h3>Bäume platzieren</h3>' +
        '<p class="hint">Jeder Spieler setzt reihum einen Baum auf ein freies Grasfeld. ' +
        'Bäume liefern später das Holz für neue Einheiten.</p>' +
        '<button class="wide-btn" id="auto-trees">Restliche Bäume zufällig setzen</button>';
      return;
    }

    if (state.phase === 'kings') {
      banner.innerHTML = '<strong style="color:' + p.color + '">' + esc(p.name) + '</strong> ' +
        (state.awaitWorker ? 'stellt den Arbeiter neben den Turm' : 'setzt den Königs-Turm');
      if (p.ai) { panel.innerHTML = '<h3>Türme &amp; Arbeiter</h3>' +
        '<p class="hint">' + esc(p.name) + ' (KI) sucht sich einen Platz.</p>'; return; }
      panel.innerHTML = '<h3>Türme &amp; Arbeiter</h3>' +
        '<p class="hint">' + (state.awaitWorker
          ? 'Der Arbeiter muss direkt neben dem eigenen Turm stehen.'
          : 'Wähle ein freies Feld mit Abstand zu den anderen Türmen. Der letzte Spieler, der seinen Turm setzt, beginnt.') +
        '</p>';
      return;
    }

    if (state.phase === 'over') {
      // Bei einer Wertung steht der Grund direkt in der Kopfzeile – sonst wirkt
      // ein Sieg mit noch stehendem Gegner-Turm wie ein Fehler.
      banner.innerHTML = state.winner !== null
        ? '<strong style="color:' + state.players[state.winner].color + '">' +
          esc(state.players[state.winner].name) + '</strong> gewinnt' +
          (state.endReason ? ' nach Wertung · ' + esc(state.endReason) : ' – Königs-Turm geschlagen!')
        : 'Das Spiel ist beendet.';
      var grund = state.endReason
        ? '<p class="hint">' + esc(state.endReason) + ' – gewertet wurde nach Vermögen: ' +
          'Holzvorrat plus das Holz, das in den Figuren steckt.</p>' +
          '<ul class="score-list">' + state.players.map(function (pl) {
            return '<li><span class="dot" style="background:' + pl.color + '"></span>' +
              esc(pl.name) + ': <strong>' + G.wealth(state, pl.index) + '</strong> Holz' +
              (pl.eliminated ? ' (ausgeschieden)' : '') + '</li>';
          }).join('') + '</ul>'
        : '<p class="hint">Der Königs-Turm ist gefallen.</p>';
      panel.innerHTML = '<h3>Spielende</h3>' + grund +
        '<button class="wide-btn" id="back-menu">Neues Spiel</button>';
      return;
    }

    // Spielphase
    banner.innerHTML = 'Runde ' + state.turn + ' · <strong style="color:' + p.color + '">' +
      esc(p.name) + '</strong> ist am Zug · \u{1F332} ' + p.wood +
      (state.pending && ui.facing ? ' · <span class="accent">Richtung antippen</span>' : '');

    if (p.ai) {
      panel.innerHTML = '<h3>' + esc(p.name) + '</h3>' +
        '<p class="hint">Der Computergegner (' + p.ai + ') ist am Zug.</p>';
      return;
    }

    var html = '';
    var stuck = !state.pending && !M.hasAnyAction(state, state.current);
    if (stuck) {
      html += '<p class="hint warn">Keine Aktion möglich.</p>' +
        '<button class="wide-btn" id="pass-turn">Zug aussetzen</button>';
    }
    html += selectedHtml();
    if (!state.pending) html += trainMenuHtml();
    if (!state.selected && !state.pending) {
      html += '<p class="hint small">Wähle eine eigene Figur, um ihre Züge zu sehen.</p>';
    }
    panel.innerHTML = html;
  }

  function renderLog() {
    $('#log-list').innerHTML = state.log.map(function (e) {
      var color = e.player !== null && e.player !== undefined ? state.players[e.player].color : '#8b98a8';
      return '<li><span class="dot" style="background:' + color + '"></span>' + esc(e.text) + '</li>';
    }).join('');
  }

  function bindPanel() {
    var panel = $('#action-panel');
    panel.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (ui.thinking && btn.id !== 'back-menu') return;
      if (btn.id === 'auto-trees') { G.autoPlaceTrees(state); return refresh(); }
      if (btn.id === 'back-menu') { return backToMenu(); }
      if (btn.id === 'pass-turn') { G.pass(state); return refresh(); }
      if (btn.id === 'end-pending') { G.endPending(state); return refresh(); }
      if (btn.dataset.train) {
        ui.trainType = (ui.trainType === btn.dataset.train) ? null : btn.dataset.train;
        ui.mode = ui.trainType ? 'train' : 'idle';
        state.selected = null;
        return refresh();
      }
      if (btn.dataset.dir && state.selected) {
        G.rotate(state, state.selected, +btn.dataset.dir);
        return refresh();
      }
    });
  }

  function backToMenu() {
    $('#screen-game').classList.add('hidden');
    $('#screen-menu').classList.remove('hidden');
    document.body.classList.remove('in-game');
    $('#rules').classList.add('hidden');
    setSchublade(false);
  }

  function refresh() {
    computeMarkers();
    var chain = (state.phase === 'play' && !state.players[state.current].eliminated)
      ? M.supplyChain(state.board, state.current) : null;
    Render.draw(view, state, {
      markers: ui.markers, placeable: ui.placeable, lastMove: state.lastMove,
      facing: ui.facing,
      chain: chain, chainColor: state.players[state.current].color
    });
    renderPlayers();
    renderPanel();
    renderLog();
    updateSchublade();
    playEffects();
    scheduleAI();
  }

  /* ---------------- Bewegte Rückmeldung ----------------
     Nach jedem Neuzeichnen: neue Ereignisse einmal sichtbar machen. Gezeigt wird
     nur, was seit dem letzten Bild dazugekommen ist (moveNo). */

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function run(node, frames, options) {
    if (!node || !node.animate) return;
    try { node.animate(frames, options); } catch (e) { /* ältere Browser: ohne Animation */ }
  }

  /* fx = { outer, inner } aus render.js: animiert wird die innere Gruppe,
     entfernt die äußere, die die Position trägt. */
  function fade(fx, frames, ms) {
    if (!fx) return;
    var outer = fx.outer, inner = fx.inner;
    function weg() { if (outer.parentNode) outer.parentNode.removeChild(outer); }
    if (inner.animate) {
      var anim = inner.animate(frames, { duration: ms, easing: 'ease-out', fill: 'forwards' });
      anim.onfinish = weg;
    }
    setTimeout(weg, ms + 60);
  }

  function playEffects() {
    if (!state || reducedMotion()) { ui.shownEvent = state ? state.moveNo : 0; return; }
    if (state.moveNo === ui.shownEvent) return;
    ui.shownEvent = state.moveNo;
    var board = state.board;

    // Geschlagene Figur ein letztes Mal zeigen
    var cap = state.lastCapture;
    if (cap) {
      var ghost = Render.ghost(view, board, cap.key, cap.type, state.players[cap.owner].color);
      fade(ghost, [{ opacity: 1, transform: 'scale(1)' },
                   { opacity: 0, transform: 'scale(1.5)' }], 420);
      fade(Render.pulse(view, board, cap.key, 'pulse-capture'),
           [{ opacity: .9, transform: 'scale(.5)' }, { opacity: 0, transform: 'scale(1.6)' }], 460);
    }

    // Ziehende Figur von ihrem alten Feld heranfahren lassen
    var mv = state.lastMove;
    if (mv && mv.kind !== 'shoot') {
      var node = Render.pieceAt(view, mv.toKey);
      var a = Render.cellPixel(view, board, mv.fromKey);
      var b = Render.cellPixel(view, board, mv.toKey);
      if (node && a && b) {
        run(node, [
          { transform: 'translate(' + (a.x - b.x) + 'px,' + (a.y - b.y) + 'px)' },
          { transform: 'translate(0,0)' }
        ], { duration: 300, easing: 'cubic-bezier(.25,.9,.3,1)' });
      }
    }

    // Schuss: Blitz beim Schützen und beim Ziel
    if (mv && mv.kind === 'shoot') {
      fade(Render.pulse(view, board, mv.fromKey, 'pulse-shot'),
           [{ opacity: .8, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.2)' }], 320);
    }

    // Baum gefällt: "+1" steigt auf
    var hv = state.lastHarvest;
    if (hv) {
      fade(Render.floatText(view, board, hv.key, '+1 \u{1F332}', state.players[hv.owner].color),
           [{ opacity: 1, transform: 'translateY(0)' },
            { opacity: 0, transform: 'translateY(-26px)' }], 900);
    }

    // Neue Einheit wächst aus dem Boden
    var tr = state.lastTrain;
    if (tr) {
      run(Render.pieceAt(view, tr.key),
          [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
          { duration: 340, easing: 'cubic-bezier(.2,1.3,.4,1)' });
      fade(Render.pulse(view, board, tr.key, 'pulse-train'),
           [{ opacity: .8, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.4)' }], 480);
    }
  }

  /* ---------------- Computergegner ---------------- */

  function aiLevel() {
    if (!state || state.phase === 'over') return null;
    var p = state.players[state.current];
    return (p && !p.eliminated) ? p.ai : null;
  }

  /* Ist die KI am Zug, vergeht bis zu ihrem Zug mindestens eine Sekunde – so
     wirkt sie wie ein Mitspieler, der nachdenkt, statt sofort zuzuschlagen.
     Rechnet sie länger (starke Stufe), wird nicht zusätzlich gewartet.
     In der Aufbauphase bleibt es zügig: 30 Bäume mit je einer Sekunde wären
     eine halbe Minute Zuschauen. */
  var MIN_THINK = 1000;

  function scheduleAI() {
    if (ui.thinking || !aiLevel()) return;
    ui.thinking = true;
    var setup = state.phase !== 'play';
    var started = Date.now();
    $('#phase-banner').innerHTML += ' <span class="thinking">· denkt nach …</span>';

    // Erst zeichnen lassen, dann rechnen
    setTimeout(function () {
      var level = aiLevel();
      if (!level) { ui.thinking = false; return refresh(); }

      if (setup) return finishAiTurn(level, null, null);
      if (state.pending) { G.endPending(state); ui.thinking = false; return refresh(); }

      /* Die Suche rechnet in Häppchen und gibt dem Browser zwischendurch die
         Kontrolle zurück – sonst friert die Seite bei der starken Stufe
         zwei Sekunden lang ein und man kann das Brett nicht einmal schieben. */
      AI.chooseMoveSliced(state, state.current, level, function (desc, err) {
        // Denkzeit anrechnen: gewartet wird nur, was zur Sekunde noch fehlt
        var rest = Math.max(0, MIN_THINK - (Date.now() - started));
        setTimeout(function () { finishAiTurn(level, desc, err); }, rest);
      });
    }, setup ? 45 : 60);
  }

  /* Zug tatsächlich ausführen – getrennt vom Denken, damit die Pause davor passt. */
  function finishAiTurn(level, desc, err) {
    var before = state.current, phase = state.phase;
    try {
      if (err) throw err;
      if (phase !== 'play') AI.step(state, level);
      else if (!desc || !AI.playMove(state, desc)) G.pass(state);
    } catch (e) {
      G.log(state, 'Die KI ist ins Straucheln geraten – sie setzt aus.', state.current);
      if (state.phase === 'play') G.pass(state);
      if (window.console) console.error(e);
    }
    if (state.phase === phase && state.current === before &&
        state.phase === 'play' && !state.pending) {
      G.pass(state);            // Notbremse gegen Endlosschleifen
    }
    ui.thinking = false;
    refresh();
  }

  /* ---------------- Regelwerk-Overlay ---------------- */

  function buildRules() {
    var cards = ['king'].concat(U.TRAIN_ORDER).concat(['boat']).map(function (id) {
      var def = U.DEFS[id];
      var cost = def.cost === null ? 'Startfigur'
        : Array(def.cost + 1).join('\u{1F332} ') + '(' + def.cost + '× Holz)';
      return '<article class="rule-card">' +
        '<header>' + Render.pieceIcon(id, '#3b82f6') +
        '<div class="rule-title"><h3>' + def.name + '</h3>' +
        '<span class="cost">' + cost + '</span></div></header>' +
        '<p>' + esc(def.text) + '</p>' +
        '<ul>' + def.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
        '</article>';
    }).join('');

    // Figuren-Übersicht auf dem Startbildschirm
    var strip = document.getElementById('unit-strip');
    if (strip) {
      strip.innerHTML = ['king'].concat(U.TRAIN_ORDER).concat(['boat']).map(function (id, i) {
        var def = U.DEFS[id];
        return '<figure class="unit-chip">' +
          Render.pieceIcon(id, G.COLORS[i % G.COLORS.length].hex) +
          '<figcaption><strong>' + def.name + '</strong>' +
          '<span>' + (def.cost === null ? 'Startfigur' : def.cost + '× Holz') +
          (def.object ? ' · Objekt' : '') + '</span>' +
          '</figcaption></figure>';
      }).join('');
    }
    $('#rule-cards').innerHTML = cards;

    $('#open-rules').addEventListener('click', function () { $('#rules').classList.remove('hidden'); });
    $('#close-rules').addEventListener('click', function () { $('#rules').classList.add('hidden'); });
    $('#rules').addEventListener('click', function (e) {
      if (e.target.id === 'rules') $('#rules').classList.add('hidden');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#rules').classList.contains('hidden')) $('#rules').classList.add('hidden');
        else deselect();
      }
    });
  }

  // Kleiner Debug-Zugang (Konsole, automatisierte Tests)
  window.Hexodus = {
    get state() { return state; },
    refresh: function () { refresh(); },
    click: handleCellClick
  };

  window.addEventListener('DOMContentLoaded', function () {
    buildMenu();
    buildRules();
    bindPanel();
    bindMobileBar();
    $('#new-game').addEventListener('click', backToMenu);
    /* Beim Drehen des Geräts wechselt die freie Fläche völlig – dann wird das
       Brett neu eingepasst. Kleine Änderungen lassen den gewählten Ausschnitt
       in Ruhe: Wer hineingezoomt hat, soll das nicht durch eine eingeblendete
       Adressleiste verlieren. */
    window.addEventListener('resize', function () {
      if (!state || !view || $('#screen-game').classList.contains('hidden')) return;
      var r = $('#board').getBoundingClientRect();
      var alt = brettGroesse;
      brettGroesse = { w: r.width, h: r.height };
      if (alt && r.width && r.height &&
          (Math.abs(r.width - alt.w) > alt.w * 0.15 || Math.abs(r.height - alt.h) > alt.h * 0.15)) {
        Render.fit(view, state.board);
        refresh();
      } else {
        Render.applyView(view);
      }
    });
  });
})();
