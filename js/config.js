/**
 * POPCORE — balance & tuning constants.
 *
 * Everything gameplay-facing lives here so the numbers can be tweaked without
 * touching simulation or rendering code.
 *
 * Simulation space is normalized: the pan is a circle of radius 1 centred on
 * (0, 0). The renderer maps that to pixels, so balance is resolution
 * independent.
 */
window.POPCORE = window.POPCORE || {};

POPCORE.CONFIG = {
  /* ---- world ---- */
  PAN_RADIUS: 1,
  SPAWN_RADIUS: 0.84,       // kernels spawn inside this, keeping clear of the rim
  KERNEL_RADIUS: 0.07,      // base kernel size in pan units
  MAX_KERNELS: 46,          // hard cap: keeps the pan readable and the sim cheap
  TAP_RADIUS: 0.11,         // forgiving touch radius (fat-finger friendly)
  MAX_SPAWN_RATE: 14,       // ceiling on kernels per second: past this the pan is
                            // an unreadable firehose rather than a game
  MAX_SPAWN_PER_STEP: 4,    // bounds the work done in a single simulation step
  EMPTY_REFILL_DELAY: 0.4,  // how long an empty pan may stay empty before one
                            // kernel is placed regardless of the spawn rate

  /* ---- heat ---- */
  HEAT_JITTER: 0.25,        // per-kernel heat-rate variation (±25%), avoids lockstep
  SHOCK_SPEED: 1.5,         // shockwave expansion speed, pan units / second
  SHOCK_BAND: 0.06,         // ring thickness used for heat hit detection
  MAX_SHOCKWAVES: 45,

  /* ---- chains ----
   * The window tightens as the chain grows: a slow, metronomic tapper can hold
   * a chain of ~10, but only a real cascade (pops ~0.15s apart) can hold 50+.
   * That keeps CHAIN a measure of chain *reactions*, not of tapping stamina.
   */
  CHAIN_WINDOW: 0.7,        // window at chain 1
  CHAIN_WINDOW_MIN: 0.24,   // window a very long chain converges to
  CHAIN_WINDOW_DECAY: 22,   // chain length over which it decays
  CHAIN_BONUS: 0.5,         // per-pop multiplier = 1 + CHAIN_BONUS * sqrt(chain)
  CHAIN_BONUS_CAP: 60,      // …but the chain counts as at most this for that
                            // multiplier. A self-sustaining pan holds a chain
                            // open indefinitely, so without a cap the "burst"
                            // bonus silently becomes a permanent 10x income
                            // multiplier and the economy runs away. Long chains
                            // are rewarded through the end-of-chain bonus
                            // instead, which is where a burst belongs.

  // Milestones are close together at the start so something lands every few
  // seconds, then spread out to keep the top end meaningful.
  CHAIN_MAX: 500,           // a chain this long banks itself: the counter always
                            // means something, and the cap is its own climax
  CHAIN_BONUS_MIN: 8,       // shortest chain that pays an end-of-chain bonus
  CHAIN_BONUS_FACTOR: 0.35, // bonus = popValue * chain * this
  CHAIN_TIERS: [8, 15, 25, 40, 60, 100, 150, 250, 400],
  TIER_WORDS: ['NICE', 'SWEET', 'WILD', 'CRAZY', 'INSANE',
               'UNREAL', 'GODLIKE', 'LEGENDARY', 'COSMIC'],

  /* ---- golden kernels ----
   * A jackpot target that shows up every ~half minute: worth a pile of money,
   * pops with its own callout, and gives the eye something to hunt for.
   */
  GOLDEN_CHANCE: 0.05,          // base odds that a new kernel is golden
  GOLDEN_PER_SPAWN_LEVEL: 0.002, // Spawn Rate keeps paying once the rate caps:
  GOLDEN_MAX_CHANCE: 0.16,       // it buys golden kernels instead
  GOLDEN_MULT: 18,

  /* ---- MEGA POP ----
   * A meter that fills with every pop. When it is full the player gets one
   * screen-clearing wave on demand — a goal that is always a few seconds away.
   */
  MEGA_MAX: 40,             // pops needed to fill the meter
  MEGA_HEAT: 3,             // enough to pop anything the wave touches
  MEGA_RADIUS: 2.3,

  /* ---- away earnings ----
   * Coming back should pay something, without making leaving the best move:
   * a fraction of the rate you left at, over a capped window.
   */
  OFFLINE_RATE: 0.3,
  OFFLINE_MAX_HOURS: 8,
  OFFLINE_MIN_SECONDS: 120,

  /* ---- misc ---- */
  RATE_WINDOW: 6,           // seconds of history behind the "$ / s" readout
  SAVE_INTERVAL: 5,         // seconds between autosaves
  MAX_DT: 0.05,             // clamp for a single simulation step (tab-switch safety)

  /* ---- upgrades ----
   * cost(level)  = baseCost * costMult^level   → exponential, endless progression
   * value(level) feeds the simulation directly.
   *
   * Every cost multiplier is deliberately larger than the matching value
   * multiplier: output per level grows ~1.13 * 1.18 while a level costs ~1.44
   * more, so each purchase takes a little longer than the last instead of the
   * economy running away.
   */
  UPGRADES: [
    {
      id: 'spawn',
      name: 'Spawn Rate',
      baseCost: 12,
      costMult: 1.50,
      value: function (lvl) { return 1.40 * Math.pow(1.15, lvl); },
      format: function (v, lvl) {
        var C = POPCORE.CONFIG;
        var rate = Math.min(v, C.MAX_SPAWN_RATE);
        var gold = Math.min(C.GOLDEN_CHANCE + lvl * C.GOLDEN_PER_SPAWN_LEVEL, C.GOLDEN_MAX_CHANCE);
        return rate.toFixed(2) + '/s · ' + Math.round(gold * 100) + '% gold';
      }
    },
    {
      id: 'heat',
      name: 'Heat Speed',
      baseCost: 14,
      costMult: 1.48,
      value: function (lvl) { return 0.055 * Math.pow(1.10, lvl); },
      format: function (v) { return (1 / v).toFixed(1) + 's to pop'; }
    },
    {
      id: 'shock',
      name: 'Shockwave',
      baseCost: 20,
      costMult: 1.50,
      value: function (lvl) { return 0.30 * Math.pow(1.11, lvl); },
      format: function (v) { return '+' + Math.round(v * 100) + '% heat'; }
    },
    {
      id: 'value',
      name: 'Pop Value',
      baseCost: 12,
      costMult: 1.52,
      value: function (lvl) { return 1 * Math.pow(1.22, lvl); },
      format: function (v) { return '$' + POPCORE.formatMoney(v, true); }
    }
  ],

  /* Shockwave radius grows with the shockwave upgrade but is capped so a single
   * pop can never trivially cover the whole pan too early. */
  shockRadius: function (lvl) {
    return Math.min(0.36 * Math.pow(1.06, lvl), 1.8);
  },

  /** Seconds a chain survives without a pop, at the given chain length. */
  chainWindow: function (chain) {
    var C = POPCORE.CONFIG;
    return C.CHAIN_WINDOW_MIN +
      (C.CHAIN_WINDOW - C.CHAIN_WINDOW_MIN) * Math.exp(-chain / C.CHAIN_WINDOW_DECAY);
  }
};

/* ---- shared helpers ---- */

POPCORE.SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Compact money formatting: 1234567 -> "1.23M". */
POPCORE.formatMoney = function (n, short) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) {
    if (short) return n < 10 ? n.toFixed(2) : n.toFixed(0);
    return n < 10 ? n.toFixed(1) : Math.floor(n).toString();
  }
  var tier = Math.floor(Math.log10(n) / 3);
  var suffix = POPCORE.SUFFIX[tier];
  if (!suffix) return n.toExponential(2);
  var scaled = n / Math.pow(1000, tier);
  return (scaled < 10 ? scaled.toFixed(2) : scaled < 100 ? scaled.toFixed(1) : scaled.toFixed(0)) + suffix;
};

POPCORE.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
POPCORE.lerp = function (a, b, t) { return a + (b - a) * t; };
POPCORE.rand = function (a, b) { return a + Math.random() * (b - a); };
