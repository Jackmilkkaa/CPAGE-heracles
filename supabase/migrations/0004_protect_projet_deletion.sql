-- ============================================================================
-- Héraclès Pilotage — Migration 0004 : protection suppression projets natifs
-- ============================================================================
-- Lacune identifiée en préparant la Vue Projets : le trigger existant
-- (protect_reference_columns) protège les colonnes de référence d'un projet
-- natif en UPDATE, mais rien n'empêchait un éditeur de le supprimer
-- purement et simplement via DELETE (la policy RLS "projets_ecriture" est
-- en FOR ALL, donc couvre aussi DELETE, sans distinction d'origine).
-- Un éditeur pourra toujours supprimer un projet hors_plan. Un projet natif
-- du plan (origine = 'plan_v1') ne peut être supprimé que par un admin.
-- ============================================================================

set search_path = heracles, public;

create function protect_projet_deletion()
returns trigger as $$
begin
  if old.origine = 'plan_v1' and current_role_app() <> 'admin' then
    raise exception 'Un projet natif du plan ne peut être supprimé que par un administrateur. Passe-le en statut "abandonné" à la place.';
  end if;
  return old;
end;
$$ language plpgsql security definer set search_path = heracles, public, auth;

create trigger protect_projet_delete before delete on projets
  for each row execute function protect_projet_deletion();
