# SDK TypeScript

## @qwen-code/sdk

Un SDK TypeScript expérimental minimal pour un accès programmatique à Qwen Code.

N'hésitez pas à soumettre une demande de fonctionnalité, un problème ou une PR.

## Installation

```bash
npm install @qwen-code/sdk
```

## Prérequis

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stable) installé et accessible dans le PATH

> **Note pour les utilisateurs de nvm** : Si vous utilisez nvm pour gérer les versions de Node.js, le SDK peut ne pas être en mesure de détecter automatiquement l'exécutable Qwen Code. Vous devez explicitement définir l'option `pathToQwenExecutable` avec le chemin complet du binaire `qwen`.

## Démarrage rapide

```typescript
import { query } from '@qwen-code/sdk';

// Requête à un seul tour
const result = query({
  prompt: 'Quels fichiers se trouvent dans le répertoire actuel ?',
  options: {
    cwd: '/chemin/vers/projet',
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

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - Le prompt à envoyer. Utilisez une chaîne pour des requêtes à un seul tour ou un itérateur asynchrone pour des conversations multi-tours.
- `options`: `QueryOptions` - Options de configuration pour la session de requête.

#### QueryOptions

| Option                   | Type                                           | Défaut            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`   | Le répertoire de travail pour la session de requête. Détermine le contexte dans lequel les opérations sur les fichiers et les commandes sont exécutées.                                                                                                                                                                                                                                                                                                                                                       |
| `model`                  | `string`                                       | -                 | Le modèle IA à utiliser (ex. `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Prédomine sur les variables d'environnement `OPENAI_MODEL` et `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                                         |
| `pathToQwenExecutable`   | `string`                                       | Détection auto    | Chemin vers l'exécutable Qwen Code. Prend en charge plusieurs formats : `'qwen'` (binaire natif depuis le PATH), `'/chemin/vers/qwen'` (chemin explicite), `'/chemin/vers/cli.js'` (bundle Node.js), `'node:/chemin/vers/cli.js'` (forcer l'exécution Node.js), `'bun:/chemin/vers/cli.js'` (forcer l'exécution Bun). S'il n'est pas fourni, détection automatique depuis : la variable d'environnement `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`       | Mode de permission contrôlant l'approbation d'exécution des outils. Voir [Modes de permission](#modes-de-permission) pour plus de détails.                                                                                                                                                                                                                                                                                                                                                                   |
| `canUseTool`             | `CanUseTool`                                   | -                 | Gestionnaire de permission personnalisé pour l'approbation d'exécution des outils. Invoqué lorsqu'un outil nécessite une confirmation. Doit répondre dans les 60 secondes, sinon la demande est automatiquement refusée. Voir [Gestionnaire de permission personnalisé](#gestionnaire-de-permission-personnalisé).                                                                                                                                                                                             |
| `env`                    | `Record<string, string>`                       | -                 | Variables d'environnement à transmettre au processus Qwen Code. Fusionnées avec l'environnement du processus actuel.                                                                                                                                                                                                                                                                                                                                                                                          |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                 | Configuration du prompt système pour la session principale. Utilisez une chaîne pour remplacer complètement le prompt système intégré de Qwen Code, ou un objet preset pour conserver le prompt intégré et ajouter des instructions supplémentaires.                                                                                                                                                                                                                                                          |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                 | Serveurs MCP (Model Context Protocol) à connecter. Prend en charge les serveurs externes (stdio/SSE/HTTP) et les serveurs intégrés au SDK. Les serveurs externes sont configurés avec des options de transport comme `command`, `args`, `url`, `httpUrl`, etc. Les serveurs SDK utilisent `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                    |
| `abortController`        | `AbortController`                              | -                 | Contrôleur pour annuler la session de requête. Appelez `abortController.abort()` pour terminer la session et libérer les ressources.                                                                                                                                                                                                                                                                                                                                                                          |
| `debug`                  | `boolean`                                      | `false`           | Active le mode débogage pour une journalisation détaillée du processus CLI.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `maxSessionTurns`        | `number`                                       | `-1` (illimité)   | Nombre maximum de tours de conversation avant que la session ne se termine automatiquement. Un tour consiste en un message utilisateur et une réponse de l'assistant.                                                                                                                                                                                                                                                                                                                                          |
| `coreTools`              | `string[]`                                     | -                 | Utilise l'ancienne sémantique `coreTools` / liste d'autorisation CLI `--core-tools`. Si spécifié, seuls les outils de base correspondants sont enregistrés pour la session. Ceci est distinct de `permissions.allow`, qui approuve automatiquement les appels d'outils correspondants mais ne restreint pas l'enregistrement des outils. Exemple : `['read_file', 'edit', 'run_shell_command']`.                                                                                                               |
| `excludeTools`           | `string[]`                                     | -                 | Équivalent à `permissions.deny` dans settings.json. Les outils exclus retournent immédiatement une erreur de permission. Priorité la plus élevée sur tous les autres paramètres de permission. Prend en charge les alias de noms d'outils et la correspondance de motifs : nom d'outil (`'write_file'`), préfixe de commande shell (`'Bash(rm *)'`), ou motifs de chemin (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                 |
| `allowedTools`           | `string[]`                                     | -                 | Équivalent à `permissions.allow` dans settings.json. Les outils correspondants contournent le callback `canUseTool` et s'exécutent automatiquement. S'applique uniquement lorsque l'outil nécessite une confirmation. Prend en charge la même correspondance de motifs que `excludeTools`. Exemple : `['Bash(git status)', 'Bash(npm test)']`.                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`        | Type d'authentification pour le service IA. Le niveau gratuit Qwen OAuth a été interrompu le 15/04/2026 ; les nouvelles configurations SDK doivent utiliser une authentification compatible OpenAI ou un autre fournisseur pris en charge.                                                                                                                                                                                                                                                                    |
| `agents`                 | `SubagentConfig[]`                             | -                 | Configuration des sous-agents pouvant être invoqués pendant la session. Les sous-agents sont des IA spécialisées pour des tâches ou domaines spécifiques.                                                                                                                                                                                                                                                                                                                                                      |
| `includePartialMessages` | `boolean`                                      | `false`           | Lorsque `true`, le SDK émet les messages incomplets au fur et à mesure qu'ils sont générés, permettant un streaming en temps réel de la réponse de l'IA.                                                                                                                                                                                                                                                                                                                                                       |
| `resume`                 | `string`                                       | -                 | Reprendre une session précédente en fournissant son ID de session. Équivalent au drapeau `--resume` du CLI.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `sessionId`              | `string`                                       | -                 | Spécifie un ID de session pour la nouvelle session. Garantit que le SDK et le CLI utilisent le même ID sans reprendre l'historique. Équivalent au drapeau `--session-id` du CLI.                                                                                                                                                                                                                                                                                                                               |

> [!note]
> Pour `coreTools`, les alias comme `Read`, `Edit` et `Bash` fonctionnent également, mais les spécificateurs d'invocation tels que `Bash(git *)` sont supprimés. `coreTools` restreint l'enregistrement des outils, pas les motifs d'invocation.

### Timeouts

Le SDK applique les timeouts par défaut suivants :

| Timeout          | Défaut  | Description                                                                                                                                                     |
| ---------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 min   | Durée maximale pour la réponse du callback `canUseTool`. Si dépassée, la demande d'outil est automatiquement refusée.                                           |
| `mcpRequest`     | 1 min   | Durée maximale pour la complétion des appels d'outils MCP du SDK.                                                                                               |
| `controlRequest` | 1 min   | Durée maximale pour les opérations de contrôle comme `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()`, et `interrupt()`.                |
| `streamClose`    | 1 min   | Durée maximale d'attente pour la fin de l'initialisation avant de fermer l'entrée standard du CLI en mode multi-tours avec serveurs MCP du SDK.                |

Vous pouvez personnaliser ces timeouts via l'option `timeout` :

```typescript
const query = qwen.query('Votre prompt', {
  timeout: {
    canUseTool: 60000, // 60 secondes pour le callback de permission
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
    // Gérer un message de l'assistant
  } else if (isSDKResultMessage(message)) {
    // Gérer un message de résultat
  }
}
```

### Méthodes de l'instance Query

L'instance `Query` retournée par `query()` propose plusieurs méthodes :

```typescript
const q = query({ prompt: 'Bonjour', options: {} });

// Obtenir l'ID de session
const sessionId = q.getSessionId();

// Vérifier si fermée
const closed = q.isClosed();

// Interrompre l'opération en cours
await q.interrupt();

// Changer le mode de permission en cours de session
await q.setPermissionMode('yolo');

// Changer le modèle en cours de session
await q.setModel('qwen-max');

// Obtenir la répartition de l'utilisation de la fenêtre de contexte (nombre de tokens par catégorie)
const usage = await q.getContextUsage();
// Passer true pour indiquer que les détails par élément doivent être affichés
const detail = await q.getContextUsage(true);

// Fermer la session
await q.close();
```

## Modes de permission

Le SDK prend en charge différents modes de permission pour contrôler l'exécution des outils :

- **`default`** : Les outils d'écriture sont refusés sauf approbation via le callback `canUseTool` ou s'ils sont dans `allowedTools`. Les outils en lecture seule s'exécutent sans confirmation.
- **`plan`** : Bloque tous les outils d'écriture, en demandant à l'IA de présenter d'abord un plan.
- **`auto-edit`** : Approuve automatiquement les outils d'édition (`edit`, `write_file`, `notebook_edit`) tandis que les autres outils nécessitent une confirmation.
- **`yolo`** : Tous les outils s'exécutent automatiquement sans confirmation.

### Chaîne de priorité des permissions

Priorité de décision (la plus élevée en premier) : `deny` > `ask` > `allow` > _(comportement par défaut/mode interactif)_

La première règle correspondante l'emporte.

1. `excludeTools` / `permissions.deny` - Bloque complètement les outils (retourne une erreur de permission)
2. `permissions.ask` - Nécessite toujours une confirmation utilisateur
3. `permissionMode: 'plan'` - Bloque tous les outils non en lecture seule
4. `permissionMode: 'yolo'` - Approuve automatiquement tous les outils
5. `allowedTools` / `permissions.allow` - Approuve automatiquement les outils correspondants
6. Callback `canUseTool` - Logique d'approbation personnalisée (si fourni, non appelé pour les outils autorisés)
7. Comportement par défaut - Refus automatique en mode SDK (les outils d'écriture nécessitent une approbation explicite)

## Exemples

### Conversation multi-tours

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'ma-session',
    message: { role: 'user', content: 'Crée un fichier hello.txt' },
    parent_tool_use_id: null,
  };

  // Attendre une condition ou une entrée utilisateur
  yield {
    type: 'user',
    session_id: 'ma-session',
    message: { role: 'user', content: 'Maintenant, lis le fichier' },
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
  // Autoriser toutes les opérations de lecture
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Demander à l'utilisateur pour les opérations d'écriture (dans une vraie application)
  const userApproved = await promptUser(`Autoriser ${toolName} ?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'L\'utilisateur a refusé l\'opération' };
};

const result = query({
  prompt: 'Crée un nouveau fichier',
  options: {
    canUseTool,
  },
});
```

### Avec des serveurs MCP externes

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Utilise l\'outil personnalisé de mon serveur MCP',
  options: {
    mcpServers: {
      'mon-serveur': {
        command: 'node',
        args: ['chemin/vers/mcp-server.js'],
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
  prompt: 'Dis bonjour en une phrase.',
  options: {
    systemPrompt: 'Tu es un assistant concis. Réponds exactement en une phrase.',
  },
});
```

### Ajouter au prompt système intégré

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Examine le répertoire actuel.',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: 'Sois concis et concentre-toi sur les constats concrets.',
    },
  },
});
```
### Avec les serveurs MCP intégrés au SDK

Le SDK fournit `tool` et `createSdkMcpServer` pour créer des serveurs MCP qui s'exécutent dans le même processus que votre application SDK. Cela est utile lorsque vous souhaitez exposer des outils personnalisés à l'IA sans lancer de processus serveur séparé.

#### `tool(name, description, inputSchema, handler)`

Crée une définition d'outil avec inférence de type via le schéma Zod.

| Paramètre     | Type                               | Description                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | Nom de l'outil (1 à 64 caractères, commence par une lettre, alphanumérique et tirets bas) |
| `description` | `string`                           | Description lisible par un humain de ce que fait l'outil                 |
| `inputSchema` | `ZodRawShape`                      | Objet de schéma Zod définissant les paramètres d'entrée de l'outil       |
| `handler`     | `(args, extra) => Promise<Result>` | Fonction asynchrone qui exécute l'outil et renvoie des blocs de contenu MCP |

Le handler doit renvoyer un objet `CallToolResult` avec la structure suivante :

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

| Option    | Type                     | Valeur par défaut | Description                          |
| --------- | ------------------------ | ----------------- | ------------------------------------ |
| `name`    | `string`                 | Requis            | Nom unique pour le serveur MCP       |
| `version` | `string`                 | `'1.0.0'`         | Version du serveur                   |
| `tools`   | `SdkMcpToolDefinition[]` | -                 | Tableau d'outils créés avec `tool()` |

Renvoie un objet `McpSdkServerConfigWithInstance` qui peut être passé directement à l'option `mcpServers`.

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