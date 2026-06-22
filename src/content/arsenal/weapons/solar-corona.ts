// Solar Corona — a permanent ring of stellar radiation around the hull that
// scorches anything in your orbit. Pure aura, no aiming. Levels widen the ring
// and turn up the burn.
import type { ArsenalWeapon } from '../types';

export const solarCorona: ArsenalWeapon = {
  id: 'solar-corona',
  name: 'Solar Corona',
  blurb: 'A permanent ring of stellar radiation burns around your hull, scorching anything that drifts too close.',
  archetype: 'aura',
  maxLevel: 6,
  stats(level) {
    return {
      cooldown: 0,
      damage: 3 + level * 1.6,      // per second
      reach: 70 + level * 16,
      count: 1,
    };
  },
  tick(ctx) {
    const s = this.stats(ctx.level);
    const burn = s.damage * ctx.dt;
    for (const e of ctx.enemiesInRadius(ctx.craft.pos, s.reach)) ctx.damage(e, burn);
    // pulsing ring, re-emitted each frame so it persists
    ctx.fx({ kind: 'ring', x: ctx.craft.pos.x, y: ctx.craft.pos.y, r: s.reach, hue: 32, width: 6, life: 0.1, max: 0.1 });
  },
};
