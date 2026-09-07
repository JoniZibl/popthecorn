/**
 * POPCORE — simulation.
 *
 * Pure gameplay state: kernels, heat, shockwaves, chains, money, upgrades.
 * Knows nothing about canvas, DOM or audio. Every frame it drains `events`,
 * which is how the presentation layers learn what happened.
 *
 * Event shapes:
 *   { type:'pop',      x, y, chain, value, manual }
 *   { type:'chainEnd', count }
 *   { type:'tier',     tier, chain }      // chain crossed a milestone
 *   { type:'spawn',    x, y }
 *   { type:'buy',      id, level }
 */
(function (NS) {
  'use strict';

  var C = NS.CONFIG;
  var clamp = NS.clamp;
  var rand = NS.rand;

  var nextId = 1;

  function Sim() {
    this.kernels = [];
    this.shockwaves = [];
    this.events = [];

    this.money = 0;
    this.totalPops = 0;
    this.bestChain = 0;
    this.levels = {};
    for (var i = 0; i < C.UPGRADES.length; i++) this.levels[C.UPGRADES[i].id] = 0;

    this.chain = 0;
    this.chainTimer = 0;
    this.chainTier = 0;      // index into CHAIN_TIERS already announced
    this.time = 0;
    this.spawnAcc = 0;

    // Rolling earnings history for the "$ / s" readout.
    this._earnings = [];
    this._earned = 0;
  }

  /* ---------------- upgrades ---------------- */

  Sim.prototype.level = function (id) { return this.levels[id] || 0; };

  Sim.prototype.upgradeDef = function (id) {
    for (var i = 0; i < C.UPGRADES.length; i++) {
      if (C.UPGRADES[i].id === id) return C.UPGRADES[i];
    }
    return null;
  };

  Sim.prototype.cost = function (id) {
    var def = this.upgradeDef(id);
    return def.baseCost * Math.pow(def.costMult, this.level(id));
  };

  Sim.prototype.canBuy = function (id) { return this.money >= this.cost(id); };

  Sim.prototype.buy = function (id) {
    var price = this.cost(id);
    if (this.money < price) return false;
    this.money -= price;
    this.levels[id] = this.level(id) + 1;
    this.events.push({ type: 'buy', id: id, level: this.levels[id] });
    return true;
  };

  /* Derived stats — read straight from the upgrade table. */
  Sim.prototype.spawnRate = function () {
    return Math.min(this.upgradeDef('spawn').value(this.level('spawn')), C.MAX_SPAWN_RATE);
  };
  Sim.prototype.heatRate = function () { return this.upgradeDef('heat').value(this.level('heat')); };
  Sim.prototype.shockHeat = function () { return this.upgradeDef('shock').value(this.level('shock')); };
  Sim.prototype.shockRadius = function () { return C.shockRadius(this.level('shock')); };
  Sim.prototype.popValue = function () { return this.upgradeDef('value').value(this.level('value')); };

  /** Money earned per pop at the current chain length (sub-linear in the chain). */
  Sim.prototype.valueAtChain = function (chain) {
    return this.popValue() * (1 + C.CHAIN_BONUS * Math.sqrt(chain));
  };

  Sim.prototype.moneyPerSecond = function () {
    var total = 0;
    for (var i = 0; i < this._earnings.length; i++) total += this._earnings[i].amount;
    return total / C.RATE_WINDOW;
  };

  /* ---------------- kernels ---------------- */

  Sim.prototype.spawnKernel = function () {
    if (this.kernels.length >= C.MAX_KERNELS) return null;

    // A few placement attempts, keeping some breathing room between kernels.
    var best = null, bestDist = -1;
    for (var attempt = 0; attempt < 8; attempt++) {
      var a = Math.random() * Math.PI * 2;
      // sqrt keeps the distribution even across the disc instead of centre-heavy
      var r = Math.sqrt(Math.random()) * C.SPAWN_RADIUS;
      var x = Math.cos(a) * r, y = Math.sin(a) * r;
      var d = this._nearestDistance(x, y);
      if (d > bestDist) { bestDist = d; best = { x: x, y: y }; }
      if (d > C.KERNEL_RADIUS * 3) break;
    }

    var k = {
      id: nextId++,
      x: best.x,
      y: best.y,
      heat: 0,
      rate: this.heatRate() * rand(1 - C.HEAT_JITTER, 1 + C.HEAT_JITTER),
      angle: rand(0, Math.PI * 2),
      seed: Math.random() * 1000,
      age: 0
    };
    this.kernels.push(k);
    this.events.push({ type: 'spawn', x: k.x, y: k.y });
    return k;
  };

  Sim.prototype._nearestDistance = function (x, y) {
    var min = Infinity;
    for (var i = 0; i < this.kernels.length; i++) {
      var k = this.kernels[i];
      var dx = k.x - x, dy = k.y - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < min) min = d;
    }
    return min;
  };

  /** Kernel nearest to a tap, within TAP_RADIUS. Hottest wins on a tie-ish tap. */
  Sim.prototype.kernelAt = function (x, y) {
    var best = null, bestScore = Infinity;
    for (var i = 0; i < this.kernels.length; i++) {
      var k = this.kernels[i];
      var dx = k.x - x, dy = k.y - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= C.TAP_RADIUS && d < bestScore) { bestScore = d; best = k; }
    }
    return best;
  };

  Sim.prototype.tap = function (x, y) {
    var k = this.kernelAt(x, y);
    if (!k) return false;
    this.pop(k, true);
    return true;
  };

  /* ---------------- popping ---------------- */

  Sim.prototype.pop = function (kernel, manual) {
    var idx = this.kernels.indexOf(kernel);
    if (idx === -1) return;
    this.kernels.splice(idx, 1);

    var value = this.valueAtChain(this.chain);
    this.money += value;
    this._earned += value;
    this.totalPops++;

    this.chain++;
    this.chainTimer = C.chainWindow(this.chain);
    if (this.chain > this.bestChain) this.bestChain = this.chain;

    this.addShockwave(kernel.x, kernel.y);

    this.events.push({
      type: 'pop',
      x: kernel.x,
      y: kernel.y,
      chain: this.chain,
      value: value,
      manual: !!manual
    });

    // Announce milestones once each, in order.
    while (this.chainTier < C.CHAIN_TIERS.length && this.chain >= C.CHAIN_TIERS[this.chainTier]) {
      this.events.push({
        type: 'tier',
        tier: this.chainTier + 1,
        chain: this.chain,
        x: kernel.x,
        y: kernel.y
      });
      this.chainTier++;
    }
  };

  Sim.prototype.addShockwave = function (x, y) {
    if (this.shockwaves.length >= C.MAX_SHOCKWAVES) this.shockwaves.shift();
    this.shockwaves.push({
      x: x,
      y: y,
      r: 0,
      maxR: this.shockRadius(),
      heat: this.shockHeat(),
      chain: this.chain,
      hit: {}          // kernel ids already touched by this ring
    });
  };

  /* ---------------- step ---------------- */

  Sim.prototype.update = function (dt) {
    this.time += dt;

    this._updateChain(dt);
    this._updateSpawning(dt);
    this._updateHeat(dt);
    this._updateShockwaves(dt);
    this._updateEarnings(dt);
  };

  Sim.prototype._updateChain = function (dt) {
    if (this.chain <= 0) return;
    this.chainTimer -= dt;
    if (this.chainTimer <= 0) {
      this.events.push({ type: 'chainEnd', count: this.chain });
      this.chain = 0;
      this.chainTier = 0;
    }
  };

  Sim.prototype._updateSpawning = function (dt) {
    this.spawnAcc += this.spawnRate() * dt;
    // Bounded burst: the accumulator can never queue up unbounded work, even if
    // the tab was frozen or the spawn level is enormous.
    if (this.spawnAcc > C.MAX_SPAWN_PER_STEP) this.spawnAcc = C.MAX_SPAWN_PER_STEP;

    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (!this.spawnKernel()) { this.spawnAcc = 0; break; }   // pan is full
    }
    // The pan is never allowed to sit empty — there is always something to tap.
    if (this.kernels.length === 0) {
      this.spawnAcc = 0;
      this.spawnKernel();
    }
  };

  Sim.prototype._updateHeat = function (dt) {
    var popped = null;
    for (var i = 0; i < this.kernels.length; i++) {
      var k = this.kernels[i];
      k.age += dt;
      k.heat += k.rate * dt;
      if (k.heat >= 1) (popped || (popped = [])).push(k);
    }
    if (popped) for (var j = 0; j < popped.length; j++) this.pop(popped[j], false);
  };

  Sim.prototype._updateShockwaves = function (dt) {
    for (var i = this.shockwaves.length - 1; i >= 0; i--) {
      var w = this.shockwaves[i];
      var prev = w.r;
      w.r += C.SHOCK_SPEED * dt;

      // Heat every kernel the ring swept across this step (each one only once).
      var popped = null;
      for (var j = 0; j < this.kernels.length; j++) {
        var k = this.kernels[j];
        if (w.hit[k.id]) continue;
        var dx = k.x - w.x, dy = k.y - w.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > w.maxR) continue;
        if (d <= w.r + C.SHOCK_BAND && d >= prev - C.SHOCK_BAND) {
          w.hit[k.id] = 1;
          // Closer kernels take more heat than ones out near the edge.
          var falloff = 1 - 0.55 * (d / w.maxR);
          k.heat += w.heat * falloff;
          if (k.heat >= 1) (popped || (popped = [])).push(k);
        }
      }
      if (popped) for (var p = 0; p < popped.length; p++) this.pop(popped[p], false);

      if (w.r >= w.maxR) this.shockwaves.splice(i, 1);
    }
  };

  Sim.prototype._updateEarnings = function (dt) {
    if (this._earned > 0) {
      this._earnings.push({ t: this.time, amount: this._earned });
      this._earned = 0;
    }
    var cutoff = this.time - C.RATE_WINDOW;
    while (this._earnings.length && this._earnings[0].t < cutoff) this._earnings.shift();
  };

  /* ---------------- save / load ---------------- */

  Sim.prototype.toJSON = function () {
    return {
      v: 1,
      money: this.money,
      totalPops: this.totalPops,
      bestChain: this.bestChain,
      levels: this.levels
    };
  };

  Sim.prototype.load = function (data) {
    if (!data || data.v !== 1) return false;
    this.money = Math.max(0, Number(data.money) || 0);
    this.totalPops = Math.max(0, Math.floor(Number(data.totalPops) || 0));
    this.bestChain = Math.max(0, Math.floor(Number(data.bestChain) || 0));
    for (var i = 0; i < C.UPGRADES.length; i++) {
      var id = C.UPGRADES[i].id;
      var lvl = Math.floor(Number(data.levels && data.levels[id]) || 0);
      this.levels[id] = Math.max(0, lvl);
    }
    return true;
  };

  Sim.prototype.reset = function () {
    this.kernels.length = 0;
    this.shockwaves.length = 0;
    this.events.length = 0;
    this.money = 0;
    this.totalPops = 0;
    this.bestChain = 0;
    this.chain = 0;
    this.chainTier = 0;
    this.spawnAcc = 0;
    this._earnings.length = 0;
    for (var i = 0; i < C.UPGRADES.length; i++) this.levels[C.UPGRADES[i].id] = 0;
    this.spawnKernel();
  };

  NS.Sim = Sim;
})(window.POPCORE);
