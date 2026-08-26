# Audit des sources — Occitanie

État vérifié le 26/08/2026.

## ZNIEFF — sources régionales intégrées

- Producteur : DREAL Occitanie / CSRPN Occitanie.
- Page de référence : `https://www.occitanie.developpement-durable.gouv.fr/vers-des-znieff-troisieme-generation-en-occitanie-a24635.html`.

### Flore vasculaire, bryophytes, characées

- Fichier : `liste_taxons_det_flore_occitanie_cotation_v13-v16_osmose_public.xlsx`.
- SHA-256 : `87464cbb51ccc07de54586d10c6071b0a5344027f8c335dea2f06fcb877bb834`.
- Identifiants : `dreal-occ-znieff-flora-2023`, `dreal-occ-znieff-bryophytes-2023`, `dreal-occ-znieff-characees-2023`.
- Zones biogéographiques conservées en portée `partial` : Méditerranée, Massif central, Pyrénées, Bassin aquitain.
- Seules les cellules `D` produisent un statut `Déterminante` ; les `ND` entrent dans le périmètre de remplacement BDC sans carte positive.
- Validation CSRPN flore : GT Connaissance du 09/02/2023 (vote plénier encore daté `XX/XX/XXXX` dans les métadonnées du classeur — documenté, non bloquant pour l'import DREAL opérationnel).

### Faune

- Fichier : `listes_faune_znieff_20240725.xlsx`.
- SHA-256 : `ec66eed10fde0e97558c1f2a973fd8480037b722ec4e03814517e5944754d873`.
- Identifiant : `dreal-occ-znieff-fauna-2024-07`.
- Présence sur liste = `Déterminante` ; colonne de portée `Occitanie` → `regional`, sinon zones SO/MED/PYR/MC en `partial`.

### Disponibilité

Le frontal DREAL a longtemps renvoyé une page de maintenance. Le téléchargeur refuse tout contenu non-XLSX et exige le SHA-256 exact.

### Hors vague

- Habitats, champignons, lichens (hors périmètre espèces flora/fauna actuel).
- LRR Occitanie (travaux CSRPN 2026 à surveiller).

## Pipeline

Scripts : `data-pipeline/regions/occ/download_znieff.sh`, `build_znieff.py`.
Branchés dans smoke OCC, data-smoke et build-production.
