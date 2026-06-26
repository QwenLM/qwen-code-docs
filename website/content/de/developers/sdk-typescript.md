# Typescript SDK

## @qwen-code/sdk

Ein minimales experimentelles TypeScript SDK für den programmatischen Zugriff auf Qwen Code.

Du kannst gerne einen Feature-Wunsch, ein Issue oder einen PR einreichen.

## Installation

```bash
npm install @qwen-code/sdk
```

## Voraussetzungen

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stabil) ist installiert und im PATH verfügbar

> **Hinweis für nvm-Benutzer**: Falls du nvm zur Verwaltung von Node.js-Versionen verwendest, kann das SDK die ausführbare Qwen Code-Datei möglicherweise nicht automatisch erkennen. Du solltest dann die Option `pathToQwenExecutable` explizit auf den vollständigen Pfad der `qwen`-Binärdatei setzen.

## Schnellstart

```typescript
import { query } from '@qwen-code/sdk';

// Single-Turn-Abfrage
const result = query({
  prompt: 'Welche Dateien befinden sich im aktuellen Verzeichnis?',
  options: {
    cwd: '/pfad/zum/projekt',
  },
});

// Über Nachrichten iterieren
for await (const message of result) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message.content);
  } else if (message.type === 'result') {
    console.log('Ergebnis:', message.result);
  }
}
```

## API-Referenz

### `query(config)`

Erstellt eine neue Query-Sitzung mit Qwen Code.

#### Parameter

- `prompt`: `string | AsyncIterable<SDKUserMessage>` – Der zu sendende Prompt. Verwende einen String für Single-Turn-Abfragen oder eine async iterable für Multi-Turn-Konversationen.
- `options`: `QueryOptions` – Konfigurationsoptionen für die Query-Sitzung.

#### QueryOptions

