# Typescript SDK

## @qwen-code/sdk

Un SDK TypeScript expérimental minimal pour un accès programmatique à Qwen Code.

N'hésitez pas à soumettre une demande de fonctionnalité / un problème / une PR.

## Installation

```bash
npm install @qwen-code/sdk
```

## Prérequis

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stable) installé et accessible dans le PATH

> **Note pour les utilisateurs de nvm** : Si vous utilisez nvm pour gérer les versions de Node.js, le SDK peut ne pas être capable de détecter automatiquement l'exécutable Qwen Code. Vous devez définir explicitement l'option `pathToQwenExecutable` avec le chemin complet du binaire `qwen`.

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

- `prompt` : `string | AsyncIterable<SDKUserMessage>` - Le prompt à envoyer. Utilisez une chaîne de caractères pour les requêtes à un seul tour ou un itérable asynchrone pour les conversations multi-tours.
- `options` : `QueryOptions` - Options de configuration pour la session de requête.

#### QueryOptions

| Option                   | Type                                           | Défaut           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | Le répertoire de travail pour la session de requête. Détermine le contexte dans lequel les opérations sur les fichiers et les commandes sont exécutées.                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | -                | Le modèle d'IA à utiliser (par ex., `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Prédomine sur les variables d'environnement `OPENAI_MODEL` et `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                    |
| `pathToQwenExecutable`   | `string`                                       | Auto-détecté     | Chemin vers l'exécutable Qwen Code. Prend en charge plusieurs formats : `'qwen'` (binaire natif depuis PATH), `'/chemin/vers/qwen'` (chemin explicite), `'/chemin/vers/cli.js'` (bundle Node.js), `'node:/chemin/vers/cli.js'` (forcer le runtime Node.js), `'bun:/chemin/vers/cli.js'` (forcer le runtime Bun). Si non fourni, détection automatique depuis : la variable d'environnement `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Mode d'autorisation contrôlant l'approbation de l'exécution des outils. Voir [Modes d'autorisation](#permission-modes) pour plus de détails.                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | Gestionnaire d'autorisation personnalisé pour l'approbation de l'exécution des outils. Invoqué lorsqu'un outil nécessite une confirmation. Doit répondre dans les 60 secondes, sinon la demande sera automatiquement refusée. Voir [Gestionnaire d'autorisation personnalisé](#custom-permission-handler).                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | Variables d'environnement à transmettre au processus Qwen Code. Fusionnées avec l'environnement du processus en cours.                                                                                                                                                                                                                                                                                                                                                                |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | Configuration du prompt système pour la session principale. Utilisez une chaîne pour remplacer complètement le prompt système intégré de Qwen Code, ou un objet prédéfini pour conserver le prompt intégré et ajouter des instructions supplémentaires.                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | Serveurs MCP (Model Context Protocol) auxquels se connecter. Prend en charge les serveurs externes (stdio/SSE/HTTP) et les serveurs intégrés au SDK. Les serveurs externes sont configurés avec des options de transport comme `command`, `args`, `url`, `httpUrl`, etc. Les serveurs SDK utilisent `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | Contrôleur pour annuler la session de requête. Appelez `abortController.abort()` pour terminer la session et nettoyer les ressources.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | Active le mode débogage pour une journalisation détaillée du processus CLI.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (illimité)  | Nombre maximum de tours de conversation avant que la session ne se termine automatiquement. Un tour consiste en un message utilisateur et une réponse de l'assistant.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | Utilise la sémantique de liste blanche héritée de `coreTools` / CLI `--core-tools`. Si spécifié, seuls les outils principaux correspondants sont enregistrés pour la session. Cela est distinct de `permissions.allow`, qui auto-approuve les appels d'outils correspondants mais ne restreint pas l'enregistrement des outils. Exemple : `['read_file', 'edit', 'run_shell_command']`.                                                                                                                                                       |
| `excludeTools`           | `string[]`                                     | -                | Équivalent à `permissions.deny` dans settings.json. Les outils exclus renvoient immédiatement une erreur d'autorisation. Priorité maximale sur tous les autres paramètres d'autorisation. Prend en charge les alias de noms d'outils et la correspondance de motifs : nom d'outil (`'write_file'`), préfixe de commande shell (`'Bash(rm *)'`), ou motifs de chemin (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                                                         |
| `allowedTools`           | `string[]`                                     | -                | Équivalent à `permissions.allow` dans settings.json. Les outils correspondants contournent le callback `canUseTool` et s'exécutent automatiquement. S'applique uniquement lorsque l'outil nécessite une confirmation. Prend en charge la même correspondance de motifs que `excludeTools`. Exemple : `['Bash(git status)', 'Bash(npm test)']`.                                                                                                                                                                                                                  |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Type d'authentification pour le service d'IA. Le niveau gratuit Qwen OAuth a été interrompu le 2026-04-15 ; les nouvelles configurations SDK doivent utiliser une authentification compatible OpenAI ou un autre fournisseur pris en charge.                                                                                                                                                                                                                                |
| `agents`                 | `SubagentConfig[]`                             | -                | Configuration des sous-agents pouvant être invoqués pendant la session. Les sous-agents sont des agents d'IA spécialisés pour des tâches ou domaines spécifiques.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | Lorsque `true`, le SDK émet des messages incomplets au fur et à mesure de leur génération, permettant le streaming en temps réel de la réponse de l'IA.                                                                                                                                                                                                                                                                                                                                                        |
| `resume`                 | `string`                                       | -                | Reprendre une session précédente en fournissant son ID de session. Équivalent au flag `--resume` de la CLI.                                                                                                                                                                                                                                                                                                                                                                                           |
| `sessionId`              | `string`                                       | -                | Spécifie un ID de session pour la nouvelle session. Garantit que le SDK et la CLI utilisent le même ID sans reprendre l'historique. Équivalent au flag `--session-id` de la CLI.                                                                                                                                                                                                                                                                                                                                      |
> [!note]
> Pour `coreTools`, les alias comme `Read`, `Edit` et `Bash` fonctionnent aussi, mais les spécificateurs d'invocation tels que `Bash(git *)` sont supprimés. `coreTools` restreint l'enregistrement des outils, pas les schémas d'invocation.

### Délais d'attente

Le SDK impose les délais d'attente par défaut suivants :

| Délai              | Par défaut | Description                                                                                                                                    |
| ------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`       | 1 minute   | Temps maximum pour que le rappel `canUseTool` réponde. Si dépassé, la demande d'outil est automatiquement refusée.                            |
| `mcpRequest`       | 1 minute   | Temps maximum pour que les appels d'outils MCP du SDK se terminent.                                                                           |
| `controlRequest`   | 1 minute   | Temps maximum pour que les opérations de contrôle comme `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()` et `interrupt()` se terminent. |
| `streamClose`      | 1 minute   | Temps maximum d'attente pour la fin de l'initialisation avant de fermer l'entrée standard de la CLI en mode multi-tours avec les serveurs MCP du SDK. |

Vous pouvez personnaliser ces délais via l'option `timeout` :

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 60 secondes pour le rappel de permission
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
    // Traiter le message de l'assistant
  } else if (isSDKResultMessage(message)) {
    // Traiter le message de résultat
  }
}
```

### Méthodes de l'instance Query

L'instance `Query` renvoyée par `query()` fournit plusieurs méthodes :

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

// Changer de modèle en cours de session
await q.setModel('qwen-max');

// Obtenir la répartition de l'utilisation du contexte (compteurs de tokens par catégorie)
const usage = await q.getContextUsage();
// Passer true pour indiquer que les détails par élément doivent être affichés
const detail = await q.getContextUsage(true);

// Fermer la session
await q.close();
```

## Modes de permission

Le SDK prend en charge différents modes de permission pour contrôler l'exécution des outils :

- **`default`** : Les outils d'écriture sont refusés sauf approbation via le rappel `canUseTool` ou dans `allowedTools`. Les outils en lecture seule s'exécutent sans confirmation.
- **`plan`** : Bloque tous les outils d'écriture, en demandant à l'IA de présenter d'abord un plan.
- **`auto-edit`** : Approuve automatiquement les outils d'édition (`edit`, `write_file`, `notebook_edit`) tandis que les autres outils nécessitent une confirmation.
- **`yolo`** : Tous les outils s'exécutent automatiquement sans confirmation.

### Chaîne de priorité des permissions

Décision prioritaire (la plus élevée en premier) : `deny` > `ask` > `allow` > _(mode par défaut/interactif)_

La première règle correspondante l'emporte.

1. `excludeTools` / `permissions.deny` - Bloque complètement les outils (retourne une erreur de permission)
2. `permissions.ask` - Nécessite toujours la confirmation de l'utilisateur
3. `permissionMode: 'plan'` - Bloque tous les outils non lecture seule
4. `permissionMode: 'yolo'` - Approuve automatiquement tous les outils
5. `allowedTools` / `permissions.allow` - Approuve automatiquement les outils correspondants
6. Rappel `canUseTool` - Logique d'approbation personnalisée (si fournie, n'est pas appelé pour les outils autorisés)
7. Comportement par défaut - Auto-refus en mode SDK (les outils d'écriture nécessitent une approbation explicite)

## Exemples

### Conversation en plusieurs tours

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Create a hello.txt file' },
    parent_tool_use_id: null,
  };

  // Attendre une condition ou une entrée utilisateur
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
  // Autoriser toutes les opérations de lecture
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Demander à l'utilisateur pour les opérations d'écriture (dans une vraie application)
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

Le SDK fournit `tool` et `createSdkMcpServer` pour créer des serveurs MCP qui s'exécutent dans le même processus que votre application SDK. Cela est utile lorsque vous souhaitez exposer des outils personnalisés à l'IA sans exécuter un processus serveur séparé.

#### `tool(name, description, inputSchema, handler)`

Crée une définition d'outil avec inférence de type de schéma Zod.

| Paramètre    | Type                               | Description                                                              |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`       | `string`                           | Nom de l'outil (1 à 64 caractères, commence par une lettre, alphanumérique et tirets bas) |
| `description`| `string`                           | Description lisible par l'humain de ce que fait l'outil                  |
| `inputSchema`| `ZodRawShape`                      | Objet de schéma Zod définissant les paramètres d'entrée de l'outil       |
| `handler`    | `(args, extra) => Promise<Result>` | Fonction asynchrone qui exécute l'outil et retourne des blocs de contenu MCP |

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

Crée une instance de serveur MCP intégré au SDK.

| Option    | Type                     | Défaut    | Description                          |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | Requis    | Nom unique pour le serveur MCP       |
| `version` | `string`                 | `'1.0.0'` | Version du serveur                   |
| `tools`   | `SdkMcpToolDefinition[]` | -         | Tableau d'outils créés avec `tool()` |

Renvoie un objet `McpSdkServerConfigWithInstance` qui peut être passé directement à l'option `mcpServers`.

#### Exemple

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Définir un outil avec un schéma Zod
const calculatorTool = tool(
  'calculate_sum',
  'Add two numbers',
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

// Annuler après 5 secondes
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('La requête a été annulée');
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
  // ... opérations de requête
} catch (error) {
  if (isAbortError(error)) {
    // Gérer l'annulation
  } else {
    // Gérer les autres erreurs
  }
}
```
