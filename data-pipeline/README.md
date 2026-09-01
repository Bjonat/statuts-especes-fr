# Pipeline de données

Le navigateur ne lit jamais directement TAXREF ou BDC Statuts. Ce dossier transforme les référentiels officiels en jeux JSON immuables, fractionnés pour le téléphone.

Le pipeline v3 couvre les **13 régions métropolitaines** et combine le socle TAXREF / BDC avec les enrichissements régionaux déclarés dans le registre. Les volumes dépendent du jeu de sources effectivement inclus dans le build.

Ce n’est **pas** un avis juridique, ni une couverture exhaustive de tous les référentiels régionaux existants.

## Sources nationales

Référentiels du socle (vérifiés le 21/08/2026) :

- **TAXREF v18** — PatriNat / INPN
- **BDC Statuts v18** — PatriNat / SINP

Les archives brutes ne sont pas versionnées dans Git.

## Registre, manifeste, couverture

| Artefact | Rôle |
| --- | --- |
| [`regions/ready-sources.json`](regions/ready-sources.json) | Registre machine : ce que le pipeline *déclare* |
| `public/data/manifest.json` | Manifeste : ce qu’un *build* a *inclus* |
| [`docs/generated/source-coverage.md`](../docs/generated/source-coverage.md) | Matrice humaine générée |
| [`generated/coverage.json`](generated/coverage.json) | Même vue, JSON |

La couverture (ce que le système déclare ou prouve couvrir) n’est pas l’affichage PWA (ce qui est montré pour un taxon une fois les référentiels intégrés filtrés). `resolveStatuses()` n’existe pas encore.

```bash
npm run coverage:build
# optionnel, si un manifeste v3 est disponible :
node data-pipeline/generate-coverage.mjs --manifest public/data/manifest.json
```

Une preuve `présent` n’est posée que si un identifiant candidat figure tel quel dans le manifeste :

- `source.id` : preuve **source-wide** (tous les tuples de cette source) ;
- `resource.pipelineId` : preuve **limitée aux tuples** produits par cette ressource.

Les identifiants « parapluie » sans correspondance exacte restent `inconnu`. Ne jamais déduire `absent` / `false`.

`coverage:build` relit registre + manifeste. Il ne relance pas l’ingestion.

Détail humain : [`REGIONAL_SOURCES.md`](REGIONAL_SOURCES.md). Audits : `docs/data-sources-*.md`. Ne pas maintenir ici une seconde liste manuelle complète des sources.

## Construction

```bash
npm run data:build -- \
  --taxref /chemin/TAXREFv18.txt \
  --bdc /chemin/bdc_18_01.csv \
  --out public/data
```

Paquets régionaux déjà construits :

```bash
npm run data:build -- \
  --taxref /chemin/TAXREFv18.txt \
  --bdc /chemin/bdc_18_01.csv \
  --regional-dir /chemin/paquets \
  --out public/data
```

Le manifeste v3 référence :

- deux catalogues taxonomiques (faune / flore) ;
- un dictionnaire global de définitions ;
- un jeu de liens compacts par règne et par région.

Un build qui télécharge **toutes** les sources `ready` peut échouer si une URL distante est indisponible. L’acquisition n’est pas robuste pour toutes les sources (chantier P0.5). Un échec réseau n’est pas une source absente du registre.

## Contrat du bundle compact

Chaque relation pointe vers une définition :

```text
StatusDefinition = { category, label, value, sourceId }
```

Un lien régional contient le `CD_REF`, l’identifiant de définition, un code de portée et, pour une portée partielle, son libellé territorial.

La provenance est conservée via **`sourceId`** et le **manifeste** (identifiant, millésime, producteur, `checkedAt`). Les définitions n’embarquent **pas** `citation` ni `documentUrl` : ces champs sont volontairement exclus du bundle mobile.

Les citations longues et URL documentaires, lorsqu’elles existent, restent du côté pipeline / audits / registre. La PWA affiche la source et le millésime, pas une citation bibliographique complète.

## Volumes du socle national

Sur le **socle TAXREF v18 + BDC v18** métropole (hors enrichissements régionaux) :

- 106 357 taxons (26 405 flore, 79 952 faune)
- 877 930 relations
- 1 411 définitions
- ~43 Mio de JSON brut
- ~6,3 Mo compressés (artifact CI)

Les enrichissements régionaux augmentent relations et définitions selon les sources du build. Ne pas utiliser d’anciens totaux « trois régions pilotes » (229 813 / 686) comme métrique courante.

