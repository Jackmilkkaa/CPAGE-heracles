// ============================================================================
// vueProjets.js — Grille de tous les projets, filtres. Le modal d'édition
// est délégué à projetModal.js (partagé avec vuePriorite.js).
// ============================================================================
import { escapeHtml } from './utils.js';
import * as M from './mutations.js';
import { ouvrirModalProjet, STATUTS, labelStatut } from './projetModal.js';

let planTree = null;
let onDataChanged = null;
let filtres = { q: '', pole: '', statut: '', origine: '', pa: '', boussole: '' };
let tri = 'defaut'; // 'defaut' | 'avancement_desc' | 'avancement_asc' | 'date_fin_asc' | 'date_fin_desc'

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
      <select id="f-pole"><option value="">Tous pôles</option>${(planTree.poles || []).map(p => `<option value="${p.code}" ${filtres.pole === p.code ? 'selected' : ''}>${escapeHtml(p.libelle)}</option>`).join('')}</select>
      <select id="f-statut"><option value="">Tous statuts</option>${STATUTS.map(s => `<option value="${s.code}" ${filtres.statut === s.code ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      <select id="f-origine">
        <option value="">Toutes origines</option>
        <option value="plan_v1" ${filtres.origine === 'plan_v1' ? 'selected' : ''}>Plan v1</option>
        <option value="hors_plan" ${filtres.origine === 'hors_plan' ? 'selected' : ''}>Hors plan</option>
      </select>
      <select id="f-pa"><option value="">Toutes PA</option>${planTree.prioritesPlats.map(p => `<option value="${p.id}" ${filtres.pa === p.id ? 'selected' : ''}>#${p.numero} ${escapeHtml(p.intitule.substring(0, 50))}</option>`).join('')}</select>
      <select id="f-boussole"><option value="">Toutes (boussole ou non)</option>${boussoleYears.map(y => `<option value="${y}" ${String(filtres.boussole) === String(y) ? 'selected' : ''}>🧭 Boussole ${y}</option>`).join('')}</select>
      <select id="f-tri">
        <option value="defaut" ${tri === 'defaut' ? 'selected' : ''}>Tri par défaut</option>
        <option value="avancement_desc" ${tri === 'avancement_desc' ? 'selected' : ''}>Avancement décroissant</option>
        <option value="avancement_asc" ${tri === 'avancement_asc' ? 'selected' : ''}>Avancement croissant</option>
        <option value="date_fin_asc" ${tri === 'date_fin_asc' ? 'selected' : ''}>Date de fin prévue, plus proche d'abord</option>
        <option value="date_fin_desc" ${tri === 'date_fin_desc' ? 'selected' : ''}>Date de fin prévue, plus lointaine d'abord</option>
      </select>
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
  document.getElementById('f-tri').addEventListener('change', (e) => { tri = e.target.value; renderGrid(); });

  renderGrid();
}

function formatDateFr(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function trierProjets(projets) {
  if (tri === 'defaut') return;
  if (tri === 'avancement_desc') {
    projets.sort((a, b) => (b.avancement_pct || 0) - (a.avancement_pct || 0));
  } else if (tri === 'avancement_asc') {
    projets.sort((a, b) => (a.avancement_pct || 0) - (b.avancement_pct || 0));
  } else if (tri === 'date_fin_asc' || tri === 'date_fin_desc') {
    // Les projets sans date de fin prévue sont toujours relégués en fin de
    // liste, quel que soit le sens du tri : une date manquante n'est ni "la
    // plus proche" ni "la plus lointaine", elle n'est juste pas comparable.
    projets.sort((a, b) => {
      const da = a.date_fin_prevue, db = b.date_fin_prevue;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return tri === 'date_fin_asc' ? da.localeCompare(db) : db.localeCompare(da);
    });
  }
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

  trierProjets(projets);

  document.getElementById('projets-count').textContent = `${projets.length} projet${projets.length > 1 ? 's' : ''} affiché${projets.length > 1 ? 's' : ''}`;

  if (projets.length === 0) {
    slot.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--gris-moyen)">Aucun projet ne correspond à ce filtre.</div>';
    return;
  }

  slot.innerHTML = '<div class="projets-grid">' + projets.map(renderTile).join('') + '</div>';

  slot.querySelectorAll('.projet-tile').forEach(tile => {
    tile.addEventListener('click', () => ouvrirModalProjet(tile.dataset.id, planTree, onDataChanged));
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
        ${prj.date_fin_prevue ? `<span class="prj-badge date" title="Date de fin prévue">📅 ${formatDateFr(prj.date_fin_prevue)}</span>` : ''}
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
