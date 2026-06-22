// Vibroblade — a short arc of cutting plasma sweeps the space ahead of you,
// slicing clustered targets. Cheap, reliable opener. Levels widen the arc,
// extend reach and swing faster.
import { type ArsenalWeapon, ready } from '../types';

export const vibroblade: ArsenalWeapon = {
  id: 'vibroblade',
  name: 'Vibroblade',
  blurb: 'A short arc of cutting plasma sweeps the space ahead of you, slicing through clustered targets.',
  archetype: 'melee',
  maxLevel: 6,
  stats(level) {
    return {
      cooldown: Math.max(0.32, 0.9 - level * 0.1),
      damage: 6 + level * 4,
      reach: 95 + level * 14,
      count: 1,
      extra: 0.6 + level * 0.12, // arc half-angle (radians)
    };
  },
  tick(ctx) {
    const s = this.stats(ctx.level);
    if (!ready(ctx, s.cooldown)) return;
    const half = s.extra!;
    const facing = ctx.craft.heading;
    for (const e of ctx.enemiesInArc(ctx.craft.pos, facing, half, s.reach)) ctx.damage(e, s.damage);
    ctx.fx({ kind: 'arc', x: ctx.craft.pos.x, y: ctx.craft.pos.y, r: s.reach, a0: facing - half, a1: facing + half, hue: 170, width: 5, life: 0.18, max: 0.18 });
  },
};
