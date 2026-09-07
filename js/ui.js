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

  function UI(sim, meta, handlers) {
    this.sim = sim;
    this.meta = meta;
    this.onBuy = handlers.onBuy;
    this.onPickCard = handlers.onPickCard;
    this.onCashOut = handlers.onCashOut;

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
      upgrades: document.getElementById('upgrades'),

      butter: document.getElementById('butter'),
      deckBtn: document.getElementById('deckBtn'),
      deckSub: document.getElementById('deckSub'),
      cashBtn: document.getElementById('cashBtn'),
      cashSub: document.getElementById('cashSub'),

      draft: document.getElementById('draft'),
      draftCards: document.getElementById('draftCards'),
      deck: document.getElementById('deck'),
      deckList: document.getElementById('deckList'),
      shop: document.getElementById('shop'),
      shopButter: document.getElementById('shopButter'),
      shopList: document.getElementById('shopList'),
      cashout: document.getElementById('cashout'),
      cashSummary: document.getElementById('cashSummary'),
      cashConfirm: document.getElementById('cashConfirm'),
      welcome: document.getElementById('welcome'),
      welcomeSummary: document.getElementById('welcomeSummary'),
      welcomeClaim: document.getElementById('welcomeClaim')
    };

    this.rows = {};
    this._lastMoney = -1;
    this._chainShown = 0;
    this._hintHidden = false;
    this._megaReady = null;
    this.moneyPunch = 0;      // decays each frame; drives the counter's scale

    this.buildUpgrades();
    this.bindPanels();
  }

  /* ---------------- panels ---------------- */

  UI.prototype.bindPanels = function () {
    var self = this;

    // Any button carrying data-close dismisses its overlay.
    var closers = document.querySelectorAll('[data-close]');
    for (var i = 0; i < closers.length; i++) {
      closers[i].addEventListener('click', function () {
        document.getElementById(this.getAttribute('data-close')).hidden = true;
      });
    }

    this.el.deckBtn.addEventListener('click', function () { self.openDeck(); });
    this.el.cashBtn.addEventListener('click', function () { self.openCashOut(); });
    this.el.cashConfirm.addEventListener('click', function () {
      self.el.cashout.hidden = true;
      self.onCashOut();
    });
  };

  UI.prototype.anyPanelOpen = function () {
    return !this.el.draft.hidden || !this.el.deck.hidden ||
           !this.el.shop.hidden || !this.el.cashout.hidden || !this.el.welcome.hidden;
  };

  /** The draft: three (or more) cards, one choice, game paused behind it. */
  UI.prototype.openDraft = function (cards) {
    var self = this;
    var list = this.el.draftCards;
    list.innerHTML = '';

    cards.forEach(function (card) {
      var rarity = NS.RARITY[card.rarity];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card ' + card.rarity;
      btn.style.setProperty('--rarity', rarity.color);
      btn.innerHTML = '<span class="card-rarity"></span>' +
                      '<span class="card-name"></span>' +
                      '<span class="card-desc"></span>';
      btn.querySelector('.card-rarity').textContent = rarity.label;
      btn.querySelector('.card-name').textContent = card.name;
      btn.querySelector('.card-desc').textContent = card.desc;
      btn.addEventListener('click', function () {
        self.el.draft.hidden = true;
        self.onPickCard(card.id);
      });
      list.appendChild(btn);
    });

    this.el.draft.hidden = false;
  };

  UI.prototype.openDeck = function () {
    var list = this.el.deckList;
    list.innerHTML = '';

    if (!this.sim.cards.length) {
      var empty = document.createElement('div');
      empty.className = 'deck-empty';
      empty.textContent = 'No mutations yet — keep popping, the first card is close.';
      list.appendChild(empty);
    } else {
      this.sim.cards.forEach(function (id) {
        var card = NS.cardById(id);
        if (!card) return;
        var row = document.createElement('div');
        row.className = 'deck-row';
        row.style.setProperty('--rarity', NS.RARITY[card.rarity].color);
        row.innerHTML = '<span class="n"></span><span class="d"></span>';
        row.querySelector('.n').textContent = card.name;
        row.querySelector('.d').textContent = card.desc;
        list.appendChild(row);
      });
    }
    this.el.deck.hidden = false;
  };

  UI.prototype.openShop = function () {
    var self = this;
    var meta = this.meta;
    var list = this.el.shopList;

    // The next locked card is the long-term carrot — always name it.
    var next = NS.nextUnlock(meta.lifetimeButter);
    this.el.shopButter.innerHTML = '🧈 ' + fmt(meta.butter) +
      '<div class="shop-next">' +
      (next === null
        ? 'every mutation unlocked · ' + fmt(meta.lifetimeButter) + ' butter earned all-time'
        : 'next mutation unlocks at 🧈 ' + fmt(next) + ' all-time (' +
          fmt(meta.lifetimeButter) + ' so far)') +
      '</div>';
    list.innerHTML = '';

    NS.META.UPGRADES.forEach(function (def) {
      var lvl = meta.level(def.id);
      var maxed = meta.maxed(def.id);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-row';
      btn.disabled = !meta.canBuy(def.id);
      btn.innerHTML = '<span><span class="sn"></span><br><span class="sd"></span>' +
                      '<br><span class="sv"></span></span><span class="sc"></span>';
      btn.querySelector('.sn').textContent = def.name;
      btn.querySelector('.sd').textContent = def.desc;
      btn.querySelector('.sv').textContent = 'LV ' + lvl + ' · ' + def.format(lvl);
      btn.querySelector('.sc').textContent = maxed ? 'MAX' : '🧈 ' + fmt(meta.cost(def.id));
      btn.addEventListener('click', function () {
        if (meta.buy(def.id)) self.openShop();     // rebuild with new prices
      });
      list.appendChild(btn);
    });

    this.el.shop.hidden = false;
  };

  UI.prototype.openCashOut = function () {
    var sim = this.sim, meta = this.meta;
    var gain = meta.butterFor(sim.earned);
    var ok = gain >= NS.META.MIN_CASHOUT;

    this.el.cashSummary.innerHTML =
      '<div class="row"><span>Earned this batch</span><span>$' + fmt(sim.earned) + '</span></div>' +
      '<div class="row"><span>Pops</span><span>' + sim.runPops + '</span></div>' +
      '<div class="row"><span>Mutations</span><span>' + sim.cards.length + '</span></div>' +
      '<div class="big">🧈 ' + fmt(gain) + '</div>' +
      '<div class="row"><span>Next butter at</span><span>$' +
        fmt(sim.earned + meta.nextButterAt(sim.earned)) + '</span></div>';

    this.el.cashConfirm.disabled = !ok;
    this.el.cashConfirm.textContent = ok ? 'POP THE BATCH' : 'NOT WORTH IT YET';
    this.el.cashout.hidden = false;
  };

  /** Shown once on return when the pan ran while the player was away. */
  UI.prototype.openWelcome = function (seconds, amount, onClaim) {
    var self = this;
    var hours = Math.floor(seconds / 3600);
    var mins = Math.floor((seconds % 3600) / 60);
    var away = hours ? hours + 'h ' + mins + 'm' : mins + 'm';

    this.el.welcomeSummary.innerHTML =
      '<div class="row"><span>Away for</span><span>' + away + '</span></div>' +
      '<div class="big">+$' + fmt(amount) + '</div>' +
      '<div class="row"><span>Idle rate</span><span>30% of your pace</span></div>';

    this.el.welcome.hidden = false;
    this.el.welcomeClaim.onclick = function () {
      self.el.welcome.hidden = true;
      onClaim();
    };
  };

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

    this.el.butter.textContent = '🧈 ' + fmt(this.meta.butter);

    var toDraft = Math.max(0, sim.nextDraftAt() - sim.runPops);
    this.el.deckSub.textContent = sim.cards.length +
      ' card' + (sim.cards.length === 1 ? '' : 's') + ' · next in ' + toDraft;

    var gain = this.meta.butterFor(sim.earned);
    this.el.cashSub.textContent = '🧈 ' + fmt(gain);
    this.el.cashBtn.classList.toggle('ready', gain >= NS.META.MIN_CASHOUT);
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
