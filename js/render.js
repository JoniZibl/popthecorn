/**
 * POPCORE — canvas renderer.
 *
 * Reads simulation state (kernels, shockwaves) and effect state (popcorn,
 * particles, floaters) and draws them. It owns no game state of its own beyond
 * the pan-units → pixels transform.
 */
(function (NS) {
  'use strict';

  var clamp = NS.clamp;
  var lerp = NS.lerp;

  var SPRITE = 128;

  function spriteCanvas() {
    var c = document.createElement('canvas');
    c.width = c.height = SPRITE;
    return c;
  }

  /** One fluffy white popcorn blob, lit from the upper left. */
  function makeBlobSprite() {
    var c = spriteCanvas();
    var g = c.getContext('2d');
    var r = SPRITE / 2;
    var grad = g.createRadialGradient(r * 0.7, r * 0.65, r * 0.1, r, r, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.68, '#fff6e4');
    grad.addColorStop(0.94, '#efdcba');
    grad.addColorStop(1, 'rgba(239,220,186,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(r, r, r, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  /** Soft warm glow, stamped for kernel heat and fresh popcorn. */
  function makeGlowSprite() {
    var c = spriteCanvas();
    var g = c.getContext('2d');
    var r = SPRITE / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,214,140,1)');
    grad.addColorStop(0.35, 'rgba(255,164,54,0.45)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    return c;
  }

  /** Stamp a sprite centred on (x, y) with the given radius. */
  function stamp(ctx, sprite, x, y, radius, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  function Renderer(canvas, sim, fx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.fx = fx;

    this.w = 0; this.h = 0;
    this.cx = 0; this.cy = 0;
    this.scale = 100;      // pixels per pan unit
    this.dpr = 1;

    // Sprites are rendered once and stamped with drawImage. Building a radial
    // gradient per blob per frame was the single biggest cost during big chains.
    this.blobSprite = makeBlobSprite();
    this.glowSprite = makeGlowSprite();

    this.resize();

    // The stage changes size whenever the layout settles, the phone rotates or
    // a mobile browser's URL bar slides away — keep the transform in step.
    if (window.ResizeObserver) {
      var self = this;
      this._observer = new ResizeObserver(function () { self.resize(); });
      this._observer.observe(canvas);
    }
  }

  Renderer.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.scale = Math.min(this.w, this.h) * 0.46;
    this.effScale = this.effScale || this.scale;
  };

  /** Screen (CSS px, canvas-relative) → pan units, using the scale last drawn
   *  so a tap lands where the player sees the kernel mid-zoom-punch. */
  Renderer.prototype.toPan = function (px, py) {
    return { x: (px - this.cx) / this.effScale, y: (py - this.cy) / this.effScale };
  };

  Renderer.prototype.draw = function (now) {
    var ctx = this.ctx, fx = this.fx, sim = this.sim;
    var s = this.scale * (1 + fx.zoom);
    this.effScale = s;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.translate(this.cx + fx.shakeX * s, this.cy + fx.shakeY * s);

    this.drawPan(ctx, s, now);

    // Everything inside the pan is clipped to it, so nothing spills onto the HUD.
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.0, 0, Math.PI * 2);
    ctx.clip();

    this.drawShockwaves(ctx, s);
    this.drawRings(ctx, s);
    this.drawKernels(ctx, s, now);
    this.drawPopcorn(ctx, s);
    this.drawParticles(ctx, s);
    ctx.restore();

    this.drawFloaters(ctx, s);
    ctx.restore();

    this.drawFlash(ctx);
  };

  /* ---------------- pan ---------------- */

  Renderer.prototype.drawPan = function (ctx, s, now) {
    var glow = this.fx.heatGlow;

    // outer heat halo
    if (glow > 0.01) {
      var halo = ctx.createRadialGradient(0, 0, s * 0.85, 0, 0, s * 1.5);
      halo.addColorStop(0, 'rgba(255,120,20,' + (0.22 * glow).toFixed(3) + ')');
      halo.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // pan body
    var body = ctx.createRadialGradient(0, -s * 0.25, s * 0.1, 0, 0, s);
    body.addColorStop(0, '#191419');
    body.addColorStop(0.62, '#100c10');
    body.addColorStop(1, '#070609');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2);
    ctx.fill();

    // warm oil pooling at the bottom, breathing slowly
    var pulse = 0.5 + 0.5 * Math.sin(now * 0.0011);
    var heatAlpha = 0.05 + glow * 0.22 + pulse * 0.02;
    var pool = ctx.createRadialGradient(0, s * 0.35, s * 0.05, 0, s * 0.3, s * 0.95);
    pool.addColorStop(0, 'rgba(255,110,20,' + heatAlpha.toFixed(3) + ')');
    pool.addColorStop(1, 'rgba(255,110,20,0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2);
    ctx.fill();

    // rim
    ctx.lineWidth = Math.max(1.5, s * 0.018);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.995, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = Math.max(1, s * 0.006);
    ctx.strokeStyle = 'rgba(255,170,60,' + (0.1 + glow * 0.5).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.975, 0, Math.PI * 2);
    ctx.stroke();
  };

  /* ---------------- shockwaves ---------------- */

  // Only the newest rings are drawn; during a huge chain the older ones are
  // invisible under everything else anyway.
  var MAX_DRAWN_WAVES = 26;

  Renderer.prototype.drawShockwaves = function (ctx, s) {
    var waves = this.sim.shockwaves;
    var start = Math.max(0, waves.length - MAX_DRAWN_WAVES);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Three concentric strokes fake a glowing band far more cheaply than a
    // per-ring radial gradient.
    for (var i = start; i < waves.length; i++) {
      var w = waves[i];
      var fade = 1 - clamp(w.r / w.maxR, 0, 1);
      var hot = clamp(w.chain / 50, 0, 1);
      var x = w.x * s, y = w.y * s;
      var r = Math.max(w.r * s, 1);

      ctx.strokeStyle = 'rgba(255,' + Math.round(150 + hot * 60) + ',50,' + (0.16 * fade).toFixed(3) + ')';
      ctx.lineWidth = Math.max(2, s * (0.05 + hot * 0.03) * (0.4 + fade));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,' + Math.round(190 + hot * 50) + ',' + Math.round(110 + hot * 90) + ',' + (0.26 * fade).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.5, s * 0.018 * (0.4 + fade));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,244,220,' + (0.45 * fade).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, s * 0.005);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  Renderer.prototype.drawRings = function (ctx, s) {
    var rings = this.fx.rings;
    if (!rings.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i];
      var fade = 1 - clamp(r.r / r.maxR, 0, 1);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = fade * fade;
      ctx.lineWidth = Math.max(1, r.width * s * (0.4 + fade));
      ctx.beginPath();
      ctx.arc(r.x * s, r.y * s, Math.max(r.r * s, 1), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ---------------- kernels ---------------- */

  Renderer.prototype.drawKernels = function (ctx, s, now) {
    var kernels = this.sim.kernels;
    var base = NS.CONFIG.KERNEL_RADIUS * s;
    var t = now * 0.001;

    for (var i = 0; i < kernels.length; i++) {
      var k = kernels[i];
      var h = clamp(k.heat, 0, 1);

      // Hotter kernels rattle harder — the tell that a pop is imminent.
      var shakeAmp = Math.pow(h, 3.2) * base * 0.42;
      var jx = Math.sin(t * 46 + k.seed) * shakeAmp;
      var jy = Math.cos(t * 53 + k.seed * 1.7) * shakeAmp;

      // spawn pop-in
      var grow = clamp(k.age / 0.28, 0, 1);
      var appear = 1 + 0.35 * Math.sin(grow * Math.PI) - (1 - grow) * 0.75;

      // squash/stretch breathing, faster and deeper as heat rises
      var breathe = Math.sin(t * (5 + h * 26) + k.seed);
      var sx = (1 + breathe * 0.09 * h) * appear;
      var sy = (1 - breathe * 0.09 * h) * appear;

      var x = k.x * s + jx;
      var y = k.y * s + jy;

      // glow — golden kernels always shine, and pulse so the eye finds them
      if (h > 0.12 || k.golden) {
        var pulse = k.golden ? 0.75 + 0.25 * Math.sin(t * 7 + k.seed) : 1;
        var alpha = k.golden ? (0.5 + 0.4 * h) * pulse : 0.55 * h;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        stamp(ctx, this.glowSprite, x, y, base * (1.8 + h * 3.4) * (k.golden ? 1.5 : 1), alpha);
        ctx.restore();
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(k.angle + breathe * 0.12 * h);
      ctx.scale(sx, sy);

      // body: warm yellow → white-hot (golden kernels get their own palette)
      var body = ctx.createLinearGradient(0, -base, 0, base);
      if (k.golden) {
        body.addColorStop(0, '#fffce8');
        body.addColorStop(0.5, 'rgb(255,' + Math.round(lerp(226, 246, h)) + ',120)');
        body.addColorStop(1, 'rgb(255,' + Math.round(lerp(178, 210, h)) + ',30)');
      } else {
        body.addColorStop(0, 'rgb(255,' + Math.round(lerp(214, 250, h)) + ',' + Math.round(lerp(120, 220, h)) + ')');
        body.addColorStop(1, 'rgb(' + Math.round(lerp(228, 255, h)) + ',' + Math.round(lerp(140, 190, h)) + ',' + Math.round(lerp(38, 90, h)) + ')');
      }
      ctx.fillStyle = body;

      // Teardrop silhouette: rounded base, pointed tip — reads as a corn kernel
      // rather than an egg, and gives the rotation something to show.
      ctx.beginPath();
      ctx.moveTo(0, -base * 1.16);
      ctx.bezierCurveTo(base * 0.86, -base * 0.52, base * 0.84, base * 0.56, 0, base * 0.98);
      ctx.bezierCurveTo(-base * 0.84, base * 0.56, -base * 0.86, -base * 0.52, 0, -base * 1.16);
      ctx.closePath();
      ctx.fill();

      // highlight
      ctx.fillStyle = 'rgba(255,255,255,' + (0.32 + h * 0.4).toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(-base * 0.22, -base * 0.34, base * 0.24, base * 0.32, -0.5, 0, Math.PI * 2);
      ctx.fill();

      // turning sparkle crown, so a golden kernel is unmistakable
      if (k.golden) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,255,235,0.95)';
        for (var sp = 0; sp < 4; sp++) {
          var sa = t * 2.2 + k.seed + sp * Math.PI / 2;
          var sr = base * 1.5;
          var sz = base * (0.13 + 0.05 * Math.sin(t * 6 + sp));
          ctx.beginPath();
          ctx.arc(Math.cos(sa) * sr, Math.sin(sa) * sr, sz, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  };

  /* ---------------- popcorn ---------------- */

  Renderer.prototype.drawPopcorn = function (ctx, s) {
    var list = this.fx.popcorn;

    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var life = p.life;

      // Squash/stretch pop-in: overshoot, then settle.
      var scale;
      if (life < 0.09) scale = lerp(0.25, 1.42, life / 0.09);
      else if (life < 0.26) scale = lerp(1.42, 1.0, (life - 0.09) / 0.17);
      else scale = 1;

      var stretch = life < 0.09 ? lerp(1.5, 1.0, life / 0.09) : 1;

      var remain = p.maxLife - life;
      var alpha = remain < 0.7 ? clamp(remain / 0.7, 0, 1) : 1;
      if (life < 0.05) alpha *= life / 0.05;

      var size = p.size * s * scale;
      var x = p.x * s, y = p.y * s;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.scale(1 / stretch, stretch);

      // soft warm halo just after popping
      if (life < 0.35) {
        var f = 1 - life / 0.35;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        stamp(ctx, this.glowSprite, 0, 0, size * 2.4, 0.6 * f * alpha);
        ctx.restore();
      }

      // fluffy blobs
      for (var b = 0; b < p.blobs.length; b++) {
        var blob = p.blobs[b];
        stamp(ctx, this.blobSprite, blob.dx * size, blob.dy * size, blob.r * size, alpha);
      }

      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  /* ---------------- particles ---------------- */

  Renderer.prototype.drawParticles = function (ctx, s) {
    var list = this.fx.particles;
    if (!list.length) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var f = 1 - p.life / p.maxLife;
      ctx.fillStyle = 'hsla(' + p.hue.toFixed(0) + ', 100%, ' + p.light.toFixed(0) + '%, ' + (f * 0.9).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x * s, p.y * s, Math.max(0.6, p.size * s * (0.4 + f * 0.8)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  /* ---------------- floating money ---------------- */

  Renderer.prototype.drawFloaters = function (ctx, s) {
    var list = this.fx.floaters;
    if (!list.length) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var t = f.life / f.maxLife;
      var alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      var a = clamp(alpha, 0, 1);
      var px = Math.max(10, s * 0.058 * f.scale);
      ctx.font = '800 ' + px.toFixed(1) + 'px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
      ctx.lineWidth = Math.max(2, px * 0.18);
      ctx.strokeStyle = 'rgba(20,10,0,' + (a * 0.75).toFixed(3) + ')';
      ctx.strokeText(f.text, f.x * s, f.y * s);
      ctx.fillStyle = 'rgba(255,246,214,' + a.toFixed(3) + ')';
      ctx.fillText(f.text, f.x * s, f.y * s);
    }
    ctx.restore();
  };

  /* ---------------- overlays ---------------- */

  Renderer.prototype.drawFlash = function (ctx) {
    var f = this.fx.flash;
    if (f <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'hsla(' + this.fx.flashHue.toFixed(0) + ', 100%, 70%, ' + (f * 0.5).toFixed(3) + ')';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  };

  NS.Renderer = Renderer;
})(window.POPCORE);
