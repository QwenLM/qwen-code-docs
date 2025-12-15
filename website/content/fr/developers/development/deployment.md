# Exécution et déploiement de Qwen Code

Ce document décrit comment exécuter Qwen Code et explique l'architecture de déploiement utilisée par Qwen Code.

## Exécution de Qwen Code

Il existe plusieurs façons d'exécuter Qwen Code. L'option que vous choisissez dépend de la manière dont vous comptez l'utiliser.

---

### 1. Installation standard (Recommandée pour les utilisateurs typiques)

C'est la méthode recommandée pour que les utilisateurs finaux installent Qwen Code. Elle consiste à télécharger le paquet Qwen Code depuis le registre NPM.

- **Installation globale :**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Ensuite, exécutez l'interface en ligne de commande (CLI) depuis n'importe quel endroit :

  ```bash
  qwen
  ```

- **Exécution avec NPX :**

  ```bash
  # Exécute la dernière version depuis NPM sans installation globale
  npx @qwen-code/qwen-code
  ```

---

### 2. Exécution dans un bac à sable (Docker/Podman)

Pour des raisons de sécurité et d'isolation, Qwen Code peut être exécuté à l'intérieur d'un conteneur. C'est la manière par défaut dont le CLI exécute les outils qui pourraient avoir des effets secondaires.

- **Directement depuis le registre :**
  Vous pouvez exécuter directement l'image du bac à sable publiée. Cela est utile pour les environnements où vous n'avez que Docker et souhaitez exécuter le CLI.
  ```bash
  # Exécuter l'image du bac à sable publiée
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Utilisation du drapeau `--sandbox` :**
  Si vous avez Qwen Code installé localement (en utilisant l'installation standard décrite ci-dessus), vous pouvez lui indiquer de s'exécuter à l'intérieur du conteneur du bac à sable.
  ```bash
  qwen --sandbox -y -p "votre prompt ici"
  ```

---

### 3. Exécution depuis les sources (Recommandé pour les contributeurs de Qwen Code)

Les contributeurs du projet voudront exécuter l'interface en ligne de commande directement depuis le code source.

- **Mode développement :**
  Cette méthode fournit le rechargement à chaud et est utile pour le développement actif.
  ```bash
  # Depuis la racine du dépôt
  npm run start
  ```
- **Mode production (package lié) :**
  Cette méthode simule une installation globale en liant votre package local. Elle est utile pour tester une version locale dans un flux de travail de production.

  ```bash
  # Liez le package cli local à vos node_modules globaux
  npm link packages/cli

  # Vous pouvez maintenant exécuter votre version locale avec la commande `qwen`
  qwen
  ```

---

### 4. Exécution du dernier commit de Qwen Code depuis GitHub

Vous pouvez exécuter la version la plus récente de Qwen Code directement depuis le dépôt GitHub. Cela est utile pour tester des fonctionnalités encore en développement.

```bash

# Exécuter le CLI directement depuis la branche principale sur GitHub
npx https://github.com/QwenLM/qwen-code
```

## Architecture de déploiement

Les méthodes d'exécution décrites ci-dessus sont rendues possibles par les composants et processus architecturaux suivants :

**Packages NPM**

Le projet Qwen Code est un monorepo qui publie des packages principaux dans le registre NPM :

- `@qwen-code/qwen-code-core` : Le backend, gérant la logique et l'exécution des outils.
- `@qwen-code/qwen-code` : L'interface utilisateur.

Ces packages sont utilisés lors de l'installation standard et lors de l'exécution de Qwen Code depuis les sources.

**Processus de construction et d’empaquetage**

Deux processus de construction distincts sont utilisés, selon le canal de distribution :

- **Publication NPM :** Pour publier dans le registre NPM, le code source TypeScript dans `@qwen-code/qwen-code-core` et `@qwen-code/qwen-code` est transpilé en JavaScript standard à l’aide du compilateur TypeScript (`tsc`). Le répertoire `dist/` résultant est celui qui est publié dans le package NPM. Il s’agit d’une approche standard pour les bibliothèques TypeScript.

- **Exécution via `npx` depuis GitHub :** Lors de l’exécution de la dernière version de Qwen Code directement depuis GitHub, un processus différent est déclenché par le script `prepare` dans `package.json`. Ce script utilise `esbuild` pour regrouper l’ensemble de l’application et ses dépendances en un seul fichier JavaScript autonome. Ce bundle est généré à la volée sur la machine de l’utilisateur et n’est pas inclus dans le dépôt.

**Image Docker sandbox**

La méthode d’exécution basée sur Docker est prise en charge par l’image conteneur `qwen-code-sandbox`. Cette image est publiée dans un registre de conteneurs et contient une version globale préinstallée de Qwen Code.

## Processus de publication

Le processus de publication est automatisé via GitHub Actions. Le workflow de publication effectue les actions suivantes :

1.  Construction des paquets NPM en utilisant `tsc`.
2.  Publication des paquets NPM dans le registre d'artefacts.
3.  Création de releases GitHub avec les ressources groupées.