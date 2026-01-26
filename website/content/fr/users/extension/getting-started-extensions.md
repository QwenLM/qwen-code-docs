# Démarrer avec les extensions Qwen Code

Ce guide vous accompagne dans la création de votre première extension Qwen Code. Vous apprendrez comment configurer une nouvelle extension, ajouter un outil personnalisé via un serveur MCP, créer une commande personnalisée et fournir du contexte au modèle à l'aide d'un fichier `QWEN.md`.

## Prérequis

Avant de commencer, assurez-vous d'avoir installé Qwen Code et d'avoir une connaissance de base de Node.js et de TypeScript.

## Étape 1 : Créer une nouvelle extension

La manière la plus simple de commencer est d'utiliser l'un des modèles intégrés. Nous utiliserons l'exemple `mcp-server` comme base.

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
- `mcpServers` : Cette section définit un ou plusieurs serveurs Model Context Protocol (MCP). Les serveurs MCP sont la manière d'ajouter de nouveaux outils que le modèle pourra utiliser.
  - `command`, `args`, `cwd` : Ces champs spécifient comment démarrer votre serveur. Notez l'utilisation de la variable `${extensionPath}`, que Qwen Code remplace par le chemin absolu vers le répertoire d'installation de votre extension. Cela permet à votre extension de fonctionner quel que soit l'emplacement où elle est installée.

### `example.ts`

Ce fichier contient le code source de votre serveur MCP. C'est un serveur Node.js simple qui utilise le kit `@modelcontextprotocol/sdk`.

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

