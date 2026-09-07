/**
 * POPCORE — mutation cards.
 *
 * Every batch drafts a random build: at rising pop counts the player is offered
 * three cards and keeps one. Cards stack for the rest of the batch, so no two
 * batches play the same way — one run is a slow-burn high-value pan, the next
 * is a wide-blast chain machine.
 *
 * Cards are pure data. Everything they do is expressed through the modifier
 * fields below, which the simulation multiplies into its own numbers, so a new
 * card needs no new simulation code:
 *
 *   popValue, spawnRate, heatRate, shockHeat, shockRadius,
 *   chainWindow, chainBonus, golden, goldenMult, megaCharge   — multipliers
 *   startHeat      — kernels spawn with this much heat already (0..1)
 *   doublePop      — chance a pop fires a second shockwave and pays twice
 *   chainRadius    — shockwave radius grows by this fraction per chain link
 *
 * `unlockAt` is lifetime butter: the pool keeps growing for months of play.
 */
(function (NS) {
  'use strict';

  NS.RARITY = {
    common:    { label: 'COMMON',    weight: 62, color: '#cfc6b6' },
    rare:      { label: 'RARE',      weight: 30, color: '#5fc9ff' },
    legendary: { label: 'LEGENDARY', weight: 8,  color: '#ff9b3d' }
  };

  NS.CARDS = [
    /* ---- starting pool ---- */
    { id: 'butter', name: 'Butter Coating', rarity: 'common', unlockAt: 0,
      desc: 'Pops pay +60%, kernels arrive 20% slower',
      mods: { popValue: 1.6, spawnRate: 0.8 } },

    { id: 'hotoil', name: 'Hot Oil', rarity: 'common', unlockAt: 0,
      desc: 'Kernels start at 20% heat',
      mods: { startHeat: 0.2 } },

    { id: 'tightpan', name: 'Tight Pan', rarity: 'common', unlockAt: 0,
      desc: '+50% kernels, shockwaves 15% smaller',
      mods: { spawnRate: 1.5, shockRadius: 0.85 } },

    { id: 'slowburn', name: 'Slow Burn', rarity: 'common', unlockAt: 0,
      desc: 'Heat 30% slower, pops pay double',
      mods: { heatRate: 0.7, popValue: 2 } },

    { id: 'wideblast', name: 'Wide Blast', rarity: 'common', unlockAt: 0,
      desc: 'Shockwaves reach 30% further',
      mods: { shockRadius: 1.3 } },

    { id: 'deepheat', name: 'Deep Heat', rarity: 'common', unlockAt: 0,
      desc: 'Shockwaves carry 35% more heat',
      mods: { shockHeat: 1.35 } },

    { id: 'sticky', name: 'Sticky Combo', rarity: 'common', unlockAt: 0,
      desc: 'Chains survive 35% longer',
      mods: { chainWindow: 1.35 } },

    { id: 'salty', name: 'Salted', rarity: 'common', unlockAt: 0,
      desc: 'Chain bonuses pay +50%',
      mods: { chainBonus: 1.5 } },

    { id: 'goldrush', name: 'Gold Rush', rarity: 'rare', unlockAt: 0,
      desc: 'Golden kernels 2.5× as often',
      mods: { golden: 2.5 } },

    /* ---- unlocked by playing ---- */
    { id: 'double', name: 'Double Feature', rarity: 'rare', unlockAt: 15,
      desc: '12% of pops fire twice',
      mods: { doublePop: 0.12 } },

    { id: 'kettle', name: 'Kettle Corn', rarity: 'rare', unlockAt: 35,
      desc: 'MEGA POP charges twice as fast',
      mods: { megaCharge: 2 } },

    { id: 'reactor', name: 'Chain Reactor', rarity: 'rare', unlockAt: 120,
      desc: 'Each chain link widens the next shockwave',
      mods: { chainRadius: 0.014 } },

    { id: 'caramel', name: 'Caramel Bath', rarity: 'rare', unlockAt: 70,
      desc: 'Chain bonuses pay 2.2×, chains end 15% sooner',
      mods: { chainBonus: 2.2, chainWindow: 0.85 } },

    { id: 'airpopper', name: 'Air Popper', rarity: 'rare', unlockAt: 190,
      desc: 'Double the kernels, pops pay 30% less',
      mods: { spawnRate: 2, popValue: 0.7 } },

    { id: 'nuclear', name: 'Nuclear Kernel', rarity: 'legendary', unlockAt: 290,
      desc: 'Shockwaves: double heat, +50% reach. 30% fewer kernels',
      mods: { shockHeat: 2, shockRadius: 1.5, spawnRate: 0.7 } },

    { id: 'midas', name: 'Midas Corn', rarity: 'legendary', unlockAt: 430,
      desc: 'Golden kernels 4× as often and worth 50% more',
      mods: { golden: 4, goldenMult: 1.5 } },

    { id: 'perpetual', name: 'Perpetual Motion', rarity: 'legendary', unlockAt: 620,
      desc: '20% of pops fire twice, chains survive 20% longer',
      mods: { doublePop: 0.2, chainWindow: 1.2 } },

    { id: 'storm', name: 'Butter Storm', rarity: 'legendary', unlockAt: 880,
      desc: 'Pops pay 3×, heat builds 40% slower',
      mods: { popValue: 3, heatRate: 0.6 } },

    /* ---- the long tail ---- */
    { id: 'popping', name: 'Popping Corn', rarity: 'rare', unlockAt: 1200,
      desc: 'Chains survive 50% longer, pops pay 15% less',
      mods: { chainWindow: 1.5, popValue: 0.85 } },

    { id: 'slick', name: 'Oil Slick', rarity: 'rare', unlockAt: 1700,
      desc: 'Shockwaves reach 80% further but carry 25% less heat',
      mods: { shockRadius: 1.8, shockHeat: 0.75 } },

    { id: 'jumbo', name: 'Jumbo Kernels', rarity: 'legendary', unlockAt: 2400,
      desc: 'Pops pay 2.5×, kernels arrive 45% slower',
      mods: { popValue: 2.5, spawnRate: 0.55 } },

    { id: 'static', name: 'Static Charge', rarity: 'legendary', unlockAt: 3300,
      desc: 'Shockwaves widen sharply as the chain climbs',
      mods: { chainRadius: 0.03 } },

    { id: 'goldenage', name: 'Golden Age', rarity: 'legendary', unlockAt: 4500,
      desc: 'Golden kernels 3× as often and worth double, pops pay 20% less',
      mods: { golden: 3, goldenMult: 2, popValue: 0.8 } },

    { id: 'chaos', name: 'Chaos Theory', rarity: 'legendary', unlockAt: 6000,
      desc: '30% of pops fire twice, chains end 10% sooner',
      mods: { doublePop: 0.3, chainWindow: 0.9 } }
  ];

  /** Lifetime butter at which the next locked card opens up, or null. */
  NS.nextUnlock = function (lifetimeButter) {
    var best = null;
    for (var i = 0; i < NS.CARDS.length; i++) {
      var at = NS.CARDS[i].unlockAt;
      if (at > lifetimeButter && (best === null || at < best)) best = at;
    }
    return best;
  };

  NS.cardById = function (id) {
    for (var i = 0; i < NS.CARDS.length; i++) {
      if (NS.CARDS[i].id === id) return NS.CARDS[i];
    }
    return null;
  };

  /** Cards whose unlock threshold the player's lifetime butter has passed. */
  NS.unlockedCards = function (lifetimeButter) {
    return NS.CARDS.filter(function (c) { return lifetimeButter >= c.unlockAt; });
  };

  /**
   * Draw `count` distinct cards, weighted by rarity. `luck` shifts the roll
   * toward the good stuff (the Rare Blend meta upgrade).
   */
  NS.drawCards = function (count, lifetimeButter, luck, exclude) {
    var pool = NS.unlockedCards(lifetimeButter).filter(function (c) {
      return !exclude || exclude.indexOf(c.id) === -1;
    });
    // Falling back to the full unlocked pool beats offering nothing once the
    // player has drafted most of it in a single very long batch.
    if (pool.length < count) pool = NS.unlockedCards(lifetimeButter);

    var picks = [];
    var available = pool.slice();

    while (picks.length < count && available.length) {
      var total = 0, i;
      for (i = 0; i < available.length; i++) total += weightOf(available[i], luck);

      var roll = Math.random() * total;
      var chosen = available.length - 1;
      for (i = 0; i < available.length; i++) {
        roll -= weightOf(available[i], luck);
        if (roll <= 0) { chosen = i; break; }
      }
      picks.push(available[chosen]);
      available.splice(chosen, 1);
    }
    return picks;
  };

  function weightOf(card, luck) {
    var w = NS.RARITY[card.rarity].weight;
    if (card.rarity === 'rare') w *= 1 + (luck || 0) * 0.5;
    if (card.rarity === 'legendary') w *= 1 + (luck || 0);
    return w;
  }

  /** Pop count at which the nth draft (0-based) is offered. */
  NS.draftAt = function (n) {
    return Math.round(30 * Math.pow(1.42, n));
  };
})(window.POPCORE);
