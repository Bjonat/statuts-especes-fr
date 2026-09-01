# Pipeline de données

Le navigateur ne lit jamais directement les fichiers TAXREF ou BDC Statuts. Ce dossier transforme les référentiels officiels en jeux JSON immuables, fractionnés pour limiter mémoire, CPU et batterie sur téléphone.

## Sources nationales

Référentiels vérifiés le 21/08/2026 :

- **TAXREF v18** — PatriNat / INPN : `https://assets.patrinat.fr/files/referentiel/TAXREF_v18_2025.zip`
- **BDC Statuts v18** — PatriNat / SINP : `https://assets.patrinat.fr/files/referentiel/BDC.zip`

Le workflow `Data source smoke test` sait télécharger ces archives, détecter automatiquement le CSV principal BDC, exécuter les tests, générer les jeux et publier temporairement un artifact de contrôle.

## Matrice de couverture

La couverture des référentiels (ce que le système **déclare** couvrir) se distingue du manifeste v3 (ce qu’un **build** a réellement inclus) et de `resolveStatuses()` (ce qui s’applique à un taxon).

```bash
npm run coverage:build
# optionnel, si un manifeste v3 est disponible :
node data-pipeline/generate-coverage.mjs --manifest public/data/manifest.json
```

Fichiers produits (hors contrat runtime PWA) :

- `data-pipeline/generated/coverage.json`
- `docs/generated/source-coverage.md`

Une preuve `présent` n’est posée que si l’identifiant du registre (ou un `pipelineId` de ressource) figure tel quel dans le manifeste. Les identifiants « parapluie » restent `inconnu`.

## Construction

```bash
npm run data:build -- \
  --taxref /chemin/TAXREFv18.txt \
  --bdc /chemin/bdc_18_01.csv \
  --out public/data
```

Le manifeste v3 référence :

- deux catalogues taxonomiques (Faune / Flore) ;
- un dictionnaire global de définitions de statuts ;
- un jeu de liens compacts par règne et par région.

Les métadonnées répétitives (`label`, valeur, citation, URL documentaire, source) ne sont plus dupliquées dans chaque relation taxon × région. Un lien régional contient uniquement le `CD_REF`, l'identifiant de définition, un code de portée et, uniquement pour une portée partielle, son libellé territorial.

Sur les sources officielles v18 et les trois régions pilotes, **229 813 relations sont décrites par 686 définitions uniques**. Le volume JSON brut complet tombe à environ **31 Mio**, dont ~26 Mio de taxonomie ; les données de statuts elles-mêmes n'occupent plus qu'environ 5 Mio.

## Validation métier des jeux générés

Les tests unitaires vérifient le parseur, les filtres taxonomiques, la compaction/hydratation et les règles territoriales. Après génération d'un jeu officiel, un second niveau contrôle des **cas sentinelles de terrain** :

```bash
node data-pipeline/validate-generated.mjs --dir public/data
```

Les sentinelles actuelles sont :

- `Lotus angustissimus` (`CD_REF 106634`) : présence dans le catalogue, LRR Centre-Val de Loire = LC et protection de l'ancienne Aquitaine conservée comme portée partielle en Nouvelle-Aquitaine ;
- `Aconitum napellus` s. l. (`CD_REF 80037`) : protection régionale Centre ;
- `Alcedo atthis` (`CD_REF 3571`) : présence côté faune et protection nationale.

`data-smoke.yml` exécute cette validation directement sur les archives officielles téléchargées au moment du run. Une évolution de TAXREF ou de la BDC ne peut donc pas être considérée compatible uniquement parce que le JSON se construit : les cas métier doivent continuer à produire les résultats attendus.

## Filtre taxonomique

Le besoin métier est la recherche d'une espèce observée. Le pipeline conserve donc les rangs espèce/infraspécifiques utiles (`ES`, `SSES`, `VAR`, `SVAR`, `FO`, `CAR`, `RACE`, `AGES`) et retire genres, familles, ordres et autres rangs supraspécifiques du catalogue de recherche.

Pour le périmètre métropolitain actuel, un taxon est conservé si son statut biogéographique TAXREF `FR` est renseigné et différent de `A` (absent) et `Q` (mention erronée). Garde-fou : un taxon possédant un statut BDC applicable à une région supportée reste conservé même si ce filtre l'aurait retiré.

Les synonymes TAXREF restent rattachés au `CD_REF` accepté afin que les anciens noms restent recherchables.

## Résolution territoriale

Une région administrative actuelle n'est pas toujours équivalente à la zone d'application d'un ancien texte.

- `INSEER72` — ancienne Aquitaine : **portée partielle** dans Nouvelle-Aquitaine ;
- `INSEER54` — Poitou-Charentes : portée partielle dans Nouvelle-Aquitaine ;
- `INSEER74` — Limousin : portée partielle dans Nouvelle-Aquitaine ;
- `INSEER73` — Midi-Pyrénées : portée partielle dans Occitanie ;
- `INSEER91` — Languedoc-Roussillon : portée partielle dans Occitanie ;
- `INSEER24` — ancienne région Centre : même périmètre départemental que Centre-Val de Loire, donc portée régionale complète.

Les statuts départementaux sont conservés comme portées partielles tant que l'interface ne dispose que du choix régional.

## Données effectivement exploitées

La BDC fournit notamment : listes rouges nationales/régionales, protections, déterminance ZNIEFF, PNA et autres réglementations. Chaque relation restituée par l'application conserve sa catégorie, sa valeur, sa zone d'application, sa citation et son URL documentaire lorsqu'elles sont fournies ; la compaction ne change que leur représentation sur disque.

Les indicateurs régionaux non homogènes — par exemple certaines classes de rareté ou de responsabilité — seront intégrés par des adaptateurs séparés uniquement lorsqu'une source institutionnelle actuelle et traçable est disponible.

## Audit des sources régionales

Le premier territoire complémentaire étudié est **Centre-Val de Loire**.

Voir [`../docs/data-sources-cvl.md`](../docs/data-sources-cvl.md) pour l'audit détaillé :

- liste DREAL des espèces/habitats déterminants ZNIEFF actualisée le 02/04/2026 ;
- millésimes réels des listes rouges par groupe ;
- catalogue de rareté CBNBP de 2016 identifié comme trop ancien pour être présenté comme une donnée « à jour » sans avertissement explicite.

La prochaine ingestion régionale prioritaire est la liste ZNIEFF DREAL 2026.

Le tableur maître Bourgogne-Franche-Comté 2026 reste inaccessible. Un adaptateur est toutefois déjà écrit sur le témoin de schéma ARB 2023-12-19 : voir [`../docs/data-sources-bfc.md`](../docs/data-sources-bfc.md). Ce millésime ne doit pas être publié.
