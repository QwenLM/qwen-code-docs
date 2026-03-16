# Aperçu du package

Ce monorepo contient deux packages principaux : `@qwen-code/qwen-code` et `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Il s’agit du package principal de Qwen Code. Il est chargé de l’interface utilisateur, de l’analyse des commandes et de toutes les autres fonctionnalités destinées à l’utilisateur.

Lorsque ce package est publié, il est regroupé dans un seul fichier exécutable. Ce bundle inclut toutes les dépendances du package, y compris `@qwen-code/qwen-code-core`. Cela signifie que, qu’un utilisateur installe le package avec la commande `npm install -g @qwen-code/qwen-code` ou qu’il l’exécute directement avec `npx @qwen-code/qwen-code`, il utilise ce même fichier exécutable autonome.

## `@qwen-code/qwen-code-core`

Ce package contient la logique principale de l’interface en ligne de commande (CLI). Il est chargé d’effectuer les requêtes API vers les fournisseurs configurés, de gérer l’authentification et de superviser le cache local.

Ce package n’est pas intégré (bundled). Lorsqu’il est publié, il l’est sous la forme d’un package Node.js standard avec ses propres dépendances. Cela permet de l’utiliser comme package autonome dans d’autres projets, si nécessaire. Tout le code JavaScript transpilé présent dans le dossier `dist` est inclus dans le package.

# Processus de publication

Ce projet suit un processus de publication structuré afin de garantir que tous les packages soient correctement versionnés et publiés. Ce processus est conçu pour être aussi automatisé que possible.

## Comment effectuer une publication

Les publications sont gérées via le workflow GitHub Actions [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml). Pour effectuer manuellement une publication de correctif ou de correctif urgent :

1.  Accédez à l’onglet **Actions** du référentiel.
2.  Sélectionnez le workflow **Release** dans la liste.
3.  Cliquez sur le bouton déroulant **Exécuter le workflow**.
4.  Remplissez les champs requis :
    - **Version** : La version exacte à publier (par exemple, `v0.2.1`).
    - **Ref** : La branche ou le hachage de commit à partir duquel effectuer la publication (par défaut : `main`).
    - **Essai à blanc** : Laissez la valeur sur `true` pour tester le workflow sans publication, ou définissez-la sur `false` pour effectuer une publication réelle.
5.  Cliquez sur **Exécuter le workflow**.

## Types de publications

Le projet prend en charge plusieurs types de publications :

### Publications stables

Publications stables régulières destinées à un usage en production.

### Publications préliminaires

Publications préliminaires hebdomadaires chaque mardi à 23h59 UTC, offrant un accès anticipé aux nouvelles fonctionnalités à venir.

### Versions nocturnes

Versions nocturnes quotidiennes à minuit UTC, destinées aux tests de développement en pointe.

## Calendrier de publication automatisé

- **Nocturne** : Tous les jours à minuit UTC  
- **Aperçu** : Tous les mardis à 23 h 59 UTC  
- **Stable** : Publications manuelles déclenchées par les mainteneurs

### Comment utiliser les différents types de versions

Pour installer la dernière version de chaque type :

```bash

# Stable (par défaut)
npm install -g @qwen-code/qwen-code

# Aperçu
npm install -g @qwen-code/qwen-code@preview

