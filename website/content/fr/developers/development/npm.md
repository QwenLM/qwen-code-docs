# Vue d'ensemble du paquet

Ce monorepo contient deux paquets principaux : `@qwen-code/qwen-code` et `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

C'est le paquet principal de Qwen Code. Il est responsable de l'interface utilisateur, de l'analyse des commandes et de toutes les autres fonctionnalités destinées à l'utilisateur.

Lorsque ce paquet est publié, il est empaqueté dans un seul fichier exécutable. Ce bundle inclut toutes les dépendances du paquet, y compris `@qwen-code/qwen-code-core`. Cela signifie que, que l'utilisateur installe le paquet avec `npm install -g @qwen-code/qwen-code` ou l'exécute directement avec `npx @qwen-code/qwen-code`, il utilise cet unique exécutable autonome.

## `@qwen-code/qwen-code-core`

Ce paquet contient la logique principale de la CLI. Il est responsable des requêtes API vers les fournisseurs configurés, de la gestion de l'authentification et de la gestion du cache local.

Ce paquet n'est pas empaqueté. Lorsqu'il est publié, il l'est en tant que paquet Node.js standard avec ses propres dépendances. Cela permet de l'utiliser comme un paquet autonome dans d'autres projets, si nécessaire. Tout le code JavaScript transpilé dans le dossier `dist` est inclus dans le paquet.

# Processus de publication

Ce projet suit un processus de publication structuré pour garantir que tous les paquets sont correctement versionnés et publiés. Le processus est conçu pour être aussi automatisé que possible.

## Comment publier

Les publications sont gérées via le workflow GitHub Actions [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml). Pour effectuer une publication manuelle pour un patch ou un hotfix :

1.  Accédez à l'onglet **Actions** du dépôt.
2.  Sélectionnez le workflow **Release** dans la liste.
3.  Cliquez sur le bouton déroulant **Run workflow**.
4.  Remplissez les entrées requises :
    - **Version** : La version exacte à publier (par exemple, `v0.2.1`).
    - **Ref** : La branche ou le SHA du commit à partir duquel publier (par défaut `main`).
    - **Dry Run** : Laissez `true` pour tester le workflow sans publier, ou mettez `false` pour effectuer une publication en direct.
5.  Cliquez sur **Run workflow**.

## Types de publication

Le projet prend en charge plusieurs types de publication :

### Publications stables

Publications stables régulières pour une utilisation en production.

### Publications Preview

Publications preview hebdomadaires tous les mardis à 23:59 UTC pour un accès anticipé aux fonctionnalités à venir.

### Publications Nightly

Publications nightly quotidiennes à minuit UTC pour des tests de développement de pointe.

## Calendrier de publication automatisé

- **Nightly** : Tous les jours à minuit UTC
- **Preview** : Tous les mardis à 23:59 UTC
- **Stable** : Publications manuelles déclenchées par les mainteneurs

### Comment utiliser les différents types de publication

Pour installer la dernière version de chaque type :

```bash
# Stable (par défaut)
npm install -g @qwen-code/qwen-code

# Preview
npm install -g @qwen-code/qwen-code@preview

# Nightly
npm install -g @qwen-code/qwen-code@nightly
```

### Détails du processus de publication

Chaque publication planifiée ou manuelle suit ces étapes :

1.  Vérifie le code spécifié (le dernier de la branche `main` ou d'un commit spécifique).
2.  Installe toutes les dépendances.
3.  Exécute l'ensemble des vérifications `preflight` et des tests d'intégration.
4.  Si tous les tests réussissent, il calcule le numéro de version approprié en fonction du type de publication.
5.  Construit et publie les paquets sur npm avec le dist-tag approprié.
6.  Crée une GitHub Release pour la version.

### Gestion des échecs

Si une étape du workflow de publication échoue, cela créera automatiquement un nouveau problème (issue) dans le dépôt avec les étiquettes `bug` et une étiquette d'échec spécifique au type (par exemple, `nightly-failure`, `preview-failure`). Le problème contiendra un lien vers l'exécution du workflow ayant échoué pour faciliter le débogage.

## Validation de la publication

Après avoir poussé une nouvelle publication, des tests de fumée doivent être effectués pour s'assurer que les paquets fonctionnent comme prévu. Cela peut être fait en installant les paquets localement et en exécutant une série de tests pour vérifier leur bon fonctionnement.

- `npx -y @qwen-code/qwen-code@latest --version` pour valider que le push a fonctionné comme prévu si vous n'utilisiez pas un tag rc ou dev
- `npx -y @qwen-code/qwen-code@<release tag> --version` pour valider que le tag a été poussé correctement
- _Ceci est destructeur localement_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force &&  npm install @qwen-code/qwen-code@<version>`
- Il est recommandé d'effectuer un test de fumée en exécutant quelques commandes et outils LLM pour s'assurer que les paquets fonctionnent comme prévu. Nous codifierons cela davantage à l'avenir.

## Quand fusionner le changement de version, ou pas ?

Le modèle ci-dessus pour créer des patchs ou hotfix à partir de commits actuels ou plus anciens laisse le dépôt dans l'état suivant :

