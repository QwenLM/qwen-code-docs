# Erste Schritte mit Qwen Code Erweiterungen

Diese Anleitung führt Sie durch die Erstellung Ihrer ersten Qwen Code Erweiterung. Sie lernen, wie Sie eine neue Erweiterung einrichten, ein benutzerdefiniertes Tool über einen MCP-Server hinzufügen, einen benutzerdefinierten Befehl erstellen und dem Modell mit einer `QWEN.md`-Datei Kontext bereitstellen.

## Voraussetzungen

Bevor Sie beginnen, stellen Sie sicher, dass Qwen Code installiert ist und Sie grundlegende Kenntnisse in Node.js und TypeScript haben.

## Schritt 1: Eine neue Erweiterung erstellen

Der einfachste Weg, loszulegen, ist die Verwendung einer der integrierten Vorlagen. Wir verwenden das `mcp-server`-Beispiel als Grundlage.

Führen Sie den folgenden Befehl aus, um ein neues Verzeichnis namens `my-first-extension` mit den Vorlagendateien zu erstellen:

```bash
qwen extensions new my-first-extension mcp-server
```

Dies erstellt ein neues Verzeichnis mit der folgenden Struktur:

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Schritt 2: Die Erweiterungsdateien verstehen

Sehen wir uns die wichtigsten Dateien Ihrer neuen Erweiterung an.

### `qwen-extension.json`

Dies ist die Manifestdatei Ihrer Erweiterung. Sie teilt Qwen Code mit, wie die Erweiterung geladen und verwendet werden soll.

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

- `name`: Der eindeutige Name Ihrer Erweiterung.
- `version`: Die Version Ihrer Erweiterung.
- `mcpServers`: Dieser Abschnitt definiert einen oder mehrere Model Context Protocol (MCP)-Server. MCP-Server sind die Art und Weise, wie Sie dem Modell neue Tools zur Nutzung hinzufügen können.
  - `command`, `args`, `cwd`: Diese Felder geben an, wie Ihr Server gestartet werden soll. Beachten Sie die Verwendung der Variable `${extensionPath}`, die von Qwen Code durch den absoluten Pfad zum Installationsverzeichnis Ihrer Erweiterung ersetzt wird. Dadurch kann Ihre Erweiterung unabhängig vom Installationsort funktionieren.

### `example.ts`

Diese Datei enthält den Quellcode für Ihren MCP-Server. Es handelt sich um einen einfachen Node.js-Server, der das `@modelcontextprotocol/sdk` verwendet.

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

