# Audit des sources — Hauts-de-France

État vérifié le 26/08/2026.

## ZNIEFF flore / bryophytes — Digitale CBNHDF

- Producteur : Conservatoire botanique national des Hauts-de-France.
- Téléchargement : `https://www.cbnhdf.fr/je-telecharge`.
- Filtre : `CH_Territoire = HDF` uniquement ; portée publiée `partial` / `Hauts-de-France`.
- Valeurs déterminantes : `Oui`, `(Oui)` → `Oui (disparu/présumé)`, `pp` → `Oui (pro parte)`.
- Exclus : `[Oui]`, `Oui*`, `(Oui)*`, `Non`, `nd`, `#`.

| Groupe | Fichier | SHA-256 | Identifiant |
|---|---|---|---|
| Flore vasculaire | `DIGITALE_BS-BIF-FVF_PV_4.0_20260331.xlsx` | `71ae71b7…` | `cbnhdf-digitale-znieff-hdf-flora-2026-03-31` |
| Bryophytes | `DIGITALE_BS-BIF-FVF_MH_4.0_20260331.xlsx` | `810cc4cc…` | `cbnhdf-digitale-znieff-hdf-bryophytes-2026-03-31` |

## ZNIEFF faune — portées historiques DREAL

La DREAL Hauts-de-France indique qu'il n'existe pas encore de liste faune unifiée à l'échelle de la région actuelle. Les listes opérationnelles restent celles des deux anciennes régions administratives. Le pipeline conserve donc deux portées `partial` distinctes et ne fabrique jamais un statut faune `Hauts-de-France` global.

Page de référence : `https://www.hauts-de-france.developpement-durable.gouv.fr/Inventaire-des-ZNIEFF-terrestres`.

| Portée | Millésime publié | Lignes source | Statuts TAXREF v18 | SHA-256 | Identifiant |
|---|---:|---:|---:|---|---|
| Picardie | 2019, amendée 2020 | 449 | 449 | `9190695d4be256d84abaf2b781010e64890fcc38322828b12190bc093f7124fd` | `dreal-hdf-znieff-fauna-picardie-2020` |
| Nord-Pas-de-Calais | 2014-2015 | 379 | 378 | `16172bc5fb5a9d05fb6482273baf1e8bf5f93846a52451ff249a29f194828631` | `dreal-hdf-znieff-fauna-npdc-2014-2015` |

Contrat d'import :

- chaque ligne valide du tableur signifie `Déterminante ZNIEFF = Oui` ;
- aucun commentaire/critère conditionnel n'est présent sur les lignes publiables ;
- Picardie : 449 `CD_REF` distincts, tous raccordés directement à TAXREF v18 ;
- Nord-Pas-de-Calais : 378 lignes avec `CD_REF`, toutes raccordées à TAXREF v18 ;
- `Motacilla yarrellii` est remappée de l'ancien `CD_REF 961306` vers le `CD_REF 3945` de TAXREF v18 ;
- une 379e ligne NPdC, `Coregonus oxyrinchus`, n'a volontairement aucun identifiant et porte le commentaire source `Espèce hors TaxRef` : elle est exclue des statuts mais conservée dans les diagnostics ;
- un taxon présent dans les deux listes conserve deux statuts avec deux `scopeLabel` distincts, par exemple `Triturus cristatus` (`CD_REF 139`).

## LRR unifiées — IRPN

- Hub : `https://irpn.drealnpdc.fr/`.
- Tableurs machine (CDNOM + catégorie HdF) pour 6 groupes faune.
- Identifiants `irpn-hdf-lrr-<groupe>-…`.

## Hors vague

- LRR flore / bryophytes IRPN en PDF.
- Characées Digitale sans colonne `CH_DetermZNIEFF` exploitable.

## Pipeline

Scripts sous `data-pipeline/regions/hdf/` ; smoke `hdf-digitale-smoke.yml`, `hdf-znieff-fauna-smoke.yml` et `hdf-lrr-smoke.yml` ; branchés production / data-smoke via le point d'entrée ZNIEFF HDF commun.
