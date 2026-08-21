# Pipeline de données

Le navigateur ne lit jamais directement les fichiers TAXREF ou BDC Statuts. Ce dossier transforme les référentiels officiels en jeux JSON immuables, fractionnés pour limiter mémoire, CPU et batterie sur téléphone.

## Sources nationales

Référentiels vérifiés le 21/08/2026 :

- **TAXREF v18** — PatriNat / INPN : `https://assets.patrinat.fr/files/referentiel/TAXREF_v18_2025.zip`
- **BDC Statuts v18** — PatriNat / SINP : `https://assets.patrinat.fr/files/referentiel/BDC.zip`

Le workflow `Data source smoke test` sait télécharger ces archives, détecter automatiquement le CSV principal BDC, exécuter les tests, générer les jeux et publier temporairement un artifact de contrôle.

## Construction

```bash
npm run data:build -- \
  --taxref /chemin/TAXREFv18.txt \
  --bdc /chemin/bdc_18_01.csv \
  --out public/data
```

Le manifeste `public/data/manifest.json` référence huit jeux versionnés : deux catalogues taxonomiques (Faune/Flore) et six jeux de statuts (Faune/Flore × CVL/NAQ/OCC).

## Filtre taxonomique

Le besoin métier est la recherche d'une espèce observée. Le pipeline conserve donc les rangs espèce/infraspécifiques utiles (`ES`, `SSES`, `VAR`, `SVAR`, `FO`, `CAR`, `RACE`, `AGES`) et retire genres, familles, ordres et autres rangs supraspécifiques du catalogue de recherche.

Pour le périmètre métropolitain actuel, un taxon est conservé si son statut biogéographique TAXREF `FR` est renseigné et différent de `A` (absent) et `Q` (mention erronée). Garde-fou : un taxon possédant un statut BDC applicable à une région supportée reste conservé même si ce filtre l'aurait retiré.

Les synonymes TAXREF restent rattachés au `CD_REF` accepté afin que les anciens noms restent recherchables.

## Résolution territoriale

Une région administrative actuelle n'est pas toujours équivalente à la zone d'application d'un ancien texte.

- `INSEER72` — ancienne Aquitaine : **portée partielle** dans Nouvelle-Aquitaine ;
- `INSEER54` — Poitou-Charentes : portée partielle dans Nouvelle-Aquitaine ;
- `INSEER74` — Limousin : portée partielle dans Nouvelle-Aquitaine ;
- `INSEER73` — Midi-Pyrénées : portée partielle dans Occitanie ;
- `INSEER91` — Languedoc-Roussillon : portée partielle dans Occitanie ;
- `INSEER24` — ancienne région Centre : même périmètre départemental que Centre-Val de Loire, donc portée régionale complète.

Les statuts départementaux sont conservés comme portées partielles tant que l'interface ne dispose que du choix régional.

## Données effectivement exploitées

La BDC fournit notamment : listes rouges nationales/régionales, protections, déterminance ZNIEFF, PNA et autres réglementations. Chaque relation conserve sa catégorie, sa valeur, la zone d'application, la citation et l'URL documentaire lorsqu'elles sont fournies.

Les indicateurs régionaux non homogènes — par exemple certaines classes de rareté ou de responsabilité — seront intégrés par des adaptateurs séparés uniquement lorsqu'une source institutionnelle actuelle et traçable est disponible.

Le premier territoire complémentaire étudié est **Centre-Val de Loire** ; la DREAL publie notamment des listes rouges régionales et un tableur des espèces/habitats déterminants ZNIEFF actualisé en avril 2026.
