/**
 * POPCORE — the layer above a single batch.
 *
 * A batch is one panful: you pop, upgrade, draft cards, and the numbers run
 * away from you. Cashing out ends the batch and converts everything it earned
 * into BUTTER, the permanent currency. Butter buys upgrades that apply to every
 * future batch and unlocks new cards into the draft pool.
 *
 * That is the long arc: a batch is ten minutes, the butter it leaves behind is
 * forever, and the card pool keeps opening up for months.
 */
(function (NS) {
  'use strict';

  NS.META = {
    /* Butter is logarithmic in what a batch earned: every tenfold increase in
     * batch power is worth the same fixed step. That is what makes the meta
     * layer last — a batch a thousand times stronger than your first pays
     * three steps more, not a thousand times more, so the deep upgrades stay
     * expensive no matter how absurd the in-batch numbers get. */
    BUTTER_PER_DECADE: 2.2,
    BUTTER_LOG_FLOOR: 4,      // a batch under $10k is not worth cashing out

    /* Cashing out below this is refused — it would burn a batch for nothing. */
    MIN_CASHOUT: 1,

    UPGRADES: [
      {
        id: 'slots',
        name: 'Wider Selection',
        desc: 'One more card to choose from at every draft',
        baseCost: 26,
        costMult: 5,
        max: 3,
        format: function (lvl) { return (3 + lvl) + ' cards per draft'; }
      },
      {
        id: 'luck',
        name: 'Rare Blend',
        desc: 'Better odds of rare and legendary cards',
        baseCost: 20,
        costMult: 2.6,
        max: 6,
        format: function (lvl) { return '+' + (lvl * 50) + '% rare odds'; }
      },
      {
        id: 'headstart',
        name: 'Head Start',
        desc: 'Every batch begins with free upgrade levels',
        baseCost: 10,
        costMult: 1.55,
        max: 20,
        format: function (lvl) { return lvl + ' free levels each'; }
      },
      {
        id: 'churn',
        name: 'Butter Churn',
        desc: 'Every batch yields more butter',
        baseCost: 16,
        costMult: 1.7,
        max: 25,
        format: function (lvl) { return '+' + (lvl * 12) + '% butter'; }
      },
      {
        id: 'richer',
        name: 'Deep Fryer',
        desc: 'Permanently raises what every pop pays',
        baseCost: 14,
        costMult: 1.6,
        max: 40,
        format: function (lvl) { return '×' + POPCORE.formatMoney(Math.pow(1.5, lvl), true) + ' pop value'; }
      }
    ]
  };

  function Meta() {
    this.butter = 0;
    this.lifetimeButter = 0;   // drives card unlocks; never spent down
    this.batches = 0;
    this.bestBatch = 0;        // most money earned in a single batch
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

  Meta.prototype.maxed = function (id) {
    var def = this.def(id);
    return this.level(id) >= def.max;
  };

  Meta.prototype.cost = function (id) {
    var def = this.def(id);
    return Math.ceil(def.baseCost * Math.pow(def.costMult, this.level(id)));
  };

  Meta.prototype.canBuy = function (id) {
    return !this.maxed(id) && this.butter >= this.cost(id);
  };

  Meta.prototype.buy = function (id) {
    if (!this.canBuy(id)) return false;
    this.butter -= this.cost(id);
    this.levels[id] = this.level(id) + 1;
    return true;
  };

  /* ---- what the meta layer grants a batch ---- */

  Meta.prototype.cardsPerDraft = function () { return 3 + this.level('slots'); };
  Meta.prototype.luck = function () { return this.level('luck') * 0.5; };
  Meta.prototype.headStart = function () { return this.level('headstart'); };
  Meta.prototype.popValueMult = function () { return Math.pow(1.5, this.level('richer')); };
  Meta.prototype.butterMult = function () { return 1 + this.level('churn') * 0.12; };

  /** Butter a batch that earned `earned` would pay right now. */
  Meta.prototype.butterFor = function (earned) {
    var M = NS.META;
    if (earned <= 0) return 0;
    var decades = Math.log(earned) / Math.LN10 - M.BUTTER_LOG_FLOOR;
    if (decades <= 0) return 0;
    return Math.floor(decades * M.BUTTER_PER_DECADE * this.butterMult());
  };

  Meta.prototype.canCashOut = function (earned) {
    return this.butterFor(earned) >= NS.META.MIN_CASHOUT;
  };

  /** Bank a finished batch. Returns the butter gained. */
  Meta.prototype.cashOut = function (earned) {
    var gain = this.butterFor(earned);
    if (gain < NS.META.MIN_CASHOUT) return 0;
    this.butter += gain;
    this.lifetimeButter += gain;
    this.batches++;
    if (earned > this.bestBatch) this.bestBatch = earned;
    return gain;
  };

  /** How much money is still needed for the next whole point of butter. */
  Meta.prototype.nextButterAt = function (earned) {
    var M = NS.META;
    var target = this.butterFor(earned) + 1;
    var decades = target / (M.BUTTER_PER_DECADE * this.butterMult()) + M.BUTTER_LOG_FLOOR;
    return Math.max(0, Math.pow(10, decades) - earned);
  };

  Meta.prototype.toJSON = function () {
    return {
      butter: this.butter,
      lifetimeButter: this.lifetimeButter,
      batches: this.batches,
      bestBatch: this.bestBatch,
      levels: this.levels
    };
  };

  Meta.prototype.load = function (data) {
    if (!data) return;
    this.butter = Math.max(0, Number(data.butter) || 0);
    this.lifetimeButter = Math.max(0, Number(data.lifetimeButter) || 0);
    this.batches = Math.max(0, Math.floor(Number(data.batches) || 0));
    this.bestBatch = Math.max(0, Number(data.bestBatch) || 0);
    for (var i = 0; i < NS.META.UPGRADES.length; i++) {
      var def = NS.META.UPGRADES[i];
      var lvl = Math.floor(Number(data.levels && data.levels[def.id]) || 0);
      this.levels[def.id] = NS.clamp(lvl, 0, def.max);
    }
  };

  NS.Meta = Meta;
})(window.POPCORE);
