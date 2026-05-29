---
description: "Utilisez le SDK TypeScript Qwen Code pour créer des intégrations de coding IA avec installation, authentification, types et exemples Web ou Node.js."
---

# SDK TypeScript

## @qwen-code/sdk

Un SDK TypeScript expérimental minimal pour un accès programmatique à Qwen Code.

N'hésitez pas à soumettre une demande de fonctionnalité, un ticket ou une PR.

## Installation

```bash
npm install @qwen-code/sdk
```

## Prérequis

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stable) installé et accessible dans le PATH

> **Note pour les utilisateurs de nvm** : Si vous utilisez nvm pour gérer les versions de Node.js, le SDK peut ne pas être en mesure de détecter automatiquement l'exécutable Qwen Code. Vous devez définir explicitement l'option `pathToQwenExecutable` avec le chemin complet du binaire `qwen`.

## Démarrage rapide

```typescript
import { query } from '@qwen-code/sdk';

// Single-turn query
const result = query({
  prompt: 'What files are in the current directory?',
  options: {
    cwd: '/path/to/project',
  },
});

// Iterate over messages
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Result:', message.result);
  }
}
```

## Référence de l'API

### `query(config)`

Crée une nouvelle session de requête avec Qwen Code.

#### Paramètres

- `prompt` : `string | AsyncIterable<SDKUserMessage>` - Le prompt à envoyer. Utilisez une chaîne de caractères pour les requêtes à tour unique ou un itérable asynchrone pour les conversations multi-tours.
- `options` : `QueryOptions` - Options de configuration pour la session de requête.

#### QueryOptions

