// ============================================================================
// data.js — Chargement du plan complet depuis Supabase, assemblage en arbre.
//
// Choix : requêtes plates (une par table) + assemblage en JS, plutôt que
// l'embedding imbriqué de PostgREST (select avec relations en cascade).
// L'embedding imbriqué sur 4 niveaux avec une table de jonction à deux FK
// (impacts) est plus fragile à écrire correctement sans pouvoir le tester
// contre une vraie instance Supabase depuis cet environnement. Plus de code
// de glue ici, mais chaque requête est triviale et vérifiable isolément.
// ============================================================================
import { supabase } from './client.js';

export async function chargerPlanComplet() {
  const [
    { data: orientations, error: e1 },
    { data: axes, error: e2 },
    { data: priorites, error: e3 },
    { data: objectifs, error: e4 },
    { data: resultatsCles, error: e5 },
    { data: impacts, error: e6 },
    { data: projets, error: e7 },
    { data: planMeta, error: e8 },
    { data: poles, error: e9 },
  ] = await Promise.all([
    supabase.from('orientations').select('*').order('id'),
    supabase.from('axes').select('*').order('id'),
    supabase.from('priorites').select('*').order('numero'),
    supabase.from('objectifs').select('*'),
    supabase.from('resultats_cles').select('*'),
    supabase.from('impacts').select('*'),
    supabase.from('projets').select('*'),
    supabase.from('plan_meta').select('*').maybeSingle(),
    supabase.from('poles_disponibles').select('*').order('ordre'),
  ]);

  const firstError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8 || e9;
  if (firstError) throw firstError;

  return assemblerArbre({ orientations, axes, priorites, objectifs, resultatsCles, impacts, projets, planMeta, poles });
}

// Séparée de chargerPlanComplet() pour pouvoir être testée avec des données
// factices, sans dépendre du réseau ni de Supabase.
export function assemblerArbre({ orientations, axes, priorites, objectifs, resultatsCles, impacts, projets, planMeta, poles }) {
  const projetsById = new Map(projets.map(p => [p.id, p]));

  const impactsByObjectif = new Map();
  for (const im of impacts) {
    if (!impactsByObjectif.has(im.objectif_id)) impactsByObjectif.set(im.objectif_id, []);
    const projet = projetsById.get(im.projet_id);
    if (projet) impactsByObjectif.get(im.objectif_id).push({ poids: im.poids, projet });
  }

  const krByObjectif = new Map();
  for (const kr of resultatsCles) {
    if (!krByObjectif.has(kr.objectif_id)) krByObjectif.set(kr.objectif_id, []);
    krByObjectif.get(kr.objectif_id).push(kr);
  }

  const objectifsByPriorite = new Map();
  for (const obj of objectifs) {
    const enriched = {
      ...obj,
      resultats_cles: krByObjectif.get(obj.id) || [],
      impacts: impactsByObjectif.get(obj.id) || [],
    };
    if (!objectifsByPriorite.has(obj.priorite_id)) objectifsByPriorite.set(obj.priorite_id, []);
    objectifsByPriorite.get(obj.priorite_id).push(enriched);
  }
  for (const arr of objectifsByPriorite.values()) arr.sort((a, b) => a.numero_local - b.numero_local);

  const prioritesByAxe = new Map();
  for (const pa of priorites) {
    const enriched = { ...pa, objectifs: objectifsByPriorite.get(pa.id) || [] };
    if (!prioritesByAxe.has(pa.axe_id)) prioritesByAxe.set(pa.axe_id, []);
    prioritesByAxe.get(pa.axe_id).push(enriched);
  }
  for (const arr of prioritesByAxe.values()) arr.sort((a, b) => a.numero - b.numero);

  const axesByOrientation = new Map();
  for (const ax of axes) {
    const enriched = { ...ax, priorites: prioritesByAxe.get(ax.id) || [] };
    if (!axesByOrientation.has(ax.orientation_id)) axesByOrientation.set(ax.orientation_id, []);
    axesByOrientation.get(ax.orientation_id).push(enriched);
  }

  const orientationsEnrichies = orientations.map(o => ({
    ...o,
    axes: axesByOrientation.get(o.id) || [],
  }));

  // Listes plates, triées, utiles pour les futures vues (drilldown par PA, etc.)
  const toutesPriorites = [];
  for (const o of orientationsEnrichies) for (const ax of o.axes) for (const pa of ax.priorites) toutesPriorites.push(pa);
  toutesPriorites.sort((a, b) => a.numero - b.numero);

  const toutesAxes = [];
  for (const o of orientationsEnrichies) for (const ax of o.axes) toutesAxes.push({ ...ax, orientation_id: o.id, _orientation: o });

  return {
    orientations: orientationsEnrichies,
    axesPlats: toutesAxes,
    prioritesPlats: toutesPriorites,
    projetsPlats: projets,
    poles: poles || [],
    planMeta,
  };
}
