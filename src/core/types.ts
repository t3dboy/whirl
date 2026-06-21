// Shared data contracts for WHORL.
//
// This is the spine every team builds against. Physics produces Bodies & a
// CraftState; Game wraps them in a System and a RunState; Content describes
// Resonances/Hulls/Bosses as plain data; Render & UI read these, never mutate.
//
// Keep this file pure types + enums. No logic, no imports beyond math.

import type { Vec2 } from './math';
import type { NodeType } from './events';

// ─────────────────────────────────────────────────────────────────
// Physics layer
// ─────────────────────────────────────────────────────────────────

export type BodyKind =
  | 'planet'   // standard, seedable
  | 'star'     // high mass, high heat, big harvest
  | 'moon'     // light, fast orbit
  | 'pulsar'   // emits gravity waves on a rhythm
  | 'blackhole'// extreme pull, no surface to seed
  | 'derelict';// inert anchor point

export interface Body {
  id: string;
  kind: BodyKind;
  /** Center of mass in world space (orbiting bodies update this each tick). */
  pos: Vec2;
  /** Gravitational parameter μ = G·M. The only mass term physics needs. */
  mu: number;
  /** Visible/collidable radius. Crash if craft center crosses this. */
  radius: number;
  /** Sphere of influence: gravity acts on the craft only inside this radius,
   *  tapering to zero at the edge so crossing it is smooth. */
  soiRadius: number;
  /** Heat band above the surface where skimming low banks bonus Charge / risks the hull. */
  heatRadius: number;
  /** Annulus [igniteInner, igniteOuter] where a clean orbit charges the world. */
  igniteInner: number;
  igniteOuter: number;
  /** Reignition progress 0..1 (runtime); a "spot on" orbit fills it. */
  ignition: number;
  /** Orbit of this body's center around `orbitParent` (or null = fixed). */
  orbit: Orbit | null;
  /** Pulsars only: a gravity wave fired on a rhythm. */
  pulse?: { period: number; strength: number; range: number; t: number };
  /** Stars & black holes crash you fatally regardless of hull. */
  lethal?: boolean;
  /** True once reignited; lit worlds glow and stop accruing ignition. */
  seeded: boolean;
  /** Base note (semitone offset within the sector scale) this body sounds. */
  tone: number;
  hue: number;
}

export interface Orbit {
  parentId: string | null; // null = orbits the system origin
  radius: number;
  /** Radians per second. Sign sets direction. */
  angularVel: number;
  phase: number; // current angle, advanced each tick
}

export interface CraftState {
  pos: Vec2;
  vel: Vec2;
  /** Facing angle (radians); thrust fires along this heading. */
  heading: number;
  /** Thrust magnitude this tick, 0..1 (set by input each frame). */
  thrust: number;
  /** Id of the body whose SOI the craft is currently inside (nearest), or null. */
  soiId: string | null;
  alive: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Run / game layer
// ─────────────────────────────────────────────────────────────────

/** One generated solar system — the "room". */
export interface System {
  id: string;
  nodeType: NodeType;
  sector: number;
  bodies: Body[];
  relics: RelicInstance[];
  /** How many worlds must be seeded to consider the system "cleared". */
  seedGoal: number;
  /** Bounds of the playfield in world units. */
  bounds: { min: Vec2; max: Vec2 };
  /** Sector musical key (semitone offset of the root). */
  musicalRoot: number;
}

export interface RelicInstance {
  id: string;
  resonanceId: string; // reward granted on grab
  pos: Vec2;
  grabbed: boolean;
}

/** A node on the branching star-chart. */
export interface ChartNode {
  id: string;
  type: NodeType;
  sector: number;
  depth: number;          // row index (0 = rim, increasing = deeper)
  next: string[];         // ids of reachable nodes one row down
  visited: boolean;
}

export interface StarChart {
  nodes: Record<string, ChartNode>;
  rootIds: string[];
  currentId: string | null;
  /** 0 = rim; advances toward 1 as the Pale climbs the chart. */
  paleDepth: number;
}

export interface RunState {
  seed: string;
  hullId: string;
  /** In-run wallet, minted by daring swings. */
  charge: number;
  /** Banked permanently even on a loss. */
  embersThisRun: number;
  /** Hull plates: current and max. */
  plates: number;
  maxPlates: number;
  /** Active run-only modifiers, in draft order. */
  resonances: string[];
  chart: StarChart;
  sector: number;
  systemsCleared: number;
  over: boolean;
  won: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Content layer (pure data; logic lives in systems that read it)
// ─────────────────────────────────────────────────────────────────

export type ResonanceFamily = 'flight' | 'orbit' | 'harvest' | 'hull' | 'combat' | 'exotic';
export type Rarity = 'common' | 'rare' | 'cosmic';

export interface Resonance {
  id: string;
  name: string;
  family: ResonanceFamily;
  rarity: Rarity;
  blurb: string;
  /** Tuning knobs read by the systems they touch. Merged across owned ones. */
  mods: Partial<ResonanceMods>;
}

/**
 * Every lever a Resonance can pull. Multipliers (…Mul) default 1 and MULTIPLY;
 * additive bonuses default 0 and ADD; flags default false and OR together.
 * The solver, the run, and main read these live — see content/resonances.ts.
 */
export interface ResonanceMods {
  // flight
  thrustMul: number;         // stronger thrusters
  dragMul: number;           // <1 = slipperier coasting
  afterburner: boolean;      // a tap-boost on double-thrust
  // orbit / ignition
  bandWiden: number;         // widens the ignition annulus (0..~1)
  igniteRateMul: number;     // worlds charge to life faster
  qualityAssist: number;     // lowers the orbit-quality floor (more forgiving)
  tractor: number;           // 0..1 gentle auto-correction toward a clean orbit
  magnet: boolean;           // relit worlds gently pull you (orbit chaining)
  // harvest
  deepGreedMul: number;      // more Charge from low skims
  chargeMul: number;         // global Charge multiplier (harvest + rewards)
  // hull / defense
  heatToleranceMul: number;  // skim lower before the hull chips
  grazeWard: number;         // forgiven crashes per field
  platesBonus: number;       // extra starting hull plates
  paleWard: number;          // (legacy, unused — Pale removed)
  shieldBonus: number;       // extra max shield cells
  shieldRegenMul: number;    // faster shield regeneration
  // combat
  fireRateMul: number;       // faster missile cadence
  multiShot: number;         // extra missiles per shot (spread)
  missileDmg: number;        // extra missile damage
  pierce: number;            // missiles punch through extra drones
  killChargeMul: number;     // more Charge from kills
  // exotic
  wakeTrail: boolean;        // leave a luminous trail
  chain: boolean;            // relighting a world boosts ignition + payout
}

export interface Hull {
  id: string;
  name: string;
  blurb: string;
  plates: number;
  /** Multipliers applied to the base craft feel. */
  mass: number;          // lower = nimbler
  snapPower: number;     // exit-speed multiplier on release
  startResonance?: string;
}

export interface Boss {
  id: string;
  name: string;
  sector: number;
  blurb: string;
  /** Soft timer in seconds (0 = untimed). */
  timeLimit: number;
  seedGoal: number;
}

// ─────────────────────────────────────────────────────────────────
// Meta layer
// ─────────────────────────────────────────────────────────────────

export interface MetaSave {
  embers: number;
  unlockedHulls: string[];
  unlockedResonances: string[];
  unlockedSectors: number;
  pactLevel: number;
  /** Per-system relit flags painting the galaxy map over many runs. */
  galaxyLit: Record<string, boolean>;
  stats: { runs: number; wins: number; deepest: number };
}
