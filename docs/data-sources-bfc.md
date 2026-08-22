# Audit des sources — Bourgogne-Franche-Comté

État vérifié le 22/08/2026.

## Tableur maître — millésime DREAL 2026 encore inaccessible

- Producteur : DREAL Bourgogne-Franche-Comté / ARB BFC / Sigogne / CSRPN Bourgogne-Franche-Comté.
- Page de référence DREAL : `https://www.bourgogne-franche-comte.developpement-durable.gouv.fr/statut-des-especes-a10460.html`.
- Ressource officielle actuelle : `260303_sp_statuts_bfc.xlsx`, millésime 03/03/2026.
- Blocage : le frontal DREAL renvoie une page HTML `Maintenance en cours` à la place du XLSX.

Ce millésime reste `READY_WHEN_AVAILABLE`. Il ne doit pas être remplacé silencieusement par un fichier plus ancien.

## Témoin de schéma ARB 2023-12-19

- Ressource : `231219_sp_statuts_bfc_a_diffuser.xlsx`.
- URL ARB : `https://www.arb-bfc.fr/content/uploads/2024/06/231219_sp_statuts_bfc_a_diffuser.xlsx`.
- SHA-256 : `0912139a6f6b6902d6be22e383471b971782502e155b5ae83526bddacbcac073`.
- Identifiant pipeline : `arb-bfc-statuts-2023-12-19`.
- Politique : `schema-witness-smoke-only`.

Le fichier 2023 est un tableur officiel, mais ce n'est plus le millésime annoncé par la DREAL. L'adaptateur s'en sert uniquement pour figer le schéma et un smoke-test reproductible.

## Garde-fous anti-publication

1. Le téléchargeur tente d'abord l'URL DREAL 2026. S'il obtient un vrai XLSX dont le hash n'est pas celui de 2023, le smoke échoue pour forcer la revalidation du nouveau millésime.
2. L'adaptateur refuse d'écrire un paquet si le hash n'est pas exactement celui du témoin 2023.
3. Même avec le bon hash, `--allow-witness-millesime` est obligatoire.
4. L'identifiant `arb-bfc-statuts-2023-12-19` est listé dans `UNPUBLISHABLE_SOURCE_IDS` : `validate-generated.mjs` refuse de le voir dans un manifeste officiel.
5. Le paquet n'est branché ni sur le smoke métropolitain, ni sur le bundle FTP.

## Sémantique conservée

Le tableur mélange des attributs nationaux déjà fournis par la BDC et des attributs régionaux. Seuls ces derniers sont normalisés :

- ZNIEFF BFC unifiée : portée `regional`.
  - `Déterminante stricte` et `Déterminante station` → `Oui` ;
  - variantes « sous conditions » → `Oui sous condition` ;
  - conditions de déterminance courtes conservées comme cartes séparées.
- LRR Bourgogne et Franche-Comté : portées `partial` `ancienne région Bourgogne` / `ancienne région Franche-Comté`.
- Catégories UICN composées au niveau d'un `CD_REF` (plusieurs `cd_nom`) : ignorées plutôt que fusionnées.
- Fonge déterminante de Franche-Comté, SCAP, EEE, protections et listes rouges nationales : hors périmètre de cet adaptateur.

Les 1 217 ZNIEFF unifiées n'ont pas de restriction départementale renseignée. Les LRR restent volontairement partielles : une évaluation bourguignonne n'est jamais étendue à toute la région actuelle.

Résultat du smoke local sur TAXREF v18 :

- 7 883 lignes pertinentes (ZNIEFF et/ou LRR UICN simple) ;
- 8 542 statuts normalisés ;
- 1 217 déterminantes ZNIEFF ;
- 7 234 LRR partielles ;
- 2 933 lignes hors règne (surtout fonge) volontairement exclues ;
- taux de raccord : **99,82 %**.

## Sentinelle

`Triturus cristatus` (`CD_REF 139`) :

- déterminante ZNIEFF régionale `Oui` ;
- LRR Bourgogne `VU` ;
- LRR Franche-Comté `VU`.

## État pipeline

L'adaptateur est prêt pour le millésime 2026 dès que le XLSX DREAL redevient un vrai classeur. Tant que ce n'est pas le cas, Bourgogne-Franche-Comté reste servie par la BDC v18 dans le dataset publié.
