# statuts-especes-fr

Application PWA mobile et offline-first de consultation des statuts réglementaires et patrimoniaux des espèces de France.

## Objectif

Parcours cible :

1. choisir **Faune** ou **Flore** ;
2. choisir une région ;
3. saisir quelques lettres d'un nom scientifique ou vernaculaire ;
4. sélectionner le taxon ;
5. consulter immédiatement ses statuts locaux, leur source et leur millésime.

Le cœur métier doit fonctionner sans connexion. Le réseau sert principalement à mettre à jour les référentiels.

## Périmètre MVP

- PWA installable et utilisable hors ligne ;
- moteur commun faune/flore ;
- recherche tolérante (accents, noms partiels, noms vernaculaires/scientifiques, synonymes) ;
- sélection du territoire ;
- affichage compact des statuts ;
- traçabilité des sources et versions ;
- aucune carte, aucun compte, aucune saisie d'observation dans le MVP.

## Sources cibles

- TAXREF ;
- Base de connaissance Statuts (PatriNat / SINP) ;
- référentiels régionaux complémentaires validés ;
- référentiels géographiques nécessaires à la résolution territoriale.

## Principe d'architecture

Le code applicatif et les données sont découplés. Les fichiers sources hétérogènes sont normalisés hors application par un pipeline, puis distribués dans un format local compact adapté au fonctionnement offline.
