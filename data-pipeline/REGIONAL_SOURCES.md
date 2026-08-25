# Registre des sources régionales

> **Rôle de ce fichier** : source de vérité pour la phase d'enrichissement régional de `statuts-especes-fr`.
>
> **Dernière vérification générale : 2026-08-21**
>
> Toute PR qui ajoute ou remplace un référentiel régional doit partir de ce registre, vérifier à nouveau la source au moment de l'import, puis mettre ce fichier à jour si un millésime plus récent est découvert.

## 1. Principes de sélection des sources

Le socle national reste :

- **TAXREF v18** pour la taxonomie, les `CD_REF`, les synonymes et les noms ;
- **BDC-Statuts v18 / PatriNat-SINP** pour les statuts réglementaires et patrimoniaux nationaux et pour les statuts régionaux tant qu'aucune source régionale plus récente, plus précise et validée ne les remplace.

Une source régionale ne remplace la BDC que pour le triplet exact **région × règne/groupe × catégorie de statut** qu'elle couvre. Exemple : une liste ZNIEFF flore Nouvelle-Aquitaine ne remplace ni la ZNIEFF faune, ni la liste rouge régionale, ni les protections.

Règles impératives :

1. **Présence ≠ statut.** Un atlas d'observations ou une base de présence ne doit jamais servir à déduire un statut réglementaire ou patrimonial.
2. **Pas d'extension géographique implicite.** Un statut Aquitaine, Limousin, Picardie, Haute-Normandie, etc. reste une portée partielle tant qu'une source unifiée de la région actuelle ne l'a pas remplacé.
3. **Avis ≠ jeu de données opérationnel.** Un avis CSRPN récent est placé en surveillance tant que le référentiel final ou le fichier officiel correspondant n'est pas publié.
4. **Une ressource marquée non validée dans ses propres métadonnées n'est pas importée comme officielle**, même si elle est téléchargeable depuis un portail institutionnel.
5. **La source machine est privilégiée** : CSV > XLSX/ODS > XLS > PDF. Le PDF peut documenter ou valider une méthode, mais ne doit être la source d'import principale que s'il n'existe aucune alternative structurée.
6. **Les restrictions doivent être conservées** : département, zone biogéographique, ancienne région, altitude, façade maritime, etc.
7. Avant publication, chaque import doit conserver : producteur, titre, version/millésime, date de vérification, URL de la page source, URL du fichier si stable, et idéalement un hash du fichier réellement importé.

## 2. États utilisés dans ce registre

| État | Signification |
|---|---|
| `READY` | Source officielle/validée et exploitable ; adaptateur régional à écrire ou à maintenir. |
| `IMPORTED` | Source déjà intégrée dans le pipeline du projet. |
| `READY_WHEN_AVAILABLE` | Bonne source identifiée mais fichier momentanément inaccessible depuis le pipeline. |
| `PARTIAL` | Source correcte mais limitée à certains groupes, anciennes régions ou zones ; ne pas généraliser. |
| `PENDING_PUBLICATION` | Travail récent/avis validé, mais jeu de données final à attendre. |
| `RESEARCH_REQUIRED` | Pas encore de source structurée consolidée suffisamment fiable identifiée. |
| `DO_NOT_IMPORT` | Source connue mais non validée, ambiguë ou impropre à une publication officielle. |
| `WITNESS` | Fichier officiel exploitable pour préparer un adaptateur ou un smoke-test de schéma, interdit à la publication tant qu'un millésime plus récent n'est pas validé. |

## 3. Matrice de travail métropolitaine

