/**
 * LAST KEEP — effects layer. Visual only; the simulation never reads it.
 */
(function (NS) {
  'use strict';

  var rand = NS.rand;
  var clamp = NS.clamp;

  var MAX_PARTICLES = 260;
  var MAX_NUMBERS = 26;
  var MAX_BOLTS = 24;
  var MAX_RINGS = 20;

  function Fx() {
    this.particles = [];
    this.numbers = [];
    this.bolts = [];      // tesla arcs and tracer lines
    this.rings = [];

    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = 0;
    this.flashColor = '255,80,80';
    this.hitstop = 0;
    this.danger = 0;      // red vignette, rises as the castle is hurt
    this.time = 0;
  }

  Fx.prototype.burst = function (x, y, color, count, power) {
    for (var i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      var a = Math.random() * Math.PI * 2;
      var speed = rand(0.06, 0.3) * (power || 1);
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0, maxLife: rand(0.25, 0.6),
        size: rand(0.003, 0.008) * (power || 1),
        color: color
      });
    }
  };

  Fx.prototype.number = function (x, y, text, color, big) {
    if (this.numbers.length >= MAX_NUMBERS) this.numbers.shift();
    this.numbers.push({
      x: x, y: y, text: text, color: color,
      life: 0, maxLife: big ? 1.1 : 0.75,
      scale: big ? 1.5 : 1,
      vy: -0.12
    });
  };

  Fx.prototype.bolt = function (x, y, tx, ty, color, width) {
    if (this.bolts.length >= MAX_BOLTS) this.bolts.shift();
    this.bolts.push({
      x: x, y: y, tx: tx, ty: ty, color: color,
      width: width || 0.004, life: 0, maxLife: 0.18
    });
  };

  Fx.prototype.ring = function (x, y, maxR, color, width) {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x: x, y: y, r: 0, maxR: maxR, color: color, width: width || 0.004 });
  };

  /* ---- named moments ---- */

  Fx.prototype.hit = function (x, y, color, killed) {
    this.burst(x, y, color, killed ? 12 : 4, killed ? 1.3 : 0.7);
    if (killed) this.ring(x, y, 0.05, color, 0.004);
  };

  Fx.prototype.tap = function (x, y, hit) {
    this.ring(x, y, hit ? 0.07 : 0.045, hit ? 'rgba(255,240,200,0.9)' : 'rgba(255,255,255,0.35)', 0.005);
    if (hit) this.shake = Math.min(this.shake + 0.004, 0.03);
  };

  Fx.prototype.leak = function (x, y) {
    this.shake = Math.min(this.shake + 0.05, 0.09);
    this.flash = Math.min(this.flash + 0.4, 0.8);
    this.flashColor = '255,60,60';
    this.burst(x, y, '#ff5a5a', 18, 1.5);
    this.ring(x, y, 0.18, 'rgba(255,80,80,0.9)', 0.008);
  };

  Fx.prototype.bossDown = function (x, y) {
    this.hitstop = Math.max(this.hitstop, 0.16);
    this.shake = Math.min(this.shake + 0.09, 0.13);
    this.flash = Math.min(this.flash + 0.7, 0.9);
    this.flashColor = '255,200,120';
    this.burst(x, y, '#ffd27f', 70, 2.2);
    this.ring(x, y, 0.5, 'rgba(255,220,150,1)', 0.012);
    this.ring(x, y, 0.8, 'rgba(255,120,80,0.8)', 0.02);
  };

  Fx.prototype.overcharge = function () {
    this.hitstop = Math.max(this.hitstop, 0.12);
    this.shake = Math.min(this.shake + 0.08, 0.12);
    this.flash = Math.min(this.flash + 0.8, 0.95);
    this.flashColor = '190,230,255';
    this.ring(0.5, 0.55, 1.4, 'rgba(210,240,255,1)', 0.02);
  };

  /* ---- step ---- */

  Fx.prototype.update = function (dt, hpFraction) {
    this.time += dt;
    var i, p;

    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy = p.vy * 0.92 + 0.06 * dt;
      if (p.life >= p.maxLife) this.particles.splice(i, 1);
    }

    for (i = this.numbers.length - 1; i >= 0; i--) {
      p = this.numbers[i];
      p.life += dt;
      p.y += p.vy * dt;
      p.vy *= 0.95;
      if (p.life >= p.maxLife) this.numbers.splice(i, 1);
    }

    for (i = this.bolts.length - 1; i >= 0; i--) {
      p = this.bolts[i];
      p.life += dt;
      if (p.life >= p.maxLife) this.bolts.splice(i, 1);
    }

    for (i = this.rings.length - 1; i >= 0; i--) {
      p = this.rings[i];
      p.r += (p.maxR / 0.35) * dt;
      if (p.r >= p.maxR) this.rings.splice(i, 1);
    }

    this.shake *= Math.pow(0.0008, dt);
    if (this.shake < 0.0006) this.shake = 0;
    this.shakeX = rand(-1, 1) * this.shake;
    this.shakeY = rand(-1, 1) * this.shake;

    this.flash *= Math.pow(0.004, dt);
    if (this.flash < 0.004) this.flash = 0;

    // The screen edges redden as the keep gets closer to falling.
    var target = clamp(1 - hpFraction, 0, 1);
    this.danger += (target - this.danger) * Math.min(1, dt * 2);
  };

  Fx.prototype.clear = function () {
    this.particles.length = 0;
    this.numbers.length = 0;
    this.bolts.length = 0;
    this.rings.length = 0;
    this.shake = this.flash = this.hitstop = 0;
  };

  NS.Fx = Fx;
})(window.SIEGE);
