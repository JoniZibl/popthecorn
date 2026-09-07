/**
 * POPCORE — DOM layer: money readout, chain banner, upgrade buttons.
 *
 * Reads from the simulation, writes to the DOM. Buying is routed back through
 * a callback so main.js can play sound / spawn effects in one place.
 */
(function (NS) {
  'use strict';

  var C = NS.CONFIG;
  var fmt = NS.formatMoney;

  function UI(sim, onBuy) {
    this.sim = sim;
    this.onBuy = onBuy;

    this.el = {
      money: document.getElementById('money'),
      rate: document.getElementById('rate'),
      best: document.getElementById('best'),
      pops: document.getElementById('pops'),
      chain: document.getElementById('chain'),
      hint: document.getElementById('hint'),
      upgrades: document.getElementById('upgrades')
    };

    this.rows = {};
    this._lastMoney = -1;
    this._chainShown = 0;
    this._hintHidden = false;

    this.buildUpgrades();
  }

  /* ---------------- upgrades ---------------- */

  UI.prototype.buildUpgrades = function () {
    var self = this;
    var frag = document.createDocumentFragment();

    C.UPGRADES.forEach(function (def) {
      var btn = document.createElement('button');
      btn.className = 'up';
      btn.type = 'button';
      btn.innerHTML =
        '<span class="up-top"><span class="up-name"></span><span class="up-lvl"></span></span>' +
        '<span class="up-val"></span>' +
        '<span class="up-cost"></span>' +
        '<span class="up-bar"></span>';

      btn.querySelector('.up-name').textContent = def.name;

      var row = {
        def: def,
        btn: btn,
        lvl: btn.querySelector('.up-lvl'),
        val: btn.querySelector('.up-val'),
        cost: btn.querySelector('.up-cost'),
        bar: btn.querySelector('.up-bar'),
        lastLevel: -1,
        lastAffordable: null
      };

      btn.addEventListener('click', function () {
        if (!self.sim.canBuy(def.id)) return;
        self.onBuy(def.id);
        btn.classList.remove('flash');
        void btn.offsetWidth;          // restart the CSS animation
        btn.classList.add('flash');
      });

      self.rows[def.id] = row;
      frag.appendChild(btn);
    });

    this.el.upgrades.appendChild(frag);
  };

  /* ---------------- per-frame refresh ---------------- */

  UI.prototype.update = function () {
    var sim = this.sim;

    if (sim.money !== this._lastMoney) {
      this.el.money.textContent = '$' + fmt(sim.money);
      this._lastMoney = sim.money;
    }
    this.el.rate.textContent = '$' + fmt(sim.moneyPerSecond(), true) + ' / s';
    this.el.best.textContent = sim.bestChain > 0 ? 'BEST CHAIN ×' + sim.bestChain : 'BEST CHAIN —';
    this.el.pops.textContent = sim.totalPops + ' pops';

    for (var i = 0; i < C.UPGRADES.length; i++) {
      var row = this.rows[C.UPGRADES[i].id];
      var def = row.def;
      var level = sim.level(def.id);
      var cost = sim.cost(def.id);
      var affordable = sim.money >= cost;

      if (level !== row.lastLevel) {
        row.lvl.textContent = 'LV ' + level;
        row.val.textContent = def.format(def.value(level));
        row.cost.textContent = '$' + fmt(cost);
        row.lastLevel = level;
      }
      if (affordable !== row.lastAffordable) {
        row.btn.disabled = !affordable;
        row.lastAffordable = affordable;
      }
      row.bar.style.width = (Math.min(1, sim.money / cost) * 100).toFixed(1) + '%';
    }
  };

  /** Money readout punch — called on manual pops. */
  UI.prototype.bumpMoney = function () {
    var el = this.el.money;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  };

  /* ---------------- chain banner ---------------- */

  UI.prototype.showChain = function (chain) {
    if (chain < 2) return;
    var el = this.el.chain;

    if (chain !== this._chainShown) {
      el.textContent = 'CHAIN ×' + chain;
      this._chainShown = chain;
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    }

    var tier = chain >= 100 ? 't4' : chain >= 50 ? 't3' : chain >= 25 ? 't2' : chain >= 10 ? 't1' : '';
    el.className = 'chain on pulse' + (tier ? ' ' + tier : '');
  };

  UI.prototype.hideChain = function () {
    this.el.chain.className = 'chain';
    this._chainShown = 0;
  };

  UI.prototype.hideHint = function () {
    if (this._hintHidden) return;
    this._hintHidden = true;
    this.el.hint.classList.add('hide');
  };

  NS.UI = UI;
})(window.POPCORE);
