// WHORL — bootstrap & the run.
//
// You pilot a seed-craft on its thrusters through deepening fields of dead
// worlds. Spheres of influence bend your path; hold a clean orbit in a world's
// ignition band to relight it. Relight the goal to warp deeper and draft a
// Resonance (power-up) that reshapes how you fly. All the while the Pale closes
// in from the rim — relight fast, or the cold takes the system.

import { GameLoop } from './core/loop';
import { EventBus } from './core/events';
import { v, len, sub, norm, add, scale, dist } from './core/math';
import { World, DEFAULT_TUNING } from './physics/world';
import { Run, type FieldState } from './game/run';
import { Combat } from './game/combat';
import { Powerups, POWERUPS, type PType } from './game/powerups';
import { aggregateMods, draftOffer, resonanceById } from './content/resonances';
import { hullById } from './content/hulls';
import { weaponById } from './content/weapons';
import { loadSave, writeSave, recordScore, resetSave } from './meta/save';
import { RNG } from './core/rng';
import { Renderer } from './render/renderer';
import { biomeFor } from './render/biomes';
import { AudioEngine } from './audio/audio';
import { showDraft } from './ui/draft';
import { showHangar, showSummary } from './ui/meta';
import { THEME } from './render/theme';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLDivElement;

const bus = new EventBus();
const world = new World(bus, { ...DEFAULT_TUNING });
const renderer = new Renderer(canvas);
const audio = new AudioEngine();

let save = loadSave();
let runSeed = 'whorl-1';
let run = new Run(runSeed);
let field: FieldState = run.startField();
let draftRng = new RNG(runSeed + '-draft');

const MAX_SHIELD = 3;
const state = {
  charge: 0, score: 0, mult: 1,
  plates: 3, maxPlates: 3, basePlates: 3,
  shield: MAX_SHIELD, maxShield: MAX_SHIELD,
  relit: 0, total: countDead(field), goal: field.goal,
  runRelit: 0, // total relit across the whole run (for Embers)
  owned: [] as string[],
  hullId: save.selectedHull,
  weaponId: save.selectedWeapon,
  phase: 'hangar' as 'hangar' | 'play' | 'draft' | 'over' | 'paused',
};
let emberFloatAcc = 0; // batch up ember pickups into one float text
let saveDirty = false, saveFlushAcc = 0; // throttle localStorage writes for ember banking
function addScore(amount: number, useMult = true): number {
  const g = Math.round(amount * (useMult ? state.mult : 1));
  state.score += g;
  return g;
}
let shieldClock = 0; // seconds since last hit (drives regen)

function countDead(f: FieldState): number {
  return f.bodies.filter((b) => b.kind !== 'star' && b.kind !== 'blackhole').length;
}
function currentMods() { return aggregateMods(state.owned, hullById(state.hullId).mods); }
function applyMods(): void {
  const mods = currentMods();
  const hull = hullById(state.hullId);
  world.setMods(mods);
  state.basePlates = hull.plates;
  state.maxPlates = state.basePlates + (mods.platesBonus ?? 0);
  state.plates = Math.min(state.maxPlates, Math.max(state.plates, state.basePlates));
  state.maxShield = MAX_SHIELD + (mods.shieldBonus ?? 0);
  state.shield = Math.min(state.maxShield, Math.max(state.shield, MAX_SHIELD));
  // combat loadout from drafted upgrades (powerups layer on top each frame)
  baseUpg = {
    cooldown: 0.32 / (mods.fireRateMul ?? 1),
    shots: 1 + (mods.multiShot ?? 0),
    dmg: 1 + (mods.missileDmg ?? 0),
    pierce: mods.pierce ?? 0,
  };
  refreshUpgrades();
  // powerup global stats (raised by Resonances)
  powerups.dropChance = 0.18 + (mods.powerDrop ?? 0);
  powerups.mult = 1 + (mods.powerMult ?? 0);
}
let baseUpg = { cooldown: 0.32, shots: 1, dmg: 1, pierce: 0 };
// fold transient powerup multipliers onto the drafted base each frame
function refreshUpgrades(): void {
  combat.upgrades = {
    cooldown: baseUpg.cooldown / powerups.fireRateMul(),
    shots: baseUpg.shots,
    dmg: Math.round(baseUpg.dmg * powerups.damageMul()),
    pierce: baseUpg.pierce,
  };
}
function chargeMul(): number { return currentMods().chargeMul ?? 1; }
function killChargeMul(): number { return currentMods().killChargeMul ?? 1; }
function shieldRegenMul(): number { return currentMods().shieldRegenMul ?? 1; }

