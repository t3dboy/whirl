// Drifting Mines — deploys floating proximity charges that detonate when
// hostiles wander in. Area denial for controlling space. Levels drop them faster
// with bigger blasts.
import { type ArsenalWeapon, ready } from '../types';

export const driftingMines: ArsenalWeapon = {
  id: 'drifting-mines',
  name: 'Drifting Mines',
  blurb: 'Deploys floating proximity charges that detonate when hostiles wander in. Area denial for controlling space.',
  archetype: 'mine',
  maxLevel: 6,
  stats(level) {
    return {
      cooldown: Math.max(0.8, 2.0 - level * 0.2),
      damage: 12 + level * 7,
      reach: 60 + level * 10,   // detonation/blast radius
      count: 1,
    };
  },
  tick(ctx) {
    const s = this.stats(ctx.level);
    if (!ready(ctx, s.cooldown)) return;
    // drop slightly behind the craft's motion so mines trail in your wake
    const back = 26;
    const vx = ctx.craft.vel.x, vy = ctx.craft.vel.y;
    const sp = Math.hypot(vx, vy) || 1;
    const x = ctx.craft.pos.x - (vx / sp) * back;
    const y = ctx.craft.pos.y - (vy / sp) * back;
    ctx.spawnMine(x, y, { dmg: s.damage, radius: s.reach, life: 14, armTime: 0.5, hue: 12 });
  },
};