| Région | ZNIEFF | Listes rouges régionales | Autres attributs régionaux | Priorité d'enrichissement |
|---|---|---|---|---|
| Auvergne-Rhône-Alpes (`ARA`) | `READY` | `PARTIAL` | À documenter selon CBN | Haute |
| Bourgogne-Franche-Comté (`BFC`) | `IMPORTED` via tableur maître 2026 | `IMPORTED` via tableur maître 2026 | Tableur maître de statuts | **Très haute** |
| Bretagne (`BRE`) | `READY` | `READY` | Responsabilité biologique régionale disponible | **Très haute** |
| Centre-Val de Loire (`CVL`) | `READY_WHEN_AVAILABLE` | `READY` | Rareté/indigénat CBNBP à qualifier | Haute |
| Corse (`COR`) | `RESEARCH_REQUIRED` pour consolidation | `PARTIAL` | À documenter | Moyenne |
| Grand Est (`GES`) | `IMPORTED` faune et flore vasculaire | `PARTIAL` selon groupes | Anciennes régions à préserver | **Très haute** |
| Hauts-de-France (`HDF`) | `PARTIAL` | `PARTIAL` | Anciennes régions à préserver | Moyenne |
| Île-de-France (`IDF`) | `READY` | `PARTIAL` selon groupes | À compléter via ARB/CBNBP | Haute |
| Normandie (`NOR`) | `PARTIAL` | `READY` selon groupes unifiés | Anciennes régions à préserver | Haute |
| Nouvelle-Aquitaine (`NAQ`) | `IMPORTED` flore vasculaire + groupes unifiés | `PARTIAL` / nouveaux travaux 2026 en attente | EEE 2022 actuellement bloquée | **Très haute** |
| Occitanie (`OCC`) | `READY_WHEN_AVAILABLE` | `PARTIAL` / travaux 2026 en attente | Zones biogéographiques à conserver | **Très haute** |
| Pays de la Loire (`PDL`) | `READY` avec mises à jour 2026 à surveiller | `RESEARCH_REQUIRED` pour consolidation | Rareté/indigénat à qualifier | Moyenne |
| Provence-Alpes-Côte d'Azur (`PAC`) | `IMPORTED` faune 2024 + flore 2016 | `IMPORTED` selon groupes publiés | À compléter via CBNMed/CBNA | **Très haute** |

---

## 4. Sources par région

### ARA — Auvergne-Rhône-Alpes

#### ZNIEFF — `READY`

- **Producteur** : DREAL Auvergne-Rhône-Alpes.
- **Page de référence** : https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/les-especes-et-habitats-determinantes-des-znieff-a19735.html
- **Page vérifiée** : mise à jour indiquée au 07/01/2026.
- **Ressource** : tableur ODS « Listes d'espèces déterminantes des ZNIEFF en Auvergne-Rhône-Alpes ».
- **Particularité importante** : listes organisées par groupes et par grandes zones biogéographiques (Massif central, plaine rhodanienne, alpine, méditerranéenne). Ces zones doivent rester des portées explicites dans l'application.
- **Décision pipeline** : importer dès que le schéma du tableur est stabilisé ; ne pas réduire le résultat à un simple booléen régional si une restriction de zone existe.

#### Listes rouges — `PARTIAL`

- **Page de synthèse officielle** : https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/presentation-et-tableau-de-synthese-des-listes-a22019.html
- **Page vérifiée** : mise à jour indiquée au 05/01/2026.
- Plusieurs groupes disposent déjà de listes unifiées Auvergne-Rhône-Alpes ; lorsque ce n'est pas le cas, les anciennes listes Auvergne / Rhône-Alpes restent à considérer séparément.
- **Flore vasculaire** : une liste rouge unifiée Auvergne-Rhône-Alpes est annoncée comme travail en cours, avec horizon 2027. Ne pas fabriquer de statut régional unifié avant publication.

#### Action suivante

Écrire un adaptateur ZNIEFF ARA, puis inventorier précisément les groupes disposant déjà d'une LRR unifiée et conserver les anciennes portées pour les autres.

---

### BFC — Bourgogne-Franche-Comté

#### Tableur maître des statuts — `IMPORTED` pour 2026 — priorité très haute

- **Producteur** : DREAL Bourgogne-Franche-Comté / ARB BFC / Sigogne.
- **Page officielle DREAL** : https://www.bourgogne-franche-comte.developpement-durable.gouv.fr/statut-des-especes-a10460.html
- **Ressource officielle actuelle** : `260303_sp_statuts_bfc.xlsx`, millésime 03/03/2026.
- **SHA-256** : `4c16ef90ccfa016a7715aac7dc195e1e897ce27763f50937df5b687173e1ee02`.
- **Identifiant pipeline** : `dreal-bfc-statuts-2026-03-03`.
- **Schéma** : ~28 352 taxons, `CD_REF` TAXREF, ZNIEFF BFC unifiée, LRR Bourgogne et Franche-Comté séparées, LRR BFC unifiées pour certains groupes (papillons, odonates, syrphes…), protections et autres attributs.
- **Décision pipeline** : millésime DREAL 2026 publié. ZNIEFF en portée régionale ; LRR Bourgogne / Franche-Comté en portées partielles ; LRR BFC unifiée en portée régionale lorsqu'elle est renseignée. Le témoin ARB 2023 reste disponible pour smoke de schéma uniquement (`WITNESS`).
- **Sentinelle** : `Triturus cristatus` (`CD_REF 139`) — ZNIEFF `Déterminante stricte`, LRR `VU` Bourgogne et `VU` Franche-Comté.

