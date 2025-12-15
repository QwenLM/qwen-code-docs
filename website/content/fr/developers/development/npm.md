# Aperçu du package

Ce monorepo contient deux packages principaux : `@qwen-code/qwen-code` et `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Il s'agit du package principal pour Qwen Code. Il est responsable de l'interface utilisateur, de l'analyse des commandes, et de toutes les autres fonctionnalités destinées à l'utilisateur.

Lorsque ce package est publié, il est regroupé en un seul fichier exécutable. Ce bundle inclut toutes les dépendances du package, y compris `@qwen-code/qwen-code-core`. Cela signifie que qu'un utilisateur installe le package avec `npm install -g @qwen-code/qwen-code` ou l'exécute directement avec `npx @qwen-code/qwen-code`, il utilise ce même exécutable autonome.

## `@qwen-code/qwen-code-core`

Ce package contient la logique principale pour la CLI. Il est responsable des requêtes API vers les fournisseurs configurés, de la gestion de l'authentification et du cache local.

Ce package n'est pas bundlé. Lorsqu'il est publié, il l'est en tant que package Node.js standard avec ses propres dépendances. Cela permet de l'utiliser comme package autonome dans d'autres projets, si nécessaire. Tout le code JavaScript transpilé dans le dossier `dist` est inclus dans le package.

# Processus de publication

Ce projet suit un processus de publication structuré afin de garantir que tous les packages soient correctement versionnés et publiés. Le processus est conçu pour être aussi automatisé que possible.

## Comment publier une version

Les versions sont gérées via le workflow GitHub Actions [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml). Pour effectuer manuellement une publication de correctif ou de hotfix :

1.  Accédez à l'onglet **Actions** du dépôt.
2.  Sélectionnez le workflow **Release** dans la liste.
3.  Cliquez sur le bouton déroulant **Run workflow**.
4.  Remplissez les champs requis :
    - **Version** : La version exacte à publier (par exemple, `v0.2.1`).
    - **Ref** : La branche ou le SHA du commit à partir duquel publier (par défaut `main`).
    - **Dry Run** : Laissez `true` pour tester le workflow sans publier, ou définissez sur `false` pour effectuer une publication réelle.
5.  Cliquez sur **Run workflow**.

## Types de versions

Le projet prend en charge plusieurs types de versions :

### Versions stables

Versions stables régulières destinées à une utilisation en production.

### Versions préliminaires

Versions préliminaires hebdomadaires chaque mardi à 23h59 UTC pour accéder en avant-première aux nouvelles fonctionnalités à venir.

### Versions nocturnes

Des versions nocturnes quotidiennes à minuit UTC pour les tests de développement à la pointe.

## Planning des versions automatisées

- **Nocturne** : Tous les jours à minuit UTC
- **Aperçu** : Tous les mardis à 23h59 UTC
- **Stable** : Versions manuelles déclenchées par les mainteneurs

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

1.  Extraction du code spécifié (dernière version de la branche `main` ou commit spécifique).
2.  Installation de toutes les dépendances.
3.  Exécution de la suite complète des vérifications `preflight` et des tests d'intégration.
4.  Si tous les tests réussissent, calcul du numéro de version approprié en fonction du type de publication.
5.  Construction et publication des paquets sur npm avec le dist-tag approprié.
6.  Création d'une release GitHub pour la version.

### Gestion des échecs

Si une étape du workflow de publication échoue, un nouveau ticket est automatiquement créé dans le dépôt avec les labels `bug` et un label spécifique au type d'échec (par exemple, `nightly-failure`, `preview-failure`). Le ticket contiendra un lien vers l'exécution du workflow ayant échoué pour faciliter le débogage.

## Validation de la version

Après avoir poussé une nouvelle version, des tests de fumée doivent être effectués pour s'assurer que les paquets fonctionnent comme prévu. Cela peut être fait en installant les paquets localement et en exécutant un ensemble de tests afin de vérifier qu'ils fonctionnent correctement.

- `npx -y @qwen-code/qwen-code@latest --version` pour valider que la mise à jour a fonctionné comme prévu si vous n'utilisiez pas une étiquette rc ou dev
- `npx -y @qwen-code/qwen-code@<release tag> --version` pour valider que l'étiquette a été correctement poussée
- _Ceci est destructif localement_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force &&  npm install @qwen-code/qwen-code@<version>`
- Il est recommandé d'effectuer un test de fumée basique en exerçant quelques commandes et outils llm pour s'assurer que les paquets fonctionnent comme attendu. Nous formaliserons davantage cela à l'avenir.

## Quand fusionner le changement de version, ou non ?

Le modèle décrit ci-dessus pour créer des correctifs ou des versions d'urgence à partir de commits actuels ou plus anciens laisse le dépôt dans l'état suivant :

1. Le Tag (`vX.Y.Z-patch.1`) : Ce tag pointe correctement vers le commit original sur la branche principale qui contient le code stable que vous souhaitez publier. C'est crucial. Toute personne qui récupère ce tag obtient exactement le code qui a été publié.
2. La Branche (`release-vX.Y.Z-patch.1`) : Cette branche contient un nouveau commit en plus du commit tagué. Ce nouveau commit ne contient que le changement de numéro de version dans le fichier package.json (et autres fichiers liés comme package-lock.json).

