// Magma Caster — lobs unstable plasma cores that detonate on impact for a direct
// hit plus a splash of burning ejecta. Solid early crowd damage. Levels add
// damage and blast radius.
import { type ArsenalWeapon, ready } from '../types';
import { sub, norm, scale, v } from '../../../core/math';

export const magmaCaster: ArsenalWeapon = {
  id: 'magma-caster',
  name: 'Magma Caster',
  blurb: 'Lobs unstable plasma cores that detonate on impact, dealing direct hits plus a splash of burning ejecta.',
  archetype: 'projectile',
  maxLevel: 6,
  stats(level) {
    return {
      cooldown: Math.max(0.55, 1.3 - level * 0.13),
      damage: 8 + level * 5,
      reach: 70 + level * 14,   // blast radius
      count: 1,
      extra: 300,               // projectile speed
    };
  },
  tick(ctx) {
    const s = this.stats(ctx.level);
    if (!ready(ctx, s.cooldown)) return;
    const target = ctx.nearestEnemy(ctx.craft.pos, 900);
    const dir = target ? norm(sub(target.pos, ctx.craft.pos)) : v(Math.cos(ctx.craft.heading), Math.sin(ctx.craft.heading));
    ctx.spawnProjectile({
      pos: { x: ctx.craft.pos.x + dir.x * 18, y: ctx.craft.pos.y + dir.y * 18 },
      vel: scale(dir, s.extra!),
      hue: 22, dmg: s.damage, life: 2.4, maxSpeed: s.extra!, accel: 0,
      explodeRadius: s.reach, radius: 7,
    });
  },
};
