# Erste Schritte mit Qwen Code-Erweiterungen

Diese Anleitung führt Sie durch die Erstellung Ihrer ersten Qwen Code-Erweiterung. Sie erfahren, wie Sie eine neue Erweiterung einrichten, ein benutzerdefiniertes Tool über einen MCP-Server hinzufügen, einen benutzerdefinierten Befehl erstellen und dem Modell Kontext über eine `QWEN.md`-Datei bereitstellen.

## Voraussetzungen

Bevor Sie beginnen, stellen Sie sicher, dass Qwen Code installiert ist und Sie über grundlegende Kenntnisse von Node.js und TypeScript verfügen.

## Schritt 1: Eine neue Erweiterung erstellen

Der einfachste Einstieg erfolgt über eine der integrierten Vorlagen. Wir verwenden das `mcp-server`-Beispiel als unsere Grundlage.

Führen Sie den folgenden Befehl aus, um ein neues Verzeichnis namens `my-first-extension` mit den Vorlagendateien zu erstellen:

```bash
qwen extensions new my-first-extension mcp-server
```

Dadurch wird ein neues Verzeichnis mit folgender Struktur erstellt:

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Schritt 2: Verständnis der Erweiterungsdateien

Schauen wir uns die wichtigsten Dateien in Ihrer neuen Erweiterung an.

### `qwen-extension.json`

Dies ist die Manifestdatei für Ihre Erweiterung. Sie teilt Qwen Code mit, wie Ihre Erweiterung geladen und verwendet werden soll.

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

- `name`: Der eindeutige Name für Ihre Erweiterung.
- `version`: Die Version Ihrer Erweiterung.
- `mcpServers`: Dieser Abschnitt definiert einen oder mehrere Model Context Protocol (MCP)-Server. MCP-Server sind die Methode, mit der Sie neue Tools hinzufügen können, die vom Modell verwendet werden sollen.
  - `command`, `args`, `cwd`: Diese Felder geben an, wie Ihr Server gestartet werden soll. Beachten Sie die Verwendung der Variable `${extensionPath}`, die von Qwen Code durch den absoluten Pfad zum Installationsverzeichnis Ihrer Erweiterung ersetzt wird. Dadurch funktioniert Ihre Erweiterung unabhängig davon, wo sie installiert ist.

### `example.ts`

Diese Datei enthält den Quellcode für Ihren MCP-Server. Es ist ein einfacher Node.js-Server, der das `@modelcontextprotocol/sdk` verwendet.

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

// Registriert ein neues Tool mit dem Namen 'fetch_posts'
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

// ... (Prompt-Registrierung aus Platzgründen weggelassen)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Dieser Server definiert ein einzelnes Tool namens `fetch_posts`, das Daten von einer öffentlichen API abruft.

### `package.json` und `tsconfig.json`

Dies sind Standardkonfigurationsdateien für ein TypeScript-Projekt. Die Datei `package.json` definiert Abhängigkeiten und ein `build`-Skript, während `tsconfig.json` den TypeScript-Compiler konfiguriert.

## Schritt 3: Erstellen und Verknüpfen Ihrer Erweiterung

Bevor Sie die Erweiterung verwenden können, müssen Sie den TypeScript-Code kompilieren und die Erweiterung für die lokale Entwicklung mit Ihrer Qwen Code-Installation verknüpfen.

1.  **Abhängigkeiten installieren:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Den Server erstellen:**

    ```bash
    npm run build
    ```

    Dadurch wird `example.ts` in `dist/example.js` kompiliert, welche die Datei ist, auf die in Ihrer `qwen-extension.json` verwiesen wird.

3.  **Die Erweiterung verknüpfen:**

    Der Befehl `link` erstellt einen symbolischen Link vom Qwen Code-Erweiterungsverzeichnis zu Ihrem Entwicklungsverzeichnis. Das bedeutet, dass alle Änderungen, die Sie vornehmen, sofort wirksam werden, ohne dass Sie die Erweiterung neu installieren müssen.

    ```bash
    qwen extensions link .
    ```

Starten Sie nun Ihre Qwen Code-Sitzung neu. Das neue Tool `fetch_posts` steht dann zur Verfügung. Sie können es testen, indem Sie „fetch posts“ eingeben.

## Schritt 4: Einen benutzerdefinierten Befehl hinzufügen

Benutzerdefinierte Befehle bieten eine Möglichkeit, Verknüpfungen für komplexe Prompts zu erstellen. Fügen wir einen Befehl hinzu, der nach einem Muster in Ihrem Code sucht.

1.  Erstellen Sie ein Verzeichnis `commands` und ein Unterverzeichnis für Ihre Befehlsgruppe:

    ```bash
    mkdir -p commands/fs
    ```

2.  Erstellen Sie eine Datei mit dem Namen `commands/fs/grep-code.md`:

    ```markdown
    ---
    description: Suchen Sie nach einem Muster im Code und fassen Sie die Ergebnisse zusammen
    ---

    Bitte fassen Sie die Ergebnisse für das Muster `{{args}}` zusammen.

    Suchergebnisse:
    !{grep -r {{args}} .}
    ```

    Dieser Befehl, `/fs:grep-code`, nimmt ein Argument entgegen, führt den `grep`-Shell-Befehl damit aus und leitet die Ergebnisse in einen Prompt zur Zusammenfassung weiter.

> **Hinweis:** Befehle verwenden das Markdown-Format mit optionalem YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität noch unterstützt.

