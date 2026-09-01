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
- [Qwen Code](https://github.com/QwenLM/qwen-code) >= 0.4.0 (stabil). Das SDK verwendet standardmäßig seine mitgelieferte CLI; setze `pathToQwenExecutable` nur, wenn du eine eigene `qwen`-Binärdatei oder ein CLI-Bundle ausführen möchtest.

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
| `pathToQwenExecutable`   | `string`                                       | Mitgelieferte CLI | Pfad zur ausführbaren Qwen Code-Datei. Unterstützt mehrere Formate: `'qwen'` (native Binärdatei aus PATH), `'/pfad/zu/qwen'` (expliziter Pfad), `'/pfad/zu/cli.js'` (Node.js-Bundle), `'node:/pfad/zu/cli.js'` (Node.js-Laufzeitumgebung erzwingen), `'bun:/pfad/zu/cli.js'` (Bun-Laufzeitumgebung erzwingen). Wenn nicht angegeben, verwendet das SDK die mit dem Paket mitgelieferte CLI. |
| `permissionMode`         | `'default' \| 'plan' \| 'auto-edit' \| 'auto' \| 'yolo'` | `'default'`      | Berechtigungsmodus zur Steuerung der Ausführungsgenehmigung von Tools. Siehe [Berechtigungsmodi](#berechtigungsmodi) für Details.                                                                                                                                                                                                                                                                                                                                                                           |
| `canUseTool`             | `CanUseTool`                                   | -                | Benutzerdefinierter Berechtigungs-Handler für die Genehmigung der Tool-Ausführung. Wird aufgerufen, wenn ein Tool eine Bestätigung benötigt. Muss innerhalb von 60 Sekunden antworten, andernfalls wird die Anfrage automatisch abgelehnt. Siehe [Benutzerdefinierter Berechtigungs-Handler](#benutzerdefinierter-berechtigungs-handler).                                                                                                                                                                                                                                                     |
| `env`                    | `Record<string, string>`                       | -                | Umgebungsvariablen, die an den Qwen Code-Prozess übergeben werden. Werden mit der aktuellen Prozessumgebung zusammengeführt.                                                                                                                                                                                                                                                                                                                                                                                  |
| `systemPrompt`           | `string \| QuerySystemPromptPreset`            | -                | System-Prompt-Konfiguration für die Hauptsitzung. Verwende einen String, um den eingebauten Qwen Code-System-Prompt vollständig zu überschreiben, oder ein Preset-Objekt, um den eingebauten Prompt zu behalten und zusätzliche Anweisungen anzuhängen.                                                                                                                                                                                                                                                                                  |
| `mcpServers`             | `Record<string, McpServerConfig>`              | -                | MCP-Server (Model Context Protocol), mit denen verbunden werden soll. Unterstützt externe Server (stdio/SSE/HTTP) und SDK-eingebettete Server. Externe Server werden mit Transport-Optionen wie `command`, `args`, `url`, `httpUrl` usw. konfiguriert. SDK-Server verwenden `{ type: 'sdk', name: string, instance: Server }`.                                                                                                                                                                                        |
| `abortController`        | `AbortController`                              | -                | Controller zum Abbrechen der Query-Sitzung. Rufe `abortController.abort()` auf, um die Sitzung zu beenden und Ressourcen freizugeben.                                                                                                                                                                                                                                                                                                                                                                |
| `debug`                  | `boolean`                                      | `false`          | Aktiviert den Debug-Modus für ausführliche Protokollierung durch den CLI-Prozess.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxSessionTurns`        | `number`                                       | `-1` (unbegrenzt) | Maximale Anzahl von Konversationsdurchläufen, bevor die Sitzung automatisch beendet wird. Muss eine ganze Zahl sein. Ein Durchlauf besteht aus einer Benutzernachricht und einer Assistant-Antwort.                                                                                                                                                                                                                                                                                                                                        |
| `coreTools`              | `string[]`                                     | -                | Verwendet die alte `coreTools`-/CLI `--core-tools`-Allowlist-Semantik. Wenn angegeben, werden nur passende Core-Tools für die Sitzung registriert. Dies ist die einzige Allowlist-Option, die die Registrierung eingebauter Tools einschränkt; eine Whole-Tool `permissions.deny`-/`excludeTools`-Regel (und `tools.disabled` in settings.json) entfernt ein Tool ebenfalls aus der Registry. `permissions.allow` in settings.json ist reine Auto-Genehmigung und entfernt, degradiert oder versteckt niemals ein Tool (#10075). Um das Schema eines Tools aus der anfänglichen Modell-Anfrage herauszuhalten, verwende `tools.eager` in settings.json (erfordert Neustart, #9827); um es vollständig zu entfernen, verwende eine Whole-Tool `excludeTools`-/`permissions.deny`-Regel – eine Regel mit einem Spezifizierer (wie `'Bash(rm *)'`) verweigert nur passende Aufrufe zur Laufzeit. MCP-Tools sind von der deny-basierten Entfernung ausgenommen: Verstecke sie stattdessen mit den serverbezogenen `excludeTools`-/`tools.disabled`-Filtern (deny blockiert weiterhin deren Aufrufe zur Laufzeit). Beispiel: `['read_file', 'edit', 'run_shell_command']`. |
| `excludeTools`           | `string[]`                                     | -                | Entspricht `permissions.deny` in settings.json. Ausgeschlossene Tools geben sofort einen Berechtigungsfehler zurück. Hat höchste Priorität gegenüber allen anderen Berechtigungseinstellungen. Unterstützt Toolnamen-Alias und Mustervergleich: Toolname (`'write_file'`), Shell-Befehlspräfix (`'Bash(rm *)'`) oder Pfadmuster (`'Read(.env)'`, `'Edit(/src/**)'`).                                                                                                                                         |
| `allowedTools`           | `string[]`                                     | -                | Entspricht `permissions.allow` in settings.json für die Auto-Genehmigung. Passende Tools umgehen den `canUseTool`-Callback und werden automatisch ausgeführt. Gilt nur, wenn das Tool eine Bestätigung erfordert. Wie `permissions.allow` ist dies reine Auto-Genehmigung und beeinflusst niemals, welche Tools registriert sind oder welche Schemas gesendet werden (#10075). Unterstützt denselben Mustervergleich wie `excludeTools`. Beispiel: `['Bash(git status)', 'Bash(npm test)']`. |
| `authType`               | `'openai' \| 'anthropic' \| 'qwen-oauth' \| 'gemini' \| 'vertex-ai'` | -                | Authentifizierungstyp für den KI-Dienst. Wenn angegeben, leitet das SDK ihn als `--auth-type` an die CLI weiter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `agents`                 | `SubagentConfig[]`                             | -                | Konfiguration für Subagenten, die während der Sitzung aufgerufen werden können. Subagenten sind spezialisierte KI-Agenten für bestimmte Aufgaben oder Bereiche.                                                                                                                                                                                                                                                                                                                                                |
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
import { query } from '@qwen-code/sdk';

const q = query({
  prompt: 'Your prompt',
  options: {
    timeout: {
      canUseTool: 60000, // 60 seconds for permission callback
      mcpRequest: 600000, // 10 minutes for MCP tool calls
      controlRequest: 60000, // 60 seconds for control requests
      streamClose: 15000, // 15 seconds for stream close wait
    },
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

`interrupt()` bricht nur den aktiven Turn ab. Bei einer Multi-Turn-Query, die mit einem asynchronen iterierbaren Prompt erstellt wurde, bleiben die Query und ihr Input-Stream offen, sodass spätere Nachrichten aus dem Iterable normal verarbeitet werden. Verwende `close()` oder breche den konfigurierten `AbortController` ab, wenn du die gesamte Session beenden möchtest.

## Vom Caller bereitgestellte Session-IDs im Daemon

`DaemonClient.createOrAttachSession` akzeptiert eine optionale `sessionId` für Caller, die eine Identität vor der Session-Erstellung persistieren müssen:

```typescript
import { DaemonClient } from '@qwen-code/sdk';

const daemon = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });
const session = await daemon.createOrAttachSession({
  workspaceCwd: '/path/to/project',
  sessionId: '550E8400-E29B-41D4-A716-446655440000',
});

console.log(session.sessionId); // 550e8400-e29b-41d4-a716-446655440000
```

Das SDK benötigt die `session_id_override`-Capability des Daemons vor dem Senden der Mutation. Der REST-Modus serialisiert `sessionId` direkt; ein aktiver ACP-Adapter mappt es auf `session/new._meta["qwen-code/sessionId"]`. Das SDK überprüft die Erfolgsantwort und wirft `DaemonSessionIdProtocolError`, wenn der Daemon eine andere ID zurückgibt.

Diese Option erzeugt immer eine neue Thread-Session und ist kein idempotentes Attach. Wenn das Ergebnis der Erstellung mehrdeutig ist, verwende die bekannte ID mit Load oder Resume. Das Weglassen der Option behält das bestehende Create-or-Attach-Verhalten bei.

## Berechtigungsmodi

Das SDK unterstützt verschiedene Berechtigungsmodi zur Steuerung der Tool-Ausführung:

- **`default`**: Schreib-Tools werden abgelehnt, sofern sie nicht über den `canUseTool`-Callback oder in `allowedTools` genehmigt werden. Schreibgeschützte Tools werden ohne Bestätigung ausgeführt.
- **`plan`**: Blockiert alle Schreib-Tools und weist die KI an, zuerst einen Plan vorzulegen.
- **`auto-edit`**: Bearbeitungstools (`edit`, `write_file`, `notebook_edit`) werden automatisch genehmigt, während andere Tools eine Bestätigung erfordern.
- **`auto`**: Verwendet den eingebauten Klassifikator, um sichere Tool-Aufrufe automatisch zu genehmigen und riskante zu blockieren, mit Fallback auf manuelle Genehmigung nach wiederholten Policy-Blockaden oder Klassifikator-Ausfällen.
- **`yolo`**: Alle Tools werden automatisch ohne Bestätigung ausgeführt.

### Berechtigungsprioritätskette

Entscheidungspriorität (höchste zuerst): `deny` > `ask` > `allow` > _(Standard-/Interaktivmodus)_

Die erste passende Regel gewinnt.

1. `excludeTools` / `permissions.deny` – Blockiert Tools vollständig (gibt Berechtigungsfehler zurück)
2. `permissions.ask` – Erfordert immer eine Benutzerbestätigung
3. `permissionMode: 'plan'` – Blockiert alle nicht schreibgeschützten Tools
4. `permissionMode: 'yolo'` – Genehmigt alle Tools automatisch
5. `allowedTools` / `permissions.allow` – Genehmigt passende Tools automatisch
6. `permissionMode: 'auto'` – Klassifikator-vermittelte Genehmigung für verbleibende Tools
7. `canUseTool`-Callback – Benutzerdefinierte Genehmigungslogik (wenn angegeben, wird er nicht für genehmigte Tools aufgerufen)
8. Standardverhalten – Automatische Ablehnung im SDK-Modus (Schreib-Tools erfordern explizite Genehmigung)

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

Das SDK bietet `tool` und `createSdkMcpServer`, um MCP-Server zu erstellen, die im selben Prozess wie Ihre SDK-Anwendung laufen. Dies ist nützlich, wenn du benutzerdefinierte Tools für die KI bereitstellen möchtest, ohne einen separaten Serverprozess auszuführen.

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

// Abbruch nach 5 Sekunden
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
    // Abort behandeln
  } else {
    // Andere Fehler behandeln
  }
}
```