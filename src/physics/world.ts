// The gravity solver — WHORL's beating heart (free-flight edition).
//
// The craft flies under its own thrusters through open space. Each body has a
// SPHERE OF INFLUENCE: inside it the body's gravity bends your path, tapering
// smoothly to zero at the edge so you coast between systems. There is no
// grapple — you capture orbits the real way, with momentum and a nudge of
// thrust. Hold a clean orbit inside a dead world's ignition band and you charge
// it back to life. Skim low for Charge; cross the surface and you crash.
//
// Deterministic: fixed dt + fixed thrust input in, same arcs out.

import {
  type Vec2, v, add, sub, scale, dot, len, dist, norm, clamp, smoothstep,
} from '../core/math';
import { EventBus } from '../core/events';
import type { Body, CraftState, ResonanceMods, RelicInstance } from '../core/types';

export interface Tuning {
  thrustPower: number;   // acceleration at full thrust (units/s²)
  drag: number;          // tiny coasting damping OUTSIDE any SOI (control only)
  orbitAssist: number;   // steers velocity toward a circular orbit at your CURRENT
                         // radius inside a SOI — stable orbit, no spiral, thrust to climb
  maxSpeed: number;      // soft cap so thrust can't run away
  gravity: number;       // global μ scale
  soft: number;          // gravity softening (avoids singularity at r→0)
  igniteRate: number;    // ignition gained per second at a perfect orbit
  igniteDecay: number;   // ignition lost per second outside the band
  igniteFloor: number;   // min orbit quality that charges a world at all
  lockQuality: number;   // orbit quality that fires the "spot on" snap
  chargeRate: number;    // Charge per (skim²·speed·s) on daring low passes
  chipSkim: number;      // skim above which the hull chips
  mods: Partial<ResonanceMods>;
}

export const DEFAULT_TUNING: Tuning = {
  thrustPower: 560,
  drag: 0.03,            // only out in open space — keeps coasting controllable
  orbitAssist: 4,        // the orbit feel: settle into a stable circle, thrust to leave
  maxSpeed: 1500,
  gravity: 1,
  soft: 16,
  igniteRate: 0.58,
  igniteDecay: 0.3,
  igniteFloor: 0.28,
  lockQuality: 0.7,
  chargeRate: 16,
  chipSkim: 0.9,
  mods: {},
};

export class World {
  bodies: Body[] = [];
  relics: RelicInstance[] = [];
  craft: CraftState;
  tuning: Tuning;
  private chippedBy: Record<string, boolean> = {};
  private lockedBy: Record<string, boolean> = {}; // fired the snap this orbit pass
  private grazeLeft = 0;

  constructor(public bus: EventBus, tuning: Tuning = DEFAULT_TUNING) {
    this.tuning = tuning;
    this.craft = { pos: v(0, 0), vel: v(0, 0), heading: 0, thrust: 0, soiId: null, alive: true };
  }

  reset(bodies: Body[], spawn: Vec2, vel: Vec2, relics: RelicInstance[] = []): void {
    this.bodies = bodies;
    this.relics = relics;
    this.craft = { pos: { ...spawn }, vel: { ...vel }, heading: 0, thrust: 0, soiId: null, alive: true };
    this.chippedBy = {};
    this.lockedBy = {};
    this.grazeLeft = this.tuning.mods.grazeWard ?? 0;
  }

  bodyById(id: string): Body | undefined {
    return this.bodies.find((b) => b.id === id);
  }

  /** Apply the merged Resonance mods to live tuning (called when a draft picks). */
  setMods(mods: Partial<ResonanceMods>): void {
    this.tuning.mods = mods;
    this.grazeLeft = mods.grazeWard ?? 0;
  }

  /** Set the craft's thrust input for the next step. dir need not be unit. */
  setThrust(dir: Vec2, magnitude: number): void {
    const m = clamp(magnitude, 0, 1);
    this.craft.thrust = m;
    if (m > 0.01 && (dir.x || dir.y)) this.craft.heading = Math.atan2(dir.y, dir.x);
  }

