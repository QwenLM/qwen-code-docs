# Vue d'ensemble des packages

Ce monorepo contient deux packages principaux : `@qwen-code/qwen-code` et `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Il s'agit du package principal pour Qwen Code. Il gère l'interface utilisateur, l'analyse des commandes et toutes les autres fonctionnalités destinées aux utilisateurs.

Lors de la publication, ce package est empaqueté en un seul fichier exécutable. Ce bundle inclut toutes les dépendances du package, y compris `@qwen-code/qwen-code-core`. Ainsi, qu'un utilisateur installe le package avec `npm install -g @qwen-code/qwen-code` ou l'exécute directement avec `npx @qwen-code/qwen-code`, il utilise ce même exécutable autonome.

## `@qwen-code/qwen-code-core`

Ce package contient la logique principale du CLI. Il est chargé d'effectuer les requêtes API vers les fournisseurs configurés, de gérer l'authentification et de gérer le cache local.

Ce package n'est pas bundlé. Lors de sa publication, il est distribué sous forme de package Node.js standard avec ses propres dépendances. Cela permet de l'utiliser comme package autonome dans d'autres projets si nécessaire. Tout le code JS transpilé dans le dossier `dist` est inclus dans le package.

# Processus de publication

Ce projet suit un processus de publication structuré pour garantir que tous les packages sont correctement versionnés et publiés. Le processus est conçu pour être aussi automatisé que possible.

## Comment publier

Les publications sont gérées via le workflow GitHub Actions [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml). Pour effectuer une publication manuelle pour un patch ou un hotfix :

1.  Accédez à l'onglet **Actions** du dépôt.
2.  Sélectionnez le workflow **Release** dans la liste.
3.  Cliquez sur le bouton déroulant **Run workflow**.
4.  Renseignez les paramètres requis :
    - **Version** : La version exacte à publier (ex. `v0.2.1`).
    - **Ref** : La branche ou le SHA du commit à partir duquel publier (par défaut `main`).
    - **Dry Run** : Laissez sur `true` pour tester le workflow sans publier, ou passez à `false` pour effectuer une publication réelle.
5.  Cliquez sur **Run workflow**.

## Types de publication

Le projet prend en charge plusieurs types de publications :

### Publications stables

Publications stables régulières destinées à un usage en production.

### Publications preview

Publications preview hebdomadaires chaque mardi à 23h59 UTC pour un accès anticipé aux fonctionnalités à venir.

### Publications nightly

Publications nightly quotidiennes à minuit UTC pour les tests de développement à la pointe.

## Planning des publications automatisées

- **Nightly** : Tous les jours à minuit UTC
- **Preview** : Tous les mardis à 23h59 UTC
- **Stable** : Publications manuelles déclenchées par les mainteneurs

### Comment utiliser les différents types de publication

Pour installer la dernière version de chaque type :

```bash
# Stable (default)
npm install -g @qwen-code/qwen-code

# Preview
npm install -g @qwen-code/qwen-code@preview

# Nightly
npm install -g @qwen-code/qwen-code@nightly
```

### Détails du processus de publication

Chaque publication planifiée ou manuelle suit ces étapes :

1.  Récupère le code spécifié (dernière version de la branche `main` ou commit spécifique).
2.  Installe toutes les dépendances.
3.  Exécute la suite complète des vérifications `preflight` et des tests d'intégration.
4.  Si tous les tests réussissent, il calcule le numéro de version approprié en fonction du type de publication.
5.  Compile et publie les packages sur npm avec le dist-tag approprié.
6.  Crée une GitHub Release pour la version.

### Gestion des échecs

Si une étape du workflow de publication échoue, une nouvelle issue est automatiquement créée dans le dépôt avec les labels `bug` et un label d'échec spécifique au type (ex. `nightly-failure`, `preview-failure`). L'issue contiendra un lien vers l'exécution du workflow ayant échoué pour faciliter le débogage.

## Validation de la publication

Après le push d'une nouvelle publication, des smoke tests doivent être effectués pour s'assurer que les packages fonctionnent comme prévu. Cela peut être fait en installant les packages localement et en exécutant une série de tests pour vérifier leur bon fonctionnement.

- `npx -y @qwen-code/qwen-code@latest --version` pour valider que le push a fonctionné comme prévu si vous n'utilisiez pas un tag rc ou dev
- `npx -y @qwen-code/qwen-code@<release tag> --version` pour valider que le tag a été correctement poussé
- _Cette opération est destructive localement_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force &&  npm install @qwen-code/qwen-code@<version>`
- Il est recommandé d'effectuer un smoke test basique en exécutant quelques commandes et outils LLM pour s'assurer que les packages fonctionnent comme prévu. Nous formaliserons davantage cette procédure à l'avenir.

## Quand fusionner (ou non) le changement de version ?

Le modèle ci-dessus pour créer des publications patch ou hotfix à partir de commits actuels ou plus anciens laisse le dépôt dans l'état suivant :

