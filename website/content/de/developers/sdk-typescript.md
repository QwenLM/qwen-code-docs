# Typescript SDK

## @qwen-code/sdk

Ein minimales experimentelles TypeScript SDK für den programmatischen Zugriff auf Qwen Code.

Fühlen Sie sich frei, ein Feature-Request/Issue/PR einzureichen.

## Installation

```bash
npm install @qwen-code/sdk
```

## Anforderungen

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stabil) installiert und im PATH erreichbar

> **Hinweis für nvm-Nutzer**: Wenn Sie nvm zur Verwaltung von Node.js-Versionen verwenden, kann das SDK die Qwen Code ausführbare Datei möglicherweise nicht automatisch erkennen. Sie sollten die Option `pathToQwenExecutable` explizit auf den vollständigen Pfad der `qwen`-Binärdatei setzen.

## Schnellstart

```typescript
import { query } from '@qwen-code/sdk';

// Einzelne Anfrage
const result = query({
  prompt: 'Welche Dateien befinden sich im aktuellen Verzeichnis?',
  options: {
    cwd: '/pfad/zum/projekt',
  },
});

// Nachrichten iterieren
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistent:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Ergebnis:', message.result);
  }
}
```

## API-Referenz

### `query(config)`

Erstellt eine neue Abfragesitzung mit Qwen Code.

#### Parameter

- `prompt`: `string | AsyncIterable<SDKUserMessage>` - Die zu sendende Eingabeaufforderung. Verwenden Sie einen String für einzelne Abfragen oder ein asynchrones Iterable für mehrteilige Gespräche.
- `options`: `QueryOptions` - Konfigurationsoptionen für die Abfragesitzung.

#### QueryOptions

