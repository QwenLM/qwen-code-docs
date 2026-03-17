# SDK TypeScript

## @qwen-code/sdk

Un SDK expérimental minimal en TypeScript pour accéder par programmation à Qwen Code.

N’hésitez pas à soumettre une demande de fonctionnalité, un problème ou une demande d’intégration (PR).

## Installation

```bash
npm install @qwen-code/sdk
```

## Prérequis

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (version stable) installé et accessible dans le `PATH`

> **Remarque pour les utilisateurs de nvm** : Si vous utilisez nvm pour gérer les versions de Node.js, le SDK risque de ne pas parvenir à détecter automatiquement l’exécutable Qwen Code. Vous devez alors définir explicitement l’option `pathToQwenExecutable` avec le chemin complet vers le binaire `qwen`.

## Démarrage rapide

```typescript
import { query } from '@qwen-code/sdk';

// Requête en une seule étape
const result = query({
  prompt: 'Quels fichiers se trouvent dans le répertoire courant ?',
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

## Référence de l’API

### `query(config)`

Crée une nouvelle session de requête avec Qwen Code.

#### Paramètres

- `prompt` : `string | AsyncIterable<SDKUserMessage>` — L’invite à envoyer. Utilisez une chaîne de caractères pour les requêtes en une seule étape, ou un itérable asynchrone pour les conversations multi-étapes.
- `options` : `QueryOptions` — Options de configuration pour la session de requête.

#### QueryOptions

| Option                   | Type                                           | Valeur par défaut | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`   | Répertoire de travail pour la session de requête. Détermine le contexte dans lequel les opérations sur les fichiers et les commandes sont exécutées.                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | —                 | Modèle d’IA à utiliser (par exemple `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Prend le pas sur les variables d’environnement `OPENAI_MODEL` et `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | Détecté automatiquement | Chemin vers l’exécutable Qwen Code. Prend en charge plusieurs formats : `'qwen'` (binaire natif issu du `PATH`), `'/chemin/vers/qwen'` (chemin explicite), `'/chemin/vers/cli.js'` (bundle Node.js), `'node:/chemin/vers/cli.js'` (exécution forcée avec Node.js), `'bun:/chemin/vers/cli.js'` (exécution forcée avec Bun). Si non fourni, détection automatique depuis : variable d’environnement `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`       | Mode d’autorisation contrôlant l’exécution des outils. Pour plus de détails, consultez [Modes d’autorisation](#permission-modes).                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | —                 | Gestionnaire d’autorisation personnalisé pour l’exécution des outils. Appelé lorsqu’un outil nécessite une confirmation. Doit répondre dans les 60 secondes, sinon la demande sera automatiquement refusée. Pour plus de détails, consultez [Gestionnaire d’autorisation personnalisé](#custom-permission-handler).                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | —                 | Variables d’environnement à transmettre au processus Qwen Code. Fusionnées avec l’environnement du processus courant.                                                                                                                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | —                 | Serveurs MCP (Model Context Protocol) auxquels se connecter. Prend en charge les serveurs externes (stdio/SSE/HTTP) ainsi que les serveurs intégrés au SDK. Les serveurs externes sont configurés avec des options de transport telles que `command`, `args`, `url`, `httpUrl`, etc. Les serveurs du SDK utilisent `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | —                 | Contrôleur permettant d’annuler la session de requête. Appelez `abortController.abort()` pour mettre fin à la session et libérer les ressources.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`           | Active le mode débogage pour des journaux verbeux provenant du processus CLI.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (illimité)   | Nombre maximal d’échanges avant la fin automatique de la session. Un échange correspond à un message utilisateur suivi d’une réponse de l’assistant.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | —                 | Équivalent à `tool.core` dans `settings.json`. Si spécifié, seuls ces outils seront disponibles pour l’IA. Exemple : `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                   |
| `excludeTools`           | `string[]`                                     | —                 | Équivalent à `tool.exclude` dans `settings.json`. Les outils exclus renvoient immédiatement une erreur d’autorisation. Cette option a la priorité absolue sur tous les autres paramètres d’autorisation. Prend en charge la correspondance par motif : nom de l’outil (`'write_file'`), classe d’outil (`'ShellTool'`) ou préfixe de commande shell (`'ShellTool(rm )'`).                                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | —                 | Équivalent à `tool.allowed` dans `settings.json`. Les outils correspondants ignorent le rappel `canUseTool` et s’exécutent automatiquement. N’a d’effet que lorsque l’outil requiert une confirmation. Prend en charge le même type de correspondance par motif que `excludeTools`.                                                                                                                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`        | Type d’authentification pour le service IA. L’utilisation de `'qwen-oauth'` dans le SDK n’est pas recommandée, car les identifiants sont stockés dans `~/.qwen` et peuvent nécessiter un rafraîchissement périodique.                                                                                                                                                                                                                                                                                                                          |
| `agents`                 | `SubagentConfig[]`                             | —                 | Configuration des sous-agents pouvant être invoqués durant la session. Les sous-agents sont des agents IA spécialisés pour des tâches ou des domaines précis.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`           | Lorsque cette option est définie à `true`, le SDK émet les messages incomplets dès qu’ils sont générés, permettant un flux en temps réel de la réponse de l’IA.                                                                                                                                                                                                                                                                                                                                                        |

### Délais d’expiration

Le SDK applique les délais d’expiration par défaut suivants :

| Délai d’expiration | Par défaut | Description                                                                                                                                 |
| ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`       | 1 minute   | Durée maximale de réponse du rappel `canUseTool`. Si ce délai est dépassé, la demande d’utilisation de l’outil est automatiquement refusée. |
| `mcpRequest`       | 1 minute   | Durée maximale d’exécution des appels d’outils MCP effectués par le SDK.                                                                    |
| `controlRequest`   | 1 minute   | Durée maximale d’exécution des opérations de contrôle telles que `initialize()`, `setModel()`, `setPermissionMode()` et `interrupt()`.    |
| `streamClose`      | 1 minute   | Durée maximale d’attente de la finalisation de l’initialisation avant la fermeture de l’entrée standard CLI en mode multi-échanges avec les serveurs MCP du SDK. |

Vous pouvez personnaliser ces délais d’expiration à l’aide de l’option `timeout` :

```typescript
const query = qwen.query('Votre invite', {
  timeout: {
    canUseTool: 60000,   // 60 secondes pour le rappel d’autorisation
    mcpRequest: 600000,  // 10 minutes pour les appels d’outils MCP
    controlRequest: 60000, // 60 secondes pour les demandes de contrôle
    streamClose: 15000,  // 15 secondes pour attendre la fermeture du flux
  },
});
```

### Types de messages

Le SDK fournit des *type guards* pour identifier les différents types de messages :

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
    // Gérer le message de l’assistant
  } else if (isSDKResultMessage(message)) {
    // Gérer le message de résultat
  }
}
```

### Méthodes d’instance de `Query`

L’instance `Query` retournée par `query()` propose plusieurs méthodes :

```typescript
const q = query({ prompt: 'Bonjour', options: {} });

// Obtenir l’ID de session
const sessionId = q.getSessionId();

// Vérifier si la session est fermée
const closed = q.isClosed();

// Interrompre l’opération en cours
await q.interrupt();

// Modifier le mode d’autorisation en cours de session
await q.setPermissionMode('yolo');

// Modifier le modèle en cours de session
await q.setModel('qwen-max');

// Fermer la session
await q.close();
```

## Modes d’autorisation

Le SDK prend en charge différents modes d’autorisation pour contrôler l’exécution des outils :

- **`default`** : Les outils d’écriture sont refusés, sauf s’ils sont explicitement approuvés via le rappel `canUseTool` ou listés dans `allowedTools`. Les outils en lecture seule s’exécutent sans confirmation.
- **`plan`** : Bloque tous les outils d’écriture et demande à l’IA de présenter d’abord un plan.
- **`auto-edit`** : Approuve automatiquement les outils de modification (par exemple `edit`, `write_file`), tandis que les autres outils nécessitent une confirmation.
- **`yolo`** : Tous les outils s’exécutent automatiquement, sans confirmation.

### Chaîne de priorité des autorisations

1. `excludeTools` — Bloque complètement les outils correspondants  
2. `permissionMode: 'plan'` — Bloque les outils non en lecture seule  
3. `permissionMode: 'yolo'` — Approuve automatiquement tous les outils  
4. `allowedTools` — Approuve automatiquement les outils correspondants  
5. Rappel `canUseTool` — Logique personnalisée d’approbation  
6. Comportement par défaut — Refus automatique en mode SDK  

## Exemples

### Conversation à plusieurs tours

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Créez un fichier hello.txt' },
    parent_tool_use_id: null,
  };

  // Attendre une condition ou une entrée utilisateur
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Lisez maintenant le fichier' },
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

  // Demander confirmation à l’utilisateur pour les opérations d’écriture (dans une application réelle)
  const userApproved = await promptUser(`Autoriser ${toolName} ?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'L’utilisateur a refusé l’opération' };
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
  prompt: 'Utilisez l’outil personnalisé depuis mon serveur MCP',
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

Le SDK fournit les fonctions `tool` et `createSdkMcpServer` pour créer des serveurs MCP s’exécutant dans le même processus que votre application SDK. Cette approche est utile lorsque vous souhaitez exposer des outils personnalisés à l’IA sans avoir à lancer un processus de serveur séparé.

#### `tool(nom, description, schemaEntrée, gestionnaire)`

Crée une définition d’outil avec inférence de type basée sur le schéma Zod.

| Paramètre       | Type                               | Description                                                                                      |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `nom`            | `string`                           | Nom de l’outil (1 à 64 caractères, commence par une lettre, alphanumérique et tirets bas uniquement) |
| `description`    | `string`                           | Description lisible par un humain du rôle de l’outil                                          |
| `schemaEntrée`   | `ZodRawShape`                      | Objet schéma Zod définissant les paramètres d’entrée de l’outil                                |
| `gestionnaire`   | `(args, extra) => Promise<Résultat>` | Fonction asynchrone exécutant l’outil et renvoyant des blocs de contenu MCP                   |

Le gestionnaire doit renvoyer un objet `CallToolResult` avec la structure suivante :

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

Crée une instance de serveur MCP intégrée à l’SDK.

| Option    | Type                     | Valeur par défaut | Description                          |
| --------- | ------------------------ | ----------------- | -------------------------------------- |
| `name`    | `string`                 | Obligatoire       | Nom unique du serveur MCP            |
| `version` | `string`                 | `'1.0.0'`         | Version du serveur                   |
| `tools`   | `SdkMcpToolDefinition[]` | —                 | Tableau d’outils créés avec `tool()` |

Renvoie un objet `McpSdkServerConfigWithInstance` qui peut être transmis directement à l’option `mcpServers`.

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
  prompt: 'Quelle est la somme de 42 et 17 ?',
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
  prompt: 'Tâche longue à exécuter...',
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
    // Gérer l’annulation
  } else {
    // Gérer les autres erreurs
  }
}
```