# Erste Schritte mit Qwen-Code-Erweiterungen

In dieser Anleitung lernen Sie, Ihre erste Qwen-Code-Erweiterung zu erstellen. Sie erfahren, wie Sie eine neue Erweiterung einrichten, über einen MCP-Server ein benutzerdefiniertes Tool hinzufügen, einen benutzerdefinierten Befehl erstellen und dem Modell mithilfe einer `QWEN.md`-Datei Kontext bereitstellen.

## Voraussetzungen

Bevor Sie beginnen, stellen Sie sicher, dass Qwen Code installiert ist und Sie über Grundkenntnisse in Node.js und TypeScript verfügen.

## Schritt 1: Erstellen einer neuen Erweiterung

Der einfachste Einstieg ist die Verwendung einer der integrierten Vorlagen. Wir verwenden das Beispiel `mcp-server` als Grundlage.

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

Werfen wir einen Blick auf die wichtigsten Dateien in Ihrer neuen Erweiterung.

### `qwen-extension.json`

Dies ist die Manifestdatei Ihrer Erweiterung. Sie teilt Qwen Code mit, wie Ihre Erweiterung geladen und verwendet werden soll.

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
- `mcpServers`: Dieser Abschnitt definiert einen oder mehrere Model Context Protocol (MCP)-Server. MCP-Server ermöglichen es Ihnen, dem Modell neue Tools zur Verfügung zu stellen.
  - `command`, `args`, `cwd`: Diese Felder geben an, wie Ihr Server gestartet wird. Beachten Sie die Verwendung der Variablen `${extensionPath}`, die Qwen Code durch den absoluten Pfad zum Installationsverzeichnis Ihrer Erweiterung ersetzt. Dadurch funktioniert Ihre Erweiterung unabhängig vom Installationsort.

### `example.ts`

Diese Datei enthält den Quellcode für Ihren MCP-Server. Es handelt sich um einen einfachen Node.js-Server, der das Paket `@modelcontextprotocol/sdk` verwendet.

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

// Registriert ein neues Tool mit dem Namen „fetch_posts“
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

// ... (Registrierung des Prompts wurde der Übersichtlichkeit halber weggelassen)

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

    Dadurch wird `example.ts` in `dist/example.js` kompiliert – die Datei, auf die in Ihrer `qwen-extension.json` verwiesen wird.

3.  **Die Erweiterung verknüpfen:**

    Der Befehl `link` erstellt eine symbolische Verknüpfung vom Qwen Code-Erweiterungsverzeichnis zu Ihrem Entwicklungsverzeichnis. Dadurch werden alle von Ihnen vorgenommenen Änderungen sofort wirksam, ohne dass eine Neuinstallation erforderlich ist.

    ```bash
    qwen extensions link .
    ```

Starten Sie nun Ihre Qwen Code-Sitzung neu. Das neue Tool `fetch_posts` steht nun zur Verfügung. Sie können es testen, indem Sie „fetch posts“ eingeben.

## Schritt 4: Benutzerdefinierten Befehl hinzufügen

Benutzerdefinierte Befehle ermöglichen es, Verknüpfungen für komplexe Eingabeaufforderungen zu erstellen. Fügen wir nun einen Befehl hinzu, der nach einem Muster in Ihrem Code sucht.

1.  Erstellen Sie ein Verzeichnis `commands` und ein Unterverzeichnis für Ihre Befehlsgruppe:

    ```bash
    mkdir -p commands/fs
    ```

2.  Erstellen Sie eine Datei namens `commands/fs/grep-code.md`:

    ```markdown
    ---
    description: Sucht nach einem Muster im Code und fasst die Ergebnisse zusammen
    ---

    Bitte fassen Sie die Ergebnisse für das Muster `{{args}}` zusammen.

    Suchergebnisse:
    !{grep -r {{args}} .}
    ```

    Dieser Befehl `/fs:grep-code` nimmt ein Argument entgegen, führt den Shell-Befehl `grep` mit diesem Argument aus und leitet die Ergebnisse an eine Eingabeaufforderung zur Zusammenfassung weiter.

> **Hinweis:** Befehle verwenden das Markdown-Format mit optionaler YAML-Frontmatter. Das TOML-Format ist veraltet, wird aber aus Gründen der Abwärtskompatibilität weiterhin unterstützt.

Nachdem Sie die Datei gespeichert haben, starten Sie Qwen Code neu. Sie können Ihren neuen Befehl nun mit `/fs:grep-code "ein bestimmtes Muster"` ausführen.

## Schritt 5: Benutzerdefinierte Skills und Unteragenten hinzufügen (optional)

Erweiterungen können auch benutzerdefinierte Skills und Unteragenten bereitstellen, um die Funktionalität von Qwen Code zu erweitern.

### Einen benutzerdefinierten Skill hinzufügen

Skills sind vom Modell aufgerufene Funktionen, die die KI automatisch nutzen kann, sobald sie relevant sind.

