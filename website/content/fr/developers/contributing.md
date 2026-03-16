# Comment contribuer

Nous serions ravis d’accepter vos correctifs et contributions à ce projet.

## Processus de contribution

### Revues de code

Toutes les soumissions, y compris celles des membres du projet, doivent faire l’objet d’une revue. À cet effet, nous utilisons les [demandes d’incorporation (pull requests) GitHub](https://docs.github.com/fr/articles/about-pull-requests).

### Recommandations pour les demandes d’incorporation (pull requests)

Pour nous aider à examiner et intégrer rapidement vos demandes d’incorporation, veuillez suivre ces recommandations. Les demandes d’incorporation ne respectant pas ces critères risquent d’être fermées.

#### 1. Lien vers un problème existant

Toutes les demandes d’intégration (PR) doivent être liées à un problème existant dans notre système de suivi. Cela garantit que chaque modification a été discutée au préalable et qu’elle est conforme aux objectifs du projet avant même l’écriture du moindre morceau de code.

- **Pour les corrections de bogues :** la PR doit être liée au problème signalant le bogue.
- **Pour les fonctionnalités :** la PR doit être liée au problème de demande ou de proposition de fonctionnalité, approuvé par un mainteneur.

Si aucun problème ne couvre votre modification, veuillez **en créer un d’abord**, puis attendre les retours avant de commencer à coder.

#### 2. Gardez les PR petites et ciblées

Nous privilégions les PR petites et atomiques, qui traitent un seul problème ou ajoutent une seule fonctionnalité autonome.

- **À faire :** créez une PR qui corrige un bogue spécifique ou ajoute une fonctionnalité précise.
- **À éviter :** regrouper plusieurs modifications non liées (par exemple, une correction de bogue, une nouvelle fonctionnalité et une refonte) dans une seule PR.

Les modifications importantes doivent être décomposées en une série de PR plus petites et logiques, pouvant être examinées et intégrées indépendamment.

#### 3. Utilisez les PR brouillon pour les travaux en cours

Si vous souhaitez obtenir rapidement des retours sur votre travail, utilisez la fonctionnalité **Pull Request brouillon** de GitHub. Cela indique aux mainteneurs que la PR n’est pas encore prête pour une revue formelle, mais qu’elle est ouverte à la discussion et aux premiers retours.

#### 4. Vérifiez que tous les contrôles sont validés

Avant de soumettre votre PR, assurez-vous que tous les contrôles automatisés réussissent en exécutant la commande `npm run preflight`. Cette commande exécute l’ensemble des tests, du linting et des autres vérifications de style.

#### 5. Mettez à jour la documentation

Si votre PR introduit une modification visible par l’utilisateur (par exemple, une nouvelle commande, un drapeau modifié ou un changement de comportement), vous devez également mettre à jour la documentation correspondante située dans le répertoire `/docs`.

#### 6. Rédigez des messages de validation clairs et une bonne description de demande d’incorporation (PR)

Votre demande d’incorporation (PR) doit comporter un titre clair et descriptif, ainsi qu’une description détaillée des modifications apportées. Suivez la norme [Conventional Commits](https://www.conventionalcommits.org/) pour vos messages de validation.

- **Bon titre de PR :** `feat(cli) : Ajouter le drapeau --json à la commande 'config get'`
- **Mauvais titre de PR :** `Apporté quelques modifications`

Dans la description de la PR, expliquez la raison d’être de vos modifications et liez-la à l’issue concernée (par exemple, `Fixes #123`).

## Configuration et flux de travail de développement

Cette section guide les contributeurs sur la façon de générer, modifier et comprendre la configuration de développement de ce projet.

### Configuration de l’environnement de développement

**Prérequis :**

1.  **Node.js** :
    - **Développement :** Veuillez utiliser Node.js `~20.19.0`. Cette version spécifique est requise en raison d’un problème lié à une dépendance tierce utilisée en développement. Vous pouvez utiliser un outil tel que [nvm](https://github.com/nvm-sh/nvm) pour gérer les versions de Node.js.
    - **Production :** Pour exécuter l’interface en ligne de commande (CLI) dans un environnement de production, toute version de Node.js `>=20` est acceptable.
2.  **Git**

### Processus de compilation

Pour cloner le dépôt :

```bash
git clone https://github.com/QwenLM/qwen-code.git # Ou l’URL de votre fork
cd qwen-code
```

Pour installer les dépendances définies dans `package.json`, ainsi que les dépendances racines :

```bash
npm install
```

Pour compiler l’intégralité du projet (tous les packages) :

```bash
npm run build
```

Cette commande compile généralement TypeScript en JavaScript, regroupe les ressources et prépare les packages pour leur exécution. Pour plus de détails sur les opérations effectuées pendant la compilation, consultez les fichiers `scripts/build.js` et les scripts définis dans `package.json`.

### Activation du bac à sable

L’[activation du bac à sable](#sandboxing) est fortement recommandée et nécessite, au minimum, de définir `QWEN_SANDBOX=true` dans votre fichier `~/.env`, ainsi que la disponibilité d’un fournisseur de bac à sable (par exemple `macOS Seatbelt`, `docker` ou `podman`). Pour plus de détails, consultez la section [Bac à sable](#sandboxing).

Pour construire à la fois l’utilitaire en ligne de commande `qwen-code` et le conteneur du bac à sable, exécutez `build:all` depuis le répertoire racine :

```bash
npm run build:all
```

Pour éviter la construction du conteneur du bac à sable, vous pouvez utiliser `npm run build` à la place.

### Exécution

Pour démarrer l’application Qwen Code à partir du code source (après sa compilation), exécutez la commande suivante depuis le répertoire racine :

```bash
npm start
```

Si vous souhaitez exécuter la version compilée en dehors du dossier `qwen-code`, vous pouvez utiliser `npm link path/to/qwen-code/packages/cli` (voir : [documentation](https://docs.npmjs.com/cli/v9/commands/npm-link)) afin de lancer l’application avec la commande `qwen-code`.

### Exécution des tests

Ce projet contient deux types de tests : les tests unitaires et les tests d’intégration.

#### Tests unitaires

Pour exécuter la suite de tests unitaires du projet :

```bash
npm run test
```

Cela exécutera les tests situés dans les répertoires `packages/core` et `packages/cli`. Assurez-vous que tous les tests réussissent avant de soumettre des modifications. Pour une vérification plus complète, il est recommandé d’exécuter `npm run preflight`.

#### Tests d’intégration

Les tests d’intégration sont conçus pour valider le fonctionnement bout en bout de Qwen Code. Ils ne sont pas exécutés dans le cadre de la commande par défaut `npm run test`.

Pour exécuter les tests d’intégration, utilisez la commande suivante :

```bash
npm run test:e2e
```

Pour obtenir des informations plus détaillées sur le framework de tests d’intégration, consultez la [documentation relative aux tests d’intégration](./docs/integration-tests.md).

### Vérifications de linting et préalables

Pour garantir la qualité du code et la cohérence du formatage, exécutez la vérification préalable :

```bash
npm run preflight
```

Cette commande exécute ESLint, Prettier, tous les tests ainsi que d’autres vérifications définies dans le fichier `package.json` du projet.

_ProTip_

Après avoir cloné le dépôt, créez un hook Git `pre-commit` afin de vous assurer que vos validations sont toujours propres.

```bash
echo "

# Exécute npm build et vérifie les erreurs
if ! npm run preflight; then
  echo "Échec de npm build. Validation annulée."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Mise en forme

Pour mettre en forme séparément le code de ce projet, exécutez la commande suivante depuis le répertoire racine :

```bash
npm run format
```

Cette commande utilise Prettier pour formater le code conformément aux directives de style du projet.

#### Analyse statique (linting)

Pour effectuer séparément une analyse statique du code de ce projet, exécutez la commande suivante depuis le répertoire racine :

```bash
npm run lint
```

### Conventions de codage

- Veuillez respecter le style de codage, les modèles et les conventions utilisés dans l’ensemble du code existant.
- **Importations :** Portez une attention particulière aux chemins d’importation. Le projet utilise ESLint pour appliquer des restrictions sur les importations relatives entre les packages.

### Structure du projet

- `packages/` : Contient les sous-packages individuels du projet.
  - `cli/` : L’interface en ligne de commande.
  - `core/` : La logique principale côté serveur de Qwen Code.
- `docs/` : Contient toute la documentation du projet.
- `scripts/` : Scripts utilitaires pour les tâches de compilation, de test et de développement.

Pour une description plus détaillée de l’architecture, consultez `docs/architecture.md`.

## Développement de la documentation

Cette section décrit comment développer et prévisualiser la documentation localement.

### Prérequis

1. Assurez-vous que Node.js (version 18 ou ultérieure) est installé.
2. Ayez npm ou yarn disponible.

### Configuration du site de documentation en local

Pour travailler sur la documentation et prévisualiser les modifications en local :

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

   Cette commande crée un lien symbolique depuis `../docs` vers `content` dans le projet `docs-site`, ce qui permet au site Next.js de servir le contenu de la documentation.

4. Lancez le serveur de développement :

   ```bash
   npm run dev
   ```

5. Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur pour afficher le site de documentation avec mises à jour en temps réel au fur et à mesure de vos modifications.

Toute modification apportée aux fichiers de documentation situés dans le répertoire principal `docs` sera immédiatement reflétée sur le site de documentation.

## Débogage

### VS Code :

0.  Exécutez l’interface CLI pour déboguer de façon interactive dans VS Code avec la touche `F5`.
1.  Démarrez l’interface CLI en mode débogage depuis le répertoire racine :
    ```bash
    npm run debug
    ```
    Cette commande exécute `node --inspect-brk dist/index.js` dans le répertoire `packages/cli`, mettant l’exécution en pause jusqu’à ce qu’un débogueur soit attaché. Vous pouvez ensuite ouvrir `chrome://inspect` dans votre navigateur Chrome pour vous connecter au débogueur.
2.  Dans VS Code, utilisez la configuration de lancement « Attach » (disponible dans le fichier `.vscode/launch.json`).

Vous pouvez également utiliser la configuration de lancement « Launch Program » dans VS Code si vous préférez lancer directement le fichier actuellement ouvert, mais la touche `F5` est généralement recommandée.

Pour atteindre un point d’arrêt à l’intérieur du conteneur sandbox, exécutez :

```bash
DEBUG=1 qwen-code
```

**Remarque :** Si vous avez défini `DEBUG=true` dans le fichier `.env` d’un projet, cela n’affectera pas `qwen-code`, car ce paramètre est automatiquement exclu. Utilisez plutôt des fichiers `.qwen-code/.env` pour définir des paramètres de débogage spécifiques à `qwen-code`.

### React DevTools

Pour déboguer l’interface utilisateur basée sur React de l’interface en ligne de commande (CLI), vous pouvez utiliser React DevTools. Ink, la bibliothèque utilisée pour l’interface de la CLI, est compatible avec React DevTools version 4.x.

1. **Démarrez l’application Qwen Code en mode développement :**

   ```bash
   DEV=true npm start
   ```

2. **Installez et exécutez React DevTools version 4.28.5 (ou la dernière version 4.x compatible) :**

   Vous pouvez l’installer globalement :

   ```bash
   npm install -g react-devtools@4.28.5
   react-devtools
   ```

   Ou l’exécuter directement à l’aide de `npx` :

   ```bash
   npx react-devtools@4.28.5
   ```

   Votre application CLI en cours d’exécution devrait alors se connecter à React DevTools.

## Sandbox

> À définir

## Publication manuelle

Nous publions un artefact pour chaque commit vers notre registre interne. Toutefois, si vous devez générer manuellement une version locale, exécutez les commandes suivantes :

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```