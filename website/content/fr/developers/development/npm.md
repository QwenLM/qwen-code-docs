# Aperçu du package

Ce monorepo contient deux packages principaux : `@qwen-code/qwen-code` et `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Il s'agit du package principal pour Qwen Code. Il est responsable de l'interface utilisateur, de l'analyse des commandes et de toutes les autres fonctionnalités destinées à l'utilisateur.

Lorsque ce package est publié, il est regroupé en un seul fichier exécutable. Ce bundle inclut toutes les dépendances du package, y compris `@qwen-code/qwen-code-core`. Cela signifie que qu'un utilisateur installe le package avec `npm install -g @qwen-code/qwen-code` ou qu'il l'exécute directement avec `npx @qwen-code/qwen-code`, il utilise cet unique exécutable autonome.

## `@qwen-code/qwen-code-core`

Ce package contient la logique principale pour le CLI. Il est responsable de l'envoi des requêtes API aux fournisseurs configurés, de la gestion de l'authentification et du cache local.

Ce package n'est pas embarqué. Lorsqu'il est publié, il l'est en tant que package Node.js standard avec ses propres dépendances. Cela permet de l'utiliser comme package autonome dans d'autres projets, si nécessaire. Tout le code JavaScript transpilé présent dans le dossier `dist` est inclus dans le package.

# Processus de publication

Ce projet suit un processus de publication structuré afin de s'assurer que tous les packages sont correctement versionnés et publiés. Le processus est conçu pour être aussi automatisé que possible.

## Comment effectuer une publication

Les publications sont gérées via le workflow GitHub Actions [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml). Pour effectuer manuellement une publication de correctif ou un hotfix :

1.  Accédez à l'onglet **Actions** du dépôt.
2.  Sélectionnez le workflow **Release** dans la liste.
3.  Cliquez sur le menu déroulant **Run workflow**.
4.  Remplissez les champs requis :
    - **Version** : La version exacte à publier (par exemple, `v0.2.1`).
    - **Ref** : La branche ou le SHA du commit à partir duquel publier (la valeur par défaut est `main`).
    - **Dry Run** : Laissez la valeur `true` pour tester le workflow sans publier, ou définissez-la à `false` pour effectuer une publication réelle.
5.  Cliquez sur **Run workflow**.

## Types de publications

Le projet prend en charge plusieurs types de publications :

### Publications stables

Publications stables régulières destinées à une utilisation en production.

### Publications de prévisualisation

Publications hebdomadaires de prévisualisation chaque mardi à 23h59 UTC pour un accès anticipé aux fonctionnalités à venir.

### Versions nocturnes

Versions nocturnes quotidiennes à minuit UTC pour les tests de développement en pointe.

## Calendrier de publication automatisé

- **Nocturne** : Tous les jours à minuit UTC
- **Aperçu** : Tous les mardis à 23h59 UTC
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

1.  Récupère le code spécifié (dernière version de la branche `main` ou commit spécifique).
2.  Installe toutes les dépendances.
3.  Exécute l'ensemble complet des vérifications `preflight` et des tests d'intégration.
4.  Si tous les tests réussissent, calcule le numéro de version approprié en fonction du type de publication.
5.  Construit et publie les paquets sur npm avec le dist-tag approprié.
6.  Crée une publication GitHub pour la version.

### Gestion des échecs

Si une étape du workflow de publication échoue, une nouvelle issue sera automatiquement créée dans le dépôt avec les étiquettes `bug` et une étiquette spécifique au type d'échec (par exemple, `nightly-failure`, `preview-failure`). L'issue contiendra un lien vers l'exécution du workflow ayant échoué pour faciliter le débogage.

## Validation de la version

Après avoir publié une nouvelle version, des tests de validation doivent être effectués pour s'assurer que les paquets fonctionnent comme prévu. Cela peut être fait en installant localement les paquets et en exécutant un ensemble de tests pour vérifier qu'ils fonctionnent correctement.

- `npx -y @qwen-code/qwen-code@latest --version` pour valider que l'envoi s'est déroulé comme prévu si vous n'avez pas effectué de tag rc ou dev
- `npx -y @qwen-code/qwen-code@<tag de version> --version` pour valider que le tag a été correctement envoyé
- _Ceci est destructif localement_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<version>`
- Il est recommandé d'effectuer des tests de validation basiques en exécutant quelques commandes et outils llm pour s'assurer que les paquets fonctionnent comme prévu. Nous formaliserons cela davantage à l'avenir.

## Quand fusionner le changement de version, ou pas ?

Le modèle ci-dessus pour créer des versions correctives ou des hotfix à partir de validations actuelles ou antérieures laisse le dépôt dans l'état suivant :

