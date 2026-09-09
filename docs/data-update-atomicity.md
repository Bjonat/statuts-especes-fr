# Atomicité des mises à jour de données

Le manifeste actif n’est remplacé qu’après vérification complète des fichiers
nécessaires à la continuité des régions actuellement disponibles hors ligne.

## Rôles

| Notion | Définition |
| --- | --- |
| **active** | Unique manifeste que l’application utilise (store, URLs, recherche, statuts, inventaire hors ligne). Stocké dans le cache `statuts-data-metadata` sous `data/__active-manifest__`. |
| **previous** | Dernière version cohérente remplacée, conservée pour un rollback futur (pas d’UI dans cette PR). Clé `data/__previous-manifest__`. |
| **candidate** | Manifeste distant différent, éventuellement partiellement téléchargé dans **son** cache versionné. Elle n’est pas active tant que le pointeur `active` n’a pas été réécrit. |
| **cache versionné** | `statuts-data-catalogs-v-<datasetVersion sanitizé>`. Deux versions ne partagent jamais le même cache logique. |
| **cache metadata** | `statuts-data-metadata`. Contient uniquement les JSON complets des manifestes active / previous. Pas de `localStorage` de version. |

## Commit

```text
VERSION A active et cohérente
        ↓
VERSION B disponible (check, sans activation)
        ↓
téléchargement dans le cache de B
        ↓
vérification SHA-256, JSON, Array, count, bytes
        ↓
validation finale des fichiers requis
        ↓
écrire previous = A
        ↓
écrire active = B   ← commit logique
        ↓
recharger le store depuis le manifeste local
        ↓
nettoyer les caches versionnés qui ne sont ni active ni previous
```

Jusqu’à l’écriture de `active`, A reste la version utilisée. Une candidate
partielle, un Abort, une erreur réseau, un quota ou un fichier invalide ne
modifient pas ce pointeur.

## Fichiers requis d’une candidate

Seules les régions `consultableOffline === true` de la version **active** sont
protégées. Une région `partial` n’est pas un contrat hors ligne.

- 0 région ready → aucun catalogue à stager ; le manifeste valide suffit ;
- OCC ready → 3 fichiers partagés + 2 fichiers OCC ;
- OCC + NAQ → 3 + 2 + 2 ;
- 13/13 → 29 fichiers.

Les fichiers déjà valides dans le cache de B ne sont pas retéléchargés.

## Vérification

Avant tout `cache.put` applicatif (navigation normale, préparation de région,
staging de mise à jour, migration) :

1. `response.ok` ;
2. SHA-256 du contenu, préfixe = suffixe hexadécimal du nom de fichier ;
3. `JSON.parse` ;
4. valeur = `Array` ;
5. `length === count` ;
6. si `bytes` est présent : `byteLength === bytes`.

Un fichier invalide n’entre jamais dans un cache versionné.

## Migration PWA-02

Si aucun `active-manifest` n’existe, un manifeste valide dans
`statuts-data-manifest` (`data/manifest.json`) devient le premier actif, même
hors ligne. Les fichiers de `statuts-data-catalogs` sont vérifiés puis copiés
dans le cache versionné ; l’entrée legacy n’est supprimée qu’après copie
réussie. Une migration partielle (ex. socle + OCC) conserve OCC ready. En cas
d’incertitude : conserver.

## Nettoyage

Uniquement **après** un commit réussi. Ne supprimer que des noms
`statuts-data-catalogs-v-*` qui ne sont ni active ni previous. Une erreur de
nettoyage peut laisser trop de données ; elle ne doit jamais enlever
active/previous.

`inspect()` et `removeRegion()` ne voient et ne touchent que le cache de la
version active.

## Workbox

Workbox reste responsable du shell PWA (`generateSW`, `registerType: autoUpdate`).
Il ne fait plus de runtime caching de `manifest.json` ni des catalogues.
L’application est seule responsable des données métier.
