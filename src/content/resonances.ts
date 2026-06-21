// Resonances — the power-up / build layer. Each is pure data: a set of `mods`
// that the solver, the run, and main read live. Drafting one (1-of-3 between
// fields) reshapes how the whole game plays. Multipliers multiply, additive
// bonuses add, flags OR — so they STACK into builds.
//
// The win condition for this file: two runs should feel different by the 3rd
// field. Adding a new power-up = add a data entry here, nothing else (as long as
// its mods are levers the systems already read — see ResonanceMods).

import type { Resonance, ResonanceMods } from '../core/types';
import { RNG } from '../core/rng';

export const RESONANCES: Resonance[] = [
  // ── flight ──────────────────────────────────────────────────────
  { id: 'slipstream', name: 'Slipstream', family: 'flight', rarity: 'common',
    blurb: 'Space lets go. Far less drag — you coast forever.',
    mods: { dragMul: 0.45 } },
  { id: 'ion_burners', name: 'Ion Burners', family: 'flight', rarity: 'common',
    blurb: 'Thrusters hit 60% harder. Snappier turns and burns.',
    mods: { thrustMul: 1.6 } },
  { id: 'afterburn', name: 'Afterburn', family: 'flight', rarity: 'rare',
    blurb: 'Double-tap thrust for an explosive boost.',
    mods: { afterburner: true, thrustMul: 1.15 } },

  // ── orbit / ignition ───────────────────────────────────────────
  { id: 'wide_band', name: 'Resonant Field', family: 'orbit', rarity: 'common',
    blurb: 'The ignition band swells — far more room to lock an orbit.',
    mods: { bandWiden: 0.8 } },
  { id: 'kindling', name: 'Kindling', family: 'orbit', rarity: 'common',
    blurb: 'Dead worlds catch fire 70% faster.',
    mods: { igniteRateMul: 1.7 } },
  { id: 'steady_hand', name: 'Steady Hand', family: 'orbit', rarity: 'common',
    blurb: 'Sloppier orbits still count. Forgiveness, encoded.',
    mods: { qualityAssist: 0.8 } },
  { id: 'tractor', name: 'Tractor Lock', family: 'orbit', rarity: 'rare',
    blurb: 'A field gently steers you toward a clean circular orbit.',
    mods: { tractor: 0.6, igniteRateMul: 1.1 } },
  { id: 'lodestar', name: 'Lodestar', family: 'orbit', rarity: 'rare',
    blurb: 'Worlds you relight gently pull you — chain into the next.',
    mods: { magnet: true } },

  // ── harvest ────────────────────────────────────────────────────
  { id: 'deep_greed', name: 'Deep Greed', family: 'harvest', rarity: 'common',
    blurb: 'Skimming the surface mints far more Charge. Dare lower.',
    mods: { deepGreedMul: 2.2 } },
  { id: 'prism', name: 'Prism Coils', family: 'harvest', rarity: 'rare',
    blurb: 'Everything you earn pays 50% more.',
    mods: { chargeMul: 1.5 } },

  // ── hull / defense ─────────────────────────────────────────────
  { id: 'heat_shield', name: 'Heat Shielding', family: 'hull', rarity: 'common',
    blurb: 'Graze far lower before a plate chips.',
    mods: { heatToleranceMul: 1.8 } },
  { id: 'bulwark', name: 'Bulwark Plating', family: 'hull', rarity: 'common',
    blurb: 'Start every field with two extra hull plates.',
    mods: { platesBonus: 2 } },
  { id: 'aegis', name: 'Aegis Capacitor', family: 'hull', rarity: 'common',
    blurb: 'Two extra shield cells soak up the incoming fire.',
    mods: { shieldBonus: 2 } },
  { id: 'fast_recharge', name: 'Fast Recharge', family: 'hull', rarity: 'rare',
    blurb: 'Your shield snaps back to full almost twice as fast.',
    mods: { shieldRegenMul: 2 } },
  { id: 'ablative_skin', name: 'Ablative Skin', family: 'hull', rarity: 'rare',
    blurb: 'A spare shield cell, and skim a little lower without chipping.',
    mods: { shieldBonus: 1, heatToleranceMul: 1.3 } },

  // ── combat ─────────────────────────────────────────────────────
  { id: 'autoloader', name: 'Autoloader', family: 'combat', rarity: 'common',
    blurb: 'Missiles reload 70% faster. Hose them down.',
    mods: { fireRateMul: 1.7 } },
  { id: 'piercer', name: 'Lance Rounds', family: 'combat', rarity: 'rare',
    blurb: 'Missiles punch clean through a drone into the next behind it.',
    mods: { pierce: 1 } },
  { id: 'twin_launch', name: 'Twin Launcher', family: 'combat', rarity: 'rare',
    blurb: 'Fire two missiles at once in a tight spread.',
    mods: { multiShot: 1 } },
  { id: 'bounty', name: 'Bounty Coils', family: 'combat', rarity: 'rare',
    blurb: 'Every drone you down pays double Charge.',
    mods: { killChargeMul: 2 } },
  { id: 'salvo', name: 'Salvo Array', family: 'combat', rarity: 'cosmic',
    blurb: 'A three-missile fan, reloading fast. Total saturation.',
    mods: { multiShot: 2, fireRateMul: 1.3 } },

  // ── exotic ─────────────────────────────────────────────────────
  { id: 'comet', name: 'Comet Heart', family: 'exotic', rarity: 'rare',
    blurb: 'A luminous trail, slippery coasting, and a spare shield cell.',
    mods: { wakeTrail: true, dragMul: 0.8, shieldBonus: 1 } },
  { id: 'chain_reaction', name: 'Chain Reaction', family: 'exotic', rarity: 'cosmic',
    blurb: 'Relighting a world speeds the next ignition and pays out richer.',
    mods: { igniteRateMul: 1.4, chargeMul: 1.3 } },
  { id: 'starforge', name: 'Starforge', family: 'exotic', rarity: 'cosmic',
    blurb: 'Wider bands, faster ignition, richer rewards. A maker of suns.',
    mods: { bandWiden: 0.5, igniteRateMul: 1.4, chargeMul: 1.4 } },
  { id: 'overdrive', name: 'Overdrive', family: 'exotic', rarity: 'cosmic',
    blurb: 'Everything dialled up: thrust, fire rate, and shield recovery.',
    mods: { thrustMul: 1.3, fireRateMul: 1.4, shieldRegenMul: 1.4 } },

  // ── high-tier unlocks (favoured in deeper sectors) ─────────────
  { id: 'gunship', name: 'Gunship Refit', family: 'combat', rarity: 'rare',
    blurb: 'An extra missile per shot and a faster reload. Become a gunship.',
    mods: { multiShot: 1, fireRateMul: 1.3 } },
  { id: 'vortex', name: 'Vortex Rounds', family: 'combat', rarity: 'cosmic',
    blurb: 'Missiles punch through two drones and reload like mad.',
    mods: { pierce: 2, fireRateMul: 1.4 } },
  { id: 'hardlight', name: 'Hardlight Shield', family: 'hull', rarity: 'cosmic',
    blurb: 'Three more shield cells that snap back almost instantly.',
    mods: { shieldBonus: 3, shieldRegenMul: 1.8 } },
  { id: 'midas', name: 'Midas Drive', family: 'harvest', rarity: 'cosmic',
    blurb: 'Double everything you earn — Charge, kills, the lot.',
    mods: { chargeMul: 2, killChargeMul: 1.5 } },
  { id: 'singularity', name: 'Singularity Coil', family: 'exotic', rarity: 'cosmic',
    blurb: 'Relit worlds drag you in to chain, and pay out far richer.',
    mods: { magnet: true, chargeMul: 1.5, igniteRateMul: 1.3 } },
];

