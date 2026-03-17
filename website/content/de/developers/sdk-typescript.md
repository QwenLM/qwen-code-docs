# TypeScript-SDK

## @qwen-code/sdk

Ein experimenteller Mindest-SDK für TypeScript, der programmatischen Zugriff auf Qwen Code ermöglicht.

Fühlen Sie sich frei, Feature-Anfragen, Issues oder Pull Requests einzureichen.

## Installation

```bash
npm install @qwen-code/sdk
```

## Voraussetzungen

- Node.js >= 20.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stabil), installiert und über den Pfad (`PATH`) erreichbar

> **Hinweis für Nutzer von nvm**: Falls Sie nvm zur Verwaltung Ihrer Node.js-Versionen verwenden, kann der SDK möglicherweise die Qwen-Code-Executable nicht automatisch erkennen. Legen Sie daher explizit die Option `pathToQwenExecutable` auf den vollständigen Pfad zur `qwen`-Binärdatei fest.

## Schnellstart

```typescript
import { query } from '@qwen-code/sdk';

// Einmalige Abfrage
const result = query({
  prompt: 'Welche Dateien befinden sich im aktuellen Verzeichnis?',
  options: {
    cwd: '/pfad/zum/projekt',
  },
});

// Durchlaufen der Nachrichten
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

- `prompt`: `string | AsyncIterable<SDKUserMessage>` – Die zu sendende Aufforderung. Verwenden Sie einen String für Einmal-Abfragen oder ein asynchrones Iterable für Mehrfach-Abfragen.
- `options`: `QueryOptions` – Konfigurationsoptionen für die Abfragesitzung.

#### QueryOptions

| Option                   | Typ                                            | Standardwert     | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | Das Arbeitsverzeichnis für die Abfragesitzung. Bestimmt den Kontext, in dem Dateioperationen und Befehle ausgeführt werden.                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | –                | Das zu verwendende KI-Modell (z. B. `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Hat Vorrang vor den Umgebungsvariablen `OPENAI_MODEL` und `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | Automatisch erkannt | Pfad zur Qwen Code-Ausführbare-Datei. Unterstützt mehrere Formate: `'qwen'` (native Binärdatei aus dem `PATH`), `'/Pfad/zur/qwen'` (expliziter Pfad), `'/Pfad/zur/cli.js'` (Node.js-Bundle), `'node:/Pfad/zur/cli.js'` (erzwingt Node.js-Laufzeitumgebung), `'bun:/Pfad/zur/cli.js'` (erzwingt Bun-Laufzeitumgebung). Falls nicht angegeben, wird automatisch nach folgenden Pfaden gesucht: Umgebungsvariable `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Berechtigungsmodus zur Steuerung der Genehmigung für Toolausführungen. Details finden Sie unter [Berechtigungsmodi](#permission-modes).                                                                                                                                                                                                                                                                                                                                                   |
| `canUseTool`             | `CanUseTool`                                   | –                | Benutzerdefinierter Berechtigungshandler zur Genehmigung von Toolausführungen. Wird aufgerufen, wenn ein Tool eine Bestätigung erfordert. Die Antwort muss innerhalb von 60 Sekunden erfolgen; andernfalls wird die Anfrage automatisch abgelehnt. Weitere Informationen finden Sie unter [Benutzerdefinierter Berechtigungshandler](#custom-permission-handler).                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | –                | Umgebungsvariablen, die an den Qwen Code-Prozess übergeben werden. Werden mit der aktuellen Prozess-Umgebung zusammengeführt.                                                                                                                                                                                                                                                                                                                                                              |
| `mcpServers`             | `Record<string, McpServerConfig>`              | –                | MCP-Server (Model Context Protocol), mit denen eine Verbindung hergestellt werden soll. Unterstützt externe Server (stdio/SSE/HTTP) sowie SDK-integrierte Server. Externe Server werden mit Transportoptionen wie `command`, `args`, `url`, `httpUrl` usw. konfiguriert. SDK-Server verwenden `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | –                | Controller zum Abbrechen der Abfragesitzung. Rufen Sie `abortController.abort()` auf, um die Sitzung zu beenden und Ressourcen freizugeben.                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | Aktiviert den Debug-Modus für ausführliche Protokollierung durch den CLI-Prozess.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (unbegrenzt) | Maximale Anzahl von Gesprächsrunden, bevor die Sitzung automatisch beendet wird. Eine Runde besteht aus einer Nutzernachricht und einer Antwort des Assistenten.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | –                | Entspricht `tool.core` in `settings.json`. Falls angegeben, stehen dem KI-Modell ausschließlich diese Tools zur Verfügung. Beispiel: `['read_file', 'write_file', 'run_terminal_cmd']`.                                                                                                                                                                                                                                                                                                                   |
| `excludeTools`           | `string[]`                                     | –                | Entspricht `tool.exclude` in `settings.json`. Ausgeschlossene Tools führen sofort zu einem Berechtigungsfehler. Dies hat höchste Priorität gegenüber allen anderen Berechtigungseinstellungen. Unterstützt Musterabgleich: Toolname (`'write_file'`), Toolklasse (`'ShellTool'`) oder Shell-Befehlspräfix (`'ShellTool(rm )'`).                                                                                                                                                                                      |
| `allowedTools`           | `string[]`                                     | –                | Entspricht `tool.allowed` in `settings.json`. Übereinstimmende Tools umgehen den `canUseTool`-Callback und werden automatisch ausgeführt. Diese Einstellung gilt nur, wenn das Tool eine Bestätigung erfordert. Unterstützt denselben Musterabgleich wie `excludeTools`.                                                                                                                                                                                                                                                                 |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Authentifizierungstyp für den KI-Dienst. Die Verwendung von `'qwen-oauth'` im SDK wird nicht empfohlen, da die Anmeldedaten in `~/.qwen` gespeichert werden und regelmäßig aktualisiert werden müssen.                                                                                                                                                                                                                                                                                                                          |
| `agents`                 | `SubagentConfig[]`                             | –                | Konfiguration für Unterautonome (Subagents), die während der Sitzung aufgerufen werden können. Unterautonome sind spezialisierte KI-Agenten für bestimmte Aufgaben oder Domänen.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | Wenn `true`, gibt das SDK unvollständige Nachrichten bereits während ihrer Generierung aus, sodass die Antwort der KI in Echtzeit gestreamt werden kann.                                                                                                                                                                                                                                                                                                                                                        |

### Timeouts

Das SDK erzwingt die folgenden Standard-Timeouts:

| Timeout          | Standardwert | Beschreibung                                                                                                                                 |
| ---------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 Minute     | Maximale Zeit, die der `canUseTool`-Callback benötigt, um zu antworten. Wird dieser Wert überschritten, wird die Tool-Anfrage automatisch abgelehnt. |
| `mcpRequest`     | 1 Minute     | Maximale Zeit für SDK-MCP-Tool-Aufrufe, um abgeschlossen zu werden.                                                                         |
| `controlRequest` | 1 Minute     | Maximale Zeit für Steuerungsoperationen wie `initialize()`, `setModel()`, `setPermissionMode()` und `interrupt()`, um abgeschlossen zu werden. |
| `streamClose`    | 1 Minute     | Maximale Wartezeit für den Abschluss der Initialisierung, bevor die CLI-Standardeingabe im Mehr-Runden-Modus mit SDK-MCP-Servern geschlossen wird. |

Sie können diese Timeouts über die Option `timeout` anpassen:

```typescript
const query = qwen.query('Ihr Prompt', {
  timeout: {
    canUseTool: 60000, // 60 Sekunden für den Berechtigungs-Callback
    mcpRequest: 600000, // 10 Minuten für MCP-Tool-Aufrufe
    controlRequest: 60000, // 60 Sekunden für Steuerungsanfragen
    streamClose: 15000, // 15 Sekunden Wartezeit vor dem Schließen des Streams
  },
});
```

### Nachrichtentypen

Das SDK stellt Typ-Guards bereit, um verschiedene Nachrichtentypen zu identifizieren:

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
    // Assistant-Nachricht verarbeiten
  } else if (isSDKResultMessage(message)) {
    // Ergebnisnachricht verarbeiten
  }
}
```

### Abfrage-Instanzmethoden

Die von `query()` zurückgegebene `Query`-Instanz bietet mehrere Methoden:

```typescript
const q = query({ prompt: 'Hallo', options: {} });

// Sitzungs-ID abrufen
const sessionId = q.getSessionId();

// Überprüfen, ob die Sitzung geschlossen ist
const closed = q.isClosed();

// Den aktuellen Vorgang unterbrechen
await q.interrupt();

// Berechtigungsmodus während der Sitzung ändern
await q.setPermissionMode('yolo');

// Modell während der Sitzung ändern
await q.setModel('qwen-max');

// Die Sitzung schließen
await q.close();
```

## Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:

- **`default`**: Schreib-Tools werden standardmäßig blockiert, es sei denn, sie wurden über den `canUseTool`-Callback oder in `allowedTools` freigegeben. Nur-Lese-Tools werden ohne Bestätigung ausgeführt.
- **`plan`**: Alle Schreib-Tools werden blockiert; die KI wird angewiesen, zunächst einen Plan vorzulegen.
- **`auto-edit`**: Bearbeitungs-Tools (z. B. `edit`, `write_file`) werden automatisch freigegeben, während alle anderen Tools eine Bestätigung erfordern.
- **`yolo`**: Alle Tools werden automatisch ohne Bestätigung ausgeführt.

### Prioritätskette für Berechtigungen

1. `excludeTools` – Blockiert Tools vollständig  
2. `permissionMode: 'plan'` – Blockiert alle Tools außer Nur-Lese-Tools  
3. `permissionMode: 'yolo'` – Genehmigt automatisch alle Tools  
4. `allowedTools` – Genehmigt automatisch passende Tools  
5. `canUseTool`-Callback – Benutzerdefinierte Genehmigungslogik  
6. Standardverhalten – Automatisches Verweigern im SDK-Modus  

## Beispiele

### Mehrstufiges Gespräch

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Erstelle eine Datei namens hello.txt' },
    parent_tool_use_id: null,
  };

  // Warten auf eine Bedingung oder Benutzereingabe
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Lese die Datei nun erneut ein' },
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

### Benutzerdefinierter Berechtigungshandler

```typescript
import { query, type CanUseTool } from '@qwen-code/sdk';

const canUseTool: CanUseTool = async (toolName, input, { signal }) => {
  // Alle Lesevorgänge zulassen
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Bei Schreibvorgängen den Benutzer fragen (in einer echten Anwendung)
  const userApproved = await promptUser(`Darf ${toolName} ausgeführt werden?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'Der Benutzer hat den Vorgang abgelehnt' };
};

