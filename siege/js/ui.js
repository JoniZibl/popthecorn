/**
 * LAST KEEP — DOM layer: HUD, upgrade buttons, overlays.
 */
(function (NS) {
  'use strict';

  var fmt = NS.fmt;
  var clamp = NS.clamp;

  function UI(sim, meta, handlers) {
    this.sim = sim;
    this.meta = meta;
    this.handlers = handlers;

    this.el = {
      wave: document.getElementById('wave'),
      waveSub: document.getElementById('waveSub'),
      gold: document.getElementById('gold'),
      relics: document.getElementById('relics'),
      hpBar: document.getElementById('hpBar'),
      hpText: document.getElementById('hpText'),
      banner: document.getElementById('banner'),
      combo: document.getElementById('combo'),
      bossWrap: document.getElementById('bossWrap'),
      bossBar: document.getElementById('bossBar'),
      charge: document.getElementById('charge'),
      chargeFill: document.getElementById('chargeFill'),
      chargeLabel: document.getElementById('chargeLabel'),
      upgrades: document.getElementById('upgrades'),
      callWave: document.getElementById('callWave'),
      over: document.getElementById('over'),
      overSummary: document.getElementById('overSummary'),
      shop: document.getElementById('shop'),
      shopRelics: document.getElementById('shopRelics'),
      shopList: document.getElementById('shopList')
    };

    this.rows = {};
    this._chargeReady = null;
    this.goldPunch = 0;

    this.buildUpgrades();
    this.bind();
  }

  UI.prototype.bind = function () {
    var self = this;
    this.el.charge.addEventListener('click', function () { self.handlers.onOvercharge(); });
    this.el.callWave.addEventListener('click', function () { self.handlers.onCallWave(); });
    document.getElementById('shopBtn').addEventListener('click', function () { self.openShop(); });
    document.getElementById('shopClose').addEventListener('click', function () {
      self.el.shop.hidden = true;
    });
    document.getElementById('again').addEventListener('click', function () {
      self.el.over.hidden = true;
      self.openShop();
      self.handlers.onRestart();
    });
  };

  UI.prototype.anyPanelOpen = function () {
    return !this.el.over.hidden || !this.el.shop.hidden;
  };

  /* ---------------- upgrade buttons ---------------- */

  UI.prototype.buildUpgrades = function () {
    var self = this;
    var defs = [NS.TAP_UPGRADE].concat(NS.TOWERS);
    var frag = document.createDocumentFragment();

    defs.forEach(function (def) {
      var btn = document.createElement('button');
      btn.className = 'up';
      btn.type = 'button';
      btn.innerHTML = '<span class="up-dot"></span><span class="up-name"></span>' +
                      '<span class="up-lvl"></span><span class="up-cost"></span>' +
                      '<span class="up-bar"></span>';
      btn.querySelector('.up-name').textContent = def.name;
      btn.querySelector('.up-dot').style.background = def.color || '#ffcf5c';

      btn.addEventListener('click', function () {
        if (!self.sim.canBuy(def.id)) return;
        self.handlers.onBuy(def.id);
        btn.classList.remove('flash');
        void btn.offsetWidth;
        btn.classList.add('flash');
      });

      self.rows[def.id] = {
        def: def, btn: btn,
        lvl: btn.querySelector('.up-lvl'),
        cost: btn.querySelector('.up-cost'),
        bar: btn.querySelector('.up-bar'),
        lastLevel: -1, lastAfford: null
      };
      frag.appendChild(btn);
    });

    this.el.upgrades.appendChild(frag);
  };

  /* ---------------- per-frame ---------------- */

  UI.prototype.update = function (dt) {
    var sim = this.sim;

    this.el.wave.textContent = 'WAVE ' + Math.max(1, sim.wave);
    this.el.wave.classList.toggle('boss', NS.wave.isBoss(sim.wave));
    this.el.waveSub.textContent = sim.over ? 'breached'
      : sim.inWave ? (sim.enemies.length + ' on the field')
      : 'next in ' + Math.max(0, sim.breakTime).toFixed(1) + 's';

    this.el.gold.textContent = fmt(sim.gold);
    this.el.relics.textContent = '◈ ' + fmt(this.meta.relics);

    if (this.goldPunch > 0.001) {
      this.goldPunch *= Math.pow(0.002, dt || 0.016);
      this.el.gold.style.transform = 'scale(' + (1 + this.goldPunch).toFixed(3) + ')';
    } else if (this.goldPunch !== 0) {
      this.goldPunch = 0;
      this.el.gold.style.transform = '';
    }

    var frac = clamp(sim.hp / sim.maxHp, 0, 1);
    this.el.hpBar.style.width = (frac * 100).toFixed(1) + '%';
    this.el.hpBar.className = 'hp-bar' + (frac < 0.3 ? ' critical' : frac < 0.6 ? ' hurt' : '');
    this.el.hpText.textContent = Math.ceil(sim.hp) + ' / ' + sim.maxHp;

    // overcharge
    var chargeFrac = sim.overcharge / sim.overchargeMax();
    this.el.chargeFill.style.width = (chargeFrac * 100).toFixed(1) + '%';
    var ready = sim.overchargeReady();
    if (ready !== this._chargeReady) {
      this._chargeReady = ready;
      this.el.charge.classList.toggle('ready', ready);
      this.el.charge.disabled = !ready;
      this.el.chargeLabel.textContent = ready ? 'OVERCHARGE — FIRE!' : 'OVERCHARGE';
    }

    // combo
    if (sim.combo >= 3) {
      this.el.combo.textContent = '×' + sim.comboMult().toFixed(1) + '  TAP COMBO';
      this.el.combo.className = 'combo on' + (sim.combo >= 12 ? ' hot' : '');
    } else {
      this.el.combo.className = 'combo';
    }

    // boss health
    var boss = null;
    for (var i = 0; i < sim.enemies.length; i++) {
      if (sim.enemies[i].boss) { boss = sim.enemies[i]; break; }
    }
    if (boss) {
      this.el.bossWrap.hidden = false;
      this.el.bossBar.style.width = (clamp(boss.hp / boss.maxHp, 0, 1) * 100).toFixed(1) + '%';
    } else {
      this.el.bossWrap.hidden = true;
    }

    this.el.callWave.classList.toggle('hot', !sim.inWave && !sim.over);

    for (var id in this.rows) {
      if (!this.rows.hasOwnProperty(id)) continue;
      var row = this.rows[id];
      var level = sim.level(id);
      var cost = sim.cost(id);
      var afford = sim.gold >= cost && !sim.over;

      if (level !== row.lastLevel) {
        row.lvl.textContent = 'LV ' + level;
        row.lastLevel = level;
      }
      row.cost.textContent = fmt(cost);
      if (afford !== row.lastAfford) {
        row.btn.disabled = !afford;
        row.lastAfford = afford;
      }
      row.bar.style.width = (Math.min(1, sim.gold / cost) * 100).toFixed(1) + '%';
    }
  };

  UI.prototype.bumpGold = function (strength) {
    this.goldPunch = Math.min(this.goldPunch + (strength || 0.06), 0.35);
  };

  UI.prototype.banner = function (text, boss) {
    var el = this.el.banner;
    el.textContent = text;
    el.className = 'banner';
    void el.offsetWidth;
    el.className = 'banner go' + (boss ? ' boss' : '');
  };

  /* ---------------- overlays ---------------- */

  UI.prototype.showGameOver = function (wave, gain, stats) {
    this.el.overSummary.innerHTML =
      '<div class="row"><span>Wave reached</span><span>' + wave + '</span></div>' +
      '<div class="row"><span>Enemies killed</span><span>' + stats.kills + '</span></div>' +
      '<div class="row"><span>Gold earned</span><span>' + fmt(stats.earned) + '</span></div>' +
      '<div class="row"><span>Best ever</span><span>wave ' + this.meta.bestWave + '</span></div>' +
      '<div class="big">◈ ' + gain + '</div>';
    this.el.over.hidden = false;
  };

  UI.prototype.openShop = function () {
    var self = this;
    var meta = this.meta;
    var list = this.el.shopList;

    this.el.shopRelics.innerHTML = '◈ ' + fmt(meta.relics) +
      '<div class="shop-next">best wave ' + meta.bestWave + ' · ' + meta.runs + ' runs · ' +
      fmt(meta.lifetime) + ' relics all-time</div>';

    list.innerHTML = '';
    NS.META.UPGRADES.forEach(function (def) {
      var lvl = meta.level(def.id);
      var maxed = meta.maxed(def.id);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-row';
      btn.disabled = !meta.canBuy(def.id);
      btn.innerHTML = '<span><span class="sn"></span><br><span class="sd"></span><br>' +
                      '<span class="sv"></span></span><span class="sc"></span>';
      btn.querySelector('.sn').textContent = def.name;
      btn.querySelector('.sd').textContent = def.desc;
      btn.querySelector('.sv').textContent = 'LV ' + lvl + ' · ' + def.format(lvl);
      btn.querySelector('.sc').textContent = maxed ? 'MAX' : '◈ ' + fmt(meta.cost(def.id));
      btn.addEventListener('click', function () {
        if (meta.buy(def.id)) {
          self.handlers.onMetaBuy();
          self.openShop();
        }
      });
      list.appendChild(btn);
    });

    this.el.shop.hidden = false;
  };

  NS.UI = UI;
})(window.SIEGE);
