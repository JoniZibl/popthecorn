/**
 * LAST KEEP — canvas renderer, top-down.
 *
 * Maps the simulation's 0..1 field onto the stage and draws it: the approach,
 * the enemies walking down it, the towers, and the wall at the bottom.
 */
(function (NS) {
  'use strict';

  var C = NS.CONFIG;
  var clamp = NS.clamp;

  var SPRITE = 128;

  function glowSprite(rgb) {
    var c = document.createElement('canvas');
    c.width = c.height = SPRITE;
    var g = c.getContext('2d');
    var r = SPRITE / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(' + rgb + ',0.9)');
    grad.addColorStop(0.4, 'rgba(' + rgb + ',0.3)');
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    return c;
  }

  function Renderer(canvas, sim, fx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.fx = fx;

    this.glow = glowSprite('255,220,160');
    this.glowRed = glowSprite('255,90,90');

    this.resize();
    if (window.ResizeObserver) {
      var self = this;
      this._ro = new ResizeObserver(function () { self.resize(); });
      this._ro.observe(canvas);
    }
  }

  Renderer.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);

    // The field keeps its aspect: as wide as the stage, as tall as it needs.
    this.fw = this.w;
    this.fh = this.h;
    this.ox = 0;
    this.oy = 0;
  };

  Renderer.prototype.px = function (x) { return this.ox + x * this.fw; };
  Renderer.prototype.py = function (y) { return this.oy + y * this.fh; };
  /** Sizes are expressed in field-width units so shapes stay proportional. */
  Renderer.prototype.ps = function (s) { return s * this.fw; };

  Renderer.prototype.toField = function (px, py) {
    return { x: (px - this.ox) / this.fw, y: (py - this.oy) / this.fh };
  };

  Renderer.prototype.draw = function (now) {
    var ctx = this.ctx, fx = this.fx, sim = this.sim;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.translate(fx.shakeX * this.fw, fx.shakeY * this.fw);

    this.drawGround(ctx, now);
    this.drawCastle(ctx);
    this.drawTowers(ctx, now);
    this.drawProjectiles(ctx);
    this.drawEnemies(ctx, now);
    this.drawBolts(ctx);
    this.drawRings(ctx);
    this.drawParticles(ctx);
    this.drawNumbers(ctx);

    ctx.restore();

    this.drawVignette(ctx);
    this.drawFlash(ctx);
  };

  /* ---------------- ground ---------------- */

  Renderer.prototype.drawGround = function (ctx, now) {
    var g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#0b0f1a');
    g.addColorStop(0.55, '#0d1016');
    g.addColorStop(1, '#141017');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    // Slow scrolling lanes give the march a direction even when the field is empty.
    var scroll = (now * 0.00004) % 0.1;
    ctx.strokeStyle = 'rgba(255,255,255,0.028)';
    ctx.lineWidth = 1;
    for (var y = -0.1 + scroll; y < 1; y += 0.1) {
      ctx.beginPath();
      ctx.moveTo(0, this.py(y));
      ctx.lineTo(this.w, this.py(y));
      ctx.stroke();
    }
    for (var x = 0.1; x < 1; x += 0.2) {
      ctx.beginPath();
      ctx.moveTo(this.px(x), 0);
      ctx.lineTo(this.px(x), this.py(C.CASTLE_Y));
      ctx.stroke();
    }
  };

  /* ---------------- castle ---------------- */

  Renderer.prototype.drawCastle = function (ctx) {
    var sim = this.sim;
    var y = this.py(C.CASTLE_Y);
    var frac = clamp(sim.hp / sim.maxHp, 0, 1);

    // danger glow rising off the wall
    if (this.fx.danger > 0.02) {
      var glow = ctx.createLinearGradient(0, y - this.ps(0.25), 0, y);
      glow.addColorStop(0, 'rgba(255,60,60,0)');
      glow.addColorStop(1, 'rgba(255,60,60,' + (0.22 * this.fx.danger).toFixed(3) + ')');
      ctx.fillStyle = glow;
      ctx.fillRect(0, y - this.ps(0.25), this.w, this.ps(0.25));
    }

    ctx.fillStyle = '#1b1a22';
    ctx.fillRect(0, y, this.w, this.h - y);

    // battlements
    var bw = this.w / 14;
    ctx.fillStyle = '#252430';
    for (var i = 0; i < 14; i += 2) {
      ctx.fillRect(i * bw, y - this.ps(0.018), bw, this.ps(0.018));
    }

    // wall line, tinted by how much health is left
    var hue = 120 * frac;
    ctx.strokeStyle = 'hsla(' + hue.toFixed(0) + ', 70%, 55%, 0.85)';
    ctx.lineWidth = Math.max(2, this.ps(0.006));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(this.w, y);
    ctx.stroke();
  };

  /* ---------------- towers ---------------- */

  Renderer.prototype.drawTowers = function (ctx, now) {
    var sim = this.sim;

    for (var i = 0; i < sim.towers.length; i++) {
      var t = sim.towers[i];
      var def = t.def;
      var level = sim.level(def.id);
      var x = this.px(def.x), y = this.py(def.y);
      var r = this.ps(0.032 + Math.min(level, 20) * 0.0008);

      // Range, faint. The simulation measures distance in field units, where a
      // tall stage compresses y — so the honest shape on screen is an ellipse,
      // not a circle, or the ring would understate the tower's vertical reach.
      var range = def.range(level);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, range * this.fw, range * this.fh, 0, 0, Math.PI * 2);
      ctx.stroke();

      if (t.flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t.flash * 0.55;
        ctx.drawImage(this.glow, x - r * 3, y - r * 3, r * 6, r * 6);
        ctx.restore();
      }

      // base
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#181820';
      ctx.strokeStyle = def.color;
      ctx.lineWidth = Math.max(1.5, r * 0.16);
      ctx.beginPath();
      for (var s = 0; s < 6; s++) {
        var a = (s / 6) * Math.PI * 2 - Math.PI / 2;
        var pxx = Math.cos(a) * r, pyy = Math.sin(a) * r;
        if (s === 0) ctx.moveTo(pxx, pyy); else ctx.lineTo(pxx, pyy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // barrel pointing at the current target
      ctx.rotate(t.target ? t.angle : -Math.PI / 2);
      ctx.fillStyle = def.color;
      ctx.fillRect(0, -r * 0.2, r * (1.5 + t.flash * 0.35), r * 0.4);
      ctx.restore();
    }
  };

  /* ---------------- enemies ---------------- */

  Renderer.prototype.drawEnemies = function (ctx, now) {
    var sim = this.sim;
    var t = now * 0.001;

    for (var i = 0; i < sim.enemies.length; i++) {
      var e = sim.enemies[i];
      var x = this.px(e.x), y = this.py(e.y);
      var r = this.ps(e.def.size);
      var alpha = e.phased ? 0.32 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      // glow — bosses and hurt enemies burn brighter
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * (e.boss ? 0.75 : 0.4) + e.hitFlash * 0.5;
      var sprite = e.boss ? this.glowRed : this.glow;
      ctx.drawImage(sprite, x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
      ctx.restore();

      ctx.translate(x, y);
      ctx.fillStyle = e.hitFlash > 0.05 ? '#ffffff' : e.def.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = Math.max(1, r * 0.12);

      this.enemyShape(ctx, e, r, t);

      // a phased enemy shows a dashed ring: towers cannot touch it, you can
      if (e.phased) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = e.def.color;
        ctx.lineWidth = Math.max(1, r * 0.14);
        ctx.setLineDash([r * 0.5, r * 0.5]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.6, t * 2, t * 2 + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (e.slow > 0) {
        ctx.strokeStyle = 'rgba(150,225,255,0.75)';
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.35, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // health bar once it has been hurt
      if (e.hp < e.maxHp) {
        var w = r * (e.boss ? 4 : 2.6);
        var h = Math.max(2, r * 0.22);
        var frac = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x - w / 2, y - r * 1.9 - h, w, h);
        ctx.fillStyle = e.boss ? '#ff4d6d' : '#8bf5a0';
        ctx.fillRect(x - w / 2, y - r * 1.9 - h, w * frac, h);
      }
    }
  };

  /** One shape per role, so the threat reads at a glance. */
  Renderer.prototype.enemyShape = function (ctx, e, r, t) {
    ctx.beginPath();
    switch (e.type) {
      case 'runner':                       // dart
        ctx.moveTo(0, r * 1.3);
        ctx.lineTo(-r * 0.75, -r * 0.9);
        ctx.lineTo(0, -r * 0.4);
        ctx.lineTo(r * 0.75, -r * 0.9);
        break;
      case 'tank':                         // blunt square
        ctx.rect(-r, -r * 0.85, r * 2, r * 1.7);
        break;
      case 'brute':                        // heavy hexagon
        for (var i = 0; i < 6; i++) {
          var a = (i / 6) * Math.PI * 2;
          var px = Math.cos(a) * r * 1.1, py = Math.sin(a) * r * 1.1;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        break;
      case 'phantom':                      // diamond
        ctx.moveTo(0, -r * 1.3);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r * 1.3);
        ctx.lineTo(-r, 0);
        break;
      case 'boss':                         // spiked star
        var spikes = 8;
        for (var s = 0; s < spikes * 2; s++) {
          var ang = (s / (spikes * 2)) * Math.PI * 2 + t * 0.6;
          var rad = s % 2 ? r * 0.62 : r * 1.25;
          var bx = Math.cos(ang) * rad, by = Math.sin(ang) * rad;
          if (s === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
        }
        break;
      default:                             // grunt / swarm: triangle facing down
        ctx.moveTo(0, r * 1.15);
        ctx.lineTo(-r, -r * 0.8);
        ctx.lineTo(r, -r * 0.8);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  /* ---------------- projectiles & effects ---------------- */

  Renderer.prototype.drawProjectiles = function (ctx) {
    var list = this.sim.projectiles;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var x = this.px(p.x), y = this.py(p.y);
      var r = this.ps(p.kind === 'splash' ? 0.011 : 0.006);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.glow, x - r * 4, y - r * 4, r * 8, r * 8);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  Renderer.prototype.drawBolts = function (ctx) {
    var list = this.fx.bolts;
    if (!list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var fade = 1 - b.life / b.maxLife;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = fade;
      ctx.lineWidth = Math.max(1, this.ps(b.width) * (0.5 + fade));
      ctx.beginPath();
      ctx.moveTo(this.px(b.x), this.py(b.y));
      ctx.lineTo(this.px(b.tx), this.py(b.ty));
      ctx.stroke();
    }
    ctx.restore();
  };

  Renderer.prototype.drawRings = function (ctx) {
    var list = this.fx.rings;
    if (!list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var fade = 1 - clamp(r.r / r.maxR, 0, 1);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = fade * fade;
      ctx.lineWidth = Math.max(1, this.ps(r.width) * (0.4 + fade));
      ctx.beginPath();
      ctx.arc(this.px(r.x), this.py(r.y), Math.max(1, this.ps(r.r)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  Renderer.prototype.drawParticles = function (ctx) {
    var list = this.fx.particles;
    if (!list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var fade = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.arc(this.px(p.x), this.py(p.y), Math.max(0.6, this.ps(p.size) * (0.4 + fade)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  Renderer.prototype.drawNumbers = function (ctx) {
    var list = this.fx.numbers;
    if (!list.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      var t = n.life / n.maxLife;
      var alpha = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      var size = Math.max(10, this.ps(0.032) * n.scale);
      ctx.font = '800 ' + size.toFixed(1) + 'px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
      ctx.lineWidth = Math.max(2, size * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,' + (clamp(alpha, 0, 1) * 0.7).toFixed(3) + ')';
      ctx.strokeText(n.text, this.px(n.x), this.py(n.y));
      ctx.fillStyle = n.color.replace('ALPHA', clamp(alpha, 0, 1).toFixed(3));
      ctx.fillText(n.text, this.px(n.x), this.py(n.y));
    }
    ctx.restore();
  };

  /* ---------------- overlays ---------------- */

  Renderer.prototype.drawVignette = function (ctx) {
    var d = this.fx.danger;
    if (d < 0.05) return;
    var g = ctx.createRadialGradient(this.w / 2, this.h / 2, this.w * 0.3,
                                     this.w / 2, this.h / 2, this.w * 0.85);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, 'rgba(255,0,0,' + (0.35 * d).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  };

  Renderer.prototype.drawFlash = function (ctx) {
    if (this.fx.flash <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(' + this.fx.flashColor + ',' + (this.fx.flash * 0.35).toFixed(3) + ')';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  };

  NS.Renderer = Renderer;
})(window.SIEGE);
