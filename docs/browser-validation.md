# Validation navigateur (PR-PWA-04, étendue par PR-PWA-05, PR-PWA-06 et PR-DATA-01)

Checkpoint de fiabilité hors ligne **automatisé**. Les parcours s’exécutent dans Chromium contre le build Vite de production (`dist/`), le service worker `generateSW`, la vraie Cache Storage, des reloads et le mode offline du navigateur. PR-PWA-06 y ajoute la provenance par statut. PR-DATA-01 y ajoute la preuve documentaire embarquée (`document.cdDoc` / citation / URL http(s) seulement), sans protocole appareils réels.

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
- Taxons : `Planta fictiva`, `Taxon testus`, `Flora vacua` (aucun statut OCC), `Status orbus` (sourceId absent, document présent), `Documenta gemina` (deux `cdDoc`), `Animalia testensis`, `Herba imaginaria` (B uniquement)
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
| Fiche Flore (identité, territoire, statuts, aide) | oui | PASS |
| Fiche Faune (parcours minimal) | oui | PASS |
| Département OCC 31 / 34 sans fetch catalogue | oui | PASS |
| Empty state territorial (Flora vacua) | oui | PASS |
| Fiche responsive 320 / 360×800 / 390×844 | oui | PASS |
| Provenance Flore (ouvrir / fermer Source) | oui | PASS |
| Deux sourceId distincts sur la même fiche | oui | PASS |
| Provenance OCC 31 / 34 sans fetch catalogue | oui | PASS |
| Panneau source hors ligne (navigateur offline) | oui | PASS |
| sourceId absent : fail visible, pas de substitution | oui | PASS |
| Source + Aide accessibles à 320 / 360 / 390 | oui | PASS |
| Preuve documentaire complète (citation, CD_DOC, href) | oui | PASS |
| Document absent : panneau Source historique | oui | PASS |
| sourceId absent + document exact | oui | PASS |
| Deux cdDoc distincts non fusionnés | oui | PASS |
| Citation / CD_DOC consultables offline | oui | PASS |

## Checkpoint

```text
Validation navigateur automatisée : PASS
Validation appareils réels : PENDING
```

Le checkpoint « L’application fonctionne de manière fiable hors ligne » **n’est pas déclaré validé sur appareils réels**. Chromium CI n’est pas Chrome Android ni Safari iOS.

## Findings

Aucun BLOCKER / P0 / P1 ouvert.

### PWA-04-P2-01 — précache Workbox de fichiers `data/` hors contrat

- **sévérité :** P2
- **scénario :** installation neuve avec des fichiers `public/data/manifest-a.json` / `manifest-b.json` (restes locaux, hors manifeste v3)
- **attendu :** Workbox ne précache aucun dataset
- **observé :** `globIgnores` ne listait que `data/manifest.json` ; `manifest-a.json` / `manifest-b.json` entraient dans le précache ; le SW n’installait pas si `/data/` était servi par le serveur E2E
- **reproduction :** `npm run build` en présence de `public/data/manifest-a.json` ; inspecter `dist/sw.js`
- **statut :** corrigé — `globIgnores: ['data/**']`

### PWA-04-P2-02 — caches legacy vides créés au bootstrap

- **sévérité :** P2
- **scénario :** bootstrap officiel, contexte neuf
- **attendu :** `statuts-data-manifest` / `statuts-data-catalogs` absents (pas recréés par Workbox, ni ouverts à vide)
- **observé :** `caches.open` pendant la migration legacy créait un cache vide `statuts-data-manifest`
- **reproduction :** ouvrir la PWA sur un contexte neuf, `caches.keys()`
- **statut :** corrigé — `namedCacheExists` avant `open`

### PWA-04-P2-03 — écran d’erreur sans sélecteur de région

- **sévérité :** P2
- **scénario :** OCC prête, offline, sélection de NAQ non préparée, puis retour à OCC
- **attendu :** l’application reste récupérable ; OCC fonctionne encore
- **observé :** « Référentiel non chargé » n’offrait que Retour / Réessayer ; Retour conservait NAQ ; un nouveau choix de règne rechargeait NAQ
- **reproduction :** préparer OCC, offline, Faune → NAQ, puis ← Retour → Flore
- **statut :** corrigé — sélecteur Région sur l’écran d’erreur

### PWA-04-P2-04 — région par défaut CVL hors ligne

- **sévérité :** P2
- **scénario :** OCC préparée, jamais consultée, Flore ouverte hors ligne
- **attendu :** un écologue qui n’a préparé que OCC peut consulter OCC
- **observé :** le défaut mémoire est CVL ; Flore charge CVL et échoue hors ligne si CVL n’est pas prête
- **reproduction :** préparer OCC sans changer de région, offline, Flore
- **statut :** ouvert — contournement : choisir OCC (en ligne, ou depuis l’écran d’erreur) avant le parcours terrain. Pas de changement de défaut dans cette PR (hors périmètre métier). À traiter plutôt en PWA-05 / UX.
