# Pipeline de données

Le navigateur ne lit jamais directement les fichiers TAXREF ou BDC Statuts. Ce dossier transforme les référentiels officiels en un catalogue JSON compact consommé par la PWA.

## Sources nationales

Référentiels vérifiés le 21/08/2026 :

- **TAXREF v18** — PatriNat / INPN : `https://assets.patrinat.fr/files/referentiel/TAXREF_v18_2025.zip`
- **BDC Statuts v18** — PatriNat / SINP : `https://assets.patrinat.fr/files/referentiel/BDC.zip`

La page officielle PatriNat annonce actuellement TAXREF v18 et BDC v18. Les archives sont temporaires tant que les services INPN ne sont pas revenus à la normale.

TaxHub v18 confirme les fichiers internes utilisés par ces versions : `TAXREFv18.txt` pour TAXREF et `bdc_statuts_18.csv` pour la BDC Statuts.

## Construction

1. Télécharger et extraire les deux archives officielles.
2. Repérer `TAXREFv18.txt` et le CSV principal de statuts BDC.
3. Exécuter :

```bash
npm run data:build -- \
  --taxref /chemin/TAXREFv18.txt \
  --bdc /chemin/bdc_statuts_18.csv \
  --out public/data/catalog.json
```

Le catalogue généré contient :

- les taxons acceptés `Animalia` → **Faune** ;
- les taxons acceptés `Plantae` → **Flore** ;
- les noms vernaculaires ;
- les synonymes TAXREF rattachés au `CD_REF` accepté ;
- les statuts BDC applicables aux régions supportées ;
- les citations et liens documentaires BDC quand ils sont fournis ;
- la provenance et la version des référentiels.

## Résolution territoriale

Une région administrative actuelle n'est pas toujours équivalente à la zone d'application d'un ancien texte.

Exemple : une protection `INSEER72` (ancienne Aquitaine) est marquée **partielle** lorsque l'utilisateur sélectionne Nouvelle-Aquitaine. Elle n'est jamais présentée comme applicable à toute la région actuelle.

Pour Centre-Val de Loire, l'ancienne région Centre (`INSEER24`) couvre le même périmètre départemental que la région actuelle et peut donc être considérée comme une portée régionale complète.

Les statuts départementaux présents dans la BDC sont conservés comme portées partielles tant que l'interface ne demande pas un département ou une position plus précise.

## Prochaine couche régionale

La BDC couvre déjà réglementations, listes rouges, déterminance ZNIEFF, PNA, etc. Les attributs qui n'y figurent pas de manière homogène — par exemple certaines classes de rareté régionale — seront ajoutés par des adaptateurs régionaux séparés.

Le premier adaptateur complémentaire prévu est **Centre-Val de Loire**. La DREAL publie notamment un tableur des espèces et habitats déterminants ZNIEFF actualisé en avril 2026 et les listes rouges régionales par groupe taxonomique.
