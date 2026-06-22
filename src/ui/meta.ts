// Meta screens — the Hangar (spend Embers, pick a hull, set Ascension, launch)
// and the Run Summary (what you reclaimed, Embers banked). Pure DOM overlays in
// the warm-sepia key. The "one more run" surface.

import { THEME } from '../render/theme';
import { HULLS, hullById, type HullDef } from '../content/hulls';
import { WEAPONS, FLAME_MAX_LEVEL, FLAME_TITLES, flameStats, flameLevelCost } from '../content/weapons';
import { resonanceById } from '../content/resonances';
import { type MetaSave, writeSave } from '../meta/save';
import { drawShip } from '../render/ships';

/** A small canvas preview of a hull — its true in-game silhouette + colour. */
function shipPreview(hull: HullDef): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const W = 128, H = 52, dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = W * dpr; c.height = H * dpr;
  c.style.cssText = `width:${W}px;height:${H}px;display:block;margin:0 auto 2px`;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(dpr, dpr);
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 2); // nose points up on the card
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
  g.addColorStop(0, `hsla(${hull.missileHue},90%,62%,0.45)`);
  g.addColorStop(1, `hsla(${hull.missileHue},90%,55%,0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawShip(ctx, hull, 17);
  return c;
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const FONT = 'ui-rounded, "Avenir Next", system-ui, sans-serif';

function overlay(): HTMLDivElement {
  const o = document.createElement('div');
  o.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;
    background:radial-gradient(circle at 50% 35%, ${hexA(THEME.bg, 0.95)}, ${hexA(THEME.bgDeep, 0.995)});
    font-family:${FONT};color:${THEME.ink};animation:wfade .25s ease;overflow:auto;padding:28px`;
  return o;
}

// The Flame Halo weapon card — unlock it, EQUIP it, and LEVEL IT UP. Distinct
// from the simple missile cards because it carries an upgrade track.
function flameCard(save: MetaSave, rerender: () => void): HTMLElement {
  const lvl = save.flameLevel;
  const unlocked = lvl >= 1;
  const selected = save.selectedWeapon === 'flame';
  const fiery = '#ff7a1f';
  const col = selected ? fiery : unlocked ? THEME.ember : THEME.inkDim;
  const card = document.createElement('div');
  card.style.cssText = `width:230px;text-align:left;border-radius:12px;padding:9px 13px;
    background:linear-gradient(160deg, ${THEME.panel}, ${THEME.bgDeep});border:2px solid ${col};color:${THEME.ink};
    display:flex;flex-direction:column;gap:5px;box-shadow:${selected ? `0 0 22px ${hexA(fiery, 0.45)}` : '0 6px 18px rgba(0,0,0,.45)'}`;

  const fs = unlocked ? flameStats(lvl) : null;
  const badge = unlocked ? `Lv ${lvl} · ${FLAME_TITLES[lvl - 1]}` : `✦${flameLevelCost(1).toLocaleString()}`;
  const desc = fs
    ? `${fs.jets} jet${fs.jets > 1 ? 's' : ''} · reach ${fs.reach} · spin ${fs.spin.toFixed(1)} · ${fs.dmg.toFixed(1)} dmg/s`
    : 'A jet of fire that whirls around your hull, burning all it sweeps.';
  const head = document.createElement('div');
  head.innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:center">` +
      `<span style="font-size:15px;font-weight:800">🔥 Flame Halo</span>` +
      `<span style="font-size:11px;font-weight:800;color:${col}">${badge}</span></div>` +
    `<div style="font-size:11.5px;color:${THEME.inkDim};line-height:1.3;margin-top:3px">${desc}</div>`;
  card.appendChild(head);

  if (unlocked) {
    const pips = document.createElement('div');
    pips.style.cssText = 'display:flex;gap:3px;margin-top:1px';
    pips.innerHTML = Array.from({ length: FLAME_MAX_LEVEL }, (_, i) =>
      `<span style="flex:1;height:4px;border-radius:2px;background:${i < lvl ? fiery : hexA(THEME.inkDim, 0.3)}"></span>`).join('');
    card.appendChild(pips);
  }

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;margin-top:2px';
  const mkBtn = (label: string, enabled: boolean, on: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label; b.disabled = !enabled;
    b.style.cssText = `flex:1;cursor:${enabled ? 'pointer' : 'default'};border-radius:8px;padding:6px 4px;font:800 11px ${FONT};
      border:1.5px solid ${enabled ? col : hexA(THEME.inkDim, 0.4)};background:${hexA(THEME.panel, 0.6)};
      color:${enabled ? THEME.ink : THEME.inkDim};opacity:${enabled ? 1 : 0.6}`;
    if (enabled) b.onclick = on;
    return b;
  };

  if (unlocked) {
    actions.appendChild(mkBtn(selected ? '✓ EQUIPPED' : 'EQUIP', !selected, () => {
      save.selectedWeapon = 'flame'; writeSave(save); rerender();
    }));
  }
  if (lvl === 0) {
    const cost = flameLevelCost(1); const afford = save.embers >= cost;
    actions.appendChild(mkBtn(`UNLOCK ✦${cost.toLocaleString()}`, afford, () => {
      save.embers -= cost; save.flameLevel = 1;
      if (!save.unlockedWeapons.includes('flame')) save.unlockedWeapons.push('flame');
      save.selectedWeapon = 'flame'; writeSave(save); rerender();
    }));
  } else if (lvl < FLAME_MAX_LEVEL) {
    const cost = flameLevelCost(lvl + 1); const afford = save.embers >= cost;
    actions.appendChild(mkBtn(`LEVEL UP ✦${cost.toLocaleString()}`, afford, () => {
      save.embers -= cost; save.flameLevel += 1; writeSave(save); rerender();
    }));
  } else {
    actions.appendChild(mkBtn('★ MAX LEVEL', false, () => {}));
  }
  card.appendChild(actions);
  return card;
}

