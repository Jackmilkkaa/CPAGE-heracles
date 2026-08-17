-- ============================================================================
-- Héraclès Pilotage — Migration 0006 : pôles variabilisés
-- ============================================================================
-- Jusqu'ici, la liste des pôles (GAP, GEF, GRH, TEC, TRANSVERSES, DIRECTION)
-- était codée en dur dans le frontend. Ajouter un pôle nécessitait une
-- modification de code + un déploiement. Cette migration la fait passer en
-- base : ajout/retrait/renommage d'un pôle se fait désormais en SQL, sans
-- toucher au code.
-- ============================================================================

set search_path = heracles, public;

create table poles_disponibles (
  code text primary key,
  libelle text not null,
  ordre int not null default 0
);

alter table poles_disponibles enable row level security;

grant select on poles_disponibles to authenticated;
grant insert, update, delete on poles_disponibles to authenticated;

-- Lecture ouverte à tous les utilisateurs authentifiés (comme les autres
-- tables de référence du plan).
create policy "poles_lecture" on poles_disponibles for select to authenticated using (true);

-- Écriture réservée à l'admin : cette liste est une nomenclature partagée,
-- pas une donnée de pilotage courante. La faire gérer par un seul rôle évite
-- que plusieurs éditeurs créent des variantes du même pôle (ex. "GAP" et
-- "Gap" en doublon).
create policy "poles_ecriture_admin" on poles_disponibles for all to authenticated
using (current_role_app() = 'admin')
with check (current_role_app() = 'admin');

insert into poles_disponibles (code, libelle, ordre) values
  ('GAP', 'GAP', 1),
  ('GEF', 'GEF', 2),
  ('GRH', 'GRH', 3),
  ('TEC', 'TEC', 4),
  ('TRANSVERSES', 'Transverses', 5),
  ('DIRECTION', 'Direction', 6);
