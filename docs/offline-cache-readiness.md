# Vérification de la disponibilité des catalogues hors ligne

Le marqueur historique `localStorage.offlineDatasetVersion` pouvait survivre à
la disparition de fichiers dans Cache Storage. PR #40 a posé le principe : une
région ou un jeu n’est disponible hors ligne que si les fichiers **réellement
présents** dans Cache Storage le prouvent. Un marqueur persistant n’est jamais
une preuve. Le navigateur peut évincer des entrées.

PR-PWA-02 généralise ce contrôle en **inventaire partagé + région**. PR-PWA-03
l’applique au **cache de la version active** uniquement.

## Composition

Le manifeste **actif** se décompose ainsi :

- **socle partagé** (3 fichiers) : `taxa-flora`, `taxa-fauna`,
  `status-definitions` ;
- **région** (2 fichiers) : `status-links-flora-REGION`,
  `status-links-fauna-REGION`.

Une région est `consultableOffline` seulement si :

```text
socle partagé complet
+
ses 2 fichiers régionaux présents
```

dans le cache versionné de la version **active**
(`statuts-data-catalogs-v-<datasetVersion>`). Une `candidate` en cours de
téléchargement et une version `previous` ne comptent jamais dans cet
inventaire.

Télécharger le socle ne rend pas les 13 régions `partial` : l’absence de liens
régionaux reste `missing`. `readyRegionCount = 0` reste possible même avec un
manifeste actif.

## Source de vérité

Deux notions distinctes :

- le manifeste **actif** dit quelle version l’application doit utiliser ;
- l’inventaire Cache Storage dit quelles régions de **cette** version sont
  réellement consultables hors ligne.

Il n’existe pas de `localStorage["offlineRegions"]`, `offlineDatasetVersion`
ni de marqueur IndexedDB de readiness.

`inspect()` ne fait aucun `fetch` et ne lit que le cache de la version active.
Les fichiers mis en cache par l’application lors d’une navigation normale
(`loadTaxa` / `loadStatuses`) sont reconnus comme ceux téléchargés depuis
l’écran Données hors ligne, après la même vérification de contenu.

Un cache issu de PWA-02 (`statuts-data-catalogs`, 29 fichiers) est **migré**
vers le cache versionné (vérification puis copie) et reconnu comme 13/13
régions disponibles, sans redownload.

## Préparation et suppression

La préparation d’une région télécharge uniquement les fichiers manquants du
socle et de cette région, dans le cache de la version active. Une deuxième
région ne retélécharge pas le socle. L’interruption (utilisateur ou réseau)
conserve les fichiers déjà entièrement écrits et vérifiés ; la reprise relit
le cache et ne récupère que les manquants. La suppression ne cible que les URL
exactes du manifeste **actif** (pas le cache previous, pas la candidate, pas
de wildcard). Tant qu’un fichier régional du manifeste courant reste en cache,
le socle est conservé ; après le dernier, il est retiré automatiquement.

Le champ optionnel `bytes` du manifeste v3 est la taille du fichier JSON
généré. C’est une estimation de volume (`≈ X Mio`), pas la consommation
réseau, l’espace Cache Storage réel ni le volume HTTP compressé. Un manifeste
v3 sans `bytes` reste valide. Aucun `HEAD` n’est utilisé pour estimer les
volumes.

## Vérification automatisée

```bash
npx vitest run src/offline-data.test.ts src/catalog.test.ts src/dataset-storage.test.ts src/main-offline-data-integration.test.ts src/main-dataset-update-integration.test.ts
```

Les tests #40 / PWA-02 restent : un fichier évincé n’est pas considéré
présent ; le cache réel est inspecté ; un cache complet est reconnu sans
marqueur ; une erreur Cache Storage, un quota ou une interruption ne
produisent pas de région prête.

## Limites conservées

La gestion multi-version, le staging isolé et l’activation atomique sont
documentés dans [`data-update-atomicity.md`](data-update-atomicity.md).
Workbox ne cache plus les données métier en runtime ; il reste responsable du
shell PWA (`generateSW`, `registerType: autoUpdate`). Les tests navigateur /
appareils appartiennent à **PR-PWA-04**.
