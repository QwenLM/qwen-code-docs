# Premiers pas avec les extensions Qwen Code

Ce guide vous accompagne dans la création de votre première extension Qwen Code. Vous apprendrez à configurer une nouvelle extension, ajouter un outil personnalisé via un serveur MCP, créer une commande personnalisée et fournir du contexte au modèle avec un fichier `QWEN.md`.

## Prérequis

Avant de commencer, assurez-vous d'avoir Qwen Code installé et une connaissance de base de Node.js et TypeScript.

## Étape 1 : Créer une nouvelle extension

Le moyen le plus simple de démarrer est d'utiliser l'un des modèles intégrés. Nous utiliserons l'exemple `mcp-server` comme base.

Exécutez la commande suivante pour créer un nouveau répertoire nommé `my-first-extension` avec les fichiers du modèle :

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
- `mcpServers` : Cette section définit un ou plusieurs serveurs MCP (Model Context Protocol). Les serveurs MCP permettent d'ajouter de nouveaux outils que le modèle peut utiliser.
  - `command`, `args`, `cwd` : Ces champs spécifient comment démarrer votre serveur. Notez l'utilisation de la variable `${extensionPath}`, que Qwen Code remplace par le chemin absolu du répertoire d'installation de votre extension. Cela permet à votre extension de fonctionner quel que soit son emplacement d'installation.

### `example.ts`

Ce fichier contient le code source de votre serveur MCP. C'est un serveur Node.js simple utilisant le SDK `@modelcontextprotocol/sdk`.

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

// ... (enregistrement de prompt omis pour des raisons de concision)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Ce serveur définit un outil unique appelé `fetch_posts` qui récupère des données depuis une API publique.

### `package.json` et `tsconfig.json`

Ce sont des fichiers de configuration standards pour un projet TypeScript. Le fichier `package.json` définit les dépendances et un script `build`, tandis que `tsconfig.json` configure le compilateur TypeScript.

## Étape 3 : Compiler et lier votre extension

Avant de pouvoir utiliser l'extension, vous devez compiler le code TypeScript et lier l'extension à votre installation Qwen Code pour le développement local.

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

    La commande `link` crée un lien symbolique depuis le répertoire des extensions Qwen Code vers votre répertoire de développement. Ainsi, toute modification sera immédiatement répercutée sans avoir à réinstaller.

    ```bash
    qwen extensions link .
    ```

Maintenant, redémarrez votre session Qwen Code. Le nouvel outil `fetch_posts` sera disponible. Vous pouvez le tester en demandant : « fetch posts ».

## Étape 4 : Ajouter une commande personnalisée

Les commandes personnalisées permettent de créer des raccourcis pour des prompts complexes. Ajoutons une commande qui recherche un motif dans votre code.

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

    Cette commande, `/fs:grep-code`, prendra un argument, exécutera la commande shell `grep` avec celui-ci et redirigera les résultats dans un prompt pour résumé.

> [!note]
> Les commandes utilisent le format Markdown avec un frontmatter YAML optionnel. Le format TOML est déprécié mais toujours pris en charge pour la rétrocompatibilité.

Après avoir enregistré le fichier, redémarrez Qwen Code. Vous pouvez maintenant exécuter `/fs:grep-code "un motif"` pour utiliser votre nouvelle commande.

## Étape 5 : Ajouter des compétences et sous-agents personnalisés (optionnel)

Les extensions peuvent également fournir des compétences et sous-agents personnalisés pour étendre les capacités de Qwen Code.

### Ajouter une compétence personnalisée

Les compétences sont des capacités invoquées par le modèle que l'IA peut utiliser automatiquement lorsque cela est pertinent.

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
    - Les problèmes de performance potentiels
    - Les suggestions d'amélioration

    ## Exemples

    - « Analyse la complexité de cette fonction »
    - « Quelles sont les dépendances de ce module ? »
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
    description: Spécialisé dans le refactoring de code, l'amélioration de la structure et de la maintenabilité
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    Vous êtes un spécialiste du refactoring axé sur l'amélioration de la qualité du code.

    Votre expertise comprend :

    - L'identification des odeurs de code et des anti-patrons
    - L'application des principes SOLID
    - L'amélioration de la lisibilité et de la maintenabilité du code
    - Le refactoring sécurisé avec un risque minimal

    Pour chaque tâche de refactoring :

    1. Analysez la structure actuelle du code
    2. Identifiez les zones à améliorer
    3. Proposez des étapes de refactoring
    4. Implémentez les changements de manière incrémentale
    5. Vérifiez que la fonctionnalité est préservée
    ```

Après avoir redémarré Qwen Code, vos compétences personnalisées seront disponibles via `/skills` et les sous-agents via `/agents manage`.

## Étape 6 : Ajouter un fichier `QWEN.md` personnalisé

Vous pouvez fournir un contexte persistant au modèle en ajoutant un fichier `QWEN.md` à votre extension. Cela est utile pour donner des instructions au modèle sur son comportement ou des informations sur les outils de votre extension. Notez que vous n'en aurez pas toujours besoin pour les extensions qui exposent des commandes et des prompts.

1.  Créez un fichier nommé `QWEN.md` à la racine de votre répertoire d'extension :

    ```markdown
    # Instructions pour ma première extension

    Vous êtes un assistant développeur expert. Lorsque l'utilisateur vous demande de récupérer des publications, utilisez l'outil `fetch_posts`. Soyez concis dans vos réponses.
    ```

2.  Mettez à jour votre `qwen-extension.json` pour indiquer au CLI de charger ce fichier :

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

Une fois satisfait de votre extension, vous pouvez la partager avec d'autres. Les deux principales façons de publier des extensions sont via un dépôt Git ou via les GitHub Releases. L'utilisation d'un dépôt Git public est la méthode la plus simple.

Pour des instructions détaillées sur les deux méthodes, veuillez consulter le [Guide de publication des extensions](extension-releasing.md).

## Conclusion

Vous avez réussi à créer une extension Qwen Code ! Vous avez appris à :

- Initialiser une nouvelle extension à partir d'un modèle.
- Ajouter des outils personnalisés avec un serveur MCP.
- Créer des commandes personnalisées pratiques.
- Ajouter des compétences et sous-agents personnalisés.
- Fournir un contexte persistant au modèle.
- Lier votre extension pour le développement local.

À partir de là, vous pouvez explorer des fonctionnalités plus avancées et construire de nouvelles capacités puissantes dans Qwen Code.