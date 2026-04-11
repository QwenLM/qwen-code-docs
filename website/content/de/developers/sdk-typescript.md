# TypeScript SDK

## @qwen-code/sdk

Ein minimales, experimentelles TypeScript SDK für den programmatischen Zugriff auf Qwen Code.

Feature Requests, Issues und PRs sind jederzeit willkommen.

## Installation

```bash
npm install @qwen-code/sdk
```

## Voraussetzungen

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stable) installiert und im `PATH` verfügbar

> **Hinweis für nvm-Nutzer**: Wenn du nvm zur Verwaltung von Node.js-Versionen verwendest, kann das SDK die Qwen Code-Executable möglicherweise nicht automatisch erkennen. Du solltest die Option `pathToQwenExecutable` explizit auf den vollständigen Pfad der `qwen`-Binary setzen.

## Schnellstart

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

## API-Referenz

### `query(config)`

Erstellt eine neue Query-Session mit Qwen Code.

#### Parameter

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - Der zu sendende Prompt. Verwende einen String für Single-Turn-Queries oder ein AsyncIterable für Multi-Turn-Konversationen.
- `options`: `QueryOptions` - Konfigurationsoptionen für die Query-Session.

#### QueryOptions

| Option                   | Typ                                            | Standardwert     | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | Das Arbeitsverzeichnis für die Query-Session. Bestimmt den Kontext, in dem Dateioperationen und Befehle ausgeführt werden.                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | -                | Das zu verwendende KI-Modell (z. B. `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Hat Vorrang vor den Umgebungsvariablen `OPENAI_MODEL` und `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | Automatisch erkannt | Pfad zur Qwen Code-Executable. Unterstützt mehrere Formate: `'qwen'` (native Binary aus PATH), `'/path/to/qwen'` (expliziter Pfad), `'/path/to/cli.js'` (Node.js-Bundle), `'node:/path/to/cli.js'` (erzwingt Node.js-Runtime), `'bun:/path/to/cli.js'` (erzwingt Bun-Runtime). Falls nicht angegeben, wird automatisch erkannt aus: `QWEN_CODE_CLI_PATH`-Umgebungsvariable, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Berechtigungsmodus zur Steuerung der Tool-Ausführungsfreigabe. Siehe [Berechtigungsmodi](#permission-modes) für Details.                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | Benutzerdefinierter Permission-Handler für die Tool-Ausführungsfreigabe. Wird aufgerufen, wenn ein Tool eine Bestätigung erfordert. Muss innerhalb von 60 Sekunden antworten, andernfalls wird die Anfrage automatisch abgelehnt. Siehe [Benutzerdefinierter Permission-Handler](#custom-permission-handler).                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | Umgebungsvariablen, die an den Qwen Code-Prozess übergeben werden. Werden mit der aktuellen Prozessumgebung zusammengeführt.                                                                                                                                                                                                                                                                                                                                                                                  |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | Konfiguration des Systemprompts für die Haupt-Session. Verwende einen String, um den integrierten Qwen Code-Systemprompt vollständig zu überschreiben, oder ein Preset-Objekt, um den integrierten Prompt beizubehalten und zusätzliche Anweisungen anzuhängen.                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | MCP-Server (Model Context Protocol), mit denen eine Verbindung hergestellt werden soll. Unterstützt externe Server (stdio/SSE/HTTP) und SDK-eingebettete Server. Externe Server werden mit Transportoptionen wie `command`, `args`, `url`, `httpUrl` usw. konfiguriert. SDK-Server verwenden `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | Controller zum Abbrechen der Query-Session. Rufe `abortController.abort()` auf, um die Session zu beenden und Ressourcen freizugeben.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | Aktiviert den Debug-Modus für ausführliches Logging des CLI-Prozesses.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (unbegrenzt) | Maximale Anzahl an Konversationsrunden, bevor die Session automatisch beendet wird. Eine Runde besteht aus einer Benutzer- und einer Assistenten-Nachricht.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | Entspricht `tool.core` in settings.json. Falls angegeben, stehen der KI nur diese Tools zur Verfügung. Beispiel: `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                   |
| `excludeTools`           | `string[]`                                     | -                | Entspricht `tool.exclude` in settings.json. Ausgeschlossene Tools geben sofort einen Berechtigungsfehler zurück. Hat die höchste Priorität gegenüber allen anderen Berechtigungseinstellungen. Unterstützt Pattern-Matching: Tool-Name (`'write_file'`), Tool-Klasse (`'ShellTool'`) oder Shell-Befehlspräfix (`'ShellTool(rm )'`).                                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | -                | Entspricht `tool.allowed` in settings.json. Passende Tools umgehen den `canUseTool`-Callback und werden automatisch ausgeführt. Gilt nur, wenn ein Tool eine Bestätigung erfordert. Unterstützt dasselbe Pattern-Matching wie `excludeTools`.                                                                                                                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Authentifizierungstyp für den KI-Service. Die Verwendung von `'qwen-oauth'` im SDK wird nicht empfohlen, da die Anmeldedaten in `~/.qwen` gespeichert werden und möglicherweise regelmäßig aktualisiert werden müssen.                                                                                                                                                                                                                                                                                                                          |
| `agents`                 | `SubagentConfig[]`                             | -                | Konfiguration für Subagenten, die während der Session aufgerufen werden können. Subagenten sind spezialisierte KI-Agenten für bestimmte Aufgaben oder Domänen.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | Wenn `true`, gibt das SDK unvollständige Nachrichten bereits während der Generierung aus, was ein Echtzeit-Streaming der KI-Antwort ermöglicht.                                                                                                                                                                                                                                                                                                                                                        |

### Timeouts

Das SDK erzwingt die folgenden Standard-Timeouts:

| Timeout          | Standardwert | Beschreibung                                                                                                                  |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 Minute | Maximale Zeit für die Antwort des `canUseTool`-Callbacks. Bei Überschreitung wird die Tool-Anfrage automatisch abgelehnt.                             |
| `mcpRequest`     | 1 Minute | Maximale Zeit für den Abschluss von SDK-MCP-Tool-Aufrufen.                                                                             |
| `controlRequest` | 1 Minute | Maximale Zeit für den Abschluss von Steuerungsvorgängen wie `initialize()`, `setModel()`, `setPermissionMode()` und `interrupt()`. |
| `streamClose`    | 1 Minute | Maximale Wartezeit für den Abschluss der Initialisierung, bevor die CLI-stdin im Multi-Turn-Modus mit SDK-MCP-Servern geschlossen wird.        |

Du kannst diese Timeouts über die `timeout`-Option anpassen:

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

### Nachrichtentypen

Das SDK stellt Type Guards bereit, um verschiedene Nachrichtentypen zu identifizieren:

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

### Methoden der Query-Instanz

Die von `query()` zurückgegebene `Query`-Instanz bietet mehrere Methoden:

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

// Close the session
await q.close();
```

## Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:

- **`default`**: Schreib-Tools werden abgelehnt, es sei denn, sie werden über den `canUseTool`-Callback oder in `allowedTools` freigegeben. Nur-Lese-Tools werden ohne Bestätigung ausgeführt.
- **`plan`**: Blockiert alle Schreib-Tools und weist die KI an, zunächst einen Plan vorzulegen.
- **`auto-edit`**: Bearbeitungs-Tools (`edit`, `write_file`) werden automatisch freigegeben, während andere Tools eine Bestätigung erfordern.
- **`yolo`**: Alle Tools werden automatisch ohne Bestätigung ausgeführt.

### Prioritätskette für Berechtigungen

1. `excludeTools` – Blockiert Tools vollständig
2. `permissionMode: 'plan'` – Blockiert nicht-nur-Lese-Tools
3. `permissionMode: 'yolo'` – Genehmigt alle Tools automatisch
4. `allowedTools` – Genehmigt passende Tools automatisch
5. `canUseTool`-Callback – Benutzerdefinierte Genehmigungslogik
6. Standardverhalten – Automatische Ablehnung im SDK-Modus

## Beispiele

### Multi-Turn-Konversation

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

### Benutzerdefinierter Permission-Handler

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

### Mit externen MCP-Servern

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

### Überschreiben des Systemprompts

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Say hello in one sentence.',
  options: {
    systemPrompt: 'You are a terse assistant. Answer in exactly one sentence.',
  },
});
```

### Anhängen an den integrierten Systemprompt

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

### Mit SDK-eingebetteten MCP-Servern

Das SDK stellt `tool` und `createSdkMcpServer` bereit, um MCP-Server zu erstellen, die im selben Prozess wie deine SDK-Anwendung laufen. Dies ist nützlich, wenn du der KI benutzerdefinierte Tools bereitstellen möchtest, ohne einen separaten Serverprozess zu starten.

#### `tool(name, description, inputSchema, handler)`

Erstellt eine Tool-Definition mit Zod-Schema-Typinferenz.

| Parameter     | Typ                                | Beschreibung                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | Tool-Name (1–64 Zeichen, beginnt mit einem Buchstaben, alphanumerisch und Unterstriche) |
| `description` | `string`                           | Menschenlesbare Beschreibung der Tool-Funktion                         |
| `inputSchema` | `ZodRawShape`                      | Zod-Schema-Objekt, das die Eingabeparameter des Tools definiert                   |
| `handler`     | `(args, extra) => Promise<Result>` | Asynchrone Funktion, die das Tool ausführt und MCP-Inhaltsblöcke zurückgibt     |

Der Handler muss ein `CallToolResult`-Objekt mit folgender Struktur zurückgeben:

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

Erstellt eine SDK-eingebettete MCP-Server-Instanz.

| Option    | Typ                      | Standardwert   | Beschreibung                          |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | Erforderlich  | Eindeutiger Name für den MCP-Server       |
| `version` | `string`                 | `'1.0.0'` | Server-Version                       |
| `tools`   | `SdkMcpToolDefinition[]` | -         | Array von Tools, die mit `tool()` erstellt wurden |

Gibt ein `McpSdkServerConfigWithInstance`-Objekt zurück, das direkt an die `mcpServers`-Option übergeben werden kann.

#### Beispiel

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

### Abbrechen einer Query

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

## Fehlerbehandlung

Das SDK stellt eine `AbortError`-Klasse zur Behandlung abgebrochener Queries bereit:

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