# Vérification de la disponibilité des catalogues hors ligne

Le marqueur historique `localStorage.offlineDatasetVersion` pouvait survivre à
la disparition de fichiers dans Cache Storage. PR #40 a posé le principe : une
région ou un jeu n’est disponible hors ligne que si les fichiers **réellement
présents** dans Cache Storage le prouvent. Un marqueur persistant n’est jamais
une preuve. Le navigateur peut évincer des entrées.

PR-PWA-02 généralise ce contrôle en **inventaire partagé + région**, lu
uniquement depuis le cache `statuts-data-catalogs`.

## Composition

Le manifeste courant se décompose ainsi :

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

Télécharger le socle ne rend pas les 13 régions `partial` : l’absence de liens
régionaux reste `missing`.

## Source de vérité

Cache Storage est la seule source de vérité. Il n’existe pas de
`localStorage["offlineRegions"]`, `offlineDatasetVersion` ni de marqueur
IndexedDB de readiness.

`inspect()` ne fait aucun `fetch`. Les fichiers mis en cache par Workbox lors
d’une navigation normale (`loadTaxa` / `loadStatuses`) sont reconnus comme
ceux téléchargés depuis l’écran Données hors ligne.

Un cache issu de #40 (29 fichiers) est reconnu immédiatement comme
13/13 régions disponibles, sans redownload ni migration.

## Préparation et suppression

La préparation d’une région télécharge uniquement les fichiers manquants du
socle et de cette région. Une deuxième région ne retélécharge pas le socle.
L’interruption (utilisateur ou réseau) conserve les fichiers déjà entièrement
écrits ; la reprise relit le cache et ne récupère que les manquants.
La suppression ne cible que les URL exactes du manifeste actuellement chargé
(pas de wildcard, pas de vidage du cache entier). Tant qu’un fichier régional
du manifeste courant reste en cache, le socle est conservé ; après le dernier,
il est retiré automatiquement.

Le champ optionnel `bytes` du manifeste v3 est la taille du fichier JSON
généré. C’est une estimation de volume (`≈ X Mio`), pas la consommation
réseau, l’espace Cache Storage réel ni le volume HTTP compressé. Un manifeste
v3 sans `bytes` reste valide. Aucun `HEAD` n’est utilisé pour estimer les
volumes.

## Vérification automatisée

```bash
npx vitest run src/offline-data.test.ts src/catalog.test.ts src/main-offline-data-integration.test.ts
```

Les tests #40 restent : un fichier évincé n’est pas considéré présent ; le
cache réel est inspecté ; un cache complet est reconnu sans marqueur ; une
erreur Cache Storage, un quota ou une interruption ne produisent pas de
région prête.

## Limites conservées

La présence en cache n’est pas une validation cryptographique du contenu
(pas de hash runtime, pas de signature, pas de parsing intégral avant
activation). La gestion multi-version, l’activation atomique et le rollback
appartiennent à **PR-PWA-03**. Workbox reste inchangé
(`registerType: autoUpdate`, NetworkFirst pour le manifeste, CacheFirst pour
les catalogues, `maxEntries: 40`).
