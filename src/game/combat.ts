// Combat — hostile drones and missiles.
//
// Missiles fly like missiles: they launch at a modest speed, accelerate up to a
// top speed, and home with a LIMITED turn rate, so they arc and overshoot
// instead of snapping onto the target. The player fires manually (a button);
// the craft's missiles seek the nearest enemy, enemy drones seek you. Each
// missile carries a short position history for a fading trail. Deterministic.

import { type Vec2, v, add, sub, scale, norm, len, dist, wrapAngle } from '../core/math';
import { EventBus } from '../core/events';
import { RNG } from '../core/rng';
import type { Body, CraftState } from '../core/types';

export interface Enemy {
  id: number; pos: Vec2; vel: Vec2; hp: number; maxHp: number;
  r: number; bounty: number; standoff: number; speed: number; burst: number;
  cd: number; phase: number; kind: 'drone' | 'hulk';
}
export interface Missile {
  pos: Vec2; vel: Vec2; owner: 'player' | 'enemy'; life: number;
  accel: number; maxSpeed: number; turn: number; // flight characteristics
  dmg: number;
  pierce: number; // extra drones it can punch through after a kill
  trail: Vec2[];
}

const MISSILE_R = 6;
const CRAFT_R = 14;
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
const STANDOFF = 480;
const PLAYER_COOLDOWN = 0.32;
const TRAIL_LEN = 18;       // longer trail to show the whip
const MISSILE_GRAV = 9;     // missiles feel gravity far harder than the craft — they sling around worlds

export class Combat {
  enemies: Enemy[] = [];
  missiles: Missile[] = [];
  playerCd = 0;
  /** Player loadout, set from the chosen weapon each run. */
  playerWeapon: { seeker: boolean; maxSpeed: number; accel: number } = { seeker: false, maxSpeed: 560, accel: 700 };
  /** Drafted combat upgrades, refreshed when Resonances change. */
  upgrades = { cooldown: PLAYER_COOLDOWN, shots: 1, dmg: 1, pierce: 0 };
  private clock = 0;
  private nid = 1;
  // reinforcements: the longer you linger in a field, the faster they arrive
  private fieldClock = 0;
  private reinforceCd = 0;
  private bounds: { min: Vec2; max: Vec2 } = { min: v(-2000, -2000), max: v(2000, 2000) };
  private spawnDepth = 0;
  private static MAX_ALIVE = 24;

  reset(): void { this.enemies = []; this.missiles = []; this.playerCd = 0; }

  /** How many drones a sector should hold — a real swarm that grows as you fall. */
  static countFor(depth: number, pact: number): number {
    return Math.min(16, 2 + Math.round(depth * 2.2) + pact * 2);
  }

  private makeEnemy(pos: Vec2, depth: number, rnd: () => number): Enemy {
    const hulkChance = depth >= 2 ? Math.min(0.45, (depth - 1) * 0.14) : 0;
    const hulk = rnd() < hulkChance;
    return hulk
      ? { id: this.nid++, pos: { ...pos }, vel: v(0, 0), hp: 4, maxHp: 4, r: 24, bounty: 120, standoff: 560, speed: 60, burst: 2, cd: 2.5 + rnd() * 2.5, phase: rnd() * 6.28, kind: 'hulk' }
      : { id: this.nid++, pos: { ...pos }, vel: v(0, 0), hp: 1, maxHp: 1, r: 11, bounty: 35, standoff: 480, speed: 95, burst: 1, cd: 2 + rnd() * 2.5, phase: rnd() * 6.28, kind: 'drone' };
  }

