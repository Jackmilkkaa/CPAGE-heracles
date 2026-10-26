// ============================================================================
// vueProjets.js — Portefeuille de projets : tuiles de pilotage (qui servent de
// filtre), signal d'échéance calculé, filtres compacts avec puces retirables,
// deux présentations (grille ou colonnes par statut). La fiche détaillée est
// déléguée à projetModal.js (panneau latéral partagé avec vuePriorite.js).
// ============================================================================
import { escapeHtml } from './utils.js';
import * as M from './mutations.js';
import { ouvrirModalProjet, STATUTS, labelStatut } from './projetModal.js';
import { classAvancement } from './calc.js';

let planTree = null;
let onDataChanged = null;
let filtres = { q: '', pole: '', statut: '', echeance: '', origine: '', pa: '', boussole: '' };
let tri = 'defaut'; // 'defaut' | 'avancement_desc' | 'avancement_asc' | 'date_fin_asc' | 'date_fin_desc'
let vue = 'grille'; // 'grille' | 'statut'

const CLOS = ['realise', 'abandonne', 'clos_partiel'];
const STATUT_PILL = { non_demarre: 'off', en_cours: 'info', realise: 'ok', clos_partiel: 'warn', abandonne: 'err' };
const SEUIL_BIENTOT_JOURS = 30;

const ICO_CAL = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const ICO_COMPASS = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>';

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

const statutDe = (p) => p.statut || 'non_demarre';

// Échéance calculée à partir de la date de fin prévue. Rien n'est affiché pour un projet
// clos ou sans date : une date absente n'est ni en retard ni dans les temps.
function echeance(prj) {
  if (!prj.date_fin_prevue || CLOS.includes(statutDe(prj))) return null;
  const fin = new Date(prj.date_fin_prevue + 'T23:59:59');
  if (isNaN(fin.getTime())) return null;
  const maintenant = new Date();
  const jours = Math.ceil((fin - maintenant) / 86400000);
  if (fin < maintenant) return { type: 'retard', jours: Math.max(1, Math.ceil((maintenant - fin) / 86400000)) };
  if (jours <= SEUIL_BIENTOT_JOURS) return { type: 'bientot', jours };
  return null;
}

function pastilleEcheance(prj) {
  const e = echeance(prj);
  if (!e) return '';
  if (e.type === 'retard') return `<span class="pill err" title="Date de fin prévue dépassée">En retard · ${e.jours} j</span>`;
  return `<span class="pill warn" title="Date de fin prévue proche">Échéance J-${e.jours}</span>`;
}

const TUILES = [
  { cle: 'tous', label: 'Tous les projets', ton: '', test: () => true },
  { cle: 'non_demarre', label: 'Non démarrés', ton: 'off', test: p => statutDe(p) === 'non_demarre' },
  { cle: 'en_cours', label: 'En cours', ton: 'info', test: p => statutDe(p) === 'en_cours' },
  { cle: 'retard', label: 'En retard', ton: 'err', test: p => { const e = echeance(p); return !!e && e.type === 'retard'; } },
  { cle: 'bientot', label: `Échéance sous ${SEUIL_BIENTOT_JOURS} j`, ton: 'warn', test: p => { const e = echeance(p); return !!e && e.type === 'bientot'; } },
  { cle: 'realise', label: 'Réalisés', ton: 'ok', test: p => statutDe(p) === 'realise' },
];

function tuileActive() {
  if (filtres.echeance) return filtres.echeance;
  if (filtres.statut) return filtres.statut;
  return 'tous';
}

