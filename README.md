# Statuts des espèces — France

Ce repository fournit aujourd’hui une **PWA mobile offline-first** et son **pipeline de données** pour consulter les statuts réglementaires et patrimoniaux des espèces de France. La trajectoire architecturale est d’extraire progressivement un moteur de résolution indépendant de l’interface — ce moteur (`resolveStatuses`) n’est **pas** encore livré.

**Aujourd’hui :** PWA terrain + pipeline v3 + dataset embarqué + [matrice de couverture](docs/generated/source-coverage.md).

**Cible roadmap :** moteur indépendant, puis batch / QGIS / API / package — voir [`docs/ROADMAP.md`](docs/ROADMAP.md). Ces usages ne sont pas disponibles.

## Produit terrain

Parcours actuel :

1. choisir **Faune** ou **Flore** ;
2. choisir une **région** ;
3. rechercher un taxon par nom scientifique, nom vernaculaire ou synonyme ;
4. consulter les statuts ;
5. voir les **sources** et **millésimes**.

La PWA est le produit effectivement utilisable. Elle fonctionne sans réseau une fois le dataset chargé. Deux catalogues (faune / flore) partagent le même pipeline de données et le même écran de statuts.

Elle ne dit pas si un projet est autorisé. Elle ne remplace pas un diagnostic écologique.

## Données

Les **13 régions métropolitaines** sont supportées par le moteur de données, avec une couverture régionale variable selon les référentiels intégrés. Le socle national est **TAXREF v18** et **BDC Statuts v18**. Plusieurs référentiels régionaux (listes rouges, ZNIEFF, parfois responsabilité régionale ou listes complémentaires) sont intégrés.

L’absence de statut pour une espèce n’est pas nécessairement un bug : le référentiel correspondant peut ne pas être intégré, ou le taxon peut être hors liste.

Vue synthétique (générée, ne pas recopier à la main) :

- [`docs/generated/source-coverage.md`](docs/generated/source-coverage.md)
- [`data-pipeline/generated/coverage.json`](data-pipeline/generated/coverage.json)

Registres et audits :

- [`data-pipeline/regions/ready-sources.json`](data-pipeline/regions/ready-sources.json) — registre machine
- [`data-pipeline/REGIONAL_SOURCES.md`](data-pipeline/REGIONAL_SOURCES.md) — registre humain
- [`docs/data-sources-*.md`](docs/) — audits régionaux

## Couverture : registre, manifeste, matrice

Trois couches distinctes :

| Couche | Rôle |
| --- | --- |
| **Registre** | Ce que le pipeline *déclare* pouvoir couvrir (`ready-sources.json`) |
| **Manifeste** | Ce qu’un *build* a effectivement inclus (`public/data/manifest.json`) |
| **Couverture générée** | Vue normalisée registre + manifeste, pour humains et machines |

La couverture n’est **pas** une applicabilité juridique. Un trou dans la matrice n’implique pas l’absence de statut dans la nature ; un statut affiché n’est pas un avis réglementaire.

## Dataset v3 (socle national)

Sur le **socle TAXREF v18 + BDC Statuts v18** utilisé pour la métropole (hors enrichissements régionaux, dont le volume dépend du jeu de sources du build) :

- **106 357 taxons** après filtrage : 26 405 flore et 79 952 faune
- **877 930 relations** taxon × territoire × statut
- **1 411 définitions** uniques après déduplication
- environ **43 Mio** de JSON brut pour le jeu métropolitain offline
- environ **6,3 Mo** pour l’artifact compressé généré par la CI

Les enrichissements régionaux s’ajoutent à ce socle. Pour un build donné : manifeste + [matrice générée](docs/generated/source-coverage.md).

Le pipeline produit un manifeste léger, deux catalogues, un dictionnaire de définitions et des liens régionaux compacts :

```text
public/data/
├── manifest.json
├── taxa-flora-<hash>.json
├── taxa-fauna-<hash>.json
├── status-definitions-<hash>.json
└── status-links-<realm>-<region>-<hash>.json
```

Une définition embarquée = `{ category, label, value, sourceId }`. Les citations longues et URL documentaires ne sont pas dans le bundle mobile. La PWA affiche le nom de source, le millésime et la date de vérification.

## Lancer en local

```bash
npm install
npm run dev
```

Tant qu’aucun jeu officiel n’est généré dans `public/data`, l’application utilise des fixtures de démonstration, non utilisables pour une décision terrain.

Socle national (dumps TAXREF / BDC déjà extraits, non versionnés) :

```bash
npm run data:build -- \
  --taxref /chemin/TAXREFv18.txt \
  --bdc /chemin/bdc_18_01.csv
```

Sources régionales : [`data-pipeline/README.md`](data-pipeline/README.md). Un build qui télécharge toutes les sources `ready` peut échouer si une URL distante est indisponible (chantier P0.5 — robustesse d’acquisition).

## Vérifier

```bash
npm test
npm run build
npm run coverage:build
```

## Limites actuelles

- **Métropole uniquement** (pas DROM, pas marin dédié, pas de sélecteur départemental)
- Couverture régionale **variable** — [matrice](docs/generated/source-coverage.md)
- Bundle compact : provenance via `sourceId` + manifeste ; pas de citations / URL documentaires embarquées
- Acquisition de certaines sources (ARA LRR, BFC 2026) encore fragile
- Pas de moteur `resolveStatuses` indépendant, pas d’usage batch / QGIS / API
- Licence du **code** à arbitrer ; les données restent sous les licences de leurs producteurs (TAXREF, BDC, DREAL, OEB, CBN, etc.)

## Documentation

| Document | Rôle |
| --- | --- |
| [`docs/README.md`](docs/README.md) | Index |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Trajectoire et chantiers |
| [`docs/generated/source-coverage.md`](docs/generated/source-coverage.md) | Couverture actuelle |
| [`data-pipeline/README.md`](data-pipeline/README.md) | Pipeline et reproductions |
| [`docs/deployment-ftp.md`](docs/deployment-ftp.md) | Déploiement |
