# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Convention : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) + [semver](https://semver.org/lang/fr/).

## [0.13.1] - 2026-08-24

### Corrigé
- **% d'avancement invisible sur chaque fiche Objectif** : le badge
  `.objectif-avancement` était conçu pour un fond sombre fourni par un
  conteneur parent (le bloc "Avancement de la priorité" en haut de page),
  mais utilisé nu dans l'en-tête de chaque fiche objectif il affichait du
  texte blanc sur fond blanc, donc invisible. Remplacé par une pastille
  colorée selon le niveau (rouge/orange/jaune-vert/vert/non renseigné),
  cohérente avec les couleurs utilisées ailleurs dans l'app. Vérifié par
  capture d'écran après correctif.

## [0.13.0] - 2026-08-24

### Ajouté
- **Radar "Objectifs de la priorité" cliquable** : chaque objectif (radar
  ou jauges de secours si moins de 3 objectifs) déclenche un scroll fluide
  et une brève surbrillance vers sa fiche complète plus bas sur la page.
- **Compteurs sur chaque fiche Objectif** : à côté du % d'avancement déjà
  présent dans l'en-tête, affichage du nombre de résultats clés et du
  ratio projets actifs/total rattachés.
- **Synthèse chiffrée, plier/déplier** : chaque ligne de PA peut se
  déplier pour afficher ses objectifs et leur avancement individuel.
  Bouton global "Tout déplier / Tout replier" dans l'en-tête. Le champ
  Commentaire, jusqu'ici en lecture seule tronquée, est désormais un
  input éditable relié à `updatePriorite` (`commentaire_pilotage`).
- **Tri des cartes projets** : nouveau sélecteur (avancement croissant/
  décroissant, date de fin prévue croissante/décroissante). La date de
  fin prévue est affichée sur la carte quand elle existe ; les projets
  sans date sont toujours relégués en fin de liste quel que soit le sens.

Vérifié avec Playwright sur un jeu de données factice couvrant les 4
évolutions (dépli, tout déplier/replier, édition commentaire, tri par
avancement et par date, clic radar + scroll + surbrillance) : aucune
erreur JS, comportements conformes.

## [0.12.2] - 2026-08-21

### Corrigé
- **Vraie cause du bug de taille radar en mode "Par priorité"** : le fix
  0.12.1 (`align-items: start`) ne suffisait pas. En mode priorité, les
  intitulés longs des 24 priorités (`white-space: nowrap` +
  `text-overflow: ellipsis` sur `.g-label`) forçaient les deux colonnes de
  `.overview-grid` (`1fr 1fr`) à se dimensionner selon la largeur du texte
  non coupé, car `overflow: hidden` sur `.g-label` ne neutralise ce calcul
  qu'à son propre niveau, pas à celui de la grille parente. Résultat
  mesuré : la carte radar tombait à 348px de large (au lieu de 634px),
  la carte des jauges gonflait à 920px. Correctif : `minmax(0, 1fr)` au
  lieu de `1fr` sur `.overview-grid` et sur la grille interne `.gauge-row`,
  qui empêche tout track de dépasser sa part équitable à cause du contenu.
  Vérifié avec Playwright (mesure directe des `getBoundingClientRect`
  avant/après sur les 24 vrais intitulés de priorité) : le radar fait
  désormais 584×584 dans les deux modes, à l'identique.

## [0.12.1] - 2026-08-21

