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
  MAX_SPAWN_RATE: 40,       // safety valve so a very late-game spawn level cannot
                            // ask for thousands of kernels per second
  MAX_SPAWN_PER_STEP: 8,    // bounds the work done in a single simulation step

  /* ---- heat ---- */
  HEAT_JITTER: 0.25,        // per-kernel heat-rate variation (±25%), avoids lockstep
  SHOCK_SPEED: 1.5,         // shockwave expansion speed, pan units / second
  SHOCK_BAND: 0.06,         // ring thickness used for heat hit detection
  MAX_SHOCKWAVES: 70,

  /* ---- chains ----
   * The window tightens as the chain grows: a slow, metronomic tapper can hold
   * a chain of ~8, but only a real cascade (pops ~0.15s apart) can hold 50+.
   * That keeps CHAIN a measure of chain *reactions*, not of tapping stamina.
   */
  CHAIN_WINDOW: 0.6,        // window at chain 1
  CHAIN_WINDOW_MIN: 0.22,   // window a very long chain converges to
  CHAIN_WINDOW_DECAY: 18,   // chain length over which it decays
  CHAIN_BONUS: 0.5,         // money multiplier = 1 + CHAIN_BONUS * sqrt(chain).
                            // Sub-linear on purpose: huge chains stay exciting
                            // without the economy exploding.
  CHAIN_TIERS: [10, 25, 50, 100, 250, 500],

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
      baseCost: 15,
      costMult: 1.45,
      value: function (lvl) { return 0.45 * Math.pow(1.15, lvl); },
      format: function (v) { return v.toFixed(2) + ' kernels/s'; }
    },
    {
      id: 'heat',
      name: 'Heat Speed',
      baseCost: 22,
      costMult: 1.42,
      value: function (lvl) { return 0.033 * Math.pow(1.10, lvl); },
      format: function (v) { return (1 / v).toFixed(1) + 's to pop'; }
    },
    {
      id: 'shock',
      name: 'Shockwave',
      baseCost: 30,
      costMult: 1.46,
      value: function (lvl) { return 0.16 * Math.pow(1.11, lvl); },
      format: function (v) { return '+' + Math.round(v * 100) + '% heat'; }
    },
    {
      id: 'value',
      name: 'Pop Value',
      baseCost: 20,
      costMult: 1.45,
      value: function (lvl) { return 1 * Math.pow(1.18, lvl); },
      format: function (v) { return '$' + POPCORE.formatMoney(v, true); }
    }
  ],

  /* Shockwave radius grows with the shockwave upgrade but is capped so a single
   * pop can never trivially cover the whole pan too early. */
  shockRadius: function (lvl) {
    return Math.min(0.30 * Math.pow(1.06, lvl), 1.7);
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
