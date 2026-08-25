# Audit des sources — Île-de-France

État vérifié le 25/08/2026.

## Export GeoNat'îdF — source machine unique

- Producteur : Agence régionale de la biodiversité Île-de-France / GeoNat'îdF / CSRPN Île-de-France.
- Publications ARB : `https://www.arb-idf.fr/nos-ressources/publications/`.
- Table GeoNat : `https://geonature.arb-idf.fr/table-diffusion-statuts-taxons-franciliens`.
- CSV opérationnel : `https://geonature.arb-idf.fr/geonature/api/media/exports/schedules/Statuts_des_taxons_STyt8fLcp03L11.csv`.
- SHA-256 figé : `1466cacc15e65384ed66c67f6266ae6fcd1d27d45fee8367e133f1d23f4b8d62`.

Le téléchargeur `data-pipeline/regions/idf/download_geonat_statuts.sh` refuse tout HTML/maintenance et exige ce hash exact.

## ZNIEFF — importée

- Identifiant : `arb-idf-geonat-statuts-znieff-2026`.
- Colonnes : `zdet` / `cond_zdet` + `cd_nom`.
- Valeurs : `Oui` ; `Oui sous condition` lorsque la condition ou un libellé conditionnel est présent.
- Portée : `regional`.
- Adaptateur : `build_geonat_znieff.py`.

La page DRIEAT reste une référence documentaire ; le pipeline n'utilise pas le CSV DRIEAT brut.

## Listes rouges — 8 groupes importés

Adaptateur multi-groupes : `build_geonat_lrr.py` (colonne `lrr`).

| Groupe | Source id | Millésime |
|---|---|---|
| Amphibiens | `arb-idf-lrr-amphibiens-2023` | 2023 |
| Reptiles | `arb-idf-lrr-reptiles-2023` | 2023 |
| Oiseaux nicheurs | `arb-idf-lrr-oiseaux-nicheurs-2018` | 2018 |
| Chiroptères | `arb-idf-lrr-chiropteres-2017` | 2017 |
| Odonates | `arb-idf-lrr-odonates-2014` | 2014 |
| Rhopalocères / zygènes | `arb-idf-lrr-rhopaloceres-zygenes-2016` | 2016 |
| Orthoptéroïdes | `arb-idf-lrr-orthopteroides-2018` | 2018 |
| Flore vasculaire | `arb-idf-lrr-flore-vasculaire-2014` | 2014 |

- ~1 906 statuts LRR ; raccord TAXREF **100 %** via `cd_nom`.
- Portée : `regional` pour chaque groupe.
- Les sous-types PDF `NAa` / `NAb` sont collapsés en `NA` dans GeoNat.

## Hors vague

- Poissons LRR 2022 : PDF ARB uniquement, absent de l'export GeoNat — non importé en vague 1.

## Sentinelles

- `Bombina variegata` (`CD_REF 212`) : LRR amphibiens `EN`.
- `Podiceps nigricollis` (`CD_REF 974`) : LRR oiseaux nicheurs `EN`.
- `Aconitum napellus` (`CD_REF 80037`) : LRR flore vasculaire `EN`.

## État pipeline

Branché dans `.github/workflows/idf-regional-smoke.yml`, `data-smoke.yml` et `build-production.yml`.
