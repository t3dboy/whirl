// Biomes — 12 distinct visual regions the descent cycles through. Each ret-
// unes the void colour, the cinematic grade wash, the starfield hue, and an
// accent, so every sector reads as a different stretch of the dying galaxy.
// Sector N uses BIOMES[N % 12]; paired with a per-level music track.

export interface Biome {
  name: string;
  bg: string;        // inner void gradient
  bgDeep: string;    // outer void gradient
  grade: [number, number, number, number]; // soft-light wash rgba
  star: number;      // starfield hue
  accent: number;    // ambient accent hue (SOI rings, fog)
}

// Geometry Wars keeps the void PURE BLACK and lets the neon do the talking, so
// every biome is near-black; the only difference is the grid/star/accent hue and
// a whisper of grade. Sectors read as different colour keys, not different fogs.
export const BIOMES: Biome[] = [
  { name: 'Ember Rim',      bg: '#050201', bgDeep: '#000000', grade: [255, 150, 70, 0.06], star: 34,  accent: 28 },
  { name: 'Cobalt Reach',   bg: '#000308', bgDeep: '#000000', grade: [70, 150, 255, 0.06], star: 210, accent: 210 },
  { name: 'Verdant Drift',  bg: '#000603', bgDeep: '#000000', grade: [80, 230, 150, 0.06], star: 150, accent: 150 },
  { name: 'Crimson Expanse',bg: '#060102', bgDeep: '#000000', grade: [255, 70, 80, 0.06],  star: 350, accent: 348 },
  { name: 'Violet Veil',    bg: '#040108', bgDeep: '#000000', grade: [180, 90, 255, 0.06], star: 280, accent: 285 },
  { name: 'Goldfield',      bg: '#060401', bgDeep: '#000000', grade: [255, 200, 60, 0.06], star: 48,  accent: 46 },
  { name: 'Frost Hollow',   bg: '#000406', bgDeep: '#000000', grade: [150, 220, 255, 0.06],star: 195, accent: 192 },
  { name: 'Toxic Mire',     bg: '#040601', bgDeep: '#000000', grade: [190, 230, 60, 0.06], star: 80,  accent: 85 },
  { name: 'Rose Nebula',    bg: '#060104', bgDeep: '#000000', grade: [255, 110, 190, 0.06],star: 330, accent: 325 },
  { name: 'Abyssal',        bg: '#000203', bgDeep: '#000000', grade: [60, 130, 140, 0.05], star: 200, accent: 198 },
  { name: 'Solar Bloom',    bg: '#060301', bgDeep: '#000000', grade: [255, 120, 40, 0.06], star: 24,  accent: 22 },
  { name: 'Aether',         bg: '#020308', bgDeep: '#000000', grade: [160, 180, 255, 0.06],star: 245, accent: 248 },
];

export const biomeFor = (depth: number): Biome => BIOMES[((depth % BIOMES.length) + BIOMES.length) % BIOMES.length];
