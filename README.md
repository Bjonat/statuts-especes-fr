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
- **13 régions métropolitaines** ;
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

Tant qu'aucun jeu officiel n'est généré dans `public/data`, l'application utilise des fixtures clairement marquées comme données de démonstration non utilisables pour une décision terrain.

## Données officielles

Le pipeline utilise actuellement :

- **TAXREF v18** — PatriNat / INPN ;
- **Base de connaissance Statuts v18** — PatriNat / SINP.

Après téléchargement et extraction des archives officielles :

```bash
npm run data:build -- \
  --taxref /chemin/TAXREFv18.txt \
  --bdc /chemin/bdc_18_01.csv
```

Les fichiers sources bruts ne sont pas versionnés dans Git.

Le pipeline v3 produit un **manifeste léger**, deux catalogues taxonomiques, un dictionnaire global des définitions de statuts et des liens régionaux compacts :

```text
public/data/
├── manifest.json
├── taxa-flora-<hash>.json
├── taxa-fauna-<hash>.json
├── status-definitions-<hash>.json
└── status-links-<realm>-<region>-<hash>.json  # 2 règnes × 13 régions
```

Sur TAXREF v18 + BDC v18 réels pour toute la métropole :

- **106 357 taxons** conservés après filtrage sécurisé : 26 405 Flore et 79 952 Faune ;
- **877 930 relations taxon × territoire × statut** ;
- **1 411 définitions de statut uniques** après déduplication ;
- environ **43 Mio de JSON brut** pour tout le jeu métropolitain offline, taxonomie comprise ;
- environ **6,3 Mo** pour l'artifact compressé généré par la CI.

Chaque région possède des relations BDC réellement territoriales en plus des statuts nationaux. Les anciennes régions restent interprétées selon leur périmètre : une ancienne région composant une région fusionnée est signalée comme portée partielle ; une région dont le périmètre n'a pas changé reste une portée régionale complète.

L'application ne charge en mémoire que le règne choisi, le dictionnaire et les liens de la région sélectionnée. Lorsqu'une nouvelle version est disponible, les jeux sont mis en cache pour le mode hors ligne sans interrompre la recherche en cours.

Le workflow de données vérifie également des **cas sentinelles métier** sur les jeux officiels générés (notamment `Lotus angustissimus`, `Aconitum napellus` et `Alcedo atthis`).

## Architecture

```text
TAXREF v18 ───────┐
                  ├─ data-pipeline ─► manifeste + jeux compacts ─► PWA offline
BDC Statuts v18 ──┤
                  │
Référentiels ─────┘
régionaux
```

Le code applicatif et les données sont découplés. Pour le MVP métropolitain, le pipeline conserve les rangs espèce/infraspécifiques et élimine le bruit supraspécifique. Un taxon normalement exclu par son statut biogéographique est néanmoins conservé s'il possède un statut BDC applicable à l'une des régions supportées.

Une attention particulière est portée aux anciennes régions : un statut applicable à l'ancienne Aquitaine n'est jamais affiché comme applicable à toute la Nouvelle-Aquitaine. Tant que la localisation n'est connue qu'au niveau régional, ces cas sont signalés comme **portée partielle**.

## Documentation métier

- [`data-pipeline/README.md`](data-pipeline/README.md) — règles de transformation et validation des référentiels ;
- [`docs/data-sources-cvl.md`](docs/data-sources-cvl.md) — audit de fraîcheur et priorisation des sources Centre-Val de Loire ;
- [`docs/data-sources-ara.md`](docs/data-sources-ara.md) — intégration ZNIEFF Auvergne-Rhône-Alpes ;
- [`docs/data-sources-bfc.md`](docs/data-sources-bfc.md) — intégration du tableur maître BFC 03/03/2026 ;
- [`docs/data-sources-ges.md`](docs/data-sources-ges.md) — intégration ZNIEFF faune/flore Grand Est ;
- [`docs/data-sources-naq.md`](docs/data-sources-naq.md) — intégration ZNIEFF Nouvelle-Aquitaine (flore + groupes unifiés) ;
- [`docs/data-sources-pac.md`](docs/data-sources-pac.md) — intégration ZNIEFF + LRR Provence-Alpes-Côte d'Azur.
