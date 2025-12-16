# Comment contribuer

Nous serions ravis d'accepter vos correctifs et contributions à ce projet.

## Processus de contribution

### Revues de code

Toutes les soumissions, y compris celles des membres du projet, nécessitent une revue. Nous utilisons les [pull requests GitHub](https://docs.github.com/articles/about-pull-requests) à cette fin.

### Consignes pour les pull requests

Pour nous aider à examiner et fusionner rapidement vos PR, veuillez suivre ces consignes. Les PR qui ne respectent pas ces normes peuvent être fermés.

#### 1. Lier à un ticket existant

Toutes les PR doivent être liées à un ticket existant dans notre outil de suivi. Cela garantit que chaque modification a été discutée et est alignée avec les objectifs du projet avant que le moindre code ne soit écrit.

- **Pour les corrections de bugs :** La PR doit être liée au ticket signalant le bug.
- **Pour les nouvelles fonctionnalités :** La PR doit être liée au ticket de demande ou de proposition de fonctionnalité ayant reçu l'approbation d'un responsable.

Si aucun ticket n'existe pour votre modification, veuillez **en créer un en premier lieu** et attendre des retours avant de commencer à coder.

#### 2. Garder des PR petites et ciblées

Nous privilégions les PR courtes et atomiques qui traitent un seul problème ou ajoutent une fonctionnalité unique et autonome.

- **Faites :** Créer une PR qui corrige un bug spécifique ou ajoute une fonctionnalité précise.
- **Évitez :** Regrouper plusieurs modifications sans lien (par exemple, une correction de bug, une nouvelle fonctionnalité et un refactoring) dans une seule PR.

Les grosses modifications doivent être découpées en une série de PR plus petites et logiques, pouvant être examinées et fusionnées indépendamment.

#### 3. Utilisez les PRs en brouillon pour les travaux en cours

Si vous souhaitez obtenir des retours précoces sur votre travail, veuillez utiliser la fonctionnalité **Draft Pull Request** de GitHub. Cela indique aux mainteneurs que la PR n'est pas encore prête pour une revue formelle mais est ouverte à la discussion et aux premiers retours.

#### 4. Assurez-vous que toutes les vérifications passent

Avant de soumettre votre PR, assurez-vous que toutes les vérifications automatisées passent en exécutant `npm run preflight`. Cette commande exécute tous les tests, le linting et autres vérifications de style.

#### 5. Mettez à jour la documentation

Si votre PR introduit un changement visible par l'utilisateur (par exemple, une nouvelle commande, un drapeau modifié ou un changement de comportement), vous devez également mettre à jour la documentation pertinente dans le répertoire `/docs`.

#### 6. Rédigez des messages de commit clairs et une bonne description de PR

Votre PR doit avoir un titre clair et descriptif ainsi qu'une description détaillée des modifications. Suivez la norme [Conventional Commits](https://www.conventionalcommits.org/) pour vos messages de commit.

- **Bon titre de PR :** `feat(cli): Ajout du flag --json à la commande 'config get'`
- **Mauvais titre de PR :** `Quelques modifications effectuées`

Dans la description de la PR, expliquez le « pourquoi » de vos changements et liez l'issue concernée (par exemple, `Fixes #123`).

## Configuration et flux de développement

Cette section guide les contributeurs sur la manière de construire, modifier et comprendre la configuration de développement de ce projet.

### Configuration de l'environnement de développement

**Prérequis :**

1.  **Node.js** :
    - **Développement :** Veuillez utiliser Node.js `~20.19.0`. Cette version spécifique est requise en raison d'un problème de dépendance amont dans le développement. Vous pouvez utiliser un outil comme [nvm](https://github.com/nvm-sh/nvm) pour gérer les versions de Node.js.
    - **Production :** Pour exécuter l'interface en ligne de commande (CLI) dans un environnement de production, toute version de Node.js `>=20` est acceptable.
2.  **Git**

### Processus de construction

Pour cloner le dépôt :

```bash
git clone https://github.com/QwenLM/qwen-code.git # Ou l'URL de votre fork
cd qwen-code
```

Pour installer les dépendances définies dans `package.json` ainsi que les dépendances racine :

```bash
npm install
```

Pour construire l'ensemble du projet (tous les packages) :

```bash
npm run build
```

Cette commande compile généralement le TypeScript en JavaScript, regroupe les ressources et prépare les packages pour l'exécution. Consultez `scripts/build.js` et les scripts dans `package.json` pour plus de détails sur ce qui se produit pendant la construction.

### Activation du bac à sable

Le [bac à sable](#sandboxing) est fortement recommandé et nécessite, au minimum, de définir `QWEN_SANDBOX=true` dans votre `~/.env` et de vous assurer qu'un fournisseur de bac à sable (par exemple `macOS Seatbelt`, `docker` ou `podman`) est disponible. Voir [Bac à sable](#sandboxing) pour plus de détails.

Pour construire à la fois l'utilitaire CLI `qwen-code` et le conteneur du bac à sable, exécutez `build:all` depuis le répertoire racine :

```bash
npm run build:all
```

Pour ignorer la construction du conteneur du bac à sable, vous pouvez utiliser `npm run build` à la place.

### Exécution

Pour démarrer l'application Qwen Code depuis le code source (après la construction), exécutez la commande suivante depuis le répertoire racine :

```bash
npm start
```

Si vous souhaitez exécuter la version compilée en dehors du dossier qwen-code, vous pouvez utiliser `npm link path/to/qwen-code/packages/cli` (voir : [docs](https://docs.npmjs.com/cli/v9/commands/npm-link)) pour exécuter avec `qwen-code`.

### Exécution des tests

Ce projet contient deux types de tests : les tests unitaires et les tests d'intégration.

#### Tests unitaires

Pour exécuter la suite de tests unitaires du projet :

```bash
npm run test
```

Cette commande exécute les tests situés dans les répertoires `packages/core` et `packages/cli`. Assurez-vous que tous les tests passent avant de soumettre des modifications. Pour une vérification plus approfondie, il est recommandé d'exécuter `npm run preflight`.

#### Tests d'intégration

Les tests d'intégration sont conçus pour valider le fonctionnement de bout en bout de Qwen Code. Ils ne sont pas exécutés par défaut avec la commande `npm run test`.

Pour lancer les tests d'intégration, utilisez la commande suivante :

```bash
npm run test:e2e
```

Pour plus d'informations détaillées sur le framework de tests d'intégration, veuillez consulter la [documentation des tests d'intégration](./docs/integration-tests.md).

### Vérification et Contrôles Préliminaires

Pour garantir la qualité du code et la cohérence du formatage, exécutez le contrôle préliminaire :

```bash
npm run preflight
```

Cette commande lancera ESLint, Prettier, tous les tests ainsi que d'autres vérifications telles que définies dans le fichier `package.json` du projet.

_Astuce Pro_

Après avoir cloné le dépôt, créez un fichier de hook de pré-commit Git afin de vous assurer que vos commits soient toujours propres.

```bash
echo "

# Exécuter npm build et vérifier les erreurs
if ! npm run preflight; then
  echo "npm build a échoué. Commit annulé."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Formatage

Pour formater séparément le code de ce projet, exécutez la commande suivante depuis le répertoire racine :

```bash
npm run format
```

Cette commande utilise Prettier pour formater le code conformément aux directives stylistiques du projet.

#### Analyse Statique (Linting)

Pour effectuer une analyse statique séparée du code de ce projet, exécutez la commande suivante depuis le répertoire racine :

```bash
npm run lint
```

### Conventions de codage

- Veuillez respecter le style de codage, les modèles et les conventions utilisés dans l'ensemble du codebase existant.
- **Imports :** Portez une attention particulière aux chemins d'importation. Le projet utilise ESLint pour appliquer des restrictions sur les imports relatifs entre les packages.

### Structure du projet

- `packages/` : Contient les sous-packages individuels du projet.
  - `cli/` : L'interface en ligne de commande.
  - `core/` : La logique principale du backend pour Qwen Code.
- `docs/` : Contient toute la documentation du projet.
- `scripts/` : Scripts utilitaires pour la construction, les tests et les tâches de développement.

Pour une architecture plus détaillée, consultez `docs/architecture.md`.

## Développement de la documentation

Cette section décrit comment développer et prévisualiser la documentation localement.

### Prérequis

1. Assurez-vous d'avoir Node.js (version 18+) installé
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

3. Liez le contenu de la documentation depuis le répertoire principal `docs` :

   ```bash
   npm run link
   ```

   Cela crée un lien symbolique de `../docs` vers `content` dans le projet docs-site, permettant au contenu de la documentation d'être servi par le site Next.js.

4. Démarrez le serveur de développement :

   ```bash
   npm run dev
   ```

5. Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur pour voir le site de documentation avec des mises à jour en direct au fur et à mesure que vous apportez des modifications.

Toutes les modifications apportées aux fichiers de documentation dans le répertoire principal `docs` seront reflétées immédiatement dans le site de documentation.

## Débogage

### VS Code :

0. Exécutez la CLI pour déboguer de manière interactive dans VS Code avec `F5`.
1. Démarrez la CLI en mode débogage depuis le répertoire racine :
   ```bash
   npm run debug
   ```
   Cette commande exécute `node --inspect-brk dist/index.js` dans le répertoire `packages/cli`, interrompant l'exécution jusqu'à ce qu'un débogueur se connecte. Vous pouvez ensuite ouvrir `chrome://inspect` dans votre navigateur Chrome pour vous connecter au débogueur.
2. Dans VS Code, utilisez la configuration de lancement "Attach" (située dans `.vscode/launch.json`).

Vous pouvez également utiliser la configuration "Launch Program" dans VS Code si vous préférez lancer directement le fichier actuellement ouvert, mais 'F5' est généralement recommandé.

Pour atteindre un point d'arrêt à l'intérieur du conteneur sandbox, exécutez :

```bash
DEBUG=1 qwen-code
```

**Remarque :** Si vous avez `DEBUG=true` dans le fichier `.env` d'un projet, cela n'affectera pas qwen-code grâce à une exclusion automatique. Utilisez les fichiers `.qwen-code/.env` pour les paramètres spécifiques au débogage de qwen-code.

### React DevTools

Pour déboguer l'interface utilisateur basée sur React de la CLI, vous pouvez utiliser React DevTools. Ink, la bibliothèque utilisée pour l'interface de la CLI, est compatible avec les versions 4.x de React DevTools.

1.  **Démarrer l'application Qwen Code en mode développement :**

    ```bash
    DEV=true npm start
    ```

2.  **Installer et exécuter React DevTools version 4.28.5 (ou la dernière version compatible 4.x) :**

    Vous pouvez soit l'installer globalement :

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Soit l'exécuter directement via npx :

    ```bash
    npx react-devtools@4.28.5
    ```

    Votre application CLI en cours d'exécution devrait alors se connecter à React DevTools.

## Sandboxing

> À définir

## Publication manuelle

Nous publions un artefact pour chaque commit dans notre registre interne. Mais si vous devez créer une version locale manuellement, exécutez les commandes suivantes :

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```