1.  Le Tag (`vX.Y.Z-patch.1`) : Ce tag pointe correctement vers le commit original sur main qui contient le code stable que vous souhaitiez publier. C'est crucial. Toute personne qui récupère ce tag obtient exactement le code qui a été publié.
2.  La Branch (`release-vX.Y.Z-patch.1`) : Cette branche contient un nouveau commit au-dessus du commit tagué. Ce nouveau commit ne contient que la modification du numéro de version dans package.json (et d'autres fichiers associés comme package-lock.json).

Cette séparation est bénéfique. Elle garde l'historique de votre branche main propre des incréments de version spécifiques aux publications jusqu'à ce que vous décidiez de les fusionner.

C'est la décision critique, et elle dépend entièrement de la nature de la publication.

### Fusionner pour les patches stables et les hotfixes

Vous voudrez presque toujours fusionner la branche `release-<tag>` dans `main` pour toute publication de patch stable ou de hotfix.

- Pourquoi ? La raison principale est de mettre à jour la version dans le package.json de main. Si vous publiez la v1.2.1 à partir d'un ancien commit mais ne fusionnez jamais l'incrémentation de version, le package.json de votre branche main indiquera toujours "version": "1.2.0". Le prochain développeur qui commencera à travailler sur la prochaine release de fonctionnalités (v1.3.0) créera une branche à partir d'une base de code avec un numéro de version incorrect et obsolète. Cela entraîne de la confusion et nécessite une incrémentation manuelle ultérieure.
- Le processus : Après la création de la branche release-v1.2.1 et la publication réussie du package, vous devez ouvrir une pull request pour fusionner release-v1.2.1 dans main. Cette PR ne contiendra qu'un seul commit : "chore: bump version to v1.2.1". C'est une intégration propre et simple qui maintient votre branche main synchronisée avec la dernière version publiée.

### NE PAS fusionner pour les pré-publications (RC, Beta, Dev)

En règle générale, vous ne fusionnez pas les branches de publication pour les pré-publications dans `main`.

- Pourquoi ? Les versions de pré-publication (ex. v1.3.0-rc.1, v1.3.0-rc.2) sont, par définition, instables et temporaires. Vous ne voulez pas polluer l'historique de votre branche main avec une série d'incréments de version pour les release candidates. Le package.json dans main doit refléter la dernière version stable publiée, et non une RC.
- Le processus : La branche release-v1.3.0-rc.1 est créée, la commande `npm publish --tag rc` est exécutée, et ensuite... la branche a rempli son rôle. Vous pouvez simplement la supprimer. Le code pour la RC est déjà sur main (ou sur une branche de fonctionnalité), donc aucun code fonctionnel n'est perdu. La branche de publication n'était qu'un véhicule temporaire pour le numéro de version.

## Tests locaux et validation : Modifications du processus d'empaquetage et de publication

Si vous devez tester le processus de publication sans réellement publier sur NPM ni créer de GitHub Release publique, vous pouvez déclencher le workflow manuellement depuis l'interface GitHub.

1.  Accédez à l'[onglet Actions](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) du dépôt.
2.  Cliquez sur le menu déroulant "Run workflow".
3.  Laissez l'option `dry_run` cochée (`true`).
4.  Cliquez sur le bouton "Run workflow".

Cela exécutera l'intégralité du processus de publication mais ignorera les étapes `npm publish` et `gh release create`. Vous pouvez inspecter les logs du workflow pour vous assurer que tout fonctionne comme prévu.

Il est crucial de tester localement toute modification apportée au processus d'empaquetage et de publication avant de les committer. Cela garantit que les packages seront publiés correctement et qu'ils fonctionneront comme prévu une fois installés par un utilisateur.

Pour valider vos modifications, vous pouvez effectuer un dry run du processus de publication. Cela simulera le processus sans réellement publier les packages sur le registre npm.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Cette commande effectuera les opérations suivantes :

1.  Compiler tous les packages.
2.  Exécuter tous les scripts prepublish.
3.  Créer les archives tar des packages qui seraient publiées sur npm.
4.  Afficher un résumé des packages qui seraient publiés.

Vous pouvez ensuite inspecter les archives tar générées pour vous assurer qu'elles contiennent les bons fichiers et que les fichiers `package.json` ont été correctement mis à jour. Les archives tar seront créées à la racine du répertoire de chaque package (ex. `packages/cli/qwen-code-0.1.6.tgz`).

En effectuant un dry run, vous pouvez être certain que vos modifications du processus d'empaquetage sont correctes et que les packages seront publiés avec succès.

## Analyse approfondie du processus de publication

L'objectif principal du processus de publication est de prendre le code source du répertoire `packages/`, de le compiler et d'assembler un package propre et autonome dans un répertoire temporaire `dist` à la racine du projet. C'est ce répertoire `dist` qui est réellement publié sur NPM.

Voici les étapes clés :

Étape 1 : Vérifications de cohérence pré-publication et versionnage

- Ce qui se passe : Avant tout déplacement de fichiers, le processus s'assure que le projet est dans un état stable. Cela implique d'exécuter les tests, le linting et la vérification des types (`npm run preflight`). Le numéro de version dans le `package.json` racine et `packages/cli/package.json` est mis à jour vers la nouvelle version de publication.
- Pourquoi : Cela garantit que seul un code de haute qualité et fonctionnel est publié. Le versionnage est la première étape pour signaler une nouvelle publication.

Étape 2 : Compilation du code source

- Ce qui se passe : Le code source TypeScript dans `packages/core/src` et `packages/cli/src` est compilé en JavaScript.
- Déplacement des fichiers :
  - packages/core/src/\*_/_.ts -> compilé vers -> packages/core/dist/
  - packages/cli/src/\*_/_.ts -> compilé vers -> packages/cli/dist/
- Pourquoi : Le code TypeScript écrit pendant le développement doit être converti en JavaScript standard exécutable par Node.js. Le package core est compilé en premier car le package cli en dépend.

Étape 3 : Bundling et assemblage du package final publiable

C'est l'étape la plus critique où les fichiers sont déplacés et transformés dans leur état final pour la publication. Le processus utilise des techniques de bundling modernes pour créer le package final.

1.  Création du bundle :
    - Ce qui se passe : Le script `prepare-package.js` crée un package de distribution propre dans le répertoire `dist`.
    - Transformations clés :
      - Copie README.md et LICENSE vers dist/
      - Copie le dossier locales pour l'internationalisation
      - Crée un package.json propre pour la distribution avec uniquement les dépendances nécessaires
      - Garde les dépendances de distribution minimales (pas de dépendances runtime bundlées)
      - Conserve les dépendances optionnelles pour node-pty

2.  Création du bundle JavaScript :
    - Ce qui se passe : Le JavaScript compilé de `packages/core/dist` et `packages/cli/dist` est bundlé en un seul fichier JavaScript exécutable à l'aide d'esbuild.
    - Emplacement du fichier : dist/cli.js
    - Pourquoi : Cela crée un fichier unique et optimisé contenant tout le code applicatif nécessaire. Cela simplifie le package en supprimant le besoin d'une résolution de dépendances complexe au moment de l'installation.

3.  Copie des fichiers statiques et de support :
    - Ce qui se passe : Les fichiers essentiels qui ne font pas partie du code source mais sont requis pour le bon fonctionnement ou la description du package sont copiés dans le répertoire `dist`.
    - Déplacement des fichiers :
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Fichiers vendor -> dist/vendor/
    - Pourquoi :
      - README.md et LICENSE sont des fichiers standards qui doivent être inclus dans tout package NPM.
      - Les locales prennent en charge les fonctionnalités d'internationalisation
      - Les fichiers vendor contiennent les dépendances runtime nécessaires

Étape 4 : Publication sur NPM

- Ce qui se passe : La commande `npm publish` est exécutée depuis l'intérieur du répertoire `dist` racine.
- Pourquoi : En exécutant `npm publish` depuis le répertoire `dist`, seuls les fichiers soigneusement assemblés à l'étape 3 sont uploadés sur le registre NPM. Cela empêche la publication accidentelle de code source, de fichiers de test ou de configurations de développement, ce qui résulte en un package propre et minimal pour les utilisateurs.

Ce processus garantit que l'artefact final publié est une représentation propre, efficace et conçue sur mesure du projet, plutôt qu'une copie directe de l'espace de travail de développement.

## NPM Workspaces

Ce projet utilise [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) pour gérer les packages au sein de ce monorepo. Cela simplifie le développement en nous permettant de gérer les dépendances et d'exécuter des scripts sur plusieurs packages depuis la racine du projet.

### Fonctionnement

Le fichier `package.json` racine définit les workspaces pour ce projet :

```json
{
  "workspaces": ["packages/*"]
}
```

Cela indique à NPM que tout dossier à l'intérieur du répertoire `packages` est un package distinct qui doit être géré dans le cadre du workspace.

### Avantages des Workspaces

- **Gestion simplifiée des dépendances** : Exécuter `npm install` depuis la racine du projet installera toutes les dépendances pour tous les packages du workspace et les liera entre eux. Cela signifie que vous n'avez pas besoin d'exécuter `npm install` dans le répertoire de chaque package.
- **Liaison automatique** : Les packages au sein du workspace peuvent dépendre les uns des autres. Lorsque vous exécutez `npm install`, NPM créera automatiquement des liens symboliques entre les packages. Cela signifie que lorsque vous modifiez un package, les modifications sont immédiatement disponibles pour les autres packages qui en dépendent.
- **Exécution simplifiée des scripts** : Vous pouvez exécuter des scripts dans n'importe quel package depuis la racine du projet en utilisant le flag `--workspace`. Par exemple, pour exécuter le script `build` dans le package `cli`, vous pouvez exécuter `npm run build --workspace @qwen-code/qwen-code`.