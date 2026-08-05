# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Convention : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) + [semver](https://semver.org/lang/fr/).

## [0.5.0] - 2026-08-05

### Ajouté
- Vue par priorité (drilldown), la plus riche des vues : navigation entre
  les 24 PA (flèches + liste déroulante), radar des objectifs (labels
  complets), maxime et contexte visibles, avancement en gros chiffre.
- Projets et actions clés en 3 colonnes (natifs de la PA / autres PA
  transverses / hors plan), édition rapide du statut (clic pour cycler) et
  de l'avancement (curseur), création de projet hors plan.
- Par objectif : résultats clés éditables (ajout/suppression/curseur/
  intitulé), projets rattachés avec sélecteur d'impact (aucun/faible/moyen/
  fort), picker de rattachement avec recherche, override manuel, champs
  narratifs (action menée, résultats attendus).
- Modules `mutations.js` (écritures Supabase) et `vuePriorite.js`.
- Après chaque écriture, rechargement complet des données puis nouveau
  rendu de la vue courante — plus simple et plus sûr qu'une mise à jour
  locale fine de l'arbre en mémoire, au prix d'un aller-retour réseau par
  modification.

### Non couvert dans cette passe
- Édition complète d'un projet (dates, pôle responsable, description) :
  prévue avec la Vue Projets à venir. Ici, seuls statut/avancement/impacts
  sont éditables en ligne.
- Tag boussole annuelle : pas encore repris dans cette version connectée.

## [0.4.0] - 2026-08-05

### Ajouté
- Navigation entre vues (barre `.view-nav`) : Vue d'ensemble / Par orientation.
- Vue par orientation : sélecteur à 4 tuiles (code, intitulé, avancement),
  description de l'orientation sélectionnée, jauges des axes et des
  priorités de cette orientation.
- Les données du plan ne sont chargées qu'une fois par session (au login),
  la navigation entre vues re-rend depuis l'arbre déjà en mémoire, sans
  nouvelle requête Supabase.

## [0.3.1] - 2026-08-05

### Corrigé
- `plan_meta` restait vide : la migration 0001 créait la table sans y
  insérer de ligne, et le seed faisait un `UPDATE` qui, sur une table vide,
  ne touche silencieusement aucune ligne (0 erreur, 0 ligne modifiée).
  Résultat : `.single()` côté client échouait avec une erreur 406
  ("Cannot coerce the result to a single JSON object"), qui a bloqué le
  chargement de toute la Vue d'ensemble. Migration `0003_fix_plan_meta.sql`
  ajoutée (insert idempotent), et le seed passe désormais par un
  `insert ... on conflict do update` au lieu d'un simple `update`, pour ne
  plus jamais dépendre d'une ligne préexistante.
- `data.js` utilise `.maybeSingle()` plutôt que `.single()` sur `plan_meta` :
  si cette ligne venait à manquer à nouveau, le bandeau vision/mission/
  ambition serait simplement absent, plutôt que de faire échouer toute la
  vue.

## [0.3.0] - 2026-08-05

### Ajouté
- Vue d'ensemble complète, branchée sur Supabase : bandeau vision/mission/
  ambition, radar SVG avec bascule par priorité (24 branches) / par axe (8
  branches), jauges en barres avec tri par numéro ou par avancement.
- Modules `calc.js` (calcul d'avancement, dénominateur fixe, override
  manuel), `radar.js` (rendu SVG radar + jauges), `data.js` (chargement
  Supabase en requêtes plates + assemblage en arbre), `utils.js`.
- Logique de calcul et d'assemblage testée unitairement avec des données
  factices avant intégration (voir historique de dev) : contributions KR +
  projets actifs, dénominateur fixe à chaque niveau d'agrégation, override
  manuel prioritaire.

### Modifié
- `main` ne fixe plus de largeur globale ; `.login-screen` reste étroit,
  `.content-screen` s'élargit jusqu'à 1300px pour accueillir le radar et les
  jauges côte à côte.

## [0.2.2] - 2026-08-05

### Corrigé
- Footer positionné en fixe en bas à droite de la fenêtre, au lieu d'être
  simplement aligné à droite dans la colonne centrale de contenu (donnait
  l'impression d'être mal placé sur un écran large).
- Champs email et mot de passe de l'écran de connexion sans attribut `name` :
  invisibles pour certains gestionnaires de mots de passe (KeePass notamment),
  qui s'appuient sur `name` en plus de `autocomplete` pour proposer les
  identifiants déjà enregistrés.

## [0.2.1] - 2026-08-05

### Modifié
- Le footer lit désormais le changelog en direct depuis `CHANGELOG.md` sur
  GitHub (`raw.githubusercontent.com`), plutôt que depuis la table Supabase
  `heracles.app_version`. Ce chemin n'était pas viable tant que le repo était
  privé (fetch anonyme bloqué), il l'est devenu depuis que le repo est passé
  public. La table `app_version` reste en base mais n'est plus utilisée par
  le frontend ; à supprimer dans une prochaine migration si on ne s'en sert
  plus.

## [0.2.0] - 2026-08-05

### Ajouté
- Bouton Afficher/Masquer sur le champ mot de passe de l'écran de connexion.
- Numéro de version cliquable en footer, avec changelog résumé. Lu depuis une
  table Supabase (`heracles.app_version`), pas via un `fetch()` direct vers
  GitHub : le repo est privé, ce chemin échouerait silencieusement (§4.2 du
  cadre SDF Lab). La table est mise à jour à chaque release poussée.
- Migration `0002_app_version.sql`.

## [0.1.1] - 2026-08-05

### Corrigé
- L'écran de connexion restait visible après authentification réussie.
  `.login-screen` avait un `display: flex` qui l'emportait sur l'attribut
  `hidden` posé en JS (une règle CSS d'auteur bat toujours la règle par
  défaut du navigateur pour `[hidden]`, quel que soit l'ordre dans le
  fichier). Ajout d'une règle globale `[hidden] { display: none !important; }`.

## [0.1.0] - 2026-08-04

### Ajouté
- Schéma initial Supabase : profils/rôles (admin, éditeur, lecteur), structure du
  plan (orientations, axes, priorités, objectifs), résultats clés, projets et
  actions clés, mapping d'impacts projet → objectif.
- RLS sur toutes les tables : lecture ouverte aux utilisateurs authentifiés,
  écriture réservée éditeur/admin, colonnes de référence du plan protégées
  (admin seul), pattern `app_secrets` pour les secrets applicatifs.
- Seed de données de référence du plan stratégique Héraclès v1.0 (24 priorités,
  103 objectifs, 138 projets, 551 liens d'impact) — aucune donnée de pilotage,
  tout part à zéro/vide.
- Squelette frontend (index.html / app.js / style.css / client Supabase),
  authentification email/mot de passe, pas encore de vue fonctionnelle.

### À venir
- Migration progressive des vues de l'app locale v1 (radar, drilldown PA,
  vue projets, synthèse chiffrée) vers ce frontend connecté à Supabase.