| Option                   | Typ                                            | Standard         | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | Das Arbeitsverzeichnis für die Abfragesitzung. Bestimmt den Kontext, in dem Dateioperationen und Befehle ausgeführt werden.                                                                                                                                                                                                                                                                                                                                                            |
| `model`                  | `string`                                       | -                | Das zu verwendende KI-Modell (z. B. `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Hat Vorrang vor den Umgebungsvariablen `OPENAI_MODEL` und `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                              |
| `pathToQwenExecutable`   | `string`                                       | Automatisch erkannt | Pfad zur Qwen Code ausführbaren Datei. Unterstützt mehrere Formate: `'qwen'` (natives Binary aus PATH), `'/path/to/qwen'` (expliziter Pfad), `'/path/to/cli.js'` (Node.js-Bundle), `'node:/path/to/cli.js'` (erzwinge Node.js-Laufzeit), `'bun:/path/to/cli.js'` (erzwinge Bun-Laufzeit). Falls nicht angegeben, wird automatisch erkannt von: `QWEN_CODE_CLI_PATH` Umgebungsvariable, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Berechtigungsmodus zur Steuerung der Toolausführungsgenehmigung. Siehe [Berechtigungsmodi](#permission-modes) für Details.                                                                                                                                                                                                                                                                                                                                                             |
| `canUseTool`             | `CanUseTool`                                   | -                | Benutzerdefinierter Berechtigungshandler zur Genehmigung der Toolausführung. Wird aufgerufen, wenn ein Tool eine Bestätigung benötigt. Muss innerhalb von 60 Sekunden antworten, sonst wird die Anfrage automatisch abgelehnt. Siehe [Benutzerdefinierter Berechtigungshandler](#custom-permission-handler).                                                                                                                                                                               |
| `env`                    | `Record<string, string>`                       | -                | Umgebungsvariablen, die an den Qwen Code-Prozess übergeben werden. Werden mit der aktuellen Prozessumgebung zusammengeführt.                                                                                                                                                                                                                                                                                                                                                          |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | MCP-Server (Model Context Protocol), mit denen verbunden werden soll. Unterstützt externe Server (stdio/SSE/HTTP) sowie SDK-integrierte Server. Externe Server werden mit Transportoptionen wie `command`, `args`, `url`, `httpUrl` usw. konfiguriert. SDK-Server verwenden `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                         |
| `abortController`        | `AbortController`                              | -                | Controller zum Abbrechen der Abfragesitzung. Rufe `abortController.abort()` auf, um die Sitzung zu beenden und Ressourcen freizugeben.                                                                                                                                                                                                                                                                                                                                                 |
| `debug`                  | `boolean`                                      | `false`          | Aktiviert den Debug-Modus für detaillierte Protokollierung des CLI-Prozesses.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `maxSessionTurns`        | `number`                                       | `-1` (unbegrenzt) | Maximale Anzahl an Konversationsschritten, bevor die Sitzung automatisch beendet wird. Ein Schritt besteht aus einer Benutzernachricht und einer Antwort des Assistenten.                                                                                                                                                                                                                                                                                                              |
| `coreTools`              | `string[]`                                     | -                | Äquivalent zu `tool.core` in settings.json. Falls angegeben, stehen nur diese Tools der KI zur Verfügung. Beispiel: `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                |
| `excludeTools`           | `string[]`                                     | -                | Äquivalent zu `tool.exclude` in settings.json. Ausgeschlossene Tools geben sofort einen Berechtigungsfehler zurück. Hat höchste Priorität gegenüber allen anderen Berechtigungseinstellungen. Unterstützt Pattern-Matching: Toolname (`'write_file'`), Toolklasse (`'ShellTool'`) oder Shell-Befehlspräfix (`'ShellTool(rm )'`).                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | -                | Äquivalent zu `tool.allowed` in settings.json. Übereinstimmende Tools umgehen den `canUseTool`-Callback und werden automatisch ausgeführt. Gilt nur, wenn das Tool eine Bestätigung erfordert. Unterstützt dieselben Pattern-Matching-Optionen wie `excludeTools`.                                                                                                                                                                                                                      |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Authentifizierungstyp für den KI-Dienst. Die Verwendung von `'qwen-oauth'` im SDK wird nicht empfohlen, da Anmeldeinformationen in `~/.qwen` gespeichert werden und möglicherweise regelmäßig aktualisiert werden müssen.                                                                                                                                                                                                                                                               |
| `agents`                 | `SubagentConfig[]`                             | -                | Konfiguration für Unteragenten, die während der Sitzung aufgerufen werden können. Unteragenten sind spezialisierte KI-Agenten für bestimmte Aufgaben oder Domänen.                                                                                                                                                                                                                                                                                                                     |
| `includePartialMessages` | `boolean`                                      | `false`          | Wenn `true`, gibt das SDK unvollständige Nachrichten aus, während sie generiert werden, wodurch ein Echtzeit-Streaming der KI-Antwort ermöglicht wird.                                                                                                                                                                                                                                                                                                                                |

### Timeouts

Das SDK erzwingt die folgenden Standard-Timeouts:

| Timeout          | Standard | Beschreibung                                                                                                                  |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 Minute | Maximale Zeit für die Antwort des `canUseTool`-Callbacks. Wenn überschritten, wird die Tool-Anfrage automatisch abgelehnt.   |
| `mcpRequest`     | 1 Minute | Maximale Zeit für den Abschluss von SDK MCP-Tool-Aufrufen.                                                                   |
| `controlRequest` | 1 Minute | Maximale Zeit für Steueroperationen wie `initialize()`, `setModel()`, `setPermissionMode()` und `interrupt()`.               |
| `streamClose`    | 1 Minute | Maximale Wartezeit auf den Abschluss der Initialisierung vor dem Schließen von CLI stdin im Multi-Turn-Modus mit SDK MCP-Servern. |

Sie können diese Timeouts über die Option `timeout` anpassen:

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 60 Sekunden für Permission-Callback
    mcpRequest: 600000, // 10 Minuten für MCP-Tool-Aufrufe
    controlRequest: 60000, // 60 Sekunden für Control-Anfragen
    streamClose: 15000, // 15 Sekunden für Stream-Close-Wartezeit
  },
});
```

### Nachrichtentypen

Das SDK stellt Typwächter bereit, um verschiedene Nachrichtentypen zu identifizieren:

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
    // Behandle Assistentennachricht
  } else if (isSDKResultMessage(message)) {
    // Behandle Ergebnisnachricht
  }
}
```

### Methoden der Query-Instanz

Die von `query()` zurückgegebene `Query`-Instanz bietet mehrere Methoden:

```typescript
const q = query({ prompt: 'Hallo', options: {} });

// Hole Session-ID
const sessionId = q.getSessionId();

// Prüfe, ob geschlossen
const closed = q.isClosed();

// Unterbreche die aktuelle Operation
await q.interrupt();

// Ändere Berechtigungsmodus während der Sitzung
await q.setPermissionMode('yolo');

// Ändere Modell während der Sitzung
await q.setModel('qwen-max');

// Schließe die Sitzung
await q.close();
```

## Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:

