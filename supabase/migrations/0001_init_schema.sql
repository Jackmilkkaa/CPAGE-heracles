-- ============================================================================
-- Héraclès Pilotage — Migration initiale
-- Niveau de criticité : 2 (équipe restreinte, utilisateurs nommés)
-- ============================================================================
-- PROPOSITION, pas encore exécutée. À revoir puis lancer soi-même dans
-- l'éditeur SQL Supabase (§5.3 du cadre SDF Lab : migration structurante
-- proposée avant exécution, jamais appliquée silencieusement).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS + SCHÉMA DÉDIÉ
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- Héraclès vit dans son propre schéma, pas dans "public". Convention retenue
-- pour ce projet Supabase "CPAGE-Pro" : un schéma par application, afin que
-- plusieurs apps pro (Héraclès, Météo des adhérents plus tard...) cohabitent
-- sans collision de noms de tables ni de policies.
create schema if not exists heracles;
set search_path = heracles, public;

-- ----------------------------------------------------------------------------
-- 1. RÔLES ET PROFILS
-- ----------------------------------------------------------------------------
-- Un compte = un accès. Pas d'inscription publique (§4.4). Les comptes sont
-- créés nominativement par un admin (invitation Supabase Auth), puis le rôle
-- est attribué manuellement dans cette table.

create type app_role as enum ('admin', 'editeur', 'lecteur');

create table profils (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nom text,
  role app_role not null default 'lecteur',
  created_at timestamptz not null default now()
);

comment on table profils is 'Un profil par utilisateur Supabase Auth. Le rôle détermine les droits via les policies RLS ci-dessous.';

