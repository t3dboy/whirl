# WHORL — Coding Plan & Team Structure

> *the lower you dare loop, the more you mint, the more you can relight, the deeper you can fall — until you don't.*

A browser-based gravity roguelite in the visual key of **Geometry Wars** — pure black void, saturated neon vector line art, an over-bright bloom, and a spring-mass **warping grid** under everything that ripples from explosions and buckles into black holes. Simple, but striking.

---

## 0. Current state (shipped & live) ✅

Playable at **[t3dboy.github.io/whirl](https://t3dboy.github.io/whirl/)**. Everything below is in and released:

- **Flight & relight** — spheres of influence, thruster flight, orbit-lock reignition, gravity-slung missiles, braking.
- **Combat** — drone / hulk / spreader enemies (the 4-way spreader from sector 5), reinforcement escalation, destructible enemy missiles, a regenerating shield.
- **Arsenal (in-run weapons)** — collect up to 3 auto-firing weapons per run via the draft weapon row and rare crates; at 3 you only level up. 7 built; ~20 more queued. Contract in `content/arsenal/types.ts` — new weapons are one self-contained module + one registry line.
- **Flame Halo** — a levelling rotating flamethrower bought in the hangar.
- **Powerups** — 8 timed/instant buffs dropped by kills, with a first-time explainer pause.
- **Meta** — persistent Embers banked from magnetised gem drops, 5 hulls, weapon unlocks, high-score table, reset-progress.
- **Endless** — no win condition; the dive continues until you die.
- **Look** — the Geometry Wars overhaul: black void, neon wireframe enemies (shape + colour encode behaviour), warping grid, heavy bloom. No sepia/scanlines/grain.

**Removed along the way:** the Pale (the shrinking cold rim — too restrictive), and the depth-7 auto-win.

**Next:** the remaining arsenal weapons, line-shard particles, wireframe bodies, GW-styled menus.

---

## 0a. How we got here (M0 — DONE ✅)

The **vertical slice is built, running, and tested.** *(Note: the core verb pivoted from a one-button grapple to free-flight exploration — see below.)*

- **Stack:** TypeScript · Vite · Canvas2D · Web Audio · Vitest. Zero runtime deps. `npm run dev` → http://localhost:5174
- **The core, working now:** you pilot a seed-craft on its own **thrusters** (point-and-thrust on mouse/touch, rotate+thrust on keys — auto-detected) through a **procedurally generated field of dead worlds**. Each world has a **sphere of influence** whose gravity bends your path, tapering smoothly to zero at the edge so you coast between systems. Hold a **clean orbit inside a world's ignition band** and you charge it back to life ("orbit lock" → slow-mo + chord; sustained → **RELIT**, +Charge, +1 plate). **Skim low** through the heat band to mint Charge at the risk of a chip; **cross the surface and you crash**. Live **gravity ghost line** shows the orbit your velocity will trace. Full Balatro-style render (void gradient, SOI field rings, gold ignition arcs that sweep the rim as a world powers up, thrust flame, popping numbers).
- **Verified:** 9 passing physics contract tests — SOI gravity acts only inside the sphere, thrust accelerates along heading, a clean circular orbit reignites a world (and a radial plunge does not), crashes fire, the field is deterministic per seed. End-to-end live check: a maintained orbit relights a world in ~1.9 s.

**The core model decision (pivoted & proven).** Original concept was a sacred one-button gravity *tether*; the proven kinematic-dive version of that is preserved in git history. The design then pivoted to a **free-flight exploration** feel: real **spheres of influence** instead of a grapple, **thrusters** so the field feels explorable, and **reignite-by-orbit** (getting the orbit "spot on" charges a dead world). The skill is now *flying a clean orbit*, and the central gamble survives intact — skim low for Charge, hold the orbit longer for ignition, but a sloppy line crashes you.

---

## 0b. Build-out shipped (M1–M2 slice) ✅

On top of the proven core, now in and tested:
- **Resonances (power-ups)** — `content/resonances.ts`: 17 power-ups across flight / orbit / harvest / hull / exotic, each pure data whose `mods` merge live into the solver & run (Slipstream, Ion Burners, Resonant Field, Kindling, Tractor Lock, Lodestar magnet, Deep Greed, Heat Shielding, Bulwark, Cold Skin, Comet Heart, Chain Reaction, Starforge…). Stacking changes how you fly by sector 3.
- **The run** — `game/run.ts`: deepening fields (bigger, fuller per sector), a relight **goal** that opens a **warp gate** at the core, and the **Pale** — an encroaching cold that shrinks the safe disk from the rim, chips you out in the open, and ends the run if it reaches the core before you warp. Quickens each sector.
- **Draft** — `ui/draft.ts`: Balatro-style 1-of-3 card pick on every warp.
- **Body variety** — moons (orbiting, moving reignite targets) via `field.ts`.
- **Audio** — `audio/audio.ts` expanded by the audio team: depth-shifting key, reignite fanfare, warp whoosh, draft blip, SOI tone, a Pale drone that sours as the cold closes, thruster rumble.
- **Render** — SOI field rings, gold ignition arcs, the Pale fog + rim, the warp-gate portal, thrust flame.

*(All of the above shipped. The **Pale** described here was later cut — it made the field too restrictive — and replaced by hazards (suns, black holes, pulsars) and relics. See section 0 for the current state.)*

## 1. Architecture — the contracts everything builds on

```
src/
  core/      ← THE SPINE. owned by Lighthouse (integration). change carefully.
    math.ts      vectors & geometry (deterministic)
    rng.ts       seeded RNG (mulberry32) — Daily Cinder fairness
    events.ts    typed EventBus — the seam between every layer
    types.ts     Body, CraftState, System, RunState, Resonance, Hull, Boss, MetaSave
    loop.ts      fixed-timestep loop with time-dilation (the slow-mo spine)
  physics/   ← Team Orrery
    world.ts     SOI gravity, thrusters, reignite-by-orbit, harvest, hull, ghost line
  game/field.ts  ← Team Descent: procedural planet-field generator (seeded)
  game/      ← Team Descent
    run, starChart, systemGen, hull, economy, pale
  content/   ← Team Resonance
    resonances, hulls, bosses, relics  (pure data + appliers)
  render/    ← Team Snap
    renderer, particles, theme  (→ split into scene/camera/juice)
  audio/     ← Team Chord
    audio.ts     tones, chords, sector keys, boss rhythm
  ui/        ← Team Cartographer
    HUD, star-chart, draft, shop, shrine, run-summary  (Balatro panels)
  meta/      ← Team Ember
    save, unlocks, pacts, daily, modes
  main.ts    ← Lighthouse: wiring & the run loop
test/        ← Team Pale (QA)
```

**The two contracts that must stay stable** (every team depends on them):
1. `core/events.ts` — the `GameEvent` union. Physics *emits*; game *scores*; render & audio *react*. New event types are additive and cheap; changing an existing one is a coordinated change.
2. `core/types.ts` — the data spine. `Resonance.mods` is the agreed knob-set Content writes and Physics/Game read. Add a knob to `ResonanceMods` → wire it in the system that owns it.

**The sacred rule (updated for the pivot):** the verb is *flying a clean orbit*. Every Resonance reshapes flight/gravity/ignition — it never adds a new control surface. Depth grows through orbital skill, not more buttons.

---

## 2. The teams (subagent roles)

Nine roles. Each owns a directory and a slice of the design. They communicate **only through the two contracts** so they can work in parallel without stepping on each other.

| Team | Owns | Mandate |
|---|---|---|
| **🧭 Lighthouse** *(lead / integration / design-tuning)* | `core/types`, `core/events`, `main.ts`, tuning constants | Guards the contracts. Tunes the snap and the gamble windows. Integrates each milestone. Holds the "feel" sign-off — nothing ships that dilutes the one-button verb. |
| **🪐 Orrery** *(physics & core)* | `core/`, `physics/world.ts` | The solver. Refine the dive feel; add the orbiting clockwork, pulsar gravity waves, and the physics hooks for Twin Line, Repulsor, Wake, Echo, Long Line. Keep it deterministic. |
| **🌀 Descent** *(game systems)* | `game/` | Run orchestration; procedural `systemGen` (seeded orreries per node); the branching `starChart` (StS/Hades-style); `hull` plates & repair; `economy` (Charge in-run, Embers meta); the **Pale** advancing clock. |
| **✨ Resonance** *(content & build layer)* | `content/` | The Resonance pool (draft 1-of-3), hulls, bosses, relics — all as data + thin appliers that set `world.tuning.mods`. Owns build identity & balance so two runs feel different by system 3. |
| **💥 Snap** *(render & juice)* | `render/` | Split renderer into scene/camera/particles/juice. Own the snap's half-second of slow-mo, flash, shake, burst. Balatro-grade polish: weight, squash, glow, readable hazards. |
| **🎵 Chord** *(audio)* | `audio/` | Body tones → swing notes → release chords → tangent high-harmony. Sector-keyed scales (deeper = darker key). Boss rhythms the player must thread (the Pulse). Make skill audible; make a run a song. |
| **🗺️ Cartographer** *(UI/UX)* | `ui/` | Star-chart screen, Hades-style draft picker, derelict shop, shrine gamble, HUD, run-summary. Chunky tilted panels, big type, rarity color. Pointer + touch + keyboard. Mobile-first layout. |
| **🔥 Ember** *(meta & modes)* | `meta/` | localStorage save; Embers spend (new hulls, pool expansion, sectors, **Pacts**/ascension); the galaxy map that fills with color across runs; **Daily Cinder** (fixed seed), **Pilgrimage** (cozy), **Orrery** (sandbox) modes. |
| **🌑 Pale** *(QA / testing)* | `test/`, CI | Vitest per system; deterministic **replay harness** (seed + input log → identical run); a headless run simulator for balance sweeps; perf budget (60 fps, particle caps); input/mobile matrix; reviews every team's PR. Minimal bugs is the mandate. |

---

## 3. Milestones (each is an integration point Lighthouse signs off)

- **M0 — The Whip** ✅ *done.* One body, the snap, harvest, hull, seed-to-heal, ghost line, tests.
- **M1 — One Full System.** A single procedural Dead System: multi-body orrery, seed-goal to clear, draft 1-of-3 Resonances on clear, 3 hull plates, working economy. *Owners: Descent + Resonance + Orrery.* **Question proven:** does seeding-to-draft feel like a reward?
- **M2 — The Run.** Star-chart with one branch choice; 4-system chain; the Pale advancing behind you; 6 Resonances live; run-over + Embers banked. *Owners: Descent + Cartographer + Ember.* **Question proven (#2):** *does the gamble compound — does a tester re-fall immediately?* This is the make-or-break milestone.
- **M3 — Sectors & Bosses.** Anomaly (elite) systems, derelict shops, shrines; the Maw / Drowning Pair / Pulse boss gates; escalation curve. *Owners: Descent + Resonance + Chord + Snap.*
- **M4 — Meta & Modes.** Embers store, new hulls, pool expansion, Pacts; Daily Cinder + Pilgrimage. *Owners: Ember + Cartographer.*
- **M5 — Polish & Balance.** Feel pass, audio pass, balance sweeps via the headless simulator, mobile/perf hardening. *Owners: Snap + Chord + Pale + Lighthouse.*

**Parallelizable now (M1 fan-out):** Orrery refines the solver & orrery generation; Resonance authors the first 6 Resonances + applier; Snap splits the renderer & deepens the snap; Chord builds sector scales; Cartographer builds the draft picker + HUD; Descent builds systemGen + economy + hull modules; Ember stubs the save; Pale writes the replay harness and per-system tests. All against the existing contracts.

---

## 4. How a Resonance flows through the seams (worked example)

*Deep Greed* (more Charge from low skims):
1. **Resonance** defines it as data: `{ id:'deep_greed', family:'harvest', mods:{ deepGreedMul: 1.5 } }`.
2. On draft, **Descent** pushes the id into `RunState.resonances` and the applier merges `mods` into `world.tuning.mods`.
3. **Orrery's** solver already reads `mods.deepGreedMul` in the harvest term — no physics change needed.
4. **Snap** reads the bigger Charge floats; **Chord** voices a richer harvest tone; **Cartographer** shows it in the build tray.

That's the whole pattern. Build the appliers once, and the pool grows by adding data.

---

## 5. Quality bar (Team Pale enforces)

- Deterministic: same seed + same input log → byte-identical run (enables Daily Cinder leaderboards and replay).
- 60 fps with full particle load on a mid laptop and a recent phone.
- Every system has unit tests; every milestone has a headless run-sim sanity sweep.
- One-button purity: any feature that needs a second control is rejected at design review.

---

## 6. Run it

```bash
cd "T3d Whirl"
npm install
npm run dev        # http://localhost:5174
npm test           # physics contract tests
```
