// Scene renderer — REPLACED-style. The world is drawn into a low-res pixel
// buffer (chunky, handcrafted feel), then composited to screen with heavy
// cinematic bloom, a warm sepia grade, vignette, scanlines, and film grain.
// Crisp UI (floating numbers, edge pointers) is drawn on top at full res.

import { type Vec2, v, lerp, clamp, len, sub, scale } from '../core/math';
import { THEME, BODY_HUES, ENEMY_HUES, hsl } from './theme';
import { BIOMES, type Biome } from './biomes';
import { Particles } from './particles';
import type { Body, CraftState, RelicInstance } from '../core/types';
import type { World } from '../physics/world';
import type { Combat } from '../game/combat';
import { type Powerups, POWERUPS, type PType } from '../game/powerups';
import { drawShip } from './ships';
import { WarpGrid } from './grid';
import { type HullDef, hullById } from '../content/hulls';

interface FloatText { x: number; y: number; vy: number; life: number; max: number; text: string; color: string; size: number; }

export class Renderer {
  ctx: CanvasRenderingContext2D;          // main (full res)
  sctx: CanvasRenderingContext2D;         // scene (low-res pixel buffer)
  private scene: HTMLCanvasElement;
  particles = new Particles();
  cam = { x: 0, y: 0, zoom: 1, shake: 0, flashHue: 0, flash: 0 };
  private floats: FloatText[] = [];
  private w = 0; private h = 0; private dpr = 1;
  private bw = 0; private bh = 0; private pscale = 1; // buffer px per screen px
  private starfield: { x: number; y: number; z: number; }[] = [];
  private grain: HTMLCanvasElement;
  private t = 0;

  paleRadius = Infinity;     // legacy (Pale removed) — left so old calls are safe
  warpOpen = false;
  private warpT = 0; // warp-jump effect timer (1 → 0)
  private banner: { text: string; color: string; life: number; hold: number } | null = null;
  markers: { x: number; y: number; color: string; label?: string; big?: boolean }[] = [];
  combat: Combat | null = null;
  powerups: Powerups | null = null;
  invuln = false;        // shield/timestop powerup active → aura
  invulnBlink = false;   // shield about to expire → blink
  frozen = false;        // Time Stop active → blue tint
  hull: HullDef = hullById('seedling'); // current craft look
  private nukeFx = { t: 0, x: 0, y: 0, r: 0 };
  triggerNuke(at: Vec2, r: number): void { this.nukeFx = { t: 1, x: at.x, y: at.y, r }; }

  /** Kick the light-speed jump effect. */
  triggerWarp(): void { this.warpT = 1; }

  /** A big screen-centred banner that holds, then fades (e.g. "WARP OPEN"). */
  showBanner(text: string, color: string, hold = 4): void { this.banner = { text, color, life: hold, hold }; }

