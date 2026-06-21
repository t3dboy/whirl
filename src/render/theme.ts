// Visual identity — REPLACED-inspired. NOT neon-cyberpunk: a warm, sepia-toned
// dark sci-fi look. Deep warm-black voids, muted cold dead worlds, and warm
// amber light that BLOOMS back as you relight the galaxy. Heavy cinematic
// bloom, vignette, film grain, and a chunky low-res pixel buffer do the rest.
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
  bg: '#0d0a0c',
  bgDeep: '#060406',
  void: '#171015',
  ink: '#f4ead6',
  inkDim: '#9c8a76',
  panel: '#1f1820',
  panelBorder: '#473542',
  tether: '#6fd8d0',
  tetherHot: '#fff3d8',
  ghost: '#a8b0a0',
  charge: '#ffb347',
  ember: '#ff7a3c',
  danger: '#ff5a4d',
  good: '#ffb24a',
  pale: '#b9c7ff',
  rarity: { common: '#c2b196', rare: '#5fd6e0', cosmic: '#ff5cae' },
  font: '600 14px ui-monospace, "SF Mono", Menlo, monospace',
  fontDisplay: '800 28px ui-rounded, "Avenir Next", system-ui, sans-serif',
};

/** Body palette by kind — cold for the dead, warm for the lit. */
export const BODY_HUES: Record<string, number> = {
  planet: 188,
  star: 34,
  moon: 196,
  pulsar: 192,
  blackhole: 286,
  derelict: 30,
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