export function showHangar(
  root: HTMLElement,
  save: MetaSave,
  onStart: (save: MetaSave) => void,
  onReset: () => void,
): void {
  const o = overlay();
  o.style.gap = '12px';
  o.style.justifyContent = 'flex-start';
  o.style.paddingTop = '18px';

  const render = (): void => {
    o.innerHTML = '';

    // ── header: logo + tagline + the wallet (with a label of what it's for) ──
    const title = document.createElement('div');
    title.style.cssText = 'text-align:center;display:flex;flex-direction:column;align-items:center;gap:1px';
    const logo = document.createElement('img');
    logo.src = 'logo.png';
    logo.alt = 'WHIRL';
    logo.style.cssText = `display:block;margin:0 auto;image-rendering:pixelated;width:min(300px,54vw);height:auto;filter:drop-shadow(0 0 18px ${hexA(THEME.good, 0.45)})`;
    logo.onerror = () => {
      const t = document.createElement('div');
      t.style.cssText = `font-weight:800;font-size:38px;letter-spacing:3px;color:${THEME.good};text-shadow:0 0 24px ${hexA(THEME.good, 0.5)}`;
      t.textContent = 'WHIRL';
      logo.replaceWith(t);
    };
    title.appendChild(logo);
    const sub = document.createElement('div');
    sub.innerHTML =
      `<div style="color:${THEME.inkDim};font-size:13px">fall inward · relight the dark</div>` +
      `<div style="margin-top:8px;font-size:22px;color:${THEME.ember};font-weight:800">✦ ${save.embers.toLocaleString()}</div>` +
      `<div style="color:${THEME.inkDim};font-size:11px;letter-spacing:1px">EMBERS — earned from kills, spent below to unlock craft &amp; weapons</div>`;
    title.appendChild(sub);
    o.appendChild(title);

    // ── hull picker — each card shows the ship's real silhouette & colour ──
    const subtitle = document.createElement('div');
    subtitle.textContent = 'CHOOSE YOUR HULL';
    subtitle.style.cssText = `color:${THEME.inkDim};font-size:12px;letter-spacing:2px`;
    o.appendChild(subtitle);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:11px;flex-wrap:wrap;justify-content:center;max-width:880px';
    o.appendChild(row);

    for (const h of HULLS) {
      const unlocked = save.unlockedHulls.includes(h.id);
      const selected = save.selectedHull === h.id;
      const afford = save.embers >= h.cost;
      const col = selected ? THEME.good : unlocked ? THEME.rarity.rare : THEME.inkDim;
      const card = document.createElement('button');
      card.style.cssText = `width:150px;cursor:pointer;text-align:left;border-radius:14px;padding:11px;
        background:linear-gradient(160deg, ${THEME.panel}, ${THEME.bgDeep});border:2.5px solid ${col};color:${THEME.ink};
        display:flex;flex-direction:column;gap:5px;opacity:${unlocked || afford ? 1 : 0.55};
        box-shadow:${selected ? `0 0 24px ${hexA(THEME.good, 0.45)}` : '0 8px 22px rgba(0,0,0,.5)'};transition:transform .1s ease`;
      card.onmouseenter = () => { card.style.transform = 'translateY(-5px) scale(1.04)'; };
      card.onmouseleave = () => { card.style.transform = 'none'; };
      card.appendChild(shipPreview(h));
      const body = document.createElement('div');
      body.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:16px;font-weight:800">${h.name}</span>` +
        `<span style="font-size:11px;color:${THEME.danger}">${'◆'.repeat(h.plates)}</span></div>` +
        `<div style="font-size:11.5px;color:${THEME.inkDim};line-height:1.35;margin:3px 0">${h.blurb}</div>` +
        `<div style="font-size:12px;font-weight:800;color:${col}">${selected ? '✓ SELECTED' : unlocked ? 'SELECT' : afford ? `UNLOCK ✦${h.cost.toLocaleString()}` : `✦${h.cost.toLocaleString()}`}</div>`;
      card.appendChild(body);
      card.onclick = () => {
        if (selected) return;
        if (unlocked) { save.selectedHull = h.id; }
        else if (afford) { save.embers -= h.cost; save.unlockedHulls.push(h.id); save.selectedHull = h.id; }
        else return;
        writeSave(save); render();
      };
      row.appendChild(card);
    }

    // weapon selector
    const wlabel = document.createElement('div');
    wlabel.textContent = 'WEAPON';
    wlabel.style.cssText = `color:${THEME.inkDim};font-size:12px;letter-spacing:2px;margin-top:2px`;
    o.appendChild(wlabel);
    const wrow = document.createElement('div');
    wrow.style.cssText = 'display:flex;gap:11px;flex-wrap:wrap;justify-content:center;max-width:560px';
    o.appendChild(wrow);
    for (const w of WEAPONS) {
      if (w.kind === 'flame') { wrow.appendChild(flameCard(save, render)); continue; }
      const unlocked = save.unlockedWeapons.includes(w.id);
      const selected = save.selectedWeapon === w.id;
      const afford = save.embers >= w.cost;
      const col = selected ? THEME.tether : unlocked ? THEME.rarity.rare : THEME.inkDim;
      const card = document.createElement('button');
      card.style.cssText = `width:230px;cursor:pointer;text-align:left;border-radius:12px;padding:9px 13px;
        background:linear-gradient(160deg, ${THEME.panel}, ${THEME.bgDeep});border:2px solid ${col};color:${THEME.ink};
        opacity:${unlocked || afford ? 1 : 0.55};box-shadow:${selected ? `0 0 20px ${hexA(THEME.tether, 0.4)}` : '0 6px 18px rgba(0,0,0,.45)'}`;
      card.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:15px;font-weight:800">${w.name}</span>` +
        `<span style="font-size:11px;font-weight:800;color:${col}">${selected ? '✓' : unlocked ? 'SELECT' : `✦${w.cost.toLocaleString()}`}</span></div>` +
        `<div style="font-size:11.5px;color:${THEME.inkDim};line-height:1.3;margin-top:3px">${w.blurb}</div>`;
      card.onclick = () => {
        if (selected) return;
        if (unlocked) { save.selectedWeapon = w.id; }
        else if (afford) { save.embers -= w.cost; save.unlockedWeapons.push(w.id); save.selectedWeapon = w.id; }
        else return;
        writeSave(save); render();
      };
      wrow.appendChild(card);
    }

    const start = document.createElement('button');
    start.textContent = '▶  LAUNCH';
    start.style.cssText = `margin-top:4px;padding:12px 46px;border-radius:14px;border:none;cursor:pointer;
      background:linear-gradient(160deg, ${THEME.good}, ${THEME.ember});color:#1a0e02;font:800 21px ${FONT};letter-spacing:1px;
      box-shadow:0 0 28px ${hexA(THEME.good, 0.5)}`;
    start.onclick = () => { o.remove(); onStart(save); };
    o.appendChild(start);

    // ── stats footer: high score + run tallies, each clearly labelled ──
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:stretch';
    const statBox = (label: string, value: string, accent = THEME.ink): string =>
      `<div style="${panelCss()};padding:7px 18px;text-align:center;min-width:96px">` +
        `<div style="font:800 18px ${FONT};color:${accent}">${value}</div>` +
        `<div style="font-size:10px;letter-spacing:1.5px;color:${THEME.inkDim};margin-top:1px">${label}</div></div>`;
    const best = save.highScores[0] ?? 0;
    footer.innerHTML =
      statBox('HIGH SCORE', best.toLocaleString(), THEME.charge) +
      statBox('RUNS PLAYED', String(save.stats.runs)) +
      statBox('DEEPEST SECTOR', String(save.stats.deepest + 1)) +
      statBox('WORLDS RELIT', String(save.stats.relit));
    o.appendChild(footer);

    // ── reset progress (guarded by a confirm) ──
    const reset = document.createElement('button');
    reset.textContent = 'reset all progress';
    reset.style.cssText = `margin-top:2px;background:none;border:none;cursor:pointer;color:${hexA(THEME.danger, 0.7)};
      font:600 12px ${FONT};text-decoration:underline;letter-spacing:.5px`;
    let armed = false;
    reset.onclick = () => {
      if (!armed) { armed = true; reset.textContent = 'tap again to wipe everything — embers, unlocks, scores'; reset.style.color = THEME.danger; return; }
      onReset();
    };
    o.appendChild(reset);
  };

  render();
  ensureAnim();
  root.appendChild(o);
}

