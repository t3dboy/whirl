// Hulls — the deepest replay axis. Each starting craft rewrites your flight feel
// via the same `mods` levers the Resonances use, has its own dramatic look
// (shape + colours, drawn the same in-game and on the selection cards), and its
// own missile colour. Unlocked with Embers — costs escalate hard so reaching
// the Forge takes many runs.

import type { ResonanceMods } from '../core/types';

export type HullShape = 'dart' | 'arrow' | 'tank' | 'comet' | 'forge';

export interface HullDef {
  id: string;
  name: string;
  blurb: string;
  cost: number;             // Embers to unlock (0 = starter)
  plates: number;
  shape: HullShape;
  body: string;             // hull fill
  edge: string;             // outline / accent
  missileHue: number;       // this hull's missile colour
  mods: Partial<ResonanceMods>;
}

export const HULLS: HullDef[] = [
  { id: 'seedling', name: 'Seedling', cost: 0, plates: 3, shape: 'dart',
    body: '#eafffb', edge: '#19b6c2', missileHue: 185,
    blurb: 'The last seed-craft. Balanced, dependable, unremarkable.',
    mods: {} },
  { id: 'glass', name: 'Glass', cost: 350, plates: 2, shape: 'arrow',
    body: '#ffe6ff', edge: '#ff3cc8', missileHue: 320,
    blurb: 'Fast and razor-responsive — but it shatters if you blink. 2 plates.',
    mods: { thrustMul: 1.4, dragMul: 0.7 } },
  { id: 'anchor', name: 'Anchor', cost: 1100, plates: 5, shape: 'tank',
    body: '#ffd9a8', edge: '#ff6a2c', missileHue: 22,
    blurb: 'A slab of a ship. Sluggish thrust, but five plates of forgiveness.',
    mods: { thrustMul: 0.82 } },
  { id: 'comet', name: 'Comet', cost: 3000, plates: 3, shape: 'comet',
    body: '#d6ffe8', edge: '#2cff9d', missileHue: 150,
    blurb: 'Frictionless twin-gun. Coasts forever, fires two shots at once, and kindles worlds a touch faster.',
    mods: { dragMul: 0.4, igniteRateMul: 1.15, wakeTrail: true, multiShot: 1 } },
  { id: 'forge', name: 'Forge', cost: 7000, plates: 4, shape: 'forge',
    body: '#ffe9b0', edge: '#ffae1f', missileHue: 45,
    blurb: 'Built to harvest. Everything you earn pays far more.',
    mods: { chargeMul: 1.6, thrustMul: 0.92 } },
];

const BY_ID: Record<string, HullDef> = Object.fromEntries(HULLS.map((h) => [h.id, h]));
export const hullById = (id: string): HullDef => BY_ID[id] ?? HULLS[0];
