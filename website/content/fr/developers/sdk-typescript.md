# SDK Typescript

## @qwen-code/sdk

Un SDK TypeScript minimal et expérimental pour accéder programmatiquement à Qwen Code.

N'hésitez pas à soumettre une demande de fonctionnalité/un ticket/une pull request.

## Installation

```bash
npm install @qwen-code/sdk
```

## Prérequis

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stable) installé et accessible dans le PATH

> **Remarque pour les utilisateurs de nvm** : Si vous utilisez nvm pour gérer les versions de Node.js, le SDK peut ne pas être en mesure de détecter automatiquement l'exécutable Qwen Code. Vous devez explicitement définir l'option `pathToQwenExecutable` avec le chemin complet vers le binaire `qwen`.

## Démarrage rapide

```typescript
import { query } from '@qwen-code/sdk';

// Requête à un seul tour
const result = query({
  prompt: 'Quels fichiers se trouvent dans le répertoire courant ?',
  options: {
    cwd: '/chemin/vers/le/projet',
  },
});

// Parcourir les messages
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistant :', message.message.content);
  } else if (message.type === 'result') {
    console.log('Résultat :', message.result);
  }
}
```

## Référence de l'API

### `query(config)`

Crée une nouvelle session de requête avec Qwen Code.

#### Paramètres

- `prompt` : `string | AsyncIterable<SDKUserMessage>` - Le prompt à envoyer. Utilisez une chaîne pour les requêtes à un seul tour ou un itérable asynchrone pour les conversations multi-tours.
- `options` : `QueryOptions` - Options de configuration pour la session de requête.

#### QueryOptions

| Option                   | Type                                           | Valeur par défaut | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`   | Le répertoire de travail pour la session de requête. Détermine le contexte dans lequel les opérations sur les fichiers et les commandes sont exécutées.                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | -                 | Le modèle d'IA à utiliser (par exemple, `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Prend le pas sur les variables d'environnement `OPENAI_MODEL` et `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | Détecté automatiquement | Chemin vers l'exécutable Qwen Code. Supporte plusieurs formats : `'qwen'` (binaire natif depuis PATH), `'/chemin/vers/qwen'` (chemin explicite), `'/chemin/vers/cli.js'` (bundle Node.js), `'node:/chemin/vers/cli.js'` (forcer l'exécution avec Node.js), `'bun:/chemin/vers/cli.js'` (forcer l'exécution avec Bun). Si non fourni, détecté automatiquement depuis : `QWEN_CODE_CLI_PATH` (variable d’environnement), `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`       | Mode de permission contrôlant l'approbation d'exécution des outils. Voir [Modes de permission](#permission-modes) pour plus de détails.                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                 | Gestionnaire de permission personnalisé pour l'approbation d'exécution des outils. Appelé lorsqu'un outil nécessite une confirmation. Doit répondre dans un délai de 60 secondes, faute de quoi la demande sera automatiquement refusée. Voir [Gestionnaire de permission personnalisé](#custom-permission-handler).                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                 | Variables d'environnement à transmettre au processus Qwen Code. Fusionné avec l'environnement du processus actuel.                                                                                                                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                 | Serveurs MCP (Model Context Protocol) auxquels se connecter. Supporte les serveurs externes (stdio/SSE/HTTP) ainsi que les serveurs intégrés via le SDK. Les serveurs externes sont configurés avec des options de transport telles que `command`, `args`, `url`, `httpUrl`, etc. Les serveurs du SDK utilisent `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                 | Contrôleur permettant d’annuler la session de requête. Appelez `abortController.abort()` pour terminer la session et libérer les ressources.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`           | Active le mode débogage pour une journalisation verbeuse du processus CLI.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (illimité)   | Nombre maximal de tours de conversation avant que la session ne se termine automatiquement. Un tour consiste en un message utilisateur suivi d'une réponse de l'assistant.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                 | Équivalent à `tool.core` dans settings.json. Si spécifié, seuls ces outils seront disponibles pour l'IA. Exemple : `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                   |
| `excludeTools`           | `string[]`                                     | -                 | Équivalent à `tool.exclude` dans settings.json. Les outils exclus renvoient immédiatement une erreur de permission. Prioritaire sur tous les autres paramètres de permission. Supporte les motifs : nom d'outil (`'write_file'`), classe d'outil (`'ShellTool'`), ou préfixe de commande shell (`'ShellTool(rm )'`).                                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | -                 | Équivalent à `tool.allowed` dans settings.json. Les outils correspondants contournent le rappel `canUseTool` et s'exécutent automatiquement. S'applique uniquement lorsque l'outil nécessite une confirmation. Supporte les mêmes motifs que `excludeTools`.                                                                                                                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`        | Type d'authentification pour le service IA. L'utilisation de `'qwen-oauth'` dans le SDK n'est pas recommandée car les identifiants sont stockés dans `~/.qwen` et peuvent nécessiter un rafraîchissement périodique.                                                                                                                                                                                                                                                                                                                          |
| `agents`                 | `SubagentConfig[]`                             | -                 | Configuration des sous-agents pouvant être invoqués pendant la session. Les sous-agents sont des agents IA spécialisés pour des tâches ou domaines spécifiques.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`           | Lorsque défini à `true`, le SDK émet des messages incomplets au fur et à mesure de leur génération, permettant un flux en temps réel de la réponse de l'IA.                                                                                                                                                                                                                                                                                                                                                        |

### Délais d'attente

Le SDK applique les délais d'attente par défaut suivants :

| Délai d'attente   | Valeur par défaut | Description                                                                                                                                           |
| ----------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`      | 1 minute          | Temps maximal pour que le rappel `canUseTool` réponde. Si ce délai est dépassé, la demande d'outil est automatiquement refusée.                        |
| `mcpRequest`      | 1 minute          | Temps maximal pour que les appels d'outils MCP du SDK se terminent.                                                                                    |
| `controlRequest`  | 1 minute          | Temps maximal pour que les opérations de contrôle telles que `initialize()`, `setModel()`, `setPermissionMode()` et `interrupt()` se terminent.         |
| `streamClose`     | 1 minute          | Temps maximal d'attente pour que l'initialisation se termine avant de fermer l'entrée standard du CLI en mode multi-tours avec les serveurs MCP du SDK. |

Vous pouvez personnaliser ces délais d'attente via l'option `timeout` :

```typescript
const query = qwen.query('Votre invite', {
  timeout: {
    canUseTool: 60000, // 60 secondes pour le rappel d'autorisation
    mcpRequest: 600000, // 10 minutes pour les appels d'outils MCP
    controlRequest: 60000, // 60 secondes pour les requêtes de contrôle
    streamClose: 15000, // 15 secondes pour l'attente de fermeture du flux
  },
});
```

### Types de messages

Le SDK fournit des gardes de type pour identifier les différents types de messages :

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
    // Gérer le message de l'assistant
  } else if (isSDKResultMessage(message)) {
    // Gérer le message de résultat
  }
}
```

### Méthodes de l'instance de requête

L'instance `Query` retournée par `query()` fournit plusieurs méthodes :

```typescript
const q = query({ prompt: 'Hello', options: {} });

