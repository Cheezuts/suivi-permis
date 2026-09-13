# Suivi Permis

Application de suivi statistique des échecs à l'examen du permis de conduire — 100 % côté client, aucun serveur, aucune base de données.

## Fonctionnalités

- **Fiche par candidat** : catégorie de permis (B, AAC, CS, BA, BA AAC, BA CS), centre d'examen, nom de l'inspecteur, heures dans votre auto-école, heures dans une autre auto-école, nombre de passages, remarques avant l'éliminatoire.
- **Erreurs éliminatoires réutilisables** : une liste de types d'erreurs partagée entre toutes les fiches — coche celles constatées, ou ajoute-en une nouvelle qui reste disponible pour les candidats suivants.
- **Tableau de bord** : camembert en % des erreurs éliminatoires les plus fréquentes (filtrable par catégorie de permis), plus quelques statistiques rapides.
- **Vue compacte** : dans la liste des fiches, une case à cocher n'affiche plus que erreur éliminatoire / inspecteur / catégorie de permis.
- Fiches modifiables et supprimables (avec confirmation).

## Comment ça marche sans base de données

Toutes les données sont stockées dans le **localStorage du navigateur**. Chaque utilisateur qui ouvre le site a donc ses propres données, invisibles pour les autres appareils. Limite à connaître : les données restent liées à l'appareil et au navigateur utilisés.

Deux boutons dans l'en-tête permettent de s'en prémunir :
- **💾 Sauvegarder** : télécharge un fichier `.json` contenant toutes les fiches, les types d'erreurs et l'ordre de la liste d'attente.
- **📂 Importer une sauvegarde** : recharge un fichier `.json` précédemment exporté (remplace les données actuelles après confirmation).

## Lancer en local

```
npm install
npm run dev
```

## Build de production

```
npm run build
npm run preview   # pour tester le build localement
```

## Déployer sur GitHub Pages

1. Crée un dépôt GitHub et pousse ce projet dedans :

```
git init
git add .
git commit -m "Suivi Permis"
git branch -M main
git remote add origin https://github.com/<ton-utilisateur>/<ton-repo>.git
git push -u origin main
```

2. Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` (déjà inclus) se déclenche automatiquement à chaque `push` sur `main`, build le projet et le publie.
4. Le site sera disponible à `https://<ton-utilisateur>.github.io/<ton-repo>/`.

Aucune configuration supplémentaire n'est nécessaire : `vite.config.js` utilise une base relative (`./`) qui fonctionne aussi bien à la racine d'un domaine que dans un sous-dossier GitHub Pages.

## Stack technique

- React 18 + Vite
- [recharts](https://recharts.org/) pour le camembert des erreurs éliminatoires