const combat = new Combat();
renderer.combat = combat;
const powerups = new Powerups();
renderer.powerups = powerups;
const NUKE_R = 520;

world.reset(field.bodies, field.spawn, v(0, 0), field.relics);
applyMods();

// ── HUD ──
const FONT_R = 'ui-rounded, "Avenir Next", system-ui, sans-serif';
const PANEL = `background:${hexA(THEME.panel, 0.5)};backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1.5px solid ${hexA(THEME.panelBorder, 0.7)};border-radius:14px;box-shadow:0 6px 22px rgba(0,0,0,.45)`;
const hudStyle = document.createElement('style');
hudStyle.textContent = '@keyframes wpulse{0%,100%{opacity:.5}50%{opacity:1}}@keyframes wfade{from{opacity:0}to{opacity:1}}';
document.head.appendChild(hudStyle);
const hud = document.createElement('div');
hud.style.cssText = `position:absolute;left:16px;top:14px;padding:12px 16px;color:${THEME.ink};font-family:${FONT_R};user-select:none;${PANEL}`;
uiRoot.appendChild(hud);
const owned = document.createElement('div');
owned.style.cssText = `position:absolute;right:14px;top:14px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;user-select:none`;
uiRoot.appendChild(owned);
const pups = document.createElement('div');
pups.style.cssText = `position:absolute;left:0;right:0;top:14px;display:flex;gap:10px;justify-content:center;user-select:none`;
uiRoot.appendChild(pups);
const hint = document.createElement('div');
hint.style.cssText = `position:absolute;left:0;right:0;bottom:16px;text-align:center;color:${hexA(THEME.inkDim, 0.85)};font:${THEME.font};letter-spacing:.4px;user-select:none;text-shadow:0 2px 6px #000`;
hint.textContent = 'thrust: mouse / touch / ↑  ·  fire: Space / F  ·  brake: B / ↓  ·  orbit the gold band to relight a world  ·  reach the core to warp';
uiRoot.appendChild(hint);

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function plateIcons(): string {
  let s = '';
  for (let i = 0; i < state.maxPlates; i++) {
    const on = i < state.plates;
    s += `<span style="color:${on ? THEME.danger : hexA(THEME.inkDim, 0.4)};font-size:17px;filter:drop-shadow(0 0 3px ${on ? hexA(THEME.danger, 0.6) : 'transparent'})">◆</span>`;
  }
  return s;
}
function shieldIcons(): string {
  if (state.maxShield <= 0) return '';
  let s = '';
  for (let i = 0; i < state.maxShield; i++) {
    const on = i < state.shield;
    s += `<span style="color:${on ? THEME.tether : hexA(THEME.inkDim, 0.35)};font-size:15px;filter:drop-shadow(0 0 4px ${on ? hexA(THEME.tether, 0.7) : 'transparent'})">⬡</span>`;
  }
  return s;
}
function goalPips(): string {
  let s = '';
  for (let i = 0; i < state.goal; i++) {
    const on = i < state.relit;
    s += `<span style="display:inline-block;width:14px;height:6px;border-radius:3px;margin-right:3px;background:${on ? THEME.good : hexA(THEME.inkDim, 0.3)};box-shadow:${on ? `0 0 6px ${hexA(THEME.good, 0.8)}` : 'none'}"></span>`;
  }
  return s;
}
function updateMarkers(): void {
  const ms: { x: number; y: number; color: string; label?: string; big?: boolean }[] = [];
  if (renderer.warpOpen) {
    ms.push({ x: 0, y: 0, color: THEME.good, label: 'WARP ▸ CORE', big: true });
  } else {
    // point toward the nearest dead world so you always know where to go
    let near: { x: number; y: number } | null = null, nd = Infinity;
    for (const b of world.bodies) {
      if (b.seeded || b.kind === 'star' || b.kind === 'blackhole') continue;
      const d = dist(world.craft.pos, b.pos);
      if (d < nd) { nd = d; near = b.pos; }
    }
    if (near) ms.push({ x: near.x, y: near.y, color: THEME.charge, label: 'WORLD' });
  }
  // always point toward an uncollected relic — it's worth the detour
  let relic: { x: number; y: number } | null = null, rd = Infinity;
  for (const r of world.relics) {
    if (r.grabbed) continue;
    const d = dist(world.craft.pos, r.pos);
    if (d < rd) { rd = d; relic = r.pos; }
  }
  if (relic) ms.push({ x: relic.x, y: relic.y, color: THEME.rarity.cosmic, label: 'RELIC' });
  renderer.markers = ms;
}

