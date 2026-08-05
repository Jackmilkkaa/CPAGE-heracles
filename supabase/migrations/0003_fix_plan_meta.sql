-- ============================================================================
-- Héraclès Pilotage — Migration 0003 : correctif plan_meta vide
-- ============================================================================
-- Bug : la migration 0001 créait la table plan_meta mais n'y insérait jamais
-- la ligne par défaut. Le seed faisait un UPDATE, qui sur une table vide ne
-- touche silencieusement aucune ligne. Résultat : plan_meta restait vide,
-- et .single() côté client renvoyait une erreur 406 "Cannot coerce the
-- result to a single JSON object" (aucune ligne à renvoyer).
-- ============================================================================

set search_path = heracles, public;

insert into plan_meta (id) values (1)
on conflict (id) do nothing;

-- Réapplique les valeurs de référence, maintenant que la ligne existe.
update plan_meta set
  plan = 'Héraclès',
  periode = '2025-2030',
  organisation = 'CPAGE',
  vision = 'La pérennité de notre système de santé passe par le développement d''un numérique maîtrisé au service de la performance individuelle et collective.',
  mission = 'Être le partenaire stratégique catalyseur d''efficience pour les établissements publics de santé.',
  ambition = 'Devenir LA référence des fonctions soutien reconnue et choisie par nos collaborateurs, adhérents et partenaires.',
  mode_calcul = 'moyenne_ponderee_kr'
where id = 1;