  /** Softened, SOI-tapered gravity acceleration at a point. */
  gravityAt(p: Vec2): Vec2 {
    let ax = 0, ay = 0;
    for (const b of this.bodies) {
      const dx = b.pos.x - p.x, dy = b.pos.y - p.y;
      const r = Math.hypot(dx, dy) || 1e-6;
      if (r >= b.soiRadius) continue;
      // taper the outer 35% of the SOI to zero for a seamless boundary
      const taper = smoothstep((b.soiRadius - r) / (b.soiRadius * 0.35));
      const g = (this.tuning.gravity * b.mu) / (r * r + this.tuning.soft * this.tuning.soft);
      const a = (g * taper) / r;
      ax += dx * a; ay += dy * a;
    }
    return v(ax, ay);
  }

  /** Local circular-orbit speed at radius r about body b. */
  circularSpeed(b: Body, r: number): number {
    const g = (this.tuning.gravity * b.mu) / (r * r + this.tuning.soft * this.tuning.soft);
    return Math.sqrt(g * r);
  }

  /** 0 outside the heat band, 1 grazing the surface. */
  skimOf(b: Body, r: number): number {
    if (r >= b.heatRadius) return 0;
    return clamp((b.heatRadius - r) / (b.heatRadius - b.radius || 1), 0, 1);
  }

  step(dt: number): void {
    const c = this.craft;
    if (!c.alive) return;

    // orbiting bodies (clockwork orrery)
    for (const b of this.bodies) {
      if (!b.orbit) continue;
      b.orbit.phase += b.orbit.angularVel * dt;
      const parent = b.orbit.parentId ? this.bodyById(b.orbit.parentId) : null;
      const ox = parent ? parent.pos.x : 0, oy = parent ? parent.pos.y : 0;
      b.pos = v(ox + Math.cos(b.orbit.phase) * b.orbit.radius, oy + Math.sin(b.orbit.phase) * b.orbit.radius);
    }

    // pulsars: fire a gravity wave on the beat — a hard outward shove if you're in range
    for (const b of this.bodies) {
      if (!b.pulse) continue;
      b.pulse.t += dt;
      if (b.pulse.t >= b.pulse.period) {
        b.pulse.t -= b.pulse.period;
        const d = dist(c.pos, b.pos);
        if (d < b.pulse.range) {
          const dir = norm(sub(c.pos, b.pos));
          const f = b.pulse.strength * (1 - d / b.pulse.range);
          c.vel = add(c.vel, scale(dir, f));
        }
        this.bus.post({ type: 'pulse', bodyId: b.id, at: { ...b.pos }, strength: b.pulse.strength });
      }
    }

    // relic pickups — fly into one to claim it (often parked somewhere deadly)
    for (const r of this.relics) {
      if (r.grabbed) continue;
      if (dist(c.pos, r.pos) < 26) { r.grabbed = true; this.bus.post({ type: 'relicGrabbed', relicId: r.id, at: { ...r.pos } }); }
    }

    // integrate: thrust + gravity, gentle drag, semi-implicit Euler
    const m = this.tuning.mods;
    const g = this.gravityAt(c.pos);
    let ax = g.x, ay = g.y;
    if (c.thrust > 0) {
      const tp = this.tuning.thrustPower * (m.thrustMul ?? 1) * c.thrust;
      ax += Math.cos(c.heading) * tp; ay += Math.sin(c.heading) * tp;
    }
    // Lodestar magnet: relit worlds keep a gentle long pull to chain orbits
    if (m.magnet) {
      for (const b of this.bodies) {
        if (!b.seeded) continue;
        const dx = b.pos.x - c.pos.x, dy = b.pos.y - c.pos.y;
        const r = Math.hypot(dx, dy) || 1e-6;
        if (r > b.soiRadius && r < b.soiRadius * 2.2) {
          const pull = (this.tuning.gravity * b.mu * 0.4) / (r * r);
          ax += (dx / r) * pull; ay += (dy / r) * pull;
        }
      }
    }
    c.vel = add(c.vel, scale(v(ax, ay), dt));

    // The orbit feel. Inside a SOI, gently steer velocity toward the circular
    // orbit at the CURRENT radius: this locks a stable orbit wherever you let go
    // (no inward spiral, no black-hole grab), and because thrust is far stronger
    // than the assist, a deliberate burn cleanly raises, lowers, or escapes it.
    // The assist fades in from the SOI edge so crossing the boundary is smooth.
    // Out in open space, a whisper of drag keeps coasting controllable.
    const host = this.dominantSoi(c.pos);
    if (host) {
      const dx = c.pos.x - host.pos.x, dy = c.pos.y - host.pos.y;
      const r = Math.hypot(dx, dy) || 1e-6;
      let tx = -dy / r, ty = dx / r;                      // tangent (ccw)
      const sense = c.vel.x * tx + c.vel.y * ty >= 0 ? 1 : -1;
      tx *= sense; ty *= sense;                            // match current spin
      const vCirc = this.circularSpeed(host, r);
      const edge = clamp((host.soiRadius - r) / (host.soiRadius * 0.3), 0, 1);
      const assist = (this.tuning.orbitAssist + (m.tractor ?? 0) * 1.6) * edge;
      const k = clamp(assist * dt, 0, 1);
      c.vel.x += (tx * vCirc - c.vel.x) * k;
      c.vel.y += (ty * vCirc - c.vel.y) * k;
    } else {
      const damp = Math.max(0, 1 - this.tuning.drag * (m.dragMul ?? 1) * dt);
      c.vel = scale(c.vel, damp);
    }

    // soft speed cap so thrust can't run away
    const sp = len(c.vel);
    if (sp > this.tuning.maxSpeed) c.vel = scale(c.vel, this.tuning.maxSpeed / sp);

    c.pos = add(c.pos, scale(c.vel, dt));

    this.resolveBodies(dt);
  }