#### ZNIEFF — `IMPORTED`

- **Page ressources** : https://www.bourgogne-franche-comte.developpement-durable.gouv.fr/ressources-a10417.html
- Importées depuis le tableur maître 2026.

#### Listes rouges — `IMPORTED` / selon groupes

- Utiliser en priorité les données du tableur maître lorsque la provenance et le millésime du groupe y sont explicites.
- Les LRR unifiées BFC et les LRR d'anciennes régions coexistent sans chevauchement de taxons dans le millésime 2026.

#### Action suivante

Surveiller les prochaines mises à jour du tableur maître ; conserver les portées partielles Bourgogne / Franche-Comté tant qu'une LRR unifiée n'existe pas pour le groupe.

---

### BRE — Bretagne

#### ZNIEFF — `READY`

- **DREAL** : https://www.bretagne.developpement-durable.gouv.fr/especes-determinantes-pour-la-realisation-des-a211.html
- **Observatoire de l'environnement en Bretagne (OEB)** : https://bretagne-environnement.fr/tableau-de-bord/especes-habitats-determinants-znieff-bretagne
- La DREAL renvoie vers l'OEB pour la consultation et le téléchargement.
- **Format intéressant** : CSV téléchargeable pour la liste des espèces déterminantes.
- **Décision pipeline** : très bon candidat pour un adaptateur reproductible, à condition d'enregistrer la date/millésime réellement exposé par le fichier.

#### Listes rouges — `READY`

- **OEB — synthèse risque régional de disparition** : https://bretagne-environnement.fr/thematique/patrimoine-naturel/article/indicateurs-risque-regional-disparition-especes-bretonnes
- Page vérifiée comme ressource active en 2025 ; elle centralise les LRR régionales et leurs mises à jour par groupes.
- Des groupes ont été réévalués récemment, notamment oiseaux nicheurs et poissons d'eau douce.

#### Responsabilité biologique régionale — `READY` à qualifier

- L'OEB publie également des indicateurs de responsabilité biologique régionale.
- À intégrer uniquement comme catégorie autonome (`regional_responsibility`) et jamais comme pseudo-score patrimonial universel.

#### Action suivante

Écrire un adaptateur OEB Bretagne séparant clairement ZNIEFF, LRR et responsabilité régionale.

---

### CVL — Centre-Val de Loire

#### ZNIEFF — `READY_WHEN_AVAILABLE`

- **Producteur** : DREAL Centre-Val de Loire.
- **Page officielle** : https://www.centre-val-de-loire.developpement-durable.gouv.fr/habitats-et-especes-determinantes-a4278.html
- **Dernier millésime identifié** : tableur 2026, mise à jour de la page le 02/04/2026.
- **Fichier officiel identifié** : https://www.centre-val-de-loire.developpement-durable.gouv.fr/IMG/xls/listes_dz_cvl_actual_avril_2026.xls
- **Format** : XLS, un onglet par groupe.
- **Blocage au 21/08/2026** : depuis les runners GitHub, l'URL renvoie momentanément une page HTML de maintenance au lieu du XLS.
- **Décision pipeline** : garder cette URL comme source officielle à sonder ; **aucun fallback vers un millésime plus ancien ne doit être publié comme 2026**.

#### Listes rouges — `READY`

- **Page officielle** : https://www.centre-val-de-loire.developpement-durable.gouv.fr/listes-rouges-en-region-centre-val-de-loire-a1451.html
- **Page vérifiée** : publication/mise à jour en février 2026.
- Le portail liste les LRR validées par groupe et leurs millésimes, avec des évaluations récentes pour plusieurs groupes faunistiques ; la flore vasculaire reste sur un millésime plus ancien.

#### Rareté / indigénat — `RESEARCH_REQUIRED`

- CBNBP est une piste naturelle, mais le futur import doit reposer sur une ressource actuelle, versionnée et structurée. Ne pas utiliser un ancien catalogue uniquement parce qu'il est facilement téléchargeable.

#### Action suivante

