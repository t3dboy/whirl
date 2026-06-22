// Powerups — temporary buffs that drop from enemies as collectible orbs, sit in
// the world until the craft flies over them, then fire instantly and run for a
// fixed duration. Two global stats govern the system: a Multiplier that scales
// each buff's strength + duration, and a Drop Chance that controls how often
// they spawn. (Multiplier/DropChance are raised by Resonances + meta.)

import { type Vec2, v, add, sub, scale, norm, len, dist } from '../core/math';
import { EventBus } from '../core/events';

export type PType = 'repair' | 'magnet' | 'speed' | 'overdrive' | 'bounty' | 'shield' | 'timestop' | 'nuke';

export interface PowerupDef {
  type: PType; name: string; hue: number; glyph: string; duration: number; instant: boolean; blurb: string;
}

export const POWERUPS: Record<PType, PowerupDef> = {
  repair:    { type: 'repair',    name: 'Repair',     hue: 140, glyph: '+',  duration: 0,  instant: true,  blurb: 'Patches up a chunk of your hull plating on the spot.' },
  magnet:    { type: 'magnet',    name: 'Collector',  hue: 285, glyph: '◎',  duration: 0,  instant: true,  blurb: 'Instantly sucks in every relic and dropped orb in the field.' },
  speed:     { type: 'speed',     name: 'Thrust',     hue: 190, glyph: '»',  duration: 15, instant: false, blurb: 'Supercharges your engines for faster flight, briefly.' },
  overdrive: { type: 'overdrive', name: 'Overdrive',  hue: 28,  glyph: '✶',  duration: 15, instant: false, blurb: 'Your missiles fire faster and hit harder for a while.' },
  bounty:    { type: 'bounty',    name: 'Bounty',     hue: 48,  glyph: '$',  duration: 15, instant: false, blurb: 'Every kill pays out bonus charge while it lasts.' },
  shield:    { type: 'shield',    name: 'Invuln',     hue: 185, glyph: '✪',  duration: 15, instant: false, blurb: 'A shield soaks all damage — fly fearless for a while.' },
  timestop:  { type: 'timestop',  name: 'Time Stop',  hue: 210, glyph: '⏱',  duration: 12, instant: false, blurb: 'Freezes hostiles in place — and you take no hits.' },
  nuke:      { type: 'nuke',      name: 'Nuke',       hue: 0,   glyph: '✺',  duration: 0,  instant: true,  blurb: 'Detonates a shockwave that wipes out nearby enemies.' },
};
const TYPES = Object.keys(POWERUPS) as PType[];
const PICKUP_R = 52;        // generous — fly near, not dead-on, to grab
const MOTE_MAGNET_R = 460;  // embers get sucked toward you from this far
const MOTE_COLLECT_R = 34;

export interface DroppedPowerup { id: number; type: PType; x: number; y: number; }
export interface EmberMote { x: number; y: number; vx: number; vy: number; }
export interface WeaponCrate { id: number; x: number; y: number; }

export class Powerups {
  dropped: DroppedPowerup[] = [];
  motes: EmberMote[] = [];      // dropped embers, magnetised to the craft
  crates: WeaponCrate[] = [];   // rare weapon pickups (grant/upgrade an arsenal weapon)
  active: Partial<Record<PType, number>> = {}; // type → seconds remaining
  mult = 1;
  dropChance = 0.18;
  private nid = 1;

  reset(): void { this.dropped = []; this.motes = []; this.crates = []; this.active = {}; }

  /** Drop a weapon crate the craft can fly over to gain/upgrade an arsenal weapon. */
  spawnCrate(x: number, y: number): void { this.crates.push({ id: this.nid++, x, y }); }

  /** Scatter a few ember motes from a kill — they home in on the craft. */
  dropEmbers(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90;
      this.motes.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
    }
  }

  /** Roll for a drop at a position (called on enemy death). */
  maybeDrop(x: number, y: number, bus: EventBus): void {
    if (Math.random() > this.dropChance) return;
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    this.dropped.push({ id: this.nid++, type, x, y });
    bus.post({ type: 'powerupDrop', ptype: type, at: { x, y } });
  }

  /** Collect every dropped orb instantly (the Collector/Magnet effect). */
  collectAll(craftPos: Vec2, bus: EventBus): void {
    for (const d of this.dropped.slice()) this.fire(d.type, { x: d.x, y: d.y }, bus);
    this.dropped = [];
  }

  private fire(type: PType, at: Vec2, bus: EventBus): void {
    const def = POWERUPS[type];
    if (!def.instant) this.active[type] = def.duration * this.mult;
    bus.post({ type: 'powerupGet', ptype: type, at });
  }

  update(dt: number, craftPos: Vec2, alive: boolean, bus: EventBus): void {
    // flyover pickup
    if (alive) {
      for (let i = this.dropped.length - 1; i >= 0; i--) {
        const d = this.dropped[i];
        if (dist(craftPos, { x: d.x, y: d.y }) < PICKUP_R) {
          this.dropped.splice(i, 1);
          this.fire(d.type, { x: d.x, y: d.y }, bus);
        }
      }
    }
    // weapon crates: collected on a generous flyover
    if (alive) {
      for (let i = this.crates.length - 1; i >= 0; i--) {
        const cr = this.crates[i];
        if (dist(craftPos, { x: cr.x, y: cr.y }) < PICKUP_R) {
          this.crates.splice(i, 1);
          bus.post({ type: 'weaponPickup', at: { x: cr.x, y: cr.y } });
        }
      }
    }
    // ember motes: drift, then accelerate toward the craft and get collected
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      const to = sub(craftPos, { x: m.x, y: m.y });
      const d = len(to) || 1;
      if (alive && d < MOTE_MAGNET_R) {
        const pull = (1 - d / MOTE_MAGNET_R) * 2400; // stronger the closer it gets
        const dir = scale(to, 1 / d);
        m.vx += dir.x * pull * dt; m.vy += dir.y * pull * dt;
      }
      m.vx *= Math.pow(0.12, dt); m.vy *= Math.pow(0.12, dt); // drag so they settle into the pull
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (alive && d < MOTE_COLLECT_R) {
        this.motes.splice(i, 1);
        bus.post({ type: 'emberGet', amount: 1, at: { x: m.x, y: m.y } });
      }
    }
    // tick active buffs
    for (const t of Object.keys(this.active) as PType[]) {
      const v = (this.active[t] ?? 0) - dt;
      if (v <= 0) delete this.active[t]; else this.active[t] = v;
    }
  }

  has(t: PType): boolean { return (this.active[t] ?? 0) > 0; }
  remaining(t: PType): number { return this.active[t] ?? 0; }
  durationOf(t: PType): number { return POWERUPS[t].duration * this.mult; }

  // effect accessors — magnitudes scale with the Multiplier
  speedMul(): number { return this.has('speed') ? 1 + 0.8 * this.mult : 1; }
  damageMul(): number { return this.has('overdrive') ? 1 + 0.5 * this.mult : 1; }
  fireRateMul(): number { return this.has('overdrive') ? 1 + 1.0 * this.mult : 1; }
  bountyPerKill(): number { return this.has('bounty') ? Math.round(60 * this.mult) : 0; }
  invincible(): boolean { return this.has('shield') || this.has('timestop'); }
  frozen(): boolean { return this.has('timestop'); }
  shieldExpiring(): boolean { return this.has('shield') && this.remaining('shield') < 3; }

  activeList(): { type: PType; remaining: number; dur: number }[] {
    return (Object.keys(this.active) as PType[]).map((t) => ({ type: t, remaining: this.active[t]!, dur: this.durationOf(t) }));
  }
}