### Corrigé
- **Taille du radar instable en "Vue d'ensemble"** : la grille à deux
  colonnes (radar / jauges) étirait par défaut les deux colonnes à la même
  hauteur, or le nombre de lignes de jauges varie selon le mode (8 axes vs
  24 priorités) et le scope (2 axes d'une orientation vs 8 en vue globale).
  La colonne du radar était donc étirée pour matcher la colonne des
  jauges, donnant l'impression que sa taille changeait en changeant de
  sous-onglet. Chaque colonne a désormais sa propre hauteur, indépendante
  de sa voisine (`align-items: start` sur `.overview-grid`).

## [0.12.0] - 2026-08-21

### Changé
- **Fusion des onglets "Vue d'ensemble" et "Par orientation"** : les deux
  vues portaient la même hiérarchie (Orientation > Axe > Priorité) sans le
  dire, l'une en filtrant, l'autre en radar/jauges global. L'onglet "Par
  orientation" disparaît : ses 4 tuiles deviennent un sélecteur de
  périmètre (Global + 4 orientations) directement dans "Vue d'ensemble".
  Cliquer une tuile recadre le radar et les jauges existants sur
  l'orientation choisie (axes ou priorités selon le mode actif), sans
  changer d'onglet ni de composant. Le bloc vision/mission/ambition est
  remplacé par la description de l'orientation quand un scope est actif.
- **Renommage de l'onglet "Par priorité" en "Priorités d'action"** : ce
  n'est pas une vue de synthèse comme les autres, mais le détail fiche par
  fiche de chaque priorité. Le nom reflète mieux ce que l'onglet contient.

## [0.11.0] - 2026-08-17

### Corrigé
- **Titre/description des 138 projets** : le découpage initial (heuristique
  sur les majuscules, sans signal fiable) faisait déborder le début de la
  description dans le titre pour la plupart des projets (ex. PRJ068
  "Smart Dev Factory Évaluer et déployer une nouvelle" au lieu de
  "Smart Dev Factory"). Ré-extraction depuis le PDF source du plan complet,
  en utilisant cette fois le vrai signal de mise en forme (gras = titre,
  texte normal = description) via `pdftohtml -xml`, qui préserve les
  balises `<b>`. Les 138 entrées vérifiées une par une (aucune description
  vide, aucune anomalie de structure), plusieurs échantillons croisés
  manuellement avec le texte source avant migration.
- **Bug de conception découvert en même temps** : le trigger de protection
  des projets natifs (`protect_reference_columns`) était en
  `security definer`, ce qui fait que `current_user` à l'intérieur de la
  fonction reflétait le propriétaire de la fonction (postgres), pas
  l'appelant réel. Conséquence potentielle si non corrigée : soit bloquer
  les migrations légitimes, soit — pire — désactiver silencieusement toute
  la protection contre les éditeurs. Retiré `security definer` (la fonction
  n'en a pas besoin). Trois scénarios testés et confirmés : éditeur bloqué
  via l'appli, admin autorisé via l'appli, migration/SQL Editor autorisée.
- Migrations `0007_fix_trigger_protection_admin.sql` et
  `0008_fix_projets_titre_description.sql`.

## [0.10.0] - 2026-08-17

### Ajouté
- Table `heracles.poles_disponibles` : la liste des pôles (GAP, GEF, GRH,
  TEC, Transverses, Direction) est désormais éditable en base plutôt que
  codée en dur dans le frontend. Ajouter/renommer/retirer un pôle se fait
  en SQL, sans modification de code ni redéploiement.
- Écriture réservée à l'admin (nomenclature partagée, pas de donnée de
  pilotage courante), lecture ouverte à tous les authentifiés. Testé :
  éditeur bloqué en écriture, admin autorisé, lecture ok pour tous.
- Migration `0006_poles_variabilises.sql`.

### Modifié
- `data.js` charge la liste des pôles avec le reste du plan.
- `projetModal.js` et `vueProjets.js` : le tableau `POLES` codé en dur est
  retiré, les dropdowns pôle utilisent désormais `planTree.poles`.

## [0.9.0] - 2026-08-05

### Ajouté
- Navigation cliquable entre les vues : depuis la Vue d'ensemble (radar et
  jauges, mode priorité) et depuis la Vue par orientation, cliquer sur une
  priorité bascule directement sur son détail (Vue par priorité). Cliquer
  sur un axe en Vue d'ensemble bascule sur son orientation.
- `vuePriorite.js` navigue désormais par identifiant de priorité plutôt que
  par index de tableau, ce qui permet ce deep-link propre depuis n'importe
  quelle autre vue (`irVersPriorite(id)` exporté).
- Modal complet d'édition d'un projet accessible depuis la Vue par priorité
  (bouton "Détails" sur chaque carte projet des 3 colonnes, et sur chaque
  projet rattaché à un objectif), pas seulement depuis la Vue Projets.
- Indicateur d'avancement global repositionné et agrandi, centré dans
  l'en-tête (comme le prototype local v1), au lieu d'être absent.

### Modifié
- Le modal projet (métadonnées, boussole, impacts) est extrait dans un
  module partagé `projetModal.js`, utilisé à la fois par `vueProjets.js` et
  `vuePriorite.js` — plus de duplication, un seul endroit à faire évoluer.

## [0.8.1] - 2026-08-05

### Modifié
- Retiré le mode "Par orientation (4)" ajouté en 0.8.0 : le mode "Par axe"
  suffisait déjà pour une lecture synthétique.
