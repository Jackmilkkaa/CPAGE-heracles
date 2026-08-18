-- ============================================================================
-- Héraclès Pilotage — Migration 0007 : fix trigger protect_reference_columns
-- ============================================================================
-- Bug découvert en préparant la migration 0008 (et corrigé après un vrai
-- débogage, pas une supposition) : le trigger bloquait la correction
-- légitime des projets natifs même exécutée depuis le SQL Editor.
--
-- Cause réelle, en deux temps :
-- 1. La restriction "admin uniquement" ne doit s'appliquer qu'aux appels
--    applicatifs réels (rôle Postgres "authenticated", utilisé par
--    PostgREST/Supabase pour tout appel API), pas au SQL Editor ni aux
--    migrations. D'où l'ajout d'un bypass sur current_user.
-- 2. Ce bypass ne fonctionnait pas : la fonction était déclarée
--    "security definer", ce qui fait que current_user, À L'INTÉRIEUR de la
--    fonction, reflète le PROPRIÉTAIRE de la fonction (postgres), pas le
--    rôle de l'appelant réel. Un test direct hors trigger montrait bien
--    current_user = 'authenticated', mais dans le trigger lui-même,
--    current_user valait 'postgres' — le bypass se déclenchait donc
--    toujours, y compris pour un vrai éditeur via l'appli, ce qui aurait
--    neutralisé complètement la protection. Retiré security definer :
--    cette fonction n'a besoin d'aucun privilège élevé (elle ne fait que
--    lire TG_TABLE_NAME et appeler current_role_app(), qui gère déjà sa
--    propre élévation de privilège séparément).
-- ============================================================================

set search_path = heracles, public;

create or replace function protect_reference_columns()
returns trigger as $$
begin
  -- Seuls les appels applicatifs (rôle "authenticated", utilisé par
  -- PostgREST/Supabase pour tout appel API) sont concernés par cette
  -- protection. Le SQL Editor, les migrations, ou tout accès direct
  -- (rôle postgres, service_role...) la contournent nativement.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if current_role_app() = 'admin' then
    return new;
  end if;

  if TG_TABLE_NAME = 'orientations' then
    if new.intitule is distinct from old.intitule
       or new.description is distinct from old.description
       or new.code is distinct from old.code then
      raise exception 'Colonne de référence protégée : seul un admin peut modifier intitulé/description/code d''une orientation.';
    end if;

  elsif TG_TABLE_NAME = 'axes' then
    if new.intitule is distinct from old.intitule
       or new.orientation_id is distinct from old.orientation_id then
      raise exception 'Colonne de référence protégée sur les axes.';
    end if;

  elsif TG_TABLE_NAME = 'priorites' then
    if new.intitule is distinct from old.intitule
       or new.conviction is distinct from old.conviction
       or new.contexte is distinct from old.contexte
       or new.numero is distinct from old.numero
       or new.axe_id is distinct from old.axe_id then
      raise exception 'Colonne de référence protégée sur les priorités.';
    end if;

  elsif TG_TABLE_NAME = 'objectifs' then
    if new.intitule is distinct from old.intitule
       or new.priorite_id is distinct from old.priorite_id
       or new.numero_local is distinct from old.numero_local then
      raise exception 'Colonne de référence protégée sur les objectifs.';
    end if;

  elsif TG_TABLE_NAME = 'projets' then
    if old.origine = 'plan_v1' and (
      new.intitule is distinct from old.intitule
      or new.description is distinct from old.description
      or new.origine is distinct from old.origine
      or new.pa_origine is distinct from old.pa_origine
    ) then
      raise exception 'Colonne de référence protégée : ce projet est natif du plan officiel.';
    end if;
  end if;

  return new;
end;
$$ language plpgsql set search_path = heracles, public, auth;
