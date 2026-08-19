# NOTES.md — Point d'état Héraclès Pilotage

Dernière mise à jour : 2026-08-17 (v0.11.0)

Ce fichier est destiné à permettre de reprendre le développement de cette
application dans une nouvelle conversation Claude, sans avoir à tout
réexpliquer. Donne l'URL du repo GitHub + ce fichier à Claude, ça suffit
pour repartir efficacement.

## C'est quoi ce projet

Application de suivi et de pilotage du plan stratégique Héraclès 2025-2030
de CPAGE (GIP éditeur de logiciels administratifs hospitaliers). Portage
d'un prototype local (un seul fichier HTML, sans base de données) vers une
version multi-utilisateurs connectée à Supabase, suivant le cadre
architectural "SDF Lab" (voir `SmartDevFactoryLab_Guidelines_Archi.md`,
normalement dans les fichiers du projet Claude).

## Stack

- **Frontend** : fichiers JS/HTML/CSS statiques, vanilla (pas de framework),
  déployés sur Cloudflare Workers (config dans `wrangler.jsonc`).
- **Backend** : Supabase (Postgres + Auth + RLS), projet "CPAGE-Pro",
  schéma dédié `heracles` (pas `public`).
- **CI/CD** : GitHub → Cloudflare, déploiement automatique à chaque push
  sur `main`.
- **Repo** : https://github.com/Jackmilkkaa/CPAGE-heracles (public)
- **URL app** : https://cpage-heracles.mycpage.workers.dev/

## Comment je (Claude) travaille sur ce projet

- Je n'ai pas d'accès direct à Supabase (pas de connecteur MCP branché côté
  organisation CPAGE à ce jour). Toute migration SQL doit être proposée
  en fichier, puis exécutée manuellement par Lionel dans le SQL Editor
  Supabase. **Toujours indiquer explicitement l'ordre d'exécution si
  plusieurs migrations sont liées.**
- J'ai accès à GitHub via un Personal Access Token que Lionel me donne en
  début de session (ne survit pas d'une conversation à l'autre). Je pousse
  le code moi-même après l'avoir testé.
- **Toute migration de schéma est testée avant livraison** : j'installe
  Postgres dans mon propre bac à sable, je rejoue la chaîne complète des
  migrations + seeds, et je simule les rôles (admin/éditeur/lecteur) avec
  des utilisateurs de test pour vérifier que les RLS se comportent comme
  prévu. Ça a permis de trouver plusieurs bugs réels avant qu'ils
  n'atteignent la prod (voir CHANGELOG.md pour le détail).
- Convention de versioning : `CHANGELOG.md` (Keep a Changelog + semver) et
  tags Git `vX.Y.Z` sur chaque commit poussé.
- Structure des fichiers migrations : `supabase/migrations/000N_*.sql`
  (schéma), `supabase/seed/*.sql` (données de référence).

## État fonctionnel actuel (v0.11.0)

Les 5 vues du prototype local sont portées et connectées à Supabase :
- **Vue d'ensemble** : radar (bascule axe 8 branches / priorité 24
  branches), jauges triables, avancement global centré dans l'en-tête,
  noms des 4 orientations en surimpression sur le radar par axe.
- **Par orientation** : sélecteur 4 tuiles, jauges des axes/priorités.
- **Par priorité** (drilldown, la plus riche) : radar des objectifs
  (labels complets), maxime/contexte visibles, fiche complète dépliable,
  projets en 3 colonnes (natifs PA / autres PA / hors plan) avec édition
  rapide statut+avancement, KR éditables par objectif, projets rattachés
  avec sélecteur d'impact (aucun/faible/moyen/fort), override manuel
  **au niveau objectif seulement**, champs narratifs, modal projet complet
  accessible en un clic.
- **Projets** : grille filtrable (recherche, pôle, statut, origine, PA,
  boussole), modal complet (métadonnées, dates, boussole annuelle,
  impacts sur les 24 PA en accordéon).
- **Synthèse chiffrée** : tableau tri/filtre/export CSV.

Navigation cliquable entre les vues (radar/jauges → détail priorité,
axe → orientation). Calcul d'avancement à dénominateur fixe (un objectif
sans KR ni projet actif compte "non renseigné", pas 0, mais un parent avec
des enfants non renseignés les compte à 0 dans son agrégation).

Rôles : `admin` (Lionel), `editeur`, `lecteur`, RLS testées à chaque
migration. Colonnes de référence du plan (intitulés, convictions officiels,
structure PA/objectifs) protégées contre modification par un éditeur, via
trigger — **attention, ce trigger a eu un bug de conception corrigé en
0007 (security definer faussait current_user), bien comprendre ce fix
avant de retoucher `protect_reference_columns()`.**

## Ce qui reste explicitement en attente (décisions de Lionel)

1. **Override et commentaire de pilotage au niveau priorité/axe/orientation**
   (pas juste objectif). Lionel veut tester l'existant avant qu'on l'ajoute.
2. **Mode Présentation** (bascule édition/présentation, agrandissement
   pour vidéoprojecteur, navigation clavier). Mis de côté, moins
   prioritaire pour l'instant.
3. **Domaine Cloudflare CPAGE** : Lionel devait vérifier si CPAGE a un
   domaine déjà géré chez Cloudflare pour remplacer l'URL `workers.dev`
   par quelque chose comme `heracles.cpage.fr`.
4. **Anti-pause Supabase** : le projet Supabase gratuit se met en pause
   après 7 jours d'inactivité. Option retenue à mettre en place : un ping
   automatique léger (GitHub Action programmée) plutôt que passer sur un
   plan payant. Pas encore fait.

## Deux enrichissements fonctionnels majeurs discutés, pas encore cadrés

### COPIL Projet
Idée : remonter dans l'appli les données clés de suivi de projet (coûts,
délais, charges, planning, décisions) que les chefs de projet produisent
aujourd'hui en PPTX, avec un historique dans le temps (pas un état
écrasé à chaque COPIL). Questions ouvertes posées à Lionel, jamais
tranchées : qui saisit (Lionel seul ou chefs de projet aussi) ? niveau de
confidentialité (tout visible au CODIR, ou distinction avec les notes
perso de Lionel) ? lien avec le curseur d'avancement actuel (rester
manuel et indépendant, recommandé, ou calculé depuis les données COPIL) ?

### OKR globaux
Lionel a des OKR d'entreprise déjà rédigés (non relus) à importer en
masse. Questions ouvertes : niveau architectural (nouvelle table à part,
ou fusion avec la structure existante des 24 PA) ? mode de suivi dans le
temps — collaboratif avec propriété par KR (nécessite une vraie notion de
propriétaire de ligne, chantier RLS non trivial) vs revue trimestrielle
groupée (plus simple, juste une vue "à réviser") ? Lionel n'a pas encore
tranché entre les deux.

## Réserve honnête à garder en tête

Je n'ai jamais eu d'accès réseau direct à Supabase depuis mon
environnement. Toutes les migrations sont testées contre un Postgres
local avec des tables `auth.users`/`auth.uid()` simulées à la main — très
fiable pour la logique SQL/RLS, mais **je n'ai jamais pu tester un seul
appel réseau réel depuis le frontend JS contre le vrai Supabase**. Les
bugs déjà trouvés en prod (plan_meta vide, découpage titre/description
des projets) sont venus de tests utilisateur réels, pas de mes propres
vérifications. Rester vigilant sur ce point pour toute nouvelle feature
touchant le frontend.
