# Bien démarrer avec les extensions Qwen Code

Ce guide vous accompagne dans la création de votre première extension Qwen Code. Vous y apprendrez comment configurer une nouvelle extension, ajouter un outil personnalisé via un serveur MCP, créer une commande personnalisée et fournir du contexte au modèle à l’aide d’un fichier `QWEN.md`.

## Prérequis

Avant de commencer, assurez-vous d’avoir installé Qwen Code et de maîtriser les bases de Node.js et de TypeScript.

## Étape 1 : Créer une nouvelle extension

La méthode la plus simple pour démarrer consiste à utiliser l’un des modèles intégrés. Nous utiliserons l’exemple `mcp-server` comme fondation.

Exécutez la commande suivante pour créer un nouveau répertoire nommé `my-first-extension`, contenant les fichiers du modèle :

```bash
qwen extensions new my-first-extension mcp-server
```

Cela crée un nouveau répertoire avec la structure suivante :

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Étape 2 : Comprendre les fichiers de l’extension

Examinons les fichiers clés de votre nouvelle extension.

### `qwen-extension.json`

Il s’agit du fichier manifeste de votre extension. Il indique à Qwen Code comment charger et utiliser votre extension.

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
- `mcpServers` : Cette section définit un ou plusieurs serveurs Model Context Protocol (MCP). Les serveurs MCP permettent d’ajouter de nouveaux outils que le modèle peut utiliser.
  - `command`, `args`, `cwd` : Ces champs spécifient comment démarrer votre serveur. Notez l’utilisation de la variable `${extensionPath}`, que Qwen Code remplace par le chemin absolu vers le répertoire d’installation de votre extension. Cela permet à votre extension de fonctionner quel que soit son emplacement d’installation.

### `example.ts`

Ce fichier contient le code source de votre serveur MCP. Il s’agit d’un serveur Node.js simple utilisant le package `@modelcontextprotocol/sdk`.

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

