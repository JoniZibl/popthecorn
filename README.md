# POPCORE

A mobile-first browser prototype of an idle popcorn game. Tap a kernel, it pops.
The pop throws a shockwave that heats nearby kernels, which pop, which throw
their own shockwaves — and once the upgrades line up, the pan runs itself.

No build step, no dependencies, no backend. Open `index.html` in a browser, or
serve the folder:

```sh
npx http-server -p 8080 .   # then open http://localhost:8080
```

## How it plays

- Kernels spawn in the pan and slowly gain heat from 0–100%. At 100% they pop
  on their own; a tap pops one instantly.
- Every pop emits an expanding shockwave. Kernels the ring crosses take heat,
  scaled down with distance, and pop if that pushes them over 100%.
- Pops in quick succession build a **CHAIN**, which multiplies the money each
  pop pays out. The chain window tightens as the chain grows, so a big chain has
  to come from a real cascade, not from steady tapping. Every chain of 8+ banks
  a bonus when it ends, and a chain that reaches `CHAIN_MAX` banks itself for
  triple — so a self-running pan pays a jackpot on a loop instead of counting
  toward infinity.
- **Golden kernels** are worth `GOLDEN_MULT` times a normal pop and arrive every
  half minute or so. Spawn Rate levels raise their odds, which is what that
  upgrade keeps buying once the raw spawn rate hits its ceiling.
- **MEGA POP** fills one notch per pop. Full, it fires a pan-wide wave that pops
  everything it touches — an always-nearby goal, and a guaranteed cascade.
- Four upgrades, all exponentially priced: **Spawn Rate**, **Heat Speed**,
  **Shockwave**, **Pop Value**. Cost growth is deliberately faster than value
  growth, so progression keeps going without the economy running away.
- Progress (money, levels, totals) is saved to `localStorage` every few seconds
  and on tab hide.

## Layout

| File | Role |
| --- | --- |
| `index.html` | Single page: HUD, canvas stage, upgrade grid |
| `css/style.css` | Layout and DOM-side effects (chain banner, upgrade buttons) |
| `js/config.js` | All balance numbers and shared helpers |
| `js/sim.js` | Simulation only: kernels, heat, shockwaves, chains, money |
| `js/fx.js` | Visual-only state: popcorn, particles, floating money, shake, flash |
| `js/render.js` | Canvas renderer for the simulation + effects |
| `js/ui.js` | DOM: money readout, chain banner, upgrade buttons |
| `js/audio.js` | Small WebAudio synth (pops pitch up with the chain) |
| `js/save.js` | localStorage read/write |
| `js/main.js` | Bootstrap, input, fixed-timestep loop, event dispatch |

The simulation is deliberately isolated: it knows nothing about canvas, DOM or
audio, and reports what happened through an event queue (`sim.events`) that the
presentation layers drain once per frame. It runs headless, which is how the
balance was tuned — you can `require()` `config.js` and `sim.js` in Node and
fast-forward a session.

Simulation space is normalised: the pan is a unit circle centred on the origin,
and the renderer maps it to pixels, so balance is resolution-independent.

## Tuning

Everything gameplay-facing lives in `js/config.js` — spawn rates, heat rates,
shockwave strength and radius, chain windows and bonuses, upgrade costs and
caps. `POPCORE.game` is exposed on `window` for poking at a live session from
the console (`POPCORE.game.sim.money = 1e6`).

## Performance

Visible objects are capped (kernels, popcorn, particles, floating numbers,
shockwaves), popcorn and glows are stamped from pre-rendered sprites rather than
per-frame gradients, and the simulation runs on a fixed timestep with a
catch-up limit. Spawning is bounded per step and by `MAX_SPAWN_RATE`, so no
upgrade level can ask for an unreadable firehose.

Impact feedback is layered on top of the same loop: hit-stop (`fx.hitstop`)
freezes the simulation for a beat while effects keep animating, and a camera
punch (`fx.zoom`) scales the view. Both decay on their own; the renderer feeds
the zoomed scale back into hit-testing so a tap lands where the kernel is
drawn.

## Not included yet

Deliberately out of scope for this prototype: prestige, ads, accounts, a
backend, multiplayer, and menus.
