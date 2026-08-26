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

## LRR unifiées ANBDD — importées

- Producteur : ANBDD / partenaires naturalistes / CSRPN Normandie.
- Page DREAL : `https://www.normandie.developpement-durable.gouv.fr/les-listes-rouges-dans-le-monde-et-en-normandie-a6663.html`.
- Téléchargeur : `download_lrr.sh` (SHA-256 fail-closed) ; builder : `build_anbdd_lrr.py`.

| Groupe | Millésime | Statuts | SHA-256 (préfixe) | Identifiant |
|---|---|---:|---|---|
| Oiseaux nicheurs | 2024 | 205 | `ed7b70e2…` | `anbdd-normandie-lrr-oiseaux-nicheurs-2024` |
| Mammifères | 2022 | 95 | `9771d796…` | `anbdd-normandie-lrr-mammiferes-2022` |
| Amphibiens | 2022 | 19 | `5db2c37e…` | `anbdd-normandie-lrr-amphibiens-2022` |
| Reptiles | 2022 | 17 | `e9f718fe…` | `anbdd-normandie-lrr-reptiles-2022` |
| Odonates | 2022 | 59 | `78563f97…` | `anbdd-normandie-lrr-odonates-2022` |
| Orthoptères / mantes / phasmes | 2022 | 69 | `362e053c…` | `anbdd-normandie-lrr-orthopteres-2022` |
| Rhopalocères / zygènes | 2022 | 112 | `975e63b1…` | `anbdd-normandie-lrr-rhopaloceres-2022` |

Total : **576** statuts ; raccord TAXREF 100 % via `CD_NOM`. Portée `regional`.

### Sentinelles LRR

- `Uria aalge` (`CD_REF 3379`) : oiseaux nicheurs `RE` ;
- `Chazara briseis` (`CD_REF 53425`) : rhopalocères `RE` ;
- `Pelobates fuscus` (`CD_REF 240`) : amphibiens `RE`.

## État pipeline

ZNIEFF HN + LRR ANBDD branchées dans `nor-znieff-smoke.yml`, `normandie-lrr-smoke.yml`, `data-smoke.yml` et `build-production.yml`.