  shieldFrac = 0;            // 0..1 of shield remaining
  private shieldPulse = 0;   // flashes on hit/regen
  hitShield(): void { this.shieldPulse = 1; }
  braking = false;           // draw the front retro-thrusters
  biome: Biome = BIOMES[0];  // current visual region
  grid = new WarpGrid();     // the warping lattice under everything
  private gbx: number[] = []; private gby: number[] = []; // cached grid buffer coords

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.scene = document.createElement('canvas');
    this.sctx = this.scene.getContext('2d')!;
    this.grain = this.makeGrain(160);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    for (let i = 0; i < 240; i++) this.starfield.push({ x: Math.random(), y: Math.random(), z: Math.random() });
  }

  private makeGrain(size: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
      img.data[i + 3] = Math.random() * 38;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    // low-res pixel buffer: ~400px tall, chunky but legible
    this.bh = 400;
    this.bw = Math.round(this.bh * (this.w / this.h));
    this.pscale = this.bh / this.h;
    this.scene.width = this.bw;
    this.scene.height = this.bh;
  }

  // `hold` (seconds-ish) keeps a float fully visible longer before it fades —
  // life>1 stays at full alpha until it drops below 1, then fades out.
  floatText(at: Vec2, text: string, color = THEME.charge, size = 22, hold = 1): void {
    this.floats.push({ x: at.x, y: at.y, vy: -42, life: hold, max: hold, text, color, size });
  }
  shake(i: number): void { this.cam.shake = Math.min(this.cam.shake + i, 28); }
  flash(hue: number, i = 0.5): void { this.cam.flashHue = hue; this.cam.flash = Math.max(this.cam.flash, i); }

  // world → buffer coords (for scene drawing)
  private w2b(p: Vec2): Vec2 {
    const z = this.cam.zoom * this.pscale;
    return v((p.x - this.cam.x) * z + this.bw / 2, (p.y - this.cam.y) * z + this.bh / 2);
  }
  // world → full-res screen coords (for crisp overlays)
  private w2s(p: Vec2): Vec2 {
    return v((p.x - this.cam.x) * this.cam.zoom + this.w / 2, (p.y - this.cam.y) * this.cam.zoom + this.h / 2);
  }
  screenToWorld(sx: number, sy: number): Vec2 {
    return v((sx - this.w / 2) / this.cam.zoom + this.cam.x, (sy - this.h / 2) / this.cam.zoom + this.cam.y);
  }

  update(world: World, dt: number): void {
    this.t += dt;
    const c = world.craft;
    const lead = scale(c.vel, 0.18);
    this.cam.x = lerp(this.cam.x, c.pos.x + lead.x, 0.08);
    this.cam.y = lerp(this.cam.y, c.pos.y + lead.y, 0.08);
    const sp = len(c.vel);
    const targetZoom = clamp(0.95 - sp / 2600, 0.5, 0.95);
    this.cam.zoom = lerp(this.cam.zoom, targetZoom, 0.04);
    this.cam.shake *= Math.pow(0.001, dt);
    this.cam.flash *= Math.pow(0.02, dt);
    if (this.warpT > 0) this.warpT = Math.max(0, this.warpT - dt / 0.75);
    if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    if (this.shieldPulse > 0) this.shieldPulse = Math.max(0, this.shieldPulse - dt / 0.5);
    if (this.nukeFx.t > 0) this.nukeFx.t = Math.max(0, this.nukeFx.t - dt / 0.6);
    // the craft drags the lattice along with it as it flies
    this.grid.update(dt);
    // black holes and suns pull the lattice into themselves
    for (const b of world.bodies) {
      if (b.kind === 'blackhole') this.grid.implosive(b.pos.x, b.pos.y, 26, b.soiRadius * 0.9);
      else if (b.kind === 'star') this.grid.explosive(b.pos.x, b.pos.y, 4, b.radius * 3);
    }
    const wake = len(c.vel);
    if (c.alive && wake > 30) {
      const n = 1 / wake;
      this.grid.directed(c.pos.x, c.pos.y, c.vel.x * n, c.vel.y * n, Math.min(0.9, wake / 900), 190);
    }
    this.particles.step(dt);
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt * 1.4; f.y += f.vy * dt; f.vy *= 0.92;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
  }

  draw(world: World): void {
    const s = this.sctx;
    const bz = this.cam.zoom * this.pscale;

    // ── scene pass (low-res buffer) ──
    s.setTransform(1, 0, 0, 1, 0, 0);
    const g = s.createRadialGradient(this.bw / 2, this.bh / 2, 0, this.bw / 2, this.bh / 2, Math.max(this.bw, this.bh) * 0.8);
    g.addColorStop(0, this.biome.bg);
    g.addColorStop(1, this.biome.bgDeep);
    s.fillStyle = g;
    s.fillRect(0, 0, this.bw, this.bh);
    this.drawStarfield(s);

    const sh = this.cam.shake * this.pscale;
    s.save();
    s.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    this.drawGrid(s); // the warping lattice sits under the whole scene

    if (this.warpOpen) this.drawWarpGate(s, bz);
    for (const b of world.bodies) this.drawBody(s, b, bz, b.id === world.craft.soiId);
    this.drawRelics(s, world.relics, bz);
    if (this.powerups) { this.drawMotes(s, this.powerups); this.drawPowerups(s, this.powerups, bz); }
    this.drawGhost(s, world);
    if (this.combat?.flame) this.drawFlame(s, world.craft.pos, this.combat.flame, bz);
    if (this.combat) this.drawCombat(s, this.combat, bz);
    if (this.combat) this.drawArsenalFx(s, this.combat, bz);
    this.particles.draw(s);
    s.restore();

    // ── composite to screen with bloom + grade ──
    const m = this.ctx;
    m.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    m.imageSmoothingEnabled = false;
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    m.clearRect(0, 0, this.w, this.h);
    m.drawImage(this.scene, 0, 0, this.w, this.h);

    // cinematic bloom: blurred bright layers added back
    m.save();
    m.globalCompositeOperation = 'lighter';
    m.imageSmoothingEnabled = true;
    // over-bright neon flood — Geometry Wars lives on this
    m.filter = 'blur(4px)'; m.globalAlpha = 0.62; m.drawImage(this.scene, 0, 0, this.w, this.h);
    m.filter = 'blur(12px)'; m.globalAlpha = 0.52; m.drawImage(this.scene, 0, 0, this.w, this.h);
    m.filter = 'blur(28px)'; m.globalAlpha = 0.38; m.drawImage(this.scene, 0, 0, this.w, this.h);
    m.restore();

    this.postGrade(m);

    // ── crisp overlays (full res) ──
    // Time Stop blue tint over the field
    if (this.frozen) {
      m.save();
      m.fillStyle = hsl(210, 80, 55, 0.12);
      m.fillRect(0, 0, this.w, this.h);
      m.restore();
    }
    if (this.warpOpen) this.drawWarpDirection(m); // edge glow pointing to the gate
    this.drawCraftFull(m, world.craft);
    this.drawMarkers(m);
    this.drawFloats(m);
    this.drawNuke(m);
    this.drawBanner(m);
    if (this.warpT > 0) this.drawWarpFx(m);

    if (this.cam.flash > 0.01) {
      m.save();
      m.globalCompositeOperation = 'lighter';
      m.fillStyle = hsl(this.cam.flashHue, 90, 65, this.cam.flash * 0.5);
      m.fillRect(0, 0, this.w, this.h);
      m.restore();
    }
  }

  // Geometry Wars grade: NO sepia wash, NO scanlines, NO film grain — those
  // muddy the neon. Just the faintest biome colour key and a light vignette so
  // the glow reads against pure black.
  private postGrade(m: CanvasRenderingContext2D): void {
    // NO full-screen wash at all — any additive tint lifts the blacks and the
    // void stops being void. Biome identity lives in the grid/star/accent hues.
    const vg = m.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.42, this.w / 2, this.h / 2, this.h * 0.92);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    m.fillStyle = vg;
    m.fillRect(0, 0, this.w, this.h);
  }

  // The warping lattice. Every third line is brighter/thicker (classic GW), and
  // the whole thing is batched into two strokes so thousands of segments stay
  // cheap. Off-screen segments are culled.
  private drawGrid(s: CanvasRenderingContext2D): void {
    const g = this.grid;
    if (!g.pts.length) return;
    const z = this.cam.zoom * this.pscale;
    const ox = -this.cam.x * z + this.bw / 2, oy = -this.cam.y * z + this.bh / 2;
    const n = g.pts.length;
    if (this.gbx.length !== n) { this.gbx = new Array(n); this.gby = new Array(n); }
    const bx = this.gbx, by = this.gby;
    for (let i = 0; i < n; i++) { const p = g.pts[i]; bx[i] = p.x * z + ox; by[i] = p.y * z + oy; }

    const M = 60, W = this.bw + M, H = this.bh + M;
    const vis = (i: number, j: number): boolean => {
      const ax = bx[i], ay = by[i], qx = bx[j], qy = by[j];
      if (ax < -M && qx < -M) return false; if (ax > W && qx > W) return false;
      if (ay < -M && qy < -M) return false; if (ay > H && qy > H) return false;
      return true;
    };
    // cool electric blue, nudged a quarter of the way toward the biome's key
    const acc = this.biome.accent;
    let d = ((acc - 214) % 360 + 540) % 360 - 180; // shortest hue delta
    const hue = (214 + d * 0.25 + 360) % 360;
    s.save();
    s.globalCompositeOperation = 'lighter';
    for (let pass = 0; pass < 2; pass++) {
      const thick = pass === 1;
      s.beginPath();
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
          const i = r * g.cols + c;
          if (c + 1 < g.cols && (r % 3 === 0) === thick) {
            const j = i + 1;
            if (vis(i, j)) { s.moveTo(bx[i], by[i]); s.lineTo(bx[j], by[j]); }
          }
          if (r + 1 < g.rows && (c % 3 === 0) === thick) {
            const j = i + g.cols;
            if (vis(i, j)) { s.moveTo(bx[i], by[i]); s.lineTo(bx[j], by[j]); }
          }
        }
      }
      // GW keeps the lattice a cool, DIM blue — it must never flood the screen
      // through the bloom. Only a quarter of the biome's hue bleeds in.
      s.strokeStyle = thick ? hsl(hue, 80, 46, 0.30) : hsl(hue, 70, 36, 0.14);
      s.lineWidth = thick ? 1.4 : 0.8;
      s.stroke();
    }
    s.restore();
  }

  private drawStarfield(s: CanvasRenderingContext2D): void {
    for (const st of this.starfield) {
      const px = ((st.x * this.bw) - this.cam.x * 0.05 * st.z) % this.bw;
      const py = ((st.y * this.bh) - this.cam.y * 0.05 * st.z) % this.bh;
      const x = (px + this.bw) % this.bw, y = (py + this.bh) % this.bh;
      s.fillStyle = hsl(this.biome.star, 35, 88, 0.18 + st.z * 0.55);
      s.fillRect(x | 0, y | 0, st.z < 0.5 ? 1 : 2, st.z < 0.5 ? 1 : 2);
    }
  }

  private drawBody(s: CanvasRenderingContext2D, b: Body, bz: number, inSoi: boolean): void {
    const p = this.w2b(b.pos);
    const R = Math.max(2, b.radius * bz);
    const hue = b.hue ?? BODY_HUES[b.kind] ?? 200;

    // SOI ring
    s.strokeStyle = hsl(hue, 45, 60, inSoi ? 0.2 : 0.07);
    s.lineWidth = inSoi ? 1.5 : 1;
    s.beginPath(); s.arc(p.x, p.y, b.soiRadius * bz, 0, Math.PI * 2); s.stroke();

    if (b.kind === 'blackhole') { this.drawBlackHole(s, p, R, bz, b); return; }
    if (b.kind === 'star') { this.drawSun(s, p, R, bz, hue); return; }

    // ignition band (reignitable worlds only)
    if (!b.seeded) {
      s.strokeStyle = hsl(40, 90, 65, 0.16 + b.ignition * 0.4);
      s.lineWidth = 1; s.setLineDash([3, 7]);
      s.beginPath(); s.arc(p.x, p.y, b.igniteInner * bz, 0, Math.PI * 2); s.stroke();
      s.beginPath(); s.arc(p.x, p.y, b.igniteOuter * bz, 0, Math.PI * 2); s.stroke();
      s.setLineDash([]);
    }
    // heat band
    s.strokeStyle = hsl(8, 85, 58, 0.12);
    s.lineWidth = 1;
    s.beginPath(); s.arc(p.x, p.y, b.heatRadius * bz, 0, Math.PI * 2); s.stroke();

    const lit = b.seeded;
    // glow
    s.save();
    s.globalCompositeOperation = 'lighter';
    const glow = s.createRadialGradient(p.x, p.y, R * 0.3, p.x, p.y, R * (lit ? 3.2 : 1.8));
    glow.addColorStop(0, hsl(lit ? 36 : hue, lit ? 90 : 40, lit ? 60 : 40, lit ? 0.8 : 0.25));
    glow.addColorStop(1, hsl(lit ? 36 : hue, 80, 40, 0));
    s.fillStyle = glow;
    s.beginPath(); s.arc(p.x, p.y, R * (lit ? 3.2 : 1.8), 0, Math.PI * 2); s.fill();
    s.restore();

    // disc (dead = cold muted, lit = warm amber) with rim light
    const disc = s.createRadialGradient(p.x - R * 0.4, p.y - R * 0.4, R * 0.1, p.x, p.y, R);
    disc.addColorStop(0, lit ? hsl(40, 85, 72) : hsl(hue, 18, 38));
    disc.addColorStop(1, lit ? hsl(26, 80, 40) : hsl(hue, 14, 13));
    s.fillStyle = disc;
    s.beginPath(); s.arc(p.x, p.y, R, 0, Math.PI * 2); s.fill();

    // pulsar: emanating rings synced to its beat
    if (b.kind === 'pulsar' && b.pulse) {
      const ph = b.pulse.t / b.pulse.period;
      const rr = R + ph * b.pulse.range * bz;
      s.strokeStyle = hsl(190, 100, 75, (1 - ph) * 0.7);
      s.lineWidth = 2;
      s.beginPath(); s.arc(p.x, p.y, rr, 0, Math.PI * 2); s.stroke();
    }

    // ignition charge arc
    if (!lit && b.ignition > 0.001) {
      s.strokeStyle = hsl(42, 100, 66, 0.95);
      s.lineWidth = 3; s.lineCap = 'round';
      s.beginPath(); s.arc(p.x, p.y, R + 4, -Math.PI / 2, -Math.PI / 2 + b.ignition * Math.PI * 2); s.stroke();
      s.lineCap = 'butt';
    }
    if (lit) {
      s.strokeStyle = hsl(40, 100, 75, 0.85); s.lineWidth = 2;
      s.beginPath(); s.arc(p.x, p.y, R + 3, 0, Math.PI * 2); s.stroke();
    }
  }

  private drawSun(s: CanvasRenderingContext2D, p: Vec2, R: number, _bz: number, _hue: number): void {
    s.save();
    s.globalCompositeOperation = 'lighter';
    const glow = s.createRadialGradient(p.x, p.y, R * 0.3, p.x, p.y, R * 3.4);
    glow.addColorStop(0, hsl(38, 100, 65, 0.9));
    glow.addColorStop(0.5, hsl(28, 100, 55, 0.3));
    glow.addColorStop(1, hsl(20, 100, 45, 0));
    s.fillStyle = glow;
    s.beginPath(); s.arc(p.x, p.y, R * 3.4, 0, Math.PI * 2); s.fill();
    s.restore();
    const core = s.createRadialGradient(p.x - R * 0.3, p.y - R * 0.3, R * 0.1, p.x, p.y, R);
    core.addColorStop(0, hsl(48, 100, 88));
    core.addColorStop(0.6, hsl(38, 100, 64));
    core.addColorStop(1, hsl(22, 95, 48));
    s.fillStyle = core;
    s.beginPath(); s.arc(p.x, p.y, R, 0, Math.PI * 2); s.fill();
    // flickering corona
    const fl = 0.5 + 0.5 * Math.sin(this.t * 7);
    s.strokeStyle = hsl(44, 100, 80, 0.3 + fl * 0.3); s.lineWidth = 2;
    s.beginPath(); s.arc(p.x, p.y, R + 3 + fl * 3, 0, Math.PI * 2); s.stroke();
  }

  private drawBlackHole(s: CanvasRenderingContext2D, p: Vec2, R: number, _bz: number, _b: Body): void {
    // accretion glow
    s.save();
    s.globalCompositeOperation = 'lighter';
    const glow = s.createRadialGradient(p.x, p.y, R, p.x, p.y, R * 4);
    glow.addColorStop(0, hsl(300, 90, 55, 0.5));
    glow.addColorStop(0.4, hsl(330, 100, 50, 0.25));
    glow.addColorStop(1, hsl(280, 90, 40, 0));
    s.fillStyle = glow;
    s.beginPath(); s.arc(p.x, p.y, R * 4, 0, Math.PI * 2); s.fill();
    // swirling accretion ring
    const spin = this.t * 2;
    for (let i = 0; i < 3; i++) {
      s.strokeStyle = hsl(330 - i * 30, 100, 60, 0.6 - i * 0.15);
      s.lineWidth = 2.5 - i * 0.6;
      s.beginPath(); s.arc(p.x, p.y, R * (1.6 + i * 0.5), spin + i, spin + i + Math.PI * 1.4); s.stroke();
    }
    s.restore();
    // pure black core with a thin hot rim
    s.fillStyle = '#000';
    s.beginPath(); s.arc(p.x, p.y, R, 0, Math.PI * 2); s.fill();
    s.strokeStyle = hsl(40, 100, 80, 0.8); s.lineWidth = 1.5;
    s.beginPath(); s.arc(p.x, p.y, R, 0, Math.PI * 2); s.stroke();
  }

  private drawCombat(s: CanvasRenderingContext2D, combat: Combat, bz: number): void {
    // missiles — a fiery red/orange exhaust streak with a fading trail
    s.save();
    s.globalCompositeOperation = 'lighter';
    s.lineCap = 'round';
    for (const ms of combat.missiles) {
      const h = ms.hue;                       // colour by source (hull / enemy type)
      const trail = ms.trail;
      // glowing trail in the missile's colour, brightening toward the head
      for (let i = 1; i < trail.length; i++) {
        const a = this.w2b(trail[i - 1]), b = this.w2b(trail[i]);
        const f = i / trail.length;          // 0 = oldest, 1 = newest
        const flick = 0.85 + Math.random() * 0.3;
        s.strokeStyle = hsl(h, 100, 50 + f * 30, f * f * 0.85 * flick);
        s.lineWidth = (0.5 + f * 4) * flick;
        s.beginPath(); s.moveTo(a.x, a.y); s.lineTo(b.x, b.y); s.stroke();
      }
      // bright head
      const p = this.w2b(ms.pos);
      const ang = Math.atan2(ms.vel.y, ms.vel.x);
      const r = 7 + Math.random() * 2;
      const gl = s.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.6);
      gl.addColorStop(0, hsl(h, 100, 92, 0.95));
      gl.addColorStop(0.5, hsl(h, 100, 65, 0.7));
      gl.addColorStop(1, hsl(h, 100, 55, 0));
      s.fillStyle = gl;
      s.beginPath(); s.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2); s.fill();
      s.save();
      s.translate(p.x, p.y); s.rotate(ang);
      s.fillStyle = hsl(h, 60, 96);
      s.beginPath(); s.moveTo(8, 0); s.lineTo(-5, 2.5); s.lineTo(-5, -2.5); s.closePath(); s.fill();
      s.restore();
    }
    s.restore();
    // Enemies, Geometry Wars style: hollow neon wireframes where the SHAPE and
    // the COLOUR together tell you what it is. Blue diamond = chaser drone,
    // violet hexagon = heavy hulk, magenta square = 4-way spreader. No fills —
    // just bright outlines, double-stroked so the bloom makes them blaze.
    for (const e of combat.enemies) {
      const p = this.w2b(e.pos);
      const r = Math.max(7, e.r * bz * 0.7);
      const h = ENEMY_HUES[e.kind] ?? e.hue;
      const kind = e.kind;
      const spin = this.t * (kind === 'hulk' ? 0.5 : kind === 'spreader' ? 0.9 : 1.3) + e.phase;
      const pulse = 0.85 + 0.15 * Math.sin(this.t * 5 + e.phase);
      s.save();
      s.globalCompositeOperation = 'lighter';
      s.translate(p.x, p.y); s.rotate(spin);
      const path = (): void => {
        s.beginPath();
        if (kind === 'drone') { // diamond
          s.moveTo(0, -r * 1.25); s.lineTo(r * 0.85, 0); s.lineTo(0, r * 1.25); s.lineTo(-r * 0.85, 0);
        } else if (kind === 'spreader') { // square, with its 4 firing spurs
          s.moveTo(-r, -r); s.lineTo(r, -r); s.lineTo(r, r); s.lineTo(-r, r);
        } else { // hexagon
          for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; s.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        }
        s.closePath();
      };
      path(); s.strokeStyle = hsl(h, 100, 52, 0.55); s.lineWidth = 5 * pulse; s.stroke(); // glow pass
      path(); s.strokeStyle = hsl(h, 100, 78, 0.95); s.lineWidth = 2; s.stroke();          // core line
      if (kind === 'spreader') { // four spurs marking its fire axes
        s.strokeStyle = hsl(h, 100, 85, 0.8); s.lineWidth = 1.5;
        s.beginPath();
        for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; s.moveTo(Math.cos(a) * r, Math.sin(a) * r); s.lineTo(Math.cos(a) * r * 1.7, Math.sin(a) * r * 1.7); }
        s.stroke();
      }
      if (kind === 'hulk') { // inner ring marks the heavy
        s.beginPath(); s.arc(0, 0, r * 0.45, 0, Math.PI * 2);
        s.strokeStyle = hsl(h, 100, 88, 0.85); s.lineWidth = 1.5; s.stroke();
      }
      s.restore();
      // health arc for tougher enemies
      if (e.maxHp > 1 && e.hp < e.maxHp) {
        s.save();
        s.globalCompositeOperation = 'lighter';
        s.strokeStyle = hsl(h, 100, 80, 0.95);
        s.lineWidth = 2.5; s.lineCap = 'round';
        s.beginPath(); s.arc(p.x, p.y, r + 7, -Math.PI / 2, -Math.PI / 2 + (e.hp / e.maxHp) * Math.PI * 2); s.stroke();
        s.lineCap = 'butt'; s.restore();
      }
    }
  }

  private drawPowerups(s: CanvasRenderingContext2D, pu: Powerups, bz: number): void {
    for (const d of pu.dropped) {
      const p = this.w2b({ x: d.x, y: d.y });
      const def = POWERUPS[d.type as PType];
      const sz = 11 * Math.max(0.7, bz);
      const pulse = Math.sin(this.t * 4 + d.id) * 0.5 + 0.5; // 0..1
      s.save();
      // solid chip with the glyph (no glow — reads clean against any biome)
      s.fillStyle = hsl(def.hue, 85, 30);
      s.strokeStyle = hsl(def.hue, 100, 72); s.lineWidth = 2;
      s.beginPath(); s.arc(p.x, p.y, sz, 0, Math.PI * 2); s.fill(); s.stroke();
      // pulsing line outline — expands outward and fades, like a sonar ping
      const ringR = sz + 4 + pulse * 7;
      s.strokeStyle = hsl(def.hue, 100, 72, Math.max(0.06, 0.7 * (1 - pulse)));
      s.lineWidth = 1.6;
      s.beginPath(); s.arc(p.x, p.y, ringR, 0, Math.PI * 2); s.stroke();
      // glyph
      s.fillStyle = hsl(def.hue, 100, 92);
      s.font = `800 ${Math.round(sz * 1.2)}px ui-rounded, system-ui, sans-serif`;
      s.textAlign = 'center'; s.textBaseline = 'middle';
      s.fillText(def.glyph, p.x, p.y + 1);
      s.textBaseline = 'alphabetic';
      s.restore();
    }
    // weapon crates — a glowing rotating box with a ✦, clearly different from buffs
    for (const cr of pu.crates) {
      const p = this.w2b({ x: cr.x, y: cr.y });
      const sz = 12 * Math.max(0.7, bz);
      const spin = this.t * 1.4 + cr.id;
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 4 + cr.id);
      s.save();
      s.globalCompositeOperation = 'lighter';
      const g = s.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 2.6);
      g.addColorStop(0, hsl(36, 100, 70, 0.6 * pulse)); g.addColorStop(1, hsl(30, 100, 55, 0));
      s.fillStyle = g; s.beginPath(); s.arc(p.x, p.y, sz * 2.6, 0, Math.PI * 2); s.fill();
      s.restore();
      s.save();
      s.translate(p.x, p.y); s.rotate(spin);
      s.fillStyle = hsl(34, 90, 32); s.strokeStyle = hsl(40, 100, 72); s.lineWidth = 2.5;
      s.beginPath(); s.rect(-sz, -sz, sz * 2, sz * 2); s.fill(); s.stroke();
      s.rotate(-spin);
      s.fillStyle = hsl(45, 100, 90); s.font = `800 ${Math.round(sz * 1.3)}px ui-rounded, system-ui, sans-serif`;
      s.textAlign = 'center'; s.textBaseline = 'middle'; s.fillText('✦', 0, 1); s.textBaseline = 'alphabetic';
      s.restore();
    }
  }

  private drawMotes(s: CanvasRenderingContext2D, pu: Powerups): void {
    if (pu.motes.length === 0) return;
    // faceted purple gems — no glow, so they read as solid collectible loot
    for (const m of pu.motes) {
      const p = this.w2b({ x: m.x, y: m.y });
      const r = 4.6 + Math.sin(this.t * 6 + m.x * 0.05) * 0.5; // gentle twinkle, not a halo
      s.save();
      s.translate(p.x, p.y);
      // diamond body
      s.beginPath();
      s.moveTo(0, -r); s.lineTo(r * 0.78, 0); s.lineTo(0, r); s.lineTo(-r * 0.78, 0);
      s.closePath();
      s.fillStyle = hsl(283, 72, 50);
      s.fill();
      s.strokeStyle = hsl(287, 90, 80); s.lineWidth = 1; s.stroke();
      // bright top-left facet for a cut-gem read
      s.beginPath();
      s.moveTo(0, -r); s.lineTo(-r * 0.78, 0); s.lineTo(0, 0);
      s.closePath();
      s.fillStyle = hsl(291, 95, 82); s.fill();
      s.restore();
    }
  }

  // The Flame Halo — flickering fire jets sweeping around the craft. Drawn in
  // the scene buffer (additive) so the bloom pass makes the fire glow.
  private drawFlame(
    s: CanvasRenderingContext2D,
    craftPos: Vec2,
    f: { reach: number; jets: number; spin: number; dmg: number; angle: number; swoop: number },
    bz: number,
  ): void {
    const c = this.w2b(craftPos);
    const reach = f.reach * bz;
    const steps = 16;
    s.save();
    s.globalCompositeOperation = 'lighter';
    for (let j = 0; j < f.jets; j++) {
      const ja = f.angle + (j / f.jets) * Math.PI * 2;
      // walk out along the swooping curve, dropping soft fiery blobs that grow
      // thinner, redder and dimmer toward the tip — a sprayed tongue of flame
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const wob = Math.sin(this.t * 16 + j * 3 + k * 0.8) * 0.06 * t; // organic waver
        const ang = ja - f.swoop * t + wob;
        const rad = reach * t;
        const flick = 0.78 + 0.22 * Math.sin(this.t * 22 + j * 2.3 + k * 1.7);
        const x = c.x + Math.cos(ang) * rad, y = c.y + Math.sin(ang) * rad;
        const size = reach * (0.22 * (1 - t) + 0.05) * (0.85 + 0.45 * flick);
        const hue = 52 - t * 44;            // yellow core → deep red tip
        const lum = 64 - t * 24;
        const alpha = 0.4 * (1 - t * 0.65);
        const g = s.createRadialGradient(x, y, 0, x, y, size);
        g.addColorStop(0, hsl(hue, 100, Math.min(96, lum + 26), alpha * 1.15));
        g.addColorStop(0.5, hsl(hue, 100, lum, alpha * 0.65));
        g.addColorStop(1, hsl(Math.max(2, hue - 12), 100, lum * 0.6, 0));
        s.fillStyle = g;
        s.beginPath(); s.arc(x, y, size, 0, Math.PI * 2); s.fill();
      }
    }
    // white-hot nozzle root at the hull
    const root = s.createRadialGradient(c.x, c.y, 0, c.x, c.y, reach * 0.16);
    root.addColorStop(0, hsl(54, 100, 94, 0.75));
    root.addColorStop(1, hsl(48, 100, 78, 0));
    s.fillStyle = root; s.beginPath(); s.arc(c.x, c.y, reach * 0.16, 0, Math.PI * 2); s.fill();
    s.restore();
    // embers spray off the trailing tips (world coords, like every other spawn)
    for (let j = 0; j < f.jets; j++) {
      if (Math.random() < 0.7) {
        const ang = f.angle + (j / f.jets) * Math.PI * 2 - f.swoop;
        const tip = { x: craftPos.x + Math.cos(ang) * f.reach * 0.92, y: craftPos.y + Math.sin(ang) * f.reach * 0.92 };
        this.particles.burst(tip, 1, 22, { speed: 130, life: 0.5, lum: 60, spread: 2.0 });
      }
    }
  }

  // Generic renderer for the arsenal's transient effects (combat.fx) + mines.
  // Weapons stay decoupled: they push primitives, we draw them by kind.
  private drawArsenalFx(s: CanvasRenderingContext2D, combat: Combat, bz: number): void {
    if (!combat.fx.length && !combat.mines.length) return;
    s.save();
    s.globalCompositeOperation = 'lighter';
    for (const f of combat.fx) {
      const a = Math.max(0, Math.min(1, f.life / f.max));
      if (f.kind === 'ring') {
        const p = this.w2b({ x: f.x, y: f.y }); const r = (f.r ?? 0) * bz;
        const g = s.createRadialGradient(p.x, p.y, r * 0.72, p.x, p.y, r);
        g.addColorStop(0, hsl(f.hue, 100, 60, 0)); g.addColorStop(1, hsl(f.hue, 100, 62, 0.14 * a));
        s.fillStyle = g; s.beginPath(); s.arc(p.x, p.y, r, 0, Math.PI * 2); s.fill();
        s.strokeStyle = hsl(f.hue, 100, 66, 0.5 * a); s.lineWidth = (f.width ?? 4) * bz;
        s.beginPath(); s.arc(p.x, p.y, r, 0, Math.PI * 2); s.stroke();
      } else if (f.kind === 'arc') {
        const p = this.w2b({ x: f.x, y: f.y }); const r = (f.r ?? 0) * bz;
        s.strokeStyle = hsl(f.hue, 100, 72, 0.75 * a); s.lineWidth = (f.width ?? 5) * bz;
        s.beginPath(); s.arc(p.x, p.y, r, f.a0 ?? 0, f.a1 ?? 0); s.stroke();
      } else if (f.kind === 'beam') {
        const p = this.w2b({ x: f.x, y: f.y }); const q = this.w2b({ x: f.x2 ?? f.x, y: f.y2 ?? f.y });
        s.strokeStyle = hsl(f.hue, 100, 72, 0.75 * a); s.lineWidth = (f.width ?? 4) * bz;
        s.beginPath(); s.moveTo(p.x, p.y); s.lineTo(q.x, q.y); s.stroke();
      } else if (f.kind === 'blast' || f.kind === 'well') {
        const p = this.w2b({ x: f.x, y: f.y }); const r = (f.r ?? 0) * bz * (f.kind === 'blast' ? 1.1 - a * 0.4 : 1);
        const g = s.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, hsl(f.hue, 100, 82, 0.7 * a)); g.addColorStop(0.6, hsl(f.hue, 100, 60, 0.32 * a)); g.addColorStop(1, hsl(f.hue, 100, 50, 0));
        s.fillStyle = g; s.beginPath(); s.arc(p.x, p.y, r, 0, Math.PI * 2); s.fill();
      } else if (f.kind === 'bolt' && f.pts && f.pts.length >= 4) {
        // jagged lightning through the node points, drawn as glow + core
        const nodes: { x: number; y: number }[] = [];
        for (let k = 0; k < f.pts.length; k += 2) nodes.push(this.w2b({ x: f.pts[k], y: f.pts[k + 1] }));
        const jag: { x: number; y: number }[] = [nodes[0]];
        for (let n = 0; n < nodes.length - 1; n++) {
          const A = nodes[n], B = nodes[n + 1];
          const dx = B.x - A.x, dy = B.y - A.y, ln = Math.hypot(dx, dy) || 1;
          const px = -dy / ln, py = dx / ln;
          const subs = 4;
          for (let i = 1; i < subs; i++) {
            const fr = i / subs;
            const amp = Math.sin(this.t * 90 + n * 7 + i * 2.3) * ln * 0.12;
            jag.push({ x: A.x + dx * fr + px * amp, y: A.y + dy * fr + py * amp });
          }
          jag.push(B);
        }
        const trace = (w: number, hue: number, lum: number, al: number): void => {
          s.strokeStyle = hsl(hue, 100, lum, al * a); s.lineWidth = Math.max(1, w);
          s.lineJoin = 'round'; s.lineCap = 'round';
          s.beginPath();
          jag.forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
          s.stroke();
        };
        trace(9 * bz, f.hue, 58, 0.35); // wide glow
        trace(4 * bz, f.hue, 78, 0.85); // mid
        trace(1.6 * bz, 190, 97, 0.95); // white-cyan core
        for (const nd of nodes) { // bright sparks at each strike point
          const r = 11 * bz;
          const g = s.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, r);
          g.addColorStop(0, hsl(190, 100, 92, 0.8 * a)); g.addColorStop(1, hsl(200, 100, 70, 0));
          s.fillStyle = g; s.beginPath(); s.arc(nd.x, nd.y, r, 0, Math.PI * 2); s.fill();
        }
      }
    }
    for (const m of combat.mines) {
      const p = this.w2b({ x: m.x, y: m.y });
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 6 + m.x * 0.05);
      const armed = m.arm <= 0;
      const rr = 5 * bz * (armed ? 0.9 + 0.3 * pulse : 0.7);
      const g = s.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 2.2);
      g.addColorStop(0, hsl(armed ? 12 : 48, 100, 70, 0.8)); g.addColorStop(1, hsl(12, 100, 55, 0));
      s.fillStyle = g; s.beginPath(); s.arc(p.x, p.y, rr * 2.2, 0, Math.PI * 2); s.fill();
      s.fillStyle = hsl(armed ? 14 : 48, 100, 86, 0.9); s.beginPath(); s.arc(p.x, p.y, rr * 0.8, 0, Math.PI * 2); s.fill();
      if (armed) { s.strokeStyle = hsl(12, 100, 60, 0.12 * pulse); s.lineWidth = 1; s.beginPath(); s.arc(p.x, p.y, m.radius * bz, 0, Math.PI * 2); s.stroke(); }
    }
    s.restore();
  }

  private drawNuke(m: CanvasRenderingContext2D): void {
    if (this.nukeFx.t <= 0) return;
    const p = this.w2s({ x: this.nukeFx.x, y: this.nukeFx.y });
    const prog = 1 - this.nukeFx.t;          // 0..1 expanding
    const r = this.nukeFx.r * this.cam.zoom * prog;
    m.save();
    m.globalCompositeOperation = 'lighter';
    m.strokeStyle = hsl(28, 100, 75, this.nukeFx.t * 0.9);
    m.lineWidth = 6 + this.nukeFx.t * 14;
    m.beginPath(); m.arc(p.x, p.y, r, 0, Math.PI * 2); m.stroke();
    m.strokeStyle = hsl(0, 100, 70, this.nukeFx.t * 0.6);
    m.lineWidth = 2;
    m.beginPath(); m.arc(p.x, p.y, r * 0.8, 0, Math.PI * 2); m.stroke();
    m.restore();
  }

  private drawRelics(s: CanvasRenderingContext2D, relics: RelicInstance[], bz: number): void {
    for (const r of relics) {
      if (r.grabbed) continue;
      const p = this.w2b(r.pos);
      const spin = this.t * 1.6;
      const sz = (8 + Math.sin(this.t * 4) * 1.5) * Math.max(0.6, bz);
      s.save();
      s.globalCompositeOperation = 'lighter';
      const glow = s.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 3);
      glow.addColorStop(0, hsl(320, 100, 70, 0.8));
      glow.addColorStop(1, hsl(320, 100, 60, 0));
      s.fillStyle = glow;
      s.beginPath(); s.arc(p.x, p.y, sz * 3, 0, Math.PI * 2); s.fill();
      s.translate(p.x, p.y); s.rotate(spin);
      s.fillStyle = hsl(320, 100, 80);
      s.beginPath(); s.moveTo(0, -sz); s.lineTo(sz * 0.7, 0); s.lineTo(0, sz); s.lineTo(-sz * 0.7, 0); s.closePath(); s.fill();
      s.restore();
    }
  }

  private drawGhost(s: CanvasRenderingContext2D, world: World): void {
    const path = world.predict(220, 1 / 120);
    if (path.length < 2) return;
    s.save();
    s.setLineDash([3, 5]);
    s.lineWidth = 1;
    s.strokeStyle = hsl(180, 80, 72, 0.4);
    s.beginPath();
    for (let i = 0; i < path.length; i++) {
      const q = this.w2b(path[i]);
      if (i === 0) s.moveTo(q.x, q.y); else s.lineTo(q.x, q.y);
    }
    s.stroke();
    s.setLineDash([]);
    s.restore();
  }

  // The craft is drawn CRISP on the full-res layer (not the pixel buffer) in a
  // high-contrast cyan so it always pops against the warm amber world, with a
  // bright outline, a glow, and a faint locator ring so you can never lose it.
  private drawCraftFull(m: CanvasRenderingContext2D, c: CraftState): void {
    if (!c.alive) return;
    // blink during the final seconds of the Invuln powerup
    if (this.invulnBlink && Math.floor(this.t * 7) % 2 === 1) return;
    const p = this.w2s(c.pos);
    m.save();
    m.translate(p.x, p.y);

    // invulnerability aura — a bright pulsing ring
    if (this.invuln) {
      const pl = 0.6 + 0.4 * Math.sin(this.t * 8);
      m.save();
      m.globalCompositeOperation = 'lighter';
      const ag = m.createRadialGradient(0, 0, 12, 0, 0, 34);
      ag.addColorStop(0, hsl(185, 100, 75, 0));
      ag.addColorStop(1, hsl(185, 100, 80, 0.4 + pl * 0.3));
      m.fillStyle = ag; m.beginPath(); m.arc(0, 0, 34, 0, Math.PI * 2); m.fill();
      m.restore();
    }

    // shield bubble — a teal dome that brightens with charge and flares on hit
    if (this.shieldFrac > 0 || this.shieldPulse > 0) {
      const sa = this.shieldFrac * 0.4 + this.shieldPulse * 0.6;
      m.save();
      m.globalCompositeOperation = 'lighter';
      const sg = m.createRadialGradient(0, 0, 14, 0, 0, 30);
      sg.addColorStop(0, hsl(185, 100, 70, 0));
      sg.addColorStop(0.8, hsl(185, 100, 70, sa * 0.35));
      sg.addColorStop(1, hsl(190, 100, 80, sa * 0.7));
      m.fillStyle = sg;
      m.beginPath(); m.arc(0, 0, 30, 0, Math.PI * 2); m.fill();
      m.strokeStyle = hsl(188, 100, 82, 0.4 * this.shieldFrac + this.shieldPulse * 0.6);
      m.lineWidth = 1.5 + this.shieldPulse * 2;
      m.beginPath(); m.arc(0, 0, 30, 0, Math.PI * 2); m.stroke();
      m.restore();
    }

    // locator ring — always visible, pulses gently
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 4);
    m.strokeStyle = hsl(180, 90, 70, 0.25 + pulse * 0.2);
    m.lineWidth = 1.5;
    m.beginPath(); m.arc(0, 0, 26, 0, Math.PI * 2); m.stroke();

    m.rotate(c.heading);

    // thruster flame (warm — contrasts the cyan hull)
    if (c.thrust > 0.02) {
      m.globalCompositeOperation = 'lighter';
      const flame = 16 + c.thrust * (20 + Math.random() * 12);
      const fl = m.createRadialGradient(-8, 0, 0, -8 - flame * 0.4, 0, flame);
      fl.addColorStop(0, hsl(48, 100, 85, 0.95));
      fl.addColorStop(0.5, hsl(26, 100, 60, 0.6));
      fl.addColorStop(1, hsl(14, 100, 50, 0));
      m.fillStyle = fl;
      m.beginPath(); m.moveTo(-8, -5); m.lineTo(-8 - flame, 0); m.lineTo(-8, 5); m.closePath(); m.fill();
    }

    // braking: two retro-thrusters fire FORWARD out the front, splayed
    // diagonally — cyan-white jets that push the craft to a stop
    if (this.braking) {
      m.globalCompositeOperation = 'lighter';
      const len = 12 + Math.random() * 6;
      for (const sign of [-1, 1]) {
        m.save();
        m.translate(8, sign * 4);       // a front-side nozzle
        m.rotate(sign * 0.5);           // splay outward (~28°)
        const rf = m.createRadialGradient(0, 0, 0, len, 0, len);
        rf.addColorStop(0, hsl(190, 100, 90, 0.95));
        rf.addColorStop(0.5, hsl(195, 100, 70, 0.6));
        rf.addColorStop(1, hsl(200, 100, 60, 0));
        m.fillStyle = rf;
        m.beginPath(); m.moveTo(0, -3); m.lineTo(len, 0); m.lineTo(0, 3); m.closePath(); m.fill();
        m.restore();
      }
    }

    // glow halo in the hull's colour
    m.globalCompositeOperation = 'lighter';
    const gl = m.createRadialGradient(0, 0, 0, 0, 0, 22);
    gl.addColorStop(0, hsl(this.hull.missileHue, 100, 80, 0.9));
    gl.addColorStop(1, hsl(this.hull.missileHue, 100, 60, 0));
    m.fillStyle = gl;
    m.beginPath(); m.arc(0, 0, 22, 0, Math.PI * 2); m.fill();
    m.globalCompositeOperation = 'source-over';

    // the hull's distinct silhouette
    drawShip(m, this.hull, 14);
    m.restore();
  }

  private drawWarpFx(m: CanvasRenderingContext2D): void {
    const cx = this.w / 2, cy = this.h / 2;
    const a = this.warpT;
    const ease = a * a;                       // bright at the start, fades fast
    m.save();
    m.globalCompositeOperation = 'lighter';
    // blinding core flash that collapses inward
    const fl = m.createRadialGradient(cx, cy, 0, cx, cy, this.h * 0.7);
    fl.addColorStop(0, hsl(190, 100, 92, ease * 0.8));
    fl.addColorStop(0.35, hsl(40, 100, 75, ease * 0.4));
    fl.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = fl;
    m.fillRect(0, 0, this.w, this.h);
    // light-speed streaks rushing outward from the core
    const n = 110;
    const maxR = Math.hypot(this.w, this.h) * 0.62;
    for (let i = 0; i < n; i++) {
      const ang = i * 2.39996 + this.t * 3;   // golden-angle spread, slow spin
      const rf = ((i * 131) % 100) / 100;
      const inner = (0.12 + (1 - a) * 0.55) * maxR * (0.5 + rf);
      const len = (90 + a * 280) * (0.6 + rf);
      const c = Math.cos(ang), s = Math.sin(ang);
      m.strokeStyle = hsl(i % 3 ? 190 : 42, 100, 82, a * 0.55);
      m.lineWidth = 1 + a * 2.5;
      m.beginPath();
      m.moveTo(cx + c * inner, cy + s * inner);
      m.lineTo(cx + c * (inner + len), cy + s * (inner + len));
      m.stroke();
    }
    m.restore();
  }

  // The warp core as a pulsing SUPERNOVA — colour-cycling halo, rotating
  // spectral rays, expanding shockwaves and a white-hot heart. It has to scream
  // "come here". Drawn additively so the bloom pass makes it blaze.
  private drawWarpGate(s: CanvasRenderingContext2D, bz: number): void {
    const p = this.w2b(v(0, 0));
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.6);  // slow body breathe
    const flare = 0.5 + 0.5 * Math.sin(this.t * 7.0);  // fast shimmer
    const base = (300 + 150 * pulse) * bz;
    s.save();
    s.translate(p.x, p.y);
    s.globalCompositeOperation = 'lighter';

    // 1. vast colour-cycling halo
    const glow = s.createRadialGradient(0, 0, 0, 0, 0, base * 1.7);
    glow.addColorStop(0, hsl(50, 100, 96, 0.55));
    glow.addColorStop(0.22, hsl(160 + 50 * Math.sin(this.t * 1.3), 100, 70, 0.40));
    glow.addColorStop(0.6, hsl(265 + 40 * Math.sin(this.t * 0.9), 100, 62, 0.16));
    glow.addColorStop(1, hsl(280, 100, 55, 0));
    s.fillStyle = glow;
    s.beginPath(); s.arc(0, 0, base * 1.7, 0, Math.PI * 2); s.fill();

    // 2. rotating supernova rays, each its own colour, each pulsing in length
    const rays = 18;
    s.rotate(this.t * 0.55);
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const len = base * (1.05 + 0.6 * Math.sin(this.t * 4 + i * 1.27));
      const wob = 0.018 + 0.012 * flare;
      s.fillStyle = hsl((i * 20 + this.t * 70) % 360, 100, 70, 0.45);
      s.beginPath();
      s.moveTo(0, 0);
      s.lineTo(Math.cos(a - wob) * len, Math.sin(a - wob) * len);
      s.lineTo(Math.cos(a + wob) * len, Math.sin(a + wob) * len);
      s.closePath(); s.fill();
    }
    s.rotate(-this.t * 0.55);

    // 3. expanding shockwave rings
    for (let k = 0; k < 3; k++) {
      const phase = (this.t * 0.7 + k / 3) % 1;
      const rr = base * (0.4 + phase * 1.5);
      s.strokeStyle = hsl(185, 100, 78, 0.6 * (1 - phase));
      s.lineWidth = (3 * (1 - phase) + 0.6) * bz;
      s.beginPath(); s.arc(0, 0, rr, 0, Math.PI * 2); s.stroke();
    }

    // 4. white-hot pulsing core
    const coreR = base * (0.2 + 0.07 * flare);
    const core = s.createRadialGradient(0, 0, 0, 0, 0, coreR);
    core.addColorStop(0, hsl(50, 100, 100, 0.98));
    core.addColorStop(0.5, hsl(46, 100, 82, 0.85));
    core.addColorStop(1, hsl(40, 100, 70, 0));
    s.fillStyle = core;
    s.beginPath(); s.arc(0, 0, coreR, 0, Math.PI * 2); s.fill();
    s.restore();
  }

  // A glow hugging the screen edge in the direction of the warp core, so the way
  // to the open gate is unmistakable even when it's off-screen.
  private drawWarpDirection(m: CanvasRenderingContext2D): void {
    const core = this.w2s(v(0, 0));
    const cx = this.w / 2, cy = this.h / 2;
    const dx = core.x - cx, dy = core.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const ex = cx + ux * this.w * 0.62, ey = cy + uy * this.h * 0.62;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
    const R = Math.max(this.w, this.h) * (0.55 + 0.12 * pulse);
    m.save();
    m.globalCompositeOperation = 'lighter';
    const g = m.createRadialGradient(ex, ey, 0, ex, ey, R);
    g.addColorStop(0, hsl(150, 100, 66, 0.30 + 0.16 * pulse));
    g.addColorStop(0.5, hsl(172, 100, 60, 0.10));
    g.addColorStop(1, hsl(172, 100, 60, 0));
    m.fillStyle = g;
    m.fillRect(0, 0, this.w, this.h);
    m.restore();
  }

  // The big screen-centred banner (e.g. WARP OPEN). Holds full, then fades.
  private drawBanner(m: CanvasRenderingContext2D): void {
    const b = this.banner;
    if (!b) return;
    const a = clamp(b.life, 0, 1);            // fades over the final second
    const intro = clamp((b.hold - b.life) / 0.25, 0, 1); // quick scale-in
    const pulse = 1 + 0.03 * Math.sin(this.t * 5);
    const sc = (0.8 + 0.2 * intro) * pulse;
    const cx = this.w / 2, cy = this.h * 0.42;
    m.save();
    m.textAlign = 'center'; m.textBaseline = 'middle';
    m.translate(cx, cy); m.scale(sc, sc);
    // glow behind the text
    m.globalCompositeOperation = 'lighter';
    const g = m.createRadialGradient(0, 0, 0, 0, 0, 340);
    g.addColorStop(0, hsl(150, 100, 60, 0.28 * a)); g.addColorStop(1, hsl(150, 100, 60, 0));
    m.fillStyle = g; m.fillRect(-360, -90, 720, 180);
    m.globalCompositeOperation = 'source-over';
    m.font = `800 38px ui-rounded, "Avenir Next", system-ui, sans-serif`;
    m.lineWidth = 6; m.strokeStyle = hsl(20, 40, 4, a * 0.9);
    m.strokeText(b.text, 0, 0);
    m.globalAlpha = a; m.fillStyle = b.color; m.fillText(b.text, 0, 0);
    m.globalAlpha = 1;
    m.restore();
  }

  private drawMarkers(m: CanvasRenderingContext2D): void {
    if (!this.markers.length) return;
    const cx = this.w / 2, cy = this.h / 2, margin = 54;
    m.save();
    m.textAlign = 'center';
    for (const mk of this.markers) {
      const sp = this.w2s(v(mk.x, mk.y));
      if (sp.x > margin && sp.x < this.w - margin && sp.y > margin && sp.y < this.h - margin) continue;
      const ang = Math.atan2(sp.y - cy, sp.x - cx);
      const px = clamp(sp.x, margin, this.w - margin);
      const py = clamp(sp.y, margin, this.h - margin);
      const big = !!mk.big;
      const pulse = big ? 0.7 + 0.3 * Math.sin(this.t * 6) : 1;
      const sc = big ? 2.1 * pulse : 1;
      m.save();
      m.translate(px, py); m.rotate(ang);
      m.globalCompositeOperation = 'lighter';
      if (big) { // halo behind the big warp arrow
        const g = m.createRadialGradient(0, 0, 0, 0, 0, 34);
        g.addColorStop(0, hsl(150, 100, 75, 0.5 * pulse)); g.addColorStop(1, hsl(150, 100, 60, 0));
        m.fillStyle = g; m.beginPath(); m.arc(0, 0, 34, 0, Math.PI * 2); m.fill();
      }
      m.fillStyle = mk.color;
      m.beginPath(); m.moveTo(14 * sc, 0); m.lineTo(-8 * sc, 8 * sc); m.lineTo(-3 * sc, 0); m.lineTo(-8 * sc, -8 * sc); m.closePath(); m.fill();
      m.restore();
      if (mk.label) {
        m.font = `800 ${big ? 14 : 11}px ui-rounded, system-ui, sans-serif`;
        m.fillStyle = mk.color;
        const lx = clamp(px, margin + 50, this.w - margin - 50);
        m.fillText(mk.label, lx, py + (py < cy ? (big ? 34 : 24) : (big ? -26 : -14)));
      }
    }
    m.restore();
  }

  private drawFloats(m: CanvasRenderingContext2D): void {
    m.save();
    m.textAlign = 'center';
    for (const f of this.floats) {
      const sp = this.w2s(v(f.x, f.y));
      const a = clamp(f.life, 0, 1);
      const pop = 1 + (1 - a) * 0.3;
      m.font = `800 ${f.size * pop}px ui-rounded, "Avenir Next", system-ui, sans-serif`;
      m.lineWidth = 4; m.strokeStyle = hsl(20, 30, 4, a * 0.85);
      m.strokeText(f.text, sp.x, sp.y);
      m.globalAlpha = a; m.fillStyle = f.color;
      m.fillText(f.text, sp.x, sp.y);
      m.globalAlpha = 1;
    }
    m.restore();
  }
}