// Registriert ein neues Tool namens 'fetch_posts'
server.registerTool(
  'fetch_posts',
  {
    description: 'Ruft eine Liste von Beiträgen von einer öffentlichen API ab.',
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

// ... (Prompt-Registrierung aus Gründen der Kürze ausgelassen)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Dieser Server definiert ein einzelnes Tool namens `fetch_posts`, das Daten von einer öffentlichen API abruft.

### `package.json` und `tsconfig.json`

Dies sind Standard-Konfigurationsdateien für ein TypeScript-Projekt. Die `package.json` definiert Abhängigkeiten und ein `build`-Skript, während `tsconfig.json` den TypeScript-Compiler konfiguriert.

## Schritt 3: Erweiterung erstellen und verknüpfen

Bevor Sie die Erweiterung verwenden können, müssen Sie den TypeScript-Code kompilieren und die Erweiterung für die lokale Entwicklung mit Ihrer Qwen Code-Installation verknüpfen.

1.  **Abhängigkeiten installieren:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Server erstellen:**

    ```bash
    npm run build
    ```

    Dies kompiliert `example.ts` in `dist/example.js`, die Datei, auf die in Ihrer `qwen-extension.json` verwiesen wird.

3.  **Erweiterung verknüpfen:**

    Der Befehl `link` erstellt einen symbolischen Link vom Qwen Code-Erweiterungsverzeichnis zu Ihrem Entwicklungsverzeichnis. Das bedeutet, dass alle von Ihnen vorgenommenen Änderungen sofort übernommen werden, ohne dass eine erneute Installation erforderlich ist.

    ```bash
    qwen extensions link .
    ```

Starten Sie nun Ihre Qwen Code-Sitzung neu. Das neue Tool `fetch_posts` wird verfügbar sein. Sie können es testen, indem Sie fragen: "fetch posts".

## Schritt 4: Einen benutzerdefinierten Befehl hinzufügen

Benutzerdefinierte Befehle bieten eine Möglichkeit, Abkürzungen für komplexe Prompts zu erstellen. Fügen wir einen Befehl hinzu, der nach einem Muster in Ihrem Code sucht.

1.  Erstellen Sie ein `commands`-Verzeichnis und ein Unterverzeichnis für Ihre Befehlsgruppe:

    ```bash
    mkdir -p commands/fs
    ```

2.  Erstellen Sie eine Datei mit dem Namen `commands/fs/grep-code.md`:

    ```markdown
    ---
    description: Sucht nach einem Muster im Code und fasst die Ergebnisse zusammen
    ---

    Bitte fassen Sie die Ergebnisse für das Muster `{{args}}` zusammen.

    Suchergebnisse:
    !{grep -r {{args}} .}
    ```

    Dieser Befehl (`/fs:grep-code`) nimmt ein Argument entgegen, führt den Shell-Befehl `grep` damit aus und leitet die Ergebnisse zur Zusammenfassung in einen Prompt.

> **Note:** Befehle verwenden das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt.

Nach dem Speichern der Datei starten Sie Qwen Code neu. Sie können nun `/fs:grep-code "some pattern"` ausführen, um Ihren neuen Befehl zu verwenden.

## Schritt 5: Benutzerdefinierte Skills und Subagents hinzufügen (Optional)

Erweiterungen können auch benutzerdefinierte Skills und Subagents bereitstellen, um die Fähigkeiten von Qwen Code zu erweitern.

### Einen benutzerdefinierten Skill hinzufügen

Skills sind modellgesteuerte Fähigkeiten, die die KI automatisch nutzen kann, wenn sie relevant sind.

1.  Erstellen Sie ein `skills`-Verzeichnis mit einem Skill-Unterverzeichnis:

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  Erstellen Sie eine Datei `skills/code-analyzer/SKILL.md`:

    ```markdown
    ---
    name: code-analyzer
    description: Analysiert die Codestruktur und gibt Einblicke in Komplexität, Abhängigkeiten und mögliche Verbesserungen
    ---

    # Code Analyzer

    ## Anleitung

    Konzentrieren Sie sich bei der Analyse von Code auf:

    - Codekomplexität und Wartbarkeit
    - Abhängigkeiten und Kopplung
    - Potenzielle Leistungsprobleme
    - Vorschläge für Verbesserungen

    ## Beispiele

    - "Analysiere die Komplexität dieser Funktion"
    - "Welche Abhängigkeiten hat dieses Modul?"
    ```

### Einen benutzerdefinierten Subagent hinzufügen

Subagents sind spezialisierte KI-Assistenten für bestimmte Aufgaben.

1.  Erstellen Sie ein `agents`-Verzeichnis:

    ```bash
    mkdir -p agents
    ```

2.  Erstellen Sie eine Datei `agents/refactoring-expert.md`:

    ```markdown
    ---
    name: refactoring-expert
    description: Spezialisiert auf Code-Refactoring, Verbesserung der Codestruktur und Wartbarkeit
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    Sie sind ein Refactoring-Spezialist, der sich auf die Verbesserung der Codequalität konzentriert.

    Ihr Fachwissen umfasst:

    - Erkennen von Code-Smells und Anti-Patterns
    - Anwenden der SOLID-Prinzipien
    - Verbesserung der Lesbarkeit und Wartbarkeit von Code
    - Sicheres Refactoring mit minimalem Risiko

    Gehen Sie bei jeder Refactoring-Aufgabe wie folgt vor:

    1. Analysieren Sie die aktuelle Codestruktur
    2. Identifizieren Sie Verbesserungsmöglichkeiten
    3. Schlagen Sie Refactoring-Schritte vor
    4. Implementieren Sie Änderungen schrittweise
    5. Überprüfen Sie, ob die Funktionalität erhalten bleibt
    ```

Nach einem Neustart von Qwen Code sind Ihre benutzerdefinierten Skills über `/skills` und Subagents über `/agents manage` verfügbar.

## Schritt 6: Eine benutzerdefinierte `QWEN.md` hinzufügen

Sie können dem Modell persistenten Kontext bereitstellen, indem Sie eine `QWEN.md`-Datei zu Ihrer Erweiterung hinzufügen. Dies ist nützlich, um dem Modell Anweisungen zum Verhalten oder Informationen über die Tools Ihrer Erweiterung zu geben. Beachten Sie, dass dies bei Erweiterungen, die Befehle und Prompts bereitstellen, nicht immer erforderlich ist.

1.  Erstellen Sie eine Datei mit dem Namen `QWEN.md` im Stammverzeichnis Ihres Erweiterungsverzeichnisses:

    ```markdown
    # Anleitung für meine erste Erweiterung

    Sie sind ein erfahrener Entwicklungsassistent. Wenn der Benutzer Sie bittet, Beiträge abzurufen, verwenden Sie das Tool `fetch_posts`. Seien Sie präzise in Ihren Antworten.
    ```

2.  Aktualisieren Sie Ihre `qwen-extension.json`, um der CLI mitzuteilen, dass diese Datei geladen werden soll:

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

Starten Sie die CLI erneut. Das Modell hat nun in jeder Sitzung, in der die Erweiterung aktiv ist, den Kontext aus Ihrer `QWEN.md`-Datei.

## Schritt 7: Ihre Erweiterung veröffentlichen

Sobald Sie mit Ihrer Erweiterung zufrieden sind, können Sie sie mit anderen teilen. Die beiden wichtigsten Methoden zur Veröffentlichung von Erweiterungen sind über ein Git-Repository oder über GitHub Releases. Die Verwendung eines öffentlichen Git-Repositorys ist die einfachste Methode.

Eine detaillierte Anleitung zu beiden Methoden finden Sie im [Leitfaden zur Veröffentlichung von Erweiterungen](extension-releasing.md).

## Fazit

Sie haben erfolgreich eine Qwen Code Erweiterung erstellt! Sie haben gelernt, wie man:

- Eine neue Erweiterung aus einer Vorlage erstellt
- Benutzerdefinierte Tools mit einem MCP-Server hinzufügt
- Praktische benutzerdefinierte Befehle erstellt
- Benutzerdefinierte Skills und Subagents hinzufügt
- Persistenten Kontext für das Modell bereitstellt
- Ihre Erweiterung für die lokale Entwicklung verknüpft

Von hier aus können Sie erweiterte Funktionen erkunden und leistungsstarke neue Fähigkeiten in Qwen Code integrieren.