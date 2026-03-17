# Exécution et déploiement de Qwen Code

Ce document explique comment exécuter Qwen Code et décrit l’architecture de déploiement utilisée par Qwen Code.

## Exécution de Qwen Code

Il existe plusieurs façons d’exécuter Qwen Code. Le choix dépend de votre usage prévu.

---

### 1. Installation standard (recommandée pour les utilisateurs classiques)

Il s’agit de la méthode recommandée pour les utilisateurs finaux afin d’installer Qwen Code. Elle consiste à télécharger le package Qwen Code depuis le registre NPM.

- **Installation globale :**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Ensuite, exécutez l’interface en ligne de commande (CLI) depuis n’importe quel répertoire :

  ```bash
  qwen
  ```

- **Exécution via NPX :**

  ```bash
  # Exécute la dernière version disponible sur NPM sans installation globale
  npx @qwen-code/qwen-code
  ```

### 2. Exécution dans un environnement isolé (Docker/Podman)

Pour des raisons de sécurité et d’isolation, Qwen Code peut être exécuté à l’intérieur d’un conteneur. Il s’agit du mode par défaut utilisé par l’interface en ligne de commande (CLI) pour exécuter des outils susceptibles d’avoir des effets secondaires.

- **Directement depuis le registre :**  
  Vous pouvez exécuter directement l’image publiée de l’environnement isolé. Cette méthode est utile dans les environnements où seul Docker est disponible et où vous souhaitez exécuter la CLI.  
  ```bash
  # Exécuter l’image publiée de l’environnement isolé
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **À l’aide de l’option `--sandbox` :**  
  Si Qwen Code est installé localement (via l’installation standard décrite ci-dessus), vous pouvez lui demander de s’exécuter à l’intérieur du conteneur d’environnement isolé.  
  ```bash
  qwen --sandbox -y -p "votre invite ici"
  ```

### 3. Exécution à partir des sources (recommandé pour les contributeurs à Qwen Code)

Les contributeurs au projet souhaiteront exécuter l’interface en ligne de commande (CLI) directement à partir du code source.

- **Mode développement :**  
  Cette méthode fournit un rechargement dynamique (hot-reloading) et est utile pendant le développement actif.  
  ```bash
  # Depuis la racine du dépôt
  npm run start
  ```
- **Mode « production » (paquet lié) :**  
  Cette méthode simule une installation globale en liant votre paquet local. Elle est utile pour tester une version locale dans un flux de travail de production.

  ```bash
  # Liez le paquet CLI local à votre répertoire global node_modules
  npm link packages/cli

  # Vous pouvez désormais exécuter votre version locale à l’aide de la commande `qwen`
  qwen
  ```

---

### 4. Exécution du dernier commit Qwen Code depuis GitHub

Vous pouvez exécuter directement depuis le dépôt GitHub la version correspondant au dernier commit de Qwen Code. Cela est utile pour tester des fonctionnalités encore en cours de développement.

```bash

# Exécuter l’interface CLI directement depuis la branche principale sur GitHub
npx https://github.com/QwenLM/qwen-code

## Architecture de déploiement

Les méthodes d’exécution décrites ci-dessus reposent sur les composants architecturaux et les processus suivants :

**Packages NPM**

Le projet Qwen Code est un monorepo qui publie ses packages principaux sur le registre NPM :

- `@qwen-code/qwen-code-core` : Le backend, chargé de la logique métier et de l’exécution des outils.
- `@qwen-code/qwen-code` : L’interface utilisateur (frontend).

Ces packages sont utilisés lors de l’installation standard ainsi que lors de l’exécution de Qwen Code à partir des sources.

**Processus de compilation et d’empaquetage**

Deux processus de compilation distincts sont utilisés, selon le canal de distribution :

- **Publication sur NPM** : Pour la publication sur le registre NPM, le code source TypeScript de `@qwen-code/qwen-code-core` et de `@qwen-code/qwen-code` est transpilé en JavaScript standard à l’aide du compilateur TypeScript (`tsc`). Le répertoire `dist/` résultant est ce qui est publié dans le package NPM. Il s’agit d’une approche standard pour les bibliothèques TypeScript.

- **Exécution GitHub via `npx`** : Lorsque la dernière version de Qwen Code est exécutée directement depuis GitHub, un processus différent est déclenché par le script `prepare` défini dans le fichier `package.json`. Ce script utilise `esbuild` pour regrouper l’ensemble de l’application et de ses dépendances en un seul fichier JavaScript autonome. Ce bundle est généré dynamiquement sur la machine de l’utilisateur et n’est pas intégré au référentiel.

**Image Docker « sandbox »**

La méthode d’exécution basée sur Docker repose sur l’image conteneur `qwen-code-sandbox`. Cette image est publiée sur un registre de conteneurs et contient une version globale préinstallée de Qwen Code.

## Processus de publication

Le processus de publication est automatisé via GitHub Actions. Le workflow de publication effectue les actions suivantes :

1.  Génère les packages NPM à l’aide de `tsc`.
2.  Publie les packages NPM dans le registre d’artefacts.
3.  Crée des versions GitHub accompagnées des ressources groupées.