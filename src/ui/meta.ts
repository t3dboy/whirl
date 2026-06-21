// Meta screens — the Hangar (spend Embers, pick a hull, set Ascension, launch)
// and the Run Summary (what you reclaimed, Embers banked). Pure DOM overlays in
// the warm-sepia key. The "one more run" surface.

import { THEME } from '../render/theme';
import { HULLS, hullById } from '../content/hulls';
import { WEAPONS } from '../content/weapons';
import { resonanceById } from '../content/resonances';
import { type MetaSave, writeSave } from '../meta/save';

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

export function showHangar(root: HTMLElement, save: MetaSave, onStart: (save: MetaSave) => void): void {
  const o = overlay();

  const render = (): void => {
    o.innerHTML = '';
    const title = document.createElement('div');
    title.style.textAlign = 'center';
    // pixel-art logo if present, else a text wordmark fallback
    const logo = document.createElement('img');
    logo.src = 'logo.png';
    logo.alt = 'WHIRL';
    logo.style.cssText = `display:block;margin:0 auto 2px;image-rendering:pixelated;width:min(440px,72vw);height:auto;filter:drop-shadow(0 0 22px ${hexA(THEME.good, 0.45)})`;
    logo.onerror = () => {
      const t = document.createElement('div');
      t.style.cssText = `font-weight:800;font-size:42px;letter-spacing:3px;color:${THEME.good};text-shadow:0 0 24px ${hexA(THEME.good, 0.5)}`;
      t.textContent = 'WHIRL';
      logo.replaceWith(t);
    };
    title.appendChild(logo);
    const sub = document.createElement('div');
    sub.innerHTML =
      `<div style="color:${THEME.inkDim};font-size:14px;margin-top:2px">fall inward · relight the dark</div>` +
      `<div style="margin-top:14px;font-size:20px;color:${THEME.ember};font-weight:800">✦ ${save.embers} embers</div>`;
    title.appendChild(sub);
    o.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.textContent = 'CHOOSE YOUR HULL';
    subtitle.style.cssText = `color:${THEME.inkDim};font-size:13px;letter-spacing:2px`;
    o.appendChild(subtitle);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;justify-content:center;max-width:980px';
    o.appendChild(row);

    for (const h of HULLS) {
      const unlocked = save.unlockedHulls.includes(h.id);
      const selected = save.selectedHull === h.id;
      const afford = save.embers >= h.cost;
      const col = selected ? THEME.good : unlocked ? THEME.rarity.rare : THEME.inkDim;
      const card = document.createElement('button');
      card.style.cssText = `width:180px;min-height:180px;cursor:pointer;text-align:left;border-radius:16px;padding:16px;
        background:linear-gradient(160deg, ${THEME.panel}, ${THEME.bgDeep});border:2.5px solid ${col};color:${THEME.ink};
        display:flex;flex-direction:column;gap:8px;opacity:${unlocked || afford ? 1 : 0.55};
        box-shadow:${selected ? `0 0 28px ${hexA(THEME.good, 0.45)}` : '0 8px 24px rgba(0,0,0,.5)'};transition:transform .1s ease`;
      card.onmouseenter = () => { card.style.transform = 'translateY(-6px) scale(1.04)'; };
      card.onmouseleave = () => { card.style.transform = 'none'; };
      card.innerHTML =
        `<div style="font-size:19px;font-weight:800">${h.name}</div>` +
        `<div style="font-size:12px;color:${THEME.danger}">${'◆'.repeat(h.plates)}</div>` +
        `<div style="font-size:12.5px;color:${THEME.inkDim};line-height:1.4;flex:1">${h.blurb}</div>` +
        `<div style="font-size:12px;font-weight:800;color:${col}">${selected ? '✓ SELECTED' : unlocked ? 'SELECT' : afford ? `UNLOCK ✦${h.cost}` : `✦${h.cost}`}</div>`;
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
    wlabel.style.cssText = `color:${THEME.inkDim};font-size:13px;letter-spacing:2px;margin-top:4px`;
    o.appendChild(wlabel);
    const wrow = document.createElement('div');
    wrow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;max-width:560px';
    o.appendChild(wrow);
    for (const w of WEAPONS) {
      const unlocked = save.unlockedWeapons.includes(w.id);
      const selected = save.selectedWeapon === w.id;
      const afford = save.embers >= w.cost;
      const col = selected ? THEME.tether : unlocked ? THEME.rarity.rare : THEME.inkDim;
      const card = document.createElement('button');
      card.style.cssText = `width:230px;cursor:pointer;text-align:left;border-radius:12px;padding:11px 14px;
        background:linear-gradient(160deg, ${THEME.panel}, ${THEME.bgDeep});border:2px solid ${col};color:${THEME.ink};
        opacity:${unlocked || afford ? 1 : 0.55};box-shadow:${selected ? `0 0 20px ${hexA(THEME.tether, 0.4)}` : '0 6px 18px rgba(0,0,0,.45)'}`;
      card.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:16px;font-weight:800">${w.name}</span>` +
        `<span style="font-size:11px;font-weight:800;color:${col}">${selected ? '✓' : unlocked ? 'SELECT' : afford ? `✦${w.cost}` : `✦${w.cost}`}</span></div>` +
        `<div style="font-size:12px;color:${THEME.inkDim};line-height:1.35;margin-top:4px">${w.blurb}</div>`;
      card.onclick = () => {
        if (selected) return;
        if (unlocked) { save.selectedWeapon = w.id; }
        else if (afford) { save.embers -= w.cost; save.unlockedWeapons.push(w.id); save.selectedWeapon = w.id; }
        else return;
        writeSave(save); render();
      };
      wrow.appendChild(card);
    }

    // ascension control
    const asc = document.createElement('div');
    asc.style.cssText = 'display:flex;align-items:center;gap:14px;margin-top:6px';
    const mk = (label: string, fn: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `width:34px;height:34px;border-radius:10px;border:2px solid ${THEME.panelBorder};background:${THEME.panel};color:${THEME.ink};font:700 18px ${FONT};cursor:pointer`;
      b.onclick = fn; return b;
    };
    asc.appendChild(mk('−', () => { save.pact = Math.max(0, save.pact - 1); writeSave(save); render(); }));
    const ascLabel = document.createElement('div');
    ascLabel.style.cssText = `min-width:230px;text-align:center;color:${THEME.inkDim};font-size:13px`;
    ascLabel.innerHTML = `<b style="color:${THEME.ink}">ASCENSION ${save.pact}</b><br>deeper start · denser hazards · +${save.pact * 25}% embers`;
    asc.appendChild(ascLabel);
    asc.appendChild(mk('+', () => { save.pact = Math.min(6, save.pact + 1); writeSave(save); render(); }));
    o.appendChild(asc);

    const start = document.createElement('button');
    start.textContent = '▶  LAUNCH';
    start.style.cssText = `margin-top:8px;padding:14px 48px;border-radius:14px;border:none;cursor:pointer;
      background:linear-gradient(160deg, ${THEME.good}, ${THEME.ember});color:#1a0e02;font:800 22px ${FONT};letter-spacing:1px;
      box-shadow:0 0 30px ${hexA(THEME.good, 0.5)}`;
    start.onclick = () => { o.remove(); onStart(save); };
    o.appendChild(start);

    if (save.highScores.length) {
      const board = document.createElement('div');
      board.style.cssText = `${panelCss()};padding:10px 26px;margin-top:6px;display:flex;gap:26px;align-items:center`;
      board.innerHTML = `<span style="font-size:11px;letter-spacing:2px;color:${THEME.inkDim}">BEST</span>` +
        save.highScores.slice(0, 3).map((s, i) => `<span style="font:800 16px ${FONT};color:${i === 0 ? THEME.charge : THEME.ink}">${s.toLocaleString()}</span>`).join('');
      o.appendChild(board);
    }
    if (save.stats.runs > 0) {
      const stats = document.createElement('div');
      stats.style.cssText = `color:${THEME.inkDim};font-size:12px;margin-top:2px`;
      stats.textContent = `runs ${save.stats.runs} · deepest sector ${save.stats.deepest + 1} · worlds relit ${save.stats.relit}`;
      o.appendChild(stats);
    }
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
