// ============================================================================
// vueProjets.js — Liste de tous les projets (natifs + hors plan), filtres,
// modal complet d'édition (métadonnées, impacts sur les 24 PA, boussole).
// ============================================================================
import { escapeHtml } from './utils.js';
import { supabase } from './client.js';
import * as M from './mutations.js';

let planTree = null;
let onDataChanged = null;
let filtres = { q: '', pole: '', statut: '', origine: '', pa: '', boussole: '' };
let openImpactPas = new Set();

const POLES = ['GAP', 'GEF', 'GRH', 'TEC', 'TRANSVERSES', 'DIRECTION'];
const STATUTS = [
  { code: 'non_demarre', label: 'Non démarré' },
  { code: 'en_cours', label: 'En cours' },
  { code: 'realise', label: 'Réalisé' },
  { code: 'clos_partiel', label: 'Clos partiel' },
  { code: 'abandonne', label: 'Abandonné' },
];
function labelStatut(code) { return (STATUTS.find(s => s.code === code) || {}).label || code; }

function getBoussoleYears() {
  const periode = (planTree.planMeta && planTree.planMeta.periode) || '2025-2030';
  const m = periode.match(/(\d{4})\s*-\s*(\d{4})/);
  if (!m) return [new Date().getFullYear()];
  const out = [];
  for (let y = parseInt(m[1]); y <= parseInt(m[2]); y++) out.push(y);
  return out;
}

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

