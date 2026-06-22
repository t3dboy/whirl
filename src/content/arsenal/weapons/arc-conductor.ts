// Arc Conductor — fires an ionized bolt that leaps from target to target,
// chaining across packed formations. Levels add jumps, damage and range.
import { type ArsenalWeapon, ready, type EnemyRef } from '../types';

export const arcConductor: ArsenalWeapon = {
  id: 'arc-conductor',
  name: 'Arc Conductor',
  blurb: 'Fires an ionized bolt that leaps from target to target, chaining across packed formations.',
  archetype: 'chain',
  maxLevel: 6,
  stats(level) {
    return {
      cooldown: Math.max(0.5, 1.1 - level * 0.1),
      damage: 7 + level * 3.5,
      reach: 280,            // initial seek + per-jump range
      count: 1 + level,      // number of targets hit (jumps = count-1)
    };
  },
  tick(ctx) {
    const s = this.stats(ctx.level);
    if (!ready(ctx, s.cooldown)) return;
    const hit = new Set<number>();
    const pts: number[] = [ctx.craft.pos.x, ctx.craft.pos.y];
    let from = ctx.craft.pos;
    for (let i = 0; i < s.count; i++) {
      const next: EnemyRef | null = ctx.nearestEnemy(from, s.reach, hit);
      if (!next) break;
      hit.add(next.id);
      pts.push(next.pos.x, next.pos.y);
      ctx.damage(next, s.damage * (1 - i * 0.06)); // slight falloff per jump
      from = next.pos;
    }
    if (pts.length >= 4) ctx.fx({ kind: 'bolt', x: 0, y: 0, pts, hue: 195, width: 3, life: 0.24, max: 0.24 });
  },
};
