# Exécution et déploiement de Qwen Code

Ce document explique comment exécuter Qwen Code et décrit l'architecture de déploiement utilisée.

## Exécution de Qwen Code

Plusieurs méthodes permettent d'exécuter Qwen Code. Le choix dépend de votre cas d'utilisation.

---

### 1. Installation standard (Recommandée pour les utilisateurs classiques)

Il s'agit de la méthode recommandée pour les utilisateurs finaux. Elle consiste à télécharger le package Qwen Code depuis le registre NPM.

- **Installation globale :**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Ensuite, exécutez la CLI depuis n'importe où :

  ```bash
  qwen
  ```

- **Exécution via NPX :**

  ```bash
  # Exécute la dernière version depuis NPM sans installation globale
  npx @qwen-code/qwen-code
  ```

---

### 2. Exécution dans un sandbox (Docker/Podman)

Pour des raisons de sécurité et d'isolation, Qwen Code peut s'exécuter dans un conteneur. C'est la méthode par défaut utilisée par la CLI pour exécuter des outils susceptibles d'avoir des effets secondaires.

- **Directement depuis le registre :**
  Vous pouvez exécuter directement l'image sandbox publiée. Cette approche est utile dans les environnements où seul Docker est disponible et où vous souhaitez exécuter la CLI.
  ```bash
  # Exécute l'image sandbox publiée
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Utilisation du flag `--sandbox` :**
  Si Qwen Code est installé localement (via l'installation standard décrite ci-dessus), vous pouvez lui demander de s'exécuter dans le conteneur sandbox.
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. Exécution depuis les sources (Recommandée pour les contributeurs à Qwen Code)

Les contributeurs au projet souhaiteront exécuter la CLI directement depuis le code source.

- **Mode développement :**
  Cette méthode offre le hot-reloading et est utile pour le développement actif.
  ```bash
  # Depuis la racine du dépôt
  npm run start
  ```
- **Mode similaire à la production (Package lié) :**
  Cette méthode simule une installation globale en liant votre package local. Elle est utile pour tester une build locale dans un workflow de production.

  ```bash
  # Lie le package cli local à vos node_modules globaux
  npm link packages/cli

  # Vous pouvez désormais exécuter votre version locale avec la commande `qwen`
  qwen
  ```

---

### 4. Exécution du dernier commit Qwen Code depuis GitHub

Vous pouvez exécuter la version la plus récente de Qwen Code directement depuis le dépôt GitHub. Cette méthode est utile pour tester des fonctionnalités encore en développement.

```bash
# Exécute la CLI directement depuis la branche main sur GitHub
npx https://github.com/QwenLM/qwen-code
```

## Architecture de déploiement

Les méthodes d'exécution décrites ci-dessus reposent sur les composants et processus architecturaux suivants :

**Packages NPM**

Le projet Qwen Code est un monorepo qui publie des packages core sur le registre NPM :

- `@qwen-code/qwen-code-core` : Le backend, qui gère la logique et l'exécution des outils.
- `@qwen-code/qwen-code` : Le frontend destiné aux utilisateurs.

Ces packages sont utilisés lors de l'installation standard et lors de l'exécution de Qwen Code depuis les sources.

**Processus de build et de packaging**

Deux processus de build distincts sont utilisés, selon le canal de distribution :

- **Publication NPM :** Pour la publication sur le registre NPM, le code source TypeScript de `@qwen-code/qwen-code-core` et `@qwen-code/qwen-code` est transpilé en JavaScript standard à l'aide du compilateur TypeScript (`tsc`). Le répertoire `dist/` résultant est celui publié dans le package NPM. Il s'agit d'une approche standard pour les bibliothèques TypeScript.

- **Exécution GitHub via `npx` :** Lors de l'exécution de la dernière version de Qwen Code directement depuis GitHub, un processus différent est déclenché par le script `prepare` dans `package.json`. Ce script utilise `esbuild` pour bundler l'ensemble de l'application et ses dépendances dans un seul fichier JavaScript autonome. Ce bundle est généré à la volée sur la machine de l'utilisateur et n'est pas commité dans le dépôt.

**Image Docker sandbox**

La méthode d'exécution basée sur Docker s'appuie sur l'image conteneur `qwen-code-sandbox`. Cette image est publiée sur un registre de conteneurs et contient une version globale préinstallée de Qwen Code.

## Processus de release

Le processus de release est automatisé via GitHub Actions. Le workflow de release effectue les actions suivantes :

1.  Build des packages NPM à l'aide de `tsc`.
2.  Publication des packages NPM sur le registre d'artefacts.
3.  Création des releases GitHub avec les assets bundlés.