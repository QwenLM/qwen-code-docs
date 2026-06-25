# Tests d'intégration

Ce document fournit des informations sur le framework de tests d'intégration utilisé dans ce projet.

## Aperçu

Les tests d'intégration sont conçus pour valider le fonctionnement de bout en bout de Qwen Code. Ils exécutent le binaire construit dans un environnement contrôlé et vérifient qu'il se comporte comme prévu lorsqu'il interagit avec le système de fichiers.

Ces tests se trouvent dans le répertoire `integration-tests` et sont exécutés à l'aide d'un exécuteur de tests personnalisé.

## Exécution des tests

Les tests d'intégration ne sont pas exécutés dans le cadre de la commande par défaut `npm run test`. Ils doivent être exécutés explicitement à l'aide du script `npm run test:integration:all`.

Les tests d'intégration peuvent également être exécutés à l'aide du raccourci suivant :

```bash
npm run test:e2e
```

## Exécution d'un ensemble spécifique de tests

Pour exécuter un sous-ensemble de fichiers de test, vous pouvez utiliser `npm run <commande de test d'intégration> <nom_fichier1> ....` où &lt;commande de test d'intégration&gt; est soit `test:e2e` soit `test:integration*` et `<nom_fichier>` est l'un des fichiers `.test.ts` du répertoire `integration-tests/`. Par exemple, la commande suivante exécute `list_directory.test.ts` et `write_file.test.ts` :

```bash
npm run test:e2e list_directory write_file
```

### Exécution d'un seul test par nom

Pour exécuter un seul test par son nom, utilisez l'option `--test-name-pattern` :

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Exécution de tous les tests

Pour exécuter l'ensemble de la suite de tests d'intégration, utilisez la commande suivante :

```bash
npm run test:integration:all
```

### Matrice de sandboxing

La commande `all` exécutera les tests pour `no sandboxing`, `docker` et `podman`.
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

L'exécuteur de tests d'intégration propose plusieurs options de diagnostic pour aider à retrouver les échecs de test.

### Conservation de la sortie de test

Vous pouvez conserver les fichiers temporaires créés lors d'une exécution de test pour inspection. Cela est utile pour déboguer les problèmes liés aux opérations sur le système de fichiers.

Pour conserver la sortie de test, définissez la variable d'environnement `KEEP_OUTPUT` sur `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Lorsque la sortie est conservée, l'exécuteur de tests affichera le chemin vers le répertoire unique de l'exécution de test.

### Sortie détaillée

Pour un débogage plus détaillé, définissez la variable d'environnement `VERBOSE` sur `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Lorsque vous utilisez `VERBOSE=true` et `KEEP_OUTPUT=true` dans la même commande, la sortie est diffusée sur la console et également enregistrée dans un fichier journal dans le répertoire temporaire du test.

La sortie détaillée est formatée pour identifier clairement la source des journaux :

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## Linting et formatage

Pour garantir la qualité et la cohérence du code, les fichiers de test d'intégration sont vérifiés par linting dans le cadre du processus de construction principal. Vous pouvez également exécuter manuellement le linter et le correcteur automatique.

### Exécution du linter

Pour vérifier les erreurs de linting, exécutez la commande suivante :

```bash
npm run lint
```

Vous pouvez inclure l'option `:fix` dans la commande pour corriger automatiquement toutes les erreurs de linting corrigeables :

```bash
npm run lint:fix
```

## Structure des répertoires

Les tests d'intégration créent un répertoire unique pour chaque exécution de test à l'intérieur du répertoire `.integration-tests`. Dans ce répertoire, un sous-répertoire est créé pour chaque fichier de test, et dans celui-ci, un sous-répertoire est créé pour chaque cas de test individuel.

Cette structure facilite la localisation des artefacts pour une exécution, un fichier ou un cas de test spécifique.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.ts/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## Intégration continue

Pour garantir que les tests d'intégration sont toujours exécutés, un workflow GitHub Actions est défini dans `.github/workflows/e2e.yml`. Ce workflow exécute automatiquement les tests d'intégration pour les pull requests vers la branche `main`, ou lorsqu'une pull request est ajoutée à une file d'attente de fusion.

Le workflow exécute les tests dans différents environnements de sandboxing pour garantir que Qwen Code est testé dans chacun :

- `sandbox:none` : Exécute les tests sans aucun sandboxing.
- `sandbox:docker` : Exécute les tests dans un conteneur Docker.
- `sandbox:podman` : Exécute les tests dans un conteneur Podman.
