# Audit des sources — Normandie

État vérifié le 25/08/2026.

## ZNIEFF flore Haute-Normandie — importée (portée partielle)

- Producteur : Conservatoire botanique national des Hauts-de-France / CSRPN (Haute-Normandie).
- Catalogue Digitale : `DIGITALE_BS-BIF-FVF_PV_4.0_20260331.xlsx`.
- Téléchargement CBN : `https://www.cbnhdf.fr/je-telecharge`.
- Page DREAL Normandie (contexte inventaire) : `https://www.normandie.developpement-durable.gouv.fr/les-listes-d-especes-et-d-habitats-determinants-de-a3126.html`.
- SHA-256 : `71ae71b770f7b3911349e501caaaa65ac7dba8172d12b96ef4b90d5056995c95`.
- Identifiant pipeline : `cbnhdf-digitale-znieff-hn-flora-2026-03-31`.

Le téléchargeur `download_digitale_znieff.sh` exige ce hash exact.

### Filtre et sémantique

- Feuille `REG-DIGITALE-BS-BIF-FVF-PV_4.0`.
- Territoire `CH_Territoire = HN` uniquement (pas HDF, pas BN).
- `CH_DetermZNIEFF` :
  - `Oui` → `Oui` ;
  - `(Oui)` → `Oui (disparu/présumé)` ;
  - `pp` → `Oui (pro parte)` ;
  - `[Oui]` exclu (erreur / douteux / cultivé uniquement).
- Portée : `partial` / `Haute-Normandie` — ne généralise jamais à toute la Normandie.
- Remplacement BDC ciblé par `cdRefs` flore couverts uniquement.

### Résultat smoke TAXREF v18

- 841 statuts normalisés ;
- raccord TAXREF : **100 %**.

### Sentinelles

- `Osmunda regalis` (`CD_REF 111815`) : `Oui`, portée Haute-Normandie ;
- `Narcissus pseudonarcissus` (`CD_REF 109297`) : `Oui (pro parte)`.

## Hors vague

- ZNIEFF Basse-Normandie ;
- ZNIEFF faune Normandie ;
- liste synthétique Normandie 2024 non démontrée comme jeu machine exhaustif.

## LRR unifiées

Les LRR ANBDD (oiseaux, mammifères, amphibiens, reptiles, odonates, orthoptères, rhopalocères) restent branchées séparément via `build_anbdd_lrr.py`.

## État pipeline

ZNIEFF HN branchée dans `.github/workflows/nor-znieff-smoke.yml`, `data-smoke.yml` et `build-production.yml`.