| Option                   | Typ                                           | Standard         | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                    | `string`                                       | `process.cwd()`  | Das Arbeitsverzeichnis für die Query-Sitzung. Bestimmt den Kontext, in dem Dateioperationen und Befehle ausgeführt werden.                                                                                                                                                                                                                                                                                                                                                               |
| `model`                  | `string`                                       | -                | Das zu verwendende KI-Modell (z. B. `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Überschreibt die Umgebungsvariablen `OPENAI_MODEL` und `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                 |
| `pathToQwenExecutable`   | `string`                                       | Automatisch erkannt | Pfad zur ausführbaren Qwen Code-Datei. Unterstützt mehrere Formate: `'qwen'` (native Binärdatei aus PATH), `'/pfad/zu/qwen'` (expliziter Pfad), `'/pfad/zu/cli.js'` (Node.js-Bundle), `'node:/pfad/zu/cli.js'` (Node.js-Laufzeitumgebung erzwingen), `'bun:/pfad/zu/cli.js'` (Bun-Laufzeitumgebung erzwingen). Wenn nicht angegeben, wird automatisch erkannt aus: `QWEN_CODE_CLI_PATH`-Umgebungsvariable, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'` | `'default'`      | Berechtigungsmodus zur Steuerung der Ausführungsgenehmigung von Tools. Siehe [Berechtigungsmodi](#berechtigungsmodi) für Details.                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | Benutzerdefinierter Berechtigungs-Handler für die Genehmigung der Tool-Ausführung. Wird aufgerufen, wenn ein Tool eine Bestätigung benötigt. Muss innerhalb von 60 Sekunden antworten, andernfalls wird die Anfrage automatisch abgelehnt. Siehe [Benutzerdefinierter Berechtigungs-Handler](#benutzerdefinierter-berechtigungs-handler).                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | Umgebungsvariablen, die an den Qwen Code-Prozess übergeben werden. Werden mit der aktuellen Prozessumgebung zusammengeführt.                                                                                                                                                                                                                                                                                                                                                                                  |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | System-Prompt-Konfiguration für die Hauptsitzung. Verwende einen String, um den eingebauten Qwen Code-System-Prompt vollständig zu überschreiben, oder ein Preset-Objekt, um den eingebauten Prompt zu behalten und zusätzliche Anweisungen anzuhängen.                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | MCP-Server (Model Context Protocol), mit denen verbunden werden soll. Unterstützt externe Server (stdio/SSE/HTTP) und SDK-eingebettete Server. Externe Server werden mit Transport-Optionen wie `command`, `args`, `url`, `httpUrl` usw. konfiguriert. SDK-Server verwenden `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | Controller zum Abbrechen der Query-Sitzung. Rufe `abortController.abort()` auf, um die Sitzung zu beenden und Ressourcen freizugeben.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | Aktiviert den Debug-Modus für ausführliche Protokollierung durch den CLI-Prozess.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (unbegrenzt) | Maximale Anzahl von Konversationsdurchläufen, bevor die Sitzung automatisch beendet wird. Ein Durchlauf besteht aus einer Benutzernachricht und einer Assistant-Antwort.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | Verwendet die alte `coreTools`-/CLI `--core-tools`-Allowlist-Semantik. Wenn angegeben, werden nur passende Core-Tools für die Sitzung registriert. Dies ist getrennt von `permissions.allow`, das passende Tool-Aufrufe automatisch genehmigt, aber die Tool-Registrierung nicht einschränkt. Beispiel: `['read_file', 'edit', 'run_shell_command']`.                                                                                                                                                       |
| `excludeTools`           | `string[]`                                     | -                | Entspricht `permissions.deny` in settings.json. Ausgeschlossene Tools geben sofort einen Berechtigungsfehler zurück. Hat höchste Priorität gegenüber allen anderen Berechtigungseinstellungen. Unterstützt Toolnamen-Alias und Mustervergleich: Toolname (`'write_file'`), Shell-Befehlspräfix (`'Bash(rm *)'`) oder Pfadmuster (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                                                         |
| `allowedTools`           | `string[]`                                     | -                | Entspricht `permissions.allow` in settings.json. Passende Tools umgehen den `canUseTool`-Callback und werden automatisch ausgeführt. Gilt nur, wenn das Tool eine Bestätigung erfordert. Unterstützt denselben Mustervergleich wie `excludeTools`. Beispiel: `['Bash(git status)', 'Bash(npm test)']`.                                                                                                                                                                                                         |
| `authType`               | `'openai' \| 'qwen-oauth'`                     | `'openai'`       | Authentifizierungstyp für den KI-Dienst. Der kostenlose Qwen OAuth-Tarif wurde am 2026-04-15 eingestellt; neue SDK-Setups sollten eine OpenAI-kompatible Authentifizierung oder einen anderen unterstützten Anbieter verwenden.                                                                                                                                                                                                                                                                                                |
| `agents`                 | `SubagentConfig[]`                             | -                | Konfiguration für Sub-Agenten, die während der Sitzung aufgerufen werden können. Sub-Agenten sind spezialisierte KI-Agenten für bestimmte Aufgaben oder Bereiche.                                                                                                                                                                                                                                                                                                                                                |
| `includePartialMessages` | `boolean`                                      | `false`          | Wenn `true`, sendet das SDK unvollständige Nachrichten während der Generierung, was Echtzeit-Streaming der KI-Antwort ermöglicht.                                                                                                                                                                                                                                                                                                                                                        |
| `resume`                 | `string`                                       | -                | Setze eine vorherige Sitzung durch Angabe ihrer Sitzungs-ID fort. Entspricht dem `--resume`-Flag der CLI.                                                                                                                                                                                                                                                                                                                                                                                           |
| `sessionId`              | `string`                                       | -                | Gib eine Sitzungs-ID für die neue Sitzung an. Stellt sicher, dass SDK und CLI dieselbe ID verwenden, ohne den Verlauf fortzusetzen. Entspricht dem `--session-id`-Flag der CLI.                                                                                                                                                                                                                                                                                                                                      |

> [!note]
> Bei `coreTools` funktionieren auch Aliase wie `Read`, `Edit` und `Bash`, aber Aufrufspezifizierer wie `Bash(git *)` werden entfernt. `coreTools` schränkt die Tool-Registrierung ein, nicht die Aufrufmuster.

### Timeouts

Das SDK erzwingt die folgenden Standard-Timeout-Werte:

| Timeout          | Standard | Beschreibung                                                                                                                                       |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 Minute | Maximale Zeit für die Antwort des `canUseTool`-Callbacks. Bei Überschreitung wird die Tool-Anfrage automatisch abgelehnt.                                                  |
| `mcpRequest`     | 1 Minute | Maximale Zeit für den Abschluss von SDK-MCP-Toolaufrufen.                                                                                                  |
| `controlRequest` | 1 Minute | Maximale Zeit für den Abschluss von Steuerungsoperationen wie `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()` und `interrupt()`. |
| `streamClose`    | 1 Minute | Maximale Wartezeit für den Abschluss der Initialisierung vor dem Schließen von CLI stdin im Multi-Turn-Modus mit SDK-MCP-Servern.                             |

Du kannst diese Timeouts über die Option `timeout` anpassen:

```typescript
const query = qwen.query('Dein Prompt', {
  timeout: {
    canUseTool: 60000, // 60 Sekunden für Berechtigungs-Callback
    mcpRequest: 600000, // 10 Minuten für MCP-Toolaufrufe
    controlRequest: 60000, // 60 Sekunden für Steuerungsanfragen
    streamClose: 15000, // 15 Sekunden für Wartezeit beim Stream-Schließen
  },
});
```

### Nachrichtentypen

Das SDK bietet Typwächter zur Identifizierung verschiedener Nachrichtentypen:

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

### Methoden der Query-Instanz

Die von `query()` zurückgegebene `Query`-Instanz stellt mehrere Methoden bereit:

```typescript
const q = query({ prompt: 'Hallo', options: {} });

// Sitzungs-ID abrufen
const sessionId = q.getSessionId();

// Prüfen, ob geschlossen
const closed = q.isClosed();

// Aktuelle Operation unterbrechen
await q.interrupt();

// Berechtigungsmodus während der Sitzung ändern
await q.setPermissionMode('yolo');

// Modell während der Sitzung ändern
await q.setModel('qwen-max');

// Nutzung des Kontextfensters abrufen (Token-Anzahl pro Kategorie)
const usage = await q.getContextUsage();
// true übergeben, um anzuzeigen, dass Details pro Element angezeigt werden sollen
const detail = await q.getContextUsage(true);

// Sitzung schließen
await q.close();
```

## Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:

- **`default`**: Schreib-Tools werden abgelehnt, sofern sie nicht über den `canUseTool`-Callback oder in `allowedTools` genehmigt werden. Schreibgeschützte Tools werden ohne Bestätigung ausgeführt.
- **`plan`**: Blockiert alle Schreib-Tools und weist die KI an, zuerst einen Plan vorzulegen.
- **`auto-edit`**: Bearbeitungstools (`edit`, `write_file`, `notebook_edit`) werden automatisch genehmigt, während andere Tools eine Bestätigung erfordern.
- **`yolo`**: Alle Tools werden automatisch ohne Bestätigung ausgeführt.

### Berechtigungsprioritätskette

Entscheidungspriorität (höchste zuerst): `deny` > `ask` > `allow` > _(Standard-/Interaktivmodus)_

Die erste passende Regel gewinnt.

1. `excludeTools` / `permissions.deny` – Blockiert Tools vollständig (gibt Berechtigungsfehler zurück)
2. `permissions.ask` – Erfordert immer eine Benutzerbestätigung
3. `permissionMode: 'plan'` – Blockiert alle nicht schreibgeschützten Tools
4. `permissionMode: 'yolo'` – Genehmigt alle Tools automatisch
5. `allowedTools` / `permissions.allow` – Genehmigt passende Tools automatisch
6. `canUseTool`-Callback – Benutzerdefinierte Genehmigungslogik (wenn angegeben, wird er nicht für genehmigte Tools aufgerufen)
7. Standardverhalten – Automatische Ablehnung im SDK-Modus (Schreib-Tools erfordern explizite Genehmigung)

## Beispiele

### Mehrfach-Dialog

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Erstelle eine Datei hello.txt' },
    parent_tool_use_id: null,
  };

  // Auf eine Bedingung oder Benutzereingabe warten
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Lies jetzt die Datei zurück' },
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

  // Benutzer bei Schreiboperationen um Bestätigung bitten (in einer echten Anwendung)
  const userApproved = await promptUser(`Erlaube ${toolName}?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'Benutzer hat die Operation abgelehnt' };
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
  prompt: 'Verwende das benutzerdefinierte Tool von meinem MCP-Server',
  options: {
    mcpServers: {
      'mein-server': {
        command: 'node',
        args: ['pfad/zu/mcp-server.js'],
        env: { PORT: '3000' },
      },
    },
  },
});
```

### System-Prompt überschreiben

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Sag Hallo in einem Satz.',
  options: {
    systemPrompt: 'Du bist ein knapper Assistent. Antworte in genau einem Satz.',
  },
});
```

### An den eingebauten System-Prompt anhängen

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Überprüfe das aktuelle Verzeichnis.',
  options: {
    systemPrompt: {
      type: 'preset',
      preset: 'qwen_code',
      append: 'Sei knapp und konzentriere dich auf konkrete Ergebnisse.',
    },
  },
});
```
### Mit SDK-eingebetteten MCP-Servern

