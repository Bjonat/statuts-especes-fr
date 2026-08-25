# Audit des sources — Pays de la Loire

État vérifié le 25/08/2026.

## ZNIEFF continentales 2018 — importées

Page DREAL : `https://www.pays-de-la-loire.developpement-durable.gouv.fr/les-listes-des-especes-determinantes-et-habitats-a4613.html`.

| Jeu | Source id | SHA-256 | Statuts locaux |
|---|---|---|---|
| Faune | `dreal-pdl-znieff-faune-2018` | `1bd95cf7…` | 1000 |
| Flore | `dreal-pdl-znieff-flore-2018` | `2b99b0bf…` | 529 |

Présence sur liste = déterminante `Oui`. Restrictions / particularités ≤ 80 caractères émises comme conditions ; tags bruit (`Coléoptères aquatiques`) et textes trop longs omis.

Raccord TAXREF ≈ 99,8 %.

## Hors import

- Habitats 2018 ODS
- Arthropodes estran
- Feuille `Feuille2` (cotations UICN CBNB — LRR non READY)
- Avis CSRPN 2026 bryophytes / characées (`PENDING_PUBLICATION`)

## LRR

Toujours `RESEARCH_REQUIRED` pour consolidation groupe par groupe.

## CI

- `download_znieff.sh` fail-closed
- Smoke `.github/workflows/pdl-regional-smoke.yml`
- Branché dans `data-smoke.yml` et `build-production.yml`
