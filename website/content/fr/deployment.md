# Exécution et déploiement de Qwen Code

Ce document explique comment exécuter Qwen Code et décrit l'architecture de déploiement utilisée par Qwen Code.

## Exécuter Qwen Code

Il existe plusieurs façons d'exécuter Qwen Code. L'option que vous choisissez dépend de votre utilisation prévue.

---

### 1. Installation standard (Recommandée pour les utilisateurs classiques)

C'est la méthode recommandée pour que les utilisateurs finaux installent Qwen Code. Elle consiste à télécharger le package Qwen Code depuis le registre NPM.

- **Installation globale :**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Ensuite, exécutez le CLI depuis n'importe où :

  ```bash
  qwen
  ```

- **Exécution avec NPX :**

  ```bash
  # Exécute la dernière version depuis NPM sans installation globale
  npx @qwen-code/qwen-code
  ```

---

### 2. Exécution dans un sandbox (Docker/Podman)

Pour des raisons de sécurité et d'isolation, Qwen Code peut être exécuté à l'intérieur d'un container. C'est d'ailleurs la méthode par défaut utilisée par le CLI pour exécuter les outils qui pourraient avoir des effets de bord.

- **Directement depuis le Registry :**  
  Vous pouvez exécuter l'image du sandbox publiée directement. C'est pratique pour les environnements où vous n'avez que Docker et souhaitez exécuter le CLI.
  ```bash
  # Exécuter l'image du sandbox publiée
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.7
  ```

- **Utilisation du flag `--sandbox` :**  
  Si vous avez Qwen Code installé localement (via l'installation standard décrite ci-dessus), vous pouvez lui demander de s'exécuter à l'intérieur du container sandbox.
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. Exécution depuis les sources (Recommandé pour les contributeurs Qwen Code)

Les contributeurs du projet voudront exécuter le CLI directement depuis le code source.

- **Mode développement :**
  Cette méthode fournit le hot-reloading et est utile pour le développement actif.
  ```bash
  # Depuis la racine du repository
  npm run start
  ```
- **Mode production (package lié) :**
  Cette méthode simule une installation globale en liant votre package local. Elle est utile pour tester un build local dans un workflow de production.

  ```bash
  # Lier le package cli local à vos node_modules globaux
  npm link packages/cli

  # Vous pouvez maintenant exécuter votre version locale avec la commande `qwen`
  qwen
  ```

---

### 4. Exécution du dernier commit Qwen Code depuis GitHub

Vous pouvez exécuter la version la plus récente de Qwen Code directement depuis le repository GitHub. C'est utile pour tester des fonctionnalités encore en développement.

```bash

# Exécuter le CLI directement depuis la branche principale sur GitHub
npx https://github.com/QwenLM/qwen-code
```

## Architecture de déploiement

Les méthodes d'exécution décrites ci-dessus sont rendues possibles par les composants et processus architecturaux suivants :

**Packages NPM**

Le projet Qwen Code est un monorepo qui publie des packages principaux sur le registre NPM :

- `@qwen-code/qwen-code-core` : Le backend, qui gère la logique et l'exécution des outils.
- `@qwen-code/qwen-code` : L'interface utilisateur.

Ces packages sont utilisés lors de l'installation standard et lors de l'exécution de Qwen Code depuis les sources.

**Processus de build et d’empaquetage**

Deux processus de build distincts sont utilisés, selon le canal de distribution :

- **Publication NPM :** Pour publier sur le registre NPM, le code source TypeScript dans `@qwen-code/qwen-code-core` et `@qwen-code/qwen-code` est transpilé en JavaScript standard à l’aide du TypeScript Compiler (`tsc`). Le répertoire `dist/` résultant est celui qui est publié dans le package NPM. Il s’agit d’une approche standard pour les bibliothèques TypeScript.

- **Exécution via `npx` depuis GitHub :** Lors de l’exécution de la dernière version de Qwen Code directement depuis GitHub, un processus différent est déclenché par le script `prepare` dans `package.json`. Ce script utilise `esbuild` pour regrouper l’ensemble de l’application et de ses dépendances dans un seul fichier JavaScript autonome. Ce bundle est généré à la volée sur la machine de l’utilisateur et n’est pas inclus dans le dépôt.

**Image Docker sandbox**

La méthode d’exécution basée sur Docker est supportée par l’image conteneur `qwen-code-sandbox`. Cette image est publiée sur un registre de conteneurs et contient une version globale préinstallée de Qwen Code.

## Processus de release

Le processus de release est automatisé via GitHub Actions. Le workflow de release effectue les actions suivantes :

1.  Build les packages NPM en utilisant `tsc`.
2.  Publie les packages NPM dans le registre d'artifacts.
3.  Crée des releases GitHub avec les assets bundlés.