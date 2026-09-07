/**
 * LAST KEEP — balance, enemy types, tower types, wave composition.
 *
 * All of it is data. The simulation reads these tables and never hard-codes a
 * unit, so a new enemy or tower is an entry here plus (at most) a shape in the
 * renderer.
 *
 * The field is normalised: x and y both run 0..1, enemies enter at the top
 * (y < 0) and walk down. The castle wall sits at CASTLE_Y. The renderer maps
 * that square to whatever the screen gives it, so balance is resolution-free.
 */
window.SIEGE = window.SIEGE || {};

SIEGE.CONFIG = {
  /* ---- field ---- */
  SPAWN_Y: -0.06,
  CASTLE_Y: 0.93,
  MAX_ENEMIES: 90,
  MAX_PROJECTILES: 160,

  /* ---- castle ---- */
  CASTLE_HP: 100,

  /* ---- tapping ----
   * Tapping is not a garnish: the combo multiplier and the overcharge meter
   * are what make a boss survivable, so an engaged player clears waves a
   * passive one cannot.
   */
  TAP_RADIUS: 0.08,
  COMBO_WINDOW: 1.1,        // seconds before a tap streak lapses
  COMBO_STEP: 0.14,         // damage multiplier gained per streak hit
  COMBO_MAX: 24,
  BOSS_TAP_BONUS: 3,        // taps hit bosses this much harder

  OVERCHARGE_MAX: 55,       // taps to fill the meter
  OVERCHARGE_DAMAGE: 35,    // × tap damage, dealt to everything on the field

  /* ---- waves ---- */
  WAVE_BREAK: 4,            // seconds between waves
  EARLY_CALL_BONUS: 0.3,    // bonus gold for calling the next wave early
  BOSS_EVERY: 10,
  WAVE_CLEAR_GOLD: 8,       // base bounty for clearing a wave

  /* The squeeze that ends every run.
   *
   * What decides a wave is not its total health but whether one enemy can be
   * killed during its walk to the wall. So the numbers are set against DPS,
   * not against wave size:
   *
   *   player DPS grows  ≈ (gold income growth) ^ (ln 1.27 / ln 1.5) ≈ g^0.59
   *   income growth     = BUDGET_GROWTH * GOLD_GROWTH ≈ 1.21  → DPS ≈ 1.12/wave
   *   enemy health      = HP_GROWTH                            = 1.16/wave
   *
   * That leaves enemies gaining ~3.6% on the player every wave. A first run
   * opens with roughly double the damage it needs, so the gap closes around
   * wave 20-25 — and every relic spent widens it again.
   *
   * Waves stay short by growing in strength rather than in headcount. */
  HP_GROWTH: 1.16,
  SPEED_GROWTH: 1.008,
  GOLD_GROWTH: 1.13,
  BUDGET_GROWTH: 1.07,
  BUDGET_BASE: 5,

  /* ---- misc ---- */
  MAX_DT: 0.05,
  SAVE_INTERVAL: 5
};

/* ---------------- enemies ---------------- */

SIEGE.ENEMIES = {
  grunt: {
    name: 'Grunt', hp: 12, speed: 0.07, gold: 3, damage: 5, armor: 0,
    size: 0.021, color: '#7ec8ff', cost: 1, from: 1
  },
  runner: {
    name: 'Runner', hp: 7, speed: 0.14, gold: 3, damage: 4, armor: 0,
    size: 0.017, color: '#8bf5a0', cost: 1.1, from: 3
  },
  swarm: {
    name: 'Swarm', hp: 4, speed: 0.1, gold: 1, damage: 2, armor: 0,
    size: 0.012, color: '#ffe08a', cost: 0.4, from: 5, group: 5
  },
  tank: {
    name: 'Tank', hp: 58, speed: 0.045, gold: 11, damage: 15, armor: 3,
    size: 0.033, color: '#ff9b6b', cost: 3.2, from: 7
  },
  phantom: {
    // Untouchable by towers half the time: the enemy that forces the player to
    // put a finger on the screen.
    name: 'Phantom', hp: 24, speed: 0.08, gold: 10, damage: 9, armor: 0,
    size: 0.024, color: '#c9a0ff', cost: 2.8, from: 12,
    phase: true, phaseOn: 2.2, phaseOff: 1.6
  },
  brute: {
    name: 'Brute', hp: 130, speed: 0.04, gold: 22, damage: 25, armor: 6,
    size: 0.042, color: '#ff7070', cost: 6, from: 18
  },
  boss: {
    name: 'BOSS', hp: 520, speed: 0.035, gold: 90, damage: 45, armor: 5,
    size: 0.058, color: '#ff4d6d', boss: true
  }
};

/* ---------------- towers ---------------- */

/* Four emplacements, always present, upgraded with gold. No placement puzzle:
 * the taps belong to the fighting. */
