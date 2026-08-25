# Audit des sources — Nouvelle-Aquitaine

État vérifié le 25/08/2026.

## ZNIEFF flore vasculaire

- Source : OBV / CBN, v1.2 (2019), déjà branchée (`obv-na-znieff-flore-2019-v1.2`).
- Adaptateur : `data-pipeline/regions/naq/build_znieff.py`.

## ZNIEFF groupes unifiés — importés

Page DREAL : `https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/les-listes-neo-aquitaines-a11234.html`.

Adaptateur multi-groupes : `build_znieff_groups.py` + `download_znieff_groups.sh` (SHA-256 fail-closed).

| Groupe | Source id | Statuts locaux | Notes |
|---|---|---|---|
| Characées 2023 | `dreal-naq-znieff-characees-2023` | 28 | CD_REF, portée régionale |
| Oiseaux nicheurs 2023 | `dreal-naq-znieff-oiseaux-nicheurs-2023` | 316 | X régionale / départementale + conditions |
| Araignées 2023 | `dreal-naq-znieff-araignees-2023` | 263 | Stricte / sous conditions (Pyrénées) |
| Amphibiens 2024-09 | `dreal-naq-znieff-amphibiens-2024-09` | 18 | Départements NAQ, typo `87.79` normalisée |
| Reptiles 2024-09 | `dreal-naq-znieff-reptiles-2024-09` | 14 | Idem schéma herpéto |
| Mollusques 2025 | `dreal-naq-znieff-mollusques-2025` | 104 | Uniquement `DET_ZNIEFF=ZNIEFF` |
| Orthoptères 2026 | `dreal-naq-znieff-orthopteres-2026` | 49 | Oui régionale + exceptions 79/86 |
| Oiseaux marins 2026 | `dreal-naq-znieff-oiseaux-marins-2026` | 41 | Raccord par nom latin |

Raccord TAXREF ≥ 97 % sur chaque groupe (100 % sauf orthoptères ~97,6 % : genre + complexe non résolus exclus).

## Hors import volontaire

- Végétations, habitats naturels, mammifères marins / tortues marines : non listés dans le lot READY branché.
- LRR flore / protections 2026 : `PENDING_PUBLICATION`.
- PEE/EEE 2022 : `DO_NOT_IMPORT` (métadonnées internes « v0.9 non validée »).

## CI

- Smoke dédié : `.github/workflows/naq-znieff-groups-smoke.yml`
- Branché dans `data-smoke.yml` et `build-production.yml`