Reprendre le connecteur ZNIEFF 2026 dès que le serveur DREAL sert à nouveau le vrai XLS, puis qualifier un jeu CBNBP récent pour rareté/indigénat.

---

### COR — Corse

#### Listes rouges — `PARTIAL`

- **DREAL Corse — hub LRR** : https://www.corse.developpement-durable.gouv.fr/listes-rouges-d-especes-menacees-a1997.html
- Page active et mise à jour en 2026.
- **Flore vasculaire** : l'Office de l'Environnement de la Corse publie une liste rouge régionale validée UICN/CSRPN : https://www.oec.corsica/A-lista-rossa-he-dispunibule-_a126.html
- Les ressources identifiées sont souvent documentaires/PDF ; privilégier un tableau structuré si disponible avant d'écrire un importeur.

#### ZNIEFF — `RESEARCH_REQUIRED`

- **Méthode officielle** : https://www.corse.developpement-durable.gouv.fr/note-methodologique-pour-la-creation-des-listes-a2204.html
- La méthode de constitution/actualisation des listes déterminantes a été validée en 2024.
- **Hub inventaires** : https://www.corse.developpement-durable.gouv.fr/inventaires-et-donnees-r160.html
- Aucun tableur consolidé, actuel et machine-readable couvrant tous les groupes n'a encore été retenu dans ce registre.

#### Action suivante

Chercher le fichier opérationnel utilisé pour l'inventaire ZNIEFF corse avant toute substitution à la BDC. En attendant, conserver la BDC comme socle.

---

### GES — Grand Est

#### ZNIEFF — `IMPORTED` pour la faune et la flore vasculaire

- **DREAL Grand Est** : https://www.grand-est.developpement-durable.gouv.fr/les-nouvelles-listes-d-especes-determinantes-a22851.html
- **Page vérifiée** : mise à jour indiquée au 16/07/2026.
- **Faune — source utilisée par le projet** : LEDZfauna v2.2, juin 2026 ; URL DREAL en premier, miroir ODONAT Grand Est en secours.
- **Fichier faune** : https://www.odonat-grandest.fr/wp-content/uploads/2026/08/listes_especes-determinantes-znieff_grand-est_juin2026.xlsx
- **SHA-256 faune** : `8b5e6026c844c3ca469d4adc9e75fd6e74532a1f6ad68c2ad8d08d54e00f5dfa`.
- **Identifiant pipeline faune** : `dreal-ges-odonat-znieff-fauna-2026-v2.2`.
- **Flore vasculaire** : LEDZflora v1.0, août 2024 — importée.
- **Fichier flore** : https://www.grand-est.developpement-durable.gouv.fr/IMG/xlsx/listes_edz_aee_florev1_08_2024_2_.xlsx
- **SHA-256 flore** : `d95b53ebaff27683b58476f8cd4dd39b59190fd3f9e571da284e6d936174af1d`.
- **Identifiant pipeline flore** : `dreal-ges-znieff-flora-2024-08-v1.0`.
- Les listes intègrent des niveaux de priorité et plusieurs entités naturelles ; conserver ces portées/qualificatifs plutôt que de les écraser.
- Ne pas extraire l'annexe PDF comme substitut d'un tableur officiel.

#### Listes rouges — `PARTIAL` selon groupes

- **Hub LRR Grand Est** : https://www.grand-est.developpement-durable.gouv.fr/listes-rouges-grand-est-a22124.html
- Page vérifiée en avril 2026.
- Plusieurs groupes faunistiques disposent de listes rouges unifiées Grand Est et de tableaux téléchargeables.
- **Listes historiques** : https://www.grand-est.developpement-durable.gouv.fr/listes-rouges-regionales-historiques-a18396.html
- Tant qu'un groupe n'a pas de LRR Grand Est unifiée, les anciennes listes Alsace / Champagne-Ardenne / Lorraine doivent rester des portées partielles.
- **Flore** : ne pas inventer une LRR unifiée Grand Est ; des travaux restent à mener sur plusieurs groupes floristiques.

#### Action suivante

Importer les LRR unifiées groupe par groupe en laissant les anciennes régions explicites pour le reste.

---

### HDF — Hauts-de-France

#### ZNIEFF — `PARTIAL`

