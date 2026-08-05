// ============================================================================
// calc.js — Calcul d'avancement, porté depuis le prototype local v1.
// Règle : dénominateur fixe. Un item non renseigné (null) compte pour 0 dans
// l'agrégation du niveau parent, mais reste affiché "nr" au niveau feuille.
// Override manuel toujours prioritaire, à tous les niveaux.
// ============================================================================

export function isProjetActif(prj) {
  if (!prj) return false;
  const s = prj.statut || 'non_demarre';
  return s !== 'non_demarre' && s !== 'abandonne';
}

export function getContributorsForObjectif(obj) {
  const contribs = [];
  for (const kr of (obj.resultats_cles || [])) {
    contribs.push({ type: 'kr', pct: kr.avancement_pct || 0, poids: kr.poids || 1 });
  }
  for (const im of (obj.impacts || [])) {
    if (isProjetActif(im.projet)) {
      contribs.push({ type: 'projet', pct: im.projet.avancement_pct || 0, poids: im.poids });
    }
  }
  return contribs;
}

function computeObjectifCalc(obj) {
  const contribs = getContributorsForObjectif(obj);
  if (contribs.length === 0) return null;
  let sum = 0, wsum = 0;
  for (const c of contribs) { sum += c.pct * c.poids; wsum += c.poids; }
  return wsum > 0 ? sum / wsum : null;
}

export function avancementObjectif(obj) {
  if (obj.override_avancement !== null && obj.override_avancement !== undefined) {
    return { value: obj.override_avancement, override: true, calc: computeObjectifCalc(obj) };
  }
  const c = computeObjectifCalc(obj);
  return { value: c, override: false, calc: c };
}

// Dénominateur fixe : un item sans valeur compte pour 0 dans la somme, mais
// pèse tout de même dans le total (poids), sauf si AUCUN item n'a de valeur
// (dans ce cas l'agrégat reste "non renseigné", pas 0).
function moyenneAvancements(items, getterFn) {
  if (!items || items.length === 0) return null;
  let sum = 0, wsum = 0, hasAnyValue = false;
  for (const it of items) {
    const av = getterFn(it);
    const w = it.poids || 1;
    if (av.value !== null && av.value !== undefined) {
      hasAnyValue = true;
      sum += av.value * w;
    }
    wsum += w;
  }
  if (!hasAnyValue) return null;
  return wsum > 0 ? sum / wsum : null;
}

export function avancementPriorite(pa) {
  const calc = moyenneAvancements(pa.objectifs, avancementObjectif);
  if (pa.override_avancement !== null && pa.override_avancement !== undefined) {
    return { value: pa.override_avancement, override: true, calc };
  }
  return { value: calc, override: false, calc };
}

export function avancementAxe(axe) {
  const calc = moyenneAvancements(axe.priorites, avancementPriorite);
  if (axe.override_avancement !== null && axe.override_avancement !== undefined) {
    return { value: axe.override_avancement, override: true, calc };
  }
  return { value: calc, override: false, calc };
}

export function avancementOrientation(orient) {
  const calc = moyenneAvancements(orient.axes, avancementAxe);
  if (orient.override_avancement !== null && orient.override_avancement !== undefined) {
    return { value: orient.override_avancement, override: true, calc };
  }
  return { value: calc, override: false, calc };
}

export function avancementGlobal(orientations) {
  return moyenneAvancements(orientations, avancementOrientation);
}

export function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return 'nr';
  return Math.round(v) + '%';
}

export function classAvancement(v) {
  if (v === null || v === undefined || isNaN(v)) return 'av-nc';
  if (v < 25) return 'av-rouge';
  if (v < 50) return 'av-orange';
  if (v < 75) return 'av-jaunevert';
  return 'av-vert';
}
