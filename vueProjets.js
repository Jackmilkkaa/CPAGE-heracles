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
let vue = 'grille'; // 'grille' | 'statut' | 'pole' | 'orientation' | 'pa'
let peutEditer = true;
let dragId = null;

// Les déplacements (glisser-déposer, menu « Déplacer vers… ») sont réservés aux profils qui peuvent écrire.
export function setPeutEditer(valeur) { peutEditer = !!valeur; }

const VUES = [['grille', 'Grille'], ['statut', 'Par statut'], ['pole', 'Par pôle'], ['orientation', 'Par orientation'], ['pa', 'Par PA']];
const COLONNES_STATUT = [
  { cle: 'non_demarre', label: 'Non démarrés' },
  { cle: 'en_cours', label: 'En cours' },
  { cle: 'realise', label: 'Réalisés' },
  { cle: 'clos_partiel', label: 'Clos partiels' },
  { cle: 'abandonne', label: 'Abandonnés' },
];

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
      <select class="fb-select" id="f-vue" aria-label="Présentation">
        ${VUES.map(([code, label]) => `<option value="${code}" ${vue === code ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
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
  document.getElementById('f-vue').addEventListener('change', (e) => { vue = e.target.value; rafraichir(); });

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

// ---------------------------------------------------------------------------
// Rattachement : PA native, sinon PA où l'impact cumulé est le plus fort (projets hors plan).
// ---------------------------------------------------------------------------
function paDeRattachement(prj) {
  if (prj.pa_origine) {
    const pa = planTree.prioritesPlats.find(p => p.id === prj.pa_origine);
    if (pa) return pa;
  }
  let meilleur = null, score = 0;
  for (const pa of planTree.prioritesPlats) {
    let s = 0;
    for (const o of pa.objectifs) for (const im of (o.impacts || [])) if (im.projet.id === prj.id) s += im.poids || 0;
    if (s > score) { score = s; meilleur = pa; }
  }
  return meilleur;
}
function orientationDe(pa) {
  const axe = planTree.axesPlats.find(a => a.id === pa.axe_id);
  return axe ? axe._orientation : null;
}
function moyenne(items) {
  return items.length ? Math.round(items.reduce((s, p) => s + (p.avancement_pct || 0), 0) / items.length) : null;
}

function renderGrid() {
  const slot = document.getElementById('projets-grid-slot');
  const projets = projetsFiltres();

  if (projets.length === 0) {
    slot.innerHTML = '<div class="projets-empty">Aucun projet ne correspond à ces filtres.</div>';
    return;
  }

  if (vue === 'grille') slot.innerHTML = '<div class="projets-grid">' + projets.map(p => renderTile(p, 'grille')).join('') + '</div>';
  else if (vue === 'pa') slot.innerHTML = renderParPA(projets);
  else slot.innerHTML = renderColonnes(projets);

  slot.querySelectorAll('.projet-tile').forEach(tile => {
    const ouvrir = () => ouvrirModalProjet(tile.dataset.id, planTree, onDataChanged);
    tile.addEventListener('click', ouvrir);
    tile.addEventListener('keydown', (e) => {
      if (e.target !== tile) return; // laisse le bouton « Déplacer » gérer son propre clavier
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); }
    });
  });
  brancherDeplacements(slot);
}

function renderColonnes(projets) {
  let colonnes;
  if (vue === 'statut') {
    colonnes = COLONNES_STATUT.map(c => ({
      cle: c.cle, titre: `<span class="pill ${STATUT_PILL[c.cle]}">${c.label}</span>`,
      items: projets.filter(p => statutDe(p) === c.cle),
    }));
  } else if (vue === 'pole') {
    const poles = (planTree.poles || []).map(p => ({ cle: p.code, label: p.libelle }));
    const connus = new Set(poles.map(p => p.cle));
    const inconnus = [...new Set(projets.map(p => p.pole_responsable).filter(c => c && !connus.has(c)))].map(c => ({ cle: c, label: c }));
    colonnes = [...poles, ...inconnus, { cle: '', label: 'Sans pôle' }].map(c => ({
      cle: c.cle, titre: `<span class="kb-title">${escapeHtml(c.label)}</span>`,
      items: projets.filter(p => (p.pole_responsable || '') === c.cle),
    }));
  } else {
    const parOrient = (p) => { const pa = paDeRattachement(p); const o = pa ? orientationDe(pa) : null; return o ? o.id : ''; };
    colonnes = [...planTree.orientations.map(o => ({ cle: o.id, label: `${o.id} · ${o.intitule}` })), { cle: '', label: 'Sans PA' }].map(c => ({
      cle: c.cle, titre: `<span class="kb-title">${escapeHtml(c.label)}</span>`,
      items: projets.filter(p => parOrient(p) === c.cle),
    }));
  }
  const deposable = peutEditer && (vue === 'statut' || vue === 'pole');
  const html = colonnes.map(c => {
    const moy = moyenne(c.items);
    let corps;
    if (vue === 'orientation') {
      const parPa = new Map();
      for (const p of c.items) { const pa = paDeRattachement(p); const k = pa ? pa.id : ''; if (!parPa.has(k)) parPa.set(k, []); parPa.get(k).push(p); }
      const ordre = [...parPa.keys()].sort((a, b) => { const na = (planTree.prioritesPlats.find(x => x.id === a) || {}).numero || 999; const nb = (planTree.prioritesPlats.find(x => x.id === b) || {}).numero || 999; return na - nb; });
      corps = ordre.map(k => {
        const pa = planTree.prioritesPlats.find(x => x.id === k);
        return `<div class="kb-sub" title="${escapeHtml(pa ? pa.intitule : '')}">${pa ? '#' + pa.numero + ' ' + escapeHtml(pa.intitule) : 'Sans PA'}</div>` + parPa.get(k).map(p => renderTile(p, vue)).join('');
      }).join('');
    } else {
      corps = c.items.map(p => renderTile(p, vue)).join('');
    }
    return `<section class="kb-col ${vue === 'orientation' ? 'ro' : ''}" ${deposable ? `data-drop="${escapeHtml(c.cle)}"` : ''}>
      <header class="kb-head">${c.titre}<span class="kb-count">${c.items.length}</span>${moy !== null ? `<span class="kb-avg" title="Avancement moyen">moy. ${moy} %</span>` : ''}</header>
      <div class="kb-body">${corps || '<div class="kb-empty">Aucun projet</div>'}</div>
    </section>`;
  }).join('');
  const aide = vue === 'orientation'
    ? '<div class="board-hint">Lecture seule : le rattachement d\'un projet se modifie depuis sa fiche (section Impacts), ou en le déposant sur une PA dans la présentation « Par PA ».</div>'
    : (peutEditer ? '<div class="board-hint">Glisse une carte vers une autre colonne pour la déplacer, ou utilise le bouton ⋯ de la carte.</div>' : '');
  return aide + '<div class="kb-board">' + html + '</div>';
}

function renderParPA(projets) {
  const parPa = new Map();
  const sansPa = [];
  for (const p of projets) {
    const pa = paDeRattachement(p);
    if (!pa) { sansPa.push(p); continue; }
    if (!parPa.has(pa.id)) parPa.set(pa.id, []);
    parPa.get(pa.id).push(p);
  }
  const groupe = (entete, items, cle) => `
    <section class="pa-group ${items.length ? '' : 'empty'}" ${cle !== null && peutEditer ? `data-drop="${escapeHtml(cle)}"` : ''}>
      <header class="pa-group-head">${entete}<span class="kb-count">${items.length}</span></header>
      ${items.length ? `<div class="pa-group-body">${items.map(p => renderTile(p, 'pa')).join('')}</div>` : ''}
    </section>`;
  const sections = planTree.prioritesPlats.map(pa => {
    const o = orientationDe(pa);
    return groupe(`<span class="pa-group-num">#${pa.numero}</span><span class="pa-group-name">${escapeHtml(pa.intitule)}</span>${o ? `<span class="pa-group-orient">${escapeHtml(o.id)}</span>` : ''}`, parPa.get(pa.id) || [], pa.id);
  });
  if (sansPa.length) sections.push(groupe('<span class="pa-group-name">Sans PA (aucun impact renseigné)</span>', sansPa, null));
  const aide = peutEditer ? '<div class="board-hint">Dépose une carte sur une PA pour la rattacher : sa fiche s\'ouvre sur la section Impacts, rien n\'est modifié avant ton choix.</div>' : '';
  return aide + '<div class="pa-groups">' + sections.join('') + '</div>';
}

