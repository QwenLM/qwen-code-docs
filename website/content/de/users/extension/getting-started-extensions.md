# Erste Schritte mit Qwen Code Extensions

Diese Anleitung führt dich durch die Erstellung deiner ersten Qwen Code Extension. Du lernst, wie du eine neue Extension einrichtest, ein benutzerdefiniertes Tool über einen MCP-Server hinzufügst, einen eigenen Befehl erstellst und dem Modell mit einer `QWEN.md`-Datei Kontext bereitstellst.

## Voraussetzungen

Bevor du beginnst, stelle sicher, dass Qwen Code installiert ist und du über grundlegende Kenntnisse in Node.js und TypeScript verfügst.

## Schritt 1: Eine neue Extension erstellen

Der einfachste Einstieg gelingt mit einer der integrierten Vorlagen. Wir verwenden das `mcp-server`-Beispiel als Grundlage.

Führe den folgenden Befehl aus, um ein neues Verzeichnis namens `my-first-extension` mit den Vorlagendateien zu erstellen:

```bash
qwen extensions new my-first-extension mcp-server
```

Dadurch wird ein neues Verzeichnis mit der folgenden Struktur erstellt:

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Schritt 2: Die Extensions-Dateien verstehen

Werfen wir einen Blick auf die wichtigsten Dateien deiner neuen Extension.

### `qwen-extension.json`

Dies ist die Manifestdatei deiner Extension. Sie teilt Qwen Code mit, wie die Extension geladen und verwendet wird.

```json
{
  "name": "my-first-extension",
  "version": "1.0.0",
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["${extensionPath}${/}dist${/}example.js"],
      "cwd": "${extensionPath}"
    }
  }
}
```

- `name`: Der eindeutige Name deiner Extension.
- `version`: Die Version deiner Extension.
- `mcpServers`: Dieser Abschnitt definiert einen oder mehrere Model Context Protocol (MCP)-Server. Über MCP-Server kannst du dem Modell neue Tools zur Verfügung stellen.
  - `command`, `args`, `cwd`: Diese Felder legen fest, wie dein Server gestartet wird. Beachte die Verwendung der `${extensionPath}`-Variable, die Qwen Code durch den absoluten Pfad zum Installationsverzeichnis deiner Extension ersetzt. Dadurch funktioniert deine Extension unabhängig vom Installationsort.

### `example.ts`

Diese Datei enthält den Quellcode für deinen MCP-Server. Es handelt sich um einen einfachen Node.js-Server, der das `@modelcontextprotocol/sdk` verwendet.

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

// Registers a new tool named 'fetch_posts'
server.registerTool(
  'fetch_posts',
  {
    description: 'Fetches a list of posts from a public API.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const apiResponse = await fetch(
      'https://jsonplaceholder.typicode.com/posts',
    );
    const posts = await apiResponse.json();
    const response = { posts: posts.slice(0, 5) };
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  },
);

// ... (prompt registration omitted for brevity)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Dieser Server definiert ein einzelnes Tool namens `fetch_posts`, das Daten von einer öffentlichen API abruft.

### `package.json` und `tsconfig.json`

Dies sind Standardkonfigurationsdateien für ein TypeScript-Projekt. Die `package.json`-Datei definiert Abhängigkeiten und ein `build`-Skript, während `tsconfig.json` den TypeScript-Compiler konfiguriert.

## Schritt 3: Extension bauen und verlinken

Bevor du die Extension verwenden kannst, musst du den TypeScript-Code kompilieren und die Extension für die lokale Entwicklung mit deiner Qwen Code-Installation verlinken.

1.  **Abhängigkeiten installieren:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Server bauen:**

    ```bash
    npm run build
    ```

    Dadurch wird `example.ts` in `dist/example.js` kompiliert, die Datei, auf die in deiner `qwen-extension.json` verwiesen wird.

3.  **Extension verlinken:**

    Der `link`-Befehl erstellt einen symbolischen Link vom Extensions-Verzeichnis von Qwen Code zu deinem Entwicklungsverzeichnis. Das bedeutet, dass alle Änderungen sofort wirksam werden, ohne dass du die Extension neu installieren musst.

    ```bash
    qwen extensions link .
    ```

Starte nun deine Qwen Code-Sitzung neu. Das neue `fetch_posts`-Tool ist jetzt verfügbar. Du kannst es testen, indem du fragst: "fetch posts".

## Schritt 4: Einen benutzerdefinierten Befehl hinzufügen

Benutzerdefinierte Befehle ermöglichen es, Shortcuts für komplexe Prompts zu erstellen. Fügen wir einen Befehl hinzu, der nach einem Muster in deinem Code sucht.

1.  Erstelle ein `commands`-Verzeichnis und ein Unterverzeichnis für deine Befehlsgruppe:

    ```bash
    mkdir -p commands/fs
    ```

