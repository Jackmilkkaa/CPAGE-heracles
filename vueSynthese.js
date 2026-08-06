// ============================================================================
// vueSynthese.js — Tableau des 24 priorités : avancement calculé, effectif,
// écart, statut, commentaire. Tri par colonne, filtres, export CSV.
// ============================================================================
import { avancementPriorite, fmtPct } from './calc.js';
import { escapeHtml } from './utils.js';

let planTree = null;
let tableSort = { field: 'numero', asc: true };
let filtres = { q: '', orient: '', statut: '' };

export function renderVueSynthese(tree) {
  planTree = tree;
  const slot = document.getElementById('view-slot');

  slot.innerHTML = `
    <div class="overview-header">
      <h2>Synthèse chiffrée</h2>
      <button class="btn btn-mini btn-light" id="btn-export-csv">Exporter CSV</button>
    </div>

    <div class="table-container">
      <div class="table-controls">
        <input type="search" id="synth-search" placeholder="Rechercher...">
        <select id="synth-filter-orient">
          <option value="">Toutes orientations</option>
          ${planTree.orientations.map(o => `<option value="${o.id}">${o.id} · ${escapeHtml(o.intitule)}</option>`).join('')}
        </select>
        <select id="synth-filter-statut">
          <option value="">Tous statuts</option>
          <option value="nr">Non renseignés</option>
          <option value="cours">En cours</option>
          <option value="atteint">Atteints (≥ 100%)</option>
        </select>
      </div>

      <table class="synth-table">
        <thead>
          <tr>
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

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="num">${r.numero}</td>
      <td>${escapeHtml(r.orient)}</td>
      <td>${escapeHtml(r.axe)}</td>
      <td>${escapeHtml(r.titre)}</td>
      <td class="num ${r.calc === null ? 'nc' : ''}">${fmtPct(r.calc)}</td>
      <td class="num ${r.effectif === null ? 'nc' : ''}">${fmtPct(r.effectif)}${r.override ? ' <span class="override-badge">m</span>' : ''}</td>
      <td class="num">${r.ecart === null ? '—' : (r.ecart > 0 ? '+' : '') + Math.round(r.ecart) + ' pt'}</td>
      <td><span class="statut-dot" style="background:${statColor[r.statut]}"></span>${statLabel[r.statut]}</td>
      <td>${escapeHtml((r.commentaire || '').substring(0, 100))}</td>
    </tr>
  `).join('');
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
