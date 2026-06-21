// Hulls — the deepest replay axis. Each starting craft rewrites your default
// flight feel via the same `mods` levers the Resonances use, so a hull is just a
// permanent baseline build. Unlocked with Embers between runs.

import type { ResonanceMods } from '../core/types';

export interface HullDef {
  id: string;
  name: string;
  blurb: string;
  cost: number;           // Embers to unlock (0 = starter)
  plates: number;         // base hull plates
  mods: Partial<ResonanceMods>;
}

export const HULLS: HullDef[] = [
  { id: 'seedling', name: 'Seedling', cost: 0, plates: 3,
    blurb: 'The last seed-craft. Balanced, dependable, unremarkable.',
    mods: {} },
  { id: 'glass', name: 'Glass', cost: 45, plates: 2,
    blurb: 'Fast and razor-responsive — but it shatters if you blink. 2 plates.',
    mods: { thrustMul: 1.4, dragMul: 0.7 } },
  { id: 'anchor', name: 'Anchor', cost: 70, plates: 5,
    blurb: 'A slab of a ship. Sluggish thrust, but five plates of forgiveness.',
    mods: { thrustMul: 0.82 } },
  { id: 'comet', name: 'Comet', cost: 95, plates: 3,
    blurb: 'Frictionless. Coasts forever and kindles worlds a touch faster.',
    mods: { dragMul: 0.4, igniteRateMul: 1.15, wakeTrail: true } },
  { id: 'forge', name: 'Forge', cost: 130, plates: 4,
    blurb: 'Built to harvest. Everything you earn pays far more.',
    mods: { chargeMul: 1.6, thrustMul: 0.92 } },
];

const BY_ID: Record<string, HullDef> = Object.fromEntries(HULLS.map((h) => [h.id, h]));
export const hullById = (id: string): HullDef => BY_ID[id] ?? HULLS[0];