2.  Erstelle eine Datei namens `commands/fs/grep-code.md`:

    ```markdown
    ---
    description: Search for a pattern in code and summarize findings
    ---

    Please summarize the findings for the pattern `{{args}}`.

    Search Results:
    !{grep -r {{args}} .}
    ```

    Dieser Befehl, `/fs:grep-code`, übernimmt ein Argument, führt den `grep`-Shell-Befehl damit aus und leitet die Ergebnisse zur Zusammenfassung in einen Prompt weiter.

> **Hinweis:** Befehle verwenden das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt.

Nachdem du die Datei gespeichert hast, starte Qwen Code neu. Du kannst jetzt `/fs:grep-code "some pattern"` ausführen, um deinen neuen Befehl zu verwenden.

## Schritt 5: Benutzerdefinierte Skills und Subagents hinzufügen (Optional)

Extensions können außerdem benutzerdefinierte Skills und Subagents bereitstellen, um die Funktionen von Qwen Code zu erweitern.

### Einen benutzerdefinierten Skill hinzufügen

Skills sind modellgesteuerte Funktionen, die die KI automatisch verwendet, wenn sie relevant sind.

1.  Erstelle ein `skills`-Verzeichnis mit einem Skill-Unterverzeichnis:

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  Erstelle eine `skills/code-analyzer/SKILL.md`-Datei:

    ```markdown
    ---
    name: code-analyzer
    description: Analyzes code structure and provides insights about complexity, dependencies, and potential improvements
    ---

    # Code Analyzer

    ## Instructions

    When analyzing code, focus on:

    - Code complexity and maintainability
    - Dependencies and coupling
    - Potential performance issues
    - Suggestions for improvements

    ## Examples

    - "Analyze the complexity of this function"
    - "What are the dependencies of this module?"
    ```

### Einen benutzerdefinierten Subagent hinzufügen

Subagents sind spezialisierte KI-Assistenten für bestimmte Aufgaben.

1.  Erstelle ein `agents`-Verzeichnis:

    ```bash
    mkdir -p agents
    ```

2.  Erstelle eine `agents/refactoring-expert.md`-Datei:

    ```markdown
    ---
    name: refactoring-expert
    description: Specialized in code refactoring, improving code structure and maintainability
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    You are a refactoring specialist focused on improving code quality.

    Your expertise includes:

    - Identifying code smells and anti-patterns
    - Applying SOLID principles
    - Improving code readability and maintainability
    - Safe refactoring with minimal risk

    For each refactoring task:

    1. Analyze the current code structure
    2. Identify areas for improvement
    3. Propose refactoring steps
    4. Implement changes incrementally
    5. Verify functionality is preserved
    ```

Nach dem Neustart von Qwen Code sind deine benutzerdefinierten Skills über `/skills` und Subagents über `/agents manage` verfügbar.

## Schritt 6: Eine benutzerdefinierte `QWEN.md` hinzufügen

Du kannst dem Modell persistenten Kontext bereitstellen, indem du eine `QWEN.md`-Datei zu deiner Extension hinzufügst. Das ist nützlich, um dem Modell Anweisungen zum Verhalten oder Informationen über die Tools deiner Extension zu geben. Beachte, dass du dies nicht immer für Extensions benötigst, die primär Befehle und Prompts bereitstellen.

1.  Erstelle eine Datei namens `QWEN.md` im Stammverzeichnis deiner Extension:

    ```markdown
    # My First Extension Instructions

    You are an expert developer assistant. When the user asks you to fetch posts, use the `fetch_posts` tool. Be concise in your responses.
    ```

2.  Aktualisiere deine `qwen-extension.json`, um die CLI anzuweisen, diese Datei zu laden:

    ```json
    {
      "name": "my-first-extension",
      "version": "1.0.0",
      "contextFileName": "QWEN.md",
      "mcpServers": {
        "nodeServer": {
          "command": "node",
          "args": ["${extensionPath}${/}dist${/}example.js"],
          "cwd": "${extensionPath}"
        }
      }
    }
    ```

Starte die CLI erneut. Das Modell hat nun in jeder Sitzung, in der die Extension aktiv ist, den Kontext aus deiner `QWEN.md`-Datei.

## Schritt 7: Veröffentlichen deiner Extension

Sobald du mit deiner Extension zufrieden bist, kannst du sie mit anderen teilen. Die beiden gängigsten Methoden zum Veröffentlichen von Extensions sind über ein Git-Repository oder über GitHub Releases. Die Verwendung eines öffentlichen Git-Repositories ist die einfachste Methode.

Detaillierte Anweisungen zu beiden Methoden findest du im [Extension Releasing Guide](extension-releasing.md).

## Fazit

Du hast erfolgreich eine Qwen Code Extension erstellt! Du hast gelernt, wie du:

- eine neue Extension aus einer Vorlage aufsetzt.
- benutzerdefinierte Tools mit einem MCP-Server hinzufügst.
- praktische benutzerdefinierte Befehle erstellst.
- benutzerdefinierte Skills und Subagents hinzufügst.
- dem Modell persistenten Kontext bereitstellst.
- deine Extension für die lokale Entwicklung verlinkst.

Von hier aus kannst du erweiterte Funktionen erkunden und leistungsstarke neue Fähigkeiten in Qwen Code integrieren.