| Option                   | Type                                           | Valeur par défaut | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | Le répertoire de travail pour la session de requête. Détermine le contexte dans lequel les opérations sur les fichiers et les commandes sont exécutées.                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | -                | Le modèle d'IA à utiliser (par ex. `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Prend le pas sur les variables d'environnement `OPENAI_MODEL` et `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | Détection automatique    | Chemin vers l'exécutable Qwen Code. Prend en charge plusieurs formats : `'qwen'` (binaire natif du PATH), `'/path/to/qwen'` (chemin explicite), `'/path/to/cli.js'` (bundle Node.js), `'node:/path/to/cli.js'` (force le runtime Node.js), `'bun:/path/to/cli.js'` (force le runtime Bun). S'il n'est pas fourni, la détection automatique s'effectue via : variable d'env `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Mode de permission contrôlant l'approbation de l'exécution des outils. Voir [Modes de permission](#permission-modes) pour plus de détails.                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | Gestionnaire de permission personnalisé pour l'approbation de l'exécution des outils. Invoqué lorsqu'un outil nécessite une confirmation. Doit répondre dans les 60 secondes, sinon la requête sera automatiquement refusée. Voir [Gestionnaire de permission personnalisé](#custom-permission-handler).                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | Variables d'environnement à transmettre au processus Qwen Code. Fusionnées avec l'environnement du processus actuel.                                                                                                                                                                                                                                                                                                                                                                                  |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | Configuration du prompt système pour la session principale. Utilisez une chaîne pour remplacer entièrement le prompt système intégré de Qwen Code, ou un objet preset pour conserver le prompt intégré et y ajouter des instructions supplémentaires.                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | Serveurs MCP (Model Context Protocol) à connecter. Prend en charge les serveurs externes (stdio/SSE/HTTP) et les serveurs intégrés au SDK. Les serveurs externes sont configurés avec des options de transport comme `command`, `args`, `url`, `httpUrl`, etc. Les serveurs SDK utilisent `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | Contrôleur pour annuler la session de requête. Appelez `abortController.abort()` pour terminer la session et libérer les ressources.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | Active le mode debug pour une journalisation détaillée du processus CLI.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (illimité) | Nombre maximum de tours de conversation avant la terminaison automatique de la session. Un tour consiste en un message utilisateur et une réponse de l'assistant.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | Équivalent à `tool.core` dans `settings.json`. Si spécifié, seuls ces outils seront disponibles pour l'IA. Exemple : `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                   |
| `excludeTools`           | `string[]`                                     | -                | Équivalent à `tool.exclude` dans `settings.json`. Les outils exclus renvoient immédiatement une erreur de permission. Prend la priorité la plus haute sur tous les autres paramètres de permission. Prend en charge le pattern matching : nom de l'outil (`'write_file'`), classe d'outil (`'ShellTool'`) ou préfixe de commande shell (`'ShellTool(rm )'`).                                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | -                | Équivalent à `tool.allowed` dans `settings.json`. Les outils correspondants bypassent le callback `canUseTool` et s'exécutent automatiquement. S'applique uniquement lorsqu'un outil nécessite une confirmation. Prend en charge le même pattern matching que `excludeTools`.                                                                                                                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Type d'authentification pour le service d'IA. L'utilisation de `'qwen-oauth'` dans le SDK n'est pas recommandée car les identifiants sont stockés dans `~/.qwen` et peuvent nécessiter un rafraîchissement périodique.                                                                                                                                                                                                                                                                                                                          |
| `agents`                 | `SubagentConfig[]`                             | -                | Configuration des sous-agents pouvant être invoqués pendant la session. Les sous-agents sont des agents IA spécialisés pour des tâches ou des domaines spécifiques.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | Lorsqu'il est défini sur `true`, le SDK émet les messages incomplets au fur et à mesure de leur génération, permettant un streaming en temps réel de la réponse de l'IA.                                                                                                                                                                                                                                                                                                                                                        |

### Timeouts

Le SDK applique les délais d'expiration par défaut suivants :

| Timeout          | Valeur par défaut  | Description                                                                                                                                       |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 minute | Temps maximum pour que le callback `canUseTool` réponde. Si dépassé, la requête d'outil est automatiquement refusée.                                                  |
| `mcpRequest`     | 1 minute | Temps maximum pour que les appels d'outils MCP du SDK se terminent.                                                                                                  |
| `controlRequest` | 1 minute | Temps maximum pour que les opérations de contrôle comme `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()` et `interrupt()` se terminent. |
| `streamClose`    | 1 minute | Temps maximum d'attente pour la fin de l'initialisation avant de fermer le stdin du CLI en mode multi-tours avec des serveurs MCP SDK.                             |

Vous pouvez personnaliser ces délais via l'option `timeout` :

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 60 seconds for permission callback
    mcpRequest: 600000, // 10 minutes for MCP tool calls
    controlRequest: 60000, // 60 seconds for control requests
    streamClose: 15000, // 15 seconds for stream close wait
  },
});
```

### Types de messages

Le SDK fournit des type guards pour identifier les différents types de messages :

```typescript
import {
  isSDKUserMessage,
  isSDKAssistantMessage,
  isSDKSystemMessage,
  isSDKResultMessage,
  isSDKPartialAssistantMessage,
} from '@qwen-code/sdk';

for await (const message of result) {
  if (isSDKAssistantMessage(message)) {
    // Handle assistant message
  } else if (isSDKResultMessage(message)) {
    // Handle result message
  }
}
```

### Méthodes d'instance Query

L'instance `Query` retournée par `query()` fournit plusieurs méthodes :

```typescript
const q = query({ prompt: 'Hello', options: {} });

// Get session ID
const sessionId = q.getSessionId();

// Check if closed
const closed = q.isClosed();

// Interrupt the current operation
await q.interrupt();

// Change permission mode mid-session
await q.setPermissionMode('yolo');

// Change model mid-session
await q.setModel('qwen-max');

// Get context window usage breakdown (token counts per category)
const usage = await q.getContextUsage();
// Pass true to hint that per-item details should be displayed
const detail = await q.getContextUsage(true);