- **DREAL Hauts-de-France** : https://www.hauts-de-france.developpement-durable.gouv.fr/Inventaire-des-ZNIEFF-terrestres
- Les ressources disponibles restent hétérogènes : listes Picardie et Nord-Pas-de-Calais pour certains groupes, méthode/flore plus unifiée, mises à jour par groupe.
- **Décision pipeline** : ne jamais convertir automatiquement une liste Picardie ou Nord-Pas-de-Calais en statut « Hauts-de-France » complet.

#### Listes rouges — `PARTIAL`

- **DREAL** : https://www.hauts-de-france.developpement-durable.gouv.fr/Les-listes-rouges-regionales.html
- Des listes unifiées Hauts-de-France existent pour certains groupes, notamment flore/bryoflore ; pour d'autres, les anciennes évaluations Nord-Pas-de-Calais et Picardie restent les références disponibles en attendant leur remplacement.

#### Action suivante

Construire d'abord un modèle de portées historiques robuste, puis importer les groupes réellement unifiés. HDF est un bon test de non-régression géographique.

---

### IDF — Île-de-France

#### ZNIEFF — `READY`

- **Producteur** : DRIEAT Île-de-France.
- **Page officielle** : https://www.drieat.ile-de-france.developpement-durable.gouv.fr/liste-des-habitats-et-especes-determinants-de-a3340.html
- **Page vérifiée** : mise à jour indiquée au 23/07/2026.
- **Format** : CSV disponible pour la liste des espèces déterminantes ZNIEFF.
- La liste est mise à jour de façon continue et des ajouts 2026 sont signalés pour certains groupes.

#### Listes rouges — `PARTIAL` selon groupes

- **ARB Île-de-France — publications** : https://www.arb-idf.fr/nos-ressources/publications/
- Les LRR sont publiées groupe par groupe et avec des millésimes différents ; utiliser la publication officielle la plus récente pour chaque groupe.
- Ne pas chercher à fabriquer un « millésime LRR IDF » unique si les groupes n'ont pas été évalués ensemble.

#### Action suivante

Importer d'abord le CSV ZNIEFF DRIEAT ; construire ensuite une matrice LRR par groupe avec ARB/GeoNat'ÎDF/organismes producteurs.

---

### NOR — Normandie

#### ZNIEFF — `PARTIAL`

- **DREAL Normandie** : https://www.normandie.developpement-durable.gouv.fr/les-listes-d-especes-et-d-habitats-determinants-de-a3126.html
- **Page vérifiée** : mise à jour indiquée au 27/02/2025.
- La DREAL précise que des listes issues des anciennes Basse-Normandie et Haute-Normandie restent opérationnelles pour certains groupes, les listes unifiées devant les remplacer progressivement.
- Une liste synthétique Normandie 2024 est signalée dans les ressources DREAL ; vérifier son périmètre et son format avant de la traiter comme source autoritaire.

#### Listes rouges — `READY` pour groupes unifiés, sinon `PARTIAL`

- **DREAL** : https://www.normandie.developpement-durable.gouv.fr/les-listes-rouges-dans-le-monde-et-en-normandie-a6663.html
- Page vérifiée en octobre 2025.
- Plusieurs groupes possèdent désormais une LRR Normandie unifiée, notamment amphibiens, reptiles, mammifères, odonates, orthoptères et apparentés, rhopalocères/zygènes, ainsi qu'une liste oiseaux nicheurs récente.

#### Action suivante

Importer les LRR unifiées sans attendre, puis traiter les ZNIEFF historiques avec une portée Basse-/Haute-Normandie explicite tant qu'un remplacement unifié n'est pas démontré.

---

### NAQ — Nouvelle-Aquitaine

#### ZNIEFF — `IMPORTED` pour la flore vasculaire et les groupes unifiés listés

- **DREAL Nouvelle-Aquitaine — listes néo-aquitaines** : https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/les-listes-neo-aquitaines-a11234.html
- **Page vérifiée** : mise à jour indiquée au 10/08/2026.
- La DREAL recense les listes unifiées disponibles par groupe et précise que les anciennes listes régionales restent valables tant qu'elles ne sont pas remplacées.

**Flore vasculaire** :

- **Source utilisée par le projet** : liste des espèces déterminantes ZNIEFF de la flore vasculaire de Nouvelle-Aquitaine, v1.2, 2019.
- **Producteurs** : CBN Sud-Atlantique, CBN Massif central, CBN Pyrénées et Midi-Pyrénées / cadre régional.
- **Fichier** : https://obv-na.fr/ofsa/ressources/4_ref_bioeval/CBN_2019-Liste_ED_ZNIEFF_flore_Nouvelle-Aquitaine_v1.2_tb.xlsx
- **État projet** : intégrée ; raccord TAXREF v18 mesuré à 99,27 % lors du développement initial.