const BY_ID: Record<string, Resonance> = Object.fromEntries(RESONANCES.map((r) => [r.id, r]));
export const resonanceById = (id: string): Resonance | undefined => BY_ID[id];

/** Fold one mods object into an accumulator: ×Mul, +additive, ||flags. */
export function foldMods(into: Partial<ResonanceMods>, d: Partial<ResonanceMods>): Partial<ResonanceMods> {
  const m = into;
  const mul = (k: keyof ResonanceMods, val?: number) => { if (val != null) (m as any)[k] = ((m as any)[k] ?? 1) * val; };
  const addv = (k: keyof ResonanceMods, val?: number) => { if (val != null) (m as any)[k] = ((m as any)[k] ?? 0) + val; };
  const flag = (k: keyof ResonanceMods, val?: boolean) => { if (val) (m as any)[k] = true; };
  mul('thrustMul', d.thrustMul); mul('dragMul', d.dragMul);
  mul('igniteRateMul', d.igniteRateMul); mul('deepGreedMul', d.deepGreedMul);
  mul('chargeMul', d.chargeMul); mul('heatToleranceMul', d.heatToleranceMul);
  mul('shieldRegenMul', d.shieldRegenMul); mul('fireRateMul', d.fireRateMul);
  mul('killChargeMul', d.killChargeMul);
  addv('bandWiden', d.bandWiden); addv('qualityAssist', d.qualityAssist);
  addv('tractor', d.tractor); addv('grazeWard', d.grazeWard);
  addv('platesBonus', d.platesBonus); addv('shieldBonus', d.shieldBonus);
  addv('multiShot', d.multiShot); addv('missileDmg', d.missileDmg); addv('pierce', d.pierce);
  flag('afterburner', d.afterburner); flag('magnet', d.magnet);
  flag('wakeTrail', d.wakeTrail); flag('chain', d.chain);
  return m;
}

/** Merge owned Resonances (plus optional base, e.g. a hull) into one mods object. */
export function aggregateMods(ids: string[], base: Partial<ResonanceMods> = {}): Partial<ResonanceMods> {
  const m: Partial<ResonanceMods> = {};
  foldMods(m, base);
  for (const id of ids) { const r = BY_ID[id]; if (r) foldMods(m, r.mods); }
  return m;
}

/**
 * Offer n distinct Resonances the player doesn't already own. Rewards scale
 * with depth: early sectors lean common, deeper sectors flood with rare/cosmic
 * power. A deep draft (sector ≥4) also guarantees at least one rare-or-better.
 */
export function draftOffer(rng: RNG, owned: string[], n = 3, depth = 0): Resonance[] {
  const pool = RESONANCES.filter((r) => !owned.includes(r.id));
  const weight = (r: Resonance) => {
    if (r.rarity === 'cosmic') return 0.5 + depth * 0.6;
    if (r.rarity === 'rare') return 2 + depth * 0.8;
    return Math.max(0.6, 6 - depth * 1.1); // commons fade as you fall
  };
  const out: Resonance[] = [];
  const avail = pool.slice();
  // deeper runs guarantee the first pick is rare-or-better, if any remain
  if (depth >= 3) {
    const good = avail.filter((r) => r.rarity !== 'common');
    if (good.length) {
      const pick = rng.weighted(good, good.map(weight));
      out.push(pick); avail.splice(avail.indexOf(pick), 1);
    }
  }
  while (out.length < n && avail.length) {
    const pick = rng.weighted(avail, avail.map(weight));
    out.push(pick);
    avail.splice(avail.indexOf(pick), 1);
  }
  return out;
}

export const RARITY_HINT: Record<string, string> = {
  common: 'common', rare: 'rare', cosmic: 'cosmic',
};
