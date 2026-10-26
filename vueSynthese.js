// ============================================================================
// vueSynthese.js — Synthèse chiffrée des 24 priorités d'action.
// Tuiles de répartition (qui servent aussi de filtre), tableau regroupé par
// orientation, une seule colonne Avancement (barre + valeur + badge "manuel"),
// objectifs dépliables sous chaque priorité, commentaire de pilotage éditable.
// ============================================================================
import { avancementPriorite, avancementObjectif, avancementOrientation, fmtPct, classAvancement } from './calc.js';
import { escapeHtml } from './utils.js';
import * as M from './mutations.js';

let planTree = null;
let onDataChanged = null;
let onOpenPA = null;
let tableSort = { field: 'numero', asc: true };
let filtres = { q: '', orient: '', bin: '' };
// Priorités dont les objectifs sont dépliés, orientations repliées.
// Conservés tant que la vue reste chargée (y compris après un rafraîchissement de données).
const expanded = new Set();
const collapsedGroups = new Set();

const BINS = [
  { code: 'b1', label: 'Moins de 25 %', cls: 'av-rouge', test: v => v !== null && v < 25 },
  { code: 'b2', label: '25 à 50 %', cls: 'av-orange', test: v => v !== null && v >= 25 && v < 50 },
  { code: 'b3', label: '50 à 75 %', cls: 'av-jaunevert', test: v => v !== null && v >= 50 && v < 75 },
  { code: 'b4', label: '75 % et plus', cls: 'av-vert', test: v => v !== null && v >= 75 },
  { code: 'nr', label: 'Non renseignées', cls: 'av-nc', test: v => v === null },
];
const STATUT_PILL = { atteint: ['ok', 'Atteinte'], cours: ['info', 'En cours'], nr: ['off', 'Non renseignée'] };

const ICO_CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

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

