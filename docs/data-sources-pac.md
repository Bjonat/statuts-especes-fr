# Audit des sources — Provence-Alpes-Côte d'Azur

État vérifié le 25/08/2026.

## ZNIEFF

| Jeu | Source id | SHA-256 | Statuts locaux |
|---|---|---|---|
| Faune janv. 2024 | `dreal-pac-znieff-fauna-2024-01` | `d38ffb58…` | 1899 |
| Flore 2016 (XLS) | `dreal-pac-znieff-flora-2016` | `1c39c39f…` | 823 |

Valeurs conservées : `Déterminante` / `Remarquable` (style ARA). Feuille maître `faune` uniquement pour la faune.

## Listes rouges

| Groupe | Source id | Statuts locaux |
|---|---|---|
| Oiseaux 2020 | `dreal-pac-lrr-oiseaux-2020` | 695 |
| Odonates 2017 | `dreal-pac-lrr-odonates-2017` | 73 |
| Papillons 2024 | `dreal-pac-lrr-papillons-2024` | 320 |
| Flore 2015 | `dreal-pac-lrr-flore-2015` | 423 |
| Amphibiens 2016 | `dreal-pac-lrr-amphibiens-2016` | 21 |
| Reptiles 2016 | `dreal-pac-lrr-reptiles-2016` | 32 |
| Orthoptères 2018 | `dreal-pac-lrr-orthopteres-2018` | 178 |

Raccord TAXREF ≥ 97 % sur chaque paquet. Filtrage ordre/classe TAXREF pour les listes sans code.

## Hors import

- Feuille papillons `pop` (rangs population non TAXREF)
- LRR odonates 2011 (supplantée)
- Habitats / listes marines hors lot smoke

## CI

- `download_sources.sh` fail-closed
- Smoke `.github/workflows/paca-regional-smoke.yml`
- Branché dans `data-smoke.yml` et `build-production.yml`
