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

## LRR unifiées — IRPN

- Hub : `https://irpn.drealnpdc.fr/`.
- Tableurs machine (CDNOM + catégorie HdF) pour 6 groupes faune.
- Identifiants `irpn-hdf-lrr-<groupe>-…`.

## Hors vague

- ZNIEFF faune Picardie / Nord-Pas-de-Calais (portées historiques seulement).
- LRR flore / bryophytes IRPN en PDF.
- Characées Digitale sans colonne `CH_DetermZNIEFF` exploitable.

## Pipeline

Scripts sous `data-pipeline/regions/hdf/` ; smoke `hdf-digitale-smoke.yml` et `hdf-lrr-smoke.yml` ; branchés production / data-smoke.
