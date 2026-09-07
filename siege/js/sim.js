/**
 * LAST KEEP — simulation.
 *
 * Owns the fight: enemies marching down the field, towers shooting, taps,
 * gold, waves, castle health. Knows nothing about canvas, DOM or audio; it
 * reports what happened through `events`, drained once per frame.
 *
 * Event shapes:
 *   { type:'shot',   x, y, tx, ty, tower }
 *   { type:'hit',    x, y, damage, killed, boss }
 *   { type:'kill',   x, y, gold, boss, enemy }
 *   { type:'tap',    x, y, damage, hit, combo }
 *   { type:'leak',   x, y, damage }          // enemy reached the castle
 *   { type:'wave',   n, boss }
 *   { type:'cleared',n, bonus }
 *   { type:'over',   wave }
 *   { type:'overcharge' }
 */
(function (NS) {
  'use strict';

  var C = NS.CONFIG;
  var clamp = NS.clamp;
  var rand = NS.rand;

  var nextId = 1;

  function Sim(meta) {
    this.meta = meta || null;
    this.events = [];

    this.enemies = [];
    this.projectiles = [];

    this.levels = { tap: 0 };
    for (var i = 0; i < NS.TOWERS.length; i++) this.levels[NS.TOWERS[i].id] = 0;

    this.towers = NS.TOWERS.map(function (def) {
      return { def: def, cooldown: 0, angle: 0, target: null, flash: 0 };
    });

    this.reset();
  }

  Sim.prototype.reset = function () {
    var m = this.meta;

    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.events.length = 0;

    this.maxHp = C.CASTLE_HP + (m ? m.bonusHp() : 0);
    this.hp = this.maxHp;
    this.gold = 40 + (m ? m.startGold() : 0);
    this.wave = 0;
    this.spawnQueue = [];
    this.waveTime = 0;
    this.breakTime = C.WAVE_BREAK;
    this.inWave = false;
    this.over = false;
    this.time = 0;

    this.combo = 0;
    this.comboTimer = 0;
    this.overcharge = 0;
    this.taps = 0;
    this.kills = 0;
    this.earned = 0;

    this.levels.tap = 0;
    for (var i = 0; i < NS.TOWERS.length; i++) this.levels[NS.TOWERS[i].id] = 0;
    for (var t = 0; t < this.towers.length; t++) {
      this.towers[t].cooldown = 0;
      this.towers[t].target = null;
    }
  };

  /* ---------------- upgrades ---------------- */

  Sim.prototype.level = function (id) { return this.levels[id] || 0; };

  Sim.prototype.upgradeDef = function (id) {
    if (id === 'tap') return NS.TAP_UPGRADE;
    for (var i = 0; i < NS.TOWERS.length; i++) {
      if (NS.TOWERS[i].id === id) return NS.TOWERS[i];
    }
    return null;
  };

  Sim.prototype.cost = function (id) {
    var def = this.upgradeDef(id);
    var discount = this.meta ? this.meta.costMult() : 1;
    return def.baseCost * Math.pow(def.costMult, this.level(id)) * discount;
  };

  Sim.prototype.canBuy = function (id) { return !this.over && this.gold >= this.cost(id); };

  Sim.prototype.buy = function (id) {
    if (!this.canBuy(id)) return false;
    this.gold -= this.cost(id);
    this.levels[id] = this.level(id) + 1;
    return true;
  };

  Sim.prototype.towerDamage = function (def) {
    var mult = this.meta ? this.meta.towerMult() : 1;
    return def.damage(this.level(def.id)) * mult;
  };

  Sim.prototype.tapDamage = function () {
    var base = NS.TAP_UPGRADE.damage(this.level('tap'));
    var mult = this.meta ? this.meta.tapMult() : 1;
    return base * mult * this.comboMult();
  };

  Sim.prototype.comboMult = function () {
    return 1 + Math.min(this.combo, C.COMBO_MAX) * C.COMBO_STEP;
  };

  Sim.prototype.overchargeMax = function () {
    return C.OVERCHARGE_MAX;
  };

  Sim.prototype.overchargeReady = function () { return this.overcharge >= this.overchargeMax(); };

  /* ---------------- waves ---------------- */

  Sim.prototype.startWave = function (early) {
    this.wave++;
    this.spawnQueue = NS.wave.build(this.wave);
    this.waveTime = 0;
    this.inWave = true;
    this.earlyCall = !!early;
    this.events.push({ type: 'wave', n: this.wave, boss: NS.wave.isBoss(this.wave) });
  };

  /** Call the next wave during a break, for bonus gold. */
  Sim.prototype.callEarly = function () {
    if (this.inWave || this.over) return false;
    this.breakTime = 0;
    this.startWave(true);
    return true;
  };

  Sim.prototype.spawn = function (typeId) {
    if (this.enemies.length >= C.MAX_ENEMIES) return null;

    var def = NS.ENEMIES[typeId];
    var scale = NS.wave.scale(this.wave);
    var hp = def.hp * scale.hp * (def.boss ? 1 + this.wave * 0.06 : 1);

    var e = {
      id: nextId++,
      type: typeId,
      def: def,
      x: rand(0.1, 0.9),
      y: C.SPAWN_Y - rand(0, 0.05),
      hp: hp,
      maxHp: hp,
      speed: def.speed * scale.speed,
      gold: def.gold * scale.gold,
      armor: def.armor,
      slow: 0,
      slowTimer: 0,
      wobble: rand(0, Math.PI * 2),
      phased: false,
      phaseTimer: def.phase ? rand(0, def.phaseOn) : 0,
      hitFlash: 0,
      boss: !!def.boss
    };
    if (e.boss) e.x = 0.5;
    this.enemies.push(e);
    return e;
  };

  /* ---------------- damage ---------------- */

  /**
   * Apply damage to one enemy. `fromTap` bypasses phasing and gets the boss
   * bonus, which is what makes a player's finger matter on a boss.
   */
  Sim.prototype.damage = function (e, amount, fromTap) {
    if (e.dead) return 0;
    if (!fromTap && e.phased) return 0;

    var dealt = Math.max(amount - (fromTap ? 0 : e.armor), amount * 0.15);
    if (fromTap && e.boss) dealt *= C.BOSS_TAP_BONUS;

    e.hp -= dealt;
    e.hitFlash = 1;

    var killed = e.hp <= 0;
    if (killed) this.kill(e);

    this.events.push({
      type: 'hit', x: e.x, y: e.y, damage: dealt, killed: killed, boss: e.boss
    });
    return dealt;
  };

  Sim.prototype.kill = function (e) {
    if (e.dead) return;
    e.dead = true;

    var mult = this.meta ? this.meta.goldMult() : 1;
    var gold = e.gold * mult;
    this.gold += gold;
    this.earned += gold;
    this.kills++;

    this.events.push({ type: 'kill', x: e.x, y: e.y, gold: gold, boss: e.boss, enemy: e.def.name });
  };

  /* ---------------- player input ---------------- */

  /** Tap the field. Hits the closest enemy within TAP_RADIUS. */
  Sim.prototype.tap = function (x, y) {
    if (this.over) return false;

    var best = null, bestDist = C.TAP_RADIUS;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead) continue;
      var dx = e.x - x, dy = e.y - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      // Bigger enemies are easier to hit — their body counts, not just centre.
      if (d - e.def.size < bestDist) { bestDist = d - e.def.size; best = e; }
    }

    this.taps++;
    if (this.overcharge < this.overchargeMax()) {
      this.overcharge = Math.min(this.overchargeMax(),
        this.overcharge + (this.meta ? this.meta.chargeRate() : 1));
    }

    if (!best) {
      this.events.push({ type: 'tap', x: x, y: y, damage: 0, hit: false, combo: this.combo });
      return false;
    }

    this.combo++;
    this.comboTimer = C.COMBO_WINDOW;

    var dmg = this.tapDamage();
    this.damage(best, dmg, true);
    this.events.push({ type: 'tap', x: best.x, y: best.y, damage: dmg, hit: true, combo: this.combo });
    return true;
  };

  /** Spend a full meter: heavy damage to everything on the field. */
  Sim.prototype.fireOvercharge = function () {
    if (!this.overchargeReady() || this.over) return false;
    this.overcharge = 0;

    var dmg = NS.TAP_UPGRADE.damage(this.level('tap')) *
              (this.meta ? this.meta.tapMult() : 1) * C.OVERCHARGE_DAMAGE;

    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (!e.dead) this.damage(e, dmg, true);
    }
    this.events.push({ type: 'overcharge' });
    return true;
  };

  /* ---------------- step ---------------- */

  Sim.prototype.update = function (dt) {
    if (this.over) return;

    this.time += dt;

    this._updateCombo(dt);
    this._updateWave(dt);
    this._updateEnemies(dt);
    this._updateTowers(dt);
    this._updateProjectiles(dt);
    this._cull();
  };

  Sim.prototype._updateCombo = function (dt) {
    if (this.combo <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
  };

  Sim.prototype._updateWave = function (dt) {
    if (!this.inWave) {
      this.breakTime -= dt;
      if (this.breakTime <= 0) this.startWave(false);
      return;
    }

    this.waveTime += dt;
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTime) {
      this.spawn(this.spawnQueue.shift().type);
    }

    // The wave ends when everything queued has spawned and died.
    if (!this.spawnQueue.length && !this.enemies.length) {
      var bonus = C.WAVE_CLEAR_GOLD * Math.pow(C.GOLD_GROWTH, this.wave - 1) *
                  (this.earlyCall ? 1 + C.EARLY_CALL_BONUS : 1) *
                  (this.meta ? this.meta.goldMult() : 1);
      this.gold += bonus;
      this.earned += bonus;
      this.inWave = false;
      this.breakTime = C.WAVE_BREAK;
      this.events.push({ type: 'cleared', n: this.wave, bonus: bonus });
    }
  };

  Sim.prototype._updateEnemies = function (dt) {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead) continue;

      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.slow = 0;
      }
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 5);

      if (e.def.phase) {
        e.phaseTimer -= dt;
        if (e.phaseTimer <= 0) {
          e.phased = !e.phased;
          e.phaseTimer = e.phased ? e.def.phaseOn : e.def.phaseOff;
        }
      }

      e.y += e.speed * (1 - e.slow) * dt;
      e.wobble += dt * 1.6;
      e.x = clamp(e.x + Math.sin(e.wobble) * 0.012 * dt, 0.04, 0.96);

      if (e.y >= C.CASTLE_Y) {
        this.hp -= e.def.damage;
        e.dead = true;
        this.events.push({ type: 'leak', x: e.x, y: C.CASTLE_Y, damage: e.def.damage });

        if (this.hp <= 0) {
          this.hp = 0;
          this.over = true;
          this.events.push({ type: 'over', wave: this.wave });
          return;
        }
      }
    }
  };

  Sim.prototype._updateTowers = function (dt) {
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      var def = t.def;
      var level = this.level(def.id);

      if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 6);
      t.cooldown -= dt;

      var target = this._nearestEnemy(def.x, def.y, def.range(level));
      t.target = target;
      if (!target) continue;

      t.angle = Math.atan2(target.y - def.y, target.x - def.x);
      if (t.cooldown > 0) continue;

      t.cooldown = 1 / def.rate(level);
      t.flash = 1;
      this._fire(t, target, level);
    }
  };

  Sim.prototype._fire = function (t, target, level) {
    var def = t.def;
    var damage = this.towerDamage(def);

    this.events.push({
      type: 'shot', x: def.x, y: def.y, tx: target.x, ty: target.y, tower: def.id
    });

    if (def.kind === 'chain') {
      // Tesla arcs immediately: first target, then outward to its neighbours.
      var hit = [target];
      this.damage(target, damage, false);
      var chains = def.chains(level);
      var from = target;

      for (var c = 0; c < chains; c++) {
        var next = this._nearestEnemy(from.x, from.y, def.chainRange, hit);
        if (!next) break;
        this.damage(next, damage * 0.75, false);
        hit.push(next);
        this.events.push({ type: 'shot', x: from.x, y: from.y, tx: next.x, ty: next.y, tower: def.id });
        from = next;
      }
      return;
    }

    if (this.projectiles.length >= C.MAX_PROJECTILES) this.projectiles.shift();
    this.projectiles.push({
      x: def.x, y: def.y,
      tx: target.x, ty: target.y,
      target: target,
      speed: def.kind === 'splash' ? 0.9 : 1.6,
      damage: damage,
      kind: def.kind,
      splash: def.splash ? def.splash(level) : 0,
      slow: def.slow ? def.slow(level) : 0,
      slowTime: def.slowTime || 0,
      color: def.color
    });
  };

  Sim.prototype._nearestEnemy = function (x, y, range, exclude) {
    var best = null, bestD = range;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.dead || e.phased) continue;
      if (exclude && exclude.indexOf(e) !== -1) continue;
      var dx = e.x - x, dy = e.y - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };

  Sim.prototype._updateProjectiles = function (dt) {
    for (var i = this.projectiles.length - 1; i >= 0; i--) {
      var p = this.projectiles[i];

      // Home in while the target lives, otherwise carry on to its last position.
      if (p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }

      var dx = p.tx - p.x, dy = p.ty - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var step = p.speed * dt;

      if (dist <= step || dist < 0.006) {
        this._impact(p);
        this.projectiles.splice(i, 1);
        continue;
      }
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
    }
  };

  Sim.prototype._impact = function (p) {
    if (p.kind === 'splash') {
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (e.dead || e.phased) continue;
        var dx = e.x - p.tx, dy = e.y - p.ty;
        if (Math.sqrt(dx * dx + dy * dy) <= p.splash) this.damage(e, p.damage, false);
      }
      return;
    }

    if (p.target && !p.target.dead) {
      this.damage(p.target, p.damage, false);
      if (p.slow) {
        p.target.slow = Math.max(p.target.slow, p.slow);
        p.target.slowTimer = p.slowTime;
      }
    }
  };

  Sim.prototype._cull = function () {
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) this.enemies.splice(i, 1);
    }
  };

  /* ---------------- save ---------------- */

  Sim.prototype.toJSON = function () {
    return {
      wave: this.wave, hp: this.hp, gold: this.gold,
      levels: this.levels, kills: this.kills, earned: this.earned,
      overcharge: this.overcharge, over: this.over
    };
  };

  Sim.prototype.load = function (data) {
    if (!data) return false;
    this.reset();
    this.wave = Math.max(0, Math.floor(Number(data.wave) || 0));
    this.hp = clamp(Number(data.hp) || this.maxHp, 0, this.maxHp);
    this.gold = Math.max(0, Number(data.gold) || 0);
    this.kills = Math.max(0, Math.floor(Number(data.kills) || 0));
    this.earned = Math.max(0, Number(data.earned) || 0);
    this.overcharge = clamp(Number(data.overcharge) || 0, 0, this.overchargeMax());
    this.over = !!data.over;

    this.levels.tap = Math.max(0, Math.floor(Number(data.levels && data.levels.tap) || 0));
    for (var i = 0; i < NS.TOWERS.length; i++) {
      var id = NS.TOWERS[i].id;
      this.levels[id] = Math.max(0, Math.floor(Number(data.levels && data.levels[id]) || 0));
    }

    // A restored run resumes in the break before the next wave.
    this.inWave = false;
    this.breakTime = C.WAVE_BREAK;
    return true;
  };

  NS.Sim = Sim;
})(window.SIEGE);