export function renderVueProjets(tree, onChanged) {
  planTree = tree;
  onDataChanged = onChanged;

  const slot = document.getElementById('view-slot');
  const boussoleYears = getBoussoleYears();

  slot.innerHTML = `
    <div class="overview-header">
      <div><h2>Projets et actions clés</h2><div class="subtitle">Suivi transverse, mapping d'impact sur les objectifs</div></div>
      <button class="btn btn-primary btn-mini projet-add-btn" id="btn-add-projet">+ Ajouter un projet hors plan</button>
    </div>

    <div class="projets-toolbar">
      <input type="search" id="f-q" placeholder="Rechercher..." value="${escapeHtml(filtres.q)}">
      <select id="f-pole"><option value="">Tous pôles</option>${POLES.map(p => `<option value="${p}" ${filtres.pole === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <select id="f-statut"><option value="">Tous statuts</option>${STATUTS.map(s => `<option value="${s.code}" ${filtres.statut === s.code ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      <select id="f-origine">
        <option value="">Toutes origines</option>
        <option value="plan_v1" ${filtres.origine === 'plan_v1' ? 'selected' : ''}>Plan v1</option>
        <option value="hors_plan" ${filtres.origine === 'hors_plan' ? 'selected' : ''}>Hors plan</option>
      </select>
      <select id="f-pa"><option value="">Toutes PA</option>${planTree.prioritesPlats.map(p => `<option value="${p.id}" ${filtres.pa === p.id ? 'selected' : ''}>#${p.numero} ${escapeHtml(p.intitule.substring(0, 50))}</option>`).join('')}</select>
      <select id="f-boussole"><option value="">Toutes (boussole ou non)</option>${boussoleYears.map(y => `<option value="${y}" ${String(filtres.boussole) === String(y) ? 'selected' : ''}>🧭 Boussole ${y}</option>`).join('')}</select>
      <div class="projets-count" id="projets-count"></div>
    </div>

    <div id="projets-grid-slot"></div>
  `;

  document.getElementById('btn-add-projet').addEventListener('click', ajouterProjet);
  document.getElementById('f-q').addEventListener('input', (e) => { filtres.q = e.target.value; renderGrid(); });
  document.getElementById('f-pole').addEventListener('change', (e) => { filtres.pole = e.target.value; renderGrid(); });
  document.getElementById('f-statut').addEventListener('change', (e) => { filtres.statut = e.target.value; renderGrid(); });
  document.getElementById('f-origine').addEventListener('change', (e) => { filtres.origine = e.target.value; renderGrid(); });
  document.getElementById('f-pa').addEventListener('change', (e) => { filtres.pa = e.target.value; renderGrid(); });
  document.getElementById('f-boussole').addEventListener('change', (e) => { filtres.boussole = e.target.value; renderGrid(); });

  renderGrid();
}

function renderGrid() {
  const slot = document.getElementById('projets-grid-slot');
  let projets = planTree.projetsPlats.slice();

  if (filtres.q) {
    const q = filtres.q.toLowerCase();
    projets = projets.filter(p => (p.intitule || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  }
  if (filtres.pole) projets = projets.filter(p => p.pole_responsable === filtres.pole);
  if (filtres.statut) projets = projets.filter(p => (p.statut || 'non_demarre') === filtres.statut);
  if (filtres.origine) projets = projets.filter(p => p.origine === filtres.origine);
  if (filtres.pa) {
    const pa = planTree.prioritesPlats.find(p => p.id === filtres.pa);
    projets = projets.filter(p => pa && (p.pa_origine === filtres.pa || pa.objectifs.some(o => (o.impacts || []).some(im => im.projet.id === p.id && im.poids > 0))));
  }
  if (filtres.boussole) {
    const year = parseInt(filtres.boussole);
    projets = projets.filter(p => (p.boussole_annees || []).includes(year));
  }

  document.getElementById('projets-count').textContent = `${projets.length} projet${projets.length > 1 ? 's' : ''} affiché${projets.length > 1 ? 's' : ''}`;

  if (projets.length === 0) {
    slot.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--gris-moyen)">Aucun projet ne correspond à ce filtre.</div>';
    return;
  }

  slot.innerHTML = '<div class="projets-grid">' + projets.map(renderTile).join('') + '</div>';

  slot.querySelectorAll('.projet-tile').forEach(tile => {
    tile.addEventListener('click', () => ouvrirModal(tile.dataset.id));
  });
}

function renderTile(prj) {
  const st = prj.statut || 'non_demarre';
  const av = prj.avancement_pct || 0;
  const paOrig = prj.pa_origine ? planTree.prioritesPlats.find(p => p.id === prj.pa_origine) : null;
  const boussole = (prj.boussole_annees || []).length > 0 ? `<span class="boussole-badge" title="Boussole ${prj.boussole_annees.join(', ')}">🧭 ${prj.boussole_annees.join(', ')}</span>` : '';
  const cls = av < 25 ? 'av-rouge' : av < 50 ? 'av-orange' : av < 75 ? 'av-jaunevert' : 'av-vert';
  return `
    <div class="projet-tile ${prj.origine === 'hors_plan' ? 'hors-plan' : ''}" data-id="${prj.id}">
      <div class="prj-id">${escapeHtml(prj.id)}${prj.origine === 'hors_plan' ? ' · hors plan' : ''}</div>
      <div class="prj-title">${escapeHtml(prj.intitule || '(sans titre)')}${boussole}</div>
      <div class="prj-meta">
        ${prj.pole_responsable ? `<span class="prj-badge pole">${escapeHtml(prj.pole_responsable)}</span>` : ''}
        ${paOrig ? `<span class="prj-badge pa">#${paOrig.numero}</span>` : ''}
      </div>
      <div class="prj-statut"><span class="statut-pill ${st}">${labelStatut(st)}</span><span style="font-family:monospace; font-weight:700; margin-left:auto">${av}%</span></div>
      <div class="prj-bar"><div class="prj-bar-fill" style="width:${av}%; background:var(--${cls})"></div></div>
    </div>
  `;
}

async function ajouterProjet() {
  const intitule = prompt('Intitulé du nouveau projet hors plan :');
  if (!intitule) return;
  await muter(() => M.creerProjetHorsPlan(intitule, []), 'Projet créé. Ouvre-le pour définir ses impacts.');
}

// ----------------------------------------------------------------------------
// Modal d'édition complète
// ----------------------------------------------------------------------------
function ouvrirModal(projetId) {
  const prj = planTree.projetsPlats.find(p => p.id === projetId);
  if (!prj) return;
  const paOrig = prj.pa_origine ? planTree.prioritesPlats.find(p => p.id === prj.pa_origine) : null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'projet-modal';
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

  backdrop.innerHTML = `
    <div class="modal-panel">
      <div class="modal-header">
        <div>
          <h3>${escapeHtml(prj.intitule || 'Projet')}</h3>
          <div style="font-size:var(--fs-xs); color:var(--gris-moyen); margin-top:2px">
            ${escapeHtml(prj.id)} · ${prj.origine === 'plan_v1' ? ('Natif de ' + (paOrig ? '#' + paOrig.numero + ' ' + escapeHtml(paOrig.intitule.substring(0, 50)) : '?')) : 'Hors plan'}
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center">
          ${prj.origine === 'hors_plan' ? `<button class="btn btn-mini btn-danger" id="btn-delete-projet">Supprimer</button>` : ''}
          <button class="modal-close" id="btn-close-modal">✕</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-field wide"><label>Intitulé</label><input type="text" id="f-intitule" value="${escapeHtml(prj.intitule || '')}"></div>
          <div class="form-field wide"><label>Description</label><textarea id="f-description" rows="2">${escapeHtml(prj.description || '')}</textarea></div>
          <div class="form-field"><label>Pôle responsable</label>
            <select id="f-pole-resp"><option value="">—</option>${POLES.map(p => `<option value="${p}" ${prj.pole_responsable === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
          </div>
          <div class="form-field"><label>Statut</label>
            <select id="f-statut-modal">${STATUTS.map(s => `<option value="${s.code}" ${(prj.statut || 'non_demarre') === s.code ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
          </div>
          <div class="form-field"><label>Date de début</label><input type="date" id="f-date-debut" value="${prj.date_debut || ''}"></div>
          <div class="form-field"><label>Date de fin prévue</label><input type="date" id="f-date-fin-prevue" value="${prj.date_fin_prevue || ''}"></div>
          <div class="form-field"><label>Date de fin réelle</label><input type="date" id="f-date-fin-reelle" value="${prj.date_fin_reelle || ''}"></div>
          <div class="form-field"><label>Avancement</label>
            <div class="field-slider"><input type="range" min="0" max="100" step="1" id="f-avancement" value="${prj.avancement_pct || 0}"><span class="val" id="f-avancement-val">${prj.avancement_pct || 0}%</span></div>
          </div>
          <div class="form-field wide"><label>Commentaire</label><textarea id="f-commentaire" rows="2">${escapeHtml(prj.commentaire || '')}</textarea></div>
        </div>

        <div class="boussole-section">
          <h4>Boussole annuelle</h4>
          <div class="impacts-help">Tague ce projet pour une ou plusieurs années : le CODIR l'a retenu comme prioritaire pour la roadmap des pôles cette année-là.</div>
          <div class="boussole-years" id="boussole-years">
            ${getBoussoleYears().map(y => `<button class="boussole-year-btn ${(prj.boussole_annees || []).includes(y) ? 'selected' : ''}" data-year="${y}">🧭 ${y}</button>`).join('')}
          </div>
        </div>

        <div class="impacts-section">
          <h4>Impact sur les objectifs du plan</h4>
          <div class="impacts-help">Aucun (0) = pas de contribution. Faible/Moyen/Fort selon l'intensité d'impact.</div>
          <div id="impacts-container">${renderImpactsSection(prj)}</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  document.getElementById('btn-close-modal').addEventListener('click', () => backdrop.remove());
  const delBtn = document.getElementById('btn-delete-projet');
  if (delBtn) delBtn.addEventListener('click', () => supprimerProjet(prj));

  document.getElementById('f-intitule').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { intitule: e.target.value })));
  document.getElementById('f-description').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { description: e.target.value })));
  document.getElementById('f-pole-resp').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { pole_responsable: e.target.value || null })));
  document.getElementById('f-statut-modal').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { statut: e.target.value })));
  document.getElementById('f-date-debut').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { date_debut: e.target.value || null })));
  document.getElementById('f-date-fin-prevue').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { date_fin_prevue: e.target.value || null })));
  document.getElementById('f-date-fin-reelle').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { date_fin_reelle: e.target.value || null })));
  document.getElementById('f-commentaire').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { commentaire: e.target.value })));

  const avSlider = document.getElementById('f-avancement');
  avSlider.addEventListener('input', () => { document.getElementById('f-avancement-val').textContent = avSlider.value + '%'; });
  avSlider.addEventListener('change', () => muter(() => M.updateProjet(prj.id, { avancement_pct: parseInt(avSlider.value) })));

  document.querySelectorAll('#boussole-years .boussole-year-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const year = parseInt(btn.dataset.year);
      const years = new Set(prj.boussole_annees || []);
      if (years.has(year)) years.delete(year); else years.add(year);
      muter(() => M.updateProjet(prj.id, { boussole_annees: Array.from(years).sort() }));
    });
  });

  wireImpactsSection(prj);
}