Nachdem Sie die Datei gespeichert haben, starten Sie Qwen Code neu. Sie können jetzt `/fs:grep-code "irgendein muster"` ausführen, um Ihren neuen Befehl zu verwenden.

## Schritt 5: Benutzerdefinierte Fähigkeiten und Subagenten hinzufügen (optional)

Erweiterungen können auch benutzerdefinierte Fähigkeiten und Subagenten bereitstellen, um die Funktionalität von Qwen Code zu erweitern.

### Hinzufügen einer benutzerdefinierten Fähigkeit

Fähigkeiten sind vom Modell aufgerufene Funktionen, die die KI automatisch nutzen kann, wenn sie relevant sind.

1.  Erstellen Sie ein Verzeichnis `skills` mit einem Unterverzeichnis für die Fähigkeit:

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  Erstellen Sie eine Datei `skills/code-analyzer/SKILL.md`:

    ```markdown
    ---
    name: code-analyzer
    description: Analysiert die Code-Struktur und liefert Einblicke zu Komplexität, Abhängigkeiten und potenziellen Verbesserungen
    ---

    # Code-Analysator

    ## Anweisungen

    Bei der Analyse von Code achten Sie auf:

    - Code-Komplexität und Wartbarkeit
    - Abhängigkeiten und Kopplung
    - Mögliche Leistungsprobleme
    - Vorschläge zur Verbesserung

    ## Beispiele

    - "Analysiere die Komplexität dieser Funktion"
    - "Welche Abhängigkeiten hat dieses Modul?"
    ```

### Hinzufügen eines benutzerdefinierten Subagenten

Subagenten sind spezialisierte KI-Assistenten für bestimmte Aufgaben.

1.  Erstellen Sie ein Verzeichnis `agents`:

    ```bash
    mkdir -p agents
    ```

2.  Erstellen Sie eine Datei `agents/refactoring-expert.md`:

    ```markdown
    ---
    name: refactoring-expert
    description: Spezialisiert auf Code-Refactoring, Verbesserung der Code-Struktur und Wartbarkeit
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    Sie sind ein Refactoring-Spezialist mit Fokus auf die Verbesserung der Code-Qualität.

    Zu Ihrem Fachwissen gehören:

    - Identifizierung von Code-Smells und Anti-Patterns
    - Anwendung der SOLID-Prinzipien
    - Verbesserung der Code-Lesbarkeit und Wartbarkeit
    - Sicheres Refactoring mit minimalem Risiko

    Für jede Refactoring-Aufgabe:

    1. Analysieren Sie die aktuelle Code-Struktur
    2. Identifizieren Sie Bereiche zur Verbesserung
    3. Schlagen Sie Refactoring-Schritte vor
    4. Implementieren Sie Änderungen schrittweise
    5. Stellen Sie sicher, dass die Funktionalität erhalten bleibt
    ```

Nach dem Neustart von Qwen Code stehen Ihre benutzerdefinierten Skills über `/skills` und Subagenten über `/agents manage` zur Verfügung.

## Schritt 6: Hinzufügen einer benutzerdefinierten `QWEN.md`

Sie können dem Modell einen persistenten Kontext bereitstellen, indem Sie Ihrer Erweiterung eine Datei namens `QWEN.md` hinzufügen. Dies ist nützlich, um dem Modell Anweisungen darüber zu geben, wie es sich verhalten soll, oder Informationen über die Tools Ihrer Erweiterung bereitzustellen. Beachten Sie, dass dies für Erweiterungen, die lediglich Befehle und Eingabeaufforderungen bereitstellen sollen, nicht immer erforderlich ist.

1.  Erstellen Sie eine Datei mit dem Namen `QWEN.md` im Stammverzeichnis Ihres Erweiterungsordners:

    ```markdown
    # Anweisungen für meine erste Erweiterung

    Sie sind ein Experte für Entwickler-Assistenz. Wenn der Benutzer Sie bittet, Beiträge abzurufen, verwenden Sie das Tool `fetch_posts`. Seien Sie in Ihren Antworten prägnant.
    ```

2.  Aktualisieren Sie Ihre `qwen-extension.json`, damit die CLI diese Datei lädt:

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

Starten Sie die CLI erneut. Das Modell hat nun in jeder Sitzung, in der die Erweiterung aktiv ist, den Kontext aus Ihrer `QWEN.md`-Datei zur Verfügung.

## Schritt 7: Veröffentlichen Ihrer Erweiterung

Sobald Sie mit Ihrer Erweiterung zufrieden sind, können Sie sie mit anderen teilen. Die beiden Hauptmöglichkeiten zur Veröffentlichung von Erweiterungen sind über ein Git-Repository oder über GitHub Releases. Die Verwendung eines öffentlichen Git-Repositories ist die einfachste Methode.

Ausführliche Anweisungen zu beiden Methoden finden Sie im [Leitfaden zur Veröffentlichung von Erweiterungen](extension-releasing.md).

## Fazit

Sie haben erfolgreich eine Qwen Code-Erweiterung erstellt! Sie haben gelernt, wie man:

- Eine neue Erweiterung aus einer Vorlage initialisiert.
- Benutzerdefinierte Tools mit einem MCP-Server hinzufügt.
- Bequeme benutzerdefinierte Befehle erstellt.
- Benutzerdefinierte Skills und Subagenten hinzufügt.
- Dem Modell persistenten Kontext bereitstellt.
- Ihre Erweiterung für die lokale Entwicklung verknüpft.

Von hier aus können Sie weitere fortgeschrittene Funktionen erkunden und leistungsstarke neue Fähigkeiten in Qwen Code integrieren.