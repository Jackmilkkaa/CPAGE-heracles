// ============================================================================
// mutations.js — Écritures Supabase (KR, projets, impacts, priorités,
// objectifs). Chaque fonction lance une erreur en cas d'échec (RLS refusée,
// contrainte violée, etc.), à charge de l'appelant de l'afficher proprement.
// ============================================================================
import { supabase } from './client.js';

export async function updatePriorite(id, champs) {
  const { error } = await supabase.from('priorites').update(champs).eq('id', id);
  if (error) throw error;
}

export async function updateObjectif(id, champs) {
  const { error } = await supabase.from('objectifs').update(champs).eq('id', id);
  if (error) throw error;
}

export async function updateProjet(id, champs) {
  const { error } = await supabase.from('projets').update(champs).eq('id', id);
  if (error) throw error;
}

export async function addResultatCle(objectifId) {
  const { data, error } = await supabase
    .from('resultats_cles')
    .insert({ objectif_id: objectifId, intitule: '', avancement_pct: 0, poids: 1 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateResultatCle(id, champs) {
  const { error } = await supabase.from('resultats_cles').update(champs).eq('id', id);
  if (error) throw error;
}

export async function deleteResultatCle(id) {
  const { error } = await supabase.from('resultats_cles').delete().eq('id', id);
  if (error) throw error;
}

// poids = 0 retire le lien (delete), sinon upsert (insert ou update du poids)
export async function setImpact(projetId, objectifId, poids) {
  if (poids === 0) {
    const { error } = await supabase.from('impacts').delete().eq('projet_id', projetId).eq('objectif_id', objectifId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('impacts')
      .upsert({ projet_id: projetId, objectif_id: objectifId, poids }, { onConflict: 'projet_id,objectif_id' });
    if (error) throw error;
  }
}

export async function creerProjetHorsPlan(intitule, impactsInitiaux) {
  const id = 'PRJX-' + crypto.randomUUID().slice(0, 8);
  const { error } = await supabase.from('projets').insert({ id, intitule, origine: 'hors_plan' });
  if (error) throw error;
  for (const im of impactsInitiaux || []) {
    await setImpact(id, im.objectif_id, im.poids);
  }
  return id;
}