  spawn(seed: string | number, count: number, bounds: { min: Vec2; max: Vec2 }, craftPos: Vec2, depth = 0): void {
    this.reset();
    this.bounds = bounds; this.spawnDepth = depth;
    this.fieldClock = 0; this.reinforceCd = 7; // first reinforcement wave after ~7s
    const rng = new RNG('enemy-' + seed);
    for (let i = 0; i < count; i++) {
      let p = v(0, 0);
      for (let k = 0; k < 40; k++) {
        p = v(rng.float(bounds.min.x * 0.85, bounds.max.x * 0.85), rng.float(bounds.min.y * 0.85, bounds.max.y * 0.85));
        if (dist(p, craftPos) > 750) break;
      }
      this.enemies.push(this.makeEnemy(p, depth, () => rng.next()));
    }
  }

  /** A reinforcement at a random edge of the field, away from the craft. */
  private reinforce(craftPos: Vec2): void {
    const b = this.bounds;
    let p = v(0, 0);
    for (let k = 0; k < 30; k++) {
      const edge = Math.floor(Math.random() * 4);
      p = edge === 0 ? v(b.min.x, rand(b.min.y, b.max.y))
        : edge === 1 ? v(b.max.x, rand(b.min.y, b.max.y))
        : edge === 2 ? v(rand(b.min.x, b.max.x), b.min.y)
        : v(rand(b.min.x, b.max.x), b.max.y);
      if (dist(p, craftPos) > 650) break;
    }
    this.enemies.push(this.makeEnemy(p, this.spawnDepth, Math.random));
  }