- **`default`**: Schreibende Tools werden abgelehnt, es sei denn, sie sind über den `canUseTool`-Callback oder in `allowedTools` genehmigt. Reine Lese-Tools werden ohne Bestätigung ausgeführt.
- **`plan`**: Blockiert alle schreibenden Tools und weist die KI an, zuerst einen Plan vorzulegen.
- **`auto-edit`**: Automatische Genehmigung für Bearbeitungstools (edit, write_file), während andere Tools eine Bestätigung erfordern.
- **`yolo`**: Alle Tools werden automatisch ohne Bestätigung ausgeführt.

### Prioritätskette der Berechtigungen

1. `excludeTools` – Blockiert Tools vollständig
2. `permissionMode: 'plan'` – Blockiert nicht-reine Lese-Tools
3. `permissionMode: 'yolo'` – Automatische Genehmigung aller Tools
4. `allowedTools` – Automatische Genehmigung passender Tools
5. `canUseTool`-Callback – Benutzerdefinierte Genehmigungslogik
6. Standardverhalten – Automatische Ablehnung im SDK-Modus

## Beispiele

### Mehrstufige Konversation

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Erstelle eine hello.txt Datei' },
    parent_tool_use_id: null,
  };

  // Warte auf eine Bedingung oder Benutzereingabe
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Lies nun die Datei zurück' },
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

### Benutzerdefinierter Berechtigungs-Handler

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // Alle Leseoperationen erlauben
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Benutzer bei Schreiboperationen um Erlaubnis bitten (in einer echten Anwendung)
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
  prompt: 'Verwende das benutzerdefinierte Tool von meinem MCP-Server',
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

### Mit SDK-integrierten MCP-Servern

Das SDK stellt `tool` und `createSdkMcpServer` zur Verfügung, um MCP-Server zu erstellen, die im gleichen Prozess wie Ihre SDK-Anwendung ausgeführt werden. Dies ist nützlich, wenn Sie benutzerdefinierte Tools für die KI bereitstellen möchten, ohne einen separaten Serverprozess ausführen zu müssen.

#### `tool(name, description, inputSchema, handler)`

Erstellt eine Tool-Definition mit Zod-Schema-Typinferenz.

| Parameter     | Typ                                | Beschreibung                                                             |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                           | Tool-Name (1-64 Zeichen, beginnt mit Buchstabe, alphanumerisch und Unterstriche) |
| `description` | `string`                           | Menschlich lesbare Beschreibung dessen, was das Tool tut                  |
| `inputSchema` | `ZodRawShape`                      | Zod-Schema-Objekt, das die Eingabeparameter des Tools definiert           |
| `handler`     | `(args, extra) => Promise<Result>` | Asynchrone Funktion, die das Tool ausführt und MCP-Inhaltsblöcke zurückgibt |

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

Erstellt eine SDK-eingebettete MCP-Serverinstanz.

| Option    | Typ                      | Standard  | Beschreibung                         |
| --------- | ------------------------ | --------- | ------------------------------------ |
| `name`    | `string`                 | Erforderlich | Eindeutiger Name für den MCP-Server |
| `version` | `string`                 | `'1.0.0'` | Server-Version                       |
| `tools`   | `SdkMcpToolDefinition[]` | -         | Array von Tools, die mit `tool()` erstellt wurden |

Gibt ein `McpSdkServerConfigWithInstance`-Objekt zurück, das direkt an die `mcpServers`-Option übergeben werden kann.

#### Beispiel

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Definiere ein Tool mit Zod-Schema
const calculatorTool = tool(
  'calculate_sum',
  'Addiere zwei Zahlen',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Erstelle den MCP-Server
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Verwende den Server in einer Abfrage
const result = query({
  prompt: 'Was ist 42 + 17?',
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

### Eine Abfrage abbrechen

```typescript
import { query, isAbortError } from '@qwen-code/sdk';

const abortController = new AbortController();

const result = query({
  prompt: 'Lang laufende Aufgabe...',
  options: {
    abortController,
  },
});

// Nach 5 Sekunden abbrechen
setTimeout(() => abortController.abort(), 5000);

try {
  for await (const message of result) {
    console.log(message);
  }
} catch (error) {
  if (isAbortError(error)) {
    console.log('Abfrage wurde abgebrochen');
  } else {
    throw error;
  }
}
```

## Fehlerbehandlung

Das SDK stellt eine `AbortError`-Klasse zur Behandlung abgebrochener Abfragen bereit:

```typescript
import { AbortError, isAbortError } from '@qwen-code/sdk';

try {
  // ... Abfrageoperationen
} catch (error) {
  if (isAbortError(error)) {
    // Umgang mit dem Abbruch
  } else {
    // Umgang mit anderen Fehlern
  }
}
```