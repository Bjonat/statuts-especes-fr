# Audit des sources — Centre-Val de Loire

État vérifié le 21/08/2026.

Ce document fixe quelles sources peuvent être utilisées dans le MVP et avec quel niveau de confiance. Le principe est simple : **une donnée ancienne n'est jamais présentée comme fraîche uniquement parce qu'elle est encore diffusée par un organisme institutionnel**.

## Socle national — utilisable en production

### TAXREF v18

- Producteur : PatriNat / INPN
- Usage : taxonomie, `CD_REF`, synonymes, noms vernaculaires, statut biogéographique France métropolitaine
- Version : v18
- Statut MVP : **production**
- Source : https://assets.patrinat.fr/files/referentiel/TAXREF_v18_2025.zip

### Base de connaissance Statuts v18

- Producteur : PatriNat / SINP
- Usage : protections, réglementations, listes rouges, déterminance ZNIEFF, PNA, directives et conventions lorsque présents dans la BDC
- Version : v18
- Statut MVP : **production**
- Source : https://assets.patrinat.fr/files/referentiel/BDC.zip

Ces deux archives sont téléchargées et testées directement par le workflow `data-smoke.yml`.

## Sources régionales Centre-Val de Loire

### Espèces déterminantes ZNIEFF — DREAL Centre-Val de Loire

- Producteur : DREAL Centre-Val de Loire / CSRPN
- Dernière mise à jour publiée : **02/04/2026**
- Format : tableur XLS, un onglet par groupe taxonomique
- Contenu : flore, faune et habitats déterminants ; plusieurs groupes ont des millésimes d'actualisation propres
- Statut MVP : **source régionale prioritaire à intégrer**
- Source : https://www.centre-val-de-loire.developpement-durable.gouv.fr/habitats-et-especes-determinantes-a4278.html
- Fichier : https://www.centre-val-de-loire.developpement-durable.gouv.fr/IMG/xls/listes_dz_cvl_actual_avril_2026.xls

Règle : lorsque cette source est intégrée, elle doit pouvoir surcharger ou compléter le statut `ZDET` issu de la BDC pour le territoire Centre-Val de Loire, car elle constitue la publication régionale courante.

### Listes rouges régionales — DREAL Centre-Val de Loire

- Producteur : DREAL Centre-Val de Loire / CSRPN, avec validation UICN pour la plupart des listes
- Page de synthèse publiée : **13/02/2026**
- Statut MVP : **production via BDC lorsqu'une correspondance existe ; audit par groupe**
- Source : https://www.centre-val-de-loire.developpement-durable.gouv.fr/listes-rouges-en-region-centre-val-de-loire-a1451.html

Millésimes actuellement publiés sur cette page :

- flore vasculaire : 2013 ;
- amphibiens : 2013 ;
- reptiles : 2013 ;
- oiseaux : 2013 ;
- chiroptères : 2013 ;
- poissons et lamproies : 2012 ;
- mollusques : 2012 ;
- orthoptéroïdes : 2012 ;
- odonates : 2022 ;
- papillons de jour : 2024 ;
- coléoptères aquatiques (gyrins, grands dytiques, donacies) : 2025.

Le fait que la page DREAL soit récente ne change pas le millésime scientifique de chaque liste. L'interface doit donc afficher le millésime du référentiel lui-même, pas seulement la date de consultation du site.

### Catalogue de la flore vasculaire / rareté — CBN du Bassin parisien

- Producteur : CBN du Bassin parisien
- Catalogue régional de référence identifié : **mai 2016**
- Contenu : indigénat, rareté régionale, liste rouge, protections, ZNIEFF et autres attributs floristiques
- Statut MVP : **ne pas présenter la rareté 2016 comme une donnée fraîche**

Une synthèse scientifique publiée en 2025 indique explicitement que, parmi les catalogues floristiques régionaux du CBNBP, celui du Centre-Val de Loire est le seul qui n'a pas été actualisé récemment ; les données ont en revanche alimenté l'atlas régional de la flore vasculaire.

Décision :

- ne pas bloquer le MVP en attendant une nouvelle rareté régionale ;
- ne pas injecter `RR`, `R`, `AR`, etc. dans l'écran principal sans afficher clairement **« Catalogue CBNBP 2016 »** ;
- préparer l'adaptateur mais attendre soit une publication plus récente, soit assumer explicitement ce millésime dans une version ultérieure.

## Politique d'affichage

Chaque statut doit conserver :

- le producteur ;
- le nom du référentiel ;
- sa version ou son millésime ;
- la date à laquelle notre pipeline a vérifié la source ;
- le document juridique ou scientifique d'origine lorsqu'il est disponible.

La date de synchronisation de l'application ne doit jamais être confondue avec la date scientifique ou juridique de la donnée.

## Ordre d'intégration CVL

1. TAXREF v18 + BDC v18 — **fait** ;
2. tests sentinelles sur des espèces réelles — **fait dans le pipeline** ;
3. liste ZNIEFF DREAL 2026 — prochain adaptateur régional ;
4. validation des listes rouges par groupe contre les publications DREAL ;
5. rareté / indigénat CBNBP uniquement avec millésime explicite ;
6. test terrain sur téléphone en mode avion.