export function showSummary(root: HTMLElement, r: {
  depth: number; relit: number; embersEarned: number; totalEmbers: number;
  score: number; rank: number; highScores: number[]; owned: string[];
  won: boolean; hullId: string; save: MetaSave;
}, onContinue: () => void): void {
  const o = overlay();
  const newRecord = r.rank === 1 && r.score > 0;
  const top = document.createElement('div');
  top.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center';
  top.innerHTML =
    `<div style="font-weight:800;font-size:32px;letter-spacing:2px;color:${r.won ? THEME.good : THEME.danger}">${r.won ? 'THE CORE RELIT' : 'CRAFT LOST'}</div>` +
    `<div style="color:${THEME.inkDim};font-size:13px">${hullById(r.hullId).name} · reached sector ${r.depth + 1} · relit ${r.relit}</div>` +
    `<div style="margin-top:6px;font-size:13px;color:${THEME.inkDim};letter-spacing:2px">SCORE</div>` +
    `<div style="font-size:48px;font-weight:800;color:${THEME.charge};text-shadow:0 0 22px ${hexA(THEME.charge, 0.5)};line-height:1">${r.score.toLocaleString()}</div>` +
    (newRecord
      ? `<div style="color:${THEME.good};font-weight:800;font-size:15px;animation:wpulse 1s infinite">★ NEW HIGH SCORE ★</div>`
      : `<div style="color:${THEME.inkDim};font-size:13px">#${r.rank} of your best · +${r.embersEarned} ✦ embers</div>`);
  o.appendChild(top);

  // high score table
  if (r.highScores.length) {
    const board = document.createElement('div');
    board.style.cssText = `${panelCss()};padding:12px 22px;min-width:220px`;
    board.innerHTML = `<div style="font-size:11px;letter-spacing:2px;color:${THEME.inkDim};text-align:center;margin-bottom:6px">HIGH SCORES</div>` +
      r.highScores.slice(0, 5).map((s, i) => {
        const mine = s === r.score && (i + 1) === r.rank;
        return `<div style="display:flex;justify-content:space-between;gap:24px;font:700 14px ${FONT};color:${mine ? THEME.good : THEME.ink};padding:1px 0">` +
          `<span style="color:${THEME.inkDim}">${i + 1}.</span><span>${s.toLocaleString()}</span></div>`;
      }).join('');
    o.appendChild(board);
  }

  // carry one power-up forward — pick one to start the next run with
  if (r.owned.length) {
    if (!r.owned.includes(r.save.carried ?? '')) r.save.carried = r.owned[0];
    const carry = document.createElement('div');
    carry.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px';
    const head = document.createElement('div');
    head.style.cssText = `font-size:12px;letter-spacing:2px;color:${THEME.inkDim}`;
    head.textContent = 'CARRY ONE INTO YOUR NEXT RUN →';
    carry.appendChild(head);
    const rowc = document.createElement('div');
    rowc.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:640px';
    // description of the currently-chosen carry, updates as you pick
    const desc = document.createElement('div');
    desc.style.cssText = `min-height:34px;max-width:460px;text-align:center;font:600 13px ${FONT};color:${THEME.inkDim};line-height:1.4`;
    const paint: (() => void)[] = [];
    const showDesc = () => {
      const res = resonanceById(r.save.carried ?? '');
      desc.innerHTML = res ? `<b style="color:${THEME.rarity[res.rarity]}">${res.name}</b> — ${res.blurb}` : '';
    };
    for (const id of r.owned) {
      const res = resonanceById(id); if (!res) continue;
      const col = THEME.rarity[res.rarity];
      const chip = document.createElement('button');
      chip.style.cssText = `cursor:pointer;border-radius:9px;padding:5px 12px;font:700 13px ${FONT};color:${THEME.ink};
        background:${hexA(THEME.panel, 0.6)};border:2px solid ${col};transition:all .1s`;
      chip.textContent = res.name;
      const repaint = () => { const on = r.save.carried === id; chip.style.boxShadow = on ? `0 0 16px ${hexA(col, 0.8)}` : 'none'; chip.style.opacity = on ? '1' : '0.55'; };
      chip.onmouseenter = () => { const rr = resonanceById(id); desc.innerHTML = `<b style="color:${col}">${rr!.name}</b> — ${rr!.blurb}`; };
      chip.onmouseleave = showDesc;
      chip.onclick = () => { r.save.carried = id; writeSave(r.save); paint.forEach((f) => f()); showDesc(); };
      paint.push(repaint); repaint();
      rowc.appendChild(chip);
    }
    carry.appendChild(rowc);
    showDesc();
    carry.appendChild(desc);
    o.appendChild(carry);
  }

  const cont = document.createElement('button');
  cont.textContent = 'CONTINUE  →';
  cont.style.cssText = `margin-top:8px;padding:13px 40px;border-radius:14px;border:none;cursor:pointer;
    background:linear-gradient(160deg, ${THEME.good}, ${THEME.ember});color:#1a0e02;font:800 20px ${FONT}`;
  cont.onclick = () => { o.remove(); onContinue(); };
  o.appendChild(cont);

  ensureAnim();
  root.appendChild(o);
}

function panelCss(): string {
  return `background:${hexA(THEME.panel, 0.5)};border:1.5px solid ${hexA(THEME.panelBorder, 0.7)};border-radius:14px`;
}

function ensureAnim(): void {
  if (document.getElementById('wf-anim')) return;
  const st = document.createElement('style');
  st.id = 'wf-anim';
  st.textContent = '@keyframes wfade{from{opacity:0}to{opacity:1}}';
  document.head.appendChild(st);
}
