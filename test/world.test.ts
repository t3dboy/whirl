// Core physics contract tests — free-flight edition.
// Locks the pivot: SOI gravity, thrust, and reignite-by-orbit.

import { describe, it, expect } from 'vitest';
import { World, DEFAULT_TUNING } from '../src/physics/world';
import { EventBus, type GameEvent } from '../src/core/events';
import { v, len, dist } from '../src/core/math';
import type { Body } from '../src/core/types';
import { generateField } from '../src/game/field';

function planet(over: Partial<Body> = {}): Body {
  return {
    id: 'p', kind: 'planet', pos: v(0, 0), mu: 150 * 150 * 120, radius: 30,
    soiRadius: 200, heatRadius: 52, igniteInner: 55, igniteOuter: 130,
    ignition: 0, orbit: null, seeded: false, tone: 0, hue: 220, ...over,
  };
}

describe('spheres of influence', () => {
  it('gravity pulls inside the SOI and is zero outside it', () => {
    const w = new World(new EventBus());
    w.reset([planet()], v(0, 0), v(0, 0));
    const inside = len(w.gravityAt(v(100, 0)));
    const outside = len(w.gravityAt(v(400, 0)));
    expect(inside).toBeGreaterThan(0);
    expect(outside).toBe(0);
  });

  it('emits enter/exit as the craft crosses the boundary', () => {
    const bus = new EventBus(); const ev: GameEvent[] = []; bus.on((e) => ev.push(e));
    const w = new World(bus); w.reset([planet()], v(-300, 0), v(300, 0));
    for (let i = 0; i < 240; i++) { w.step(1 / 120); bus.flush(); }
    expect(ev.some((e) => e.type === 'enterSoi')).toBe(true);
  });
});

describe('thrusters', () => {
  it('accelerate the craft along its heading', () => {
    const w = new World(new EventBus());
    w.reset([], v(0, 0), v(0, 0)); // empty space, no gravity
    w.setThrust(v(1, 0), 1);
    for (let i = 0; i < 30; i++) w.step(1 / 120);
    expect(w.craft.vel.x).toBeGreaterThan(0);
    expect(Math.abs(w.craft.vel.y)).toBeLessThan(1e-6);
  });
});

describe('reignite by orbit', () => {
  it('a clean circular orbit charges a dead world back to life', () => {
    const bus = new EventBus(); const ev: GameEvent[] = []; bus.on((e) => ev.push(e));
    const w = new World(bus, { ...DEFAULT_TUNING, drag: 0 });
    const b = planet();
    const r = (b.igniteInner + b.igniteOuter) / 2;
    const vc = w.circularSpeed(b, r);
    w.bodies = [b];
    w.reset([b], v(r, 0), v(0, vc)); // tangential circular velocity
    let maxIgn = 0;
    for (let i = 0; i < 600; i++) { w.step(1 / 120); bus.flush(); maxIgn = Math.max(maxIgn, b.ignition); if (b.seeded) break; }
    expect(maxIgn).toBeGreaterThan(0.2);
    expect(b.seeded).toBe(true);
    expect(ev.some((e) => e.type === 'worldSeeded')).toBe(true);
  });

  it('a wild non-orbit (radial plunge) barely charges it (no assist)', () => {
    const w = new World(new EventBus(), { ...DEFAULT_TUNING, drag: 0, orbitAssist: 0 });
    const b = planet();
    w.reset([b], v(140, 0), v(-200, 0)); // straight at the surface
    for (let i = 0; i < 30; i++) w.step(1 / 120);
    expect(b.ignition).toBeLessThan(0.2);
  });

  it('orbit assist settles a coasting craft into a stable orbit (no spiral-in)', () => {
    const w = new World(new EventBus());
    const b = planet();
    const r = (b.igniteInner + b.igniteOuter) / 2;
    w.reset([b], v(r, 0), v(0, w.circularSpeed(b, r)));
    let minR = Infinity;
    for (let i = 0; i < 1800; i++) { // 15 s of coasting
      w.craft.thrust = 0; w.step(1 / 120);
      minR = Math.min(minR, Math.hypot(w.craft.pos.x, w.craft.pos.y));
    }
    expect(minR).toBeGreaterThan(b.radius + 8); // never spiralled into the surface
  });
});

describe('crash', () => {
  it('hitting the surface emits a crash', () => {
    const bus = new EventBus(); const ev: GameEvent[] = []; bus.on((e) => ev.push(e));
    const w = new World(bus); w.reset([planet()], v(60, 0), v(-300, 0));
    for (let i = 0; i < 120; i++) { w.step(1 / 120); bus.flush(); if (ev.some((e) => e.type === 'crash')) break; }
    expect(ev.some((e) => e.type === 'crash')).toBe(true);
  });
});

describe('procedural field', () => {
  it('is deterministic for a seed and spaces out the SOIs', () => {
    const a = generateField('seed-x');
    const b = generateField('seed-x');
    expect(a.bodies.length).toBe(b.bodies.length);
    expect(a.bodies[0].pos).toEqual(b.bodies[0].pos);
    // no two SOIs fully overlap
    for (let i = 0; i < a.bodies.length; i++)
      for (let j = i + 1; j < a.bodies.length; j++)
        expect(dist(a.bodies[i].pos, a.bodies[j].pos)).toBeGreaterThan(Math.max(a.bodies[i].radius, a.bodies[j].radius));
  });

  it('spawns the craft clear of every surface', () => {
    const f = generateField('seed-y');
    for (const b of f.bodies) expect(dist(f.spawn, b.pos)).toBeGreaterThan(b.radius);
  });
});

describe('determinism', () => {
  it('identical inputs produce identical arcs', () => {
    const run = () => {
      const w = new World(new EventBus());
      w.reset([planet()], v(150, 0), v(0, 120));
      for (let i = 0; i < 200; i++) { w.setThrust(v(0, 1), 0.5); w.step(1 / 120); }
      return w.craft.pos;
    };
    expect(run()).toEqual(run());
  });
});
