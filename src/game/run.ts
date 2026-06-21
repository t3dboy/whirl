// The run — descent through deepening fields. Each field is a generated
// planet-field (see field.ts); relight a goal number of worlds to open the warp
// gate at the core and fall deeper. Deeper (and higher Ascension) fields are
// bigger, fuller, and meaner.

import { generateField } from './field';
import type { Body, RelicInstance } from '../core/types';

export interface FieldState {
  bodies: Body[];
  relics: RelicInstance[];
  spawn: { x: number; y: number };
  bounds: { min: { x: number; y: number }; max: { x: number; y: number } };
  goal: number;          // worlds to relight to open the warp
}

export class Run {
  depth = 0;
  pact = 0;             // ascension offset — generates as if deeper, for richer hazards

  constructor(public seed: string, pact = 0) { this.pact = pact; }

  /** Build the field for the current depth (hazards scale with depth + pact). */
  startField(): FieldState {
    const d = this.depth;
    const hd = d + this.pact; // hazard depth
    const f = generateField(`${this.seed}-d${d}`, {
      count: Math.min(24, 12 + hd * 2),
      extent: 1700 + hd * 160,
      spacing: 40,
      depth: hd,
    });
    // a tight, punchy goal — relight 4 worlds (or fewer if the field is small)
    const reignitable = f.bodies.filter((b) => b.kind !== 'star' && b.kind !== 'blackhole').length;
    const goal = Math.min(4, reignitable);
    return { ...f, goal };
  }

  warpDeeper(): FieldState {
    this.depth++;
    return this.startField();
  }
}
