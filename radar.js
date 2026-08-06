// ============================================================================
// radar.js — Rendu radar SVG et jauges en barres, porté depuis le prototype
// local (heracles_pilotage.html v12) où ce code a été testé et affiné sur
// plusieurs itérations (taille, labels multi-lignes, collisions).
// ============================================================================
import { fmtPct, classAvancement } from './calc.js';
import { escapeHtml } from './utils.js';

let tooltipEl = null;
export function showTooltip(e, text) {
  hideTooltip();
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'tooltip';
  tooltipEl.textContent = text;
  document.body.appendChild(tooltipEl);
  const rect = e.target.getBoundingClientRect();
  tooltipEl.style.left = (rect.left + window.scrollX + 10) + 'px';
  tooltipEl.style.top = (rect.top + window.scrollY - 30) + 'px';
}
export function hideTooltip() {
  if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
}

function wrapLabel(text, maxCharsPerLine, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length <= maxCharsPerLine) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const rest = words.slice(lines.join(' ').split(' ').length).join(' ');
    if (rest) {
      const last = lines[lines.length - 1];
      const room = maxCharsPerLine - 1;
      lines[lines.length - 1] = (last.length > room ? last.substring(0, room) : last) + '…';
    }
  }
  return lines;
}

// items : [{ label, code, title, value, override, onClick, fullLabel? }]
export function renderRadar(slotId, items, title, quadrantLabels) {
  const slot = document.getElementById(slotId);
  const n = items.length;
  const hasFullLabels = items.some(it => it.fullLabel);
  const size = hasFullLabels ? 1000 : 600;
  const cx = size / 2, cy = size / 2;
  const R = hasFullLabels ? (size * 0.46) : (size / 2 - 90);

  const rings = [25, 50, 75, 100];
  const svg = [];
  svg.push(`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">`);

  for (const r of rings) {
    const rr = R * r / 100;
    svg.push(`<circle class="radar-grid" cx="${cx}" cy="${cy}" r="${rr}" />`);
  }
  if (!hasFullLabels) {
    for (const r of rings) {
      const rr = R * r / 100;
      svg.push(`<text class="radar-tick-label" x="${cx + 4}" y="${cy - rr - 2}">${r}%</text>`);
    }
  }

  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i / n) - Math.PI / 2;
    const x = cx + Math.cos(ang) * R;
    const y = cy + Math.sin(ang) * R;
    svg.push(`<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" />`);
  }

  const points = [];
  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i / n) - Math.PI / 2;
    const v = items[i].value === null || items[i].value === undefined ? 0 : items[i].value;
    const rr = R * v / 100;
    points.push(`${cx + Math.cos(ang) * rr},${cy + Math.sin(ang) * rr}`);
  }
  svg.push(`<polygon class="radar-data" points="${points.join(' ')}" />`);

  for (let i = 0; i < n; i++) {
    const ang = (Math.PI * 2 * i / n) - Math.PI / 2;
    const v = items[i].value === null || items[i].value === undefined ? 0 : items[i].value;
    const rr = R * v / 100;
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr;
    svg.push(`<circle class="radar-point" cx="${x}" cy="${y}" r="${n <= 8 ? 5 : 3.5}" />`);

    const lblR = R + (hasFullLabels ? 14 : (n <= 8 ? 40 : 25));
    const lx = cx + Math.cos(ang) * lblR;
    const ly = cy + Math.sin(ang) * lblR;
    let anchor = 'middle';
    const cosA = Math.cos(ang);
    if (cosA > 0.2) anchor = 'start';
    else if (cosA < -0.2) anchor = 'end';
    const cls = n <= 8 ? 'radar-label-major' : 'radar-label';
    const clickCursor = items[i].onClick ? ' style="cursor:pointer"' : '';

    if (items[i].fullLabel) {
      const shortLabel = items[i].label;
      const fullText = items[i].fullLabel;
      const maxCharsPerLine = n <= 3 ? 28 : (n <= 4 ? 22 : (n <= 5 ? 18 : 15));
      const maxLines = n <= 4 ? 5 : 4;
      const lines = wrapLabel(fullText, maxCharsPerLine, maxLines);
      const valueText = items[i].value === null || items[i].value === undefined ? 'nr' : fmtPct(items[i].value);
      const lineH = 30;
      const nLines = lines.length + 2;
      const totalH = nLines * lineH;
      const startY = ly - (totalH / 2) + lineH;

      let inner = `<tspan x="${lx}" y="${startY}" class="radar-label-prefix">${escapeHtml(shortLabel)}</tspan>`;
      lines.forEach(ln => { inner += `<tspan x="${lx}" dy="${lineH}">${escapeHtml(ln)}</tspan>`; });
      inner += `<tspan x="${lx}" dy="${lineH}" class="radar-label-value">${valueText}</tspan>`;

      svg.push(`<text class="radar-label-full" text-anchor="${anchor}"${clickCursor} data-idx="${i}">${inner}</text>`);
    } else {
      svg.push(`<text class="${cls}" x="${lx}" y="${ly + 4}" text-anchor="${anchor}"${clickCursor} data-idx="${i}">${escapeHtml(items[i].label)}</text>`);
    }
  }

  if (quadrantLabels && quadrantLabels.length) {
    for (const ql of quadrantLabels) {
      const ang = (Math.PI * 2 * ql.atIndex / n) - Math.PI / 2;
      const rr = R * 0.55;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      svg.push(`<text class="radar-quadrant-label" x="${x}" y="${y}" text-anchor="middle">${escapeHtml(ql.label)}</text>`);
    }
  }

  svg.push(`</svg>`);
  slot.innerHTML = svg.join('');

  slot.querySelectorAll('text[data-idx]').forEach(el => {
    const idx = parseInt(el.dataset.idx);
    if (items[idx].onClick) el.addEventListener('click', items[idx].onClick);
    if (items[idx].title && !items[idx].fullLabel) {
      el.addEventListener('mouseenter', e => showTooltip(e, items[idx].title + (items[idx].value !== null ? ' — ' + fmtPct(items[idx].value) : ' — non renseigné')));
      el.addEventListener('mouseleave', hideTooltip);
    }
  });
}

// items : mêmes objets que renderRadar
export function renderGauges(slotId, items) {
  const slot = document.getElementById(slotId);
  const html = items.map((it, i) => {
    const v = it.value;
    const pct = v === null || v === undefined ? 0 : v;
    let cls = classAvancement(v);
    if (it.override) cls = 'av-override';
    const valDisplay = v === null || v === undefined ? '<span class="g-value nc">nr</span>' : `<span class="g-value">${fmtPct(v)}</span>`;
    const clickable = it.onClick ? 'clickable' : '';
    return `
      <div class="gauge-row ${clickable}" data-idx="${i}">
        <div class="g-code">${escapeHtml(it.label)}</div>
        <div>
          <div class="g-label" title="${escapeHtml(it.title || '')}">${escapeHtml(it.title || '')}</div>
          <div class="gauge-bar"><div class="gauge-fill ${cls}" style="width:${pct}%"></div></div>
        </div>
        ${valDisplay}${it.override ? '<span class="override-badge" title="Valeur manuelle">manuel</span>' : ''}
      </div>
    `;
  }).join('');
  slot.innerHTML = html;
  slot.querySelectorAll('.gauge-row.clickable').forEach(el => {
    const idx = parseInt(el.dataset.idx);
    if (items[idx].onClick) el.addEventListener('click', items[idx].onClick);
  });
}
