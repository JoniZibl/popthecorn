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
      callout: document.getElementById('callout'),
      hint: document.getElementById('hint'),
      mega: document.getElementById('mega'),
      megaFill: document.getElementById('megaFill'),
      megaLabel: document.getElementById('megaLabel'),
      upgrades: document.getElementById('upgrades')
    };

    this.rows = {};
    this._lastMoney = -1;
    this._chainShown = 0;
    this._hintHidden = false;
    this._megaReady = null;
    this.moneyPunch = 0;      // decays each frame; drives the counter's scale

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

  UI.prototype.update = function (dt) {
    var sim = this.sim;

    if (sim.money !== this._lastMoney) {
      this.el.money.textContent = '$' + fmt(sim.money);
      this._lastMoney = sim.money;
    }

    // Every pop kicks the counter; the kick decays continuously rather than
    // through a CSS class, so rapid-fire pops stack instead of restarting.
    if (this.moneyPunch > 0.001) {
      this.moneyPunch *= Math.pow(0.0015, dt || 0.016);
      this.el.money.style.transform = 'scale(' + (1 + this.moneyPunch).toFixed(4) + ')';
    } else if (this.moneyPunch !== 0) {
      this.moneyPunch = 0;
      this.el.money.style.transform = '';
    }

    // MEGA meter
    var progress = sim.megaProgress();
    this.el.megaFill.style.width = (progress * 100).toFixed(1) + '%';
    var ready = sim.megaReady();
    if (ready !== this._megaReady) {
      this._megaReady = ready;
      this.el.mega.classList.toggle('ready', ready);
      this.el.mega.disabled = !ready;
      this.el.megaLabel.textContent = ready ? 'MEGA POP — TAP!' : 'MEGA POP';
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
        row.val.textContent = def.format(def.value(level), level);
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

  /** Money readout punch. Strength scales with how big the pop was. */
  UI.prototype.bumpMoney = function (strength) {
    this.moneyPunch = Math.min(this.moneyPunch + (strength || 0.06), 0.42);
  };

  /** Big slam-in word: "NICE", "INSANE", "GOLDEN!" … */
  UI.prototype.callout = function (text) {
    var el = this.el.callout;
    el.textContent = text;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  };

  UI.prototype.flashMega = function () {
    var el = this.el.mega;
    el.classList.remove('fired');
    void el.offsetWidth;
    el.classList.add('fired');
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

    var tier = chain >= 100 ? 't4' : chain >= 40 ? 't3' : chain >= 25 ? 't2' : chain >= 8 ? 't1' : '';
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
