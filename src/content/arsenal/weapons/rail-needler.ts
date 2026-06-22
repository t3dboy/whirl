// Rail Needler — fires a piercing slug that punches straight through everything
// in its path. Great against tight columns. Levels add damage and pierce.
import { type ArsenalWeapon, ready } from '../types';
import { sub, norm, scale, v } from '../../../core/math';

export const railNeedler: ArsenalWeapon = {
  id: 'rail-needler',
  name: 'Rail Needler',
  blurb: 'Fires a piercing slug that punches straight through everything in its path. Great against tight columns of enemies.',
  archetype: 'projectile',
  maxLevel: 6,
  stats(level) {
    return {
      cooldown: Math.max(0.45, 1.0 - level * 0.1),
      damage: 9 + level * 4.5,
      reach: 0,
      count: 2 + level * 2,    // pierce
      extra: 760,              // speed
    };
  },
  tick(ctx) {
    const s = this.stats(ctx.level);
    if (!ready(ctx, s.cooldown)) return;
    const target = ctx.nearestEnemy(ctx.craft.pos, 1100);
    const dir = target ? norm(sub(target.pos, ctx.craft.pos)) : v(Math.cos(ctx.craft.heading), Math.sin(ctx.craft.heading));
    ctx.spawnProjectile({
      pos: { x: ctx.craft.pos.x + dir.x * 18, y: ctx.craft.pos.y + dir.y * 18 },
      vel: scale(dir, s.extra!),
      hue: 195, dmg: s.damage, life: 2.2, maxSpeed: s.extra!, accel: 0,
      pierce: s.count, radius: 5,
    });
  },
};
