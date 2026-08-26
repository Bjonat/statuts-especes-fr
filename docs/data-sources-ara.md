# Audit des sources — Auvergne-Rhône-Alpes

État vérifié le 22/08/2026.

## ZNIEFF — source régionale intégrée

- Producteur : DREAL Auvergne-Rhône-Alpes / CSRPN Auvergne-Rhône-Alpes.
- Page de référence : `https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/les-especes-et-habitats-determinantes-des-znieff-a19735.html`.
- Page de référence indiquée comme mise à jour le 07/01/2026.
- Ressource opérationnelle : ODS `2023-06_listes_especes_determinantes_znieff_aura_internet.ods`.
- Millésime du jeu : juin 2023. La date de mise à jour de la page DREAL en 2026 n'est pas présentée comme le millésime scientifique du jeu.
- SHA-256 du fichier importé : `ab505dcac9297257e8432743c4f60f5a41a7c3f527880d917d6b55f65ddf4f86`.

### Disponibilité et reproductibilité

Au 22/08/2026, le frontal DREAL renvoie aux runners GitHub une page HTML `Maintenance en cours` à la place de l'ODS. Une capture du même fichier officiel, réalisée le 13/05/2026 par Internet Archive, est disponible et possède exactement le hash attendu.

Le pipeline applique donc la politique suivante :

1. tenter l'URL DREAL officielle ;
2. vérifier qu'il s'agit d'un vrai ODS ;
3. si le frontal est indisponible, utiliser la capture fixe du 13/05/2026 ;
4. dans tous les cas, exiger le SHA-256 exact ci-dessus ;
5. refuser le build si le contenu change silencieusement.

Le script `data-pipeline/regions/ara/download_dreal_znieff.sh` centralise cette règle.

## Sémantique territoriale conservée

Les listes révisées utilisent quatre zones biogéographiques :

- Continentale - Massif central ;
- Continentale - Plaine rhodanienne ;
- Alpine ;
- Méditerranéenne.

Un taxon déterminant dans une seule de ces zones est publié avec une portée `partial` et un libellé de zone explicite. Il n'est jamais généralisé à toute la région.

L'onglet des groupes faunistiques non révisés conserve ses anciennes portées :

- Auvergne ;
- Rhône-Alpes - Continentale ;
- Rhône-Alpes - Alpine ;
- Rhône-Alpes - Méditerranéenne.

Ces anciennes portées restent également partielles.

L'onglet poissons/écrevisses 2022, qui expose un statut régional sans découpage en quatre zones, est traité séparément comme tel.

## Valeurs métier

Le pipeline distingue :

- `Déterminante` ;
- `Complémentaire` ;
- `Non déterminante` ;
- les variantes conditionnelles telles que `Déterminante (si régularité)` ou `Déterminante (en ZNIEFF de type 2 seulement)`.

Les conditions sont conservées dans la valeur affichée. Les cellules `Non déterminante` ne produisent pas de carte de statut, mais le taxon reste inclus dans le périmètre de remplacement de la BDC : un ancien statut positif BDC peut ainsi être supprimé lorsqu'une évaluation ARA plus précise dit explicitement qu'il n'est pas déterminant.

Les seules normalisations de texte concernent des césures typographiques sans portée métier présentes dans le tableur, par exemple `Complémen-taire` → `Complémentaire`.

## Raccord TAXREF v18

Résultat du smoke-test reproductible :

- 18 onglets dans le classeur ;
- 14 onglets d'espèces interprétés ;
- 3 743 lignes raccordées à TAXREF v18 ;
- 2 lignes non résolues ;
- taux de raccord : **99,9466 %** ;
- 2 lignes Fungi diagnostiquées et hors périmètre actuel de l'application ;
- 2 346 références flore évaluées ;
- 1 237 références faune évaluées ;
- 3 583 références `CD_REF` évaluées au total ;
- **3 913 statuts positifs/complémentaires normalisés** après déduplication.

Les deux taxons source non résolus sont :

- `Hieracium bupleuroides C.C.Gmel., 1808` — identifiant source `101747` ;
- `Sparganium natans L., 1754` — identifiant source `124413`.

Ils restent explicitement visibles dans les diagnostics ; le pipeline ne fabrique pas de correspondance approximative.

## Sentinelles de validation

Le workflow `.github/workflows/ara-regional-smoke.yml` vérifie notamment :

- `Aconitum napellus` (`CD_REF 80037`) : déterminant avec portée partielle incluant la Plaine rhodanienne ;
- `Canis lupus` (`CD_REF 60577`) : conservation de la condition `ZNIEFF de type 2 seulement` ;
- présence de taxons évalués mais sans statut positif publié, démontrant la prise en compte des évaluations négatives dans le remplacement BDC ;
- absence de publication directe des valeurs `Non déterminante` ;
- présence de portées biogéographiques partielles ;
- SHA-256 exact et raccord TAXREF supérieur au seuil bloquant de 97 %.

## État pipeline

L'adaptateur ZNIEFF ARA est branché dans :

- le smoke-test régional dédié ;
- le smoke-test métropolitain ;
- le build du dataset officiel ;
- le bundle PWA/FTP de production.

## Listes rouges régionales — vertébrés unifiés 2024

État vérifié le 26/08/2026.

### Amphibiens, reptiles, chiroptères

- Producteur : LPO Auvergne-Rhône-Alpes / DREAL / CSRPN / ORB.
- Page DREAL : `https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/2024-08-liste-rouge-des-amphibiens-reptiles-et-a26033.html`.
- Tableur machine (ARB) : `LR_AURA2024_Chauves-souris_reptiles_amphibiens.xlsx`.
- SHA-256 : `ae49929b0a3d226fa392850c4fa95d928d5f374f179a01fd9ea5f71feac1a581`.
- Identifiants : `dreal-ara-lrr-amphibiens-2024`, `dreal-ara-lrr-reptiles-2024`, `dreal-ara-lrr-chiropteres-2024`.
- Schéma : `Groupe`, `cd_nom`, `Nom scientifique`, `LR AuRA 2024`.

### Oiseaux nicheurs et mammifères terrestres (hors chiroptères)

- Page DREAL : `https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/2024-05-liste-rouge-oiseaux-nicheurs-et-mammiferes-a25597.html`.
- ODS officiel : `2024-lrr-oisx_mamm_web-dreal.ods`.
- SHA-256 : `3308ae670319c729f248d444ddfb08b621a02cbc52610c3e4ad2a548eefacd7b`.
- Identifiants : `dreal-ara-lrr-oiseaux-nicheurs-2024`, `dreal-ara-lrr-mammiferes-2024`.
- Oiseaux : `cd_nom` présent ; mammifères : raccord par nom scientifique (un taxon ambigu `Mus musculus domesticus` omis).
- Sous-catégories UICN `NAa` / `NAb` conservées telles quelles.

### Hors vague

- Bourdons 2025, coléoptères saproxyliques 2021, poissons/écrevisses 2023 : PDF ou sans tableur machine stable.
- Fonge, végétations/habitats, listes d'anciennes régions Auvergne / Rhône-Alpes.
- Flore vasculaire unifiée : travail annoncé, horizon 2027.

Les LRR ne sont jamais déduites de la source ZNIEFF.
