// ============================================================================
// vueSynthese.js — Tableau des 24 priorités : avancement calculé, effectif,
// écart, statut, commentaire. Tri par colonne, filtres, export CSV.
// Chaque ligne peut se déplier pour afficher les objectifs de la PA.
// ============================================================================
import { avancementPriorite, avancementObjectif, fmtPct, classAvancement } from './calc.js';
import { escapeHtml } from './utils.js';
import * as M from './mutations.js';

let planTree = null;
let onDataChanged = null;
let tableSort = { field: 'numero', asc: true };
let filtres = { q: '', orient: '', statut: '' };
// Ids des priorités actuellement dépliées. Persiste tant que la vue reste
// montée (module-level), y compris après un rafraîchissement de données.
let expanded = new Set();

function notify(msg, kind = 'info') {
  const n = document.createElement('div');
  n.className = 'notice' + (kind !== 'info' ? ' ' + kind : '');
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => { n.style.transition = 'opacity 0.4s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 400); }, 3000);
}

async function muter(fn, successMsg) {
  try {
    await fn();
    if (successMsg) notify(successMsg, 'success');
    await onDataChanged();
  } catch (e) {
    console.error(e);
    notify('Erreur : ' + (e.message || String(e)), 'error');
  }
}

export function renderVueSynthese(tree, onChanged) {
  planTree = tree;
  onDataChanged = onChanged;
  const slot = document.getElementById('view-slot');

  slot.innerHTML = `
    <div class="overview-header">
      <h2>Synthèse chiffrée</h2>
      <div style="display:flex; gap:var(--space-2)">
        <button class="btn btn-mini btn-light" id="btn-toggle-all">${expanded.size > 0 ? 'Tout replier' : 'Tout déplier'}</button>
        <button class="btn btn-mini btn-light" id="btn-export-csv">Exporter CSV</button>
      </div>
    </div>

    <div class="table-container">
      <div class="table-controls">
        <input type="search" id="synth-search" placeholder="Rechercher..." value="${escapeHtml(filtres.q)}">
        <select id="synth-filter-orient">
          <option value="">Toutes orientations</option>
          ${planTree.orientations.map(o => `<option value="${o.id}" ${filtres.orient === o.id ? 'selected' : ''}>${o.id} · ${escapeHtml(o.intitule)}</option>`).join('')}
        </select>
        <select id="synth-filter-statut">
          <option value="">Tous statuts</option>
          <option value="nr" ${filtres.statut === 'nr' ? 'selected' : ''}>Non renseignés</option>
          <option value="cours" ${filtres.statut === 'cours' ? 'selected' : ''}>En cours</option>
          <option value="atteint" ${filtres.statut === 'atteint' ? 'selected' : ''}>Atteints (≥ 100%)</option>
        </select>
      </div>

      <table class="synth-table">
        <thead>
          <tr>
            <th class="synth-toggle-col"></th>
            <th data-sort="numero">#</th>
            <th data-sort="orient">Orientation</th>
            <th data-sort="axe">Axe</th>
            <th data-sort="titre">Priorité</th>
            <th data-sort="calc">Calculé</th>
            <th data-sort="effectif">Effectif</th>
            <th data-sort="ecart">Écart</th>
            <th>Statut</th>
            <th>Commentaire</th>
          </tr>
        </thead>
        <tbody id="synth-tbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById('btn-export-csv').addEventListener('click', exporterCsv);
  document.getElementById('btn-toggle-all').addEventListener('click', toggleAllExpand);
  document.getElementById('synth-search').addEventListener('input', (e) => { filtres.q = e.target.value; appliquerFiltre(); });
  document.getElementById('synth-filter-orient').addEventListener('change', (e) => { filtres.orient = e.target.value; appliquerFiltre(); });
  document.getElementById('synth-filter-statut').addEventListener('change', (e) => { filtres.statut = e.target.value; appliquerFiltre(); });
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (tableSort.field === field) tableSort.asc = !tableSort.asc;
      else { tableSort.field = field; tableSort.asc = true; }
      appliquerFiltre();
    });
  });

  appliquerFiltre();
}

function toggleAllExpand() {
  if (expanded.size > 0) {
    expanded.clear();
  } else {
    planTree.prioritesPlats.forEach(p => expanded.add(p.id));
  }
  const btn = document.getElementById('btn-toggle-all');
  if (btn) btn.textContent = expanded.size > 0 ? 'Tout replier' : 'Tout déplier';
  appliquerFiltre();
}

function construireLignes() {
  return planTree.prioritesPlats.map(pa => {
    const axe = planTree.axesPlats.find(a => a.id === pa.axe_id);
    const orient = axe ? axe._orientation : null;
    const av = avancementPriorite(pa);
    const calc = av.calc;
    const effectif = av.value;
    const ecart = (calc !== null && effectif !== null) ? (effectif - calc) : null;
    let statut = 'nr';
    if (effectif !== null) statut = effectif >= 100 ? 'atteint' : 'cours';
    return {
      pa,
      id: pa.id,
      numero: pa.numero,
      orient: orient ? orient.id : '',
      orientTitre: orient ? orient.intitule : '',
      axe: axe ? axe.intitule : '',
      titre: pa.intitule,
      calc, effectif, ecart, statut,
      override: av.override,
      commentaire: pa.commentaire_pilotage || '',
    };
  });
}

function appliquerFiltre() {
  const tbody = document.getElementById('synth-tbody');
  const q = filtres.q.toLowerCase();
  let rows = construireLignes();

  if (q) rows = rows.filter(r => r.titre.toLowerCase().includes(q) || r.orientTitre.toLowerCase().includes(q) || r.axe.toLowerCase().includes(q));
  if (filtres.orient) rows = rows.filter(r => r.orient === filtres.orient);
  if (filtres.statut) rows = rows.filter(r => r.statut === filtres.statut);

  const key = tableSort.field;
  rows.sort((a, b) => {
    let va = a[key], vb = b[key];
    if (va === null) va = tableSort.asc ? Infinity : -Infinity;
    if (vb === null) vb = tableSort.asc ? Infinity : -Infinity;
    if (typeof va === 'string') return tableSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
    return tableSort.asc ? va - vb : vb - va;
  });

  const statLabel = { atteint: 'Atteint', cours: 'En cours', nr: 'Non renseigné' };
  const statColor = { atteint: 'var(--av-vert)', cours: 'var(--av-orange)', nr: 'var(--av-nc)' };

  tbody.innerHTML = rows.map(r => {
    const isOpen = expanded.has(r.id);
    const objectifsRow = isOpen ? `
      <tr class="synth-subrow">
        <td colspan="10">
          <div class="synth-objectifs">
            ${r.pa.objectifs.length === 0 ? '<div class="contribs-empty">Aucun objectif défini pour cette priorité.</div>' : r.pa.objectifs.map(obj => {
              const oav = avancementObjectif(obj);
              return `
                <div class="synth-obj-row">
                  <span class="synth-obj-title">${escapeHtml(obj.intitule)}</span>
                  <span class="synth-obj-value ${classAvancement(oav.value)}">${fmtPct(oav.value)}${oav.override ? ' <span class="override-badge" title="Valeur manuelle">manuel</span>' : ''}</span>
                </div>
              `;
            }).join('')}
          </div>
        </td>
      </tr>
    ` : '';
    return `
      <tr class="synth-mainrow" data-pa-row="${r.id}">
        <td class="synth-toggle-col"><button class="synth-toggle-btn" data-toggle-pa="${r.id}" aria-label="Déplier">${isOpen ? '▾' : '▸'}</button></td>
        <td class="num">${r.numero}</td>
        <td>${escapeHtml(r.orient)}</td>
        <td>${escapeHtml(r.axe)}</td>
        <td>${escapeHtml(r.titre)}</td>
        <td class="num ${r.calc === null ? 'nc' : ''}">${fmtPct(r.calc)}</td>
        <td class="num ${r.effectif === null ? 'nc' : ''}">${fmtPct(r.effectif)}${r.override ? ' <span class="override-badge">m</span>' : ''}</td>
        <td class="num">${r.ecart === null ? '—' : (r.ecart > 0 ? '+' : '') + Math.round(r.ecart) + ' pt'}</td>
        <td><span class="statut-dot" style="background:${statColor[r.statut]}"></span>${statLabel[r.statut]}</td>
        <td><input type="text" class="synth-commentaire-input" data-pa-comment="${r.id}" value="${escapeHtml(r.commentaire)}" placeholder="Commentaire de pilotage…"></td>
      </tr>
      ${objectifsRow}
    `;
  }).join('');

  tbody.querySelectorAll('[data-toggle-pa]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.togglePa;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      const allBtn = document.getElementById('btn-toggle-all');
      if (allBtn) allBtn.textContent = expanded.size > 0 ? 'Tout replier' : 'Tout déplier';
      appliquerFiltre();
    });
  });
  tbody.querySelectorAll('[data-pa-comment]').forEach(input => {
    input.addEventListener('change', () => {
      muter(() => M.updatePriorite(input.dataset.paComment, { commentaire_pilotage: input.value }));
    });
  });
}

function exporterCsv() {
  const rows = construireLignes();
  const header = ['Numero', 'Orientation', 'Axe', 'Priorite', 'Avancement_calcule', 'Avancement_effectif', 'Ecart', 'Statut', 'Commentaire'];
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push([
      r.numero, r.orient, r.axe,
      '"' + r.titre.replace(/"/g, '""') + '"',
      r.calc === null ? '' : Math.round(r.calc),
      r.effectif === null ? '' : Math.round(r.effectif),
      r.ecart === null ? '' : Math.round(r.ecart),
      r.statut,
      '"' + (r.commentaire || '').replace(/"/g, '""') + '"',
    ].join(';'));
  }
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `heracles_synthese_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
