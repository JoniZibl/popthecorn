/* Hexodus – Oberfläche und Steuerung */
(function () {
  'use strict';

  var H = Hex, B = Board, U = Units, M = Moves, G = Game;
  function dirArrow(angle) {
    return '<svg class="dir-arrow" viewBox="-11 -11 22 22" aria-hidden="true">' +
      '<path d="M-7,-5 L7,0 L-7,5 L-4,0 Z" transform="rotate(' + angle.toFixed(1) + ')"/></svg>';
  }

  var state = null;
  var view = null;
  var ui = { mode: 'idle', trainType: null, markers: [], placeable: null, thinking: false };

  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- Startmenü ---------------- */

  function buildMenu() {
    var wrap = $('#player-fields');
    function render() {
      var count = +$('#player-count').value;
      var cfg = G.SETUP[count];
      var previous = [];
      for (var q = 0; q < 4; q++) {
        var sel = document.getElementById('pkind' + q);
        previous[q] = sel ? sel.value : (q === 0 ? 'mensch' : 'normal');
      }
      wrap.innerHTML = '';
      for (var i = 0; i < count; i++) {
        var c = G.COLORS[i];
        var row = document.createElement('label');
        row.className = 'player-field';
        row.innerHTML = '<span class="swatch" style="background:' + c.hex + '"></span>' +
          '<input type="text" id="pname' + i + '" value="Spieler ' + (i + 1) + '" maxlength="16">' +
          '<select id="pkind' + i + '" class="kind-select">' +
            '<option value="mensch">Mensch</option>' +
            '<option value="leicht">KI leicht</option>' +
            '<option value="normal">KI normal</option>' +
            '<option value="stark">KI stark</option>' +
          '</select>';
        wrap.appendChild(row);
        document.getElementById('pkind' + i).value = previous[i];
      }
      $('#setup-info').textContent =
        cfg.tiles + ' Plättchen (' + (cfg.tiles * 7) + ' Felder) · ' + cfg.trees + ' Bäume gesamt';
    }
    $('#player-count').addEventListener('change', render);
    render();

    $('#start-game').addEventListener('click', function () {
      var count = +$('#player-count').value;
      var names = [], kinds = [];
      for (var i = 0; i < count; i++) {
        names.push($('#pname' + i).value.trim() || ('Spieler ' + (i + 1)));
        var kind = $('#pkind' + i).value;
        kinds.push(kind === 'mensch' ? null : kind);
      }
      startGame(names, kinds);
    });
  }

  function startGame(names, kinds) {
    state = G.create(names, kinds);
    ui = { mode: 'idle', trainType: null, markers: [], placeable: null, thinking: false };
    $('#screen-menu').classList.add('hidden');
    $('#screen-game').classList.remove('hidden');
    if (!view) {
      view = Render.create($('#board'));
      attachBoardEvents();
    }
    Render.fit(view, state.board);
    refresh();
  }

  /* ---------------- Interaktion mit dem Brett ---------------- */

  function attachBoardEvents() {
    var svg = view.svg;
    var pointers = {};      // aktive Finger/Zeiger
    var drag = null;        // Verschieben mit einem Zeiger
    var pinch = null;       // Zoomen mit zwei Fingern
    var moved = false;

    function count() { return Object.keys(pointers).length; }

    function centerOf() {
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
               dist: Math.hypot(a.x - b.x, a.y - b.y) };
    }

    svg.addEventListener('pointerdown', function (e) {
      // Zielfeld schon hier merken: durch das Pointer-Capture landet das
      // pointerup-Event sonst auf dem SVG statt auf dem Hexfeld.
      var node = e.target.closest ? e.target.closest('[data-key]') : null;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId);

      if (count() === 1) {
        drag = {
          id: e.pointerId, x: e.clientX, y: e.clientY,
          vx: view.view.x, vy: view.view.y,
          key: node ? node.getAttribute('data-key') : null
        };
        moved = false;
      } else if (count() === 2) {
        // zweiter Finger: Verschieben abbrechen, Zoom beginnen
        drag = null;
        moved = true;
        var c = centerOf();
        pinch = { dist: c.dist || 1 };
      }
    });

    svg.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId].x = e.clientX;
      pointers[e.pointerId].y = e.clientY;

      if (pinch && count() === 2) {
        var c = centerOf();
        if (!c.dist) return;
        var rect = svg.getBoundingClientRect();
        Render.zoomBy(view, c.dist / pinch.dist, c.x - rect.left, c.y - rect.top);
        pinch.dist = c.dist;
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      view.view.x = drag.vx + dx;
      view.view.y = drag.vy + dy;
      Render.applyView(view);
    });

    function release(e) {
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      delete pointers[e.pointerId];
      if (count() < 2) pinch = null;

      var wasDrag = drag && drag.id === e.pointerId;
      var hit = wasDrag ? drag.key : null;
      if (wasDrag) drag = null;
      if (count() > 0 || !wasDrag || moved) return;
      if (hit) handleCellClick(hit);
      else deselect();
    }
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', function (e) {
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      delete pointers[e.pointerId];
      if (count() < 2) pinch = null;
      if (drag && drag.id === e.pointerId) drag = null;
    });

    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = svg.getBoundingClientRect();
      Render.zoomBy(view, e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    $('#zoom-in').addEventListener('click', function () { centreZoom(1.2); });
    $('#zoom-out').addEventListener('click', function () { centreZoom(1 / 1.2); });
    $('#zoom-fit').addEventListener('click', function () { Render.fit(view, state.board); });
  }

  function centreZoom(f) {
    var rect = view.svg.getBoundingClientRect();
    Render.zoomBy(view, f, rect.width / 2, rect.height / 2);
  }

  function handleCellClick(key) {
    if (ui.thinking || aiLevel()) return;      // die KI ist am Zug
    var cell = state.board.cells[key];
    if (!cell) return;

    if (state.phase === 'trees') {
      G.placeTree(state, cell.q, cell.r);
      return refresh();
    }
    if (state.phase === 'kings') {
      if (state.awaitWorker) G.placeWorker(state, cell.q, cell.r);
      else G.placeKing(state, cell.q, cell.r);
      return refresh();
    }
    if (state.phase !== 'play') return;
    if (state.pending) return; // erst Richtung bestätigen

    if (ui.mode === 'train') {
      if (G.train(state, ui.trainType, cell.q, cell.r)) {
        ui.mode = 'idle'; ui.trainType = null;
      }
      return refresh();
    }

    // Aktion auf einem markierten Feld ausführen
    if (state.selected) {
      var hit = ui.markers.filter(function (m) { return H.key(m.q, m.r) === key; });
      if (hit.length) {
        var action = hit[0];
        var from = state.board.cells[state.selected];
        G.perform(state, from, action);
        return refresh();
      }
    }

    if (cell.piece && cell.piece.owner === state.current) {
      state.selected = key;
      ui.mode = 'idle';
      return refresh();
    }
    deselect();
  }

  function deselect() {
    if (state && !state.pending) {
      state.selected = null;
      ui.mode = 'idle';
      ui.trainType = null;
      refresh();
    }
  }

  /* ---------------- Markierungen ---------------- */

  function computeMarkers() {
    ui.markers = [];
    ui.placeable = null;

    if (state.phase === 'trees') {
      ui.placeable = {};
      state.board.keys.forEach(function (k) {
        if (B.isFree(state.board.cells[k])) ui.placeable[k] = true;
      });
      return;
    }
    if (state.phase === 'kings') {
      ui.placeable = {};
      state.board.keys.forEach(function (k) {
        var cell = state.board.cells[k];
        if (state.awaitWorker) {
          if (!B.isFree(cell)) return;
          var next = H.neighbors(cell).some(function (nb) {
            var c = B.at(state.board, nb);
            return c && c.piece && c.piece.type === 'king' && c.piece.owner === state.current;
          });
          if (next) ui.placeable[k] = true;
        } else if (G.canPlaceKing(state, cell)) {
          ui.placeable[k] = true;
        }
      });
      return;
    }
    if (state.phase !== 'play') return;

    if (ui.mode === 'train' && ui.trainType) {
      M.trainingSpots(state.board, state.current).forEach(function (c) {
        ui.markers.push({ kind: 'train', q: c.q, r: c.r });
      });
      return;
    }
    if (state.selected && !state.pending) {
      var cell = state.board.cells[state.selected];
      ui.markers = G.actionsFor(state, cell);
    }
  }

  /* ---------------- Seitenleiste ---------------- */

  function renderPlayers() {
    var html = state.players.map(function (p) {
      var cls = 'player-card' + (p.index === state.current && state.phase !== 'over' ? ' is-current' : '') +
        (p.eliminated ? ' is-out' : '');
      var extra;
      if (state.phase === 'trees') extra = p.treesLeft + ' Bäume übrig';
      else if (p.eliminated) extra = 'ausgeschieden';
      else extra = G.pieceCount(state, p.index) + ' Figuren';
      var tag = p.ai ? ' <span class="ai-tag">KI ' + p.ai + '</span>' : '';
      return '<div class="' + cls + '" style="--pc:' + p.color + '">' +
        '<span class="swatch"></span>' +
        '<span class="pname">' + esc(p.name) + tag + '</span>' +
        '<span class="wood" title="Holz">\u{1F332} ' + p.wood + '</span>' +
        '<span class="meta">' + extra + '</span>' +
        '</div>';
    }).join('');
    $('#players').innerHTML = html;
  }

  // Kurztext auf dem Knopf: warum geht die Einheit gerade nicht?
  var BLOCK_TEXT = {
    'steht im Spiel': 'steht schon im Spiel',
    'schon ausgebildet': 'nur einmal pro Spiel',
    'zu wenig Holz': null   // Kosten bleiben sichtbar
  };

  function trainMenuHtml() {
    var spots = M.trainingSpots(state.board, state.current).length;
    var rows = U.TRAIN_ORDER.map(function (id) {
      var def = U.DEFS[id];
      var blocker = M.trainBlocker(state, state.current, id);
      var label = (blocker && BLOCK_TEXT[blocker]) || (def.cost + '× \u{1F332}');
      var disabled = blocker !== null || !spots;
      return '<button class="train-btn' + (ui.trainType === id ? ' is-active' : '') +
        (blocker === 'steht im Spiel' ? ' is-fielded' : '') + '"' +
        (disabled ? ' disabled' : '') + ' data-train="' + id + '" title="' + esc(def.short) + '">' +
        '<span class="tn">' + def.name + '</span>' +
        '<span class="tc">' + label + '</span>' +
        '</button>';
    }).join('');
    var note = !spots ? '<p class="hint warn">Kein freies Feld an deiner Einheiten-Kette.</p>' : '';
    return '<h3>Ausbilden</h3>' + note + '<div class="train-grid">' + rows + '</div>' +
      '<p class="hint small">Von jeder Figur darf nur eine im Spiel sein. Wird sie geschlagen, ' +
      'kannst du sie neu ausbilden – den Zenturio jedoch nur einmal pro Partie.</p>';
  }

  function selectedHtml() {
    if (!state.selected) return '';
    var cell = state.board.cells[state.selected];
    if (!cell || !cell.piece) return '';
    var def = U.DEFS[cell.piece.type];
    var html = '<h3>' + def.name + '</h3><p class="hint">' + esc(def.short) + '</p>';
    var wedge = cell.piece.type === 'springer';
    if (def.directional) {
      html += '<p class="hint">Richtung: <strong>' +
        (wedge ? H.wedgeName(cell.piece.facing) : H.DIR_NAMES[cell.piece.facing]) +
        '</strong></p>';
    }
    if (state.pending) {
      html += '<p class="hint accent">' + (state.pending.kind === 'trainFacing'
        ? 'Wähle die Richtung der neuen Einheit.'
        : 'Optional: neue Richtung wählen – oder Zug beenden.') + '</p>';
    } else if (def.directional) {
      html += '<p class="hint">Drehen kostet einen ganzen Zug.</p>';
    }
    if (def.directional) {
      html += '<div class="dir-grid' + (wedge ? ' is-wedge' : '') + '">' +
        [0, 1, 2, 3, 4, 5].map(function (d) {
          return '<button class="dir-btn' + (cell.piece.facing === d ? ' is-active' : '') +
            '" data-dir="' + d + '" title="' + (wedge ? H.wedgeName(d) : H.DIR_NAMES[d]) + '">' +
            dirArrow(wedge ? H.wedgeAngle(d) : H.dirAngle(d)) +
            '<span>' + (wedge ? H.wedgeShort(d) : H.DIR_SHORT[d]) + '</span></button>';
        }).join('') + '</div>';
    }
    if (state.pending) {
      html += '<button class="wide-btn" id="end-pending">Zug beenden</button>';
    }
    return html;
  }

  function renderPanel() {
    var panel = $('#action-panel');
    var banner = $('#phase-banner');
    var p = state.players[state.current];

    if (state.phase === 'trees') {
      banner.innerHTML = '<strong style="color:' + p.color + '">' + esc(p.name) + '</strong>' +
        ' setzt einen Baum · noch ' + p.treesLeft + ' übrig';
      if (p.ai) { panel.innerHTML = '<h3>Bäume platzieren</h3>' +
        '<p class="hint">' + esc(p.name) + ' (KI) verteilt seine Bäume.</p>'; return; }
      panel.innerHTML = '<h3>Bäume platzieren</h3>' +
        '<p class="hint">Jeder Spieler setzt reihum einen Baum auf ein freies Grasfeld. ' +
        'Bäume liefern später das Holz für neue Einheiten.</p>' +
        '<button class="wide-btn" id="auto-trees">Restliche Bäume zufällig setzen</button>';
      return;
    }

    if (state.phase === 'kings') {
      banner.innerHTML = '<strong style="color:' + p.color + '">' + esc(p.name) + '</strong> ' +
        (state.awaitWorker ? 'stellt den Arbeiter neben den Turm' : 'setzt den Königs-Turm');
      if (p.ai) { panel.innerHTML = '<h3>Türme &amp; Arbeiter</h3>' +
        '<p class="hint">' + esc(p.name) + ' (KI) sucht sich einen Platz.</p>'; return; }
      panel.innerHTML = '<h3>Türme &amp; Arbeiter</h3>' +
        '<p class="hint">' + (state.awaitWorker
          ? 'Der Arbeiter muss direkt neben dem eigenen Turm stehen.'
          : 'Wähle ein freies Feld mit Abstand zu den anderen Türmen. Der letzte Spieler, der seinen Turm setzt, beginnt.') +
        '</p>';
      return;
    }

    if (state.phase === 'over') {
      banner.innerHTML = state.winner !== null
        ? '<strong style="color:' + state.players[state.winner].color + '">' +
          esc(state.players[state.winner].name) + '</strong> gewinnt Hexodus!'
        : 'Das Spiel ist beendet.';
      var grund = state.endReason
        ? '<p class="hint">' + esc(state.endReason) + ' – gewertet wurde nach Vermögen: ' +
          'Holzvorrat plus das Holz, das in den Figuren steckt.</p>' +
          '<ul class="score-list">' + state.players.map(function (pl) {
            return '<li><span class="dot" style="background:' + pl.color + '"></span>' +
              esc(pl.name) + ': <strong>' + G.wealth(state, pl.index) + '</strong> Holz' +
              (pl.eliminated ? ' (ausgeschieden)' : '') + '</li>';
          }).join('') + '</ul>'
        : '<p class="hint">Der Königs-Turm ist gefallen.</p>';
      panel.innerHTML = '<h3>Spielende</h3>' + grund +
        '<button class="wide-btn" id="back-menu">Neues Spiel</button>';
      return;
    }

    // Spielphase
    banner.innerHTML = 'Runde ' + state.turn + ' · <strong style="color:' + p.color + '">' +
      esc(p.name) + '</strong> ist am Zug · \u{1F332} ' + p.wood;

    if (p.ai) {
      panel.innerHTML = '<h3>' + esc(p.name) + '</h3>' +
        '<p class="hint">Der Computergegner (' + p.ai + ') ist am Zug.</p>';
      return;
    }

    var html = '';
    var stuck = !state.pending && !M.hasAnyAction(state, state.current);
    if (stuck) {
      html += '<p class="hint warn">Keine Aktion möglich.</p>' +
        '<button class="wide-btn" id="pass-turn">Zug aussetzen</button>';
    }
    html += selectedHtml();
    if (!state.pending) html += trainMenuHtml();
    if (!state.selected && !state.pending) {
      html += '<p class="hint">Wähle eine eigene Figur, um ihre Züge zu sehen.</p>';
    }
    panel.innerHTML = html;
  }

  function renderLog() {
    $('#log-list').innerHTML = state.log.map(function (e) {
      var color = e.player !== null && e.player !== undefined ? state.players[e.player].color : '#8b98a8';
      return '<li><span class="dot" style="background:' + color + '"></span>' + esc(e.text) + '</li>';
    }).join('');
  }

  function bindPanel() {
    var panel = $('#action-panel');
    panel.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (ui.thinking && btn.id !== 'back-menu') return;
      if (btn.id === 'auto-trees') { G.autoPlaceTrees(state); return refresh(); }
      if (btn.id === 'back-menu') { return backToMenu(); }
      if (btn.id === 'pass-turn') { G.pass(state); return refresh(); }
      if (btn.id === 'end-pending') { G.endPending(state); return refresh(); }
      if (btn.dataset.train) {
        ui.trainType = (ui.trainType === btn.dataset.train) ? null : btn.dataset.train;
        ui.mode = ui.trainType ? 'train' : 'idle';
        state.selected = null;
        return refresh();
      }
      if (btn.dataset.dir && state.selected) {
        G.rotate(state, state.selected, +btn.dataset.dir);
        return refresh();
      }
    });
  }

  function backToMenu() {
    $('#screen-game').classList.add('hidden');
    $('#screen-menu').classList.remove('hidden');
  }

  function refresh() {
    computeMarkers();
    Render.draw(view, state, { markers: ui.markers, placeable: ui.placeable });
    renderPlayers();
    renderPanel();
    renderLog();
    scheduleAI();
  }

  /* ---------------- Computergegner ---------------- */

  function aiLevel() {
    if (!state || state.phase === 'over') return null;
    var p = state.players[state.current];
    return (p && !p.eliminated) ? p.ai : null;
  }

  /* Ist die KI am Zug, wird ihr Zug nach kurzer Pause ausgeführt – so bleibt
     die Oberfläche sichtbar und die Züge sind nachvollziehbar. */
  function scheduleAI() {
    if (ui.thinking || !aiLevel()) return;
    ui.thinking = true;
    var banner = $('#phase-banner');
    banner.innerHTML += ' <span class="thinking">· denkt nach …</span>';
    // Erst zeichnen lassen, dann rechnen
    setTimeout(function () {
      var level = aiLevel();
      if (!level) { ui.thinking = false; return refresh(); }
      var before = state.current, phase = state.phase;
      try {
        AI.step(state, level);
      } catch (err) {
        G.log(state, 'Die KI ist ins Straucheln geraten – sie setzt aus.', state.current);
        if (state.phase === 'play') G.pass(state);
        if (window.console) console.error(err);
      }
      if (state.phase === phase && state.current === before &&
          state.phase === 'play' && !state.pending) {
        G.pass(state);            // Notbremse gegen Endlosschleifen
      }
      ui.thinking = false;
      refresh();
    }, state.phase === 'play' ? 240 : 45);
  }

  /* ---------------- Regelwerk-Overlay ---------------- */

  function buildRules() {
    var cards = ['king'].concat(U.TRAIN_ORDER).concat(['boat']).map(function (id) {
      var def = U.DEFS[id];
      var cost = def.cost === null ? 'Startfigur'
        : Array(def.cost + 1).join('\u{1F332} ') + '(' + def.cost + '× Holz)';
      return '<article class="rule-card">' +
        '<header>' + Render.pieceIcon(id, '#3b82f6') +
        '<div class="rule-title"><h3>' + def.name + '</h3>' +
        '<span class="cost">' + cost + '</span></div></header>' +
        '<p>' + esc(def.text) + '</p>' +
        '<ul>' + def.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
        '</article>';
    }).join('');

    // Figuren-Übersicht auf dem Startbildschirm
    var strip = document.getElementById('unit-strip');
    if (strip) {
      strip.innerHTML = ['king'].concat(U.TRAIN_ORDER).concat(['boat']).map(function (id, i) {
        var def = U.DEFS[id];
        return '<figure class="unit-chip">' +
          Render.pieceIcon(id, G.COLORS[i % G.COLORS.length].hex) +
          '<figcaption><strong>' + def.name + '</strong>' +
          '<span>' + (def.cost === null ? 'Startfigur' : def.cost + '× Holz') +
          (def.object ? ' · Objekt' : '') + '</span>' +
          '</figcaption></figure>';
      }).join('');
    }
    $('#rule-cards').innerHTML = cards;

    $('#open-rules').addEventListener('click', function () { $('#rules').classList.remove('hidden'); });
    $('#close-rules').addEventListener('click', function () { $('#rules').classList.add('hidden'); });
    $('#rules').addEventListener('click', function (e) {
      if (e.target.id === 'rules') $('#rules').classList.add('hidden');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('#rules').classList.contains('hidden')) $('#rules').classList.add('hidden');
        else deselect();
      }
    });
  }

  // Kleiner Debug-Zugang (Konsole, automatisierte Tests)
  window.Hexodus = {
    get state() { return state; },
    refresh: function () { refresh(); },
    click: handleCellClick
  };

  window.addEventListener('DOMContentLoaded', function () {
    buildMenu();
    buildRules();
    bindPanel();
    $('#new-game').addEventListener('click', backToMenu);
    window.addEventListener('resize', function () {
      if (state && view && !$('#screen-game').classList.contains('hidden')) Render.applyView(view);
    });
  });
})();
