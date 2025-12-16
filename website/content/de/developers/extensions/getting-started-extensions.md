# Erste Schritte mit Qwen Code-Erweiterungen

Diese Anleitung führt dich durch die Erstellung deiner ersten Qwen Code-Erweiterung. Du wirst erfahren, wie du eine neue Erweiterung einrichtest, ein benutzerdefiniertes Tool über einen MCP-Server hinzufügst, einen benutzerdefinierten Befehl erstellst und dem Modell mithilfe einer `QWEN.md`-Datei Kontext bereitstellst.

## Voraussetzungen

Bevor du beginnst, stelle sicher, dass Qwen Code installiert ist und du grundlegende Kenntnisse in Node.js und TypeScript hast.

## Schritt 1: Eine neue Erweiterung erstellen

Der einfachste Weg, zu beginnen, ist die Verwendung einer der integrierten Vorlagen. Wir verwenden das `mcp-server`-Beispiel als Grundlage.

Führe den folgenden Befehl aus, um ein neues Verzeichnis namens `my-first-extension` mit den Vorlagendateien zu erstellen:

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

## Schritt 2: Verstehen der Erweiterungsdateien

Schauen wir uns die wichtigsten Dateien Ihrer neuen Erweiterung an.

### `qwen-extension.json`

Dies ist die Manifest-Datei für Ihre Erweiterung. Sie teilt Qwen Code mit, wie Ihre Erweiterung geladen und verwendet werden soll.

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
- `mcpServers`: Dieser Abschnitt definiert einen oder mehrere Model Context Protocol (MCP)-Server. MCP-Server sind die Möglichkeit, neue Tools für das Modell hinzuzufügen.
  - `command`, `args`, `cwd`: Diese Felder geben an, wie Ihr Server gestartet wird. Beachten Sie die Verwendung der Variable `${extensionPath}`, die von Qwen Code durch den absoluten Pfad zum Installationsverzeichnis Ihrer Erweiterung ersetzt wird. Dadurch kann Ihre Erweiterung unabhängig vom Installationsort funktionieren.

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
    description: 'Ruft eine Liste von Posts von einer öffentlichen API ab.',
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

// ... (Prompt-Registrierung wurde der Kürze halber ausgelassen)

const transport = new StdioServerTransport();
await server.connect(transport);
```

Dieser Server definiert ein einzelnes Tool namens `fetch_posts`, das Daten von einer öffentlichen API abruft.

### `package.json` und `tsconfig.json`

Dies sind Standard-Konfigurationsdateien für ein TypeScript-Projekt. Die `package.json`-Datei definiert Abhängigkeiten und ein `build`-Skript, und die `tsconfig.json` konfiguriert den TypeScript-Compiler.

## Schritt 3: Erstellen und Verknüpfen Ihrer Erweiterung

Bevor Sie die Erweiterung verwenden können, müssen Sie den TypeScript-Code kompilieren und die Erweiterung mit Ihrer Qwen Code-Installation für die lokale Entwicklung verknüpfen.

1.  **Abhängigkeiten installieren:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Server erstellen:**

    ```bash
    npm run build
    ```

    Dadurch wird `example.ts` in `dist/example.js` kompiliert, was die Datei ist, auf die in Ihrer `qwen-extension.json` verwiesen wird.

3.  **Erweiterung verknüpfen:**

    Der Befehl `link` erstellt einen symbolischen Link vom Qwen Code-Erweiterungsverzeichnis zu Ihrem Entwicklungsverzeichnis. Das bedeutet, dass alle Änderungen, die Sie vornehmen, sofort übernommen werden, ohne dass eine Neuinstallation erforderlich ist.

    ```bash
    qwen extensions link .
    ```

Starten Sie nun Ihre Qwen Code-Sitzung neu. Das neue `fetch_posts`-Tool wird verfügbar sein. Sie können es testen, indem Sie fragen: „fetch posts“.

## Schritt 4: Fügen Sie einen benutzerdefinierten Befehl hinzu

Benutzerdefinierte Befehle bieten eine Möglichkeit, Verknüpfungen für komplexe Eingabeaufforderungen zu erstellen. Fügen wir einen Befehl hinzu, der in Ihrem Code nach einem Muster sucht.

1. Erstellen Sie ein Verzeichnis namens `commands` und ein Unterverzeichnis für Ihre Befehlsgruppe:

   ```bash
   mkdir -p commands/fs
   ```

2. Erstellen Sie eine Datei mit dem Namen `commands/fs/grep-code.toml`:

   ```toml
   prompt = """
   Bitte fassen Sie die Ergebnisse für das Muster `{{args}}` zusammen.

   Suchergebnisse:
   !{grep -r {{args}} .}
   """
   ```

   Dieser Befehl, `/fs:grep-code`, nimmt ein Argument entgegen, führt den Shell-Befehl `grep` damit aus und leitet die Ergebnisse in eine Eingabeaufforderung zur Zusammenfassung weiter.

Speichern Sie die Datei und starten Sie Qwen Code neu. Sie können nun `/fs:grep-code "ein Muster"` ausführen, um Ihren neuen Befehl zu verwenden.

## Schritt 5: Füge eine benutzerdefinierte `QWEN.md` hinzu

Du kannst dem Modell einen dauerhaften Kontext bereitstellen, indem du eine `QWEN.md`-Datei zu deiner Erweiterung hinzufügst. Dies ist nützlich, um dem Modell Anweisungen zum Verhalten oder Informationen über die Tools deiner Erweiterung zu geben. Beachte, dass du dies möglicherweise nicht immer benötigst, wenn deine Erweiterung lediglich Befehle und Eingabeaufforderungen bereitstellt.

1.  Erstelle im Stammverzeichnis deines Erweiterungsordners eine Datei namens `QWEN.md`:

    ```markdown
    # Anweisungen für meine erste Erweiterung

    Du bist ein erfahrener Entwickler-Assistent. Wenn der Benutzer dich bittet, Beiträge abzurufen, verwende das Tool `fetch_posts`. Antworte prägnant.
    ```

2.  Aktualisiere deine `qwen-extension.json`, um der CLI mitzuteilen, diese Datei zu laden:

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

Starte die CLI erneut. Das Modell wird nun den Kontext aus deiner `QWEN.md`-Datei in jeder Sitzung haben, in der die Erweiterung aktiv ist.

## Schritt 6: Veröffentlichen Ihrer Erweiterung

Wenn Sie mit Ihrer Erweiterung zufrieden sind, können Sie sie mit anderen teilen. Die beiden Hauptmethoden zum Veröffentlichen von Erweiterungen sind über ein Git-Repository oder über GitHub Releases. Die Verwendung eines öffentlichen Git-Repositories ist die einfachste Methode.

Detaillierte Anweisungen für beide Methoden finden Sie im [Leitfaden zum Veröffentlichen von Erweiterungen](extension-releasing.md).

## Fazit

Sie haben erfolgreich eine Qwen Code-Erweiterung erstellt! Sie haben gelernt, wie man:

- Eine neue Erweiterung aus einer Vorlage erstellt.
- Benutzerdefinierte Tools mit einem MCP-Server hinzufügt.
- Bequeme benutzerdefinierte Befehle erstellt.
- Dem Modell einen persistenten Kontext zur Verfügung stellt.
- Ihre Erweiterung für die lokale Entwicklung verknüpft.

Von hier aus können Sie erweiterte Funktionen erkunden und leistungsstarke neue Möglichkeiten in Qwen Code integrieren.