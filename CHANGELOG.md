# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Convention : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) + [semver](https://semver.org/lang/fr/).

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
