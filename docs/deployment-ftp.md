# Déploiement FTP

Le paquet de production est conçu pour être servi comme un site statique, à la racine d'un domaine ou dans un sous-dossier.

## Fichiers à envoyer

Télécharger l'artifact GitHub Actions `statuts-especes-fr-production`, le dézipper puis envoyer **le contenu du paquet** dans le dossier public du serveur FTP.

Le dossier distant doit contenir directement notamment :

```text
index.html
manifest.webmanifest
sw.js
assets/
data/
build-info.json
```

Ne pas envoyer le dépôt Git brut à la place du bundle de production.

## Hébergement

Pour l'installation PWA et le fonctionnement du service worker, le site doit être servi en HTTPS.

Le build utilise des chemins relatifs afin de fonctionner aussi bien sur :

```text
https://exemple.fr/
https://exemple.fr/statuts/
https://exemple.fr/outils/statuts/
```

## Après remplacement d'une version

Après un nouvel envoi FTP, recharger une fois la page en ligne. Le service worker `autoUpdate` récupère la nouvelle version. En cas de test de déploiement après une ancienne version cassée, vider une fois les données du site/service worker dans les outils du navigateur permet d'écarter un ancien cache.