const result = query({
  prompt: 'Erstelle eine neue Datei',
  options: {
    canUseTool,
  },
});
```

### Mit externen MCP-Servern

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Verwenden Sie das benutzerdefinierte Tool von meinem MCP-Server',
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

### Mit in das SDK integrierten MCP-Servern

Das SDK stellt die Funktionen `tool` und `createSdkMcpServer` bereit, um MCP-Server zu erstellen, die im selben Prozess wie Ihre SDK-Anwendung laufen. Dies ist nützlich, wenn Sie benutzerdefinierte Tools der KI zur Verfügung stellen möchten, ohne einen separaten Serverprozess ausführen zu müssen.

#### `tool(name, description, inputSchema, handler)`

Erstellt eine Tool-Definition mit Typanalyse anhand eines Zod-Schemas.

| Parameter     | Typ                                | Beschreibung                                                                                      |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `name`        | `string`                           | Tool-Name (1–64 Zeichen, beginnt mit einem Buchstaben, alphanumerisch mit Unterstrichen)       |
| `description` | `string`                           | Menschlich lesbare Beschreibung der Funktionalität des Tools                                     |
| `inputSchema` | `ZodRawShape`                      | Zod-Schemaobjekt, das die Eingabeparameter des Tools definiert                                   |
| `handler`     | `(args, extra) => Promise<Result>` | Asynchrone Funktion, die das Tool ausführt und MCP-Inhaltsblöcke zurückgibt                     |

Die Handler-Funktion muss ein `CallToolResult`-Objekt mit folgender Struktur zurückgeben:

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

| Option    | Typ                      | Standard  | Beschreibung                           |
| --------- | ------------------------ | --------- | -------------------------------------- |
| `name`    | `string`                 | Erforderlich | Eindeutiger Name für den MCP-Server   |
| `version` | `string`                 | `'1.0.0'` | Server-Version                         |
| `tools`   | `SdkMcpToolDefinition[]` | –         | Array von Tools, die mit `tool()` erstellt wurden |

Gibt ein Objekt vom Typ `McpSdkServerConfigWithInstance` zurück, das direkt an die Option `mcpServers` übergeben werden kann.

#### Beispiel

```typescript
import { z } from 'zod';
import { query, tool, createSdkMcpServer } from '@qwen-code/sdk';

// Definieren Sie ein Tool mit einem Zod-Schema
const calculatorTool = tool(
  'calculate_sum',
  'Addiert zwei Zahlen',
  { a: z.number(), b: z.number() },
  async (args) => ({
    content: [{ type: 'text', text: String(args.a + args.b) }],
  }),
);

// Erstellen Sie den MCP-Server
const server = createSdkMcpServer({
  name: 'calculator',
  tools: [calculatorTool],
});

// Verwenden Sie den Server in einer Abfrage
const result = query({
  prompt: 'Was ergibt 42 + 17?',
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
  prompt: 'Zeitaufwändige Aufgabe...',
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
    // Abbruch behandeln
  } else {
    // Andere Fehler behandeln
  }
}
```