# Premiers pas avec les extensions Qwen Code

Ce guide vous accompagnera dans la création de votre première extension Qwen Code. Vous apprendrez comment configurer une nouvelle extension, ajouter un outil personnalisé via un serveur MCP, créer une commande personnalisée, et fournir du contexte au modèle avec un fichier `QWEN.md`.

## Prérequis

Avant de commencer, assurez-vous d'avoir installé Qwen Code et d'avoir une compréhension basique de Node.js et TypeScript.

## Étape 1 : Créer une nouvelle extension

La manière la plus simple de démarrer est d'utiliser l'un des modèles intégrés. Nous utiliserons l'exemple `mcp-server` comme base.

Exécutez la commande suivante pour créer un nouveau répertoire appelé `my-first-extension` avec les fichiers du modèle :

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

C'est le fichier manifeste de votre extension. Il indique à Qwen Code comment charger et utiliser votre extension.

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
- `mcpServers` : Cette section définit un ou plusieurs serveurs Model Context Protocol (MCP). Les serveurs MCP permettent d'ajouter de nouveaux outils que le modèle peut utiliser.
  - `command`, `args`, `cwd` : Ces champs spécifient comment démarrer votre serveur. Notez l'utilisation de la variable `${extensionPath}`, que Qwen Code remplace par le chemin absolu vers le répertoire d'installation de votre extension. Cela permet à votre extension de fonctionner quel que soit l'endroit où elle est installée.

### `example.ts`

Ce fichier contient le code source de votre serveur MCP. Il s'agit d'un serveur Node.js simple qui utilise le SDK `@modelcontextprotocol/sdk`.

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

Ce serveur définit un seul outil appelé `fetch_posts` qui récupère des données depuis une API publique.

### `package.json` et `tsconfig.json`

Ce sont des fichiers de configuration standards pour un projet TypeScript. Le fichier `package.json` définit les dépendances et un script `build`, et `tsconfig.json` configure le compilateur TypeScript.

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

    La commande `link` crée un lien symbolique depuis le répertoire des extensions de Qwen Code vers votre répertoire de développement. Cela signifie que tous les changements que vous faites seront reflétés immédiatement sans avoir à réinstaller.

    ```bash
    qwen extensions link .
    ```

Maintenant, redémarrez votre session Qwen Code. Le nouvel outil `fetch_posts` sera disponible. Vous pouvez le tester en demandant : "fetch posts".

## Étape 4 : Ajouter une commande personnalisée

Les commandes personnalisées permettent de créer des raccourcis pour des prompts complexes. Ajoutons une commande qui recherche un motif dans votre code.

1. Créez un répertoire `commands` et un sous-répertoire pour votre groupe de commandes :

   ```bash
   mkdir -p commands/fs
   ```

2. Créez un fichier nommé `commands/fs/grep-code.toml` :

   ```toml
   prompt = """
   Veuillez résumer les résultats pour le motif `{{args}}`.

   Résultats de la recherche :
   !{grep -r {{args}} .}
   """
   ```

   Cette commande, `/fs:grep-code`, prendra un argument, exécutera la commande shell `grep` avec cet argument, et transmettra les résultats à un prompt pour les résumer.

Après avoir enregistré le fichier, redémarrez Qwen Code. Vous pouvez maintenant exécuter `/fs:grep-code "un motif"` pour utiliser votre nouvelle commande.

## Étape 5 : Ajouter un fichier `QWEN.md` personnalisé

Vous pouvez fournir un contexte persistant au modèle en ajoutant un fichier `QWEN.md` à votre extension. Cela est utile pour donner au modèle des instructions sur la façon de se comporter ou des informations sur les outils de votre extension. Notez que cela n'est pas toujours nécessaire pour les extensions conçues pour exposer des commandes et des prompts.

1. Créez un fichier nommé `QWEN.md` à la racine du répertoire de votre extension :

   ```markdown
   # Instructions de ma première extension

   Vous êtes un assistant développeur expert. Lorsque l'utilisateur vous demande de récupérer des posts, utilisez l'outil `fetch_posts`. Soyez concis dans vos réponses.
   ```

2. Mettez à jour votre fichier `qwen-extension.json` pour indiquer au CLI de charger ce fichier :

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

Redémarrez le CLI. Le modèle disposera désormais du contexte défini dans votre fichier `QWEN.md` dans chaque session où l'extension est active.

## Étape 6 : Publier votre extension

Une fois que vous êtes satisfait de votre extension, vous pouvez la partager avec d'autres développeurs. Les deux méthodes principales pour publier des extensions sont via un repository Git ou à travers les GitHub Releases. Utiliser un repository Git public est la méthode la plus simple.

Pour des instructions détaillées sur ces deux méthodes, veuillez consulter le [Guide de publication d'extensions](extension-releasing.md).

## Conclusion

Vous avez créé avec succès une extension Qwen Code ! Vous avez appris à :

- Initialiser une nouvelle extension depuis un template.
- Ajouter des outils personnalisés avec un serveur MCP.
- Créer des commandes personnalisées pratiques.
- Fournir un contexte persistant au modèle.
- Lier votre extension pour le développement local.

À partir de maintenant, vous pouvez explorer des fonctionnalités plus avancées et intégrer de nouvelles capacités puissantes dans Qwen Code.