// Enregistre un nouvel outil nommé 'fetch_posts'
server.registerTool(
  'fetch_posts',
  {
    description: 'Récupère une liste de publications à partir d\'une API publique.',
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

// ... (l'enregistrement des invites est omis par souci de concision)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Ce serveur définit un seul outil appelé `fetch_posts` qui récupère des données à partir d'une API publique.

### `package.json` et `tsconfig.json`

Ce sont des fichiers de configuration standards pour un projet TypeScript. Le fichier `package.json` définit les dépendances et un script `build`, tandis que `tsconfig.json` configure le compilateur TypeScript.

## Étape 3 : Construire et lier votre extension

Avant de pouvoir utiliser l'extension, vous devez compiler le code TypeScript et lier l'extension à votre installation Qwen Code pour le développement local.

1.  **Installer les dépendances :**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Construire le serveur :**

    ```bash
    npm run build
    ```

    Cela compilera `example.ts` en `dist/example.js`, qui est le fichier référencé dans votre `qwen-extension.json`.

3.  **Lier l'extension :**

    La commande `link` crée un lien symbolique depuis le répertoire des extensions Qwen Code vers votre répertoire de développement. Cela signifie que tous les changements que vous apporterez seront immédiatement pris en compte sans avoir besoin de réinstaller.

    ```bash
    qwen extensions link .
    ```

Maintenant, redémarrez votre session Qwen Code. Le nouvel outil `fetch_posts` sera disponible. Vous pouvez le tester en demandant : "fetch posts".

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

    Veuillez résumer les résultats pour le motif `{{args}}`.

    Résultats de la recherche :
    !{grep -r {{args}} .}
    ```

    Cette commande, `/fs:grep-code`, prendra un argument, exécutera la commande shell `grep` avec cet argument, et transmettra les résultats dans une invite pour résumé.

> **Remarque :** Les commandes utilisent le format Markdown avec un bloc YAML facultatif en en-tête. Le format TOML est obsolète mais toujours pris en charge pour des raisons de compatibilité ascendante.

Après avoir sauvegardé le fichier, redémarrez Qwen Code. Vous pouvez maintenant exécuter `/fs:grep-code "some pattern"` pour utiliser votre nouvelle commande.

## Étape 5 : Ajouter des compétences et sous-agents personnalisés (facultatif)

Les extensions peuvent également fournir des compétences et sous-agents personnalisés pour étendre les capacités de Qwen Code.

### Ajout d'une compétence personnalisée

Les compétences sont des fonctionnalités invoquées par le modèle que l'IA peut utiliser automatiquement lorsque c'est pertinent.

1.  Créez un répertoire `skills` avec un sous-répertoire pour la compétence :

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  Créez un fichier `skills/code-analyzer/SKILL.md` :

    ```markdown
    ---
    name: code-analyzer
    description: Analyse la structure du code et fournit des informations sur la complexité, les dépendances et les améliorations potentielles
    ---

    # Analyseur de code

    ## Instructions

    Lors de l'analyse du code, concentrez-vous sur :

    - La complexité et la maintenabilité du code
    - Les dépendances et le couplage
    - Les problèmes de performances potentiels
    - Les suggestions d'améliorations

    ## Exemples

    - "Analyse la complexité de cette fonction"
    - "Quelles sont les dépendances de ce module ?"
    ```

### Ajouter un sous-agent personnalisé

Les sous-agents sont des assistants IA spécialisés pour des tâches spécifiques.

1.  Créez un répertoire `agents` :

    ```bash
    mkdir -p agents
    ```

2.  Créez un fichier `agents/refactoring-expert.md` :

    ```markdown
    ---
    name: refactoring-expert
    description: Spécialisé dans le remaniement du code, amélioration de la structure et de la maintenabilité du code
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    Vous êtes un spécialiste du remaniement axé sur l'amélioration de la qualité du code.

    Votre expertise inclut :

    - Identification des odeurs de code et des anti-patrons
    - Application des principes SOLID
    - Amélioration de la lisibilité et de la maintenabilité du code
    - Remaniement sécurisé avec un risque minimal

    Pour chaque tâche de remaniement :

    1. Analysez la structure actuelle du code
    2. Identifiez les domaines d'amélioration
    3. Proposez des étapes de remaniement
    4. Mettez en œuvre les changements de manière incrémentielle
    5. Vérifiez que la fonctionnalité est préservée
    ```

Après avoir redémarré Qwen Code, vos compétences personnalisées seront disponibles via `/skills` et les sous-agents via `/agents manage`.

## Étape 6 : Ajouter un fichier `QWEN.md` personnalisé

Vous pouvez fournir un contexte persistant au modèle en ajoutant un fichier `QWEN.md` à votre extension. Ceci est utile pour donner au modèle des instructions sur la façon de se comporter ou des informations sur les outils de votre extension. Notez que vous n'avez pas toujours besoin de cela pour les extensions conçues pour exposer des commandes et des invites.

1.  Créez un fichier nommé `QWEN.md` à la racine de votre répertoire d'extension :

    ```markdown
    # Instructions pour ma première extension

    Vous êtes un assistant développeur expert. Lorsque l'utilisateur vous demande de récupérer des articles, utilisez l'outil `fetch_posts`. Soyez concis dans vos réponses.
    ```

2.  Mettez à jour votre fichier `qwen-extension.json` pour indiquer au CLI de charger ce fichier :

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

Redémarrez à nouveau le CLI. Le modèle aura désormais le contexte de votre fichier `QWEN.md` dans chaque session où l'extension est active.

## Étape 7 : Publier votre extension

Une fois que vous êtes satisfait de votre extension, vous pouvez la partager avec d'autres personnes. Les deux méthodes principales pour publier des extensions sont via un dépôt Git ou par le biais des GitHub Releases. L'utilisation d'un dépôt Git public est la méthode la plus simple.

Pour des instructions détaillées sur ces deux méthodes, veuillez consulter le [Guide de publication des extensions](extension-releasing.md).

## Conclusion

Vous avez créé avec succès une extension Qwen Code ! Vous avez appris comment :

- Démarrer une nouvelle extension à partir d'un modèle.
- Ajouter des outils personnalisés avec un serveur MCP.
- Créer des commandes personnalisées pratiques.
- Ajouter des compétences et sous-agents personnalisés.
- Fournir un contexte persistant au modèle.
- Lier votre extension pour le développement local.

À partir de là, vous pouvez explorer davantage de fonctionnalités avancées et intégrer de puissantes nouvelles capacités dans Qwen Code.