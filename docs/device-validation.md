# Validation appareils réels

Protocole manuel distinct de la suite Playwright. Une émulation 360×800 ou 390×844 **n’est pas** un test Android ni iOS.

Les résultats ci-dessous n’ont **pas** été obtenus dans cette PR : l’environnement d’exécution n’a pas accès à un Android réel ni à un iPhone réel.

```text
NOT RUN — appareil réel nécessaire
```

Ne jamais reporter `Android ✅` ou `iOS ✅` à partir d’un viewport Playwright.

---

# Android / Chrome

| Champ | Valeur |
| --- | --- |
| Modèle appareil | — |
| Version Android | — |
| Version Chrome | — |
| Date | — |
| Commit / release testée | — |
| Résultat global | **NOT RUN — appareil réel nécessaire** |

## Installation

1. Ouvrir la PWA en ligne.
2. Installer via le navigateur (menu Installer / Ajouter à l’écran d’accueil selon Chrome).
3. Lancer depuis l’icône installée.
4. Confirmer l’affichage standalone si applicable.

Résultat : **NOT RUN**

## Offline terrain

1. Préparer OCC (Données hors ligne → Télécharger Occitanie).
2. Fermer l’application.
3. Activer le mode avion.
4. Relancer depuis l’icône.
5. Flore → OCC → recherche → fiche.
6. Faune → OCC → recherche → fiche.
7. Département 31 puis 34 (même taxon).
8. Retour navigation.

Résultat : **NOT RUN**

## Redémarrage

Réseau toujours coupé :

1. Forcer la fermeture.
2. Relancer.

Le dataset actif et OCC doivent rester utilisables.

Résultat : **NOT RUN**

## Stockage

Noter, **seulement après observation réelle** :

- taille observée ;
- comportement après fermeture ;
- éventuelle éviction par le système.

Aucune garantie OS n’est promise ici.

Résultat : **NOT RUN**

---

# iPhone / Safari / Ajout à l’écran d’accueil

Il n’existe pas de `beforeinstallprompt` Android-like sur iOS. Le parcours d’installation est celui de Safari.

| Champ | Valeur |
| --- | --- |
| Modèle | — |
| Version iOS | — |
| Version Safari / WebKit | — |
| Date | — |
| Commit | — |
| Résultat global | **NOT RUN — appareil réel nécessaire** |

## Installation

1. Ouvrir Safari.
2. Partager.
3. Ajouter à l’écran d’accueil.
4. Ouvrir depuis l’icône.

Résultat : **NOT RUN**

## Offline

1. Préparer OCC.
2. Fermer.
3. Mode avion.
4. Ouvrir depuis l’écran d’accueil.
5. Flore / Faune / recherche / fiche / départements 31 et 34.

Résultat : **NOT RUN**

---

# Comment consigner un passage réel

Remplacer uniquement les lignes **NOT RUN** après une exécution sur l’appareil, en indiquant modèle, OS, navigateur, date et SHA. Un PASS viewport n’autorise pas un PASS appareil.