  /** The body whose SOI most contains this point (smallest containing SOI). */
  private dominantSoi(p: Vec2): Body | null {
    let best: Body | null = null, bestD = Infinity;
    for (const b of this.bodies) {
      const d = dist(p, b.pos);
      if (d < b.soiRadius && d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  private resolveBodies(dt: number): void {
    const c = this.craft;
    // find nearest SOI for enter/exit tracking
    let nearestSoi: Body | null = null, nearestD = Infinity;
    for (const b of this.bodies) {
      const r = dist(c.pos, b.pos);
      if (r < b.soiRadius && r < nearestD) { nearestD = r; nearestSoi = b; }
    }
    const newSoi = nearestSoi?.id ?? null;
    if (newSoi !== c.soiId) {
      if (c.soiId) this.bus.post({ type: 'exitSoi', bodyId: c.soiId, at: { ...c.pos } });
      if (newSoi) this.bus.post({ type: 'enterSoi', bodyId: newSoi, at: { ...c.pos }, speed: len(c.vel) });
      c.soiId = newSoi;
    }

    for (const b of this.bodies) {
      const r = dist(c.pos, b.pos);
      if (r >= b.soiRadius) continue;
      const speed = len(c.vel);

      // ── crash ──
      if (r <= b.radius) {
        if (this.grazeLeft > 0) {
          this.grazeLeft--;
          const out = norm(sub(c.pos, b.pos));
          c.pos = add(b.pos, scale(out, b.radius + 2));
          c.vel = scale(c.vel, 0.3);
        } else {
          this.bus.post({ type: 'crash', bodyId: b.id, at: { ...c.pos } });
        }
        continue;
      }

      // ── skim harvest: daring low passes mint Charge (and risk a chip) ──
      const skim = this.skimOf(b, r);
      if (skim > 0) {
        const greed = 1 + (this.tuning.mods.deepGreedMul ?? 0) * skim;
        const gain = skim * skim * speed * this.tuning.chargeRate * greed * dt;
        if (gain > 0) this.bus.post({ type: 'periapsis', bodyId: b.id, skim, charge: gain });
        const chipAt = this.tuning.chipSkim / (1 + (this.tuning.mods.heatToleranceMul ?? 0));
        if (skim >= chipAt && !this.chippedBy[b.id]) {
          this.chippedBy[b.id] = true;
          this.bus.post({ type: 'plateChipped', remaining: -1, at: { ...c.pos } });
        }
      } else {
        this.chippedBy[b.id] = false;
      }

      // ── reignition: a clean orbit in the band charges a dead world ──
      if (!b.seeded && b.kind !== 'star' && b.kind !== 'blackhole') {
        const mods = this.tuning.mods;
        const radial = norm(sub(c.pos, b.pos));
        const radialSpeed = Math.abs(dot(c.vel, radial));
        const vCirc = this.circularSpeed(b, r) || 1;
        // forgiving: speed can be off by ±60% before it stops counting, and even
        // a so-so speed still scores well if the path is nicely tangential.
        const speedMatch = clamp(1 - Math.abs(speed - vCirc) / (vCirc * 1.6), 0, 1);
        const tangentiality = speed > 1 ? clamp(1 - radialSpeed / speed, 0, 1) : 0;
        const quality = tangentiality * (0.4 + 0.6 * speedMatch);
        // Resonant Field widens the band; Steady Hand lowers the quality floor
        const widen = mods.bandWiden ?? 0;
        const inner = b.igniteInner * (1 - 0.35 * widen);
        const outer = b.igniteOuter * (1 + 0.5 * widen);
        const floor = this.tuning.igniteFloor / (1 + (mods.qualityAssist ?? 0));
        const rate = this.tuning.igniteRate * (mods.igniteRateMul ?? 1);
        const inBand = r >= inner && r <= outer;
        // (Tractor Lock is applied in step() as extra orbit assist.)

        if (inBand && quality >= floor) {
          b.ignition = clamp(b.ignition + quality * rate * dt, 0, 1);
          this.bus.post({ type: 'orbitTick', bodyId: b.id, quality, skim, speed });
          this.bus.post({ type: 'igniteProgress', bodyId: b.id, ignition: b.ignition, at: { ...c.pos } });
          if (quality >= this.tuning.lockQuality && !this.lockedBy[b.id]) {
            this.lockedBy[b.id] = true;
            this.bus.post({ type: 'snap', quality, at: { ...c.pos }, speed });
          } else if (quality < this.tuning.lockQuality * 0.85) {
            this.lockedBy[b.id] = false;
          }
          if (b.ignition >= 1) {
            b.seeded = true;
            this.bus.post({ type: 'worldSeeded', bodyId: b.id, at: { ...b.pos }, embers: 1 });
          }
        } else {
          b.ignition = Math.max(0, b.ignition - this.tuning.igniteDecay * dt);
          this.lockedBy[b.id] = false;
        }
      }
    }
  }

  /** Begin a new system: refresh per-system counters. */
  enterSystem(): void {
    this.grazeLeft = this.tuning.mods.grazeWard ?? 0;
  }

  /**
   * Ghost line — forward-simulate the craft under gravity (no thrust, gentle
   * drag) so the player can read the orbit their current velocity will trace.
   * Stops if the arc would clip a surface.
   */
  predict(steps: number, dt: number): Vec2[] {
    const path: Vec2[] = [];
    let pos = { ...this.craft.pos };
    let vel = { ...this.craft.vel };
    for (let i = 0; i < steps; i++) {
      const g = this.gravityAt(pos);
      vel = add(vel, scale(g, dt));
      // mirror step(): orbit assist inside a SOI, light drag outside — so the
      // ghost line shows the rounded orbit you'll actually settle into.
      const host = this.dominantSoi(pos);
      if (host) {
        const dx = pos.x - host.pos.x, dy = pos.y - host.pos.y;
        const r = Math.hypot(dx, dy) || 1e-6;
        let tx = -dy / r, ty = dx / r;
        const sense = vel.x * tx + vel.y * ty >= 0 ? 1 : -1;
        tx *= sense; ty *= sense;
        const vCirc = this.circularSpeed(host, r);
        const edge = clamp((host.soiRadius - r) / (host.soiRadius * 0.3), 0, 1);
        const k = clamp(this.tuning.orbitAssist * edge * dt, 0, 1);
        vel.x += (tx * vCirc - vel.x) * k; vel.y += (ty * vCirc - vel.y) * k;
      } else {
        vel = scale(vel, Math.max(0, 1 - this.tuning.drag * dt));
      }
      pos = add(pos, scale(vel, dt));
      let hit = false;
      for (const b of this.bodies) {
        if (dist(pos, b.pos) <= b.radius) { hit = true; break; }
      }
      if (i % 3 === 0) path.push({ ...pos });
      if (hit) break;
    }
    return path;
  }
}