// Close the session
await q.close();
```

## Modes de permission

Le SDK prend en charge différents modes de permission pour contrôler l'exécution des outils :

- **`default`** : Les outils d'écriture sont refusés sauf s'ils sont approuvés via le callback `canUseTool` ou dans `allowedTools`. Les outils en lecture seule s'exécutent sans confirmation.
- **`plan`** : Bloque tous les outils d'écriture, en demandant à l'IA de présenter d'abord un plan.
- **`auto-edit`** : Approuve automatiquement les outils d'édition (`edit`, `write_file`) tandis que les autres outils nécessitent une confirmation.
- **`yolo`** : Tous les outils s'exécutent automatiquement sans confirmation.

### Chaîne de priorité des permissions

1. `excludeTools` - Bloque complètement les outils
2. `permissionMode: 'plan'` - Bloque les outils non lecture seule
3. `permissionMode: 'yolo'` - Approuve automatiquement tous les outils
4. `allowedTools` - Approuve automatiquement les outils correspondants
5. Callback `canUseTool` - Logique d'approbation personnalisée
6. Comportement par défaut - Refus automatique en mode SDK

## Exemples

### Conversation multi-tours

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Create a hello.txt file' },
    parent_tool_use_id: null,
  };

  // Wait for some condition or user input
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Now read the file back' },
    parent_tool_use_id: null,
  };
}

const result = query({
  prompt: generateMessages(),
  options: {
    permissionMode: 'auto-edit',
  },
});

for await (const message of result) {
  console.log(message);
}
```

### Gestionnaire de permission personnalisé

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // Allow all read operations
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Prompt user for write operations (in a real app)
  const userApproved = await promptUser(`Allow ${toolName}?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'User denied the operation' };
};

const result = query({
  prompt: 'Create a new file',
  options: {
    canUseTool,
  },
});
```

### Avec des serveurs MCP externes

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Use the custom tool from my MCP server',
  options: {
    mcpServers: {
      'my-server': {
        command: 'node',
        args: ['path/to/mcp-server.js'],
        env: { PORT: '3000' },
      },
    },
  },
});
```

### Remplacer le prompt système

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Say hello in one sentence.',
  options: {
    systemPrompt: 'You are a terse assistant. Answer in exactly one sentence.',
  },
});
```

### Ajouter au prompt système intégré

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Review the current directory.',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: 'Be terse and focus on concrete findings.',
    },
  },
});
```

### Avec des serveurs MCP intégrés au SDK

Le SDK fournit `tool` et `createSdkMcpServer` pour créer des serveurs MCP qui s'exécutent dans le même processus que votre application SDK. Cela est utile lorsque vous souhaitez exposer des outils personnalisés à l'IA sans lancer un processus serveur distinct.

#### `tool(name, description, inputSchema, handler)`

Crée une définition d'outil avec inférence de type via le schéma Zod.

| Paramètre     | Type                               | Description                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | Nom de l'outil (1 à 64 caractères, commence par une lettre, alphanumérique et underscores) |
| `description` | `string`                           | Description lisible par un humain de ce que fait l'outil                         |
| `inputSchema` | `ZodRawShape`                      | Objet de schéma Zod définissant les paramètres d'entrée de l'outil                   |
| `handler`     | `(args, extra) => Promise<Result>` | Fonction asynchrone qui exécute l'outil et retourne des blocs de contenu MCP     |

Le handler doit retourner un objet `CallToolResult` avec la structure suivante :

```typescript
{
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'resource'; uri: string; mimeType?: string; text?: string }
  >;
  isError?: boolean;
}
```

#### `createSdkMcpServer(options)`

Crée une instance de serveur MCP intégrée au SDK.

| Option    | Type                     | Valeur par défaut   | Description                          |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | Requis  | Nom unique pour le serveur MCP       |
| `version` | `string`                 | `'1.0.0'` | Version du serveur                       |
| `tools`   | `SdkMcpToolDefinition[]` | -         | Tableau d'outils créés avec `tool()` |

Retourne un objet `McpSdkServerConfigWithInstance` qui peut être passé directement à l'option `mcpServers`.

#### Exemple

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Define a tool with Zod schema
const calculatorTool = tool(
  'calculate_sum',
  'Add two numbers',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Create the MCP server
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Use the server in a query
const result = query({
  prompt: 'What is 42 + 17?',
  options: {
    permissionMode: 'yolo',
    mcpServers: {
      calculator: server,
    },
  },
});

for await (const message of result) {
  console.log(message);
}
```

### Annuler une requête

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: 'Long running task...',
  options: {
    abortController,
  },
});

// Abort after 5 seconds
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('Query was aborted');
  } else {
    throw error;
  }
}
```

## Gestion des erreurs

Le SDK fournit une classe `AbortError` pour gérer les requêtes annulées :

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... query operations
} catch (error) {
  if (isAbortError(error)) {
    // Handle abort
  } else {
    // Handle other errors
  }
}
```