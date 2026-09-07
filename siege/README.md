# LAST KEEP

Endless top-down wave defence. Enemies march down the field toward your wall.
Four towers shoot on their own; your finger is the fifth weapon. Hold out as
long as you can — you will not hold forever.

Open `siege/index.html`, or build the single-file version with
`node build.js lastkeep` from the repo root.

## The loop

- **Waves** arrive forever, each stronger than the last. Every tenth is a
  **boss**.
- **Tapping** damages the enemy under your finger. Consecutive hits build a
  **combo multiplier**, and every tap charges **OVERCHARGE** — a full meter
  hits the entire field at once. Taps also do triple damage to bosses.
- **Phantoms** phase out of reach of your towers on a cycle. While phased,
  nothing but your finger can touch them.
- **Gold** from kills upgrades four towers and your own tap damage. Calling a
  wave early during the break pays 30% extra.
- **The wall falls** eventually, and that is the design. A lost run pays
  **relics**, scaled to the deepest wave reached, which buy permanent upgrades
  in the Relic Hall. The next attempt starts stronger.

## Why runs end

Enemy health climbs faster than your damage can, on purpose:

```
player DPS grows ≈ (gold income growth) ^ (ln 1.27 / ln 1.5) ≈ 1.12 per wave
enemy health     = HP_GROWTH                                 = 1.16 per wave
```

That leaves enemies gaining ~3.6% every wave. A first run opens with about
double the damage it needs, so the gap closes around wave 20-35 — and every
relic spent widens it again. What decides a wave is not its total health but
whether a single enemy can be killed during its walk to the wall, which is why
the numbers are set against DPS rather than wave size.

A headless probe of the real simulation (`SIEGE.Sim` runs in Node) puts an
engaged player at wave 35 on run one and wave 57 by run ten, while a passive
one who barely taps dies around wave 15. Tapping is worth more than double
your depth.

## Layout

| File | Role |
| --- | --- |
| `js/content.js` | Balance, enemy table, tower table, wave composition |
| `js/sim.js` | Simulation: enemies, towers, projectiles, waves, castle |
| `js/meta.js` | Relics and permanent upgrades |
| `js/fx.js` | Visual-only state: particles, numbers, shake, hit-stop |
| `js/render.js` | Top-down canvas renderer |
| `js/ui.js` | DOM: HUD, upgrade buttons, overlays |
| `js/audio.js` | Small WebAudio synth |
| `js/save.js` | localStorage |
| `js/main.js` | Bootstrap, input, fixed-timestep loop, event dispatch |

Same split as POPCORE: the simulation knows nothing about canvas, DOM or audio
and reports through an event queue, so it runs headless for balance work.
