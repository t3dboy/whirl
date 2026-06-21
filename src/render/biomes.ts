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

export const BIOMES: Biome[] = [
  { name: 'Ember Rim',      bg: '#120c0a', bgDeep: '#070405', grade: [255, 150, 70, 0.22], star: 34,  accent: 30 },
  { name: 'Cobalt Reach',   bg: '#080f1c', bgDeep: '#03060e', grade: [70, 150, 255, 0.20], star: 210, accent: 205 },
  { name: 'Verdant Drift',  bg: '#0a1610', bgDeep: '#040907', grade: [80, 230, 150, 0.18], star: 150, accent: 155 },
  { name: 'Crimson Expanse',bg: '#1a0a0c', bgDeep: '#0c0405', grade: [255, 70, 80, 0.22],  star: 5,   accent: 352 },
  { name: 'Violet Veil',    bg: '#140a1c', bgDeep: '#08040e', grade: [180, 90, 255, 0.22], star: 280, accent: 285 },
  { name: 'Goldfield',      bg: '#16110a', bgDeep: '#0a0703', grade: [255, 200, 60, 0.22], star: 48,  accent: 44 },
  { name: 'Frost Hollow',   bg: '#0b1418', bgDeep: '#04090c', grade: [150, 220, 255, 0.20],star: 195, accent: 190 },
  { name: 'Toxic Mire',     bg: '#12160a', bgDeep: '#070903', grade: [190, 230, 60, 0.20], star: 80,  accent: 90 },
  { name: 'Rose Nebula',    bg: '#1a0c14', bgDeep: '#0c050a', grade: [255, 110, 190, 0.22],star: 330, accent: 325 },
  { name: 'Abyssal',        bg: '#06090c', bgDeep: '#020304', grade: [60, 130, 140, 0.16], star: 200, accent: 195 },
  { name: 'Solar Bloom',    bg: '#1c0e06', bgDeep: '#0d0502', grade: [255, 120, 40, 0.24], star: 24,  accent: 20 },
  { name: 'Aether',         bg: '#0e0f1a', bgDeep: '#05060d', grade: [160, 180, 255, 0.20],star: 245, accent: 250 },
];

export const biomeFor = (depth: number): Biome => BIOMES[((depth % BIOMES.length) + BIOMES.length) % BIOMES.length];
