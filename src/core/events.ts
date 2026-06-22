// Typed event bus — the seam between physics, game, render, audio, and UI.
// Physics emits motion/contact events; game scores them into Charge/hull;
// render & audio turn them into the snap, the chord, the screenshake.
//
// This is a CONTRACT. Teams react to these events; do not add a field without
// updating every consumer. New event types are additive and cheap.

import type { Vec2 } from './math';

export type GameEvent =
  // ── Flight & gravity (physics → everyone) ──────────────────────
  | { type: 'enterSoi'; bodyId: string; at: Vec2; speed: number }
  | { type: 'exitSoi'; bodyId: string; at: Vec2 }
  | { type: 'orbitTick'; bodyId: string; quality: number; skim: number; speed: number } // quality 0..1 = how clean the orbit is
  | { type: 'igniteProgress'; bodyId: string; ignition: number; at: Vec2 } // 0..1 fill
  | { type: 'thrustBurst'; at: Vec2; heading: number }
  | { type: 'periapsis'; bodyId: string; skim: number; charge: number } // banked at closest approach
  | { type: 'snap'; quality: number; at: Vec2; speed: number } // a "spot on" orbit lock → slow-mo + chord
  | { type: 'pulse'; bodyId: string; at: Vec2; strength: number } // pulsar gravity wave fires
  // ── combat ─────────────────────────────────────────────────────
  | { type: 'missileFire'; owner: 'player' | 'enemy'; at: Vec2 }
  | { type: 'missileExplode'; at: Vec2 }
  | { type: 'enemyHit'; at: Vec2 }
  | { type: 'enemyDown'; at: Vec2; charge: number }
  | { type: 'enemySpawn'; count: number }
  | { type: 'powerupDrop'; ptype: string; at: Vec2 }
  | { type: 'powerupGet'; ptype: string; at: Vec2 }
  | { type: 'emberGet'; amount: number; at: Vec2 }
  | { type: 'weaponPickup'; at: Vec2 }
  // ── Harvest & economy (game) ───────────────────────────────────
  | { type: 'chargeGained'; amount: number; total: number; at: Vec2 }
  | { type: 'multiplier'; value: number }
  | { type: 'relicGrabbed'; relicId: string; at: Vec2 }
  // ── Hull & damage (game) ───────────────────────────────────────
  | { type: 'plateChipped'; remaining: number; at: Vec2 }
  | { type: 'plateShattered'; remaining: number; at: Vec2 }
  | { type: 'plateRepaired'; remaining: number }
  | { type: 'crash'; bodyId: string; at: Vec2 }
  | { type: 'craftDestroyed'; at: Vec2 }
  // ── World / seeding (game) ─────────────────────────────────────
  | { type: 'worldSeeded'; bodyId: string; at: Vec2; embers: number }
  | { type: 'systemCleared'; index: number }
  // ── Star-chart & run flow (game/meta) ──────────────────────────
  | { type: 'runStart'; seed: string }
  | { type: 'enterNode'; nodeType: NodeType; index: number; sector: number }
  | { type: 'paleAdvance'; distance: number } // 0..1 up the chart
  | { type: 'paleEngulf'; at: Vec2 } // the cold reaches the craft
  | { type: 'resonanceDrafted'; resonanceId: string }
  | { type: 'bossStart'; bossId: string }
  | { type: 'bossCleared'; bossId: string; sector: number }
  | { type: 'runOver'; won: boolean; depth: number; embers: number }
  // ── Pure presentation hints (anyone → render/audio) ────────────
  | { type: 'shake'; intensity: number }
  | { type: 'flash'; hue: number; intensity?: number }
  | { type: 'slowmo'; scale: number; duration: number } // scale<1 slows time
  | { type: 'spawnParticles'; at: Vec2; n: number; hue: number; speed?: number; spread?: number }
  | { type: 'tone'; note: number; velocity: number } // semitone offset in the sector scale
  | { type: 'chord'; notes: number[]; velocity: number };

export type NodeType =
  | 'dead'     // standard procedural gravity puzzle
  | 'anomaly'  // elite: hazardous, stronger rewards
  | 'derelict' // shop
  | 'shrine'   // one-off gamble
  | 'gate';    // boss

type Handler = (e: GameEvent) => void;

export class EventBus {
  private handlers = new Set<Handler>();
  private queue: GameEvent[] = [];

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  /** Listen for a single event `type`. Returns an unsubscribe fn. */
  onType<T extends GameEvent['type']>(
    type: T,
    h: (e: Extract<GameEvent, { type: T }>) => void,
  ): () => void {
    return this.on((e) => {
      if (e.type === type) h(e as Extract<GameEvent, { type: T }>);
    });
  }

  /** Emit immediately (synchronous fan-out). */
  emit(e: GameEvent): void {
    for (const h of this.handlers) h(e);
  }

  /** Defer to be flushed at a safe point in the loop. */
  post(e: GameEvent): void {
    this.queue.push(e);
  }

  flush(): void {
    if (this.queue.length === 0) return;
    const q = this.queue;
    this.queue = [];
    for (const e of q) this.emit(e);
  }
}
