// Draft overlay — the Hades/Balatro 1-of-3 power-up pick shown between fields.
// Chunky tilted cards, rarity-colored borders, big type. Returns the chosen
// Resonance (or null if skipped). Pure DOM; mounts into #ui-root.

import type { Resonance } from '../core/types';
import { THEME } from '../render/theme';

export function showDraft(root: HTMLElement, offer: Resonance[], opts: { depth: number; onPick: (r: Resonance | null) => void }): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;
    background:radial-gradient(circle at 50% 40%, ${hexA(THEME.bgDeep, 0.7)}, ${hexA(THEME.bgDeep, 0.94)});backdrop-filter:blur(3px);z-index:50;
    font-family:ui-rounded,"Avenir Next",system-ui,sans-serif;animation:wfade .25s ease`;

  const title = document.createElement('div');
  title.innerHTML = `<div style="font-weight:800;font-size:30px;color:${THEME.ink};letter-spacing:1px">WARP READY — SECTOR ${opts.depth + 2}</div>
    <div style="text-align:center;color:${THEME.inkDim};font-size:15px;margin-top:4px">draft a resonance · it reshapes how you fly</div>`;
  title.style.textAlign = 'center';
  overlay.appendChild(title);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:20px;flex-wrap:wrap;justify-content:center;max-width:900px';
  overlay.appendChild(row);

  offer.forEach((r, i) => {
    const col = THEME.rarity[r.rarity];
    const card = document.createElement('button');
    const tilt = (i - 1) * 2.5;
    card.style.cssText = `width:220px;min-height:230px;cursor:pointer;text-align:left;
      background:linear-gradient(160deg, ${THEME.panel}, ${THEME.bgDeep});
      border:2.5px solid ${col};border-radius:18px;padding:18px;color:${THEME.ink};
      display:flex;flex-direction:column;gap:10px;transform:rotate(${tilt}deg);
      box-shadow:0 10px 30px rgba(0,0,0,.5), inset 0 0 30px ${hexA(col, 0.12)};transition:transform .12s ease, box-shadow .12s ease`;
    card.onmouseenter = () => { card.style.transform = `rotate(0deg) translateY(-8px) scale(1.05)`; card.style.boxShadow = `0 18px 44px rgba(0,0,0,.6), inset 0 0 40px ${hexA(col, 0.2)}`; };
    card.onmouseleave = () => { card.style.transform = `rotate(${tilt}deg)`; card.style.boxShadow = `0 10px 30px rgba(0,0,0,.5), inset 0 0 30px ${hexA(col, 0.12)}`; };
    card.innerHTML =
      `<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${col};font-weight:800">${r.rarity} · ${r.family}</div>` +
      `<div style="font-size:21px;font-weight:800;line-height:1.1">${r.name}</div>` +
      `<div style="font-size:14px;color:${THEME.inkDim};line-height:1.45;flex:1">${r.blurb}</div>` +
      `<div style="font-size:12px;color:${col};font-weight:700">▶ EQUIP</div>`;
    card.onclick = () => { close(); opts.onPick(r); };
    row.appendChild(card);
  });

  const skip = document.createElement('button');
  skip.textContent = 'skip →';
  skip.style.cssText = `background:none;border:none;color:${THEME.inkDim};font:inherit;font-size:14px;cursor:pointer;opacity:.7`;
  skip.onclick = () => { close(); opts.onPick(null); };
  overlay.appendChild(skip);

  if (!document.getElementById('wf-anim')) {
    const st = document.createElement('style');
    st.id = 'wf-anim';
    st.textContent = '@keyframes wfade{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(st);
  }

  function close(): void { overlay.remove(); }
  root.appendChild(overlay);
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
