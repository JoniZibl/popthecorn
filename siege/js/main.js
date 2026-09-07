/**
 * LAST KEEP — bootstrap and game loop.
 */
(function (NS) {
  'use strict';

  var C = NS.CONFIG;
  var STEP = 1 / 60;
  var MAX_STEPS = 5;

  var canvas = document.getElementById('field');

  var meta = new NS.Meta();
  var sim = new NS.Sim(meta);
  var fx = new NS.Fx();
  var audio = new NS.Audio();
  var renderer = new NS.Renderer(canvas, sim, fx);
  var ui = new NS.UI(sim, meta, {
    onBuy: buy,
    onOvercharge: overcharge,
    onCallWave: callWave,
    onRestart: restart,
    onMetaBuy: function () { audio.buy(); NS.Save.write(sim, meta); }
  });

  var acc = 0, lastFrame = 0, saveTimer = 0, fps = 60;

  NS.game = {
    sim: sim, meta: meta, fx: fx, audio: audio, renderer: renderer, ui: ui, canvas: canvas,
    fps: function () { return fps; }
  };

  /* ---------------- start ---------------- */

  var saved = NS.Save.read();
  if (saved) {
    if (saved.meta) meta.load(saved.meta);
    if (saved.run) sim.load(saved.run);
  }
  if (sim.over) sim.reset();       // a finished run never resumes; it restarts

  renderer.resize();
  audio.setEnabled(NS.Save.readSound());
  updateMuteLabel();

  /* ---------------- input ---------------- */

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    audio.unlock();
    if (ui.anyPanelOpen()) return;

    var rect = canvas.getBoundingClientRect();
    var p = renderer.toField(e.clientX - rect.left, e.clientY - rect.top);
    sim.tap(p.x, p.y);
  }, { passive: false });

  document.getElementById('mute').addEventListener('click', function () {
    audio.unlock();
    audio.setEnabled(!audio.enabled);
    NS.Save.writeSound(audio.enabled);
    updateMuteLabel();
  });

  window.addEventListener('resize', function () { renderer.resize(); });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { renderer.resize(); }, 150);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) NS.Save.write(sim, meta);
    else lastFrame = 0;
  });
  window.addEventListener('pagehide', function () { NS.Save.write(sim, meta); });

  function updateMuteLabel() {
    document.getElementById('mute').textContent = audio.enabled ? 'sound on' : 'sound off';
  }

  function buzz(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
  }

  /* ---------------- actions ---------------- */

  function buy(id) {
    if (!sim.buy(id)) return;
    audio.buy();
    NS.Save.write(sim, meta);
  }

  function overcharge() {
    if (!sim.fireOvercharge()) return;
    buzz([0, 40, 30, 90]);
  }

  function callWave() {
    if (sim.callEarly()) buzz(20);
  }

  function restart() {
    sim.reset();
    fx.clear();
    NS.Save.write(sim, meta);
  }

  /* ---------------- events ---------------- */

  function drainEvents() {
    var events = sim.events;

    for (var i = 0; i < events.length; i++) {
      var e = events[i];

      switch (e.type) {
        case 'shot':
          audio.shoot(e.tower);
          if (e.tower === 'tesla') {
            fx.bolt(e.x, e.y, e.tx, e.ty, 'rgba(210,170,255,0.95)', 0.005);
          }
          break;

        case 'hit':
          fx.hit(e.x, e.y, e.boss ? '#ff9b9b' : '#ffd9a0', e.killed);
          break;

        case 'kill':
          audio.kill(sim.combo);
          ui.bumpGold(e.boss ? 0.3 : 0.05);
          if (e.boss) {
            fx.bossDown(e.x, e.y);
            ui.banner('BOSS DOWN', true);
            buzz([0, 60, 40, 120]);
          }
          if (e.boss || e.gold >= 12) {
            fx.number(e.x, e.y, '+' + NS.fmt(e.gold), 'rgba(255,207,92,ALPHA)', e.boss);
          }
          break;

        case 'tap':
          fx.tap(e.x, e.y, e.hit);
          audio.tap(e.hit, e.combo);
          if (e.hit && e.combo >= 3 && e.combo % 3 === 0) {
            fx.number(e.x, e.y - 0.03, '×' + sim.comboMult().toFixed(1), 'rgba(255,240,180,ALPHA)');
          }
          break;

        case 'leak':
          fx.leak(e.x, e.y);
          audio.leak();
          buzz([0, 80]);
          break;

        case 'wave':
          fx.flash = Math.min(fx.flash + 0.25, 0.6);
          fx.flashColor = e.boss ? '255,80,100' : '140,190,255';
          ui.banner(e.boss ? 'BOSS WAVE ' + e.n : 'WAVE ' + e.n, e.boss);
          audio.wave(e.boss);
          if (e.boss) buzz([0, 40, 60, 40, 60, 120]);
          break;

        case 'cleared':
          fx.number(0.5, 0.42, '+' + NS.fmt(e.bonus) + ' GOLD', 'rgba(255,207,92,ALPHA)', true);
          ui.bumpGold(0.2);
          NS.Save.write(sim, meta);
          break;

        case 'overcharge':
          fx.overcharge();
          audio.overcharge();
          break;

        case 'over':
          endRun(e.wave);
          break;
      }
    }
    events.length = 0;
  }

  function endRun(wave) {
    var stats = { kills: sim.kills, earned: sim.earned };
    var gain = meta.bank(wave);
    audio.over();
    buzz([0, 120, 60, 200]);
    fx.flash = 0.9;
    fx.flashColor = '255,60,60';
    ui.showGameOver(wave, gain, stats);
    NS.Save.write(sim, meta);
  }

  /* ---------------- loop ---------------- */

  function frame(now) {
    requestAnimationFrame(frame);

    if (!lastFrame) lastFrame = now;
    var dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (dt > 0.25) dt = 0.25;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;

    audio.frame();

    var paused = ui.anyPanelOpen() || sim.over;

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
    fx.update(dt, sim.maxHp ? sim.hp / sim.maxHp : 1);
    ui.update(dt);
    renderer.draw(now);

    saveTimer += dt;
    if (saveTimer >= C.SAVE_INTERVAL) {
      saveTimer = 0;
      if (!sim.over) NS.Save.write(sim, meta);
    }
  }

  requestAnimationFrame(frame);
})(window.SIEGE);
