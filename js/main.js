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

  var meta = new NS.Meta();
  var sim = new NS.Sim(meta);
  var fx = new NS.Fx();
  var audio = new NS.Audio();
  var renderer = new NS.Renderer(canvas, sim, fx);
  var ui = new NS.UI(sim, meta, {
    onBuy: buy,
    onPickCard: pickCard,
    onCashOut: cashOut
  });

  var acc = 0;
  var lastFrame = 0;
  var saveTimer = 0;
  var hasTapped = false;
  var fps = 60;

  // Handy for tinkering from the console (and for automated smoke tests).
  NS.game = {
    sim: sim, fx: fx, meta: meta, audio: audio, renderer: renderer, canvas: canvas,
    ui: ui, fps: function () { return fps; }
  };

  /* ---------------- start-up ---------------- */

  var loaded = NS.Save.read();
  if (loaded) {
    if (loaded.meta) meta.load(loaded.meta);
    if (loaded.run) sim.load(loaded.run);
  }
  sim.recomputeMods();

  // Open with a small handful, not a single kernel: there is never a moment
  // where the player taps and finds nothing to hit.
  for (var i = 0; i < 3; i++) sim.spawnKernel();

  offerOfflineEarnings(loaded);

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

  document.getElementById('butter').addEventListener('click', function () {
    ui.openShop();
  });

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
    meta.load(null);
    meta.butter = 0;
    meta.lifetimeButter = 0;
    meta.batches = 0;
    meta.bestBatch = 0;
    for (var m = 0; m < NS.META.UPGRADES.length; m++) meta.levels[NS.META.UPGRADES[m].id] = 0;
    fx.clear();
    ui.hideChain();
    NS.Save.clear();
  });

  window.addEventListener('resize', function () { renderer.resize(); });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { renderer.resize(); }, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) NS.Save.write(sim, meta);
    else lastFrame = 0;   // avoid a huge catch-up step on return
  });
  window.addEventListener('pagehide', function () { NS.Save.write(sim, meta); });

  /** Haptic tick or pattern, where the platform supports it (Android Chrome). */
  function buzz(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
  }

  function updateMuteLabel() {
    document.getElementById('mute').textContent = audio.enabled ? 'SOUND ON' : 'SOUND OFF';
  }

  /* ---------------- batches, cards, away time ---------------- */

  function pickCard(id) {
    sim.draftsTaken++;
    sim.addCard(id);
    audio.golden();
    fx.golden(0, 0);
    ui.callout('MUTATED');
  }

  /** Offer a draft the moment one is due, unless a panel is already up. */
  function checkDraft() {
    if (!sim.draftDue() || ui.anyPanelOpen()) return;
    var cards = NS.drawCards(meta.cardsPerDraft(), meta.lifetimeButter, meta.luck(), sim.cards);
    if (!cards.length) { sim.draftsTaken++; return; }
    audio.tier(3);
    buzz([0, 30, 30, 30]);
    ui.openDraft(cards);
  }

  function cashOut() {
    var gain = meta.cashOut(sim.earned);
    if (!gain) return;

    sim.startBatch();
    fx.clear();
    fx.mega();
    ui.hideChain();
    ui.callout('+' + gain + ' BUTTER');
    audio.mega();
    buzz([0, 60, 40, 60, 40, 140]);
    NS.Save.write(sim, meta);

    // The shop is the whole point of cashing out, so open it straight away.
    ui.openShop();
  }

  /**
   * Pay out a share of the rate the player left at. Capped, and only when they
   * were away long enough for it to feel like a return rather than a refresh.
   */
  function offerOfflineEarnings(saved) {
    if (!saved || !saved.at || !saved.rate) return;

    var seconds = (Date.now() - saved.at) / 1000;
    if (seconds < C.OFFLINE_MIN_SECONDS) return;

    var capped = Math.min(seconds, C.OFFLINE_MAX_HOURS * 3600);
    var amount = saved.rate * capped * C.OFFLINE_RATE;
    if (amount < 1) return;

    ui.openWelcome(seconds, amount, function () {
      sim.money += amount;
      sim.earned += amount;
      ui.bumpMoney(0.35);
      fx.golden(0, 0);
      audio.golden();
    });
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

    // A panel (draft, shop, cash-out) pauses the pan: the choice is the moment,
    // and nothing should pop away behind it.
    var paused = ui.anyPanelOpen();

    // Hit-stop: the simulation freezes for a beat on a big impact while the
    // effects keep animating. It is what makes a hit feel like it landed.
    if (paused) {
      acc = 0;
    } else if (fx.hitstop > 0) {
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
    if (!paused) checkDraft();
    fx.update(dt, sim.chain);

    if (sim.chain >= 2) ui.showChain(sim.chain);
    else if (sim.chain === 0) ui.hideChain();

    ui.update(dt);
    renderer.draw(now);

    saveTimer += dt;
    if (saveTimer >= C.SAVE_INTERVAL) {
      saveTimer = 0;
      NS.Save.write(sim, meta);
    }
  }

  requestAnimationFrame(frame);
})(window.POPCORE);