SIEGE.TOWERS = [
  {
    id: 'cannon', name: 'Cannon', kind: 'single',
    x: 0.5, y: 0.78, color: '#ffb347',
    desc: 'Single target, steady damage',
    baseCost: 20, costMult: 1.5,
    damage: function (l) { return 7 * Math.pow(1.27, l); },
    rate: function (l) { return Math.min(1.1 + l * 0.035, 3.2); },
    range: function (l) { return Math.min(0.38 + l * 0.006, 0.62); }
  },
  {
    id: 'frost', name: 'Frost', kind: 'slow',
    x: 0.15, y: 0.68, color: '#7fdfff',
    desc: 'Chills everything it hits',
    baseCost: 30, costMult: 1.52,
    damage: function (l) { return 3 * Math.pow(1.22, l); },
    rate: function (l) { return Math.min(0.8 + l * 0.03, 2.4); },
    range: function (l) { return Math.min(0.34 + l * 0.007, 0.6); },
    slow: function (l) { return Math.min(0.35 + l * 0.015, 0.75); },
    slowTime: 1.6
  },
  {
    id: 'mortar', name: 'Mortar', kind: 'splash',
    x: 0.85, y: 0.68, color: '#ff8f6b',
    desc: 'Slow shells, wide blast',
    baseCost: 45, costMult: 1.55,
    damage: function (l) { return 14 * Math.pow(1.29, l); },
    rate: function (l) { return Math.min(0.42 + l * 0.012, 1.3); },
    range: function (l) { return Math.min(0.55 + l * 0.006, 0.85); },
    splash: function (l) { return 0.09 + l * 0.002; }
  },
  {
    id: 'tesla', name: 'Tesla', kind: 'chain',
    x: 0.5, y: 0.56, color: '#c9a0ff',
    desc: 'Arcs between nearby enemies',
    baseCost: 60, costMult: 1.56,
    damage: function (l) { return 5 * Math.pow(1.25, l); },
    rate: function (l) { return Math.min(1.4 + l * 0.04, 3.6); },
    range: function (l) { return Math.min(0.3 + l * 0.006, 0.55); },
    chains: function (l) { return 2 + Math.floor(l / 4); },
    chainRange: 0.16
  }
];

/* The player's own attack is upgraded like a tower. */
SIEGE.TAP_UPGRADE = {
  id: 'tap', name: 'Your Hand',
  desc: 'Damage per tap',
  baseCost: 15, costMult: 1.48,
  damage: function (l) { return 5 * Math.pow(1.32, l); }
};

/* ---------------- waves ---------------- */

SIEGE.wave = {
  /** Points available to spend on enemies in this wave. */
  budget: function (n) {
    var C = SIEGE.CONFIG;
    return C.BUDGET_BASE * Math.pow(C.BUDGET_GROWTH, n - 1);
  },

  isBoss: function (n) { return n % SIEGE.CONFIG.BOSS_EVERY === 0; },

  /** Multipliers applied to every enemy in wave n. */
  scale: function (n) {
    var C = SIEGE.CONFIG;
    return {
      hp: Math.pow(C.HP_GROWTH, n - 1),
      speed: Math.pow(C.SPEED_GROWTH, n - 1),
      gold: Math.pow(C.GOLD_GROWTH, n - 1)
    };
  },

  /**
   * Build the spawn list for a wave: a series of {type, at} entries, where
   * `at` is seconds after the wave starts.
   */
  build: function (n) {
    var C = SIEGE.CONFIG;
    var spawns = [];
    var boss = SIEGE.wave.isBoss(n);
    var budget = SIEGE.wave.budget(n) * (boss ? 0.55 : 1);

    var available = [];
    for (var id in SIEGE.ENEMIES) {
      if (!SIEGE.ENEMIES.hasOwnProperty(id)) continue;
      var def = SIEGE.ENEMIES[id];
      if (def.boss || n < def.from) continue;
      available.push(id);
    }

    // Later waves come in tighter, so the field fills up rather than trickling.
    var interval = Math.max(0.25, 0.8 - n * 0.01);
    var t = 0;
    var guard = 0;

    while (budget > 0 && guard++ < 400) {
      var id = available[Math.floor(Math.random() * available.length)];
      var e = SIEGE.ENEMIES[id];
      if (e.cost > budget && guard > 3) break;

      var count = e.group || 1;
      for (var i = 0; i < count; i++) {
        spawns.push({ type: id, at: t + i * 0.12 });
      }
      budget -= e.cost;
      t += interval * (e.group ? 1.4 : 1);
    }

    if (boss) {
      // The boss walks in after its escort, so the player meets it with a
      // half-clear field and a charged overcharge meter.
      spawns.push({ type: 'boss', at: t + 1.5 });
    }

    spawns.sort(function (a, b) { return a.at - b.at; });
    return spawns;
  }
};

/* ---------------- helpers ---------------- */

SIEGE.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
SIEGE.rand = function (a, b) { return a + Math.random() * (b - a); };
SIEGE.lerp = function (a, b, t) { return a + (b - a) * t; };

SIEGE.SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];

SIEGE.fmt = function (n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.floor(n).toString();
  var tier = Math.floor(Math.log10(n) / 3);
  var suffix = SIEGE.SUFFIX[tier];
  if (!suffix) return n.toExponential(2);
  var scaled = n / Math.pow(1000, tier);
  return (scaled < 10 ? scaled.toFixed(2) : scaled < 100 ? scaled.toFixed(1) : scaled.toFixed(0)) + suffix;
};
