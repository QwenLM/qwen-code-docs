# Typescript SDK

## @qwen-code/sdk

Ein minimales experimentelles TypeScript SDK für den programmatischen Zugriff auf Qwen Code.

Reichen Sie gerne eine Funktionsanfrage/ein Issue/einen PR ein.

## Installation

```bash
npm install @qwen-code/sdk
```

## Voraussetzungen

- Node.js >= 22.0.0
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stabil) installiert und über PATH zugänglich

> **Hinweis für nvm-Benutzer**: Wenn Sie nvm zur Verwaltung von Node.js-Versionen verwenden, kann das SDK die ausführbare Qwen Code-Datei möglicherweise nicht automatisch erkennen. Sie sollten die Option `pathToQwenExecutable` explizit auf den vollständigen Pfad der `qwen`-Binärdatei setzen.

## Schnellstart

```typescript
import { query } from '@qwen-code/sdk';

// Einmalige Abfrage
const result = query({
  prompt: 'Which files are in the current directory?',
  options: {
    cwd: '/path/to/project',
  },
});

// Über Nachrichten iterieren
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

Erstellt eine neue Abfragesitzung mit dem Qwen Code.

#### Parameter

- `prompt`: `string | AsyncIterable<SDKUserMessage>` – Die zu sendende Eingabe. Verwenden Sie einen String für einmalige Abfragen oder einen asynchronen Iterator für Unterhaltungen mit mehreren Turns.
- `options`: `QueryOptions` – Konfigurationsoptionen für die Abfragesitzung.

#### QueryOptions

| Option                  | Typ                                             | Standard          | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`                   | `string`                                        | `process.cwd()`   | Das Arbeitsverzeichnis für die Abfragesitzung. Bestimmt den Kontext, in dem Dateioperationen und Befehle ausgeführt werden.                                                                                                                                                                                                                                                                                                                                                                          |
| `model`                 | `string`                                        | -                 | Das zu verwendende KI-Modell (z.B. `'qwen-max'`, `'qwen-plus'`, `'qwen-turbo'`). Hat Vorrang vor den Umgebungsvariablen `OPENAI_MODEL` und `QWEN_MODEL`.                                                                                                                                                                                                                                                                                                                                              |
| `pathToQwenExecutable`  | `string`                                        | Automatisch erkannt | Pfad zur ausführbaren Qwen Code-Datei. Unterstützt mehrere Formate: `'qwen'` (native Binärdatei aus PATH), `'/path/to/qwen'` (expliziter Pfad), `'/path/to/cli.js'` (Node.js-Bundle), `'node:/path/to/cli.js'` (erzwingt Node.js-Runtime), `'bun:/path/to/cli.js'` (erzwingt Bun-Runtime). Wenn nicht angegeben, erfolgt die automatische Erkennung aus: Umgebungsvariable `QWEN_CODE_CLI_PATH`, `~/.volta/bin/qwen`, `~/.npm-global/bin/qwen`, `/usr/local/bin/qwen`, `~/.local/bin/qwen`, `~/node_modules/.bin/qwen`, `~/.yarn/bin/qwen`. |
| `permissionMode`        | `'default' \| 'plan' \| 'auto-edit' \| 'yolo'`  | `'default'`       | Berechtigungsmodus zur Steuerung der Werkzeugausführungsgenehmigung. Siehe [Berechtigungsmodi](#permission-modes) für Details.                                                                                                                                                                                                                                                                                                                                                                       |
| `canUseTool`            | `CanUseTool`                                    | -                 | Benutzerdefinierter Berechtigungshandler für die Genehmigung von Werkzeugausführungen. Wird aufgerufen, wenn ein Werkzeug eine Bestätigung benötigt. Muss innerhalb von 60 Sekunden antworten, andernfalls wird die Anfrage automatisch abgelehnt. Siehe [Benutzerdefinierter Berechtigungshandler](#custom-permission-handler).                                                                                                                                                                      |
| `env`                   | `Record<string, string>`                        | -                 | Umgebungsvariablen, die an den Qwen Code-Prozess übergeben werden. Werden mit der aktuellen Prozessumgebung zusammengeführt.                                                                                                                                                                                                                                                                                                                                                                          |
| `systemPrompt`          | `string \| QuerySystemPromptPreset`             | -                 | System-Prompt-Konfiguration für die Hauptsitzung. Verwenden Sie einen String, um den integrierten Qwen Code-System-Prompt vollständig zu überschreiben, oder ein Preset-Objekt, um den integrierten Prompt beizubehalten und zusätzliche Anweisungen anzuhängen.                                                                                                                                                                                                                                      |
| `mcpServers`            | `Record<string, McpServerConfig>`               | -                 | MCP-Server (Model Context Protocol), zu denen eine Verbindung hergestellt werden soll. Unterstützt externe Server (stdio/SSE/HTTP) und im SDK eingebettete Server. Externe Server werden mit Transportoptionen wie `command`, `args`, `url`, `httpUrl` usw. konfiguriert. SDK-Server verwenden `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                    |
| `abortController`       | `AbortController`                               | -                 | Controller zum Abbrechen der Abfragesitzung. Rufen Sie `abortController.abort()` auf, um die Sitzung zu beenden und Ressourcen freizugeben.                                                                                                                                                                                                                                                                                                                                                          |
| `debug`                 | `boolean`                                       | `false`           | Debug-Modus für ausführliche Protokollierung des CLI-Prozesses aktivieren.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`       | `number`                                        | `-1` (unbegrenzt) | Maximale Anzahl von Gesprächsrunden, bevor die Sitzung automatisch beendet wird. Eine Runde besteht aus einer Benutzernachricht und einer Antwort des Assistenten.                                                                                                                                                                                                                                                                                                                                    |
| `coreTools`             | `string[]`                                      | -                 | Verwendet die veraltete `coreTools`- / CLI-`--core-tools`-Whitelist-Semantik. Wenn angegeben, werden nur passende Kernwerkzeuge für die Sitzung registriert. Dies ist getrennt von `permissions.allow`, das passende Werkzeugaufrufe automatisch genehmigt, aber die Werkzeugregistrierung nicht einschränkt. Beispiel: `['read_file', 'edit', 'run_shell_command']`.                                                                                                                                 |
| `excludeTools`          | `string[]`                                      | -                 | Entspricht `permissions.deny` in settings.json. Ausgeschlossene Werkzeuge geben sofort einen Berechtigungsfehler zurück. Hat die höchste Priorität vor allen anderen Berechtigungseinstellungen. Unterstützt Werkzeugnamen-Aliasse und Platzhaltermuster: Werkzeugname (`'write_file'`), Shell-Befehlspräfix (`'Bash(rm *)'`) oder Pfadmuster (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                                    |
| `allowedTools`          | `string[]`                                      | -                 | Entspricht `permissions.allow` in settings.json. Passende Werkzeuge umgehen den `canUseTool`-Callback und werden automatisch ausgeführt. Gilt nur, wenn das Werkzeug eine Bestätigung erfordert. Unterstützt dieselbe Platzhaltermuster wie `excludeTools`. Beispiel: `['Bash(git status)', 'Bash(npm test)']`.                                                                                                                                                                                      |
| `authType`              | `'openai' \| 'qwen-oauth'`                      | `'openai'`        | Authentifizierungstyp für den KI-Dienst. Der Qwen-OAuth-Free-Tier wurde am 15.04.2026 eingestellt; neue SDK-Einrichtungen sollten die OpenAI-kompatible Authentifizierung oder einen anderen unterstützten Anbieter verwenden.                                                                                                                                                                                                                                                                       |
| `agents`                | `SubagentConfig[]`                              | -                 | Konfiguration für Unteragenten, die während der Sitzung aufgerufen werden können. Unteragenten sind spezialisierte KI-Agenten für bestimmte Aufgaben oder Domänen.                                                                                                                                                                                                                                                                                                                                    |
| `includePartialMessages`| `boolean`                                       | `false`           | Wenn `true`, sendet das SDK unvollständige Nachrichten, während sie generiert werden, was ein Echtzeit-Streaming der KI-Antwort ermöglicht.                                                                                                                                                                                                                                                                                                                                                          |
| `resume`                | `string`                                        | -                 | Setzt eine vorherige Sitzung fort, indem deren Sitzungs-ID angegeben wird. Entspricht dem CLI-Flag `--resume`.                                                                                                                                                                                                                                                                                                                                                                                       |
| `sessionId`             | `string`                                        | -                 | Gibt eine Sitzungs-ID für die neue Sitzung an. Stellt sicher, dass SDK und CLI dieselbe ID verwenden, ohne den Verlauf fortzusetzen. Entspricht dem CLI-Flag `--session-id`.                                                                                                                                                                                                                                                                                                                         |
> [!note]
> Für `coreTools` funktionieren auch Aliase wie `Read`, `Edit` und `Bash`, aber Aufruf-Spezifizierer wie `Bash(git *)` werden entfernt. `coreTools` schränkt die Tool-Registrierung ein, nicht die Aufrufmuster.

### Timeouts

Das SDK erzwingt die folgenden Standard-Timeouts:

| Timeout          | Standard | Beschreibung                                                                                                                          |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `canUseTool`     | 1 Minute | Maximale Zeit, die der `canUseTool`-Callback zum Antworten hat. Bei Überschreitung wird die Tool-Anfrage automatisch abgelehnt. |
| `mcpRequest`     | 1 Minute | Maximale Zeit für die Ausführung von SDK-MCP-Toolaufrufen.                                                                             |
| `controlRequest` | 1 Minute | Maximale Zeit für Steuerungsvorgänge wie `initialize()`, `setModel()`, `setPermissionMode()`, `getContextUsage()` und `interrupt()`. |
| `streamClose`    | 1 Minute | Maximale Wartezeit auf den Abschluss der Initialisierung, bevor die CLI-Standardeingabe im Multi-Turn-Modus mit SDK-MCP-Servern geschlossen wird. |

Sie können diese Timeouts über die Option `timeout` anpassen:

```typescript
const query = qwen.query('Your prompt', {
  timeout: {
    canUseTool: 60000, // 60 Sekunden für den Berechtigungs-Callback
    mcpRequest: 600000, // 10 Minuten für MCP-Toolaufrufe
    controlRequest: 60000, // 60 Sekunden für Steuerungsanfragen
    streamClose: 15000, // 15 Sekunden für das Stream-Schließen
  },
});
```

### Nachrichtentypen

Das SDK stellt Typwächter zur Identifizierung verschiedener Nachrichtentypen bereit:

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
    // Assistentennachricht verarbeiten
  } else if (isSDKResultMessage(message)) {
    // Ergebnisnachricht verarbeiten
  }
}
```

### Methoden der Query-Instanz

Die von `query()` zurückgegebene `Query`-Instanz stellt verschiedene Methoden bereit:

```typescript
const q = query({ prompt: 'Hello', options: {} });

// Sitzungs-ID abrufen
const sessionId = q.getSessionId();

// Prüfen, ob geschlossen
const closed = q.isClosed();

// Aktuellen Vorgang unterbrechen
await q.interrupt();

// Berechtigungsmodus während der Sitzung ändern
await q.setPermissionMode('yolo');

// Modell während der Sitzung wechseln
await q.setModel('qwen-max');

// Nutzungsaufschlüsselung des Kontextfensters abrufen (Tokenanzahl pro Kategorie)
const usage = await q.getContextUsage();
// true übergeben, um anzuzeigen, dass Details pro Element angezeigt werden sollen
const detail = await q.getContextUsage(true);

// Sitzung schließen
await q.close();
```

## Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:

- **`default`**: Schreib-Tools werden abgelehnt, es sei denn, sie werden über den `canUseTool`-Callback oder in `allowedTools` genehmigt. Nur-Lese-Tools werden ohne Bestätigung ausgeführt.
- **`plan`**: Blockiert alle Schreib-Tools und weist das KI-Modell an, zuerst einen Plan vorzulegen.
- **`auto-edit`**: Bearbeitungs-Tools (`edit`, `write_file`, `notebook_edit`) werden automatisch genehmigt, während andere Tools eine Bestätigung erfordern.
- **`yolo`**: Alle Tools werden automatisch ohne Bestätigung ausgeführt.

### Berechtigungsprioritätskette

Entscheidungspriorität (höchste zuerst): `deny` > `ask` > `allow` > _(Standard/Interaktivmodus)_

Die erste übereinstimmende Regel gewinnt.

1. `excludeTools` / `permissions.deny` – Blockiert Tools vollständig (gibt einen Berechtigungsfehler zurück)
2. `permissions.ask` – Erfordert immer eine Benutzerbestätigung
3. `permissionMode: 'plan'` – Blockiert alle nicht lesenden Tools
4. `permissionMode: 'yolo'` – Genehmigt automatisch alle Tools
5. `allowedTools` / `permissions.allow` – Genehmigt automatisch passende Tools
6. `canUseTool`-Callback – Benutzerdefinierte Genehmigungslogik (falls angegeben, wird er für bereits genehmigte Tools nicht aufgerufen)
7. Standardverhalten – Automatische Ablehnung im SDK-Modus (Schreib-Tools erfordern explizite Genehmigung)

## Beispiele

### Multi-Turn-Konversation

```typescript
import { query, type SDKUserMessage } from '@qwen-code/sdk';

async function* generateMessages(): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Erstelle eine hello.txt-Datei' },
    parent_tool_use_id: null,
  };

  // Auf eine Bedingung oder Benutzereingabe warten
  yield {
    type: 'user',
    session_id: 'my-session',
    message: { role: 'user', content: 'Lies die Datei jetzt zurück' },
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
  // Alle Lesevorgänge zulassen
  if (toolName.startsWith('read_')) {
    return { behavior: 'allow', updatedInput: input };
  }

  // Benutzer bei Schreibvorgängen um Bestätigung bitten (in einer echten Anwendung)
  const userApproved = await promptUser(`${toolName} erlauben?`);

  if (userApproved) {
    return { behavior: 'allow', updatedInput: input };
  }

  return { behavior: 'deny', message: 'Benutzer hat den Vorgang abgelehnt' };
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

### System-Prompt überschreiben

```typescript
import { query } from '@qwen-code/sdk';

const result = query({
  prompt: 'Say hello in one sentence.',
  options: {
    systemPrompt: 'You are a terse assistant. Answer in exactly one sentence.',
  },
});
```

### An den integrierten System-Prompt anhängen

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

Das SDK bietet `tool` und `createSdkMcpServer`, um MCP-Server zu erstellen, die im selben Prozess wie Ihre SDK-Anwendung laufen. Dies ist nützlich, wenn Sie dem KI-Modell benutzerdefinierte Tools zur Verfügung stellen möchten, ohne einen separaten Serverprozess auszuführen.

#### `tool(name, description, inputSchema, handler)`

Erstellt eine Tool-Definition mit Zod-Schema-Typinferenz.

| Parameter     | Typ                               | Beschreibung                                                              |
| ------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `name`        | `string`                          | Tool-Name (1–64 Zeichen, beginnt mit Buchstaben, alphanumerisch und Unterstriche) |
| `description` | `string`                          | Für Menschen lesbare Beschreibung, was das Tool tut                      |
| `inputSchema` | `ZodRawShape`                     | Zod-Schema-Objekt, das die Eingabeparameter des Tools definiert          |
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

| Option    | Typ                       | Standard   | Beschreibung                          |
| --------- | ------------------------- | ---------- | ------------------------------------- |
| `name`    | `string`                  | Erforderlich | Eindeutiger Name für den MCP-Server   |
| `version` | `string`                  | `'1.0.0'`  | Serverversion                         |
| `tools`   | `SdkMcpToolDefinition[]`  | -          | Array von Tools, die mit `tool()` erstellt wurden |

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

Das SDK bietet eine `AbortError`-Klasse zur Behandlung abgebrochener Abfragen:

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