export function renderVueSynthese(tree, onChanged, onOpen) {
  planTree = tree;
  onDataChanged = onChanged;
  onOpenPA = onOpen;
  const slot = document.getElementById('view-slot');

  slot.innerHTML = `
    <div class="overview-header">
      <div>
        <h2>Synthèse chiffrée</h2>
        <div class="subtitle">Avancement des priorités d'action, regroupé par orientation</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-mini btn-light" id="btn-toggle-all">${expanded.size > 0 ? 'Tout replier' : 'Tout déplier'}</button>
        <button class="btn btn-mini btn-light" id="btn-export-csv">Exporter CSV</button>
      </div>
    </div>

    <div class="kpi-strip" id="synth-kpis" style="--kpi-cols: 6"></div>

    <div class="filterbar">
      <input type="search" class="fb-input fb-search" id="synth-search" placeholder="Rechercher une priorité…" value="${escapeHtml(filtres.q)}">
      <select class="fb-select" id="synth-filter-orient" aria-label="Filtrer par orientation">
        <option value="">Toutes les orientations</option>
        ${planTree.orientations.map(o => `<option value="${o.id}" ${filtres.orient === o.id ? 'selected' : ''}>${o.id} · ${escapeHtml(o.intitule)}</option>`).join('')}
      </select>
    </div>
    <div class="filter-meta" id="synth-meta"></div>

    <div class="synth-card">
      <table class="synth-table">
        <thead>
          <tr>
            <th class="col-toggle"></th>
            <th class="col-num" data-sort="numero" aria-sort="none">#<span class="sort-ind"></span></th>
            <th data-sort="titre" aria-sort="none">Priorité d'action<span class="sort-ind"></span></th>
            <th class="col-av" data-sort="effectif" aria-sort="none">Avancement<span class="sort-ind"></span></th>
            <th class="col-statut" data-sort="statut" aria-sort="none">Statut<span class="sort-ind"></span></th>
            <th class="col-comment">Commentaire de pilotage</th>
          </tr>
        </thead>
        <tbody id="synth-tbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById('btn-export-csv').addEventListener('click', exporterCsv);
  document.getElementById('btn-toggle-all').addEventListener('click', toggleAllExpand);
  document.getElementById('synth-search').addEventListener('input', (e) => { filtres.q = e.target.value; rafraichir(); });
  document.getElementById('synth-filter-orient').addEventListener('change', (e) => { filtres.orient = e.target.value; rafraichir(); });
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (tableSort.field === field) tableSort.asc = !tableSort.asc;
      else { tableSort.field = field; tableSort.asc = true; }
      rafraichir();
    });
  });

  // Délégation d'événements sur le corps du tableau (il est réécrit à chaque filtre)
  const tbody = document.getElementById('synth-tbody');
  tbody.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle-pa], [data-open-pa], [data-toggle-group]');
    if (!t) return;
    if (t.dataset.togglePa) {
      const id = t.dataset.togglePa;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      majBoutonToutDeplier();
      rafraichir();
    } else if (t.dataset.openPa) {
      if (onOpenPA) onOpenPA(t.dataset.openPa);
    } else if (t.dataset.toggleGroup) {
      const id = t.dataset.toggleGroup;
      if (collapsedGroups.has(id)) collapsedGroups.delete(id); else collapsedGroups.add(id);
      rafraichir();
    }
  });
  tbody.addEventListener('change', (e) => {
    const input = e.target.closest('[data-pa-comment]');
    if (input) muter(() => M.updatePriorite(input.dataset.paComment, { commentaire_pilotage: input.value }));
  });

  rafraichir();
}

function majBoutonToutDeplier() {
  const btn = document.getElementById('btn-toggle-all');
  if (btn) btn.textContent = expanded.size > 0 ? 'Tout replier' : 'Tout déplier';
}

function toggleAllExpand() {
  if (expanded.size > 0) expanded.clear();
  else planTree.prioritesPlats.forEach(p => expanded.add(p.id));
  majBoutonToutDeplier();
  rafraichir();
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
      pa, id: pa.id, numero: pa.numero,
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

function filtrer(rows) {
  const q = filtres.q.trim().toLowerCase();
  if (q) rows = rows.filter(r => r.titre.toLowerCase().includes(q) || r.orientTitre.toLowerCase().includes(q) || r.axe.toLowerCase().includes(q) || String(r.numero) === q);
  if (filtres.orient) rows = rows.filter(r => r.orient === filtres.orient);
  if (filtres.bin) {
    const b = BINS.find(x => x.code === filtres.bin);
    if (b) rows = rows.filter(r => b.test(r.effectif));
  }
  return rows;
}

function trier(rows) {
  const key = tableSort.field;
  const dir = tableSort.asc ? 1 : -1;
  const rang = { atteint: 2, cours: 1, nr: 0 };
  return rows.slice().sort((a, b) => {
    let va, vb;
    if (key === 'statut') { va = rang[a.statut]; vb = rang[b.statut]; }
    else { va = a[key]; vb = b[key]; }
    // Les valeurs non renseignées sont toujours reléguées en fin de liste
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === 'string') return dir * va.localeCompare(vb, 'fr');
    return dir * (va - vb);
  });
}

function rafraichir() {
  renderKpis();
  renderMeta();
  renderBody();
  document.querySelectorAll('th[data-sort]').forEach(th => {
    const actif = th.dataset.sort === tableSort.field;
    th.setAttribute('aria-sort', actif ? (tableSort.asc ? 'ascending' : 'descending') : 'none');
    th.querySelector('.sort-ind').textContent = actif ? (tableSort.asc ? ' ▲' : ' ▼') : '';
  });
}

function renderKpis() {
  const all = construireLignes();
  const tuiles = [{ code: '', label: 'Toutes', cls: '', test: () => true }, ...BINS];
  document.getElementById('synth-kpis').innerHTML = tuiles.map(t => {
    const n = all.filter(r => t.test(r.effectif)).length;
    const actif = filtres.bin === t.code;
    return `<button class="kpi-tile ${actif ? 'active' : ''}" data-bin="${t.code}" aria-pressed="${actif}">
      <span class="kpi-label">${t.cls ? `<span class="kpi-dot ${t.cls}"></span>` : ''}${t.label}</span>
      <span class="kpi-value">${n}</span>
      <span class="kpi-sub">${n > 1 ? 'priorités' : 'priorité'}</span>
    </button>`;
  }).join('');
  document.querySelectorAll('#synth-kpis [data-bin]').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.bin;
      filtres.bin = (filtres.bin === code) ? '' : code;
      rafraichir();
    });
  });
}

function renderMeta() {
  const total = planTree.prioritesPlats.length;
  const n = filtrer(construireLignes()).length;
  const chips = [];
  if (filtres.orient) {
    const o = planTree.orientations.find(x => x.id === filtres.orient);
    chips.push(`<span class="filter-chip">${escapeHtml(filtres.orient)} · ${escapeHtml(o ? o.intitule : '')}<button data-clear="orient" aria-label="Retirer le filtre orientation">✕</button></span>`);
  }
  if (filtres.bin) {
    const b = BINS.find(x => x.code === filtres.bin);
    chips.push(`<span class="filter-chip">${escapeHtml(b.label)}<button data-clear="bin" aria-label="Retirer le filtre avancement">✕</button></span>`);
  }
  const actifs = chips.length > 0 || filtres.q;
  document.getElementById('synth-meta').innerHTML = `
    <div class="chips">${chips.join('')}${actifs ? '<button class="link-btn" data-clear="all">Réinitialiser</button>' : ''}</div>
    <div class="filter-count">${n} priorité${n > 1 ? 's' : ''} affichée${n > 1 ? 's' : ''} sur ${total}</div>
  `;
  document.querySelectorAll('#synth-meta [data-clear]').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.clear;
      if (k === 'all') { filtres = { q: '', orient: '', bin: '' }; document.getElementById('synth-search').value = ''; document.getElementById('synth-filter-orient').value = ''; }
      else { filtres[k] = ''; if (k === 'orient') document.getElementById('synth-filter-orient').value = ''; }
      rafraichir();
    });
  });
}

function barre(v, mini = false) {
  if (v === null || v === undefined) return `<span class="av-cell ${mini ? 'mini' : ''}"><span class="av-nr">non renseigné</span></span>`;
  const w = Math.max(0, Math.min(100, v));
  return `<span class="av-cell ${mini ? 'mini' : ''}"><span class="av-track"><span class="av-fill ${classAvancement(v)}" style="width:${w}%"></span></span><span class="av-val">${fmtPct(v)}</span></span>`;
}

function ligneHtml(r, plat) {
  const open = expanded.has(r.id);
  const [pc, pl] = STATUT_PILL[r.statut];
  const sousTitre = plat ? `${r.orient} · ${r.axe}` : r.axe;
  const manuel = r.override
    ? `<span class="manuel-badge" title="Valeur forcée manuellement. Calculé : ${fmtPct(r.calc)}${r.ecart !== null ? ' (écart ' + (r.ecart > 0 ? '+' : '') + Math.round(r.ecart) + ' pt)' : ''}">manuel</span>`
    : '';
  const objectifs = open
    ? (r.pa.objectifs.length === 0
        ? '<tr class="synth-objrow"><td></td><td></td><td colspan="4" class="obj-empty">Aucun objectif défini pour cette priorité.</td></tr>'
        : r.pa.objectifs.map((obj, i) => {
            const oav = avancementObjectif(obj);
            return `<tr class="synth-objrow">
              <td></td><td></td>
              <td class="col-titre"><span class="obj-code">O${i + 1}</span><span class="obj-title">${escapeHtml(obj.intitule)}</span></td>
              <td class="col-av">${barre(oav.value)}${oav.override ? '<span class="manuel-badge">manuel</span>' : ''}</td>
              <td></td><td></td>
            </tr>`;
          }).join(''))
    : '';
  return `
    <tr class="synth-row">
      <td class="col-toggle"><button class="synth-toggle-btn ${open ? 'open' : ''}" data-toggle-pa="${r.id}" aria-expanded="${open}" aria-label="${open ? 'Replier' : 'Déplier'} les objectifs">${ICO_CHEV}</button></td>
      <td class="col-num num">${r.numero}</td>
      <td class="col-titre">
        <button class="synth-title" data-open-pa="${r.id}" title="Ouvrir la fiche de la priorité">${escapeHtml(r.titre)}</button>
        <div class="synth-sub">${escapeHtml(sousTitre)}</div>
      </td>
      <td class="col-av">${barre(r.effectif)}${manuel}</td>
      <td class="col-statut"><span class="pill ${pc}">${pl}</span></td>
      <td class="col-comment"><input type="text" class="synth-commentaire-input" data-pa-comment="${r.id}" value="${escapeHtml(r.commentaire)}" placeholder="Commentaire de pilotage…" aria-label="Commentaire de pilotage de la priorité ${r.numero}"></td>
    </tr>
    ${objectifs}`;
}

function renderBody() {
  const tbody = document.getElementById('synth-tbody');
  let rows = filtrer(construireLignes());
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="synth-empty">Aucune priorité ne correspond à ces filtres.</td></tr>';
    return;
  }
  // Regroupement par orientation uniquement dans l'ordre naturel (par numéro croissant)
  const groupe = tableSort.field === 'numero' && tableSort.asc;
  if (!groupe) {
    tbody.innerHTML = trier(rows).map(r => ligneHtml(r, true)).join('');
    return;
  }
  rows = trier(rows);
  let html = '';
  for (const o of planTree.orientations) {
    const lignes = rows.filter(r => r.orient === o.id);
    if (lignes.length === 0) continue;
    const replie = collapsedGroups.has(o.id);
    const av = avancementOrientation(o);
    html += `
      <tr class="synth-group">
        <td colspan="3">
          <button class="grp-toggle ${replie ? 'collapsed' : ''}" data-toggle-group="${o.id}" aria-expanded="${!replie}">
            ${ICO_CHEV}
            <span class="grp-code">${escapeHtml(o.id)}</span>
            <span class="grp-title">${escapeHtml(o.intitule)}</span>
            <span class="grp-count">${lignes.length} PA</span>
          </button>
        </td>
        <td class="col-av">${barre(av.value)}</td>
        <td colspan="2"></td>
      </tr>`;
    if (!replie) html += lignes.map(r => ligneHtml(r, false)).join('');
  }
  tbody.innerHTML = html;
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
