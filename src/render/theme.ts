// Visual identity — GEOMETRY WARS. Pure black void, saturated neon vector line
// art, and an over-bright bloom that floods the screen with colour. Nothing is
// textured or filled: everything is a thin glowing outline. Simple, but
// striking. The warping grid (render/grid.ts) sits under it all.
// Change THEME and the whole game regrades.

export interface Theme {
  bg: string;
  bgDeep: string;
  void: string;
  ink: string;        // primary text (warm off-white)
  inkDim: string;
  panel: string;
  panelBorder: string;
  tether: string;
  tetherHot: string;
  ghost: string;
  charge: string;     // the harvest gold/amber
  ember: string;      // meta currency
  danger: string;     // heat / crash
  good: string;       // relit / heal — warm amber
  pale: string;       // legacy (unused)
  rarity: Record<'common' | 'rare' | 'cosmic', string>;
  font: string;
  fontDisplay: string;
}

export const THEME: Theme = {
  bg: '#000306',
  bgDeep: '#000000',
  void: '#00060e',
  ink: '#ffffff',
  inkDim: '#7d94b0',
  panel: '#03080f',
  panelBorder: '#1b4a7a',
  tether: '#00e5ff',
  tetherHot: '#ffffff',
  ghost: '#2f5a80',
  charge: '#ffe94d',
  ember: '#c04dff',   // the gem motes — purple, per your call
  danger: '#ff2b5e',
  good: '#39ff88',
  pale: '#9fd0ff',
  rarity: { common: '#8fa3bf', rare: '#00e5ff', cosmic: '#ff2bd6' },
  font: '600 14px ui-monospace, "SF Mono", Menlo, monospace',
  fontDisplay: '800 28px ui-rounded, "Avenir Next", system-ui, sans-serif',
};

/** Body palette by kind — saturated neon, one hue per kind. */
export const BODY_HUES: Record<string, number> = {
  planet: 190,
  star: 48,
  moon: 205,
  pulsar: 185,
  blackhole: 288,
  derelict: 32,
};

/** Enemy hues — shape + colour together encode the threat, GW-style. */
export const ENEMY_HUES: Record<string, number> = {
  drone: 205,      // blue diamond — the chaser
  hulk: 288,       // violet hexagon — the heavy
  spreader: 320,   // magenta square — the 4-way shooter
};

export function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

/** Round-rect path helper (chunky panels). */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
