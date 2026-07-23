// The warping grid — Geometry Wars' signature. A spring-mass lattice of glowing
// lines laid over the void that ripples away from explosions, gets sucked into
// black holes, and bows around the craft as it flies.
//
// Model (per the classic neon-vector-shooter breakdown): each intersection is a
// point mass; neighbours are joined by springs that only PULL (like rubber
// bands, never push). Border masses are anchored immovable; interior masses get
// a weak restoring pull back to rest so the grid always settles.
//   spring:  f = -kx - bv     k = 0.28, b = 0.06, target = 95% of rest length
//   damping: velocity *= 0.98 each step (0.6 while imploding)
//   explosive force:  100·f·(p−c) / (10000 + d²)
//   implosive force:   10·f·(c−p) / (100   + d²)
//   directed force:    10·f·dir   / (10    + d)

export interface GridPoint {
  x: number; y: number;    // current position (world)
  ox: number; oy: number;  // rest position (world)
  vx: number; vy: number;
  ax: number; ay: number;
  invMass: number;         // 0 = anchored border
  damping: number;
}

const STIFF = 0.28;
const SPRING_DAMP = 0.06;
const REST_DAMP = 0.98;
const RESTORE = 0.012;   // weak pull back to the rest lattice

export class WarpGrid {
  pts: GridPoint[] = [];
  cols = 0; rows = 0;
  spacing = 100;
  private x0 = 0; private y0 = 0;

  /** Lay a lattice over `bounds`, sized so we stay near `target` points. */
  build(bounds: { min: { x: number; y: number }; max: { x: number; y: number } }, target = 3200): void {
    const pad = 240;
    const w = bounds.max.x - bounds.min.x + pad * 2;
    const h = bounds.max.y - bounds.min.y + pad * 2;
    this.spacing = Math.max(70, Math.sqrt((w * h) / target));
    this.cols = Math.floor(w / this.spacing) + 1;
    this.rows = Math.floor(h / this.spacing) + 1;
    this.x0 = bounds.min.x - pad;
    this.y0 = bounds.min.y - pad;
    this.pts = new Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.x0 + c * this.spacing, y = this.y0 + r * this.spacing;
        const border = c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1;
        this.pts[r * this.cols + c] = { x, y, ox: x, oy: y, vx: 0, vy: 0, ax: 0, ay: 0, invMass: border ? 0 : 1, damping: REST_DAMP };
      }
    }
  }

  private at(c: number, r: number): GridPoint { return this.pts[r * this.cols + c]; }

  /** One simulation step. `dt` is scaled to the classic 60Hz tuning. */
  update(dt: number): void {
    if (!this.pts.length) return;
    const step = Math.min(2, dt * 60); // keep stable if a frame hitches
    // springs: only pull when stretched past the target length
    const target = this.spacing * 0.95;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.at(c, r);
        if (c + 1 < this.cols) this.spring(p, this.at(c + 1, r), target, step);
        if (r + 1 < this.rows) this.spring(p, this.at(c, r + 1), target, step);
      }
    }
    for (const p of this.pts) {
      if (p.invMass > 0) {
        // weak restore toward the rest lattice so it always settles back
        p.ax += (p.ox - p.x) * RESTORE;
        p.ay += (p.oy - p.y) * RESTORE;
        p.vx += p.ax * step; p.vy += p.ay * step;
        p.x += p.vx * step; p.y += p.vy * step;
        const d = Math.pow(p.damping, step);
        p.vx *= d; p.vy *= d;
        if (Math.abs(p.vx) < 0.001) p.vx = 0;
        if (Math.abs(p.vy) < 0.001) p.vy = 0;
      }
      p.ax = 0; p.ay = 0;
      p.damping += (REST_DAMP - p.damping) * 0.08; // relax damping back
    }
  }

  private spring(a: GridPoint, b: GridPoint, target: number, step: number): void {
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len <= target || len === 0) return;      // rubber band: pull only
    dx /= len; dy /= len;
    const stretch = len - target;
    const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
    // f = -kx - bv along the spring axis
    const f = STIFF * stretch - SPRING_DAMP * (dvx * dx + dvy * dy) * -1;
    const fx = dx * f * step, fy = dy * f * step;
    a.ax += fx * a.invMass; a.ay += fy * a.invMass;
    b.ax -= fx * b.invMass; b.ay -= fy * b.invMass;
  }

  /** A shockwave pushing the lattice outward (explosions, blasts). */
  explosive(cx: number, cy: number, force: number, radius: number): void {
    const r2 = radius * radius;
    for (const p of this.pts) {
      if (p.invMass === 0) continue;
      const dx = p.x - cx, dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const f = (100 * force) / (10000 + d2);
      p.ax += dx * f; p.ay += dy * f;
      p.damping = 0.6;
    }
  }

  /** A well sucking the lattice inward (black holes, singularities). */
  implosive(cx: number, cy: number, force: number, radius: number): void {
    const r2 = radius * radius;
    for (const p of this.pts) {
      if (p.invMass === 0) continue;
      const dx = cx - p.x, dy = cy - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const f = (10 * force) / (100 + d2);
      p.ax += dx * f; p.ay += dy * f;
      p.damping = 0.6;
    }
  }

  /** A steady push along a direction (the craft's wake, thrust). */
  directed(cx: number, cy: number, dirx: number, diry: number, force: number, radius: number): void {
    const r2 = radius * radius;
    for (const p of this.pts) {
      if (p.invMass === 0) continue;
      const dx = p.x - cx, dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const f = (10 * force) / (10 + Math.sqrt(d2));
      p.ax += dirx * f; p.ay += diry * f;
    }
  }
}
