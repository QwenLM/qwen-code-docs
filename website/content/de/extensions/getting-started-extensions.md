# Erste Schritte mit Qwen Code Extensions

Dieser Guide führt dich durch die Erstellung deiner ersten Qwen Code Extension. Du lernst, wie du eine neue Extension einrichtest, ein benutzerdefiniertes Tool über einen MCP-Server hinzufügst, einen eigenen Befehl erstellst und dem Modell mithilfe einer `QWEN.md` Datei Kontext bereitstellst.

## Voraussetzungen

Bevor du loslegst, stelle sicher, dass Qwen Code installiert ist und du grundlegende Kenntnisse in Node.js und TypeScript hast.

## Schritt 1: Neue Extension erstellen

Der einfachste Weg, loszulegen, ist die Verwendung einer der integrierten Templates. Wir verwenden das `mcp-server` Beispiel als Grundlage.

Führe den folgenden Befehl aus, um ein neues Verzeichnis namens `my-first-extension` mit den Template-Dateien zu erstellen:

```bash
qwen extensions new my-first-extension mcp-server
```

Dadurch wird ein neues Verzeichnis mit folgender Struktur angelegt:

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Schritt 2: Verstehen der Extension-Dateien

Schauen wir uns die wichtigsten Dateien deiner neuen Extension an.

### `qwen-extension.json`

Dies ist die Manifest-Datei deiner Extension. Sie teilt Qwen Code mit, wie deine Extension geladen und verwendet werden soll.

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
- `mcpServers`: Dieser Abschnitt definiert einen oder mehrere Model Context Protocol (MCP) Server. MCP-Server sind die Möglichkeit, neue Tools für das Modell bereitzustellen.
  - `command`, `args`, `cwd`: Diese Felder legen fest, wie der Server gestartet wird. Beachte die Verwendung der Variable `${extensionPath}`, die von Qwen Code durch den absoluten Pfad zum Installationsverzeichnis deiner Extension ersetzt wird. Dadurch funktioniert deine Extension unabhängig davon, wo sie installiert ist.

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

Dies sind Standard-Konfigurationsdateien für ein TypeScript-Projekt. Die `package.json`-Datei definiert Abhängigkeiten und ein `build`-Script, und die `tsconfig.json` konfiguriert den TypeScript-Compiler.

## Schritt 3: Erstelle und verlinke deine Extension

Bevor du die Extension nutzen kannst, musst du den TypeScript-Code kompilieren und die Extension mit deiner Qwen Code-Installation verknüpfen, um lokal zu entwickeln.

1.  **Abhängigkeiten installieren:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **Server bauen:**

    ```bash
    npm run build
    ```

    Dieser Befehl kompiliert `example.ts` in `dist/example.js`. Diese Datei wird in deiner `qwen-extension.json` referenziert.

3.  **Extension verlinken:**

    Der `link`-Befehl erstellt einen symbolischen Link vom Qwen Code Extensions-Verzeichnis zu deinem Entwicklungsverzeichnis. Das bedeutet, alle Änderungen, die du machst, sind sofort sichtbar, ohne dass du die Extension neu installieren musst.

    ```bash
    qwen extensions link .
    ```

Starte nun deine Qwen Code-Sitzung neu. Das neue `fetch_posts`-Tool steht jetzt zur Verfügung. Du kannst es testen, indem du folgendes eingibst: "fetch posts".

## Schritt 4: Füge einen benutzerdefinierten Befehl hinzu

Benutzerdefinierte Befehle bieten eine Möglichkeit, Shortcuts für komplexe Prompts zu erstellen. Fügen wir einen Befehl hinzu, der ein Muster in deinem Code sucht.

1. Erstelle ein `commands` Verzeichnis und ein Unterverzeichnis für deine Befehlsgruppe:

   ```bash
   mkdir -p commands/fs
   ```

2. Erstelle eine Datei mit dem Namen `commands/fs/grep-code.toml`:

   ```toml
   prompt = """
   Bitte fasse die Ergebnisse für das Muster `{{args}}` zusammen.

   Suchergebnisse:
   !{grep -r {{args}} .}
   """
   ```

   Dieser Befehl, `/fs:grep-code`, nimmt ein Argument entgegen, führt den `grep` Shell-Befehl damit aus und leitet die Ergebnisse in ein Prompt zur Zusammenfassung weiter.

Nachdem du die Datei gespeichert hast, starte Qwen Code neu. Du kannst jetzt `/fs:grep-code "irgendein Muster"` ausführen, um deinen neuen Befehl zu nutzen.

## Schritt 5: Füge eine eigene `QWEN.md` hinzu

Du kannst dem Modell einen dauerhaften Kontext zur Verfügung stellen, indem du eine `QWEN.md`-Datei zu deiner Extension hinzufügst. Das ist nützlich, um dem Modell Anweisungen für sein Verhalten oder Informationen über die Tools deiner Extension zu geben. Beachte, dass du das nicht immer benötigst, wenn deine Extension lediglich Commands und Prompts bereitstellt.

1. Erstelle eine Datei namens `QWEN.md` im Hauptverzeichnis deiner Extension:

   ```markdown
   # Anweisungen für meine erste Extension

   Du bist ein erfahrener Entwickler-Assistent. Wenn der Benutzer dich bittet, Posts abzurufen, verwende das `fetch_posts`-Tool. Antworte prägnant.
   ```

2. Aktualisiere deine `qwen-extension.json`, um der CLI mitzuteilen, diese Datei zu laden:

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

Starte die CLI erneut. Das Modell wird nun den Kontext aus deiner `QWEN.md`-Datei in jeder Session haben, in der die Extension aktiv ist.

## Schritt 6: Veröffentlichen deiner Extension

Sobald du mit deiner Extension zufrieden bist, kannst du sie mit anderen teilen. Die zwei wichtigsten Methoden, um Extensions zu veröffentlichen, sind über ein Git-Repository oder über GitHub Releases. Die Verwendung eines öffentlichen Git-Repositories ist die einfachste Methode.

Für detaillierte Anweisungen zu beiden Methoden, lies bitte den [Extension Releasing Guide](extension-releasing.md).

## Fazit

Du hast erfolgreich eine Qwen Code Extension erstellt! Du hast gelernt, wie man:

- Eine neue Extension aus einer Vorlage erstellt (Bootstrap).
- Benutzerdefinierte Tools mit einem MCP-Server hinzufügt.
- Praktische benutzerdefinierte Befehle erstellt.
- Dem Modell einen persistenten Kontext zur Verfügung stellt.
- Deine Extension für die lokale Entwicklung verlinkt.

Ab hier kannst du fortgeschrittene Funktionen erkunden und leistungsstarke neue Features in Qwen Code integrieren.