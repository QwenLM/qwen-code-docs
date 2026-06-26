# Exécution et déploiement de Qwen Code

Ce document décrit comment exécuter Qwen Code et explique l'architecture de déploiement utilisée par Qwen Code.

## Exécution de Qwen Code

Il existe plusieurs façons d'exécuter Qwen Code. L'option choisie dépend de la manière dont vous souhaitez l'utiliser.

---

### 1. Installation standard (Recommandée pour les utilisateurs classiques)

Il s'agit de la méthode recommandée pour les utilisateurs finaux afin d'installer Qwen Code. Elle consiste à télécharger le paquet Qwen Code depuis le registre NPM.

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
  # Execute the latest version from NPM without a global install
  npx @qwen-code/qwen-code
  ```

---

### 2. Exécution dans un bac à sable (Docker/Podman)

Pour des raisons de sécurité et d'isolation, Qwen Code peut être exécuté dans un conteneur. C'est la méthode par défaut utilisée par la CLI pour exécuter des outils pouvant avoir des effets secondaires.

- **Directement depuis le registre :**
  Vous pouvez exécuter directement l'image sandbox publiée. Cela est utile dans les environnements où vous ne disposez que de Docker et souhaitez exécuter la CLI.
  ```bash
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Utilisation du drapeau `--sandbox` :**
  Si vous avez Qwen Code installé localement (en utilisant l'installation standard décrite ci-dessus), vous pouvez lui demander de s'exécuter dans le conteneur sandbox.
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. Exécution depuis les sources (Recommandée pour les contributeurs de Qwen Code)

Les contributeurs au projet voudront exécuter la CLI directement depuis le code source.

- **Mode développement :**
  Cette méthode offre le rechargement à chaud et est utile pour le développement actif.
  ```bash
  # From the root of the repository
  npm run start
  ```
- **Mode proche de la production (paquet lié) :**
  Cette méthode simule une installation globale en liant votre paquet local. Elle est utile pour tester une construction locale dans un workflow de production.

  ```bash
  # Link the local cli package to your global node_modules
  npm link packages/cli

  # Now you can run your local version using the `qwen` command
  qwen
  ```

---

### 4. Exécution du dernier commit de Qwen Code depuis GitHub

Vous pouvez exécuter la version la plus récente de Qwen Code directement depuis le dépôt GitHub. Cela est utile pour tester des fonctionnalités encore en développement.

```bash
# Execute the CLI directly from the main branch on GitHub
npx https://github.com/QwenLM/qwen-code
```

## Architecture de déploiement

Les méthodes d'exécution décrites ci-dessus sont rendues possibles par les composants et processus architecturaux suivants :

**Paquets NPM**

Le projet Qwen Code est un monorepo qui publie des paquets principaux sur le registre NPM :

- `@qwen-code/qwen-code-core` : le backend, gérant la logique et l'exécution des outils.
- `@qwen-code/qwen-code` : le frontend destiné aux utilisateurs.

Ces paquets sont utilisés lors de l'installation standard et lors de l'exécution de Qwen Code depuis les sources.

**Processus de construction et d'empaquetage**

Deux processus de construction distincts sont utilisés, selon le canal de distribution :

- **Publication NPM :** Pour la publication sur le registre NPM, le code source TypeScript dans `@qwen-code/qwen-code-core` et `@qwen-code/qwen-code` est transpilé en JavaScript standard à l'aide du compilateur TypeScript (`tsc`). Le répertoire `dist/` résultant est ce qui est publié dans le paquet NPM. Il s'agit d'une approche standard pour les bibliothèques TypeScript.

- **Exécution via GitHub `npx` :** Lors de l'exécution de la dernière version de Qwen Code directement depuis GitHub, un processus différent est déclenché par le script `prepare` dans `package.json`. Ce script utilise `esbuild` pour regrouper l'ensemble de l'application et ses dépendances en un seul fichier JavaScript autonome. Ce bundle est créé à la volée sur la machine de l'utilisateur et n'est pas intégré au dépôt.

**Image sandbox Docker**

La méthode d'exécution basée sur Docker est prise en charge par l'image conteneur `qwen-code-sandbox`. Cette image est publiée sur un registre de conteneurs et contient une version globale préinstallée de Qwen Code.

## Processus de publication

Le processus de publication est automatisé via GitHub Actions. Le workflow de publication effectue les actions suivantes :

1.  Construire les paquets NPM à l'aide de `tsc`.
2.  Publier les paquets NPM sur le registre d'artefacts.
3.  Créer des versions GitHub avec les assets groupés.