  private nearestEnemy(p: Vec2): Enemy | null {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.enemies) { const d = dist(p, e.pos); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  /**
   * Manual player fire. Missiles ALWAYS leave the nose along the ship's facing,
   * so you aim by pointing the ship. Unguided slugs keep flying straight (lead
   * your shots); seekers launch forward, then curve onto the nearest enemy.
   */
  firePlayer(craft: CraftState, bus: EventBus): boolean {
    if (this.playerCd > 0 || !craft.alive) return false;
    this.playerCd = this.upgrades.cooldown;
    const wpn = this.playerWeapon;
    const base = craft.heading;
    const shots = this.upgrades.shots;
    const spread = 0.18; // radians between salvo missiles
    for (let i = 0; i < shots; i++) {
      const off = shots > 1 ? (i - (shots - 1) / 2) * spread : 0;
      const ang = base + off;
      const dir = v(Math.cos(ang), Math.sin(ang));
      const nose = add(craft.pos, scale(dir, 16));               // out the front
      const launch = add(scale(dir, 280), scale(craft.vel, 0.5)); // inherit craft momentum
      this.missiles.push({
        pos: nose, vel: launch, owner: 'player', life: 2.6,
        accel: wpn.accel, maxSpeed: wpn.maxSpeed, turn: wpn.seeker ? 6.5 : 0,
        dmg: this.upgrades.dmg, pierce: this.upgrades.pierce, trail: [],
      });
    }
    bus.post({ type: 'missileFire', owner: 'player', at: { ...craft.pos } });
    return true;
  }

  update(dt: number, craft: CraftState, bodies: Body[], gravityAt: (p: Vec2) => Vec2, bus: EventBus): void {
    this.clock += dt;
    if (this.playerCd > 0) this.playerCd -= dt;

    // reinforcements: waves arrive ever faster the longer you linger — danger
    // ramps so dawdling for score is a real gamble.
    this.fieldClock += dt;
    this.reinforceCd -= dt;
    if (this.reinforceCd <= 0 && craft.alive && this.enemies.length < Combat.MAX_ALIVE) {
      const wave = 1 + Math.floor(this.fieldClock / 25); // bigger waves later
      for (let i = 0; i < wave && this.enemies.length < Combat.MAX_ALIVE; i++) this.reinforce(craft.pos);
      this.reinforceCd = Math.max(2.2, 7 - this.fieldClock * 0.14); // interval shrinks over time
      bus.post({ type: 'enemySpawn', count: wave });
    }

    // ── enemies: hold a standoff distance, strafe, fire homing missiles ──
    for (const e of this.enemies) {
      const to = sub(craft.pos, e.pos); const d = len(to) || 1; const dir = scale(to, 1 / d);
      const move = d > e.standoff + 70 ? 1 : d < e.standoff - 70 ? -1 : 0;
      const perp = v(-dir.y, dir.x);
      e.vel = add(scale(dir, move * e.speed), scale(perp, 50 * Math.sin(this.clock * 1.3 + e.phase)));
      e.pos = add(e.pos, scale(e.vel, dt));
      e.cd -= dt;
      if (e.cd <= 0 && craft.alive && d < 860) {
        e.cd = 3.4; // fire less often
        // launch a burst with a wide aim error so they're easy to dodge — not snipers
        const baseA = Math.atan2(dir.y, dir.x);
        for (let s = 0; s < e.burst; s++) {
          const la = baseA + (Math.random() - 0.5) * 0.7 + (e.burst > 1 ? (s - (e.burst - 1) / 2) * 0.22 : 0);
          this.missiles.push({
            pos: { ...e.pos }, vel: v(Math.cos(la) * 140, Math.sin(la) * 140), owner: 'enemy', life: 3.4,
            accel: 300, maxSpeed: 290, turn: 1.4, dmg: 1, pierce: 0, trail: [], // slow + lazy turning
          });
        }
        bus.post({ type: 'missileFire', owner: 'enemy', at: { ...e.pos } });
      }
    }

    // ── missiles: accelerate + turn-limited homing, leave a trail ──
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const ms = this.missiles[i];
      ms.life -= dt;

      // steer toward target (turn-rate limited; turn=0 → no homing)
      const target = ms.owner === 'player' ? this.nearestEnemy(ms.pos) : (craft.alive ? craft : null);
      let ang = Math.atan2(ms.vel.y, ms.vel.x);
      if (target && ms.turn > 0) {
        const desired = Math.atan2(target.pos.y - ms.pos.y, target.pos.x - ms.pos.x);
        ang += Math.max(-ms.turn * dt, Math.min(ms.turn * dt, wrapAngle(desired - ang)));
      }
      // self-thrust along heading + amplified PLANET GRAVITY — missiles whip
      // around worlds and get slung hard near black holes
      ms.vel = add(ms.vel, scale(v(Math.cos(ang), Math.sin(ang)), ms.accel * dt));
      ms.vel = add(ms.vel, scale(gravityAt(ms.pos), MISSILE_GRAV * dt));
      const sp = len(ms.vel);
      if (sp > ms.maxSpeed) ms.vel = scale(ms.vel, ms.maxSpeed / sp);
      ms.pos = add(ms.pos, scale(ms.vel, dt));

      ms.trail.push({ ...ms.pos });
      if (ms.trail.length > TRAIL_LEN) ms.trail.shift();

      let dead = ms.life <= 0;
      if (!dead) for (const b of bodies) { if (dist(ms.pos, b.pos) <= b.radius) { dead = true; break; } }
      if (!dead && ms.owner === 'player') {
        for (const e of this.enemies) {
          if (dist(ms.pos, e.pos) < e.r + MISSILE_R + 4) {
            e.hp -= ms.dmg; bus.post({ type: 'enemyHit', at: { ...ms.pos } });
            if (e.hp <= 0) { this.enemies = this.enemies.filter((x) => x !== e); bus.post({ type: 'enemyDown', at: { ...e.pos }, charge: e.bounty }); }
            if (ms.pierce > 0) ms.pierce--;   // punch through to the next drone
            else dead = true;
            break;
          }
        }
      }
      if (!dead && ms.owner === 'enemy' && craft.alive && dist(ms.pos, craft.pos) < CRAFT_R + MISSILE_R) {
        dead = true; bus.post({ type: 'plateChipped', remaining: -1, at: { ...ms.pos } });
      }
      if (dead) { bus.post({ type: 'missileExplode', at: { ...ms.pos } }); this.missiles.splice(i, 1); }
    }
  }
}