function appliquerTuile(cle) {
  filtres.statut = ''; filtres.echeance = '';
  if (cle === 'retard' || cle === 'bientot') filtres.echeance = cle;
  else if (cle !== 'tous') filtres.statut = cle;
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

    <div class="kpi-strip" id="projets-kpis" style="--kpi-cols: 6"></div>

    <div class="filterbar">
      <input type="search" class="fb-input fb-search" id="f-q" placeholder="Rechercher un projet…" value="${escapeHtml(filtres.q)}">
      <select class="fb-select" id="f-pole" aria-label="Pôle responsable"><option value="">Tous les pôles</option>${(planTree.poles || []).map(p => `<option value="${p.code}" ${filtres.pole === p.code ? 'selected' : ''}>${escapeHtml(p.libelle)}</option>`).join('')}</select>
      <select class="fb-select" id="f-origine" aria-label="Origine">
        <option value="">Toutes origines</option>
        <option value="plan_v1" ${filtres.origine === 'plan_v1' ? 'selected' : ''}>Plan v1</option>
        <option value="hors_plan" ${filtres.origine === 'hors_plan' ? 'selected' : ''}>Hors plan</option>
      </select>
      <select class="fb-select" id="f-pa" aria-label="Priorité d'action"><option value="">Toutes les PA</option>${planTree.prioritesPlats.map(p => `<option value="${p.id}" ${filtres.pa === p.id ? 'selected' : ''}>#${p.numero} ${escapeHtml(p.intitule.substring(0, 50))}</option>`).join('')}</select>
      <select class="fb-select" id="f-boussole" aria-label="Boussole"><option value="">Boussole : toutes</option>${boussoleYears.map(y => `<option value="${y}" ${String(filtres.boussole) === String(y) ? 'selected' : ''}>Boussole ${y}</option>`).join('')}</select>
      <span class="fb-spacer"></span>
      <select class="fb-select" id="f-tri" aria-label="Tri">
        <option value="defaut" ${tri === 'defaut' ? 'selected' : ''}>Tri par défaut</option>
        <option value="avancement_desc" ${tri === 'avancement_desc' ? 'selected' : ''}>Avancement décroissant</option>
        <option value="avancement_asc" ${tri === 'avancement_asc' ? 'selected' : ''}>Avancement croissant</option>
        <option value="date_fin_asc" ${tri === 'date_fin_asc' ? 'selected' : ''}>Échéance la plus proche</option>
        <option value="date_fin_desc" ${tri === 'date_fin_desc' ? 'selected' : ''}>Échéance la plus lointaine</option>
      </select>
      <div class="segment-control" id="vue-switch" role="group" aria-label="Présentation">
        <button data-vue="grille" class="${vue === 'grille' ? 'active' : ''}">Grille</button>
        <button data-vue="statut" class="${vue === 'statut' ? 'active' : ''}">Par statut</button>
      </div>
    </div>
    <div class="filter-meta" id="projets-meta"></div>

    <div id="projets-grid-slot"></div>
  `;

  document.getElementById('btn-add-projet').addEventListener('click', ajouterProjet);
  document.getElementById('f-q').addEventListener('input', (e) => { filtres.q = e.target.value; rafraichir(); });
  document.getElementById('f-pole').addEventListener('change', (e) => { filtres.pole = e.target.value; rafraichir(); });
  document.getElementById('f-origine').addEventListener('change', (e) => { filtres.origine = e.target.value; rafraichir(); });
  document.getElementById('f-pa').addEventListener('change', (e) => { filtres.pa = e.target.value; rafraichir(); });
  document.getElementById('f-boussole').addEventListener('change', (e) => { filtres.boussole = e.target.value; rafraichir(); });
  document.getElementById('f-tri').addEventListener('change', (e) => { tri = e.target.value; rafraichir(); });
  document.querySelectorAll('#vue-switch button').forEach(b => b.addEventListener('click', () => {
    vue = b.dataset.vue;
    document.querySelectorAll('#vue-switch button').forEach(x => x.classList.toggle('active', x === b));
    rafraichir();
  }));

  rafraichir();
}

function rafraichir() {
  renderKpis();
  renderMeta();
  renderGrid();
}

function renderKpis() {
  const tous = planTree.projetsPlats;
  const actif = tuileActive();
  document.getElementById('projets-kpis').innerHTML = TUILES.map(t => {
    const n = tous.filter(t.test).length;
    return `<button class="kpi-tile ${actif === t.cle ? 'active' : ''}" data-tuile="${t.cle}" aria-pressed="${actif === t.cle}">
      <span class="kpi-label">${t.ton ? `<span class="kpi-dot ${t.ton}"></span>` : ''}${t.label}</span>
      <span class="kpi-value">${n}</span>
      <span class="kpi-sub">${t.cle === 'tous' ? 'dans le portefeuille' : (tous.length ? Math.round(100 * n / tous.length) + ' % du portefeuille' : '')}</span>
    </button>`;
  }).join('');
  document.querySelectorAll('#projets-kpis [data-tuile]').forEach(b => b.addEventListener('click', () => {
    const cle = b.dataset.tuile;
    appliquerTuile(tuileActive() === cle ? 'tous' : cle);
    rafraichir();
  }));
}

function chipsActifs() {
  const chips = [];
  const t = TUILES.find(x => x.cle === tuileActive());
  if (tuileActive() !== 'tous') chips.push(['tuile', t.label]);
  if (filtres.pole) { const p = (planTree.poles || []).find(x => x.code === filtres.pole); chips.push(['pole', p ? p.libelle : filtres.pole]); }
  if (filtres.origine) chips.push(['origine', filtres.origine === 'hors_plan' ? 'Hors plan' : 'Plan v1']);
  if (filtres.pa) { const pa = planTree.prioritesPlats.find(x => x.id === filtres.pa); chips.push(['pa', pa ? '#' + pa.numero : filtres.pa]); }
  if (filtres.boussole) chips.push(['boussole', 'Boussole ' + filtres.boussole]);
  if (filtres.q) chips.push(['q', '« ' + filtres.q + ' »']);
  return chips;
}

function renderMeta() {
  const n = projetsFiltres().length;
  const chips = chipsActifs();
  document.getElementById('projets-meta').innerHTML = `
    <div class="chips">${chips.map(([k, l]) => `<span class="filter-chip">${escapeHtml(l)}<button data-clear="${k}" aria-label="Retirer le filtre">✕</button></span>`).join('')}${chips.length ? '<button class="link-btn" data-clear="all">Réinitialiser</button>' : ''}</div>
    <div class="filter-count">${n} projet${n > 1 ? 's' : ''} affiché${n > 1 ? 's' : ''} sur ${planTree.projetsPlats.length}</div>
  `;
  document.querySelectorAll('#projets-meta [data-clear]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.clear;
    if (k === 'all') filtres = { q: '', pole: '', statut: '', echeance: '', origine: '', pa: '', boussole: '' };
    else if (k === 'tuile') { filtres.statut = ''; filtres.echeance = ''; }
    else filtres[k] = '';
    renderVueProjets(planTree, onDataChanged);
  }));
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
    // Les projets sans date de fin prévue sont toujours relégués en fin de liste,
    // quel que soit le sens du tri : une date manquante n'est pas comparable.
    projets.sort((a, b) => {
      const da = a.date_fin_prevue, db = b.date_fin_prevue;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return tri === 'date_fin_asc' ? da.localeCompare(db) : db.localeCompare(da);
    });
  }
}

function projetsFiltres() {
  let projets = planTree.projetsPlats.slice();
  if (filtres.q) {
    const q = filtres.q.toLowerCase();
    projets = projets.filter(p => (p.intitule || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  }
  if (filtres.pole) projets = projets.filter(p => p.pole_responsable === filtres.pole);
  if (filtres.statut) projets = projets.filter(p => statutDe(p) === filtres.statut);
  if (filtres.echeance) projets = projets.filter(p => { const e = echeance(p); return !!e && e.type === filtres.echeance; });
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
  return projets;
}

function renderGrid() {
  const slot = document.getElementById('projets-grid-slot');
  const projets = projetsFiltres();

  if (projets.length === 0) {
    slot.innerHTML = '<div class="projets-empty">Aucun projet ne correspond à ces filtres.</div>';
    return;
  }

  if (vue === 'statut') {
    const colonnes = [
      { label: 'Non démarrés', pill: 'off', statuts: ['non_demarre'] },
      { label: 'En cours', pill: 'info', statuts: ['en_cours'] },
      { label: 'Réalisés', pill: 'ok', statuts: ['realise'] },
      { label: 'Clos ou abandonnés', pill: 'warn', statuts: ['clos_partiel', 'abandonne'] },
    ];
    slot.innerHTML = '<div class="kb-board">' + colonnes.map(c => {
      const items = projets.filter(p => c.statuts.includes(statutDe(p)));
      const moy = items.length ? Math.round(items.reduce((s, p) => s + (p.avancement_pct || 0), 0) / items.length) : null;
      return `<section class="kb-col" aria-label="${c.label}">
        <header class="kb-head"><span class="pill ${c.pill}">${c.label}</span><span class="kb-count">${items.length}</span>${moy !== null ? `<span class="kb-avg" title="Avancement moyen">moy. ${moy} %</span>` : ''}</header>
        <div class="kb-body">${items.length ? items.map(p => renderTile(p, true)).join('') : '<div class="kb-empty">Aucun projet</div>'}</div>
      </section>`;
    }).join('') + '</div>';
  } else {
    slot.innerHTML = '<div class="projets-grid">' + projets.map(p => renderTile(p, false)).join('') + '</div>';
  }

  slot.querySelectorAll('.projet-tile').forEach(tile => {
    const ouvrir = () => ouvrirModalProjet(tile.dataset.id, planTree, onDataChanged);
    tile.addEventListener('click', ouvrir);
    tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } });
  });
}

function renderTile(prj, compact) {
  const st = statutDe(prj);
  const av = prj.avancement_pct || 0;
  const paOrig = prj.pa_origine ? planTree.prioritesPlats.find(p => p.id === prj.pa_origine) : null;
  const boussole = (prj.boussole_annees || []).length > 0
    ? `<span class="boussole-badge" title="Boussole ${prj.boussole_annees.join(', ')}">${ICO_COMPASS}${prj.boussole_annees.join(', ')}</span>` : '';
  const hors = prj.origine === 'hors_plan';
  return `
    <article class="projet-tile ${compact ? 'compact' : ''} ${hors ? 'hors-plan' : ''}" data-id="${prj.id}" tabindex="0" role="button" aria-label="Ouvrir le projet ${escapeHtml(prj.intitule || prj.id)}">
      <div class="prj-head">
        <span class="prj-id">${escapeHtml(prj.id)}</span>
        ${compact ? '' : `<span class="pill ${STATUT_PILL[st]}">${labelStatut(st)}</span>`}
      </div>
      <div class="prj-title">${escapeHtml(prj.intitule || '(sans titre)')}</div>
      <div class="prj-meta">
        ${prj.pole_responsable ? `<span class="prj-badge pole">${escapeHtml(prj.pole_responsable)}</span>` : ''}
        ${paOrig ? `<span class="prj-badge pa" title="${escapeHtml(paOrig.intitule)}">#${paOrig.numero}</span>` : ''}
        ${hors ? '<span class="prj-badge hors">Hors plan</span>' : ''}
        ${boussole}
      </div>
      <div class="prj-foot">
        <span class="prj-bar"><span class="prj-bar-fill ${classAvancement(av)}" style="width:${av}%"></span></span>
        <span class="prj-pct">${av} %</span>
      </div>
      <div class="prj-due">
        ${prj.date_fin_prevue ? `<span class="prj-date" title="Date de fin prévue">${ICO_CAL}${formatDateFr(prj.date_fin_prevue)}</span>` : '<span class="prj-date muted">Pas de date de fin</span>'}
        ${pastilleEcheance(prj)}
      </div>
    </article>
  `;
}

async function ajouterProjet() {
  const intitule = prompt('Intitulé du nouveau projet hors plan :');
  if (!intitule) return;
  await muter(() => M.creerProjetHorsPlan(intitule, []), 'Projet créé. Ouvre-le pour définir ses impacts.');
}