function renderHUD(): void {
  const playing = state.phase === 'play';
  hud.style.display = owned.style.display = hint.style.display = pups.style.display = playing ? '' : 'none';
  fireBtn.style.display = playing && combat.enemies.length > 0 ? '' : 'none';
  if (playing) {
    pups.innerHTML = powerups.activeList().map((a) => {
      const d = POWERUPS[a.type]; const frac = Math.max(0, Math.min(1, a.remaining / a.dur));
      const col = `hsl(${d.hue},90%,65%)`;
      return `<div style="${PANEL};border-color:${col};border-radius:10px;padding:4px 10px;min-width:64px;text-align:center;font:800 13px ${FONT_R};color:${THEME.ink}">` +
        `<span style="color:${col}">${d.glyph}</span> ${Math.ceil(a.remaining)}s` +
        `<div style="height:3px;margin-top:3px;border-radius:2px;background:${hexA(col, 0.25)}"><div style="height:100%;width:${frac * 100}%;background:${col};border-radius:2px"></div></div></div>`;
    }).join('');
  }
  brakeBtn.style.display = playing ? '' : 'none';
  renderer.shieldFrac = state.maxShield > 0 ? state.shield / state.maxShield : 0;
  renderer.warpOpen = state.relit >= state.goal && playing;
  updateMarkers();
  if (!playing) { renderer.markers = []; return; }
  const warpReady = state.relit >= state.goal;
  const threat = combat.enemies.length;
  hud.innerHTML =
    `<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px">` +
      `<span style="font:800 30px ${FONT_R};color:${THEME.ink};text-shadow:0 0 14px ${hexA(THEME.charge, 0.5)}">${state.score.toLocaleString()}</span>` +
      `<span style="font:800 18px ${FONT_R};color:${state.mult > 1 ? THEME.charge : THEME.inkDim}">×${state.mult.toFixed(1)}</span>` +
    `</div>` +
    `<div style="font-size:11px;color:${THEME.inkDim};margin-bottom:7px">⟡ ${Math.floor(state.charge)} charge</div>` +
    `<div style="margin-bottom:5px;letter-spacing:2px">${plateIcons()}</div>` +
    `<div style="margin-bottom:9px;letter-spacing:2px">${shieldIcons()}</div>` +
    `<div style="font-size:11px;letter-spacing:2px;color:${THEME.inkDim};margin-bottom:4px">SECTOR ${run.depth + 1} · ${biomeFor(run.depth).name.toUpperCase()}</div>` +
    `<div style="margin-bottom:6px">${goalPips()}</div>` +
    (warpReady
      ? `<div style="color:${THEME.good};font-weight:800;font-size:12.5px;animation:wpulse 1s infinite">▼ WARP OPEN — dive to the core</div>` +
        `<div style="color:${THEME.charge};font-size:11px;margin-top:2px">…or stay & kill for score (×${state.mult.toFixed(1)})${threat ? ` · <span style="color:${THEME.danger}">${threat} hostile${threat > 1 ? 's' : ''}</span>` : ''}</div>`
      : `<div style="color:${THEME.inkDim};font-size:12px">relight ${state.goal - state.relit} more${threat ? ` · <span style="color:${THEME.danger}">⚠ ${threat} hostile${threat > 1 ? 's' : ''}</span>` : ''}</div>`);
  owned.innerHTML = state.owned.map((id) => {
    const r = resonanceById(id); if (!r) return '';
    const col = THEME.rarity[r.rarity];
    return `<div style="${PANEL};border-color:${hexA(col, 0.8)};border-radius:9px;padding:3px 10px;font:700 12px ${FONT_R};color:${THEME.ink}">${r.name}</div>`;
  }).join('');
}

// ── input ──
const keys = new Set<string>();
let pointerDown = false;
let fireBtnDown = false;
let brakeBtnDown = false;
let braking = false;
let pointerScreen = v(window.innerWidth / 2, window.innerHeight / 2);
let heading = 0;
let lastThrustStart = -1, thrustClock = 0;
const TURN = 3.6;

