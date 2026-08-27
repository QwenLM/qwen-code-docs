# Tests d'intégration

Ce document fournit des informations sur le framework de test d'intégration utilisé dans ce projet.

## Aperçu

Les tests d'intégration sont conçus pour valider les fonctionnalités de bout en bout de Qwen Code. Ils exécutent le binaire construit dans un environnement contrôlé et vérifient qu'il se comporte comme prévu lors des interactions avec le système de fichiers.

Ces tests se trouvent dans le répertoire `integration-tests` et sont exécutés à l'aide d'un exécuteur de tests personnalisé.

## Exécution des tests

Les tests d'intégration ne sont pas exécutés dans le cadre de la commande par défaut `npm run test`. Ils doivent être exécutés explicitement à l'aide du script `npm run test:integration:all`.

Les tests d'intégration peuvent également être exécutés à l'aide du raccourci suivant :

```bash
npm run test:e2e
```

## Exécution d'un ensemble spécifique de tests

Pour exécuter un sous-ensemble de fichiers de test, vous pouvez utiliser `npm run <commande de test d'intégration> <nom_fichier1> ...` où `<commande de test d'intégration>` est soit `test:e2e` soit `test:integration*` et `<nom_fichier>` est l'un des fichiers `.test.ts` du répertoire `integration-tests/`. Par exemple, la commande suivante exécute `list_directory.test.ts` et `write_file.test.ts` :

```bash
npm run test:e2e list_directory write_file
```

### Exécution d'un seul test par son nom

Pour exécuter un seul test par son nom, utilisez l'option `--test-name-pattern` :

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Exécution de tous les tests

Pour exécuter l'ensemble complet des tests d'intégration, utilisez la commande suivante :

```bash
npm run test:integration:all
```

### Matrice de sandbox

La commande `all` exécute les tests pour `aucun sandbox`, `docker` et `podman`.
Chaque type individuel peut être exécuté à l'aide des commandes suivantes :

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

L'exécuteur de tests d'intégration propose plusieurs options de diagnostic pour aider à traquer les échecs de test.

### Conserver la sortie des tests

Vous pouvez conserver les fichiers temporaires créés lors d'une exécution de test pour inspection. Cela est utile pour déboguer les problèmes liés aux opérations sur le système de fichiers.

Pour conserver la sortie des tests, définissez la variable d'environnement `KEEP_OUTPUT` à `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Lorsque la sortie est conservée, l'exécuteur de tests affiche le chemin vers le répertoire unique pour l'exécution du test.

### Sortie détaillée

Pour un débogage plus détaillé, définissez la variable d'environnement `VERBOSE` à `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Lorsque `VERBOSE=true` et `KEEP_OUTPUT=true` sont utilisés dans la même commande, la sortie est affichée en continu sur la console et également sauvegardée dans un fichier journal dans le répertoire temporaire du test.

La sortie détaillée est formatée pour identifier clairement la source des journaux :

```
--- TEST: <log dir>:<test-name> ---
... sortie de la commande qwen ...
--- END TEST: <log dir>:<test-name> ---
```

## Linting et formatage

Pour garantir la qualité et la cohérence du code, les fichiers de test d'intégration sont vérifiés par le linter dans le cadre du processus de build principal. Vous pouvez également exécuter manuellement le linter et le correcteur automatique.

### Exécution du linter

Pour vérifier les erreurs de lint, exécutez la commande suivante :

```bash
npm run lint
```

Vous pouvez inclure l'option `:fix` dans la commande pour corriger automatiquement les erreurs de lint réparables :

```bash
npm run lint:fix
```

## Structure des répertoires

Les tests d'intégration créent un répertoire unique pour chaque exécution de test à l'intérieur du répertoire `.integration-tests`. À l'intérieur de ce répertoire, un sous-répertoire est créé pour chaque fichier de test, et à l'intérieur de celui-ci, un sous-répertoire est créé pour chaque cas de test individuel.

Cette structure facilite la localisation des artefacts pour une exécution, un fichier ou un cas de test spécifique.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.ts/
        └── <test-case-name>/
            ├── output.log
            └── ...autres artefacts de test...
```

## Intégration continue

Pour garantir que les tests d'intégration sont toujours exécutés, un workflow GitHub Actions est défini dans `.github/workflows/e2e.yml`. Ce workflow exécute automatiquement les tests d'intégration pour les pull requests vers la branche `main`, ou lorsqu'une pull request est ajoutée à une file d'attente de fusion.

Le workflow exécute les tests dans différents environnements de sandbox pour garantir que Qwen Code est testé dans chacun d'eux :

- `sandbox:none` : Exécute les tests sans aucun sandbox.
- `sandbox:docker` : Exécute les tests dans un conteneur Docker.
- `sandbox:podman` : Exécute les tests dans un conteneur Podman.