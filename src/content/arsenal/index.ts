// Arsenal registry + offer logic. Adding a weapon = drop a module in weapons/
// and list it here. Everything else (combat, render, draft, pickups) is generic.

import type { ArsenalWeapon } from './types';
import { solarCorona } from './weapons/solar-corona';
import { vibroblade } from './weapons/vibroblade';
import { magmaCaster } from './weapons/magma-caster';
import { arcConductor } from './weapons/arc-conductor';
import { railNeedler } from './weapons/rail-needler';
import { seekerDarts } from './weapons/seeker-darts';
import { driftingMines } from './weapons/drifting-mines';

export * from './types';

export const ARSENAL: ArsenalWeapon[] = [
  solarCorona, vibroblade, magmaCaster, arcConductor, railNeedler, seekerDarts, driftingMines,
];

const BY_ID: Record<string, ArsenalWeapon> = Object.fromEntries(ARSENAL.map((w) => [w.id, w]));
export const arsenalById = (id: string): ArsenalWeapon | undefined => BY_ID[id];

export const MAX_ARSENAL = 3; // weapons you can carry per run

export interface LoadoutEntry { id: string; level: number; }
export interface WeaponOffer { type: 'unlock' | 'upgrade'; id: string; toLevel: number; weapon: ArsenalWeapon; }

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build up to `n` weapon offers for the between-sector draft, given the run loadout. */
export function weaponOffers(loadout: LoadoutEntry[], rng: () => number, n = 3): WeaponOffer[] {
  const owned = new Map(loadout.map((e) => [e.id, e.level]));
  const offers: WeaponOffer[] = [];

  // while you have room, prefer offering NEW weapons to unlock
  if (loadout.length < MAX_ARSENAL) {
    for (const w of shuffle(ARSENAL.filter((w) => !owned.has(w.id)), rng)) {
      if (offers.length >= n) break;
      offers.push({ type: 'unlock', id: w.id, toLevel: 1, weapon: w });
    }
  }
  // fill remaining slots (or, when full, all slots) with level-ups of owned weapons
  if (offers.length < n) {
    const upgradable = shuffle(loadout.filter((e) => {
      const w = BY_ID[e.id];
      return w && e.level < w.maxLevel;
    }), rng);
    for (const e of upgradable) {
      if (offers.length >= n) break;
      offers.push({ type: 'upgrade', id: e.id, toLevel: e.level + 1, weapon: BY_ID[e.id] });
    }
  }
  return offers;
}

/** A single grant for a pickup crate: a new weapon if there's room, else a random level-up. */
export function pickupOffer(loadout: LoadoutEntry[], rng: () => number): WeaponOffer | null {
  const [first] = weaponOffers(loadout, rng, 1);
  return first ?? null;
}