// boot audio + music on the FIRST interaction anywhere (menu button, key, etc.) —
// browsers block the AudioContext until a user gesture, so this is where music
// can actually start. Runs once; subsequent calls are cheap no-ops.
let audioBooted = false;
let musicEnabled = true; // music plays after the first interaction
function bootAudio(): void {
  audio.resume();
  if (!audioBooted) { audioBooted = true; if (musicEnabled) audio.startMusic(); }
}
window.addEventListener('pointerdown', bootAudio);
window.addEventListener('keydown', bootAudio);

canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.resume(); pointerDown = true; pointerScreen = v(e.clientX, e.clientY); });
window.addEventListener('pointermove', (e) => { pointerScreen = v(e.clientX, e.clientY); });
window.addEventListener('pointerup', () => { pointerDown = false; });
window.addEventListener('keydown', (e) => {
  audio.resume();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyR' && state.phase === 'play') endRun(false); // abandon → summary
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// on-screen FIRE button (touch / mouse)
const fireBtn = document.createElement('button');
fireBtn.textContent = '◎ FIRE';
fireBtn.style.cssText = `position:absolute;right:22px;bottom:64px;width:88px;height:88px;border-radius:50%;
  border:2.5px solid ${hexA(THEME.danger, 0.8)};background:${hexA(THEME.panel, 0.55)};backdrop-filter:blur(8px);
  color:${THEME.danger};font:800 14px ${FONT_R};cursor:pointer;user-select:none;touch-action:none;
  box-shadow:0 0 22px ${hexA(THEME.danger, 0.4)}`;
fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.resume(); fireBtnDown = true; });
window.addEventListener('pointerup', () => { fireBtnDown = false; });
uiRoot.appendChild(fireBtn);

// on-screen BRAKE button (touch / mouse) — desktop also uses B
const brakeBtn = document.createElement('button');
brakeBtn.textContent = 'B BRAKE';
brakeBtn.style.cssText = `position:absolute;left:22px;bottom:64px;width:80px;height:80px;border-radius:50%;
  border:2.5px solid ${hexA(THEME.tether, 0.8)};background:${hexA(THEME.panel, 0.55)};backdrop-filter:blur(8px);
  color:${THEME.tether};font:800 13px ${FONT_R};cursor:pointer;user-select:none;touch-action:none;
  box-shadow:0 0 22px ${hexA(THEME.tether, 0.4)}`;
brakeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.resume(); brakeBtnDown = true; });
window.addEventListener('pointerup', () => { brakeBtnDown = false; });
uiRoot.appendChild(brakeBtn);

function updateInput(dt: number): void {
  thrustClock += dt;
  const c = world.craft;
  if (state.phase !== 'play') { c.thrust = 0; audio.setThrust(false); return; }
  const kThrust = keys.has('ArrowUp') || keys.has('KeyW');
  if (keys.has('ArrowLeft') || keys.has('KeyA')) heading -= TURN * dt;
  if (keys.has('ArrowRight') || keys.has('KeyD')) heading += TURN * dt;

  // fire missiles — manual: Space / F / on-screen button (cooldown in combat).
  // Missiles leave the nose along the ship's facing, so aim by pointing.
  if (keys.has('Space') || keys.has('KeyF') || fireBtnDown) {
    combat.firePlayer(c, bus);
  }

  // braking (B) — fire the front retro-thrusters to bleed off speed
  braking = keys.has('KeyB') || keys.has('ArrowDown') || keys.has('KeyS') || brakeBtnDown;
  if (braking) c.vel = scale(c.vel, Math.max(0, 1 - 3.2 * dt));
  renderer.braking = braking;

  const wantThrust = pointerDown || kThrust;
  if (wantThrust && lastThrustStart < 0) {
    // afterburner: a quick re-press within 320ms kicks an impulse
    if (thrustClock - lastThrustEnd < 0.32 && (aggregateMods(state.owned).afterburner)) {
      const a = pointerDown ? sub(renderer.screenToWorld(pointerScreen.x, pointerScreen.y), c.pos) : v(Math.cos(heading), Math.sin(heading));
      const n = norm(a); c.vel = add(c.vel, scale(n, 260));
      renderer.particles.burst(c.pos, 14, 200, { speed: 260, life: 0.5 });
    }
    lastThrustStart = thrustClock;
  }
  if (!wantThrust && lastThrustStart >= 0) { lastThrustEnd = thrustClock; lastThrustStart = -1; }

  if (pointerDown) {
    const dir = sub(renderer.screenToWorld(pointerScreen.x, pointerScreen.y), c.pos);
    world.setThrust(dir, 1); heading = c.heading;
  } else if (kThrust) {
    world.setThrust(v(Math.cos(heading), Math.sin(heading)), 1);
  } else {
    c.thrust = 0; c.heading = heading;
  }
  audio.setThrust(c.thrust > 0.02);
}
let lastThrustEnd = -10;

