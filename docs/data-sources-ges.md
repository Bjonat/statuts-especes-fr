# Audit des sources — Grand Est

État vérifié le 22/08/2026.

## ZNIEFF faune — source régionale intégrée

- Producteur : DREAL Grand Est / CSRPN Grand Est / ODONAT Grand Est.
- Page de référence DREAL : `https://www.grand-est.developpement-durable.gouv.fr/les-nouvelles-listes-d-especes-determinantes-a22851.html`.
- Page vérifiée : mise à jour indiquée au 16/07/2026.
- Miroir institutionnel : `https://www.odonat-grandest.fr/znieff-documents-telechargeables/`.
- Ressource opérationnelle : XLSX `listes_especes-determinantes-znieff_grand-est_juin2026.xlsx`.
- Millésime du jeu : LEDZfauna v2.2 — juin 2026.
- SHA-256 du fichier importé : `8b5e6026c844c3ca469d4adc9e75fd6e74532a1f6ad68c2ad8d08d54e00f5dfa`.

### Disponibilité et reproductibilité

Au 22/08/2026, le frontal DREAL renvoie aux runners GitHub une page HTML `Maintenance en cours` à la place du XLSX officiel. ODONAT Grand Est republie le même classeur v2.2 de juin 2026.

Le pipeline applique donc la politique suivante :

1. tenter l'URL DREAL officielle ;
2. vérifier qu'il s'agit d'un vrai XLSX ;
3. si le frontal est indisponible, utiliser le miroir institutionnel ODONAT ;
4. dans tous les cas, exiger le SHA-256 exact ci-dessus ;
5. refuser le build si le contenu change silencieusement.

Le script `data-pipeline/regions/ges/download_odonat_znieff.sh` centralise cette règle.

## Sémantique territoriale conservée

La feuille harmonisée `LISTE FAUNE EDZ AEE GRAND EST` distingue un statut régional Grand Est et quatre entités naturelles :

- Plaine de Champagne et Brie ;
- Plateaux lorrains et massif ardennais ;
- Massif vosgien ;
- Fossé rhénan et massif jurassien.

Les priorités de ces unités naturelles sont publiées avec une portée `partial` et un libellé de zone explicite. Elles ne sont jamais généralisées à toute la région.

## Valeurs métier

Le pipeline distingue :

- `EDZ` : déterminante ZNIEFF, valeur `Oui` ;
- `EDZ*` : déterminante conditionnelle, valeur `Oui si (re)découverte` ;
- `AEE` / `AEE*` : espèces à enjeu écologique, hors publication déterminante.

Les conditions de déterminance et de surcotation sont conservées comme cartes de statut distinctes, uniquement lorsqu'elles tiennent en 80 caractères (contrainte d'affichage terrain). Quatre libellés plus longs sont omis plutôt que tronqués. Les taxons `AEE` restent dans le périmètre de remplacement de la BDC : un ancien statut déterminant BDC peut ainsi être retiré lorsqu'une évaluation Grand Est plus récente rétrograde le taxon.

La feuille `LISTE FAUNE BDD ZNIEFF GRANDEST` rassemble les groupes non encore harmonisés. Lorsqu'un taxon y est explicitement rétrogradé `AEE` / `AEE*`, le pipeline retire les anciens statuts déterminants des trois ex-régions sans le republier comme espèce déterminante.

## Raccord TAXREF v18

Résultat du smoke-test reproductible :

- 536 statuts déterminants régionaux (`EDZ` / `EDZ*`) ;
- 1 755 priorités d'unités naturelles ;
- 2 317 statuts normalisés après déduplication (4 conditions trop longues omises) ;
- 930 `CD_REF` dans le périmètre de remplacement ciblé ;
- 137 références rétrogradées depuis la feuille d'attente ;
- taux de raccord : **100 %** sur les lignes taxonomiques exploitables.

Catégories source de la feuille harmonisée : `EDZ` 521, `EDZ*` 15, `AEE` 263, `AEE*` 2.

## Sentinelles de validation

Le workflow `.github/workflows/ges-regional-smoke.yml` vérifie notamment :

- `Rhinolophus hipposideros` (`CD_REF 60313`) : déterminante régionale `Oui` ;
- priorités : Champagne-Brie `1`, plateaux lorrains / Ardenne `2`, Vosges `1`, fossé rhénan / Jura `1` ;
- conservation de la condition de surcotation ;
- SHA-256 exact et raccord TAXREF supérieur au seuil bloquant de 98 %.

## État pipeline

L'adaptateur ZNIEFF faune Grand Est est branché dans :

- le smoke-test régional dédié ;
- le smoke-test métropolitain ;
- le build du dataset officiel ;
- le bundle PWA/FTP de production.

La ZNIEFF flore Grand Est LEDZflora v1.0 (août 2024) est également importée :

- SHA-256 : `d95b53ebaff27683b58476f8cd4dd39b59190fd3f9e571da284e6d936174af1d` ;
- 1 027 déterminantes régionales, 3 830 statuts normalisés ;
- raccord TAXREF 100 % ;
- sentinelle `Achillea nobilis` (`CD_REF 79914`).

Les listes rouges unifiées restent un chantier séparé.