Cette séparation est bénéfique. Elle permet de garder l'historique de votre branche principale propre, sans les modifications spécifiques aux versions de publication jusqu’au moment où vous décidez de les fusionner.

C’est ici qu’intervient la décision cruciale, et elle dépend entièrement de la nature de la publication.

### Fusion Retour pour les Correctifs Stables et les Patchs d'Urgence

Vous souhaitez presque toujours fusionner la branche `release-<tag>` dans `main` pour toute
publication de correctif stable ou de patch d'urgence.

- Pourquoi ? La raison principale est de mettre à jour la version dans le package.json de main. Si vous publiez
  v1.2.1 depuis un ancien commit mais ne fusionnez jamais la mise à jour de version en retour, le package.json
  de votre branche main indiquera toujours "version": "1.2.0". Le prochain développeur qui commencera le travail sur
  la prochaine version fonctionnelle (v1.3.0) travaillera à partir d'une base de code dont le numéro
  de version est incorrect et obsolète. Cela entraîne de la confusion et nécessite une mise à jour manuelle
  de la version par la suite.
- Le Processus : Après la création de la branche release-v1.2.1 et la publication réussie du paquet,
  vous devez ouvrir une pull request pour fusionner release-v1.2.1 dans main. Cette PR
  contiendra un seul commit : "chore: bump version to v1.2.1". Il s'agit d'une intégration propre et simple
  qui maintient votre branche main synchronisée avec la dernière version publiée.

### Ne pas fusionner les préversions (RC, Beta, Dev)

En général, vous ne fusionnez pas les branches de préversion dans `main`.

- Pourquoi ? Les versions préliminaires (par exemple, v1.3.0-rc.1, v1.3.0-rc.2) ne sont, par définition, ni stables ni permanentes. Vous ne souhaitez pas encombrer l’historique de votre branche principale avec une série de mises à jour de version pour des versions candidates. Le fichier package.json sur la branche main devrait refléter la dernière version stable publiée, et non une version candidate.
- Le processus : La branche release-v1.3.0-rc.1 est créée, la commande `npm publish --tag rc` est exécutée, puis… la branche a rempli son rôle. Vous pouvez simplement la supprimer. Le code correspondant à la version candidate existe déjà sur main (ou sur une branche de fonctionnalité), donc aucun code fonctionnel n’est perdu. La branche de release n’était qu’un moyen temporaire d’attribuer le numéro de version.

## Tests et validations locales : Modifications du processus d’empaquetage et de publication

Si vous devez tester le processus de publication sans réellement publier sur NPM ou créer une version publique sur GitHub, vous pouvez déclencher manuellement le workflow depuis l'interface GitHub.

1.  Accédez à l'[onglet Actions](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) du dépôt.
2.  Cliquez sur le menu déroulant « Run workflow ».
3.  Laissez l'option `dry_run` cochée (`true`).
4.  Cliquez sur le bouton « Run workflow ».

Cela exécutera l'intégralité du processus de publication mais ignorera les étapes `npm publish` et `gh release create`. Vous pouvez consulter les journaux du workflow pour vérifier que tout fonctionne comme prévu.

Il est essentiel de tester localement toutes les modifications apportées au processus d’empaquetage et de publication avant de les valider. Cela garantit que les paquets seront publiés correctement et qu’ils fonctionneront comme attendu lorsqu’un utilisateur les installera.

Pour valider vos changements, vous pouvez effectuer un test à blanc (dry run) du processus de publication. Celui-ci simule la publication sans envoyer effectivement les paquets vers le registre npm.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Cette commande effectue les actions suivantes :

1.  Construit tous les paquets.
2.  Exécute tous les scripts de pré-publication.
3.  Crée les archives tar des paquets qui seraient publiées sur npm.
4.  Affiche un résumé des paquets qui seraient publiés.

Vous pouvez ensuite inspecter les archives tar générées afin de vérifier qu’elles contiennent les bons fichiers et que les fichiers `package.json` ont été mis à jour correctement. Les archives tar seront créées à la racine du répertoire de chaque paquet (par exemple, `packages/cli/qwen-code-0.1.6.tgz`).

En réalisant un test à blanc, vous pouvez être certain(e) que vos modifications du processus d’empaquetage sont correctes et que les paquets seront publiés avec succès.

## Plongée dans la publication

L'objectif principal du processus de publication est de prendre le code source du répertoire `packages/`, de le compiler, et d'assembler un paquet propre et autonome dans un répertoire temporaire `dist` à la racine du projet. C'est ce répertoire `dist` qui est effectivement publié sur NPM.

Voici les étapes clés :

Étape 1 : Vérifications préalables et gestion des versions

- Ce qui se passe : Avant tout déplacement de fichiers, le processus s'assure que le projet est dans un bon état. Cela implique l'exécution des tests, du linting et de la vérification des types (`npm run preflight`). Le numéro de version dans les fichiers `package.json` de la racine et de `packages/cli/` est mis à jour vers la nouvelle version de publication.
- Pourquoi : Cela garantit que seul du code de qualité, fonctionnel, est publié. La gestion des versions est la première étape pour signifier une nouvelle publication.