function renderTile(prj, mode = 'grille') {
  const st = statutDe(prj);
  const av = prj.avancement_pct || 0;
  const compact = mode !== 'grille';
  const montrerStatut = mode !== 'statut';
  const deplacable = peutEditer && (mode === 'statut' || mode === 'pole' || mode === 'pa');
  const menu = peutEditer && (mode === 'statut' || mode === 'pole');
  const paOrig = prj.pa_origine ? planTree.prioritesPlats.find(p => p.id === prj.pa_origine) : null;
  const boussole = (prj.boussole_annees || []).length > 0
    ? `<span class="boussole-badge" title="Boussole ${prj.boussole_annees.join(', ')}">${ICO_COMPASS}${prj.boussole_annees.join(', ')}</span>` : '';
  const hors = prj.origine === 'hors_plan';
  return `
    <article class="projet-tile ${compact ? 'compact' : ''} ${hors ? 'hors-plan' : ''}" data-id="${prj.id}" tabindex="0" role="button" ${deplacable ? 'draggable="true"' : ''} aria-label="Ouvrir le projet ${escapeHtml(prj.intitule || prj.id)}">
      <div class="prj-head">
        <span class="prj-id">${escapeHtml(prj.id)}</span>
        <span class="prj-head-right">
          ${montrerStatut ? `<span class="pill ${STATUT_PILL[st]}">${labelStatut(st)}</span>` : ''}
          ${menu ? `<button class="prj-move" data-id="${prj.id}" aria-label="Déplacer le projet vers une autre colonne" title="Déplacer vers…">⋯</button>` : ''}
        </span>
      </div>
      <div class="prj-title">${escapeHtml(prj.intitule || '(sans titre)')}</div>
      <div class="prj-meta">
        ${prj.pole_responsable && mode !== 'pole' ? `<span class="prj-badge pole">${escapeHtml(prj.pole_responsable)}</span>` : ''}
        ${paOrig && mode !== 'pa' ? `<span class="prj-badge pa" title="${escapeHtml(paOrig.intitule)}">#${paOrig.numero}</span>` : ''}
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

// ---------------------------------------------------------------------------
// Déplacements : glisser-déposer et menu « Déplacer vers… »
// ---------------------------------------------------------------------------
function brancherDeplacements(slot) {
  slot.querySelectorAll('.projet-tile[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      dragId = card.dataset.id;
      e.dataTransfer.setData('text/plain', dragId);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
      slot.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => {
      dragId = null;
      card.classList.remove('dragging');
      slot.classList.remove('is-dragging');
      slot.querySelectorAll('.drop-over').forEach(z => z.classList.remove('drop-over'));
    });
  });
  slot.querySelectorAll('[data-drop]').forEach(zone => {
    zone.addEventListener('dragover', (e) => { if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; zone.classList.add('drop-over'); });
    zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-over'); });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drop-over');
      const id = dragId || e.dataTransfer.getData('text/plain');
      dragId = null;
      surDepot(zone.dataset.drop, id);
    });
  });
  slot.querySelectorAll('.prj-move').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); ouvrirMenuDeplacement(btn); }));
}

