/**
 * POPCORE — localStorage persistence. Defensive: a corrupt or unavailable
 * store must never stop the game from starting.
 */
(function (NS) {
  'use strict';

  var KEY = 'popcore.save.v1';
  var SOUND_KEY = 'popcore.sound';

  NS.Save = {
    write: function (sim) {
      try {
        localStorage.setItem(KEY, JSON.stringify(sim.toJSON()));
      } catch (e) { /* private mode / quota — ignore */ }
    },

    read: function () {
      try {
        var raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
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
})(window.POPCORE);
