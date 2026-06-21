// Powerups — temporary buffs that drop from enemies as collectible orbs, sit in
// the world until the craft flies over them, then fire instantly and run for a
// fixed duration. Two global stats govern the system: a Multiplier that scales
// each buff's strength + duration, and a Drop Chance that controls how often
// they spawn. (Multiplier/DropChance are raised by Resonances + meta.)

import { type Vec2, dist } from '../core/math';
import { EventBus } from '../core/events';

export type PType = 'repair' | 'magnet' | 'speed' | 'overdrive' | 'bounty' | 'shield' | 'timestop' | 'nuke';

export interface PowerupDef {
  type: PType; name: string; hue: number; glyph: string; duration: number; instant: boolean;
}

export const POWERUPS: Record<PType, PowerupDef> = {
  repair:    { type: 'repair',    name: 'Repair',     hue: 140, glyph: '+',  duration: 0,  instant: true },
  magnet:    { type: 'magnet',    name: 'Collector',  hue: 285, glyph: '◎',  duration: 0,  instant: true },
  speed:     { type: 'speed',     name: 'Thrust',     hue: 190, glyph: '»',  duration: 15, instant: false },
  overdrive: { type: 'overdrive', name: 'Overdrive',  hue: 28,  glyph: '✶',  duration: 15, instant: false },
  bounty:    { type: 'bounty',    name: 'Bounty',     hue: 48,  glyph: '$',  duration: 15, instant: false },
  shield:    { type: 'shield',    name: 'Invuln',     hue: 185, glyph: '✪',  duration: 15, instant: false },
  timestop:  { type: 'timestop',  name: 'Time Stop',  hue: 210, glyph: '⏱',  duration: 12, instant: false },
  nuke:      { type: 'nuke',      name: 'Nuke',       hue: 0,   glyph: '✺',  duration: 0,  instant: true },
};
const TYPES = Object.keys(POWERUPS) as PType[];
const PICKUP_R = 28;

export interface DroppedPowerup { id: number; type: PType; x: number; y: number; }

export class Powerups {
  dropped: DroppedPowerup[] = [];
  active: Partial<Record<PType, number>> = {}; // type → seconds remaining
  mult = 1;
  dropChance = 0.18;
  private nid = 1;

  reset(): void { this.dropped = []; this.active = {}; }

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
