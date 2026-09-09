# Validation navigateur (PR-PWA-04)

Checkpoint de fiabilité hors ligne **automatisé**. Les parcours s’exécutent dans Chromium contre le build Vite de production (`dist/`), le service worker `generateSW`, la vraie Cache Storage, des reloads et le mode offline du navigateur.

Ce document n’équivaut pas à une validation Chrome Android ni Safari iOS. Voir [`device-validation.md`](device-validation.md).

## Comment reproduire

```bash
npm run build
npx playwright install chromium   # une fois
npm run test:e2e
```

- Navigateur CI : **Chromium uniquement**
- Serveur : `node e2e/test-server.mjs` (127.0.0.1, `dist/` + `/data/` synthétique)
- Datasets : `e2e-a` (2026-09-09T10:00:00Z) et `e2e-b` (2026-09-10T10:00:00Z)
- Taxons : `Planta fictiva`, `Taxon testus`, `Animalia testensis`, `Herba imaginaria` (B uniquement)
- Aucune source distante, aucun dataset `public/data/` de production

## Matrice

Les résultats ci-dessous correspondent à la suite `e2e/*.spec.ts` exécutée localement dans cette PR (Chromium, `dist/`).

| Scénario | Automatisé | Résultat |
| --- | ---: | --- |
| Bootstrap officiel | oui | PASS |
| Pas de preload 29 catalogues | oui | PASS |
| Caches Workbox `statuts-data-manifest` / `statuts-data-catalogs` absents (install neuve) | oui | PASS |
| Contrôleur service worker | oui | PASS |
| Préparation OCC (5 fichiers en cache) | oui | PASS |
| Reload offline | oui | PASS |
| Flore offline | oui | PASS |
| Faune offline | oui | PASS |
| Département 31 / 34 | oui | PASS |
| Redémarrage même contexte | oui | PASS |
| Région NAQ non préparée offline | oui | PASS |
| Interruption téléchargement région | oui | PASS |
| Reprise région (skip fichiers déjà valides) | oui | PASS |
| Bootstrap sans dataset (`Données nécessaires`) | oui | PASS |
| Démonstration explicite | oui | PASS |
| Manifeste invalide | oui | PASS |
| Manifeste 503 | oui | PASS |
| A→B détectée, A reste active | oui | PASS |
| Check ne stage pas B | oui | PASS |
| Interruption B | oui | PASS |
| Reload offline après interruption → A | oui | PASS |
| OCC A toujours utilisable | oui | PASS |
| Cache B partiel non actif | oui | PASS |
| Reprise → B, skip fichiers déjà validés | oui | PASS |
| `active = B`, `previous = A` | oui | PASS |
| Reload offline B + contenu B visible | oui | PASS |
| B corrompue → A conservée | oui | PASS |
| Mutations concurrentes bloquées pendant l’update | oui | PASS |
| Mobile viewport smoke 360×800 et 390×844 | oui | PASS |

## Checkpoint

```text
Validation navigateur automatisée : PASS
Validation appareils réels : PENDING
```

Le checkpoint « L’application fonctionne de manière fiable hors ligne » **n’est pas déclaré validé sur appareils réels**. Chromium CI n’est pas Chrome Android ni Safari iOS.

## Findings

Aucun BLOCKER / P0 / P1 / P2 ouvert au moment de la rédaction, sous réserve que la suite E2E locale et le job `browser-e2e` restent verts.

Si un finding est ajouté plus tard, utiliser :

```text
ID
sévérité          BLOCKER | P0 | P1 | P2
scénario
attendu
observé
reproduction
statut            ouvert | corrigé | reporté
```