// ── run flow ──
// a tiny clock for run seeds without Date in hot paths
let perfCounter = 1;
function nextSeed(): number { return (perfCounter = (perfCounter * 16807) % 2147483647); }

function openHangar(): void {
  state.phase = 'hangar';
  showHangar(uiRoot, save, beginRun, () => {
    save = resetSave();
    state.hullId = save.selectedHull; state.weaponId = save.selectedWeapon;
    applyMods();
    openHangar(); // rebuild the screen against the fresh save
  });
}

function beginRun(): void {
  runSeed = 'whorl-' + nextSeed();
  run = new Run(runSeed, save.pact);
  draftRng = new RNG(runSeed + '-draft');
  field = run.startField();
  // start with the carried-forward power-up, if any — you grow stronger over runs
  state.owned = save.carried ? [save.carried] : [];
  state.charge = 0; state.score = 0; state.mult = 1;
  state.hullId = save.selectedHull; state.weaponId = save.selectedWeapon;
  state.relit = 0; state.runRelit = 0; state.total = countDead(field); state.goal = field.goal;
  state.shield = state.maxShield; shieldClock = 0;
  state.phase = 'play';
  applyMods();
  state.plates = state.maxPlates;
  const wpn = weaponById(state.weaponId);
  combat.playerWeapon = { seeker: wpn.seeker, maxSpeed: wpn.maxSpeed, accel: wpn.accel };
  combat.playerHue = hullById(state.hullId).missileHue; // craft's missile colour
  renderer.hull = hullById(state.hullId);                // distinct silhouette + glow
  world.reset(field.bodies, field.spawn, v(0, 0), field.relics);
  combat.spawn(runSeed + '-0', Combat.countFor(0, save.pact), field.bounds, field.spawn, save.pact);
  powerups.reset(); world.boost = 1; combat.frozen = false;
  renderer.biome = biomeFor(0);
  heading = 0; dead = false;
  audio.setDepth(0); audio.setTrack(0); if (musicEnabled) audio.startMusic();
  renderer.flash(40, 0.4);
}

function endRun(won: boolean): void {
  if (state.phase === 'over') return;
  state.phase = 'over';
  // music keeps playing through the summary + menu (started on first interaction)
  const earned = Math.round((state.runRelit * 2 + (run.depth + 1) * 4 + (won ? 60 : 0)) * (1 + save.pact * 0.25));
  save.embers += earned;
  save.stats.runs++;
  save.stats.deepest = Math.max(save.stats.deepest, run.depth);
  save.stats.relit += state.runRelit;
  const rank = recordScore(save, state.score);
  if (save.carried == null && state.owned.length) save.carried = state.owned[0]; // sensible default
  writeSave(save);
  setTimeout(() => {
    showSummary(uiRoot, {
      depth: run.depth, relit: state.runRelit, embersEarned: earned, totalEmbers: save.embers,
      score: state.score, rank, highScores: save.highScores, owned: state.owned.slice(),
      won, hullId: state.hullId, save,
    }, openHangar);
  }, won ? 400 : 1100);
}

function openDraft(): void {
  state.phase = 'draft';
  const offer = draftOffer(draftRng, state.owned, 3, run.depth);
  showDraft(uiRoot, offer, {
    depth: run.depth,
    onPick: (r) => {
      if (r) { state.owned.push(r.id); applyMods(); audio.pick(); }
      warpDeeper();
    },
  });
}
function warpDeeper(): void {
  // endless: the dive never auto-ends — you go as deep as you can survive
  field = run.warpDeeper();
  state.relit = 0; state.total = countDead(field); state.goal = field.goal;
  world.reset(field.bodies, field.spawn, v(0, 0), field.relics);
  combat.spawn(runSeed + '-' + run.depth, Combat.countFor(run.depth, save.pact), field.bounds, field.spawn, run.depth + save.pact);
  renderer.biome = biomeFor(run.depth);
  audio.warp(); audio.setDepth(run.depth); audio.setTrack(run.depth);
  renderer.triggerWarp();
  renderer.flash(190, 0.7); renderer.shake(14);
  renderer.particles.burst(field.spawn, 70, 190, { speed: 460, life: 1.0, lum: 80 });
  renderer.floatText(field.spawn, biomeFor(run.depth).name.toUpperCase(), THEME.ink, 24);
  state.phase = 'play';
}

