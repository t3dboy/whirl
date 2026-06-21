// Particle system — the juice. The snap burst, harvest sparks, crash debris,
// the seeding bloom. Pooled, additive-blended, cheap.

import { type Vec2 } from '../core/math';
import { hsl } from './theme';

interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; hue: number; sat: number; lum: number;
  drag: number; gravity: number;
}

export class Particles {
  private pool: P[] = [];
  private active: P[] = [];

  private take(): P {
    return this.pool.pop() ?? {
      x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2,
      hue: 0, sat: 90, lum: 60, drag: 0.9, gravity: 0,
    };
  }

  burst(at: Vec2, n: number, hue: number, opts: Partial<{
    speed: number; spread: number; size: number; life: number; sat: number; lum: number; drag: number; gravity: number;
  }> = {}): void {
    const speed = opts.speed ?? 220;
    const spread = opts.spread ?? Math.PI * 2;
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const p = this.take();
      const ang = base + (Math.random() - 0.5) * spread;
      const sp = speed * (0.4 + Math.random() * 0.6);
      p.x = at.x; p.y = at.y;
      p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
      p.max = (opts.life ?? 0.6) * (0.6 + Math.random() * 0.6);
      p.life = p.max;
      p.size = opts.size ?? (2 + Math.random() * 3);
      p.hue = hue + (Math.random() - 0.5) * 24;
      p.sat = opts.sat ?? 95;
      p.lum = opts.lum ?? 65;
      p.drag = opts.drag ?? 0.88;
      p.gravity = opts.gravity ?? 0;
      this.active.push(p);
    }
  }

  /** A thin directional spark stream — used for harvest while skimming. */
  spark(at: Vec2, dir: Vec2, hue: number): void {
    const p = this.take();
    p.x = at.x; p.y = at.y;
    p.vx = dir.x + (Math.random() - 0.5) * 60;
    p.vy = dir.y + (Math.random() - 0.5) * 60;
    p.max = 0.35; p.life = p.max;
    p.size = 1.5 + Math.random() * 2;
    p.hue = hue; p.sat = 100; p.lum = 70; p.drag = 0.9; p.gravity = 0;
    this.active.push(p);
  }

  step(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.active) {
      const t = p.life / p.max;
      const a = t * t;
      ctx.fillStyle = hsl(p.hue, p.sat, p.lum, a);
      const s = p.size * (0.4 + t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  get count(): number { return this.active.length; }
}
