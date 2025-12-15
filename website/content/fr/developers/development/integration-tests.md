# Tests d'intégration

Ce document fournit des informations sur le framework de test d'intégration utilisé dans ce projet.

## Aperçu

Les tests d'intégration sont conçus pour valider la fonctionnalité de bout en bout de Qwen Code. Ils exécutent le binaire construit dans un environnement contrôlé et vérifient qu'il se comporte comme prévu lors de l'interaction avec le système de fichiers.

Ces tests se trouvent dans le répertoire `integration-tests` et sont exécutés à l'aide d'un exécuteur de tests personnalisé.

## Exécution des tests

Les tests d'intégration ne sont pas exécutés dans le cadre de la commande par défaut `npm run test`. Ils doivent être exécutés explicitement en utilisant le script `npm run test:integration:all`.

Les tests d'intégration peuvent également être exécutés en utilisant le raccourci suivant :

```bash
npm run test:e2e
```

## Exécuter un ensemble spécifique de tests

Pour exécuter un sous-ensemble de fichiers de test, vous pouvez utiliser `npm run <commande de test d'intégration> <nom_fichier1> ....` où &lt;commande de test d'intégration&gt; est soit `test:e2e` soit `test:integration*` et `<nom_fichier>` est n'importe lequel des fichiers `.test.js` dans le répertoire `integration-tests/`. Par exemple, la commande suivante exécute `list_directory.test.js` et `write_file.test.js` :

```bash
npm run test:e2e list_directory write_file
```

### Exécuter un seul test par nom

Pour exécuter un seul test par son nom, utilisez le flag `--test-name-pattern` :

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Exécuter tous les tests

Pour exécuter l'ensemble complet des tests d'intégration, utilisez la commande suivante :

```bash
npm run test:integration:all
```

### Matrice de bac à sable

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

Le lanceur de tests d'intégration propose plusieurs options de diagnostic pour aider à identifier les échecs de tests.

### Conservation de la sortie des tests

Vous pouvez conserver les fichiers temporaires créés pendant l'exécution d'un test afin de les inspecter. Cela est utile pour déboguer les problèmes liés aux opérations sur le système de fichiers.

Pour conserver la sortie des tests, définissez la variable d'environnement `KEEP_OUTPUT` sur `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Lorsque la sortie est conservée, le lanceur de tests affichera le chemin vers le répertoire unique correspondant à l'exécution du test.

### Sortie verbeuse

Pour un débogage plus détaillé, définissez la variable d’environnement `VERBOSE` sur `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Lorsque vous utilisez `VERBOSE=true` et `KEEP_OUTPUT=true` dans la même commande, la sortie est diffusée vers la console et également enregistrée dans un fichier journal situé dans le répertoire temporaire du test.

La sortie verbeuse est formatée pour identifier clairement la source des journaux :

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## Vérification et mise en forme

Afin de garantir la qualité et la cohérence du code, les fichiers de tests d'intégration sont analysés par le linter dans le cadre du processus principal de construction. Vous pouvez également exécuter manuellement le linter et le correcteur automatique.

### Exécution du linter

Pour vérifier les erreurs de linting, exécutez la commande suivante :

```bash
npm run lint
```

Vous pouvez inclure le flag `:fix` à la commande pour corriger automatiquement les erreurs de linting détectées :

```bash
npm run lint:fix
```

## Structure des répertoires

Les tests d'intégration créent un répertoire unique pour chaque exécution de test à l'intérieur du répertoire `.integration-tests`. Dans ce répertoire, un sous-répertoire est créé pour chaque fichier de test, et dans celui-ci, un sous-répertoire est créé pour chaque cas de test individuel.

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

Pour garantir que les tests d'intégration soient toujours exécutés, un workflow GitHub Actions est défini dans `.github/workflows/e2e.yml`. Ce workflow exécute automatiquement les tests d'intégration pour les pull requests ciblant la branche `main`, ou lorsqu'une pull request est ajoutée à une file d'attente de fusion.

Le workflow exécute les tests dans différents environnements de bac à sable (sandboxing) afin de garantir que Qwen Code est testé dans chacun d'eux :

- `sandbox:none` : Exécute les tests sans aucun isolement.
- `sandbox:docker` : Exécute les tests dans un conteneur Docker.
- `sandbox:podman` : Exécute les tests dans un conteneur Podman.