// ── event → feel wiring ──
let chargeFloatAcc = 0;
bus.on((e) => {
  switch (e.type) {
    case 'enterSoi': audio.enter(); break;
    case 'periapsis': {
      const gain = e.charge * chargeMul();
      state.charge += gain; chargeFloatAcc += gain;
      addScore(gain, false); // harvest adds flat score (no kill-multiplier)
      if (chargeFloatAcc > 12) { renderer.floatText(world.craft.pos, `+${Math.floor(chargeFloatAcc)}`, THEME.charge, 16); chargeFloatAcc = 0; }
      break;
    }
    case 'orbitTick':
      if (e.quality > 0.6 && Math.random() < 0.3) renderer.particles.spark(world.craft.pos, norm(world.craft.vel) as any, 48);
      break;
    case 'snap':
      loop.slowmo(0.55); audio.snap(e.quality);
      renderer.flash(48, 0.25); renderer.particles.burst(e.at, 12, 48, { speed: 180, life: 0.5 });
      renderer.floatText(e.at, 'ORBIT LOCK', THEME.charge, 20);
      break;
    case 'worldSeeded': {
      state.relit++; state.runRelit++;
      state.charge += 80 * chargeMul();
      state.plates = Math.min(state.maxPlates, state.plates + 1);
      const sg = addScore(250 * chargeMul());
      renderer.particles.burst(e.at, 60, 44, { speed: 320, life: 1.4, lum: 75 });
      renderer.flash(44, 0.5); renderer.shake(8);
      renderer.floatText(e.at, `RELIT!  +${sg}`, THEME.good, 24);
      audio.reignite();
      if (state.relit >= state.goal) {
        renderer.showBanner('★ WARP OPEN — DIVE TO THE CORE ★', THEME.good, 6);
        renderer.flash(150, 0.5);
      }
      break;
    }
    case 'plateChipped':
      losePlate('HULL!'); break;
    case 'crash': {
      const body = world.bodyById(e.bodyId);
      renderer.shake(24); renderer.flash(0, 0.8); audio.thud();
      renderer.particles.burst(e.at, 30, body?.kind === 'blackhole' ? 280 : 0, { speed: 320, life: 0.8 });
      if (body?.lethal) {
        // suns and black holes don't chip — they end you
        destroy(body.kind === 'blackhole' ? 'CONSUMED' : 'INCINERATED');
      } else {
        losePlate('CRASH', e.at);
        if (state.plates > 0) nudgeOut(e.bodyId);
      }
      break;
    }
    case 'pulse':
      renderer.shake(3);
      audio.tone(7, 0.4);
      renderer.particles.burst(e.at, 6, 195, { speed: 140, life: 0.5 });
      break;
    case 'missileFire':
      audio.missile();
      renderer.particles.burst(e.at, 4, e.owner === 'player' ? 180 : 350, { speed: 120, life: 0.3 });
      break;
    case 'missileExplode':
      audio.boom();
      renderer.particles.burst(e.at, 10, 20, { speed: 180, life: 0.5 });
      break;
    case 'enemyHit':
      renderer.particles.spark(e.at, v(0, 0), 350);
      break;
    case 'enemyDown': {
      audio.enemyDown();
      // kills pay score × the rising multiplier, and bump the multiplier — the
      // longer you stay killing waves, the harder your score snowballs.
      const sg = addScore(e.charge * killChargeMul());
      state.mult = Math.round((state.mult + 0.2) * 100) / 100;
      state.charge += e.charge * chargeMul() + powerups.bountyPerKill();
      renderer.shake(6); renderer.flash(350, 0.3);
      renderer.particles.burst(e.at, 28, 350, { speed: 280, life: 0.9, lum: 70 });
      renderer.floatText(e.at, `+${sg}  ×${state.mult.toFixed(1)}`, THEME.rarity.cosmic, 20);
      powerups.maybeDrop(e.at.x, e.at.y, bus); // chance to drop a powerup
      powerups.dropEmbers(e.at.x, e.at.y, 2 + Math.floor(e.charge / 60)); // magnetised embers to collect
      break;
    }
    case 'enemySpawn':
      renderer.floatText(world.craft.pos, e.count > 1 ? `⚠ ${e.count} INBOUND` : '⚠ INBOUND', THEME.danger, 16);
      break;
    case 'emberGet': {
      // banked straight into the persistent meta wallet — accrues across sessions
      save.embers += e.amount; emberFloatAcc += e.amount; saveDirty = true;
      audio.tone(12, 0.12);
      renderer.particles.spark(e.at, v(0, 0), 285);
      if (emberFloatAcc >= 4) {
        renderer.floatText(world.craft.pos, `+${emberFloatAcc} ✦`, 'hsl(287,90%,74%)', 14);
        emberFloatAcc = 0;
      }
      break;
    }
    case 'powerupDrop':
      renderer.particles.burst(e.at, 8, POWERUPS[e.ptype as PType].hue, { speed: 120, life: 0.5 });
      break;
    case 'powerupGet': {
      const def = POWERUPS[e.ptype as PType];
      audio.pick(); renderer.flash(def.hue, 0.35); renderer.shake(5);
      renderer.particles.burst(e.at, 24, def.hue, { speed: 220, life: 0.8, lum: 75 });
      renderer.floatText(world.craft.pos, def.name.toUpperCase() + '!', `hsl(${def.hue},90%,68%)`, 22);
      switch (e.ptype as PType) {
        case 'repair': {
          const heal = Math.max(1, Math.ceil(state.maxPlates * 0.33));
          state.plates = Math.min(state.maxPlates, state.plates + heal);
          audio.reignite();
          break;
        }
        case 'magnet': {
          // pull in every relic in the field + any other dropped orbs
          for (const r of world.relics) if (!r.grabbed) { r.grabbed = true; bus.post({ type: 'relicGrabbed', relicId: r.id, at: { ...r.pos } }); }
          powerups.collectAll(world.craft.pos, bus);
          break;
        }
        case 'nuke': {
          const kills = combat.nukeAround(world.craft.pos, NUKE_R, bus);
          renderer.triggerNuke(world.craft.pos, NUKE_R);
          renderer.flash(20, 0.9); renderer.shake(26); audio.boom();
          if (kills) renderer.floatText(world.craft.pos, `NUKE ×${kills}`, THEME.danger, 26);
          break;
        }
        case 'shield': audio.snap(1); break;
        case 'timestop': audio.snap(0.8); break;
        default: break; // speed / overdrive / bounty just run their timer
      }
      // first time you grab a type, pause & explain it once
      const pt = e.ptype as PType;
      if (!save.seenPowerups.includes(pt)) {
        save.seenPowerups.push(pt); saveDirty = true;
        showPowerupExplain(pt);
      }
      break;
    }
    case 'relicGrabbed': {
      // grant a power-up — risky placement, so weight toward the good stuff
      const offer = draftOffer(draftRng, state.owned, 1)[0];
      if (offer) {
        state.owned.push(offer.id); applyMods(); audio.reignite();
        renderer.flash(195, 0.5); renderer.shake(10);
        renderer.particles.burst(e.at, 50, 195, { speed: 300, life: 1.2, lum: 75 });
        renderer.floatText(e.at, `RELIC — ${offer.name}!`, THEME.rarity[offer.rarity], 24);
      }
      break;
    }
  }
});

