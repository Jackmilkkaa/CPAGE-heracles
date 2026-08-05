# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Convention : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) + [semver](https://semver.org/lang/fr/).

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
