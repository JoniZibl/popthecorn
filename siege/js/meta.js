/**
 * LAST KEEP — what survives a lost run.
 *
 * The keep always falls eventually: enemy strength climbs faster than gold
 * does, by design. Falling pays RELICS, scaled to the deepest wave reached,
 * and relics buy permanent upgrades that make the next attempt reach further.
 *
 * Relics are sub-linear in the wave reached, so grinding a shallow run twenty
 * times never beats pushing one run deeper.
 */
(function (NS) {
  'use strict';

  NS.META = {
    RELIC_SCALE: 1.6,
    RELIC_EXPONENT: 0.85,

    UPGRADES: [
      {
        id: 'walls', name: 'Thicker Walls', desc: 'More castle health',
        baseCost: 8, costMult: 1.5, max: 40,
        format: function (l) { return '+' + (l * 25) + ' HP'; }
      },
      {
        id: 'purse', name: 'War Chest', desc: 'Start every run with more gold',
        baseCost: 6, costMult: 1.45, max: 40,
        format: function (l) { return '+' + (l * 30) + ' gold'; }
      },
      {
        id: 'hand', name: 'Strong Hand', desc: 'Your taps hit harder, always',
        baseCost: 10, costMult: 1.55, max: 40,
        format: function (l) { return '×' + Math.pow(1.3, l).toFixed(2) + ' tap damage'; }
      },
      {
        id: 'forge', name: 'Forge', desc: 'All towers hit harder',
        baseCost: 12, costMult: 1.6, max: 40,
        format: function (l) { return '×' + Math.pow(1.25, l).toFixed(2) + ' tower damage'; }
      },
      {
        id: 'greed', name: 'Spoils', desc: 'Enemies drop more gold',
        baseCost: 9, costMult: 1.5, max: 30,
        format: function (l) { return '+' + (l * 15) + '% gold'; }
      },
      {
        id: 'quartermaster', name: 'Quartermaster', desc: 'Upgrades cost less',
        baseCost: 14, costMult: 1.7, max: 12,
        format: function (l) { return '−' + Math.round((1 - Math.pow(0.94, l)) * 100) + '% cost'; }
      },
      {
        id: 'capacitor', name: 'Capacitor', desc: 'Overcharge fills faster',
        baseCost: 11, costMult: 1.6, max: 15,
        format: function (l) { return '×' + (1 + l * 0.2).toFixed(1) + ' charge rate'; }
      }
    ]
  };

  function Meta() {
    this.relics = 0;
    this.lifetime = 0;
    this.runs = 0;
    this.bestWave = 0;
    this.levels = {};
    for (var i = 0; i < NS.META.UPGRADES.length; i++) this.levels[NS.META.UPGRADES[i].id] = 0;
  }

  Meta.prototype.def = function (id) {
    for (var i = 0; i < NS.META.UPGRADES.length; i++) {
      if (NS.META.UPGRADES[i].id === id) return NS.META.UPGRADES[i];
    }
    return null;
  };

  Meta.prototype.level = function (id) { return this.levels[id] || 0; };
  Meta.prototype.maxed = function (id) { return this.level(id) >= this.def(id).max; };

  Meta.prototype.cost = function (id) {
    var def = this.def(id);
    return Math.ceil(def.baseCost * Math.pow(def.costMult, this.level(id)));
  };

  Meta.prototype.canBuy = function (id) {
    return !this.maxed(id) && this.relics >= this.cost(id);
  };

  Meta.prototype.buy = function (id) {
    if (!this.canBuy(id)) return false;
    this.relics -= this.cost(id);
    this.levels[id] = this.level(id) + 1;
    return true;
  };

  /* ---- what the meta layer grants a run ---- */

  Meta.prototype.bonusHp = function () { return this.level('walls') * 25; };
  Meta.prototype.startGold = function () { return this.level('purse') * 30; };
  Meta.prototype.tapMult = function () { return Math.pow(1.3, this.level('hand')); };
  Meta.prototype.towerMult = function () { return Math.pow(1.25, this.level('forge')); };
  Meta.prototype.goldMult = function () { return 1 + this.level('greed') * 0.15; };
  Meta.prototype.costMult = function () { return Math.pow(0.94, this.level('quartermaster')); };
  Meta.prototype.chargeRate = function () { return 1 + this.level('capacitor') * 0.2; };

  /** Relics a run that died on this wave is worth. */
  Meta.prototype.relicsFor = function (wave) {
    if (wave < 1) return 0;
    return Math.floor(NS.META.RELIC_SCALE * Math.pow(wave, NS.META.RELIC_EXPONENT));
  };

  Meta.prototype.bank = function (wave) {
    var gain = this.relicsFor(wave);
    this.relics += gain;
    this.lifetime += gain;
    this.runs++;
    if (wave > this.bestWave) this.bestWave = wave;
    return gain;
  };

  Meta.prototype.toJSON = function () {
    return {
      relics: this.relics, lifetime: this.lifetime,
      runs: this.runs, bestWave: this.bestWave, levels: this.levels
    };
  };

  Meta.prototype.load = function (data) {
    if (!data) return;
    this.relics = Math.max(0, Math.floor(Number(data.relics) || 0));
    this.lifetime = Math.max(0, Math.floor(Number(data.lifetime) || 0));
    this.runs = Math.max(0, Math.floor(Number(data.runs) || 0));
    this.bestWave = Math.max(0, Math.floor(Number(data.bestWave) || 0));
    for (var i = 0; i < NS.META.UPGRADES.length; i++) {
      var def = NS.META.UPGRADES[i];
      var lvl = Math.floor(Number(data.levels && data.levels[def.id]) || 0);
      this.levels[def.id] = NS.clamp(lvl, 0, def.max);
    }
  };

  Meta.prototype.wipe = function () {
    this.relics = this.lifetime = this.runs = this.bestWave = 0;
    for (var i = 0; i < NS.META.UPGRADES.length; i++) this.levels[NS.META.UPGRADES[i].id] = 0;
  };

  NS.Meta = Meta;
})(window.SIEGE);