# Nocturne
npm install -g @qwen-code/qwen-code@nightly
```

### Détails du processus de publication

Chaque publication planifiée ou manuelle suit ces étapes :

1.  Récupère le code spécifié (dernière version de la branche `main` ou un commit spécifique).
2.  Installe toutes les dépendances.
3.  Exécute l’ensemble complet des vérifications `preflight` et des tests d’intégration.
4.  Si tous les tests réussissent, il calcule le numéro de version approprié en fonction du type de publication.
5.  Génère et publie les packages sur npm avec le `dist-tag` approprié.
6.  Crée une publication GitHub pour cette version.

### Gestion des échecs

Si une étape quelconque du workflow de publication échoue, un nouveau problème est automatiquement créé dans le référentiel, avec les étiquettes `bug` et une étiquette d’échec spécifique au type de publication (par exemple, `nightly-failure`, `preview-failure`). Ce problème contient un lien vers l’exécution échouée du workflow afin de faciliter le débogage.

## Validation de la version publiée

Après avoir publié une nouvelle version, un test de fumée (« smoke test ») doit être effectué afin de vérifier que les packages fonctionnent correctement. Cela peut se faire en installant localement les packages et en exécutant un jeu de tests pour s’assurer de leur bon fonctionnement.

- `npx -y @qwen-code/qwen-code@latest --version` pour valider que la publication s’est déroulée comme prévu, à condition que vous n’ayez pas publié une version « rc » ou « dev ».
- `npx -y @qwen-code/qwen-code@<étiquette-de-version> --version` pour valider que l’étiquette a bien été publiée.
- _Cette commande est destructrice en local_ : `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<version>`
- Il est recommandé d’effectuer un test de fumée consistant à exécuter quelques commandes LLM et outils de base, afin de s’assurer que les packages fonctionnent comme attendu. Nous formaliserons davantage cette procédure à l’avenir.

## Quand fusionner la modification de version, ou pas ?

Le modèle décrit ci-dessus pour créer des versions correctives (« patch ») ou des correctifs urgents (« hotfix ») à partir de validations actuelles ou anciennes laisse le dépôt dans l’état suivant :

1.  La balise (`vX.Y.Z-patch.1`) : Cette balise pointe correctement vers la validation d’origine sur la branche `main` contenant le code stable que vous souhaitez publier. Cela est crucial : toute personne qui extrait (« checkout ») cette balise obtient exactement le code publié.
2.  La branche (`release-vX.Y.Z-patch.1`) : Cette branche contient une nouvelle validation ajoutée au-dessus de la validation balisée. Cette nouvelle validation ne modifie que le numéro de version dans le fichier `package.json` (et d’autres fichiers associés comme `package-lock.json`).

Cette séparation est bénéfique : elle préserve l’historique de la branche `main` propre de toute incrémentation de version liée aux publications, jusqu’à ce que vous décidiez de les y intégrer.

Il s’agit ici d’une décision critique, entièrement déterminée par la nature de la publication.

### Fusionner vers `main` pour les correctifs stables et les correctifs urgents

Vous devez presque toujours fusionner la branche `release-<tag>` dans `main` pour toute version de correctif stable ou de correctif urgent.

- Pourquoi ? La raison principale est de mettre à jour la version dans le fichier `package.json` de `main`. Si vous publiez la version `v1.2.1` à partir d’un commit ancien sans jamais fusionner la mise à jour de version dans `main`, le fichier `package.json` de votre branche `main` continuera d’indiquer `"version": "1.2.0"`. Le prochain développeur qui entame le travail sur la prochaine version fonctionnelle (`v1.3.0`) partira alors d’une base de code portant un numéro de version incorrect et obsolète. Cela engendre de la confusion et nécessite une mise à jour manuelle de la version ultérieurement.
- Procédure : Une fois la branche `release-v1.2.1` créée et le package publié avec succès, ouvrez une demande d’extraction (pull request) afin de fusionner `release-v1.2.1` dans `main`. Cette demande d’extraction ne contiendra qu’un seul commit : « chore : passer à la version v1.2.1 ». Il s’agit d’une intégration propre et simple permettant de maintenir la branche `main` synchronisée avec la dernière version publiée.

### NE PAS FUSIONNER LES BRANCHES DE PRÉ-PUBLICATION DANS `main` (RC, Bêta, Développement)

Vous ne fusionnez généralement pas les branches de publication destinées aux pré-publications dans la branche `main`.

- Pourquoi ? Les versions préliminaires (par exemple `v1.3.0-rc.1`, `v1.3.0-rc.2`) ne sont, par définition, ni stables ni durables. Vous ne souhaitez pas alourdir l’historique de votre branche `main` avec une série de mises à jour de version consacrées aux versions candidates. Le fichier `package.json` présent dans `main` doit refléter la dernière version stable publiée, et non une version candidate.
- Processus : La branche `release-v1.3.0-rc.1` est créée, la commande `npm publish --tag rc` est exécutée, puis… la branche a rempli son rôle. Vous pouvez simplement la supprimer. Le code correspondant à la version candidate est déjà présent dans `main` (ou dans une branche de fonctionnalité), aucune fonctionnalité n’est donc perdue. La branche de publication n’était qu’un support temporaire pour le numéro de version.

## Tests et validation locaux : modifications du processus d’empaquetage et de publication

Si vous devez tester le processus de publication sans réellement publier sur NPM ni créer de version GitHub publique, vous pouvez déclencher manuellement le workflow depuis l’interface utilisateur GitHub.

1.  Accédez à l’onglet [Actions](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) du dépôt.
2.  Cliquez sur la liste déroulante « Exécuter le workflow ».
3.  Laissez l’option `dry_run` cochée (`true`).
4.  Cliquez sur le bouton « Exécuter le workflow ».

Cela exécutera l’intégralité du processus de publication, mais ignorera les étapes `npm publish` et `gh release create`. Vous pouvez consulter les journaux du workflow pour vérifier que tout fonctionne comme prévu.

Il est essentiel de tester localement toute modification apportée au processus d’empaquetage et de publication avant de la valider. Cela garantit que les packages seront publiés correctement et qu’ils fonctionneront comme attendu une fois installés par un utilisateur.

Pour valider vos modifications, vous pouvez effectuer une exécution simulée (« dry run ») du processus de publication. Celle-ci simule la publication sans publier réellement les packages sur le registre npm.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Cette commande effectue les opérations suivantes :

1.  Génère tous les packages.
2.  Exécute tous les scripts préalables à la publication.
3.  Crée les archives tarball qui seraient publiées sur npm.
4.  Affiche un résumé des packages qui seraient publiés.

Vous pouvez ensuite inspecter les archives tarball générées afin de vérifier qu’elles contiennent les bons fichiers et que les fichiers `package.json` ont bien été mis à jour. Ces archives sont créées à la racine du répertoire de chaque package (par exemple : `packages/cli/qwen-code-0.1.6.tgz`).

En effectuant une exécution simulée, vous pouvez être certain que vos modifications du processus d’empaquetage sont correctes et que les packages seront publiés avec succès.

## Approfondissement de la version publiée

L’objectif principal du processus de publication consiste à prendre le code source depuis le répertoire `packages/`, à le compiler, puis à assembler un package propre et autonome dans un répertoire temporaire `dist` à la racine du projet. Ce répertoire `dist` est précisément ce qui est publié sur NPM.

Voici les étapes clés :

Étape 1 : Vérifications préliminaires et gestion des versions avant publication

- Ce qui se produit : Avant tout déplacement de fichiers, le processus vérifie que le projet est dans un état sain. Cela implique l’exécution des tests, du linting et de la vérification des types (`npm run preflight`). Le numéro de version figurant dans le fichier `package.json` à la racine du projet ainsi que dans `packages/cli/package.json` est mis à jour avec la nouvelle version à publier.  
- Pourquoi : Cela garantit que seuls du code fonctionnel et de haute qualité sont publiés. La mise à jour de la version constitue la première étape pour marquer officiellement une nouvelle publication.

Étape 2 : Compilation du code source

- Ce qui se produit : Le code source TypeScript situé dans `packages/core/src` et `packages/cli/src` est compilé en JavaScript.  
- Déplacement des fichiers :  
  - `packages/core/src/**/*.ts` → compilé vers → `packages/core/dist/`  
  - `packages/cli/src/**/*.ts` → compilé vers → `packages/cli/dist/`  
- Pourquoi : Le code TypeScript écrit pendant le développement doit être converti en JavaScript exécutable par Node.js. Le package `core` est compilé en premier, car le package `cli` en dépend.

Étape 3 : Empaquetage et assemblage du package final prêt à être publié

Il s’agit de l’étape la plus critique, durant laquelle les fichiers sont déplacés et transformés pour atteindre leur état final destiné à la publication. Le processus utilise des techniques modernes d’empaquetage afin de produire le package final.

1.  Création de l’empaquetage :  
    - Ce qui se produit : Le script `prepare-package.js` crée un package de distribution propre dans le répertoire `dist`.  
    - Transformations clés :  
      - Copie de `README.md` et de `LICENSE` dans `dist/`  
      - Copie du dossier `locales` pour la prise en charge de l’internationalisation  
      - Génération d’un fichier `package.json` propre pour la distribution, ne contenant que les dépendances strictement nécessaires  
      - Minimisation des dépendances de distribution (aucune dépendance runtime n’est embarquée)  
      - Conservation des dépendances optionnelles telles que `node-pty`

2.  Création du bundle JavaScript :  
    - Ce qui se produit : Le code JavaScript compilé provenant de `packages/core/dist` et de `packages/cli/dist` est regroupé dans un seul fichier JavaScript exécutable à l’aide d’`esbuild`.  
    - Emplacement du fichier : `dist/cli.js`  
    - Pourquoi : Cela produit un fichier unique et optimisé contenant l’intégralité du code applicatif nécessaire. Cela simplifie le package en éliminant le besoin d’une résolution complexe des dépendances au moment de l’installation.

3.  Copie des fichiers statiques et des fichiers auxiliaires :  
    - Ce qui se produit : Les fichiers essentiels — non issus du code source mais requis pour le bon fonctionnement ou la bonne documentation du package — sont copiés dans le répertoire `dist`.  
    - Déplacement des fichiers :  
      - `README.md` → `dist/README.md`  
      - `LICENSE` → `dist/LICENSE`  
      - `locales/` → `dist/locales/`  
      - Fichiers tiers (`vendor`) → `dist/vendor/`  
    - Pourquoi :  
      - `README.md` et `LICENSE` sont des fichiers standard devant figurer dans tout package NPM.  
      - Le dossier `locales` permet de supporter les fonctionnalités d’internationalisation.  
      - Les fichiers tiers (`vendor`) contiennent les dépendances runtime nécessaires.

Étape 4 : Publication sur NPM

- Ce qui se produit : La commande `npm publish` est exécutée depuis le répertoire `dist` à la racine du projet.  
- Pourquoi : En lançant `npm publish` depuis le répertoire `dist`, seuls les fichiers soigneusement assemblés à l’étape 3 sont envoyés au registre NPM. Ainsi, aucun code source, aucun fichier de test ni aucune configuration de développement ne risquent d’être publiés par erreur, ce qui garantit un package propre et minimal pour les utilisateurs.

Ce processus garantit que l’artefact final publié constitue une représentation spécifique, propre et efficace du projet, plutôt qu’une simple copie directe de l’espace de travail de développement.

## Espaces de travail NPM

Ce projet utilise les [espaces de travail NPM](https://docs.npmjs.com/cli/v10/using-npm/workspaces) pour gérer les packages au sein de ce monorepo. Cela simplifie le développement en permettant de gérer les dépendances et d’exécuter des scripts sur plusieurs packages depuis la racine du projet.

### Fonctionnement

Le fichier `package.json` à la racine définit les espaces de travail de ce projet :

```json
{
  "workspaces": ["packages/*"]
}
```

Cela indique à NPM que tout dossier situé dans le répertoire `packages` constitue un package distinct devant être géré dans le cadre de cet espace de travail.

### Avantages des espaces de travail

- **Gestion simplifiée des dépendances** : L’exécution de `npm install` depuis la racine du projet installe toutes les dépendances de tous les packages de l’espace de travail et les lie entre eux. Cela signifie que vous n’avez pas besoin d’exécuter `npm install` dans le répertoire de chaque package.
- **Liaison automatique** : Les packages au sein de l’espace de travail peuvent dépendre les uns des autres. Lorsque vous exécutez `npm install`, NPM crée automatiquement des liens symboliques entre les packages. Ainsi, lorsque vous modifiez un package, ces modifications sont immédiatement disponibles pour les autres packages qui en dépendent.
- **Exécution simplifiée des scripts** : Vous pouvez exécuter des scripts dans n’importe quel package depuis la racine du projet à l’aide de l’option `--workspace`. Par exemple, pour exécuter le script `build` dans le package `cli`, vous pouvez lancer `npm run build --workspace @qwen-code/qwen-code`.