// Weapons — the player's loadout, bought with Embers in the Hangar.
//
// Two families:
//  · MISSILE weapons fire projectiles from the nose (Slug Cannon, Heat-Seeker).
//  · The FLAME weapon is a rotating flamethrower — jets of fire that sweep
//    around the craft, burning anything they touch. It LEVELS UP: each level
//    reaches further, spins faster, and eventually splits into more jets, so it
//    grows from a flicker into a roaring inferno over many runs.

export type WeaponKind = 'missile' | 'flame';

export interface WeaponDef {
  id: string;
  name: string;
  blurb: string;
  cost: number;       // Embers to unlock (0 = starter); for flame this is the L1 unlock
  kind: WeaponKind;
  seeker: boolean;    // (missile) homes onto the nearest enemy vs. flying straight
  maxSpeed: number;   // (missile)
  accel: number;      // (missile)
}

export const WEAPONS: WeaponDef[] = [
  { id: 'unguided', name: 'Slug Cannon', cost: 0, kind: 'missile', seeker: false, maxSpeed: 560, accel: 700,
    blurb: 'Dumb-fire slugs that sling wildly through gravity. Lead your shots.' },
  { id: 'seeker', name: 'Heat-Seeker', cost: 600, kind: 'missile', seeker: true, maxSpeed: 540, accel: 680,
    blurb: 'Locks onto the nearest drone and chases it through the gravity wells.' },
  { id: 'flame', name: 'Flame Halo', cost: 700, kind: 'flame', seeker: false, maxSpeed: 0, accel: 0,
    blurb: 'A jet of fire that whirls around your hull, burning all it sweeps. Level it up — longer reach, more jets, faster spin.' },
];

const BY_ID: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const weaponById = (id: string): WeaponDef => BY_ID[id] ?? WEAPONS[0];

// ── Flame Halo levelling ──────────────────────────────────────────────
export const FLAME_MAX_LEVEL = 6;

export interface FlameStats {
  reach: number;   // world units the jet extends from the hull
  jets: number;    // evenly-spaced jets sweeping around the craft
  spin: number;    // radians/sec the halo rotates
  dmg: number;     // damage per second to anything in a jet
}

const FLAME_TABLE: FlameStats[] = [
  { reach: 300, jets: 1, spin: 1.6, dmg: 2.6 }, // L1 — a single flickering tongue
  { reach: 413, jets: 1, spin: 1.9, dmg: 3.2 }, // L2 — reaches further
  { reach: 413, jets: 2, spin: 2.0, dmg: 3.2 }, // L3 — a second opposed jet
  { reach: 538, jets: 2, spin: 2.5, dmg: 4.0 }, // L4 — longer, faster
  { reach: 538, jets: 3, spin: 2.9, dmg: 4.0 }, // L5 — a third jet
  { reach: 700, jets: 3, spin: 3.6, dmg: 5.0 }, // L6 — a roaring inferno
];

export const FLAME_TITLES = ['Flicker', 'Tongue', 'Twin Jet', 'Lash', 'Triad', 'Inferno'];

export function flameStats(level: number): FlameStats {
  const L = Math.max(1, Math.min(FLAME_MAX_LEVEL, level));
  return FLAME_TABLE[L - 1];
}

/** Ember cost to reach `targetLevel` (1 = unlock). Escalates hard. */
export function flameLevelCost(targetLevel: number): number {
  const costs = [700, 900, 1300, 1900, 2700, 3800];
  return costs[targetLevel - 1] ?? Infinity;
}
