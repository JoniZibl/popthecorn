/**
 * POPCORE — localStorage persistence. Defensive: a corrupt or unavailable
 * store must never stop the game from starting.
 */
(function (NS) {
  'use strict';

  var KEY = 'popcore.save.v2';
  var LEGACY_KEY = 'popcore.save.v1';
  var SOUND_KEY = 'popcore.sound';

  NS.Save = {
    write: function (sim, meta) {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          v: 2,
          run: sim.toJSON(),
          meta: meta.toJSON(),
          at: Date.now(),
          rate: sim.moneyPerSecond()
        }));
      } catch (e) { /* private mode / quota — ignore */ }
    },

    read: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) {
          var data = JSON.parse(raw);
          if (data && data.v === 2) return data;
        }
        // A save from before the meta layer existed still carries a batch.
        var legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) return { v: 2, run: JSON.parse(legacy), meta: null, at: 0, rate: 0 };
        return null;
      } catch (e) {
        return null;
      }
    },

    clear: function () {
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(LEGACY_KEY);
      } catch (e) { /* ignore */ }
    },

    readSound: function () {
      try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; }
    },

    writeSound: function (on) {
      try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    }
  };
})(window.POPCORE);
