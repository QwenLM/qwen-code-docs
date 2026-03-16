# Tests d’intégration

Ce document fournit des informations sur le cadre de tests d’intégration utilisé dans ce projet.

## Aperçu

Les tests d’intégration sont conçus pour valider la fonctionnalité bout en bout de Qwen Code. Ils exécutent le binaire généré dans un environnement contrôlé et vérifient qu’il se comporte comme attendu lorsqu’il interagit avec le système de fichiers.

Ces tests sont situés dans le répertoire `integration-tests` et s’exécutent à l’aide d’un exécuteur de tests personnalisé.

## Exécution des tests

Les tests d’intégration ne sont pas exécutés dans le cadre de la commande par défaut `npm run test`. Ils doivent être lancés explicitement à l’aide du script `npm run test:integration:all`.

Les tests d’intégration peuvent également être exécutés à l’aide du raccourci suivant :

```bash
npm run test:e2e
```

## Exécution d’un ensemble spécifique de tests

Pour exécuter un sous-ensemble de fichiers de test, vous pouvez utiliser la commande `npm run <commande_de_test_d_intégration> <nom_fichier1> ...`, où `<commande_de_test_d_intégration>` est soit `test:e2e`, soit `test:integration*`, et `<nom_fichier>` correspond à l’un des fichiers `.test.js` situés dans le répertoire `integration-tests/`. Par exemple, la commande suivante exécute les fichiers `list_directory.test.js` et `write_file.test.js` :

```bash
npm run test:e2e list_directory write_file
```

### Exécution d’un seul test par son nom

Pour exécuter un seul test par son nom, utilisez l’option `--test-name-pattern` :

```bash
npm run test:e2e -- --test-name-pattern "lit un fichier"
```

### Exécution de tous les tests

Pour exécuter l’intégralité de la suite de tests d’intégration, utilisez la commande suivante :

```bash
npm run test:integration:all
```

### Matrice des environnements isolés (sandbox)

La commande `all` exécute les tests pour les configurations « aucun environnement isolé », `docker` et `podman`.  
Chaque type peut être exécuté individuellement à l’aide des commandes suivantes :

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

L’exécuteur de tests d’intégration propose plusieurs options de diagnostic pour faciliter l’identification des échecs de tests.

### Conservation de la sortie des tests

Vous pouvez conserver les fichiers temporaires créés pendant l’exécution d’un test afin de les inspecter. Cette option est particulièrement utile pour déboguer les problèmes liés aux opérations sur le système de fichiers.

Pour conserver la sortie des tests, définissez la variable d’environnement `KEEP_OUTPUT` à `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Lorsque la sortie est conservée, l’exécuteur de tests affiche le chemin vers le répertoire unique associé à cette exécution.

### Sortie détaillée

Pour un débogage plus approfondi, définissez la variable d’environnement `VERBOSE` sur `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Lorsque vous utilisez `VERBOSE=true` et `KEEP_OUTPUT=true` dans la même commande, la sortie est diffusée en temps réel dans la console et également enregistrée dans un fichier journal situé dans le répertoire temporaire du test.

La sortie détaillée est formatée de façon à identifier clairement l’origine des journaux :

```
--- TEST: <répertoire-journal>:<nom-du-test> ---
... sortie de la commande qwen ...
--- FIN DU TEST: <répertoire-journal>:<nom-du-test> ---
```

## Vérification et mise en forme du code

Afin de garantir la qualité et la cohérence du code, les fichiers de tests d’intégration sont vérifiés par un outil de linting dans le cadre du processus principal de compilation. Vous pouvez également exécuter manuellement ce linter ainsi que son correcteur automatique.

### Exécution du linter

Pour détecter les erreurs de linting, exécutez la commande suivante :

```bash
npm run lint
```

Vous pouvez ajouter le drapeau `:fix` à la commande afin de corriger automatiquement les erreurs de linting pouvant être corrigées :

```bash
npm run lint:fix
```

## Structure des répertoires

Les tests d’intégration créent un répertoire unique pour chaque exécution de test dans le répertoire `.integration-tests`. Dans ce répertoire, un sous-répertoire est créé pour chaque fichier de test, puis, dans chacun de ces sous-répertoires, un autre sous-répertoire est créé pour chaque cas de test individuel.

Cette structure permet de localiser facilement les artefacts associés à une exécution spécifique, à un fichier ou à un cas de test donné.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...autres artefacts du test...
```

## Intégration continue

Pour garantir l’exécution systématique des tests d’intégration, un workflow GitHub Actions est défini dans le fichier `.github/workflows/e2e.yml`. Ce workflow exécute automatiquement les tests d’intégration pour les demandes de tirage (pull requests) ciblant la branche `main`, ou lorsqu’une demande de tirage est ajoutée à une file d’attente de fusion.

Le workflow exécute les tests dans différents environnements de bacs à sable afin de s’assurer que Qwen Code est testé dans chacun d’eux :

- `sandbox:none` : exécute les tests sans bac à sable.
- `sandbox:docker` : exécute les tests dans un conteneur Docker.
- `sandbox:podman` : exécute les tests dans un conteneur Podman.