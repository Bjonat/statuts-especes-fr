# statuts-especes-fr

Application PWA mobile et offline-first de consultation des statuts réglementaires et patrimoniaux des espèces de France.

## Objectif

Parcours cible :

1. choisir **Faune** ou **Flore** ;
2. choisir une région ;
3. saisir quelques lettres d'un nom scientifique ou vernaculaire ;
4. sélectionner le taxon ;
5. consulter immédiatement ses statuts locaux, leur source et leur millésime.

Le cœur métier fonctionne sans connexion. Le réseau sert principalement à vérifier puis télécharger une nouvelle version des référentiels.

## Périmètre MVP

- PWA installable et utilisable hors ligne ;
- moteur commun faune/flore ;
- recherche tolérante : accents, noms partiels, noms vernaculaires/scientifiques, synonymes et petites fautes ;
- sélection de la région ;
- affichage compact des statuts ;
- traçabilité des sources et versions ;
- aucune carte, aucun compte, aucune saisie d'observation dans le MVP.

## Développement

```bash
npm install
npm run dev
```

Vérifications :

```bash
npm test
npm run build
```

Tant qu'aucun catalogue officiel n'est généré dans `public/data`, l'application utilise des fixtures clairement marquées comme données de démonstration non utilisables pour une décision terrain.

## Données officielles

Le pipeline utilise actuellement :

- **TAXREF v18** — PatriNat / INPN ;
- **Base de connaissance Statuts v18** — PatriNat / SINP.

Les fichiers sources ne sont pas versionnés dans Git. Après téléchargement et extraction des archives officielles :

```bash
npm run data:build -- \
  --taxref /chemin/TAXREFv18.txt \
  --bdc /chemin/bdc_statuts_18.csv
```

Le pipeline produit :

- `public/data/manifest.json`, petit fichier vérifié au démarrage ;
- `public/data/catalog-<hash>.json`, catalogue immuable contenant taxons, synonymes, statuts et provenance.

Le gros catalogue est mis en cache localement et n'est pas re-téléchargé tant que le manifeste ne référence pas une nouvelle version.

Voir [`data-pipeline/README.md`](data-pipeline/README.md) pour les règles de normalisation et d'applicabilité territoriale.

## Architecture

```text
TAXREF v18 ───────┐
                  ├─ data-pipeline ─► catalogue versionné ─► PWA offline
BDC Statuts v18 ──┤
                  │
Référentiels ─────┘
régionaux
```

Le code applicatif et les données sont découplés. Les fichiers sources hétérogènes sont normalisés hors application ; le téléphone ne connaît qu'un format local stable.

Une attention particulière est portée aux anciennes régions : un statut applicable à l'ancienne Aquitaine n'est jamais affiché comme applicable à toute la Nouvelle-Aquitaine. Tant que la localisation n'est connue qu'au niveau régional, ces cas sont signalés comme **portée partielle**.