function surDepot(cle, id) {
  const prj = planTree.projetsPlats.find(p => p.id === id);
  if (!prj || !peutEditer) return;
  if (vue === 'statut') deplacerStatut(prj, cle);
  else if (vue === 'pole') deplacerPole(prj, cle);
  else if (vue === 'pa') {
    const actuelle = paDeRattachement(prj);
    if (actuelle && actuelle.id === cle) return;
    ouvrirModalProjet(prj.id, planTree, onDataChanged, { focusPa: cle });
  }
}

let menuOuvert = null;
function fermerMenu() {
  if (menuOuvert) { menuOuvert.remove(); menuOuvert = null; }
}
function ouvrirMenuDeplacement(btn) {
  fermerMenu();
  const prj = planTree.projetsPlats.find(p => p.id === btn.dataset.id);
  if (!prj) return;
  let options, courant;
  if (vue === 'statut') { options = COLONNES_STATUT.map(c => ({ cle: c.cle, label: labelStatut(c.cle) })); courant = statutDe(prj); }
  else { options = [...(planTree.poles || []).map(p => ({ cle: p.code, label: p.libelle })), { cle: '', label: 'Sans pôle' }]; courant = prj.pole_responsable || ''; }
  const menu = document.createElement('div');
  menu.className = 'move-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `<div class="move-menu-title">Déplacer vers</div>` + options.map(o =>
    `<button role="menuitem" data-cle="${escapeHtml(o.cle)}" ${o.cle === courant ? 'disabled aria-current="true"' : ''}>${o.cle === courant ? '✓ ' : ''}${escapeHtml(o.label)}</button>`).join('');
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)) + 'px';
  menuOuvert = menu;
  menu.querySelectorAll('button:not([disabled])').forEach(b => b.addEventListener('click', () => {
    const cle = b.dataset.cle;
    fermerMenu();
    if (vue === 'statut') deplacerStatut(prj, cle); else deplacerPole(prj, cle);
  }));
  const premier = menu.querySelector('button:not([disabled])');
  if (premier) premier.focus();
  const fermeture = (e) => {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'click' && menu.contains(e.target)) return;
    fermerMenu();
    document.removeEventListener('click', fermeture, true);
    document.removeEventListener('keydown', fermeture, true);
  };
  setTimeout(() => { document.addEventListener('click', fermeture, true); document.addEventListener('keydown', fermeture, true); }, 0);
}

function toastAnnuler(message, annuler) {
  const n = document.createElement('div');
  n.className = 'notice success';
  n.innerHTML = `<span>${escapeHtml(message)}</span><button class="undo">Annuler</button>`;
  document.body.appendChild(n);
  const t = setTimeout(() => n.remove(), 7000);
  n.querySelector('.undo').addEventListener('click', () => { clearTimeout(t); n.remove(); annuler(); });
}

