# Audit des sources — Bretagne

État vérifié le 25/08/2026.

## ZNIEFF et LRR OEB — déjà importées

- ZNIEFF : `oeb-bretagne-znieff-csv-2026-01-29` (CSV data.gouv `4ada0b2b-…`)
- LRR : `oeb-bretagne-lrr-csv-2026-01-29` (CSV data.gouv `937614a8-…`)
- `build_oeb.py` reste le chemin historique pour ZNIEFF/LRR/responsabilité.
- ZNIEFF dispose aussi du pilote registry-driven `oeb-csv-znieff`, en double construction de parité.

## Responsabilité biologique régionale — importée

- Article OEB : `https://bretagne-environnement.fr/article/indicateurs-responsabilite-biologique-regionale-bretagne-especes`
- Jeu ouvert : `https://data.bretagne-environnement.fr/datasets/especes-a-responsabilite-biologique-regionale-en-bretagne`
- CSV data.gouv : `https://www.data.gouv.fr/api/1/datasets/r/b1d4b313-965a-4bc1-945d-32332befa07a`
- SHA-256 : `38965de26b6c462d5a366b92b9c80bd586b88ff7273603d591367f49c02a7240`
- Identifiant pipeline : `oeb-bretagne-responsabilite-csv-2026-07-29`
- Téléchargement fail-closed : `download_oeb_responsabilite.sh`

### Sémantique

Catégorie autonome `regional_responsibility` (libellé « Responsabilité biologique régionale »).

| Code source | Valeur publiée |
|---|---|
| 1 | mineure |
| 2 | modérée |
| 3 | élevée |
| 4 | très élevée |
| 5 | majeure |
| NA | non évaluée car marginale ou exotique |
| NSR | NSR |

Les oiseaux nicheurs (2023) et migrateurs (2015) coexistent en portées `partial` avec `scopeLabel` explicite.

### Volume

- ~2 200 statuts normalisés
- raccord TAXREF **100 %** sur les `CODE_NOM_TAXREF`
- Sentinelles : `Eryngium viviparum` (97152) = majeure ; `Alca torda` (3388) = majeure (nicheurs) + modérée (migrateurs)

### Hors périmètre

Listes d'espèces indicatrices OEB (inféodées / sensibles à la fragmentation) — ne pas les confondre avec la responsabilité biologique.