## Validation métier

```bash
node data-pipeline/validate-generated.mjs --dir public/data
```

Les sentinelles incluent notamment :

| Taxon | Ce que le test garantit |
| --- | --- |
| *Lotus angustissimus* (`106634`) | Catalogue flore ; LRR Centre-Val de Loire = LC ; protection de l’ancienne Aquitaine conservée en portée partielle NAQ |
| *Aconitum napellus* s.l. (`80037`) | Protection régionale Centre |
| *Alcedo atthis* (`3571`) | Catalogue faune ; protection nationale |
| *Hyles euphorbiae* (`54843`) | Catalogue faune ; **0 statut projeté en Centre-Val de Loire** ; au moins un statut en Hauts-de-France, tous ZNIEFF à portée partielle ; au moins un statut en Normandie, tous ZNIEFF à portée partielle |

Ces sentinelles caractérisent des cas représentatifs. Elles ne prétendent pas qu’un taxon n’a de statuts « que » dans certaines régions au-delà de ce que le test assert.

`npm test` exécute les tests unitaires du parseur, de la compaction et des règles territoriales. La validation des jeux officiels (`validate-generated.mjs`) s’applique lorsqu’un dataset est présent dans `public/data`.

## Filtre taxonomique

Le catalogue conserve les rangs espèce / infraspécifiques utiles (`ES`, `SSES`, `VAR`, `SVAR`, `FO`, `CAR`, `RACE`, `AGES`) et retire les rangs supraspécifiques.

Pour le périmètre métropolitain, un taxon est conservé si son statut biogéographique TAXREF `FR` est renseigné et différent de `A` (absent) et `Q` (mention erronée). Garde-fou : un taxon possédant un statut BDC applicable à une région supportée reste conservé même si ce filtre l’aurait retiré.

Les synonymes restent rattachés au `CD_REF` accepté.

## Résolution territoriale

Une région administrative actuelle n’est pas toujours équivalente à la zone d’application d’un ancien texte. Exemples :

- ancienne Aquitaine, Poitou-Charentes, Limousin → portées **partielles** en Nouvelle-Aquitaine
- Midi-Pyrénées, Languedoc-Roussillon → portées **partielles** en Occitanie
- ancienne région Centre → même périmètre que Centre-Val de Loire → portée régionale complète

Les statuts départementaux sont conservés comme portées partielles tant que l’interface ne dispose que du choix régional.

## Indicateurs régionaux

Les indicateurs régionaux non homogènes (responsabilité, enjeux, listes complémentaires, etc.) sont intégrés **source par source** lorsqu’un référentiel institutionnel actuel, traçable et suffisamment structuré est disponible. Voir la [matrice de couverture](../docs/generated/source-coverage.md) pour ce qui est effectivement présent. Aucune catégorie n’est promise a priori.

## Bourgogne-Franche-Comté

| Source | État | Publication |
| --- | --- | --- |
| `dreal-bfc-statuts-2026-03-03` | `IMPORTED` — tableur DREAL 2026 | source publiée / intégrée |
| `arb-bfc-statuts-2023-12-19` | `WITNESS` | **non publiable** (schéma interne) |

L’URL DREAL du tableur 2026 peut être temporairement indisponible ou en maintenance lors des builds. Ce n’est pas la même chose qu’une source non intégrée. La robustesse d’acquisition / fallback de BFC 2026 (et ARA LRR) reste un chantier P0.5.

Le témoin 2023 sert à documenter un schéma ; il n’entre pas dans un dataset publiable (`UNPUBLISHABLE_SOURCE_IDS`).

## Auvergne-Rhône-Alpes

ZNIEFF OEB / DREAL (`dreal-ara-znieff`) est intégrée, avec **fallback archive** si le portail courant échoue.

La LRR vertébrés 2024 (`dreal-ara-lrr-vertebres-2024`) est intégrée dans le registre. L’URL DREAL associée peut échouer. Pas de fallback archive équivalent à celui de la ZNIEFF. Chantier P0.5.

Fail-closed SHA-256 : déjà en place. Ce n’est pas une acquisition robuste pour toutes les sources.

## Qualité

- Dedup à l’import régional
- SHA-256 des dumps ; fail-closed si un SHA connu ne correspond plus
- Fallback archive **pour certaines sources** (ex. ARA ZNIEFF), pas pour toutes