function renderImpactsSection(prj) {
  const impactsMap = new Map();
  for (const pa of planTree.prioritesPlats) {
    for (const obj of pa.objectifs) {
      const im = (obj.impacts || []).find(x => x.projet.id === prj.id);
      if (im) impactsMap.set(obj.id, im.poids);
    }
  }

  return planTree.prioritesPlats.map(pa => {
    const activeCount = pa.objectifs.filter(o => (impactsMap.get(o.id) || 0) > 0).length;
    const isOpen = openImpactPas.has(pa.id) || pa.id === prj.pa_origine || activeCount > 0;
    if (isOpen) openImpactPas.add(pa.id);
    return `
      <div class="impact-pa-block">
        <div class="impact-pa-header ${isOpen ? 'open' : ''}" data-toggle-pa="${pa.id}">
          <span class="caret">▶</span>
          <span><span class="pa-code">#${pa.numero}</span> ${escapeHtml(pa.intitule)}</span>
          <span class="pa-summary">${activeCount > 0 ? activeCount + '/' + pa.objectifs.length + ' impacté(s)' : '—'}</span>
        </div>
        <div class="impact-pa-body ${isOpen ? 'open' : ''}">
          ${pa.objectifs.map((o, i) => `
            <div class="impact-obj-row">
              <div class="obj-label"><span class="obj-code">O${i + 1}</span>${escapeHtml(o.intitule)}</div>
              <div class="impact-selector">
                ${[0, 1, 2, 3].map(p => `<button data-poids="${p}" class="${p === (impactsMap.get(o.id) || 0) ? 'selected' : ''}" data-set-impact="${o.id}|${p}">${['Aucun', 'Faible', 'Moyen', 'Fort'][p]}</button>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function wireImpactsSection(prj) {
  const container = document.getElementById('impacts-container');
  container.querySelectorAll('[data-toggle-pa]').forEach(header => {
    header.addEventListener('click', () => {
      const paId = header.dataset.togglePa;
      if (openImpactPas.has(paId)) openImpactPas.delete(paId); else openImpactPas.add(paId);
      container.innerHTML = renderImpactsSection(prj);
      wireImpactsSection(prj);
    });
  });
  container.querySelectorAll('[data-set-impact]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const [objId, poids] = btn.dataset.setImpact.split('|');
      muter(() => M.setImpact(prj.id, objId, parseInt(poids)));
    });
  });
}

async function supprimerProjet(prj) {
  if (!confirm(`Supprimer le projet "${prj.intitule || prj.id}" ?`)) return;
  const backdrop = document.getElementById('projet-modal');
  await muter(async () => {
    const { error } = await supabase.from('projets').delete().eq('id', prj.id);
    if (error) throw error;
  }, 'Projet supprimé.');
  if (backdrop) backdrop.remove();
}