- À la place, les 4 intitulés d'orientation apparaissent en surimpression
  légère sur le radar par axe, aux positions nord/est/sud/ouest (chaque
  orientation possède 2 axes consécutifs, avec 8 axes répartis
  régulièrement le premier axe de chacune tombe exactement sur ces quatre
  points). Permet de situer l'orientation sans changer de vue.
- Mode par défaut de la Vue d'ensemble : "Par axe" (au lieu de "orientation"
  puis retiré).

## [0.8.0] - 2026-08-05

### Ajouté
- Vue d'ensemble : troisième niveau de bascule "Par orientation (4)", le
  plus synthétique, en plus de "Par axe (8)" et "Par priorité (24)".
  Devient le mode par défaut à l'ouverture de la vue. Libellés en intitulé
  complet (comme le radar objectifs), lisible d'un coup d'œil pour repérer
  sur quelle orientation le plan progresse le plus.

## [0.7.2] - 2026-08-05

### Modifié
- Largeur de ligne des libellés du radar objectifs fortement élargie
  (10/8/7/6 → 28/22/18/15 caractères par ligne). Le texte peut désormais
  chevaucher légèrement le disque du radar plutôt que de s'empiler mot par
  mot sur une colonne trop étroite — le radar restant semi-transparent, les
  zones dessous restent lisibles malgré le chevauchement.

## [0.7.1] - 2026-08-05

### Ajouté
- Contenu complet des 24 fiches (conviction et contexte non tronqués,
  ré-extraits des PDF sources) directement en base, plutôt qu'un lien vers
  un fichier PDF externe à héberger séparément. Bouton "Lire la fiche
  complète" dans la vue par priorité, dépliable.
- Migration `0005_fiches_completes.sql` (colonnes `conviction_complete`,
  `contexte_complet`) + seed complémentaire, testés.
- Corrigé au passage : un artefact d'extraction PDF (`i\x02service` au lieu
  de `i-service`) présent uniquement sur la fiche #24.

### Retiré du plan initial
- L'idée d'un bouton "Fiche PDF" pointant vers un fichier externe est
  abandonnée au profit de ce contenu intégré : plus simple, pas de
  dépendance à un chemin de fichiers à maintenir.

## [0.7.0] - 2026-08-05

### Ajouté
- Synthèse chiffrée : tableau des 24 priorités (orientation, axe, avancement
  calculé, avancement effectif, écart, statut, commentaire), tri par colonne
  (clic sur l'en-tête), filtres (recherche, orientation, statut), export CSV.
- Module `vueSynthese.js`. Vue en lecture seule, pas de callback de
  rafraîchissement nécessaire.
- Les 5 vues du prototype local v1 sont maintenant toutes portées sur la
  version connectée Supabase : Vue d'ensemble, Par orientation, Par
  priorité, Projets, Synthèse chiffrée.

## [0.6.0] - 2026-08-05

### Ajouté
- Vue Projets : grille de tous les projets (natifs + hors plan), filtres
  (recherche, pôle, statut, origine, PA, boussole), compteur de résultats.
- Modal complet d'édition par projet : intitulé, description, pôle
  responsable, 3 dates, avancement, commentaire, boussole annuelle
  (tags cliquables par année), impacts sur les 24 PA en accordéon (chaque
  PA développe ses objectifs avec sélecteur Aucun/Faible/Moyen/Fort).
- Suppression d'un projet hors plan directement depuis le modal.
- Module `vueProjets.js`.

### Sécurité
- Migration `0004_protect_projet_deletion.sql` : un projet natif du plan ne
  peut plus être supprimé par un éditeur (seulement modifié dans ses limites
  déjà protégées). Lacune identifiée en préparant cette vue — la policy RLS
  d'écriture couvrait déjà DELETE sans distinction d'origine, ce que le
  trigger de protection des colonnes ne couvrait pas puisqu'il ne s'applique
  qu'aux UPDATE. Testé : éditeur bloqué sur un projet natif, autorisé sur un
  projet hors plan, admin autorisé sur les deux.

## [0.5.1] - 2026-08-05

### Modifié
- Libellés des objectifs sur le radar (vue par priorité) fortement agrandis
  (13/16/14px → 24/30/26px), sans changer la taille ni le rayon du radar
  lui-même. Interligne et largeur de wrap ajustés en conséquence pour éviter
  le chevauchement entre lignes et entre labels voisins.

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
