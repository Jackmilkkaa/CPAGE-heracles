// ============================================================================
// vuePriorite.js — Vue par priorité (drilldown). La plus riche des vues :
// navigation entre les 24 PA, radar des objectifs, projets rattachés en 3
// colonnes (édition rapide statut/avancement), KR et impacts éditables par
// objectif, override manuel, champs narratifs.
//
// Simplification assumée pour cette première passe : l'édition complète
// d'un projet (dates, pôle responsable, description) n'est pas ici — elle
// arrivera avec la Vue Projets. Ici, seuls statut/avancement/impacts sont
// éditables en ligne, ce qui couvre l'essentiel de l'usage courant.
// ============================================================================
import { avancementObjectif, avancementPriorite, isProjetActif, fmtPct } from './calc.js';
import { renderRadar, renderGauges } from './radar.js';
import { escapeHtml } from './utils.js';
import * as M from './mutations.js';
import { ouvrirModalProjet } from './projetModal.js';

let planTree = null;
let onDataChanged = null;
let currentPrioriteId = null;

// Permet à d'autres vues (Vue d'ensemble, Par orientation) de naviguer
// directement vers une priorité précise avant de basculer sur cette vue.
export function irVersPriorite(prioriteId) {
  currentPrioriteId = prioriteId;
}

