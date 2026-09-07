/**
 * POPCORE — bootstrap and game loop.
 *
 * Wires the simulation to the presentation layers: a fixed-timestep update,
 * one drain of the simulation's event queue per frame, then a render.
 */
(function (NS) {
  'use strict';

  var C = NS.CONFIG;
  var STEP = 1 / 60;          // fixed simulation step
  var MAX_STEPS = 5;          // catch-up limit after a stall / tab switch

  var canvas = document.getElementById('game');

  var sim = new NS.Sim();
  var fx = new NS.Fx();
  var audio = new NS.Audio();
  var renderer = new NS.Renderer(canvas, sim, fx);
  var ui = new NS.UI(sim, buy);

  var acc = 0;
  var lastFrame = 0;
  var saveTimer = 0;
  var hasTapped = false;
  var fps = 60;

  // Handy for tinkering from the console (and for automated smoke tests).
  NS.game = {
    sim: sim, fx: fx, audio: audio, renderer: renderer, canvas: canvas,
    fps: function () { return fps; }
  };

  /* ---------------- start-up ---------------- */

  var loaded = NS.Save.read();
  if (loaded) sim.load(loaded);

  // Open with a small handful, not a single kernel: there is never a moment
  // where the player taps and finds nothing to hit.
  for (var i = 0; i < 3; i++) sim.spawnKernel();

  // The upgrade buttons change the stage height, so re-measure once the DOM is final.
  renderer.resize();

  audio.setEnabled(NS.Save.readSound());
  updateMuteLabel();

  /* ---------------- input ---------------- */

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    audio.unlock();

    var rect = canvas.getBoundingClientRect();
    var p = renderer.toPan(e.clientX - rect.left, e.clientY - rect.top);
    var hit = sim.tap(p.x, p.y);

    if (hit) {
      if (!hasTapped) { hasTapped = true; ui.hideHint(); }
      buzz(8);
    } else {
      // Small acknowledgement so a miss still feels responsive.
      fx.addRing(p.x, p.y, 0.14, 'rgba(255,255,255,0.35)', 0.008);
    }
  }, { passive: false });

  document.getElementById('mega').addEventListener('click', function () {
    audio.unlock();
    sim.fireMega();
  });

  document.getElementById('mute').addEventListener('click', function () {
    audio.unlock();
    audio.setEnabled(!audio.enabled);
    NS.Save.writeSound(audio.enabled);
    updateMuteLabel();
  });

  // Two-step reset: the first tap arms the button, the second wipes progress.
  // A native confirm() is blocked in some embedded contexts, and this reads
  // better on a phone anyway.
  var resetBtn = document.getElementById('reset');
  var resetArmed = 0;

  resetBtn.addEventListener('click', function () {
    if (Date.now() > resetArmed) {
      resetArmed = Date.now() + 3000;
      resetBtn.textContent = 'tap again to erase';
      resetBtn.classList.add('armed');
      setTimeout(function () {
        if (Date.now() > resetArmed) {
          resetBtn.textContent = 'reset save';
          resetBtn.classList.remove('armed');
        }
      }, 3100);
      return;
    }
    resetArmed = 0;
    resetBtn.textContent = 'reset save';
    resetBtn.classList.remove('armed');
    sim.reset();
    fx.clear();
    ui.hideChain();
    NS.Save.clear();
  });

  window.addEventListener('resize', function () { renderer.resize(); });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { renderer.resize(); }, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) NS.Save.write(sim);
    else lastFrame = 0;   // avoid a huge catch-up step on return
  });
  window.addEventListener('pagehide', function () { NS.Save.write(sim); });

  /** Haptic tick or pattern, where the platform supports it (Android Chrome). */
  function buzz(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
  }

  function updateMuteLabel() {
    document.getElementById('mute').textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF';
  }

  /* ---------------- purchases ---------------- */

  function buy(id) {
    if (!sim.buy(id)) return;
    audio.buy();
    fx.addRing(0, 0, 1.1, 'rgba(255,200,110,0.5)', 0.012);
  }

  /* ---------------- events ---------------- */

  function drainEvents() {
    var events = sim.events;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];

      if (e.type === 'pop') {
        fx.pop(e.x, e.y, e.chain, e.manual, e.golden);
        audio.pop(e.chain, e.manual);
        ui.bumpMoney(e.golden ? 0.3 : e.manual ? 0.1 : 0.05);

        if (e.golden) {
          audio.golden();
          ui.callout('GOLDEN!');
          fx.addFloater(e.x, e.y, '+$' + NS.formatMoney(e.value, true), 60);
          buzz([0, 30, 40, 30]);
        } else if (e.manual || e.chain <= 3 || e.chain % (e.chain > 40 ? 15 : 3) === 0) {
          // Floating numbers are rate-limited during long chains so the pan stays readable.
          fx.addFloater(e.x, e.y, '+$' + NS.formatMoney(e.value, true), e.chain);
        }
      } else if (e.type === 'tier') {
        fx.tier(e.tier, e.x || 0, e.y || 0);
        audio.tier(e.tier);
        ui.callout(e.word + ' ×' + e.chain);
        buzz(18 + e.tier * 14);
      } else if (e.type === 'chainEnd' && e.bonus > 0) {
        ui.callout(e.maxed ? 'MAX CHAIN!' : 'CHAIN ×' + e.count);
        ui.bumpMoney(e.maxed ? 0.4 : 0.22);
        fx.addFloater(0, -0.1, '+$' + NS.formatMoney(e.bonus, true), 80);
        fx.tier(e.maxed ? 6 : 2, 0, 0);
        audio.tier(e.maxed ? 5 : 2);
        buzz(e.maxed ? [0, 60, 40, 60, 40, 120] : 24);
      } else if (e.type === 'mega') {
        fx.mega();
        audio.mega();
        ui.callout('MEGA POP');
        ui.flashMega();
        buzz([0, 50, 30, 90]);
      }
    }
    events.length = 0;
  }

  /* ---------------- loop ---------------- */

  function frame(now) {
    requestAnimationFrame(frame);

    if (!lastFrame) lastFrame = now;
    var dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (dt > 0.25) dt = 0.25;      // never simulate more than a quarter second at once
    if (dt > 0) fps += (1 / dt - fps) * 0.05;

    audio.frame();

    // Hit-stop: the simulation freezes for a beat on a big impact while the
    // effects keep animating. It is what makes a hit feel like it landed.
    if (fx.hitstop > 0) {
      fx.hitstop -= dt;
      acc = 0;
    } else {
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < MAX_STEPS) {
        sim.update(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS) acc = 0;
    }

    drainEvents();
    fx.update(dt, sim.chain);

    if (sim.chain >= 2) ui.showChain(sim.chain);
    else if (sim.chain === 0) ui.hideChain();

    ui.update(dt);
    renderer.draw(now);

    saveTimer += dt;
    if (saveTimer >= C.SAVE_INTERVAL) {
      saveTimer = 0;
      NS.Save.write(sim);
    }
  }

  requestAnimationFrame(frame);
})(window.POPCORE);
