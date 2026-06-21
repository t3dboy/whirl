// Weapons — the player's missile loadout, bought with Embers in the Hangar.
// Start with dumb-fire Slugs; unlock Heat-Seekers that chase the nearest drone.

export interface WeaponDef {
  id: string;
  name: string;
  blurb: string;
  cost: number;       // Embers to unlock (0 = starter)
  seeker: boolean;    // homes onto the nearest enemy vs. flying straight
  maxSpeed: number;
  accel: number;
}

export const WEAPONS: WeaponDef[] = [
  { id: 'unguided', name: 'Slug Cannon', cost: 0, seeker: false, maxSpeed: 560, accel: 700,
    blurb: 'Dumb-fire slugs that sling wildly through gravity. Lead your shots.' },
  { id: 'seeker', name: 'Heat-Seeker', cost: 55, seeker: true, maxSpeed: 540, accel: 680,
    blurb: 'Locks onto the nearest drone and chases it through the gravity wells.' },
];

const BY_ID: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const weaponById = (id: string): WeaponDef => BY_ID[id] ?? WEAPONS[0];
