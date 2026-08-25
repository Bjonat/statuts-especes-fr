# Audit des sources — Bourgogne-Franche-Comté

État vérifié le 25/08/2026.

## Tableur maître — millésime DREAL 2026 importé

- Producteur : DREAL Bourgogne-Franche-Comté / ARB BFC / Sigogne / CSRPN Bourgogne-Franche-Comté.
- Page de référence DREAL : `https://www.bourgogne-franche-comte.developpement-durable.gouv.fr/statut-des-especes-a10460.html`.
- Ressource officielle : `260303_sp_statuts_bfc.xlsx`, millésime 03/03/2026.
- SHA-256 : `4c16ef90ccfa016a7715aac7dc195e1e897ce27763f50937df5b687173e1ee02`.
- Identifiant pipeline : `dreal-bfc-statuts-2026-03-03`.

Le téléchargeur `data-pipeline/regions/bfc/download_arb_statuts.sh` exige ce hash exact.

## Sémantique conservée

- ZNIEFF BFC unifiée : portée `regional`.
  - `Déterminante stricte` et `Déterminante station` → `Oui` ;
  - variantes « sous conditions » → `Oui sous condition` ;
  - conditions de déterminance courtes conservées comme cartes séparées.
- LRR Bourgogne et Franche-Comté : portées `partial` `ancienne région Bourgogne` / `ancienne région Franche-Comté`.
- LRR BFC unifiée (`liste_rouge_bfc`) : portée `regional` pour les groupes déjà évalués à l'échelle de la région actuelle (papillons, odonates, syrphes…).
- Catégories UICN composées au niveau d'un `CD_REF` : ignorées plutôt que fusionnées.
- Fonge déterminante de Franche-Comté, SCAP, EEE, protections et listes rouges nationales : hors périmètre de cet adaptateur.

## Résultat smoke TAXREF v18

- 8 926 statuts normalisés ;
- 1 483 déterminantes ZNIEFF ;
- 7 318 LRR (619 unifiées + 6 699 partielles) ;
- taux de raccord : **100 %** sur les lignes taxonomiques exploitables.

## Sentinelle

`Triturus cristatus` (`CD_REF 139`) :

- déterminante ZNIEFF régionale `Oui` ;
- LRR Bourgogne `VU` ;
- LRR Franche-Comté `VU`.

## Témoin ARB 2023

Le fichier `231219_sp_statuts_bfc_a_diffuser.xlsx` reste un témoin de schéma (`WITNESS`). Il exige `--allow-witness-millesime` et son identifiant reste dans `UNPUBLISHABLE_SOURCE_IDS`.

## État pipeline

Branché dans le smoke régional dédié, le smoke métropolitain et le bundle FTP.