-- Création automatique d'un profil (rôle lecteur par défaut) à l'inscription.
-- Un admin doit ensuite monter le rôle manuellement (update profils set role = ...).
create function handle_new_user()
returns trigger as $$
begin
  insert into profils (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = heracles, public, auth;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Fonction utilitaire : rôle de l'utilisateur courant (utilisée dans les policies)
create function current_role_app()
returns app_role as $$
  select role from profils where id = auth.uid();
$$ language sql stable security definer set search_path = heracles, public;

alter table profils enable row level security;

create policy "profils_lecture_tous_authentifies"
on profils for select
to authenticated
using (true);

create policy "profils_maj_admin_seul"
on profils for update
to authenticated
using (current_role_app() = 'admin')
with check (current_role_app() = 'admin');

-- ----------------------------------------------------------------------------
-- 2. CONFIGURATION DU PLAN (une seule ligne)
-- ----------------------------------------------------------------------------
create table plan_meta (
  id int primary key default 1,
  plan text not null default 'Héraclès',
  periode text not null default '2025-2030',
  organisation text not null default 'CPAGE',
  vision text,
  mission text,
  ambition text,
  mode_calcul text not null default 'moyenne_ponderee_kr',
  constraint plan_meta_singleton check (id = 1)
);

alter table plan_meta enable row level security;

create policy "plan_meta_lecture_tous"
on plan_meta for select to authenticated using (true);

create policy "plan_meta_maj_admin_seul"
on plan_meta for update to authenticated
using (current_role_app() = 'admin')
with check (current_role_app() = 'admin');

-- ----------------------------------------------------------------------------
-- 3. STRUCTURE DU PLAN : orientations, axes, priorités, objectifs
-- ----------------------------------------------------------------------------
-- Ces tables mélangent volontairement deux natures de colonnes :
--   - colonnes de RÉFÉRENCE (intitulé, description officielle...) : protégées,
--     seul un admin peut les modifier (trigger protect_reference_columns).
--   - colonnes de PILOTAGE (poids, override, commentaire) : modifiables par
--     tout éditeur.
-- Un lecteur ne peut que lire, sur toutes les tables, sans exception.

create table orientations (
  id text primary key,               -- 'O1'..'O4'
  code text not null,
  intitule text not null,
  description text,
  poids numeric not null default 1,
  override_avancement numeric,
  commentaire_pilotage text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profils(id)
);

create table axes (
  id text primary key,               -- 'O1-A1'...
  orientation_id text not null references orientations(id),
  intitule text not null,
  poids numeric not null default 1,
  override_avancement numeric,
  updated_at timestamptz not null default now(),
  updated_by uuid references profils(id)
);

create table priorites (
  id text primary key,               -- 'PA01'...'PA24'
  numero int not null unique,
  axe_id text not null references axes(id),
  intitule text not null,
  pdf_filename text,
  conviction text,
  contexte text,
  poids numeric not null default 1,
  override_avancement numeric,
  commentaire_pilotage text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profils(id)
);

create table objectifs (
  id text primary key,               -- 'PA01-O1'...
  priorite_id text not null references priorites(id) on delete cascade,
  numero_local int not null,         -- O1, O2, O3... au sein de la PA
  intitule text not null,
  poids numeric not null default 1,
  override_avancement numeric,
  narratif_action text,
  resultats_attendus text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profils(id)
);

-- ----------------------------------------------------------------------------
-- 4. RÉSULTATS CLÉS (KR)
-- ----------------------------------------------------------------------------
-- Table purement pilotage, pas de colonne de référence à protéger.

create table resultats_cles (
  id uuid primary key default gen_random_uuid(),
  objectif_id text not null references objectifs(id) on delete cascade,
  intitule text,
  poids numeric not null default 1,
  valeur_initiale numeric default 0,
  valeur_cible numeric default 100,
  avancement_pct numeric not null default 0 check (avancement_pct between 0 and 100),
  unite text default 'pct',
  commentaire text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profils(id)
);

-- ----------------------------------------------------------------------------
-- 5. PROJETS ET ACTIONS CLÉS
-- ----------------------------------------------------------------------------
-- Mélange projets natifs du plan (origine = 'plan_v1', intitulé/description
-- protégés) et projets hors plan créés par des éditeurs (origine = 'hors_plan',
-- tout modifiable par les éditeurs, y compris intitulé/description).

create type projet_origine as enum ('plan_v1', 'hors_plan');
create type projet_statut as enum ('non_demarre', 'en_cours', 'realise', 'clos_partiel', 'abandonne');

create table projets (
  id text primary key,               -- 'PRJ001'... ou uuid pour les nouveaux hors plan
  intitule text not null default '',
  description text default '',
  origine projet_origine not null default 'hors_plan',
  pa_origine text references priorites(id),   -- null si hors plan sans PA de référence
  pole_responsable text,
  date_debut date,
  date_fin_prevue date,
  date_fin_reelle date,
  statut projet_statut not null default 'non_demarre',
  avancement_pct numeric not null default 0 check (avancement_pct between 0 and 100),
  commentaire text default '',
  boussole_annees int[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references profils(id),
  created_by uuid references profils(id)
);

comment on column projets.boussole_annees is 'Années où le CODIR a retenu ce projet comme priorité boussole. Tableau simple, ex: {2026,2027}.';

-- ----------------------------------------------------------------------------
-- 6. IMPACTS (mapping projet -> objectif, avec poids)
-- ----------------------------------------------------------------------------
-- Table de jonction. Purement pilotage : éditeurs peuvent créer/ajuster/retirer
-- librement (c'est le mécanisme de rattachement qu'on avait dans la v1 locale).

create table impacts (
  projet_id text not null references projets(id) on delete cascade,
  objectif_id text not null references objectifs(id) on delete cascade,
  poids int not null check (poids in (1, 2, 3)),   -- 1=faible, 2=moyen, 3=fort
  primary key (projet_id, objectif_id)
);

-- ----------------------------------------------------------------------------
-- 7. TRIGGER GÉNÉRIQUE : protection des colonnes de référence
-- ----------------------------------------------------------------------------
-- Un éditeur ne doit jamais pouvoir modifier le contenu officiel du plan
-- (intitulés, convictions, contextes...). Seul un admin le peut.
-- Pour les projets hors_plan, cette protection ne s'applique pas : l'éditeur
-- qui crée le projet en définit librement l'intitulé/description.

create function protect_reference_columns()
returns trigger as $$
begin
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
    -- La protection ne s'applique qu'aux projets natifs du plan.
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
$$ language plpgsql security definer set search_path = heracles, public, auth;

create trigger protect_ref_orientations before update on orientations
  for each row execute function protect_reference_columns();
create trigger protect_ref_axes before update on axes
  for each row execute function protect_reference_columns();
create trigger protect_ref_priorites before update on priorites
  for each row execute function protect_reference_columns();
create trigger protect_ref_objectifs before update on objectifs
  for each row execute function protect_reference_columns();
create trigger protect_ref_projets before update on projets
  for each row execute function protect_reference_columns();

-- ----------------------------------------------------------------------------
-- 8. TRIGGER GÉNÉRIQUE : horodatage + auteur de la dernière modification
-- ----------------------------------------------------------------------------
create function set_updated_meta()
returns trigger as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$ language plpgsql security definer set search_path = heracles, public, auth;

create trigger touch_orientations before update on orientations
  for each row execute function set_updated_meta();
create trigger touch_axes before update on axes
  for each row execute function set_updated_meta();
create trigger touch_priorites before update on priorites
  for each row execute function set_updated_meta();
create trigger touch_objectifs before update on objectifs
  for each row execute function set_updated_meta();
create trigger touch_resultats_cles before update on resultats_cles
  for each row execute function set_updated_meta();
create trigger touch_projets before update on projets
  for each row execute function set_updated_meta();

-- ----------------------------------------------------------------------------
-- 9. SECRETS APPLICATIFS (pattern §4.1) — admin seul
-- ----------------------------------------------------------------------------
create table app_secrets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. GRANTS — privilèges de base, avant RLS
-- ----------------------------------------------------------------------------
-- Sans ces GRANT, Postgres refuse la requête avant même d'évaluer les RLS
-- (erreur "permission denied for table ..."). RLS restreint ensuite quelles
-- LIGNES sont concernées, et le trigger protect_reference_columns() restreint
-- quelles COLONNES un éditeur peut réellement modifier.

grant usage on schema heracles to authenticated;
grant usage on schema public to authenticated;

grant select on profils, plan_meta, orientations, axes, priorites, objectifs,
  resultats_cles, projets, impacts to authenticated;

grant update on profils, plan_meta, orientations, axes, priorites, objectifs
  to authenticated;

grant insert, update, delete on resultats_cles, projets, impacts to authenticated;

grant select, insert, update, delete on app_secrets to authenticated;

-- ----------------------------------------------------------------------------
-- 11. RLS — activation + policies génériques (lecture tous, écriture éditeur+)
-- ----------------------------------------------------------------------------
alter table orientations enable row level security;
alter table axes enable row level security;
alter table priorites enable row level security;
alter table objectifs enable row level security;
alter table resultats_cles enable row level security;
alter table projets enable row level security;
alter table impacts enable row level security;

-- Lecture : tout utilisateur authentifié (admin, editeur, lecteur confondus)
create policy "orientations_lecture" on orientations for select to authenticated using (true);
create policy "axes_lecture" on axes for select to authenticated using (true);
create policy "priorites_lecture" on priorites for select to authenticated using (true);
create policy "objectifs_lecture" on objectifs for select to authenticated using (true);
create policy "resultats_cles_lecture" on resultats_cles for select to authenticated using (true);
create policy "projets_lecture" on projets for select to authenticated using (true);
create policy "impacts_lecture" on impacts for select to authenticated using (true);

-- Écriture : éditeur ou admin uniquement (le trigger protect_reference_columns
-- filtre ensuite plus finement quelles colonnes un éditeur peut réellement toucher)
create policy "orientations_ecriture" on orientations for update to authenticated
  using (current_role_app() in ('editeur', 'admin'))
  with check (current_role_app() in ('editeur', 'admin'));

create policy "axes_ecriture" on axes for update to authenticated
  using (current_role_app() in ('editeur', 'admin'))
  with check (current_role_app() in ('editeur', 'admin'));

create policy "priorites_ecriture" on priorites for update to authenticated
  using (current_role_app() in ('editeur', 'admin'))
  with check (current_role_app() in ('editeur', 'admin'));

create policy "objectifs_ecriture" on objectifs for update to authenticated
  using (current_role_app() in ('editeur', 'admin'))
  with check (current_role_app() in ('editeur', 'admin'));

create policy "resultats_cles_ecriture" on resultats_cles for all to authenticated
  using (current_role_app() in ('editeur', 'admin'))
  with check (current_role_app() in ('editeur', 'admin'));

create policy "projets_ecriture" on projets for all to authenticated
  using (current_role_app() in ('editeur', 'admin'))
  with check (current_role_app() in ('editeur', 'admin'));

create policy "impacts_ecriture" on impacts for all to authenticated
  using (current_role_app() in ('editeur', 'admin'))
  with check (current_role_app() in ('editeur', 'admin'));

-- app_secrets créée en section 9. RLS activé ici, avec le reste des tables.
alter table app_secrets enable row level security;

create policy "app_secrets_admin_seul"
on app_secrets for all to authenticated
using (current_role_app() = 'admin')
with check (current_role_app() = 'admin');

-- ============================================================================
-- Fin de la migration 0001. Rien n'insère de données ici : voir le script
-- de seed séparé (données de référence du plan uniquement, aucune saisie
-- de pilotage/test).
-- ============================================================================
