// Shared ship silhouettes — one per hull, so each craft looks dramatically
// different. Drawn pointing +x at the origin (caller translates/rotates), scaled
// by `s`. Used both for the in-game craft and the hangar selection previews.

import type { HullDef } from '../content/hulls';

function poly(ctx: CanvasRenderingContext2D, pts: number[][]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export function drawShip(ctx: CanvasRenderingContext2D, hull: HullDef, s: number): void {
  ctx.fillStyle = hull.body;
  ctx.strokeStyle = hull.edge;
  ctx.lineWidth = Math.max(1.5, s * 0.16);
  ctx.lineJoin = 'round';

  switch (hull.shape) {
    case 'arrow': // Glass — long, needle-sharp interceptor
      poly(ctx, [[s * 1.35, 0], [-s * 0.45, s * 0.3], [-s * 0.15, 0], [-s * 0.45, -s * 0.3]]);
      poly(ctx, [[-s * 0.2, s * 0.28], [-s * 0.75, s * 0.6], [-s * 0.6, s * 0.1]]); // fin
      poly(ctx, [[-s * 0.2, -s * 0.28], [-s * 0.75, -s * 0.6], [-s * 0.6, -s * 0.1]]);
      break;
    case 'tank': // Anchor — wide, blunt, armoured slab
      poly(ctx, [[s * 0.8, 0], [s * 0.4, s * 0.55], [-s * 0.75, s * 0.7], [-s * 0.75, -s * 0.7], [s * 0.4, -s * 0.55]]);
      poly(ctx, [[s * 0.1, s * 0.7], [-s * 0.5, s * 0.95], [-s * 0.5, s * 0.55]]); // side pods
      poly(ctx, [[s * 0.1, -s * 0.7], [-s * 0.5, -s * 0.95], [-s * 0.5, -s * 0.55]]);
      break;
    case 'comet': // Comet — swept teardrop with long back fins
      poly(ctx, [[s * 1.1, 0], [s * 0.1, s * 0.42], [-s * 0.9, s * 0.7], [-s * 0.45, 0], [-s * 0.9, -s * 0.7], [s * 0.1, -s * 0.42]]);
      break;
    case 'forge': // Forge — heavy industrial hex with forward prongs
      poly(ctx, [[s * 0.75, 0], [s * 0.4, s * 0.8], [-s * 0.55, s * 0.8], [-s * 0.85, 0], [-s * 0.55, -s * 0.8], [s * 0.4, -s * 0.8]]);
      poly(ctx, [[s * 1.25, s * 0.18], [s * 0.6, s * 0.5], [s * 0.6, s * 0.05]]); // prongs
      poly(ctx, [[s * 1.25, -s * 0.18], [s * 0.6, -s * 0.5], [s * 0.6, -s * 0.05]]);
      break;
    default: // 'dart' — Seedling, the classic
      poly(ctx, [[s, 0], [-s * 0.7, s * 0.55], [-s * 0.3, 0], [-s * 0.7, -s * 0.55]]);
      break;
  }

  // cockpit accent
  ctx.fillStyle = hull.edge;
  ctx.beginPath();
  ctx.arc(s * 0.15, 0, Math.max(1.5, s * 0.18), 0, Math.PI * 2);
  ctx.fill();
}