Das SDK bietet `tool` und `createSdkMcpServer`, um MCP-Server zu erstellen, die im selben Prozess wie Ihre SDK-Anwendung laufen. Dies ist nützlich, wenn Sie benutzerdefinierte Tools für die KI bereitstellen möchten, ohne einen separaten Serverprozess auszuführen.

#### `tool(name, description, inputSchema, handler)`

Erstellt eine Tool-Definition mit Typinferenz über Zod-Schema.

| Parameter     | Typ                               | Beschreibung                                                          |
| ------------- | --------------------------------- | --------------------------------------------------------------------- |
| `name`        | `string`                          | Tool-Name (1-64 Zeichen, beginnt mit Buchstaben, alphanumerisch und Unterstriche) |
| `description` | `string`                          | Für Menschen lesbare Beschreibung der Funktion des Tools             |
| `inputSchema` | `ZodRawShape`                     | Zod-Schema-Objekt, das die Eingabeparameter des Tools definiert       |
| `handler`     | `(args, extra) => Promise<Result>`| Asynchrone Funktion, die das Tool ausführt und MCP-Inhaltsblöcke zurückgibt |

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

| Option    | Typ                       | Standard   | Beschreibung                                         |
| --------- | ------------------------- | ---------- | ---------------------------------------------------- |
| `name`    | `string`                  | Erforderlich | Eindeutiger Name für den MCP-Server                 |
| `version` | `string`                  | `'1.0.0'` | Serverversion                                       |
| `tools`   | `SdkMcpToolDefinition[]`  | -          | Array von Tools, die mit `tool()` erstellt wurden    |

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

### Eine Abfrage abbrechen

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

Das SDK stellt eine `AbortError`-Klasse zur Behandlung abgebrochener Abfragen bereit:

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