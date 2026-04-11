# Premiers pas avec les extensions Qwen Code

Ce guide vous accompagne dans la création de votre première extension Qwen Code. Vous apprendrez à configurer une nouvelle extension, à ajouter un outil personnalisé via un serveur MCP, à créer une commande personnalisée et à fournir du contexte au modèle à l'aide d'un fichier `QWEN.md`.

## Prérequis

Avant de commencer, assurez-vous d'avoir installé Qwen Code et de posséder des connaissances de base en Node.js et TypeScript.

## Étape 1 : Créer une nouvelle extension

Le moyen le plus simple de commencer est d'utiliser l'un des modèles intégrés. Nous utiliserons l'exemple `mcp-server` comme base.

Exécutez la commande suivante pour créer un nouveau répertoire nommé `my-first-extension` contenant les fichiers du modèle :

```bash
qwen extensions new my-first-extension mcp-server
```

Cela créera un nouveau répertoire avec la structure suivante :

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Étape 2 : Comprendre les fichiers de l'extension

Examinons les fichiers clés de votre nouvelle extension.

### `qwen-extension.json`

Il s'agit du fichier manifeste de votre extension. Il indique à Qwen Code comment charger et utiliser votre extension.

```json
{
  "name": "my-first-extension",
  "version": "1.0.0",
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["${extensionPath}${/}dist${/}example.js"],
      "cwd": "${extensionPath}"
    }
  }
}
```

- `name` : Le nom unique de votre extension.
- `version` : La version de votre extension.
- `mcpServers` : Cette section définit un ou plusieurs serveurs Model Context Protocol (MCP). Les serveurs MCP permettent d'ajouter de nouveaux outils utilisables par le modèle.
  - `command`, `args`, `cwd` : Ces champs spécifient comment démarrer votre serveur. Notez l'utilisation de la variable `${extensionPath}`, que Qwen Code remplace par le chemin absolu du répertoire d'installation de votre extension. Cela permet à votre extension de fonctionner quel que soit son emplacement d'installation.

### `example.ts`

Ce fichier contient le code source de votre serveur MCP. Il s'agit d'un serveur Node.js simple qui utilise le `@modelcontextprotocol/sdk`.

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

// Registers a new tool named 'fetch_posts'
server.registerTool(
  'fetch_posts',
  {
    description: 'Fetches a list of posts from a public API.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const apiResponse = await fetch(
      'https://jsonplaceholder.typicode.com/posts',
    );
    const posts = await apiResponse.json();
    const response = { posts: posts.slice(0, 5) };
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  },
);

// ... (prompt registration omitted for brevity)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Ce serveur définit un seul outil nommé `fetch_posts` qui récupère des données depuis une API publique.

### `package.json` et `tsconfig.json`

Il s'agit des fichiers de configuration standards d'un projet TypeScript. Le fichier `package.json` définit les dépendances et un script `build`, tandis que `tsconfig.json` configure le compilateur TypeScript.

## Étape 3 : Compiler et lier votre extension

Avant de pouvoir utiliser l'extension, vous devez compiler le code TypeScript et lier l'extension à votre installation de Qwen Code pour le développement local.

1.  **Installer les dépendances :**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Compiler le serveur :**

    ```bash
    npm run build
    ```

    Cela compilera `example.ts` en `dist/example.js`, qui est le fichier référencé dans votre `qwen-extension.json`.

3.  **Lier l'extension :**

    La commande `link` crée un lien symbolique entre le répertoire des extensions de Qwen Code et votre répertoire de développement. Ainsi, toutes les modifications que vous apportez seront prises en compte immédiatement, sans avoir besoin de réinstaller l'extension.

    ```bash
    qwen extensions link .
    ```

Redémarrez ensuite votre session Qwen Code. Le nouvel outil `fetch_posts` sera disponible. Vous pouvez le tester en demandant : "fetch posts".

## Étape 4 : Ajouter une commande personnalisée

Les commandes personnalisées permettent de créer des raccourcis pour des prompts complexes. Ajoutons une commande qui recherche un motif dans votre code.

1.  Créez un répertoire `commands` et un sous-répertoire pour votre groupe de commandes :

    ```bash
    mkdir -p commands/fs
    ```

2.  Créez un fichier nommé `commands/fs/grep-code.md` :

    ```markdown
    ---
    description: Search for a pattern in code and summarize findings
    ---

    Please summarize the findings for the pattern `{{args}}`.

    Search Results:
    !{grep -r {{args}} .}
    ```

    Cette commande, `/fs:grep-code`, prendra un argument, exécutera la commande shell `grep` avec celui-ci et transmettra les résultats à un prompt pour résumation.

