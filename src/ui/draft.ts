// Draft overlay — the between-sector pick. Top: 1-of-3 Resonance cards (reshape
// how you fly). Below: 1 weapon choice for your run ARSENAL — unlock a new
// auto-weapon (up to 3) or level one up. Select one of each, then CONTINUE.

import type { Resonance } from '../core/types';
import type { WeaponOffer } from '../content/arsenal';
import { THEME } from '../render/theme';

export function showDraft(
  root: HTMLElement,
  offer: Resonance[],
  weapons: WeaponOffer[],
  opts: { depth: number; loadoutSize: number; maxLoadout: number; onConfirm: (r: Resonance | null, w: WeaponOffer | null) => void },
): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
    background:radial-gradient(circle at 50% 40%, ${hexA(THEME.bgDeep, 0.72)}, ${hexA(THEME.bgDeep, 0.95)});backdrop-filter:blur(3px);z-index:50;
    font-family:ui-rounded,"Avenir Next",system-ui,sans-serif;animation:wfade .25s ease;overflow:auto;padding:24px`;

  const title = document.createElement('div');
  title.style.textAlign = 'center';
  title.innerHTML = `<div style="font-weight:800;font-size:28px;color:${THEME.ink};letter-spacing:1px">WARP READY — SECTOR ${opts.depth + 2}</div>
    <div style="color:${THEME.inkDim};font-size:14px;margin-top:3px">draft a resonance · then add to your arsenal</div>`;
  overlay.appendChild(title);

  let selR: Resonance | null = null;
  let selW: WeaponOffer | null = null;
  const repaints: (() => void)[] = [];
  const allRepaint = (): void => repaints.forEach((f) => f());

  // ── resonance cards ──
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:18px;flex-wrap:wrap;justify-content:center;max-width:880px';
  overlay.appendChild(row);

  offer.forEach((r, i) => {
    const col = THEME.rarity[r.rarity];
    const tilt = (i - 1) * 2.5;
    const card = document.createElement('button');
    card.style.cssText = `width:208px;min-height:208px;cursor:pointer;text-align:left;
      background:linear-gradient(160deg, ${THEME.panel}, ${THEME.bgDeep});border:2.5px solid ${col};border-radius:18px;padding:16px;color:${THEME.ink};
      display:flex;flex-direction:column;gap:9px;transition:transform .12s ease, box-shadow .12s ease`;
    card.innerHTML =
      `<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${col};font-weight:800">${r.rarity} · ${r.family}</div>` +
      `<div style="font-size:20px;font-weight:800;line-height:1.1">${r.name}</div>` +
      `<div style="font-size:13px;color:${THEME.inkDim};line-height:1.4;flex:1">${r.blurb}</div>` +
      `<div class="pick" style="font-size:12px;color:${col};font-weight:800"></div>`;
    const repaint = (): void => {
      const on = selR === r;
      (card.querySelector('.pick') as HTMLElement).textContent = on ? '✓ SELECTED' : '▶ EQUIP';
      card.style.boxShadow = on ? `0 0 0 3px ${col}, 0 16px 40px rgba(0,0,0,.6), inset 0 0 30px ${hexA(col, 0.12)}` : `0 10px 30px rgba(0,0,0,.5), inset 0 0 30px ${hexA(col, 0.12)}`;
      card.style.transform = on ? 'rotate(0deg) translateY(-6px) scale(1.04)' : `rotate(${tilt}deg)`;
    };
    card.onmouseenter = () => { if (selR !== r) card.style.transform = 'rotate(0deg) translateY(-6px) scale(1.04)'; };
    card.onmouseleave = repaint;
    card.onclick = () => { selR = selR === r ? null : r; allRepaint(); };
    repaints.push(repaint);
    row.appendChild(card);
  });

  // ── weapon choice ──
  if (weapons.length) {
    const whead = document.createElement('div');
    const full = opts.loadoutSize >= opts.maxLoadout;
    whead.style.cssText = 'margin-top:4px;text-align:center';
    whead.innerHTML = `<span style="color:${THEME.ember};font-weight:800;letter-spacing:2px;font-size:13px">🔥 ARSENAL ${opts.loadoutSize}/${opts.maxLoadout}</span>` +
      `<span style="color:${THEME.inkDim};font-size:12px;margin-left:8px">${full ? 'arsenal full — level one up' : 'unlock a weapon or level one up'}</span>`;
    overlay.appendChild(whead);

    const wrow = document.createElement('div');
    wrow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;max-width:760px';
    overlay.appendChild(wrow);

    weapons.forEach((wo) => {
      const isUp = wo.type === 'upgrade';
      const col = isUp ? '#ff9a3c' : THEME.good;
      const card = document.createElement('button');
      card.style.cssText = `width:222px;cursor:pointer;text-align:left;border-radius:12px;padding:11px 13px;
        background:linear-gradient(160deg, ${THEME.panel}, ${THEME.bgDeep});border:2px solid ${col};color:${THEME.ink};
        display:flex;flex-direction:column;gap:4px;transition:transform .1s ease,box-shadow .1s ease`;
      card.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:center">` +
          `<span style="font-size:15px;font-weight:800">${wo.weapon.name}</span>` +
          `<span style="font-size:11px;font-weight:800;color:${col}">${isUp ? `→ Lv ${wo.toLevel}` : 'NEW'}</span></div>` +
        `<div style="font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:${col};opacity:.8">${wo.weapon.archetype}</div>` +
        `<div style="font-size:11.5px;color:${THEME.inkDim};line-height:1.3">${wo.weapon.blurb}</div>` +
        `<div class="wpick" style="font-size:11px;font-weight:800;color:${col};margin-top:2px"></div>`;
      const repaint = (): void => {
        const on = selW === wo;
        (card.querySelector('.wpick') as HTMLElement).textContent = on ? '✓ SELECTED' : (isUp ? '▲ LEVEL UP' : '＋ UNLOCK');
        card.style.boxShadow = on ? `0 0 0 3px ${col}, 0 12px 30px rgba(0,0,0,.55)` : '0 6px 18px rgba(0,0,0,.45)';
        card.style.transform = on ? 'translateY(-4px) scale(1.03)' : 'none';
      };
      card.onmouseenter = () => { if (selW !== wo) card.style.transform = 'translateY(-4px) scale(1.03)'; };
      card.onmouseleave = repaint;
      card.onclick = () => { selW = selW === wo ? null : wo; allRepaint(); };
      repaints.push(repaint);
      wrow.appendChild(card);
    });
  }

  const cont = document.createElement('button');
  cont.textContent = 'CONTINUE  →';
  cont.style.cssText = `margin-top:8px;padding:12px 42px;border-radius:14px;border:none;cursor:pointer;
    background:linear-gradient(160deg, ${THEME.good}, ${THEME.ember});color:#1a0e02;font:800 19px ui-rounded,system-ui,sans-serif;
    box-shadow:0 0 26px ${hexA(THEME.good, 0.45)}`;
  cont.onclick = () => { overlay.remove(); opts.onConfirm(selR, selW); };
  overlay.appendChild(cont);

  if (!document.getElementById('wf-anim')) {
    const st = document.createElement('style');
    st.id = 'wf-anim';
    st.textContent = '@keyframes wfade{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(st);
  }

  allRepaint();
  root.appendChild(overlay);
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
