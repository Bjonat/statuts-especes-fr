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

Ces deux archives sont téléchargées et testées directement par les workflows de production.

## Sources régionales Centre-Val de Loire

### Espèces déterminantes ZNIEFF — DREAL Centre-Val de Loire

- Producteur : DREAL Centre-Val de Loire / CSRPN
- Dernière mise à jour publiée : **02/04/2026**
- Format : tableur XLS, un onglet par groupe taxonomique
- Contenu : flore, faune et habitats déterminants ; plusieurs groupes ont des millésimes d'actualisation propres
- Statut MVP : **READY_WHEN_AVAILABLE**
- Source : https://www.centre-val-de-loire.developpement-durable.gouv.fr/habitats-et-especes-determinantes-a4278.html
- Fichier : https://www.centre-val-de-loire.developpement-durable.gouv.fr/IMG/xls/listes_dz_cvl_actual_avril_2026.xls

Au 21/08/2026, le frontal DREAL renvoie aux runners GitHub une page de maintenance à la place du XLS. Aucun millésime antérieur ne doit être substitué silencieusement au fichier 2026.

Règle : lorsque cette source redevient accessible, elle doit pouvoir surcharger ou compléter le statut `ZDET` issu de la BDC pour le territoire Centre-Val de Loire, car elle constitue la publication régionale courante.

### Listes rouges régionales — audit terminé

- Producteur de synthèse : DREAL Centre-Val de Loire / CSRPN
- Page de synthèse publiée : **13/02/2026**
- Source : https://www.centre-val-de-loire.developpement-durable.gouv.fr/listes-rouges-en-region-centre-val-de-loire-a1451.html
- Statut MVP : **production**

La page DREAL distingue les listes validées selon le protocole UICN des autres listes indicatives. Le pipeline ne transforme pas une liste indicative en `red_list_regional` par simple présence sur cette page.

#### Trois publications récentes contrôlées directement

Trois listes récentes disposent désormais d'un adaptateur régional reproductible dans `data-pipeline/regions/cvl/build_arb_lrr.py` :

| Groupe | Millésime | Taxons | Raccord TAXREF v18 | Source importée |
|---|---:|---:|---:|---|
| Odonates | 2022 | 68 | 100 % | ARB Centre-Val de Loire |
| Papillons de jour et Zygènes | 2024 | 147 | 100 % | ARB Centre-Val de Loire |
| Coléoptères aquatiques — Gyrins, grands Dytiques, Donacies | 2025 | 47 | 100 % | Laboratoire d'Éco-entomologie / partenaires régionaux |

Total : **262 relations LRR régionales contrôlées directement**.

Contrôles appliqués :

- téléchargement de la publication originale et contrôle de signature PDF ;
- SHA-256 enregistré dans les métadonnées du paquet ;
- extraction textuelle déterministe via Poppler ;
- raccord au taxon accepté TAXREF avant recours aux synonymes ;
- filtre par ordre TAXREF pour empêcher qu'un artefact de mise en page soit interprété comme une espèce du groupe ;
- distribution UICN et nombre de taxons attendus bloquants ;
- override BDC limité aux `CD_REF` réellement couverts par chaque publication.

Le PDF Papillons 2024 contient une anomalie de couche texte : en mode `-layout`, sept lignes LC sont fragmentées et deux noms d'Odonates issus d'une ancienne maquette apparaissent au milieu du tableau. Le parseur utilise donc `pdftotext -raw` et exige `ORDRE = Lepidoptera` dans TAXREF. Le résultat est exactement **147/147**, sans exception codée taxon par taxon.

#### Audit BDC v18 pour les autres groupes

Un audit direct de `BDC_18/bdc_18_01.csv` a trouvé **3 564 relations `LRR` applicables à `INSEER24`**, toutes à portée régionale Centre-Val de Loire. Les documents BDC sont :

| `CD_DOC` | Groupe / document | Relations BDC |
|---:|---|---:|
| 188890 | Liste rouge des plantes vasculaires de la région Centre — 2013 | 2 746 |
| 186089 | Oiseaux nicheurs — 2013 | 197 |
| 186094 | Mollusques — 2012 | 166 |
| 443486 | Papillons de jour et Zygènes — 2024 | 147 |
| 186091 | Orthoptères / orthoptéroïdes — 2012 | 71 |
| 411507 | Odonates — 2022 | 68 |
| 186092 | Poissons — 2012 | 55 |
| 188889 | Mammifères hors chiroptères — 2013 | 47 |
| 186069 | Chiroptères — 2013 | 24 |
| 186068 | Amphibiens — document BDC cité 2012 | 21 |
| 186093 | Reptiles — document BDC cité 2012 | 16 |
| 188888 | Écrevisses — 2013 | 6 |

Cet audit confirme notamment que BDC v18 contient déjà exactement les **147 Papillons 2024** (`CD_DOC 443486`) et les **68 Odonates 2022** (`CD_DOC 411507`). Les paquets régionaux correspondants servent donc surtout à rendre la provenance, le hash et la validation reproductibles.

En revanche, **aucun document LRR BDC applicable au Centre-Val de Loire ne couvre les Coléoptères aquatiques 2025**. Le paquet 2025 constitue donc un enrichissement effectif du socle BDC v18.

La page DREAL 2026 affiche les millésimes « Amphibiens 2013 » et « Reptiles 2013 », alors que les citations documentaires enregistrées dans BDC v18 et les noms de fichiers historiques indiquent 2012. Cette divergence est conservée comme métadonnée de source ; elle ne doit pas être corrigée silencieusement dans les données.

#### Décision pipeline LRR CVL

- conserver BDC v18 pour les groupes historiques tant qu'aucune publication plus récente n'est validée ;
- appliquer les trois paquets régionaux 2022/2024/2025 uniquement aux `CD_REF` qu'ils couvrent ;
- ne pas importer les « autres listes » non UICN comme des listes rouges régionales ;
- surveiller les révisions annoncées des oiseaux, amphibiens, reptiles, poissons et macrocrustacés et écrire un nouvel override uniquement lors de la publication d'un référentiel final.

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
3. audit des listes rouges par groupe contre BDC v18 — **fait** ;
4. Odonates 2022, Papillons/Zygènes 2024 et Coléoptères aquatiques 2025 — **intégrés et validés** ;
5. liste ZNIEFF DREAL 2026 — **en attente du retour du fichier XLS officiel** ;
6. rareté / indigénat CBNBP uniquement avec millésime explicite ;
7. test terrain sur téléphone en mode avion.