**Autres groupes ZNIEFF unifiés — `IMPORTED`** :

| Groupe | Identifiant pipeline | SHA-256 |
|---|---|---|
| Characées 2023 | `dreal-naq-znieff-characees-2023` | `0704cbff…` |
| Oiseaux nicheurs 2023 | `dreal-naq-znieff-oiseaux-nicheurs-2023` | `93811416…` |
| Araignées 2023 | `dreal-naq-znieff-araignees-2023` | `5ad29616…` |
| Amphibiens 2024-09 | `dreal-naq-znieff-amphibiens-2024-09` | `9f2e117e…` |
| Reptiles 2024-09 | `dreal-naq-znieff-reptiles-2024-09` | `1f5511a5…` |
| Mollusques continentaux 2025 | `dreal-naq-znieff-mollusques-2025` | `ed3ea1b1…` |
| Orthoptères 2026 | `dreal-naq-znieff-orthopteres-2026` | `9fdcea34…` |
| Oiseaux marins 2026 | `dreal-naq-znieff-oiseaux-marins-2026` | `aa139c51…` |

Les portées départementales, exceptions CSRPN et conditions de déterminance sont conservées (`partial` + `scopeLabel`). Les valeurs de condition de plus de 80 caractères sont omises.

**Hors périmètre actuel** : végétations 2023, habitats naturels 2024, mammifères marins/tortues marines 2020 (pas dans les groupes READY branchés).

#### Listes rouges — `PARTIAL` + `PENDING_PUBLICATION`

- **DREAL — listes rouges régionales** : https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/les-listes-rouges-regionales-a9991.html
- **Page vérifiée** : mise à jour indiquée au 11/05/2026.
- **CSRPN 2026** : https://www.nouvelle-aquitaine.developpement-durable.gouv.fr/2026-decisions-et-avis-du-csrpn-a15517.html
- Un avis 2026 concerne notamment une LRR de la flore vasculaire et un autre des propositions de protection de la flore.
- **Décision pipeline** : ces avis restent en `PENDING_PUBLICATION` tant que la liste finale opérationnelle n'est pas publiée sous une forme officielle exploitable.

#### Plantes exotiques envahissantes 2022 — `DO_NOT_IMPORT` actuellement

- **Fichier OBV** : https://obv-na.fr/ofsa/ressources/5_ref_eee/CBNSA_2022-Liste_hierarchisee_PEE_NA_v1.0.xlsx
- Le nom de la ressource suggère une v1.0, mais les métadonnées internes du classeur récupéré le 21/08/2026 indiquent **« Version 0.9 (version non validée) »** et une consultation encore en cours.
- **Décision pipeline** : ne pas présenter cette ressource comme référentiel officiel final tant que l'incohérence n'est pas levée.

#### Action suivante

Surveiller la publication finale des LRR / protections flore 2026 ; brancher végétations / habitats / mammifères marins si les tableurs machine sont stabilisés.

---

### OCC — Occitanie

#### ZNIEFF — `READY_WHEN_AVAILABLE`

- **DREAL Occitanie** : https://www.occitanie.developpement-durable.gouv.fr/vers-des-znieff-troisieme-generation-en-occitanie-a24635.html
- Le portail fournit des classeurs distincts pour habitats, flore déterminante, faune déterminante, champignons et lichens.
- **Flore — fichier officiel identifié** : https://www.occitanie.developpement-durable.gouv.fr/IMG/xlsx/liste_taxons_det_flore_occitanie_cotation_v13-v16_osmose_public.xlsx
- **Faune — fichier officiel identifié** : https://www.occitanie.developpement-durable.gouv.fr/IMG/xlsx/listes_faune_znieff_20240725.xlsx
- **Particularité** : plusieurs zones biogéographiques sont utilisées (Méditerranée, Massif central, Pyrénées, Sud-Ouest). Elles doivent être conservées comme portées métier.
- **Blocage au 21/08/2026** : les runners GitHub reçoivent actuellement une page HTML de maintenance à la place des XLSX.
- **Décision pipeline** : sonder les URLs officielles et importer dès que les vrais fichiers redeviennent accessibles ; ne pas substituer silencieusement un ancien millésime.

