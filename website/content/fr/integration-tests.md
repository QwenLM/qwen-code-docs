# Tests d'intégration

Ce document fournit des informations sur le framework de test d'intégration utilisé dans ce projet.

## Aperçu

Les tests d'intégration sont conçus pour valider la fonctionnalité de bout en bout de Qwen Code. Ils exécutent le binaire compilé dans un environnement contrôlé et vérifient qu'il se comporte comme attendu lors de l'interaction avec le système de fichiers.

Ces tests se trouvent dans le répertoire `integration-tests` et sont exécutés à l'aide d'un test runner personnalisé.

## Exécution des tests

Les tests d'intégration ne sont pas exécutés par défaut avec la commande `npm run test`. Ils doivent être lancés explicitement en utilisant le script `npm run test:integration:all`.

Les tests d'intégration peuvent également être exécutés en utilisant le raccourci suivant :

```bash
npm run test:e2e
```

## Exécuter un ensemble spécifique de tests

Pour exécuter un sous-ensemble de fichiers de test, vous pouvez utiliser `npm run <integration test command> <file_name1> ....` où `<integration test command>` est soit `test:e2e`, soit `test:integration*` et `<file_name>` est n'importe quel fichier `.test.js` dans le répertoire `integration-tests/`. Par exemple, la commande suivante exécute `list_directory.test.js` et `write_file.test.js` :

```bash
npm run test:e2e list_directory write_file
```

### Exécuter un seul test par nom

Pour exécuter un seul test par son nom, utilisez le flag `--test-name-pattern` :

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Exécuter tous les tests

Pour exécuter la suite complète des tests d'intégration, utilisez la commande suivante :

```bash
npm run test:integration:all
```

### Matrice de sandbox

La commande `all` exécutera les tests pour `no sandboxing`, `docker` et `podman`.
Chaque type individuel peut être exécuté en utilisant les commandes suivantes :

```bash
npm run test:integration:sandbox:none
```

```bash
npm run test:integration:sandbox:docker
```

```bash
npm run test:integration:sandbox:podman
```

## Diagnostics

Le test runner d'intégration propose plusieurs options de diagnostic pour aider à identifier les échecs de test.

### Conserver la sortie des tests

Vous pouvez conserver les fichiers temporaires créés pendant l'exécution d'un test pour inspection. Cela est utile pour déboguer les problèmes liés aux opérations sur le système de fichiers.

Pour conserver la sortie des tests, vous pouvez soit utiliser le flag `--keep-output`, soit définir la variable d'environnement `KEEP_OUTPUT` à `true`.

```bash

# Utilisation du flag
npm run test:integration:sandbox:none -- --keep-output

# Utilisation de la variable d'environnement

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Lorsque la sortie est conservée, le test runner affiche le chemin vers le répertoire unique pour l'exécution des tests.

### Sortie verbeuse

Pour un débogage plus détaillé, le flag `--verbose` permet de diffuser en temps réel la sortie de la commande `qwen` vers la console.

```bash
npm run test:integration:sandbox:none -- --verbose
```

Lorsque vous utilisez à la fois `--verbose` et `--keep-output` dans la même commande, la sortie est diffusée vers la console et également enregistrée dans un fichier de log à l'intérieur du répertoire temporaire des tests.

La sortie verbeuse est formatée pour identifier clairement la source des logs :

```
--- TEST: <file-name-without-js>:<test-name> ---
... output from the qwen command ...
--- END TEST: <file-name-without-js>:<test-name> ---
```

## Linting et mise en forme

Pour garantir la qualité et la cohérence du code, les fichiers de tests d'intégration sont analysés par le linter dans le cadre du processus de build principal. Vous pouvez également exécuter manuellement le linter et l'auto-correcteur.

### Exécuter le linter

Pour vérifier les erreurs de linting, exécutez la commande suivante :

```bash
npm run lint
```

Vous pouvez inclure le flag `:fix` dans la commande pour corriger automatiquement les erreurs de linting qui peuvent l'être :

```bash
npm run lint:fix
```

## Structure des répertoires

Les tests d'intégration créent un répertoire unique pour chaque exécution de test à l'intérieur du répertoire `.integration-tests`. Dans ce répertoire, un sous-répertoire est créé pour chaque fichier de test, et à l'intérieur de celui-ci, un sous-répertoire est créé pour chaque cas de test individuel.

Cette structure facilite la localisation des artefacts pour une exécution de test, un fichier ou un cas spécifique.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...autres artefacts de test...
```

## Intégration continue

Pour garantir que les tests d'intégration soient toujours exécutés, un workflow GitHub Actions est défini dans `.github/workflows/e2e.yml`. Ce workflow exécute automatiquement les tests d'intégration pour les pull requests contre la branche `main`, ou lorsqu'une pull request est ajoutée à une file d'attente de fusion.

Le workflow exécute les tests dans différents environnements de sandboxing pour s'assurer que Qwen Code est testé dans chacun d'eux :

- `sandbox:none` : Exécute les tests sans aucun sandboxing.
- `sandbox:docker` : Exécute les tests dans un conteneur Docker.
- `sandbox:podman` : Exécute les tests dans un conteneur Podman.