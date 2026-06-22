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
import { arsenalById, type ArsenalWeapon, type ArsenalCtx, type FxPrim, type ProjectileSpec } from '../content/arsenal';

export interface Enemy {
  id: number; pos: Vec2; vel: Vec2; hp: number; maxHp: number;
  r: number; bounty: number; standoff: number; speed: number; burst: number;
  cd: number; phase: number; kind: 'drone' | 'hulk' | 'spreader'; hue: number;
}
export interface Missile {
  pos: Vec2; vel: Vec2; owner: 'player' | 'enemy'; life: number;
  accel: number; maxSpeed: number; turn: number; // flight characteristics
  dmg: number;
  pierce: number; // extra drones it can punch through after a kill
  hue: number;    // trail/flame colour
  trail: Vec2[];
  explodeRadius?: number; // arsenal: AoE on death
  ricochet?: number;      // arsenal: bounces (future)
  radius?: number;        // arsenal: collision radius override
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
  frozen = false; // Time Stop — enemies hold still and don't fire
  playerHue = 185; // player missile colour (set per hull each run)
  /** Flame Halo state when the flamethrower is equipped (else null). angle sweeps,
   *  swoop is how far the spray trails behind the nozzle as it whirls. */
  flame: { reach: number; jets: number; spin: number; dmg: number; angle: number; swoop: number } | null = null;
  flameDmgMul = 1; // overdrive etc. scale the burn (set from main each frame)
  // ── collected in-run arsenal (auto-weapons) + their transient effects ──
  arsenal: { w: ArsenalWeapon; level: number; state: Record<string, number> }[] = [];
  fx: FxPrim[] = [];
  mines: { x: number; y: number; dmg: number; radius: number; life: number; arm: number; hue: number }[] = [];
  hpFrac = 1; // craft hull fraction (set from main; used by some arsenal weapons)
  private clock = 0;
  private nid = 1;
  // reinforcements: the longer you linger in a field, the faster they arrive
  private fieldClock = 0;
  private reinforceCd = 0;
  private bounds: { min: Vec2; max: Vec2 } = { min: v(-2000, -2000), max: v(2000, 2000) };
  private spawnDepth = 0;
  private static MAX_ALIVE = 24;

  reset(): void { this.enemies = []; this.missiles = []; this.playerCd = 0; this.fx = []; this.mines = []; }

  /** Rebuild the live arsenal from the run loadout, preserving per-weapon state by id. */
  setArsenal(loadout: { id: string; level: number }[]): void {
    const prev = new Map(this.arsenal.map((a) => [a.w.id, a]));
    this.arsenal = [];
    for (const e of loadout) {
      const w = arsenalById(e.id);
      if (w) this.arsenal.push({ w, level: e.level, state: prev.get(e.id)?.state ?? {} });
    }
  }

  private tickArsenal(dt: number, craft: CraftState, bus: EventBus): void {
    for (const inst of this.arsenal) {
      const ctx: ArsenalCtx = {
        dt, t: this.clock, level: inst.level, rng: Math.random,
        craft: { pos: craft.pos, vel: craft.vel, heading: craft.heading, hpFrac: this.hpFrac },
        enemies: this.enemies,
        state: inst.state,
        nearestEnemy: (from, maxDist = Infinity, exclude) => {
          let best: Enemy | null = null, bd = Infinity;
          for (const e of this.enemies) {
            if (exclude && exclude.has(e.id)) continue;
            const d = dist(from, e.pos);
            if (d < bd && d <= maxDist) { bd = d; best = e; }
          }
          return best;
        },
        enemiesInRadius: (c, r) => this.enemies.filter((e) => dist(c, e.pos) < r + e.r),
        enemiesInArc: (c, facing, half, r) => this.enemies.filter((e) => {
          const d = dist(c, e.pos); if (d > r + e.r) return false;
          return Math.abs(wrapAngle(Math.atan2(e.pos.y - c.y, e.pos.x - c.x) - facing)) <= half;
        }),
        damage: (e, amt) => {
          const en = e as Enemy; en.hp -= amt;
          if (Math.random() < 0.18) bus.post({ type: 'enemyHit', at: { ...en.pos } });
          if (en.hp <= 0) { this.enemies = this.enemies.filter((x) => x !== en); bus.post({ type: 'enemyDown', at: { ...en.pos }, charge: en.bounty }); }
        },
        spawnProjectile: (spec) => this.spawnArsenalProjectile(spec),
        spawnMine: (x, y, o) => { this.mines.push({ x, y, dmg: o.dmg, radius: o.radius, life: o.life, arm: o.armTime, hue: o.hue }); },
        fx: (p) => { if (this.fx.length < 240) this.fx.push(p); },
      };
      inst.w.tick(ctx);
    }
  }

