// Procedural planet field — scatter a system of dead worlds to explore and
// reignite. Seeded by the run RNG so the Daily Cinder is identical for everyone.
//
// Each body is sized so that a circular orbit in its ignition band sits at a
// controllable speed (~150–190 u/s) — the solver derives μ from that target,
// so "getting the orbit spot on" feels the same on a small moon or a big world.

import { RNG } from '../core/rng';
import { v, dist, norm, scale, add } from '../core/math';
import type { Body, RelicInstance } from '../core/types';

export interface FieldOptions {
  count: number;
  extent: number;       // half-width of the square field
  spacing: number;      // min gap between SOI edges
  depth: number;        // sector depth — scales hazards
}

const SCALE_TONES = [0, 2, 3, 5, 7, 8, 10, 12];

export function generateField(seed: number | string, opts: Partial<FieldOptions> = {}): {
  bodies: Body[];
  relics: RelicInstance[];
  spawn: { x: number; y: number };
  bounds: { min: { x: number; y: number }; max: { x: number; y: number } };
} {
  const o: FieldOptions = { count: 14, extent: 1900, spacing: 40, depth: 0, ...opts };
  const rng = new RNG(seed);
  const bodies: Body[] = [];
  const relics: RelicInstance[] = [];

  let guard = 0;
  while (bodies.length < o.count && guard++ < o.count * 80) {
    const radius = rng.float(34, 58);
    const soiRadius = radius * rng.float(6, 9); // big spheres of influence — generous capture
    const pos = v(rng.float(-o.extent, o.extent), rng.float(-o.extent, o.extent));

    // reject only if SOIs heavily overlap (a little overlap is fine — n-body flavor)
    let ok = true;
    for (const b of bodies) {
      if (dist(pos, b.pos) < (soiRadius + b.soiRadius) * 0.78 + o.spacing) { ok = false; break; }
    }
    if (!ok) continue;

    const igniteInner = radius * 1.3;       // band starts closer to the surface
    const igniteOuter = soiRadius * 0.82;   // …and reaches way out — a fat, forgiving annulus
    const midBand = (igniteInner + igniteOuter) / 2;
    const targetCirc = rng.float(140, 180);
    const mu = targetCirc * targetCirc * midBand; // μ so v_circ(midBand) ≈ target

    bodies.push({
      id: `p${bodies.length}`,
      kind: 'planet',
      pos,
      mu,
      radius,
      soiRadius,
      heatRadius: radius * 1.55,
      igniteInner,
      igniteOuter,
      ignition: 0,
      orbit: null,
      seeded: false,
      tone: rng.pick(SCALE_TONES),
      hue: rng.float(190, 320),
    });
  }

  // some worlds carry a moon — a small, moving target orbiting its parent,
  // reignitable in its own right. Moons make a system feel alive.
  const planets = bodies.slice();
  for (const p of planets) {
    if (rng.next() > 0.4) continue;
    const radius = rng.float(12, 20);
    const orbitR = p.soiRadius * rng.float(0.62, 0.8);
    const soiRadius = radius * rng.float(4.5, 6);
    const igniteInner = radius * 1.4;
    const igniteOuter = soiRadius * 0.74;
    const midBand = (igniteInner + igniteOuter) / 2;
    const targetCirc = rng.float(120, 150);
    bodies.push({
      id: `m${bodies.length}`,
      kind: 'moon',
      pos: v(p.pos.x + orbitR, p.pos.y),
      mu: targetCirc * targetCirc * midBand,
      radius,
      soiRadius,
      heatRadius: radius * 1.55,
      igniteInner,
      igniteOuter,
      ignition: 0,
      orbit: { parentId: p.id, radius: orbitR, angularVel: rng.float(0.15, 0.35) * (rng.bool() ? 1 : -1), phase: rng.float(0, Math.PI * 2) },
      seeded: false,
      tone: rng.pick(SCALE_TONES),
      hue: rng.float(190, 320),
    });
  }

  // helper: drop a special body in open space (loose spacing so hazards fit)
  const place = (soiRadius: number): { x: number; y: number } | null => {
    for (let i = 0; i < 80; i++) {
      const p = v(rng.float(-o.extent, o.extent), rng.float(-o.extent, o.extent));
      let ok = true;
      for (const b of bodies) if (dist(p, b.pos) < (soiRadius + b.soiRadius) * 0.6) { ok = false; break; }
      if (ok) return p;
    }
    return null;
  };

  // ── SUNS: already-lit amber gravity hubs to slingshot around ──
  const suns = 1 + (o.depth >= 2 ? 1 : 0);
  for (let i = 0; i < suns; i++) {
    const radius = rng.float(70, 100);
    const soiRadius = radius * rng.float(7, 9);
    const pos = place(soiRadius); if (!pos) continue;
    const mid = radius * 4;
    bodies.push({
      id: `sun${i}`, kind: 'star', pos, mu: 175 * 175 * mid, radius, soiRadius,
      heatRadius: radius * 1.8, igniteInner: 0, igniteOuter: 0, ignition: 1,
      orbit: null, seeded: true, lethal: true, tone: 0, hue: 32,
    });
  }

  // ── BLACK HOLES: deadly anchors — huge pull, fatal touch ──
  const holes = (o.depth >= 1 ? 1 : 0) + (o.depth >= 3 ? 1 : 0);
  for (let i = 0; i < holes; i++) {
    const radius = rng.float(20, 30);
    const soiRadius = radius * rng.float(9, 12);
    const pos = place(soiRadius); if (!pos) continue;
    const mid = radius * 4;
    bodies.push({
      id: `bh${i}`, kind: 'blackhole', pos, mu: 230 * 230 * mid, radius, soiRadius,
      heatRadius: radius * 2, igniteInner: 0, igniteOuter: 0, ignition: 0,
      orbit: null, seeded: false, lethal: true, tone: -5, hue: 280,
    });
    // a relic parked perilously close to the event horizon — pure greed
    relics.push({ id: `r-bh${i}`, resonanceId: '', grabbed: false,
      pos: add(pos, scale(norm(v(rng.float(-1, 1), rng.float(-1, 1))), radius * 2.6)) });
  }

  // ── PULSARS: reignitable, but fire gravity waves on a rhythm ──
  const pulsars = o.depth >= 1 ? 1 : 0;
  for (let i = 0; i < pulsars; i++) {
    const radius = rng.float(28, 38);
    const soiRadius = radius * rng.float(7, 9);
    const pos = place(soiRadius); if (!pos) continue;
    const igniteInner = radius * 1.3, igniteOuter = soiRadius * 0.82;
    const mid = (igniteInner + igniteOuter) / 2;
    bodies.push({
      id: `pulsar${i}`, kind: 'pulsar', pos, mu: 165 * 165 * mid, radius, soiRadius,
      heatRadius: radius * 1.5, igniteInner, igniteOuter, ignition: 0,
      orbit: null, seeded: false, tone: 7, hue: 195,
      pulse: { period: rng.float(1.4, 2.0), strength: 260, range: soiRadius, t: 0 },
    });
  }

  // ── a free-floating relic or two, parked near a sun's heat (greed) ──
  const freeRelics = Math.floor(o.depth / 2);
  for (let i = 0; i < freeRelics; i++) {
    const sun = bodies.find((b) => b.kind === 'star');
    if (sun) relics.push({ id: `r-free${i}`, resonanceId: '', grabbed: false,
      pos: add(sun.pos, scale(norm(v(rng.float(-1, 1), rng.float(-1, 1))), sun.heatRadius * 1.05)) });
  }

  // spawn in the emptiest quadrant-ish gap we can find near the middle
  let spawn = v(0, 0);
  let bestClear = -1;
  for (let i = 0; i < 40; i++) {
    const p = v(rng.float(-o.extent * 0.6, o.extent * 0.6), rng.float(-o.extent * 0.6, o.extent * 0.6));
    let nearest = Infinity;
    for (const b of bodies) nearest = Math.min(nearest, dist(p, b.pos) - b.soiRadius);
    if (nearest > bestClear) { bestClear = nearest; spawn = p; }
  }

  const ext = o.extent + 400;
  return { bodies, relics, spawn, bounds: { min: v(-ext, -ext), max: v(ext, ext) } };
}
