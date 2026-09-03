# Roadmap technique — moteur de statuts d’espèces FR

Document de référence pour les développements à venir.
Dernière actualisation : 2026-09-01. PR-A (matrice de couverture, #28) et PR-B (alignement documentaire) sont réalisées.

**Ce document n’autorise aucun chantier.** Chaque phase se traite dans une PR dédiée, petite et vérifiable. Ne pas lancer une refonte générale du pipeline ni du front à partir de ce fichier.

---

## 1. Vision

Le projet n’est plus seulement une PWA affichant des statuts.

Cible à moyen terme :

> Un moteur français de résolution des statuts réglementaires et patrimoniaux d’un taxon selon son territoire, avec données traçables et fonctionnement offline.

La PWA actuelle devient **un consommateur** de ce moteur parmi d’autres. Le même cœur doit pouvoir, à terme, alimenter :

- la PWA terrain ;
- un traitement CSV / XLSX ;
- un plugin QGIS ;
- éventuellement une API et un package réutilisable.

Principe directeur :

**le cœur métier ne dépend pas de l’interface.**

Question unique à laquelle le projet doit rester excellent :

> Quels statuts réglementaires et patrimoniaux sont applicables à ce taxon, ici, et sur quelles sources cette réponse repose-t-elle ?

---

## 2. État actuel du repository

Audit au 2026-09-01 (`origin/main` = `ba45762`, PR #26 mergée).

### 2.1 Ce qui existe déjà

| Couche | État | Fichiers clés |
|---|---|---|
| PWA offline-first | Fonctionnelle (Vite + `vite-plugin-pwa`) | `src/main.ts`, `src/catalog.ts`, `index.html`, `vite.config.ts` |
| Recherche taxon | Extraite, testée | `src/search.ts` |
| Hydratation des liens | Extraite, testée | `src/status-data.ts` |
| Aide de lecture des codes | Extraite, testée ; glossaire **applicatif** séparé des données officielles | `src/status-help.ts` |
| Page Sources | Présente, filtrable par région | `src/main.ts` (`renderSources`) |
| Pipeline national | TAXREF v18 + BDC v18 → manifeste v3 | `data-pipeline/pipeline.mjs`, `build.mjs`, `compact.mjs` |
| Modèle territorial BDC | Régions actuelles, anciennes régions, départements | `data-pipeline/regions.mjs` (`resolveScope`) |
| Enrichissement régional | Paquets JSON + merge ciblé (région × règne × catégorie, éventuellement `cdRefs`) | `data-pipeline/regional.mjs` |
| Registre humain | Matrice + protocoles d’import | `data-pipeline/REGIONAL_SOURCES.md` |
| Registre machine | 26 sources, états `IMPORTED` / `WITNESS` | `data-pipeline/regions/ready-sources.json` |
| Adaptateurs régionaux | Scripts bash + Python **par source** | `data-pipeline/regions/{ara,bfc,bre,…}/` |
| Validation métier | Sentinelles sur jeux générés | `data-pipeline/validate-generated.mjs` |
| Audits régionaux | 13 fichiers `docs/data-sources-*.md` | `docs/` |
| Déploiement | Artifact CI → FTP statique | `docs/deployment-ftp.md`, `.github/workflows/build-production.yml` |

Le contrat de dataset consommé par la PWA est déjà stable :

```text
public/data/
├── manifest.json                 # schemaVersion 3
├── taxa-{flora|fauna}-<hash>.json
├── status-definitions-<hash>.json
└── status-links-{realm}-{region}-<hash>.json
```

Une définition embarquée = `{ category, label, value, sourceId }`. Citations et URL documentaires sont volontairement absentes du bundle (contrainte offline / taille). Les liens sont `[cdRef, definitionId, scopeCode, scopeLabel?]`.

À l’exécution, la PWA :

1. charge le règne + les liens de **une** région ;
2. filtre `status.cdRef === taxon.cdRef` ;
3. retire les « sans objet » (`usefulStatus` dans `src/main.ts`) ;
4. trie selon un ordre de catégories ;
5. affiche ou le message d’absence relative aux référentiels intégrés.

**Il n’existe pas encore de `resolveStatuses()`.** Cette logique est implicitement dans `main.ts` + `hydrateStatusLinks`.

### 2.2 Couverture régionale (constat d’audit)

La matrice générée existe depuis **PR-A** : [`docs/generated/source-coverage.md`](generated/source-coverage.md) et [`data-pipeline/generated/coverage.json`](../data-pipeline/generated/coverage.json). Le constat ci-dessous reste celui de l’audit initial.

Les 13 régions métropolitaines sont dans le manifeste. Le socle BDC est national. Des référentiels régionaux sont **importés** pour la plupart des régions (ZNIEFF et/ou LRR), avec des trous documentés :

- **Corse** : consolidation ZNIEFF encore `RESEARCH_REQUIRED` ;
- **HDF faune ZNIEFF** : encore partielle (flore/bryo Digitale importées) ;
- **NOR ZNIEFF** : seulement Haute-Normandie flore ;
- **PDL LRR** : `RESEARCH_REQUIRED` ;
- **OCC / NAQ LRR** : travaux 2026 en attente de publication machine ;
- **papillons de nuit / Sphingidae** : souvent aucun statut dans les sources intégrées. *Hyles euphorbiae* (CD_REF 54843) : aucun statut projeté en CVL ; des statuts ZNIEFF partiels sont confirmés en HDF et NOR. Ce cas illustre un trou de couverture possible, pas un bug de mapping. Les sentinelles ne vérifient pas les 13 régions.

Dette identifiée à l’audit initial ; corrigée par **PR-A** (matrice générée, non éditée à la main).

### 2.3 Documentation devenue fausse ou incomplète

À corriger dans la phase P0 — **ne pas les « réparer » au fil de l’eau dans une PR fonctionnelle**.

| Fichier | Problème |
|---|---|
| `data-pipeline/README.md` | Dette identifiée à l’audit (« trois régions pilotes », volumes 229 813 / 686, « prochaine ingestion ZNIEFF DREAL 2026 », BFC « inaccessible ») ; **corrigée par PR-B**. |
| `README.md` | Dette identifiée (positionnement « PWA MVP », index docs incomplet) ; **corrigée par PR-B**. Les volumes du socle TAXREF+BDC restent ceux de la baseline métropolitaine, avec périmètre explicite. |
| `docs/README.md` | Dette identifiée (4 audits sur 13) ; index déjà complété avant PR-B, lien pipeline ajouté. |
| GitHub About | Description, topics, licence et homepage **vides**. |
| Licence | Aucun `LICENSE` ; `package.json` n’a pas de champ `license`. |

Les audits `docs/data-sources-*.md` et `REGIONAL_SOURCES.md` sont globalement alignés avec le pipeline (états `IMPORTED`). Le décalage README / index `docs/` constaté à l’audit est traité par **PR-B**.

### 2.4 CI et acquisition

- **CI applicative** (`.github/workflows/ci.yml`) : `npm test` + `npm run build`. Saine.
- **~26 workflows** régionaux / smoke / probe, plus `data-smoke.yml` et `build-production.yml`. Chaque référentiel a essentiellement son propre YAML.
- Fail-closed SHA-256 dans les scripts `download_*.sh`.
- Fallback archive **déjà présent** pour ARA ZNIEFF (`download_dreal_znieff.sh` → Internet Archive si maintenance).
- **Pas de fallback** pour ARA LRR `oiseaux-mammiferes.ods` ni pour BFC 2026 : une republication byte-différente ou une page de maintenance **casse** `data-smoke` et `build-production`. Incident observé (2026-09-01) : checksum ARA instable ; DREAL BFC en maintenance.

### 2.5 Ce qui n’existe pas encore

- Licence du code.
- Modèle d’état d’acquisition unifié (`READY` / `UNAVAILABLE` / `CHANGED_UNVERIFIED` / …) au runtime CI.
- Interface `SourceAdapter` + runner générique.
- Diagnostics standardisés persistés (taux de résolution, ambiguïtés, seuils par source).
- `resolveStatuses()` indépendant de l’UI.
- Choix départemental dans la PWA (le modèle `departments` existe côté pipeline uniquement).
- Traitement de listes / CSV.
- Plugin QGIS, package, API.

---

## 3. Principes architecturaux

Non négociables. Toute PR qui les enfreint est hors contrat.

1. **TAXREF** est le référentiel taxonomique (`CD_REF` accepté, synonymes rattachés).
2. Sources **officielles / institutionnelles** privilégiées. Présence ≠ statut. Avis CSRPN ≠ jeu opérationnel.
3. **Provenance et millésime** conservés (producteur, version, `checkedAt`, SHA-256 du fichier importé).
4. **Fail-closed** si une source change de façon non vérifiée. Distinguer toutefois « inaccessible » et « contenu modifié ».
5. Données brutes **hors Git**. Code découplé des données.
6. **Offline-first**, pas de backend obligatoire pour la PWA.
7. **Aucune donnée réglementaire inventée.** Ne jamais déduire une portée juridique depuis un code (`<préfixe><N>` ≠ article N).
8. Anciens territoires et portées `partial` **explicites**. Pas d’extension géographique implicite.
9. Pipeline **reproductible** ; sentinelles métier bloquantes.
10. Performances téléphone : ne charger que le règne + la région consultés.
11. Le cœur métier **ne dépend pas** de `main.ts`, du DOM, ni d’un serveur HTTP.
12. Ne pas dériver vers GeoNature (pas de saisie d’observations, comptes, photos, carto naturaliste, IA d’interprétation).

Couches cibles (de bas en haut) :

```text
Registre des sources + acquisition
        │
        ▼
Adaptateurs → paquets régionaux normalisés
        │
        ▼
build.mjs → dataset manifeste v3
        │
        ▼
resolveStatuses()     ← unique moteur métier
        │
 ┌──────┼──────────┐
 ▼      ▼          ▼
PWA   Batch/CSV   QGIS / package / API
```

---

## 4. Dette / risques actuels

1. **Fragilité d’acquisition** — un SHA instable ou une page HTML de maintenance bloque plusieurs workflows de données. Le fail-closed est juste ; l’absence de diagnostic d’état et de fallback déclaré ne l’est pas.
2. **Explosion des workflows** — ~26 YAML spécifiques. Coût de maintenance croissant ; pas de runner générique.
3. **Double registre** — `REGIONAL_SOURCES.md` (humain) et `ready-sources.json` (machine) peuvent diverger. La matrice de couverture est désormais générée depuis le registre machine ; cela ne garantit pas l’alignement du registre humain.
4. **Logique métier dans l’UI** — filtre, tri, empty state, choix des sources affichées vivent dans `main.ts`. Risque de duplication dès qu’un batch ou QGIS apparaîtra.
5. **Diagnostics inégaux** — `mergeRegionalPackages` compte `imported` / `unknownRefs`. Les scripts Python ont chacun leurs prints. Pas de contrat unique, pas de seuils déclarés par source, pas d’artifact stable.
6. **Documentation décalée** — dette identifiée à l’audit initial ; corrigée par **PR-B**.
7. **Licence absente** — repository public sans contrat de réutilisation du **code**. Les données sources ont de toute façon leurs propres conditions.
8. **Couverture invisible** — le retour terrain « rien ne ressort » (papillons) est un trou de référentiels. La matrice générée (**PR-A**) le rend inspectable ; elle ne comble pas les trous.

---

## 5. Roadmap

Ordre retenu (voir justification en §5.0) :

```text
P0     Gouvernance / docs / matrice de couverture
  ↓
P0.5   Robustesse de l’acquisition          ┐
  ↓                                         ├ peuvent chevaucher après P0
P1-C   resolveStatuses()                    ┘
  ↓
P1-A   SourceAdapter + registre (pilote)
  ↓
P1-B   Diagnostics et seuils
  ↓
P2-A   Territorialisation départementale
  ↓
P2-B   Listes / CSV
  ↓
P2-C   Plugin QGIS
  ↓
P3     Dataset / package / API
```

### 5.0 Pourquoi P1-C avant P1-A / P1-B

L’ordre initial proposait d’industrialiser les adapters avant d’extraire le moteur. L’architecture réelle le déconseille :

- le **contrat de consommation** (manifeste v3, définitions, liens, `hydrateStatusLinks`) est déjà stable et testé ;
- `resolveStatuses` n’a **pas besoin** d’un `SourceAdapter` : il lit le dataset déjà produit ;
- la logique métier continue de s’accumuler dans `main.ts` (PR #26 : empty state, aide). Plus on attend, plus la migration UI sera large ;
- P1-A/B sont un chantier d’**ingestion**, plus long, orthogonal, et déjà partiellement anticipé par `ready-sources.json` + `validateRegionalPackage`.

P0.5 reste **prioritaire pour la santé CI des données** (incidents ARA/BFC). P1-C peut démarrer en parallèle dès que P0 a figé le vocabulaire (couverture, absence de statut, états de source).

Ne **pas** inverser P2-A avant P1-C : le département n’a de sens que dans le resolver, pas dans `main.ts`.

---

### PHASE P0 — Gouvernance et documentation

#### Objectif

Rendre le repository compréhensible par quelqu’un qui n’a pas participé à son développement, et pouvoir répondre objectivement « quelles sources sont couvertes ? ».

#### Pourquoi maintenant

La phase d’intégration régionale (PR #14–#26) est close. Sans gouvernance, les prochaines PRs vont continuer à raconter des états différents (README vs pipeline vs registre).

#### Dépendances

Aucune. Point d’entrée.

#### Fichiers / composants concernés

- `LICENSE` (après décision humaine — ne pas le créer dans une PR d’agent sans arbitrage)
- `README.md`, `data-pipeline/README.md`, `docs/README.md`
- éventuellement About GitHub (description, topics) — action mainteneur, hors Git
- génération : `data-pipeline/regions/ready-sources.json`, `data-pipeline/build.mjs` ou script dédié → `docs/generated/source-coverage.md` et/ou `public/data/coverage.json`

#### Architecture cible

- Un index `docs/` à jour.
- README racine : vision **moteur + PWA consommatrice**, pas seulement « app mobile ».
- Matrice de couverture **générée** depuis le registre machine (+ manifeste du dernier build officiel si disponible), jamais éditée à la main.
- Vocabulaire d’états aligné sur le registre existant (`READY`, `IMPORTED`, `READY_WHEN_AVAILABLE`, `PARTIAL`, `PENDING_PUBLICATION`, `RESEARCH_REQUIRED`, `DO_NOT_IMPORT`, `WITNESS`) plutôt que d’inventer une deuxième taxonomie. Les états d’**acquisition** (P0.5) sont une dimension distincte (fichier joignable ou non).

#### Hors périmètre

- Choisir la licence à la place du mainteneur.
- Réécrire les audits régionaux.
- Migrer des adapters.
- Changer l’UX.

#### Livrables

1. Décision de licence **documentée comme ouverte** jusqu’à arbitrage (voir §7).
2. README / pipeline README / `docs/README.md` alignés sur l’état réel (13 régions, sources importées).
3. Script de génération de couverture + artifact (`coverage.json` et/ou markdown).
4. Proposition de description / topics GitHub (à coller à la main).

#### Tests

- Le générateur de couverture échoue si une source `IMPORTED` du registre n’a pas d’`id` / région / catégories.
- Snapshot ou assertions minimales : 13 régions présentes ; TAXREF + BDC cités ; au moins une source régionale `IMPORTED` par région hors trous connus (COR).
- `npm test` et `npm run build` restent verts.

#### Critères d’acceptation

- Un nouvel agent peut savoir où est la vérité (registre vs dataset vs UI).
- On peut ouvrir un fichier généré et répondre « ZNIEFF faune HDF : quelle source, quel millésime ? » sans relire 13 markdowns.
- Aucune licence n’est imputée aux données TAXREF / BDC / DREAL.

#### Risques

- Générer la couverture uniquement depuis `ready-sources.json` sous-estime ce que le **manifeste de prod** contient réellement (et inversement). Préférer : registre = intention ; manifeste = ce qui est dans le jeu chargé.
- Drift futur si on met à jour le markdown humain sans le JSON.

#### Migration / compatibilité

Aucun changement de dataset ni d’UI. Ajouts de fichiers générés seulement.

---

### PHASE P0.5 — Robustesse de l’acquisition des sources

#### Objectif

Conserver la sécurité des SHA tout en rendant l’acquisition reproductible et **diagnostiquable**. Une maintenance DREAL ou une republication byte-différente ne doit plus apparaître comme « le pipeline est cassé » sans état explicite.

#### Pourquoi maintenant

Incidents réels (ARA LRR checksum instable ; BFC page de maintenance). `data-smoke` et `build-production` sont rouges pour des raisons d’acquisition, pas de transformation.

#### Dépendances

P0 (vocabulaire d’états). Peut commencer dès que le vocabulaire acquisition ≠ registre métier est tranché.

#### Fichiers / composants concernés

- `data-pipeline/regions/ready-sources.json` (étendre les ressources : `archiveUrl`, `expectedSha256`, `expectedKind`, stratégie)
- scripts `download_*.sh` — **un pilote d’abord**, pas les 26 d’un coup
- éventuellement module commun `data-pipeline/acquire.mjs` ou `acquire.py`
- workflows `data-smoke.yml`, `build-production.yml` (consommer le runner, ne pas les réécrire entièrement)

États d’acquisition à formaliser (dimension **fichier**, distincte des états de registre §2 de `REGIONAL_SOURCES.md`) :

| État | Sens |
|---|---|
| `FETCH_OK` | Fichier obtenu, type attendu, SHA connu validé. |
| `UNAVAILABLE` | Réseau / HTTP / page de maintenance. Pas un soupçon de contenu. |
| `CHANGED_UNVERIFIED` | Fichier obtenu, type plausible, SHA ≠ attendu. |
| `ARCHIVED_FALLBACK` | Copie d’archive utilisée, SHA de l’archive validé, **annoncé**. |
| `TYPE_MISMATCH` | HTML ou autre à la place du tableur. |

Ne pas réutiliser `READY` / `IMPORTED` ici : ce sont des états de **sélection métier** de la source, pas du téléchargement.

#### Architecture cible

Pour chaque ressource :

```text
URL canonique + SHA validé + kind
    → fetch
    → verify type
    → verify sha
    → sinon archive déclarée (même SHA) + log ARCHIVED_FALLBACK
    → sinon échec explicite avec l’état (UNAVAILABLE vs CHANGED_UNVERIFIED)
```

Un fallback ne remplace **jamais** silencieusement un millésime par un autre. La CI et les logs doivent dire quelle copie a été utilisée.

#### Hors périmètre

- Recalculer / « accepter » un nouveau SHA sans revue humaine.
- Migrer tous les downloaders.
- Changer les parsers.

#### Livrables

- Contrat d’acquisition (fonction ou script commun) + tests sur fixtures (HTML de maintenance, SHA faux, archive OK).
- Un pilote : **ARA LRR `oiseaux-mammiferes.ods`** (incident actuel) **ou** BFC 2026, plus documentation de la stratégie.
- Les autres scripts restent tels quels jusqu’aux PR suivantes.

#### Tests

- Fixture HTML « Maintenance en cours » → `UNAVAILABLE` ou `TYPE_MISMATCH`, pas un SHA « bizarre ».
- SHA différent + type OK → `CHANGED_UNVERIFIED`, exit ≠ 0.
- Archive avec SHA attendu → succès + message `ARCHIVED_FALLBACK`.
- Sentinelles métier inchangées si le fichier obtenu est le même.

#### Critères d’acceptation

- On sait lire dans un log CI **pourquoi** ça a échoué.
- Le fail-closed SHA est conservé.
- Au moins une source aujourd’hui fragile a un fallback **déclaré** ou un état clair.

#### Risques

- Internet Archive peut elle-même servir un objet différent. Le SHA reste le juge.
- Un fallback trop généreux masque une vraie nouvelle version officielle. Le cas `CHANGED_UNVERIFIED` doit rester bloquant jusqu’à revue.

#### Migration / compatibilité

Comportement de build identique lorsque le SHA canonique est servi. Rollback = revenir au `download_*.sh` précédent.

---

### PHASE P1-A — Industrialiser les sources (pilote)

#### Objectif

Séparer métadonnées et parsing. Un runner générique + un adaptateur **par famille de fichiers**, pas un workflow GitHub par référentiel.

#### Pourquoi maintenant

Après P0.5 : l’acquisition est un service. Sans abstraction, chaque nouvelle région recopiera encore un YAML de 80 lignes.

#### Dépendances

P0.5 (fetch/verify communs). Le registre `ready-sources.json` est le point de départ : l’enrichir, ne pas créer un troisième fichier de vérité.

#### Fichiers / composants concernés

- `data-pipeline/regions/ready-sources.json`
- nouveau : `data-pipeline/adapters/` (fonctions, **pas** une usine à classes TypeScript)
- pilote recommandé : **`oeb-bretagne-znieff`** (CSV data.gouv, schéma simple, `IMPORTED`, raccord TAXREF déjà propre)
- `data-pipeline/regions/bre/build_oeb.py` (référence à équivaloir, pas à jeter d’abord)
- **un** workflow matrice ensuite, sans supprimer les YAML historiques avant équivalence

Interface logique minimale (Node ou Python, le plus proche des scripts actuels) :

```text
fetch() → verify() → parse() → mapTaxon() → normalizeStatus() → validate() → diagnostics()
```

Ce n’est **pas** une obligation de classes. Des fonctions exportées + un `adapter: "oeb-csv-znieff"` dans le JSON suffisent.

#### Architecture cible

Métadonnées dans le JSON (id, région, catégories, publisher, version, sha256, adapter, territoire, `replaces`). Le parsing spécifique reste dans un petit module. Le runner enchaîne les étapes et écrit un paquet `validateRegionalPackage`.

#### Hors périmètre

- Migrer les 13 régions.
- Refactor « entire data pipeline ».
- Supprimer les workflows historiques avant démonstration d’équivalence.

#### Livrables

- Runner + adaptateur pilote BRE ZNIEFF.
- Même sentinelles / mêmes volumes (± tolérance déclarée) que `build_oeb.py` actuel.
- Note d’équivalence dans la PR.

#### Tests

- Paquet produit valide `validateRegionalPackage`.
- Au moins une sentinelle BRE déjà couverte par `validate-generated.mjs` (si applicable) ou assertion de volume / CD_REF connu.
- Le runner refuse une source `WITNESS` en publication.

#### Critères d’acceptation

- Une source réelle est construite **sans** copier-coller un nouveau workflow spécifique.
- Rollback possible vers le script Python historique.

#### Risques

- Sur-abstraction. Si le runner dépasse ~200–300 lignes pour un CSV, on a trop généralisé.
- Choisir BFC ou OCC comme pilote (tableurs complexes) ferait échouer la phase.

#### Migration / compatibilité

Le dataset publié ne change pas de schéma. Double construction pilote vs historique jusqu’à parité.

---

### PHASE P1-B — Diagnostics et qualité des sources

#### Objectif

Chaque import produit des métriques persistées et des seuils **par source**. Un changement de fichier qui fait chuter le raccord ou disparaître une catégorie échoue.

#### Pourquoi maintenant

Dès qu’un runner existe, les prints ad hoc deviennent un contrat. Les sources historiques n’auront pas le même seuil qu’un CSV OEB à 100 %.

#### Dépendances

P1-A (un adaptateur pilote). Le registre doit pouvoir porter `expectedResolutionRate`, `minStatuses`, sentinelles.

#### Fichiers / composants concernés

- sortie diagnostics : artifact CI + éventuellement `docs/generated/` (généré, pas édité)
- `ready-sources.json` : champs de seuils optionnels
- `mergeRegionalPackages` : enrichir, ne pas casser le compteur actuel
- `validate-generated.mjs` : rester le filet métier global

Métriques minimales :

- lignes lues / valides / ignorées explicitement ;
- taxons résolus directs / via synonymes / non résolus / ambigus ;
- doublons ;
- relations et définitions produites ;
- taux de couverture TAXREF.

Fail conditions (exemples, **seuils dans le registre** ) :

- perte massive de lignes vs run de référence ;
- chute du taux de résolution ;
- disparition d’une catégorie attendue ;
- disparition d’une sentinelle ;
- explosion d’ambiguïtés.

#### Hors périmètre

- Un seuil unique 0.995 pour toutes les sources.
- Interpréter un non-résolu comme un statut.

#### Livrables

- Format JSON de diagnostic versionné.
- Seuils sur le pilote BRE + une deuxième source volontairement plus sale (quand elle sera migrée).
- Artifact CI.

#### Tests

- Fixture : taux sous le seuil → échec.
- Fixture : sentinelle absente → échec.
- Source sans seuil déclaré → diagnostic écrit, pas d’échec fantôme.

#### Critères d’acceptation

- On peut ouvrir l’artifact et relire les 10 chiffres de l’exemple (lignes, résolus, synonymes, etc.).
- Une régression de raccord casse la CI **de cette source**.

#### Risques

- Seuils trop hauts sur PDF historiques → CI rouge permanente. D’où : seuil par source.

#### Migration / compatibilité

Les adaptateurs non migrés gardent leurs prints. Pas d’obligation de tout convertir.

---

### PHASE P1-C — Cœur métier `resolveStatuses`

#### Objectif

Extraire la détermination des statuts applicables hors de l’UI. Fonction pure (ou quasi), testable sans DOM, utilisable depuis Node.

#### Pourquoi maintenant

Voir §5.0. C’est le prérequis de P2-A/B/C et de P3. Sans cela, tout nouvel outil recopie `main.ts`.

#### Dépendances

P0 pour le vocabulaire d’absence / couverture. **Pas** P1-A. S’appuie sur `src/status-data.ts`, `src/status-help.ts`, `src/types.ts`, le manifeste v3.

#### Fichiers / composants concernés

- **nouveau** `src/resolve-statuses.ts` (nom exact libre, mais hors `main.ts`)
- plus tard, miroir Node si le bundling ESM le permet (`package.json` exports) — pas obligatoire dans la première PR
- `src/main.ts` : devient consommateur (PR suivante, voir §8 PR-G)
- ne pas modifier le pipeline ni les données

API conceptuelle (le contrat peut s’affiner, pas l’esprit) :

```ts
resolveStatuses({
  cdRef,
  region,
  department?, // ignoré tant que P2-A n’est pas là ; ne pas faire semblant
  definitions,
  links,
  sources,
  coverage?,   // si P0.4 a déjà produit coverage.json
})
```

Retour conceptuel :

```json
{
  "taxon": { "cdRef": 3571 },
  "territory": { "region": "CVL" },
  "statuses": [],
  "warnings": [],
  "coverage": {},
  "sources": [],
  "outcome": "resolved | none_in_integrated_sources | insufficient_coverage"
}
```

Le resolver doit :

- partir du `CD_REF` accepté (la recherche de synonymes reste `search.ts` en amont) ;
- hydrater les liens de la région ;
- appliquer le filtre « utile » aujourd’hui dans `usefulStatus` ;
- conserver portées `national` / `regional` / `partial` et `scopeLabel` ;
- exposer les `sourceId` ;
- distinguer **aucun statut dans les référentiels intégrés pour ce territoire** vs couverture insuffisante **si** la matrice le permet ; ne pas inventer un statut ;
- rester synchrone et sans I/O.

#### Hors périmètre

- Changer l’apparence de la fiche.
- Déduire un département.
- Appeler le réseau.
- Dupliquer `hydrateStatusLinks`.

#### Livrables

- Module + tests (Martin-pêcheur protégé ; *Hyles euphorbiae* CVL → `none_in_integrated_sources` ; Lotus portées partielles NAQ).
- Première PR : **l’UI ne change pas** (le module existe, `main.ts` pas encore branché).
- PR suivante : `main.ts` appelle le resolver (tri / empty state identiques).

#### Tests

- Identiques aux sentinelles actuelles pour les mêmes fixtures.
- Un statut « sans objet » n’apparaît pas.
- Aucune perte de `label` / `value` / `sourceId` / `scope`.
- Pas de numéro d’article inventé (déjà garanti par `status-help`).

#### Critères d’acceptation

- `vitest` couvre le resolver sans jsdom.
- `main.ts` n’est plus la source de vérité du filtrage dès la PR de branchement.
- Node peut importer le module (ou un test `node --test` le charge).

#### Risques

- Re-coder le tri dans l’UI « pour que ça reste pareil » → dérive. Une seule fonction de tri.
- Trop de champs `outcome` trop tôt. Commencer par 2–3 cas réels (résolu / vide / éventuellement couverture).

#### Migration / compatibilité

Dataset inchangé. Rollback UI = revenir à `sortedStatuses` local (à supprimer dès que le branchement est vert).

---

### PHASE P2-A — Territorialisation départementale

#### Objectif

Permettre `region + department?` pour lever certaines portées `partial` (ex. OCC + 31 → pertinence Midi-Pyrénées).

#### Pourquoi maintenant

Le modèle `departments` + `legacyRegions` existe déjà dans `regions.mjs` mais n’est utilisé qu’à la **construction BDC**. L’UI n’a que la région ; beaucoup de ZNIEFF / protections restent « Portée : ancienne région … ».

#### Dépendances

P1-C. Données territoriales : étendre `regions.mjs` (ou un JSON dédié) comme **unique** table parent/enfant. Interdit : `if (department === '31')` dispersés.

#### Fichiers / composants concernés

- `data-pipeline/regions.mjs` (source de vérité géographique)
- dataset : éventuellement précalculer des flags, **ou** résoudre au runtime dans le resolver (préférable tant que le volume tient)
- PWA : sélecteur département **facultatif** (phase UI séparée)
- `resolveStatuses({ department })`

GPS hors phase.

#### Architecture cible

Graphe territorial data-driven :

```text
FR → région actuelle → ancienne région → département → (plus tard) territoire spécifique
```

Un statut `partial` dont `scopeLabel` est un département ou une ancienne région devient **applicable** si le département demandé appartient à ce territoire ; **non applicable** s’il est dans la même région moderne mais hors de ce territoire ; **indéterminé** si aucun département n’est fourni (comportement actuel : on montre le statut + la portée).

#### Hors périmètre

- Géolocalisation.
- Communes, mailles, ZNIEFF polygones.
- Recoder les portées dans chaque adaptateur.

#### Livrables

- Table territoriale testée (OCC 31 ∈ Midi-Pyrénées ; OCC 34 ∈ Languedoc-Roussillon ; CVL 37 = région entière pour l’ancienne région Centre).
- Resolver : tests *Lotus* NAQ / protections d’ancienne région.
- UI : PR séparée, opt-in.

#### Tests

- Sentinelles territoriales existantes conservées quand `department` est omis.
- Avec département, un statut de l’autre ancienne région n’est plus listé comme applicable (warning de filtrage explicite).

#### Critères d’acceptation

- Aucun `if` département en dur hors de la table.
- Comportement sans département = aujourd’hui.

#### Risques

- Mal classer un `scopeLabel` libre (« Massif vosgien », « alpine ») : ces portées **ne sont pas** des départements. Les laisser `partial` tant qu’il n’y a pas de géométrie.

#### Migration / compatibilité

Liens générés inchangés. Filtrage runtime uniquement.

---

### PHASE P2-B — Résolution d’une liste de taxons

#### Objectif

Usage professionnel : une liste de noms ou de `CD_REF` → table de statuts + export CSV.

#### Pourquoi maintenant

Dès que le resolver est stable. C’est probablement le premier consommateur non-PWA à fort ROI.

#### Dépendances

P1-C obligatoire. P2-A souhaitable (colonne département) mais le MVP liste peut rester régional.

#### Fichiers / composants concernés

- CLI Node (ex. `data-pipeline/resolve-batch.mjs` ou `src/batch.ts`)
- `search.ts` pour la résolution de noms (**sans** choix silencieux)
- export CSV

Entrées : noms scientifiques, vernaculaires si **un seul** hit plausible, ou `CD_REF`.  
Sorties par ligne : `resolved` | `ambiguous` | `not_found`, plus colonnes protection / LRN / LRR / ZNIEFF / PNA / responsabilité / portée / sources / alertes.

#### Hors périmètre

- Deuxième moteur métier.
- XLSX (ensuite).
- Choisir « le » taxon le plus célèbre en cas d’ambiguïté.

#### Livrables

- CLI + CSV.
- Jeu d’exemples (`Lotus`, `Aconitum`, `Alcedo`, `Hyles euphorbiae`).

#### Tests

- Ambiguïté → `ambiguous`, pas de statuts inventés.
- Inconnu → `not_found`.
- *Hyles* CVL → resolved + message / flags d’absence, pas une ligne vide muette.

#### Critères d’acceptation

- Appelle uniquement `resolveStatuses`.
- Fonctionne offline sur un `public/data` local.

#### Risques

- Vernaculaires très partagés. Seuil : 0 ou 1 résultat utile, sinon `ambiguous`.

#### Migration / compatibilité

Nouvel outil. La PWA inchangée.

---

### PHASE P2-C — Plugin QGIS

#### Objectif

Enrichir une table attributaire à partir d’une colonne `CD_REF` (ou d’une sélection) sans réimplémenter les règles.

#### Pourquoi maintenant

Après resolver + idéalement batch (même contrat de colonnes).

#### Dépendances

P1-C. P2-B fortement recommandé (format d’export). P3 non requis.

#### Comparaison à faire **avant** d’implémenter

| Option | Avantages | Inconvénients |
|---|---|---|
| 1. Dataset + moteur embarqués dans le plugin | Offline, pas de serveur | Poids, màj du jeu, packaging Python/JS |
| 2. Exécutable / package local (`resolve-batch`) | Un seul moteur, màj du CLI | Dépendance d’install, chemin |
| 3. API distante | Léger côté plugin | Réseau, backend, hors principe offline |

**Ne pas présumer qu’une API est nécessaire.** L’option 2 est le défaut raisonnable si P2-B existe.

#### Hors périmètre

- Moteur SIG, couches ZNIEFF, saisie d’obs.
- Réécrire `resolveScope` en PyQGIS.

#### Livrables

- Note d’architecture (choix 1/2/3).
- Puis plugin minimal : action « Ajouter les statuts applicables ».

#### Tests

- Table fixture 3 `CD_REF` → colonnes attendues.
- `CD_REF` inconnu → champ d’alerte, pas de crash.

#### Critères d’acceptation

- Zéro règle réglementaire dans le plugin.
- Fonctionnement local documenté.

#### Risques

- Réécriture Python du resolver. Interdit : consommer le même cœur ou le CLI.

#### Migration / compatibilité

Nouvel artefact. Ne touche pas à la PWA.

---

### PHASE P3 — Dataset et distribution du moteur

#### Objectif

Une fois le modèle (`resolveStatuses` + territoire + diagnostics) stable, étudier la **distribution** : jeu versionné, package, éventuellement API.

#### Pourquoi maintenant

Dernière. Distribuer trop tôt fige un contrat encore mouvant.

#### Dépendances

P1-C + P1-B au minimum. P2-A si le contrat territorial doit figurer dans l’API.

#### À étudier (décision humaine, §7)

| Format | Intérêt | Réserve |
|---|---|---|
| JSON actuel (manifeste v3) | Déjà en prod PWA | ~43 Mio brut, adapté au fractionnement régional |
| SQLite | QGIS / CLI / un fichier | Schéma à concevoir, pas un copier-coller JSON |
| Parquet | Batch analytique | Peu utile à la PWA téléphone |

L’API éventuelle :

```http
GET /v1/taxa/3571/statuses?region=OCC
GET /v1/taxa/3571/statuses?region=OCC&department=31
```

est un **canal**. `resolveStatuses()` ne doit jamais importer HTTP.

#### Hors périmètre de la phase de planification

- Publier un package sur npm.
- Déployer une API.
- Choisir un scope npm (`@…/species-status-fr`) sans arbitrage.

#### Livrables

- ADR court : format(s) retenus, ce qui n’est pas retenu.
- Éventuellement script d’export SQLite **expérimental**, non publié.

#### Tests

- Parité resolver JSON vs format alternatif sur sentinelles, si un export est écrit.

#### Critères d’acceptation

- Une décision écrite. Rien n’est publié automatiquement.

#### Risques

- « API d’abord » qui re-couche la logique dans des handlers. Le handler ne fait qu’appeler le resolver.

#### Migration / compatibilité

Le manifeste v3 reste le format PWA jusqu’à décision contraire.

---

## 6. Graphe de dépendances

```text
ready-sources.json + REGIONAL_SOURCES.md
        │
        ├─────────────► P0.4 matrice de couverture
        │
        └─────────────► P0.5 acquisition (états + fallback déclaré)
                                 │
adaptateurs historiques          │
 (bre/, ara/, …)                 │
        │                        │
        └─ P1-A runner pilote ───┤
                │                │
                ▼                │
              P1-B diagnostics   │
                │                │
                ▼                ▼
         build.mjs ──► dataset manifeste v3
                                │
                                ▼
                        P1-C resolveStatuses
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
               PWA           P2-B batch      P2-A département
                 │              │              │
                 │              └──────┬───────┘
                 │                     ▼
                 │                   P2-C QGIS
                 │                     │
                 └──────────► P3 package / API / dataset
```

La PWA existe déjà : elle se **rebranche** sur le resolver (PR-G), elle n’attend pas P3.

---

## 7. Décisions architecturales ouvertes

À trancher par le mainteneur. Un agent **ne doit pas** les décider dans une PR d’implémentation.

### 7.1 Licence du code (P0.1)

Aucune licence dans le dépôt. **Ne pas en ajouter sans arbitrage.**

Options pertinentes pour le **code** uniquement :

| Licence | Si… |
|---|---|
| MIT | Réutilisation permissive maximale (outils métier, plugins, forks). |
| Apache-2.0 | Permissif + brevet / notice de modifications. |
| GPL-3.0 | Copyleft : les dérivés redistribués restent libres sous GPL. |

**La licence du code ne couvre jamais TAXREF, BDC Statuts, ni les référentiels régionaux.** Chaque source a ses conditions (INPN / PatriNat, DREAL, CBN, OEB, ODONAT, etc.). Le README devra avoir une section « Données — conditions des producteurs » distincte de « Code — licence ».

### 7.2 Métadonnées GitHub

Description proposée (au choix) :

- grand public : *Référentiel terrain offline des statuts réglementaires et patrimoniaux des espèces de France.*
- technique : *Moteur de résolution des statuts d’espèces par taxon et territoire.*

Topics possibles : `taxref`, `pwa`, `offline-first`, `biodiversity`, `france`, `inpn`, `conservation-status`.

Homepage : uniquement s’il existe une URL HTTPS publique stable du bundle (voir `docs/deployment-ftp.md`).

### 7.3 Stratégie archive / fallback

Qui héberge la copie de secours ? Internet Archive (déjà pour ARA ZNIEFF) vs artifact GitHub vs miroir interne. Quel SHA fait foi. Qui a le droit de passer `CHANGED_UNVERIFIED` → nouveau SHA validé.

### 7.4 Format de distribution futur (P3)

JSON fractionné vs SQLite vs Parquet vs les trois. Publication npm ou non.

### 7.5 Niveau de territorialisation PWA

Le département est-il un sélecteur terrain dès P2-A, ou seulement un paramètre du resolver / batch au début ?

### 7.6 Seuils qualité

Qui fixe `expectedResolutionRate` par source ? Défaut conservateur vs source par source après un premier run de référence.

### 7.7 API

Canal ultérieur seulement. Pas de backend pour la PWA.

---

## 8. Définition de Done — « moteur stable »

Le projet a un moteur stable lorsque **toutes** ces conditions sont vraies :

1. Les sources sont **déclarées** (registre machine).
2. Leur provenance est **vérifiable** (SHA, millésime, producteur).
3. Leur qualité d’import est **mesurée** (diagnostics persistés).
4. Un changement de fichier est **détecté** (SHA / type / volume) avec un état explicite.
5. `resolveStatuses` est **indépendant de l’UI** et testé sans DOM.
6. La **couverture** peut être interrogée (fichier généré).
7. Les règles territoriales principales ont des **sentinelles** (anciennes régions, département le moment venu, *Hyles*, *Lotus*, *Alcedo*).
8. Aucune PR n’a inventé de statut pour « remplir » une fiche vide.

---

## 9. Hors périmètre volontaire (ne pas prioriser)

- Saisie d’observations, base d’obs, comptes, réseau social, photos.
- Cartographie naturaliste complète, moteur SIG.
- IA pour interpréter les statuts.
- Remplacement de GeoNature.
- Outre-mer (hors modèle actuel 13 régions).
- Inventer une LRR ou une ZNIEFF manquante dans le code applicatif.

---

## 10. Granularité des futures PR

Ne pas ouvrir : `refactor entire data pipeline`.

Ordre proposé. Chaque ligne = **une** PR.

| ID | Objectif | Dépend | Fichiers (approx.) | Acceptation | Risque | Rollback |
|---|---|---|---|---|---|---|
| **PR-A** | ~~Générer la matrice de couverture depuis `ready-sources.json` (+ manifeste si présent)~~ **Réalisée** (#28) | — | `data-pipeline/coverage.mjs`, `docs/generated/source-coverage.md`, `data-pipeline/generated/coverage.json` | 13 régions ; sources `IMPORTED` listées ; fichier non édité à la main | Incomplet vs jeu de prod | Supprimer le générateur |
| **PR-B** | ~~Aligner README / `data-pipeline/README.md` / `docs/README.md` sur l’état réel ; pointer cette roadmap~~ **Réalisée** (cette PR) | PR-A utile mais pas bloquante | markdown uniquement | Plus de « 3 régions pilotes » ; index docs complet | — | Revert markdown |
| **PR-C** | ~~Modèle d’états d’acquisition + tests sur fixtures (HTML, SHA faux)~~ **Réalisée** (cette PR) | — | `data-pipeline/acquisition.mjs`, `data-pipeline/acquisition.test.mjs` | 5 états distingués ; fail-closed SHA ; pas de fallback sur SHA changé | Trop d’états | Revert module |
| **PR-D** | ~~Fallback déclaré **ou** état clair sur **une** source fragile~~ **Réalisée** (cette PR) : pilote ARA LRR `oiseaux-mammiferes.ods`, état clair, aucun fallback non vérifié | PR-C | `download_lrr.sh` + `acquisition-cli.mjs` | États `UNAVAILABLE` / `TYPE_MISMATCH` / `CHANGED_UNVERIFIED` / `FETCH_OK` ; SHA piné inchangé | Trop d’états | Revert le script |
| **PR-E** | ~~Introduire `resolveStatuses` **sans** changer l’UX~~ **Réalisée** (cette PR) | — | `src/resolve-statuses.ts` + tests | Sentinelles *Alcedo* / *Hyles* CVL / Lotus ; `main.ts` intact | Mauvaise copie du filtre | Supprimer le module |
| **PR-F** | ~~Faire consommer le resolver par la PWA~~ **Réalisée** (cette PR) : PWA branchée sur `resolveStatuses` ; plus de `sortedStatuses`/`usefulStatus` local ; rendu inchangé | PR-E | `src/main.ts` | Empty state et liste identiques ; plus de `sortedStatuses` local | Régression visuelle | Revert `main.ts` |
| **PR-G** | ~~Runner générique + adaptateur pilote **BRE ZNIEFF** (`oeb-bretagne-znieff`)~~ **Réalisée** (cette PR) : runner générique + adaptateur pilote BRE ZNIEFF ; double construction vs Python historique ; production historique conservée | PR-C | `data-pipeline/adapters/`, `ready-sources.json` | Parité avec `bre/build_oeb.py` sur volumes / sentinelle | Sur-abstraction | Garder le Python historique |
| **PR-H** | ~~Diagnostics standardisés sur le pilote~~ **Réalisée** (cette PR) : sidecar diagnostic v1 + quality gate registre sur BRE ZNIEFF ; `pkg.diagnostics` historique inchangé | PR-G | JSON diagnostic + seuils dans le registre | Artifact + échec si sentinelle absente | Seuil mal calé | Seuil optionnel |
| **PR-I** | ~~Migrer une **deuxième** source simple (BRE LRR CSV) pour valider l’abstraction~~ **Réalisée** (cette PR) : deuxième adaptateur BRE LRR ; common OEB minimal ; parité stricte ZNIEFF + LRR ; quality sidecars sur les deux sources ; production historique conservée | PR-G, PR-H | adaptateur + registre | Deux sources passent par le runner | Spécificités LRR | Script historique |
| **PR-J** | ~~Workflow CI générique (matrice) **uniquement** pour les sources migrées~~ **Réalisée** (cette PR) : matrice CI registry-driven sur les sources IMPORTED avec adapter ; ZNIEFF + LRR actuellement ; quality sidecars par job ; smoke Bretagne historique conservé | PR-I | 1 YAML matrice | Équivalence smoke BRE | Casser le dispatch | YAML historique conservé |
| **PR-K** | Département dans le resolver (sans UI) | PR-E, table `regions.mjs` | resolver + tests OCC/NAQ | Sans département = inchangé | Mal parser les `scopeLabel` libres | Flag off |
| **PR-L** | Sélecteur département PWA (opt-in) | PR-K, PR-F | `main.ts`, CSS | Terrain : OCC 31 vs 34 | UX | Cacher le sélecteur |
| **PR-M** | CLI liste / CSV | PR-F | CLI + tests | `ambiguous` / `not_found` / *Hyles* | — | Supprimer le CLI |
| **PR-N** | Note d’architecture QGIS (choix 1/2/3) puis plugin minimal | PR-M | `docs/` + plugin | Pas de règles dans le plugin | Portée | Ne pas merger le plugin |
| **PR-O** | ADR distribution (JSON / SQLite / package / API) | moteur stable §8 | `docs/` | Décision écrite, **rien publié** | — | — |

**Pilote d’abstraction :** Bretagne ZNIEFF OEB (CSV data.gouv). Ne pas piloter avec BFC (tableur maître) ni OCC (zones biogéographiques).

**Licence et About GitHub :** pas des PR d’agent. Checklist mainteneur en §7.

---

## 11. Comment utiliser ce document (agents)

1. Lire §2 (état) et §3 (principes).
2. Prendre **une** ligne du tableau §10, pas une phase entière.
3. Respecter « Hors périmètre » de la phase.
4. Ne pas inventer de statuts, de SHA, ni de licence.
5. `npm test` et `npm run build` verts. Ne pas « réparer » les workflows de téléchargement amont dans une PR qui n’est pas PR-C/D.
6. Ne pas enchaîner automatiquement la PR suivante.
