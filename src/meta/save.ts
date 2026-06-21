// Meta persistence — Embers and unlocks survive between runs (and reloads),
// stored in localStorage. A failed run is never wasted: you always bank Embers,
// and the galaxy slowly opens up.

export interface MetaSave {
  embers: number;
  unlockedHulls: string[];
  selectedHull: string;
  unlockedWeapons: string[];
  selectedWeapon: string;
  pact: number;                 // ascension level (opt-in difficulty)
  carried: string | null;       // one Resonance id carried into the next run
  highScores: number[];         // top scores, descending
  stats: { runs: number; deepest: number; relit: number };
}

const KEY = 'whorl-save-v1';

export function defaultSave(): MetaSave {
  return {
    embers: 0,
    unlockedHulls: ['seedling'],
    selectedHull: 'seedling',
    unlockedWeapons: ['unguided'],
    selectedWeapon: 'unguided',
    pact: 0,
    carried: null,
    highScores: [],
    stats: { runs: 0, deepest: 0, relit: 0 },
  };
}

/** Insert a score into the top-10 table (descending) and return its 1-based rank. */
export function recordScore(s: MetaSave, score: number): number {
  s.highScores.push(score);
  s.highScores.sort((a, b) => b - a);
  s.highScores = s.highScores.slice(0, 10);
  return s.highScores.indexOf(score) + 1;
}

export function loadSave(): MetaSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw) as Partial<MetaSave>;
    return { ...defaultSave(), ...s, stats: { ...defaultSave().stats, ...(s.stats ?? {}) } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(s: MetaSave): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