#### Listes rouges — `PARTIAL` + `PENDING_PUBLICATION`

- **DREAL — hub LRR Occitanie** : https://www.occitanie.developpement-durable.gouv.fr/les-listes-rouges-regionales-en-occitanie-r8985.html
- La page centralise des listes unifiées Occitanie et, lorsque nécessaire, les anciennes listes Languedoc-Roussillon / Midi-Pyrénées.
- Des avis CSRPN 2026 portent notamment sur la flore vasculaire et les amphibiens/reptiles ; ils sont à surveiller mais ne doivent pas être assimilés à une publication finale tant que le dataset correspondant n'est pas sorti.

#### Action suivante

Brancher ZNIEFF flore/faune dès retour des XLSX ; puis intégrer les LRR réellement unifiées groupe par groupe en maintenant les anciennes régions comme portées partielles pour le reste.

---

### PDL — Pays de la Loire

#### ZNIEFF — `READY` avec mises à jour à surveiller

- **DREAL Pays de la Loire** : https://www.pays-de-la-loire.developpement-durable.gouv.fr/les-listes-des-especes-determinantes-et-habitats-a4613.html
- Le socle publié comprend notamment les listes continentales faune/flore/habitats 2018 en ODS et des compléments par milieux/groupes.
- **CSRPN 2022-2026** : https://www.pays-de-la-loire.developpement-durable.gouv.fr/2022-2026-a6457.html
- Des avis de juin 2026 concernent notamment des listes déterminantes bryophytes et characées.
- **Décision pipeline** : utiliser les jeux officiellement publiés sur la page ZNIEFF comme source autoritaire ; marquer les avis 2026 `PENDING_PUBLICATION` jusqu'à intégration dans le jeu opérationnel.

#### Listes rouges — `RESEARCH_REQUIRED` pour consolidation

- Des LRR officielles existent par groupes et millésimes, mais aucun tableur maître inter-groupes suffisamment clair n'a encore été retenu dans ce registre.
- **Décision pipeline provisoire** : BDC v18 reste le socle, complété ultérieurement par des sources régionales groupe par groupe lorsque leur fichier et leur provenance ont été qualifiés.

#### Rareté / indigénat — `RESEARCH_REQUIRED`

- CBN de Brest et partenaires régionaux sont à investiguer pour un catalogue structuré actuel ; ne pas brancher un ancien PDF ou tableur sans vérifier son statut de référentiel courant.

#### Action suivante

Qualifier les nouvelles listes ZNIEFF 2026 dès publication opérationnelle, puis réaliser une recherche dédiée LRR/CBN pour obtenir un jeu régional structuré.

---

### PAC — Provence-Alpes-Côte d'Azur

#### ZNIEFF — `IMPORTED`

- **DREAL PACA** : https://www.paca.developpement-durable.gouv.fr/actualisation-de-l-inventaire-a9673.html
- **Faune** : `znieff_faune_janv-2024.xlsx` → `dreal-pac-znieff-fauna-2024-01` (SHA `d38ffb58…`) — valeurs `Déterminante` / `Remarquable`.
- **Flore** : `znieff_flore_2016.xls` → `dreal-pac-znieff-flora-2016` (SHA `1c39c39f…`) — même sémantique ; en cas de double statut, priorité à `Déterminante`.

#### Listes rouges — `IMPORTED` selon groupes

- **DREAL PACA — hub LRR** : https://www.paca.developpement-durable.gouv.fr/listes-rouges-regionales-a7296.html
- Groupes importés : oiseaux 2020, odonates 2017, papillons 2024, flore 2015 (menacées), amphibiens/reptiles 2016, orthoptères 2018.
- La flore LRR ne couvre que les taxons menacés : `replaces` limité aux `cdRefs` couverts.

#### Rareté / indigénat — à qualifier

- Les CBN méditerranéen et alpin restent à investiguer pour des catalogues floristiques structurés hors LRR/ZNIEFF.

#### Action suivante

Surveiller les révisions DREAL ; brancher les attributs CBN comme enrichissements autonomes.

---

## 5. Watchlist transversale

Cette section doit être relue avant chaque nouvelle vague d'enrichissement.

