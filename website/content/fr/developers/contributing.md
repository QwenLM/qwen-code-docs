# Comment contribuer

Nous serions ravis d'accepter vos correctifs et contributions à ce projet.

## Processus de contribution

### Revisions de code

Toutes les soumissions, y compris celles des membres du projet, nécessitent une revue. Nous utilisons les [pull requests GitHub](https://docs.github.com/articles/about-pull-requests) à cette fin.

### Directives pour les pull requests

Pour nous aider à examiner et fusionner vos PR rapidement, veuillez suivre ces directives. Les PR qui ne respectent pas ces normes peuvent être fermées.

#### 1. Lier à un problème existant

Toutes les PR doivent être liées à un problème existant dans notre suivi. Cela garantit que chaque changement a été discuté et aligné sur les objectifs du projet avant que du code soit écrit.

- **Pour les corrections de bugs :** La PR doit être liée au rapport de bug.
- **Pour les fonctionnalités :** La PR doit être liée à la demande de fonctionnalité ou à la proposition approuvée par un mainteneur.

Si un problème pour votre changement n'existe pas, veuillez **en ouvrir un d'abord** et attendre des commentaires avant de commencer à coder.

#### 2. Gardez-la petite et ciblée

Nous privilégions les PR petites et atomiques qui traitent d'un seul problème ou ajoutent une seule fonctionnalité autonome.

- **À faire :** Créez une PR qui corrige un bug spécifique ou ajoute une fonctionnalité spécifique.
- **À ne pas faire :** Ne regroupez pas plusieurs changements non liés (par exemple, une correction de bug, une nouvelle fonctionnalité et un refactoring) dans une seule PR.

En règle générale, commencez à diviser une PR lorsqu'elle dépasse environ 1 200 lignes modifiées. Les PR au-delà d'environ 2 000 lignes modifiées doivent soit être divisées en une série de PR plus petites et logiques pouvant être examinées et fusionnées indépendamment, soit expliquer dans la description de la PR pourquoi le changement doit être regroupé.

#### 3. Utiliser les PR brouillons pour les travaux en cours

Si vous souhaitez obtenir des commentaires précoces sur votre travail, veuillez utiliser la fonctionnalité **Draft Pull Request** de GitHub. Cela signale aux mainteneurs que la PR n'est pas encore prête pour une revue formelle mais est ouverte à la discussion et aux commentaires initiaux.

#### 4. Assurez-vous que toutes les vérifications passent

Avant de soumettre votre PR, assurez-vous que toutes les vérifications automatisées réussissent en exécutant `npm run preflight`. Cette commande exécute tous les tests, le linting et autres vérifications de style.

#### 5. Mettre à jour la documentation

Si votre PR introduit un changement orienté utilisateur (par exemple, une nouvelle commande, un indicateur modifié ou un changement de comportement), vous devez également mettre à jour la documentation pertinente dans le répertoire `/docs`.

#### 6. Rédiger des messages de commit clairs et une bonne description de PR

Votre PR doit avoir un titre clair et descriptif ainsi qu'une description détaillée des changements. Suivez la norme [Conventional Commits](https://www.conventionalcommits.org/) pour vos messages de commit.

- **Bon titre de PR :** `feat(cli): Add --json flag to 'config get' command`
- **Mauvais titre de PR :** `Made some changes`

Dans la description de la PR, expliquez le 'pourquoi' derrière vos changements et liez le problème pertinent (par exemple, `Fixes #123`).

## Configuration de développement et flux de travail

Cette section guide les contributeurs sur la façon de construire, modifier et comprendre la configuration de développement de ce projet.

### Configuration de l'environnement de développement

**Prérequis :**

1.  **Node.js** :
    - **Développement :** Veuillez utiliser Node.js `>=22`. Ink 7 (utilisé par la TUI) nécessite Node 22, et `react@^19.2.0` est le pair correspondant. Vous pouvez utiliser un outil comme [nvm](https://github.com/nvm-sh/nvm) pour gérer les versions de Node.js.
    - **Production :** Pour exécuter la CLI dans un environnement de production, toute version de Node.js `>=22` est acceptable.
2.  **Git**

### Processus de construction

Pour cloner le dépôt :

```bash
git clone https://github.com/QwenLM/qwen-code.git # Ou l'URL de votre fork
cd qwen-code
```

Pour installer les dépendances définies dans `package.json` ainsi que les dépendances racines :

```bash
npm install
```

Pour construire l'ensemble du projet (tous les packages) :

```bash
npm run build
```

Cette commande compile généralement TypeScript en JavaScript, regroupe les assets et prépare les packages pour l'exécution. Référez-vous à `scripts/build.js` et aux scripts de `package.json` pour plus de détails sur ce qui se passe lors de la construction.

### Activation du sandboxing

Le [sandboxing](#sandboxing) est fortement recommandé et nécessite, au minimum, de définir `QWEN_SANDBOX=true` dans votre `~/.env` et de s'assurer qu'un fournisseur de sandboxing (par exemple `macOS Seatbelt`, `docker` ou `podman`) est disponible. Voir [Sandboxing](#sandboxing) pour plus de détails.

Pour construire à la fois l'utilitaire CLI `qwen-code` et le conteneur sandbox, exécutez `build:all` depuis le répertoire racine :

```bash
npm run build:all
```

Pour ignorer la construction du conteneur sandbox, vous pouvez utiliser `npm run build` à la place.

### Exécution

Pour démarrer l'application Qwen Code à partir du code source (après construction), exécutez la commande suivante depuis le répertoire racine :

```bash
npm start
```

Si vous souhaitez exécuter la construction source en dehors du dossier qwen-code, vous pouvez utiliser `npm link path/to/qwen-code/packages/cli` (voir : [docs](https://docs.npmjs.com/cli/v9/commands/npm-link)) pour l'exécuter avec `qwen-code`

### Exécution des tests

Ce projet contient deux types de tests : les tests unitaires et les tests d'intégration.

#### Tests unitaires

Pour exécuter la suite de tests unitaires du projet :

```bash
npm run test
```
Cela exécutera les tests situés dans les répertoires `packages/core` et `packages/cli`. Assurez-vous que les tests réussissent avant de soumettre des modifications. Pour une vérification plus complète, il est recommandé d'exécuter `npm run preflight`.

#### Tests d'intégration

Les tests d'intégration sont conçus pour valider le fonctionnement de bout en bout de Qwen Code. Ils ne sont pas exécutés dans le cadre de la commande `npm run test` par défaut.

Pour exécuter les tests d'intégration, utilisez la commande suivante :

```bash
npm run test:e2e
```

Pour plus d'informations détaillées sur le framework de test d'intégration, veuillez consulter la [documentation des tests d'intégration](./development/integration-tests.md).

### Linting et vérifications préliminaires

Pour garantir la qualité du code et la cohérence du formatage, exécutez la vérification préliminaire :

```bash
npm run preflight
```

Cette commande exécutera ESLint, Prettier, tous les tests et d'autres vérifications telles que définies dans le `package.json` du projet.

_Astuce_

après le clonage, créez un fichier de hook de pré-commit git pour garantir que vos commits sont toujours propres.

```bash
echo "
# Run npm build and check for errors
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Formatage

Pour formater séparément le code de ce projet, exécutez la commande suivante depuis le répertoire racine :

```bash
npm run format
```

Cette commande utilise Prettier pour formater le code conformément aux directives de style du projet.

#### Linting

Pour analyser séparément le code de ce projet, exécutez la commande suivante depuis le répertoire racine :

```bash
npm run lint
```

### Conventions de codage

- Veuillez respecter le style de codage, les modèles et les conventions utilisés dans l'ensemble de la base de code existante.
- **Imports :** Portez une attention particulière aux chemins d'importation. Le projet utilise ESLint pour appliquer des restrictions sur les importations relatives entre les packages.

### Structure du projet

- `packages/` : Contient les sous-packages individuels du projet.
  - `cli/` : L'interface en ligne de commande.
  - `core/` : La logique backend principale de Qwen Code.
- `docs/` : Contient toute la documentation du projet.
- `scripts/` : Scripts utilitaires pour les tâches de construction, de test et de développement.

Pour une architecture plus détaillée, voir `docs/architecture.md`.

## Développement de la documentation

Cette section décrit comment développer et prévisualiser la documentation localement.

### Prérequis

1. Assurez-vous d'avoir Node.js (version 22+) installé
2. Avoir npm ou yarn disponible

### Configurer le site de documentation localement

Pour travailler sur la documentation et prévisualiser les modifications localement :

1. Accédez au répertoire `docs-site` :

   ```bash
   cd docs-site
   ```

2. Installez les dépendances :

   ```bash
   npm install
   ```

3. Liez le contenu de la documentation du répertoire principal `docs` :

   ```bash
   npm run link
   ```

   Ceci crée un lien symbolique de `../docs` vers `content` dans le projet docs-site, permettant au contenu de la documentation d'être servi par le site Next.js.

4. Démarrez le serveur de développement :

   ```bash
   npm run dev
   ```

5. Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur pour voir le site de documentation avec des mises à jour en direct lorsque vous apportez des modifications.

Toutes les modifications apportées aux fichiers de documentation dans le répertoire principal `docs` seront immédiatement reflétées sur le site de documentation.

## Débogage

### VS Code :

0.  Exécutez le CLI pour déboguer interactivement dans VS Code avec `F5`
1.  Démarrez le CLI en mode débogage depuis le répertoire racine :
    ```bash
    npm run debug
    ```
    Cette commande exécute `node --inspect-brk dist/index.js` dans le répertoire `packages/cli`, en mettant en pause l'exécution jusqu'à ce qu'un débogueur se connecte. Vous pouvez ensuite ouvrir `chrome://inspect` dans votre navigateur Chrome pour vous connecter au débogueur.
2.  Dans VS Code, utilisez la configuration de lancement "Attach" (se trouve dans `.vscode/launch.json`).

Alternativement, vous pouvez utiliser la configuration "Launch Program" dans VS Code si vous préférez lancer directement le fichier actuellement ouvert, mais 'F5' est généralement recommandé.

Pour atteindre un point d'arrêt à l'intérieur du conteneur sandbox, exécutez :

```bash
DEBUG=1 qwen-code
```

**Note :** Si vous avez `DEBUG=true` dans un fichier `.env` du projet, cela n'affectera pas qwen-code en raison de l'exclusion automatique. Utilisez les fichiers `.qwen-code/.env` pour les paramètres de débogage spécifiques à qwen-code.

### React DevTools

Pour déboguer l'interface utilisateur React du CLI, vous pouvez utiliser React DevTools. Ink, la bibliothèque utilisée pour l'interface du CLI, est compatible avec React DevTools version 4.x.

1.  **Démarrez l'application Qwen Code en mode développement :**

    ```bash
    DEV=true npm start
    ```

2.  **Installez et exécutez React DevTools version 4.28.5 (ou la dernière version compatible 4.x) :**

    Vous pouvez soit l'installer globalement :

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Ou l'exécuter directement avec npx :

    ```bash
    npx react-devtools@4.28.5
    ```

    Votre application CLI en cours d'exécution devrait alors se connecter à React DevTools.

## Sandboxing

> TBD

## Publication manuelle

Nous publions un artefact pour chaque commit dans notre registre interne. Mais si vous avez besoin de réaliser manuellement une build locale, exécutez les commandes suivantes :
```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```