  private spawnArsenalProjectile(spec: ProjectileSpec): void {
    const vlen = len(spec.vel) || 1;
    this.missiles.push({
      pos: { ...spec.pos }, vel: { ...spec.vel }, owner: 'player', life: spec.life,
      accel: spec.accel ?? 0, maxSpeed: spec.maxSpeed ?? Math.max(vlen, 1),
      turn: spec.homing ?? 0, dmg: spec.dmg, pierce: spec.pierce ?? 0, hue: spec.hue, trail: [],
      explodeRadius: spec.explodeRadius, ricochet: spec.ricochet, radius: spec.radius,
    });
  }

  private updateMines(dt: number, bus: EventBus): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.life -= dt; if (m.arm > 0) m.arm -= dt;
      let det = m.life <= 0;
      if (!det && m.arm <= 0) for (const e of this.enemies) { if (dist({ x: m.x, y: m.y }, e.pos) < m.radius) { det = true; break; } }
      if (!det) continue;
      for (const e of this.enemies.slice()) {
        if (dist({ x: m.x, y: m.y }, e.pos) < m.radius + e.r) {
          e.hp -= m.dmg; bus.post({ type: 'enemyHit', at: { ...e.pos } });
          if (e.hp <= 0) { this.enemies = this.enemies.filter((x) => x !== e); bus.post({ type: 'enemyDown', at: { ...e.pos }, charge: e.bounty }); }
        }
      }
      if (this.fx.length < 240) this.fx.push({ kind: 'blast', x: m.x, y: m.y, r: m.radius, hue: m.hue, life: 0.4, max: 0.4 });
      bus.post({ type: 'missileExplode', at: { x: m.x, y: m.y } });
      this.mines.splice(i, 1);
    }
  }

  /** How many drones a sector should hold — a real swarm that grows as you fall. */
  static countFor(depth: number, pact: number): number {
    return Math.min(16, 2 + Math.round(depth * 2.2) + pact * 2);
  }

  private makeEnemy(pos: Vec2, depth: number, rnd: () => number): Enemy {
    const base = { id: this.nid++, pos: { ...pos }, vel: v(0, 0), phase: rnd() * 6.28 };
    // Spreaders — fire 4 ways, appear from sector 5 (depth >= 4)
    if (depth >= 4 && rnd() < Math.min(0.32, (depth - 3) * 0.12)) {
      return { ...base, hp: 2, maxHp: 2, r: 18, bounty: 85, standoff: 540, speed: 48, burst: 4, cd: 3 + rnd() * 2, kind: 'spreader', hue: 265 };
    }
    // Hulks — big, tanky, twin-fire, from sector 3 (depth >= 2)
    if (depth >= 2 && rnd() < Math.min(0.45, (depth - 1) * 0.14)) {
      return { ...base, hp: 4, maxHp: 4, r: 24, bounty: 120, standoff: 560, speed: 60, burst: 2, cd: 2.5 + rnd() * 2.5, kind: 'hulk', hue: 325 };
    }
    // Drones — light, fast, single-fire
    return { ...base, hp: 1, maxHp: 1, r: 11, bounty: 35, standoff: 480, speed: 95, burst: 1, cd: 2 + rnd() * 2.5, kind: 'drone', hue: 350 };
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

  /** Nuke — destroy every enemy within `radius` of a point. Returns the kills. */
  nukeAround(center: Vec2, radius: number, bus: EventBus): number {
    let n = 0;
    for (const e of this.enemies.slice()) {
      if (dist(center, e.pos) <= radius) {
        this.enemies = this.enemies.filter((x) => x !== e);
        bus.post({ type: 'enemyDown', at: { ...e.pos }, charge: e.bounty });
        n++;
      }
    }
    return n;
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
  /**
   * Flame Halo — the jets sweep around the craft and burn anything inside a jet
   * cone within reach. Damage is continuous (per-second), so enemy hp ticks down
   * as the fire washes over them; enemy missiles caught in the flame are snuffed.
   */
  private static FLAME_HALF = 0.4; // jet cone half-angle (radians)
  private tickFlame(dt: number, craft: CraftState, bus: EventBus): void {
    const f = this.flame;
    if (!f || !craft.alive) return;
    f.angle = wrapAngle(f.angle + f.spin * dt);
    const burn = f.dmg * this.flameDmgMul * dt;
    // The spray trails behind the nozzle as it whirls: fire at distance fraction
    // t lags the current angle by swoop·t, so damage follows the same swooping
    // curve you see drawn.
    const inJet = (dx: number, dy: number, extra: number): boolean => {
      const d = Math.hypot(dx, dy);
      if (d > f.reach + extra) return false;
      if (d < 8) return true;
      const t = Math.min(1, d / f.reach);
      const ang = Math.atan2(dy, dx);
      for (let j = 0; j < f.jets; j++) {
        const at = f.angle + (j / f.jets) * Math.PI * 2 - f.swoop * t; // trailing curve
        if (Math.abs(wrapAngle(ang - at)) < Combat.FLAME_HALF) return true;
      }
      return false;
    };
    for (const e of this.enemies.slice()) {
      if (!inJet(e.pos.x - craft.pos.x, e.pos.y - craft.pos.y, e.r)) continue;
      e.hp -= burn;
      if (Math.random() < 0.35) bus.post({ type: 'enemyHit', at: { ...e.pos } });
      if (e.hp <= 0) {
        this.enemies = this.enemies.filter((x) => x !== e);
        bus.post({ type: 'enemyDown', at: { ...e.pos }, charge: e.bounty });
      }
    }
    // snuff enemy missiles that drift into the fire
    for (const ms of this.missiles) {
      if (ms.owner !== 'enemy' || ms.life <= 0) continue;
      if (inJet(ms.pos.x - craft.pos.x, ms.pos.y - craft.pos.y, MISSILE_R)) {
        ms.life = 0; bus.post({ type: 'enemyHit', at: { ...ms.pos } });
      }
    }
  }

  firePlayer(craft: CraftState, bus: EventBus): boolean {
    if (this.flame) return false; // the flamethrower has no manual fire — it always burns
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
        dmg: this.upgrades.dmg, pierce: this.upgrades.pierce, hue: this.playerHue, trail: [],
      });
    }
    bus.post({ type: 'missileFire', owner: 'player', at: { ...craft.pos } });
    return true;
  }

  update(dt: number, craft: CraftState, bodies: Body[], gravityAt: (p: Vec2) => Vec2, bus: EventBus): void {
    this.clock += dt;
    if (this.playerCd > 0) this.playerCd -= dt;
    if (this.flame) this.tickFlame(dt, craft, bus);

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
    // (Time Stop freezes them in place — they neither move nor fire)
    if (!this.frozen) for (const e of this.enemies) {
      const to = sub(craft.pos, e.pos); const d = len(to) || 1; const dir = scale(to, 1 / d);
      const move = d > e.standoff + 70 ? 1 : d < e.standoff - 70 ? -1 : 0;
      const perp = v(-dir.y, dir.x);
      e.vel = add(scale(dir, move * e.speed), scale(perp, 50 * Math.sin(this.clock * 1.3 + e.phase)));
      e.pos = add(e.pos, scale(e.vel, dt));
      e.cd -= dt;
      if (e.cd <= 0 && craft.alive && d < 860) {
        e.cd = 3.4; // fire less often
        const baseA = Math.atan2(dir.y, dir.x);
        for (let s = 0; s < e.burst; s++) {
          // spreaders fire evenly in all directions (rotating); others aim with a
          // wide error so they're easy to dodge — not snipers
          const la = e.kind === 'spreader'
            ? this.clock * 0.6 + (s / e.burst) * Math.PI * 2
            : baseA + (Math.random() - 0.5) * 1.3 + (e.burst > 1 ? (s - (e.burst - 1) / 2) * 0.22 : 0);
          this.missiles.push({
            pos: { ...e.pos }, vel: v(Math.cos(la) * 140, Math.sin(la) * 140), owner: 'enemy', life: 3.0,
            accel: 240, maxSpeed: 250, turn: e.kind === 'spreader' ? 0 : 0.55, dmg: 1, pierce: 0, hue: e.hue, trail: [],
          });
        }
        bus.post({ type: 'missileFire', owner: 'enemy', at: { ...e.pos } });
      }
    }

    // ── collected arsenal weapons fire, mines tick, transient fx age ──
    if (this.arsenal.length && craft.alive) this.tickArsenal(dt, craft, bus);
    this.updateMines(dt, bus);
    for (let i = this.fx.length - 1; i >= 0; i--) { this.fx[i].life -= dt; if (this.fx[i].life <= 0) this.fx.splice(i, 1); }

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
      // homing redirects the velocity toward the (steered) heading so seekers
      // actually chase; unguided keep their heading and only bend under gravity.
      const speed = Math.min(ms.maxSpeed, len(ms.vel) + ms.accel * dt);
      ms.vel = v(Math.cos(ang) * speed, Math.sin(ang) * speed);
      // amplified PLANET GRAVITY still whips them around worlds / black holes
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
          if (dist(ms.pos, e.pos) < e.r + (ms.radius ?? MISSILE_R) + 4) {
            e.hp -= ms.dmg; bus.post({ type: 'enemyHit', at: { ...ms.pos } });
            if (e.hp <= 0) { this.enemies = this.enemies.filter((x) => x !== e); bus.post({ type: 'enemyDown', at: { ...e.pos }, charge: e.bounty }); }
            if (ms.pierce > 0) ms.pierce--;   // punch through to the next drone
            else dead = true;
            break;
          }
        }
      }
      // player shots can knock enemy missiles out of the sky on contact
      if (!dead && ms.owner === 'player') {
        for (const em of this.missiles) {
          if (em.owner !== 'enemy' || em.life <= 0) continue;
          if (dist(ms.pos, em.pos) < MISSILE_R * 2 + 4) {
            em.life = 0; bus.post({ type: 'enemyHit', at: { ...em.pos } }); // explodes on its own cleanup
            if (ms.pierce > 0) ms.pierce--; else dead = true;
            break;
          }
        }
      }
      if (!dead && ms.owner === 'enemy' && craft.alive && dist(ms.pos, craft.pos) < CRAFT_R + MISSILE_R) {
        dead = true; bus.post({ type: 'plateChipped', remaining: -1, at: { ...ms.pos } });
      }
      if (dead) {
        if (ms.explodeRadius && ms.owner === 'player') {
          for (const e of this.enemies.slice()) {
            if (dist(ms.pos, e.pos) < ms.explodeRadius + e.r) {
              e.hp -= ms.dmg;
              if (e.hp <= 0) { this.enemies = this.enemies.filter((x) => x !== e); bus.post({ type: 'enemyDown', at: { ...e.pos }, charge: e.bounty }); }
            }
          }
          if (this.fx.length < 240) this.fx.push({ kind: 'blast', x: ms.pos.x, y: ms.pos.y, r: ms.explodeRadius, hue: ms.hue, life: 0.4, max: 0.4 });
        }
        bus.post({ type: 'missileExplode', at: { ...ms.pos } }); this.missiles.splice(i, 1);
      }
    }
  }
}