function scrollVersObjectif(objectifId) {
  const card = document.querySelector(`[data-objectif-id="${objectifId}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('objectif-highlight');
  setTimeout(() => card.classList.remove('objectif-highlight'), 1600);
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

export function renderVuePriorite(tree, onChanged) {
  planTree = tree;
  onDataChanged = onChanged;

  const slot = document.getElementById('view-slot');
  let currentIndex = planTree.prioritesPlats.findIndex(p => p.id === currentPrioriteId);
  if (currentIndex < 0) currentIndex = 0;
  const pa = planTree.prioritesPlats[currentIndex];
  currentPrioriteId = pa ? pa.id : null;
  if (!pa) { slot.innerHTML = '<p>Aucune priorité.</p>'; return; }

  const axe = planTree.axesPlats.find(a => a.id === pa.axe_id);
  const orient = axe ? axe._orientation : null;
  const av = avancementPriorite(pa);

  const options = planTree.prioritesPlats.map((p, i) =>
    `<option value="${i}" ${i === currentIndex ? 'selected' : ''}>#${p.numero} · ${escapeHtml(p.intitule.substring(0, 90))}${p.intitule.length > 90 ? '…' : ''}</option>`
  ).join('');

  slot.innerHTML = `
    <div class="pa-nav">
      <button class="pa-nav-arrow" id="pa-prev" ${currentIndex === 0 ? 'disabled' : ''} aria-label="Précédent">◀</button>
      <select id="pa-select">${options}</select>
      <button class="pa-nav-arrow" id="pa-next" ${currentIndex === planTree.prioritesPlats.length - 1 ? 'disabled' : ''} aria-label="Suivant">▶</button>
    </div>

    <div class="pa-header">
      <div class="pa-flex">
        <div class="pa-num">#${pa.numero}</div>
        <div>
          <div class="pa-titre">${escapeHtml(pa.intitule)}</div>
          <div class="pa-badges">
            ${orient ? `<span class="badge orient">${escapeHtml(orient.id)} · ${escapeHtml(orient.intitule)}</span>` : ''}
            ${axe ? `<span class="badge axe">${escapeHtml(axe.intitule)}</span>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="pa-main-grid">
      <div class="pa-info-col">
        <div class="pa-info-avancement">
          <div class="objectif-avancement ${av.value === null ? 'nc' : ''}">${fmtPct(av.value)}</div>
          <div class="pa-info-avancement-label">Avancement de la priorité</div>
          ${av.override ? `<div class="calc-note">manuel · calc ${fmtPct(av.calc)}</div>` : ''}
        </div>
        ${pa.conviction ? `<div class="pa-conviction">« ${escapeHtml(pa.conviction)} »</div>` : ''}
        ${pa.contexte ? `<div class="pa-contexte-inline"><h5>Contexte et enjeux</h5><p>${escapeHtml(pa.contexte)}</p></div>` : ''}
        ${(pa.conviction_complete || pa.contexte_complet) ? `
        <div>
          <button class="btn btn-mini btn-light" id="btn-fiche-complete" style="width:100%">📄 Lire la fiche complète</button>
          <div id="fiche-complete-panel" class="pa-contexte-inline" hidden style="margin-top:8px">
            ${pa.conviction_complete ? `<h5>Conviction</h5><p>${escapeHtml(pa.conviction_complete)}</p>` : ''}
            ${pa.contexte_complet ? `<h5 style="margin-top:12px">Contexte et enjeux (intégral)</h5><p>${escapeHtml(pa.contexte_complet)}</p>` : ''}
          </div>
        </div>` : ''}
      </div>
      <div class="pa-radar-col card">
        <div class="card-title">Objectifs de la priorité</div>
        <div class="radar-container" id="pa-radar-slot"></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="card-title">Projets et actions clés</div>
      <div id="pa-projets-slot"></div>
    </div>

    <div class="objectifs-list" id="objectifs-slot"></div>
  `;

  document.getElementById('pa-prev').addEventListener('click', () => { currentPrioriteId = planTree.prioritesPlats[currentIndex - 1].id; renderVuePriorite(planTree, onDataChanged); });
  document.getElementById('pa-next').addEventListener('click', () => { currentPrioriteId = planTree.prioritesPlats[currentIndex + 1].id; renderVuePriorite(planTree, onDataChanged); });
  document.getElementById('pa-select').addEventListener('change', (e) => { currentPrioriteId = planTree.prioritesPlats[parseInt(e.target.value)].id; renderVuePriorite(planTree, onDataChanged); });

  const ficheBtn = document.getElementById('btn-fiche-complete');
  if (ficheBtn) {
    ficheBtn.addEventListener('click', () => {
      const panel = document.getElementById('fiche-complete-panel');
      panel.hidden = !panel.hidden;
    });
  }

  const objs = pa.objectifs;
  if (objs.length >= 3) {
    const items = objs.map((o, i) => {
      const a2 = avancementObjectif(o);
      return { label: 'O' + (i + 1), fullLabel: o.intitule, code: o.id, title: o.intitule, value: a2.value, override: a2.override, onClick: () => scrollVersObjectif(o.id) };
    });
    renderRadar('pa-radar-slot', items, 'Objectifs de la priorité #' + pa.numero);
  } else {
    document.getElementById('pa-radar-slot').innerHTML = '<div class="gauge-list" id="pa-radar-fallback"></div>';
    const items = objs.map((o, i) => {
      const a2 = avancementObjectif(o);
      return { label: 'O' + (i + 1), code: o.id, title: o.intitule, value: a2.value, override: a2.override, onClick: () => scrollVersObjectif(o.id) };
    });
    renderGauges('pa-radar-fallback', items);
  }

  renderPaProjets(pa);
  renderObjectifsList(pa);
}

function renderPaProjets(pa) {
  const natifs = planTree.projetsPlats.filter(p => p.pa_origine === pa.id && p.origine === 'plan_v1');
  const transverses = planTree.projetsPlats.filter(p =>
    p.origine === 'plan_v1' && p.pa_origine !== pa.id &&
    pa.objectifs.some(o => (o.impacts || []).some(im => im.projet.id === p.id && im.poids > 0))
  );
  const horsPlan = planTree.projetsPlats.filter(p =>
    p.origine === 'hors_plan' &&
    pa.objectifs.some(o => (o.impacts || []).some(im => im.projet.id === p.id && im.poids > 0))
  );

  const col = (title, projets, subtitle, addBtn) => `
    <div class="pa-projets-col">
      <div class="pa-projets-col-header"><span>${title}</span><span class="pa-projets-col-count">${projets.length}</span></div>
      ${subtitle ? `<div class="pa-projets-col-subtitle">${subtitle}</div>` : ''}
      <div class="pa-projets-col-body">
        ${projets.length === 0 ? '<div class="contribs-empty" style="padding:8px">Aucun.</div>' : projets.map(renderProjetCardInline).join('')}
      </div>
      ${addBtn ? `<div class="pa-projets-col-footer">${addBtn}</div>` : ''}
    </div>
  `;

  document.getElementById('pa-projets-slot').innerHTML = `
    <div class="pa-projets-3col">
      ${col('Projets du plan de cette PA', natifs, null, null)}
      ${col('Projets du plan d\u2019autres PA', transverses, 'Impactent au moins un objectif de cette PA', null)}
      ${col('Projets hors plan', horsPlan, 'Créés en dehors du plan initial', `<button class="btn btn-mini btn-light" style="width:100%" data-add-hors-plan="${pa.id}">+ Ajouter un projet hors plan</button>`)}
    </div>
  `;

  wireProjetCardsInline(document.getElementById('pa-projets-slot'));

  const addBtn = document.querySelector('[data-add-hors-plan]');
  if (addBtn) addBtn.addEventListener('click', () => ajouterProjetHorsPlan(pa));
}

function renderProjetCardInline(prj) {
  const st = prj.statut || 'non_demarre';
  const av = prj.avancement_pct || 0;
  const paOrig = prj.pa_origine ? planTree.prioritesPlats.find(p => p.id === prj.pa_origine) : null;
  return `
    <div class="projet-card-inline" data-projet-id="${prj.id}">
      <div class="pci-title" data-open-modal="${prj.id}" style="cursor:pointer" title="Cliquer pour ouvrir le détail complet">${escapeHtml(prj.intitule || '(sans titre)')}
        ${paOrig ? `<span class="projet-transverse-tag">natif #${paOrig.numero}</span>` : ''}
        ${prj.origine === 'hors_plan' ? '<span class="projet-transverse-tag">hors plan</span>' : ''}
      </div>
      <div class="pci-controls">
        <button class="statut-pill ${st}" data-cycle-statut="${prj.id}" title="Clic pour changer d'état">${labelStatut(st)}</button>
        <div class="pci-slider">
          <input type="range" min="0" max="100" step="1" value="${av}" data-slider-avancement="${prj.id}">
          <span class="pci-value" data-slider-value="${prj.id}">${av}%</span>
        </div>
        <button class="btn btn-mini btn-light" data-open-modal="${prj.id}">Détails</button>
      </div>
    </div>
  `;
}

function labelStatut(code) {
  return { non_demarre: 'Non démarré', en_cours: 'En cours', realise: 'Réalisé', clos_partiel: 'Clos partiel', abandonne: 'Abandonné' }[code] || code;
}

function wireProjetCardsInline(root) {
  root.querySelectorAll('[data-open-modal]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      ouvrirModalProjet(el.dataset.openModal, planTree, onDataChanged);
    });
  });
  root.querySelectorAll('[data-cycle-statut]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.cycleStatut;
      const prj = planTree.projetsPlats.find(p => p.id === id);
      const order = ['non_demarre', 'en_cours', 'realise', 'clos_partiel', 'abandonne'];
      const next = order[(order.indexOf(prj.statut || 'non_demarre') + 1) % order.length];
      muter(() => M.updateProjet(id, { statut: next }));
    });
  });
  root.querySelectorAll('[data-slider-avancement]').forEach(input => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => {
      const id = input.dataset.sliderAvancement;
      muter(() => M.updateProjet(id, { avancement_pct: parseInt(input.value) }));
    });
    input.addEventListener('input', () => {
      const id = input.dataset.sliderAvancement;
      const val = document.querySelector(`[data-slider-value="${id}"]`);
      if (val) val.textContent = input.value + '%';
    });
  });
}

async function ajouterProjetHorsPlan(pa) {
  const intitule = prompt('Intitulé du nouveau projet hors plan :');
  if (!intitule) return;
  const impactsInitiaux = pa.objectifs.map(o => ({ objectif_id: o.id, poids: 2 }));
  await muter(() => M.creerProjetHorsPlan(intitule, impactsInitiaux), 'Projet créé et rattaché à cette PA.');
}

function renderObjectifsList(pa) {
  const slot = document.getElementById('objectifs-slot');
  slot.innerHTML = pa.objectifs.map((obj, i) => renderObjectifCard(pa, obj, i)).join('');
  pa.objectifs.forEach(obj => wireObjectifCard(pa, obj));
}

function renderObjectifCard(pa, obj, idx) {
  const av = avancementObjectif(obj);
  const linked = (obj.impacts || []).slice().sort((a, b) => a.projet.id.localeCompare(b.projet.id));
  const actifs = linked.filter(im => isProjetActif(im.projet)).length;

  return `
    <div class="objectif-card" data-objectif-id="${obj.id}">
      <div class="objectif-header">
        <div class="objectif-title">O${idx + 1} · ${escapeHtml(obj.intitule)}</div>
        <div class="objectif-header-right">
          <span class="objectif-mini-stat" title="Résultats clés">🎯 ${(obj.resultats_cles || []).length}</span>
          <span class="objectif-mini-stat" title="Projets rattachés, actifs sur total">📁 ${actifs}/${linked.length}</span>
          <div class="objectif-avancement ${av.value === null ? 'nc' : ''}">${fmtPct(av.value)}
            ${av.override ? `<span class="calc-note">manuel · calc ${fmtPct(av.calc)}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="contribs-two-col">
        <div>
          <h5>Résultats clés <span style="background:var(--gris-tres-clair); color:var(--gris-fonce); padding:1px 6px; border-radius:10px; font-size:0.65rem">${(obj.resultats_cles || []).length}</span></h5>
          <div class="kr-list" data-kr-list="${obj.id}">
            ${(obj.resultats_cles || []).length === 0 ? '<div class="contribs-empty">Aucun résultat clé.</div>' : obj.resultats_cles.map(kr => renderKrRow(kr)).join('')}
          </div>
          <div style="margin-top:8px"><button class="btn btn-mini btn-light" data-add-kr="${obj.id}">+ Ajouter un résultat clé</button></div>
        </div>
        <div>
          <h5>Projets rattachés <span style="background:var(--gris-tres-clair); color:var(--gris-fonce); padding:1px 6px; border-radius:10px; font-size:0.65rem" title="${actifs} actif(s) sur ${linked.length}">${actifs}/${linked.length}</span></h5>
          <div data-contribs="${obj.id}">${renderContribs(pa, obj, linked)}</div>
          <div style="margin-top:8px"><button class="btn btn-mini btn-light" data-rattacher="${obj.id}">+ Rattacher un projet</button></div>
        </div>
      </div>

      <div class="override-panel" data-override-panel="${obj.id}">${renderOverridePanel(obj, av)}</div>

      <div class="narrative-fields">
        <label>Ce qui est mené / narratif d'action</label>
        <textarea data-narratif="${obj.id}">${escapeHtml(obj.narratif_action || '')}</textarea>
        <label>Résultats attendus / cible qualitative</label>
        <textarea data-attendus="${obj.id}">${escapeHtml(obj.resultats_attendus || '')}</textarea>
      </div>
    </div>
  `;
}

function renderKrRow(kr) {
  return `
    <div class="kr-row" data-kr-id="${kr.id}">
      <div class="kr-content">
        <input type="text" class="kr-title-input" value="${escapeHtml(kr.intitule || '')}" placeholder="Intitulé du résultat clé" data-kr-titre="${kr.id}">
        <div class="kr-controls">
          <div class="kr-slider"><input type="range" min="0" max="100" step="1" value="${kr.avancement_pct || 0}" data-kr-slider="${kr.id}"></div>
          <div class="kr-value" data-kr-value="${kr.id}">${kr.avancement_pct || 0}%</div>
        </div>
      </div>
      <button class="btn btn-mini btn-danger" data-kr-delete="${kr.id}" title="Supprimer">✕</button>
    </div>
  `;
}

function renderContribs(pa, obj, linked) {
  if (linked.length === 0) return '<div class="contribs-empty">Aucun projet rattaché.</div>';
  return linked.map(im => {
    const prj = im.projet;
    const active = isProjetActif(prj);
    const paOrig = prj.pa_origine ? planTree.prioritesPlats.find(p => p.id === prj.pa_origine) : null;
    const isTransverse = paOrig && paOrig.id !== pa.id;
    const rowCls = prj.origine === 'hors_plan' ? 'hors-plan' : (isTransverse ? 'transverse' : '');
    return `
      <div class="contrib-projet-row ${rowCls}${active ? '' : ' inactive'}">
        <div>
          <div class="cp-title">${escapeHtml(prj.intitule || '(sans titre)')}</div>
          <div class="cp-meta">
            <span class="statut-pill ${prj.statut || 'non_demarre'}">${labelStatut(prj.statut || 'non_demarre')}</span>
            <span class="cp-av">${prj.avancement_pct || 0}%</span>
            ${!active ? '<span class="cp-pending">en attente</span>' : ''}
            ${isTransverse && paOrig ? `<span class="cp-tag">natif #${paOrig.numero}</span>` : ''}
          </div>
        </div>
        <div class="impact-selector">
          ${[0, 1, 2, 3].map(p => `<button data-poids="${p}" class="${p === im.poids ? 'selected' : ''}" data-set-impact="${prj.id}|${obj.id}|${p}">${['—', 'F', 'M', '++'][p]}</button>`).join('')}
        </div>
        <button class="cp-details" data-open-modal="${prj.id}">Détails</button>
      </div>
    `;
  }).join('');
}

function renderOverridePanel(entity, av) {
  const has = entity.override_avancement !== null && entity.override_avancement !== undefined;
  return `
    <label>
      <input type="checkbox" ${has ? 'checked' : ''} data-override-toggle="${entity.id}" data-override-fallback="${av.calc === null ? 50 : Math.round(av.calc)}">
      Forcer l'avancement manuellement
    </label>
    ${has ? `
      <div class="override-controls">
        <input type="number" min="0" max="100" step="1" value="${entity.override_avancement}" data-override-value="${entity.id}"> %
      </div>
      <div style="font-size:var(--fs-xs); color:var(--gris-moyen); margin-top:4px">Valeur calculée : ${fmtPct(av.calc)}</div>
    ` : ''}
  `;
}

function wireObjectifCard(pa, obj) {
  const card = document.querySelector(`[data-objectif-id="${obj.id}"]`);
  if (!card) return;

  card.querySelectorAll('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      ouvrirModalProjet(btn.dataset.openModal, planTree, onDataChanged);
    });
  });

  card.querySelectorAll('[data-kr-slider]').forEach(input => {
    input.addEventListener('input', () => {
      const val = document.querySelector(`[data-kr-value="${input.dataset.krSlider}"]`);
      if (val) val.textContent = input.value + '%';
    });
    input.addEventListener('change', () => {
      muter(() => M.updateResultatCle(input.dataset.krSlider, { avancement_pct: parseInt(input.value) }));
    });
  });
  card.querySelectorAll('[data-kr-titre]').forEach(input => {
    input.addEventListener('change', () => {
      muter(() => M.updateResultatCle(input.dataset.krTitre, { intitule: input.value }));
    });
  });
  card.querySelectorAll('[data-kr-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Supprimer ce résultat clé ?')) return;
      muter(() => M.deleteResultatCle(btn.dataset.krDelete));
    });
  });
  const addKrBtn = card.querySelector('[data-add-kr]');
  if (addKrBtn) addKrBtn.addEventListener('click', () => muter(() => M.addResultatCle(addKrBtn.dataset.addKr)));

  card.querySelectorAll('[data-set-impact]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [projetId, objectifId, poids] = btn.dataset.setImpact.split('|');
      muter(() => M.setImpact(projetId, objectifId, parseInt(poids)));
    });
  });

  const rattacherBtn = card.querySelector('[data-rattacher]');
  if (rattacherBtn) rattacherBtn.addEventListener('click', () => ouvrirPickerRattachement(obj));

  const overrideToggle = card.querySelector('[data-override-toggle]');
  if (overrideToggle) {
    overrideToggle.addEventListener('change', () => {
      const val = overrideToggle.checked ? parseInt(overrideToggle.dataset.overrideFallback) : null;
      muter(() => M.updateObjectif(overrideToggle.dataset.overrideToggle, { override_avancement: val }));
    });
  }
  const overrideValue = card.querySelector('[data-override-value]');
  if (overrideValue) {
    overrideValue.addEventListener('change', () => {
      muter(() => M.updateObjectif(overrideValue.dataset.overrideValue, { override_avancement: parseInt(overrideValue.value) }));
    });
  }

  const narratif = card.querySelector('[data-narratif]');
  if (narratif) narratif.addEventListener('change', () => muter(() => M.updateObjectif(narratif.dataset.narratif, { narratif_action: narratif.value })));
  const attendus = card.querySelector('[data-attendus]');
  if (attendus) attendus.addEventListener('change', () => muter(() => M.updateObjectif(attendus.dataset.attendus, { resultats_attendus: attendus.value })));
}

function ouvrirPickerRattachement(obj) {
  const dejaLies = new Set((obj.impacts || []).filter(im => im.poids > 0).map(im => im.projet.id));
  const candidats = planTree.projetsPlats.filter(p => !dejaLies.has(p.id));

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'picker-modal';
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

  backdrop.innerHTML = `
    <div class="modal-panel" style="max-width:640px">
      <div class="modal-header">
        <h3>Rattacher un projet</h3>
        <button class="modal-close" id="picker-close">✕</button>
      </div>
      <div class="modal-body">
        <input type="search" id="picker-search" placeholder="Rechercher..." style="width:100%; padding:8px 12px; border:1px solid var(--gris-clair); border-radius:3px; margin-bottom:12px">
        <div id="picker-results" style="max-height:60vh; overflow-y:auto"></div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  document.getElementById('picker-close').addEventListener('click', () => backdrop.remove());

  function renderResults(filter) {
    const q = (filter || '').toLowerCase();
    const filtered = candidats.filter(p => !q || (p.intitule || '').toLowerCase().includes(q)).slice(0, 80);
    document.getElementById('picker-results').innerHTML = filtered.map(p => `
      <div style="padding:10px; border-bottom:1px solid var(--gris-tres-clair); display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center">
        <div style="font-size:var(--fs-sm)">${escapeHtml(p.intitule || '(sans titre)')}</div>
        <div class="impact-selector">
          ${[1, 2, 3].map(poids => `<button data-pick="${p.id}|${poids}">${['', 'Faible', 'Moyen', 'Fort'][poids]}</button>`).join('')}
        </div>
      </div>
    `).join('') || '<p style="padding:12px; color:var(--gris-moyen)">Aucun résultat.</p>';

    document.querySelectorAll('[data-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [projetId, poids] = btn.dataset.pick.split('|');
        backdrop.remove();
        muter(() => M.setImpact(projetId, obj.id, parseInt(poids)), 'Projet rattaché.');
      });
    });
  }
  renderResults('');
  document.getElementById('picker-search').addEventListener('input', (e) => renderResults(e.target.value));
}
