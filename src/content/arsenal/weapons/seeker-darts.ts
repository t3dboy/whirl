// Seeker Darts — fires homing slivers that track nearby targets on their own.
// Reliable passive damage, no aiming. Levels add darts and damage.
import { type ArsenalWeapon, ready } from '../types';
import { v } from '../../../core/math';

export const seekerDarts: ArsenalWeapon = {
  id: 'seeker-darts',
  name: 'Seeker Darts',
  blurb: 'Fires homing slivers that track nearby targets on their own. Reliable passive damage with no aiming needed.',
  archetype: 'projectile',
  maxLevel: 6,
  stats(level) {
    return {
      cooldown: Math.max(0.5, 1.1 - level * 0.1),
      damage: 5 + level * 2.6,
      reach: 0,
      count: 1 + Math.ceil(level / 2),  // darts per volley
      extra: 420,                        // speed
    };
  },
  tick(ctx) {
    const s = this.stats(ctx.level);
    if (!ready(ctx, s.cooldown)) return;
    if (!ctx.nearestEnemy(ctx.craft.pos, 1200)) return; // don't waste volleys into the void
    for (let i = 0; i < s.count; i++) {
      const a = ctx.t * 3 + (i / s.count) * Math.PI * 2;
      const dir = v(Math.cos(a), Math.sin(a));
      ctx.spawnProjectile({
        pos: { x: ctx.craft.pos.x + dir.x * 14, y: ctx.craft.pos.y + dir.y * 14 },
        vel: { x: dir.x * 180, y: dir.y * 180 },
        hue: 300, dmg: s.damage, life: 2.6, maxSpeed: s.extra!, accel: 520,
        homing: 5.5, radius: 5,
      });
    }
  },
};
