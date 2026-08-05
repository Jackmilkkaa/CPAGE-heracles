-- ============================================================================
-- Héraclès Pilotage — Migration 0002 : version applicative
-- ============================================================================
-- PROPOSITION, à exécuter soi-même dans l'éditeur SQL Supabase (§5.3).
--
-- Pourquoi une table plutôt qu'un fetch direct vers GitHub depuis le
-- navigateur : le repo est privé (§4.2 du cadre SDF Lab), un fetch() anonyme
-- vers raw.githubusercontent.com échouerait silencieusement. Le numéro de
-- version et le changelog affichés dans l'appli passent donc par Supabase,
-- mis à jour par l'assistant à chaque release poussée sur GitHub.
-- ============================================================================

set search_path = heracles, public;

create table app_version (
  id int primary key default 1,
  version text not null,
  date_release date not null default current_date,
  changelog_extrait text,           -- dernière entrée du CHANGELOG.md, en clair
  changelog_url text,                -- lien vers le CHANGELOG.md sur GitHub (pour toi, pas pour un fetch())
  constraint app_version_singleton check (id = 1)
);

insert into app_version (id, version, changelog_extrait, changelog_url) values (
  1,
  '0.2.0',
  'Bouton Afficher/Masquer sur le mot de passe. Numéro de version cliquable en footer, changelog lu depuis Supabase (pas de fetch direct GitHub, repo privé).',
  'https://github.com/Jackmilkkaa/CPAGE-heracles/blob/main/CHANGELOG.md'
);

alter table app_version enable row level security;

grant select on app_version to authenticated;
grant update on app_version to authenticated;

create policy "app_version_lecture" on app_version for select to authenticated using (true);

create policy "app_version_maj_admin_seul" on app_version for update to authenticated
using (current_role_app() = 'admin')
with check (current_role_app() = 'admin');
