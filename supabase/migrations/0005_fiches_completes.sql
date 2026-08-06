-- ============================================================================
-- Héraclès Pilotage — Migration 0005 : contenu complet des fiches
-- ============================================================================
-- Remplace le besoin d'un lien vers un PDF externe : le texte complet de
-- chaque fiche (conviction et contexte non tronqués) vit directement dans
-- la base et s'affiche dans l'appli. Les objectifs et projets étaient déjà
-- intégralement en base, seule la conviction (punchline courte) et le
-- contexte (tronqué à 500 caractères) avaient été raccourcis à l'origine.
-- ============================================================================

set search_path = heracles, public;

alter table priorites
  add column conviction_complete text,
  add column contexte_complet text;

comment on column priorites.conviction_complete is 'Texte intégral de la conviction, non raccourci (conviction = punchline courte affichée en exergue, ce champ = version complète pour la fiche détaillée).';
comment on column priorites.contexte_complet is 'Texte intégral du contexte et enjeux, non tronqué (contexte = version à 500 caractères pour l''affichage compact).';
