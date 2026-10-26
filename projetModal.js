// ============================================================================
// projetModal.js — Modal complet d'édition d'un projet (métadonnées, dates,
// boussole, impacts sur les 24 PA). Partagé entre vueProjets.js et
// vuePriorite.js : un seul endroit à faire évoluer, pas de duplication.
// ============================================================================
import { escapeHtml } from './utils.js';
import { supabase } from './client.js';
import * as M from './mutations.js';

export const STATUTS = [
  { code: 'non_demarre', label: 'Non démarré' },
  { code: 'en_cours', label: 'En cours' },
  { code: 'realise', label: 'Réalisé' },
  { code: 'clos_partiel', label: 'Clos partiel' },
  { code: 'abandonne', label: 'Abandonné' },
];
export function labelStatut(code) { return (STATUTS.find(s => s.code === code) || {}).label || code; }

let openImpactPas = new Set();

function notify(msg, kind = 'info') {
  const n = document.createElement('div');
  n.className = 'notice' + (kind !== 'info' ? ' ' + kind : '');
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => { n.style.transition = 'opacity 0.4s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 400); }, 3000);
}

async function muter(fn, onDataChanged, successMsg) {
  try {
    await fn();
    if (successMsg) notify(successMsg, 'success');
    await onDataChanged();
  } catch (e) {
    console.error(e);
    notify('Erreur : ' + (e.message || String(e)), 'error');
  }
}

function getBoussoleYears(planTree) {
  const periode = (planTree.planMeta && planTree.planMeta.periode) || '2025-2030';
  const m = periode.match(/(\d{4})\s*-\s*(\d{4})/);
  if (!m) return [new Date().getFullYear()];
  const out = [];
  for (let y = parseInt(m[1]); y <= parseInt(m[2]); y++) out.push(y);
  return out;
}

// Point d'entrée principal, appelé depuis n'importe quelle vue.
export function ouvrirModalProjet(projetId, planTree, onDataChanged, options = {}) {
  const prj = planTree.projetsPlats.find(p => p.id === projetId);
  if (!prj) return;
  const paOrig = prj.pa_origine ? planTree.prioritesPlats.find(p => p.id === prj.pa_origine) : null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'projet-modal';
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  const onKey = (e) => {
    if (!document.body.contains(backdrop)) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') { backdrop.remove(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  backdrop.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-label="Fiche projet">
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
            <select id="f-pole-resp"><option value="">—</option>${(planTree.poles || []).map(p => `<option value="${p.code}" ${prj.pole_responsable === p.code ? 'selected' : ''}>${escapeHtml(p.libelle)}</option>`).join('')}</select>
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
            ${getBoussoleYears(planTree).map(y => `<button class="boussole-year-btn ${(prj.boussole_annees || []).includes(y) ? 'selected' : ''}" data-year="${y}">🧭 ${y}</button>`).join('')}
          </div>
        </div>

        <div class="impacts-section">
          <h4>Impact sur les objectifs du plan</h4>
          <div class="impacts-help">Aucun (0) = pas de contribution. Faible/Moyen/Fort selon l'intensité d'impact.</div>
          <div id="impacts-container">${renderImpactsSection(prj, planTree)}</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  document.getElementById('btn-close-modal').addEventListener('click', () => backdrop.remove());
  document.getElementById('btn-close-modal').focus();
  const delBtn = document.getElementById('btn-delete-projet');
  if (delBtn) delBtn.addEventListener('click', () => supprimerProjet(prj, onDataChanged));

  document.getElementById('f-intitule').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { intitule: e.target.value }), onDataChanged));
  document.getElementById('f-description').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { description: e.target.value }), onDataChanged));
  document.getElementById('f-pole-resp').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { pole_responsable: e.target.value || null }), onDataChanged));
  document.getElementById('f-statut-modal').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { statut: e.target.value }), onDataChanged));
  document.getElementById('f-date-debut').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { date_debut: e.target.value || null }), onDataChanged));
  document.getElementById('f-date-fin-prevue').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { date_fin_prevue: e.target.value || null }), onDataChanged));
  document.getElementById('f-date-fin-reelle').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { date_fin_reelle: e.target.value || null }), onDataChanged));
  document.getElementById('f-commentaire').addEventListener('change', (e) => muter(() => M.updateProjet(prj.id, { commentaire: e.target.value }), onDataChanged));

  const avSlider = document.getElementById('f-avancement');
  avSlider.addEventListener('input', () => { document.getElementById('f-avancement-val').textContent = avSlider.value + '%'; });
  avSlider.addEventListener('change', () => muter(() => M.updateProjet(prj.id, { avancement_pct: parseInt(avSlider.value) }), onDataChanged));

  document.querySelectorAll('#boussole-years .boussole-year-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const year = parseInt(btn.dataset.year);
      const years = new Set(prj.boussole_annees || []);
      if (years.has(year)) years.delete(year); else years.add(year);
      muter(() => M.updateProjet(prj.id, { boussole_annees: Array.from(years).sort() }), onDataChanged);
    });
  });

  wireImpactsSection(prj, planTree, onDataChanged);

  // Rattachement à une PA (dépôt d'une carte sur une PA) : on ouvre le bloc de cette PA
  // dans la section Impacts et on y amène l'utilisateur, sans rien modifier à sa place.
  if (options.focusPa) {
    const pa = planTree.prioritesPlats.find(p => p.id === options.focusPa);
    if (pa) {
      openImpactPas.add(pa.id);
      const container = document.getElementById('impacts-container');
      container.innerHTML = renderImpactsSection(prj, planTree);
      wireImpactsSection(prj, planTree, onDataChanged);
      const help = document.querySelector('.impacts-section .impacts-help');
      if (help) help.innerHTML = `<strong>Rattachement à #${pa.numero}</strong> : choisis l'objectif concerné et l'intensité d'impact. Rien n'est modifié tant que tu n'as pas cliqué.`;
      const hdr = container.querySelector(`[data-toggle-pa="${pa.id}"]`);
      if (hdr) { hdr.classList.add('flash'); hdr.scrollIntoView({ block: 'center' }); }
    }
  }
}

function renderImpactsSection(prj, planTree) {
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

function wireImpactsSection(prj, planTree, onDataChanged) {
  const container = document.getElementById('impacts-container');
  container.querySelectorAll('[data-toggle-pa]').forEach(header => {
    header.addEventListener('click', () => {
      const paId = header.dataset.togglePa;
      if (openImpactPas.has(paId)) openImpactPas.delete(paId); else openImpactPas.add(paId);
      container.innerHTML = renderImpactsSection(prj, planTree);
      wireImpactsSection(prj, planTree, onDataChanged);
    });
  });
  container.querySelectorAll('[data-set-impact]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const [objId, poids] = btn.dataset.setImpact.split('|');
      muter(() => M.setImpact(prj.id, objId, parseInt(poids)), onDataChanged);
    });
  });
}

async function supprimerProjet(prj, onDataChanged) {
  if (!confirm(`Supprimer le projet "${prj.intitule || prj.id}" ?`)) return;
  const backdrop = document.getElementById('projet-modal');
  await muter(async () => {
    const { error } = await supabase.from('projets').delete().eq('id', prj.id);
    if (error) throw error;
  }, onDataChanged, 'Projet supprimé.');
  if (backdrop) backdrop.remove();
}