> **Remarque :** Les commandes utilisent le format Markdown avec un frontmatter YAML optionnel. Le format TOML est déprécié mais reste pris en charge pour la rétrocompatibilité.

Après avoir enregistré le fichier, redémarrez Qwen Code. Vous pouvez désormais exécuter `/fs:grep-code "some pattern"` pour utiliser votre nouvelle commande.

## Étape 5 : Ajouter des skills et subagents personnalisés (facultatif)

Les extensions peuvent également fournir des skills et subagents personnalisés pour étendre les fonctionnalités de Qwen Code.

### Ajouter un skill personnalisé

Les skills sont des fonctionnalités invoquées par le modèle que l'IA peut utiliser automatiquement lorsqu'elles sont pertinentes.

1.  Créez un répertoire `skills` avec un sous-répertoire pour le skill :

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  Créez un fichier `skills/code-analyzer/SKILL.md` :

    ```markdown
    ---
    name: code-analyzer
    description: Analyzes code structure and provides insights about complexity, dependencies, and potential improvements
    ---

    # Code Analyzer

    ## Instructions

    When analyzing code, focus on:

    - Code complexity and maintainability
    - Dependencies and coupling
    - Potential performance issues
    - Suggestions for improvements

    ## Examples

    - "Analyze the complexity of this function"
    - "What are the dependencies of this module?"
    ```

### Ajouter un subagent personnalisé

Les subagents sont des assistants IA spécialisés pour des tâches spécifiques.

1.  Créez un répertoire `agents` :

    ```bash
    mkdir -p agents
    ```

2.  Créez un fichier `agents/refactoring-expert.md` :

    ```markdown
    ---
    name: refactoring-expert
    description: Specialized in code refactoring, improving code structure and maintainability
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    You are a refactoring specialist focused on improving code quality.

    Your expertise includes:

    - Identifying code smells and anti-patterns
    - Applying SOLID principles
    - Improving code readability and maintainability
    - Safe refactoring with minimal risk

    For each refactoring task:

    1. Analyze the current code structure
    2. Identify areas for improvement
    3. Propose refactoring steps
    4. Implement changes incrementally
    5. Verify functionality is preserved
    ```

Après avoir redémarré Qwen Code, vos skills personnalisés seront disponibles via `/skills` et les subagents via `/agents manage`.

## Étape 6 : Ajouter un fichier `QWEN.md` personnalisé

Vous pouvez fournir un contexte persistant au modèle en ajoutant un fichier `QWEN.md` à votre extension. Cela est utile pour donner au modèle des instructions sur son comportement ou des informations sur les outils de votre extension. Notez que vous n'en aurez pas toujours besoin pour les extensions conçues pour exposer des commandes et des prompts.

1.  Créez un fichier nommé `QWEN.md` à la racine du répertoire de votre extension :

    ```markdown
    # My First Extension Instructions

    You are an expert developer assistant. When the user asks you to fetch posts, use the `fetch_posts` tool. Be concise in your responses.
    ```

2.  Mettez à jour votre `qwen-extension.json` pour indiquer à la CLI de charger ce fichier :

    ```json
    {
      "name": "my-first-extension",
      "version": "1.0.0",
      "contextFileName": "QWEN.md",
      "mcpServers": {
        "nodeServer": {
          "command": "node",
          "args": ["${extensionPath}${/}dist${/}example.js"],
          "cwd": "${extensionPath}"
        }
      }
    }
    ```

Redémarrez à nouveau la CLI. Le modèle disposera désormais du contexte de votre fichier `QWEN.md` dans chaque session où l'extension est active.

## Étape 7 : Publier votre extension

Une fois que vous êtes satisfait de votre extension, vous pouvez la partager. Les deux principales méthodes de publication d'extensions passent par un dépôt Git ou via GitHub Releases. L'utilisation d'un dépôt Git public est la méthode la plus simple.

Pour des instructions détaillées sur ces deux méthodes, consultez le [Guide de publication d'extensions](extension-releasing.md).

## Conclusion

Vous avez créé avec succès une extension Qwen Code ! Vous avez appris à :

- Initialiser une nouvelle extension à partir d'un modèle.
- Ajouter des outils personnalisés avec un serveur MCP.
- Créer des commandes personnalisées pratiques.
- Ajouter des skills et subagents personnalisés.
- Fournir un contexte persistant au modèle.
- Lier votre extension pour le développement local.

À partir de là, vous pouvez explorer des fonctionnalités plus avancées et intégrer de nouvelles capacités puissantes à Qwen Code.