1.  Erstellen Sie ein Verzeichnis `skills` mit einem Unterverzeichnis für den Skill:

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  Erstellen Sie die Datei `skills/code-analyzer/SKILL.md`:

    ```markdown
    ---
    name: code-analyzer
    description: Analysiert die Code-Struktur und liefert Einblicke in Komplexität, Abhängigkeiten und mögliche Verbesserungen
    ---

    # Code-Analysator

    ## Anweisungen

    Bei der Analyse von Code konzentrieren Sie sich auf folgende Aspekte:

    - Code-Komplexität und Wartbarkeit
    - Abhängigkeiten und Kopplung
    - Mögliche Leistungsprobleme
    - Vorschläge für Verbesserungen

    ## Beispiele

    - „Analysieren Sie die Komplexität dieser Funktion.“
    - „Welche Abhängigkeiten hat dieses Modul?“
    ```

### Einen benutzerdefinierten Subagenten hinzufügen

Subagenten sind spezialisierte KI-Assistenten für bestimmte Aufgaben.

1.  Erstellen Sie ein Verzeichnis `agents`:

    ```bash
    mkdir -p agents
    ```

2.  Erstellen Sie eine Datei `agents/refactoring-expert.md`:

    ```markdown
    ---
    name: refactoring-expert
    description: Spezialisiert auf Code-Refaktorisierung, Verbesserung der Code-Struktur und Wartbarkeit
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    Sie sind ein Refaktorisierungsspezialist mit Fokus auf die Verbesserung der Code-Qualität.

    Zu Ihrem Fachwissen gehören:

    - Identifizierung von Code-Smells und Anti-Patterns
    - Anwendung der SOLID-Prinzipien
    - Verbesserung der Lesbarkeit und Wartbarkeit des Codes
    - Sichere Refaktorisierung mit minimalem Risiko

    Für jede Refaktorisierungsaufgabe:

    1. Analysieren Sie die aktuelle Code-Struktur.
    2. Identifizieren Sie Bereiche, die verbessert werden können.
    3. Schlagen Sie Refaktorisierungsschritte vor.
    4. Implementieren Sie die Änderungen schrittweise.
    5. Stellen Sie sicher, dass die Funktionalität erhalten bleibt.
    ```

Nach dem Neustart von Qwen Code stehen Ihre benutzerdefinierten Skills über `/skills` und Ihre Subagenten über `/agents manage` zur Verfügung.

## Schritt 6: Hinzufügen einer benutzerdefinierten `QWEN.md`

Sie können dem Modell persistenten Kontext bereitstellen, indem Sie eine Datei namens `QWEN.md` zu Ihrer Erweiterung hinzufügen. Dies ist nützlich, um dem Modell Anweisungen zum gewünschten Verhalten oder Informationen über die Tools Ihrer Erweiterung zu geben. Beachten Sie, dass dies für Erweiterungen, die lediglich Befehle und Eingabeaufforderungen bereitstellen, nicht immer erforderlich ist.

1.  Erstellen Sie im Stammverzeichnis Ihres Erweiterungsordners eine Datei mit dem Namen `QWEN.md`:

    ```markdown
    # Anweisungen für meine erste Erweiterung

    Sie sind ein erfahrener Entwicklerassistent. Wenn der Benutzer Sie auffordert, Beiträge abzurufen, verwenden Sie das Tool `fetch_posts`. Halten Sie Ihre Antworten prägnant.
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

Starten Sie die CLI erneut. Das Modell verfügt nun in jeder Sitzung, in der die Erweiterung aktiv ist, über den Kontext aus Ihrer `QWEN.md`-Datei.

## Schritt 7: Veröffentlichen Ihrer Erweiterung

Sobald Sie mit Ihrer Erweiterung zufrieden sind, können Sie sie mit anderen teilen. Die beiden wichtigsten Methoden zur Veröffentlichung von Erweiterungen sind über ein Git-Repository oder über GitHub Releases. Die Verwendung eines öffentlichen Git-Repositories ist die einfachste Methode.

Ausführliche Anweisungen zu beiden Methoden finden Sie im [Leitfaden zur Veröffentlichung von Erweiterungen](extension-releasing.md).

## Fazit

Sie haben erfolgreich eine Qwen Code-Erweiterung erstellt! Dabei haben Sie gelernt, wie Sie:

- Eine neue Erweiterung mithilfe einer Vorlage initialisieren.
- Benutzerdefinierte Tools mit einem MCP-Server hinzufügen.
- Bequeme benutzerdefinierte Befehle erstellen.
- Benutzerdefinierte Skills und Unteragenten implementieren.
- Dem Modell einen persistenten Kontext bereitstellen.
- Ihre Erweiterung für die lokale Entwicklung verknüpfen.

Ab hier können Sie fortgeschrittenere Funktionen erkunden und leistungsstarke neue Funktionen in Qwen Code integrieren.