Étape 2 : Compilation du code source

- Ce qui se passe : Le code source TypeScript dans `packages/core/src` et `packages/cli/src` est compilé en JavaScript.
- Déplacement des fichiers :
  - `packages/core/src/*/*_.ts` -> compilé vers -> `packages/core/dist/`
  - `packages/cli/src/*/*_.ts` -> compilé vers -> `packages/cli/dist/`
- Pourquoi : Le code TypeScript écrit durant le développement doit être converti en JavaScript brut exécutable par Node.js. Le paquet `core` est compilé en premier car le paquet `cli` en dépend.

Étape 3 : Empaquetage et assemblage du paquet final publiable

C’est l’étape la plus critique où les fichiers sont déplacés et transformés dans leur état final pour la publication. Le processus utilise des techniques modernes d’empaquetage pour créer le paquet final.

1. Création de l’empaquetage :
   - Ce qui se passe : Le script `prepare-package.js` crée un paquet de distribution propre dans le répertoire `dist`.
   - Transformations principales :
     - Copie de `README.md` et `LICENSE` vers `dist/`
     - Copie du dossier `locales` pour l’internationalisation
     - Création d’un `package.json` propre pour la distribution avec uniquement les dépendances nécessaires
     - Inclusion des dépendances d’exécution comme `tiktoken`
     - Conservation des dépendances optionnelles pour `node-pty`

2. Création du bundle JavaScript :
   - Ce qui se passe : Le JavaScript compilé depuis `packages/core/dist` et `packages/cli/dist` est regroupé en un seul fichier JavaScript exécutable via `esbuild`.
   - Emplacement du fichier : `dist/cli.js`
   - Pourquoi : Cela crée un fichier unique et optimisé contenant tout le code applicatif nécessaire. Cela simplifie le paquet en supprimant le besoin d’une résolution complexe des dépendances lors de l’installation.

3. Copie des fichiers statiques et complémentaires :
   - Ce qui se passe : Les fichiers essentiels qui ne font pas partie du code source mais sont nécessaires au bon fonctionnement ou à la description correcte du paquet sont copiés dans le répertoire `dist`.
   - Déplacement des fichiers :
     - `README.md` -> `dist/README.md`
     - `LICENSE` -> `dist/LICENSE`
     - `locales/` -> `dist/locales/`
     - Fichiers du fournisseur -> `dist/vendor/`
   - Pourquoi :
     - `README.md` et `LICENSE` sont des fichiers standards devant être inclus dans tout paquet NPM.
     - Les fichiers `locales` soutiennent les fonctionnalités d'internationalisation.
     - Les fichiers du fournisseur contiennent les dépendances d'exécution nécessaires.

Étape 4 : Publication sur NPM

- Ce qui se passe : La commande `npm publish` est exécutée depuis le répertoire racine `dist`.
- Pourquoi : En exécutant `npm publish` depuis le répertoire `dist`, seuls les fichiers soigneusement assemblés à l'étape 3 sont envoyés au registre NPM. Cela empêche toute publication accidentelle de code source, fichiers de test ou configurations de développement, résultant en un paquet propre et minimal pour les utilisateurs.

Ce processus garantit que l’artefact final publié est une représentation propre, efficace et spécifiquement conçue du projet, plutôt qu’une copie directe de l’espace de travail de développement.

## Espaces de travail NPM

Ce projet utilise les [espaces de travail NPM](https://docs.npmjs.com/cli/v10/using-npm/workspaces) pour gérer les paquets au sein de ce monorepo. Cela simplifie le développement en nous permettant de gérer les dépendances et d'exécuter des scripts sur plusieurs paquets depuis la racine du projet.

### Fonctionnement

Le fichier `package.json` à la racine définit les espaces de travail pour ce projet :

```json
{
  "workspaces": ["packages/*"]
}
```

Cela indique à NPM que chaque dossier situé dans le répertoire `packages` est un paquet distinct qui doit être géré dans le cadre de l'espace de travail.

### Avantages des espaces de travail

- **Gestion simplifiée des dépendances** : Exécuter `npm install` depuis la racine du projet installera toutes les dépendances pour tous les packages dans l'espace de travail et les liera ensemble. Cela signifie que vous n'avez pas besoin d'exécuter `npm install` dans le répertoire de chaque package.
- **Liaison automatique** : Les packages au sein de l'espace de travail peuvent dépendre les uns des autres. Lorsque vous exécutez `npm install`, NPM créera automatiquement des liens symboliques entre les packages. Cela signifie que lorsque vous apportez des modifications à un package, ces modifications sont immédiatement disponibles pour les autres packages qui en dépendent.
- **Exécution simplifiée des scripts** : Vous pouvez exécuter des scripts dans n'importe quel package depuis la racine du projet en utilisant le drapeau `--workspace`. Par exemple, pour exécuter le script `build` dans le package `cli`, vous pouvez exécuter `npm run build --workspace @qwen-code/qwen-code`.