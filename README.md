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
├── status-links-flora-cvl-<hash>.json
├── status-links-flora-naq-<hash>.json
├── status-links-flora-occ-<hash>.json
├── status-links-fauna-cvl-<hash>.json
├── status-links-fauna-naq-<hash>.json
└── status-links-fauna-occ-<hash>.json
```

Sur TAXREF v18 + BDC v18 réels, **229 813 relations de statuts sont représentées par seulement 686 définitions uniques**. Pour les trois régions pilotes, le volume JSON brut total passe d'environ 118 Mio à **31 Mio**, taxonomie comprise. Le dictionnaire des statuts pèse environ 0,3 Mio et chaque jeu régional de liens environ 0,5 à 1,2 Mio.

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
- [`docs/data-sources-cvl.md`](docs/data-sources-cvl.md) — audit de fraîcheur et priorisation des sources Centre-Val de Loire.
