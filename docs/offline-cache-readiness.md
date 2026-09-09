# Vérification de la disponibilité des catalogues hors ligne

Le marqueur historique `localStorage.offlineDatasetVersion` pouvait survivre à
la disparition de fichiers dans Cache Storage. `primeOffline()` renvoyait alors
`true` sans vérifier les données : le badge « Hors ligne prêt » pouvait rassurer
à tort avant une sortie terrain.

La vérification parcourt maintenant les 29 fichiers du manifeste courant :
deux catalogues taxonomiques, un dictionnaire et 26 fichiers de liens régionaux.
Un fichier absent est téléchargé uniquement si le réseau et la préférence
d'économie de données le permettent. Sans cela, le résultat est `false`.
Un cache complet reste reconnu hors connexion et en mode économie de données.
Les erreurs de réseau, de quota et d'accès au stockage renvoient `false`.
Le marqueur historique n'est plus lu ni écrit.

Le fallback automatique vers la démonstration lorsque le manifeste officiel
est indisponible ou invalide est corrigé dans PR-PWA-01 : le mode
démonstration n'existe plus que par choix utilisateur explicite.

## Vérification automatisée

`npx vitest run src/catalog.test.ts`

Les sept tests passent par `loadDataStore()` et simulent Cache Storage ainsi
que le réseau : fichier régional évincé malgré un marqueur, réparation en
sous-dossier, cache complet hors ligne sans marqueur, économie de données,
API indisponible, quota dépassé, erreurs réseau et HTTP.
Ils échouent tous avant le correctif.

## Limites conservées

Il s'agit d'un contrôle de présence des catalogues au moment de l'appel.
Ce correctif ne valide pas leur contenu ou leur empreinte et ne garantit pas
leur conservation ultérieure par le navigateur. Il ne vérifie pas le cache
du manifeste, le précache de l'interface ou le contrôle de la page par le
service worker. La gestion atomique des versions, la reprise après reconnexion
et les tests sur navigateur/appareil réel restent des travaux distincts.
Le mode démonstration reste inchangé.