// Obtenir l'ID de session
const sessionId = q.getSessionId();

// Vérifier si la session est fermée
const closed = q.isClosed();

// Interrompre l'opération en cours
await q.interrupt();

// Changer le mode de permission en cours de session
await q.setPermissionMode('yolo');

// Changer le modèle en cours de session
await q.setModel('qwen-max');

// Fermer la session
await q.close();
```

## Modes de permission

Le SDK prend en charge différents modes de permission pour contrôler l'exécution des outils :

- **`default`** : Les outils d'écriture sont refusés sauf approbation via le callback `canUseTool` ou dans `allowedTools`. Les outils en lecture seule s'exécutent sans confirmation.
- **`plan`** : Bloque tous les outils d'écriture, demandant à l'IA de présenter d'abord un plan.
- **`auto-edit`** : Approuve automatiquement les outils d'édition (edit, write_file) tandis que les autres outils nécessitent une confirmation.
- **`yolo`** : Tous les outils s'exécutent automatiquement sans confirmation.

### Chaîne de priorité des permissions

1. `excludeTools` - Bloque complètement les outils
2. `permissionMode: 'plan'` - Bloque les outils non en lecture seule
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
    message: { role: 'user', content: 'Créer un fichier hello.txt' },
    parent_tool_use_id: null,
  };

  // Attendre une condition ou une entrée utilisateur
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Maintenant, relire le fichier' },
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

### Gestionnaire de permissions personnalisé

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // Autoriser toutes les opérations de lecture
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Demander l'autorisation à l'utilisateur pour les opérations d'écriture (dans une vraie application)
  const userApproved = await promptUser(`Autoriser ${toolName} ?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'Utilisateur a refusé l\'opération' };
};

const result = query({
  prompt: 'Créer un nouveau fichier',
  options: {
    canUseTool,
  },
});
```

### Avec des serveurs MCP externes

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Utilise l’outil personnalisé depuis mon serveur MCP',
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

### Avec des serveurs MCP intégrés au SDK

Le SDK fournit `tool` et `createSdkMcpServer` pour créer des serveurs MCP qui s'exécutent dans le même processus que votre application SDK. Cela est utile lorsque vous souhaitez exposer des outils personnalisés à l'IA sans avoir à exécuter un processus serveur séparé.

#### `tool(name, description, inputSchema, handler)`

Crée une définition d'outil avec inférence de type de schéma Zod.

| Paramètre     | Type                               | Description                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | Nom de l'outil (1-64 caractères, commence par une lettre, alphanumérique et tirets bas) |
| `description` | `string`                           | Description lisible par l'homme de ce que fait l'outil                    |
| `inputSchema` | `ZodRawShape`                      | Objet schéma Zod définissant les paramètres d'entrée de l'outil          |
| `handler`     | `(args, extra) => Promise<Result>` | Fonction asynchrone qui exécute l'outil et retourne des blocs de contenu MCP |

Le gestionnaire doit retourner un objet `CallToolResult` avec la structure suivante :

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

Crée une instance de serveur MCP intégrant le SDK.

| Option    | Type                     | Défaut    | Description                          |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | Requis    | Nom unique pour le serveur MCP       |
| `version` | `string`                 | `'1.0.0'` | Version du serveur                   |
| `tools`   | `SdkMcpToolDefinition[]` | -         | Tableau d'outils créés avec `tool()` |

Retourne un objet `McpSdkServerConfigWithInstance` qui peut être passé directement à l'option `mcpServers`.

#### Exemple

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Définir un outil avec un schéma Zod
const calculatorTool = tool(
  'calculate_sum',
  'Additionner deux nombres',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Créer le serveur MCP
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Utiliser le serveur dans une requête
const result = query({
  prompt: 'Quelle est la somme de 42 + 17 ?',
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

### Interrompre une requête

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: 'Tâche longue en cours...',
  options: {
    abortController,
  },
});

// Interrompt après 5 secondes
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('La requête a été interrompue');
  } else {
    throw error;
  }
}
```

## Gestion des erreurs

Le SDK fournit une classe `AbortError` pour gérer les requêtes interrompues :

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... opérations de requête
} catch (error) {
  if (isAbortError(error)) {
    // Gérer l'interruption
  } else {
    // Gérer les autres erreurs
  }
}
```