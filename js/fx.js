/**
 * POPCORE — effects layer.
 *
 * Owns everything that is *only* visual: popcorn puffs, particles, floating
 * money, screen shake, screen flashes and the extra rings that fire on big
 * chains. It never affects gameplay, and the simulation never reads from it.
 *
 * All coordinates are in pan units, same as the simulation.
 */
(function (NS) {
  'use strict';

  var rand = NS.rand;
  var clamp = NS.clamp;

  // Hard caps keep the frame budget predictable on phones.
  var MAX_POPCORN = 42;
  var MAX_PARTICLES = 250;
  var MAX_FLOATERS = 22;
  var MAX_RINGS = 30;

  function Fx() {
    this.popcorn = [];
    this.particles = [];
    this.floaters = [];
    this.rings = [];      // decorative rings (chain milestones), not sim shockwaves

    this.shake = 0;       // current shake amplitude, pan units
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = 0;       // white-out overlay strength 0..1
    this.flashHue = 40;
    this.heatGlow = 0;    // ambient pan glow, rises with chain intensity
    this.hitstop = 0;     // seconds of frozen simulation — the "impact" pause
    this.zoom = 0;        // camera punch, added to the render scale
    this.time = 0;
  }

  /* ---------------- spawners ---------------- */

  /** The main "a kernel just popped" burst. */
  Fx.prototype.pop = function (x, y, chain, manual, golden) {
    var intensity = clamp(chain / 40, 0, 1);

    this.addPopcorn(x, y, intensity);
    this.addParticles(x, y, (manual ? 20 : 14) + Math.round(intensity * 10), intensity, golden);
    this.addRing(x, y, 0.34 + intensity * 0.2,
      golden ? 'rgba(255,232,140,0.95)' : 'rgba(255,220,170,0.55)', golden ? 0.02 : 0.01);

    this.shake = Math.min(this.shake + (manual ? 0.016 : 0.011) + intensity * 0.026, 0.16);
    this.zoom = Math.min(this.zoom + 0.004 + intensity * 0.008, 0.05);
    this.heatGlow = Math.min(this.heatGlow + 0.06 + intensity * 0.1, 1);

    if (golden) this.golden(x, y);
  };

  /** Jackpot burst: gold everywhere, a hard freeze frame, a big camera punch. */
  Fx.prototype.golden = function (x, y) {
    this.hitstop = Math.max(this.hitstop, 0.09);
    this.zoom = Math.min(this.zoom + 0.05, 0.1);
    this.shake = Math.min(this.shake + 0.09, 0.2);
    this.flash = Math.min(this.flash + 0.4, 0.8);
    this.flashHue = 48;
    this.heatGlow = 1;

    this.addRing(x, y, 1.6, 'rgba(255,236,150,1)', 0.03);
    this.addRing(x, y, 1.1, 'rgba(255,255,255,0.9)', 0.014);
    this.addParticles(x, y, 60, 1, true);
  };

  /** MEGA POP: the biggest punch in the game. */
  Fx.prototype.mega = function () {
    this.hitstop = Math.max(this.hitstop, 0.14);
    this.zoom = Math.min(this.zoom + 0.09, 0.14);
    this.shake = Math.min(this.shake + 0.2, 0.26);
    this.flash = Math.min(this.flash + 0.6, 0.9);
    this.flashHue = 30;
    this.heatGlow = 1;

    this.addRing(0, 0, 2.0, 'rgba(255,255,255,1)', 0.05);
    this.addRing(0, 0, 1.6, 'rgba(255,170,50,0.9)', 0.08);
    this.addParticles(0, 0, 90, 1, true);
  };

  Fx.prototype.addPopcorn = function (x, y, intensity) {
    if (this.popcorn.length >= MAX_POPCORN) this.popcorn.shift();

    // A puff is a few overlapping blobs — cheap, and reads as "fluffy".
    var blobs = [];
    var count = 4 + (Math.random() * 3 | 0);
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2 + rand(-0.4, 0.4);
      var d = rand(0.1, 0.5);
      blobs.push({
        dx: Math.cos(a) * d,
        dy: Math.sin(a) * d,
        r: rand(0.45, 0.78)
      });
    }

    this.popcorn.push({
      x: x,
      y: y,
      vx: rand(-0.16, 0.16),
      vy: rand(-0.22, -0.02),
      size: NS.CONFIG.KERNEL_RADIUS * rand(0.95, 1.25),
      rot: rand(0, Math.PI * 2),
      vr: rand(-2.4, 2.4),
      life: 0,
      maxLife: rand(1.5, 2.3),
      warm: intensity,
      blobs: blobs
    });
  };

  Fx.prototype.addParticles = function (x, y, count, intensity, golden) {
    for (var i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      var a = Math.random() * Math.PI * 2;
      var speed = rand(0.3, 1.35) * (1 + intensity * 0.9);
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0,
        maxLife: rand(0.4, 0.95),
        size: rand(0.008, 0.024) * (golden ? 1.4 : 1),
        hue: golden ? rand(42, 54) : rand(24, 48),
        light: golden ? rand(70, 92) : rand(55, 80)
      });
    }
  };

  Fx.prototype.addFloater = function (x, y, text, chain) {
    if (this.floaters.length >= MAX_FLOATERS) this.floaters.shift();
    this.floaters.push({
      x: x,
      y: y,
      vy: -0.42,
      life: 0,
      maxLife: 0.95,
      text: text,
      scale: 1 + clamp(chain / 60, 0, 0.9)
    });
  };

  /** Extra flair ring — used for milestones, on top of the sim's shockwave. */
  Fx.prototype.addRing = function (x, y, maxR, color, width) {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x: x, y: y, r: 0, maxR: maxR, color: color, width: width || 0.02 });
  };

  /** Chain milestone reached — escalating punch. */
  Fx.prototype.tier = function (tier, x, y) {
    var t = Math.min(tier, 8);

    this.hitstop = Math.max(this.hitstop, 0.03 + t * 0.012);
    this.zoom = Math.min(this.zoom + 0.02 + t * 0.008, 0.12);
    this.shake = Math.min(this.shake + 0.06 + t * 0.03, 0.24);
    this.flash = Math.min(this.flash + 0.18 + t * 0.06, 0.85);
    this.flashHue = Math.max(12, 46 - t * 5);
    this.heatGlow = 1;

    this.addRing(x, y, 1.15 + t * 0.12, 'rgba(255,225,160,0.95)', 0.018 + t * 0.006);
    this.addParticles(x, y, 24 + t * 12, 1, t >= 4);

    // From tier 3 the whole pan throws a second wave behind the local one.
    if (t >= 3) this.addRing(0, 0, 1.5, 'rgba(255,150,40,0.8)', 0.035);
    if (t >= 5) this.addRing(0, 0, 1.9, 'rgba(255,255,255,0.7)', 0.02);
  };

  /** Ambient sparks so an idle pan never feels dead. */
  Fx.prototype.ember = function () {
    if (this.particles.length >= MAX_PARTICLES) return;
    var a = Math.random() * Math.PI * 2;
    var r = Math.sqrt(Math.random()) * 0.9;
    this.particles.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      vx: rand(-0.04, 0.04),
      vy: rand(-0.14, -0.04),
      life: 0,
      maxLife: rand(0.9, 1.8),
      size: rand(0.004, 0.009),
      hue: rand(20, 40),
      light: rand(45, 65)
    });
  };

  /* ---------------- step ---------------- */

  Fx.prototype.update = function (dt, chain) {
    this.time += dt;

    var i, p;

    // popcorn: drift out, slow down, fade at the end of life
    for (i = this.popcorn.length - 1; i >= 0; i--) {
      p = this.popcorn[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy = p.vy * 0.94 + 0.06 * dt;   // a touch of settle
      p.rot += p.vr * dt;
      p.vr *= 0.97;
      if (p.life >= p.maxLife) this.popcorn.splice(i, 1);
    }

    // particles: ballistic with drag
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.93;
      p.vy = p.vy * 0.93 + 0.35 * dt;
      if (p.life >= p.maxLife) this.particles.splice(i, 1);
    }

    // floating money
    for (i = this.floaters.length - 1; i >= 0; i--) {
      p = this.floaters[i];
      p.life += dt;
      p.y += p.vy * dt;
      p.vy *= 0.96;
      if (p.life >= p.maxLife) this.floaters.splice(i, 1);
    }

    // decorative rings
    for (i = this.rings.length - 1; i >= 0; i--) {
      p = this.rings[i];
      p.r += 2.2 * dt;
      if (p.r >= p.maxR) this.rings.splice(i, 1);
    }

    // screen shake: exponential decay, re-randomised offset each frame
    this.shake *= Math.pow(0.0006, dt);
    if (this.shake < 0.0008) this.shake = 0;
    this.shakeX = rand(-1, 1) * this.shake;
    this.shakeY = rand(-1, 1) * this.shake;

    this.flash *= Math.pow(0.002, dt);
    if (this.flash < 0.004) this.flash = 0;

    this.zoom *= Math.pow(0.0009, dt);
    if (this.zoom < 0.0004) this.zoom = 0;

    // ambient glow tracks how hot things currently are
    var target = clamp(chain / 60, 0, 1);
    this.heatGlow += (target - this.heatGlow) * Math.min(1, dt * 2.2);

    if (Math.random() < dt * (1.5 + this.heatGlow * 8)) this.ember();
  };

  Fx.prototype.clear = function () {
    this.popcorn.length = 0;
    this.particles.length = 0;
    this.floaters.length = 0;
    this.rings.length = 0;
    this.shake = this.flash = this.heatGlow = 0;
    this.hitstop = this.zoom = 0;
  };

  NS.Fx = Fx;
})(window.POPCORE);
