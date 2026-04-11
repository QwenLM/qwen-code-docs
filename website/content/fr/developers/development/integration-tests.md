# Tests d'intégration

Ce document fournit des informations sur le framework de tests d'intégration utilisé dans ce projet.

## Vue d'ensemble

Les tests d'intégration sont conçus pour valider le fonctionnement de bout en bout de Qwen Code. Ils exécutent le binaire compilé dans un environnement contrôlé et vérifient qu'il se comporte comme prévu lors des interactions avec le système de fichiers.

Ces tests se trouvent dans le répertoire `integration-tests` et sont exécutés à l'aide d'un runner de tests personnalisé.

## Exécution des tests

Les tests d'intégration ne sont pas exécutés par la commande par défaut `npm run test`. Ils doivent être lancés explicitement via le script `npm run test:integration:all`.

Les tests d'intégration peuvent également être exécutés à l'aide du raccourci suivant :

```bash
npm run test:e2e
```

## Exécution d'un sous-ensemble de tests

Pour exécuter un sous-ensemble de fichiers de test, utilisez `npm run <commande_test_intégration> <nom_fichier1> ....` où `<commande_test_intégration>` correspond à `test:e2e` ou `test:integration*`, et `<nom_fichier>` à n'importe quel fichier `.test.js` du répertoire `integration-tests/`. Par exemple, la commande suivante exécute `list_directory.test.js` et `write_file.test.js` :

```bash
npm run test:e2e list_directory write_file
```

### Exécution d'un test unique par son nom

Pour exécuter un seul test en fonction de son nom, utilisez l'option `--test-name-pattern` :

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Exécution de tous les tests

Pour exécuter l'ensemble de la suite de tests d'intégration, utilisez la commande suivante :

```bash
npm run test:integration:all
```

### Matrice de sandbox

La commande `all` exécutera les tests pour `no sandboxing`, `docker` et `podman`.
Chaque type peut être exécuté individuellement à l'aide des commandes suivantes :

```bash
npm run test:integration:sandbox:none
```

```bash
npm run test:integration:sandbox:docker
```

```bash
npm run test:integration:sandbox:podman
```

## Diagnostic

Le runner de tests d'intégration propose plusieurs options de diagnostic pour aider à identifier les causes des échecs de tests.

### Conservation des sorties de test

Vous pouvez conserver les fichiers temporaires créés lors d'une exécution de test pour les inspecter. Cela s'avère utile pour déboguer les problèmes liés aux opérations sur le système de fichiers.

Pour conserver les sorties de test, définissez la variable d'environnement `KEEP_OUTPUT` sur `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Lorsque les sorties sont conservées, le runner de tests affiche le chemin vers le répertoire unique généré pour l'exécution du test.

### Sortie verbeuse

Pour un débogage plus détaillé, définissez la variable d'environnement `VERBOSE` sur `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Lorsque vous utilisez `VERBOSE=true` et `KEEP_OUTPUT=true` dans la même commande, la sortie est diffusée dans la console et également enregistrée dans un fichier de log situé dans le répertoire temporaire du test.

La sortie verbeuse est formatée pour identifier clairement la source des logs :

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## Lint et formatage

Pour garantir la qualité et la cohérence du code, les fichiers de tests d'intégration sont analysés par le linter dans le cadre du processus de build principal. Vous pouvez également exécuter manuellement le linter et l'outil de correction automatique.

### Exécution du linter

Pour vérifier les erreurs de lint, exécutez la commande suivante :

```bash
npm run lint
```

Vous pouvez ajouter l'option `:fix` à la commande pour corriger automatiquement les erreurs de lint réparables :

```bash
npm run lint:fix
```

## Structure des répertoires

Les tests d'intégration créent un répertoire unique pour chaque exécution de test à l'intérieur du répertoire `.integration-tests`. Dans ce répertoire, un sous-répertoire est créé pour chaque fichier de test, et à l'intérieur de celui-ci, un sous-répertoire pour chaque cas de test individuel.

Cette structure facilite la localisation des artefacts pour une exécution, un fichier ou un cas de test spécifique.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## Intégration continue

Pour garantir que les tests d'intégration sont toujours exécutés, un workflow GitHub Actions est défini dans `.github/workflows/e2e.yml`. Ce workflow lance automatiquement les tests d'intégration pour les pull requests vers la branche `main`, ou lorsqu'une pull request est ajoutée à une merge queue.

Le workflow exécute les tests dans différents environnements de sandbox pour s'assurer que Qwen Code est testé dans chacun d'eux :

- `sandbox:none` : exécute les tests sans aucune isolation.
- `sandbox:docker` : exécute les tests dans un conteneur Docker.
- `sandbox:podman` : exécute les tests dans un conteneur Podman.