async function appliquerChamps(prj, champs, message) {
  const avant = {};
  for (const k of Object.keys(champs)) {
    if (k === 'statut') avant[k] = statutDe(prj);
    else if (k === 'avancement_pct') avant[k] = prj.avancement_pct || 0;
    else avant[k] = prj[k] === undefined ? null : prj[k];
  }
  try {
    await M.updateProjet(prj.id, champs);
    await onDataChanged();
    toastAnnuler(message, () => muter(() => M.updateProjet(prj.id, avant), 'Déplacement annulé.'));
  } catch (e) {
    console.error(e);
    notify('Erreur : ' + (e.message || String(e)), 'error');
  }
}

function deplacerPole(prj, cible) {
  if ((prj.pole_responsable || '') === cible) return;
  const p = (planTree.poles || []).find(x => x.code === cible);
  appliquerChamps(prj, { pole_responsable: cible || null }, `« ${prj.intitule || prj.id} » confié à ${cible ? (p ? p.libelle : cible) : 'aucun pôle'}.`);
}

function deplacerStatut(prj, cible) {
  const avant = statutDe(prj);
  if (avant === cible) return;
  // Démarrer un projet n'a rien à saisir : déplacement direct, avec annulation possible.
  if (avant === 'non_demarre' && cible === 'en_cours') {
    appliquerChamps(prj, { statut: cible }, `« ${prj.intitule || prj.id} » passe en « ${labelStatut(cible)} ».`);
    return;
  }
  ouvrirDialogueDeplacement(prj, cible);
}

function ouvrirDialogueDeplacement(prj, cible) {
  const avant = statutDe(prj);
  const sortDeRealise = avant === 'realise' && cible !== 'realise';
  const prerempli = cible === 'realise' ? 100 : (cible === 'non_demarre' ? 0 : (prj.avancement_pct || 0));
  const aujourdhui = new Date().toLocaleDateString('sv-SE');
  const bd = document.createElement('div');
  bd.className = 'dlg-backdrop';
  bd.innerHTML = `
    <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-titre">
      <h3 id="dlg-titre">Déplacer vers « ${labelStatut(cible)} »</h3>
      <div class="dlg-sub">${escapeHtml(prj.intitule || prj.id)}</div>
      ${sortDeRealise ? '<div class="dlg-hint">Ce projet était réalisé. Vérifie l\'avancement : la date de fin réelle sera effacée.</div>' : ''}
      <label for="dlg-av">Avancement</label>
      <div class="dlg-row">
        <input type="range" id="dlg-av" min="0" max="100" step="1" value="${prerempli}">
        <input type="number" id="dlg-av-num" min="0" max="100" value="${prerempli}" aria-label="Avancement en pourcentage"><span>%</span>
      </div>
      ${cible === 'realise' ? `<label for="dlg-date">Date de fin réelle</label><input type="date" id="dlg-date" class="fb-input" value="${prj.date_fin_reelle || aujourdhui}">` : ''}
      <div class="dlg-actions">
        <button class="btn btn-light" id="dlg-annuler">Annuler</button>
        <button class="btn btn-primary" id="dlg-valider">Valider</button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  const range = bd.querySelector('#dlg-av');
  const num = bd.querySelector('#dlg-av-num');
  const borne = (x) => Math.max(0, Math.min(100, parseInt(x, 10) || 0));
  range.addEventListener('input', () => { num.value = range.value; });
  num.addEventListener('input', () => { range.value = borne(num.value); });
  const fermer = () => { bd.remove(); document.removeEventListener('keydown', surTouche); };
  const valider = () => {
    const champs = { statut: cible, avancement_pct: borne(num.value) };
    if (cible === 'realise') champs.date_fin_reelle = (bd.querySelector('#dlg-date').value) || null;
    else if (sortDeRealise) champs.date_fin_reelle = null;
    fermer();
    appliquerChamps(prj, champs, `« ${prj.intitule || prj.id} » déplacé vers « ${labelStatut(cible)} ».`);
  };
  function surTouche(e) {
    if (e.key === 'Escape') fermer();
    else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); valider(); }
  }
  document.addEventListener('keydown', surTouche);
  bd.addEventListener('click', (e) => { if (e.target === bd) fermer(); });
  bd.querySelector('#dlg-annuler').addEventListener('click', fermer);
  bd.querySelector('#dlg-valider').addEventListener('click', valider);
  range.focus();
}

async function ajouterProjet() {
  const intitule = prompt('Intitulé du nouveau projet hors plan :');
  if (!intitule) return;
  await muter(() => M.creerProjetHorsPlan(intitule, []), 'Projet créé. Ouvre-le pour définir ses impacts.');
}
