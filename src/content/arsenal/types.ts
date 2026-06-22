// Arsenal — the in-run collectible weapon system. You start a run with NONE of
// these; you collect up to 3 between sectors (draft) and via the odd pickup, and
// level them up. They auto-fire — no aiming — layered on top of your hangar
// weapon. Every weapon is a self-contained module implementing `ArsenalWeapon`
// against the `ArsenalCtx` contract below, so new weapons drop in without
// touching the combat/render core. THIS FILE IS THE CONTRACT — keep it stable.

import type { Vec2 } from '../../core/math';

export type WeaponArchetype =
  | 'aura' | 'melee' | 'projectile' | 'chain' | 'gravity'
  | 'mine' | 'beam' | 'dot' | 'defensive' | 'special';

export interface WeaponStats {
  cooldown: number; // seconds between activations (0 = act every frame, e.g. auras)
  damage: number;   // per hit, or per-second for continuous weapons
  reach: number;    // radius / range / arc length in world units
  count: number;    // archetype-specific: projectiles, jets, chain jumps, mines…
  extra?: number;   // one spare knob a weapon may use (blast radius, speed…)
}

/** A live enemy, structurally — the real combat Enemy satisfies this. */
export interface EnemyRef { id: number; pos: Vec2; hp: number; r: number; bounty: number; }

/** A transient visual primitive the renderer draws generically (by `kind`). */
export interface FxPrim {
  kind: 'ring' | 'arc' | 'beam' | 'blast' | 'bolt' | 'mine' | 'well';
  x: number; y: number;
  r?: number;            // radius (ring/blast/mine/well/arc)
  a0?: number; a1?: number; // arc start/end angle
  x2?: number; y2?: number; // beam endpoint
  pts?: number[];        // bolt: flattened [x0,y0,x1,y1,…] world points
  hue: number;
  width?: number;
  life: number; max: number; // life counts down; max for fade math
}

/** What a weapon hands `spawnProjectile`; combat turns it into a player missile. */
export interface ProjectileSpec {
  pos: Vec2; vel: Vec2;
  hue: number; dmg: number; life: number;
  pierce?: number;        // extra enemies it punches through
  homing?: number;        // turn rate (rad/s); 0 = straight
  maxSpeed?: number; accel?: number;
  explodeRadius?: number; // AoE on death
  ricochet?: number;      // bounces off bodies/walls
  radius?: number;        // collision radius
}

/** Everything a weapon's `tick` gets each frame. Stable contract. */
export interface ArsenalCtx {
  dt: number;
  t: number;              // global clock (seconds)
  level: number;          // this weapon's current level (1..maxLevel)
  rng: () => number;      // 0..1
  craft: { pos: Vec2; vel: Vec2; heading: number; hpFrac: number }; // hpFrac 0..1
  enemies: EnemyRef[];
  /** Per-instance scratch space (cooldown timers, charge, etc.) — persists across frames. */
  state: Record<string, number>;

  // ── queries ──
  nearestEnemy(from: Vec2, maxDist?: number, exclude?: Set<number>): EnemyRef | null;
  enemiesInRadius(center: Vec2, radius: number): EnemyRef[];
  enemiesInArc(center: Vec2, facing: number, half: number, radius: number): EnemyRef[];

  // ── effects ──
  damage(e: EnemyRef, amount: number): void;
  spawnProjectile(spec: ProjectileSpec): void;
  spawnMine(x: number, y: number, opts: { dmg: number; radius: number; life: number; armTime: number; hue: number }): void;
  fx(p: FxPrim): void;
}

export interface ArsenalWeapon {
  id: string;
  name: string;
  blurb: string;
  archetype: WeaponArchetype;
  maxLevel: number;
  /** Numeric stats for a given level. */
  stats(level: number): WeaponStats;
  /** Run once per frame while owned. Use ctx to query + deal damage + spawn fx. */
  tick(ctx: ArsenalCtx): void;
}

/** A cooldown helper: returns true (and resets the timer) when ready to fire. */
export function ready(ctx: ArsenalCtx, cooldown: number): boolean {
  const left = (ctx.state.cd ?? 0) - ctx.dt;
  if (left <= 0) { ctx.state.cd = cooldown; return true; }
  ctx.state.cd = left;
  return false;
}