// Enregistre un nouvel outil nommé « fetch_posts »
server.registerTool(
  'fetch_posts',
  {
    description: 'Récupère une liste de publications depuis une API publique.',
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

// ... (l’enregistrement des invites est omis pour plus de concision)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Ce serveur définit un seul outil, `fetch_posts`, qui récupère des données depuis une API publique.

### `package.json` et `tsconfig.json`

Il s’agit de fichiers de configuration standard pour un projet TypeScript. Le fichier `package.json` définit les dépendances et un script `build`, tandis que `tsconfig.json` configure le compilateur TypeScript.

## Étape 3 : Générez et liez votre extension

Avant de pouvoir utiliser l’extension, vous devez compiler le code TypeScript et lier l’extension à votre installation locale de Qwen Code.

1.  **Installez les dépendances :**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Générez le serveur :**

    ```bash
    npm run build
    ```

    Cette commande compile `example.ts` en `dist/example.js`, fichier référencé dans votre fichier `qwen-extension.json`.

3.  **Lie l’extension :**

    La commande `link` crée un lien symbolique depuis le répertoire des extensions de Qwen Code vers votre répertoire de développement. Ainsi, toutes les modifications que vous apportez sont immédiatement prises en compte, sans nécessiter de réinstallation.

    ```bash
    qwen extensions link .
    ```

Redémarrez maintenant votre session Qwen Code. Le nouvel outil `fetch_posts` sera disponible. Vous pouvez le tester en demandant : « fetch posts ».

## Étape 4 : Ajouter une commande personnalisée

Les commandes personnalisées permettent de créer des raccourcis pour des invites complexes. Ajoutons une commande qui recherche un motif dans votre code.

1.  Créez un répertoire `commands` et un sous-répertoire pour votre groupe de commandes :

    ```bash
    mkdir -p commands/fs
    ```

2.  Créez un fichier nommé `commands/fs/grep-code.md` :

    ```markdown
    ---
    description: Rechercher un motif dans le code et résumer les résultats
    ---

    Veuillez résumer les résultats de la recherche du motif `{{args}}`.

    Résultats de la recherche :
    !{grep -r {{args}} .}
    ```

    Cette commande, `/fs:grep-code`, prendra un argument, exécutera la commande shell `grep` avec cet argument, puis transmettra les résultats à une invite afin d’en générer un résumé.

> **Remarque :** Les commandes utilisent le format Markdown, avec un en-tête YAML facultatif. Le format TOML est obsolète mais reste pris en charge pour assurer la rétrocompatibilité.

Une fois le fichier enregistré, redémarrez Qwen Code. Vous pouvez désormais exécuter `/fs:grep-code "un certain motif"` pour utiliser votre nouvelle commande.

## Étape 5 : Ajouter des compétences personnalisées et des sous-agents (facultatif)

Les extensions peuvent également fournir des compétences et des sous-agents personnalisés afin d’étendre les fonctionnalités de Qwen Code.

### Ajouter une compétence personnalisée

Les compétences sont des fonctionnalités invoquées par le modèle que l’IA peut utiliser automatiquement lorsqu’elles sont pertinentes.

1.  Créez un répertoire `skills` contenant un sous-répertoire pour la compétence :

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  Créez un fichier `skills/code-analyzer/SKILL.md` :

    ```markdown
    ---
    name: code-analyzer
    description: Analyse la structure du code et fournit des analyses sur sa complexité, ses dépendances et les améliorations potentielles
    ---

    # Analyseur de code

    ## Instructions

    Lors de l’analyse du code, concentrez-vous sur :

    - La complexité et la maintenabilité du code
    - Les dépendances et le couplage
    - Les problèmes de performance potentiels
    - Les suggestions d’amélioration

    ## Exemples

    - « Analyse la complexité de cette fonction »
    - « Quelles sont les dépendances de ce module ? »
    ```

### Ajout d’un sous-agent personnalisé

Les sous-agents sont des assistants IA spécialisés pour des tâches précises.

1.  Créez un répertoire `agents` :

    ```bash
    mkdir -p agents
    ```

2.  Créez un fichier `agents/refactoring-expert.md` :

    ```markdown
    ---
    name: refactoring-expert
    description: Spécialisé dans le refactorage de code, l’amélioration de la structure et de la maintenabilité du code
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    Vous êtes un spécialiste du refactorage, concentré sur l’amélioration de la qualité du code.

    Votre expertise couvre notamment :

    - L’identification des « odeurs » de code et des anti-paterns
    - L’application des principes SOLID
    - L’amélioration de la lisibilité et de la maintenabilité du code
    - Le refactorage sûr, avec un risque minimal

    Pour chaque tâche de refactorage :

    1. Analysez la structure actuelle du code
    2. Identifiez les zones à améliorer
    3. Proposez des étapes de refactorage
    4. Mettez en œuvre les modifications de façon incrémentale
    5. Vérifiez que les fonctionnalités sont préservées
    ```

Après avoir redémarré Qwen Code, vos compétences personnalisées seront disponibles via `/skills`, et vos sous-agents via `/agents manage`.

## Étape 6 : Ajouter un fichier `QWEN.md` personnalisé

Vous pouvez fournir un contexte persistant au modèle en ajoutant un fichier `QWEN.md` à votre extension. Cela s’avère utile pour indiquer au modèle comment se comporter ou lui fournir des informations sur les outils proposés par votre extension. Notez que ce fichier n’est pas toujours nécessaire pour les extensions conçues uniquement pour exposer des commandes et des invites.

1.  Créez un fichier nommé `QWEN.md` à la racine du répertoire de votre extension :

    ```markdown
    # Instructions pour ma première extension

    Vous êtes un assistant expert pour les développeurs. Lorsque l’utilisateur vous demande de récupérer des publications, utilisez l’outil `fetch_posts`. Soyez concis dans vos réponses.
    ```

2.  Mettez à jour votre fichier `qwen-extension.json` afin d’indiquer à l’interface CLI de charger ce fichier :

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

Redémarrez à nouveau l’interface CLI. Le modèle disposera désormais du contexte fourni par votre fichier `QWEN.md` lors de chaque session où l’extension est active.

## Étape 7 : Publier votre extension

Une fois que vous êtes satisfait de votre extension, vous pouvez la partager avec d’autres utilisateurs. Les deux méthodes principales pour publier une extension sont l’utilisation d’un dépôt Git ou celle des versions GitHub (GitHub Releases). L’utilisation d’un dépôt Git public est la méthode la plus simple.

Pour des instructions détaillées sur ces deux méthodes, consultez le [Guide de publication des extensions](extension-releasing.md).

## Conclusion

Vous avez créé avec succès une extension Qwen Code ! Vous avez appris à :

- Initialiser une nouvelle extension à partir d’un modèle.
- Ajouter des outils personnalisés avec un serveur MCP.
- Créer des commandes personnalisées pratiques.
- Ajouter des compétences et des sous-agents personnalisés.
- Fournir un contexte persistant au modèle.
- Lier votre extension pour le développement local.

À partir de là, vous pouvez explorer des fonctionnalités plus avancées et intégrer de nouvelles capacités puissantes dans Qwen Code.