1.  Le Tag (`vX.Y.Z-patch.1`) : Ce tag pointe correctement vers le commit original sur main qui contient le code stable que vous avez l'intention de publier. C'est crucial. Toute personne qui consulte ce tag obtient le code exact qui a été publié.
2.  La Branche (`release-vX.Y.Z-patch.1`) : Cette branche contient un nouveau commit par-dessus le commit tagué. Ce nouveau commit ne contient que le changement de numéro de version dans package.json (et d'autres fichiers associés comme package-lock.json).

Cette séparation est bonne. Elle maintient l'historique de votre branche main propre, sans les incrémentations de version propres aux publications, jusqu'à ce que vous décidiez de les fusionner.

C'est la décision critique, et elle dépend entièrement de la nature de la publication.

### Fusionner en retour pour les patchs stables et les hotfix

Vous voudrez presque toujours fusionner la branche `release-<tag>` dans `main` pour tout patch stable ou hotfix.

- Pourquoi ? La raison principale est de mettre à jour la version dans le package.json de main. Si vous publiez la v1.2.1 à partir d'un ancien commit mais que vous ne fusionnez jamais l'incrémentation de version en retour, le package.json de votre branche main indiquera encore `"version": "1.2.0"`. Le prochain développeur qui commencera à travailler sur la prochaine version fonctionnelle (v1.3.0) se basera sur un code qui a un numéro de version incorrect et plus ancien. Cela mène à de la confusion et nécessite une incrémentation manuelle de la version plus tard.
- Le Processus : Après la création de la branche release-v1.2.1 et la publication réussie du paquet, vous devez ouvrir une pull request pour fusionner release-v1.2.1 dans main. Cette PR ne contiendra qu'un seul commit : "chore: bump version to v1.2.1". C'est une intégration propre et simple qui maintient votre branche main synchronisée avec la dernière version publiée.

### NE PAS fusionner en retour pour les préversions (RC, Beta, Dev)

Vous ne fusionnez généralement pas les branches de publication des préversions dans `main`.

- Pourquoi ? Les versions de préversion (par exemple, v1.3.0-rc.1, v1.3.0-rc.2) ne sont, par définition, pas stables et sont temporaires. Vous ne voulez pas polluer l'historique de votre branche main avec une série d'incrémentations de version pour des candidats à la publication. Le package.json dans main doit refléter la dernière version stable publiée, pas une RC.
- Le Processus : La branche release-v1.3.0-rc.1 est créée, npm publish --tag rc se produit, puis... la branche a rempli son objectif. Vous pouvez simplement la supprimer. Le code de la RC est déjà sur main (ou une branche fonctionnelle), donc aucun code fonctionnel n'est perdu. La branche de publication n'était qu'un véhicule temporaire pour le numéro de version.

## Tests et validation locaux : Modifications du processus d'empaquetage et de publication

Si vous avez besoin de tester le processus de publication sans réellement publier sur NPM ou créer une GitHub Release publique, vous pouvez déclencher le workflow manuellement depuis l'interface GitHub.

1.  Allez dans l'onglet [Actions](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) du dépôt.
2.  Cliquez sur le menu déroulant "Run workflow".
3.  Laissez l'option `dry_run` cochée (`true`).
4.  Cliquez sur le bouton "Run workflow".

Cela exécutera l'ensemble du processus de publication mais sautera les étapes `npm publish` et `gh release create`. Vous pouvez inspecter les journaux du workflow pour vous assurer que tout fonctionne comme prévu.

Il est crucial de tester localement toute modification du processus d'empaquetage et de publication avant de la valider. Cela garantit que les paquets seront publiés correctement et qu'ils fonctionneront comme prévu lorsqu'un utilisateur les installera.

Pour valider vos modifications, vous pouvez effectuer une simulation (dry run) du processus de publication. Cela simulera le processus de publication sans réellement publier les paquets sur le registre npm.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Cette commande fera ce qui suit :

1.  Construira tous les paquets.
2.  Exécutera tous les scripts de prépublication.
3.  Créera les archives tar des paquets qui seraient publiées sur npm.
4.  Affichera un résumé des paquets qui seraient publiés.

Vous pouvez ensuite inspecter les archives générées pour vous assurer qu'elles contiennent les bons fichiers et que les fichiers `package.json` ont été mis à jour correctement. Les archives seront créées à la racine du répertoire de chaque paquet (par exemple, `packages/cli/qwen-code-0.1.6.tgz`).

En effectuant une simulation, vous pouvez être confiant que vos modifications du processus d'empaquetage sont correctes et que les paquets seront publiés avec succès.

## Analyse approfondie de la publication

L'objectif principal du processus de publication est de prendre le code source du répertoire packages/, de le construire et d'assembler un paquet propre et autonome dans un répertoire `dist` temporaire à la racine du projet. Ce répertoire `dist` est ce qui est réellement publié sur NPM.

Voici les étapes clés :

Étape 1 : Vérifications de cohérence préalables et versionnage

- Ce qui se passe : Avant tout déplacement de fichiers, le processus s'assure que le projet est dans un bon état. Cela implique l'exécution de tests, de linting et de vérification de types (npm run preflight). Le numéro de version dans le package.json racine et packages/cli/package.json est mis à jour avec la nouvelle version de publication.
- Pourquoi : Cela garantit que seul du code de haute qualité et fonctionnel est publié. Le versionnage est la première étape pour marquer une nouvelle publication.

Étape 2 : Construction du code source

- Ce qui se passe : Le code source TypeScript dans packages/core/src et packages/cli/src est compilé en JavaScript.
- Déplacement des fichiers :
  - packages/core/src/\*_/_.ts -> compilé vers -> packages/core/dist/
  - packages/cli/src/\*_/_.ts -> compilé vers -> packages/cli/dist/
- Pourquoi : Le code TypeScript écrit pendant le développement doit être converti en JavaScript pur qui peut être exécuté par Node.js. Le paquet core est construit en premier car le paquet cli en dépend.

Étape 3 : Empaquetage et assemblage du paquet final publiable

C'est l'étape la plus critique où les fichiers sont déplacés et transformés en leur état final pour la publication. Le processus utilise des techniques d'empaquetage modernes pour créer le paquet final.

1.  Création du bundle :
    - Ce qui se passe : Le script prepare-package.js crée un paquet de distribution propre dans le répertoire `dist`.
    - Transformations clés :
      - Copie README.md et LICENSE dans dist/
      - Copie le dossier locales pour l'internationalisation
      - Crée un package.json propre pour la distribution avec seulement les dépendances nécessaires
      - Maintient les dépendances de distribution au minimum (pas de dépendances d'exécution empaquetées)
      - Conserve les dépendances optionnelles pour node-pty

2.  Le bundle JavaScript est créé :
    - Ce qui se passe : Le JavaScript construit provenant à la fois de packages/core/dist et packages/cli/dist est regroupé en un seul fichier JavaScript exécutable à l'aide d'esbuild.
    - Emplacement du fichier : dist/cli.js
    - Pourquoi : Cela crée un fichier unique et optimisé qui contient tout le code d'application nécessaire. Cela simplifie le paquet en supprimant le besoin de résolution complexe des dépendances au moment de l'installation.

3.  Les fichiers statiques et de support sont copiés :
    - Ce qui se passe : Les fichiers essentiels qui ne font pas partie du code source mais qui sont nécessaires au bon fonctionnement du paquet ou à sa bonne description sont copiés dans le répertoire `dist`.
    - Déplacement des fichiers :
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Fichiers Vendor -> dist/vendor/
    - Pourquoi :
      - README.md et LICENSE sont des fichiers standard qui doivent être inclus dans tout paquet NPM.
      - Les locales prennent en charge les fonctionnalités d'internationalisation
      - Les fichiers Vendor contiennent les dépendances d'exécution nécessaires

Étape 4 : Publication sur NPM

- Ce qui se passe : La commande npm publish est exécutée depuis le répertoire racine `dist`.
- Pourquoi : En exécutant npm publish depuis le répertoire `dist`, seuls les fichiers que nous avons soigneusement assemblés à l'étape 3 sont téléchargés sur le registre NPM. Cela empêche tout code source, fichier de test ou configuration de développement d'être accidentellement publié, résultant en un paquet propre et minimal pour les utilisateurs.

Ce processus garantit que l'artefact final publié est une représentation propre, spécialement conçue et efficace du projet, plutôt qu'une copie directe de l'espace de travail de développement.

## Espaces de travail NPM

Ce projet utilise les [espaces de travail NPM](https://docs.npmjs.com/cli/v10/using-npm/workspaces) pour gérer les paquets au sein de ce monorepo. Cela simplifie le développement en nous permettant de gérer les dépendances et d'exécuter des scripts sur plusieurs paquets depuis la racine du projet.

### Comment ça fonctionne

Le fichier `package.json` racine définit les espaces de travail de ce projet :

```json
{
  "workspaces": ["packages/*"]
}
```

Cela indique à NPM que tout dossier dans le répertoire `packages` est un paquet séparé qui doit être géré dans le cadre de l'espace de travail.

### Avantages des espaces de travail

- **Gestion simplifiée des dépendances** : Exécuter `npm install` depuis la racine du projet installera toutes les dépendances pour tous les paquets de l'espace de travail et les reliera entre eux. Cela signifie que vous n'avez pas besoin d'exécuter `npm install` dans le répertoire de chaque paquet.
- **Liaison automatique** : Les paquets au sein de l'espace de travail peuvent dépendre les uns des autres. Lorsque vous exécutez `npm install`, NPM créera automatiquement des liens symboliques entre les paquets. Cela signifie que lorsque vous apportez des modifications à un paquet, les modifications sont immédiatement disponibles pour les autres paquets qui en dépendent.
- **Exécution simplifiée des scripts** : Vous pouvez exécuter des scripts dans n'importe quel paquet depuis la racine du projet en utilisant le drapeau `--workspace`. Par exemple, pour exécuter le script `build` dans le paquet `cli`, vous pouvez exécuter `npm run build --workspace @qwen-code/qwen-code`.