function losePlate(label: string, at = world.craft.pos): void {
  // Invuln / Time Stop powerups soak everything
  if (powerups.invincible()) { renderer.hitShield(); renderer.flash(185, 0.25); return; }
  shieldClock = 0; // any damage interrupts shield regen
  // the shield soaks the hit first — no plate lost while it holds
  if (state.shield > 0) {
    state.shield--;
    renderer.hitShield();
    renderer.shake(6); renderer.flash(190, 0.35); audio.thud();
    renderer.floatText(at, 'SHIELD', THEME.tether, 18);
    return;
  }
  if (state.plates <= 0) return;
  state.plates = Math.max(0, state.plates - 1);
  renderer.shake(10); renderer.flash(0, 0.4); audio.thud();
  renderer.floatText(at, label, THEME.danger, 22);
  if (state.plates <= 0) destroy('SHATTERED');
}

// shield regenerates one cell every 1.5s, starting 3s after the last hit
let shieldRegenAcc = 0;
function tickShield(dt: number): void {
  shieldClock += dt;
  if (state.shield >= state.maxShield || shieldClock < 3) { shieldRegenAcc = 0; return; }
  shieldRegenAcc += dt * shieldRegenMul();
  if (shieldRegenAcc >= 1.5) {
    shieldRegenAcc = 0;
    state.shield = Math.min(state.maxShield, state.shield + 1);
    renderer.hitShield(); renderer.floatText(world.craft.pos, '+shield', THEME.tether, 14);
  }
}
function nudgeOut(bodyId: string): void {
  const b = world.bodyById(bodyId); if (!b) return;
  const out = norm(sub(world.craft.pos, b.pos));
  world.craft.pos = add(b.pos, scale(out, b.radius + 14));
  world.craft.vel = scale(out, 160);
}