| Sujet | État au 21/08/2026 | Action |
|---|---|---|
| Tableur maître BFC 03/03/2026 | Importé ; SHA-256 `4c16ef90…` | Surveiller les prochaines versions DREAL |
| ZNIEFF flore Grand Est 08/2024 | Importée ; SHA-256 `d95b53eb…` | Surveiller les révisions LEDZflora |
| ZNIEFF CVL 2026 | Source officielle identifiée mais DREAL renvoie une page de maintenance aux runners GitHub | Retester le fichier, ne pas utiliser 2025 comme faux 2026 |
| ZNIEFF Occitanie flore/faune | Fichiers officiels identifiés mais même maintenance DREAL | Retester, éventuellement qualifier le comportement HTTP/User-Agent sans changer de source |
| NAQ flore LRR 2026 | Avis CSRPN repéré | Attendre la publication finale exploitable |
| NAQ protections flore 2026 | Avis/proposition CSRPN repéré | Attendre le texte/référentiel final applicable |
| NAQ PEE/EEE 2022 | Fichier public mais métadonnées internes « v0.9 non validée » | Ne pas importer avant clarification |
| ARA flore LRR unifiée | Travail annoncé, horizon 2027 | Conserver les portées historiques jusqu'à publication |
| GES flore LRR unifiée | Couverture encore incomplète | Conserver les anciennes régions pour les groupes non unifiés |
| HDF | Nombreux jeux encore issus de Picardie / Nord-Pas-de-Calais | Ne jamais étendre automatiquement à toute la région |
| Normandie ZNIEFF | Transition Basse-/Haute-Normandie vers jeux unifiés | Conserver la portée historique jusqu'à remplacement démontré |
| PDL déterminantes bryophytes/characées 2026 | Avis CSRPN 2026 | Attendre l'intégration dans la ressource opérationnelle DREAL |

## 6. Protocole obligatoire avant d'intégrer une source

Pour chaque nouvelle source ou nouveau millésime :

1. Revenir sur la **page officielle de publication**, pas uniquement sur une ancienne URL de fichier.
2. Vérifier la date de mise à jour de la page et le millésime annoncé dans le fichier.
3. Télécharger la ressource en CI et vérifier son type réel (`PK` pour XLSX/ODS ZIP, signature XLS, CSV texte, etc.) afin de détecter les pages de maintenance renvoyées à la place d'un fichier.
4. Lire les métadonnées internes / onglets / en-têtes et vérifier qu'elles sont cohérentes avec le millésime affiché sur le portail.
5. Calculer et enregistrer un **SHA-256** du fichier réellement importé.
6. Raccorder les taxons à TAXREF via `CD_REF` lorsqu'il existe ; sinon nom scientifique + synonymes TAXREF, avec rapport `exact / synonym / ambigu / non résolu`.
7. Fixer un seuil minimum de raccord avant publication. Le seuil peut varier selon la source mais doit être explicite et bloquant.
8. Tester les restrictions territoriales : anciennes régions, départements, zones biogéographiques et autres limitations.
9. Comparer la couverture régionale avant/après override pour détecter une suppression accidentelle de catégories.
10. Ajouter plusieurs **taxons sentinelles** vérifiés manuellement contre la publication officielle.
11. Ajouter la source au manifeste du dataset avec sa version et sa date de vérification.
12. Mettre à jour le présent registre si une source plus récente, plus complète ou plus autoritaire a été découverte.

## 7. Ordre recommandé pour la suite de l'enrichissement

À données accessibles et validées égales :

1. **Pays de la Loire** — ZNIEFF 2018 ODS faune/flore.
2. **Grand Est** — LRR unifiées groupe par groupe (ZNIEFF faune/flore déjà importées).
3. **Bretagne** — responsabilité biologique régionale (ZNIEFF/LRR OEB déjà branchés).
4. **Île-de-France** — LRR par groupe (ZNIEFF déjà faite).
5. **Bourgogne-Franche-Comté** — surveiller les prochaines versions du tableur maître déjà importé.
6. **Île-de-France** — CSV ZNIEFF puis LRR par groupe.
7. **Centre-Val de Loire** et **Occitanie** — dès retour effectif des fichiers DREAL.
8. **Normandie**, **Hauts-de-France**, **Pays de la Loire**, **ARA**, **Corse** — avec une attention particulière aux portées historiques ou aux trous de consolidation.

Cet ordre n'est pas une hiérarchie écologique : il vise le meilleur rapport **fiabilité de la source / caractère structuré / gain métier / coût d'adaptation**.