1.  L'Étiquette (`vX.Y.Z-patch.1`) : Cette étiquette pointe correctement vers la validation d'origine sur la branche principale qui contient le code stable que vous avez prévu de publier. C'est essentiel. Toute personne qui récupère cette étiquette obtient exactement le code qui a été publié.
2.  La Branche (`release-vX.Y.Z-patch.1`) : Cette branche contient une nouvelle validation au-dessus de la validation étiquetée. Cette nouvelle validation ne contient que le changement du numéro de version dans package.json (ainsi que d'autres fichiers connexes comme package-lock.json).

Cette séparation est bonne. Elle maintient l'historique de votre branche principale exempt des modifications de version spécifiques aux publications jusqu'à ce que vous décidiez de les fusionner.

C'est là la décision critique, et elle dépend entièrement de la nature de la publication.

### Fusionner pour les correctifs stables et les correctifs urgents

Vous souhaitez presque toujours fusionner la branche `release-<tag>` dans `main` pour toute version de correctif stable ou correctif urgent.

- Pourquoi ? La raison principale est de mettre à jour la version dans le fichier package.json de la branche main. Si vous publiez la version v1.2.1 depuis un ancien commit mais que vous ne fusionnez jamais le changement de version en amont, le fichier package.json de votre branche main indiquera toujours "version": "1.2.0". Le prochain développeur qui commencera à travailler sur la prochaine version de fonctionnalité (v1.3.0) partira d'une base de code ayant un numéro de version incorrect et plus ancien. Cela entraîne de la confusion et nécessite une mise à jour manuelle de la version ultérieurement.
- Le processus : Une fois la branche release-v1.2.1 créée et le package publié avec succès, vous devez ouvrir une demande de tirage (pull request) pour fusionner release-v1.2.1 dans main. Cette PR contiendra un seul commit : "chore: bump version to v1.2.1". Il s'agit d'une intégration propre et simple qui maintient votre branche principale synchronisée avec la dernière version publiée.

### NE PAS fusionner les pré-livraisons (RC, Bêta, Dev)

Vous ne fusionnez généralement pas les branches de pré-livraison dans `main`.

- Pourquoi ? Les versions préliminaires (par exemple, v1.3.0-rc.1, v1.3.0-rc.2) sont, par définition,
  instables et temporaires. Vous ne souhaitez pas polluer l'historique de votre branche principale avec une
  série de mises à jour de versions pour des candidats de publication. Le fichier package.json dans main devrait refléter
  la dernière version stable publiée, pas une version RC.
- Le processus : La branche release-v1.3.0-rc.1 est créée, la commande npm publish --tag rc est exécutée,
  puis... la branche a rempli son objectif. Vous pouvez simplement la supprimer. Le code pour
  la version RC est déjà sur main (ou sur une branche de fonctionnalité), donc aucun code fonctionnel n'est perdu. La
  branche de publication n'était qu'un véhicule temporaire pour le numéro de version.

## Test et validation locaux : Modifications du processus d’empaquetage et de publication

Si vous avez besoin de tester le processus de publication sans réellement publier sur NPM ou créer une version publique sur GitHub, vous pouvez déclencher manuellement le workflow depuis l'interface utilisateur de GitHub.

1.  Accédez à l'[onglet Actions](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) du dépôt.
2.  Cliquez sur le menu déroulant "Run workflow".
3.  Laissez l'option `dry_run` cochée (`true`).
4.  Cliquez sur le bouton "Run workflow".

Cela lancera l'intégralité du processus de publication mais sautera les étapes `npm publish` et `gh release create`. Vous pouvez examiner les journaux du workflow pour vous assurer que tout fonctionne comme prévu.

Il est essentiel de tester localement toutes modifications apportées au processus d’empaquetage et de publication avant de les valider. Cela garantit que les paquets seront publiés correctement et qu'ils fonctionneront comme prévu lorsqu'ils seront installés par un utilisateur.

Pour valider vos modifications, vous pouvez effectuer une simulation du processus de publication. Cela simulera le processus de publication sans réellement publier les paquets sur le registre npm.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Cette commande effectuera les opérations suivantes :

1.  Construire tous les paquets.
2.  Exécuter tous les scripts de prépublication.
3.  Créer les archives tar des paquets qui seraient publiées sur npm.
4.  Afficher un résumé des paquets qui seraient publiés.

Vous pouvez ensuite examiner les archives tar générées pour vous assurer qu'elles contiennent les fichiers corrects et que les fichiers `package.json` ont été mis à jour correctement. Les archives tar seront créées à la racine du répertoire de chaque paquet (par exemple, `packages/cli/qwen-code-0.1.6.tgz`).

En effectuant une simulation, vous pouvez être certain que vos modifications du processus d’empaquetage sont correctes et que les paquets seront publiés avec succès.

## Analyse détaillée de la publication

L'objectif principal du processus de publication est de prendre le code source des dossiers packages/, de le compiler et de constituer un package propre et autonome dans un dossier temporaire `dist` à la racine du projet. C'est ce dossier `dist` qui est effectivement publié sur NPM.

Voici les étapes clés :

Étape 1 : Vérifications préliminaires et gestion de version

- Ce qui se passe : Avant que tout fichier ne soit déplacé, le processus s'assure que le projet est dans un bon état. Cela implique l'exécution des tests, la vérification du style de code et la vérification des types (npm run preflight). Le numéro de version dans le package.json racine et dans packages/cli/package.json est mis à jour avec la nouvelle version de publication.
- Pourquoi : Cela garantit que seul du code de qualité, fonctionnel, est publié. La gestion de version est la première étape pour signifier une nouvelle publication.

Étape 2 : Compilation du code source

- Ce qui se passe : Le code source TypeScript situé dans packages/core/src et packages/cli/src est compilé en JavaScript.
- Déplacement des fichiers :
  - packages/core/src/\*_/_.ts -> compilé vers -> packages/core/dist/
  - packages/cli/src/\*_/_.ts -> compilé vers -> packages/cli/dist/
- Pourquoi : Le code TypeScript écrit pendant le développement doit être converti en JavaScript pur pouvant être exécuté par Node.js. Le package core est compilé en premier car le package cli en dépend.

Étape 3 : Empaquetage et assemblage du package final publiable

C'est l'étape la plus critique où les fichiers sont déplacés et transformés pour atteindre leur état final avant publication. Le processus utilise des techniques modernes d'empaquetage pour créer le package final.

1.  Création du bundle :
    - Ce qui se passe : Le script prepare-package.js crée un package de distribution propre dans le dossier `dist`.
    - Transformations clés :
      - Copie README.md et LICENSE dans dist/
      - Copie le dossier locales pour l'internationalisation
      - Crée un package.json propre pour la distribution contenant uniquement les dépendances nécessaires
      - Garde les dépendances de distribution minimales (pas de dépendances runtime embarquées)
      - Conserve les dépendances optionnelles pour node-pty

2.  Le bundle JavaScript est créé :
    - Ce qui se passe : Le JavaScript compilé provenant à la fois de packages/core/dist et de packages/cli/dist est regroupé en un seul fichier JavaScript exécutable à l'aide d'esbuild.
    - Emplacement du fichier : dist/cli.js
    - Pourquoi : Cela crée un seul fichier optimisé contenant tout le code applicatif nécessaire. Cela simplifie le package en supprimant le besoin de résolution complexe de dépendances au moment de l'installation.

3.  Les fichiers statiques et les fichiers de support sont copiés :
    - Ce qui se passe : Les fichiers essentiels qui ne font pas partie du code source mais sont requis pour que le package fonctionne correctement ou soit bien documenté sont copiés dans le dossier `dist`.
    - Déplacement des fichiers :
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Fichiers vendor -> dist/vendor/
    - Pourquoi :
      - Le README.md et la LICENSE sont des fichiers standards qui devraient être inclus dans tout package NPM.
      - Les locales prennent en charge les fonctionnalités d'internationalisation
      - Les fichiers vendor contiennent les dépendances runtime nécessaires

Étape 4 : Publication sur NPM

- Ce qui se passe : La commande npm publish est exécutée depuis l'intérieur du dossier racine `dist`.
- Pourquoi : En exécutant npm publish depuis l'intérieur du dossier `dist`, seuls les fichiers soigneusement assemblés à l'étape 3 sont téléchargés vers le registre NPM. Cela empêche toute publication accidentelle de code source, de fichiers de test ou de configurations de développement, résultant en un package propre et minimal pour les utilisateurs.

Ce processus garantit que l'artefact finalement publié est une représentation pensée spécifiquement, propre et efficace du projet, plutôt qu'une copie directe de l'espace de travail de développement.

## Espaces de travail NPM

Ce projet utilise les [Espaces de travail NPM](https://docs.npmjs.com/cli/v10/using-npm/workspaces) pour gérer les paquets au sein de ce monorepo. Cela simplifie le développement en nous permettant de gérer les dépendances et d'exécuter des scripts sur plusieurs paquets depuis la racine du projet.

### Fonctionnement

Le fichier `package.json` à la racine définit les espaces de travail pour ce projet :

```json
{
  "workspaces": ["packages/*"]
}
```

Cela indique à NPM que tout dossier à l'intérieur du répertoire `packages` est un paquet séparé qui doit être géré dans le cadre de l'espace de travail.

### Avantages des espaces de travail

- **Gestion simplifiée des dépendances** : L'exécution de `npm install` à la racine du projet installera toutes les dépendances pour tous les paquets de l'espace de travail et les liera entre elles. Cela signifie que vous n'avez pas besoin d'exécuter `npm install` dans chaque répertoire de paquet.
- **Liaison automatique** : Les paquets au sein de l'espace de travail peuvent dépendre les uns des autres. Lorsque vous exécutez `npm install`, NPM créera automatiquement des liens symboliques entre les paquets. Cela signifie que lorsque vous apportez des modifications à un paquet, celles-ci sont immédiatement disponibles pour les autres paquets qui en dépendent.
- **Exécution simplifiée des scripts** : Vous pouvez exécuter des scripts dans n'importe quel paquet depuis la racine du projet en utilisant l'option `--workspace`. Par exemple, pour exécuter le script `build` dans le paquet `cli`, vous pouvez exécuter `npm run build --workspace @qwen-code/qwen-code`.