let dead = false;
function destroy(msg: string): void {
  if (dead) return;
  dead = true; world.craft.alive = false;
  renderer.shake(28); renderer.flash(0, 1);
  renderer.particles.burst(world.craft.pos, 60, 20, { speed: 420, life: 1.4 });
  renderer.floatText(world.craft.pos, msg, THEME.danger, 26);
  audio.setThrust(false); audio.boomShip(state.hullId); // each hull explodes with its own voice
  endRun(false);
}

// soft arena walls so you can't drift forever into the void
function corral(): void {
  const c = world.craft; const L = field.bounds.max.x + 200;
  if (Math.abs(c.pos.x) > L) c.vel.x -= Math.sign(c.pos.x) * 30;
  if (Math.abs(c.pos.y) > L) c.vel.y -= Math.sign(c.pos.y) * 30;
}

// auto-open the draft when the goal is met and the craft nears the core
function checkWarp(): void {
  if (state.phase === 'play' && state.relit >= state.goal && dist(world.craft.pos, v(0, 0)) < 340) openDraft();
}

// powerup explainer — freezes the run the first time you collect each type
let pauseOverlay: HTMLDivElement | null = null;
function showPowerupExplain(pt: PType): void {
  if (state.phase !== 'play') return;
  const def = POWERUPS[pt];
  state.phase = 'paused';
  audio.setThrust(false);
  const col = `hsl(${def.hue},90%,66%)`;
  const o = document.createElement('div');
  o.style.cssText = `position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
    text-align:center;font-family:${FONT_R};color:${THEME.ink};animation:wfade .2s ease;
    background:rgba(6,8,16,0.72);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)`;
  o.innerHTML =
    `<div style="font-size:12px;letter-spacing:3px;color:${THEME.inkDim}">NEW POWERUP</div>` +
    `<div style="font-size:62px;color:${col};text-shadow:0 0 30px ${col};line-height:1">${def.glyph}</div>` +
    `<div style="font:800 30px ${FONT_R};color:${col}">${def.name}</div>` +
    `<div style="max-width:420px;font-size:15px;line-height:1.5;color:${THEME.ink}">${def.blurb}</div>` +
    `<div style="margin-top:10px;font-size:13px;color:${THEME.inkDim};animation:wpulse 1.1s infinite">press any key to continue</div>`;
  uiRoot.appendChild(o);
  pauseOverlay = o;
  const resume = (): void => {
    if (!pauseOverlay) return;
    pauseOverlay.remove(); pauseOverlay = null;
    if (state.phase === 'paused') state.phase = 'play';
    window.removeEventListener('keydown', resume);
    window.removeEventListener('pointerdown', resume);
  };
  window.addEventListener('keydown', resume);
  window.addEventListener('pointerdown', resume);
}

// ── the loop ──
const loop = new GameLoop(
  (dt) => {
    updateInput(dt);
    if (state.phase === 'play') {
      powerups.update(dt, world.craft.pos, world.craft.alive, bus);
      world.boost = powerups.speedMul();
      combat.frozen = powerups.frozen();
      refreshUpgrades();
      renderer.invuln = powerups.invincible();
      renderer.invulnBlink = powerups.shieldExpiring();
      renderer.frozen = powerups.frozen();
      world.step(dt); combat.update(dt, world.craft, world.bodies, (p) => world.gravityAt(p), bus); tickShield(dt); corral(); checkWarp();
    }
    bus.flush();
    // bank collected embers to localStorage at most ~once a second
    if (saveDirty) { saveFlushAcc += dt; if (saveFlushAcc > 1) { writeSave(save); saveDirty = false; saveFlushAcc = 0; } }
  },
  () => { renderer.update(world, 1 / 60); renderer.draw(world); renderHUD(); },
);
loop.start();
openHangar(); // start at the hangar; LAUNCH begins a run

(window as any).WHORL = {
  world, state, renderer, loop, bus, save, combat, powerups, audio, beginRun, endRun, openDraft, warpDeeper, checkWarp, applyMods,
  get run() { return run; }, get field() { return field; },
};
