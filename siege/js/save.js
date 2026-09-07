/**
 * LAST KEEP — localStorage. Never lets a bad save stop the game starting.
 */
(function (NS) {
  'use strict';

  var KEY = 'lastkeep.save.v1';
  var SOUND_KEY = 'lastkeep.sound';

  NS.Save = {
    write: function (sim, meta) {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          v: 1, run: sim.toJSON(), meta: meta.toJSON(), at: Date.now()
        }));
      } catch (e) { /* private mode / quota */ }
    },

    read: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (!raw) return null;
        var data = JSON.parse(raw);
        return data && data.v === 1 ? data : null;
      } catch (e) { return null; }
    },

    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    },

    readSound: function () {
      try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; }
    },

    writeSound: function (on) {
      try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    }
  };
})(window.SIEGE);
